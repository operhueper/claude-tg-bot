/**
 * Command handlers for Claude Telegram Bot.
 *
 * /start, /new, /stop, /status, /resume, /restart, /retry
 *
 * Per-user session lookup via getSession(userId). Restricted users (guests)
 * are blocked from /restart.
 */

import type { Context } from "grammy";
import { execSync } from "child_process";
import { existsSync, unlinkSync } from "fs";
import { getSession } from "../session-registry";
import {
  ALLOWED_USERS,
  RESTART_FILE,
  getUserProfile,
  isNewGuest,
  isNewGuestOnboarded,
  markNewGuestOnboarded,
} from "../config";
import { isAuthorized } from "../security";
import { replyFriendly } from "../utils";
import { requestAccess } from "../containers/invites";

/** Reject command if the profile doesn't permit it. */
function commandAllowed(userId: number, command: string): boolean {
  return getUserProfile(userId).allowedCommands.has(command);
}

/**
 * /start - Show welcome message and status.
 */
export async function handleStart(ctx: Context): Promise<void> {
  const userId = ctx.from?.id;

  if (!userId) {
    await ctx.reply("Unauthorized. Contact the bot owner for access.");
    return;
  }

  if (!isAuthorized(userId, ALLOWED_USERS)) {
    // Trigger invite flow: notify owner, save pending request
    await requestAccess(ctx, "/start");
    return;
  }

  // First-time onboarding for new guests
  if (isNewGuest(userId) && !isNewGuestOnboarded(userId)) {
    await ctx.reply(
      `👋 <b>Привет! Я твой персональный ИИ-ассистент.</b>\n\n` +
        `Работаю на DeepSeek + Gemini. Живу прямо в Telegram — без приложений, без регистрации.\n\n` +
        `<b>Что умею:</b>\n\n` +
        `🧠 <b>Запоминаю контекст</b> — граф памяти хранит связи между людьми, проектами, идеями. В следующей беседе уже знаю о чём говорили.\n\n` +
        `🎤 <b>Голос, фото, документы</b> — надиктуй голосовое, отправь PDF или картинку — расшифрую и отвечу.\n\n` +
        `🖼 <b>Генерирую картинки</b> — опиши что нужно, пришлю изображение.\n\n` +
        `💻 <b>Код, тексты, задачи</b> — пишу код, правлю тексты, помогаю думать и структурировать.\n\n` +
        `📊 <b>Личный дашборд</b> — у тебя уже есть страничка с виджетами. Можно кастомизировать под себя или создать с нуля — скажи «покажи дашборд».\n\n` +
        `🧩 <b>Плагины</b> — можно подключить свои MCP-инструменты, спроси как.\n\n` +
        `─────────────────\n` +
        `Просто напиши что-нибудь — и начнём 🚀`,
      { parse_mode: "HTML" }
    );
    markNewGuestOnboarded(userId);
    return;
  }

  const profile = getUserProfile(userId);
  const session = getSession(userId);
  const status = session.isActive ? "Active session" : "No active session";

  const commandLines = [
    "/new - Start fresh session",
    "/stop - Stop current query",
    "/status - Show detailed status",
    "/resume - Resume last session",
    "/retry - Retry last message",
    "/restart - Сбросить текущую сессию",
  ];
  if (profile.allowedCommands.has("reloadbot")) {
    commandLines.push("/reloadbot - Перезапустить сервис бота");
  }

  const greeting = profile.isGuest
    ? `🤖 <b>Твой персональный ассистент</b>\n\nПолный набор фич: память, RAG, MCP плагины.`
    : `🤖 <b>Claude Telegram Bot</b>`;

  await ctx.reply(
    `${greeting}\n\n` +
      `Status: ${status}\n` +
      `Working directory: <code>${profile.workingDir}</code>\n\n` +
      `<b>Commands:</b>\n` +
      commandLines.join("\n") +
      `\n\n<b>Tips:</b>\n` +
      `• Prefix with <code>!</code> to interrupt current query\n` +
      `• Use "think" keyword for extended reasoning\n` +
      `• Send photos, voice, or documents`,
    { parse_mode: "HTML" }
  );
}

/**
 * /new - Start a fresh session.
 */
export async function handleNew(ctx: Context): Promise<void> {
  const userId = ctx.from?.id;

  if (!isAuthorized(userId, ALLOWED_USERS) || !userId) {
    await ctx.reply("Unauthorized.");
    return;
  }

  const session = getSession(userId);

  if (session.isRunning) {
    const result = await session.stop();
    if (result) {
      await Bun.sleep(100);
      session.clearStopRequested();
    }
  }

  // Force memory save before clearing (captures short sessions < 6 turns)
  if (session.isActive) {
    session.forceMemoryFlush().catch((e) => console.warn("[/new] forceMemoryFlush failed:", e));
  }

  await session.kill();

  await ctx.reply("🆕 Session cleared. Next message starts fresh.");
}

