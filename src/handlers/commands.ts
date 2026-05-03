/**
 * Command handlers for Claude Telegram Bot.
 *
 * /start, /new, /stop, /status, /resume, /restart, /retry
 *
 * Per-user session lookup via getSession(userId). Restricted users (guests)
 * are blocked from /restart.
 */

import type { Context } from "grammy";
import { getSession } from "../session";
import { ALLOWED_USERS, RESTART_FILE, getUserProfile } from "../config";
import { isAuthorized } from "../security";

/** Reject command if the profile doesn't permit it. */
function commandAllowed(userId: number, command: string): boolean {
  return getUserProfile(userId).allowedCommands.has(command);
}

/**
 * /start - Show welcome message and status.
 */
export async function handleStart(ctx: Context): Promise<void> {
  const userId = ctx.from?.id;

  if (!isAuthorized(userId, ALLOWED_USERS) || !userId) {
    await ctx.reply("Unauthorized. Contact the bot owner for access.");
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
  ];
  if (profile.allowedCommands.has("restart")) {
    commandLines.push("/restart - Restart the bot");
  }

  const greeting = profile.isGuest
    ? `🤖 <b>Привет, Ксения!</b>\n\nЯ твой персональный ассистент.`
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
 * /restart - Restart the bot process. Owner only.
 */
export async function handleRestart(ctx: Context): Promise<void> {
  const userId = ctx.from?.id;
  const chatId = ctx.chat?.id;

  if (!isAuthorized(userId, ALLOWED_USERS) || !userId) {
    await ctx.reply("Unauthorized.");
    return;
  }

  if (!commandAllowed(userId, "restart")) {
    await ctx.reply(
      "🚫 Эта команда доступна только владельцу бота."
    );
    return;
  }

  const msg = await ctx.reply("🔄 Restarting bot...");

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

  await Bun.sleep(500);

  process.exit(0);
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
