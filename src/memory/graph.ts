import * as fs from "fs";
import { z } from "zod";
import type { MemoryGraph, MemoryNode, MemoryEdge, NodeType, RelationType, AnalysisPatch } from "./types";
import { graphFile, ensureMemoryStructure } from "./paths";

const NodeSchema = z.object({
  id: z.string().min(1).max(200),
  type: z.string().min(1).max(50),
  label: z.string().max(500),
  data: z.record(z.string(), z.unknown()).default({}),
  tags: z.array(z.string()).default([]),
  importance: z.number().min(0).max(1).default(0.5),
  created_at: z.string(),
  updated_at: z.string(),
  last_mentioned_at: z.string(),
  mention_count: z.number().int().nonnegative().default(1),
  source_sessions: z.array(z.string()).default([]),
});

function sanitizeGraphNodes(raw: MemoryGraph): MemoryGraph {
  const validatedNodes: Record<string, MemoryNode> = {};
  for (const [id, node] of Object.entries(raw.nodes ?? {})) {
    const result = NodeSchema.safeParse(node);
    if (result.success) {
      validatedNodes[id] = result.data as MemoryNode;
    } else {
      console.warn(`[graph] Dropping invalid node id=${id}:`, result.error.issues.map(i => i.message).join("; "));
    }
  }
  return { ...raw, nodes: validatedNodes };
}

function ulid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
}

const LABEL_ALIASES: Record<string, string> = {
  "shenzhen": "шэньчжэнь",
  "深圳": "шэньчжэнь",
  "yangshuo": "яншо",
  "阳朔": "яншо",
  "guilin": "гуйлинь",
  "桂林": "гуйлинь",
  "china": "китай",
  "китайская народная республика": "китай",
  "кнр": "китай",
  "russia": "россия",
  "российская федерация": "россия",
  "рф": "россия",
};

function normalizeLabel(label: string): string {
  const norm = label.toLowerCase().trim();
  return LABEL_ALIASES[norm] ?? norm;
}

export class GraphStore {
  constructor(private workingDir: string, private userId: number) {}

  load(): MemoryGraph {
    const file = graphFile(this.workingDir, this.userId);
    if (!fs.existsSync(file)) {
      return {
        version: 1,
        user_id: this.userId,
        nodes: {},
        edges: {},
        label_index: {},
        updated_at: new Date().toISOString(),
      };
    }
    try {
      const raw = JSON.parse(fs.readFileSync(file, "utf8")) as MemoryGraph;
      // Older graphs (pre-label_index migration) may lack this field —
      // forceMemoryFlush crashes on `g.label_index[key]` if it's undefined.
      raw.label_index ??= {};
      raw.nodes ??= {};
      raw.edges ??= {};
      return sanitizeGraphNodes(raw);
    } catch {
      return {
        version: 1,
        user_id: this.userId,
        nodes: {},
        edges: {},
        label_index: {},
        updated_at: new Date().toISOString(),
      };
    }
  }

  save(g: MemoryGraph): void {
    ensureMemoryStructure(this.workingDir, this.userId);
    const file = graphFile(this.workingDir, this.userId);
    const tmp = file + ".tmp";
    g.updated_at = new Date().toISOString();
    fs.writeFileSync(tmp, JSON.stringify(g, null, 2), "utf8");
    fs.renameSync(tmp, file);
  }

  findNodeByLabel(g: MemoryGraph, type: NodeType, label: string): MemoryNode | null {
    const key = normalizeLabel(label);
    const ids = g.label_index[key] ?? [];
    for (const id of ids) {
      const node = g.nodes[id];
      if (node && node.type === type) return node;
    }
    return null;
  }

  upsertNode(g: MemoryGraph, partial: Partial<MemoryNode> & { type: NodeType; label: string }): MemoryNode {
    // Enforce field-length limits to limit prompt-injection surface area
    const safeId = partial.id ? partial.id.slice(0, 100) : undefined;
    const safeLabel = partial.label.slice(0, 200);
    const safeData: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(partial.data ?? {})) {
      safeData[k.slice(0, 50)] = typeof v === "string" ? v.slice(0, 100) : v;
    }
    const sanitizedPartial = { ...partial, ...(safeId !== undefined ? { id: safeId } : {}), label: safeLabel, data: safeData };

