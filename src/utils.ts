/**
 * Utility functions for Claude Telegram Bot.
 *
 * Audit logging, voice transcription, typing indicator.
 */

import OpenAI from "openai";
import type { Chat } from "grammy/types";
import type { Context } from "grammy";
import type { AuditEvent } from "./types";
import {
  AUDIT_LOG_PATH,
  AUDIT_LOG_JSON,
  OPENAI_API_KEY,
  TRANSCRIPTION_PROMPT,
  TRANSCRIPTION_AVAILABLE,
} from "./config";

// ============== OpenAI Client ==============

let openaiClient: OpenAI | null = null;
if (OPENAI_API_KEY && TRANSCRIPTION_AVAILABLE) {
  openaiClient = new OpenAI({ apiKey: OPENAI_API_KEY });
}

// ============== Audit Logging ==============

const SECRET_PATTERNS: RegExp[] = [
  /\d{8,12}:[A-Za-z0-9_-]{35}/g,   // Telegram bot token
  /sk-or-v1-[A-Za-z0-9]{40,}/g,    // OpenRouter key
  /sk-[A-Za-z0-9]{32,}/g,          // OpenAI / generic sk- key
];

function maskSecrets(text: string): string {
  let result = text;
  for (const pattern of SECRET_PATTERNS) {
    result = result.replace(pattern, "<REDACTED>");
  }
  return result;
}

async function writeAuditLog(event: AuditEvent): Promise<void> {
  try {
    let content: string;
    if (AUDIT_LOG_JSON) {
      const maskedEvent: Record<string, unknown> = { ...event };
      if (typeof maskedEvent.content === "string") maskedEvent.content = maskSecrets(maskedEvent.content);
      if (typeof maskedEvent.response === "string") maskedEvent.response = maskSecrets(maskedEvent.response);
      content = JSON.stringify(maskedEvent) + "\n";
    } else {
      // Plain text format for readability
      const lines = ["\n" + "=".repeat(60)];
      for (const [key, value] of Object.entries(event)) {
        let displayValue = String(value);
        if ((key === "content" || key === "response") && displayValue.length > 500) {
          displayValue = displayValue.slice(0, 500) + "...";
        }
        if (key === "content" || key === "response") {
          displayValue = maskSecrets(displayValue);
        }
        lines.push(`${key}: ${displayValue}`);
      }
      content = lines.join("\n") + "\n";
    }

    // Append to audit log file
    const fs = await import("fs/promises");
    await fs.appendFile(AUDIT_LOG_PATH, content);
  } catch (error) {
    console.error("Failed to write audit log:", error);
  }
}

export async function auditLog(
  userId: number,
  username: string,
  messageType: string,
  content: string,
  response = ""
): Promise<void> {
  const event: AuditEvent = {
    timestamp: new Date().toISOString(),
    event: "message",
    user_id: userId,
    username,
    message_type: messageType,
    content,
  };
  if (response) {
    event.response = response;
  }
  await writeAuditLog(event);
}

export async function auditLogAuth(
  userId: number,
  username: string,
  authorized: boolean
): Promise<void> {
  await writeAuditLog({
    timestamp: new Date().toISOString(),
    event: "auth",
    user_id: userId,
    username,
    authorized,
  });
}

export async function auditLogTool(
  userId: number,
  username: string,
  toolName: string,
  toolInput: Record<string, unknown>,
  blocked = false,
  reason = ""
): Promise<void> {
  const event: AuditEvent = {
    timestamp: new Date().toISOString(),
    event: "tool_use",
    user_id: userId,
    username,
    tool_name: toolName,
    tool_input: toolInput,
    blocked,
  };
  if (blocked && reason) {
    event.reason = reason;
  }
  await writeAuditLog(event);
}

export async function auditLogError(
  userId: number,
  username: string,
  error: string,
  context = ""
): Promise<void> {
  const event: AuditEvent = {
    timestamp: new Date().toISOString(),
    event: "error",
    user_id: userId,
    username,
    error,
  };
  if (context) {
    event.context = context;
  }
  await writeAuditLog(event);
}

export async function auditLogRateLimit(
  userId: number,
  username: string,
  retryAfter: number
): Promise<void> {
  await writeAuditLog({
    timestamp: new Date().toISOString(),
    event: "rate_limit",
    user_id: userId,
    username,
    retry_after: retryAfter,
  });
}

// ============== Voice Transcription ==============