/**
 * /stop - Stop the current query (silently).
 */
export async function handleStop(ctx: Context): Promise<void> {
  const userId = ctx.from?.id;

  if (!isAuthorized(userId, ALLOWED_USERS) || !userId) {
    await ctx.reply("Unauthorized.");
    return;
  }

  const session = getSession(userId);

  if (session.isRunning) {
    const result = await session.stop();
    if (result) {
      await Bun.sleep(100);
      session.clearStopRequested();
    }
  }
}

/**
 * /status - Show detailed status.
 */
export async function handleStatus(ctx: Context): Promise<void> {
  const userId = ctx.from?.id;

  if (!isAuthorized(userId, ALLOWED_USERS) || !userId) {
    await ctx.reply("Unauthorized.");
    return;
  }

  const profile = getUserProfile(userId);
  const session = getSession(userId);
  const lines: string[] = ["📊 <b>Bot Status</b>\n"];

  if (session.isActive) {
    lines.push(`✅ Session: Active (${session.sessionId?.slice(0, 8)}...)`);
  } else {
    lines.push("⚪ Session: None");
  }

  if (session.isRunning) {
    const elapsed = session.queryStarted
      ? Math.floor((Date.now() - session.queryStarted.getTime()) / 1000)
      : 0;
    lines.push(`🔄 Query: Running (${elapsed}s)`);
    if (session.currentTool) {
      lines.push(`   └─ ${session.currentTool}`);
    }
  } else {
    lines.push("⚪ Query: Idle");
    if (session.lastTool) {
      lines.push(`   └─ Last: ${session.lastTool}`);
    }
  }

  if (session.lastActivity) {
    const ago = Math.floor(
      (Date.now() - session.lastActivity.getTime()) / 1000
    );
    lines.push(`\n⏱️ Last activity: ${ago}s ago`);
  }

  if (session.lastUsage) {
    const usage = session.lastUsage;
    lines.push(
      `\n📈 Last query usage:`,
      `   Input: ${usage.input_tokens?.toLocaleString() || "?"} tokens`,
      `   Output: ${usage.output_tokens?.toLocaleString() || "?"} tokens`
    );
    if (usage.cache_read_input_tokens) {
      lines.push(
        `   Cache read: ${usage.cache_read_input_tokens.toLocaleString()}`
      );
    }
  }

  if (session.lastError) {
    const ago = session.lastErrorTime
      ? Math.floor((Date.now() - session.lastErrorTime.getTime()) / 1000)
      : "?";
    lines.push(`\n⚠️ Last error (${ago}s ago):`, `   ${session.lastError}`);
  }

  lines.push(`\n📁 Working dir: <code>${profile.workingDir}</code>`);

  await ctx.reply(lines.join("\n"), { parse_mode: "HTML" });
}

/**
 * /resume - Show list of sessions to resume with inline keyboard.
 */
export async function handleResume(ctx: Context): Promise<void> {
  const userId = ctx.from?.id;

  if (!isAuthorized(userId, ALLOWED_USERS) || !userId) {
    await ctx.reply("Unauthorized.");
    return;
  }

  const session = getSession(userId);

  if (session.isActive) {
    await ctx.reply("Sessione già attiva. Usa /new per iniziare da capo.");
    return;
  }

  const sessions = session.getSessionList();

  if (sessions.length === 0) {
    await ctx.reply("❌ Nessuna sessione salvata.");
    return;
  }

  const buttons = sessions.map((s) => {
    const date = new Date(s.saved_at);
    const dateStr = date.toLocaleDateString("it-IT", {
      day: "2-digit",
      month: "2-digit",
    });
    const timeStr = date.toLocaleTimeString("it-IT", {
      hour: "2-digit",
      minute: "2-digit",
    });

    const titlePreview =
      s.title.length > 35 ? s.title.slice(0, 32) + "..." : s.title;

    return [
      {
        text: `📅 ${dateStr} ${timeStr} - "${titlePreview}"`,
        callback_data: `resume:${s.session_id}`,
      },
    ];
  });

  await ctx.reply(
    "📋 <b>Sessioni salvate</b>\n\nSeleziona una sessione da riprendere:",
    {
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: buttons,
      },
    }
  );
}

