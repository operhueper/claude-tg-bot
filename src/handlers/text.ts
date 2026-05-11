/**
 * Text message handler for Claude Telegram Bot.
 */

import type { Context } from "grammy";
import type { StatusCallback } from "../types";
import { getSession, getGroupSession } from "../session-registry";
import { ALLOWED_USERS, GROUP_CHAT_ID, getUserProfile } from "../config";
import { isAuthorized, rateLimiter } from "../security";
import { resetIfNewDay, isLimitReached, incrementCount } from "../daily-limit";
import { upgradeKeyboard } from "../keyboards";
import { acquireUserLock, isUserBusy, acquireContainerSlot, getQueueStatus } from "../request-queue";

// Separate rate limiter for group chats so personal quotas are not consumed by
// group messages. Token bucket: 30 requests per 60 seconds per chat.
const GROUP_RATE_LIMIT_REQUESTS = 30;
const GROUP_RATE_LIMIT_WINDOW_MS = 60_000;
const _groupBuckets = new Map<number, { tokens: number; lastUpdate: number }>();

function checkGroupRateLimit(chatId: number): [allowed: boolean, retryAfter?: number] {
  const maxTokens = GROUP_RATE_LIMIT_REQUESTS;
  const refillRate = GROUP_RATE_LIMIT_REQUESTS / (GROUP_RATE_LIMIT_WINDOW_MS / 1000);
  const now = Date.now();
  let bucket = _groupBuckets.get(chatId);
  if (!bucket) {
    bucket = { tokens: maxTokens, lastUpdate: now };
    _groupBuckets.set(chatId, bucket);
  }
  const elapsed = (now - bucket.lastUpdate) / 1000;
  bucket.tokens = Math.min(maxTokens, bucket.tokens + elapsed * refillRate);
  bucket.lastUpdate = now;
  if (bucket.tokens >= 1) {
    bucket.tokens -= 1;
    return [true];
  }
  const retryAfter = (1 - bucket.tokens) / refillRate;
  return [false, retryAfter];
}
import { requestAccess } from "../containers/invites";
import {
  auditLog,
  auditLogRateLimit,
  checkInterrupt,
  replyFriendly,
  startTypingIndicator,
} from "../utils";
import { StreamingState, createStatusCallback } from "./streaming";
import { isGroupChat, shouldRespondInGroup } from "../group-filter";
import { maybeAutoNew } from "./topic-helper";
import { maybeWarmInfrastructure } from "../infrastructure-warmer";

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
    // In group chats, silently ignore unauthorized users (no spam)
    if (isGroupChat(ctx)) {
      return;
    }

    await requestAccess(ctx, message);
    return;
  }

  // Prepend replied-to message context if user is replying to something
  const replyMsg = ctx.message?.reply_to_message;
  if (replyMsg) {
    const replyText =
      "text" in replyMsg && replyMsg.text
        ? replyMsg.text
        : "caption" in replyMsg && replyMsg.caption
        ? replyMsg.caption
        : null;
    if (replyText) {
      const replyFrom = replyMsg.from?.first_name || replyMsg.from?.username || "unknown";
      const truncated = replyText.length > 500 ? replyText.slice(0, 497) + "..." : replyText;
      message = `[В ответ на сообщение от ${replyFrom}: «${truncated}»]\n\n${message}`;
    }
  }

  // 1b. Group chat filter — decide if Claude should respond
  if (isGroupChat(ctx)) {
    const shouldRespond = await shouldRespondInGroup(ctx);
    if (!shouldRespond) {
      return;
    }
  }

  const inGroup = isGroupChat(ctx);

  // Daily message limit for free-tier users (skip group chats)
  if (!inGroup) {
    const _profile = getUserProfile(userId);
    if (_profile.tierConfig.dailyMessageLimit !== null) {
      resetIfNewDay(userId);
      if (isLimitReached(userId, _profile.tierConfig.dailyMessageLimit)) {
        await ctx.reply(
          `Лимит на сегодня исчерпан (${_profile.tierConfig.dailyMessageLimit} сообщений).\n\nОформи подписку и пиши без ограничений 👇`,
          { reply_markup: upgradeKeyboard() }
        );
        return;
      }
      incrementCount(userId);
    }
  }

  // Task detection in group chat (only in the family group chat)
  if (inGroup && chatId === GROUP_CHAT_ID) {
    const {
      detectTaskIntent,
      detectAssignee,
      savePendingTask,
      USER_TELEGRAM_NAMES,
    } = await import("../tasks");
    if (detectTaskIntent(message)) {
      const fromUserId = userId;
      const assigneeId = detectAssignee(message, fromUserId);

      if (!assigneeId) {
        await ctx.reply("Кому поставить задачу — Евгению или Ксюше?");
        return;
      }

      const taskId = crypto.randomUUID().replace(/-/g, "");
      const now = new Date().toLocaleDateString("ru-RU", {
        day: "numeric",
        month: "long",
        year: "numeric",
      });

      // Simple deadline extraction
      let deadline: string | undefined;
      const deadlineMatch = message.match(/до\s+([^,.!?\n]{2,30})(?:[,.!?\n]|$)/iu);
      if (deadlineMatch) deadline = deadlineMatch[1]?.trim();

      // Extract task text — remove the trigger phrase
      const taskText = message
        .replace(
          /поставь задачу|запомни задачу|задача для \w+:|задача:|запиши задачу|добавь задачу/gi,
          ""
        )
        .trim();

      const finalTaskText = taskText.trim();
      if (!finalTaskText || finalTaskText.length < 3) {
        await ctx.reply("Напиши текст задачи — что именно нужно сделать?");
        return;
      }

      const task = {
        id: taskId,
        text: finalTaskText,
        deadline,
        assignedBy: fromUserId,
        assignedTo: assigneeId,
        createdAt: now,
      };

      savePendingTask(task);

      const tgName = USER_TELEGRAM_NAMES[assigneeId] ?? "пользователь";
      const deadlineText = deadline
        ? `📅 Дедлайн: ${deadline}`
        : "📅 Дедлайн: не указан";

      await ctx.reply(
        `${tgName}, тебе поставили задачу:\n\n📋 ${task.text}\n${deadlineText}\n\nПринять?`,
        {
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: "✅ Принять",
                  callback_data: `task_confirm:${taskId}:accept`,
                },
                {
                  text: "❌ Отклонить",
                  callback_data: `task_confirm:${taskId}:reject`,
                },
              ],
            ],
          },
        }
      );
      return; // Don't send to Claude
    }
  }
  // Per-user lock — prevent two parallel requests from the same user.
  // Group chats share the group session so no per-user lock needed there.
  let releaseUserLock: (() => void) | null = null;
  let releaseContainerSlot: (() => void) | null = null;

  if (!inGroup) {
    if (isUserBusy(userId)) {
      await ctx.reply("⏳ Подожди — обрабатываю предыдущее сообщение.");
      return;
    }
    releaseUserLock = await acquireUserLock(userId);

    // Container slot for users with containers enabled
    const _containerProfile = getUserProfile(userId);
    if (_containerProfile.containerEnabled) {
      const { queued } = getQueueStatus();
      if (queued > 0) {
        await ctx.reply(`⏳ В очереди (${queued + 1}-й). Подождём немного...`);
      }
      releaseContainerSlot = await acquireContainerSlot();
    }
  }

  const session = inGroup ? getGroupSession() : getSession(userId);

  // 2. Check for interrupt prefix
  message = await checkInterrupt(message, userId);
  if (!message.trim()) {
    return;
  }

  // 2b. If generation is running and message is NOT an interrupt (already handled above),
  // queue it as pending context and acknowledge with a reaction.
  if (session.isRunning) {
    session.addPendingContext(message);
    try {
      await ctx.react("👌");
    } catch {
      // Reaction may fail (e.g. old clients) — ignore silently
    }
    return;
  }

  // 3. Rate limit check — group chats use a separate limiter so personal
  //    quotas are not consumed by group messages.
  const [allowed, retryAfter] = inGroup
    ? checkGroupRateLimit(chatId)
    : rateLimiter.check(userId);
  if (!allowed) {
    await auditLogRateLimit(userId, username, retryAfter!);
    const waitSec = Math.ceil(retryAfter!);
    await ctx.reply(
      `⏳ Слишком много запросов подряд. Подожди ${waitSec} сек и попробуй снова.`
    );
    return;
  }

  // 4. Store message for retry
  session.lastMessage = message;

  // Auto-reset on topic change (only personal chats, active sessions)
  if (!inGroup && session.isActive && !session.isRunning) {
    const topicChanged = await maybeAutoNew(session, message, ctx);
    if (topicChanged) {
      const title = message.length > 50 ? message.slice(0, 47) + "..." : message;
      session.conversationTitle = title;
    }
  }

  // In group chats, prepend sender name so Claude knows who's writing
  if (inGroup) {
    const firstName = ctx.from?.first_name || username;
    message = `[${firstName}]: ${message}`;
  }

  // 5. Set conversation title from first message (if new session)
  if (!session.isActive) {
    // Truncate title to ~50 chars
    const title =
      message.length > 50 ? message.slice(0, 47) + "..." : message;
    session.conversationTitle = title;
  }

  // 6. Mark processing started
  const stopProcessing = session.startProcessing();

  // 7. Start typing indicator
  const typing = startTypingIndicator(ctx);

  // 8. Create streaming state and callback
  let state = new StreamingState();
  let statusCallback: StatusCallback = createStatusCallback(ctx, state);

  // 9. Prepend orchestration hint for any DeepSeek-routed session (owner or guest).
  // DeepSeek-chat ignores Task even when it announces parallelism in thinking,
  // so we route both profiles through mcp__parallel__run via this detector.
  // Native Anthropic models (Sonnet) skip the hint and use Task directly.
  const profile = session.profile;
  if (profile.deepseekEnv) {
    message = maybePrependOrchestrationHint(message, userId);
  }

  // 10. Send to Claude with retry logic for crashes
  const MAX_RETRIES = 1;

  try {
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const response = await session.sendMessageStreaming(
          message,
          username,
          userId,
          statusCallback,
          chatId,
          ctx
        );

        // 11. Audit log
        await auditLog(userId, username, "TEXT", message, response);

        // 11b. Drain pending context queue accumulated during generation
        const pendingMsg = session.consumePendingContext();
        if (pendingMsg) {
          // Remove the ⏳ reaction on all pending messages is not trivial,
          // so we simply send the accumulated context as a new turn.
          stopProcessing();
          typing.stop();

          // Re-enter full send flow for the pending context
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
            console.error("Error processing pending context:", pendingError);
          } finally {
            await pendingState.cleanup();
            stopPendingProcessing();
            pendingTyping.stop();
          }
          return; // stopProcessing and typing already called above
        }

        break; // Success - exit retry loop
      } catch (error) {
        const errorStr = String(error);
        const isClaudeCodeCrash = errorStr.includes("exited with code");

        // Clean up any partial messages from this attempt
        for (const toolMsg of state.toolMessages) {
          try {
            await ctx.api.deleteMessage(toolMsg.chat.id, toolMsg.message_id);
          } catch {
            // Ignore cleanup errors
          }
        }

        // Retry on Claude Code crash (not user cancellation)
        if (isClaudeCodeCrash && attempt < MAX_RETRIES) {
          console.log(
            `Claude Code crashed, retrying (attempt ${attempt + 2}/${MAX_RETRIES + 1})...`
          );
          await state.cleanup(); // stop heartbeat before creating new state
          await session.kill(); // Clear corrupted session
          await ctx.reply(`⚠️ Claude crashed, retrying...`);
          // Reset state for retry
          state = new StreamingState();
          statusCallback = createStatusCallback(ctx, state);
          continue;
        }

        // Final attempt failed or non-retryable error
        console.error("Error processing message:", error);

        // Check if it was a cancellation
        if (errorStr.includes("abort") || errorStr.includes("cancel")) {
          // Only show "Query stopped" if it was an explicit stop, not an interrupt from a new message
          const wasInterrupt = session.consumeInterruptFlag();
          if (!wasInterrupt) {
            await ctx.reply("🛑 Query stopped.");
          }
        } else {
          await replyFriendly(ctx, error, "обработка текста");
        }
        break; // Exit loop after handling error
      }
    }
  } finally {
    // 12. Cleanup — always runs even on abort/cancel/crash
    await state.cleanup();
    stopProcessing();
    typing.stop();
    releaseContainerSlot?.();
    releaseUserLock?.();
  }

  // Fire-and-forget infrastructure warming for free-tier users approaching limit
  maybeWarmInfrastructure(userId).catch(() => {});
}
