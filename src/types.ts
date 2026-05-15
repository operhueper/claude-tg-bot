/**
 * Shared TypeScript types for the Claude Telegram Bot.
 */

import type { Context } from "grammy";
import type { Message } from "grammy/types";

// Status callback for streaming updates
export type StatusCallback = (
  type: "thinking" | "tool" | "text" | "segment_end" | "done" | "todo_init" | "todo_update" | "context" | "announce",
  content: string,
  segmentId?: number
) => Promise<void>;

// Todo item for progress tracking
export interface TodoItem {
  id: string;
  label: string;
  status: 'pending' | 'in_progress' | 'done';
}

// Rate limit bucket for token bucket algorithm
export interface RateLimitBucket {
  tokens: number;
  lastUpdate: number;
}

// Session persistence
export interface SavedSession {
  session_id: string;
  saved_at: string;
  working_dir: string;
  title: string; // First message truncated (max ~50 chars)
  user_id?: number; // V-29: ownership guard, optional for backward-compat with legacy entries
}

export interface SessionHistory {
  sessions: SavedSession[];
}

// Token usage from Claude
export interface TokenUsage {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
}

// MCP server configuration types
export type McpServerConfig = McpStdioConfig | McpHttpConfig;

export interface McpStdioConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

export interface McpHttpConfig {
  type: "http";
  url: string;
  headers?: Record<string, string>;
}

// Audit log event types
export type AuditEventType =
  | "message"
  | "auth"
  | "tool_use"
  | "error"
  | "rate_limit";

export interface AuditEvent {
  timestamp: string;
  event: AuditEventType;
  user_id: number;
  username?: string;
  [key: string]: unknown;
}

// Pending media group for buffering albums
export interface PendingMediaGroup {
  items: string[];
  ctx: Context;
  caption?: string;
  statusMsg?: Message;
  timeout: Timer;
}

// Bot context with optional message
export type BotContext = Context;

// Tier system
export type UserTier = 'free' | 'paid';

export interface TierConfig {
  tier: UserTier;
  dailyMessageLimit: number | null;  // null = без лимита
  containerEnabled: boolean;
  voiceEnabled: boolean;
  fileEnabled: boolean;
  googleEnabled: boolean;
}

export const TIER_CONFIGS: Record<UserTier, TierConfig> = {
  free: {
    tier: 'free',
    dailyMessageLimit: 10,
    containerEnabled: false,
    voiceEnabled: true,
    fileEnabled: false,
    googleEnabled: false,
  },
  paid: {
    tier: 'paid',
    dailyMessageLimit: null,
    containerEnabled: true,
    voiceEnabled: true,
    fileEnabled: true,
    googleEnabled: true,
  },
};

export interface YuKassaPayment {
  id: string;
  status: 'pending' | 'waiting_for_capture' | 'succeeded' | 'canceled';
  payment_method?: {
    id: string;
    saved: boolean;
    type: string;
    card?: { first6: string; last4: string; expiry_month: string; expiry_year: string };
  };
  confirmation?: { type: 'redirect'; confirmation_url: string };
  amount: { value: string; currency: string };
  created_at: string;
  metadata?: Record<string, string>;
}

export interface YuKassaWebhookEvent {
  type: 'notification' | string;
  event: 'payment.succeeded' | 'payment.canceled' | 'refund.succeeded' | string;
  object: YuKassaPayment;
}
