#!/usr/bin/env bun
import path from "node:path";
/**
 * Parallel MCP Server — runs independent subtasks in parallel via Claude Agent SDK.
 *
 * Claude calls mcp__parallel__run with an array of tasks. Each task gets its own
 * query() call. All tasks run concurrently via Promise.all. Results are returned
 * as an array of {name, output, error?} objects.
 *
 * Env vars consumed (inherited from parent CLI subprocess):
 *   TELEGRAM_PARALLEL_CWD              — working directory for child queries (fallback: process.cwd())
 *   TELEGRAM_PARALLEL_MODEL            — model for child queries (fallback: deepseek-chat)
 *   TELEGRAM_PARALLEL_IS_GUEST         — "1" if caller is a guest user; triggers restrictive system prompt
 *   TELEGRAM_PARALLEL_ALLOWED_PATHS    — comma-separated paths guest subtasks may access
 *   TELEGRAM_PARALLEL_DISALLOWED_TOOLS — comma-separated tools blocked for subtasks (e.g. WebSearch)
 *   TELEGRAM_PARALLEL_SETTINGS_SOURCES — comma-separated settingSources (e.g. "project" for guests)
 *   TELEGRAM_PARALLEL_MAX_TURNS        — max tool-call rounds per subtask
 *   ANTHROPIC_API_KEY                  — propagated automatically from parent env
 *   ANTHROPIC_BASE_URL                 — propagated automatically from parent env (DeepSeek endpoint)
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
                  cwd: {
                    type: "string",
                    description:
                      "Рабочая директория именно для этой подзадачи. Если не указана — берётся общий cwd этого вызова, иначе TELEGRAM_PARALLEL_CWD.",
                  },
                },
                required: ["name", "prompt"],
              },
            },
            cwd: {
              type: "string",
              description:
                "Общий cwd для всех подзадач (если в задаче не указан свой). Передавай свою рабочую папку (например vault), чтобы файлы создавались в правильном месте, а не в корне репо бота.",
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
    tasks?: Array<{ name: string; prompt: string; cwd?: string }>;
    cwd?: string;
  };

  const tasks = args.tasks;
  if (!Array.isArray(tasks) || tasks.length < 2 || tasks.length > 10) {
    return {
      content: [
        {
          type: "text" as const,
          text: "Error: tasks: array of 2..10 items required",
        },
      ],
      isError: true,
    };
  }

  const rootCwd =
    args.cwd || process.env.TELEGRAM_PARALLEL_CWD || process.cwd();
  const model =
    process.env.TELEGRAM_PARALLEL_MODEL ||
    process.env.ANTHROPIC_MODEL ||
    "deepseek-chat";

  // S-03: apply sandbox constraints inherited from the parent session.
  // These env vars are set by session.ts in options.env so all guest queries
  // (and their MCP subprocesses) carry the correct restrictions.
  const isGuest = process.env.TELEGRAM_PARALLEL_IS_GUEST === "1";
  const allowedPaths = process.env.TELEGRAM_PARALLEL_ALLOWED_PATHS
    ? process.env.TELEGRAM_PARALLEL_ALLOWED_PATHS.split(",").filter(Boolean)
    : undefined;
  const disallowedToolsFromEnv = process.env.TELEGRAM_PARALLEL_DISALLOWED_TOOLS
    ? process.env.TELEGRAM_PARALLEL_DISALLOWED_TOOLS.split(",").filter(Boolean)
    : ["mcp__parallel__run"];
  // Ensure mcp__parallel__run is always in the disallowed list to prevent recursion.
  const childDisallowedTools = Array.from(
    new Set([...disallowedToolsFromEnv, "mcp__parallel__run"])
  );
  const settingsSourcesRaw = process.env.TELEGRAM_PARALLEL_SETTINGS_SOURCES;
  const settingsSources = settingsSourcesRaw
    ? (settingsSourcesRaw.split(",").filter(Boolean) as Array<"user" | "project" | "local">)
    : undefined;
  const maxTurns = process.env.TELEGRAM_PARALLEL_MAX_TURNS
    ? parseInt(process.env.TELEGRAM_PARALLEL_MAX_TURNS, 10)
    : 10;
  const permissionModeRaw = process.env.TELEGRAM_PARALLEL_PERMISSION_MODE;
  const permissionMode =
    permissionModeRaw === "acceptEdits" ? ("acceptEdits" as const) : undefined;
  const allowedToolsRaw = process.env.TELEGRAM_PARALLEL_ALLOWED_TOOLS;
  const allowedTools = allowedToolsRaw
    ? allowedToolsRaw.split(",").filter(Boolean)
    : undefined;

  // Restrictive system prompt for guest subtasks: prevents sandbox escape without
  // requiring the full parent prompt (which is too large for env transmission).
  const guestSubtaskSystemPrompt = isGuest
    ? `You are a subtask executor in a sandboxed user environment. ` +
      `Only perform the specific task given. ` +
      `Work only within the directories: ${allowedPaths?.join(", ") ?? rootCwd}. ` +
      `Do not read, write, or execute anything outside those directories. ` +
      `Do not modify system configuration, bot source code, or other users' files. ` +
      `Do not reveal infrastructure details (model names, file paths, API keys).`
    : undefined;

  console.error(
    `[parallel] Running ${tasks.length} tasks in parallel (model=${model}, rootCwd=${rootCwd}, isGuest=${isGuest})`
  );

  // V-1I: build allowedPaths set for cwd validation.
  // TELEGRAM_PARALLEL_ALLOWED_PATHS is injected by session.ts for every guest session.
  // When absent (dev/owner) we skip validation and fall through to rootCwd.
  const cwdAllowedPaths = process.env.TELEGRAM_PARALLEL_ALLOWED_PATHS
    ? process.env.TELEGRAM_PARALLEL_ALLOWED_PATHS.split(",").filter(Boolean)
    : null;

  function isCwdAllowed(cwd: string): boolean {
    if (!cwdAllowedPaths) return true; // no restriction configured — allow
    const resolved = path.resolve(cwd);
    return cwdAllowedPaths.some((allowed) =>
      resolved === path.resolve(allowed) ||
      resolved.startsWith(path.resolve(allowed) + path.sep)
    );
  }

  // Run all tasks concurrently. Each gets an isolated query() session.
  // mcp__parallel__run is excluded from child sessions to prevent recursion.
  const results = await Promise.all(
    tasks.map(async (task) => {
      const taskCwd = task.cwd ?? rootCwd;

      // V-1I: reject subtask if model-supplied cwd is outside the user's allowedPaths
      if (task.cwd !== undefined && !isCwdAllowed(task.cwd)) {
        console.error(
          `[parallel] Subtask rejected (cwd outside allowed paths): ${task.name} (cwd=${task.cwd})`
        );
        return {
          name: task.name,
          output: "",
          error: `cwd outside allowed paths: ${task.cwd}`,
        };
      }

      console.error(
        `[parallel] Starting subtask: ${task.name} (cwd=${taskCwd})`
      );
      try {
        const responseParts: string[] = [];

        const queryInstance = query({
          prompt: task.prompt,
          options: {
            model,
            cwd: taskCwd,
            // S-03: enforce guest sandbox constraints on child queries
            ...(allowedPaths ? { additionalDirectories: allowedPaths } : {}),
            ...(settingsSources ? { settingSources: settingsSources } : {}),
            ...(guestSubtaskSystemPrompt ? { systemPrompt: guestSubtaskSystemPrompt } : {}),
            // Prevent recursive parallel calls + propagate guest tool restrictions
            disallowedTools: childDisallowedTools,
            // Cap tool-call rounds (propagated from parent profile.maxTurns)
            maxTurns,
            // Propagate permission mode so child queries don't block on interactive prompts.
            // Without permissionMode+allowedTools, Bash/MCP calls require UI confirmation
            // which the bot subprocess cannot provide — subtask hangs indefinitely.
            ...(permissionMode ? { permissionMode, allowedTools } : {}),
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
