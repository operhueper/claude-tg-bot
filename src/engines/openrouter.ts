/**
 * OpenRouter / DeepSeek engine.
 *
 * Handles multipart content building, tool definitions, tool execution,
 * and the agentic query loop for sandbox/guest users routed via OpenRouter.
 */

import { readFileSync } from "fs";
import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";
import { STREAMING_THROTTLE_MS } from "../config";
import type { UserProfile } from "../config";
import { recordUsage } from "../metering";
import { containerManager } from "../containers/manager";
import { escapeHtml } from "../formatting";
import { checkCommandSafety, isPathAllowedFor } from "../security";
import type { StatusCallback } from "../types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type OpenRouterContent =
  | string
  | Array<
      | { type: "text"; text: string }
      | { type: "image_url"; image_url: { url: string } }
    >;

export interface OpenRouterMessage {
  role: string;
  content: OpenRouterContent;
  // Optional fields for tool-use multi-turn
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
}

// ---------------------------------------------------------------------------
// Multipart content builder
// ---------------------------------------------------------------------------

/**
 * Parse a photo/image prompt and build multipart content if it contains local file paths.
 * Supports prompts like:
 *   "Please analyze this image: /tmp/telegram-bot/photo_xxx.jpg"
 *   "[Photo: /tmp/...]\n\ncaption"
 * Returns a multipart array if images found, otherwise returns the original string.
 */
export function buildMultipartContent(text: string): OpenRouterContent {
  const imagePaths: string[] = [];
  let captionText = text;

  // Try "[Photo: path]" pattern
  const photoTagMatch = text.match(/\[Photos?:?\s*\n?([\s\S]*?)\]/);
  if (photoTagMatch) {
    const inner = photoTagMatch[1] ?? "";
    // Could be a single path or numbered list
    const lines = inner
      .split("\n")
      .map((l) => l.replace(/^\d+\.\s*/, "").trim())
      .filter(Boolean);
    imagePaths.push(...lines);
    // Caption is anything after the closing bracket
    captionText = text.slice(text.indexOf("]") + 1).trim();
  } else {
    // Try "Please analyze this image: /path" pattern
    const analyzeMatch = text.match(
      /Please analyze (?:this image|these \d+ images):\s*([\s\S]+)/
    );
    if (analyzeMatch) {
      const pathsBlock = analyzeMatch[1] ?? "";
      const lines = pathsBlock
        .split("\n")
        .map((l) => l.replace(/^\d+\.\s*/, "").trim())
        .filter(Boolean);
      imagePaths.push(...lines);
      captionText = ""; // no separate caption
    }
  }

  if (imagePaths.length === 0) {
    return text;
  }

  // Build multipart content: images first, then text
  const parts: Array<
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string } }
  > = [];

  for (const imgPath of imagePaths) {
    try {
      const data = readFileSync(imgPath);
      const b64 = data.toString("base64");
      const ext = imgPath.split(".").pop()?.toLowerCase() || "jpg";
      const mimeMap: Record<string, string> = {
        jpg: "image/jpeg",
        jpeg: "image/jpeg",
        png: "image/png",
        gif: "image/gif",
        webp: "image/webp",
      };
      const mime = mimeMap[ext] || "image/jpeg";
      parts.push({
        type: "image_url",
        image_url: { url: `data:${mime};base64,${b64}` },
      });
    } catch (e) {
      console.warn(
        `[queryOpenRouter] Could not read image file ${imgPath}:`,
        e
      );
    }
  }

  const textContent = captionText || "Что на изображении?";
  parts.push({ type: "text", text: textContent });

  return parts.length > 1 ? parts : text;
}

// ---------------------------------------------------------------------------
// Built-in tool schemas
// ---------------------------------------------------------------------------

