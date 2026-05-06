/**
 * Invite system — pending access requests from unknown users.
 *
 * Requests are stored as JSON files in /var/lib/claude-bot/pending/${userId}.json.
 * The owner approves or denies via inline keyboard buttons.
 */

import { mkdirSync, unlinkSync, readdirSync } from "fs";
import { pendingDir } from "./paths";

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
