#!/usr/bin/env bun
/**
 * Send File MCP Server - Sends files back to the user via Telegram.
 *
 * When Claude calls send_file(), this server writes a request file that the
 * Telegram bot monitors. The bot then sends the file using the appropriate
 * Telegram API method (video, photo, audio, or document).
 *
 * Fire-and-forget: Claude continues generating after calling this tool.
 *
 * Uses the official MCP TypeScript SDK for proper protocol compliance.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { readdirSync, statSync, existsSync } from "fs";
import { dirname } from "path";

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB Telegram limit

// Create the MCP server
const server = new Server(
  {
    name: "send-file",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "send_file",
        description:
          "Send a file to the user via Telegram. Supports images (png, jpg, gif, webp), videos (mp4, mov, avi, webm, mkv), audio (mp3, wav, ogg, flac, m4a), and any other file type. The file is delivered automatically based on its extension. Use as_document=true to send images/videos as a file (preserves full quality, no Telegram compression). This is fire-and-forget — you can continue generating after calling this tool.",
        inputSchema: {
          type: "object" as const,
          properties: {
            file_path: {
              type: "string",
              description:
                "Absolute path to the file to send (e.g. /tmp/preview.mp4)",
            },
            caption: {
              type: "string",
              description:
                "Optional caption to display with the file in Telegram",
            },
            as_document: {
              type: "boolean",
              description:
                "Send as a document (file) instead of photo/video. Preserves full quality — Telegram won't compress the image. Default: false",
            },
          },
          required: ["file_path"],
        },
      },
    ],
  };
});

/** Build a helpful "file not found" message listing what's actually in the directory. */
function buildNotFoundMessage(filePath: string): string {
  const dir = dirname(filePath);
  let msg = `Error: file not found at ${filePath}\n`;
  if (!existsSync(dir)) {
    msg += `\nDirectory ${dir} doesn't exist either. Check the file was created.`;
    return msg;
  }
  try {
    const entries = readdirSync(dir)
      .map((name) => {
        try {
          const mtime = statSync(`${dir}/${name}`).mtimeMs;
          return { name, mtime };
        } catch {
          return { name, mtime: 0 };
        }
      })
      .sort((a, b) => b.mtime - a.mtime)
      .slice(0, 10)
      .map((e) => `  - ${e.name}`);
    if (entries.length === 0) {
      msg += `\nDirectory ${dir} is empty.`;
    } else {
      msg += `\nFiles actually present in ${dir}/:\n${entries.join("\n")}\n\nUse one of these exact paths, or create the file first.`;
    }
  } catch {
    msg += `\nCould not list directory ${dir}.`;
  }
  return msg;
}

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name !== "send_file") {
    throw new Error(`Unknown tool: ${request.params.name}`);
  }

  const args = request.params.arguments as {
    file_path?: string;
    caption?: string;
    as_document?: boolean;
  };

  const filePath = args.file_path || "";
  const caption = args.caption || "";
  const asDocument = args.as_document || false;

  if (!filePath) {
    return {
      content: [
        {
          type: "text" as const,
          text: "Error: file_path is required",
        },
      ],
      isError: true,
    };
  }

  // Validate file exists and check size
  try {
    const file = Bun.file(filePath);
    const size = file.size;

    if (size === 0) {
      return {
        content: [
          {
            type: "text" as const,
            text: buildNotFoundMessage(filePath),
          },
        ],
        isError: true,
      };
    }

    if (size > MAX_FILE_SIZE) {
      const sizeMB = (size / (1024 * 1024)).toFixed(1);
      return {
        content: [
          {
            type: "text" as const,
            text: `Error: File too large (${sizeMB}MB). Telegram limit is 50MB.`,
          },
        ],
        isError: true,
      };
    }
  } catch {
    return {
      content: [
        {
          type: "text" as const,
          text: `Error: Cannot access file: ${filePath}`,
        },
      ],
      isError: true,
    };
  }

  // Get chat context from environment
  const chatId = process.env.TELEGRAM_CHAT_ID || "";
  const userId = process.env.TELEGRAM_USER_ID || "";
  if (!chatId) {
    return {
      content: [
        {
          type: "text" as const,
          text: "Error: TELEGRAM_CHAT_ID not set. Cannot determine recipient.",
        },
      ],
      isError: true,
    };
  }

  // Write request file for the bot to pick up
  const requestUuid = crypto.randomUUID().slice(0, 8);
  const fileName = filePath.split("/").pop() || "file";

  const requestData = {
    request_id: requestUuid,
    file_path: filePath,
    caption,
    as_document: asDocument,
    status: "pending",
    chat_id: chatId,
    user_id: userId,
    created_at: new Date().toISOString(),
  };

  const requestFile = `/tmp/send-file-${requestUuid}.json`;
  await Bun.write(requestFile, JSON.stringify(requestData, null, 2));

  return {
    content: [
      {
        type: "text" as const,
        text: `File queued for delivery: ${fileName}`,
      },
    ],
  };
});

// Run the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Send File MCP server running on stdio");
}

main().catch(console.error);
