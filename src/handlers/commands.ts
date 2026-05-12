/**
 * Command handlers for Claude Telegram Bot.
 *
 * /start, /new, /stop, /status, /resume, /restart, /retry
 *
 * Per-user session lookup via getSession(userId). Restricted users (guests)
 * are blocked from /restart.
 */

import type { Context } from "grammy";
import { InlineKeyboard } from "grammy";
import { execSync, execFileSync } from "child_process";
import { existsSync, unlinkSync } from "fs";
import * as fs from "fs";
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
import { getUserSubscriptionExpiry, isTrialUsed, sendYuKassaBindingLink } from "../payments.js";
import { getTodayCount, resetIfNewDay } from "../daily-limit";
import { GraphStore } from "../memory/graph";
import { GoalsStore } from "../memory/goals";
import { buildMemoryContext } from "../memory/inject";
import { graphFile, goalsFilePath, transcriptsDir } from "../memory/paths";
import { escapeHtml } from "../formatting";

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
      `👋 <b>Привет! Я Proboi — ИИ-ассистент прямо в Telegram.</b>\n\n` +
        `Никаких кнопок и меню — просто напиши мне обычным текстом, как другу. Например:\n\n` +
        `• <i>«Объясни простыми словами что такое инфляция»</i>\n` +
        `• <i>«Напиши письмо клиенту об отсрочке платежа»</i>\n` +
        `• <i>«Что на этом фото?»</i> — и прикрепи картинку\n` +
        `• Отправь голосовое — я переведу и отвечу\n\n` +
        `📖 <a href="https://proboi.site/how-to-setup">Полный гайд — все возможности и примеры</a>\n\n` +
        `Напиши что-нибудь — и начнём 👆`,
      { parse_mode: "HTML", link_preview_options: { is_disabled: true } }
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
    ? `🤖 <b>Proboi — твой ИИ-ассистент</b>\n\nПросто напиши что нужно — текстом, голосом или фото.`
    : `🤖 <b>Proboi</b>`;

  const workingDirLine = profile.isGuest
    ? ""
    : `Working directory: <code>${profile.workingDir}</code>\n`;

  const guestHint = profile.isGuest
    ? `\n📖 <a href="https://proboi.site/how-to-setup">Гайд — все возможности и примеры</a>\n`
    : "";

  await ctx.reply(
    `${greeting}\n\n` +
      (profile.isGuest ? "" : `Status: ${status}\n` + workingDirLine + "\n") +
      `<b>Команды:</b>\n` +
      commandLines.join("\n") +
      guestHint,
    { parse_mode: "HTML", link_preview_options: { is_disabled: true } }
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

  if (!profile.isGuest) {
    lines.push(`\n📁 Working dir: <code>${profile.workingDir}</code>`);
  } else {
    lines.push(`\n📁 Рабочая папка: ✅`);
  }

  // Tier & subscription info
  {
    resetIfNewDay(userId);
    const dailyUsed = getTodayCount(userId);
    const dailyLimit = profile.tierConfig.dailyMessageLimit;

    lines.push(""); // пустая строка
    if (profile.tier === "paid") {
      const expires = getUserSubscriptionExpiry(userId);
      const expiresStr = expires
        ? expires.toLocaleDateString("ru-RU", {
            day: "numeric",
            month: "long",
            year: "numeric",
          })
        : "—";
      lines.push(`💎 <b>Тариф:</b> Профи`);
      lines.push(`📅 Подписка до: ${expiresStr}`);
      lines.push(`💬 Сообщений: без ограничений`);
    } else {
      lines.push(`⬜ <b>Тариф:</b> Бесплатный`);
      lines.push(`💬 Сообщений сегодня: ${dailyUsed} / ${dailyLimit ?? 10}`);
    }
  }

  const keyboard = new InlineKeyboard()
    .url("📖 Как использовать на полную →", "https://proboi.site/how-to-setup")
    .row()
    .webApp("📊 Дашборд", "https://proboi.site/dashboard")
    .row();

  if (profile.tier === "free") {
    keyboard.text("⭐ Подписка", "pay_upgrade");
  }

  await ctx.reply(lines.join("\n"), {
    parse_mode: "HTML",
    reply_markup: keyboard,
  });
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
    await ctx.reply("✅ Сессия уже активна. Используй /new чтобы начать заново.");
    return;
  }

  const sessions = session.getSessionList();

  if (sessions.length === 0) {
    await ctx.reply("📭 Нет сохранённых сессий.");
    return;
  }

  const buttons = sessions.map((s) => {
    const date = new Date(s.saved_at);
    const dateStr = date.toLocaleDateString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
    });
    const timeStr = date.toLocaleTimeString("ru-RU", {
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
    "📋 <b>Сохранённые сессии</b>\n\nВыбери сессию для продолжения:",
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
  const profile = getUserProfile(userId);

  // Stop any running query first so the session can be cleared cleanly.
  if (session.isRunning) {
    const stopped = await session.stop();
    if (stopped) {
      // Give the abort signal time to propagate into the SDK subprocess.
      // 2 sec covers most graceful exits; anything still alive after gets SIGKILL'd below.
      await Bun.sleep(2000);
      session.clearStopRequested();
    }
  }

  // Hard-kill any Claude CLI subprocess still alive for THIS user only.
  // The CLI subprocess is started with `--add-dir <workingDir>`, which uniquely
  // identifies the user (guest vault path or owner workspace). Other users'
  // processes won't match and stay untouched.
  const killed = killUserClaudeProcesses(profile.workingDir);

  // Flush in-flight memory before tearing the session down.
  if (session.isActive) {
    session
      .forceMemoryFlush()
      .catch((e) => console.warn("[/restart] forceMemoryFlush failed:", e));
  }

  // Clear in-memory session state.
  await session.kill();

  // Drop the on-disk session history so /resume won't pick it up.
  try {
    if (existsSync(profile.sessionFile)) {
      unlinkSync(profile.sessionFile);
    }
  } catch (e) {
    console.warn(`[/restart] Failed to delete session file for ${userId}:`, e);
  }

  const reply = killed > 0
    ? `Сессия сброшена. Прибил ${killed} зависш${killed === 1 ? "ий процесс" : "их процесса"} 🔪`
    : "Сессия сброшена. Начинаем заново 🔄";
  await ctx.reply(reply);
}

/**
 * Find all Claude CLI subprocesses launched for a given user (matched by
 * `--add-dir <workingDir>` in their cmdline) and SIGKILL them. Returns the
 * number of processes actually killed. Safe to call when nothing is running —
 * pgrep exits 1 with no matches and we treat that as zero.
 */
function killUserClaudeProcesses(workingDir: string): number {
  let pids: number[] = [];
  try {
    const out = execFileSync(
      "pgrep",
      ["-f", `--add-dir ${workingDir}`],
      { encoding: "utf-8" }
    );
    pids = out.trim().split("\n").filter(Boolean).map(Number).filter(n => Number.isFinite(n) && n > 0);
  } catch {
    return 0;
  }
  let killed = 0;
  for (const pid of pids) {
    try {
      process.kill(pid, "SIGKILL");
      killed++;
    } catch (e) {
      console.warn(`[/restart] Failed to SIGKILL pid ${pid}:`, e);
    }
  }
  if (killed > 0) {
    console.log(`[/restart] Killed ${killed} stuck Claude CLI process(es) for ${workingDir}`);
  }
  return killed;
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
      chat: ctx.message?.chat ?? ctx.chat,
    },
  } as Context;

  await handleText(fakeCtx);
}

