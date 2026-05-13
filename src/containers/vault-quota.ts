/**
 * Soft disk quota for guest vaults.
 *
 * Each guest has a 2 GB hard limit on /opt/vault/<userId>/. Before each
 * message we check `du -sb` of their vault. If exceeded, the bot rejects
 * the message with a friendly explanation instead of running into "no space
 * left on device" mid-task.
 *
 * Why not kernel quotas? ext4 on prod is mounted without prjquota; enabling
 * would require remount + tune2fs which is risky on a live server. Soft
 * quota is good enough for v1 — guests can't fill the disk maliciously
 * because container has read-only root + 128 MB tmpfs anyway.
 *
 * Performance: du on a 2 GB vault can take 1–5 s and blocks the event loop
 * when called with execFileSync. We use a background-refresh pattern:
 * - If cache is fresh (<60 s) → return immediately (no I/O).
 * - If cache is stale or absent → return stale value (or pass if none) and
 *   kick off an async refresh in the background. The caller never waits for
 *   du. This creates a one-message grace window on first call, which is
 *   acceptable (soft quota, not hard enforcement).
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import * as fs from "fs";

const execFileAsync = promisify(execFile);

const DEFAULT_VAULT_QUOTA_BYTES = 2 * 1024 * 1024 * 1024; // 2 GB

// Per-user disk quota overrides (userId → bytes). Increase when a user
// needs more vault space than the default 2 GB.
const VAULT_QUOTA_OVERRIDES: Record<number, number> = {
  946882308: 6 * 1024 * 1024 * 1024, // 6 GB (+4 GB granted 2026-05-10)
};

export function getVaultQuotaBytes(userId: number): number {
  return VAULT_QUOTA_OVERRIDES[userId] ?? DEFAULT_VAULT_QUOTA_BYTES;
}

/** @deprecated Use getVaultQuotaBytes(userId) instead */
export const VAULT_QUOTA_BYTES = DEFAULT_VAULT_QUOTA_BYTES;

interface QuotaResult {
  sizeBytes: number;
  exceeded: boolean;
  vaultPath: string;
}

// Cache size lookups for 60s — du can be slow on large vaults.
const cache = new Map<number, { result: QuotaResult; ts: number }>();
const CACHE_TTL_MS = 60_000;

// Track in-progress background refreshes to avoid concurrent du for same user.
const inProgress = new Set<number>();

export function getVaultPath(userId: number): string {
  return `/opt/vault/${userId}`;
}

/**
 * Run du in the background and update the cache when done.
 * Never throws — errors are logged and silently ignored.
 */
function scheduleRefresh(userId: number): void {
  if (inProgress.has(userId)) return;
  inProgress.add(userId);

  const vaultPath = getVaultPath(userId);

  // Check path existence asynchronously before spawning du
  fs.access(vaultPath, fs.constants.F_OK, (accessErr) => {
    if (accessErr) {
      // Vault does not exist — cache a zero result
      const result: QuotaResult = { sizeBytes: 0, exceeded: false, vaultPath };
      cache.set(userId, { result, ts: Date.now() });
      inProgress.delete(userId);
      return;
    }

    execFileAsync("du", ["-sb", vaultPath], { timeout: 10_000 })
      .then(({ stdout }) => {
        const sizeBytes = parseInt(stdout.split(/\s+/)[0] || "0", 10) || 0;
        const result: QuotaResult = {
          sizeBytes,
          exceeded: sizeBytes > getVaultQuotaBytes(userId),
          vaultPath,
        };
        cache.set(userId, { result, ts: Date.now() });
      })
      .catch((e) => {
        console.warn(`[vault-quota] background du failed for user ${userId}:`, e);
      })
      .finally(() => {
        inProgress.delete(userId);
      });
  });
}

export async function checkVaultQuota(userId: number): Promise<QuotaResult> {
  const cached = cache.get(userId);
  const now = Date.now();

  if (cached && now - cached.ts < CACHE_TTL_MS) {
    // Cache is fresh — return immediately, no I/O.
    return cached.result;
  }

  // Cache is stale or absent. Kick off a background refresh.
  scheduleRefresh(userId);

  if (cached) {
    // Return stale value rather than blocking the event loop.
    return cached.result;
  }

  // No cache at all — first call. Allow the request (pass) and let the
  // background refresh populate the cache for the next call.
  const vaultPath = getVaultPath(userId);
  return { sizeBytes: 0, exceeded: false, vaultPath };
}

export function invalidateQuotaCache(userId: number): void {
  cache.delete(userId);
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
