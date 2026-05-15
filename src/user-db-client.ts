/**
 * src/user-db-client.ts — HTTP client for the user-db microservice.
 *
 * Exports the same interface as user-registry + metering + consent so that
 * callers need minimal changes. When USER_DB_URL is not set, falls back to
 * the local implementations transparently.
 *
 * Features:
 * - In-memory cache for users and consent (TTL 5 min).
 * - Metering write queue: if HTTP fails, records are buffered and retried
 *   with exponential backoff (1s → 2s → 4s → 8s → … cap 60s).
 * - After reconnection the queue is drained synchronously before new records.
 */

import type { UserNode } from "./user-registry.ts";
import type { UsageRecord, UserTotals, AllUserTotals } from "./metering.ts";

// ---- Local fallback imports (direct fs/SQLite path) ----
import { UserRegistry as _LocalRegistry } from "./user-registry.ts";
import * as _localMetering from "./metering.ts";
import * as _localConsent from "./consent.ts";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export const USER_DB_URL = (process.env.USER_DB_URL || "").replace(/\/$/, "");
export const USER_DB_TOKEN = process.env.USER_DB_TOKEN || "";
export const USER_DB_ENABLED = !!USER_DB_URL;

// ---------------------------------------------------------------------------
// HTTP helper
// ---------------------------------------------------------------------------

async function dbFetch(
  path: string,
  init: RequestInit = {}
): Promise<Response> {
  const url = `${USER_DB_URL}${path}`;
  const headers: Record<string, string> = {
    "X-Internal-Token": USER_DB_TOKEN,
    ...(init.body ? { "Content-Type": "application/json" } : {}),
    ...(init.headers as Record<string, string> | undefined ?? {}),
  };
  return fetch(url, { ...init, headers });
}

// ---------------------------------------------------------------------------
// In-memory cache (users)
// ---------------------------------------------------------------------------

const USER_CACHE_TTL_MS = 5 * 60 * 1000; // 5 min

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const _userCache = new Map<number, CacheEntry<UserNode | null>>();
let _allUsersCache: CacheEntry<UserNode[]> | null = null;

function userCacheGet(userId: number): UserNode | null | undefined {
  const entry = _userCache.get(userId);
  if (!entry || Date.now() > entry.expiresAt) return undefined;
  return entry.value;
}

function userCacheSet(userId: number, user: UserNode | null): void {
  _userCache.set(userId, { value: user, expiresAt: Date.now() + USER_CACHE_TTL_MS });
}

function userCacheInvalidate(userId: number): void {
  _userCache.delete(userId);
  _allUsersCache = null;
}

// ---------------------------------------------------------------------------
// In-memory cache (consent)
// ---------------------------------------------------------------------------

interface ConsentCacheEntry {
  hasConsent: boolean;
  version?: string;
  ts?: number;
  expiresAt: number;
}

const _consentCache = new Map<number, ConsentCacheEntry>();

function consentCacheGet(userId: number): ConsentCacheEntry | undefined {
  const entry = _consentCache.get(userId);
  if (!entry || Date.now() > entry.expiresAt) return undefined;
  return entry;
}

function consentCacheSet(userId: number, data: Omit<ConsentCacheEntry, "expiresAt">): void {
  _consentCache.set(userId, { ...data, expiresAt: Date.now() + USER_CACHE_TTL_MS });
}

function consentCacheInvalidate(userId: number): void {
  _consentCache.delete(userId);
}

// ---------------------------------------------------------------------------
// Metering write queue with exponential backoff retry
// ---------------------------------------------------------------------------

interface QueuedRecord {
  rec: UsageRecord;
  attempt: number;
}

const _meteringQueue: QueuedRecord[] = [];
let _retryTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleRetry(delayMs: number): void {
  if (_retryTimer !== null) return;
  _retryTimer = setTimeout(async () => {
    _retryTimer = null;
    await drainMeteringQueue();
  }, delayMs);
}

