/**
 * Token usage metering — records per-user consumption to a SQLite database.
 * All LLM backends (Anthropic via CLI, DeepSeek via CLI, OpenRouter direct) write here.
 * Dashboard queries are out of scope; this module is write-only from the bot's perspective.
 */

import { Database } from "bun:sqlite";
import * as path from "path";

// ---------------------------------------------------------------------------
// Database init
// ---------------------------------------------------------------------------

const dbPath =
  process.env.METERING_DB_PATH ||
  path.join(process.cwd(), "metering.sqlite");

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
    CREATE UNIQUE INDEX IF NOT EXISTS idx_usage_req ON usage(user_id, request_id, model);
    CREATE TABLE IF NOT EXISTS daily_counts (
      user_id TEXT NOT NULL,
      date TEXT NOT NULL,
      msg_count INTEGER NOT NULL DEFAULT 0,
      doc_count INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (user_id, date)
    );
  `);
  // Idempotent migration: add request_id column if it was created before this version
  try {
    db.exec("ALTER TABLE usage ADD COLUMN request_id TEXT");
  } catch (_e) {
    // Column already exists — ignore
  }
  // Idempotent migration: add unique index for deduplication on retry
  try {
    db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_usage_req ON usage(user_id, request_id, model)");
  } catch (_e) {
    // Index already exists — ignore
  }
} catch (e) {
  console.error("[metering] Failed to open database:", e);
  // Assign a no-op stub so the rest of the module degrades gracefully
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
  "claude-sonnet-4-6": {
    input: 3.0,
    output: 15.0,
    cacheRead: 0.3,
    cacheCreation: 3.75,
  },
  "claude-opus-4-7": { input: 15.0, output: 75.0 },
  "claude-opus-4-5": { input: 15.0, output: 75.0 },
  "claude-haiku-3-5": { input: 0.8, output: 4.0 },
  "deepseek-chat": { input: 0.14, output: 0.28 },
  "deepseek-reasoner": { input: 0.55, output: 2.19 },
  "google/gemini-2.5-flash": { input: 0.075, output: 0.30 },
  "gemini-2.5-flash": { input: 0.075, output: 0.30 },
  // Whisper is billed per minute, not tokens — cost stays 0
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
  const cost =
    (inputTokens * p.input) / 1_000_000 +
    (outputTokens * p.output) / 1_000_000 +
    (cacheReadTokens * (p.cacheRead ?? 0)) / 1_000_000 +
    (cacheCreationTokens * (p.cacheCreation ?? 0)) / 1_000_000;
  return cost;
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
  /** Optional deduplication key — when provided, retries overwrite the previous record. */
  requestId?: string;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Record a single LLM call. Never throws — errors go to console.error.
 */
export function recordUsage(rec: UsageRecord): void {
  if (!db) return;
  try {
    const cacheRead = rec.cacheReadTokens ?? 0;
    const cacheCreation = rec.cacheCreationTokens ?? 0;
    const cost = computeCost(
      rec.model,
      rec.inputTokens,
      rec.outputTokens,
      cacheRead,
      cacheCreation
    );
    if (rec.requestId) {
      // INSERT OR REPLACE deduplicates retries: a second attempt with the same
      // (user_id, request_id, model) overwrites the first, so only the final
      // token count is billed.
      db.run(
        `INSERT OR REPLACE INTO usage
           (user_id, source, model, input_tokens, output_tokens,
            cache_read_tokens, cache_creation_tokens, cost_usd, ts, request_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          String(rec.userId),
          rec.source,
          rec.model,
          rec.inputTokens,
          rec.outputTokens,
          cacheRead,
          cacheCreation,
          cost,
          Math.floor(Date.now() / 1000),
          rec.requestId,
        ]
      );
    } else {
      // No requestId — legacy path (vision metering, whisper, etc.)
      db.run(
        `INSERT INTO usage
           (user_id, source, model, input_tokens, output_tokens,
            cache_read_tokens, cache_creation_tokens, cost_usd, ts)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          String(rec.userId),
          rec.source,
          rec.model,
          rec.inputTokens,
          rec.outputTokens,
          cacheRead,
          cacheCreation,
          cost,
          Math.floor(Date.now() / 1000),
        ]
      );
    }
  } catch (e) {
    console.error("[metering] recordUsage failed:", e);
  }
}

export interface UserTotals {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  costUsd: number;
}

/**
 * Returns the unix timestamp (seconds) of the most recent 00:00 Europe/Moscow.
 * Moscow is UTC+3 with no DST.
 */
export function moscowDayStartUtcSeconds(): number {
  const offsetSec = 3 * 3600;
  const nowSec = Math.floor(Date.now() / 1000);
  const localSec = nowSec + offsetSec;
  const dayStartLocal = Math.floor(localSec / 86400) * 86400;
  return dayStartLocal - offsetSec;
}

/**
 * Aggregate totals for a single user. If `sinceTs` provided, only sums rows with ts >= sinceTs.
 */
export function getUserTotals(
  userId: string | number,
  sinceTs?: number
): UserTotals {
  if (!db) {
    return {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
      costUsd: 0,
    };
  }
  try {
    const sql = sinceTs
      ? `SELECT
           COALESCE(SUM(input_tokens), 0) AS input_tokens,
           COALESCE(SUM(output_tokens), 0) AS output_tokens,
           COALESCE(SUM(cache_read_tokens), 0) AS cache_read_tokens,
           COALESCE(SUM(cache_creation_tokens), 0) AS cache_creation_tokens,
           COALESCE(SUM(cost_usd), 0) AS cost_usd
         FROM usage
         WHERE user_id = ? AND ts >= ?`
      : `SELECT
           COALESCE(SUM(input_tokens), 0) AS input_tokens,
           COALESCE(SUM(output_tokens), 0) AS output_tokens,
           COALESCE(SUM(cache_read_tokens), 0) AS cache_read_tokens,
           COALESCE(SUM(cache_creation_tokens), 0) AS cache_creation_tokens,
           COALESCE(SUM(cost_usd), 0) AS cost_usd
         FROM usage
         WHERE user_id = ?`;
    const params: (string | number)[] = sinceTs
      ? [String(userId), sinceTs]
      : [String(userId)];
    const row = db
      .query<
        {
          input_tokens: number;
          output_tokens: number;
          cache_read_tokens: number;
          cache_creation_tokens: number;
          cost_usd: number;
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        any
      >(sql)
      .get(...params);
    if (!row) {
      return {
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
        costUsd: 0,
      };
    }
    return {
      inputTokens: row.input_tokens,
      outputTokens: row.output_tokens,
      cacheReadTokens: row.cache_read_tokens,
      cacheCreationTokens: row.cache_creation_tokens,
      costUsd: row.cost_usd,
    };
  } catch (e) {
    console.error("[metering] getUserTotals failed:", e);
    return {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
      costUsd: 0,
    };
  }
}

export interface AllUserTotals extends UserTotals {
  userId: string;
}

// ---------------------------------------------------------------------------
// Daily counts helpers (for daily-limit.ts)
// ---------------------------------------------------------------------------

function todayMsk(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Moscow' });
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
    console.error("[metering] getMsgCountToday failed:", e);
    return 0;
  }
}

export function incrementMsgCount(userId: number): void {
  if (!db) return;
  try {
    db.run(
      `INSERT INTO daily_counts (user_id, date, msg_count)
       VALUES (?, ?, 1)
       ON CONFLICT(user_id, date) DO UPDATE SET msg_count = msg_count + 1`,
      [String(userId), todayMsk()]
    );
  } catch (e) {
    console.error("[metering] incrementMsgCount failed:", e);
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
    console.error("[metering] getDocCountToday failed:", e);
    return 0;
  }
}

export function incrementDocCount(userId: number): void {
  if (!db) return;
  try {
    db.run(
      `INSERT INTO daily_counts (user_id, date, doc_count)
       VALUES (?, ?, 1)
       ON CONFLICT(user_id, date) DO UPDATE SET doc_count = doc_count + 1`,
      [String(userId), todayMsk()]
    );
  } catch (e) {
    console.error("[metering] incrementDocCount failed:", e);
  }
}

/**
 * Aggregate totals for every user, ordered by cost descending.
 */
export function getAllUsersTotals(): AllUserTotals[] {
  if (!db) return [];
  try {
    return db
      .query<
        {
          user_id: string;
          input_tokens: number;
          output_tokens: number;
          cache_read_tokens: number;
          cache_creation_tokens: number;
          cost_usd: number;
        },
        []
      >(
        `SELECT
           user_id,
           COALESCE(SUM(input_tokens), 0) AS input_tokens,
           COALESCE(SUM(output_tokens), 0) AS output_tokens,
           COALESCE(SUM(cache_read_tokens), 0) AS cache_read_tokens,
           COALESCE(SUM(cache_creation_tokens), 0) AS cache_creation_tokens,
           COALESCE(SUM(cost_usd), 0) AS cost_usd
         FROM usage
         GROUP BY user_id
         ORDER BY cost_usd DESC`
      )
      .all()
      .map((r) => ({
        userId: r.user_id,
        inputTokens: r.input_tokens,
        outputTokens: r.output_tokens,
        cacheReadTokens: r.cache_read_tokens,
        cacheCreationTokens: r.cache_creation_tokens,
        costUsd: r.cost_usd,
      }));
  } catch (e) {
    console.error("[metering] getAllUsersTotals failed:", e);
    return [];
  }
}