// Built-in tools available to OpenRouter users (DeepSeek / sandbox).
// These run locally in the bot process, sandboxed to the user's allowedPaths.
export const OPENROUTER_TOOLS = [
  {
    type: "function",
    function: {
      name: "run_bash",
      description:
        "Run a shell command in the user's working directory. Use for executing scripts, listing files, installing packages, running code, etc. Output is truncated to 8000 chars.",
      parameters: {
        type: "object",
        properties: {
          command: {
            type: "string",
            description: "The bash command to execute",
          },
        },
        required: ["command"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_file",
      description:
        "Read the contents of a file. Only files within the user's allowed directories are accessible.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Absolute path to the file",
          },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "write_file",
      description:
        "Write (create or overwrite) a file. Only paths within the user's allowed directories are writable.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Absolute path to the file",
          },
          content: {
            type: "string",
            description: "File contents to write",
          },
        },
        required: ["path", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_dir",
      description: "List files and directories at the given path.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Absolute path to the directory",
          },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "send_file",
      description:
        "Send a file (image, HTML, PDF, document, etc.) to the user in Telegram. The file must already exist on disk. Use this after write_file to deliver the result to the user.",
      parameters: {
        type: "object",
        properties: {
          file_path: {
            type: "string",
            description: "Absolute path to the file to send",
          },
          caption: {
            type: "string",
            description: "Optional caption/description for the file",
          },
        },
        required: ["file_path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "generate_image",
      description:
        "Generate an image from a text prompt using Pollinations AI (free, no API key needed). Returns the path to the saved image. After generating, use send_file to deliver it.",
      parameters: {
        type: "object",
        properties: {
          prompt: {
            type: "string",
            description: "Text description of the image to generate",
          },
          width: {
            type: "number",
            description: "Image width in pixels (default: 1024)",
          },
          height: {
            type: "number",
            description: "Image height in pixels (default: 1024)",
          },
        },
        required: ["prompt"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_excel",
      description:
        "Create a real .xlsx Excel file from structured data. Use this instead of write_file when the user asks for an Excel spreadsheet. After creating, use send_file to deliver it.",
      parameters: {
        type: "object",
        properties: {
          file_path: {
            type: "string",
            description:
              "Absolute path for the output .xlsx file (e.g. /tmp/report.xlsx)",
          },
          sheets: {
            type: "array",
            description: "Array of sheets to create in the workbook",
            items: {
              type: "object",
              properties: {
                name: { type: "string", description: "Sheet name" },
                headers: {
                  type: "array",
                  items: { type: "string" },
                  description: "Column header names",
                },
                rows: {
                  type: "array",
                  items: { type: "array" },
                  description:
                    "Array of rows, each row is an array of cell values",
                },
              },
              required: ["name", "headers", "rows"],
            },
          },
        },
        required: ["file_path", "sheets"],
      },
    },
  },
];

// ---------------------------------------------------------------------------
// Tool executor
// ---------------------------------------------------------------------------

/**
 * Execute a built-in tool call for an OpenRouter user.
 * Returns result as a string.
 */
export async function executeToolAsync(
  name: string,
  args: Record<string, string>,
  profile: UserProfile,
  chatIdForSendFile?: number
): Promise<string> {
  try {
    if (name === "run_bash") {
      const cmd = args.command || "";
      const [isSafe, reason] = checkCommandSafety(cmd, profile.allowedPaths);
      if (!isSafe) return `Error: command blocked — ${reason}`;

      // Container-enabled users: route bash through their Docker sandbox.
      // The container's /workspace is the user's persistent volume, so we
      // ignore profile.workingDir here — the container's WORKDIR (set in
      // buildRunArgs to /workspace) is the correct cwd.
      if (profile.containerEnabled) {
        // Make sure the container is up before exec — and reset the idle
        // watchdog so it doesn't get paused mid-task.
        await containerManager.getOrStart(profile);
        containerManager.resetIdleTimer(profile.userId, profile);
        const result = await containerManager.exec(profile.userId, cmd, {
          timeout: 30_000,
        });
        const combined = (result.stdout || "") + (result.stderr || "");
        if (result.exitCode !== 0 && !combined) {
          return `Command failed (exit ${result.exitCode})`;
        }
        return combined.slice(0, 8000) || "(no output)";
      }

      // Host-mode (legacy / owner): run directly in the bot process.
      try {
        const out = execSync(cmd, {
          cwd: profile.workingDir,
          timeout: 30_000,
          maxBuffer: 8 * 1024 * 1024,
          env: { ...process.env, HOME: profile.workingDir },
        });
        return out.toString().slice(0, 8000) || "(no output)";
      } catch (e: unknown) {
        const err = e as {
          stdout?: Buffer;
          stderr?: Buffer;
          message?: string;
        };
        const out =
          (err.stdout?.toString() || "") + (err.stderr?.toString() || "");
        return out.slice(0, 8000) || err.message || "Command failed";
      }
    }

    if (name === "read_file") {
      const filePath = args.path || "";
      if (!isPathAllowedFor(filePath, profile.allowedPaths)) {
        return `Error: access denied — ${filePath} is outside your allowed directories`;
      }
      const content = fs.readFileSync(filePath, "utf8");
      return content.slice(0, 16000);
    }

    if (name === "write_file") {
      const filePath = args.path || "";
      if (!isPathAllowedFor(filePath, profile.allowedPaths)) {
        return `Error: access denied — ${filePath} is outside your allowed directories`;
      }
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, args.content || "");
      return `Written ${(args.content || "").length} bytes to ${filePath}`;
    }

    if (name === "list_dir") {
      const dirPath = args.path || profile.workingDir;
      if (!isPathAllowedFor(dirPath, profile.allowedPaths)) {
        return `Error: access denied — ${dirPath} is outside your allowed directories`;
      }
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      return entries
        .map((e) => (e.isDirectory() ? `${e.name}/` : e.name))
        .join("\n");
    }

    if (name === "send_file") {
      const filePath = args.file_path || "";
      if (!filePath) return "Error: file_path is required";
      // Allow any path accessible (file was just created, could be in /tmp or vault)
      const allowedWithTmp = [...profile.allowedPaths, "/tmp"];
      const isAllowed = allowedWithTmp.some((p) => filePath.startsWith(p));
      if (!isAllowed) {
        return `Error: access denied — ${filePath} is outside allowed directories`;
      }
      if (!fs.existsSync(filePath)) {
        return `Error: file not found at ${filePath}`;
      }
      // Use the same file-drop pattern as the send-file MCP
      const chatId = chatIdForSendFile ? String(chatIdForSendFile) : "";
      if (!chatId) return "Error: no active Telegram chat ID";
      const requestId = `or-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 8)}`;
      const dropPath = `/tmp/send-file-${requestId}.json`;
      const payload = {
        status: "pending",
        chat_id: chatId,
        user_id: String(profile.userId),
        file_path: filePath,
        caption: args.caption || undefined,
        as_document: false,
      };
      fs.writeFileSync(dropPath, JSON.stringify(payload));
      return `File queued for delivery: ${filePath}`;
    }

    if (name === "generate_image") {
      const prompt = args.prompt || "";
      if (!prompt) return "Error: prompt is required";
      const width = parseInt(args.width || "1024", 10) || 1024;
      const height = parseInt(args.height || "1024", 10) || 1024;
      try {
        const encodedPrompt = encodeURIComponent(prompt);
        const url = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=${width}&height=${height}&nologo=true&model=flux`;
        const resp = await fetch(url);
        if (!resp.ok) return `Error: Pollinations returned ${resp.status}`;
        const buffer = await resp.arrayBuffer();
        const imgDir = "/tmp/openrouter_images";
        if (!fs.existsSync(imgDir))
          fs.mkdirSync(imgDir, { recursive: true });
        const imgPath = `${imgDir}/img_${Date.now()}.png`;
        fs.writeFileSync(imgPath, Buffer.from(buffer));
        return `Image saved to ${imgPath}. Use send_file to deliver it to the user.`;
      } catch (e: unknown) {
        return `Error generating image: ${(e as Error).message}`;
      }
    }

    if (name === "create_excel") {
      const filePath = args.file_path || "";
      if (!filePath) return "Error: file_path is required";
      const allowedWithTmp = [...profile.allowedPaths, "/tmp"];
      const isAllowed = allowedWithTmp.some((p) => filePath.startsWith(p));
      if (!isAllowed)
        return `Error: access denied — ${filePath} is outside allowed directories`;

      // Parse sheets from JSON string (args values are strings from tool call)
      let sheets: Array<{
        name: string;
        headers: string[];
        rows: unknown[][];
      }>;
      try {
        const raw =
          typeof args.sheets === "string"
            ? JSON.parse(args.sheets)
            : args.sheets;
        sheets = raw as Array<{
          name: string;
          headers: string[];
          rows: unknown[][];
        }>;
      } catch {
        return "Error: invalid sheets JSON";
      }
      if (!sheets || sheets.length === 0) return "Error: sheets array is empty";

      // Build Python script to create xlsx
      const pyScript = `
import openpyxl, json, sys
wb = openpyxl.Workbook()
wb.remove(wb.active)
sheets = json.loads(sys.argv[1])
for s in sheets:
    ws = wb.create_sheet(title=s['name'])
    ws.append(s['headers'])
    for row in s['rows']:
        ws.append(row)
wb.save(sys.argv[2])
print("OK")
`.trim();

      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      const pyFile = `/tmp/create_excel_${Date.now()}.py`;
      fs.writeFileSync(pyFile, pyScript);
      try {
        const sheetsArg = JSON.stringify(sheets);
        const out = execSync(
          `python3 "${pyFile}" '${sheetsArg.replace(/'/g, "'\\''")}' "${filePath}"`,
          {
            timeout: 30_000,
            maxBuffer: 4 * 1024 * 1024,
          }
        );
        fs.unlinkSync(pyFile);
        return `Excel file created: ${filePath} (${out.toString().trim()})`;
      } catch (e: unknown) {
        try {
          fs.unlinkSync(pyFile);
        } catch {}
        const err = e as {
          stdout?: Buffer;
          stderr?: Buffer;
          message?: string;
        };
        return `Error creating Excel: ${err.stderr?.toString() || err.message}`;
      }
    }

    return `Error: unknown tool "${name}"`;
  } catch (e: unknown) {
    return `Error: ${(e as Error).message}`;
  }
}

