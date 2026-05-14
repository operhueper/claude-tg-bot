/**
 * Audio handler for Claude Telegram Bot.
 *
 * Handles native Telegram audio messages and audio files sent as documents.
 * Transcribes using OpenAI (same as voice messages) then processes with Claude.
 */

import type { Context } from "grammy";
import { InlineKeyboard } from "grammy";
import { unlinkSync, mkdirSync } from "fs";
import { getSession } from "../session-registry";
import { ALLOWED_USERS, TRANSCRIPTION_AVAILABLE, getUserProfile, OWNER_USER_ID, inboxDirFor } from "../config";
import { isAuthorized, rateLimiter } from "../security";
import { isDailyLimitReached, getDailyUsage, incrementDailyUsage } from "../daily-limit";
import { acquireUserLock, isUserBusy, acquireContainerSlot, getQueueStatus } from "../request-queue";
import {
  auditLog,
  auditLogRateLimit,
  replyFriendly,
  transcribeVoice,
  startTypingIndicator,
} from "../utils";
import { StreamingState, createStatusCallback } from "./streaming";

// Supported audio file extensions
const AUDIO_EXTENSIONS = [
  ".mp3",
  ".m4a",
  ".ogg",
  ".wav",
  ".aac",
  ".flac",
  ".opus",
  ".wma",
];

// Whitelist of safe extensions for downloaded audio filenames
const ALLOWED_AUDIO_EXTENSIONS = new Set(["mp3", "m4a", "ogg", "wav", "aac", "flac", "opus", "wma"]);

/**
 * Check if a file is an audio file by extension or mime type.
 */
export function isAudioFile(fileName?: string, mimeType?: string): boolean {
  if (mimeType?.startsWith("audio/")) {
    return true;
  }
  if (fileName) {
    const ext = "." + (fileName.split(".").pop() || "").toLowerCase();
    return AUDIO_EXTENSIONS.includes(ext);
  }
  return false;
}

/**
 * Process an audio file: transcribe and send to Claude.
 */
export async function processAudioFile(
  ctx: Context,
  filePath: string,
  caption: string | undefined,
  userId: number,
  username: string,
  chatId: number
): Promise<void> {
  if (!TRANSCRIPTION_AVAILABLE) {
    await ctx.reply(
      "Voice transcription is not configured. Set OPENAI_API_KEY in .env"
    );
    return;
  }

  const session = getSession(userId);
  const stopProcessing = session.startProcessing();
  const typing = startTypingIndicator(ctx);
  let state = new StreamingState();

  try {
    // Transcribe
    const statusMsg = await ctx.reply("🎤 Transcribing audio...");

    const transcript = await transcribeVoice(filePath);
    if (!transcript) {
      await ctx.api.editMessageText(
        chatId,
        statusMsg.message_id,
        "❌ Transcription failed."
      );
      return;
    }

    // Show transcript
    const maxDisplay = 4000;
    const displayTranscript =
      transcript.length > maxDisplay
        ? transcript.slice(0, maxDisplay) + "…"
        : transcript;
    await ctx.api.editMessageText(
      chatId,
      statusMsg.message_id,
      `🎤 "${displayTranscript}"`
    );

    // Build prompt: transcript + optional caption
    const prompt = caption
      ? `${transcript}\n\n---\n\n${caption}`
      : transcript;

    // Set conversation title (if new session)
    if (!session.isActive) {
      const title =
        transcript.length > 50
          ? transcript.slice(0, 47) + "..."
          : transcript;
      session.conversationTitle = title;
    }

    // Create streaming state and callback
    state = new StreamingState();
    const statusCallback = createStatusCallback(ctx, state);

    // Send to Claude
    const claudeResponse = await session.sendMessageStreaming(
      prompt,
      username,
      userId,
      statusCallback,
      chatId,
      ctx,
      false // mediaHint: transcript is plain text, not a binary media file
    );

    // Audit log
    await auditLog(userId, username, "AUDIO", transcript, claudeResponse);
  } catch (error) {
    if (String(error).includes("abort") || String(error).includes("cancel")) {
      const wasInterrupt = session.consumeInterruptFlag();
      if (!wasInterrupt) {
        await ctx.reply("🛑 Query stopped.");
      }
    } else {
      await replyFriendly(ctx, error, "транскрипция аудио");
    }
  } finally {
    await state.cleanup();
    stopProcessing();
    typing.stop();

    // Clean up audio file
    try {
      unlinkSync(filePath);
    } catch (error) {
      console.debug("Failed to delete audio file:", error);
    }
  }
}

/**
 * Handle incoming native Telegram audio messages.
 */
