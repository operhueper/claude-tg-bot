/**
 * Invite system — pending access requests from unknown users.
 *
 * Requests are stored as JSON files in /var/lib/claude-bot/pending/${userId}.json.
 * The owner approves or denies via inline keyboard buttons.
 */

import { mkdirSync, unlinkSync, readdirSync } from "fs";
import type { Context } from "grammy";
import { pendingDir } from "./paths";
import { ALLOWED_USERS, NEW_GUEST_USERS } from "../config";

export interface PendingInvite {
  userId: number;
  username?: string;
  firstName?: string;
  firstMessage: string;
  timestamp: number;
}

function inviteFile(userId: number): string {
  return `${pendingDir()}/${userId}.json`;
}

function ensurePendingDir(): void {
  mkdirSync(pendingDir(), { recursive: true });
}

export async function savePendingInvite(invite: PendingInvite): Promise<void> {
  try {
    ensurePendingDir();
    await Bun.write(inviteFile(invite.userId), JSON.stringify(invite, null, 2));
  } catch (err) {
    console.error(`[invites] Failed to save pending invite for ${invite.userId}:`, err);
    throw err;
  }
}

export async function getPendingInvite(userId: number): Promise<PendingInvite | null> {
  try {
    const file = Bun.file(inviteFile(userId));
    if (!(await file.exists())) return null;
    return await file.json() as PendingInvite;
  } catch (err) {
    console.error(`[invites] Failed to read pending invite for ${userId}:`, err);
    return null;
  }
}

export async function removePendingInvite(userId: number): Promise<void> {
  try {
    unlinkSync(inviteFile(userId));
  } catch {
    // Ignore: file may not exist
  }
}

/**
 * Handle access request from an unauthorized user.
 *
 * Saves a pending invite, notifies the owner with approve/deny buttons,
 * and replies to the requesting user. Idempotent: if an invite is already
 * pending, just tells the user to wait. Used by both `/start` and the
 * generic text handler.
 */
export async function requestAccess(
  ctx: Context,
  firstMessage: string
): Promise<void> {
  const userId = ctx.from?.id;
  if (!userId) return;

  const existing = await getPendingInvite(userId);
  if (existing) {
    await ctx.reply("Ваш запрос уже на рассмотрении.");
    return;
  }

  const firstName = ctx.from?.first_name;
  const userUsername = ctx.from?.username;

  await savePendingInvite({
    userId,
    username: userUsername,
    firstName,
    firstMessage,
    timestamp: Date.now(),
  });

  await ctx.reply("🔒 Доступ закрыт. Ваш запрос отправлен администратору.");

  // Owner = first user in ALLOWED_USERS who is NOT a guest
  const ownerId = ALLOWED_USERS.find((id) => !NEW_GUEST_USERS.includes(id));
  if (!ownerId) {
    console.error("[invites] No owner found in ALLOWED_USERS — cannot notify");
    return;
  }

  const displayName = firstName || userUsername || String(userId);
  const usernameLine = userUsername ? `\n🔗 @${userUsername}` : "";
  try {
    await ctx.api.sendMessage(
      ownerId,
      `🔔 Новый запрос доступа\n👤 ${displayName}${usernameLine}\n🆔 ${userId}\n💬 «${firstMessage.slice(0, 100)}»`,
      {
        reply_markup: {
          inline_keyboard: [
            [
              { text: "✅ Одобрить", callback_data: `invite_approve_${userId}` },
              { text: "❌ Отклонить", callback_data: `invite_deny_${userId}` },
            ],
          ],
        },
      }
    );
  } catch (err) {
    console.error("[invites] Failed to notify owner:", err);
  }
}

export async function listPendingInvites(): Promise<PendingInvite[]> {
  try {
    ensurePendingDir();
    const files = readdirSync(pendingDir()).filter((f) => f.endsWith(".json"));
    const invites: PendingInvite[] = [];
    for (const f of files) {
      try {
        const raw = await Bun.file(`${pendingDir()}/${f}`).json();
        invites.push(raw as PendingInvite);
      } catch (err) {
        console.error(`[invites] Failed to parse ${f}:`, err);
      }
    }
    return invites;
  } catch (err) {
    console.error("[invites] Failed to list pending invites:", err);
    return [];
  }
}
