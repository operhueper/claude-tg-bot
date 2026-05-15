#!/usr/bin/env bun
/**
 * Connect Google MCP Server - Initiates Google Workspace OAuth connection.
 *
 * When Claude calls connect(), this server writes a request file that the
 * Telegram bot monitors. The bot then fetches Composio OAuth URLs and sends
 * inline-keyboard buttons to the user.
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

// Create the MCP server
const server = new Server(
  {
    name: "connect-google",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

const COMPOSIO_BASE_URL = "https://backend.composio.dev";

const SLUG_TO_NAME: Record<string, string> = {
  googledocs: "Docs",
  googledrive: "Drive",
  googlesheets: "Sheets",
  gmail: "Gmail",
  googlecalendar: "Calendar",
};

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "connect",
        description:
          "Initiate Google Workspace OAuth connection. Call this when the user asks to connect/link/authorize their Google account (Docs, Drive, Sheets, Gmail, Calendar). The bot will display inline keyboard buttons with OAuth redirect URLs.",
        inputSchema: {
          type: "object" as const,
          properties: {
            reason: {
              type: "string",
              description:
                "Optional reason or context for the connection request (for logging)",
            },
          },
          required: [],
        },
      },
      {
        name: "disconnect",
        description:
          "Удалить все Google connected_accounts текущего пользователя в Composio (включая EXPIRED). Используй когда юзер просит \"удали мои google\", \"отключи google\", \"сбрось OAuth\", \"начать с нуля\".",
        inputSchema: {
          type: "object" as const,
          properties: {},
          required: [],
        },
      },
    ],
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  // Get chat context from environment (set by session.ts before spawning the MCP)
  const chatId = process.env.TELEGRAM_CHAT_ID || "";
  const userId = process.env.TELEGRAM_USER_ID || "";

  if (request.params.name === "connect") {
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
    const requestId = crypto.randomUUID().slice(0, 8);

    const requestData = {
      request_id: requestId,
      chat_id: chatId,
      user_id: userId,
      status: "pending",
      created_at: new Date().toISOString(),
    };

    const requestFile = `/tmp/connect-google-${userId || "unknown"}-${requestId}.json`;
    await Bun.write(requestFile, JSON.stringify(requestData, null, 2));

    return {
      content: [
        {
          type: "text" as const,
          text: "Google connection request sent — OAuth buttons will appear in the chat.",
        },
      ],
    };
  }

  if (request.params.name === "disconnect") {
    const apiKey = process.env.COMPOSIO_API_KEY || "";
    if (!apiKey) {
      return {
        content: [
          {
            type: "text" as const,
            text: "Composio API key not configured — невозможно удалить подключения.",
          },
        ],
        isError: true,
      };
    }
    if (!userId) {
      return {
        content: [
          {
            type: "text" as const,
            text: "Error: TELEGRAM_USER_ID not set. Cannot determine user.",
          },
        ],
        isError: true,
      };
    }

    // Fetch all connected accounts for this user
    let items: Array<{ id?: string; status?: string; toolkit?: { slug?: string } }> = [];
    try {
      const listResp = await fetch(
        `${COMPOSIO_BASE_URL}/api/v3/connected_accounts?user_id=tg_${userId}`,
        { headers: { "x-api-key": apiKey } }
      );
      if (!listResp.ok) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Не удалось получить список подключений (HTTP ${listResp.status}).`,
            },
          ],
          isError: true,
        };
      }
      const data = (await listResp.json()) as {
        items?: Array<{ id?: string; status?: string; toolkit?: { slug?: string } }>;
      };
      items = data.items ?? [];
    } catch (e) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Ошибка при получении списка подключений: ${String(e)}`,
          },
        ],
        isError: true,
      };
    }

    if (items.length === 0) {
      return {
        content: [
          {
            type: "text" as const,
            text: "Подключений нет — нечего удалять.",
          },
        ],
      };
    }

    // Delete each connected account
    const deleted: string[] = [];
    const failed: string[] = [];
    for (const item of items) {
      if (!item.id) continue;
      const slug = item.toolkit?.slug ?? "";
      const name = SLUG_TO_NAME[slug] ?? (slug || item.id);
      try {
        const delResp = await fetch(
          `${COMPOSIO_BASE_URL}/api/v3/connected_accounts/${item.id}`,
          { method: "DELETE", headers: { "x-api-key": apiKey } }
        );
        if (delResp.ok) {
          deleted.push(name);
        } else {
          failed.push(`${name} (HTTP ${delResp.status})`);
        }
      } catch (e) {
        failed.push(`${name} (${String(e)})`);
      }
    }

    const parts: string[] = [];
    if (deleted.length > 0) {
      parts.push(`Удалено ${deleted.length} подключений: ${deleted.join(", ")}.`);
    }
    if (failed.length > 0) {
      parts.push(`Не удалось удалить: ${failed.join(", ")}.`);
    }

    return {
      content: [
        {
          type: "text" as const,
          text: parts.join(" "),
        },
      ],
    };
  }

  throw new Error(`Unknown tool: ${request.params.name}`);
});

// Run the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Connect Google MCP server running on stdio");
}

main().catch(console.error);
