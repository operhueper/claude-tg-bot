import type { Bot } from "grammy";
import { OWNER_USER_ID } from "./config";

// ---------------------------------------------------------------------------
// Suspicious-command patterns (V-30O)
// ---------------------------------------------------------------------------

/** Patterns that indicate a guest may be trying to exfiltrate secrets or escalate. */
const SUSPICIOUS_CMD_PATTERNS: RegExp[] = [
  /\bcat\s+\/etc\//i,
  /\bcat\s+.*\.(env|key|pem|crt|secret)/i,
  /\bcat\s+\/opt\/claude-tg-bot\//i,
  /\bhead\s+.*\.env/i,
  /\bprintenv\b/i,
  /\benv\b\s*$/i,
  /\bwget\s+http:\/\//i,
  /\bcurl\s+http:\/\//i,
  /\bssh\b/i,
  /\bscp\b/i,
  /\bchmod\s+[0-7]*[0-7][0-7]\s+\/etc\//i,
  /\/root\/\.(ssh|claude|config)/i,
];

let botRef: Bot | null = null;

export function registerAlertBot(b: Bot): void {
  botRef = b;
}

const rawChannelId = process.env.OWNER_PROBLEM_CHANNEL_ID;
if (rawChannelId && !/^-?\d+$/.test(rawChannelId)) {
  console.warn(
    `[owner-alerts] OWNER_PROBLEM_CHANNEL_ID "${rawChannelId}" невалидный (ожидается число). Используется DM.`
  );
}
const OWNER_PROBLEM_CHANNEL_ID =
  rawChannelId && /^-?\d+$/.test(rawChannelId) ? parseInt(rawChannelId, 10) : null;

async function send(chatId: number | string, text: string): Promise<void> {
  if (!botRef) {
    console.warn("[owner-alerts] bot ref not registered, skipping send");
    return;
  }
  try {
    await botRef.api.sendMessage(chatId, text, { parse_mode: "HTML" });
  } catch (e) {
    console.error(`[owner-alerts] sendMessage(${chatId}) failed:`, e);
  }
}

export async function notifyProblemChannel(text: string): Promise<void> {
  if (OWNER_PROBLEM_CHANNEL_ID !== null) {
    await send(OWNER_PROBLEM_CHANNEL_ID, text);
  } else {
    await send(OWNER_USER_ID, `[no channel set]\n${text}`);
  }
}

export async function notifyOwnerDM(text: string): Promise<void> {
  await send(OWNER_USER_ID, text);
}

export async function notifyGuest(userId: number, text: string): Promise<void> {
  await send(userId, text);
}

/**
 * V-30O: Alert the owner when a guest runs a command that matches a suspicious pattern.
 * Fires asynchronously — never blocks the caller.
 */
export function alertSuspiciousCommand(userId: number, cmd: string): void {
  const matched = SUSPICIOUS_CMD_PATTERNS.find((re) => re.test(cmd));
  if (!matched) return;
  const preview = cmd.length > 200 ? cmd.slice(0, 197) + "…" : cmd;
  const msg =
    `⚠️ <b>Подозрительная команда</b>\n` +
    `User: <code>${userId}</code>\n` +
    `Pattern: <code>${matched.source}</code>\n` +
    `Command: <code>${preview.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</code>`;
  notifyProblemChannel(msg).catch((e) =>
    console.error("[owner-alerts] alertSuspiciousCommand failed:", e)
  );
}
