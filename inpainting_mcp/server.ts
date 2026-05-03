#!/usr/bin/env bun
/**
 * Inpainting MCP Server - Inpaints images via Hugging Face Inference API.
 *
 * When Claude calls inpaint_image(), this server:
 * 1. Optionally creates a mask from white pixels in the source image (via ImageMagick).
 * 2. Sends the image + mask + prompt to a HF inpainting model.
 * 3. Saves the result to /tmp and returns the path.
 *
 * Claude can then pass the path to send_file MCP to deliver the image to the user.
 *
 * Uses the official MCP TypeScript SDK for proper protocol compliance.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

// Models to try in order (primary then fallback)
const INPAINTING_MODELS = [
  "stabilityai/stable-diffusion-2-inpainting",
  "stable-diffusion-v1-5/stable-diffusion-inpainting",
];
const HF_API_BASE = "https://api-inference.huggingface.co/models";

// Create the MCP server
const server = new Server(
  {
    name: "hf-inpainting",
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
        name: "inpaint_image",
        description:
          "Inpaint (fill in) a region of an image using Stable Diffusion inpainting via Hugging Face. " +
          "Provide an image path and a text prompt describing what to draw in the masked area. " +
          "If no mask is provided and auto_detect_white is true (default), white pixels in the image " +
          "are automatically used as the inpainting mask. Returns the absolute path to the result image. " +
          "Use send_file tool afterwards to deliver the image to the user.",
        inputSchema: {
          type: "object" as const,
          properties: {
            image_path: {
              type: "string",
              description: "Absolute path to the original image file.",
            },
            mask_path: {
              type: "string",
              description:
                "Optional absolute path to a mask image (white = fill area, black = keep). " +
                "If not provided, mask is auto-created from white pixels when auto_detect_white is true.",
            },
            prompt: {
              type: "string",
              description:
                "Text description of what to draw in the masked (white) region of the image.",
            },
            auto_detect_white: {
              type: "boolean",
              description:
                "When mask_path is not provided, automatically create a mask from white pixels " +
                "(R>240, G>240, B>240) in the source image. Defaults to true.",
            },
          },
          required: ["image_path", "prompt"],
        },
      },
    ],
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name !== "inpaint_image") {
    throw new Error(`Unknown tool: ${request.params.name}`);
  }

  const args = request.params.arguments as {
    image_path?: string;
    mask_path?: string;
    prompt?: string;
    auto_detect_white?: boolean;
  };

  const imagePath = (args.image_path || "").trim();
  const prompt = (args.prompt || "").trim();
  const autoDetectWhite = args.auto_detect_white !== false; // default true
  let maskPath = (args.mask_path || "").trim();

  if (!imagePath) {
    return {
      content: [{ type: "text" as const, text: "Error: image_path is required" }],
      isError: true,
    };
  }
  if (!prompt) {
    return {
      content: [{ type: "text" as const, text: "Error: prompt is required" }],
      isError: true,
    };
  }

  const token = process.env.HF_API_TOKEN;
  if (!token) {
    return {
      content: [
        {
          type: "text" as const,
          text: "Error: HF_API_TOKEN environment variable is not set.",
        },
      ],
      isError: true,
    };
  }

  // Verify source image exists
  const imageFile = Bun.file(imagePath);
  if (!(await imageFile.exists())) {
    return {
      content: [
        {
          type: "text" as const,
          text: `Error: image file not found: ${imagePath}`,
        },
      ],
      isError: true,
    };
  }

  // Auto-create mask from white pixels if needed
  if (!maskPath && autoDetectWhite) {
    const generatedMaskPath = `/tmp/inpainting_mask_${Date.now()}.png`;
    try {
      // Use ImageMagick to threshold: pixels with all channels > 90% become white, rest black
      const proc = Bun.spawn(
        [
          "convert",
          imagePath,
          "-colorspace",
          "Gray",
          "-threshold",
          "94%",
          generatedMaskPath,
        ],
        { stdout: "pipe", stderr: "pipe" }
      );
      const exitCode = await proc.exited;
      if (exitCode !== 0) {
        const errOutput = await new Response(proc.stderr).text();
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: ImageMagick failed to create mask (exit ${exitCode}): ${errOutput.slice(0, 300)}`,
            },
          ],
          isError: true,
        };
      }
      maskPath = generatedMaskPath;
    } catch (err) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error: Failed to run ImageMagick convert: ${err instanceof Error ? err.message : String(err)}. Ensure ImageMagick is installed.`,
          },
        ],
        isError: true,
      };
    }
  }

  if (!maskPath) {
    return {
      content: [
        {
          type: "text" as const,
          text: "Error: No mask provided and auto_detect_white is false. Provide mask_path or enable auto_detect_white.",
        },
      ],
      isError: true,
    };
  }

  // Verify mask exists
  const maskFile = Bun.file(maskPath);
  if (!(await maskFile.exists())) {
    return {
      content: [
        {
          type: "text" as const,
          text: `Error: mask file not found: ${maskPath}`,
        },
      ],
      isError: true,
    };
  }

  // Read and base64-encode both images
  let imageBase64: string;
  let maskBase64: string;
  try {
    imageBase64 = Buffer.from(await imageFile.arrayBuffer()).toString("base64");
    maskBase64 = Buffer.from(await maskFile.arrayBuffer()).toString("base64");
  } catch (err) {
    return {
      content: [
        {
          type: "text" as const,
          text: `Error: Failed to read image files: ${err instanceof Error ? err.message : String(err)}`,
        },
      ],
      isError: true,
    };
  }

  // Try each model in order until one succeeds
  let lastError = "";
  for (const model of INPAINTING_MODELS) {
    const apiUrl = `${HF_API_BASE}/${model}`;
    let response: Response;
    try {
      response = await fetch(apiUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Accept: "image/png",
        },
        body: JSON.stringify({
          inputs: prompt,
          parameters: {
            image: imageBase64,
            mask_image: maskBase64,
            num_inference_steps: 20,
            guidance_scale: 8.0,
          },
        }),
      });
    } catch (err) {
      lastError = `Fetch error for ${model}: ${err instanceof Error ? err.message : String(err)}`;
      continue;
    }

    if (!response.ok) {
      let errText = "";
      try {
        errText = await response.text();
      } catch {
        // ignore
      }
      lastError = `Model ${model} returned HTTP ${response.status} ${response.statusText}${errText ? `: ${errText.slice(0, 300)}` : ""}`;
      continue;
    }

    // Success — save the result
    let imageBuffer: ArrayBuffer;
    try {
      imageBuffer = await response.arrayBuffer();
    } catch (err) {
      lastError = `Failed to read response from ${model}: ${err instanceof Error ? err.message : String(err)}`;
      continue;
    }

    if (imageBuffer.byteLength === 0) {
      lastError = `Model ${model} returned an empty image`;
      continue;
    }

    const resultPath = `/tmp/inpainting_result_${Date.now()}.png`;
    try {
      await Bun.write(resultPath, imageBuffer);
    } catch (err) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Error: Failed to save result image: ${err instanceof Error ? err.message : String(err)}`,
          },
        ],
        isError: true,
      };
    }

    return {
      content: [
        {
          type: "text" as const,
          text: resultPath,
        },
      ],
    };
  }

  // All models failed
  return {
    content: [
      {
        type: "text" as const,
        text: `Error: All inpainting models failed. Last error: ${lastError}`,
      },
    ],
    isError: true,
  };
});

// Run the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Inpainting MCP server running on stdio");
}

main().catch(console.error);
