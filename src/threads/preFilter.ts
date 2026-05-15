/**
 * Pre-filter layer (Layer 1) for topic-parking.
 *
 * Pure functions — no side effects, no async.
 * Determines whether a message should be forced SAME without calling any LLM.
 */

/** Short affirmations that continue the current topic. */
const SHORT_AFFIRM = new Set([
  "ок", "хорош", "хорошо", "давай", "дальше", "разрешаю",
  "ага", "угу", "да", "нет", "спасибо", "понял", "понятно",
  "окей", "ок!", "хорошо!", "ладно", "принято", "ясно",
]);

/**
 * Meta-quote patterns: these are bot-generated service messages
 * that ended up quoted and must NOT be treated as topic anchors.
 */
const META_QUOTE_BLOCKLIST: RegExp[] = [
  /прости.*перезапу/i,
  /нет ответа от модели/i,
  /no response from claude/i,
  /бесплатный для тебя/i,
  /ты подписан/i,
  /я только что перезапустился/i,
  /память сохранена/i,
  /извини, я только что/i,
  /\[Photos?:/,       // photos in quote — not a text anchor
];

/**
 * Returns true if the quoted text is a meta/service message
 * that should be ignored for topic classification.
 */
export function isMetaQuote(q: string): boolean {
  return META_QUOTE_BLOCKLIST.some(re => re.test(q));
}

/**
 * Returns true if text is a short affirmation word/phrase.
 * Strips punctuation before checking.
 */
export function isShortAffirm(text: string): boolean {
  const normalized = text.toLowerCase().trim().replace(/[!?.,;:…]+$/, "").trim();
  return SHORT_AFFIRM.has(normalized);
}

/**
 * Extract the quoted text from a Telegram reply-quote header.
 *
 * Telegram formats reply-quotes as:
 *   [В ответ на «QUOTED_TEXT»]
 *   или
 *   [В ответ на <name>: «QUOTED_TEXT»]
 *
 * Returns the text inside «...» or null if not found.
 */
export function extractReplyQuote(text: string): string | null {
  // Match: «...» anywhere in the first line (Telegram prepends this header)
  const match = text.match(/[«""]([^»""]{3,300})[»""]/);
  if (!match) return null;
  return match[1] ?? null;
}

/**
 * Should we force SAME without calling the classifier?
 *
 * Returns true when any of:
 * - dt < 30s and no bot response in between (burst-merge scenario) — caller must set hasReplyQuote false for this
 * - text is a short affirmation AND dt < 60s
 * - prevWasPhotoBurst is true
 */
export function shouldForceSame(opts: {
  text: string;
  dtSinceLastUserMs: number;
  prevWasPhotoBurst: boolean;
  hasReplyQuote: boolean;
}): boolean {
  const { text, dtSinceLastUserMs, prevWasPhotoBurst, hasReplyQuote } = opts;

  // Photo bursts are always same topic
  if (prevWasPhotoBurst) return true;

  // Short affirmation within 60 seconds = continuation
  if (isShortAffirm(text) && dtSinceLastUserMs < 60_000) return true;

  // Very fast follow-up with no reply-quote = likely burst continuation
  if (dtSinceLastUserMs < 30_000 && !hasReplyQuote) return true;

  return false;
}
