export type NodeType =
  | "person"
  | "place"
  | "trip"
  | "project"
  | "goal"
  | "task"
  | "event"
  | "purchase"
  | "preference"
  | "health"
  | "infra"
  | "topic"
  | "fact";

export interface MemoryNode {
  id: string;
  type: NodeType;
  label: string;
  data: Record<string, unknown>;
  tags: string[];
  importance: number;
  created_at: string;
  updated_at: string;
  last_mentioned_at: string;
  mention_count: number;
  source_sessions: string[];
}

export type RelationType =
  | "part_of"
  | "located_in"
  | "visits"
  | "owns"
  | "works_on"
  | "knows"
  | "prefers"
  | "achieves"
  | "blocks"
  | "about"
  | "uses"
  | "scheduled_at";

export interface MemoryEdge {
  id: string;
  from: string;
  to: string;
  relation: RelationType;
  weight: number;
  created_at: string;
  updated_at: string;
}

export interface MemoryGraph {
  version: 1;
  schema_version?: number;
  user_id: number;
  nodes: Record<string, MemoryNode>;
  edges: Record<string, MemoryEdge>;
  label_index: Record<string, string[]>;
  updated_at: string;
}

export type GoalType = "daily" | "weekly" | "monthly" | "yearly" | "lifetime";
export type GoalStatus = "active" | "done" | "paused" | "abandoned";

export interface Goal {
  id: string;
  title: string;
  description?: string;
  type: GoalType;
  status: GoalStatus;
  deadline?: string;
  progress?: number;
  created_at: string;
  updated_at: string;
  completed_at?: string;
  parent_goal?: string;
}

export interface Achievement {
  id: string;
  title: string;
  description?: string;
  date: string;
  linked_goal?: string;
  created_at: string;
}

export interface GoalsFile {
  version: 1;
  goals: Record<string, Goal>;
  achievements: Record<string, Achievement>;
  updated_at: string;
}

export interface TranscriptTurn {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  tools_used?: string[];
}

export interface SessionTranscript {
  session_id: string;
  user_id: number;
  started_at: string;
  turns: TranscriptTurn[];
}

export interface AnalysisPatch {
  upsert_nodes: Array<{
    type: NodeType;
    label: string;
    data?: Record<string, unknown>;
    tags?: string[];
    importance?: number;
  }>;
  upsert_edges: Array<{
    from_label: string;
    from_type: NodeType;
    to_label: string;
    to_type: NodeType;
    relation: RelationType;
    weight?: number;
  }>;
  touch_labels: Array<{ type: NodeType; label: string }>;
  session_summary: {
    title: string;
    summary: string;
    topics: string[];
  };
}
