# Zone 4 — Metering + Dashboard + HMAC

## Summary

Overall quality is solid for a small-team project. HMAC verification follows the Telegram spec correctly, timing-safe comparison is used, SQL is fully parameterized, and XSS risks in the dashboard template are handled via an `esc()` helper. The main concerns are: a crash-path in `validateInitData` when `hash` contains non-hex characters (500 instead of 401), a missing firewall rule for the notify-bridge port 3849, the `DASHBOARD_ALLOW_MOCK` env var undocumented in `.env.example`, a spoofable `x-forwarded-for` in the YuKassa webhook handler, and a missing composite index on `(user_id, ts)` that will show as a slow query once the metering table grows.

---

## Findings (table)

| # | Severity | Area | File:Line | Issue |
|---|----------|------|-----------|-------|
| 1 | medium | HMAC | `dashboard-server.ts:154–158` | `timingSafeEqual` throws (unhandled) on non-hex `hash` input — returns 500 not 401 |
| 2 | medium | Network | `dashboard-server.ts:719`, `docker-user-rules.sh:16` | Notify-bridge port 3849 bound on `0.0.0.0`, not in the firewall `HOST_PORTS` array — only iptables INPUT chain (if present) blocks it |
| 3 | medium | Webhook | `dashboard-server.ts:440–448` | YuKassa IP check reads `x-forwarded-for` which can be spoofed if the bot listens directly (no trusted-proxy handling) |
| 4 | low | Config | `dashboard-server.ts:624` / `.env.example` | `DASHBOARD_ALLOW_MOCK` not documented in `.env.example` — easy to accidentally leave enabled in prod |
| 5 | low | Performance | `metering.ts:36–37` | No composite index on `(user_id, ts)` — rolling-window query (`WHERE user_id=? AND ts>=?`) will full-scan the user's rows at scale |
| 6 | low | Security | `dashboard-server.ts:477,495` | `BOT_USERNAME` env var is interpolated bare into a JS string literal in the subscribe page (`var tgDeep = "...${botUsername}"`) — not JSON-encoded, XSS if env value contains quotes |
| 7 | low | Reliability | `security.ts:21` | Rate-limiter state is in-memory only — resets on every bot restart; a burst attack can clear its history |
| 8 | info | Auth ordering | `dashboard-server.ts:155,161` | `auth_date` check is performed after the HMAC check — correct order, but worth noting |
| 9 | info | Masking | `utils.ts:29–39` | Telegram bot token regex `\d{8,12}` — token IDs are typically 10 digits, the 8-digit floor might miss future shorter tokens |
| 10 | info | CORS | `dashboard-server.ts:189` | CORS header `Access-Control-Allow-Origin: https://web.telegram.org` is set, but server-side callers bypass CORS entirely — the real gate is HMAC |

---

## Detailed Findings

### Finding 1 — medium: `timingSafeEqual` throws on non-hex `hash` input

**File:** `src/dashboard-server.ts:154–158`

```ts
if (expectedHash.length !== hash.length) return null;   // string-length check OK
const equal = timingSafeEqual(
  Buffer.from(expectedHash, "hex"),   // always 32 bytes
  Buffer.from(hash, "hex")           // 0 bytes if hash contains non-hex chars
);
```

The string-length check at line 154 only verifies that `hash` has 64 characters. It does not verify that those characters are valid hex. `Buffer.from(input, "hex")` silently discards any byte pair that is invalid hex, producing a buffer shorter than 32 bytes. `timingSafeEqual` then throws `Error: Input buffers must have the same byte length`. Since there is no `try/catch` around lines 155–158 inside `validateInitData`, the exception propagates up through `handleApiMe` → Bun's outer catch → returns HTTP 500 instead of 401. This is not an auth bypass, but it reveals an internal server error to an unauthenticated caller and is a minor denial-of-service surface.

**Fix:** Wrap `timingSafeEqual` in a try/catch, or validate the hex before creating the buffer:

```ts
// Option A: validate hex
if (!/^[0-9a-f]{64}$/.test(hash)) return null;

// Option B: try/catch around timingSafeEqual
let equal: boolean;
try {
  equal = timingSafeEqual(Buffer.from(expectedHash, "hex"), Buffer.from(hash, "hex"));
} catch {
  return null;
}
if (!equal) return null;
```

---

### Finding 2 — medium: Notify-bridge port 3849 missing from DOCKER-USER firewall rules

**File:** `scripts/firewall/docker-user-rules.sh:16`

```bash
HOST_PORTS=(3847 3848 22)   # 3849 is NOT here
```

