import type { Bot } from "grammy";
import { OWNER_USER_ID } from "./config";

let botRef: Bot | null = null;

export function registerAlertBot(b: Bot): void {
  botRef = b;
}

const OWNER_PROBLEM_CHANNEL_ID = process.env.OWNER_PROBLEM_CHANNEL_ID || "";

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
  if (OWNER_PROBLEM_CHANNEL_ID) {
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
