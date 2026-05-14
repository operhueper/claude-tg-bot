/**
 * Text message handler for Claude Telegram Bot.
 */

import { randomUUID } from "node:crypto";
import type { Context } from "grammy";
import { InlineKeyboard } from "grammy";
import type { StatusCallback } from "../types";
import { getSession } from "../session-registry";
import { ALLOWED_USERS, getUserProfile, OWNER_USER_ID, isNewGuest, isNewGuestOnboarded, markNewGuestOnboarded } from "../config";
import { isAuthorized, rateLimiter } from "../security";
import { isDailyLimitReached, getDailyUsage, incrementDailyUsage } from "../daily-limit";
import { acquireUserLock, isUserBusy, acquireContainerSlot, getQueueStatus } from "../request-queue";
import { requestAccess } from "../containers/invites";
import {
  auditLog,
  auditLogRateLimit,
  checkInterrupt,
  replyFriendly,
  startTypingIndicator,
} from "../utils";
import { StreamingState, createStatusCallback } from "./streaming";
import { escapeHtml } from "../formatting";
import { sanitizeForPrompt } from "../memory/inject";
import { maybeAutoNew } from "./topic-helper";
import { maybeWarmInfrastructure } from "../infrastructure-warmer";
import { enqueueDebounced } from "./message-buffer";

/**
 * Detect messages that contain multiple independent subtasks and prepend an
 * orchestration hint so the model knows to use mcp__parallel__run.
 *
 * Returns the (possibly prepended) message. Logs which rule triggered via
 * console.log so it appears in the audit trail without going to the user.
 */
function maybePrependOrchestrationHint(text: string, userId: number): string {
  // Suppression — explicit sequential request cancels all triggers
  const sequential =
    /\b(по\s+очереди|последовательно|сначала.*потом|не\s+торопись|по\s+одному)\b/i;
  if (sequential.test(text)) {
    return text;
  }

  // Rule 1: numeric multiplicity (2+ items of same type)
  const numericMultiplicity =
    /\b([2-9]|\d{2,})\s*(кофе|кафе|мест[ао]?|фото|картин|изображен|файл|документ|вариант[аов]?|штук|пример|сайт|компани[йяею]|вакансий?|статей?|пункт|товар|продукт|раздел|глав[ую]?|стран|город|идей?|совет|способ|шаг|этап)/i;
  const numMatch = numericMultiplicity.exec(text);
  if (numMatch) {
    const n = numMatch[1];
    console.log(
      `[orchestrate] triggered for user ${userId} by rule: numericMultiplicity (${n})`
    );
    return `[ОРКЕСТРАЦИЯ: эта задача из ${n} независимых частей. Используй mcp__parallel__run одним вызовом с массивом задач.]\n\n${text}`;
  }

  // Rule 2: multiple sources
  const multiSource =
    /\b(из\s+нескольких\s+источников|сравни\s+\S+\s+и\s+\S+|на\s+авито\s+и\s+циан|в\s+гугле\s+и\s+яндексе|с\s+(?:разных|нескольких)\s+(?:сайтов|платформ))/i;
  if (multiSource.test(text)) {
    console.log(
      `[orchestrate] triggered for user ${userId} by rule: multiSource`
    );
    return `[ОРКЕСТРАЦИЯ: эта задача из нескольких независимых частей. Используй mcp__parallel__run одним вызовом с массивом задач.]\n\n${text}`;
  }

  // Rule 3: enumeration (word, word и word)
  const enumeration = /\b(\S{3,}),\s*\S{3,}\s+и\s+\S{3,}/i;
  if (enumeration.test(text)) {
    console.log(
      `[orchestrate] triggered for user ${userId} by rule: enumeration`
    );
    return `[ОРКЕСТРАЦИЯ: эта задача из нескольких независимых частей. Используй mcp__parallel__run одним вызовом с массивом задач.]\n\n${text}`;
  }

  // Rule 4: multiple actions (verb X and process/combine Y)
  const multiAction =
    /\b(найди|собери|скачай|сгенери[рп]|создай|подготовь|посмотри)\s+\S+\s+и\s+(оформи|обработай|проанализируй|сравни|объедини|собери|сделай)/i;
  if (multiAction.test(text)) {
    console.log(
      `[orchestrate] triggered for user ${userId} by rule: multiAction`
    );
    return `[ОРКЕСТРАЦИЯ: эта задача из нескольких независимых частей. Используй mcp__parallel__run одним вызовом с массивом задач.]\n\n${text}`;
  }

  // Rule 5: explicit parallel keywords
  const explicitParallel =
    /\b(параллельно|одновременно|разом|несколько штук|сразу несколько)\b/i;
  if (explicitParallel.test(text)) {
    console.log(
      `[orchestrate] triggered for user ${userId} by rule: explicitParallel`
    );
    return `[ОРКЕСТРАЦИЯ: эта задача из нескольких независимых частей. Используй mcp__parallel__run одним вызовом с массивом задач.]\n\n${text}`;
  }

  // Rule 6: long structured brief (500+ chars with list markers)
  if (text.length > 500 && /^[\s]*[-*•\d]+[.)]\s/m.test(text)) {
    console.log(
      `[orchestrate] triggered for user ${userId} by rule: longStructured`
    );
    return `[ОРКЕСТРАЦИЯ: эта задача из нескольких независимых частей. Используй mcp__parallel__run одним вызовом с массивом задач.]\n\n${text}`;
  }

  return text;
}

