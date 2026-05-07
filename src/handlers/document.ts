/**
 * Document handler for Claude Telegram Bot.
 *
 * Supports PDFs and text files with media group buffering.
 * PDF extraction uses pdftotext CLI (install via: brew install poppler)
 */

import type { Context } from "grammy";
import { getSession } from "../session-registry";
import { ALLOWED_USERS, TEMP_DIR, inboxDirFor } from "../config";
import { isAuthorized, rateLimiter } from "../security";
import { auditLog, auditLogRateLimit, replyFriendly, startTypingIndicator } from "../utils";
import { StreamingState, createStatusCallback } from "./streaming";
import { createMediaGroupBuffer, handleProcessingError } from "./media-group";
import { isAudioFile, processAudioFile } from "./audio";
import { processImageDocument } from "./photo";

// LAS/LAZ point cloud extensions
const LAS_EXTENSIONS = [".las", ".laz"];

// Supported text file extensions
const TEXT_EXTENSIONS = [
  ".md",
  ".txt",
  ".json",
  ".yaml",
  ".yml",
  ".csv",
  ".xml",
  ".html",
  ".css",
  ".js",
  ".ts",
  ".py",
  ".sh",
  ".env",
  ".log",
  ".cfg",
  ".ini",
  ".toml",
];

// Supported archive extensions
const ARCHIVE_EXTENSIONS = [".zip", ".tar", ".tar.gz", ".tgz"];

// Image extensions that should be processed via vision
const IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".gif", ".webp"];

function isImageFile(fileName: string, mimeType?: string): boolean {
  const lower = fileName.toLowerCase();
  return IMAGE_EXTENSIONS.some((ext) => lower.endsWith(ext)) ||
    (mimeType?.startsWith("image/") ?? false);
}

// Max file size (500MB)
const MAX_FILE_SIZE = 500 * 1024 * 1024;

// Max content from archive (50K chars total)
const MAX_ARCHIVE_CONTENT = 50000;

// Create document-specific media group buffer
const documentBuffer = createMediaGroupBuffer({
  emoji: "📄",
  itemLabel: "document",
  itemLabelPlural: "documents",
});

/**
 * Download a document and return the local path.
 */
async function downloadDocument(ctx: Context, userId: number): Promise<string> {
  const doc = ctx.message?.document;
  if (!doc) {
    throw new Error("No document in message");
  }

  const file = await ctx.getFile();
  const fileName = doc.file_name || `doc_${Date.now()}`;

  // Sanitize filename
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  const docPath = `${inboxDirFor(userId)}/${safeName}`;

  // Download
  const response = await fetch(
    `https://api.telegram.org/file/bot${ctx.api.token}/${file.file_path}`
  );
  const buffer = await response.arrayBuffer();
  await Bun.write(docPath, buffer);

  return docPath;
}

/**
 * Extract text from a document.
 */
