/**
 * Task management — saves confirmed tasks to personal vaults.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from "fs";
import { getUserProfile, OWNER_USER_ID } from "./config";
import { GraphStore } from "./memory/graph";

export interface PendingTask {
  id: string;
  text: string;
  deadline?: string;
  assignedBy: number;
  assignedTo: number;
  createdAt: string;
}

// Telegram usernames for tagging in group
export const USER_TELEGRAM_NAMES: Record<number, string> = {
  292228713: "@ev_mironoff",
  893951298: "@ksenyaenbom",
};

export const USER_DISPLAY_NAMES: Record<number, string> = {
  292228713: "Евгений",
  893951298: "Ксюша",
};

// Detect if a message looks like a task assignment
export function detectTaskIntent(text: string): boolean {
  const lower = text.toLowerCase();
  const keywords = [
    "запомни задачу",
    "поставь задачу",
    "задача для",
    "задача:",
    "запиши задачу",
    "добавь задачу",
  ];
  return keywords.some((k) => lower.includes(k));
}

// Try to detect who the task is for from the message text
// Returns userId or null if unclear
export function detectAssignee(text: string, fromUserId: number): number | null {
  const lower = text.toLowerCase();
  if (/ксюш|ксени|ксю/.test(lower)) return 893951298;
  if (/женя|женю|жене|евгени/.test(lower)) return 292228713;
  if (/\bмне\b|\bсебе\b|\bменя\b|\bдля меня\b/.test(lower)) return fromUserId;
  return null;
}

/**
 * Authorization helper: returns true if userId may assign tasks to others.
 * Only the owner can write into another user's vault.
 */
export function canAssignTask(assignedBy: number, assignedTo: number): boolean {
  if (assignedBy === assignedTo) return true; // self-assignment always allowed
  return assignedBy === OWNER_USER_ID;
}

// Save confirmed task to vault and memory graph
export function saveTaskToVault(task: PendingTask): void {
  // Authorization: guests may only write into their own vault.
  if (!canAssignTask(task.assignedBy, task.assignedTo)) {
    throw new Error(
      `Unauthorized: user ${task.assignedBy} cannot assign tasks to user ${task.assignedTo}`
    );
  }
  const vaultPath = `/opt/vault/${task.assignedTo}/inbox`;
  const tasksFile = `${vaultPath}/tasks.md`;

  if (!existsSync(vaultPath)) {
    mkdirSync(vaultPath, { recursive: true });
  }

  const deadlineStr = task.deadline ? ` | 📅 ${task.deadline}` : "";
  const assignedByName = USER_DISPLAY_NAMES[task.assignedBy] ?? "Неизвестно";
  const line = `- [ ] ${task.text}${deadlineStr} _(от ${assignedByName}, ${task.createdAt})_\n`;

  let content = existsSync(tasksFile) ? readFileSync(tasksFile, "utf8") : "";

  if (!content.includes("# Входящие задачи")) {
    content = `# Входящие задачи\n\n` + content;
  }

  content = content.replace(
    "# Входящие задачи\n\n",
    `# Входящие задачи\n\n${line}`
  );
  writeFileSync(tasksFile, content);

  // Also persist to the assignee's memory graph
  try {
    const profile = getUserProfile(task.assignedTo);
    const store = new GraphStore(profile.workingDir, task.assignedTo);
    const g = store.load();
    store.upsertTask(g, {
      text: task.text,
      deadline: task.deadline,
      assignedBy: task.assignedBy,
      assignedTo: task.assignedTo,
    });
    store.save(g);
  } catch (err) {
    console.warn("[tasks] Failed to write task to memory graph:", err);
  }
}

// Save pending task to /tmp for confirmation.
// Throws if the assigning user is not authorized to assign to the given target.
export function savePendingTask(task: PendingTask): void {
  if (!canAssignTask(task.assignedBy, task.assignedTo)) {
    throw new Error(
      `Unauthorized: user ${task.assignedBy} cannot assign tasks to user ${task.assignedTo}`
    );
  }
  const file = `/tmp/task-${task.id}.json`;
  writeFileSync(file, JSON.stringify(task, null, 2));
}

// Load pending task from /tmp
export function loadPendingTask(id: string): PendingTask | null {
  if (!/^[a-f0-9]{32}$/.test(id)) return null;
  const file = `/tmp/task-${id}.json`;
  try {
    return JSON.parse(readFileSync(file, "utf8")) as PendingTask;
  } catch {
    return null;
  }
}

