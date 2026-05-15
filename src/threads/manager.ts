/**
 * Topic-parking manager (Layer 4).
 *
 * Orchestrates the full topic-parking pipeline:
 *   Layer 1 (preFilter) → Layer 2 (triggers) → Layer 3 (classifier) → action
 *
 * Owner (userId 292228713) is always bypassed — returns SAME immediately.
 */

import type { Api } from "grammy";
import { OWNER_USER_ID } from "../config";
import type { UserProfile } from "../config";
import {
  loadThreads,
  saveThreads,
  listActiveThreads,
  findThread,
  newThreadId,
  extractAnchorNouns,
  type Thread,
} from "./store";
import { shouldForceSame, extractReplyQuote, isMetaQuote } from "./preFilter";
import { hasAnyTrigger } from "./triggers";
import { classify } from "./classifier";
import { acquireDeepSeekKey } from "../deepseek-key-pool";

const DEEPSEEK_SUMMARY_URL = "https://api.deepseek.com/v1/chat/completions";
const MAX_ACTIVE_THREADS = 10;
const ARCHIVE_AFTER_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

/** Summary result from decideAndAct. */
export interface ThreadDecision {
  thread: Thread;
  switched: boolean;
  verdict: "SAME" | "NEW" | "RETURN";
}

/** Build a 2-sentence summary of recent turns via DeepSeek. */
async function buildSummary(turns: string): Promise<string> {
  const acquired = acquireDeepSeekKey();
  if (!acquired) return turns.slice(0, 200);

  const prompt = `Summarize the following conversation fragment in 1-2 sentences in Russian. Be brief and factual. Do not start with "Пользователь" — just state the topic/state directly.

Conversation:
${turns.slice(0, 1500)}

Summary (1-2 sentences, Russian):`;

  try {
    const resp = await fetch(DEEPSEEK_SUMMARY_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${acquired.key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [{ role: "user", content: prompt }],
        stream: false,
        max_tokens: 100,
        temperature: 0.3,
      }),
      signal: AbortSignal.timeout(5000),
    });

    if (!resp.ok) return turns.slice(0, 200);

    const json = (await resp.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    return json.choices?.[0]?.message?.content?.trim() ?? turns.slice(0, 200);
  } catch {
    return turns.slice(0, 200);
  } finally {
    acquired.release();
  }
}

/** Ensure archived threads are marked. */
function archiveOld(threads: Thread[]): void {
  const cutoff = Date.now() - ARCHIVE_AFTER_MS;
  for (const t of threads) {
    if (t.status === "parked" && t.lastActiveAt < cutoff) {
      t.status = "archived";
    }
  }
}

/** Get the default/initial thread for a user (the "legacy" thread). */
function ensureDefaultThread(
  data: { threads: Thread[]; currentThreadId: string | null },
  profile: UserProfile,
  existingSessionId: string | null
): { threads: Thread[]; currentThreadId: string | null } {
  const { threads } = data;
  let { currentThreadId } = data;

  // If there are already threads, just return as-is
  if (threads.length > 0) {
    // Set currentThreadId to first active if missing
    if (!currentThreadId) {
      const first = threads.find(t => t.status === "active");
      currentThreadId = first?.id ?? threads[0]!.id;
    }
    return { threads, currentThreadId };
  }

  // No threads yet — create the legacy "История до 2026-05-15" thread
  const id = newThreadId();
  const legacyThread: Thread = {
    id,
    title: "История до 2026-05-15",
    sessionId: existingSessionId ?? "",
    createdAt: Date.now() - 1, // slightly in the past
    lastActiveAt: Date.now() - 1,
    summary: "Предыдущий разговор до внедрения тредов.",
    status: "active",
    anchorNouns: ["история"],
  };
  threads.push(legacyThread);
  currentThreadId = id;
  return { threads, currentThreadId };
}

/**
 * Main entrypoint: decide what to do with the incoming message and act.
 *
 * Returns the current (or new) thread and whether we switched.
 * Does NOT start the actual Claude query — that's up to the caller.
 */
