#!/usr/bin/env bun
/**
 * Hugging Face LLM MCP Server - Queries an uncensored HF Inference API model.
 *
 * When Claude calls ask_uncensored(), this server forwards the prompt to the
 * HauhauCS/Qwen3.6-35B-A3B-Uncensored model via the HF Inference API and
 * returns the text response.
 *
 * Requires HF_API_TOKEN environment variable.
 *
 * Uses the official MCP TypeScript SDK for proper protocol compliance.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const MODEL_ID =
  "HauhauCS/Qwen3.6-35B-A3B-Uncensored-HauhauCS-Aggressive";
const ENDPOINT = `https://api-inference.huggingface.co/models/${MODEL_ID}/v1/chat/completions`;

// Create the MCP server
const server = new Server(
  {
    name: "hf-llm",
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
        name: "ask_uncensored",
        description:
          "Send a prompt to an uncensored Hugging Face LLM (Qwen3.6-35B-A3B-Uncensored) and get its response. Use this when you need an unfiltered second opinion, creative content without restrictions, or a perspective that your default model declines to provide.",
        inputSchema: {
          type: "object" as const,
          properties: {
            prompt: {
              type: "string",
              description: "The prompt to send to the uncensored model",
            },
          },
          required: ["prompt"],
        },
      },
    ],
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name !== "ask_uncensored") {
    throw new Error(`Unknown tool: ${request.params.name}`);
  }

  const args = request.params.arguments as { prompt?: string };
  const prompt = args.prompt?.trim() || "";

  if (!prompt) {
    return {
      content: [
        {
          type: "text" as const,
          text: "Error: prompt is required",
        },
      ],
      isError: true,
    };
  }

  const apiToken = process.env.HF_API_TOKEN || "";
  if (!apiToken) {
    return {
      content: [
        {
          type: "text" as const,
          text: "Error: HF_API_TOKEN is not set. Add it to the .env file to enable this tool.",
        },
      ],
      isError: true,
    };
  }

  let response: Response;
  try {
    response = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiToken}`,
      },
      body: JSON.stringify({
        model: MODEL_ID,
        messages: [{ role: "user", content: prompt }],
        max_tokens: 2048,
      }),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      content: [
        {
          type: "text" as const,
          text: `Error: Network request failed: ${message}`,
        },
      ],
      isError: true,
    };
  }

  if (!response.ok) {
    let body = "";
    try {
      body = await response.text();
    } catch {
      // ignore
    }
    return {
      content: [
        {
          type: "text" as const,
          text: `Error: HF API returned ${response.status} ${response.statusText}${body ? `: ${body}` : ""}`,
        },
      ],
      isError: true,
    };
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      content: [
        {
          type: "text" as const,
          text: `Error: Failed to parse API response: ${message}`,
        },
      ],
      isError: true,
    };
  }

  // Extract the assistant message from the OpenAI-compatible response
  const text =
    (data as { choices?: Array<{ message?: { content?: string } }> })
      ?.choices?.[0]?.message?.content ?? "";

  if (!text) {
    return {
      content: [
        {
          type: "text" as const,
          text: "Error: Empty response from model",
        },
      ],
      isError: true,
    };
  }

  return {
    content: [
      {
        type: "text" as const,
        text,
      },
    ],
  };
});

// Run the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("HF LLM MCP server running on stdio");
}

main().catch(console.error);