// Delete pending task file
export function deletePendingTask(id: string): void {
  if (!/^[a-f0-9]{32}$/.test(id)) return;
  try {
    unlinkSync(`/tmp/task-${id}.json`);
  } catch {}
}

// ---------------------------------------------------------------------------
// Subscription billing
// ---------------------------------------------------------------------------

import { InlineKeyboard } from "grammy";
import { UserRegistry } from "./user-registry.js";
import {
  activateSubscription,
  downgradeToFree,
  SUBSCRIPTION_PRICE,
  SUBSCRIPTION_DAYS,
} from "./payments.js";
import { chargeRecurring } from "./engines/yukassa.js";

/**
 * Charge users whose trial/subscription has expired.
 * Run every 6 hours via setInterval in index.ts.
 */
export async function chargeExpiredTrials(bot: any): Promise<void> {
  const users = UserRegistry.getAllUsers();
  const now = new Date();

  for (const user of users) {
    if (user.tier !== 'paid' || !user.subscription_expires) continue;
    const expiry = new Date(user.subscription_expires);
    if (expiry > now) continue; // not expired yet

    // Check grace period
    if (user.grace_period_until) {
      const graceEnd = new Date(user.grace_period_until);
      if (graceEnd > now) continue; // still in grace period
      // Grace period expired — downgrade
      downgradeToFree(user.userId);
      await bot.api.sendMessage(user.userId,
        '😔 К сожалению, нам не удалось провести оплату. Доступ к Профи приостановлен.\n\n' +
        'Чтобы восстановить подписку — /pay'
      ).catch(() => {});
      continue;
    }

    // Try to charge
    const methodId = user.payment_method_id;
    if (!methodId) {
      downgradeToFree(user.userId);
      continue;
    }

    try {
      const payment = await chargeRecurring({
        userId: user.userId,
        paymentMethodId: methodId,
        amount: SUBSCRIPTION_PRICE,
        description: 'Proboi Профи — ежемесячная подписка',
      });

      if (payment.status === 'succeeded') {
        await activateSubscription(user.userId, SUBSCRIPTION_DAYS);
        const updated = UserRegistry.getUser(user.userId);
        if (updated) UserRegistry.saveUser({ ...updated, grace_period_until: undefined });
      } else {
        // First failure — set grace period
        const graceEnd = new Date(now.getTime() + 48 * 60 * 60 * 1000);
        UserRegistry.saveUser({ ...user, grace_period_until: graceEnd.toISOString() });
        await bot.api.sendMessage(user.userId,
          '⚠️ Не удалось провести оплату за подписку Профи.\n\n' +
          'У вас есть 48 часов для повторной попытки. Если оплата не пройдёт — доступ будет приостановлен.\n\n' +
          '/pay — обновить карту'
        ).catch(() => {});
      }
    } catch (chargeErr) {
      console.error(`[billing] chargeRecurring failed for user ${user.userId}:`, chargeErr);
      const graceEnd = new Date(now.getTime() + 48 * 60 * 60 * 1000);
      UserRegistry.saveUser({ ...user, grace_period_until: graceEnd.toISOString() });
      await bot.api.sendMessage(user.userId,
        '⚠️ Не удалось провести оплату за подписку Профи.\n\n' +
        'У вас есть 48 часов для повторной попытки. Если оплата не пройдёт — доступ будет приостановлен.\n\n' +
        '/pay — обновить карту'
      ).catch(() => {});
    }
  }

  // Day-4 trial expiry push
  for (const user of users) {
    if (user.tier !== 'paid' || !user.trial_used || !user.trial_activated_at || user.day4_push_sent) continue;
    const activatedAt = new Date(user.trial_activated_at);
    const day4 = new Date(activatedAt.getTime() + 96 * 60 * 60 * 1000); // 96h = day 4
    if (now < day4) continue;

    await bot.api.sendMessage(user.userId,
      'Ваш бесплатный Профи истекает завтра.\n\n' +
      'Вы уже успели попробовать документы, голос и Google Docs.\n' +
      'Завтра карта спишет 499 ₽ — и доступ продолжится.\n\n' +
      'Хотите отменить — напишите /cancel',
      { reply_markup: new InlineKeyboard().url('Что ещё можно сделать за сегодня →', 'https://proboi.site/how-to-setup') }
    ).catch(() => {});

    const updated = UserRegistry.getUser(user.userId);
    if (updated) UserRegistry.saveUser({ ...updated, day4_push_sent: true });
  }
}