async function drainMeteringQueue(): Promise<void> {
  while (_meteringQueue.length > 0) {
    const item = _meteringQueue[0]!;
    const ok = await sendMeteringRecord(item.rec);
    if (!ok) {
      // Exponential backoff: 1s, 2s, 4s, 8s … cap 60s
      const delay = Math.min(1000 * Math.pow(2, item.attempt), 60_000);
      item.attempt++;
      scheduleRetry(delay);
      return; // stop draining, retry later
    }
    _meteringQueue.shift(); // success
  }
}

async function sendMeteringRecord(rec: UsageRecord): Promise<boolean> {
  try {
    const res = await dbFetch("/metering/record", {
      method: "POST",
      body: JSON.stringify(rec),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// User API
// ---------------------------------------------------------------------------

export async function getUser(userId: number): Promise<UserNode | null> {
  if (!USER_DB_ENABLED) return _LocalRegistry.getUser(userId);

  const cached = userCacheGet(userId);
  if (cached !== undefined) return cached;

  try {
    const res = await dbFetch(`/users/${userId}`);
    if (res.status === 404) { userCacheSet(userId, null); return null; }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json() as { user: UserNode };
    userCacheSet(userId, data.user);
    return data.user;
  } catch (e) {
    console.warn("[user-db-client] getUser failed, using local fallback:", e);
    return _LocalRegistry.getUser(userId);
  }
}

export async function getAllUsers(): Promise<UserNode[]> {
  if (!USER_DB_ENABLED) return _LocalRegistry.getAllUsers();

  if (_allUsersCache && Date.now() < _allUsersCache.expiresAt) return _allUsersCache.value;

  try {
    const res = await dbFetch("/users");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json() as { users: UserNode[] };
    _allUsersCache = { value: data.users, expiresAt: Date.now() + USER_CACHE_TTL_MS };
    return data.users;
  } catch (e) {
    console.warn("[user-db-client] getAllUsers failed, using local fallback:", e);
    return _LocalRegistry.getAllUsers();
  }
}

export async function saveUser(user: UserNode): Promise<void> {
  if (!USER_DB_ENABLED) { _LocalRegistry.saveUser(user); return; }

  userCacheInvalidate(user.userId);
  try {
    // Try PUT first (update), fall back to POST (create)
    const putRes = await dbFetch(`/users/${user.userId}`, {
      method: "PUT",
      body: JSON.stringify(user),
    });
    if (putRes.status === 404) {
      // User doesn't exist yet — create
      await dbFetch("/users", { method: "POST", body: JSON.stringify(user) });
    } else if (!putRes.ok) {
      throw new Error(`HTTP ${putRes.status}`);
    }
    userCacheSet(user.userId, user);
  } catch (e) {
    console.warn("[user-db-client] saveUser failed, falling back to local:", e);
    _LocalRegistry.saveUser(user);
  }
}

export async function deleteUserRemote(userId: number): Promise<boolean> {
  if (!USER_DB_ENABLED) return false;
  userCacheInvalidate(userId);
  try {
    const res = await dbFetch(`/users/${userId}`, { method: "DELETE" });
    return res.status === 204 || res.ok;
  } catch (e) {
    console.warn("[user-db-client] deleteUser failed:", e);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Metering API
// ---------------------------------------------------------------------------

export function recordUsageRemote(rec: UsageRecord): void {
  if (!USER_DB_ENABLED) { _localMetering.recordUsage(rec); return; }

  // Push to queue and try to drain
  _meteringQueue.push({ rec, attempt: 0 });
  // Fire-and-forget drain
  drainMeteringQueue().catch(() => {});
}

export async function getUserTotalsRemote(
  userId: string | number,
  sinceTs?: number
): Promise<UserTotals> {
  if (!USER_DB_ENABLED) return _localMetering.getUserTotals(userId, sinceTs);

  try {
    const qs = sinceTs ? `?sinceTs=${sinceTs}` : "";
    const res = await dbFetch(`/metering/${userId}${qs}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json() as { totals: UserTotals };
    return data.totals;
  } catch (e) {
    console.warn("[user-db-client] getUserTotals failed, local fallback:", e);
    return _localMetering.getUserTotals(userId, sinceTs);
  }
}

export async function getAllUsersTotalsRemote(): Promise<AllUserTotals[]> {
  if (!USER_DB_ENABLED) return _localMetering.getAllUsersTotals();

  try {
    const res = await dbFetch("/metering/all");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json() as { byUser: AllUserTotals[] };
    return data.byUser;
  } catch (e) {
    console.warn("[user-db-client] getAllUsersTotals failed, local fallback:", e);
    return _localMetering.getAllUsersTotals();
  }
}

// ---------------------------------------------------------------------------
// Vision daily limit API
// ---------------------------------------------------------------------------

export async function getVisionUsageTodayRemote(userId: number | string): Promise<number> {
  if (!USER_DB_ENABLED) return _localMetering.getVisionUsageToday(userId);

  try {
    const res = await dbFetch(`/vision/today/${userId}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json() as { count: number };
    return data.count;
  } catch (e) {
    console.warn("[user-db-client] getVisionUsageToday failed, local fallback:", e);
    return _localMetering.getVisionUsageToday(userId);
  }
}

export function incrementVisionUsageRemote(userId: number | string): void {
  if (!USER_DB_ENABLED) { _localMetering.incrementVisionUsage(userId); return; }

  dbFetch("/vision/increment", {
    method: "POST",
    body: JSON.stringify({ userId }),
  }).catch((e) => {
    console.warn("[user-db-client] incrementVisionUsage failed:", e);
    _localMetering.incrementVisionUsage(userId);
  });
}

// ---------------------------------------------------------------------------
// Consent API
// ---------------------------------------------------------------------------

export async function hasConsentedRemote(userId: number, docVersion: string): Promise<boolean> {
  if (!USER_DB_ENABLED) return _localConsent.hasConsented(userId);

  const cached = consentCacheGet(userId);
  if (cached !== undefined) return cached.hasConsent && cached.version === docVersion;

  try {
    const res = await dbFetch(`/consent/${userId}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json() as { hasConsent: boolean; version?: string; ts?: number };
    consentCacheSet(userId, { hasConsent: data.hasConsent, version: data.version, ts: data.ts });
    return data.hasConsent && data.version === docVersion;
  } catch (e) {
    console.warn("[user-db-client] hasConsented failed, local fallback:", e);
    return _localConsent.hasConsented(userId);
  }
}

export async function recordConsentRemote(userId: number, docVersion: string, source = "telegram_button"): Promise<void> {
  if (!USER_DB_ENABLED) { _localConsent.recordConsent(userId, source); return; }

  consentCacheInvalidate(userId);
  try {
    await dbFetch(`/consent/${userId}`, {
      method: "POST",
      body: JSON.stringify({ version: docVersion }),
    });
    consentCacheSet(userId, { hasConsent: true, version: docVersion, ts: Date.now() });
  } catch (e) {
    console.warn("[user-db-client] recordConsent failed, local fallback:", e);
    _localConsent.recordConsent(userId, source);
  }
}

export async function revokeConsentRemote(userId: number): Promise<void> {
  if (!USER_DB_ENABLED) { _localConsent.revokeConsent(userId); return; }

  consentCacheInvalidate(userId);
  try {
    await dbFetch(`/consent/${userId}`, { method: "DELETE" });
  } catch (e) {
    console.warn("[user-db-client] revokeConsent failed, local fallback:", e);
    _localConsent.revokeConsent(userId);
  }
}

export async function getConsentInfoRemote(
  userId: number
): Promise<{ version: string; acceptedAt: number } | null> {
  if (!USER_DB_ENABLED) return _localConsent.getConsentInfo(userId);

  try {
    const res = await dbFetch(`/consent/${userId}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json() as { hasConsent: boolean; version?: string; ts?: number };
    if (!data.hasConsent || !data.version) return null;
    return { version: data.version, acceptedAt: data.ts ?? 0 };
  } catch (e) {
    console.warn("[user-db-client] getConsentInfo failed, local fallback:", e);
    return _localConsent.getConsentInfo(userId);
  }
}
