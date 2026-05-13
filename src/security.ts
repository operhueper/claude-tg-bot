/**
 * Security module for Claude Telegram Bot.
 *
 * Rate limiting, path validation, command safety. All path/command checks accept
 * an explicit `allowedPaths` argument to support per-user (owner vs guest) policies.
 */

import { resolve, normalize } from "path";
import { realpathSync } from "fs";
import type { RateLimitBucket } from "./types";
import {
  ALLOWED_PATHS as DEFAULT_ALLOWED_PATHS,
  BLOCKED_PATTERNS,
  TEMP_PATHS,
  getUserProfile,
} from "./config";

// ============== Rate Limiter (per-user, per-profile) ==============

class RateLimiter {
  private buckets = new Map<number, RateLimitBucket>();

  check(userId: number): [allowed: boolean, retryAfter?: number] {
    const profile = getUserProfile(userId);
    if (!profile.rateLimitEnabled) {
      return [true];
    }

    const maxTokens = profile.rateLimitRequests;
    const refillRate = profile.rateLimitRequests / profile.rateLimitWindow;

    const now = Date.now();
    let bucket = this.buckets.get(userId);

    if (!bucket) {
      bucket = { tokens: maxTokens, lastUpdate: now };
      this.buckets.set(userId, bucket);
    }

    const elapsed = (now - bucket.lastUpdate) / 1000;
    bucket.tokens = Math.min(maxTokens, bucket.tokens + elapsed * refillRate);
    bucket.lastUpdate = now;

    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      return [true];
    }

    const retryAfter = (1 - bucket.tokens) / refillRate;
    return [false, retryAfter];
  }

  getStatus(userId: number): {
    tokens: number;
    max: number;
    refillRate: number;
  } {
    const profile = getUserProfile(userId);
    const bucket = this.buckets.get(userId);
    return {
      tokens: bucket?.tokens ?? profile.rateLimitRequests,
      max: profile.rateLimitRequests,
      refillRate: profile.rateLimitRequests / profile.rateLimitWindow,
    };
  }
}

export const rateLimiter = new RateLimiter();

// ============== Path Validation ==============

/**
 * Check whether a filesystem path is allowed under a specific allowlist.
 * Always permits TEMP_PATHS (bot-internal scratch space).
 */
export function isPathAllowedFor(path: string, allowedPaths: string[]): boolean {
  try {
    const expanded = path.replace(/^~/, process.env.HOME || "");
    const normalized = normalize(expanded);

    let resolved: string;
    try {
      resolved = realpathSync(normalized);
    } catch {
      resolved = resolve(normalized);
    }

    for (const tempPath of TEMP_PATHS) {
      if (!tempPath.endsWith("/")) {
        throw new Error(`TEMP_PATHS entry must end with /: ${tempPath}`);
      }
      if (resolved.startsWith(tempPath)) {
        return true;
      }
    }

    for (const allowed of allowedPaths) {
      const allowedResolved = resolve(allowed);
      if (
        resolved === allowedResolved ||
        resolved.startsWith(allowedResolved + "/")
      ) {
        return true;
      }
    }

    return false;
  } catch {
    return false;
  }
}

/**
 * Backwards-compatible wrapper that uses the owner's allowed paths.
 * Prefer isPathAllowedFor with an explicit allowlist for new code.
 */
export function isPathAllowed(path: string): boolean {
  return isPathAllowedFor(path, DEFAULT_ALLOWED_PATHS);
}

// ============== Command Safety ==============

export function checkCommandSafety(
  command: string,
  allowedPaths: string[] = DEFAULT_ALLOWED_PATHS
): [safe: boolean, reason: string] {
  const lowerCommand = command.toLowerCase();

  for (const pattern of BLOCKED_PATTERNS) {
    if (lowerCommand.includes(pattern.toLowerCase())) {
      return [false, `Blocked pattern: ${pattern}`];
    }
  }

  if (lowerCommand.includes("rm ")) {
    try {
      const rmMatch = command.match(/rm\s+(.+)/i);
      if (rmMatch) {
        const args = rmMatch[1]!.split(/\s+/);
        for (const arg of args) {
          if (arg.startsWith("-") || arg.length <= 1) continue;
          // Skip non-path arguments: must start with /, ~, or . to be considered a path
          if (!arg.startsWith("/") && !arg.startsWith("~") && !arg.startsWith(".")) continue;
          if (!isPathAllowedFor(arg, allowedPaths)) {
            return [false, `rm target outside allowed paths: ${arg}`];
          }
        }
      }
    } catch {
      return [false, "Could not parse rm command for safety check"];
    }
  }

  return [true, ""];
}

// ============== Container Command Safety ==============

/**
 * Patterns that are dangerous inside a guest Docker container.
 * Unlike BLOCKED_PATTERNS (host-level), these focus on resource-exhaustion
 * and device-level destruction that bypass container resource limits.
 */
export const BLOCKED_PATTERNS_CONTAINER: RegExp[] = [
  // fork-bomb in its canonical form and common variants
  /:\s*\(\s*\)\s*\{[^}]*:\s*\|\s*:\s*&\s*\}\s*;\s*:/,
  // dd writing from entropy/zero sources (disk fill / device wipe)
  /\bdd\s+if=\/dev\/(zero|urandom|random|null)\b/i,
  // filesystem formatting
  /\bmkfs(\.\w+)?\b/i,
  // partition table manipulation
  /\b(fdisk|parted|sfdisk|gdisk)\b/i,
  // swap manipulation (can lock up the container)
  /\bswap(on|off)\b/i,
];

/**
 * Check whether a shell command is safe to run inside a guest container.
 * Returns `{ safe: false, reason }` if blocked, `{ safe: true }` otherwise.
 */
export function checkContainerCommandSafety(
  cmd: string
): { safe: boolean; reason?: string } {
  for (const pattern of BLOCKED_PATTERNS_CONTAINER) {
    if (pattern.test(cmd)) {
      return { safe: false, reason: `Blocked pattern: ${pattern.source}` };
    }
  }
  return { safe: true };
}

// ============== Authorization ==============

export function isAuthorized(
  userId: number | undefined,
  allowedUsers: number[]
): boolean {
  if (!userId) return false;
  if (allowedUsers.length === 0) return false;
  return allowedUsers.includes(userId);
}
