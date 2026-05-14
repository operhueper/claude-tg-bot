#!/usr/bin/env bun
/**
 * Разовая диагностика: пингует каждый ключ из system/deepseek-keys.json
 * минимальным запросом к api.deepseek.com и печатает статус.
 *
 * Использование:
 *   bun run scripts/ping-deepseek-keys.ts                    # читает локальный system/deepseek-keys.json
 *   bun run scripts/ping-deepseek-keys.ts /path/to/keys.json # явный путь
 *
 * Безопасно для запуска на проде — только GET-like операция к DeepSeek,
 * ничего не пишет, ключи в выводе маскируются как sk-xxxx…last4.
 */
import fs from "node:fs";
import path from "node:path";

const DEFAULT_PATH = path.resolve(process.cwd(), "system/deepseek-keys.json");
const KEY_PATH = process.argv[2] || DEFAULT_PATH;

interface PingResult {
  mask: string;
  status: "ok" | "bad" | "error";
  httpStatus?: number;
  reason?: string;
  ms: number;
}

function mask(k: string): string {
  if (k.length <= 12) return "sk-***";
  return `${k.slice(0, 6)}…${k.slice(-4)}`;
}

async function pingOne(key: string): Promise<PingResult> {
  const start = Date.now();
  const m = mask(key);
  try {
    const resp = await fetch("https://api.deepseek.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [{ role: "user", content: "ping" }],
        max_tokens: 1,
        stream: false,
      }),
    });
    const ms = Date.now() - start;
    if (resp.ok) {
      return { mask: m, status: "ok", httpStatus: resp.status, ms };
    }
    const body = await resp.text().catch(() => "");
    // Никогда не печатаем сырой body — он может содержать остаток ключа.
    const codeMatch = body.match(/"code"\s*:\s*"([^"]+)"/);
    const typeMatch = body.match(/"type"\s*:\s*"([^"]+)"/);
    const reason = codeMatch?.[1] || typeMatch?.[1] || `HTTP ${resp.status}`;
    return { mask: m, status: "bad", httpStatus: resp.status, reason, ms };
  } catch (err) {
    return {
      mask: m,
      status: "error",
      reason: (err as Error).message.slice(0, 80),
      ms: Date.now() - start,
    };
  }
}

async function main() {
  if (!fs.existsSync(KEY_PATH)) {
    console.error(`Файл не найден: ${KEY_PATH}`);
    process.exit(1);
  }
  const raw = fs.readFileSync(KEY_PATH, "utf8");
  const parsed = JSON.parse(raw) as { keys?: unknown };
  if (!Array.isArray(parsed.keys)) {
    console.error("Невалидный формат: ожидался { keys: [...] }");
    process.exit(1);
  }
  const keys = parsed.keys.filter(
    (k): k is string => typeof k === "string" && k.startsWith("sk-")
  );
  console.log(`Пингую ${keys.length} ключей из ${KEY_PATH}\n`);

  const results = await Promise.all(keys.map(pingOne));

  const okCount = results.filter((r) => r.status === "ok").length;
  const badCount = results.filter((r) => r.status === "bad").length;
  const errCount = results.filter((r) => r.status === "error").length;

  console.log("┌─────────────────┬────────┬──────┬──────────────────────────┐");
  console.log("│ ключ            │ статус │  мс  │ причина                  │");
  console.log("├─────────────────┼────────┼──────┼──────────────────────────┤");
  for (const r of results) {
    const status =
      r.status === "ok" ? "✅ OK  " : r.status === "bad" ? "❌ BAD " : "⚠️  ERR";
    const reason = (r.reason ?? "").padEnd(24).slice(0, 24);
    const ms = String(r.ms).padStart(4);
    console.log(`│ ${r.mask.padEnd(15)} │ ${status} │ ${ms} │ ${reason} │`);
  }
  console.log("└─────────────────┴────────┴──────┴──────────────────────────┘");
  console.log(
    `\nИтог: ${okCount} живых, ${badCount} битых, ${errCount} сетевых ошибок (всего ${keys.length})`
  );

  if (badCount > 0) {
    const bad = results
      .filter((r) => r.status === "bad")
      .map((r) => r.mask)
      .join(", ");
    console.log(`Битые ключи нужно убрать из system/deepseek-keys.json: ${bad}`);
  }
}

main().catch((err) => {
  console.error("Скрипт упал:", err);
  process.exit(1);
});
