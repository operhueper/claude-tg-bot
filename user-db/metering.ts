/**
 * user-db/metering.ts — SQLite-backed token usage accounting.
 * Contains ALL logic from src/metering.ts: schema, ts-migration, pricing,
 * recordUsage, getUserTotals, getAllUsersTotals, vision_daily helpers,
 * daily_counts helpers, payment deduplication.
 *
 * Timestamps are stored in milliseconds (Date.now()).
 * Idempotent migration converts legacy second-timestamps on first run.
 */

import { Database } from "bun:sqlite";
import * as path from "path";
import { mkdirSync } from "fs";

const DATA_DIR = process.env.DATA_DIR || "/opt/user-db/data";
const dbPath = process.env.METERING_DB_PATH || path.join(DATA_DIR, "metering.sqlite");

// Ensure the data directory exists before opening the DB
try { mkdirSync(DATA_DIR, { recursive: true }); } catch (_e) { /* already exists */ }

// ---------------------------------------------------------------------------
// Database init
// ---------------------------------------------------------------------------

let db: Database;
try {
  db = new Database(dbPath, { create: true });
  db.exec(`
    PRAGMA journal_mode=WAL;
    PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS usage (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      source TEXT NOT NULL,
      model TEXT NOT NULL,
      input_tokens INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0,
      cache_read_tokens INTEGER NOT NULL DEFAULT 0,
      cache_creation_tokens INTEGER NOT NULL DEFAULT 0,
      cost_usd REAL NOT NULL DEFAULT 0,
      ts INTEGER NOT NULL,
      request_id TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_usage_user ON usage(user_id);
    CREATE INDEX IF NOT EXISTS idx_usage_ts ON usage(ts);
    CREATE TABLE IF NOT EXISTS daily_counts (
      user_id TEXT NOT NULL,
      date TEXT NOT NULL,
      msg_count INTEGER NOT NULL DEFAULT 0,
      doc_count INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (user_id, date)
    );
    CREATE TABLE IF NOT EXISTS processed_payments (
      payment_id TEXT NOT NULL,
      event TEXT NOT NULL,
      user_id INTEGER,
      processed_at INTEGER NOT NULL,
      PRIMARY KEY (payment_id, event)
    );
    CREATE TABLE IF NOT EXISTS vision_daily (
      user_id TEXT NOT NULL,
      day TEXT NOT NULL,
      count INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (user_id, day)
    );
    CREATE TABLE IF NOT EXISTS consents (
      user_id TEXT PRIMARY KEY,
      doc_version TEXT NOT NULL,
      accepted_at INTEGER NOT NULL,
      source TEXT NOT NULL DEFAULT 'telegram_button'
    );
    CREATE INDEX IF NOT EXISTS idx_consents_version ON consents(doc_version);
  `);

  // Idempotent migration: add request_id column
  try { db.exec("ALTER TABLE usage ADD COLUMN request_id TEXT"); } catch (_e) { /* exists */ }

  // Idempotent migration: unique index for deduplication on retry
  try {
    db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_usage_req ON usage(user_id, request_id, model)");
  } catch (_e) { /* exists */ }

  // Idempotent migration: convert unix-seconds timestamps to milliseconds.
  // Threshold 10_000_000_000: in seconds = year ~2286; in ms = year ~2001.
  // Real ms values are above this, so second-timestamps get multiplied once.
  try {
    db.exec("UPDATE usage SET ts = ts * 1000 WHERE ts < 10000000000");
  } catch (_e) {
    console.error("[user-db/metering] ts migration failed:", _e);
  }
} catch (e) {
  console.error("[user-db/metering] Failed to open database:", e);
  db = null as unknown as Database;
}

// ---------------------------------------------------------------------------
// Pricing table (USD per 1M tokens)
// ---------------------------------------------------------------------------

interface ModelPricing {
  input: number;
  output: number;
  cacheRead?: number;
  cacheCreation?: number;
}

const PRICING_PER_1M: Record<string, ModelPricing> = {
  "claude-sonnet-4-6": { input: 3.0, output: 15.0, cacheRead: 0.3, cacheCreation: 3.75 },
  "claude-opus-4-7": { input: 15.0, output: 75.0 },
  "claude-opus-4-5": { input: 15.0, output: 75.0 },
  "claude-haiku-3-5": { input: 0.8, output: 4.0 },
  "deepseek-chat": { input: 0.14, output: 0.28 },
  "deepseek-reasoner": { input: 0.55, output: 2.19 },
  "deepseek/deepseek-v4-flash": { input: 0.07, output: 0.28 },
  "deepseek/deepseek-r1": { input: 0.55, output: 2.19 },
  "deepseek/deepseek-chat": { input: 0.14, output: 0.28 },
  "google/gemini-2.5-flash": { input: 0.075, output: 0.30 },
  "gemini-2.5-flash": { input: 0.075, output: 0.30 },
  "whisper-1": { input: 0, output: 0 },
};

function computeCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
  cacheReadTokens: number,
  cacheCreationTokens: number
): number {
  const p = PRICING_PER_1M[model];
  if (!p) return 0;
  return (
    (inputTokens * p.input) / 1_000_000 +
    (outputTokens * p.output) / 1_000_000 +
    (cacheReadTokens * (p.cacheRead ?? 0)) / 1_000_000 +
    (cacheCreationTokens * (p.cacheCreation ?? 0)) / 1_000_000
  );
}

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type UsageSource =
  | "bot-anthropic"
  | "bot-deepseek"
  | "bot-openrouter"
  | "bot-openai-whisper"
  | "open-design";

export interface UsageRecord {
  userId: number | string;
  source: UsageSource;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheCreationTokens?: number;
  requestId?: string;
}

export interface UserTotals {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  costUsd: number;
}

export interface AllUserTotals extends UserTotals {
  userId: string;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function recordUsage(rec: UsageRecord): void {
  if (!db) return;
  try {
    const cacheRead = rec.cacheReadTokens ?? 0;
    const cacheCreation = rec.cacheCreationTokens ?? 0;
    const cost = computeCost(rec.model, rec.inputTokens, rec.outputTokens, cacheRead, cacheCreation);
    if (rec.requestId) {
      db.run(
        `INSERT OR REPLACE INTO usage
           (user_id, source, model, input_tokens, output_tokens,
            cache_read_tokens, cache_creation_tokens, cost_usd, ts, request_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [String(rec.userId), rec.source, rec.model, rec.inputTokens, rec.outputTokens,
          cacheRead, cacheCreation, cost, Date.now(), rec.requestId]
      );
    } else {
      db.run(
        `INSERT INTO usage
           (user_id, source, model, input_tokens, output_tokens,
            cache_read_tokens, cache_creation_tokens, cost_usd, ts)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [String(rec.userId), rec.source, rec.model, rec.inputTokens, rec.outputTokens,
          cacheRead, cacheCreation, cost, Date.now()]
      );
    }
  } catch (e) {
    console.error("[user-db/metering] recordUsage failed:", e);
  }
}

export function moscowDayStartUtcMs(): number {
  const offsetSec = 3 * 3600;
  const nowSec = Math.floor(Date.now() / 1000);
  const localSec = nowSec + offsetSec;
  const dayStartLocal = Math.floor(localSec / 86400) * 86400;
  return (dayStartLocal - offsetSec) * 1000;
}

export function getUserTotals(userId: string | number, sinceTs?: number): UserTotals {
  if (!db) return { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0, costUsd: 0 };
  try {
    const sql = sinceTs
      ? `SELECT COALESCE(SUM(input_tokens),0) AS input_tokens,
                COALESCE(SUM(output_tokens),0) AS output_tokens,
                COALESCE(SUM(cache_read_tokens),0) AS cache_read_tokens,
                COALESCE(SUM(cache_creation_tokens),0) AS cache_creation_tokens,
                COALESCE(SUM(cost_usd),0) AS cost_usd
         FROM usage WHERE user_id=? AND ts>=?`
      : `SELECT COALESCE(SUM(input_tokens),0) AS input_tokens,
                COALESCE(SUM(output_tokens),0) AS output_tokens,
                COALESCE(SUM(cache_read_tokens),0) AS cache_read_tokens,
                COALESCE(SUM(cache_creation_tokens),0) AS cache_creation_tokens,
                COALESCE(SUM(cost_usd),0) AS cost_usd
         FROM usage WHERE user_id=?`;
    const params: (string | number)[] = sinceTs ? [String(userId), sinceTs] : [String(userId)];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = db.query<any, any>(sql).get(...params);
    if (!row) return { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0, costUsd: 0 };
    return {
      inputTokens: row.input_tokens,
      outputTokens: row.output_tokens,
      cacheReadTokens: row.cache_read_tokens,
      cacheCreationTokens: row.cache_creation_tokens,
      costUsd: row.cost_usd,
    };
  } catch (e) {
    console.error("[user-db/metering] getUserTotals failed:", e);
    return { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0, costUsd: 0 };
  }
}

export function getAllUsersTotals(): AllUserTotals[] {
  if (!db) return [];
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return db.query<any, []>(
      `SELECT user_id,
              COALESCE(SUM(input_tokens),0) AS input_tokens,
              COALESCE(SUM(output_tokens),0) AS output_tokens,
              COALESCE(SUM(cache_read_tokens),0) AS cache_read_tokens,
              COALESCE(SUM(cache_creation_tokens),0) AS cache_creation_tokens,
              COALESCE(SUM(cost_usd),0) AS cost_usd
       FROM usage GROUP BY user_id ORDER BY cost_usd DESC`
    ).all().map((r) => ({
      userId: r.user_id,
      inputTokens: r.input_tokens,
      outputTokens: r.output_tokens,
      cacheReadTokens: r.cache_read_tokens,
      cacheCreationTokens: r.cache_creation_tokens,
      costUsd: r.cost_usd,
    }));
  } catch (e) {
    console.error("[user-db/metering] getAllUsersTotals failed:", e);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Vision daily limit (V-36)
// ---------------------------------------------------------------------------

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

export function getVisionUsageToday(userId: number | string): number {
  if (!db) return 0;
  try {
    const row = db
      .query<{ count: number }, [string, string]>(
        "SELECT count FROM vision_daily WHERE user_id=? AND day=?"
      )
      .get(String(userId), todayUtc());
    return row?.count ?? 0;
  } catch (e) {
    console.error("[user-db/metering] getVisionUsageToday failed:", e);
    return 0;
  }
}

export function incrementVisionUsage(userId: number | string): void {
  if (!db) return;
  try {
    db.run(
      `INSERT INTO vision_daily (user_id, day, count) VALUES (?, ?, 1)
       ON CONFLICT(user_id, day) DO UPDATE SET count = count + 1`,
      [String(userId), todayUtc()]
    );
  } catch (e) {
    console.error("[user-db/metering] incrementVisionUsage failed:", e);
  }
}

// ---------------------------------------------------------------------------
// Daily counts helpers
// ---------------------------------------------------------------------------

function todayMsk(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Moscow" });
}

export function getMsgCountToday(userId: number): number {
  if (!db) return 0;
  try {
    const row = db
      .query<{ msg_count: number }, [string, string]>(
        "SELECT msg_count FROM daily_counts WHERE user_id=? AND date=?"
      )
      .get(String(userId), todayMsk());
    return row?.msg_count ?? 0;
  } catch (e) {
    console.error("[user-db/metering] getMsgCountToday failed:", e);
    return 0;
  }
}

export function incrementMsgCount(userId: number): void {
  if (!db) return;
  try {
    db.run(
      `INSERT INTO daily_counts (user_id, date, msg_count) VALUES (?, ?, 1)
       ON CONFLICT(user_id, date) DO UPDATE SET msg_count = msg_count + 1`,
      [String(userId), todayMsk()]
    );
  } catch (e) {
    console.error("[user-db/metering] incrementMsgCount failed:", e);
  }
}

export function getDocCountToday(userId: number): number {
  if (!db) return 0;
  try {
    const row = db
      .query<{ doc_count: number }, [string, string]>(
        "SELECT doc_count FROM daily_counts WHERE user_id=? AND date=?"
      )
      .get(String(userId), todayMsk());
    return row?.doc_count ?? 0;
  } catch (e) {
    console.error("[user-db/metering] getDocCountToday failed:", e);
    return 0;
  }
}

export function incrementDocCount(userId: number): void {
  if (!db) return;
  try {
    db.run(
      `INSERT INTO daily_counts (user_id, date, doc_count) VALUES (?, ?, 1)
       ON CONFLICT(user_id, date) DO UPDATE SET doc_count = doc_count + 1`,
      [String(userId), todayMsk()]
    );
  } catch (e) {
    console.error("[user-db/metering] incrementDocCount failed:", e);
  }
}

// ---------------------------------------------------------------------------
// Payment deduplication
// ---------------------------------------------------------------------------

export function markPaymentProcessed(paymentId: string, event: string, userId: number | null): boolean {
  if (!db) return true;
  try {
    db.run(
      `INSERT OR IGNORE INTO processed_payments (payment_id, event, user_id, processed_at)
       VALUES (?, ?, ?, ?)`,
      [paymentId, event, userId, Math.floor(Date.now() / 1000)]
    );
    return (db.query<{ c: number }, []>("SELECT changes() AS c").get()?.c ?? 0) > 0;
  } catch (e) {
    console.error("[user-db/metering] markPaymentProcessed failed:", e);
    return true;
  }
}

// ---------------------------------------------------------------------------
// Consent helpers (stored in same DB)
// ---------------------------------------------------------------------------

export function hasConsented(userId: number, docVersion: string): boolean {
  if (!db) return false;
  try {
    const row = db
      .query<{ doc_version: string }, [string]>(
        "SELECT doc_version FROM consents WHERE user_id=?"
      )
      .get(String(userId));
    return row?.doc_version === docVersion;
  } catch (e) {
    console.warn("[user-db/metering] hasConsented failed:", e);
    return false;
  }
}

export function recordConsent(userId: number, docVersion: string, source = "telegram_button"): void {
  if (!db) return;
  try {
    db.run(
      `INSERT OR REPLACE INTO consents (user_id, doc_version, accepted_at, source)
       VALUES (?, ?, ?, ?)`,
      [String(userId), docVersion, Date.now(), source]
    );
  } catch (e) {
    console.warn("[user-db/metering] recordConsent failed:", e);
  }
}

export function revokeConsent(userId: number): void {
  if (!db) return;
  try {
    db.run("DELETE FROM consents WHERE user_id=?", [String(userId)]);
  } catch (e) {
    console.warn("[user-db/metering] revokeConsent failed:", e);
  }
}

export function getConsentInfo(userId: number): { version: string; acceptedAt: number } | null {
  if (!db) return null;
  try {
    const row = db
      .query<{ doc_version: string; accepted_at: number }, [string]>(
        "SELECT doc_version, accepted_at FROM consents WHERE user_id=?"
      )
      .get(String(userId));
    if (!row) return null;
    return { version: row.doc_version, acceptedAt: row.accepted_at };
  } catch (e) {
    console.warn("[user-db/metering] getConsentInfo failed:", e);
    return null;
  }
}
