/**
 * Topic change detection for auto-/new sessions.
 *
 * Two-stage approach:
 * 1. Fast heuristic (sync, free) — handles obvious cases
 * 2. LLM fallback (async, Haiku) — only for ambiguous "maybe" cases
 */

import { query } from "@anthropic-ai/claude-agent-sdk";
import type { TranscriptTurn } from "./types";
import { tokenize } from "./relevance";

export interface TopicCheckResult {
  changed: boolean;
  reason: string;
}

// Patterns that suggest the user is starting a fresh topic
const RESET_PATTERNS = /^(привет|здравствуй|добрый|hi\b|hello\b|hey\b|слушай|кстати|забудь|новый вопрос|другая тема|новая задача|другой вопрос|можешь помочь|хочу спросить|скажи|помоги мне с)/i;

/**
 * Fast heuristic topic check — runs synchronously, no API calls.
 * Returns { changed: true } for clear cases,
 *         { changed: false, reason: "maybe-*" } for ambiguous,
 *         { changed: false } when clearly same topic.
 */
export function heuristicTopicCheck(
  recentTurns: TranscriptTurn[],
  newMessage: string,
  lastActivityMs?: number
): TopicCheckResult {
  // R1: Long pause (needs lastActivityMs passed in)
  if (lastActivityMs !== undefined) {
    const gapMin = (Date.now() - lastActivityMs) / 60000;
    if (gapMin > 60) {
      return { changed: true, reason: "gap>60min" };
    }
    if (gapMin > 30) {
      return { changed: false, reason: "maybe-gap>30min" };
    }
  }

  // R2: Explicit reset patterns
  const trimmed = newMessage.trim();
  if (RESET_PATTERNS.test(trimmed)) {
    return { changed: false, reason: "maybe-reset-pattern" };
  }

  // R3: Token overlap with recent assistant turns
  if (recentTurns.length < 2) {
    return { changed: false, reason: "too-few-turns" };
  }

  const msgTokens = tokenize(newMessage);
  if (msgTokens.size < 3) {
    // Too short to judge
    return { changed: false, reason: "too-short" };
  }

  // Collect tokens from the last 3 assistant turns for comparison
  const recentAssistantTurns = recentTurns
    .filter(t => t.role === "assistant")
    .slice(-3);

  if (recentAssistantTurns.length === 0) {
    return { changed: false, reason: "no-assistant-turns" };
  }

  const contextText = recentAssistantTurns.map(t => t.content).join(" ");
  const contextTokens = tokenize(contextText);

  // Jaccard similarity
  let intersection = 0;
  for (const t of msgTokens) {
    if (contextTokens.has(t)) intersection++;
  }
  const union = msgTokens.size + contextTokens.size - intersection;
  const jaccard = union > 0 ? intersection / union : 0;

  if (jaccard < 0.02 && msgTokens.size >= 5) {
    // Very low overlap, longer message — likely new topic
    return { changed: false, reason: "maybe-low-overlap" };
  }

  return { changed: false, reason: "same-topic" };
}

/**
 * LLM-based topic check using a lightweight model.
 * Only called when heuristic returns "maybe-*".
 * Returns within ~300ms at ~$0.0001/call cost.
 */
export async function llmTopicCheck(
  recentTurns: TranscriptTurn[],
  newMessage: string,
  opts: { model: string; cwd: string; env?: Record<string, string> }
): Promise<TopicCheckResult> {
  const MAX_TURNS = 4;
  const MAX_CHARS_PER_TURN = 300;

  const contextLines = recentTurns
    .slice(-MAX_TURNS)
    .map(t => {
      const role = t.role === "user" ? "Пользователь" : "Ассистент";
      const content = t.content.slice(0, MAX_CHARS_PER_TURN);
      return `${role}: ${content}`;
    })
    .join("\n");

  const prompt = `Последние реплики диалога:\n${contextLines}\n\nНовое сообщение пользователя:\n${newMessage.slice(0, 300)}\n\nЭто новая тема разговора? Ответь ТОЛЬКО "YES" или "NO".`;

  let response = "";

  try {
    for await (const event of query({
      prompt,
      options: {
        systemPrompt: "Ты определяешь смену темы в диалоге. Отвечай только YES или NO.",
        model: opts.model,
        cwd: opts.cwd,
        mcpServers: {},
        maxThinkingTokens: 0,
        ...(opts.env ? { env: opts.env } : {}),
      },
    })) {
      if (event.type === "assistant" && event.message?.content) {
        for (const block of event.message.content) {
          if (block.type === "text") response += block.text;
        }
      }
    }
  } catch (err) {
    console.warn("[topic-detector] LLM check failed:", err);
    return { changed: false, reason: "llm-error" };
  }

  const upper = response.trim().toUpperCase();
  const changed = upper.startsWith("YES");
  return { changed, reason: changed ? "llm-yes" : "llm-no" };
}
