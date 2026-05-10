#!/usr/bin/env bun
// Одноразовый скрипт: копирует дефолтные skills в vault существующих гостей
import fs from "node:fs";
import path from "node:path";

const VAULT_BASE = process.env.VAULT_BASE || "/opt/vault";
const SKILLS_SRC = path.join(import.meta.dir, "../skills");

const users = fs.readdirSync(VAULT_BASE).filter(u => !isNaN(Number(u)));
for (const userId of users) {
  const skillsDst = path.join(VAULT_BASE, userId, "skills");
  if (!fs.existsSync(skillsDst)) {
    fs.mkdirSync(skillsDst, { recursive: true });
  }
  for (const file of fs.readdirSync(SKILLS_SRC)) {
    if (file.endsWith(".md")) {
      fs.copyFileSync(
        path.join(SKILLS_SRC, file),
        path.join(skillsDst, file)
      );
      console.log(`Copied ${file} → ${skillsDst}`);
    }
  }
}
console.log("Migration done.");
