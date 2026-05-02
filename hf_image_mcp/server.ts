#!/usr/bin/env bun
/**
 * HF Image MCP Server - Generates images via Hugging Face Inference API.
 *
 * When Claude calls generate_image(), this server posts a prompt to the
 * Hugging Face API, saves the resulting image to /tmp/hf_images/, and
 * returns the file path. Claude can then pass that path to send_file MCP
 * to deliver the image to the user.
 *
 * Uses the official MCP TypeScript SDK for proper protocol compliance.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { mkdirSync } from "fs";

// HF deprecated /models/<id> serverless inference in 2025 in favor of the
// Inference Providers router. Tongyi-MAI/Z-Image is hosted only via fal-ai
// (see /api/models/Tongyi-MAI/Z-Image?expand[]=inferenceProviderMapping).
// fal-ai responds with JSON {images: [{url, ...}]} — we then download the URL.
const HF_API_URL =
  "https://router.huggingface.co/fal-ai/fal-ai/z-image/base";
const OUTPUT_DIR = "/tmp/hf_images";

// Create the MCP server
const server = new Server(
  {
    name: "hf-image",
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
        name: "generate_image",
        description:
          "Generate an image from a text prompt using Hugging Face Inference API (Tongyi-MAI/Z-Image model). Returns the absolute path to the saved image file. Use send_file tool afterwards to deliver the image to the user.",
        inputSchema: {
          type: "object" as const,
          properties: {
            prompt: {
              type: "string",
              description:
                "Text description of the image to generate. Be detailed and descriptive for best results.",
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
  if (request.params.name !== "generate_image") {
    throw new Error(`Unknown tool: ${request.params.name}`);
  }

  const args = request.params.arguments as { prompt?: string };
  const prompt = (args.prompt || "").trim();

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

  const token = process.env.HF_API_TOKEN;
  if (!token) {
    return {
      content: [
        {
          type: "text" as const,
          text: "Error: HF_API_TOKEN environment variable is not set. Please configure the Hugging Face API token.",
        },
      ],
      isError: true,
    };
  }

  // Ensure output directory exists
  try {
    mkdirSync(OUTPUT_DIR, { recursive: true });
  } catch {
    // Directory may already exist
  }

  // Step 1: ask fal-ai (via HF router) to generate the image. Returns JSON with a URL.
  let imageUrl: string;
  try {
    const response = await fetch(HF_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ prompt }),
    });

    if (!response.ok) {
      let errText = "";
      try {
        errText = await response.text();
      } catch {
        // ignore
      }
      return {
        content: [
          {
            type: "text" as const,
            text: `Error: HF router returned ${response.status} ${response.statusText}${errText ? `: ${errText.slice(0, 300)}` : ""}`,
          },
        ],
        isError: true,
      };
    }

    const data = (await response.json()) as {
      images?: Array<{ url?: string }>;
    };
    const url = data.images?.[0]?.url;
    if (!url || typeof url !== "string") {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error: HF router returned no image URL. Body: ${JSON.stringify(data).slice(0, 300)}`,
          },
        ],
        isError: true,
      };
    }
    imageUrl = url;
  } catch (err) {
    return {
      content: [
        {
          type: "text" as const,
          text: `Error: Failed to call HF router: ${err instanceof Error ? err.message : String(err)}`,
        },
      ],
      isError: true,
    };
  }

  // Step 2: download the generated image from fal.media.
  let imageBuffer: ArrayBuffer;
  try {
    const dl = await fetch(imageUrl);
    if (!dl.ok) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error: Failed to download generated image (HTTP ${dl.status}) from ${imageUrl}`,
          },
        ],
        isError: true,
      };
    }
    imageBuffer = await dl.arrayBuffer();
  } catch (err) {
    return {
      content: [
        {
          type: "text" as const,
          text: `Error: Failed to download image: ${err instanceof Error ? err.message : String(err)}`,
        },
      ],
      isError: true,
    };
  }

  if (imageBuffer.byteLength === 0) {
    return {
      content: [
        {
          type: "text" as const,
          text: "Error: Downloaded image is empty",
        },
      ],
      isError: true,
    };
  }

  // Save image to temp file
  const timestamp = Date.now();
  const uuid = crypto.randomUUID().slice(0, 8);
  const filePath = `${OUTPUT_DIR}/hf-${timestamp}-${uuid}.png`;

  try {
    await Bun.write(filePath, imageBuffer);
  } catch (err) {
    return {
      content: [
        {
          type: "text" as const,
          text: `Error: Failed to save image: ${err instanceof Error ? err.message : String(err)}`,
        },
      ],
      isError: true,
    };
  }

  return {
    content: [
      {
        type: "text" as const,
        text: filePath,
      },
    ],
  };
});

// Run the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("HF Image MCP server running on stdio");
}

main().catch(console.error);