export async function transcribeVoice(
  filePath: string
): Promise<string | null> {
  if (!openaiClient) {
    console.warn("OpenAI client not available for transcription");
    return null;
  }

  try {
    const file = Bun.file(filePath);
    const transcript = await openaiClient.audio.transcriptions.create({
      model: "gpt-4o-transcribe",
      file: file,
      prompt: TRANSCRIPTION_PROMPT,
    });
    return transcript.text;
  } catch (error) {
    console.error("Transcription failed:", error);
    return null;
  }
}

// ============== Typing Indicator ==============

export interface TypingController {
  stop: () => void;
}

export function startTypingIndicator(ctx: Context): TypingController {
  let running = true;

  const loop = async () => {
    while (running) {
      try {
        await ctx.replyWithChatAction("typing");
      } catch (error) {
        console.debug("Typing indicator failed:", error);
      }
      await Bun.sleep(4000);
    }
  };

  // Start the loop
  loop();

  return {
    stop: () => {
      running = false;
    },
  };
}

// ============== Friendly Error Reply ==============

const FRIENDLY_MESSAGES: Record<string, string> = {
  "обработка текста": "Не получилось обработать сообщение — попробуй ещё раз.",
  "транскрипция аудио": "Не удалось распознать аудио — попробуй ещё раз.",
  "транскрипция голоса": "Не удалось распознать голосовое сообщение — попробуй ещё раз.",
  "обработка голоса": "Не получилось ответить на голосовое — попробуй ещё раз.",
  "обработка аудио": "Не получилось ответить на аудио — попробуй ещё раз.",
  "обработка альбома": "Не получилось обработать фото из альбома — попробуй ещё раз.",
  "распаковка архива": "Не удалось обработать архив — проверь файл и попробуй ещё раз.",
  "обработка документа": "Не удалось обработать документ — попробуй ещё раз.",
  "перезапуск сервиса": "Не удалось перезапустить сервис — проверь права и попробуй вручную.",
};

export async function replyFriendly(
  ctx: Context,
  error: unknown,
  context: string
): Promise<void> {
  const errorStr = error instanceof Error
    ? `${error.message}\n${error.stack ?? ""}`
    : String(error);
  console.error(`[${context}] ${errorStr}`);
  await auditLogError(
    ctx.from?.id ?? 0,
    ctx.from?.username ?? "unknown",
    errorStr,
    context
  );
  const friendly = FRIENDLY_MESSAGES[context] ?? "Что-то пошло не так — попробуй ещё раз.";
  await ctx.reply(`❌ ${friendly}`);
}

// ============== Message Interrupt ==============

// Lazy import to avoid circular dependency
let sessionModule: typeof import("./session-registry") | null = null;

export interface InterruptResult {
  isInterrupt: boolean;
  isRedirect?: boolean;
  redirectMessage?: string;
  /** Original full text if not an interrupt prefix */
  originalText?: string;
}

/**
 * Check if the message starts with `!` (interrupt prefix).
 * Returns an InterruptResult describing how to handle the message:
 * - `isInterrupt: false` — normal message, pass `originalText` to Claude.
 * - `isInterrupt: true, isRedirect: false` — stop-only interrupt (`!`, `!стоп`, `!stop`).
 * - `isInterrupt: true, isRedirect: true` — stop + redirect: abort current query
 *   then fire a new one with `redirectMessage`.
 *
 * Side effect: if a session is running, it is stopped synchronously before returning.
 */
export async function checkInterrupt(
  text: string,
  userId: number
): Promise<InterruptResult> {
  if (!text || !text.startsWith("!")) {
    return { isInterrupt: false, originalText: text };
  }

  if (!sessionModule) {
    sessionModule = await import("./session-registry");
  }

  const strippedText = text.slice(1).trimStart();
  const normalizedInterrupt = strippedText.trim().toLowerCase();

  const userSession = sessionModule.getSession(userId);
  if (userSession.isRunning) {
    console.log(`[${userSession.profile.label}] ! prefix - interrupting current query`);
    userSession.markInterrupt();
    await userSession.stop();
    userSession.clearStopRequested();
  }

  const isStopOnly = normalizedInterrupt === "stop" || normalizedInterrupt === "/stop" || normalizedInterrupt === "стоп" || normalizedInterrupt === "";

  if (isStopOnly) {
    return { isInterrupt: true, isRedirect: false };
  }

  return { isInterrupt: true, isRedirect: true, redirectMessage: strippedText };
}
