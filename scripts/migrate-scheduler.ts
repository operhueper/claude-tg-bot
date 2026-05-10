#!/usr/bin/env bun
// Одноразовый скрипт: добавляет bot-scheduler в .daemons.yaml существующих гостей.
// Запуск: VAULT_BASE=/opt/vault bun scripts/migrate-scheduler.ts
import fs from "node:fs";
import path from "node:path";

const VAULT_BASE = process.env.VAULT_BASE || "/opt/vault";

const SCHEDULER_ENTRY = (userId: string) =>
  [
    "  - name: bot-scheduler",
    `    cmd: ["/usr/local/bin/bot-scheduler"]`,
    "    workdir: /workspace",
    "    env:",
    `      NOTIFY_USER_ID: "${userId}"`,
    `      NOTIFY_BRIDGE_URL: "http://172.18.0.1:3849/notify"`,
    "    enabled: true",
  ].join("\n");

const users = fs.readdirSync(VAULT_BASE).filter((u) => !isNaN(Number(u)));
for (const userId of users) {
  const daemonsPath = path.join(VAULT_BASE, userId, ".daemons.yaml");

  if (!fs.existsSync(daemonsPath)) {
    // Create from scratch
    fs.writeFileSync(
      daemonsPath,
      `daemons:\n${SCHEDULER_ENTRY(userId)}\n`
    );
    console.log(`Created ${daemonsPath}`);
    continue;
  }

  const content = fs.readFileSync(daemonsPath, "utf8");
  if (content.includes("bot-scheduler")) {
    console.log(`${daemonsPath}: bot-scheduler already present, skip`);
    continue;
  }

  // Append scheduler entry to existing daemons list
  const patched = content.trimEnd() + "\n" + SCHEDULER_ENTRY(userId) + "\n";
  fs.writeFileSync(daemonsPath, patched);
  console.log(`Patched ${daemonsPath}`);
}
console.log("Migration done.");
