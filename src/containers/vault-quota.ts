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
 */

import { execFileSync } from "node:child_process";
import * as fs from "fs";

export const VAULT_QUOTA_BYTES = 2 * 1024 * 1024 * 1024; // 2 GB

interface QuotaResult {
  sizeBytes: number;
  exceeded: boolean;
  vaultPath: string;
}

// Cache size lookups for 60s — du can be slow on large vaults.
const cache = new Map<number, { result: QuotaResult; ts: number }>();
const CACHE_TTL_MS = 60_000;

export function getVaultPath(userId: number): string {
  return `/opt/vault/${userId}`;
}

export function checkVaultQuota(userId: number): QuotaResult {
  const cached = cache.get(userId);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return cached.result;
  }

  const vaultPath = getVaultPath(userId);
  if (!fs.existsSync(vaultPath)) {
    const result = { sizeBytes: 0, exceeded: false, vaultPath };
    cache.set(userId, { result, ts: Date.now() });
    return result;
  }

  let sizeBytes = 0;
  try {
    const out = execFileSync("du", ["-sb", vaultPath], {
      encoding: "utf8",
      timeout: 5000,
    });
    sizeBytes = parseInt(out.split(/\s+/)[0] || "0", 10) || 0;
  } catch (e) {
    console.warn(`[vault-quota] du failed for user ${userId}:`, e);
  }

  const result: QuotaResult = {
    sizeBytes,
    exceeded: sizeBytes > VAULT_QUOTA_BYTES,
    vaultPath,
  };
  cache.set(userId, { result, ts: Date.now() });
  return result;
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
