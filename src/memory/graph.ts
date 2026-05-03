import * as fs from "fs";
import type { MemoryGraph, MemoryNode, MemoryEdge, NodeType, RelationType, AnalysisPatch } from "./types";
import { graphFile, ensureMemoryStructure } from "./paths";

function ulid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
}

function normalizeLabel(label: string): string {
  return label.toLowerCase().trim();
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
      return JSON.parse(fs.readFileSync(file, "utf8")) as MemoryGraph;
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
    const now = new Date().toISOString();
    const existing = this.findNodeByLabel(g, partial.type, partial.label);
    if (existing) {
      // Merge data
      Object.assign(existing.data, partial.data ?? {});
      if (partial.tags) existing.tags = [...new Set([...existing.tags, ...partial.tags])];
      if (partial.importance !== undefined && partial.importance > existing.importance) {
        existing.importance = partial.importance;
      }
      existing.updated_at = now;
      return existing;
    }
    // Create new
    const id = ulid();
    const node: MemoryNode = {
      id,
      type: partial.type,
      label: partial.label,
      data: partial.data ?? {},
      tags: partial.tags ?? [],
      importance: partial.importance ?? 0.5,
      created_at: now,
      updated_at: now,
      last_mentioned_at: now,
      mention_count: 1,
      source_sessions: [],
    };
    g.nodes[id] = node;
    // Update label index
    const key = normalizeLabel(partial.label);
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

    return { addedNodes, updatedNodes, addedEdges };
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
