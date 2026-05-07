import type { McpServerConfig } from "@anthropic-ai/claude-agent-sdk";

import { MCP_SERVERS } from "../mcp-config";
import type { UserProfile } from "./config";
import { buildContainerBashMcp } from "./containers/bash-mcp";
import { getComposioApiKey, buildGoogleMcpUrl } from "./composio";

type McpServersMap = Record<string, McpServerConfig>;

export function mcpServersForProfile(profile: UserProfile): McpServersMap {
  // Owner gets the full external-MCP set; in-process container Bash is a
  // guest-only feature (owner runs Bash on the host directly).
  if (profile.isOwner) return MCP_SERVERS as McpServersMap;

  const result: McpServersMap = {};
  for (const [key, value] of Object.entries(MCP_SERVERS)) {
    if (key === "openrouter-image") continue;
    result[key] = value as McpServerConfig;
  }

  // Container-enabled guests get an in-process Bash tool that routes through
  // their Docker sandbox. The tool surfaces to the model as
  // `mcp__container__Bash` (see buildContainerBashMcp). The standard Bash tool
  // must be added to disallowedTools by the caller (see session.ts).
  if (profile.containerEnabled) {
    result["container"] = buildContainerBashMcp(profile);
  }

  // Google Workspace MCP via Composio (managed OAuth, per-user isolation).
  // Only injected when COMPOSIO_API_KEY is set — graceful no-op otherwise.
  const composioApiKey = getComposioApiKey();
  if (composioApiKey) {
    result["google-workspace"] = {
      type: "http",
      url: buildGoogleMcpUrl(profile.userId),
      headers: { "x-api-key": composioApiKey },
    } as McpServerConfig;
  }

  return result;
}
