/**
 * Owner alert utilities — send operational notifications to bot owner.
 * Use for: new paying users, expiring subscriptions, system events.
 */

const OWNER_ID = 292228713;

/** Send a plain-text or Markdown message to the bot owner via Telegram API. */
export async function notifyOwner(message: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;

  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: OWNER_ID,
        text: message,
        parse_mode: "Markdown",
      }),
    });
  } catch (err) {
    console.error("[alerts] Failed to notify owner:", err);
  }
}

/**
 * Alert when a user successfully pays for a subscription.
 * Call from handleSuccessfulPayment in src/payments.ts once it exists.
 */
export async function alertNewSubscriber(userId: number, username?: string): Promise<void> {
  const userRef = username ? `@${username}` : `id:${userId}`;
  await notifyOwner(`🎉 *Новый платящий пользователь!*\n\n${userRef} оформил подписку Профи.`);
}

/**
 * Alert when a subscription is expiring soon.
 * @param daysLeft - days remaining before expiry
 */
export async function alertExpiringSubscription(
  userId: number,
  username: string | undefined,
  daysLeft: number
): Promise<void> {
  const userRef = username ? `@${username}` : `id:${userId}`;
  await notifyOwner(
    `⚠️ *Подписка истекает через ${daysLeft} дн.*\n\n${userRef} — подписка заканчивается.`
  );
}

/**
 * Alert when free user count exceeds a threshold.
 * Call from a cron or message handler when total free users > threshold.
 */
export async function alertHighFreeUserCount(count: number): Promise<void> {
  await notifyOwner(`📊 *Нагрузка: ${count} бесплатных пользователей*\n\nПроверь ресурсы сервера.`);
}
