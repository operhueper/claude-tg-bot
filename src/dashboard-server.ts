/**
 * Dashboard HTTP server.
 *
 * Runs on DASHBOARD_PORT (default 3848).
 * Serves HTML pages and JSON API endpoints consumed by the Telegram Mini App.
 *
 * Routes:
 *   GET  /            → landing page HTML
 *   GET  /dashboard   → user dashboard HTML
 *   POST /api/me      → current user data (requires valid Telegram initData)
 *   POST /api/admin/all → all-users data (owner only)
 *   GET  /healthz     → 200 OK
 *   *                 → 404
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import { getUserProfile, ALLOWED_USERS, OWNER_USER_ID as OWNER_ID } from "./config";
import {
  getUserTotals,
  getAllUsersTotals,
  moscowDayStartUtcSeconds,
} from "./metering";
import {
  getContainerMetrics,
  getAllContainerMetrics,
  getHostMetrics,
  getGuestsAggregate,
} from "./containers/metrics";
import { getTodayCount, resetIfNewDay, nextResetAt } from "./daily-limit";
import { getUserSubscriptionExpiry, handleYuKassaWebhook } from "./payments.js";

import { renderLanding, renderHowToSetup } from "./templates/landing";
import { renderDashboard } from "./templates/user-dashboard";
import { renderOferta } from "./templates/oferta";
import { renderPrivacy } from "./templates/privacy";
import type { YuKassaWebhookEvent } from "./types.js";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const DASHBOARD_PORT = parseInt(process.env.DASHBOARD_PORT || "3848", 10);
const NOTIFY_BRIDGE_PORT = parseInt(process.env.NOTIFY_BRIDGE_PORT || "3849", 10);
const GUEST_SUBNET_PREFIX = process.env.GUEST_SUBNET_PREFIX || "172.18.";
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";

// Allowed users cache for notify-bridge validation
let _allowedUsers: Set<number> | null = null;
function getAllowedUsers(): Set<number> {
  if (!_allowedUsers) {
    _allowedUsers = new Set(ALLOWED_USERS);
  }
  return _allowedUsers;
}

// ---------------------------------------------------------------------------
// Bot reference (set by index.ts after bot is created)
// ---------------------------------------------------------------------------

import type { Bot } from "grammy";

let _bot: Bot | null = null;

export function registerDashboardBot(b: Bot): void {
  _bot = b;
}

// ---------------------------------------------------------------------------
// YuKassa IP allowlist
// ---------------------------------------------------------------------------

const YUKASSA_IPS = [
  "185.71.76.0/27",
  "185.71.77.0/27",
  "77.75.153.0/25",
  "77.75.154.128/25",
  "77.75.156.11/32",
  "77.75.156.35/32",
];

function ipInCidr(ip: string, cidr: string): boolean {
  const octets = ip.split(".");
  if (octets.length !== 4 || octets.some(o => !/^\d{1,3}$/.test(o) || Number(o) > 255)) return false;
  const slashIdx = cidr.indexOf("/");
  const range = cidr.slice(0, slashIdx);
  const bits = Number(cidr.slice(slashIdx + 1));
  const mask = (~((1 << (32 - bits)) - 1)) >>> 0;
  const ipNum = octets.reduce((acc, oct) => (acc * 256 + Number(oct)) >>> 0, 0);
  const rangeNum = range.split(".").reduce((acc, oct) => (acc * 256 + Number(oct)) >>> 0, 0);
  return (ipNum & mask) === (rangeNum & mask);
}

function isYuKassaIp(ip: string): boolean {
  return YUKASSA_IPS.some((cidr) => ipInCidr(ip, cidr));
}

// ---------------------------------------------------------------------------
// Telegram initData validation
// https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
// ---------------------------------------------------------------------------

interface TelegramUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
}

interface ValidatedInitData {
  user: TelegramUser;
}

/**
 * Validates Telegram Web App initData string.
 * Returns parsed user on success, null on failure.
 */
