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
 *
 * Карантин: при 401/403 ключ помечается unhealthy на 5 минут и пропускается
 * в ротации. После 3 неудачных проб подряд карантин продлевается до 1 часа.
 * Это защищает от случая «один битый ключ в пуле ловит почти все запросы»
 * (потому что у него inFlight всегда 0 — запросы быстро падают).
 */

import fs from "node:fs";
import path from "node:path";

interface KeyState {
  key: string;
  inFlight: number;
  lastUsedMs: number;
  /** Если > now — ключ в карантине, не выбираем. */
  quarantinedUntilMs: number;
  /** Сколько подряд неудачных проб (растёт при каждом 401/403, сбрасывается при успехе). */
  failCount: number;
  /** Причина последнего карантина — для /keypool диагностики. */
  lastFailReason: string;
}

const POOL_FILE = path.resolve(process.cwd(), "system/deepseek-keys.json");

const QUARANTINE_BASE_MS = 5 * 60 * 1000;   // 5 минут на первую ошибку
const QUARANTINE_LONG_MS = 60 * 60 * 1000;  // 1 час после 3 подряд

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

  pool = loaded.map((key) => ({
    key,
    inFlight: 0,
    lastUsedMs: 0,
    quarantinedUntilMs: 0,
    failCount: 0,
    lastFailReason: "",
  }));

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
export function deepseekPoolSnapshot(): Array<{
  key: string;
  inFlight: number;
  lastUsedMs: number;
  healthy: boolean;
  quarantinedUntilMs: number;
  failCount: number;
  lastFailReason: string;
}> {
  const now = Date.now();
  return loadPool().map((s) => ({
    key: maskKey(s.key),
    inFlight: s.inFlight,
    lastUsedMs: s.lastUsedMs,
    healthy: s.quarantinedUntilMs <= now,
    quarantinedUntilMs: s.quarantinedUntilMs,
    failCount: s.failCount,
    lastFailReason: s.lastFailReason,
  }));
}

function maskKey(k: string): string {
  if (k.length <= 12) return "sk-***";
  return `${k.slice(0, 6)}…${k.slice(-4)}`;
}

/** Внешний helper — замаскированный last4 для логов/redact'а. */
export function maskDeepSeekKey(k: string): string {
  return maskKey(k);
}

/**
 * Захватить ключ из пула.
 *
 * Возвращает {key, release, reportFailure}. release() ОБЯЗАТЕЛЬНО вызвать в finally —
 * иначе счётчик не упадёт и ключ застрянет «занятым». reportFailure(reason) вызывать
 * перед release() если запрос упал с 401/403 — ключ уйдёт в карантин.
 *
 * Логика выбора:
 *   1. Пропускаем ключи в карантине (quarantinedUntilMs > now).
 *   2. Минимальный inFlight.
 *   3. При равенстве — самый старый по lastUsedMs (равномерная ротация).
 *
 * Очереди нет: если все здоровые ключи заняты, выдаст самый свободный из них.
 *
 * Возвращает null если пул пуст или все ключи в карантине.
 */
export function acquireDeepSeekKey():
  | { key: string; release: () => void; reportFailure: (reason: string) => void }
  | null {
  const states = loadPool();
  if (states.length === 0) return null;

  const now = Date.now();
  const healthy = states.filter((s) => s.quarantinedUntilMs <= now);
  if (healthy.length === 0) {
    console.warn(
      `[deepseek-pool] Все ${states.length} ключей в карантине — следующий запрос упадёт`
    );
    return null;
  }

  let chosen: KeyState = healthy[0]!;
  for (let i = 1; i < healthy.length; i++) {
    const s = healthy[i]!;
    if (
      s.inFlight < chosen.inFlight ||
      (s.inFlight === chosen.inFlight && s.lastUsedMs < chosen.lastUsedMs)
    ) {
      chosen = s;
    }
  }

  chosen.inFlight += 1;
  chosen.lastUsedMs = now;

  const target = chosen;
  let released = false;
  let failureReported = false;

  const release = () => {
    if (released) return;
    released = true;
    target.inFlight = Math.max(0, target.inFlight - 1);
  };

  const reportFailure = (reason: string) => {
    if (failureReported) return;
    failureReported = true;
    target.failCount += 1;
    target.lastFailReason = reason.slice(0, 80);
    const quarantineMs =
      target.failCount >= 3 ? QUARANTINE_LONG_MS : QUARANTINE_BASE_MS;
    target.quarantinedUntilMs = Date.now() + quarantineMs;
    console.warn(
      `[deepseek-pool] Ключ ${maskKey(target.key)} в карантине на ${
        quarantineMs / 60000
      } мин (failCount=${target.failCount}, reason=${target.lastFailReason})`
    );
  };

  return { key: target.key, release, reportFailure };
}

