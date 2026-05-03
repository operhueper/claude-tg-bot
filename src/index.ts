/**
 * Claude Telegram Bot - TypeScript/Bun Edition
 *
 * Control Claude Code from your phone via Telegram.
 */

import { Bot } from "grammy";
import { run, sequentialize } from "@grammyjs/runner";
import {
  TELEGRAM_TOKEN,
  WORKING_DIR,
  ALLOWED_USERS,
  GUEST_USERS,
  RESTART_FILE,
  getUserProfile,
} from "./config";
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
  handleRetry,
  handleText,
  handleVoice,
  handlePhoto,
  handleDocument,
  handleAudio,
  handleVideo,
  handleCallback,
} from "./handlers";

// Create bot instance
const bot = new Bot(TELEGRAM_TOKEN);

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
bot.command("retry", handleRetry);

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

// Register side menu commands. Guests see a menu without /restart; owners see all.
const baseCommands = [
  { command: "new", description: "Start fresh session" },
  { command: "stop", description: "Stop current query" },
  { command: "status", description: "Show detailed status" },
  { command: "resume", description: "Resume saved session" },
  { command: "retry", description: "Retry last message" },
];
const ownerCommands = [
  ...baseCommands,
  { command: "restart", description: "Restart the bot" },
];

try {
  // Default menu = guest menu (safe baseline for any user, including new ones).
  await bot.api.setMyCommands(baseCommands);

  // Per-chat override for each owner (everyone in ALLOWED_USERS who is NOT a guest).
  for (const userId of ALLOWED_USERS) {
    if (GUEST_USERS.includes(userId)) continue;
    try {
      await bot.api.setMyCommands(ownerCommands, {
        scope: { type: "chat", chat_id: userId },
      });
    } catch (e) {
      console.warn(`Failed to set owner menu for ${userId}: ${e}`);
    }
  }
  console.log(
    `Side menu registered: ${baseCommands.length} base / ${ownerCommands.length} owner commands`
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

// ============== Memory structure bootstrap ==============

for (const userId of ALLOWED_USERS) {
  try {
    const profile = getUserProfile(userId);
    ensureMemoryStructure(profile.workingDir, profile.userId);

    // Ensure graph.json exists (even empty) so ls shows it immediately
    const gFile = graphFile(profile.workingDir, profile.userId);
    if (!existsSync(gFile)) {
      const store = new GraphStore(profile.workingDir, profile.userId);
      const emptyGraph = store.load(); // returns empty graph
      store.save(emptyGraph);
      console.log(`[memory] Created empty graph.json for ${profile.label}`);
    }

    const profileMdPath = path.join(profile.workingDir, "memory", String(profile.userId), "profile.md");

    if (!existsSync(profileMdPath)) {
      // For owner: try to seed from legacy evgeniy/profile.md
      const legacyProfilePath = path.join(profile.workingDir, "evgeniy", "profile.md");
      if (!profile.isGuest && existsSync(legacyProfilePath)) {
        const legacyContent = readFileSync(legacyProfilePath, "utf8");
        writeFileSync(profileMdPath, legacyContent, "utf8");
        console.log(`[memory] Seeded profile.md for ${profile.label} from legacy evgeniy/profile.md`);
      } else {
        const name = profile.isGuest ? "Ксения" : profile.label;
        const template = `# Профиль пользователя

(Этот файл — твоё досье. Бот читает его при старте каждой сессии и использует как контекст.
Содержимое можно редактировать через диалог с ботом: «запомни что я ...», «обнови мой профиль».)

## Базовая инфа
- Telegram ID: ${userId}
- Имя: ${name}

## Заметки
- (пусто — бот заполнит по ходу диалогов)
`;
        writeFileSync(profileMdPath, template, "utf8");
        console.log(`[memory] Created profile.md template for ${profile.label} (userId=${userId})`);
      }
    }
  } catch (err) {
    console.warn(`[memory] Bootstrap failed for userId=${userId}: ${err}`);
  }
}

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
