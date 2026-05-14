/**
 * Container naming & filesystem layout.
 *
 * Single source of truth for where the bot keeps per-user Docker artefacts:
 * container names, named volumes, dropbox dirs (host-side mailbox the
 * container reads via /tmp/dropbox), per-user data dirs, and the pending
 * queue used while a container is being created.
 */

// V-30H: пинуем образ по digest, чтобы исключить «тихий» drift локально
// собранного :latest. Digest НЕ портативен между хостами — на каждом
// сервере получаем свой и кладём в .env как CLAUDE_SANDBOX_IMAGE.
// Как получить после сборки:
//   docker images --digests claude-user-sandbox
// Затем в .env на сервере:
//   CLAUDE_SANDBOX_IMAGE=claude-user-sandbox@sha256:<digest>
// Если переменная не задана — fallback на :latest (dev / fresh server).
export const SANDBOX_IMAGE = process.env.CLAUDE_SANDBOX_IMAGE || "claude-user-sandbox:latest";
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
