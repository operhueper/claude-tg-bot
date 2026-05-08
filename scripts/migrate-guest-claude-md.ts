#!/usr/bin/env bun
/**
 * Migrate CLAUDE.md for existing guests in /opt/vault/<userId>/.
 *
 * bootstrapNewGuestDir creates the file only if it doesn't exist, so guests
 * who joined before a CLAUDE.md template change keep stale instructions
 * forever. This is a one-shot script that overwrites every guest's CLAUDE.md
 * with the current template, after taking a dated backup next to it.
 *
 * Usage:
 *   bun run scripts/migrate-guest-claude-md.ts --dry-run   # preview only
 *   bun run scripts/migrate-guest-claude-md.ts             # apply
 *
 * Designed to be run on the prod server inside /opt/claude-tg-bot/.
 */

import {
  readdirSync,
  readFileSync,
  writeFileSync,
  existsSync,
  copyFileSync,
  statSync,
} from "fs";
import { generateGuestClaudeMd } from "../src/templates/guest-claude-md";

const VAULT_ROOT = process.env.VAULT_ROOT || "/opt/vault";
const DRY_RUN = process.argv.includes("--dry-run");

if (!existsSync(VAULT_ROOT)) {
  console.error(`Vault root not found: ${VAULT_ROOT}`);
  process.exit(1);
}

const today = new Date().toISOString().split("T")[0];
let migrated = 0;
let skipped = 0;
let unchanged = 0;

const dirs = readdirSync(VAULT_ROOT);
for (const dir of dirs) {
  const userId = parseInt(dir, 10);
  if (isNaN(userId)) {
    skipped++;
    continue;
  }

  const vaultDir = `${VAULT_ROOT}/${userId}`;
  if (!statSync(vaultDir).isDirectory()) {
    skipped++;
    continue;
  }

  const claudeMd = `${vaultDir}/CLAUDE.md`;
  if (!existsSync(claudeMd)) {
    console.log(`[skip] ${userId}: no CLAUDE.md`);
    skipped++;
    continue;
  }

  const current = readFileSync(claudeMd, "utf8");
  const next = generateGuestClaudeMd(userId, vaultDir);

  if (current === next) {
    console.log(`[unchanged] ${userId}: already current`);
    unchanged++;
    continue;
  }

  const backup = `${claudeMd}.bak.${today}`;
  if (DRY_RUN) {
    console.log(
      `[would-migrate] ${userId}: ${current.length} → ${next.length} chars (backup: ${backup})`
    );
  } else {
    copyFileSync(claudeMd, backup);
    writeFileSync(claudeMd, next);
    console.log(
      `[migrated]  ${userId}: ${current.length} → ${next.length} chars (backup: ${backup})`
    );
  }
  migrated++;
}

console.log("");
console.log(`Migrated:  ${migrated}${DRY_RUN ? " (dry-run)" : ""}`);
console.log(`Unchanged: ${unchanged}`);
console.log(`Skipped:   ${skipped}`);