/**
 * Strip lines from raw model output that could be used for prompt injection
 * before re-embedding the partial response into the next query.
 */
function sanitizePartial(text: string): string {
  return text
    .split('\n')
    .filter(line => !/^\s*(ignore|forget|disregard|system:|<system>|инструкция:|забудь|игнорируй)/i.test(line))
    .join('\n');
}

/**
 * Drain accumulated pending-context messages after a query completes.
 * Each message in the queue is sent as a separate turn so the model sees
 * them in order. This helper owns its own StreamingState/typing/processing
 * lifecycle — the outer handler's cleanup has already run before this is called.
 */
async function drainPendingContext(
  session: import("../session").ClaudeSession,
  ctx: Context,
  username: string,
  userId: number,
  chatId: number
): Promise<void> {
  let pendingMsg = session.consumePendingContext();
  while (pendingMsg) {
    const pendingState = new StreamingState();
    const pendingCallback = createStatusCallback(ctx, pendingState);
    const pendingTyping = startTypingIndicator(ctx);
    const stopPendingProcessing = session.startProcessing();
    try {
      const pendingResponse = await session.sendMessageStreaming(
        pendingMsg,
        username,
        userId,
        pendingCallback,
        chatId,
        ctx
      );
      await auditLog(userId, username, "TEXT", pendingMsg, pendingResponse);
    } catch (pendingError) {
      await replyFriendly(ctx, pendingError, "обработка отложенного контекста");
    } finally {
      await pendingState.cleanup();
      stopPendingProcessing();
      pendingTyping.stop();
    }
    pendingMsg = session.consumePendingContext();
  }
}

/**
 * Core query executor — owns lock, rate-limit, container-slot, and the full
 * try/finally lifecycle. Called from the debounce flush callback.
 *
 * `combined` is the final user text (already merged by the buffer or interrupt
 * redirect logic). `checkInterrupt` has already run in the outer handler.
 */
