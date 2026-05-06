/**
 * Task management — saves confirmed tasks to personal vaults.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from "fs";
import { getUserProfile } from "./config";
import { GraphStore } from "./memory/graph";

export interface PendingTask {
  id: string;
  text: string;
  deadline?: string;
  assignedBy: number;
  assignedTo: number;
  createdAt: string;
}

// Telegram usernames for tagging in group
export const USER_TELEGRAM_NAMES: Record<number, string> = {
  292228713: "@ev_mironoff",
  893951298: "@ksenyaenbom",
};

export const USER_DISPLAY_NAMES: Record<number, string> = {
  292228713: "Евгений",
  893951298: "Ксюша",
};

// Detect if a message looks like a task assignment
export function detectTaskIntent(text: string): boolean {
  const lower = text.toLowerCase();
  const keywords = [
    "запомни задачу",
    "поставь задачу",
    "задача для",
    "задача:",
    "запиши задачу",
    "добавь задачу",
  ];
  return keywords.some((k) => lower.includes(k));
}

// Try to detect who the task is for from the message text
// Returns userId or null if unclear
export function detectAssignee(text: string, fromUserId: number): number | null {
  const lower = text.toLowerCase();
  if (/ксюш|ксени|ксю/.test(lower)) return 893951298;
  if (/женя|женю|жене|евгени/.test(lower)) return 292228713;
  if (/\bмне\b|\bсебе\b|\bменя\b|\bдля меня\b/.test(lower)) return fromUserId;
  return null;
}

// Save confirmed task to vault and memory graph
export function saveTaskToVault(task: PendingTask): void {
  const vaultPath = `/opt/vault/${task.assignedTo}/inbox`;
  const tasksFile = `${vaultPath}/tasks.md`;

  if (!existsSync(vaultPath)) {
    mkdirSync(vaultPath, { recursive: true });
  }

  const deadlineStr = task.deadline ? ` | 📅 ${task.deadline}` : "";
  const assignedByName = USER_DISPLAY_NAMES[task.assignedBy] ?? "Неизвестно";
  const line = `- [ ] ${task.text}${deadlineStr} _(от ${assignedByName}, ${task.createdAt})_\n`;

  let content = existsSync(tasksFile) ? readFileSync(tasksFile, "utf8") : "";

  if (!content.includes("# Входящие задачи")) {
    content = `# Входящие задачи\n\n` + content;
  }

  content = content.replace(
    "# Входящие задачи\n\n",
    `# Входящие задачи\n\n${line}`
  );
  writeFileSync(tasksFile, content);

  // Also persist to the assignee's memory graph
  try {
    const profile = getUserProfile(task.assignedTo);
    const store = new GraphStore(profile.workingDir, task.assignedTo);
    const g = store.load();
    store.upsertTask(g, {
      text: task.text,
      deadline: task.deadline,
      assignedBy: task.assignedBy,
      assignedTo: task.assignedTo,
    });
    store.save(g);
  } catch (err) {
    console.warn("[tasks] Failed to write task to memory graph:", err);
  }
}

// Save pending task to /tmp for confirmation
export function savePendingTask(task: PendingTask): void {
  const file = `/tmp/task-${task.id}.json`;
  writeFileSync(file, JSON.stringify(task, null, 2));
}

// Load pending task from /tmp
export function loadPendingTask(id: string): PendingTask | null {
  if (!/^[a-f0-9]{32}$/.test(id)) return null;
  const file = `/tmp/task-${id}.json`;
  try {
    return JSON.parse(readFileSync(file, "utf8")) as PendingTask;
  } catch {
    return null;
  }
}

// Delete pending task file
export function deletePendingTask(id: string): void {
  if (!/^[a-f0-9]{32}$/.test(id)) return;
  try {
    unlinkSync(`/tmp/task-${id}.json`);
  } catch {}
}
