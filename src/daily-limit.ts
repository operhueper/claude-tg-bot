/**
 * Daily message counter per user — backed by SQLite (metering.sqlite).
 * Counts persist across bot restarts and reset automatically at midnight MSK.
 */

import {
  getMsgCountToday,
  incrementMsgCount,
  getDocCountToday,
  incrementDocCount,
} from "./metering";

// ---------------------------------------------------------------------------
// Legacy low-level API (kept for backward compatibility with any callers)
// ---------------------------------------------------------------------------

export function resetIfNewDay(_userId: number): void {
  // No-op: SQLite date key handles reset automatically.
}

export function getTodayCount(userId: number): number {
  return getMsgCountToday(userId);
}

export function incrementCount(userId: number): number {
  incrementMsgCount(userId);
  return getMsgCountToday(userId);
}

export function isLimitReached(userId: number, limit: number): boolean {
  return getMsgCountToday(userId) >= limit;
}

/** Returns ISO string for midnight MSK of tomorrow (when counter resets). */
export function nextResetAt(): string {
  const now = new Date();
  // Tomorrow 00:00 MSK = 21:00 UTC (UTC+3)
  const mskNow = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Moscow' }));
  const tomorrow = new Date(mskNow);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);
  // Adjust back to UTC: MSK is UTC+3, so subtract 3h
  const utcReset = new Date(tomorrow.getTime() - 3 * 60 * 60 * 1000);
  return utcReset.toISOString();
}

// ---------------------------------------------------------------------------
// Convenience API used by text/voice handlers
// ---------------------------------------------------------------------------

/**
 * Returns daily usage stats for a user.
 * limit comes from the user's TierConfig.dailyMessageLimit.
 */
export function getDailyUsage(
  userId: number,
  limit: number
): { used: number; limit: number; remaining: number } {
  const used = getMsgCountToday(userId);
  return { used, limit, remaining: Math.max(0, limit - used) };
}

/** Increment the daily counter for a user. */
export function incrementDailyUsage(userId: number): void {
  incrementMsgCount(userId);
}

/**
 * Returns true when the user has exhausted their daily limit.
 * limit comes from the user's TierConfig.dailyMessageLimit.
 */
export function isDailyLimitReached(userId: number, limit: number): boolean {
  return getMsgCountToday(userId) >= limit;
}

// ---------------------------------------------------------------------------
// Free doc gate
// ---------------------------------------------------------------------------

/** Returns true if the user has already used their free document slot today. */
export function hasFreeDocUsed(userId: number): boolean {
  return getDocCountToday(userId) >= 1;
}

/** Mark that this user has consumed their one free document slot today. */
export function markFreeDocUsed(userId: number): void {
  incrementDocCount(userId);
}
