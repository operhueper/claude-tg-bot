/**
 * LLM classifier layer (Layer 3) for topic-parking.
 *
 * Calls DeepSeek via the direct REST API to determine whether a new message
 * represents the SAME topic, a NEW topic, or a RETURN to a past thread.
 *
 * Conservative: when in doubt → SAME.
 * Timeout: 5 seconds; on timeout/error → SAME.
 */

import { acquireDeepSeekKey } from "../deepseek-key-pool";
import type { Thread } from "./store";

export type Verdict =
  | { kind: "SAME" }
  | { kind: "NEW"; title: string }
  | { kind: "RETURN"; threadId: string };

const DEEPSEEK_URL = "https://api.deepseek.com/v1/chat/completions";
const CLASSIFIER_TIMEOUT_MS = 5_000;

function buildPrompt(opts: {
  currentText: string;
  replyQuote: string | null;
  prevTurnsSummary: string;
  activeThreads: Pick<Thread, "id" | "title" | "summary">[];
}): string {
  const { currentText, replyQuote, prevTurnsSummary, activeThreads } = opts;

  const threadsList =
    activeThreads.length === 0
      ? "  (нет активных тредов)"
      : activeThreads
          .map(t => `  - id=${t.id} title="${t.title}" summary="${t.summary}"`)
          .join("\n");

  const quoteSection = replyQuote
    ? `Пользователь цитирует старое сообщение: «${replyQuote}»\n\n`
    : "";

  return `Ты — классификатор темы разговора. Твоя задача: определить, продолжает ли пользователь ту же тему, начинает новую, или возвращается к одной из предыдущих.

ПРАВИЛО: Если сомневаешься — отвечай SAME. Лучше не разбивать, чем разбить зря.

Текущий контекст (последние 2-3 реплики разговора):
${prevTurnsSummary || "(нет предыдущих реплик)"}

${quoteSection}Новое сообщение пользователя:
«${currentText}»

Активные треды (история предыдущих тем):
${threadsList}

Ответь строго в формате JSON (без markdown, без пояснений):
- Если та же тема: {"verdict": "SAME"}
- Если новая тема: {"verdict": "NEW", "title": "краткий заголовок 2-5 слов на русском"}
- Если возврат к старой теме: {"verdict": "RETURN", "threadId": "<id из списка выше>"}

JSON:`;
}

async function callDeepSeekClassifier(
  prompt: string,
  apiKey: string
): Promise<Verdict> {
  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), CLASSIFIER_TIMEOUT_MS);

  try {
    const resp = await fetch(DEEPSEEK_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [{ role: "user", content: prompt }],
        stream: false,
        max_tokens: 80,
        temperature: 0,
      }),
      signal: controller.signal,
    });

    if (!resp.ok) {
      console.warn(`[classifier] DeepSeek error ${resp.status} — fallback SAME`);
      return { kind: "SAME" };
    }

    const json = (await resp.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = json.choices?.[0]?.message?.content?.trim() ?? "";

    // Extract JSON from the response (model sometimes wraps it in backticks)
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.warn(`[classifier] No JSON in response: "${content.slice(0, 100)}" — fallback SAME`);
      return { kind: "SAME" };
    }

    const parsed = JSON.parse(jsonMatch[0]) as {
      verdict?: string;
      title?: string;
      threadId?: string;
    };

    if (parsed.verdict === "NEW" && parsed.title) {
      return { kind: "NEW", title: parsed.title };
    }
    if (parsed.verdict === "RETURN" && parsed.threadId) {
      return { kind: "RETURN", threadId: parsed.threadId };
    }
    // Anything else (SAME, missing field, unexpected value) → SAME
    return { kind: "SAME" };
  } catch (err) {
    const isTimeout = (err as Error).name === "AbortError";
    console.warn(`[classifier] ${isTimeout ? "Timeout" : "Error"} — fallback SAME:`, err);
    return { kind: "SAME" };
  } finally {
    clearTimeout(tid);
  }
}

/**
 * Classify a new message vs the current conversation context.
 * Returns SAME if DeepSeek is unavailable, times out, or if no API key exists.
 */
export async function classify(opts: {
  userId: number;
  currentText: string;
  replyQuote: string | null;
  prevTurnsSummary: string;
  activeThreads: Pick<Thread, "id" | "title" | "summary">[];
}): Promise<Verdict> {
  // Acquire a key from the pool (non-blocking — does not increment in-flight
  // for this auxiliary call, so it won't affect guest routing fairness)
  const acquired = acquireDeepSeekKey();
  if (!acquired) {
    console.warn("[classifier] No DeepSeek key available — fallback SAME");
    return { kind: "SAME" };
  }

  const prompt = buildPrompt(opts);

  let verdict: Verdict;
  try {
    verdict = await callDeepSeekClassifier(prompt, acquired.key);
  } finally {
    acquired.release();
  }

  return verdict;
}
