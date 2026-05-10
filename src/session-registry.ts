/**
 * Per-user session registry and active-user persistence.
 *
 * Keeps a Map<userId, ClaudeSession> and handles group sessions.
 * Also persists which users were recently active so the bot can
 * send restart notifications.
 */

import * as fs from "fs";
import { writeFileSync, renameSync } from "node:fs";
import { getUserProfile, getGroupProfile } from "./config";
import { ClaudeSession } from "./session";

// ---------------------------------------------------------------------------
// Per-user session map
// ---------------------------------------------------------------------------

const sessions = new Map<number, ClaudeSession>();

export function getSession(userId: number): ClaudeSession {
  let s = sessions.get(userId);
  if (!s) {
    const profile = getUserProfile(userId);
    s = new ClaudeSession(profile);
    sessions.set(userId, s);
  }
  return s;
}

// ---------------------------------------------------------------------------
// Group chat session
// ---------------------------------------------------------------------------

let groupSession: ClaudeSession | null = null;

export function getGroupSession(): ClaudeSession {
  if (!groupSession) {
    const profile = getGroupProfile();
    groupSession = new ClaudeSession(profile);
  }
  return groupSession;
}

export function getAllSessions(): ClaudeSession[] {
  const all = Array.from(sessions.values());
  if (groupSession) all.push(groupSession);
  return all;
}

// ---------------------------------------------------------------------------
// Active user persistence (for restart notifications)
// ---------------------------------------------------------------------------

const ACTIVE_USERS_FILE = "/tmp/claude-active-users.json";

/**
 * Persist that a user was active right now. Called after every successful message.
 * Data survives bot restarts (lives in /tmp, survives systemd restarts within same boot).
 */
export function persistUserActivity(userId: number, chatId: number): void {
  let data: Record<string, { chatId: number; lastActivity: number }> = {};
  try {
    if (fs.existsSync(ACTIVE_USERS_FILE)) {
      data = JSON.parse(fs.readFileSync(ACTIVE_USERS_FILE, "utf-8"));
    }
  } catch {
    /* ignore */
  }
  data[String(userId)] = { chatId, lastActivity: Date.now() };
  try {
    const tmpPath = `${ACTIVE_USERS_FILE}.tmp.${process.pid}`;
    writeFileSync(tmpPath, JSON.stringify(data), "utf-8");
    renameSync(tmpPath, ACTIVE_USERS_FILE);
  } catch {
    /* ignore */
  }
}

/**
 * Returns users who were active within the last `withinMs` milliseconds.
 * Used at startup to send restart notifications.
 */
export function getRecentlyActiveUsers(
  withinMs: number
): Array<{ userId: number; chatId: number; lastActivity: number }> {
  try {
    if (!fs.existsSync(ACTIVE_USERS_FILE)) return [];
    const data: Record<string, { chatId: number; lastActivity: number }> =
      JSON.parse(fs.readFileSync(ACTIVE_USERS_FILE, "utf-8"));
    const cutoff = Date.now() - withinMs;
    return Object.entries(data)
      .filter(([, v]) => v.lastActivity >= cutoff)
      .map(([k, v]) => ({
        userId: Number(k),
        chatId: v.chatId,
        lastActivity: v.lastActivity,
      }));
  } catch {
    return [];
  }
}
