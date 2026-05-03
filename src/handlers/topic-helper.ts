/**
 * Helper for auto-/new on topic change.
 * Shared across text, voice, photo, document handlers.
 */

import type { Context } from "grammy";
import type { ClaudeSession } from "../session";

/**
 * If the session is active and topic detection fires, kills the current session
 * (triggering background memory analysis) and notifies the user.
 *
 * Returns true if a topic change was detected and the session was reset.
 * Callers should treat the message as starting a new session in that case.
 */
export async function maybeAutoNew(
  session: ClaudeSession,
  message: string,
  ctx: Context
): Promise<boolean> {
  if (!session.isActive) return false;

  try {
    const topicChanged = await session.checkTopicChange(message);
    if (!topicChanged) return false;

    // Kill the old session — this triggers background memory analysis
    await session.kill();

    await ctx.reply(
      "🧠 <i>Новая тема — сохраняю предыдущий разговор в память.</i>",
      { parse_mode: "HTML" }
    );

    // Set new conversation title
    const title = message.length > 50 ? message.slice(0, 47) + "..." : message;
    session.conversationTitle = title;

    return true;
  } catch (err) {
    console.warn("[topic-helper] maybeAutoNew failed:", err);
    return false;
  }
}
