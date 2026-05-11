/**
 * YuKassa payment flow for Proboi Pro subscription.
 *
 * Flow:
 * 1. User runs /pay → bot sends YuKassa binding link (1 ₽ charge, card saved)
 * 2. YuKassa calls POST /webhook/yukassa → handleYuKassaWebhook activates trial
 * 3. On expiry, chargeExpiredTrials (tasks.ts) attempts recurring charge
 */

import type { Context } from "grammy";
import { InlineKeyboard } from "grammy";
import { UserRegistry } from "./user-registry.js";
import { alertNewSubscriber } from "./alerts.js";
import { createBindingPayment, chargeRecurring } from "./engines/yukassa.js";
import type { YuKassaWebhookEvent } from "./types.js";

export const SUBSCRIPTION_PRICE = '499.00';
export const SUBSCRIPTION_DAYS = 30;
export const TRIAL_DAYS = 5;
export const TRIAL_AMOUNT = '1.00';
export const RETURN_BASE_URL = process.env.RETURN_BASE_URL ?? 'https://proboi.site';

/** Get subscription expiry date for a user, or null if no active subscription. */
export function getUserSubscriptionExpiry(userId: number): Date | null {
  const user = UserRegistry.getUser(userId);
  if (!user?.subscription_expires) return null;
  const d = new Date(user.subscription_expires);
  return isNaN(d.getTime()) ? null : d;
}

/** Activate or extend subscription for a user. */
export async function activateSubscription(userId: number, days: number, username?: string): Promise<void> {
  const now = new Date();
  const existing = UserRegistry.getUser(userId);
  const currentExpiry = existing?.subscription_expires ? new Date(existing.subscription_expires) : null;
  const base = currentExpiry && currentExpiry > now ? currentExpiry : now;
  const newExpiry = new Date(base.getTime() + days * 24 * 60 * 60 * 1000);

  if (existing) {
    UserRegistry.saveUser({ ...existing, tier: 'paid', subscription_expires: newExpiry.toISOString() });
  }
  await alertNewSubscriber(userId, username ?? String(userId)).catch(() => {});
}

/** Save YuKassa payment method ID for recurring charges. */
export function savePaymentMethod(userId: number, paymentMethodId: string): void {
  const user = UserRegistry.getUser(userId);
  if (user) UserRegistry.saveUser({ ...user, payment_method_id: paymentMethodId });
}

/** Mark that trial was used by this user. */
export function markTrialUsed(userId: number): void {
  const user = UserRegistry.getUser(userId);
  if (user) UserRegistry.saveUser({
    ...user,
    trial_used: true,
    trial_activated_at: new Date().toISOString(),
  });
}

/** Check if trial was already used. */
export function isTrialUsed(userId: number): boolean {
  return UserRegistry.getUser(userId)?.trial_used === true;
}

/** Downgrade user to free tier. */
export function downgradeToFree(userId: number): void {
  const user = UserRegistry.getUser(userId);
  if (user) UserRegistry.saveUser({
    ...user,
    tier: 'free',
    subscription_expires: undefined,
    payment_method_id: undefined,
    grace_period_until: undefined,
  });
}

/**
 * Send YuKassa binding link to user.
 * Called by handlePay when user is on free tier without trial used.
 */
export async function sendYuKassaBindingLink(ctx: Context, userId: number): Promise<void> {
  const returnUrl = `${RETURN_BASE_URL}/subscribe?status=success&userId=${userId}`;
  const { id: _paymentId, confirmationUrl } = await createBindingPayment({ userId, returnUrl });

  const kb = new InlineKeyboard()
    .url('Привязать карту — 5 дней бесплатно', confirmationUrl)
    .row()
    .url('Что даёт Профи →', 'https://proboi.site/how-to-setup');

  await ctx.reply(
    'Привяжи карту — получи 5 дней Профи бесплатно.\n\n' +
    'После триала автоматически 499 ₽/мес. Отменить можно в любой момент командой /cancel.',
    { reply_markup: kb }
  );
}

/**
 * Central webhook handler for YuKassa payment events.
 * Called from dashboard-server.ts POST /webhook/yukassa.
 */
export async function handleYuKassaWebhook(event: YuKassaWebhookEvent, bot: any): Promise<void> {
  const payment = event.object;
  const userIdStr = payment.metadata?.userId;
  if (!userIdStr) return;
  const userId = Number(userIdStr);
  if (isNaN(userId)) return;

  if (event.type === 'payment.succeeded') {
    const methodId = payment.payment_method?.saved ? payment.payment_method.id : undefined;
    const purpose = payment.metadata?.purpose;

    if (purpose === 'card_binding') {
      if (methodId) savePaymentMethod(userId, methodId);
      markTrialUsed(userId);
      await activateSubscription(userId, TRIAL_DAYS);
      const kb = new InlineKeyboard().url('Что теперь доступно →', 'https://proboi.site/how-to-setup');
      await bot.api.sendMessage(userId,
        '✅ Карта привязана! 5 дней Профи — бесплатно.\n\nДокументы, код, Google, изображения — всё открыто.',
        { reply_markup: kb }
      ).catch(() => {});
    } else if (purpose === 'recurring_subscription') {
      await activateSubscription(userId, SUBSCRIPTION_DAYS);
      const user = UserRegistry.getUser(userId);
      if (user) UserRegistry.saveUser({ ...user, grace_period_until: undefined });
      await bot.api.sendMessage(userId, '✅ Подписка продлена на 30 дней.').catch(() => {});
    }
  } else if (event.type === 'payment.canceled') {
    const purpose = payment.metadata?.purpose;
    if (purpose === 'card_binding') {
      await bot.api.sendMessage(userId,
        '❌ Оплата отменена. Вы всегда можете вернуться — /pay'
      ).catch(() => {});
    }
  }
}

/**
 * Check if a user's paid subscription has expired and downgrade to free if so.
 * Call at the start of each message handler or from a cron job.
 * @deprecated Prefer chargeExpiredTrials in tasks.ts for proper recurring logic.
 */
export function checkSubscriptionExpiry(userId: number): void {
  const user = UserRegistry.getUser(userId);
  if (!user) return;
  if (user.tier !== 'paid' || !user.subscription_expires) return;

  const expiry = new Date(user.subscription_expires);
  if (expiry <= new Date()) {
    downgradeToFree(userId);
    console.log(`[payments] Subscription expired for user ${userId}, downgraded to free`);
  }
}
