/**
 * Container naming & filesystem layout.
 *
 * Single source of truth for where the bot keeps per-user Docker artefacts:
 * container names, named volumes, dropbox dirs (host-side mailbox the
 * container reads via /tmp/dropbox), per-user data dirs, and the pending
 * queue used while a container is being created.
 */

export const SANDBOX_IMAGE = "claude-user-sandbox:latest";
export const BOT_DATA_DIR = "/var/lib/claude-bot";

export function containerName(userId: number): string {
  return `claude-user-${userId}`;
}

export function volumeName(userId: number): string {
  return `claude-user-${userId}-data`;
}

export function dropboxDir(userId: number): string {
  return `${BOT_DATA_DIR}/dropbox/${userId}`;
}

export function userDataDir(userId: number): string {
  return `${BOT_DATA_DIR}/users/${userId}`;
}

export function pendingDir(): string {
  return `${BOT_DATA_DIR}/pending`;
}