async function processCombinedMessage(
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

  const _containerProfile = getUserProfile(userId);
  if (_containerProfile.containerEnabled) {
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

  // Rate limit — one unit per flush, not per raw message
  const [allowed, retryAfter] = rateLimiter.check(userId);
  if (!allowed) {
    releaseContainerSlot?.();
    releaseUserLock?.();
    await auditLogRateLimit(userId, username, retryAfter!);
    const waitSec = Math.ceil(retryAfter!);
    await ctx.reply(
      `⏳ Слишком много запросов подряд. Подожди ${waitSec} сек и попробуй снова.`
    );
    return;
  }

  // Daily-limit increment — one unit per flush
  {
    const _profile = getUserProfile(userId);
    const dailyLimit = _profile.tierConfig.dailyMessageLimit;
    if (dailyLimit !== null && userId !== OWNER_USER_ID) {
      incrementDailyUsage(userId);

      // 80% warning: fire-and-forget when exactly 20% remain
      const usage = getDailyUsage(userId, dailyLimit);
      if (usage.remaining === Math.ceil(usage.limit * 0.2) && usage.remaining > 0) {
        ctx.reply(
          `💡 Осталось ${usage.remaining} из ${usage.limit} бесплатных сообщений сегодня.\nХотите без лимитов? → /pay`
        ).catch(() => {});
      }
    }
  }

  const session = getSession(userId);

  let message = combined;

  // Store message for retry
  session.lastMessage = message;

  // Auto-reset on topic change (active sessions)
  if (session.isActive && !session.isRunning) {
    const topicChanged = await maybeAutoNew(session, message, ctx);
    if (topicChanged) {
      const title = message.length > 50 ? message.slice(0, 47) + "..." : message;
      session.conversationTitle = title;
    }
  }

  // Set conversation title from first message (if new session)
  if (!session.isActive) {
    const title =
      message.length > 50 ? message.slice(0, 47) + "..." : message;
    session.conversationTitle = title;
  }

  const stopProcessing = session.startProcessing();
  const typing = startTypingIndicator(ctx);
  let state = new StreamingState();
  let statusCallback: StatusCallback = createStatusCallback(ctx, state);

  // Orchestration hint for DeepSeek-routed sessions
  const profile = session.profile;
  if (profile.deepseekEnv) {
    message = maybePrependOrchestrationHint(message, userId);
  }

  // Reattach pending plan clarification context
  if (session.pendingClarification && session.pendingPlan) {
    session.pendingClarification = false;
    const originalMsg = session.pendingPlan.originalMessage;
    session.clearPendingPlan();
    message = `Пользователь уточнил план: ${message}\n\nИсходная задача была: ${originalMsg}\n\nПересмотри план с учётом уточнения и снова выведи PLAN_START/PLAN_END.`;
  } else if (session.pendingClarification) {
    session.pendingClarification = false;
  }

  const MAX_RETRIES = 1;
  const meteringRequestId = randomUUID();

  try {
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const response = await session.sendMessageStreaming(
          message,
          username,
          userId,
          statusCallback,
          chatId,
          ctx,
          undefined,
          undefined,
          meteringRequestId
        );

        if (session.pendingPlan) {
          const planText = session.pendingPlan.planText;
          const planHtml = `📋 <b>План выполнения:</b>\n${escapeHtml(planText)}`;
          const keyboard = new InlineKeyboard()
            .text('✅ Выполнить', `plan_confirm:${userId}`)
            .text('❌ Отменить', `plan_cancel:${userId}`)
            .row()
            .text('✏️ Уточнить', `plan_clarify:${userId}`);
          await ctx.reply(planHtml, { parse_mode: 'HTML', reply_markup: keyboard });
          break;
        }

        await auditLog(userId, username, "TEXT", message, response);
        break;
      } catch (error) {
        const errorStr = String(error);
        const isClaudeCodeCrash = errorStr.includes("exited with code");

        for (const toolMsg of state.toolMessages) {
          try {
            await ctx.api.deleteMessage(toolMsg.chat.id, toolMsg.message_id);
          } catch {
            // ignore
          }
        }

        if (isClaudeCodeCrash && attempt < MAX_RETRIES) {
          console.log(
            `Claude Code crashed, retrying (attempt ${attempt + 2}/${MAX_RETRIES + 1})...`
          );
          await state.cleanup();
          await session.kill();
          await ctx.reply(`⚠️ Claude crashed, retrying...`);
          state = new StreamingState();
          statusCallback = createStatusCallback(ctx, state);
          continue;
        }

        console.error("Error processing message:", error);

        if (errorStr.includes("abort") || errorStr.includes("cancel")) {
          const wasInterrupt = session.consumeInterruptFlag();
          if (!wasInterrupt) {
            await ctx.reply("🛑 Query stopped.");
          }
        } else {
          await replyFriendly(ctx, error, "обработка текста");
        }
        break;
      }
    }
  } finally {
    await state.cleanup();
    stopProcessing();
    typing.stop();
    releaseContainerSlot?.();
    releaseUserLock?.();
  }

  await drainPendingContext(session, ctx, username, userId, chatId);

  maybeWarmInfrastructure(userId).catch(() => {});
}

