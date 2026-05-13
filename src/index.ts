/**
 * Claude Telegram Bot - TypeScript/Bun Edition
 *
 * Control Claude Code from your phone via Telegram.
 */

import { Bot, InlineKeyboard } from "grammy";
import { run, sequentialize } from "@grammyjs/runner";
import {
  TELEGRAM_TOKEN,
  WORKING_DIR,
  ALLOWED_USERS,
  NEW_GUEST_USERS,
  RESTART_FILE,
  getUserProfile,
} from "./config";
import {
  isSubscriptionGateEnabled,
  isSubscribed,
  REQUIRED_CHANNEL_URL,
} from "./subscription";
import { isAuthorized } from "./security";
import { unlinkSync, readFileSync, existsSync, writeFileSync } from "fs";
import * as path from "path";
import { ensureMemoryStructure, graphFile } from "./memory/paths";
import { GraphStore } from "./memory/graph";
import {
  handleStart,
  handleNew,
  handleStop,
  handleStatus,
  handleResume,
  handleRestart,
  handleReloadBot,
  handleRetry,
  handleDashboard,
  handlePay,
  handleCancel,
  handleInfo,
  handleMemory,
  handleForget,
  handleText,
  handleVoice,
  handlePhoto,
  handleDocument,
  handleAudio,
  handleVideo,
  handleCallback,
  GUEST_MENU_COMMANDS,
} from "./handlers";
import { getRecentlyActiveUsers } from "./session-registry";
import { UserRegistry } from "./user-registry";
import { containerManager } from "./containers/manager";
import { startDashboardServer, registerDashboardBot } from "./dashboard-server";
import { registerAlertBot, notifyOwnerDM } from "./owner-alerts";
import { startCrashloopWatcher } from "./crashloop-watcher";
import { chargeExpiredTrials } from "./tasks";

