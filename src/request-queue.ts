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
 * Acquire per-user lock. If user already has an active request, waits for it.
 * Returns a release function — MUST be called in a finally block.
 */
export async function acquireUserLock(userId: number): Promise<() => void> {
  // Chain onto any existing lock for this user
  const existing = userLocks.get(userId);
  if (existing) {
    await existing;
  }

  let releaseFn!: () => void;
  const lock = new Promise<void>((resolve) => {
    releaseFn = resolve;
  });
  userLocks.set(userId, lock);

  return () => {
    userLocks.delete(userId);
    releaseFn();
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
 * Returns a release function — MUST be called in a finally block.
 */
export async function acquireContainerSlot(): Promise<() => void> {
  if (activeContainerSessions >= MAX_CONCURRENT_WITH_CONTAINER) {
    await new Promise<void>((resolve) => {
      containerQueue.push(resolve);
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