function validateInitData(initData: string): ValidatedInitData | null {
  if (!initData || !BOT_TOKEN) return null;

  let params: URLSearchParams;
  try {
    params = new URLSearchParams(initData);
  } catch {
    return null;
  }

  const hash = params.get("hash");
  if (!hash) return null;

  // Build data_check_string: all fields except hash, sorted by key, joined with \n
  const entries: string[] = [];
  for (const [key, value] of params.entries()) {
    if (key !== "hash") {
      entries.push(`${key}=${value}`);
    }
  }
  entries.sort();
  const dataCheckString = entries.join("\n");

  // secret_key = HMAC-SHA256("WebAppData", BOT_TOKEN)
  const secretKey = createHmac("sha256", "WebAppData")
    .update(BOT_TOKEN)
    .digest();

  // expected_hash = HEX(HMAC-SHA256(secret_key, data_check_string))
  const expectedHash = createHmac("sha256", secretKey)
    .update(dataCheckString)
    .digest("hex");

  if (expectedHash.length !== hash.length) return null;
  const equal = timingSafeEqual(
    Buffer.from(expectedHash, "hex"),
    Buffer.from(hash, "hex")
  );
  if (!equal) return null;

  // Check auth_date is not older than 24 hours
  const authDateStr = params.get("auth_date");
  if (!authDateStr) return null;
  const authDate = parseInt(authDateStr, 10);
  if (isNaN(authDate)) return null;
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (nowSeconds - authDate > 86400) return null;

  // Parse user field
  const userStr = params.get("user");
  if (!userStr) return null;
  let user: TelegramUser;
  try {
    user = JSON.parse(userStr) as TelegramUser;
  } catch {
    return null;
  }
  if (!user.id || typeof user.id !== "number") return null;

  return { user };
}

// ---------------------------------------------------------------------------
// Response helpers
// ---------------------------------------------------------------------------

const JSON_HEADERS_BASE = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "https://web.telegram.org",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function jsonOk(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: JSON_HEADERS_BASE,
  });
}

function jsonErr(
  error: string,
  status: number
): Response {
  return new Response(JSON.stringify({ ok: false, error }), {
    status,
    headers: JSON_HEADERS_BASE,
  });
}

function htmlResponse(html: string, status = 200): Response {
  return new Response(html, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

// ---------------------------------------------------------------------------
// Landing page assets (CSS / JS)
// ---------------------------------------------------------------------------

const ASSET_DIR = new URL("./templates/assets/", import.meta.url);

const ASSET_CONTENT_TYPES: Record<string, string> = {
  css: "text/css; charset=utf-8",
  js: "application/javascript; charset=utf-8",
};

async function assetResponse(filename: string): Promise<Response> {
  // Whitelist: only specific files in templates/assets/ are servable.
  const allowed = new Set([
    "landing.css",
    "landing-blocks.css",
    "landing-visuals.js",
  ]);
  if (!allowed.has(filename)) {
    return new Response("Not Found", { status: 404 });
  }

  const ext = filename.slice(filename.lastIndexOf(".") + 1);
  const contentType =
    ASSET_CONTENT_TYPES[ext] || "application/octet-stream";

  const file = Bun.file(new URL(filename, ASSET_DIR));
  if (!(await file.exists())) {
    return new Response("Not Found", { status: 404 });
  }

  return new Response(file, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=300",
    },
  });
}

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------

async function handleApiMe(req: Request): Promise<Response> {
  let body: { initData?: unknown };
  try {
    const parsed = await req.json();
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return jsonErr("bad_request", 400);
    }
    body = parsed as { initData?: unknown };
  } catch {
    return jsonErr("bad_request", 400);
  }

  if (typeof body.initData !== "string") {
    return jsonErr("bad_request", 400);
  }

  const validated = validateInitData(body.initData);
  if (!validated) {
    return jsonErr("unauthorized", 401);
  }

  const userId = validated.user.id;

  if (!ALLOWED_USERS.includes(userId)) {
    return jsonErr("forbidden", 403);
  }

  const profile = getUserProfile(userId);
  const today = getUserTotals(userId, moscowDayStartUtcSeconds());
  const container = await getContainerMetrics(userId);

  const role: "owner" | "guest" =
    profile.isOwner ? "owner" : "guest";

  // Daily message data for free-tier
  resetIfNewDay(userId);
  const dailyUsed = getTodayCount(userId);
  const dailyLimit = profile.tierConfig.dailyMessageLimit;
  const dailyResetAt = nextResetAt();

  // Subscription expiry
  const subExpiry = getUserSubscriptionExpiry(userId);

  return jsonOk({
    ok: true,
    user: {
      id: userId,
      label: profile.label || "",
      role,
      model: profile.model,
      publicUrl: `https://proboi.site/u/${userId}/`,
    },
    today: {
      inputTokens: today.inputTokens,
      outputTokens: today.outputTokens,
      cacheReadTokens: today.cacheReadTokens,
      cacheCreationTokens: today.cacheCreationTokens,
    },
    container: {
      exists: container.containerExists,
      running: container.containerRunning,
      ram: container.ram,
      cpu: container.cpu,
      disk: container.disk,
    },
    isAdmin: userId === OWNER_ID,
    tier: profile.tier,
    dailyUsed,
    dailyLimit,
    dailyResetAt,
    subscriptionExpires: subExpiry ? subExpiry.toISOString() : null,
  });
}