export async function handleAudio(ctx: Context): Promise<void> {
  const userId = ctx.from?.id;
  const username = ctx.from?.username || "unknown";
  const chatId = ctx.chat?.id;
  const audio = ctx.message?.audio;

  if (!userId || !chatId || !audio) {
    return;
  }

  // 1. Authorization check
  if (!isAuthorized(userId, ALLOWED_USERS)) {
    await ctx.reply("Unauthorized. Contact the bot owner for access.");
    return;
  }

  // 2. Duration limit per tier (checked before download to avoid wasted bandwidth)
  {
    const profile = getUserProfile(userId);
    if (!profile.isOwner) {
      const maxDuration = profile.tierConfig.tier === 'paid' ? 1800 : 300;
      const duration = audio.duration ?? 999_999;
      if (duration > maxDuration) {
        const durationMin = Math.ceil(duration / 60);
        const limitMin = maxDuration / 60;
        await ctx.reply(
          `Аудио (${durationMin} мин) слишком длинное.\n` +
          `На вашем тарифе можно до ${limitMin} минут.\n\n` +
          `Разбейте на части или перейдите на Профи /pay.`
        );
        return;
      }
    }
  }

  // 2b. Daily message limit
  {
    const profile = getUserProfile(userId);
    const dailyLimit = profile.tierConfig.dailyMessageLimit;
    if (dailyLimit !== null && userId !== OWNER_USER_ID) {
      if (isDailyLimitReached(userId, dailyLimit)) {
        const { limit } = getDailyUsage(userId, dailyLimit);
        await ctx.reply(
          `Вы использовали все ${limit} бесплатных сообщений сегодня.\n` +
          `Лимит обновится в полночь по Москве.\n\n` +
          `На тарифе Профи — без ограничений. Плюс документы, код, Google и многое другое.\n\n` +
          `Привяжите карту — первые 5 дней бесплатно.`,
          {
            reply_markup: new InlineKeyboard()
              .text('5 дней Профи бесплатно', 'pay_upgrade')
              .row()
              .url('Что даёт Профи →', 'https://proboi.site/how-to-setup'),
          }
        );
        return;
      }
      incrementDailyUsage(userId);
    }
  }

  // Per-user lock — prevent two parallel requests from the same user
  if (isUserBusy(userId)) {
    await ctx.reply("⏳ Подожди — обрабатываю предыдущее сообщение.");
    return;
  }
  let releaseUserLock: (() => void) | null = null;
  let releaseContainerSlot: (() => void) | null = null;
  releaseUserLock = await acquireUserLock(userId);

  // Container slot for users with containers enabled
  const audioProfile = getUserProfile(userId);
  if (audioProfile.containerEnabled) {
    const { queued } = getQueueStatus();
    if (queued > 0) {
      await ctx.reply(`⏳ В очереди (${queued + 1}-й). Подождём немного...`);
    }
    try {
      releaseContainerSlot = await acquireContainerSlot();
    } catch {
      releaseUserLock?.();
      await ctx.reply("⏳ Бот сейчас перегружен, попробуй через минуту.");
      return;
    }
  }

  // 3. Rate limit check
  const [allowed, retryAfter] = rateLimiter.check(userId);
  if (!allowed) {
    releaseContainerSlot?.();
    releaseUserLock?.();
    await auditLogRateLimit(userId, username, retryAfter!);
    await ctx.reply(
      `⏳ Rate limited. Please wait ${retryAfter!.toFixed(1)} seconds.`
    );
    return;
  }

  console.log(`Received audio from @${username}`);

  // 5. Download audio file
  let audioPath: string;
  try {
    const file = await ctx.getFile();
    const timestamp = Date.now();
    const rawExt = (audio.file_name?.split(".").pop() || "mp3").toLowerCase();
    const ext = ALLOWED_AUDIO_EXTENSIONS.has(rawExt) ? rawExt : "bin";
    const userInboxDir = inboxDirFor(userId);
    mkdirSync(userInboxDir, { recursive: true });
    audioPath = `${userInboxDir}/audio_${timestamp}.${ext}`;

    const response = await fetch(
      `https://api.telegram.org/file/bot${ctx.api.token}/${file.file_path}`
    );
    const buffer = await response.arrayBuffer();
    await Bun.write(audioPath, buffer);
  } catch (error) {
    releaseContainerSlot?.();
    releaseUserLock?.();
    console.error("Failed to download audio:", error);
    await ctx.reply("❌ Failed to download audio file.");
    return;
  }

  // 6. Process audio
  try {
    await processAudioFile(
      ctx,
      audioPath,
      ctx.message?.caption,
      userId,
      username,
      chatId
    );
  } finally {
    releaseContainerSlot?.();
    releaseUserLock?.();
  }
}
