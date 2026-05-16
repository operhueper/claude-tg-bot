/**
 * Composio integration for Google Workspace MCP.
 *
 * Provides per-user OAuth via Composio's managed platform.
 * Each guest gets their own isolated MCP URL: ?user_id=tg_<userId>
 */

import { proxyFetch } from "./proxy";

// v2 (146 tools, GMAIL_FETCH_EMAILS/GMAIL_GET_ATTACHMENT removed — they have unsafe defaults
// that blow context: include_payload=true, verbose=true return full bodies + base64 attachments).
// Use GMAIL_LIST_THREADS + GMAIL_FETCH_MESSAGE_BY_MESSAGE_ID instead.
export const COMPOSIO_GOOGLE_MCP_ID = "6e3516f8-92df-44e3-8261-2ba31bda5c78";
export const COMPOSIO_BASE_URL = "https://backend.composio.dev";

/** Maps toolkit slug to Composio auth config ID */
export const COMPOSIO_AUTH_CONFIGS: Record<string, string> = {
  googledocs: "ac_DNzIsHufivLw",
  googledrive: "ac_mdhR6lblYcTw",
  googlesheets: "ac_Tm_qBpZee_of",
  gmail: "ac_7EGSXL_J9rND",
  googlecalendar: "ac_BwjwK7St3vGK",
};

/** Display metadata for each toolkit */
const TOOLKIT_META: Record<string, { label: string; emoji: string }> = {
  googledocs: { label: "Docs", emoji: "📄" },
  googledrive: { label: "Drive", emoji: "💾" },
  googlesheets: { label: "Sheets", emoji: "📊" },
  gmail: { label: "Gmail", emoji: "✉️" },
  googlecalendar: { label: "Calendar", emoji: "📅" },
};

export function getComposioApiKey(): string | undefined {
  const key = process.env.COMPOSIO_API_KEY;
  return key && key.trim() ? key.trim() : undefined;
}

export function buildGoogleMcpUrl(userId: number): string {
  return `${COMPOSIO_BASE_URL}/v3/mcp/${COMPOSIO_GOOGLE_MCP_ID}?user_id=tg_${userId}`;
}

export interface ComposioConnectionResult {
  toolkit: string;
  redirectUrl: string;
  label: string;
  emoji: string;
}

/**
 * Initiates OAuth connections for all 5 Google toolkits in parallel.
 * Returns an array of redirect URLs (one per toolkit).
 * Throws if COMPOSIO_API_KEY is not set.
 */
export async function initiateGoogleConnections(
  userId: number
): Promise<ComposioConnectionResult[]> {
  const apiKey = getComposioApiKey();
  if (!apiKey) {
    throw new Error("COMPOSIO_API_KEY is not set");
  }

  const toolkits = Object.keys(COMPOSIO_AUTH_CONFIGS);

  const results = await Promise.all(
    toolkits.map(async (toolkit) => {
      const authConfigId = COMPOSIO_AUTH_CONFIGS[toolkit];
      const response = await proxyFetch(
        `${COMPOSIO_BASE_URL}/api/v3/connected_accounts`,
        {
          method: "POST",
          headers: {
            "x-api-key": apiKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            auth_config: { id: authConfigId },
            connection: { user_id: `tg_${userId}` },
          }),
        }
      );

      if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(
          `Composio API error for ${toolkit}: ${response.status} ${text}`
        );
      }

      const data = (await response.json()) as { redirect_url?: string };
      const redirectUrl = data.redirect_url;
      if (!redirectUrl) {
        throw new Error(
          `No redirect_url in Composio response for ${toolkit}`
        );
      }

      const meta = TOOLKIT_META[toolkit] ?? { label: toolkit, emoji: "🔗" };
      return {
        toolkit,
        redirectUrl,
        label: meta.label,
        emoji: meta.emoji,
      };
    })
  );

  return results;
}
