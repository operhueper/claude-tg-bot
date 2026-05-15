/**
 * Thread store — extends graph.json with a `threads` collection.
 *
 * Stores per-user conversation threads (topic parking) in the same
 * memory/{userId}/graph.json file that GraphStore manages, but in an
 * additional `threads` top-level key. Reuses the atomic-write pattern
 * from GraphStore.
 */

import * as fs from "fs";
import * as path from "path";
import { graphFile, ensureMemoryStructure } from "../memory/paths";

export type ThreadStatus = "active" | "parked" | "archived";

export interface Thread {
  id: string;           // uuid-like
  title: string;        // 1-5 words, e.g. "Бот для барбершопов: зарплаты"
  sessionId: string;    // SDK session id
  createdAt: number;    // ms since epoch
  lastActiveAt: number; // ms since epoch
  summary: string;      // 1-2 sentences
  status: ThreadStatus;
  anchorNouns: string[]; // simple title tokens for future recall
}

interface ThreadsData {
  threads: Thread[];
  currentThreadId: string | null;
}

/** Load the threads section from graph.json for a given user. */
export function loadThreads(
  memoryRoot: string,
  userId: number
): ThreadsData {
  const file = graphFile(memoryRoot, userId);
  if (!fs.existsSync(file)) {
    return { threads: [], currentThreadId: null };
  }
  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, unknown>;
    const threads = (raw["threads"] as Thread[] | undefined) ?? [];
    const currentThreadId = (raw["currentThreadId"] as string | null) ?? null;
    return { threads, currentThreadId };
  } catch {
    return { threads: [], currentThreadId: null };
  }
}

/** Save the threads section back into graph.json without touching nodes/edges. */
export function saveThreads(
  memoryRoot: string,
  userId: number,
  threads: Thread[],
  currentThreadId: string | null
): void {
  ensureMemoryStructure(memoryRoot, userId);
  const file = graphFile(memoryRoot, userId);
  const tmp = file + ".tmp";

  // Read existing file (or create a skeleton) to preserve nodes/edges
  let existing: Record<string, unknown> = {
    version: 1,
    user_id: userId,
    nodes: {},
    edges: {},
    label_index: {},
    updated_at: new Date().toISOString(),
  };
  if (fs.existsSync(file)) {
    try {
      existing = JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, unknown>;
    } catch {
      // keep skeleton
    }
  }

  existing["threads"] = threads;
  existing["currentThreadId"] = currentThreadId;
  existing["updated_at"] = new Date().toISOString();

  fs.writeFileSync(tmp, JSON.stringify(existing, null, 2), "utf8");
  fs.renameSync(tmp, file);
}

/** Add a new thread and persist. */
export function addThread(
  memoryRoot: string,
  userId: number,
  t: Thread
): void {
  const { threads, currentThreadId } = loadThreads(memoryRoot, userId);
  threads.push(t);
  saveThreads(memoryRoot, userId, threads, currentThreadId);
}

/** Patch fields on an existing thread. */
export function updateThread(
  memoryRoot: string,
  userId: number,
  id: string,
  patch: Partial<Thread>
): void {
  const { threads, currentThreadId } = loadThreads(memoryRoot, userId);
  const idx = threads.findIndex(t => t.id === id);
  if (idx === -1) return;
  threads[idx] = { ...threads[idx]!, ...patch };
  saveThreads(memoryRoot, userId, threads, currentThreadId);
}

/** Find a thread by id. */
export function findThread(
  memoryRoot: string,
  userId: number,
  id: string
): Thread | null {
  const { threads } = loadThreads(memoryRoot, userId);
  return threads.find(t => t.id === id) ?? null;
}

/** Return active + parked threads (not archived). */
export function listActiveThreads(
  memoryRoot: string,
  userId: number
): Thread[] {
  const { threads } = loadThreads(memoryRoot, userId);
  return threads.filter(t => t.status !== "archived");
}

/** Generate a simple uuid-like id. */
export function newThreadId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

/** Extract simple noun tokens from a title for anchorNouns. */
export function extractAnchorNouns(title: string): string[] {
  return title
    .toLowerCase()
    .split(/[\s:,;–—]+/)
    .map(w => w.trim())
    .filter(w => w.length > 3);
}
