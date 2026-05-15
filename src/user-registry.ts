/**
 * UserRegistry — reads system/users.json and provides a lookup-first
 * layer for getUserProfile(). Adding a user means adding a JSON entry,
 * not touching config.ts.
 */

import { existsSync, readFileSync, writeFileSync, renameSync } from "fs";
import * as fs from "fs";
import { execFile } from "child_process";
import { resolve, dirname } from "path";

export type UserRole = "owner" | "guest" | "new_guest";

export interface UserNode {
  userId: number;
  role: UserRole;
  label: string;
  timezone: string;
  settingSources: Array<"user" | "project" | "local">;
  rateLimitEnabled: boolean;
  model: string;
  /**
   * For role=guest or new_guest: absolute vault path. E.g. "/opt/vault/403360614".
   * For role=owner: omit (uses CLAUDE_WORKING_DIR env var).
   */
  vaultDir?: string;
  visionModel?: string;
  complexModel?: string;
  lightModel?: string;
  /**
   * If true, this user gets a per-user Docker sandbox container; bash
   * commands route to `docker exec` instead of running on the host.
   * Defaults: false for owner, true for guests/new_guests with containers
   * provisioned. Read at startup and on each profile lookup.
   */
  containerEnabled?: boolean;
  /** Subscription tier. Default: 'free' for guests, always 'paid' for owner. */
  tier?: 'free' | 'paid';
  /** ISO date string when paid subscription expires. */
  subscription_expires?: string;
  /** YuKassa saved payment method ID for recurring charges. */
  payment_method_id?: string;
  /** True if the user has already used their one-time trial. */
  trial_used?: boolean;
  /** ISO timestamp when the 5-day trial was activated. */
  trial_activated_at?: string;
  /** True if the day-4 trial expiry push was sent. */
  day4_push_sent?: boolean;
  /** ISO timestamp until which the user is in grace period after failed charge. */
  grace_period_until?: string;
  /** True if the "3 days until expiry" warning was sent for the current subscription period. */
  expiry_warned_3d?: boolean;
  /** True if the "1 day until expiry" warning was sent for the current subscription period. */
  expiry_warned_1d?: boolean;
  /** Флаг: downgrade уже объявлен пользователю (чтобы не дублировать). */
  downgrade_announced?: boolean;
}

const USERS_FILE = resolve(dirname(import.meta.dir), "system/users.json");

/**
 * Atomic write: write to a sibling .tmp file then rename. Prevents losing
 * users.json entries when two approves race or the process dies mid-write.
 */
function writeUsersAtomic(users: UserNode[]): void {
  const tmp = USERS_FILE + ".tmp";
  writeFileSync(tmp, JSON.stringify(users, null, 2) + "\n");
  renameSync(tmp, USERS_FILE);
}

let _cache: UserNode[] | null = null;

function load(): UserNode[] {
  if (_cache !== null) return _cache;
  try {
    if (!existsSync(USERS_FILE)) {
      _cache = [];
      return _cache;
    }
    const raw = readFileSync(USERS_FILE, "utf-8");
    _cache = JSON.parse(raw) as UserNode[];
    console.log(`UserRegistry: loaded ${_cache.length} users from system/users.json`);
  } catch (err) {
    console.warn(`UserRegistry: failed to load ${USERS_FILE}: ${err}`);
    _cache = [];
  }
  return _cache;
}

export class UserRegistry {
  /** Return the UserNode for a given userId, or null if not registered. */
  static getUser(userId: number): UserNode | null {
    const users = load();
    return users.find((u) => u.userId === userId) ?? null;
  }

  /** Return all registered users. */
  static getAllUsers(): UserNode[] {
    return load();
  }

  /** Persist a user node (insert or replace). Clears cache. */
  static saveUser(node: UserNode): void {
    const users = load();
    const idx = users.findIndex((u) => u.userId === node.userId);
    if (idx >= 0) {
      users[idx] = node;
    } else {
      users.push(node);
    }
    writeUsersAtomic(users);
    _cache = users;
  }

  /** Reload from disk (clears in-memory cache). */
  static reload(): void {
    _cache = null;
  }
}

/**
/**
 * Clean up all server-side resources for a user:
 * 1. Stop and remove their Docker container (claude-user-<id>).
 * 2. Delete their vault directory (/opt/vault/<id>/).
 * 3. Delete their Telegram temp dropbox (/tmp/telegram-bot/<id>/).
 *
 * All steps are best-effort: errors are logged but never thrown so
 * callers (deleteUser, /forget) are unaffected if e.g. the container
 * doesn't exist or /opt/vault/ is absent on a dev machine.
 */
export async function cleanupUserResources(userId: number): Promise<void> {
  const containerName = `claude-user-${userId}`;

  // 1. Stop and remove Docker container
  await new Promise<void>((resolve) => {
    execFile("docker", ["rm", "-f", containerName], (err) => {
      if (err) {
        // ENOENT means docker not installed, other errors = container didn't exist — both fine
        const msg = err.message || "";
        if (!msg.includes("No such container") && !/ENOENT/.test(msg)) {
          console.warn(`[cleanupUserResources] docker rm -f ${containerName}:`, err.message);
        }
      }
      resolve();
    });
  });

  // 2. Remove vault directory
  const vaultDir = `/opt/vault/${userId}/`;
  try {
    await fs.promises.rm(vaultDir, { recursive: true, force: true });
  } catch (err) {
    console.warn(`[cleanupUserResources] rm -rf ${vaultDir}:`, err);
  }

  // 3. Remove Telegram temp dropbox
  const dropboxDir = `/tmp/telegram-bot/${userId}/`;
  try {
    await fs.promises.rm(dropboxDir, { recursive: true, force: true });
  } catch (err) {
    console.warn(`[cleanupUserResources] rm -rf ${dropboxDir}:`, err);
  }

  console.log(`[cleanupUserResources] Cleaned up resources for user ${userId}`);
}

/**
 * Remove a user from the registry and clean up all their server-side resources.
 * Returns true if the user was found and removed, false otherwise.
 */
export async function deleteUser(userId: number): Promise<boolean> {
  const users = load();
  const idx = users.findIndex((u) => u.userId === userId);
  if (idx < 0) return false;

  users.splice(idx, 1);
  writeUsersAtomic(users);
  _cache = users;

  await cleanupUserResources(userId);
  return true;
}

/**
 * Add a new user to system/users.json.
 * If a user with the same userId already exists, merges missing fields
 * (upsert) and returns false. Returns true when a new entry is created.
 */
export async function addUser(user: UserNode): Promise<boolean> {
  const users = UserRegistry.getAllUsers();
  const existing = users.find((u) => u.userId === user.userId);
  if (existing) {
    // Fill in any fields that are missing from the existing record
    let changed = false;
    for (const key of Object.keys(user) as Array<keyof UserNode>) {
      if (existing[key] === undefined && user[key] !== undefined) {
        (existing as unknown as Record<string, unknown>)[key] = user[key];
        changed = true;
      }
    }
    if (changed) {
      UserRegistry.saveUser(existing);
    }
    return false;
  }
  users.push(user);
  writeUsersAtomic(users);
  _cache = users;
  return true;
}
