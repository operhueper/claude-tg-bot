import { MCP_SERVERS } from "../mcp-config";
import type { UserProfile } from "./config";

export function mcpServersForProfile(
  profile: UserProfile
): typeof MCP_SERVERS {
  if (profile.isOwner) return MCP_SERVERS;
  const result: typeof MCP_SERVERS = {};
  for (const [key, value] of Object.entries(MCP_SERVERS)) {
    if (key === "openrouter-image") continue;
    result[key] = value;
  }
  return result;
}
