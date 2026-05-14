/**
 * Voice message handler for Claude Telegram Bot.
 */

import type { Context } from "grammy";
import { InlineKeyboard } from "grammy";
import { unlinkSync, mkdirSync } from "fs";
import { getSession } from "../session-registry";
import { ALLOWED_USERS, TRANSCRIPTION_AVAILABLE, getUserProfile, OWNER_USER_ID, inboxDirFor } from "../config";
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

/**
 * Handle incoming voice messages.
 */
export async function handleVoice(ctx: Context): Promise<void> {
  const userId = ctx.from?.id;
  const username = ctx.from?.username || "unknown";
  const chatId = ctx.chat?.id;
  const voice = ctx.message?.voice;

  if (!userId || !voice || !chatId) {
    return;
  }

  // 1. Authorization check
  if (!isAuthorized(userId, ALLOWED_USERS)) {
    await ctx.reply("Unauthorized. Contact the bot owner for access.");
    return;
  }

  // 2. Check if transcription is available
  if (!TRANSCRIPTION_AVAILABLE) {
    await ctx.reply("Голосовые сообщения временно недоступны. Попробуй написать текстом.");
    return;
  }

  // 2b. Duration limit per tier (checked before download to avoid wasted bandwidth)
  {
    const profile = getUserProfile(userId);
    if (!profile.isOwner) {
      const maxDuration = profile.tierConfig.tier === 'paid' ? 1800 : 300;
      const duration = voice.duration ?? 999_999;
      if (duration > maxDuration) {
        const durationMin = Math.ceil(duration / 60);
        const limitMin = maxDuration / 60;
        await ctx.reply(
          `Голосовое сообщение (${durationMin} мин) слишком длинное.\n` +
          `На вашем тарифе можно до ${limitMin} минут.\n\n` +
          `Разбейте на части или перейдите на Профи /pay.`
        );
        return;
      }
    }
  }

  // 3. Daily message limit — enforced only when tierConfig specifies a finite cap
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
  const releaseUserLock = await acquireUserLock(userId);

  // Container slot for users with containers enabled
  const _voiceContainerProfile = getUserProfile(userId);
  let releaseContainerSlot: (() => void) | null = null;
  if (_voiceContainerProfile.containerEnabled) {
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

  // 4. Rate limit check (after lock so two concurrent messages can't both pass)
  const [allowed, retryAfter] = rateLimiter.check(userId);
  if (!allowed) {
    releaseUserLock();
    await auditLogRateLimit(userId, username, retryAfter!);
    const waitSec = Math.ceil(retryAfter!);
    await ctx.reply(`⏳ Слишком много запросов. Подожди ${waitSec} сек и попробуй снова.`);
    return;
  }

  const session = getSession(userId);

  // 5. Mark processing started (allows /stop to work during transcription/classification)
  const stopProcessing = session.startProcessing();

  // 6. Start typing indicator for transcription
  const typing = startTypingIndicator(ctx);

  let voicePath: string | null = null;
  let state = new StreamingState();

  try {
    // 7. Download voice file
    const file = await ctx.getFile();
    const timestamp = Date.now();
    const userInboxDir = inboxDirFor(userId);
    mkdirSync(userInboxDir, { recursive: true });
    voicePath = `${userInboxDir}/voice_${timestamp}.ogg`;

    // Download the file
    const downloadRes = await fetch(
      `https://api.telegram.org/file/bot${ctx.api.token}/${file.file_path}`
    );
    const buffer = await downloadRes.arrayBuffer();
    await Bun.write(voicePath, buffer);

    // 8. Transcribe
    const statusMsg = await ctx.reply("🎤 Расшифровываю...");

    const transcript = await transcribeVoice(voicePath);
    if (!transcript) {
      await ctx.api.editMessageText(
        chatId,
        statusMsg.message_id,
        "❌ Не удалось расшифровать голосовое. Попробуй ещё раз."
      );
      return;
    }

    // 9. Show transcript (truncate display if needed - full transcript still sent to Claude)
    const maxDisplay = 4000; // Leave room for 🎤 "" wrapper within 4096 limit
    const displayTranscript =
      transcript.length > maxDisplay
        ? transcript.slice(0, maxDisplay) + "…"
        : transcript;
    await ctx.api.editMessageText(
      chatId,
      statusMsg.message_id,
      `🎤 "${displayTranscript}"`
    );

    // 10. Set conversation title from transcript (if new session)
    if (!session.isActive) {
      const title =
        transcript.length > 50 ? transcript.slice(0, 47) + "..." : transcript;
      session.conversationTitle = title;
    }

    // 11. Create streaming state and callback
    state = new StreamingState();
    const statusCallback = createStatusCallback(ctx, state);

    // 12. Send to Claude
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
    await auditLog(userId, username, "VOICE", transcript, claudeResponse);
  } catch (error) {
    if (String(error).includes("abort") || String(error).includes("cancel")) {
      // Only show "Query stopped" if it was an explicit stop, not an interrupt from a new message
      const wasInterrupt = session.consumeInterruptFlag();
      if (!wasInterrupt) {
        await ctx.reply("🛑 Query stopped.");
      }
    } else {
      await replyFriendly(ctx, error, "транскрипция голоса");
    }
  } finally {
    await state.cleanup();
    stopProcessing();
    typing.stop();
    releaseContainerSlot?.();
    releaseUserLock();

    // Clean up voice file
    if (voicePath) {
      try {
        unlinkSync(voicePath);
      } catch (error) {
        console.debug("Failed to delete voice file:", error);
      }
    }
  }
}