/**
 * /restart - Reset the current user's session (no systemd restart).
 *
 * Stops any running query, flushes memory, clears in-memory session state,
 * and deletes the per-user session file so /resume won't replay it.
 * Available to all users (owner + guests). For a full bot service restart
 * (e.g. after code changes) the owner uses /reloadbot.
 */
export async function handleRestart(ctx: Context): Promise<void> {
  const userId = ctx.from?.id;

  if (!isAuthorized(userId, ALLOWED_USERS) || !userId) {
    await ctx.reply("Unauthorized.");
    return;
  }

  if (!commandAllowed(userId, "restart")) {
    await ctx.reply(
      "🚫 Эта команда тебе недоступна."
    );
    return;
  }

  const session = getSession(userId);

  // Stop any running query first so the session can be cleared cleanly.
  if (session.isRunning) {
    const stopped = await session.stop();
    if (stopped) {
      await Bun.sleep(100);
      session.clearStopRequested();
    }
  }

  // Flush in-flight memory before tearing the session down.
  if (session.isActive) {
    session
      .forceMemoryFlush()
      .catch((e) => console.warn("[/restart] forceMemoryFlush failed:", e));
  }

  // Clear in-memory session state.
  await session.kill();

  // Drop the on-disk session history so /resume won't pick it up.
  const profile = getUserProfile(userId);
  try {
    if (existsSync(profile.sessionFile)) {
      unlinkSync(profile.sessionFile);
    }
  } catch (e) {
    console.warn(`[/restart] Failed to delete session file for ${userId}:`, e);
  }

  await ctx.reply("Сессия сброшена. Начинаем заново 🔄");
}

/**
 * /reloadbot - Owner-only: restart the systemd service.
 *
 * Used after editing source files so changes load. The current process dies
 * mid-reply (systemctl kills it), then systemd brings the bot back up.
 */
export async function handleReloadBot(ctx: Context): Promise<void> {
  const userId = ctx.from?.id;
  const chatId = ctx.chat?.id;

  if (!isAuthorized(userId, ALLOWED_USERS) || !userId) {
    await ctx.reply("Unauthorized.");
    return;
  }

  if (!commandAllowed(userId, "reloadbot")) {
    await ctx.reply("🚫 Эта команда доступна только владельцу бота.");
    return;
  }

  const msg = await ctx.reply("🔄 Перезапускаю сервис claude-tg-bot...");

  // Persist chat/message info so the restored process can edit the message.
  if (chatId && msg.message_id) {
    try {
      await Bun.write(
        RESTART_FILE,
        JSON.stringify({
          chat_id: chatId,
          message_id: msg.message_id,
          timestamp: Date.now(),
        })
      );
    } catch (e) {
      console.warn("Failed to save restart info:", e);
    }
  }

  // Give Telegram time to send the reply before systemd kills us.
  await Bun.sleep(300);

  try {
    execSync("/bin/systemctl restart claude-tg-bot", { stdio: "ignore" });
  } catch (e) {
    // If systemctl returns we never got killed — likely missing privileges.
    try {
      await replyFriendly(ctx, e, "перезапуск сервиса");
    } catch {}
  }
}

/**
 * /dashboard - Open the dashboard Mini App.
 */
export async function handleDashboard(ctx: Context): Promise<void> {
  const userId = ctx.from?.id;

  if (!isAuthorized(userId, ALLOWED_USERS) || !userId) {
    await ctx.reply("Unauthorized.");
    return;
  }

  await ctx.reply(`🧠 <b>Second Brain</b>\n\nЗадачи, граф памяти и статистика.`, {
    parse_mode: "HTML",
    reply_markup: {
      inline_keyboard: [[
        {
          text: "📱 Открыть дашборд",
          web_app: { url: "https://proboi.site/dashboard" },
        },
      ]],
    },
  });
}

/**
 * /retry - Retry the last message (resume session and re-send).
 */
export async function handleRetry(ctx: Context): Promise<void> {
  const userId = ctx.from?.id;

  if (!isAuthorized(userId, ALLOWED_USERS) || !userId) {
    await ctx.reply("Unauthorized.");
    return;
  }

  const session = getSession(userId);

  if (!session.lastMessage) {
    await ctx.reply("❌ No message to retry.");
    return;
  }

  if (session.isRunning) {
    await ctx.reply("⏳ A query is already running. Use /stop first.");
    return;
  }

  const message = session.lastMessage;
  await ctx.reply(
    `🔄 Retrying: "${message.slice(0, 50)}${message.length > 50 ? "..." : ""}"`
  );

  const { handleText } = await import("./text");

  const fakeCtx = {
    ...ctx,
    message: {
      ...ctx.message,
      text: message,
    },
  } as Context;

  await handleText(fakeCtx);
}
