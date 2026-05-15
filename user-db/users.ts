/**
 * user-db/users.ts — CRUD for users.json
 * Atomic write (tmp + rename) mirroring src/user-registry.ts pattern.
 * In-memory cache — reloaded on mutation.
 */

import { existsSync, readFileSync, writeFileSync, renameSync, mkdirSync } from "fs";
import * as path from "path";

const DATA_DIR = process.env.DATA_DIR || "/opt/user-db/data";
const USERS_FILE = path.join(DATA_DIR, "users.json");

// Ensure data directory exists
try { mkdirSync(DATA_DIR, { recursive: true }); } catch (_e) { /* already exists */ }

export type UserRole = "owner" | "guest" | "new_guest";

export interface UserNode {
  userId: number;
  role: UserRole;
  label: string;
  timezone: string;
  settingSources: Array<"user" | "project" | "local">;
  rateLimitEnabled: boolean;
  model: string;
  vaultDir?: string;
  visionModel?: string;
  complexModel?: string;
  lightModel?: string;
  containerEnabled?: boolean;
  tier?: "free" | "paid";
  subscription_expires?: string;
  payment_method_id?: string;
  trial_used?: boolean;
  trial_activated_at?: string;
  day4_push_sent?: boolean;
  grace_period_until?: string;
  [key: string]: unknown;
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
  } catch (err) {
    console.warn(`[user-db/users] failed to load ${USERS_FILE}:`, err);
    _cache = [];
  }
  return _cache;
}

function writeAtomic(users: UserNode[]): void {
  const tmp = USERS_FILE + ".tmp";
  writeFileSync(tmp, JSON.stringify(users, null, 2) + "\n");
  renameSync(tmp, USERS_FILE);
}

export function getAllUsers(): UserNode[] {
  return load();
}

export function getUser(userId: number): UserNode | null {
  return load().find((u) => u.userId === userId) ?? null;
}

export function saveUser(node: UserNode): UserNode {
  const users = load();
  const idx = users.findIndex((u) => u.userId === node.userId);
  if (idx >= 0) {
    users[idx] = node;
  } else {
    users.push(node);
  }
  writeAtomic(users);
  _cache = users;
  return node;
}

/** Patch (partial update) — merges fields into existing record. Returns null if not found. */
export function patchUser(userId: number, patch: Partial<UserNode>): UserNode | null {
  const users = load();
  const idx = users.findIndex((u) => u.userId === userId);
  if (idx < 0) return null;
  const merged = { ...users[idx]!, ...patch };
  users[idx] = merged;
  writeAtomic(users);
  _cache = users;
  return merged;
}

export function deleteUser(userId: number): boolean {
  const users = load();
  const idx = users.findIndex((u) => u.userId === userId);
  if (idx < 0) return false;
  users.splice(idx, 1);
  writeAtomic(users);
  _cache = users;
  return true;
}