export async function decideAndAct(opts: {
  userId: number;
  text: string;
  isPhotoBurst: boolean;
  prevTurnsSummary: string; // last 2-3 turns, plain text
  dtSinceLastUserMs: number;
  currentSessionId: string | null;
  profile: UserProfile;
  botApi: Api; // grammY bot.api for sending messages
  chatId: number;
}): Promise<ThreadDecision> {
  const {
    userId,
    text,
    isPhotoBurst,
    prevTurnsSummary,
    dtSinceLastUserMs,
    currentSessionId,
    profile,
    botApi,
    chatId,
  } = opts;

  // Owner bypass — always SAME, no classification
  if (userId === OWNER_USER_ID) {
    let data = loadThreads(profile.memoryRoot, userId);
    data = ensureDefaultThread(data, profile, currentSessionId);
    const current = data.threads.find(t => t.id === data.currentThreadId) ?? data.threads[0]!;
    // Persist if we just initialized
    if (data.threads.length === 1 && data.threads[0]?.id === data.currentThreadId && !findThread(profile.memoryRoot, userId, data.currentThreadId!)) {
      saveThreads(profile.memoryRoot, userId, data.threads, data.currentThreadId);
    }
    return { thread: current, switched: false, verdict: "SAME" };
  }

  // Load thread state
  let data = loadThreads(profile.memoryRoot, userId);
  data = ensureDefaultThread(data, profile, currentSessionId);
  archiveOld(data.threads);

  // Extract reply-quote
  const replyQuote = extractReplyQuote(text);
  const hasReplyQuote = replyQuote !== null && !isMetaQuote(replyQuote);

  // === Layer 1: Pre-filter ===
  const forceSame = shouldForceSame({
    text,
    dtSinceLastUserMs,
    prevWasPhotoBurst: isPhotoBurst,
    hasReplyQuote,
  });

  if (forceSame) {
    const current = data.threads.find(t => t.id === data.currentThreadId) ?? data.threads[0]!;
    // Touch lastActiveAt
    current.lastActiveAt = Date.now();
    saveThreads(profile.memoryRoot, userId, data.threads, data.currentThreadId);
    return { thread: current, switched: false, verdict: "SAME" };
  }

  // === Layer 2: Triggers ===
  const triggered = hasAnyTrigger({
    text,
    dtSinceLastUserMs,
    hasReplyQuote,
    replyQuoteText: hasReplyQuote ? replyQuote : null,
  });

  if (!triggered) {
    const current = data.threads.find(t => t.id === data.currentThreadId) ?? data.threads[0]!;
    current.lastActiveAt = Date.now();
    saveThreads(profile.memoryRoot, userId, data.threads, data.currentThreadId);
    return { thread: current, switched: false, verdict: "SAME" };
  }

  // === Layer 3: Classify ===
  const activeThreads = listActiveThreads(profile.memoryRoot, userId);
  const verdict = await classify({
    userId,
    currentText: text,
    replyQuote: hasReplyQuote ? replyQuote : null,
    prevTurnsSummary,
    activeThreads: activeThreads.map(t => ({ id: t.id, title: t.title, summary: t.summary })),
  });

  // === Layer 4: Act ===

  if (verdict.kind === "SAME") {
    const current = data.threads.find(t => t.id === data.currentThreadId) ?? data.threads[0]!;
    current.lastActiveAt = Date.now();
    saveThreads(profile.memoryRoot, userId, data.threads, data.currentThreadId);
    return { thread: current, switched: false, verdict: "SAME" };
  }

  if (verdict.kind === "RETURN") {
    const targetThread = data.threads.find(t => t.id === verdict.threadId);
    if (!targetThread) {
      // Thread not found — treat as SAME
      const current = data.threads.find(t => t.id === data.currentThreadId) ?? data.threads[0]!;
      current.lastActiveAt = Date.now();
      saveThreads(profile.memoryRoot, userId, data.threads, data.currentThreadId);
      return { thread: current, switched: false, verdict: "SAME" };
    }

    // Park the current thread
    const oldThread = data.threads.find(t => t.id === data.currentThreadId);
    if (oldThread && oldThread.id !== targetThread.id) {
      oldThread.status = "parked";
    }

    // Resume target thread
    targetThread.status = "active";
    targetThread.lastActiveAt = Date.now();
    data.currentThreadId = targetThread.id;

    saveThreads(profile.memoryRoot, userId, data.threads, data.currentThreadId);

    // UX message
    try {
      await botApi.sendMessage(
        chatId,
        `↩️ Продолжаем про «${targetThread.title}». Остановились на: ${targetThread.summary}`
      );
    } catch (e) {
      console.warn(`[threads] Failed to send RETURN UX message: ${e}`);
    }

    return { thread: targetThread, switched: true, verdict: "RETURN" };
  }

  // verdict.kind === "NEW"
  {
    const title = verdict.title;

    // Park the current thread and build its summary
    const oldThread = data.threads.find(t => t.id === data.currentThreadId);
    if (oldThread) {
      oldThread.status = "parked";
      // Build summary in the background — don't block the response
      const summaryTurns = prevTurnsSummary || oldThread.title;
      buildSummary(summaryTurns).then(summary => {
        // Reload and update to avoid overwriting newer state
        const fresh = loadThreads(profile.memoryRoot, userId);
        const t = fresh.threads.find(th => th.id === oldThread.id);
        if (t) {
          t.summary = summary;
          saveThreads(profile.memoryRoot, userId, fresh.threads, fresh.currentThreadId);
        }
      }).catch(e => console.warn(`[threads] Summary build failed: ${e}`));
    }

    // Enforce max active threads limit: archive the oldest if at limit
    const activeCount = data.threads.filter(t => t.status === "active").length;
    if (activeCount >= MAX_ACTIVE_THREADS) {
      const oldest = data.threads
        .filter(t => t.status === "active" && t.id !== data.currentThreadId)
        .sort((a, b) => a.lastActiveAt - b.lastActiveAt)[0];
      if (oldest) oldest.status = "archived";
    }

    // Create new thread
    const newId = newThreadId();
    const newThread: Thread = {
      id: newId,
      title,
      sessionId: "", // will be set when SDK assigns a session_id
      createdAt: Date.now(),
      lastActiveAt: Date.now(),
      summary: "",
      status: "active",
      anchorNouns: extractAnchorNouns(title),
    };

    data.threads.push(newThread);
    data.currentThreadId = newId;

    saveThreads(profile.memoryRoot, userId, data.threads, data.currentThreadId);

    // UX message
    try {
      await botApi.sendMessage(
        chatId,
        `🔀 Заметил новую тему — «${title}». Переключаюсь. Вернёмся к старой когда будешь готов.`
      );
    } catch (e) {
      console.warn(`[threads] Failed to send NEW UX message: ${e}`);
    }

    return { thread: newThread, switched: true, verdict: "NEW" };
  }
}

