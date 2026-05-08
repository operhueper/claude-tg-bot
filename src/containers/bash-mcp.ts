/**
 * In-process MCP server that exposes a Bash-equivalent tool for guests
 * whose work must run inside their Docker sandbox.
 *
 * The SDK has no hook for replacing the built-in Bash execution. So instead
 * we disallow the built-in Bash tool for container-enabled guests and give
 * them this MCP tool, which routes every command through `containerManager.exec`.
 *
 * From the model's POV the tool surfaces as `mcp__container__Bash` —
 * the system prompt for guests must mention that name explicitly.
 */

import { z } from "zod";
import {
  createSdkMcpServer,
  tool,
  type McpSdkServerConfigWithInstance,
} from "@anthropic-ai/claude-agent-sdk";

import type { UserProfile } from "../config";
import { containerManager } from "./manager";

const DEFAULT_TIMEOUT_MS = 120_000; // 2 min — covers most pip/npm installs

export function buildContainerBashMcp(
  profile: UserProfile
): McpSdkServerConfigWithInstance {
  const userId = profile.userId;
  const cwd = profile.workingDir;

  return createSdkMcpServer({
    name: "container",
    version: "1.0.0",
    tools: [
      tool(
        "Bash",
        "Run a shell command in the user's working environment. State persists between calls (installed packages, created files). Use this instead of the built-in Bash tool.",
        {
          command: z.string().describe("The shell command to run (bash -lc syntax)."),
          timeout: z
            .number()
            .int()
            .positive()
            .max(600_000)
            .optional()
            .describe(
              "Optional timeout in milliseconds. Default 120000 (2 min). Max 600000 (10 min)."
            ),
        },
        async ({ command, timeout }) => {
          const result = await containerManager.exec(userId, command, {
            timeout: timeout ?? DEFAULT_TIMEOUT_MS,
            cwd,
          });

          // Compose stdout/stderr into a single text block so the model gets
          // both, with a clear marker for stderr. Match the conventional
          // shape of the built-in Bash tool's output.
          const parts: string[] = [];
          if (result.stdout) parts.push(result.stdout);
          if (result.stderr) parts.push(`[stderr]\n${result.stderr}`);
          if (parts.length === 0) parts.push("(no output)");
          if (result.exitCode !== 0) {
            parts.push(`[exit code: ${result.exitCode}]`);
          }

          return {
            content: [
              {
                type: "text",
                text: parts.join("\n"),
              },
            ],
            isError: result.exitCode !== 0,
          };
        }
      ),
    ],
  });
}
