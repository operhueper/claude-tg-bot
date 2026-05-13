/**
 * DeepSeek API key pool.
 *
 * Раздаёт ключи гостям по принципу «наименее занятый сейчас»: для каждого
 * ключа считаем число запросов в работе (in-flight) и выдаём тот, у кого
 * счётчик минимальный. Tie-break — кто дольше не использовался.
 *
 * Цель — не нагружать один ключ несколькими одновременными запросами от
 * разных пользователей, чтобы скорость ответа была стабильной.
 *
 * Источник ключей: system/deepseek-keys.json (gitignored, per-host).
 * Формат: { "keys": ["sk-...", "sk-..."] }
 *
 * Fallback: если файла нет, читаем DEEPSEEK_API_KEY из env как одиночный
 * ключ (совместимость со старой конфигурацией).
 */

import fs from "node:fs";
import path from "node:path";

interface KeyState {
  key: string;
  inFlight: number;
  lastUsedMs: number;
}

const POOL_FILE = path.resolve(process.cwd(), "system/deepseek-keys.json");

let pool: KeyState[] | null = null;

function loadPool(): KeyState[] {
  if (pool) return pool;

  const seen = new Set<string>();
  const loaded: string[] = [];

  // 1) Главный источник — файл system/deepseek-keys.json
  try {
    if (fs.existsSync(POOL_FILE)) {
      const raw = fs.readFileSync(POOL_FILE, "utf8");
      const parsed = JSON.parse(raw) as { keys?: unknown };
      if (Array.isArray(parsed.keys)) {
        for (const k of parsed.keys) {
          if (typeof k === "string" && k.startsWith("sk-") && !seen.has(k)) {
            seen.add(k);
            loaded.push(k);
          }
        }
      }
    }
  } catch (err) {
    console.warn(
      "[deepseek-pool] Failed to read system/deepseek-keys.json:",
      err
    );
  }

  // 2) Fallback — одиночный ключ из env (legacy)
  const envKey = process.env.DEEPSEEK_API_KEY;
  if (envKey && envKey.startsWith("sk-") && !seen.has(envKey)) {
    seen.add(envKey);
    loaded.push(envKey);
  }

  pool = loaded.map((key) => ({ key, inFlight: 0, lastUsedMs: 0 }));

  if (pool.length === 0) {
    console.warn(
      "[deepseek-pool] No DeepSeek keys found (neither system/deepseek-keys.json nor DEEPSEEK_API_KEY env)."
    );
  } else {
    console.log(
      `[deepseek-pool] Loaded ${pool.length} DeepSeek key(s).`
    );
  }

  return pool;
}

/**
 * Возвращает true если хотя бы один ключ доступен.
 * Дешёвая проверка — без захвата ключа.
 */
export function hasAnyDeepSeekKey(): boolean {
  return loadPool().length > 0;
}

/**
 * Количество ключей в пуле — для логов/диагностики.
 */
export function deepseekPoolSize(): number {
  return loadPool().length;
}

/**
 * Снимок состояния пула — для диагностических эндпоинтов.
 * Ключи маскируются (sk-xxxx…last4).
 */
export function deepseekPoolSnapshot(): Array<{ key: string; inFlight: number; lastUsedMs: number }> {
  return loadPool().map((s) => ({
    key: maskKey(s.key),
    inFlight: s.inFlight,
    lastUsedMs: s.lastUsedMs,
  }));
}

function maskKey(k: string): string {
  if (k.length <= 12) return "sk-***";
  return `${k.slice(0, 6)}…${k.slice(-4)}`;
}

/**
 * Захватить ключ из пула.
 *
 * Возвращает {key, release}. release() ОБЯЗАТЕЛЬНО вызвать в finally —
 * иначе счётчик не упадёт и ключ застрянет «занятым».
 *
 * Логика выбора:
 *   1. Минимальный inFlight.
 *   2. При равенстве — самый старый по lastUsedMs (равномерная ротация).
 *
 * Очереди нет: даже если все ключи заняты, всё равно вернётся самый
 * свободный из них (просто его inFlight будет >0).
 *
 * Возвращает null если пул пуст.
 */
export function acquireDeepSeekKey(): { key: string; release: () => void } | null {
  const states = loadPool();
  if (states.length === 0) return null;

  let chosen: KeyState = states[0]!;
  for (let i = 1; i < states.length; i++) {
    const s = states[i]!;
    if (
      s.inFlight < chosen.inFlight ||
      (s.inFlight === chosen.inFlight && s.lastUsedMs < chosen.lastUsedMs)
    ) {
      chosen = s;
    }
  }

  chosen.inFlight += 1;
  chosen.lastUsedMs = Date.now();

  const target = chosen;
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    target.inFlight = Math.max(0, target.inFlight - 1);
  };

  return { key: target.key, release };
}

/**
 * Перезагрузить пул из файла. Для админских команд — добавил/убрал ключи
 * без рестарта. Текущие in-flight счётчики сбрасываются.
 */
export function reloadDeepSeekPool(): number {
  pool = null;
  return loadPool().length;
}