/**
 * Update the sessionId for the current thread after SDK assigns one.
 * Called from session.ts after a new SDK session_id is received.
 */
export function updateCurrentThreadSessionId(
  memoryRoot: string,
  userId: number,
  sessionId: string
): void {
  const { threads, currentThreadId } = loadThreads(memoryRoot, userId);
  if (!currentThreadId) return;
  const t = threads.find(th => th.id === currentThreadId);
  if (t && !t.sessionId) {
    t.sessionId = sessionId;
    saveThreads(memoryRoot, userId, threads, currentThreadId);
  }
}

/**
 * Perform a RETURN to a specific thread by id (for /threads command and callback).
 * Returns the target thread on success, null if not found.
 */
export async function resumeThread(opts: {
  userId: number;
  threadId: string;
  profile: UserProfile;
  botApi: Api;
  chatId: number;
}): Promise<Thread | null> {
  const { userId, threadId, profile, botApi, chatId } = opts;

  const data = loadThreads(profile.memoryRoot, userId);
  const target = data.threads.find(t => t.id === threadId);
  if (!target) return null;

  // Park current thread
  const old = data.threads.find(t => t.id === data.currentThreadId);
  if (old && old.id !== threadId) old.status = "parked";

  // Resume target
  target.status = "active";
  target.lastActiveAt = Date.now();
  data.currentThreadId = threadId;

  saveThreads(profile.memoryRoot, userId, data.threads, data.currentThreadId);

  try {
    await botApi.sendMessage(
      chatId,
      `↩️ Продолжаем про «${target.title}». Остановились на: ${target.summary || "(нет резюме)"}`
    );
  } catch (e) {
    console.warn(`[threads] Failed to send resume UX message: ${e}`);
  }

  return target;
}