The notify-bridge (`startNotifyBridge`) binds `Bun.serve({ port: 3849 })` with no `hostname` option, which means Bun defaults to `0.0.0.0` — all interfaces. The DOCKER-USER chain drops guest traffic to ports 3847, 3848, and 22, but not 3849. The application-layer validation (IP prefix check + docker inspect) provides a second layer, but that validation relies on `(req as any).remoteAddress` falling back to the spoofable `x-forwarded-for` header when `remoteAddress` is unavailable. If `remoteAddress` is not exposed by Bun's fetch handler (it is not a standard Web API property and its availability depends on Bun internals), then the fallback is the header.

**Fix:** Add 3849 to `HOST_PORTS` in `docker-user-rules.sh`, and also bind the notify-bridge to the internal interface only:

```ts
Bun.serve({
  port: NOTIFY_BRIDGE_PORT,
  hostname: "127.0.0.1",  // or the specific bridge IP
  ...
})
```

---

### Finding 3 — medium: YuKassa webhook IP validation via spoofable header

**File:** `src/dashboard-server.ts:440–448`

```ts
const clientIp =
  req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
  req.headers.get("x-real-ip") ||
  "";
```

If the bot is directly internet-facing on port 3848 (no nginx in front), any caller can set `X-Forwarded-For: 185.71.76.1` and pass the IP allowlist. Even if nginx is in front and strips/overwrites the header, this is fragile — it depends on nginx configuration that is not in this repo. The endpoint then calls `handleYuKassaWebhook`, which grants subscription access to users.

**Fix:** If the bot is behind a single trusted reverse proxy, use `x-real-ip` only (not `x-forwarded-for`). If the bot is directly exposed, check `remoteAddress` and trust no headers. Add a note to the deployment runbook about proxy trust.

---

### Finding 4 — low: `DASHBOARD_ALLOW_MOCK` not documented

**File:** `src/dashboard-server.ts:624`, `.env.example`

`renderDashboard({ allowMock: process.env.DASHBOARD_ALLOW_MOCK === "1" })` — when set, any browser can append `?mock=1` to `/dashboard` and see a hardcoded mock payload (owner id `292228713`, `isAdmin: true`) without any authentication. This does not expose real user data, but it shows the owner's Telegram ID and reveals the admin dashboard structure to anyone.

The variable is absent from `.env.example`, increasing the risk that a developer forgets it is enabled in prod.

**Fix:** Add `DASHBOARD_ALLOW_MOCK=` (commented out, default `0`) to `.env.example`. Consider removing mock mode entirely from prod builds, or adding a compile-time flag instead of an env var.

---

### Finding 5 — low: Missing composite index `(user_id, ts)` in metering

**File:** `src/metering.ts:36–37`

```sql
CREATE INDEX IF NOT EXISTS idx_usage_user ON usage(user_id);
CREATE INDEX IF NOT EXISTS idx_usage_ts ON usage(ts);
```

`getUserTotals(userId, sinceTs)` runs `WHERE user_id = ? AND ts >= ?`. SQLite will use one of the two single-column indexes (most likely `idx_usage_user`), then apply a post-filter scan over that user's rows to check `ts`. As the table grows (all users, all models, all requests), this becomes a full scan of a user's rows for each dashboard load. With 10 active users and thousands of requests per day, a composite index `(user_id, ts)` would eliminate the scan.

**Fix:**

```sql
CREATE INDEX IF NOT EXISTS idx_usage_user_ts ON usage(user_id, ts);
```

The existing single-column indexes can remain for other queries.

---

### Finding 6 — low: `BOT_USERNAME` interpolated bare into JS string in subscribe page

**File:** `src/dashboard-server.ts:477,495`

```ts
const botUsername = process.env.BOT_USERNAME || "proboiAI_bot";
// ...
var tgDeep = "tg://resolve?domain=${botUsername}";
```

`botUsername` is embedded into the JS string literal without escaping. If `BOT_USERNAME` ever contains a double-quote or backslash (e.g. `foo"; alert(1); //`), it becomes an XSS. The same value is also used in `TG_URL` but that one goes through `JSON.stringify(TG_URL)` which is correct. The `tgDeep` string does not.

**Fix:**

```ts
var tgDeep = "tg://resolve?domain=" + ${JSON.stringify(botUsername)};
```

---

### Finding 7 — low: Rate-limiter state is in-memory, reset on restart

**File:** `src/security.ts:21`

```ts
private buckets = new Map<number, RateLimitBucket>();
```

The token-bucket state is not persisted. A bot restart (systemd restart, deploy) resets all buckets. An attacker who triggers a rate-limit block needs only wait for a restart cycle to try again. This is consistent with the stated design (owner-only, no guests), but worth documenting explicitly.

**Fix:** For the current scale (1 owner), this is acceptable. If rate-limiting becomes critical, persist the bucket state to the metering SQLite (`daily_counts` already exists) or use Redis. At minimum, document the behavior in code comments.

---

### Finding 8 — info: `auth_date` check order (correct, confirming)

**File:** `src/dashboard-server.ts:155,161`

