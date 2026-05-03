/**
 * One-shot script: imports HANDOFF.md into the owner's memory graph.
 * Usage: bun run scripts/import-handoff.ts
 * Expected to run in the repo root on the prod server (or wherever graph.json is reachable).
 *
 * Uses the native Claude CLI subprocess directly to avoid SDK JS wrapper issues.
 */

import * as fs from "fs";
import * as path from "path";
import { execFileSync } from "child_process";
import { GraphStore } from "../src/memory/graph";
import type { AnalysisPatch } from "../src/memory/types";

const OWNER_USER_ID = 292228713;
// Script lives in scripts/, repo root is one level up
const REPO_ROOT = path.resolve(import.meta.dir, "..");
const WORKING_DIR = path.join(REPO_ROOT, "workspace");
const HANDOFF_PATH = path.join(REPO_ROOT, "HANDOFF.md");

// Native Claude CLI path — prefer env var, then well-known prod path, then PATH
function findClaudeCLISync(): string {
  if (process.env.CLAUDE_CODE_PATH) return process.env.CLAUDE_CODE_PATH;
  const known = "/root/.local/share/claude/versions/2.1.126";
  if (fs.existsSync(known)) return known;
  try {
    const { execSync } = require("child_process") as typeof import("child_process");
    return execSync("which claude", { encoding: "utf8" }).trim();
  } catch {
    return known;
  }
}

const CLAUDE_CODE_PATH = findClaudeCLISync();

const INFRA_SYSTEM_PROMPT = `Ты — экстрактор инфраструктурных фактов из документа. Твоя задача: проанализировать технический документ (handoff-записку) и извлечь структурированные факты об инфраструктуре, инцидентах, рецептах фиксов и особенностях деплоя.

ВАЖНО: Извлекай ТОЛЬКО то, что явно написано в документе. Не додумывай и не предполагай.

Верни ТОЛЬКО валидный JSON между маркерами <<<JSON>>> и <<<END>>>, без какого-либо другого текста.

Схема JSON:
{
  "upsert_nodes": [
    { "type": "person|project|fact|event|health|goal|achievement|preference|place|topic|infra|incident|runbook_step|deploy_quirk", "label": "...", "data": {}, "tags": [], "importance": 0.0-1.0 }
  ],
  "upsert_edges": [
    { "from_label": "...", "from_type": "...", "to_label": "...", "to_type": "...", "relation": "knows|works_on|likes|dislikes|owns|part_of|related_to|happened_at|linked_to|achieves|blocks|supports", "weight": 0.0-1.0 }
  ],
  "touch_labels": [
    { "type": "...", "label": "..." }
  ],
  "session_summary": {
    "title": "Краткий заголовок (до 60 символов)",
    "summary": "3-5 предложений о чём был документ",
    "topics": ["тема1", "тема2"]
  }
}

Правила importance по типу:
- person: 0.9, project: 0.8, infra: 0.8, runbook_step: 0.9, deploy_quirk: 0.85, incident: 0.7, fact: 0.5, topic: 0.4

Приоритет извлечения (сосредоточься на этом):
- infra: серверы, сервисы, домены, пути на диске. Пример label: "jinru сервер", "claude-tg-bot.service", "/opt/claude-tg-bot/"
- runbook_step: рецепты фиксов, которые нужно повторять. Пример: "Recovery from musl/glibc trap after bun install". Кладём в data.steps или data.command конкретные команды.
- deploy_quirk: нетривиальные особенности окружения. Пример: "bun резолвит musl-linked бинарь на glibc Ubuntu", "systemctl Restart=always required for /restart self-bootstrap"
- incident: конкретные зафиксированные сбои. Пример: "musl/glibc несовместимость SDK после bun install"
- project: проекты, упомянутые явно. Пример: "claude-tg-bot", "ksyusha-cv"
- person: имена людей. Пример: "Евгений", "Ксения"
- fact: прочие важные факты об окружении, конфигах, путях
`;

