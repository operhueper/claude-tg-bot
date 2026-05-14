import type { MemoryGraph, GoalsFile, GoalType } from "./types";
import { GraphStore } from "./graph";
import { rankNodesByQuery } from "./relevance";

/** Strip prompt-injection patterns before splicing node content into a system prompt. */
export function sanitizeForPrompt(s: unknown): string {
  if (typeof s !== "string") return String(s ?? "").slice(0, 100);
  return s
    // HTML-escape first (& must come before < and >) to prevent HTML injection in prompts
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .slice(0, 500) // hard cap
    .replace(/^#{1,6}\s/gm, "") // strip markdown headings
    .replace(/^(SYSTEM:|INST:|<\|)/gm, "") // strip directive prefixes
    .replace(/\[INST\]/g, "")
    .replace(/\n{3,}/g, "\n\n") // collapse blank lines
    .replace(/`{3,}/g, "") // strip code fences
    .trim();
}

export interface MemoryContext {
  appendText: string;
  topNodeIds: string[];
}

export function buildMemoryContext(
  graph: MemoryGraph,
  goals: GoalsFile,
  opts: { maxNodes: number; maxChars: number; queryHint?: string }
): MemoryContext {
  const store = new GraphStore("", graph.user_id); // workingDir not needed for read ops

  // If a query hint is provided, use keyword-ranked nodes; otherwise fall back to recency/importance
  const topNodes = opts.queryHint && opts.queryHint.trim().length > 3
    ? rankNodesByQuery(graph, opts.queryHint, { limit: opts.maxNodes })
    : store.topRelevant(graph, { limit: opts.maxNodes, recencyWeight: 0.3 });
  const activeGoals = Object.values(goals.goals).filter(g => g.status === "active");
  const recentAchievements = Object.values(goals.achievements)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 3);

  if (topNodes.length === 0 && activeGoals.length === 0) {
    return { appendText: "", topNodeIds: [] };
  }

  const parts: string[] = [];
  parts.push("## Что я знаю о тебе\n");

  if (activeGoals.length > 0) {
    parts.push("### Активные цели");
    const typeOrder = ["daily", "weekly", "monthly", "yearly", "lifetime"];
    const sorted = activeGoals.sort((a, b) => typeOrder.indexOf(a.type) - typeOrder.indexOf(b.type));
    for (const g of sorted.slice(0, 5)) {
      const deadline = g.deadline ? ` (до ${sanitizeForPrompt(g.deadline)})` : "";
      parts.push(`- [${g.type}] ${sanitizeForPrompt(g.title)}${deadline}`);
    }
    parts.push("");
  }

  if (recentAchievements.length > 0) {
    parts.push("### Недавние достижения");
    for (const a of recentAchievements) {
      parts.push(`- ${sanitizeForPrompt(a.title)} (${sanitizeForPrompt(a.date)})`);
    }
    parts.push("");
  }

  if (topNodes.length > 0) {
    const typeLabels: Record<string, string> = {
      person: "👤", project: "📁", fact: "💡", event: "📅",
      health: "🏥", goal: "🎯", preference: "❤️",
      place: "📍", topic: "🏷", trip: "✈️", purchase: "🛒", infra: "🖥",
    };

    parts.push("### Ключевые факты");
    for (const node of topNodes) {
      const emoji = typeLabels[node.type] ?? "•";
      const dataStr = Object.entries(node.data)
        .slice(0, 3)
        .map(([k, v]) => `${k}: ${sanitizeForPrompt(v)}`)
        .join(", ");
      const extra = dataStr ? ` — ${dataStr}` : "";
      parts.push(`- ${emoji} ${sanitizeForPrompt(node.label)}${extra}`);
    }
  }

  const text = parts.join("\n");
  const truncated = text.slice(0, opts.maxChars);

  return {
    appendText: truncated,
    topNodeIds: topNodes.map(n => n.id),
  };
}
