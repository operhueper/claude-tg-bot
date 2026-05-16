/**
 * Outbound proxy module.
 *
 * When HETZNER_PROXY_URL is set, routes foreign API traffic (OpenAI, OpenRouter,
 * Composio) through a Hetzner proxy to bypass geo-blocks on Russian servers.
 * When the env var is absent, all exports are no-ops — behaviour is identical
 * to using native fetch / no agent.
 */

const PROXY_URL = process.env.HETZNER_PROXY_URL;

/**
 * Drop-in replacement for `fetch` that adds a proxy when HETZNER_PROXY_URL is set.
 * If the env var is absent, delegates directly to native fetch with no changes.
 */
export function proxyFetch(
  url: string | URL | Request,
  init?: RequestInit
): Promise<Response> {
  if (!PROXY_URL) return fetch(url, init);
  return fetch(url, {
    ...init,
    proxy: PROXY_URL,
  } as RequestInit & { proxy: string });
}

/**
 * Returns additional ClientOptions to pass to the OpenAI SDK constructor when
 * a proxy is configured. The SDK's `fetchOptions` field is spread into each
 * underlying fetch call, so Bun's `{ proxy }` extension is honoured.
 * Returns an empty object when HETZNER_PROXY_URL is not set.
 */
export function getProxyFetchOptions(): { fetchOptions?: { proxy: string } } {
  if (!PROXY_URL) return {};
  return { fetchOptions: { proxy: PROXY_URL } };
}