/**
 * /info — interactive help with features and tiers comparison.
 */
export async function handleInfo(ctx: Context): Promise<void> {
  const userId = ctx.from?.id;
  if (!userId || !isAuthorized(userId, ALLOWED_USERS)) return;

  const profile = getUserProfile(userId);
  const isPaid = profile.tier === "paid";

  const text =
    `*Proboi — что умею*\n\n` +
    `*Всегда доступно:*\n` +
    `• Отвечаю на вопросы — объясняю, анализирую, советую\n` +
    `• Пишу тексты: письма, посты, резюме, скрипты\n` +
    `• Анализирую фото: что на картинке, текст с фото\n` +
    `• Транскрибирую голосовые сообщения\n` +
    `• Ищу информацию в интернете\n\n` +
    `*На тарифе Профи:*\n` +
    `• Запускаю код: Python, JavaScript, bash\n` +
    `• Работаю с файлами: PDF, Word, Excel, архивы\n` +
    `• Подключаю Google: Docs, Drive, Gmail, Календарь\n` +
    `• Генерирую изображения по описанию\n` +
    `• Помню контекст между сессиями\n\n` +
    `*Твой тариф:* ${isPaid ? "✅ Профи" : "⬜ Бесплатный (10 сообщений/день)"}`;

  const keyboard = new InlineKeyboard()
    .url("📖 Полный гайд", "https://proboi.site/how-to-setup")
    .row()
    .text("📋 Сравнить тарифы", "info_tiers")
    .row()
    .text("🚀 Как начать", "info_howto")
    .row();

  if (!isPaid) {
    keyboard.text("⭐ Перейти на Профи", "pay_upgrade").row();
  }

  await ctx.reply(text, {
    parse_mode: "Markdown",
    reply_markup: keyboard,
  });
}

/**
 * /pay — show YuKassa binding link or active subscription status.
 */
