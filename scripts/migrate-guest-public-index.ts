#!/usr/bin/env bun
/**
 * Migrate /opt/vault/<userId>/public/index.html for existing guests.
 *
 * bootstrapNewGuestDir writes the current renderHowToSetupGuide() page to
 * public/index.html only for brand-new guests. Existing guests are stuck
 * with whatever placeholder was generated when they joined (some have a
 * one-line "Hello! My page" stub pointing at jinru.pro/u/<id>/).
 *
 * This script overwrites public/index.html with the current template only
 * if the file looks like an unmodified placeholder (small file, contains
 * known placeholder marker). Backs up the old file before writing.
 *
 * Usage:
 *   bun run scripts/migrate-guest-public-index.ts --dry-run
 *   bun run scripts/migrate-guest-public-index.ts
 *   bun run scripts/migrate-guest-public-index.ts --force   # overwrite even modified files
 */

import {
  readdirSync,
  readFileSync,
  writeFileSync,
  existsSync,
  copyFileSync,
  statSync,
  mkdirSync,
} from "fs";
import { renderHowToSetupGuide } from "../src/templates/landing";

const VAULT_ROOT = process.env.VAULT_ROOT || "/opt/vault";
const DRY_RUN = process.argv.includes("--dry-run");
const FORCE = process.argv.includes("--force");

if (!existsSync(VAULT_ROOT)) {
  console.error(`Vault root not found: ${VAULT_ROOT}`);
  process.exit(1);
}

// Markers identifying the old placeholder template, so we don't accidentally
// overwrite a guest's hand-edited page.
const PLACEHOLDER_MARKERS = [
  "Hello!",
  "My page",
  "This page is at proboi.site",
  "This page is at jinru.pro",
];

function isPlaceholder(content: string): boolean {
  if (content.length > 800) return false;
  return PLACEHOLDER_MARKERS.some((m) => content.includes(m));
}

const today = new Date().toISOString().split("T")[0];
const newContent = renderHowToSetupGuide();

let migrated = 0;
let unchanged = 0;
let skippedModified = 0;
let skippedOther = 0;

const dirs = readdirSync(VAULT_ROOT);
for (const dir of dirs) {
  const userId = parseInt(dir, 10);
  if (isNaN(userId)) {
    skippedOther++;
    continue;
  }

  const vaultDir = `${VAULT_ROOT}/${userId}`;
  if (!statSync(vaultDir).isDirectory()) {
    skippedOther++;
    continue;
  }

  const publicDir = `${vaultDir}/public`;
  const indexHtml = `${publicDir}/index.html`;

  if (!existsSync(publicDir)) {
    if (!DRY_RUN) mkdirSync(publicDir, { recursive: true });
    if (!DRY_RUN) writeFileSync(indexHtml, newContent);
    console.log(
      `[created]   ${userId}: no public/, created with new template${DRY_RUN ? " (dry-run)" : ""}`
    );
    migrated++;
    continue;
  }

  if (!existsSync(indexHtml)) {
    if (!DRY_RUN) writeFileSync(indexHtml, newContent);
    console.log(
      `[created]   ${userId}: no index.html, wrote new template${DRY_RUN ? " (dry-run)" : ""}`
    );
    migrated++;
    continue;
  }

  const current = readFileSync(indexHtml, "utf8");

  if (current === newContent) {
    console.log(`[unchanged] ${userId}: already current`);
    unchanged++;
    continue;
  }

  const placeholder = isPlaceholder(current);
  if (!placeholder && !FORCE) {
    console.log(
      `[skip-mod]  ${userId}: index.html looks user-edited (${current.length} chars), use --force to overwrite`
    );
    skippedModified++;
    continue;
  }

  const backup = `${indexHtml}.bak.${today}`;
  if (DRY_RUN) {
    console.log(
      `[would-mig] ${userId}: ${current.length} → ${newContent.length} chars (${placeholder ? "placeholder" : "FORCED user-edited"}, backup: ${backup})`
    );
  } else {
    copyFileSync(indexHtml, backup);
    writeFileSync(indexHtml, newContent);
    console.log(
      `[migrated]  ${userId}: ${current.length} → ${newContent.length} chars (${placeholder ? "placeholder" : "FORCED"}, backup: ${backup})`
    );
  }
  migrated++;
}

console.log("");
console.log(`Migrated:        ${migrated}${DRY_RUN ? " (dry-run)" : ""}`);
console.log(`Unchanged:       ${unchanged}`);
console.log(`Skipped (mod):   ${skippedModified}${FORCE ? "" : " (use --force to include)"}`);
console.log(`Skipped (other): ${skippedOther}`);
