/**
 * Photo message handler for Claude Telegram Bot.
 *
 * Supports single photos and media groups (albums) with 1s buffering.
 */

import type { Context } from "grammy";
import { getSession } from "../session-registry";
import { ALLOWED_USERS, inboxDirFor, getUserProfile, OWNER_USER_ID } from "../config";
import { acquireUserLock, isUserBusy, acquireContainerSlot, getQueueStatus } from "../request-queue";
import { isAuthorized, rateLimiter } from "../security";
import { isDailyLimitReached, getDailyUsage, incrementDailyUsage } from "../daily-limit";
import { upgradeKeyboard } from "../keyboards";
import { auditLog, auditLogRateLimit, startTypingIndicator } from "../utils";
import { StreamingState, createStatusCallback } from "./streaming";
import { createMediaGroupBuffer, handleProcessingError } from "./media-group";

// Create photo-specific media group buffer
const photoBuffer = createMediaGroupBuffer({
  emoji: "📷",
  itemLabel: "photo",
  itemLabelPlural: "photos",
});

/**
 * Download a photo and return the local path.
 *
 * Container-enabled guests get the file in their vault inbox so the sandbox
 * can read it at the same absolute path. Owner / non-container guests get
 * the legacy host TEMP_DIR (see `inboxDirFor`).
 */
async function downloadPhoto(ctx: Context, userId: number): Promise<string> {
  const photos = ctx.message?.photo;
  if (!photos || photos.length === 0) {
    throw new Error("No photo in message");
  }

  // Get the largest photo
  const file = await ctx.getFile();

  const timestamp = Date.now();
  const random = Math.random().toString(36).slice(2, 8);
  const photoPath = `${inboxDirFor(userId)}/photo_${timestamp}_${random}.jpg`;

  // Download
  const response = await fetch(
    `https://api.telegram.org/file/bot${ctx.api.token}/${file.file_path}`
  );
  const buffer = await response.arrayBuffer();
  await Bun.write(photoPath, buffer);

  return photoPath;
}

/**
 * Process photos with Claude.
 */
async function processPhotos(
  ctx: Context,
  photoPaths: string[],
  caption: string | undefined,
  userId: number,
  username: string,
  chatId: number
): Promise<void> {
  const session = getSession(userId);

  // Mark processing started
  const stopProcessing = session.startProcessing();

  // Build prompt
  let prompt: string;
  if (photoPaths.length === 1) {
    prompt = caption
      ? `[Photo: ${photoPaths[0]}]\n\n${caption}`
      : `[Photo: ${photoPaths[0]}]`;
  } else {
    const pathsList = photoPaths.map((p, i) => `${i + 1}. ${p}`).join("\n");
    prompt = caption
      ? `[Photos:\n${pathsList}]\n\n${caption}`
      : `[Photos:\n${pathsList}]`;
  }

  // Set conversation title (if new session)
  if (!session.isActive) {
    const rawTitle = caption || "[Foto]";
    const title =
      rawTitle.length > 50 ? rawTitle.slice(0, 47) + "..." : rawTitle;
    session.conversationTitle = title;
  }

  // Start typing
  const typing = startTypingIndicator(ctx);

  // Create streaming state
  const state = new StreamingState();
  const statusCallback = createStatusCallback(ctx, state);

  try {
    const response = await session.sendMessageStreaming(
      prompt,
      username,
      userId,
      statusCallback,
      chatId,
      ctx,
      true // mediaHint: photo content
    );

    await auditLog(userId, username, "PHOTO", prompt, response);
  } catch (error) {
    await handleProcessingError(ctx, error, state.toolMessages);
  } finally {
    await state.cleanup();
    stopProcessing();
    typing.stop();
  }
}

/**
 * Process an image file sent as a document (PNG, JPG, etc.)
 * Routes through the same vision pipeline as regular photos.
 */
export async function processImageDocument(
  ctx: Context,
  filePath: string,
  caption: string | undefined,
  userId: number,
  username: string,
  chatId: number
): Promise<void> {
  await processPhotos(ctx, [filePath], caption, userId, username, chatId);
}

