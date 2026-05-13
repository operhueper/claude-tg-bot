/**
 * Security module for Claude Telegram Bot.
 *
 * Rate limiting, path validation, command safety. All path/command checks accept
 * an explicit `allowedPaths` argument to support per-user (owner vs guest) policies.
 */

import { resolve, normalize } from "path";
import { realpathSync } from "fs";
import { parse as shellParse } from "shell-quote";
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

/** Dangerous shell constructs to block regardless of token-level parsing. */
const RAW_COMMAND_PATTERNS: RegExp[] = [
  /\$\(/, // command substitution $(...)
  /`/, // backtick substitution
  /<\(/, // process substitution <(...)
  />>\(/, // process substitution >(...)
];

/** Shell built-ins that execute arbitrary code and must always be blocked. */
const DANGEROUS_BUILTINS = new Set(["eval", "exec", "source", "."]);

export function checkCommandSafety(
  command: string,
  allowedPaths: string[] = DEFAULT_ALLOWED_PATHS
): [safe: boolean, reason: string] {
  // 1. Raw-string canary: block shell injection constructs before tokenising
  for (const re of RAW_COMMAND_PATTERNS) {
    if (re.test(command)) {
      return [false, `Blocked shell construct: ${re.source}`];
    }
  }

  // 2. Legacy substring canary (secondary gate, kept for defence-in-depth)
  const lowerCommand = command.toLowerCase();
  for (const pattern of BLOCKED_PATTERNS) {
    if (lowerCommand.includes(pattern.toLowerCase())) {
      return [false, `Blocked pattern: ${pattern}`];
    }
  }

  // 3. Token-level analysis via shell-quote
  let tokens: string[];
  try {
    const parsed = shellParse(command);
    // shell-quote returns strings, ops ({op: '|'}, etc.), and glob objects.
    // Keep only string tokens; non-string entries indicate piping/redirection.
    tokens = parsed.filter((t): t is string => typeof t === "string");
  } catch {
    return [false, "Could not tokenise command for safety check"];
  }

  const firstBin = tokens[0]?.toLowerCase() ?? "";

  // 4. Block dangerous built-ins as first token (eval, exec, source, .)
  if (DANGEROUS_BUILTINS.has(firstBin)) {
    return [false, `Blocked dangerous built-in: ${firstBin}`];
  }

  // 5. Token-level BLOCKED_PATTERNS check (catches 'r''m' → reconstructed by shell-quote)
  for (const token of tokens) {
    const lowerToken = token.toLowerCase();
    for (const pattern of BLOCKED_PATTERNS) {
      if (lowerToken.includes(pattern.toLowerCase())) {
        return [false, `Blocked token: ${token}`];
      }
    }
  }

  // 6. rm path validation (HIGH-06)
  if (firstBin === "rm") {
    // Tokens after the binary; skip flags and "--"
    const pathTokens = tokens.slice(1).filter(t => t !== "--" && !t.startsWith("-"));
    for (const arg of pathTokens) {
      // Reject env-var expansion (unresolvable at check time)
      if (arg.includes("$")) {
        return [false, `rm target contains shell variable (unresolvable): ${arg}`];
      }
      // Reject glob patterns (expansion unpredictable)
      if (/[*?[]/.test(arg)) {
        return [false, `rm target contains glob pattern (unsafe): ${arg}`];
      }
      // Only validate path-like arguments (starting with /, ~, or .)
      if (!arg.startsWith("/") && !arg.startsWith("~") && !arg.startsWith(".")) continue;
      if (!isPathAllowedFor(arg, allowedPaths)) {
        return [false, `rm target outside allowed paths: ${arg}`];
      }
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