// Prevent unhandled errors from crashing the bot for all users.
// grammY catches handler errors via bot.catch, but we need a last-resort handler
// for errors that escape the grammY middleware chain.
process.on('uncaughtException', (err) => {
  console.error('[FATAL] uncaughtException:', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('[FATAL] unhandledRejection:', reason);
});

// Create bot instance
const bot = new Bot(TELEGRAM_TOKEN);
registerAlertBot(bot);
registerDashboardBot(bot);

// Log when the bot is added to / removed from any chat — helps the owner
// discover the channel id of the «проблемы пробоя» alerts channel: just add
// the bot as admin, and the chat id appears in stdout + owner DM.
bot.on("my_chat_member", async (ctx) => {
  const status = ctx.myChatMember.new_chat_member.status;
  const chat = ctx.chat;
  console.log(`[chat-membership] status=${status} chat_id=${chat.id} type=${chat.type} title=${"title" in chat ? chat.title : "(dm)"}`);
  if (status === "administrator" || status === "member") {
    try {
      await notifyOwnerDM(
        `Бот добавлен в чат:\n<b>${"title" in chat ? chat.title : "(no title)"}</b>\nchat_id: <code>${chat.id}</code>\n\nЕсли это «проблемы пробоя» — пропиши на проде в env: <code>OWNER_PROBLEM_CHANNEL_ID=${chat.id}</code> и перезапусти бот.`,
      );
    } catch {}
  }
});

// Channel posts — log chat_id for any channel where the bot is admin. Lets
// the owner reveal the «проблемы пробоя» channel id by posting any message
// there once (workaround for missed my_chat_member after a restart).
bot.on("channel_post", async (ctx) => {
  const chat = ctx.chat;
  if (chat.type !== "channel") return;
  console.log(`[channel-post] chat_id=${chat.id} title=${chat.title}`);
});

// ============== Subscription Gate ==============
// Authorized non-owner users must be members of REQUIRED_CHANNEL_ID before
// the bot will respond. Runs before sequentialize so the "I subscribed"
// button doesn't queue behind other work.
//
// Order of checks:
//   1. Gate disabled → pass.
//   2. No userId → pass (downstream handlers will reject).
//   3. NOT authorized (no entry in ALLOWED_USERS) → pass. The user goes
//      through the existing invite/onboarding flow first; the gate is
//      enforced only AFTER they've been approved.
//   4. Owner → pass (admin always bypasses).
//   5. Recheck button → pass (handled in callback.ts with cache invalidation).
//   6. Subscribed → pass; otherwise show gate and stop.
bot.use(async (ctx, next) => {
  if (!isSubscriptionGateEnabled()) return next();

  const userId = ctx.from?.id;
  if (!userId) return next();

  // Unauthorized users go through the normal invite flow first.
  if (!isAuthorized(userId, ALLOWED_USERS)) return next();

  // Owner always bypasses the gate.
  const profile = getUserProfile(userId);
  if (profile.isOwner) return next();

  // Let the recheck button through — its handler performs the actual
  // verification with cache invalidation.
  if (ctx.callbackQuery?.data === "subscription:check") return next();

  if (await isSubscribed(ctx.api, userId)) return next();

  // Not subscribed — show the gate and stop further processing.
  const channelLine = REQUIRED_CHANNEL_URL
    ? `\n\n👉 ${REQUIRED_CHANNEL_URL}`
    : "";
  const keyboard = new InlineKeyboard();
  if (REQUIRED_CHANNEL_URL) {
    keyboard.url("📢 Открыть канал", REQUIRED_CHANNEL_URL).row();
  }
  keyboard.text("✅ Я подписался", "subscription:check");

  const text =
    "Чтобы пользоваться ботом, подпишись на наш канал.\n" +
    "После подписки нажми «Я подписался»." +
    channelLine;

  if (ctx.callbackQuery) {
    await ctx.answerCallbackQuery({ text: "Сначала подпишись на канал", show_alert: true });
  } else {
    try {
      await ctx.reply(text, { reply_markup: keyboard });
    } catch (err) {
      console.warn(`[subscription] failed to send gate message to ${userId}:`, err);
    }
  }
  // No next() — request stops here.
});

// Sequentialize non-command messages per user (prevents race conditions)
// Commands bypass sequentialization so they work immediately
bot.use(
  sequentialize((ctx) => {
    // Commands are not sequentialized - they work immediately
    if (ctx.message?.text?.startsWith("/")) {
      return undefined;
    }
    // Messages with ! prefix bypass queue (interrupt)
    if (ctx.message?.text?.startsWith("!")) {
      return undefined;
    }
    // Callback queries (button clicks) are not sequentialized
    if (ctx.callbackQuery) {
      return undefined;
    }
    // Other messages are sequentialized per chat
    return ctx.chat?.id.toString();
  })
);

// ============== Command Handlers ==============

bot.command("start", handleStart);
bot.command("new", handleNew);
bot.command("stop", handleStop);
bot.command("status", handleStatus);
bot.command("resume", handleResume);
bot.command("restart", handleRestart);
bot.command("reloadbot", handleReloadBot);
bot.command("retry", handleRetry);
bot.command("dashboard", handleDashboard);
bot.command("pay", handlePay);
bot.command("cancel", handleCancel);
bot.command("info", handleInfo);
bot.command("memory", handleMemory);
bot.command("forget", handleForget);

// ============== Message Handlers ==============

// Text messages
bot.on("message:text", handleText);

// Voice messages
bot.on("message:voice", handleVoice);

// Photo messages
bot.on("message:photo", handlePhoto);

// Document messages
bot.on("message:document", handleDocument);

// Audio messages
bot.on("message:audio", handleAudio);

// Video messages (regular videos and video notes)
bot.on("message:video", handleVideo);
bot.on("message:video_note", handleVideo);

// ============== Callback Queries ==============

bot.on("callback_query:data", handleCallback);

// ============== Error Handler ==============

bot.catch((err) => {
  console.error("Bot error:", err);
});

// ============== Startup ==============

console.log("=".repeat(50));
console.log("Claude Telegram Bot - TypeScript Edition");
console.log("=".repeat(50));
console.log(`Working directory: ${WORKING_DIR}`);
console.log(`Allowed users: ${ALLOWED_USERS.length}`);
console.log("Starting bot...");

// Get bot info first
const botInfo = await bot.api.getMe();
console.log(`Bot started: @${botInfo.username}`);

// Init container manager for all known users
const containerProfiles = ALLOWED_USERS.map((id) => getUserProfile(id)).filter((p) => p.containerEnabled);
await containerManager.init(containerProfiles);
console.log(`Container manager initialized for ${containerProfiles.length} user(s)`);

// Stop containers for users whose tier no longer includes containerEnabled.
// This handles the case where a user was downgraded or their tier default changed.
{
  for (const node of UserRegistry.getAllUsers()) {
    if (node.role === "owner") continue;
    const profile = getUserProfile(node.userId);
    if (!profile.containerEnabled) {
      containerManager.stop(node.userId).catch((e: unknown) => {
        console.log(`[startup] stop container for free-tier user ${node.userId}: ${e}`);
      });
    }
  }
}

// Register side menu commands.
// GUEST_MENU_COMMANDS is the authoritative guest list — shared with callback.ts
// so it can be set for newly approved users without a bot restart.
const ownerCommands = [
  ...GUEST_MENU_COMMANDS,
  { command: "restart", description: "Сбросить сессию" },
  { command: "resume", description: "Resume saved session" },
  { command: "reloadbot", description: "Перезапустить бот" },
];

try {
  // Global default = guest menu (applies to any user without a per-chat override).
  await bot.api.setMyCommands(GUEST_MENU_COMMANDS);

  // Per-chat override for the owner only.
  for (const userId of ALLOWED_USERS) {
    if (NEW_GUEST_USERS.includes(userId)) continue;
    const profile = getUserProfile(userId);
    if (!profile.isOwner) continue;
    try {
      await bot.api.setMyCommands(ownerCommands, {
        scope: { type: "chat", chat_id: userId },
      });
    } catch (e) {
      console.warn(`Failed to set owner menu for ${userId}: ${e}`);
    }
  }
  console.log(
    `Side menu registered: ${GUEST_MENU_COMMANDS.length} guest / ${ownerCommands.length} owner commands`
  );
} catch (e) {
  console.warn("Failed to set bot commands menu:", e);
}

// Check for pending restart message to update
if (existsSync(RESTART_FILE)) {
  try {
    const data = JSON.parse(readFileSync(RESTART_FILE, "utf-8"));
    const age = Date.now() - data.timestamp;

    // Only update if restart was recent (within 30 seconds)
    if (age < 30000 && data.chat_id && data.message_id) {
      await bot.api.editMessageText(
        data.chat_id,
        data.message_id,
        "✅ Bot restarted"
      );
    }
    unlinkSync(RESTART_FILE);
  } catch (e) {
    console.warn("Failed to update restart message:", e);
    try { unlinkSync(RESTART_FILE); } catch {}
  }
}

// ============== Restart notifications ==============
// Notify users who were active in the last 10 minutes that the bot restarted.

{
  const TEN_MINUTES = 10 * 60 * 1000;
  const recentUsers = getRecentlyActiveUsers(TEN_MINUTES);
  for (const { userId, chatId } of recentUsers) {
    // Skip owner — they triggered the restart and already see "✅ Bot restarted"
    if (!NEW_GUEST_USERS.includes(userId)) continue;
    try {
      await bot.api.sendMessage(
        chatId,
        "Извини, я только что перезапустился 🔄\n\nПамять сохранена — напиши мне, и я восстановлю контекст нашего разговора."
      );
    } catch (e) {
      console.warn(`Failed to send restart notification to ${userId}: ${e}`);
    }
  }
}

// ============== Memory structure bootstrap ==============

for (const userId of ALLOWED_USERS) {
  try {
    const profile = getUserProfile(userId);
    ensureMemoryStructure(profile.memoryRoot, profile.userId);

    // Ensure graph.json exists (even empty) so ls shows it immediately
    const gFile = graphFile(profile.memoryRoot, profile.userId);
    if (!existsSync(gFile)) {
      const store = new GraphStore(profile.memoryRoot, profile.userId);
      const emptyGraph = store.load(); // returns empty graph
      store.save(emptyGraph);
      console.log(`[memory] Created empty graph.json for ${profile.label}`);
    }

    const profileMdPath = path.join(profile.memoryRoot, "memory", String(profile.userId), "profile.md");

    if (!existsSync(profileMdPath)) {
      // For owner: try to seed from legacy evgeniy/profile.md
      const legacyProfilePath = path.join(profile.workingDir, "evgeniy", "profile.md");
      if (profile.isOwner && existsSync(legacyProfilePath)) {
        const legacyContent = readFileSync(legacyProfilePath, "utf8");
        writeFileSync(profileMdPath, legacyContent, "utf8");
        console.log(`[memory] Seeded profile.md for ${profile.label} from legacy evgeniy/profile.md`);
      } else {
        const template = `# Профиль пользователя

Этот файл — стабильное досье. Бот читает его при старте каждой сессии.
Сюда попадают ТОЛЬКО долгоживущие факты: имя, роль, контакты, ключевые предпочтения, постоянные настройки.

НЕ клади сюда эфемерные состояния («болею сегодня», «занят проектом X на этой неделе», «в отпуске до пятницы»),
датированные события, разовые факты — это автоматически попадает в graph.json через анализатор диалога,
где у нод есть timestamp и они естественно стареют. profile.md инжектится в каждую сессию навсегда —
эфемерный мусор тут будет жить вечно.

## Базовая инфа
- Telegram ID: ${userId}
- Имя: ${profile.label}

## Стабильные предпочтения
- (заполняется по мере диалогов: язык, стиль ответов, важные привычки)
`;
        writeFileSync(profileMdPath, template, "utf8");
        console.log(`[memory] Created profile.md template for ${profile.label} (userId=${userId})`);
      }
    }
  } catch (err) {
    console.warn(`[memory] Bootstrap failed for userId=${userId}: ${err}`);
  }
}

// ============== Health Webhook (Apple Watch → Bot) ==============

const HEALTH_SECRET = process.env.HEALTH_WEBHOOK_SECRET || "";
const HEALTH_PORT = parseInt(process.env.HEALTH_WEBHOOK_PORT || "3847", 10);
const HEALTH_OWNER_ID = ALLOWED_USERS.find((id) => !NEW_GUEST_USERS.includes(id));

if (HEALTH_SECRET && HEALTH_OWNER_ID) {
  Bun.serve({
    port: HEALTH_PORT,
    async fetch(req) {
      if (req.method !== "POST") {
        return new Response("Method Not Allowed", { status: 405 });
      }

      // Auth
      const auth = req.headers.get("x-secret");
      if (auth !== HEALTH_SECRET) {
        return new Response("Unauthorized", { status: 401 });
      }

      let body: Record<string, unknown>;
      try {
        const parsed = await req.json();
        if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
          return new Response("Bad JSON", { status: 400 });
        }
        body = parsed as Record<string, unknown>;
      } catch {
        return new Response("Bad JSON", { status: 400 });
      }

      // Format health data into a readable message
      const lines: string[] = ["📊 Данные Apple Watch:"];
      if (body.steps !== undefined) lines.push(`👟 Шаги: ${body.steps}`);
      if (body.heart_rate !== undefined) lines.push(`❤️ Пульс (средний): ${body.heart_rate} уд/мин`);
      if (body.active_calories !== undefined) lines.push(`🔥 Активные калории: ${body.active_calories} ккал`);
      if (body.sleep !== undefined) lines.push(`😴 Сон: ${body.sleep}`);
      if (body.weight !== undefined) lines.push(`⚖️ Вес: ${body.weight} кг`);
      if (body.period !== undefined) lines.push(`📅 Период: ${body.period}`);

      const message = lines.join("\n");

      await bot.api.sendMessage(HEALTH_OWNER_ID, message);
      return new Response("OK", { status: 200 });
    },
  });
  console.log(`Health webhook listening on port ${HEALTH_PORT}`);
}

// ============== Dashboard Server ==============

startDashboardServer();

// ============== Crashloop watcher ==============

startCrashloopWatcher();

// ============== Subscription billing ==============

setInterval(() => chargeExpiredTrials(bot).catch(console.error), 6 * 60 * 60 * 1000);

// Start with concurrent runner (commands work immediately)
const runner = run(bot);

// Graceful shutdown
const stopRunner = () => {
  if (runner.isRunning()) {
    console.log("Stopping bot...");
    runner.stop();
  }
};

process.on("SIGINT", () => {
  console.log("Received SIGINT");
  stopRunner();
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("Received SIGTERM");
  stopRunner();
  process.exit(0);
});