/**
 * Handle incoming photo messages.
 */
export async function handlePhoto(ctx: Context): Promise<void> {
  const userId = ctx.from?.id;
  const username = ctx.from?.username || "unknown";
  const chatId = ctx.chat?.id;
  const mediaGroupId = ctx.message?.media_group_id;

  if (!userId || !chatId) {
    return;
  }

  // 1. Authorization check
  if (!isAuthorized(userId, ALLOWED_USERS)) {
    await ctx.reply("Unauthorized. Contact the bot owner for access.");
    return;
  }

  // 1b. Daily message limit for free-tier users
  {
    const _profile = getUserProfile(userId);
    const dailyLimit = _profile.tierConfig.dailyMessageLimit;
    if (dailyLimit !== null && userId !== OWNER_USER_ID) {
      if (isDailyLimitReached(userId, dailyLimit)) {
        const { limit } = getDailyUsage(userId, dailyLimit);
        await ctx.reply(
          `Вы использовали все ${limit} бесплатных сообщений сегодня.\n` +
            `Лимит обновится в полночь по Москве.\n\n` +
            `На тарифе Профи — без ограничений. Плюс документы, код, Google и многое другое.\n\n` +
            `Привяжите карту — первые 5 дней бесплатно.`,
          { reply_markup: upgradeKeyboard() }
        );
        return;
      }
      incrementDailyUsage(userId);
    }
  }

  // Per-user lock — prevent two parallel requests from the same user
  if (isUserBusy(userId)) {
    await ctx.reply("⏳ Подожди — обрабатываю предыдущее сообщение.");
    return;
  }
  const releaseUserLock = await acquireUserLock(userId);

  // Container slot for users with containers enabled
  const _photoContainerProfile = getUserProfile(userId);
  let releaseContainerSlot: (() => void) | null = null;
  if (_photoContainerProfile.containerEnabled) {
    const { queued } = getQueueStatus();
    if (queued > 0) {
      await ctx.reply(`⏳ В очереди (${queued + 1}-й). Подождём немного...`);
    }
    releaseContainerSlot = await acquireContainerSlot();
  }

  try {
    // 2. For single photos, show status and rate limit early
    let statusMsg: Awaited<ReturnType<typeof ctx.reply>> | null = null;
    if (!mediaGroupId) {
      console.log(`Received photo from @${username}`);
      // Rate limit
      const [allowed, retryAfter] = rateLimiter.check(userId);
      if (!allowed) {
        await auditLogRateLimit(userId, username, retryAfter!);
        await ctx.reply(
          `⏳ Rate limited. Please wait ${retryAfter!.toFixed(1)} seconds.`
        );
        return;
      }

      // Show status immediately
      statusMsg = await ctx.reply("📷 Processing image...");
    }

    // 3. Download photo
    let photoPath: string;
    try {
      photoPath = await downloadPhoto(ctx, userId);
    } catch (error) {
      console.error("Failed to download photo:", error);
      if (statusMsg) {
        try {
          await ctx.api.editMessageText(
            statusMsg.chat.id,
            statusMsg.message_id,
            "❌ Failed to download photo."
          );
        } catch (editError) {
          console.debug("Failed to edit status message:", editError);
          await ctx.reply("❌ Failed to download photo.");
        }
      } else {
        await ctx.reply("❌ Failed to download photo.");
      }
      return;
    }

    // 4. Single photo - process immediately
    if (!mediaGroupId && statusMsg) {
      await processPhotos(
        ctx,
        [photoPath],
        ctx.message?.caption,
        userId,
        username,
        chatId
      );

      // Clean up status message
      try {
        await ctx.api.deleteMessage(statusMsg.chat.id, statusMsg.message_id);
      } catch (error) {
        console.debug("Failed to delete status message:", error);
      }
      return;
    }

    // 5. Media group - buffer with timeout
    if (!mediaGroupId) return; // TypeScript guard

    await photoBuffer.addToGroup(
      mediaGroupId,
      photoPath,
      ctx,
      userId,
      username,
      processPhotos
    );
  } finally {
    releaseContainerSlot?.();
    releaseUserLock();
  }
}
