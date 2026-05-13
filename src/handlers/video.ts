/**
 * Video handler for Claude Telegram Bot.
 *
 * Downloads video files and transcribes them via Whisper (same as voice.ts).
 */

import type { Context } from "grammy";
import { InlineKeyboard } from "grammy";
import { unlinkSync } from "fs";
import { getSession } from "../session-registry";
import {
  ALLOWED_USERS,
  TRANSCRIPTION_AVAILABLE,
  inboxDirFor,
  getUserProfile,
  OWNER_USER_ID,
} from "../config";
import { acquireUserLock, isUserBusy, acquireContainerSlot, getQueueStatus } from "../request-queue";
import { isAuthorized, rateLimiter } from "../security";
import { isDailyLimitReached, getDailyUsage, incrementDailyUsage } from "../daily-limit";
import {
  auditLog,
  auditLogRateLimit,
  replyFriendly,
  transcribeVoice,
  startTypingIndicator,
} from "../utils";
import { StreamingState, createStatusCallback } from "./streaming";

// Max video size (50MB - reasonable for short clips/voice memos)
const MAX_VIDEO_SIZE = 50 * 1024 * 1024;

/**
 * Download a video and return the local path.
 *
 * Container-enabled guests get the file in their vault inbox so the sandbox
 * can read it at the same absolute path. Owner / non-container guests get
 * the legacy host TEMP_DIR (see `inboxDirFor`).
 */
async function downloadVideo(ctx: Context, userId: number): Promise<string> {
  const video = ctx.message?.video || ctx.message?.video_note;
  if (!video) {
    throw new Error("No video in message");
  }

  const file = await ctx.getFile();
  const timestamp = Date.now();
  const videoPath = `${inboxDirFor(userId)}/video_${timestamp}.mp4`;

  const response = await fetch(
    `https://api.telegram.org/file/bot${ctx.api.token}/${file.file_path}`
  );
  const buffer = await response.arrayBuffer();
  await Bun.write(videoPath, buffer);

  return videoPath;
}

/**
 * Handle incoming video messages.
 */
export async function handleVideo(ctx: Context): Promise<void> {
  const userId = ctx.from?.id;
  const username = ctx.from?.username || "unknown";
  const chatId = ctx.chat?.id;
  const video = ctx.message?.video || ctx.message?.video_note;
  const caption = ctx.message?.caption;

  if (!userId || !chatId || !video) {
    return;
  }

  // 1. Authorization check
  if (!isAuthorized(userId, ALLOWED_USERS)) {
    await ctx.reply("Unauthorized. Contact the bot owner for access.");
    return;
  }

  // 2. Check if transcription is available
  if (!TRANSCRIPTION_AVAILABLE) {
    await ctx.reply(
      "Обработка видео временно недоступна. Попробуй отправить аудио или текст."
    );
    return;
  }

  // 3. Check file size
  if (video.file_size && video.file_size > MAX_VIDEO_SIZE) {
    await ctx.reply(
      `❌ Видео слишком большое. Максимальный размер: ${MAX_VIDEO_SIZE / 1024 / 1024} МБ.`
    );
    return;
  }

  // 4. Daily message limit — enforced only when tierConfig specifies a finite cap
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
              .text("5 дней Профи бесплатно", "pay_upgrade")
              .row()
              .url("Что даёт Профи →", "https://proboi.site/how-to-setup"),
          }
        );
        return;
      }
      incrementDailyUsage(userId);
    }
  }

  // 5. Rate limit check
  const [allowed, retryAfter] = rateLimiter.check(userId);
  if (!allowed) {
    await auditLogRateLimit(userId, username, retryAfter!);
    const waitSec = Math.ceil(retryAfter!);
    await ctx.reply(`⏳ Слишком много запросов. Подожди ${waitSec} сек и попробуй снова.`);
    return;
  }

  // 6. Per-user lock — prevent two parallel requests from the same user
  if (isUserBusy(userId)) {
    await ctx.reply("⏳ Подожди — обрабатываю предыдущее сообщение.");
    return;
  }
  const releaseUserLock = await acquireUserLock(userId);

  // Container slot for users with containers enabled
  const _videoContainerProfile = getUserProfile(userId);
  let releaseContainerSlot: (() => void) | null = null;
  if (_videoContainerProfile.containerEnabled) {
    const { queued } = getQueueStatus();
    if (queued > 0) {
      await ctx.reply(`⏳ В очереди (${queued + 1}-й). Подождём немного...`);
    }
    try {
      releaseContainerSlot = await acquireContainerSlot();
    } catch {
      releaseUserLock();
      await ctx.reply("⏳ Бот сейчас перегружен, попробуй через минуту.");
      return;
    }
  }

  const session = getSession(userId);
  const stopProcessing = session.startProcessing();
  const typing = startTypingIndicator(ctx);

  let videoPath: string | null = null;
  let state = new StreamingState();

  try {
    // 7. Download video
    videoPath = await downloadVideo(ctx, userId);

    // 8. Transcribe
    const statusMsg = await ctx.reply("🎬 Расшифровываю видео...");

    const transcript = await transcribeVoice(videoPath);
    if (!transcript) {
      await ctx.api.editMessageText(
        chatId,
        statusMsg.message_id,
        "❌ Не удалось расшифровать видео. Попробуй ещё раз."
      );
      stopProcessing();
      return;
    }

    // 9. Show transcript
    const maxDisplay = 4000;
    const displayTranscript =
      transcript.length > maxDisplay
        ? transcript.slice(0, maxDisplay) + "…"
        : transcript;
    await ctx.api.editMessageText(
      chatId,
      statusMsg.message_id,
      `🎬 "${displayTranscript}"`
    );

    // 10. Set conversation title from transcript (if new session)
    if (!session.isActive) {
      const rawTitle = caption || transcript;
      const title =
        rawTitle.length > 50 ? rawTitle.slice(0, 47) + "..." : rawTitle;
      session.conversationTitle = title;
    }

    // 11. Create streaming state and callback
    state = new StreamingState();
    const statusCallback = createStatusCallback(ctx, state);

    // 12. Send transcript (not video path) to Claude
    const claudeResponse = await session.sendMessageStreaming(
      transcript,
      username,
      userId,
      statusCallback,
      chatId,
      ctx,
      false // mediaHint: transcript is plain text, not a binary media file
    );

    // 13. Audit log
    await auditLog(userId, username, "VIDEO", transcript, claudeResponse);
  } catch (error) {
    if (String(error).includes("abort") || String(error).includes("cancel")) {
      const wasInterrupt = session.consumeInterruptFlag();
      if (!wasInterrupt) {
        await ctx.reply("🛑 Query stopped.");
      }
    } else {
      await replyFriendly(ctx, error, "обработка видео");
    }
  } finally {
    await state.cleanup();
    stopProcessing();
    typing.stop();
    releaseContainerSlot?.();
    releaseUserLock();

    // Clean up video file
    if (videoPath) {
      try {
        unlinkSync(videoPath);
      } catch (err) {
        console.debug("Failed to delete video file:", err);
      }
    }
  }
}
