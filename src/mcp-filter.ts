import type { McpServerConfig } from "@anthropic-ai/claude-agent-sdk";

import { MCP_SERVERS } from "../mcp-config";
import type { UserProfile } from "./config";
import { buildContainerBashMcp } from "./containers/bash-mcp";
import { getComposioApiKey, buildGoogleMcpUrl } from "./composio";

type McpServersMap = Record<string, McpServerConfig>;

export function mcpServersForProfile(profile: UserProfile): McpServersMap {
  // Composio Google Workspace MCP — applied to BOTH owner and guests.
  // Per-user isolation via ?user_id=tg_<id>. Skipped if COMPOSIO_API_KEY absent.
  const composioApiKey = getComposioApiKey();
  const googleWorkspaceMcp: McpServerConfig | null = composioApiKey
    ? ({
        type: "http",
        url: buildGoogleMcpUrl(profile.userId),
        headers: { "x-api-key": composioApiKey },
      } as McpServerConfig)
    : null;

  // Owner gets the full external-MCP set + Google Workspace.
  // In-process container Bash is a guest-only feature (owner runs Bash on host directly).
  if (profile.isOwner) {
    const result = { ...MCP_SERVERS } as McpServersMap;
    // Drop connect-google for owner — they don't need OAuth (their account is
    // already linked via /google or they're using Anthropic directly).
    delete result["connect-google"];
    if (googleWorkspaceMcp) {
      result["google-workspace"] = googleWorkspaceMcp;
    }
    return result;
  }

  const result: McpServersMap = {};
  for (const [key, value] of Object.entries(MCP_SERVERS)) {
    if (key === "openrouter-image") continue;
    // connect-google only makes sense when Composio is configured —
    // otherwise the OAuth flow can't complete. Drop it silently if not.
    if (key === "connect-google" && !composioApiKey) continue;
    result[key] = value as McpServerConfig;
  }

  // Container-enabled guests get an in-process Bash tool that routes through
  // their Docker sandbox. The tool surfaces to the model as
  // `mcp__container__Bash` (see buildContainerBashMcp). The standard Bash tool
  // must be added to disallowedTools by the caller (see session.ts).
  if (profile.containerEnabled) {
    result["container"] = buildContainerBashMcp(profile);
  }

  if (googleWorkspaceMcp) {
    result["google-workspace"] = googleWorkspaceMcp;
  }

  return result;
}
