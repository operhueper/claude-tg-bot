/**
 * Channel subscription gate.
 *
 * Forces every non-owner user to be a member of REQUIRED_CHANNEL_ID before
 * the bot will respond to anything. The bot must be an administrator of that
 * channel for `getChatMember` to work on private channels.
 *
 * Disabled when REQUIRED_CHANNEL_ID is empty.
 */

import type { Api } from "grammy";

export const REQUIRED_CHANNEL_ID = (process.env.REQUIRED_CHANNEL_ID || "").trim();
export const REQUIRED_CHANNEL_URL = (process.env.REQUIRED_CHANNEL_URL || "").trim();

export function isSubscriptionGateEnabled(): boolean {
  return REQUIRED_CHANNEL_ID.length > 0;
}

const CACHE_TTL_POSITIVE_MS = 5 * 60 * 1000;
const CACHE_TTL_NEGATIVE_MS = 60 * 1000;
const cache = new Map<number, { subscribed: boolean; ts: number }>();

function parseChannelId(raw: string): string | number {
  if (raw.startsWith("@")) return raw;
  const n = Number(raw);
  return Number.isFinite(n) ? n : raw;
}

export function invalidateSubscription(userId: number): void {
  cache.delete(userId);
}

/**
 * Membership statuses that count as "subscribed" for our gate.
 * `restricted` is included because Telegram returns it for members under
 * channel restrictions — they are still members.
 */
const SUBSCRIBED_STATUSES = new Set([
  "creator",
  "administrator",
  "member",
  "restricted",
]);

export async function isSubscribed(api: Api, userId: number): Promise<boolean> {
  if (!isSubscriptionGateEnabled()) return true;

  const cached = cache.get(userId);
  if (cached) {
    const ttl = cached.subscribed ? CACHE_TTL_POSITIVE_MS : CACHE_TTL_NEGATIVE_MS;
    if (Date.now() - cached.ts < ttl) {
      return cached.subscribed;
    }
  }

  try {
    const member = await api.getChatMember(parseChannelId(REQUIRED_CHANNEL_ID), userId);
    const ok = SUBSCRIBED_STATUSES.has(member.status);
    cache.set(userId, { subscribed: ok, ts: Date.now() });
    return ok;
  } catch (err) {
    // Common failures: bot is not an admin of the channel, channel id wrong,
    // user has never interacted with the bot. Treat as "not subscribed" so
    // the user sees the gate; log so the operator can fix configuration.
    console.warn(
      `[subscription] getChatMember failed for user ${userId} on ${REQUIRED_CHANNEL_ID}:`,
      err
    );
    return false;
  }
}