async function extractText(
  filePath: string,
  mimeType?: string
): Promise<string> {
  const fileName = filePath.split("/").pop() || "";
  const extension = "." + (fileName.split(".").pop() || "").toLowerCase();

  // LAS/LAZ point cloud files - extract metadata via laspy
  if (LAS_EXTENSIONS.includes(extension)) {
    try {
      const script = `
import laspy, json, sys
las = laspy.read(sys.argv[1])
h = las.header
info = {
  "format": f"LAS {h.version_major}.{h.version_minor}",
  "point_format": int(h.point_format.id),
  "point_count": int(h.point_count),
  "scale": list(h.scale),
  "offset": list(h.offset),
  "mins": list(h.mins),
  "maxs": list(h.maxs),
  "dimensions": [str(d.name) for d in las.point_format.dimensions],
}
if hasattr(h, 'vlrs'):
  info["vlr_count"] = len(h.vlrs)
print(json.dumps(info, indent=2))
`;
      const result = await Bun.$`python3 -c ${script} ${filePath}`.quiet();
      const info = JSON.parse(result.text());
      const bounds = info.mins && info.maxs
        ? `X: ${info.mins[0].toFixed(2)}–${info.maxs[0].toFixed(2)}, Y: ${info.mins[1].toFixed(2)}–${info.maxs[1].toFixed(2)}, Z: ${info.mins[2].toFixed(2)}–${info.maxs[2].toFixed(2)}`
        : "unknown";
      return [
        `LAS Point Cloud File: ${fileName}`,
        `Format: ${info.format}, Point Format: ${info.point_format}`,
        `Points: ${info.point_count.toLocaleString()}`,
        `Bounds: ${bounds}`,
        `Scale: ${info.scale?.join(", ")}`,
        `Offset: ${info.offset?.join(", ")}`,
        `Dimensions: ${info.dimensions?.join(", ")}`,
        `File path (for further analysis): ${filePath}`,
      ].join("\n");
    } catch (error) {
      console.error("LAS parsing failed:", error);
      return `[LAS file: ${fileName}]\nFile path: ${filePath}\n(Could not parse metadata: ${String(error).slice(0, 200)})`;
    }
  }

  // PDF extraction using pdftotext CLI (install: brew install poppler)
  if (mimeType === "application/pdf" || extension === ".pdf") {
    try {
      const result = await Bun.$`pdftotext -layout ${filePath} -`.quiet();
      return result.text();
    } catch (error) {
      console.error("PDF parsing failed:", error);
      return "[PDF parsing failed - ensure pdftotext is installed: brew install poppler]";
    }
  }

  // DOCX extraction via mammoth
  if (
    extension === ".docx" ||
    mimeType ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    try {
      const mammoth = await import("mammoth");
      const result = await mammoth.extractRawText({ path: filePath });
      return result.value.slice(0, 100000);
    } catch (error) {
      console.error("DOCX parsing failed:", error);
      return "[DOCX parsing failed - install mammoth: bun add mammoth]";
    }
  }

  // Text files
  if (TEXT_EXTENSIONS.includes(extension) || mimeType?.startsWith("text/")) {
    const text = await Bun.file(filePath).text();
    // Limit to 100K chars
    return text.slice(0, 100000);
  }

  throw new Error(`Unsupported file type: ${extension || mimeType}`);
}

/**
 * Check if a file extension is an archive.
 */
function isArchive(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  return ARCHIVE_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

/**
 * Get archive extension from filename.
 */
function getArchiveExtension(fileName: string): string {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".tar.gz")) return ".tar.gz";
  if (lower.endsWith(".tgz")) return ".tgz";
  if (lower.endsWith(".tar")) return ".tar";
  if (lower.endsWith(".zip")) return ".zip";
  return "";
}

/**
 * Extract an archive to a temp directory.
 */
async function extractArchive(
  archivePath: string,
  fileName: string
): Promise<string> {
  const ext = getArchiveExtension(fileName);
  const extractDir = `${TEMP_DIR}/archive_${Date.now()}`;
  await Bun.$`mkdir -p ${extractDir}`;

  if (ext === ".zip") {
    await Bun.$`unzip -q -o ${archivePath} -d ${extractDir}`.quiet();
  } else if (ext === ".tar" || ext === ".tar.gz" || ext === ".tgz") {
    await Bun.$`tar -xf ${archivePath} -C ${extractDir}`.quiet();
  } else {
    throw new Error(`Unknown archive type: ${ext}`);
  }

  return extractDir;
}

/**
 * Build a file tree from a directory.
 */
async function buildFileTree(dir: string): Promise<string[]> {
  const entries = await Array.fromAsync(
    new Bun.Glob("**/*").scan({ cwd: dir, dot: false })
  );
  entries.sort();
  return entries.slice(0, 100); // Limit to 100 files
}

/**
 * Extract text content from archive files.
 */
