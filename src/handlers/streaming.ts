/**
 * Shared streaming callback for Claude Telegram Bot handlers.
 *
 * Provides a reusable status callback for streaming Claude responses.
 */

import { unlinkSync, realpathSync } from "fs";
import type { Context } from "grammy";
import type { Message } from "grammy/types";
import { InlineKeyboard, InputFile } from "grammy";
import type { StatusCallback, TodoItem } from "../types";
import { convertMarkdownToHtml, escapeHtml } from "../formatting";
import {
  TELEGRAM_MESSAGE_LIMIT,
  TELEGRAM_SAFE_LIMIT,
  STREAMING_THROTTLE_MS,
  BUTTON_LABEL_MAX_LENGTH,
} from "../config";
import { getUserProfile } from "../config";
import { isPathAllowedFor } from "../security";
import { pickRandomPhrase } from "../idle-phrases";
import { initiateGoogleConnections, getComposioApiKey } from "../composio";
import { replyFriendly } from "../utils";

/**
 * Create inline keyboard for ask_user options.
 */
export function createAskUserKeyboard(
  requestId: string,
  options: string[]
): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  for (let idx = 0; idx < options.length; idx++) {
    const option = options[idx]!;
    // Truncate long options for button display
    const display =
      option.length > BUTTON_LABEL_MAX_LENGTH
        ? option.slice(0, BUTTON_LABEL_MAX_LENGTH) + "..."
        : option;
    const callbackData = `askuser:${requestId}:${idx}`;
    keyboard.text(display, callbackData).row();
  }
  return keyboard;
}

/**
 * Check for pending ask-user requests and send inline keyboards.
 * Globs only files belonging to this userId (per-user drop-box isolation).
 */
export async function checkPendingAskUserRequests(
  ctx: Context,
  chatId: number,
  userId?: number
): Promise<boolean> {
  // Use per-user glob when userId is known; fall back to legacy pattern only
  // for backwards compat (files written before this fix) — those are ignored below.
  const pattern = userId ? `ask-user-${userId}-*.json` : "ask-user-*.json";
  const glob = new Bun.Glob(pattern);
  let buttonsSent = false;

  for await (const filename of glob.scan({ cwd: "/tmp", absolute: false })) {
    const filepath = `/tmp/${filename}`;
    try {
      const file = Bun.file(filepath);
      const text = await file.text();
      const data = JSON.parse(text);

      // Only process pending requests for this chat
      if (data.status !== "pending") continue;
      if (String(data.chat_id) !== String(chatId)) continue;
      // Defense-in-depth: verify userId in JSON matches the caller, even if
      // the filename already scoped the glob correctly.
      if (userId && data.user_id && String(data.user_id) !== String(userId)) {
        console.warn(`[ask-user] userId mismatch in ${filename} — skipping`);
        continue;
      }

      const question = data.question || "Please choose:";
      const options = data.options || [];
      const requestId = data.request_id || "";

      if (options.length > 0 && requestId) {
        const keyboard = createAskUserKeyboard(requestId, options);
        await ctx.reply(`❓ ${question}`, { reply_markup: keyboard });
        buttonsSent = true;

        // Mark as sent
        data.status = "sent";
        await Bun.write(filepath, JSON.stringify(data));
      }
    } catch (error) {
      console.warn(`Failed to process ask-user file ${filepath}:`, error);
    }
  }

  return buttonsSent;
}

// File extensions grouped by Telegram send method
const VIDEO_EXTENSIONS = new Set([".mp4", ".mov", ".avi", ".webm", ".mkv"]);
const PHOTO_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp"]);
const AUDIO_EXTENSIONS = new Set([".mp3", ".wav", ".ogg", ".flac", ".m4a"]);

/**
 * Check for pending send-file requests and deliver files via Telegram.
 */
