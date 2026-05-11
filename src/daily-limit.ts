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
