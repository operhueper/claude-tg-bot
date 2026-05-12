import { readdirSync, readFileSync, renameSync, existsSync, statSync } from "fs";
import { join } from "path";
import { notifyGuest, notifyProblemChannel } from "./owner-alerts";

const VAULT_ROOT = "/opt/vault";
const POLL_INTERVAL_MS = 30_000;
const ALERT_COOLDOWN_MS = 60 * 60 * 1000;

interface CrashEvent {
  timestamp: string;
  daemon: string;
  last_excerpt: string;
}

function readEvent(path: string): CrashEvent | null {
  try {
    const raw = readFileSync(path, "utf-8");
    return JSON.parse(raw) as CrashEvent;
  } catch (e) {
    console.error(`[crashloop-watcher] cannot read ${path}:`, e);
    return null;
  }
}

async function processOnce(): Promise<void> {
  if (!existsSync(VAULT_ROOT)) return;

  let userDirs: string[];
  try {
    userDirs = readdirSync(VAULT_ROOT);
  } catch {
    return;
  }

  for (const userIdStr of userDirs) {
    const userId = Number(userIdStr);
    if (!Number.isFinite(userId)) continue;

    const eventsDir = join(VAULT_ROOT, userIdStr, ".daemons-events");
    if (!existsSync(eventsDir)) continue;

    let entries: string[];
    try {
      entries = readdirSync(eventsDir);
    } catch {
      continue;
    }

    for (const name of entries) {
      if (!name.endsWith("-crashloop.json")) continue;
      const path = join(eventsDir, name);
      const ev = readEvent(path);
      if (!ev) continue;

      const handledPath = path.replace(/\.json$/, ".handled.json");

      // Кулдаун: если по этому же демону уже алертили < 1 ч назад,
      // просто помечаем событие как обработанное, не дублируем шум.
      if (existsSync(handledPath)) {
        try {
          const ageMs = Date.now() - statSync(handledPath).mtimeMs;
          if (ageMs < ALERT_COOLDOWN_MS) {
            try {
              renameSync(path, handledPath);
            } catch {}
            console.log(
              `[crashloop-watcher] cooldown: skipping ${userId}/${ev.daemon} (last alert ${Math.round(ageMs / 1000)}s ago)`,
            );
            continue;
          }
        } catch {}
      }

      const userMsg =
        `⚠️ Твоя автоматизация <b>${escapeHtml(ev.daemon)}</b> упала 3 раза подряд за 10 минут — больше не перезапускаю.\n\n` +
        `Последняя ошибка: <code>${escapeHtml(ev.last_excerpt).slice(0, 400)}</code>\n\n` +
        `Проверь код или попроси меня починить. Если автоматизация и должна быть тяжёлой — возможно, нужен тариф побольше.`;

      const channelMsg =
        `🛑 Crashloop user=${userId} daemon=${escapeHtml(ev.daemon)}\n` +
        `Время: ${ev.timestamp}\n` +
        `Ошибка: <code>${escapeHtml(ev.last_excerpt).slice(0, 200)}</code>`;

      try {
        await notifyGuest(userId, userMsg);
        await notifyProblemChannel(channelMsg);
      } catch (e) {
        console.error(`[crashloop-watcher] notify failed for ${userId}/${ev.daemon}:`, e);
        // Mark as handled even on failure — prevents 429 spam on every 30s poll.
      }

      try {
        renameSync(path, handledPath);
      } catch (e) {
        console.error(`[crashloop-watcher] cannot rename ${path}:`, e);
      }
    }
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function startCrashloopWatcher(): void {
  if (!existsSync(VAULT_ROOT)) {
    console.log("[crashloop-watcher] vault root missing, skipping");
    return;
  }
  setInterval(() => {
    processOnce().catch((e) =>
      console.error("[crashloop-watcher] poll failed:", e),
    );
  }, POLL_INTERVAL_MS);
  console.log(`[crashloop-watcher] started (interval ${POLL_INTERVAL_MS / 1000}s)`);
}