export async function checkPendingSendFileRequests(
  ctx: Context,
  chatId: number,
  userId?: number
): Promise<boolean> {
  // Use per-user glob when userId is known; fall back to legacy pattern.
  const pattern = userId ? `send-file-${userId}-*.json` : "send-file-*.json";
  const glob = new Bun.Glob(pattern);
  let fileSent = false;

  for await (const filename of glob.scan({ cwd: "/tmp", absolute: false })) {
    const filepath = `/tmp/${filename}`;
    try {
      const file = Bun.file(filepath);
      const text = await file.text();
      const data = JSON.parse(text);

      // Only process pending requests for this chat
      if (data.status !== "pending") continue;
      if (String(data.chat_id) !== String(chatId)) continue;
      // Defense-in-depth: verify userId in JSON matches the caller.
      if (userId && data.user_id && String(data.user_id) !== String(userId)) {
        console.warn(`[send-file] userId mismatch in ${filename} — skipping`);
        continue;
      }

      const filePath: string = data.file_path || "";
      const rawCaption: string | undefined = data.caption || undefined;
      // Telegram rejects captions longer than 1024 characters (V-30K)
      const caption: string | undefined = rawCaption !== undefined
        ? (rawCaption.length > 1024 ? rawCaption.slice(0, 1021) + "…" : rawCaption)
        : undefined;
      const asDocument: boolean = data.as_document === true;

      if (!filePath) {
        try { unlinkSync(filepath); } catch { /* ignore */ }
        continue;
      }

      // Path validation: resolve symlinks and check against user's allowed paths
      let realFilePath: string;
      try {
        realFilePath = realpathSync(filePath);
      } catch {
        console.error(`[audit] send_file path-not-found userId=${userId} requested=${filePath}`);
        await ctx.reply("Не могу отправить файл: путь не существует.");
        try { unlinkSync(filepath); } catch { /* ignore */ }
        continue;
      }
      const sendProfile = getUserProfile(userId ?? 0);
      if (!isPathAllowedFor(realFilePath, sendProfile.allowedPaths)) {
        console.error(`[audit] send_file path-rejected userId=${userId} requested=${filePath} real=${realFilePath}`);
        await ctx.reply("Не могу отправить файл вне твоей рабочей папки.");
        try { unlinkSync(filepath); } catch { /* ignore */ }
        continue;
      }

      try {
        const ext = filePath.slice(filePath.lastIndexOf(".")).toLowerCase();
        const inputFile = new InputFile(filePath);

        if (asDocument) {
          await ctx.replyWithDocument(inputFile, { caption });
        } else if (VIDEO_EXTENSIONS.has(ext)) {
          await ctx.replyWithVideo(inputFile, { caption });
        } else if (PHOTO_EXTENSIONS.has(ext)) {
          await ctx.replyWithPhoto(inputFile, { caption });
        } else if (AUDIO_EXTENSIONS.has(ext)) {
          await ctx.replyWithAudio(inputFile, { caption });
        } else {
          await ctx.replyWithDocument(inputFile, { caption });
        }

        fileSent = true;
        // Clean up the request file only after successful delivery.
        try { unlinkSync(filepath); } catch { /* ignore */ }
      } catch (sendError) {
        console.error(`Failed to send file ${filePath}:`, sendError);
        await ctx.reply(
          `Failed to send file: ${filePath.split("/").pop() || "unknown"}`
        );
      }
    } catch (error) {
      console.warn(`Failed to process send-file request ${filepath}:`, error);
    }
  }

  return fileSent;
}

/**
 * Check for pending connect-google requests and send OAuth inline keyboards.
 */
export async function checkPendingConnectGoogleRequests(
  ctx: Context,
  chatId: number,
  userId: number
): Promise<boolean> {
  // Scope glob to this userId's files; fall back to legacy pattern only for
  // files written before this fix (those will fail the userId check below).
  const pattern = `connect-google-${userId}-*.json`;
  const glob = new Bun.Glob(pattern);
  let buttonsSent = false;

  for await (const filename of glob.scan({ cwd: "/tmp", absolute: false })) {
    const filepath = `/tmp/${filename}`;
    try {
      const file = Bun.file(filepath);
      const text = await file.text();
      const data = JSON.parse(text);

      // Only process pending requests for this chat
      if (data.status !== "pending") continue;
      if (String(data.chat_id) !== String(chatId)) continue;
      // Defense-in-depth: verify userId in JSON matches the caller.
      if (data.user_id && String(data.user_id) !== String(userId)) {
        console.warn(`[connect-google] userId mismatch in ${filename} — skipping`);
        continue;
      }

      // Clean up the request file before doing async work
      try { unlinkSync(filepath); } catch { /* ignore */ }

      if (!getComposioApiKey()) {
        await ctx.reply(
          "Google-интеграция временно недоступна. Обратись к владельцу."
        );
        buttonsSent = true;
        continue;
      }

      try {
        const connections = await initiateGoogleConnections(userId);
        const keyboard = new InlineKeyboard();
        for (const conn of connections) {
          keyboard.url(`${conn.emoji} ${conn.label}`, conn.redirectUrl).row();
        }
        await ctx.reply(
          "🔑 Подключи свой Google-аккаунт. Нажми каждую кнопку и пройди OAuth " +
            "(можно по одной — те сервисы что не нужны не подключай). " +
            "После авторизации можешь сразу просить меня что-то сделать в Google Docs/Drive/Sheets/Gmail/Calendar.",
          { reply_markup: keyboard }
        );
        buttonsSent = true;
      } catch (e) {
        await replyFriendly(ctx, e, "подключение Google");
        buttonsSent = true;
      }
    } catch (error) {
      console.warn(`Failed to process connect-google file ${filepath}:`, error);
    }
  }

  return buttonsSent;
}

