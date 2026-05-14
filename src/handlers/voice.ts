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
import { enqueueDebounced } from "./message-buffer";

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

  // 3. Daily message limit — check only (no increment here); increment happens in flush
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
    }
  }

  // 4. Download and transcribe — happens before lock/queue decisions
  const typing = startTypingIndicator(ctx);
  let voicePath: string | null = null;
  let transcript: string | null = null;

  try {
    const file = await ctx.getFile();
    const timestamp = Date.now();
    const userInboxDir = inboxDirFor(userId);
    mkdirSync(userInboxDir, { recursive: true });
    voicePath = `${userInboxDir}/voice_${timestamp}.ogg`;

    const downloadRes = await fetch(
      `https://api.telegram.org/file/bot${ctx.api.token}/${file.file_path}`
    );
    const buffer = await downloadRes.arrayBuffer();
    await Bun.write(voicePath, buffer);

    const statusMsg = await ctx.reply("🎤 Расшифровываю...");
    transcript = await transcribeVoice(voicePath);

    if (!transcript) {
      await ctx.api.editMessageText(
        chatId,
        statusMsg.message_id,
        "❌ Не удалось расшифровать голосовое. Попробуй ещё раз."
      ).catch(() => {});
      return;
    }

    const maxDisplay = 4000;
    const displayTranscript =
      transcript.length > maxDisplay
        ? transcript.slice(0, maxDisplay) + "…"
        : transcript;
    await ctx.api.editMessageText(
      chatId,
      statusMsg.message_id,
      `🎤 "${displayTranscript}"`
    ).catch(() => {});
  } catch (error) {
    await replyFriendly(ctx, error, "транскрипция голоса");
    return;
  } finally {
    typing.stop();
    if (voicePath) {
      try {
        unlinkSync(voicePath);
      } catch (err) {
        console.debug("Failed to delete voice file:", err);
      }
    }
  }

  // transcript is guaranteed non-null here
  const finalTranscript = transcript;

  const session = getSession(userId);

  // If session is running, queue transcript as pending context
  if (session.isRunning) {
    session.addPendingContext(finalTranscript);
    try {
      await ctx.react("👌");
    } catch {
      // ignore
    }
    return;
  }

  // Route through debounce buffer — flush callback handles lock + rate-limit + send
  enqueueDebounced(userId, finalTranscript, ctx, async (combined, latestCtx) => {
    await processVoiceMessage(combined, latestCtx, userId, username, chatId);
  });
}

/**
 * Core voice query executor — owns lock, rate-limit, container-slot, and the full
 * try/finally lifecycle. Called from the debounce flush callback.
 */
async function processVoiceMessage(
  combined: string,
  ctx: Context,
  userId: number,
  username: string,
  chatId: number
): Promise<void> {
  let releaseUserLock: (() => void) | null = null;
  let releaseContainerSlot: (() => void) | null = null;

  if (isUserBusy(userId)) {
    await ctx.reply("⏳ Подожди — обрабатываю предыдущее сообщение.");
    return;
  }
  releaseUserLock = await acquireUserLock(userId);

  const _voiceContainerProfile = getUserProfile(userId);
  if (_voiceContainerProfile.containerEnabled) {
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

  // Rate limit — one unit per flush
  const [allowed, retryAfter] = rateLimiter.check(userId);
  if (!allowed) {
    releaseContainerSlot?.();
    releaseUserLock?.();
    await auditLogRateLimit(userId, username, retryAfter!);
    const waitSec = Math.ceil(retryAfter!);
    await ctx.reply(`⏳ Слишком много запросов. Подожди ${waitSec} сек и попробуй снова.`);
    return;
  }

  // Daily-limit increment — one unit per flush
  {
    const profile = getUserProfile(userId);
    const dailyLimit = profile.tierConfig.dailyMessageLimit;
    if (dailyLimit !== null && userId !== OWNER_USER_ID) {
      incrementDailyUsage(userId);

      const usage = getDailyUsage(userId, dailyLimit);
      if (usage.remaining === Math.ceil(usage.limit * 0.2) && usage.remaining > 0) {
        ctx.reply(
          `💡 Осталось ${usage.remaining} из ${usage.limit} бесплатных сообщений сегодня.\nХотите без лимитов? → /pay`
        ).catch(() => {});
      }
    }
  }

  const session = getSession(userId);

  if (!session.isActive) {
    const title =
      combined.length > 50 ? combined.slice(0, 47) + "..." : combined;
    session.conversationTitle = title;
  }

  const stopProcessing = session.startProcessing();
  const typing = startTypingIndicator(ctx);
  let state = new StreamingState();
  const statusCallback = createStatusCallback(ctx, state);

  try {
    const claudeResponse = await session.sendMessageStreaming(
      combined,
      username,
      userId,
      statusCallback,
      chatId,
      ctx,
      false
    );
    await auditLog(userId, username, "VOICE", combined, claudeResponse);
  } catch (error) {
    if (String(error).includes("abort") || String(error).includes("cancel")) {
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
    releaseUserLock?.();
  }
}