async function handleApiAdminAll(req: Request): Promise<Response> {
  let body: { initData?: unknown; cursor?: unknown; limit?: unknown };
  try {
    const parsed = await req.json();
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return jsonErr("bad_request", 400);
    }
    body = parsed as { initData?: unknown; cursor?: unknown; limit?: unknown };
  } catch {
    return jsonErr("bad_request", 400);
  }

  if (typeof body.initData !== "string") {
    return jsonErr("bad_request", 400);
  }

  const validated = validateInitData(body.initData);
  if (!validated) {
    return jsonErr("unauthorized", 401);
  }

  if (validated.user.id !== OWNER_ID) {
    return jsonErr("forbidden", 403);
  }

  const allTotals = getAllUsersTotals();
  const [allContainers, host] = await Promise.all([
    getAllContainerMetrics(),
    getHostMetrics(),
  ]);
  const aggregate = getGuestsAggregate(allContainers);
  const todayStart = moscowDayStartUtcSeconds();

  const containerByUserId = new Map<string, (typeof allContainers)[number]>();
  for (const c of allContainers) {
    containerByUserId.set(String(c.userId), c);
  }

  const allUsers = allTotals
    .slice()
    .sort((a, b) => Number(a.userId) - Number(b.userId))
    .map((t) => {
      let label = `user-${t.userId}`;
      let model = "";
      try {
        const uid = parseInt(t.userId, 10);
        if (!isNaN(uid) && ALLOWED_USERS.includes(uid)) {
          const p = getUserProfile(uid);
          label = p.label || label;
          model = p.model || "";
        }
      } catch {}

      const today = getUserTotals(t.userId, todayStart);
      const c = containerByUserId.get(t.userId);
      return {
        userId: t.userId,
        label,
        model,
        total: {
          inputTokens: t.inputTokens,
          outputTokens: t.outputTokens,
          cacheReadTokens: t.cacheReadTokens,
          cacheCreationTokens: t.cacheCreationTokens,
          costUsd: t.costUsd,
        },
        today: {
          inputTokens: today.inputTokens,
          outputTokens: today.outputTokens,
          cacheReadTokens: today.cacheReadTokens,
          cacheCreationTokens: today.cacheCreationTokens,
        },
        container: c
          ? {
              exists: c.containerExists,
              running: c.containerRunning,
              ram: c.ram,
              cpu: c.cpu,
              disk: c.disk,
            }
          : null,
      };
    });

  // Cursor-based pagination
  const limit = Math.min(
    typeof body.limit === "number" && body.limit > 0 ? Math.floor(body.limit) : 50,
    200
  );
  const cursor = typeof body.cursor === "string" ? body.cursor : undefined;
  const startIdx = cursor
    ? allUsers.findIndex((u) => u.userId === cursor) + 1
    : 0;
  const page = allUsers.slice(startIdx, startIdx + limit);
  const lastItem = page.length === limit ? page[page.length - 1] : undefined;
  const nextCursor = lastItem?.userId;

  return jsonOk({ ok: true, users: page, nextCursor, host, aggregate });
}

// ---------------------------------------------------------------------------
// YuKassa webhook handler
// ---------------------------------------------------------------------------

