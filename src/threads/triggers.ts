/**
 * Trigger detection layer (Layer 2) for topic-parking.
 *
 * Detects strong signals that warrant calling the LLM classifier:
 * - Recall markers ("помнишь", "вернёмся к", etc.)
 * - Long pause (>2h) before a new message
 * - Reply-quote to a message from >1h ago
 *
 * Pure functions — no side effects, no async.
 */

/** Recall marker patterns — Russian phrases that signal intent to resume an old topic. */
const RECALL_MARKERS: RegExp[] = [
  /\bпомнишь\b/i,
  /\bвспомни\b/i,
  /\bтот\b/i,
  /\bта же\b/i,
  /\bто наш\b/i,
  /\bмы делали\b/i,
  /\bвернёмся к\b/i,
  /\bвернемся к\b/i,
  /\bобратно к\b/i,
  /\bкак мы говорили про\b/i,
  /\bпомнишь, мы\b/i,
  /\bтот проект\b/i,
  /\bта задача\b/i,
  /\bто задание\b/i,
];

/**
 * Returns true if the text contains any recall marker.
 */
export function hasRecallMarker(text: string): boolean {
  return RECALL_MARKERS.some(re => re.test(text));
}

/**
 * Returns true if the time delta exceeds the given number of hours.
 */
export function isPauseLongerThan(dtMs: number, hours: number): boolean {
  return dtMs > hours * 60 * 60 * 1000;
}

/**
 * Returns true if any Layer 2 trigger fires for this message.
 *
 * When a trigger fires, Layer 3 (LLM classifier) should be called.
 * When no trigger fires, message is SAME without calling LLM.
 *
 * Note: reply-quote age check is simplified — we just check if hasReplyQuote
 * is true AND pause > 1h, as we don't have the original message timestamp here.
 */
export function hasAnyTrigger(opts: {
  text: string;
  dtSinceLastUserMs: number;
  hasReplyQuote: boolean;
  replyQuoteText: string | null;
}): boolean {
  const { text, dtSinceLastUserMs, hasReplyQuote, replyQuoteText } = opts;

  // Recall markers always trigger
  if (hasRecallMarker(text)) return true;

  // Long pause (>2h) always triggers
  if (isPauseLongerThan(dtSinceLastUserMs, 2)) return true;

  // Reply-quote to an old turn (>1h pause) triggers with anchor trade
  if (hasReplyQuote && replyQuoteText && isPauseLongerThan(dtSinceLastUserMs, 1)) {
    return true;
  }

  return false;
}
