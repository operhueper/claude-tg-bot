import type { Context } from "grammy";

export const DEBOUNCE_MS = 800;
export const MAX_MESSAGES = 10;
export const MAX_TOTAL_CHARS = 10000;

interface BufferState {
  messages: string[];
  timer: NodeJS.Timeout | null;
  ctx: Context;
  flushCallback: (combinedText: string, latestCtx: Context) => Promise<void>;
  flushing: boolean;
  pendingDuringFlush: Array<{ text: string; ctx: Context }>;
}

const buffers = new Map<number, BufferState>();

function totalChars(messages: string[]): number {
  return messages.reduce((sum, m) => sum + m.length, 0);
}

function scheduleFlush(userId: number, delayMs: number): void {
  const state = buffers.get(userId);
  if (!state) return;

  if (state.timer !== null) {
    clearTimeout(state.timer);
  }

  state.timer = setTimeout(() => runFlush(userId), delayMs);
}

async function runFlush(userId: number): Promise<void> {
  const state = buffers.get(userId);
  if (!state || state.messages.length === 0) {
    buffers.delete(userId);
    return;
  }

  state.timer = null;
  state.flushing = true;

  const combined = state.messages.join("\n\n");
  const latestCtx = state.ctx;
  state.messages = [];

  try {
    await state.flushCallback(combined, latestCtx);
  } catch (err) {
    console.error(
      `[message-buffer] flush error for user ${userId}: ${String(err).slice(0, 200)}`
    );
  } finally {
    state.flushing = false;

    if (state.pendingDuringFlush.length > 0) {
      const pending = state.pendingDuringFlush.splice(0);
      for (const item of pending) {
        state.messages.push(item.text);
        state.ctx = item.ctx;
      }
      scheduleFlush(userId, 0);
    } else {
      buffers.delete(userId);
    }
  }
}

export function enqueueDebounced(
  userId: number,
  text: string,
  ctx: Context,
  flushCallback: (combinedText: string, latestCtx: Context) => Promise<void>
): void {
  let state = buffers.get(userId);

  if (state?.flushing) {
    state.pendingDuringFlush.push({ text, ctx });
    state.ctx = ctx;
    return;
  }

  if (!state) {
    state = {
      messages: [],
      timer: null,
      ctx,
      flushCallback,
      flushing: false,
      pendingDuringFlush: [],
    };
    buffers.set(userId, state);
  }

  state.messages.push(text);
  state.ctx = ctx;

  const chars = totalChars(state.messages);
  if (state.messages.length >= MAX_MESSAGES || chars >= MAX_TOTAL_CHARS) {
    scheduleFlush(userId, 0);
    return;
  }

  scheduleFlush(userId, DEBOUNCE_MS);
}

export function flushBufferNow(userId: number): void {
  const state = buffers.get(userId);
  if (!state || state.messages.length === 0) return;
  scheduleFlush(userId, 0);
}

export function hasPendingBuffer(userId: number): boolean {
  const state = buffers.get(userId);
  return !!(state && (state.timer !== null || state.flushing));
}