async function handleYuKassaWebhookRoute(req: Request): Promise<Response> {
  // IP check (enabled by default; disable with YUKASSA_IP_CHECK=false in env)
  if (process.env.YUKASSA_IP_CHECK !== "false") {
    const clientIp =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      "";
    if (clientIp && !isYuKassaIp(clientIp)) {
      console.warn(`[yukassa-webhook] rejected IP: ${clientIp}`);
      return new Response("Forbidden", { status: 403 });
    }
  }

  let event: YuKassaWebhookEvent;
  try {
    event = await req.json() as YuKassaWebhookEvent;
  } catch (err) {
    console.error("[yukassa-webhook] failed to parse body:", err);
    return new Response("OK", { status: 200 });
  }

  try {
    await handleYuKassaWebhook(event, _bot);
  } catch (err) {
    console.error("[yukassa-webhook] handler error:", err);
  }

  return new Response("OK", { status: 200 });
}

// ---------------------------------------------------------------------------
// Subscribe redirect page
// ---------------------------------------------------------------------------

function handleSubscribePage(req: Request): Response {
  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  const botUsername = process.env.BOT_USERNAME || "proboiAI_bot";
  const TG_URL = `https://t.me/${botUsername}`;

  let heading: string;
  let body: string;
  const isSuccess = status === "success";

  if (isSuccess) {
    heading = "Карта привязана!";
    body = "Возвращайтесь в бот — там уже всё активировано.";
  } else {
    heading = "Оплата отменена.";
    body = "Вы всегда можете вернуться.";
  }

  // Auto-redirect only on success, after 3 seconds
  const autoRedirectScript = isSuccess ? `
<script>
  var tgDeep = "tg://resolve?domain=${botUsername}";
  var tgWeb  = ${JSON.stringify(TG_URL)};
  var countdown = 3;
  var el = document.getElementById("countdown");
  function tick() {
    if (countdown <= 0) {
      window.location.href = tgDeep;
      setTimeout(function(){ window.location.href = tgWeb; }, 500);
      return;
    }
    if (el) el.textContent = countdown + "…";
    countdown--;
    setTimeout(tick, 1000);
  }
  tick();
</script>` : "";

  const countdownHtml = isSuccess
    ? `<p class="countdown">Открываю бот через <span id="countdown">3…</span></p>`
    : "";

  const html = `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${heading} — Proboi</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  :root {
    --c-bg: #0E0D0B;
    --c-surface: #1A1916;
    --c-border: #2A2825;
    --c-text: #F0EDE6;
    --c-text-muted: #8A8680;
    --c-accent: #FF7A48;
    --font-body: 'Onest', sans-serif;
  }
  body {
    background: var(--c-bg);
    color: var(--c-text);
    font-family: var(--font-body), sans-serif;
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
  }
  .card {
    background: var(--c-surface);
    border: 1px solid var(--c-border);
    border-radius: 16px;
    padding: 40px 32px;
    max-width: 420px;
    width: 100%;
    text-align: center;
  }
  h1 { font-size: 22px; font-weight: 700; margin-bottom: 12px; }
  p { color: var(--c-text-muted); font-size: 15px; line-height: 1.6; margin-bottom: 16px; }
  .countdown { font-size: 13px; margin-bottom: 24px; }
  .btn {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    background: var(--c-accent);
    color: #14130F;
    font-weight: 600;
    font-size: 15px;
    padding: 12px 24px;
    border-radius: 10px;
    text-decoration: none;
    transition: opacity .15s;
  }
  .btn:hover { opacity: .85; }
</style>
</head>
<body>
<div class="card">
  <h1>${heading}</h1>
  <p>${body}</p>
  ${countdownHtml}
  <a class="btn" href="${TG_URL}">Открыть бот</a>
</div>
${autoRedirectScript}
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

export function startDashboardServer(): void {
  Bun.serve({
    port: DASHBOARD_PORT,
    async fetch(req) {
      const url = new URL(req.url);
      const { pathname, method } = Object.assign(url, {
        method: req.method.toUpperCase(),
      });

      // CORS preflight for API routes
      if (method === "OPTIONS" && pathname.startsWith("/api/")) {
        return new Response(null, { status: 204, headers: JSON_HEADERS_BASE });
      }

      try {
        if (method === "GET" && pathname === "/") {
          return htmlResponse(renderLanding());
        }

        if (
          method === "GET" &&
          (pathname === "/how-to-setup.html" || pathname === "/how-to-setup")
        ) {
          return htmlResponse(renderHowToSetup());
        }

        if (method === "GET" && pathname.startsWith("/assets/")) {
          const filename = pathname.slice("/assets/".length);
          return await assetResponse(filename);
        }

        if (method === "GET" && pathname === "/dashboard") {
          return htmlResponse(renderDashboard({ allowMock: process.env.DASHBOARD_ALLOW_MOCK === "1" }));
        }

        if (method === "GET" && pathname === "/healthz") {
          return new Response("OK", { status: 200 });
        }

        if (method === "POST" && pathname === "/api/me") {
          return await handleApiMe(req);
        }

        if (method === "POST" && pathname === "/api/admin/all") {
          return await handleApiAdminAll(req);
        }

        if (method === "POST" && pathname === "/webhook/yukassa") {
          return await handleYuKassaWebhookRoute(req);
        }

        if (method === "GET" && pathname === "/subscribe") {
          return handleSubscribePage(req);
        }

        if (method === "GET" && pathname === "/oferta") {
          return new Response(renderOferta(), {
            headers: { "Content-Type": "text/html; charset=utf-8" },
          });
        }

        if (method === "GET" && pathname === "/privacy") {
          return new Response(renderPrivacy(), {
            headers: { "Content-Type": "text/html; charset=utf-8" },
          });
        }

        return new Response("Not Found", { status: 404 });
      } catch (err) {
        console.error("[dashboard] Unhandled error:", err);
        return new Response(JSON.stringify({ ok: false, error: "internal" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }
    },
  });

  console.log(`Dashboard server listening on port ${DASHBOARD_PORT}`);

  startNotifyBridge();
}

// ---------------------------------------------------------------------------
// Notify bridge — internal HTTP endpoint for guest containers (port 3849)
//
// Guest scheduler POSTs { userId, message } here.
// Bridge validates source IP is in the guest subnet, userId is an allowed
// user, then forwards the message to Telegram via the bot token.
// iptables allows claude-guest-net → host:3849; public access is blocked.
// ---------------------------------------------------------------------------

interface NotifyPayload {
  userId: number;
  message: string;
}

// Per-userId rate limit: max 20 notifies per minute
const notifyCount = new Map<number, { count: number; resetAt: number }>();

function checkNotifyRateLimit(userId: number): boolean {
  const now = Date.now();
  const entry = notifyCount.get(userId);
  if (!entry || now >= entry.resetAt) {
    notifyCount.set(userId, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  if (entry.count >= 20) return false;
  entry.count++;
  return true;
}

async function sendTelegramMessage(userId: number, text: string): Promise<void> {
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: userId, text }),
  });
  if (!resp.ok) {
    const err = await resp.text().catch(() => "");
    console.error(`[notify-bridge] Telegram error for ${userId}: ${err}`);
  }
}

function startNotifyBridge(): void {
  Bun.serve({
    port: NOTIFY_BRIDGE_PORT,
    async fetch(req) {
      const url = new URL(req.url);

      if (req.method !== "POST" || url.pathname !== "/notify") {
        return new Response("Not Found", { status: 404 });
      }

      // Source IP validation — only accept from guest subnet
      const sourceIp = req.headers.get("x-forwarded-for") ||
        (req as any).remoteAddress ||
        "";
      if (!sourceIp.startsWith(GUEST_SUBNET_PREFIX)) {
        console.warn(`[notify-bridge] rejected source IP: ${sourceIp}`);
        return new Response("Forbidden", { status: 403 });
      }

      let body: NotifyPayload;
      try {
        body = await req.json() as NotifyPayload;
      } catch {
        return new Response("Bad Request", { status: 400 });
      }

      const { userId, message } = body;
      if (typeof userId !== "number" || typeof message !== "string") {
        return new Response("Bad Request", { status: 400 });
      }

      // Validate userId is a known allowed user
      if (!getAllowedUsers().has(userId)) {
        console.warn(`[notify-bridge] unknown userId: ${userId}`);
        return new Response("Forbidden", { status: 403 });
      }

      if (!checkNotifyRateLimit(userId)) {
        return new Response("Too Many Requests", { status: 429 });
      }

      const truncated = message.length > 4000 ? message.slice(0, 4000) + "…" : message;
      await sendTelegramMessage(userId, truncated).catch((e) => {
        console.error(`[notify-bridge] send error: ${e}`);
      });

      return new Response('{"ok":true}', {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    },
  });

  console.log(`Notify bridge listening on port ${NOTIFY_BRIDGE_PORT}`);
}
