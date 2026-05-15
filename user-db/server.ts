/**
 * user-db/server.ts — Bun HTTP server for RF-DB Этап 1.
 *
 * Auth: every request (except /healthz) must carry X-Internal-Token header.
 * Port: PORT env (default 3900).
 * Data: DATA_DIR env (default /opt/user-db/data).
 */

import * as path from "path";
import { mkdirSync } from "fs";
import {
  getAllUsers,
  getUser,
  saveUser,
  patchUser,
  deleteUser as deleteUserRecord,
  type UserNode,
} from "./users.ts";
import {
  recordUsage,
  getUserTotals,
  getAllUsersTotals,
  getVisionUsageToday,
  incrementVisionUsage,
  hasConsented,
  recordConsent,
  revokeConsent,
  getConsentInfo,
  type UsageRecord,
} from "./metering.ts";

const PORT = parseInt(process.env.PORT || "3900", 10);
const DATA_DIR = process.env.DATA_DIR || "/opt/user-db/data";
const INTERNAL_TOKEN = process.env.INTERNAL_TOKEN || "";

// Ensure data directory exists
try {
  mkdirSync(DATA_DIR, { recursive: true });
} catch (_e) {
  // already exists
}

if (!INTERNAL_TOKEN) {
  console.warn("[user-db] WARNING: INTERNAL_TOKEN is not set — server will reject all authenticated requests.");
}

// ---------------------------------------------------------------------------
// Auth middleware
// ---------------------------------------------------------------------------

function checkAuth(req: Request): Response | null {
  const token = req.headers.get("x-internal-token");
  if (!INTERNAL_TOKEN || token !== INTERNAL_TOKEN) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  return null;
}

// ---------------------------------------------------------------------------
// Response helpers
// ---------------------------------------------------------------------------

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function notFound(): Response {
  return json({ error: "Not found" }, 404);
}

function badRequest(msg: string): Response {
  return json({ error: msg }, 400);
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

async function handle(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const pathname = url.pathname;
  const method = req.method;

  // Health check — no auth required
  if (method === "GET" && pathname === "/healthz") {
    return new Response("OK", { status: 200 });
  }

  // All other routes require auth
  const authErr = checkAuth(req);
  if (authErr) return authErr;

  // ---- /users ----
  if (pathname === "/users") {
    if (method === "GET") {
      return json({ users: getAllUsers() });
    }
    if (method === "POST") {
      let body: Partial<UserNode>;
      try { body = await req.json() as Partial<UserNode>; } catch { return badRequest("Invalid JSON"); }
      if (!body.userId) return badRequest("userId is required");
      const node = saveUser(body as UserNode);
      return json({ user: node }, 201);
    }
  }

  // ---- /users/:id ----
  const usersMatch = pathname.match(/^\/users\/(\d+)$/);
  if (usersMatch) {
    const userId = parseInt(usersMatch[1]!, 10);
    if (method === "GET") {
      const user = getUser(userId);
      if (!user) return notFound();
      return json({ user });
    }
    if (method === "PUT") {
      let body: Partial<UserNode>;
      try { body = await req.json() as Partial<UserNode>; } catch { return badRequest("Invalid JSON"); }
      const updated = patchUser(userId, body);
      if (!updated) return notFound();
      return json({ user: updated });
    }
    if (method === "DELETE") {
      const deleted = deleteUserRecord(userId);
      if (!deleted) return notFound();
      return new Response(null, { status: 204 });
    }
  }

  // ---- /metering/record ----
  if (pathname === "/metering/record" && method === "POST") {
    let body: Partial<UsageRecord & { userId: number | string }>;
    try { body = await req.json() as Partial<UsageRecord & { userId: number | string }>; } catch { return badRequest("Invalid JSON"); }
    if (!body.userId || !body.model || !body.source) {
      return badRequest("userId, model, source are required");
    }
    recordUsage({
      userId: body.userId,
      model: body.model!,
      source: body.source as UsageRecord["source"],
      inputTokens: body.inputTokens ?? 0,
      outputTokens: body.outputTokens ?? 0,
      cacheReadTokens: body.cacheReadTokens,
      cacheCreationTokens: body.cacheCreationTokens,
      requestId: body.requestId,
    });
    return json({ ok: true });
  }

  // ---- /metering/all ----
  if (pathname === "/metering/all" && method === "GET") {
    return json({ byUser: getAllUsersTotals() });
  }

  // ---- /metering/:id ----
  const meteringMatch = pathname.match(/^\/metering\/(\d+)$/);
  if (meteringMatch) {
    const userId = parseInt(meteringMatch[1]!, 10);
    if (method === "GET") {
      const sinceTs = url.searchParams.get("sinceTs") ? Number(url.searchParams.get("sinceTs")) : undefined;
      const totals = getUserTotals(userId, sinceTs);
      return json({ totals });
    }
  }

  // ---- /vision/increment ----
  if (pathname === "/vision/increment" && method === "POST") {
    let body: { userId?: number | string };
    try { body = await req.json() as { userId?: number | string }; } catch { return badRequest("Invalid JSON"); }
    if (!body.userId) return badRequest("userId is required");
    incrementVisionUsage(body.userId);
    return json({ ok: true });
  }

  // ---- /vision/today/:id ----
  const visionMatch = pathname.match(/^\/vision\/today\/(\d+)$/);
  if (visionMatch) {
    const userId = parseInt(visionMatch[1]!, 10);
    if (method === "GET") {
      return json({ count: getVisionUsageToday(userId) });
    }
  }

  // ---- /consent/:id ----
  const consentMatch = pathname.match(/^\/consent\/(\d+)$/);
  if (consentMatch) {
    const userId = parseInt(consentMatch[1]!, 10);
    if (method === "GET") {
      const info = getConsentInfo(userId);
      if (!info) return json({ hasConsent: false });
      return json({ hasConsent: true, version: info.version, ts: info.acceptedAt });
    }
    if (method === "POST") {
      let body: { version?: string };
      try { body = await req.json() as { version?: string }; } catch { return badRequest("Invalid JSON"); }
      if (!body.version) return badRequest("version is required");
      recordConsent(userId, body.version);
      return json({ ok: true });
    }
    if (method === "DELETE") {
      revokeConsent(userId);
      return json({ ok: true });
    }
  }

  return notFound();
}

// ---------------------------------------------------------------------------
// Start server
// ---------------------------------------------------------------------------

const server = Bun.serve({
  port: PORT,
  fetch: handle,
});

console.log(`[user-db] Listening on port ${PORT}, data dir: ${DATA_DIR}`);
console.log(`[user-db] Auth: ${INTERNAL_TOKEN ? "enabled" : "DISABLED — set INTERNAL_TOKEN"}`);

export { server };
