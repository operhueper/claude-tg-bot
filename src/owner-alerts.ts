import type { Bot } from "grammy";
import { OWNER_USER_ID } from "./config";

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
