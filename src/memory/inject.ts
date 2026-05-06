import type { MemoryGraph, GoalsFile, GoalType } from "./types";
import { GraphStore } from "./graph";
import { rankNodesByQuery } from "./relevance";

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
      const deadline = g.deadline ? ` (до ${g.deadline})` : "";
      parts.push(`- [${g.type}] ${g.title}${deadline}`);
    }
    parts.push("");
  }

  if (recentAchievements.length > 0) {
    parts.push("### Недавние достижения");
    for (const a of recentAchievements) {
      parts.push(`- ${a.title} (${a.date})`);
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
        .map(([k, v]) => `${k}: ${v}`)
        .join(", ");
      const extra = dataStr ? ` — ${dataStr}` : "";
      parts.push(`- ${emoji} ${node.label}${extra}`);
    }
  }

  const text = parts.join("\n");
  const truncated = text.slice(0, opts.maxChars);

  return {
    appendText: truncated,
    topNodeIds: topNodes.map(n => n.id),
  };
}
