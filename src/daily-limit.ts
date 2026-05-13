/**
 * In-memory daily message counter per user.
 * Resets on new calendar day (Moscow timezone = UTC+3).
 * Counter is lost on bot restart — acceptable for MVP.
 */


interface DayCount {
  count: number;
  date: string; // YYYY-MM-DD in MSK
}

const dailyCounts = new Map<number, DayCount>();

// Per-user flag: has this user already processed a document in this bot session?
// Resets on bot restart (in-memory only, acceptable for MVP).
const freeDocUsed = new Map<number, boolean>();

function todayMsk(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Moscow' });
}

export function resetIfNewDay(userId: number): void {
  const today = todayMsk();
  const entry = dailyCounts.get(userId);
  if (entry && entry.date !== today) {
    dailyCounts.delete(userId);
  }
}

export function getTodayCount(userId: number): number {
  const today = todayMsk();
  const entry = dailyCounts.get(userId);
  if (!entry || entry.date !== today) return 0;
  return entry.count;
}

export function incrementCount(userId: number): number {
  const today = todayMsk();
  const entry = dailyCounts.get(userId);
  if (!entry || entry.date !== today) {
    dailyCounts.set(userId, { count: 1, date: today });
    return 1;
  }
  entry.count += 1;
  return entry.count;
}

export function isLimitReached(userId: number, limit: number): boolean {
  return getTodayCount(userId) >= limit;
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
// Convenience API used by text/voice handlers (Task 7)
// ---------------------------------------------------------------------------

/**
 * Returns daily usage stats for a user.
 * limit comes from the user's TierConfig.dailyMessageLimit.
 */
export function getDailyUsage(userId: number, limit: number): { used: number; limit: number; remaining: number } {
  resetIfNewDay(userId);
  const used = getTodayCount(userId);
  return { used, limit, remaining: Math.max(0, limit - used) };
}

/** Increment the daily counter for a user. */
export function incrementDailyUsage(userId: number): void {
  incrementCount(userId);
}

/**
 * Returns true when the user has exhausted their daily limit.
 * limit comes from the user's TierConfig.dailyMessageLimit.
 */
export function isDailyLimitReached(userId: number, limit: number): boolean {
  resetIfNewDay(userId);
  return getTodayCount(userId) >= limit;
}

// ---------------------------------------------------------------------------
// Free doc gate (Task 7b)
// ---------------------------------------------------------------------------

/** Returns true if the user has already used their free document slot this session. */
export function hasFreeDocUsed(userId: number): boolean {
  return freeDocUsed.get(userId) === true;
}

/** Mark that this user has consumed their one free document slot. */
export function markFreeDocUsed(userId: number): void {
  freeDocUsed.set(userId, true);
}
