/**
 * Retroactively provision per-user OpenRouter subkeys for all guests
 * who were approved before the provisioning API was wired up.
 *
 * Usage:
 *   bun run scripts/backfill-openrouter-subkeys.ts [--dry-run]
 *
 * Requires OPENROUTER_PROVISIONING_KEY in env.
 * Safe to re-run — skips users who already have a key in users.json.
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve } from "path";

const DRY_RUN = process.argv.includes("--dry-run");
const USERS_FILE = resolve(process.cwd(), "system/users.json");
const PROVISIONING_KEY = process.env.OPENROUTER_PROVISIONING_KEY ?? "";
const LIMIT_USD = parseFloat(process.env.OPENROUTER_GUEST_LIMIT_USD ?? "2.0");

if (!PROVISIONING_KEY && !DRY_RUN) {
  console.error("ERROR: OPENROUTER_PROVISIONING_KEY not set");
  process.exit(1);
}

interface UserNode {
  userId: number;
  role?: string;
  openrouterKey?: string;
  label?: string;
  firstName?: string;
  username?: string;
}

async function createSubKey(userId: number, label: string): Promise<string | null> {
  if (DRY_RUN) {
    console.log(`  [dry-run] would create subkey for ${userId} (${label})`);
    return "sk-or-v1-dryrun";
  }
  const res = await fetch("https://openrouter.ai/api/v1/keys", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${PROVISIONING_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name: `guest-${userId}`, label, limit: LIMIT_USD }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "(unreadable)");
    console.error(`  ERROR HTTP ${res.status}: ${body}`);
    return null;
  }
  const json = (await res.json()) as { data?: { key?: string } };
  return json?.data?.key ?? null;
}

async function main() {
  if (!existsSync(USERS_FILE)) {
    console.error(`Users file not found: ${USERS_FILE}`);
    process.exit(1);
  }

  const users: UserNode[] = JSON.parse(readFileSync(USERS_FILE, "utf-8"));
  const guests = users.filter((u) => u.role !== "owner");

  const withKey = guests.filter((u) => u.openrouterKey);
  const withoutKey = guests.filter((u) => !u.openrouterKey);

  console.log(`Total guests: ${guests.length}`);
  console.log(`Already provisioned: ${withKey.length}`);
  console.log(`Need provisioning: ${withoutKey.length}`);
  if (DRY_RUN) console.log("(dry-run mode — no changes will be made)");
  console.log();

  let provisioned = 0;
  let failed = 0;

  for (const user of withoutKey) {
    const displayName = user.label ?? user.firstName ?? user.username ?? String(user.userId);
    process.stdout.write(`  Provisioning ${user.userId} (${displayName})... `);

    const key = await createSubKey(user.userId, displayName);
    if (key) {
      user.openrouterKey = key;
      console.log(`OK ($${LIMIT_USD} limit)`);
      provisioned++;
    } else {
      console.log("FAILED — skipping");
      failed++;
    }

    // Throttle to avoid hitting the provisioning API rate limit
    await new Promise((r) => setTimeout(r, 300));
  }

  if (!DRY_RUN && provisioned > 0) {
    writeFileSync(USERS_FILE, JSON.stringify(users, null, 2) + "\n");
    console.log(`\nSaved ${USERS_FILE}`);
  }

  console.log(`\nDone: ${provisioned} provisioned, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