    const now = new Date().toISOString();
    const existing = this.findNodeByLabel(g, sanitizedPartial.type, sanitizedPartial.label);
    if (existing) {
      // Merge data
      Object.assign(existing.data, sanitizedPartial.data);
      if (sanitizedPartial.tags) existing.tags = [...new Set([...existing.tags, ...sanitizedPartial.tags])];
      if (sanitizedPartial.importance !== undefined && sanitizedPartial.importance > existing.importance) {
        existing.importance = sanitizedPartial.importance;
      }
      existing.updated_at = now;
      return existing;
    }
    // Create new
    const id = ulid();
    const node: MemoryNode = {
      id,
      type: sanitizedPartial.type,
      label: sanitizedPartial.label,
      data: sanitizedPartial.data,
      tags: sanitizedPartial.tags ?? [],
      importance: sanitizedPartial.importance ?? 0.5,
      created_at: now,
      updated_at: now,
      last_mentioned_at: now,
      mention_count: 1,
      source_sessions: [],
    };
    g.nodes[id] = node;
    // Update label index — cap at 10 000 entries to prevent unbounded growth.
    const key = normalizeLabel(sanitizedPartial.label);
    if (Object.keys(g.label_index).length >= 10000) {
      // Drop the first (oldest) key when the cap is reached.
      const firstKey = Object.keys(g.label_index)[0];
      if (firstKey !== undefined) delete g.label_index[firstKey];
    }
    if (!g.label_index[key]) g.label_index[key] = [];
    g.label_index[key]!.push(id);
    return node;
  }

  upsertEdge(g: MemoryGraph, partial: Partial<MemoryEdge> & { from: string; to: string; relation: RelationType }): MemoryEdge {
    const now = new Date().toISOString();
    // Check existing edge
    const existing = Object.values(g.edges).find(
      e => e.from === partial.from && e.to === partial.to && e.relation === partial.relation
    );
    if (existing) {
      if (partial.weight !== undefined) existing.weight = partial.weight;
      existing.updated_at = now;
      return existing;
    }
    const id = ulid();
    const edge: MemoryEdge = {
      id,
      from: partial.from,
      to: partial.to,
      relation: partial.relation,
      weight: partial.weight ?? 0.5,
      created_at: now,
      updated_at: now,
    };
    g.edges[id] = edge;
    return edge;
  }

  touchNode(g: MemoryGraph, nodeId: string, sessionId: string): void {
    const node = g.nodes[nodeId];
    if (!node) return;
    node.last_mentioned_at = new Date().toISOString();
    node.mention_count++;
    if (!node.source_sessions.includes(sessionId)) {
      node.source_sessions.push(sessionId);
    }
  }

  /**
   * Merge nodes that have the same (type, normalizedLabel) — accumulate duplicates
   * that can form when the analyzer creates slightly different labels for the same entity.
   * Returns the number of nodes merged.
   */
  mergeDuplicateNodes(g: MemoryGraph): number {
    const groups = new Map<string, MemoryNode[]>();
    for (const node of Object.values(g.nodes)) {
      const key = `${node.type}:${normalizeLabel(node.label)}`;
      const group = groups.get(key) ?? [];
      group.push(node);
      groups.set(key, group);
    }

    let merged = 0;
    for (const [, group] of groups) {
      if (group.length < 2) continue;
      // Keep node with highest importance; absorb the rest into it
      group.sort((a, b) => b.importance - a.importance);
      const primary = group[0]!;
      for (let i = 1; i < group.length; i++) {
        const dup = group[i]!;
        Object.assign(primary.data, dup.data);
        primary.tags = [...new Set([...primary.tags, ...dup.tags])];
        if (dup.importance > primary.importance) primary.importance = dup.importance;
        primary.mention_count += dup.mention_count;
        if (dup.last_mentioned_at > primary.last_mentioned_at) {
          primary.last_mentioned_at = dup.last_mentioned_at;
        }
        primary.source_sessions = [...new Set([...primary.source_sessions, ...dup.source_sessions])];
        // Repoint all edges from dup → primary
        for (const edge of Object.values(g.edges)) {
          if (edge.from === dup.id) edge.from = primary.id;
          if (edge.to === dup.id) edge.to = primary.id;
        }
        // Remove dup from nodes and label_index
        delete g.nodes[dup.id];
        const normKey = normalizeLabel(dup.label);
        if (g.label_index[normKey]) {
          g.label_index[normKey] = g.label_index[normKey]!.filter(id => id !== dup.id);
        }
        merged++;
      }
    }
    return merged;
  }

  applyAnalysisPatch(g: MemoryGraph, patch: AnalysisPatch, sessionId: string): {
    addedNodes: MemoryNode[];
    updatedNodes: MemoryNode[];
    addedEdges: MemoryEdge[];
  } {
    const addedNodes: MemoryNode[] = [];
    const updatedNodes: MemoryNode[] = [];
    const addedEdges: MemoryEdge[] = [];

    // Upsert nodes
    for (const n of patch.upsert_nodes) {
      const existed = this.findNodeByLabel(g, n.type, n.label);
      const node = this.upsertNode(g, n);
      this.touchNode(g, node.id, sessionId);
      if (existed) updatedNodes.push(node);
      else addedNodes.push(node);
    }

    // Touch labels
    for (const t of patch.touch_labels) {
      const node = this.findNodeByLabel(g, t.type, t.label);
      if (node) this.touchNode(g, node.id, sessionId);
    }

    // Upsert edges
    for (const e of patch.upsert_edges) {
      const fromNode = this.findNodeByLabel(g, e.from_type, e.from_label);
      const toNode = this.findNodeByLabel(g, e.to_type, e.to_label);
      if (fromNode && toNode) {
        const existed = Object.values(g.edges).find(
          edge => edge.from === fromNode.id && edge.to === toNode.id && edge.relation === e.relation
        );
        const edge = this.upsertEdge(g, { from: fromNode.id, to: toNode.id, relation: e.relation, weight: e.weight });
        if (!existed) addedEdges.push(edge);
      }
    }

    // Merge any duplicates that accumulated (same type+label, different id)
    const mergeCount = this.mergeDuplicateNodes(g);
    if (mergeCount > 0) console.log(`[graph] Merged ${mergeCount} duplicate node(s)`);

    return { addedNodes, updatedNodes, addedEdges };
  }

  upsertTask(g: MemoryGraph, task: { text: string; deadline?: string; assignedBy?: number; assignedTo?: number }): MemoryNode {
    return this.upsertNode(g, {
      type: "task",
      label: task.text,
      data: {
        deadline: task.deadline,
        assignedBy: task.assignedBy,
        assignedTo: task.assignedTo,
        status: "pending" as const,
      },
      tags: ["task"],
      importance: 0.7,
    });
  }

  getTaskNodes(g: MemoryGraph): MemoryNode[] {
    return Object.values(g.nodes).filter(n => n.type === "task");
  }

  markTaskDone(g: MemoryGraph, nodeId: string): void {
    const node = g.nodes[nodeId];
    if (!node || node.type !== "task") return;
    (node.data as Record<string, unknown>).status = "done";
    node.updated_at = new Date().toISOString();
  }

  topRelevant(g: MemoryGraph, opts: { limit: number; recencyWeight: number }): MemoryNode[] {
    const now = Date.now();
    const nodes = Object.values(g.nodes);
    return nodes
      .map(node => {
        const recencyMs = now - new Date(node.last_mentioned_at).getTime();
        const recencyDays = recencyMs / (1000 * 60 * 60 * 24);
        const recencyScore = Math.exp(-recencyDays / 30); // decay over 30 days
        const mentionScore = Math.min(Math.log(node.mention_count + 1) / 5, 1);
        const score = node.importance * 0.5 + recencyScore * opts.recencyWeight + mentionScore * 0.2;
        return { node, score };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, opts.limit)
      .map(x => x.node);
  }
}
