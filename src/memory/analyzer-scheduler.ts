/**
 * Batched debounce scheduler for background memory analysis.
 *
 * Instead of running analyzeSession after every 6th turn (which causes
 * forceMemoryFlush to collide with the main query subprocess), callers
 * schedule analysis via scheduleAnalyzerForUser(). A 10-minute debounce
 * timer fires the actual analysis in setImmediate so it never blocks the
 * event loop. Errors are caught and logged as warnings — never thrown.
 */

const DEBOUNCE_MS = 10 * 60 * 1000; // 10 minutes

type PendingEntry = {
  timer: ReturnType<typeof setTimeout>;
  runner: () => Promise<void>;
};

const pending = new Map<number, PendingEntry>();

/**
 * Schedule a background analysis run for the given user.
 * Each call resets the debounce timer — only the last snapshot taken
 * before the timer fires will be analyzed.
 *
 * @param userId   Telegram user ID
 * @param runner   Async function that performs the analysis (closure over
 *                 snapshot + profile). Called with no arguments.
 */
export function scheduleAnalyzerForUser(
  userId: number,
  runner: () => Promise<void>
): void {
  const existing = pending.get(userId);
  if (existing) {
    clearTimeout(existing.timer);
  }

  const timer = setTimeout(() => {
    pending.delete(userId);
    setImmediate(() => {
      runner().catch((e: unknown) => {
        console.warn(`[analyzer-scheduler] Background analysis failed for userId=${userId}:`, e);
      });
    });
  }, DEBOUNCE_MS);

  pending.set(userId, { timer, runner });
}

/**
 * Flush all pending analysis jobs for a specific user immediately.
 * Used when the user explicitly requests a session reset (/new command)
 * so their memory is saved synchronously before the session is cleared.
 *
 * Returns true if a pending entry existed and the runner was executed,
 * false if there was nothing to flush. Callers use this to avoid
 * double-firing the analyzer on the same transcript.
 */
export async function flushPendingForUser(userId: number): Promise<boolean> {
  const entry = pending.get(userId);
  if (!entry) return false;

  clearTimeout(entry.timer);
  pending.delete(userId);

  try {
    await entry.runner();
  } catch (e: unknown) {
    console.warn(`[analyzer-scheduler] flushPendingForUser failed for userId=${userId}:`, e);
  }
  return true;
}

/**
 * Flush all pending analysis jobs (all users) immediately.
 * Useful for graceful shutdown. Errors per-user are caught and logged.
 */
export async function flushAllPending(): Promise<void> {
  const entries = Array.from(pending.entries());
  pending.clear();
  for (const [userId, entry] of entries) {
    clearTimeout(entry.timer);
  }
  await Promise.allSettled(
    entries.map(([userId, entry]) =>
      entry.runner().catch((e: unknown) => {
        console.warn(`[analyzer-scheduler] flushAllPending failed for userId=${userId}:`, e);
      })
    )
  );
}
