/**
 * Goals and achievements command handlers for Claude Telegram Bot.
 *
 * /goals - Show goals list with inline actions
 * /goals add <type> <text> - Add a goal
 * /achieve <text> - Record an achievement
 */

import type { Context } from "grammy";
import { getSession } from "../session-registry";
import { ALLOWED_USERS } from "../config";
import { isAuthorized } from "../security";
import { GoalsStore } from "../memory/goals";
import { ensureMemoryStructure } from "../memory/paths";
import type { GoalType, GoalStatus } from "../memory/types";

const VALID_GOAL_TYPES: GoalType[] = ["daily", "weekly", "monthly", "yearly", "lifetime"];

/**
 * /goals — show goals list with inline keyboard actions.
 * /goals add daily|weekly|monthly|yearly|lifetime <text> — add a goal.
 */
export async function handleGoals(ctx: Context): Promise<void> {
  const userId = ctx.from?.id;
  if (!isAuthorized(userId, ALLOWED_USERS) || !userId) {
    await ctx.reply("Unauthorized.");
    return;
  }

  const profile = getSession(userId).profile;
  ensureMemoryStructure(profile.workingDir, profile.userId);
  const store = new GoalsStore(profile.workingDir, profile.userId);

  const text = ctx.message?.text ?? "";
  const parts = text.trim().split(/\s+/);
  // parts[0] = "/goals", parts[1] = subcommand?, parts[2] = type?, rest = title

  if (parts[1] === "add") {
    await handleGoalsAdd(ctx, userId, store, parts.slice(2));
    return;
  }

  // Default: show goals list
  const g = store.load();
  const activeGoals = Object.values(g.goals).filter(goal => goal.status === "active");
  const list = store.formatGoalsList(g);

  if (activeGoals.length === 0) {
    await ctx.reply(
      `<b>🎯 Цели</b>\n\nЦелей пока нет.\n\nДобавить:\n<code>/goals add daily текст цели</code>`,
      { parse_mode: "HTML" }
    );
    return;
  }

  // Build inline keyboard: one row per active goal with Done + Pause buttons
  const keyboard: Array<Array<{ text: string; callback_data: string }>> = [];

  for (const goal of activeGoals.slice(0, 8)) {
    const titleShort = goal.title.length > 25 ? goal.title.slice(0, 22) + "..." : goal.title;
    keyboard.push([
      { text: `✅ ${titleShort}`, callback_data: `goal_done:${goal.id}` },
      { text: `⏸`, callback_data: `goal_pause:${goal.id}` },
    ]);
  }

  await ctx.reply(`<b>🎯 Цели</b>\n\n${list}`, {
    parse_mode: "HTML",
    reply_markup: { inline_keyboard: keyboard },
  });
}

async function handleGoalsAdd(
  ctx: Context,
  _userId: number,
  store: GoalsStore,
  args: string[]
): Promise<void> {
  const profile = getSession(_userId).profile;
  const typeArg = args[0]?.toLowerCase();

  if (!typeArg || !VALID_GOAL_TYPES.includes(typeArg as GoalType)) {
    await ctx.reply(
      `Укажи тип цели: <code>daily | weekly | monthly | yearly | lifetime</code>\n\nПример:\n<code>/goals add weekly Пробежать 20 км</code>`,
      { parse_mode: "HTML" }
    );
    return;
  }

  const title = args.slice(1).join(" ").trim();
  if (!title) {
    await ctx.reply("Укажи текст цели.", { parse_mode: "HTML" });
    return;
  }

  const g = store.load();
  const goal = store.addGoal(g, { type: typeArg as GoalType, title });
  store.save(g);

  const typeEmoji: Record<GoalType, string> = {
    daily: "📅", weekly: "📆", monthly: "🗓", yearly: "📊", lifetime: "🌟",
  };

  await ctx.reply(
    `${typeEmoji[typeArg as GoalType]} Цель добавлена:\n<b>${title}</b>`,
    { parse_mode: "HTML" }
  );
}

/**
 * /achieve <text> — record an achievement.
 */
export async function handleAchieve(ctx: Context): Promise<void> {
  const userId = ctx.from?.id;
  if (!isAuthorized(userId, ALLOWED_USERS) || !userId) {
    await ctx.reply("Unauthorized.");
    return;
  }

  const text = ctx.message?.text ?? "";
  const title = text.replace(/^\/achieve\s*/i, "").trim();

  if (!title) {
    await ctx.reply("Укажи текст достижения:\n<code>/achieve Пробежал первые 5 км</code>", {
      parse_mode: "HTML",
    });
    return;
  }

  const profile = getSession(userId).profile;
  ensureMemoryStructure(profile.workingDir, profile.userId);
  const store = new GoalsStore(profile.workingDir, profile.userId);
  const g = store.load();

  const today = new Date().toISOString().slice(0, 10);
  const achievement = store.addAchievement(g, { title, date: today });
  store.save(g);

  await ctx.reply(`🏆 Достижение записано:\n<b>${achievement.title}</b> — ${achievement.date}`, {
    parse_mode: "HTML",
  });
}

/**
 * Handle goal inline keyboard callbacks: goal_done:{id} and goal_pause:{id}.
 */
export async function handleGoalCallback(
  ctx: Context,
  callbackData: string
): Promise<boolean> {
  const userId = ctx.from?.id;
  if (!userId) return false;

  const isDone = callbackData.startsWith("goal_done:");
  const isPause = callbackData.startsWith("goal_pause:");

  if (!isDone && !isPause) return false;

  const goalId = callbackData.split(":")[1];
  if (!goalId) return false;

  const profile = getSession(userId).profile;
  const store = new GoalsStore(profile.workingDir, profile.userId);
  const g = store.load();

  const goal = g.goals[goalId];
  if (!goal) {
    await ctx.answerCallbackQuery({ text: "Цель не найдена" });
    return true;
  }

  const newStatus: GoalStatus = isDone ? "done" : "paused";
  store.updateGoal(g, goalId, { status: newStatus });
  store.save(g);

  const statusText = isDone ? "✅ Выполнена" : "⏸ На паузе";
  await ctx.answerCallbackQuery({ text: `${statusText}: ${goal.title.slice(0, 40)}` });

  try {
    await ctx.editMessageText(
      `${statusText}: <b>${goal.title}</b>`,
      { parse_mode: "HTML" }
    );
  } catch {
    // Message may not be editable
  }

  return true;
}
