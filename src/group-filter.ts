/**
 * Group chat filter for Claude Telegram Bot.
 *
 * In group chats, Claude shouldn't respond to every message.
 * This module decides whether a message warrants a response.
 *
 * Logic:
 * 1. Gate: reject groups that are not in the allowed list (fail-closed)
 * 2. Hard-pass: explicit @mention or reply to bot → always respond
 * 3. Hard-skip: forwarded messages, bot's own messages → never respond
 */

import type { Context } from "grammy";
import { GROUP_CHAT_ID } from "./config";

// Bot username set at startup by index.ts
let BOT_USERNAME = "";

export function setBotUsername(username: string): void {
  BOT_USERNAME = username.toLowerCase().replace(/^@/, "");
}

export function getBotUsername(): string {
  return BOT_USERNAME;
}

/**
 * Check if this message is in a group/supergroup chat.
 */
export function isGroupChat(ctx: Context): boolean {
  const type = ctx.chat?.type;
  return type === "group" || type === "supergroup";
}

/**
 * Hard checks that bypass LLM classification.
 * Returns true if we should definitely respond, false if definitely skip,
 * null if unclear (needs LLM).
 */
function hardCheck(ctx: Context, botUsername: string): boolean | null {
  const msg = ctx.message;
  if (!msg) return false;

  // Skip forwarded messages
  if (msg.forward_origin || (msg as any).forward_from || (msg as any).forward_from_chat) {
    return false;
  }

  // Skip messages from bots
  if (msg.from?.is_bot) return false;

  const text = msg.text || msg.caption || "";

  // Always respond if bot is @mentioned
  if (botUsername && text.toLowerCase().includes(`@${botUsername}`)) {
    return true;
  }

  // Always respond if this is a reply to the bot's message
  const replyFrom = msg.reply_to_message?.from;
  if (replyFrom?.is_bot && replyFrom?.username?.toLowerCase() === botUsername) {
    return true;
  }

  // No hard signal — respond by default
  return true;
}


export interface GroupMessage {
  name: string;
  text: string;
  isBot: boolean;
}

// Short in-memory history of recent group messages per chat (for LLM context)
const groupHistory: Map<number, GroupMessage[]> = new Map();
const MAX_HISTORY = 10;

export function recordGroupMessage(chatId: number, msg: GroupMessage): void {
  if (!groupHistory.has(chatId)) {
    groupHistory.set(chatId, []);
  }
  const history = groupHistory.get(chatId)!;
  history.push(msg);
  if (history.length > MAX_HISTORY) {
    history.shift();
  }
}

export function getGroupHistory(chatId: number): GroupMessage[] {
  return groupHistory.get(chatId) || [];
}

/**
 * Main entry point. Returns true if bot should respond to this group message.
 *
 * Fail-closed: if GROUP_CHAT_ID is not configured (i.e. env var absent) the
 * default value in config.ts still applies. Any group chat whose id does NOT
 * match GROUP_CHAT_ID is silently ignored so rogue groups added by third
 * parties cannot drive the bot.
 */
export async function shouldRespondInGroup(ctx: Context): Promise<boolean> {
  const botUsername = BOT_USERNAME;
  const chatId = ctx.chat?.id;
  if (!chatId) return false;

  // Gate: only respond in the configured group chat.
  // GROUP_CHAT_ID is read from env (default -5115756668).  If a chat id does
  // not match, drop it — this prevents any user from adding the bot to an
  // arbitrary group and forcing it to respond.
  if (chatId !== GROUP_CHAT_ID) {
    console.log(`[group-filter] Rejected unknown group chat ${chatId} (expected ${GROUP_CHAT_ID})`);
    return false;
  }

  // Record this message in history
  const text = ctx.message?.text || ctx.message?.caption || "";
  const senderName = ctx.from?.first_name || ctx.from?.username || "User";
  const isBot = ctx.from?.is_bot || false;
  recordGroupMessage(chatId, { name: senderName, text, isBot });

  // Hard checks first (fast, no API call)
  const hard = hardCheck(ctx, botUsername);
  if (hard !== null) {
    console.log(`[group-filter] Hard check → ${hard ? "RESPOND" : "SKIP"}: "${text.slice(0, 50)}"`);
    return hard;
  }

  return true;
}