function callClaudeNative(prompt: string): string {
  const tmpDir = "/tmp/import-handoff";
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
  const systemFile = path.join(tmpDir, "system.txt");
  fs.writeFileSync(systemFile, INFRA_SYSTEM_PROMPT, "utf8");

  try {
    const result = execFileSync(
      CLAUDE_CODE_PATH,
      [
        "--model", "claude-haiku-4-5",
        "--print",
        "--system-prompt", INFRA_SYSTEM_PROMPT,
      ],
      {
        input: prompt,
        encoding: "utf8",
        cwd: WORKING_DIR,
        timeout: 120_000,
        maxBuffer: 10 * 1024 * 1024,
      }
    );
    return result;
  } catch (e: unknown) {
    const err = e as { stdout?: string; stderr?: string; message?: string };
    // execFileSync throws on non-zero exit but stdout may still have content
    if (err.stdout && err.stdout.length > 10) {
      return err.stdout;
    }
    throw new Error(`Claude CLI failed: ${err.stderr ?? String(err.message)}`);
  }
}

async function main() {
  if (!fs.existsSync(HANDOFF_PATH)) {
    console.error(`HANDOFF.md not found at ${HANDOFF_PATH}`);
    process.exit(1);
  }

  const handoffContent = fs.readFileSync(HANDOFF_PATH, "utf8");
  console.log(`[import-handoff] Read HANDOFF.md (${handoffContent.length} bytes)`);
  console.log(`[import-handoff] Using Claude CLI: ${CLAUDE_CODE_PATH}`);

  const prompt = `Пользователь: ${handoffContent}

Извлеки все инфраструктурные факты, рецепты фиксов, особенности деплоя, инциденты и другие важные сущности. Верни JSON строго между маркерами <<<JSON>>> и <<<END>>>.`;

  console.log("[import-handoff] Calling Claude Haiku for analysis...");
  const rawResponse = callClaudeNative(prompt);
  console.log(`[import-handoff] Raw response length: ${rawResponse.length}`);

  // Parse JSON: markers → brace block → raw trim
  let patch: AnalysisPatch;
  try {
    let jsonStr: string | undefined;

    const markerMatch = rawResponse.match(/<<<JSON>>>([\s\S]*?)<<<END>>>/);
    if (markerMatch) {
      jsonStr = markerMatch[1]!.trim();
    }

    if (!jsonStr) {
      const braceMatch = rawResponse.match(/\{[\s\S]*\}/);
      if (braceMatch) {
        jsonStr = braceMatch[0]!.trim();
      }
    }

    if (!jsonStr) {
      jsonStr = rawResponse.trim();
    }

    patch = JSON.parse(jsonStr) as AnalysisPatch;
  } catch (e) {
    console.error(`[import-handoff] Failed to parse JSON: ${String(e)}`);
    console.error(`Raw response (first 1000 chars):\n${rawResponse.slice(0, 1000)}`);
    process.exit(1);
  }

  console.log(
    `[import-handoff] Parsed patch: ${patch.upsert_nodes.length} nodes, ${patch.upsert_edges.length} edges`
  );

  // Apply patch to graph
  const store = new GraphStore(WORKING_DIR, OWNER_USER_ID);
  const graph = store.load();
  const before = {
    nodes: Object.keys(graph.nodes).length,
    edges: Object.keys(graph.edges).length,
  };

  const { addedNodes, updatedNodes, addedEdges } = store.applyAnalysisPatch(
    graph,
    patch,
    "handoff-import"
  );
  store.save(graph);

  const after = {
    nodes: Object.keys(graph.nodes).length,
    edges: Object.keys(graph.edges).length,
  };

  console.log(`\n[import-handoff] Done.`);
  console.log(`  Before: ${before.nodes} nodes, ${before.edges} edges`);
  console.log(`  After:  ${after.nodes} nodes, ${after.edges} edges`);
  console.log(`  Added:  ${addedNodes.length} nodes, ${addedEdges.length} edges`);
  console.log(`  Updated: ${updatedNodes.length} nodes`);
  console.log(`\n  Session summary: ${patch.session_summary.title}`);
  console.log(`  Topics: ${patch.session_summary.topics.join(", ")}`);
  console.log(`\n  Node types extracted:`);
  const byType: Record<string, number> = {};
  for (const n of patch.upsert_nodes) {
    byType[n.type] = (byType[n.type] ?? 0) + 1;
  }
  for (const [t, cnt] of Object.entries(byType)) {
    console.log(`    ${t}: ${cnt}`);
  }
}

main().catch((err) => {
  console.error("[import-handoff] Fatal error:", err);
  process.exit(1);
});