/**
 * Handle incoming text messages.
 */
export async function handleText(ctx: Context): Promise<void> {
  const userId = ctx.from?.id;
  const username = ctx.from?.username || "unknown";
  const chatId = ctx.chat?.id;
  let message = ctx.message?.text;

  if (!userId || !message || !chatId) {
    return;
  }

  // 1. Authorization check
  if (!isAuthorized(userId, ALLOWED_USERS)) {
    await requestAccess(ctx, message);
    return;
  }

  // Show onboarding for new guests who type text instead of /start after approval
  if (isNewGuest(userId) && !isNewGuestOnboarded(userId)) {
    markNewGuestOnboarded(userId);
    await ctx.reply(
      `👋 <b>Привет! Я Proboi — ИИ-ассистент прямо в Telegram.</b>\n\n` +
      `Никаких кнопок и меню — просто напиши мне обычным текстом, как другу. Например:\n\n` +
      `• <i>«Объясни простыми словами что такое инфляция»</i>\n` +
      `• <i>«Напиши письмо клиенту об отсрочке платежа»</i>\n` +
      `• <i>«Что на этом фото?»</i> — и прикрепи картинку\n` +
      `• Отправь голосовое — я переведу и отвечу\n\n` +
      `📖 <a href="https://proboi.site/how-to-setup">Полный гайд — все возможности и примеры</a>`,
      { parse_mode: "HTML", link_preview_options: { is_disabled: true } }
    );
    // Continue processing — user already wrote something, handle it below
  }

  // Prepend replied-to message context if user is replying to something.
  const replyMsg = ctx.message?.reply_to_message;
  if (replyMsg) {
    const rawReplyText =
      "text" in replyMsg && replyMsg.text
        ? replyMsg.text
        : "caption" in replyMsg && replyMsg.caption
        ? replyMsg.caption
        : null;
    if (rawReplyText) {
      const replyFrom = sanitizeForPrompt(
        replyMsg.from?.first_name || replyMsg.from?.username || "unknown"
      );
      const replyText = sanitizeForPrompt(rawReplyText);
      message = `[В ответ на сообщение от ${replyFrom}: «${replyText}»]\n\n${message}`;
    }
  }

  // Daily message limit — check only (no increment here); increment happens in processCombinedMessage
  {
    const _profile = getUserProfile(userId);
    const dailyLimit = _profile.tierConfig.dailyMessageLimit;
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

  // Interrupt check — must run before queueing so !-messages interrupt instead of queue
  const session = getSession(userId);
  const interruptResult = await checkInterrupt(message, userId);
  if (interruptResult.isInterrupt) {
    if (interruptResult.isRedirect && interruptResult.redirectMessage) {
      await new Promise((r) => setTimeout(r, 600));

      const partial = session.lastPartialResponse;
      session.lastPartialResponse = null;

      const contextNote = partial
        ? `[Контекст: предыдущее выполнение прервано. Вот что было выведено до прерывания: "${sanitizePartial(partial)}"]\n\n`
        : "";
      message = contextNote + interruptResult.redirectMessage;
      // Fall through to send the redirect message — skip debounce, process immediately
      await processCombinedMessage(message, ctx, userId, username, chatId);
      return;
    } else {
      // Pure stop — return early
      return;
    }
  } else {
    message = interruptResult.originalText ?? message;
  }

  if (!message.trim()) {
    return;
  }

  // If session is already running, queue message as pending context (in-flight queue)
  if (session.isRunning) {
    session.addPendingContext(message);
    try {
      await ctx.react("👌");
    } catch {
      // Reaction may fail on old clients — ignore
    }
    return;
  }

  // Route through debounce buffer — flush callback handles all processing
  enqueueDebounced(userId, message, ctx, async (combined, latestCtx) => {
    await processCombinedMessage(combined, latestCtx, userId, username, chatId);
  });
  try {
    await ctx.react("👌");
  } catch {
    // ignore
  }
}