async function extractArchiveContent(
  extractDir: string
): Promise<{
  tree: string[];
  contents: Array<{ name: string; content: string }>;
}> {
  const tree = await buildFileTree(extractDir);
  const contents: Array<{ name: string; content: string }> = [];
  let totalSize = 0;

  for (const relativePath of tree) {
    const fullPath = `${extractDir}/${relativePath}`;
    const stat = await Bun.file(fullPath).exists();
    if (!stat) continue;

    // Check if it's a directory
    const fileInfo = Bun.file(fullPath);
    const size = fileInfo.size;
    if (size === 0) continue;

    const ext = "." + (relativePath.split(".").pop() || "").toLowerCase();
    if (!TEXT_EXTENSIONS.includes(ext)) continue;

    // Skip large files
    if (size > 100000) continue;

    try {
      const text = await fileInfo.text();
      const truncated = text.slice(0, 10000); // 10K per file max
      if (totalSize + truncated.length > MAX_ARCHIVE_CONTENT) break;
      contents.push({ name: relativePath, content: truncated });
      totalSize += truncated.length;
    } catch {
      // Skip binary or unreadable files
    }
  }

  return { tree, contents };
}

/**
 * Process an archive file.
 */
async function processArchive(
  ctx: Context,
  archivePath: string,
  fileName: string,
  caption: string | undefined,
  userId: number,
  username: string,
  chatId: number
): Promise<void> {
  const session = getSession(userId);
  const stopProcessing = session.startProcessing();
  const typing = startTypingIndicator(ctx);

  // Show extraction progress
  const statusMsg = await ctx.reply(`📦 Extracting <b>${fileName}</b>...`, {
    parse_mode: "HTML",
  });

  try {
    // Extract archive
    console.log(`Extracting archive: ${fileName}`);
    const extractDir = await extractArchive(archivePath, fileName);
    const { tree, contents } = await extractArchiveContent(extractDir);
    console.log(`Extracted: ${tree.length} files, ${contents.length} readable`);

    // Update status
    await ctx.api.editMessageText(
      statusMsg.chat.id,
      statusMsg.message_id,
      `📦 Extracted <b>${fileName}</b>: ${tree.length} files, ${contents.length} readable`,
      { parse_mode: "HTML" }
    );

    // Build prompt
    const treeStr = tree.length > 0 ? tree.join("\n") : "(empty)";
    const contentsStr =
      contents.length > 0
        ? contents.map((c) => `--- ${c.name} ---\n${c.content}`).join("\n\n")
        : "(no readable text files)";

    const prompt = caption
      ? `Archive: ${fileName}\n\nFile tree (${tree.length} files):\n${treeStr}\n\nExtracted contents:\n${contentsStr}\n\n---\n\n${caption}`
      : `Please analyze this archive (${fileName}):\n\nFile tree (${tree.length} files):\n${treeStr}\n\nExtracted contents:\n${contentsStr}`;

    // Set conversation title (if new session)
    if (!session.isActive) {
      const rawTitle = caption || `[Archivio: ${fileName}]`;
      const title =
        rawTitle.length > 50 ? rawTitle.slice(0, 47) + "..." : rawTitle;
      session.conversationTitle = title;
    }

    // Create streaming state
    const state = new StreamingState();
    const statusCallback = createStatusCallback(ctx, state);

    const response = await session.sendMessageStreaming(
      prompt,
      username,
      userId,
      statusCallback,
      chatId,
      ctx,
      false // archive content is already inlined as text — no vision route
    );

    await auditLog(
      userId,
      username,
      "ARCHIVE",
      `[${fileName}] ${caption || ""}`,
      response
    );

    // Cleanup
    await Bun.$`rm -rf ${extractDir}`.quiet();

    // Delete status message
    try {
      await ctx.api.deleteMessage(statusMsg.chat.id, statusMsg.message_id);
    } catch {
      // Ignore deletion errors
    }
  } catch (error) {
    // Delete status message on error
    try {
      await ctx.api.deleteMessage(statusMsg.chat.id, statusMsg.message_id);
    } catch {
      // Ignore
    }
    await replyFriendly(ctx, error, "распаковка архива");
  } finally {
    stopProcessing();
    typing.stop();
  }
}

/**
 * Process documents with Claude.
 */