/**
 * Render a todo list as HTML for Telegram.
 */
function renderTodoList(items: TodoItem[]): string {
  const icon: Record<string, string> = { pending: '◻', in_progress: '⏳', done: '✅' };
  return '<b>Выполняю:</b>\n' + items.map(i => `${icon[i.status] ?? '•'} ${escapeHtml(i.label)}`).join('\n');
}

/**
 * Tracks state for streaming message updates.
 */
export class StreamingState {
  textMessages = new Map<number, Message>(); // segment_id -> telegram message
  toolMessages: Message[] = []; // ephemeral tool status messages
  lastEditTimes = new Map<number, number>(); // segment_id -> last edit time
  lastContent = new Map<number, string>(); // segment_id -> last sent content
  maxSegmentId: number = -1; // highest segment_id seen so far
  todoMsgId?: number; // message_id of the todo progress message
  todoItems: TodoItem[] = [];
  private _heartbeat: IdleHeartbeat | null = null;

  set heartbeat(h: IdleHeartbeat) { this._heartbeat = h; }

  async cleanup(): Promise<void> {
    if (this._heartbeat) {
      await this._heartbeat.stop();
      this._heartbeat = null;
    }
  }
}

/**
 * Sends idle heartbeat phrases while the model is silent for >15 seconds.
 * Rotates the phrase every 10 seconds by editing the same message.
 * When the model invokes a tool, the heartbeat can be told (via setContext)
 * what's actually happening — a short, serious phrase that replaces the
 * random idle phrase. While a fresh context phrase exists (<15s old), it is
 * preferred over the random idle phrases.
 * Stopped (and message deleted) as soon as the model produces user-visible text.
 */
class IdleHeartbeat {
  private silenceTimer: ReturnType<typeof setTimeout> | null = null;
  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private idleMessage: Message | null = null;
  private currentPhrase: string | null = null;
  private contextPhrase: string | null = null;
  private contextPhraseAt = 0;
  private lastContextUpdate = 0;
  private stopped = false;

  private static readonly INITIAL_DELAY = 15_000;
  private static readonly TICK_INTERVAL = 10_000;
  private static readonly CONTEXT_FRESHNESS_MS = 15_000;
  private static readonly CONTEXT_THROTTLE_MS = 5_000;

  constructor(private ctx: Context) {}

  start(): void {
    this.armSilenceTimer();
  }

  tick(): void {
    if (this.stopped) return;
    void this.removeIdleMessage();
    this.armSilenceTimer();
  }

