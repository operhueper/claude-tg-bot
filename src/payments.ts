/**
 * Telegram Stars payment flow for Proboi Pro subscription.
 *
 * Flow:
 * 1. User runs /pay → bot sends invoice via sendInvoice
 * 2. User pays in Telegram → bot gets pre_checkout_query → answer true
 * 3. Bot gets successful_payment → activate subscription
 */

import type { Context } from "grammy";
import { UserRegistry } from "./user-registry";
import { alertNewSubscriber } from "./alerts";

export const SUBSCRIPTION_PRICE_STARS = 250;
export const SUBSCRIPTION_DAYS = 30;

/** Get subscription expiry date for a user, or null if no active subscription. */
export function getUserSubscriptionExpiry(userId: number): Date | null {
  const user = UserRegistry.getUser(userId);
  if (!user?.subscription_expires) return null;
  const d = new Date(user.subscription_expires);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Activate or extend subscription for a user.
 * If user already has an active subscription, adds days on top of existing expiry.
 */
export async function activateSubscription(
  userId: number,
  days: number,
  username?: string
): Promise<void> {
  const now = new Date();
  const existing = UserRegistry.getUser(userId);

  // Extend from current expiry if still active, otherwise from now
  const currentExpiry =
    existing?.subscription_expires
      ? new Date(existing.subscription_expires)
      : null;
  const base =
    currentExpiry && currentExpiry > now ? currentExpiry : now;
  const newExpiry = new Date(base.getTime() + days * 24 * 60 * 60 * 1000);

  if (existing) {
    UserRegistry.saveUser({
      ...existing,
      tier: "paid",
      subscription_expires: newExpiry.toISOString(),
    });
  } else {
    UserRegistry.saveUser({
      userId,
      role: "new_guest",
      label: username ? `@${username}` : `guest-${userId}`,
      timezone: "Europe/Moscow",
      settingSources: ["project"],
      rateLimitEnabled: false,
      model: "deepseek-chat",
      tier: "paid",
      subscription_expires: newExpiry.toISOString(),
    });
  }

  // Alert owner about new subscriber (fire-and-forget)
  alertNewSubscriber(userId, username).catch(() => {});
}

/**
 * Check if a user's paid subscription has expired and downgrade to free if so.
 * Call at the start of each message handler or from a cron job.
 */
export function checkSubscriptionExpiry(userId: number): void {
  const user = UserRegistry.getUser(userId);
  if (!user) return;
  if (user.tier !== "paid" || !user.subscription_expires) return;

  const expiry = new Date(user.subscription_expires);
  if (expiry <= new Date()) {
    const { subscription_expires: _removed, ...rest } = user;
    UserRegistry.saveUser({ ...rest, tier: "free" });
    console.log(
      `[payments] Subscription expired for user ${userId}, downgraded to free`
    );
  }
}

/** Send a Stars invoice to the user. */
export async function sendSubscriptionInvoice(ctx: Context): Promise<void> {
  await ctx.replyWithInvoice(
    "Подписка Proboi Профи — 30 дней",
    "Без лимитов сообщений · Личный контейнер для кода · Работа с файлами · Google Workspace",
    "proboi_sub_30d",
    "XTR",
    [{ label: "Proboi Профи · 30 дней", amount: SUBSCRIPTION_PRICE_STARS }]
  );
}

/** Handler for pre_checkout_query — always approve. */
export async function handlePreCheckout(ctx: Context): Promise<void> {
  await ctx.answerPreCheckoutQuery(true);
}

/** Handler for successful_payment — activate subscription. */
export async function handleSuccessfulPayment(ctx: Context): Promise<void> {
  const userId = ctx.from?.id;
  if (!userId) return;

  const username = ctx.from?.username;

  await activateSubscription(userId, SUBSCRIPTION_DAYS, username);

  await ctx.reply(
    `✅ *Оплата прошла!* Подписка Профи активна на ${SUBSCRIPTION_DAYS} дней.\n\nТеперь без лимитов — пиши сколько хочешь 🚀`,
    { parse_mode: "Markdown" }
  );
}
