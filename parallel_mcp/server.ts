#!/usr/bin/env bun
/**
 * Parallel MCP Server — runs independent subtasks in parallel via Claude Agent SDK.
 *
 * Claude calls mcp__parallel__run with an array of tasks. Each task gets its own
 * query() call. All tasks run concurrently via Promise.all. Results are returned
 * as an array of {name, output, error?} objects.
 *
 * Env vars consumed (inherited from parent CLI subprocess):
 *   TELEGRAM_PARALLEL_CWD   — working directory for child queries (fallback: process.cwd())
 *   TELEGRAM_PARALLEL_MODEL — model for child queries (fallback: deepseek-chat)
 *   ANTHROPIC_API_KEY       — propagated automatically from parent env
 *   ANTHROPIC_BASE_URL      — propagated automatically from parent env (DeepSeek endpoint)
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { query } from "@anthropic-ai/claude-agent-sdk";

const server = new Server(
  {
    name: "parallel",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "run",
        description:
          "REQUIRED for any task with ≥2 independent subtasks. Runs subtasks in parallel and returns array of results. Use this instead of calling the same tool multiple times sequentially. ОБЯЗАТЕЛЬНО используй когда задача состоит из ≥2 независимых частей.",
        inputSchema: {
          type: "object" as const,
          properties: {
            tasks: {
              type: "array",
              description:
                "Массив независимых подзадач для параллельного исполнения",
              minItems: 2,
              maxItems: 10,
              items: {
                type: "object",
                properties: {
                  name: {
                    type: "string",
                    description: "Краткое имя подзадачи для логов",
                  },
                  prompt: {
                    type: "string",
                    description:
                      "Полное ТЗ для подзадачи: что найти/сделать, куда сохранить результат",
                  },
                },
                required: ["name", "prompt"],
              },
            },
          },
          required: ["tasks"],
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name !== "run") {
    throw new Error(`Unknown tool: ${request.params.name}`);
  }

  const args = request.params.arguments as {
    tasks?: Array<{ name: string; prompt: string }>;
  };

  const tasks = args.tasks;
  if (!tasks || tasks.length < 2) {
    return {
      content: [
        {
          type: "text" as const,
          text: "Error: tasks array with at least 2 items is required",
        },
      ],
      isError: true,
    };
  }

  const cwd = process.env.TELEGRAM_PARALLEL_CWD || process.cwd();
  const model =
    process.env.TELEGRAM_PARALLEL_MODEL ||
    process.env.ANTHROPIC_MODEL ||
    "deepseek-chat";

  console.error(
    `[parallel] Running ${tasks.length} tasks in parallel (model=${model}, cwd=${cwd})`
  );

  // Run all tasks concurrently. Each gets an isolated query() session.
  // mcp__parallel__run is excluded from child sessions to prevent recursion.
  const results = await Promise.all(
    tasks.map(async (task) => {
      console.error(`[parallel] Starting subtask: ${task.name}`);
      try {
        const responseParts: string[] = [];

        const queryInstance = query({
          prompt: task.prompt,
          options: {
            model,
            cwd,
            // Prevent recursive parallel calls in child sessions
            disallowedTools: ["mcp__parallel__run"],
            // Allow reasonable tool turns for each subtask
            maxTurns: 10,
          },
        });

        for await (const event of queryInstance) {
          if (
            event.type === "assistant" &&
            Array.isArray(event.message?.content)
          ) {
            for (const block of event.message.content) {
              if (block.type === "text" && block.text) {
                responseParts.push(block.text);
              }
            }
          }
        }

        const output = responseParts.join("\n").trim() || "(no output)";
        console.error(
          `[parallel] Subtask done: ${task.name} (${output.length} chars)`
        );
        return { name: task.name, output };
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        console.error(`[parallel] Subtask failed: ${task.name} — ${errorMsg}`);
        return { name: task.name, output: "", error: errorMsg };
      }
    })
  );

  const resultJson = JSON.stringify({ results }, null, 2);
  return {
    content: [
      {
        type: "text" as const,
        text: resultJson,
      },
    ],
  };
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Parallel MCP server running on stdio");
}

main().catch(console.error);