  /**
   * Inform the heartbeat that the model started a concrete action.
   * Replaces the current idle phrase (or kicks off the heartbeat early)
   * with a short, serious description. Throttled to one update per 5s so
   * rapid tool storms don't make the message flicker.
   */
  async setContext(phrase: string | null): Promise<void> {
    if (this.stopped || !phrase) return;
    const now = Date.now();
    if (now - this.lastContextUpdate < IdleHeartbeat.CONTEXT_THROTTLE_MS) return;
    this.lastContextUpdate = now;
    this.contextPhrase = phrase;
    this.contextPhraseAt = now;

    if (this.idleMessage) {
      if (this.currentPhrase === phrase) return;
      this.currentPhrase = phrase;
      try {
        await this.ctx.api.editMessageText(
          this.idleMessage.chat.id,
          this.idleMessage.message_id,
          phrase
        );
      } catch (err) {
        const s = String(err);
        if (!s.includes("not modified")) {
          console.debug("IdleHeartbeat: context edit failed:", err);
        }
      }
      return;
    }

    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }
    try {
      this.idleMessage = await this.ctx.reply(phrase);
      this.currentPhrase = phrase;
    } catch (err) {
      console.debug("IdleHeartbeat: context initial reply failed:", err);
      return;
    }
    if (!this.tickTimer) {
      this.tickTimer = setInterval(
        () => void this.rotatePhrase(),
        IdleHeartbeat.TICK_INTERVAL
      );
    }
  }

  async stop(): Promise<void> {
    if (this.stopped) return;
    this.stopped = true;
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }
    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
    await this.removeIdleMessage();
  }

  private armSilenceTimer(): void {
    if (this.stopped) return;
    if (this.silenceTimer) clearTimeout(this.silenceTimer);
    this.silenceTimer = setTimeout(
      () => void this.beginTicking(),
      IdleHeartbeat.INITIAL_DELAY
    );
  }

  private async beginTicking(): Promise<void> {
    if (this.stopped) return;
    const phrase = this.pickPhrase();
    this.currentPhrase = phrase;
    try {
      this.idleMessage = await this.ctx.reply(phrase);
    } catch (err) {
      console.debug("IdleHeartbeat: failed to send initial phrase:", err);
      return;
    }
    this.tickTimer = setInterval(
      () => void this.rotatePhrase(),
      IdleHeartbeat.TICK_INTERVAL
    );
  }

  private pickPhrase(): string {
    const now = Date.now();
    const isContextFresh =
      this.contextPhrase !== null &&
      now - this.contextPhraseAt < IdleHeartbeat.CONTEXT_FRESHNESS_MS;
    if (isContextFresh) return this.contextPhrase!;
    return pickRandomPhrase(this.currentPhrase ?? undefined);
  }

  private async rotatePhrase(): Promise<void> {
    if (this.stopped || !this.idleMessage) return;
    const next = this.pickPhrase();
    if (next === this.currentPhrase) return;
    this.currentPhrase = next;
    try {
      await this.ctx.api.editMessageText(
        this.idleMessage.chat.id,
        this.idleMessage.message_id,
        next
      );
    } catch (err) {
      const s = String(err);
      if (!s.includes("not modified")) {
        console.debug("IdleHeartbeat: rotate edit failed:", err);
      }
      // Stop hammering if Telegram rate-limits us for this chat
      if (s.includes("429")) {
        const match = s.match(/retry after (\d+)/i);
        const retryAfter = match ? parseInt(match[1]!, 10) : 0;
        if (retryAfter > 30) {
          console.warn(`IdleHeartbeat: rate limited ${retryAfter}s for chat ${this.idleMessage?.chat.id}, stopping`);
          void this.stop();
        }
      }
    }
  }

  private async removeIdleMessage(): Promise<void> {
    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
    if (this.idleMessage) {
      const msg = this.idleMessage;
      this.idleMessage = null;
      this.currentPhrase = null;
      try {
        await this.ctx.api.deleteMessage(msg.chat.id, msg.message_id);
      } catch (err) {
        console.debug("IdleHeartbeat: delete failed:", err);
      }
    }
  }
}

/**
 * Format content for Telegram, ensuring it fits within the message limit.
 * Truncates raw content and re-converts if HTML output exceeds the limit.
 */
function formatWithinLimit(
  content: string,
  safeLimit: number = TELEGRAM_SAFE_LIMIT
): string {
  let display =
    content.length > safeLimit ? content.slice(0, safeLimit) + "..." : content;
  let formatted = convertMarkdownToHtml(display);

  // HTML tags can inflate content beyond the limit - shrink until it fits
  if (formatted.length > TELEGRAM_MESSAGE_LIMIT) {
    const ratio = TELEGRAM_MESSAGE_LIMIT / formatted.length;
    display = content.slice(0, Math.floor(safeLimit * ratio * 0.95)) + "...";
    formatted = convertMarkdownToHtml(display);
  }

  return formatted;
}

/**
 * Split long formatted content into chunks and send as separate messages.
 */
