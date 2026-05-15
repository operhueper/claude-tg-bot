/**
 * Two-level request queue:
 * 1. Per-user lock: prevents a user from running two requests in parallel.
 * 2. Global container semaphore: limits concurrent container sessions.
 */

const MAX_CONCURRENT_WITH_CONTAINER = parseInt(
  process.env.MAX_CONCURRENT_CONTAINER_SESSIONS || "5",
  10
);

// Per-user lock: map userId → pending lock promise
const userLocks = new Map<number, Promise<void>>();

// Global container semaphore
let activeContainerSessions = 0;
const containerQueue: Array<() => void> = [];

/**
 * Acquire per-user lock. Throws if user is already locked — caller must call
 * isUserBusy() first and handle the busy case explicitly.
 * Returns a release function — MUST be called in a finally block.
 */
export async function acquireUserLock(userId: number): Promise<() => void> {
  if (userLocks.has(userId)) {
    throw new Error(`acquireUserLock: user ${userId} already locked — caller must isUserBusy() first`);
  }

  let release!: () => void;
  const lock = new Promise<void>((resolve) => { release = resolve; });
  userLocks.set(userId, lock);

  return () => {
    userLocks.delete(userId);
    release();
  };
}

/**
 * Returns true if the user currently has an active request in flight.
 */
export function isUserBusy(userId: number): boolean {
  return userLocks.has(userId);
}

/**
 * Acquire a global container slot. Waits if all slots are occupied.
 * Throws if the slot is not acquired within `timeoutMs` milliseconds.
 * Returns a release function — MUST be called in a finally block.
 */
export async function acquireContainerSlot(timeoutMs = 60_000): Promise<() => void> {
  if (activeContainerSessions >= MAX_CONCURRENT_WITH_CONTAINER) {
    // V-39: guard against double-resolve — timeout and queue-drain can both
    // try to settle the same promise, which would double-decrement the counter.
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const safeResolve = () => { if (!settled) { settled = true; resolve(); } };
      const safeReject = (e: Error) => { if (!settled) { settled = true; reject(e); } };

      containerQueue.push(safeResolve);
      setTimeout(
        () => safeReject(new Error("acquireContainerSlot: timeout after " + timeoutMs + "ms")),
        timeoutMs
      );
    });
  }
  activeContainerSessions++;

  return () => {
    activeContainerSessions--;
    const next = containerQueue.shift();
    if (next) next();
  };
}

export function getQueueStatus(): { active: number; queued: number } {
  return {
    active: activeContainerSessions,
    queued: containerQueue.length,
  };
}
