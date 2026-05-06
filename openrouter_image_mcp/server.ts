#!/usr/bin/env bun
/**
 * OpenRouter Image MCP Server
 *
 * Generates images via OpenRouter image models (paid — requires explicit user consent).
 * Default model: google/gemini-2.5-flash-image (Nano Banana, ~$0.02-0.05/image).
 * Also supports: google/gemini-3.1-flash-image-preview, black-forest-labs/flux.2-pro, etc.
 *
 * IMPORTANT: This is a PAID API. Only use when user explicitly says "трать деньги" /
 * "используй платное" / "да, трать". Never use by default.
 *
 * Claude calls generate_image(prompt, model?), server saves PNG to /tmp/openrouter_images/
 * and returns the path. Claude then passes path to send_file MCP.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { mkdirSync } from "fs";

const OUTPUT_DIR = "/tmp/openrouter_images";
const OPENROUTER_BASE = "https://openrouter.ai/api/v1";

const AVAILABLE_MODELS: Record<string, string> = {
  "nano-banana": "google/gemini-2.5-flash-image",
  "nano-banana-2": "google/gemini-3.1-flash-image-preview",
  "nano-banana-pro": "google/gemini-3-pro-image-preview",
  "flux-pro": "black-forest-labs/flux.2-pro",
  "flux-klein": "black-forest-labs/flux.2-klein-4b",
};

const DEFAULT_MODEL = "google/gemini-2.5-flash-image";

const server = new Server(
  { name: "openrouter-image", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "generate_image",
      description:
        "⚠️ PAID API — only use when user explicitly confirmed spending money (said 'трать деньги', 'используй платное', 'да, трать' etc). " +
        "Generates high-quality images via OpenRouter (Google Nano Banana / Gemini image models). " +
        "Default model: google/gemini-2.5-flash-image (~$0.02-0.05/image). " +
        "Available models: nano-banana, nano-banana-2, nano-banana-pro, flux-pro, flux-klein. " +
        "Returns absolute path to saved PNG. Use send_file tool afterwards to deliver the image.",
      inputSchema: {
        type: "object" as const,
        properties: {
          prompt: {
            type: "string",
            description: "Text description of the image. Be detailed and descriptive for best results.",
          },
          model: {
            type: "string",
            description:
              "Model alias or full OpenRouter model ID. Aliases: nano-banana (default), nano-banana-2, nano-banana-pro, flux-pro, flux-klein.",
          },
          aspect_ratio: {
            type: "string",
            description: "Aspect ratio: '1:1' (default), '16:9', '9:16', '4:3', '3:4', '3:2', '2:3'",
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
    model?: string;
    aspect_ratio?: string;
  };

  const prompt = (args.prompt || "").trim();
  if (!prompt) {
    return { content: [{ type: "text" as const, text: "Error: prompt is required" }], isError: true };
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return {
      content: [{ type: "text" as const, text: "Error: OPENROUTER_API_KEY environment variable is not set." }],
      isError: true,
    };
  }

  // Resolve model alias or use as-is
  const modelInput = (args.model || "nano-banana").trim();
  const model = AVAILABLE_MODELS[modelInput] || modelInput || DEFAULT_MODEL;

  const aspectRatio = args.aspect_ratio || "1:1";

  try {
    mkdirSync(OUTPUT_DIR, { recursive: true });
  } catch { /* already exists */ }

  // Build request body per OpenRouter image generation API
  const body: Record<string, unknown> = {
    model,
    modalities: ["image", "text"],
    messages: [{ role: "user", content: prompt }],
    image_config: { aspect_ratio: aspectRatio },
  };

  let response: Response;
  try {
    response = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://github.com/claude-tg-bot",
        "X-Title": "Claude Telegram Bot",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120_000),
    });
  } catch (err) {
    return {
      content: [{ type: "text" as const, text: `Error: Failed to call OpenRouter API: ${err instanceof Error ? err.message : String(err)}` }],
      isError: true,
    };
  }

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    return {
      content: [{ type: "text" as const, text: `Error: OpenRouter returned ${response.status}: ${errText.slice(0, 400)}` }],
      isError: true,
    };
  }

  const data = (await response.json()) as {
    choices?: Array<{
      message?: {
        content?: string | Array<{ type: string; image_url?: { url: string }; text?: string }>;
      };
    }>;
    error?: { message?: string };
  };

  if (data.error) {
    return {
      content: [{ type: "text" as const, text: `Error from OpenRouter: ${data.error.message || JSON.stringify(data.error)}` }],
      isError: true,
    };
  }

  const message = data.choices?.[0]?.message;
  if (!message) {
    return {
      content: [{ type: "text" as const, text: `Error: No response from OpenRouter. Full response: ${JSON.stringify(data).slice(0, 400)}` }],
      isError: true,
    };
  }

  // Content can be string or array of parts
  let imageDataUrl: string | null = null;

  if (typeof message.content === "string") {
    // Some models return data URL directly in string
    if (message.content.startsWith("data:image/")) {
      imageDataUrl = message.content;
    }
  } else if (Array.isArray(message.content)) {
    for (const part of message.content) {
      if (part.type === "image_url" && part.image_url?.url) {
        imageDataUrl = part.image_url.url;
        break;
      }
    }
  }

  if (!imageDataUrl) {
    return {
      content: [{ type: "text" as const, text: `Error: No image in response. Content: ${JSON.stringify(message.content).slice(0, 400)}` }],
      isError: true,
    };
  }

  // Parse data URL: data:image/png;base64,<data>
  const matches = imageDataUrl.match(/^data:image\/(\w+);base64,(.+)$/s);
  if (!matches) {
    return {
      content: [{ type: "text" as const, text: `Error: Unexpected image URL format (not a base64 data URL): ${imageDataUrl.slice(0, 100)}` }],
      isError: true,
    };
  }

  const ext = matches[1] === "jpeg" ? "jpg" : matches[1];
  const base64Data = matches[2]!;

  const timestamp = Date.now();
  const uuid = crypto.randomUUID().slice(0, 8);
  const filePath = `${OUTPUT_DIR}/openrouter-${timestamp}-${uuid}.${ext}`;

  try {
    const imageBuffer = Buffer.from(base64Data, "base64");
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
  console.error("OpenRouter Image MCP server running on stdio");
}

main().catch(console.error);
