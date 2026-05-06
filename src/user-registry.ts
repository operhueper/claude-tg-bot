/**
 * UserRegistry — reads system/users.json and provides a lookup-first
 * layer for getUserProfile(). Adding a user means adding a JSON entry,
 * not touching config.ts.
 */

import { existsSync, readFileSync, writeFileSync } from "fs";
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
   * For role=guest: relative name under GUEST_WORKING_DIR parent dir,
   * or an absolute path. E.g. "workspace-ksenia" or "/opt/vault/893951298".
   * For role=new_guest: absolute vault path. E.g. "/opt/vault/403360614".
   * For role=owner: omit (uses CLAUDE_WORKING_DIR env var).
   */
  vaultDir?: string;
  visionModel?: string;
  complexModel?: string;
  lightModel?: string;
}

const USERS_FILE = resolve(dirname(import.meta.dir), "system/users.json");

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
    writeFileSync(USERS_FILE, JSON.stringify(users, null, 2) + "\n");
    _cache = users;
  }

  /** Reload from disk (clears in-memory cache). */
  static reload(): void {
    _cache = null;
  }
}