// ---------------------------------------------------------------------------
// Single-round OpenRouter streaming request
// ---------------------------------------------------------------------------

/**
 * Single OpenRouter streaming request. Returns { text, toolCalls, promptTokens, completionTokens }.
 */
async function openRouterRequest(
  messages: OpenRouterMessage[],
  model: string,
  apiKey: string,
  systemPrompt: string,
  withTools: boolean,
  statusCallback: StatusCallback,
  accumulatedText: string
): Promise<{
  text: string;
  toolCalls: Array<{ id: string; name: string; args: Record<string, string> }>;
  promptTokens: number;
  completionTokens: number;
}> {
  const body: Record<string, unknown> = {
    model,
    stream: true,
    messages: [{ role: "system", content: systemPrompt }, ...messages],
  };
  if (withTools) {
    body.tools = OPENROUTER_TOOLS;
    body.tool_choice = "auto";
  }

  const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://t.me/claude_tg_bot",
      "X-Title": "Claude Telegram Bot",
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok || !resp.body) {
    const errText = await resp.text();
    throw new Error(`OpenRouter error ${resp.status}: ${errText}`);
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  let buffer = "";
  let promptTokens = 0;
  let completionTokens = 0;
  let lastUpdate = Date.now();

  // For assembling streamed tool_calls
  const toolCallsPartial: Record<
    number,
    { id: string; name: string; argsRaw: string }
  > = {};

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const data = line.slice(6).trim();
      if (data === "[DONE]") continue;

      try {
        const chunk = JSON.parse(data);
        const delta = chunk.choices?.[0]?.delta;

        // Text delta
        if (delta?.content) {
          text += delta.content;
          const now = Date.now();
          if (now - lastUpdate > STREAMING_THROTTLE_MS) {
            await statusCallback("text", accumulatedText + text, 0);
            lastUpdate = now;
          }
        }

        // Tool call deltas (streamed as fragments)
        if (delta?.tool_calls) {
          for (const tc of delta.tool_calls) {
            const idx: number = tc.index ?? 0;
            if (!toolCallsPartial[idx]) {
              toolCallsPartial[idx] = {
                id: tc.id || "",
                name: tc.function?.name || "",
                argsRaw: "",
              };
            }
            if (tc.id) toolCallsPartial[idx].id = tc.id;
            if (tc.function?.name)
              toolCallsPartial[idx].name = tc.function.name;
            if (tc.function?.arguments)
              toolCallsPartial[idx].argsRaw += tc.function.arguments;
          }
        }

        if (chunk.usage) {
          promptTokens = chunk.usage.prompt_tokens || 0;
          completionTokens = chunk.usage.completion_tokens || 0;
        }
      } catch {
        // Skip malformed chunks
      }
    }
  }

  // Parse assembled tool calls
  const toolCalls = Object.values(toolCallsPartial).map((tc) => {
    let args: Record<string, string> = {};
    try {
      args = JSON.parse(tc.argsRaw);
    } catch {
      /* bad JSON — leave empty */
    }
    return { id: tc.id, name: tc.name, args };
  });

  return { text, toolCalls, promptTokens, completionTokens };
}