/**
 * Помечает ключ как восстановленный (сбрасывает карантин и failCount).
 * Вызывается при успешном использовании ключа после периода карантина.
 */
export function markDeepSeekKeyHealthy(key: string): void {
  const states = loadPool();
  const state = states.find((s) => s.key === key);
  if (!state) return;
  if (state.failCount > 0 || state.quarantinedUntilMs > 0) {
    console.log(`[deepseek-pool] Ключ ${maskKey(key)} восстановлен`);
  }
  state.failCount = 0;
  state.quarantinedUntilMs = 0;
  state.lastFailReason = "";
}

/**
 * Перезагрузить пул из файла. Для админских команд — добавил/убрал ключи
 * без рестарта. Текущие in-flight счётчики сбрасываются.
 */
export function reloadDeepSeekPool(): number {
  pool = null;
  return loadPool().length;
}

/**
 * Startup health-check: пингует каждый ключ минимальным запросом к DeepSeek.
 * Битые сразу помечаются в карантин с failCount=3 (long quarantine), чтобы
 * не попасть в первую ротацию живому пользователю.
 *
 * Все ключи пингуются параллельно. Таймаут на один пинг — 10 секунд.
 * Не блокирует загрузку бота если DeepSeek недоступен (network error → пропускаем).
 *
 * Вызывается из src/index.ts один раз при старте.
 */
export async function healthCheckDeepSeekPool(): Promise<{
  total: number;
  healthy: number;
  unhealthy: number;
}> {
  const states = loadPool();
  if (states.length === 0) {
    return { total: 0, healthy: 0, unhealthy: 0 };
  }

  console.log(`[deepseek-pool] Health-check: пингую ${states.length} ключей...`);

  const results = await Promise.all(
    states.map(async (state) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10_000);
      try {
        const resp = await fetch(
          "https://api.deepseek.com/v1/chat/completions",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${state.key}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "deepseek-chat",
              messages: [{ role: "user", content: "ping" }],
              max_tokens: 1,
              stream: false,
            }),
            signal: controller.signal,
          }
        );
        if (resp.ok) {
          return { state, healthy: true, reason: "" };
        }
        // 401/403 — точно мёртвый ключ. 5xx/429 — временно, не караним.
        if (resp.status === 401 || resp.status === 403) {
          return {
            state,
            healthy: false,
            reason: `HTTP ${resp.status} on startup`,
          };
        }
        return { state, healthy: true, reason: "" };
      } catch (err) {
        // Сетевая ошибка — DeepSeek может быть недоступен, не караним.
        const msg = (err as Error).message || "network error";
        console.warn(
          `[deepseek-pool] health-check для ${maskKey(state.key)}: ${msg}`
        );
        return { state, healthy: true, reason: "" };
      } finally {
        clearTimeout(timer);
      }
    })
  );

  let healthy = 0;
  let unhealthy = 0;
  for (const r of results) {
    if (r.healthy) {
      healthy++;
    } else {
      unhealthy++;
      r.state.failCount = 3; // сразу long quarantine
      r.state.lastFailReason = r.reason;
      r.state.quarantinedUntilMs = Date.now() + QUARANTINE_LONG_MS;
    }
  }

  if (unhealthy > 0) {
    const dead = results
      .filter((r) => !r.healthy)
      .map((r) => maskKey(r.state.key))
      .join(", ");
    console.warn(
      `[deepseek-pool] Health-check: ${healthy} живых, ${unhealthy} битых (${dead})`
    );
  } else {
    console.log(
      `[deepseek-pool] Health-check: все ${healthy} ключей живые`
    );
  }

  return { total: states.length, healthy, unhealthy };
}
