/**
 * Infrastructure warmer for free-tier users.
 *
 * When a free user is close to their daily message limit (WARM_THRESHOLD),
 * silently pre-create their vault directory. On upgrade, the container
 * starts immediately instead of waiting for directory creation.
 *
 * Fire-and-forget: never throws, never blocks the caller.
 */

import { mkdirSync, existsSync, copyFileSync } from "fs";
import { resolve, dirname } from "path";
import { getUserProfile } from "./config";
import { getTodayCount } from "./daily-limit";

const VAULT_BASE = "/opt/vault";
const WARM_THRESHOLD = 7; // out of 10 free messages — start warming at 7
const GUEST_CLAUDE_MD_TEMPLATE = resolve(
  dirname(import.meta.dir),
  "templates/guest-CLAUDE.md"
);

/**
 * Called after each successful free-tier message.
 * If user is active (count >= WARM_THRESHOLD), pre-creates their vault dir.
 * No-op for owner or paid-tier users.
 */
export async function maybeWarmInfrastructure(userId: number): Promise<void> {
  const profile = getUserProfile(userId);

  // Only warm for free-tier guests (never owner)
  if (!profile.isGuest || profile.tierConfig.tier !== "free") return;

  const count = getTodayCount(userId);
  if (count < WARM_THRESHOLD) return;

  const vaultDir = `${VAULT_BASE}/${userId}`;

  // Already exists — nothing to do
  if (existsSync(vaultDir)) return;

  try {
    mkdirSync(vaultDir, { recursive: true });

    // Copy the guest CLAUDE.md template if it exists
    if (existsSync(GUEST_CLAUDE_MD_TEMPLATE)) {
      copyFileSync(GUEST_CLAUDE_MD_TEMPLATE, `${vaultDir}/CLAUDE.md`);
    }

    console.log(`[warmer] pre-created vault for free user ${userId}`);
  } catch (err) {
    // Silent failure — warming is best-effort
    console.warn(`[warmer] failed to pre-create vault for ${userId}:`, err);
  }
}
