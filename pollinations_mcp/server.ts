#!/usr/bin/env bun
/**
 * Pollinations Image MCP Server
 *
 * Generates images via Pollinations.ai — free, no API key required.
 * Uses Flux model by default (high quality).
 *
 * Claude calls generate_image(prompt, width?, height?, model?),
 * server saves PNG to /tmp/pollinations_images/ and returns the path.
 * Claude then passes the path to send_file MCP to deliver the image.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { mkdirSync } from "fs";

const OUTPUT_DIR = "/tmp/pollinations_images";
const BASE_URL = "https://image.pollinations.ai/prompt";

const server = new Server(
  { name: "pollinations-image", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "generate_image",
      description:
        "Generate an image from a text prompt using Pollinations.ai (Flux model, free, no API key). Returns the absolute path to the saved PNG file. Use send_file tool afterwards to deliver the image to the user.",
      inputSchema: {
        type: "object" as const,
        properties: {
          prompt: {
            type: "string",
            description: "Text description of the image. Be detailed for best results.",
          },
          width: {
            type: "number",
            description: "Image width in pixels (default: 1024)",
          },
          height: {
            type: "number",
            description: "Image height in pixels (default: 1024)",
          },
          model: {
            type: "string",
            description: "Model to use: flux (default, best quality), flux-realism, turbo",
          },
        },
        required: ["prompt"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name !== "generate_image") {
    throw new Error(`Unknown tool: ${request.params.name}`);
  }

  const args = request.params.arguments as {
    prompt?: string;
    width?: number;
    height?: number;
    model?: string;
  };

  const prompt = (args.prompt || "").trim();
  if (!prompt) {
    return { content: [{ type: "text" as const, text: "Error: prompt is required" }], isError: true };
  }

  const width = args.width || 1024;
  const height = args.height || 1024;
  const model = args.model || "flux";

  try {
    mkdirSync(OUTPUT_DIR, { recursive: true });
  } catch { /* already exists */ }

  const encodedPrompt = encodeURIComponent(prompt);
  const url = `${BASE_URL}/${encodedPrompt}?width=${width}&height=${height}&model=${model}&nologo=true&enhance=false`;

  let imageBuffer: ArrayBuffer | null = null;
  const MAX_RETRIES = 3;
  let lastError = "";

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": "Claude-Telegram-Bot/1.0" },
        signal: AbortSignal.timeout(60_000),
      });

      if (!response.ok) {
        const errText = await response.text().catch(() => "");
        lastError = `HTTP ${response.status}: ${errText.slice(0, 200)}`;
        if (attempt < MAX_RETRIES) continue;
        return {
          content: [{ type: "text" as const, text: `Error: Pollinations returned ${lastError}` }],
          isError: true,
        };
      }

      imageBuffer = await response.arrayBuffer();
      break;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      if (attempt < MAX_RETRIES) {
        await new Promise(r => setTimeout(r, 3000 * attempt));
        continue;
      }
      return {
        content: [{ type: "text" as const, text: `Error after ${MAX_RETRIES} attempts: ${lastError}` }],
        isError: true,
      };
    }
  }

  if (!imageBuffer) {
    return {
      content: [{ type: "text" as const, text: `Error: failed to get image after ${MAX_RETRIES} attempts` }],
      isError: true,
    };
  }

  if (imageBuffer.byteLength < 1000) {
    return {
      content: [{ type: "text" as const, text: "Error: received suspiciously small image, generation may have failed" }],
      isError: true,
    };
  }

  const timestamp = Date.now();
  const uuid = crypto.randomUUID().slice(0, 8);
  const filePath = `${OUTPUT_DIR}/pollinations-${timestamp}-${uuid}.png`;

  try {
    await Bun.write(filePath, imageBuffer);
  } catch (err) {
    return {
      content: [{ type: "text" as const, text: `Error: Failed to save image: ${err instanceof Error ? err.message : String(err)}` }],
      isError: true,
    };
  }

  return {
    content: [{ type: "text" as const, text: filePath }],
  };
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Pollinations Image MCP server running on stdio");
}

main().catch(console.error);
