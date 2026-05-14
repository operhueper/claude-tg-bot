/**
 * Consent gate — tracks user acceptance of legal documents.
 * Stores consent records in the same metering.sqlite database.
 *
 * DOC_VERSION must be bumped whenever any of the three documents
 * (оферта, политика конфиденциальности, пользовательское соглашение)
 * changes materially. All existing consents become invalid, forcing users
 * through the gate again.
 */

import { Database } from "bun:sqlite";
import * as path from "path";

export const DOC_VERSION = "2026-05-14";

// ---------------------------------------------------------------------------
// Database init (separate connection from metering.ts — WAL already enabled)
// ---------------------------------------------------------------------------

const dbPath =
  process.env.METERING_DB_PATH ||
  path.join(process.cwd(), "metering.sqlite");

let db: Database | null = null;
try {
  db = new Database(dbPath, { create: true });
  // WAL already enabled by metering.ts; PRAGMA is idempotent but safe to skip
  db.exec(`
    CREATE TABLE IF NOT EXISTS consents (
      user_id TEXT PRIMARY KEY,
      doc_version TEXT NOT NULL,
      accepted_at INTEGER NOT NULL,
      source TEXT NOT NULL DEFAULT 'telegram_button'
    );
    CREATE INDEX IF NOT EXISTS idx_consents_version ON consents(doc_version);
  `);
} catch (e) {
  console.warn("[consent] Failed to open database:", e);
  db = null;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns true if the user has consented to the current DOC_VERSION.
 * Versions older than DOC_VERSION are treated as not consented.
 * Returns false gracefully if the DB is unavailable.
 */
export function hasConsented(userId: number): boolean {
  if (!db) return false;
  try {
    const row = db
      .query<{ doc_version: string }, [string]>(
        "SELECT doc_version FROM consents WHERE user_id = ?"
      )
      .get(String(userId));
    return row?.doc_version === DOC_VERSION;
  } catch (e) {
    console.warn("[consent] hasConsented failed:", e);
    return false;
  }
}

/**
 * Records or updates the user's consent to the current DOC_VERSION.
 * Never throws — errors go to console.warn.
 */
export function recordConsent(userId: number, source = "telegram_button"): void {
  if (!db) {
    console.warn("[consent] recordConsent skipped — DB unavailable");
    return;
  }
  try {
    db.run(
      `INSERT OR REPLACE INTO consents (user_id, doc_version, accepted_at, source)
       VALUES (?, ?, ?, ?)`,
      [String(userId), DOC_VERSION, Date.now(), source]
    );
  } catch (e) {
    console.warn("[consent] recordConsent failed:", e);
  }
}

/**
 * Removes the user's consent record.
 * After revocation, hasConsented returns false and the gate is shown again.
 * Never throws — errors go to console.warn.
 */
export function revokeConsent(userId: number): void {
  if (!db) {
    console.warn("[consent] revokeConsent skipped — DB unavailable");
    return;
  }
  try {
    db.run("DELETE FROM consents WHERE user_id = ?", [String(userId)]);
  } catch (e) {
    console.warn("[consent] revokeConsent failed:", e);
  }
}

/**
 * Returns the stored consent info for debugging / audit logs.
 * Returns null if no record exists or DB is unavailable.
 */
export function getConsentInfo(
  userId: number
): { version: string; acceptedAt: number } | null {
  if (!db) return null;
  try {
    const row = db
      .query<{ doc_version: string; accepted_at: number }, [string]>(
        "SELECT doc_version, accepted_at FROM consents WHERE user_id = ?"
      )
      .get(String(userId));
    if (!row) return null;
    return { version: row.doc_version, acceptedAt: row.accepted_at };
  } catch (e) {
    console.warn("[consent] getConsentInfo failed:", e);
    return null;
  }
}
