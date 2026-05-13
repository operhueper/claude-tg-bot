#!/usr/bin/env bun
/**
 * Disable and remove guest-specific OpenRouter sub-keys.
 *
 * Контекст: 2026-05-13 гости переехали обратно с OpenRouter на native DeepSeek
 * (через пул ключей в system/deepseek-keys.json). Per-guest OR sub-keys больше
 * не нужны — этот скрипт удаляет их и чистит поле `openrouterKey` из users.json.
 *
 * Идемпотентен — если ключ уже удалён в OR, скрипт это переживёт.
 *
 * Запуск (на сервере):
 *   cd /opt/claude-tg-bot && OPENROUTER_PROVISIONING_KEY=sk-or-... bun run scripts/disable-openrouter-subkeys.ts
 *
 * Если `OPENROUTER_PROVISIONING_KEY` не задан — скрипт всё равно почистит
 * users.json локально, но удаление ключей со стороны OR не произойдёт.
 *
 * Vision (фото) и owner-text-fallback продолжают работать через общий
 * `OPENROUTER_API_KEY` — этот ключ не трогаем.
 */

import fs from "node:fs";
import path from "node:path";

const USERS_FILE = path.resolve(process.cwd(), "system/users.json");
const PROVISIONING_KEY = process.env.OPENROUTER_PROVISIONING_KEY ?? "";

interface UserNode {
  userId: number;
  openrouterKey?: string;
  [k: string]: unknown;
}

interface ORKey {
  hash: string;
  name?: string;
  label?: string;
  disabled?: boolean;
}

async function fetchAllSubKeys(): Promise<ORKey[]> {
  if (!PROVISIONING_KEY) return [];

  // OR API has cursor pagination via ?offset=
  const all: ORKey[] = [];
  let offset = 0;
  const PAGE_SIZE = 100;
  for (let i = 0; i < 50; i++) {
    const url = `https://openrouter.ai/api/v1/keys?offset=${offset}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${PROVISIONING_KEY}` },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "(unreadable)");
      throw new Error(`OR GET /keys failed: ${res.status} ${body}`);
    }
    const json = (await res.json()) as { data?: ORKey[] };
    const page = json.data ?? [];
    all.push(...page);
    if (page.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  return all;
}

async function deleteSubKey(hash: string): Promise<boolean> {
  const res = await fetch(
    `https://openrouter.ai/api/v1/keys/${encodeURIComponent(hash)}`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${PROVISIONING_KEY}` },
    }
  );
  if (!res.ok) {
    const body = await res.text().catch(() => "(unreadable)");
    console.warn(`  DELETE failed for ${hash}: ${res.status} ${body}`);
    return false;
  }
  return true;
}

function loadUsers(): UserNode[] {
  if (!fs.existsSync(USERS_FILE)) {
    console.error(`users.json not found at ${USERS_FILE}`);
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(USERS_FILE, "utf8")) as UserNode[];
}

function saveUsers(users: UserNode[]) {
  const tmp = `${USERS_FILE}.tmp.${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(users, null, 2), "utf8");
  fs.renameSync(tmp, USERS_FILE);
}

async function main() {
  const users = loadUsers();
  const guestsWithKey = users.filter((u) => typeof u.openrouterKey === "string" && u.openrouterKey);

  console.log(`Found ${guestsWithKey.length} guest(s) with provisioned OR subkey:`);
  for (const g of guestsWithKey) {
    console.log(`  - userId=${g.userId} label=${String(g.label ?? "")}`);
  }

  if (guestsWithKey.length === 0) {
    console.log("\nNothing to do — users.json clean.");
    return;
  }

  let allKeys: ORKey[] = [];
  if (PROVISIONING_KEY) {
    console.log("\nFetching subkey list from OpenRouter...");
    try {
      allKeys = await fetchAllSubKeys();
      console.log(`  Got ${allKeys.length} subkeys total in account.`);
    } catch (err) {
      console.error(`  Failed: ${(err as Error).message}`);
      console.error(`  Continuing — will still strip openrouterKey from users.json.`);
    }
  } else {
    console.log(
      "\nOPENROUTER_PROVISIONING_KEY not set — skipping OR-side deletion."
    );
    console.log(
      "  Run on the server with the provisioning key for full cleanup."
    );
  }

  for (const guest of guestsWithKey) {
    const expectedName = `guest-${guest.userId}`;
    const matches = allKeys.filter((k) => k.name === expectedName);
    if (PROVISIONING_KEY && matches.length === 0) {
      console.log(`  ${guest.userId}: no matching subkey in OR (already gone?)`);
    }
    for (const m of matches) {
      console.log(`  ${guest.userId}: deleting hash=${m.hash.slice(0, 10)}…`);
      await deleteSubKey(m.hash);
    }
    delete guest.openrouterKey;
  }

  saveUsers(users);
  console.log(`\nStripped openrouterKey from ${guestsWithKey.length} user(s) in users.json.`);
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
