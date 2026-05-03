import * as path from "path";
import * as fs from "fs";

export function memoryDir(workingDir: string, userId?: number): string {
  const base = path.join(workingDir, "memory");
  return userId !== undefined ? path.join(base, String(userId)) : base;
}

export function graphFile(workingDir: string, userId?: number): string {
  return path.join(memoryDir(workingDir, userId), "graph.json");
}

export function goalsFilePath(workingDir: string, userId?: number): string {
  return path.join(memoryDir(workingDir, userId), "goals.json");
}

export function sessionsDir(workingDir: string, userId?: number): string {
  return path.join(memoryDir(workingDir, userId), "sessions");
}

export function summaryFile(workingDir: string, ts: Date, userId?: number): string {
  const yyyy = ts.getFullYear();
  const mm = String(ts.getMonth() + 1).padStart(2, "0");
  const dd = String(ts.getDate()).padStart(2, "0");
  const hh = String(ts.getHours()).padStart(2, "0");
  const min = String(ts.getMinutes()).padStart(2, "0");
  return path.join(sessionsDir(workingDir, userId), `${yyyy}-${mm}-${dd}-${hh}-${min}.md`);
}

export function transcriptsDir(workingDir: string, userId?: number): string {
  return path.join(memoryDir(workingDir, userId), "transcripts");
}

export function transcriptFile(workingDir: string, sessionId: string, userId?: number): string {
  return path.join(transcriptsDir(workingDir, userId), `${sessionId}.jsonl`);
}

export function ensureMemoryStructure(workingDir: string, userId?: number): void {
  const dirs = [
    memoryDir(workingDir, userId),
    sessionsDir(workingDir, userId),
    transcriptsDir(workingDir, userId),
  ];
  for (const d of dirs) {
    if (!fs.existsSync(d)) {
      fs.mkdirSync(d, { recursive: true });
    }
  }
}

/**
 * One-time migration: move legacy flat memory/ structure into per-userId subdir.
 * Safe to call multiple times — no-ops if already migrated or no legacy data.
 */
export function migrateLegacyMemory(workingDir: string, userId: number): void {
  const legacyGraph = path.join(workingDir, "memory", "graph.json");
  const targetDir = memoryDir(workingDir, userId);

  // Only migrate if legacy graph.json exists and target dir doesn't yet
  if (!fs.existsSync(legacyGraph) || fs.existsSync(targetDir)) {
    return;
  }

  try {
    fs.mkdirSync(targetDir, { recursive: true });

    const toMove = ["graph.json", "goals.json", "sessions", "transcripts"];
    for (const item of toMove) {
      const src = path.join(workingDir, "memory", item);
      const dst = path.join(targetDir, item);
      if (fs.existsSync(src)) {
        fs.renameSync(src, dst);
      }
    }
    console.log(`[memory] Migrated legacy memory to ${targetDir}`);
  } catch (err) {
    console.warn(`[memory] Migration failed (non-fatal):`, err);
  }
}