async function sendChunkedMessages(
  ctx: Context,
  content: string
): Promise<void> {
  // Split on markdown content first, then format each chunk
  for (let i = 0; i < content.length; i += TELEGRAM_SAFE_LIMIT) {
    const chunk = content.slice(i, i + TELEGRAM_SAFE_LIMIT);
    try {
      await ctx.reply(chunk, { parse_mode: "HTML" });
    } catch {
      // HTML failed (possibly broken tags from split) - try plain text
      try {
        await ctx.reply(chunk);
      } catch (plainError) {
        console.debug("Failed to send chunk:", plainError);
      }
    }
  }
}

/**
 * Create a status callback for streaming updates.
 */
export function createStatusCallback(
  ctx: Context,
  state: StreamingState
): StatusCallback {
  const heartbeat = new IdleHeartbeat(ctx);
  heartbeat.start();
  state.heartbeat = heartbeat;

  return async (statusType: string, content: string, segmentId?: number) => {
    // "context" is a hint about what tool is running right now. It should
    // surface the heartbeat (or update its phrase), NOT reset it like real
    // model output does.
    if (statusType === "context") {
      try {
        await heartbeat.setContext(content || null);
      } catch (err) {
        console.debug("heartbeat.setContext failed:", err);
      }
      return;
    }
    heartbeat.tick();
    try {
      if (statusType === "todo_init" || statusType === "todo_update") {
        try {
          const items = JSON.parse(content) as TodoItem[];
          state.todoItems = items;
          const html = renderTodoList(items);
          if (!state.todoMsgId) {
            const msg = await ctx.reply(html, { parse_mode: "HTML" });
            state.todoMsgId = msg.message_id;
          } else {
            try {
              await ctx.api.editMessageText(ctx.chat!.id, state.todoMsgId, html, { parse_mode: "HTML" });
            } catch (editErr) {
              const s = String(editErr);
              if (!s.includes("not modified")) {
                console.debug("todo edit failed:", editErr);
              }
            }
          }
        } catch (parseErr) {
          console.debug("todo parse error:", parseErr);
        }
        return;
      } else if (statusType === "thinking") {
        // Show thinking inline, compact (first 500 chars)
        const preview =
          content.length > 500 ? content.slice(0, 500) + "..." : content;
        const escaped = escapeHtml(preview);
        const thinkingMsg = await ctx.reply(`🧠 <i>${escaped}</i>`, {
          parse_mode: "HTML",
        });
        state.toolMessages.push(thinkingMsg);
      } else if (statusType === "tool") {
        const toolMsg = await ctx.reply(content, { parse_mode: "HTML" });
        state.toolMessages.push(toolMsg);
      } else if (statusType === "text" && segmentId !== undefined) {
        const now = Date.now();
        const lastEdit = state.lastEditTimes.get(segmentId) || 0;

        if (!state.textMessages.has(segmentId)) {
          // New segment - create message
          const formatted = formatWithinLimit(content);
          try {
            const msg = await ctx.reply(formatted, { parse_mode: "HTML" });
            state.textMessages.set(segmentId, msg);
            state.lastContent.set(segmentId, formatted);
          } catch (htmlError) {
            // HTML parse failed, fall back to plain text
            console.debug("HTML reply failed, using plain text:", htmlError);
            const msg = await ctx.reply(formatted);
            state.textMessages.set(segmentId, msg);
            state.lastContent.set(segmentId, formatted);
          }
          state.maxSegmentId = Math.max(state.maxSegmentId, segmentId);
          state.lastEditTimes.set(segmentId, now);
        } else if (now - lastEdit > STREAMING_THROTTLE_MS) {
          // Update existing segment message (throttled)
          const msg = state.textMessages.get(segmentId)!;
          const formatted = formatWithinLimit(content);
          // Skip if content unchanged
          if (formatted === state.lastContent.get(segmentId)) {
            return;
          }
          try {
            await ctx.api.editMessageText(
              msg.chat.id,
              msg.message_id,
              formatted,
              {
                parse_mode: "HTML",
              }
            );
            state.lastContent.set(segmentId, formatted);
          } catch (error) {
            const errorStr = String(error);
            if (errorStr.includes("MESSAGE_TOO_LONG")) {
              // Skip this intermediate update - segment_end will chunk properly
              console.debug(
                "Streaming edit too long, deferring to segment_end"
              );
            } else {
              console.debug("HTML edit failed, trying plain text:", error);
              try {
                await ctx.api.editMessageText(
                  msg.chat.id,
                  msg.message_id,
                  formatted
                );
                state.lastContent.set(segmentId, formatted);
              } catch (editError) {
                console.debug("Edit message failed:", editError);
              }
            }
          }
          state.lastEditTimes.set(segmentId, now);
        }
      } else if (statusType === "segment_end" && segmentId !== undefined) {
        if (!state.textMessages.has(segmentId) && content) {
          // No intermediate message was created (short response, no streaming updates).
          // Send it fresh now.
          const formatted = convertMarkdownToHtml(content);
          try {
            const msg = await ctx.reply(formatted, { parse_mode: "HTML" });
            state.textMessages.set(segmentId, msg);
            state.lastContent.set(segmentId, formatted);
          } catch {
            await ctx.reply(content);
          }
          state.maxSegmentId = Math.max(state.maxSegmentId, segmentId);
        } else if (state.textMessages.has(segmentId) && content) {
          const msg = state.textMessages.get(segmentId)!;
          const formatted = convertMarkdownToHtml(content);

          // Skip if content unchanged
          if (formatted === state.lastContent.get(segmentId)) {
            return;
          }

          if (formatted.length <= TELEGRAM_MESSAGE_LIMIT) {
            try {
              await ctx.api.editMessageText(
                msg.chat.id,
                msg.message_id,
                formatted,
                {
                  parse_mode: "HTML",
                }
              );
            } catch (error) {
              const errorStr = String(error);
              if (errorStr.includes("MESSAGE_TOO_LONG")) {
                // HTML overhead pushed it over - delete and chunk
                try {
                  await ctx.api.deleteMessage(msg.chat.id, msg.message_id);
                } catch (delError) {
                  console.debug("Failed to delete for chunking:", delError);
                }
                await sendChunkedMessages(ctx, formatted);
              } else {
                console.debug("Failed to edit final message:", error);
              }
            }
          } else {
            // Too long - delete and split
            try {
              await ctx.api.deleteMessage(msg.chat.id, msg.message_id);
            } catch (error) {
              console.debug("Failed to delete message for splitting:", error);
            }
            await sendChunkedMessages(ctx, formatted);
          }
        }
      } else if (statusType === "done") {
        // Delete todo progress message if present
        if (state.todoMsgId) {
          try {
            await ctx.api.deleteMessage(ctx.chat!.id, state.todoMsgId);
          } catch (err) {
            const s = String(err);
            if (s.includes("429") || s.includes("Too Many Requests")) {
              console.warn("[rate-limit] Telegram 429 deleting todo message, skipping");
            } else {
              console.debug("Failed to delete todo message:", err);
            }
          }
          state.todoMsgId = undefined;
        }
        // Delete tool messages — stop the loop immediately on 429 to avoid
        // making Telegram's rate limit worse (retry_after can reach hours).
        let rateLimited = false;
        for (const toolMsg of state.toolMessages) {
          if (rateLimited) break;
          try {
            await ctx.api.deleteMessage(toolMsg.chat.id, toolMsg.message_id);
          } catch (error) {
            const s = String(error);
            if (s.includes("429") || s.includes("Too Many Requests")) {
              console.warn(`[rate-limit] Telegram 429 on deleteMessage (tool), aborting remaining deletions`);
              rateLimited = true;
            } else {
              console.debug("Failed to delete tool message:", error);
            }
          }
        }
        // Delete intermediate text segments.
        // Keep: the final segment (maxSegmentId) and segment 0 (plan announcement).
        // Segment 0 is the pre-work announcement Claude writes before the first tool call
        // per the system prompt instruction — it should stay visible alongside the result.
        if (!rateLimited) {
          const totalSegments = state.textMessages.size;
          for (const [sid, textMsg] of state.textMessages) {
            if (rateLimited) break;
            const isFinal = sid === state.maxSegmentId;
            const isAnnouncement = sid === 0 && totalSegments > 1;
            if (isFinal || isAnnouncement) continue;
            try {
              await ctx.api.deleteMessage(textMsg.chat.id, textMsg.message_id);
            } catch (error) {
              const s = String(error);
              if (s.includes("429") || s.includes("Too Many Requests")) {
                console.warn(`[rate-limit] Telegram 429 on deleteMessage (text segment), aborting remaining deletions`);
                rateLimited = true;
              } else {
                console.debug("Failed to delete intermediate text message:", error);
              }
            }
          }
        }
        await heartbeat.stop();
      }
    } catch (error) {
      console.error("Status callback error:", error);
    }
  };
}