export async function handlePay(ctx: Context): Promise<void> {
  const userId = ctx.from?.id;
  if (!userId || !isAuthorized(userId, ALLOWED_USERS)) return;

  const profile = getUserProfile(userId);

  if (profile.tier === "paid") {
    const expiry = getUserSubscriptionExpiry(userId);
    const expiryStr = expiry ? expiry.toLocaleDateString('ru-RU') : 'неизвестно';
    const kb = new InlineKeyboard().text('Отменить подписку', 'cancel_subscription');
    await ctx.reply(
      `✅ У вас активна подписка Профи.\nДействует до: ${expiryStr}\nСледующее списание: 499 ₽`,
      { reply_markup: kb }
    );
    return;
  }

  if (isTrialUsed(userId)) {
    const kb = new InlineKeyboard()
      .text('Оформить Профи — 499 ₽/мес', 'pay_upgrade')
      .row()
      .url('Что даёт Профи →', 'https://proboi.site/how-to-setup');
    await ctx.reply('Ваш бесплатный пробный период уже был использован.\n\nОформите Профи — 499 ₽/мес:', { reply_markup: kb });
    return;
  }

  try {
    await sendYuKassaBindingLink(ctx, userId);
  } catch (e) {
    await replyFriendly(ctx, e, 'pay');
  }
}

/**
 * /memory — show what the bot remembers about this user.
 */
export async function handleMemory(ctx: Context): Promise<void> {
  const userId = ctx.from?.id;
  if (!userId || !isAuthorized(userId, ALLOWED_USERS)) return;

  const profile = getUserProfile(userId);

  if (profile.isOwner) {
    await ctx.reply("У владельца своя система памяти через ~/.claude.");
    return;
  }

  try {
    const graphStore = new GraphStore(profile.memoryRoot, userId);
    const goalsStore = new GoalsStore(profile.memoryRoot, userId);
    const graph = graphStore.load();
    const goals = goalsStore.load();

    const nodeCount = Object.keys(graph.nodes ?? {}).length;
    const goalCount = Object.values(goals.goals ?? {}).filter(
      (g) => g.status === "active"
    ).length;

    if (nodeCount === 0 && goalCount === 0) {
      await ctx.reply(
        "Пока ничего не сохранено о тебе. Память накапливается по мере диалогов."
      );
      return;
    }

    const memCtx = buildMemoryContext(graph, goals, {
      maxNodes: 15,
      maxChars: 3000,
    });

    const header = `🧠 <b>Что я о тебе помню</b> (${nodeCount} фактов, ${goalCount} активных целей):\n\n`;
    const body = memCtx.appendText || "Нет данных для отображения.";
    await ctx.reply(header + escapeHtml(body), { parse_mode: "HTML" });
  } catch (err) {
    await ctx.reply("Не удалось загрузить память. Попробуй позже.");
    console.error("[/memory]", err);
  }
}

/**
 * /forget — delete all memory about this user.
 */
export async function handleForget(ctx: Context): Promise<void> {
  const userId = ctx.from?.id;
  if (!userId || !isAuthorized(userId, ALLOWED_USERS)) return;

  const profile = getUserProfile(userId);

  if (profile.isOwner) {
    await ctx.reply("Для владельца /forget не применяется.");
    return;
  }

  try {
    const gFile = graphFile(profile.memoryRoot, userId);
    const goFile = goalsFilePath(profile.memoryRoot, userId);
    const tDir = transcriptsDir(profile.memoryRoot, userId);

    for (const filePath of [gFile, goFile]) {
      try {
        await fs.promises.unlink(filePath);
      } catch {
        // ignore — file may not exist
      }
    }
    try {
      await fs.promises.rm(tDir, { recursive: true, force: true });
    } catch {
      // ignore
    }

    await ctx.reply("Память очищена. Начинаем с чистого листа.");
  } catch (err) {
    await ctx.reply("Не удалось очистить память. Попробуй позже.");
    console.error("[/forget]", err);
  }
}

/**
 * /cancel — cancel active subscription.
 */
export async function handleCancel(ctx: Context): Promise<void> {
  const userId = ctx.from?.id;
  if (!userId || !isAuthorized(userId, ALLOWED_USERS)) return;

  const profile = getUserProfile(userId);

  if (profile.tier !== 'paid') {
    await ctx.reply('У вас нет активной подписки.');
    return;
  }

  const expiry = getUserSubscriptionExpiry(userId);
  const expiryStr = expiry ? expiry.toLocaleDateString('ru-RU') : 'конец периода';
  const kb = new InlineKeyboard()
    .text('Да, отменить', 'confirm_cancel_subscription')
    .text('Нет, оставить', 'keep_subscription');
  await ctx.reply(
    `Вы уверены, что хотите отменить подписку?\n\nДоступ сохранится до ${expiryStr}.`,
    { reply_markup: kb }
  );
}
