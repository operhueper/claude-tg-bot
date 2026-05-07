/**
 * Shared streaming callback for Claude Telegram Bot handlers.
 *
 * Provides a reusable status callback for streaming Claude responses.
 */

import { unlinkSync } from "fs";
import type { Context } from "grammy";
import type { Message } from "grammy/types";
import { InlineKeyboard, InputFile } from "grammy";
import type { StatusCallback } from "../types";
import { convertMarkdownToHtml, escapeHtml } from "../formatting";
import {
  TELEGRAM_MESSAGE_LIMIT,
  TELEGRAM_SAFE_LIMIT,
  STREAMING_THROTTLE_MS,
  BUTTON_LABEL_MAX_LENGTH,
} from "../config";
import { pickRandomPhrase } from "../idle-phrases";

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
 */
export async function checkPendingAskUserRequests(
  ctx: Context,
  chatId: number
): Promise<boolean> {
  const glob = new Bun.Glob("ask-user-*.json");
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
  const glob = new Bun.Glob("send-file-*.json");
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
      // If user_id is recorded in the drop file, ensure it matches the current user
      if (data.user_id && userId && String(data.user_id) !== String(userId)) continue;

      const filePath: string = data.file_path || "";
      const caption: string | undefined = data.caption || undefined;
      const asDocument: boolean = data.as_document === true;

      if (!filePath) {
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
      } catch (sendError) {
        console.error(`Failed to send file ${filePath}:`, sendError);
        await ctx.reply(
          `Failed to send file: ${filePath.split("/").pop() || "unknown"}`
        );
      }

      // Always clean up the request file
      try { unlinkSync(filepath); } catch { /* ignore */ }
    } catch (error) {
      console.warn(`Failed to process send-file request ${filepath}:`, error);
    }
  }

  return fileSent;
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
}

/**
 * Sends idle heartbeat phrases while the model is silent for >15 seconds.
 * Rotates the phrase every 3 seconds by editing the same message.
 * Stopped (and message deleted) as soon as the model produces any output.
 */
class IdleHeartbeat {
  private silenceTimer: ReturnType<typeof setTimeout> | null = null;
  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private idleMessage: Message | null = null;
  private currentPhrase: string | null = null;
  private stopped = false;

  private static readonly INITIAL_DELAY = 15_000;
  private static readonly TICK_INTERVAL = 3_000;

  constructor(private ctx: Context) {}

  start(): void {
    this.armSilenceTimer();
  }

  tick(): void {
    if (this.stopped) return;
    void this.removeIdleMessage();
    this.armSilenceTimer();
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
    const phrase = pickRandomPhrase();
    this.currentPhrase = phrase;
    try {
      this.idleMessage = await this.ctx.reply(`🌀 ${phrase}…`);
    } catch (err) {
      console.debug("IdleHeartbeat: failed to send initial phrase:", err);
      return;
    }
    this.tickTimer = setInterval(
      () => void this.rotatePhrase(),
      IdleHeartbeat.TICK_INTERVAL
    );
  }

  private async rotatePhrase(): Promise<void> {
    if (this.stopped || !this.idleMessage) return;
    const next = pickRandomPhrase(this.currentPhrase ?? undefined);
    this.currentPhrase = next;
    try {
      await this.ctx.api.editMessageText(
        this.idleMessage.chat.id,
        this.idleMessage.message_id,
        `🌀 ${next}…`
      );
    } catch (err) {
      const s = String(err);
      if (!s.includes("not modified")) {
        console.debug("IdleHeartbeat: rotate edit failed:", err);
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

  return async (statusType: string, content: string, segmentId?: number) => {
    heartbeat.tick();
    try {
      if (statusType === "thinking") {
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
        if (state.textMessages.has(segmentId) && content) {
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
        // Delete tool messages
        for (const toolMsg of state.toolMessages) {
          try {
            await ctx.api.deleteMessage(toolMsg.chat.id, toolMsg.message_id);
          } catch (error) {
            console.debug("Failed to delete tool message:", error);
          }
        }
        // Delete intermediate text segments.
        // Keep: the final segment (maxSegmentId) always.
        // Also keep: segment 0 (plan announcement) when there are multiple segments —
        // it's the pre-work announcement the user should see alongside the final answer.
        const totalSegments = state.textMessages.size;
        for (const [sid, textMsg] of state.textMessages) {
          const isFinal = sid === state.maxSegmentId;
          const isAnnouncement = sid === 0 && totalSegments > 1;
          if (isFinal || isAnnouncement) continue;
          try {
            await ctx.api.deleteMessage(textMsg.chat.id, textMsg.message_id);
          } catch (error) {
            console.debug("Failed to delete intermediate text message:", error);
          }
        }
        await heartbeat.stop();
      }
    } catch (error) {
      console.error("Status callback error:", error);
    }
  };
}