async function processDocuments(
  ctx: Context,
  documents: Array<{ path: string; name: string; content: string }>,
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
  if (documents.length === 1) {
    const doc = documents[0]!;
    prompt = caption
      ? `Document: ${doc.name}\n\nContent:\n${doc.content}\n\n---\n\n${caption}`
      : `Please analyze this document (${doc.name}):\n\n${doc.content}`;
  } else {
    const docList = documents
      .map((d, i) => `--- Document ${i + 1}: ${d.name} ---\n${d.content}`)
      .join("\n\n");
    prompt = caption
      ? `${documents.length} Documents:\n\n${docList}\n\n---\n\n${caption}`
      : `Please analyze these ${documents.length} documents:\n\n${docList}`;
  }

  // Set conversation title (if new session)
  if (!session.isActive) {
    const docName = documents[0]?.name || "[Documento]";
    const rawTitle = caption || `[Documento: ${docName}]`;
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
      // PDF/DOCX/TXT come pre-extracted as text; unknown types (e.g. .epub)
      // pass the file path inside the prompt for Bash to handle. Either way
      // this is a TEXT request — DeepSeek route, not Gemini Vision.
      false
    );

    await auditLog(
      userId,
      username,
      "DOCUMENT",
      `[${documents.length} docs] ${caption || ""}`,
      response
    );
  } catch (error) {
    await handleProcessingError(ctx, error, state.toolMessages);
  } finally {
    stopProcessing();
    typing.stop();
  }
}

/**
 * Process document paths by extracting text and calling processDocuments.
 */
async function processDocumentPaths(
  ctx: Context,
  paths: string[],
  caption: string | undefined,
  userId: number,
  username: string,
  chatId: number
): Promise<void> {
  // Extract text from all documents
  const documents: Array<{ path: string; name: string; content: string }> = [];

  for (const path of paths) {
    try {
      const name = path.split("/").pop() || "document";
      const content = await extractText(path);
      documents.push({ path, name, content });
    } catch (error) {
      console.error(`Failed to extract ${path}:`, error);
    }
  }

  if (documents.length === 0) {
    await ctx.reply("❌ Failed to extract any documents.");
    return;
  }

  await processDocuments(ctx, documents, caption, userId, username, chatId);
}

/**
 * Handle incoming document messages.
 */
