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
import { getUserProfile, ALLOWED_USERS } from "./config";
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

import { renderLanding, renderHowToSetup } from "./templates/landing";
import { renderDashboard } from "./templates/user-dashboard";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const DASHBOARD_PORT = parseInt(process.env.DASHBOARD_PORT || "3848", 10);
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const OWNER_ID = 292228713;

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
  });
}

async function handleApiAdminAll(req: Request): Promise<Response> {
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

  const users = allTotals.map((t) => {
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

  return jsonOk({ ok: true, users, host, aggregate });
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
}
