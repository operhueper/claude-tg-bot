/**
 * Callback query handler for Claude Telegram Bot.
 *
 * Handles inline keyboard button presses (ask_user MCP integration).
 */

import type { Context } from "grammy";
import { unlinkSync } from "fs";
import { getSession } from "../session-registry";
import { ALLOWED_USERS, NEW_GUEST_USERS, bootstrapNewGuestDir } from "../config";
import { isAuthorized } from "../security";
import { auditLog, auditLogError, startTypingIndicator } from "../utils";
import { StreamingState, createStatusCallback } from "./streaming";
import { getPendingInvite, removePendingInvite } from "../containers/invites";
import { addUser } from "../user-registry";
import { invalidateSubscription, isSubscribed, isSubscriptionGateEnabled } from "../subscription";

/**
 * Handle callback queries from inline keyboards.
 */
export async function handleCallback(ctx: Context): Promise<void> {
  const userId = ctx.from?.id;
  const username = ctx.from?.username || "unknown";
  const chatId = ctx.chat?.id;
  const callbackData = ctx.callbackQuery?.data;

  if (!userId || !chatId || !callbackData) {
    await ctx.answerCallbackQuery();
    return;
  }

  // 1. Authorization check
  if (!isAuthorized(userId, ALLOWED_USERS)) {
    await ctx.answerCallbackQuery({ text: "Unauthorized" });
    return;
  }

  // 1b. Subscription gate recheck (only reachable for authorized users —
  //     unauthorized users never see the button).
  if (callbackData === "subscription:check") {
    await handleSubscriptionCheckCallback(ctx);
    return;
  }

  // 2a. Invite callbacks (owner-only actions, no session needed)
  if (callbackData.startsWith("invite_approve_") || callbackData.startsWith("invite_deny_")) {
    await handleInviteCallback(ctx, callbackData);
    return;
  }

  const session = getSession(userId);

  // 2. Handle resume callbacks: resume:{session_id}
  if (callbackData.startsWith("resume:")) {
    await handleResumeCallback(ctx, callbackData);
    return;
  }

  // 2b. Task confirmation callbacks
  if (callbackData.startsWith("task_confirm:")) {
    await handleTaskConfirmCallback(ctx, callbackData);
    return;
  }

  // 3. Parse callback data: askuser:{request_id}:{option_index}
  if (!callbackData.startsWith("askuser:")) {
    await ctx.answerCallbackQuery();
    return;
  }

  const parts = callbackData.split(":");
  if (parts.length !== 3) {
    await ctx.answerCallbackQuery({ text: "Invalid callback data" });
    return;
  }

  const requestId = parts[1]!;
  const optionIndex = parseInt(parts[2]!, 10);

  // 3. Load request file
  const requestFile = `/tmp/ask-user-${requestId}.json`;
  let requestData: {
    question: string;
    options: string[];
    status: string;
  };

  try {
    const file = Bun.file(requestFile);
    const text = await file.text();
    requestData = JSON.parse(text);
  } catch (error) {
    console.error(`Failed to load ask-user request ${requestId}:`, error);
    await ctx.answerCallbackQuery({ text: "Request expired or invalid" });
    return;
  }

  // 4. Get selected option
  if (optionIndex < 0 || optionIndex >= requestData.options.length) {
    await ctx.answerCallbackQuery({ text: "Invalid option" });
    return;
  }

  const selectedOption = requestData.options[optionIndex]!;

  // 5. Update the message to show selection
  try {
    await ctx.editMessageText(`✓ ${selectedOption}`);
  } catch (error) {
    console.debug("Failed to edit callback message:", error);
  }

  // 6. Answer the callback
  await ctx.answerCallbackQuery({
    text: `Selected: ${selectedOption.slice(0, 50)}`,
  });

  // 7. Delete request file
  try {
    unlinkSync(requestFile);
  } catch (error) {
    console.debug("Failed to delete request file:", error);
  }

  // 8. Send the choice to Claude as a message
  const message = selectedOption;

  // Interrupt any running query - button responses are always immediate
  if (session.isRunning) {
    console.log("Interrupting current query for button response");
    await session.stop();
    // Small delay to ensure clean interruption
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  // Start typing
  const typing = startTypingIndicator(ctx);

  // Create streaming state
  const state = new StreamingState();
  const statusCallback = createStatusCallback(ctx, state);

  try {
    const response = await session.sendMessageStreaming(
      message,
      username,
      userId,
      statusCallback,
      chatId,
      ctx
    );

    await auditLog(userId, username, "CALLBACK", message, response);
  } catch (error) {
    console.error("Error processing callback:", error);

    for (const toolMsg of state.toolMessages) {
      try {
        await ctx.api.deleteMessage(toolMsg.chat.id, toolMsg.message_id);
      } catch (error) {
        console.debug("Failed to delete tool message:", error);
      }
    }

    if (String(error).includes("abort") || String(error).includes("cancel")) {
      // Only show "Query stopped" if it was an explicit stop, not an interrupt from a new message
      const wasInterrupt = session.consumeInterruptFlag();
      if (!wasInterrupt) {
        await ctx.reply("🛑 Query stopped.");
      }
    } else {
      console.error("[callback] Unhandled error:", error);
      await auditLogError(userId, username, String(error), "callback handler");
      await ctx.reply("Не удалось обработать действие, попробуй ещё раз.");
    }
  } finally {
    typing.stop();
  }
}

/**
 * Handle invite approve/deny callbacks.
 * callback_data: invite_approve_{userId} | invite_deny_{userId}
 */
async function handleInviteCallback(ctx: Context, callbackData: string): Promise<void> {
  const isApprove = callbackData.startsWith("invite_approve_");
  const rawId = callbackData.replace(isApprove ? "invite_approve_" : "invite_deny_", "");
  const targetUserId = parseInt(rawId, 10);

  if (isNaN(targetUserId)) {
    await ctx.answerCallbackQuery({ text: "Неверный ID пользователя" });
    return;
  }

  const invite = await getPendingInvite(targetUserId);

  if (!invite) {
    await ctx.answerCallbackQuery({ text: "Запрос не найден" });
    try {
      await ctx.editMessageText("⚠️ Запрос не найден (возможно, уже обработан).");
    } catch {}
    return;
  }

  if (isApprove) {
    const isNew = await addUser({
      userId: targetUserId,
      role: "new_guest",
      label: invite.firstName || invite.username || String(targetUserId),
      timezone: "Europe/Moscow",
      settingSources: ["project"],
      rateLimitEnabled: false,
      model: "deepseek-chat",
      containerEnabled: true,
      onboardingComplete: true,
    });
    // Also add to in-memory NEW_GUEST_USERS so getUserProfile picks it up immediately
    if (!NEW_GUEST_USERS.includes(targetUserId)) {
      NEW_GUEST_USERS.push(targetUserId);
    }
    // Provision the full vault layout (public/, tools/, notes/, CLAUDE.md,
    // dashboard.html, /var/www/u/{id} symlink etc.). Without this, new guests
    // only get the partial dirs that container bootstrap creates and their
    // proboi.site/u/{id}/ page 404s until the next bot restart.
    bootstrapNewGuestDir(targetUserId);
    // CRITICAL: ALLOWED_USERS is a static const built from env at startup —
    // mutate it in-memory so isAuthorized() returns true on the user's next
    // message. Without this, an approved guest still hits the invite flow
    // and never reaches their sandbox until the bot restarts.
    if (!ALLOWED_USERS.includes(targetUserId)) {
      ALLOWED_USERS.push(targetUserId);
    }
    const alreadyExisted = !isNew;

    await removePendingInvite(targetUserId);

    if (!alreadyExisted) {
      try {
        const { getUserProfile } = await import("../config");
        const { containerManager } = await import("../containers/manager");
        const profile = getUserProfile(targetUserId);
        containerManager.getOrStart(profile).catch((err: unknown) =>
          console.error(`[invite] container bootstrap failed for ${targetUserId}:`, err)
        );
      } catch (err) {
        console.error(`[invite] could not schedule container bootstrap:`, err);
      }
    }

    const displayName = invite.firstName || invite.username || String(targetUserId);
    const statusText = alreadyExisted
      ? `✅ Пользователь ${displayName} уже был одобрен ранее`
      : `✅ Пользователь ${displayName} одобрен`;
    try {
      await ctx.editMessageText(statusText);
    } catch {}
    await ctx.answerCallbackQuery({ text: alreadyExisted ? "Уже одобрен ранее" : "Пользователь одобрен!" });

    if (!alreadyExisted) {
      try {
        await ctx.api.sendMessage(
          targetUserId,
          "✅ Доступ открыт! Напиши мне любое сообщение, чтобы начать."
        );
      } catch (err) {
        console.error("[invites] Failed to notify approved user:", err);
      }
    }
  } else {
    // Deny
    await removePendingInvite(targetUserId);
    try {
      await ctx.editMessageText("❌ Пользователь отклонён");
    } catch {}
    await ctx.answerCallbackQuery({ text: "Пользователь отклонён." });
  }
}

/**
 * Handle task confirmation callback (task_confirm:{task_id}:{action}).
 */
async function handleTaskConfirmCallback(
  ctx: Context,
  callbackData: string
): Promise<void> {
  const parts = callbackData.split(":");
  if (parts.length !== 3) {
    await ctx.answerCallbackQuery({ text: "Неверный формат" });
    return;
  }

  const taskId = parts[1]!;
  const action = parts[2]!; // "accept" or "reject"

  const { loadPendingTask, saveTaskToVault, deletePendingTask } = await import(
    "../tasks"
  );
  const task = loadPendingTask(taskId);

  if (!task) {
    await ctx.answerCallbackQuery({ text: "Задача не найдена или устарела" });
    return;
  }

  // Auth check BEFORE mutation
  if (action === "accept" && ctx.from?.id !== task.assignedTo) {
    await ctx.answerCallbackQuery({ text: "Это не твоя задача 😊" });
    return; // do NOT delete
  }
  if (action === "reject" && ctx.from?.id !== task.assignedTo && ctx.from?.id !== task.assignedBy) {
    await ctx.answerCallbackQuery({ text: "Только адресат или автор могут отклонить" });
    return; // do NOT delete
  }

  deletePendingTask(taskId); // only after auth passed

  if (action === "accept") {
    try {
      saveTaskToVault(task);
    } catch (e) {
      await ctx.answerCallbackQuery({ text: "Ошибка записи задачи, попробуй позже" });
      try { await ctx.editMessageText(`❌ Ошибка при сохранении задачи.`); } catch {}
      return;
    }
    try {
      await ctx.editMessageText(`✅ Задача принята и записана в vault!`);
    } catch {}
    await ctx.answerCallbackQuery({ text: "Задача принята!" });
  } else {
    try {
      await ctx.editMessageText(`❌ Задача отклонена.`);
    } catch {}
    await ctx.answerCallbackQuery({ text: "Задача отклонена." });
  }
}

/**
 * Handle resume session callback (resume:{session_id}).
 */
async function handleResumeCallback(
  ctx: Context,
  callbackData: string
): Promise<void> {
  const userId = ctx.from?.id;
  const username = ctx.from?.username || "unknown";
  const chatId = ctx.chat?.id;
  const sessionId = callbackData.replace("resume:", "");

  if (!sessionId || !userId || !chatId) {
    await ctx.answerCallbackQuery({ text: "ID sessione non valido" });
    return;
  }

  const session = getSession(userId);

  // Check if session is already active
  if (session.isActive) {
    await ctx.answerCallbackQuery({ text: "Sessione già attiva" });
    return;
  }

  // Resume the selected session
  const [success, message] = session.resumeSession(sessionId);

  if (!success) {
    await ctx.answerCallbackQuery({ text: message, show_alert: true });
    return;
  }

  // Update the original message to show selection
  try {
    await ctx.editMessageText(`✅ ${message}`);
  } catch (error) {
    console.debug("Failed to edit resume message:", error);
  }
  await ctx.answerCallbackQuery({ text: "Sessione ripresa!" });

  // Send a hidden recap prompt to Claude
  const recapPrompt =
    "Please write a very concise recap of where we are in this conversation, to refresh my memory. Max 2-3 sentences.";

  const typing = startTypingIndicator(ctx);
  const state = new StreamingState();
  const statusCallback = createStatusCallback(ctx, state);

  try {
    await session.sendMessageStreaming(
      recapPrompt,
      username,
      userId,
      statusCallback,
      chatId,
      ctx
    );
  } catch (error) {
    console.error("Error getting recap:", error);
    // Don't show error to user - session is still resumed, recap just failed
  } finally {
    typing.stop();
  }
}

/**
 * Recheck the subscription gate after the user taps "I subscribed".
 * Invalidates the cache and queries Telegram fresh.
 */
async function handleSubscriptionCheckCallback(ctx: Context): Promise<void> {
  const userId = ctx.from?.id;
  if (!userId) {
    await ctx.answerCallbackQuery();
    return;
  }

  if (!isSubscriptionGateEnabled()) {
    await ctx.answerCallbackQuery({ text: "Готово" });
    return;
  }

  invalidateSubscription(userId);

  let ok = false;
  try {
    ok = await isSubscribed(ctx.api, userId);
  } catch (err) {
    console.error("[subscription] recheck failed:", err);
  }

  if (ok) {
    await ctx.answerCallbackQuery({ text: "Подписка подтверждена ✓" });
    try {
      await ctx.editMessageText("✅ Подписка подтверждена. Напиши мне любое сообщение, чтобы начать.");
    } catch {
      // Message may already be edited / too old — ignore.
    }
  } else {
    await ctx.answerCallbackQuery({
      text: "Подписка не найдена. Подпишись и попробуй снова.",
      show_alert: true,
    });
  }
}