export async function handleDocument(ctx: Context): Promise<void> {
  const userId = ctx.from?.id;
  const username = ctx.from?.username || "unknown";
  const chatId = ctx.chat?.id;
  const doc = ctx.message?.document;
  const mediaGroupId = ctx.message?.media_group_id;

  if (!userId || !chatId || !doc) {
    return;
  }

  // 1. Authorization check
  if (!isAuthorized(userId, ALLOWED_USERS)) {
    await ctx.reply("Unauthorized. Contact the bot owner for access.");
    return;
  }

  // 2. Check file size
  // Telegram Bot API hard limit: getFile() only works for files ≤ 20MB
  const TG_API_LIMIT = 20 * 1024 * 1024;
  if (doc.file_size && doc.file_size > MAX_FILE_SIZE) {
    await ctx.reply("❌ File too large (max 500MB configured, but see below).");
    return;
  }
  if (doc.file_size && doc.file_size > TG_API_LIMIT) {
    await ctx.reply(
      "❌ Telegram не позволяет боту скачивать файлы больше 20MB через стандартный API.\n\n" +
      "Пожалуйста, разбей архив на части по 15-18MB:\n" +
      "• macOS/Linux: `zip -s 15m books.zip --out books_split.zip`\n" +
      "• или используй 7-Zip → Split to volumes"
    );
    return;
  }

  // 3. Check file type
  const fileName = doc.file_name || "";
  const extension = "." + (fileName.split(".").pop() || "").toLowerCase();
  const isPdf = doc.mime_type === "application/pdf" || extension === ".pdf";
  const isDocx =
    extension === ".docx" ||
    doc.mime_type ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  const isText =
    TEXT_EXTENSIONS.includes(extension) || doc.mime_type?.startsWith("text/");
  const isArchiveFile = isArchive(fileName);
  const isLasFile = LAS_EXTENSIONS.includes(extension);

  // Check if it's an audio file sent as a document
  if (!isPdf && !isDocx && !isText && !isArchiveFile && !isLasFile && isAudioFile(fileName, doc.mime_type)) {
    console.log(`Received audio document: ${fileName} from @${username}`);

    // Rate limit check
    const [allowed, retryAfter] = rateLimiter.check(userId);
    if (!allowed) {
      await auditLogRateLimit(userId, username, retryAfter!);
      await ctx.reply(
        `⏳ Rate limited. Please wait ${retryAfter!.toFixed(1)} seconds.`
      );
      return;
    }

    // Download and process as audio
    let docPath: string;
    try {
      docPath = await downloadDocument(ctx, userId);
    } catch (error) {
      console.error("Failed to download audio document:", error);
      await ctx.reply("❌ Failed to download audio file.");
      return;
    }

    await processAudioFile(ctx, docPath, ctx.message?.caption, userId, username, chatId);
    return;
  }

  // Route image files to vision handler
  if (!isPdf && !isDocx && !isText && !isArchiveFile && !isLasFile && isImageFile(fileName, doc.mime_type)) {
    const [allowed, retryAfter] = rateLimiter.check(userId);
    if (!allowed) {
      await auditLogRateLimit(userId, username, retryAfter!);
      await ctx.reply(`⏳ Rate limited. Please wait ${retryAfter!.toFixed(1)} seconds.`);
      return;
    }

    let docPath: string;
    try {
      docPath = await downloadDocument(ctx, userId);
    } catch (error) {
      console.error("Failed to download image document:", error);
      await ctx.reply("❌ Failed to download image.");
      return;
    }

    await processImageDocument(ctx, docPath, ctx.message?.caption, userId, username, chatId);
    return;
  }

  // Unknown file type — download and pass the path to Claude directly
  const isUnknown = !isPdf && !isDocx && !isText && !isArchiveFile && !isLasFile;

  // 4. Download document
  let docPath: string;
  try {
    docPath = await downloadDocument(ctx, userId);
  } catch (error) {
    console.error("Failed to download document:", error);
    await ctx.reply("❌ Failed to download document.");
    return;
  }

  // 5. Archive files - process separately (no media group support)
  if (isArchiveFile) {
    console.log(`Received archive: ${fileName} from @${username}`);
    const [allowed, retryAfter] = rateLimiter.check(userId);
    if (!allowed) {
      await auditLogRateLimit(userId, username, retryAfter!);
      await ctx.reply(
        `⏳ Rate limited. Please wait ${retryAfter!.toFixed(1)} seconds.`
      );
      return;
    }

    await processArchive(
      ctx,
      docPath,
      fileName,
      ctx.message?.caption,
      userId,
      username,
      chatId
    );
    return;
  }

  // 6. Single document - process immediately
  if (!mediaGroupId) {
    console.log(`Received document: ${fileName} from @${username}`);
    // Rate limit
    const [allowed, retryAfter] = rateLimiter.check(userId);
    if (!allowed) {
      await auditLogRateLimit(userId, username, retryAfter!);
      await ctx.reply(
        `⏳ Rate limited. Please wait ${retryAfter!.toFixed(1)} seconds.`
      );
      return;
    }

    try {
      let content: string;
      if (isUnknown) {
        // Unknown type — pass path directly so Claude can work with it via tools
        content = `File: ${fileName}\nType: ${doc.mime_type || extension}\nPath: ${docPath}\n\nThis file has been downloaded. Use it via its path above.`;
      } else {
        content = await extractText(docPath, doc.mime_type);
      }
      await processDocuments(
        ctx,
        [{ path: docPath, name: fileName, content }],
        ctx.message?.caption,
        userId,
        username,
        chatId
      );
    } catch (error) {
      // Clean up file on failure
      try { await Bun.$`rm -f ${docPath}`.quiet(); } catch {}
      await replyFriendly(ctx, error, "обработка документа");
    }
    return;
  }

  // 7. Media group - buffer with timeout
  await documentBuffer.addToGroup(
    mediaGroupId,
    docPath,
    ctx,
    userId,
    username,
    processDocumentPaths
  );
}