// ---------------------------------------------------------------------------
// Agentic query loop
// ---------------------------------------------------------------------------

/**
 * Send a message to OpenRouter (for sandbox users like new guests).
 * Streams text chunks via statusCallback and returns the full response.
 */
export async function queryOpenRouter(
  messages: OpenRouterMessage[],
  model: string,
  apiKey: string,
  systemPrompt: string,
  statusCallback: StatusCallback,
  _budgetFile: string | null,
  profile: UserProfile,
  chatId?: number
): Promise<string> {
  const MAX_TOOL_ROUNDS = 10;
  let conversationMessages = [...messages];
  let accumulatedText = "";
  let totalPromptTokens = 0;
  let totalCompletionTokens = 0;
  let finalText = "";

  // Anti-loop: track (tool, args_hash) pairs seen in this conversation
  const seenToolCalls = new Set<string>();

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const isLastRound = round === MAX_TOOL_ROUNDS - 1;
    const { text, toolCalls, promptTokens, completionTokens } =
      await openRouterRequest(
        conversationMessages,
        model,
        apiKey,
        systemPrompt,
        !isLastRound, // no tools on last round to force text answer
        statusCallback,
        accumulatedText
      );

    totalPromptTokens += promptTokens;
    totalCompletionTokens += completionTokens;

    if (toolCalls.length === 0 || isLastRound) {
      // No tools called — this is the final answer
      finalText = accumulatedText + text;
      break;
    }

    // Model wants to call tools
    // 1. Append assistant message with tool_calls to conversation
    conversationMessages.push({
      role: "assistant",
      content: text || "",
      tool_calls: toolCalls.map((tc) => ({
        id: tc.id,
        type: "function" as const,
        function: { name: tc.name, arguments: JSON.stringify(tc.args) },
      })),
    });

    // 2. Execute each tool and collect results
    let loopDetected = false;
    for (const tc of toolCalls) {
      const callKey = `${tc.name}:${JSON.stringify(tc.args)}`;
      if (seenToolCalls.has(callKey)) {
        // Duplicate call detected — inject a hint and break the tool loop
        console.warn(
          `[${profile.label}] Loop detected: ${tc.name} called with same args twice. Breaking.`
        );
        conversationMessages.push({
          role: "tool",
          content: `Error: you already called ${tc.name} with these exact arguments and got a result. Do not repeat the same call — use the previous result or try a different approach.`,
          tool_call_id: tc.id,
        });
        loopDetected = true;
        continue;
      }
      seenToolCalls.add(callKey);

      const argsDisplay = Object.entries(tc.args)
        .map(([k, v]) => `${k}=${String(v).slice(0, 60)}`)
        .join(", ");
      console.log(`[${profile.label}] Tool: ${tc.name}(${argsDisplay})`);
      await statusCallback(
        "tool",
        `🔧 ${escapeHtml(tc.name)}(${escapeHtml(argsDisplay)})`
      );

      const output = await executeToolAsync(tc.name, tc.args, profile, chatId);
      console.log(
        `[${profile.label}] Tool result (${tc.name}): ${output.slice(0, 100)}`
      );

      conversationMessages.push({
        role: "tool",
        content: output,
        tool_call_id: tc.id,
      });
    }
    if (
      loopDetected &&
      toolCalls.every((tc) =>
        seenToolCalls.has(`${tc.name}:${JSON.stringify(tc.args)}`)
      )
    ) {
      // All calls in this round were duplicates — force final answer
      break;
    }
    // Continue loop — model will respond after seeing tool results
  }

  // Record metering for the entire agentic loop
  if (totalPromptTokens > 0 || totalCompletionTokens > 0) {
    recordUsage({
      userId: profile.userId,
      source: "bot-openrouter",
      model,
      inputTokens: totalPromptTokens,
      outputTokens: totalCompletionTokens,
    });
  } else {
    // OpenRouter usually returns usage; if not, surface the gap so we know
    // we're undercounting (cost gets logged as $0 and is invisible later).
    console.warn(
      `[metering] OpenRouter usage missing for ${model} (user ${profile.userId})`
    );
  }

  return finalText;
}