The HMAC check fires first (lines 155–159), and `auth_date` is checked only after a valid signature is confirmed (line 167). This is the correct order — it prevents an attacker from replaying an old initData by first crafting a valid-looking HMAC bypass, then hitting the `auth_date` check. Order is correct.

---

### Finding 9 — info: Audit log token masking regex lower bound

**File:** `src/utils.ts:29`

```ts
/\d{8,12}:[A-Za-z0-9_-]{35}/g,   // Telegram bot token
```

Current Telegram bot token IDs are 10 digits (e.g. `8678975502:...`). The regex floor of 8 digits is fine today. The CLAUDE.md memo says to add this masking at "Этап 6" — it already exists in `utils.ts` but was presumably not there when the memo was written. Verify the memo is closed.

---

### Finding 10 — info: CORS is advisory, not a real gate

**File:** `src/dashboard-server.ts:189`

`Access-Control-Allow-Origin: https://web.telegram.org` is correct for the Telegram Mini App. However, CORS only restricts browser-initiated cross-origin requests; it does not block `curl`, scripts, or server-side calls. The real authorization is the HMAC-validated `initData`. This is the correct design — noting it to avoid future confusion about why CORS is not "enough."

---

## What is in order

- All SQL queries in `metering.ts` use parameterized statements. No SQL injection risk anywhere.
- `timingSafeEqual` is imported and used — no simple string comparison of HMAC output.
- `HMAC-SHA256("WebAppData", BOT_TOKEN)` as the secret key is per-spec.
- `entries.sort()` before building `dataCheckString` is correct (Telegram requires lexicographic sort).
- `user.id` type is checked (`typeof user.id !== "number"`) before use.
- `getContainerMetrics` uses `execFile` (not `exec`), so there is no shell injection from `userId`. The `containerName(userId)` function receives a `number` type from TypeScript, so no arbitrary string can flow into docker args.
- The vault path `/opt/vault/${userId}/` only accepts `userId` as `number | string` — the string branch is `parseInt`'d before use in `containerName`. However, the `vaultPath` uses `userId` directly (string form) in line 205. Since the `du` command receives it through `execFileAsync` args array (not a shell string), there is no injection risk.
- Dashboard HTML uses a client-side `esc()` helper that correctly escapes `<>&"'`. User-controlled strings (`label`, `model`) are passed through `esc()` before being set as `innerHTML`. Numbers (`fmt()`, `fmtCost()`) go through `Number()` before render.
- `/healthz` returns a trivial "OK" string — no sensitive data leakage. Not rate-limited, but DoS risk is minimal on a static-response endpoint.
- `getAllUsersTotals()` is a single aggregated GROUP BY query — performance is fine for O(10) users and the metering table at current scale.
- `BOT_TOKEN` is not logged in any `console.error` or `console.log` call. The Telegram API URL in `sendTelegramMessage` (line 705) uses `BOT_TOKEN` in the URL string, but that URL is only used for the outgoing fetch, not logged anywhere.
- The `maskSecrets` function in `utils.ts` correctly covers the Telegram token format, OpenRouter, and OpenAI key prefixes before writing to the audit log.
- `mock=1` flag is gated behind `ALLOW_MOCK` which is controlled server-side (`process.env.DASHBOARD_ALLOW_MOCK === "1"`). It does not expose real data — only hardcoded `MOCK_ME` / `MOCK_ADMIN` constants. Risk is information disclosure only, not a data leak.

---

## Architectural observations

1. **No request body size limit** on POST endpoints (`/api/me`, `/api/admin/all`, `/webhook/yukassa`). A caller can send a multi-megabyte JSON body, which Bun will buffer into memory before `req.json()` is called. Consider adding a `Content-Length` cap or using a streaming parser with a size guard. At current scale (localhost mini-app) this is theoretical, but worth addressing before going to more users.

2. **Notify-bridge (`src/dashboard-server.ts:717–792`)** is a good defense-in-depth design (IP prefix → docker inspect → allowlist → rate limit). The application-level controls are solid, but they should not be the primary (and potentially only) network-layer control. The DOCKER-USER chain should include port 3849 as a first line of defense (see Finding 2).

3. **`getAllUsersTotals()` N+1 pattern inside `handleApiAdminAll`**: for each user in `allTotals`, there is a separate `getUserTotals(t.userId, todayStart)` call (line 389). With 10 users this is 10 SQLite queries. Consider a single GROUP BY query with a CASE/FILTER for today vs. all-time, or a separate CTE.

4. **`remoteAddress` on Bun's `Request` object**: The code uses `(req as any).remoteAddress` — typed as `any` because this is not a standard Web API property. Bun does expose it through `server.requestIP(req)` in the fetch handler signature, not on the `Request` object itself. If `remoteAddress` is undefined, the notify-bridge falls back to `x-forwarded-for` for IP validation, which is spoofable. Verify that `req.remoteAddress` is actually populated in the deployed Bun version before trusting this path.
