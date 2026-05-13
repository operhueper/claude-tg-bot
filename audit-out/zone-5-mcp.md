# Zone 5 — MCP integrations

Auditor: independent static analysis, 2026-05-13.
Scope: all seven MCP servers + composio.ts + mcp-filter.ts + streaming.ts + callback.ts.

---

## Summary

Fourteen check categories investigated. Found 1 medium, 3 low, 1 smell, 0 critical/high.
The main architecture (userId-scoped drop-box filenames + chat_id filtering + realpathSync + isPathAllowedFor) is sound. The most actionable finding is the shared `/tmp/pollinations/` directory — images from any user are accessible to any other user via `send_file`. The other findings are edge-case or informational.

---

## Findings (таблица)

| # | Title | Severity | File(s) |
|---|-------|----------|---------|
| F1 | `/tmp/pollinations/` and `/tmp/openrouter_images/` are TEMP_PATHS — world-accessible to all users via `send_file` | Medium | `src/security.ts` (TEMP_PATHS), `send_file_mcp/server.ts`, `src/handlers/streaming.ts` |
| F2 | `checkPendingAskUserRequests` called without `userId` in `session.ts` — falls back to broad glob `ask-user-*.json` | Low | `src/session.ts:963`, `src/handlers/streaming.ts:50-97` |
| F3 | `parallel_mcp` subtasks accept arbitrary `task.cwd` — not validated against `allowedPaths` | Low | `parallel_mcp/server.ts:162-173` |
| F4 | Drop-box files for `ask-user` have no TTL — stale files accumulate if user never taps | Low | `ask_user_mcp/server.ts`, `src/handlers/streaming.ts` |
| F5 | `mcp-config.example.ts` has `ask-user` / `send-file` commented out; prod `mcp-config.ts` has them active — divergence is undocumented | Smell | `mcp-config.example.ts`, `mcp-config.ts` |

---

## Detailed findings

### F1 — Cross-user image access via TEMP_PATHS (Medium)

**Confirmed by code.**

`src/config.ts` defines `TEMP_PATHS`:
```
"/tmp/pollinations/",
"/tmp/openrouter_images/",
```

`src/security.ts:isPathAllowedFor` unconditionally returns `true` for any path that starts with a TEMP_PATHS entry, regardless of which user's profile is checked:
```ts
for (const tempPath of TEMP_PATHS) {
  if (resolved.startsWith(tempPath)) {
    return true;  // no userId check
  }
}
```

`pollinations_mcp/server.ts` saves images as:
```
/tmp/pollinations/pollinations-{timestamp}-{8char-uuid}.png
```
`openrouter_image_mcp/server.ts` saves as:
```
/tmp/openrouter_images/openrouter-{timestamp}-{8char-uuid}.{ext}
```

Neither directory is per-user-namespaced. `checkPendingSendFileRequests` in `streaming.ts` calls `realpathSync` and then `isPathAllowedFor(realFilePath, sendProfile.allowedPaths)` — but since `/tmp/pollinations/` is always allowed by TEMP_PATHS, a guest can call `mcp__send-file` with any path in that directory and get it delivered.

**Attack scenario:** guestA asks the model to send `/tmp/pollinations/pollinations-<timestamp>-<uuid>.png`. The filename includes `crypto.randomUUID().slice(0, 8)` (8 hex chars = ~4 billion possibilities), so blind guessing is impractical. However, if guestA can observe file listing via `ls /tmp/pollinations/` (possible via `mcp__container__Bash` or the SDK Bash tool within allowed paths — `/tmp/pollinations/` is in TEMP_PATHS and therefore accessible), the attack becomes trivial.

**Guests with `containerEnabled`** have `mcp__container__Bash` pointing at their Docker sandbox. The sandbox bind-mounts `/opt/vault/{userId}` but does **not** bind-mount `/tmp/pollinations/`. So container-guests cannot `ls /tmp/pollinations/` from inside the container. Owner and non-container guests run the SDK Bash tool on the host — and `additionalDirectories` in the SDK includes `allowedPaths` + TEMP_PATHS (`/tmp/telegram-bot/`). Whether the host SDK Bash can `ls /tmp/pollinations/` depends on whether the SDK enforces `additionalDirectories` at the filesystem level or only via prompt.

**Recommendation:** Namespace image output directories per user: `/tmp/pollinations/{userId}/` and `/tmp/openrouter_images/{userId}/`. Alternatively, remove these dirs from TEMP_PATHS and add them to each user's `allowedPaths` explicitly (with per-user prefix).

---

### F2 — `checkPendingAskUserRequests` called without `userId` (Low)

**Confirmed by code.**

`src/session.ts:963-966`:
```ts
const buttonsSent = await checkPendingAskUserRequests(
  ctx,
  chatId
  // userId NOT passed
);
```

`streaming.ts:57`: when `userId` is absent, `pattern = "ask-user-*.json"` — matches all users' drop-box files.

**Mitigation already present:** the function also checks `data.chat_id !== chatId` (line 70) and `data.user_id !== userId` (line 73). In Telegram private chats, `chatId === userId`, so a different user's drop-box file would be filtered by the chat_id check. This prevents actual wrong-delivery in practice.

**Residual risk:** in group chats (if the bot ever operated in one), or if a user tampers with `chat_id` in the drop-box JSON before the bot reads it (the MCP subprocess controls the JSON content — but it runs as the bot process, so tampering would require process-level compromise).

**Recommendation:** Pass `this.profile.userId` as the third argument to `checkPendingAskUserRequests` in `session.ts`. The fix is one line.

---

### F3 — `parallel_mcp` subtask `cwd` not validated against `allowedPaths` (Low)

**Confirmed by code.**

`parallel_mcp/server.ts:162-173`:
```ts
const taskCwd = task.cwd ?? rootCwd;
// ...
queryInstance = query({
  prompt: task.prompt,
  options: {
    cwd: taskCwd,  // no allowedPaths validation
    additionalDirectories: allowedPaths,  // correctly passed
  }
})
```

The model can set `task.cwd` to any absolute path (e.g., `/etc`, `/root`). The `cwd` option sets the working directory for the Claude CLI subprocess and affects relative path resolution and the SDK's notion of "project root." It does **not** grant file read/write access beyond `additionalDirectories`.

**Whether this is exploitable** depends on Claude CLI's enforcement: if the SDK uses `cwd` as an implicit allowed path, a guest could escape the vault by setting `task.cwd=/etc`. Based on the SDK docs, `additionalDirectories` is the primary access control — `cwd` is informational for relative paths. This should be confirmed empirically.

**Recommendation:** Clamp `taskCwd` to a path within `allowedPaths` before passing to `query()`, or strip the `cwd` field from guest subtask inputs.

---

### F4 — `ask-user` drop-box files have no TTL (Low)

**Confirmed by code.**

When the model calls `mcp__ask-user__ask_user`, `ask_user_mcp/server.ts` writes `/tmp/ask-user-{userId}-{uuid}.json` with `status: "pending"`. The bot detects this, sends Telegram buttons, updates the file to `status: "sent"`, and breaks the query loop.

If the user never taps a button:
- The query loop has exited (session is no longer running).
- The drop-box file remains on disk indefinitely.
- No background cleanup exists.

This is a resource leak. On a busy server with many ask-user calls and non-responsive users, `/tmp` accumulates stale JSON files. No security impact unless `/tmp` fills and causes disk exhaustion (unlikely at this scale).

**Recommendation:** Add a periodic cleanup (e.g., `setInterval` in `index.ts`) that deletes `/tmp/ask-user-*.json` files older than 1 hour. Same applies to `send-file` and `connect-google` drop-boxes.

---

### F5 — `mcp-config.example.ts` vs `mcp-config.ts` divergence (Smell)

**Confirmed by code.**

`mcp-config.example.ts` has `ask-user` and `send-file` commented out. The production `mcp-config.ts` has them active. This means a fresh host bootstrapped by CI (`cp mcp-config.example.ts mcp-config.ts`) will **not** have `ask-user` and `send-file` enabled — Claude will call the tools and get "tool not found" errors.

The CI `deploy.yml` line 32 performs the copy only as fallback (`[ -f mcp-config.ts ] || cp mcp-config.example.ts mcp-config.ts`), so on the prod server with existing `mcp-config.ts` this doesn't trigger. But on a genuinely fresh host, the bot will start without these MCPs.

**Recommendation:** Either enable `ask-user` and `send-file` in `mcp-config.example.ts` (uncomment them), or add a CLAUDE.md note that the example only includes minimal config and production adds more.

---

## Что в порядке

1. **File-drop-box cross-user isolation:** Drop-box filenames include `userId` (`/tmp/ask-user-{userId}-{uuid}.json`). The bot globs only `ask-user-{userId}-*.json` when `userId` is provided, and applies defense-in-depth `chat_id` + `user_id` checks from the JSON content. No cross-user read in normal operation.

2. **send-file path validation:** `streaming.ts:checkPendingSendFileRequests` calls `realpathSync` (resolves symlinks) then `isPathAllowedFor` against the requesting user's profile. Symlink attacks are blocked. The validation fires on the real resolved path.

3. **openrouter-image owner-only enforcement:** `mcp-filter.ts:37` explicitly removes `openrouter-image` from the guest MCP map. Guest sessions never receive the `mcp__openrouter-image__*` tools. The `OPENROUTER_API_KEY` injected in `mcp-config.ts` for this server's env is never passed to guest processes.

4. **Composio user_id isolation:** `buildGoogleMcpUrl(profile.userId)` uses `profile.userId` which is the authenticated Telegram user ID, not a user-supplied value. The URL `?user_id=tg_{userId}` is constructed server-side. No injection risk.

5. **Guest deepseekEnv does not contain sensitive keys:** `buildGuestBaseEnv()` explicitly lists only `PATH, HOME, TMPDIR, TZ, LANG, LC_ALL, USER, LOGNAME`. `OPENAI_API_KEY`, `OPENROUTER_API_KEY`, and `COMPOSIO_API_KEY` are absent from guest `deepseekEnv`. The comment in `config.ts:952-953` explicitly documents this.

6. **parallel_mcp recursion prevention:** `mcp__parallel__run` is always in `childDisallowedTools` (enforced by `Set` dedup). Infinite parallel recursion is blocked.

7. **parallel_mcp guest sandbox constraints:** `TELEGRAM_PARALLEL_IS_GUEST`, `TELEGRAM_PARALLEL_ALLOWED_PATHS`, `TELEGRAM_PARALLEL_DISALLOWED_TOOLS`, and `TELEGRAM_PARALLEL_SETTINGS_SOURCES` are all propagated correctly from the parent session env. Guest subtasks receive a restrictive system prompt listing allowed directories.

8. **connect-google userId scoping:** `connect-google` drop-box filename includes userId. `checkPendingConnectGoogleRequests` globs `connect-google-{userId}-*.json` and applies `chat_id` + `user_id` checks. No cross-user OAuth initiation.

9. **OAuth redirect URL:** Composio manages the OAuth flow. The redirect URL comes from Composio's `POST /api/v3/connected_accounts` response. No state parameter is needed on this side — Composio handles the OAuth state internally. No token leak risk in the bot-side flow.

10. **mcp-config.ts missing on fresh host:** CI `deploy.yml:32` fallback copies `mcp-config.example.ts` → `mcp-config.ts` if absent, preventing a crash-on-import.

11. **MCP tool name conflict (`mcp__container__Bash`):** The `container` MCP is built in-process via `createSdkMcpServer` and given name `"container"`. The SDK surfaces it as `mcp__container__Bash`. No external MCP server named `container` is registered in `mcp-config.ts`. No naming conflict exists today, but a future MCP with that name would shadow the in-process one. Low risk, worth documenting.

12. **requestId path traversal prevention:** `callback.ts:203` validates `requestId` against `/^[a-zA-Z0-9_-]{8,64}$/` before constructing the drop-box file path. Path traversal via crafted callback data is blocked.

---

## Архитектурные замечания

**File-drop-box pattern:** The write-then-poll pattern between MCP subprocess and bot main process has an inherent TOCTOU window (~200ms). On the production server, all code runs as the same OS user (`root`), so a race condition would require a compromised co-process — not a realistic guest threat. If the bot ever runs under a non-root user with guests having host shell access, this window becomes relevant.

**TEMP_PATHS design:** The current design (shared `/tmp/pollinations/` for all users) was likely chosen for simplicity. As the guest count grows, per-user namespacing becomes important both for isolation and for cleanup. Consider `/tmp/mcp/{userId}/pollinations/` as a future structure.

**parallel_mcp and file system access:** Parallel subtasks run via `query()` without an explicit `mcpServers` list — they inherit the Claude CLI's default tools (Bash, Read, Write, etc.) restricted by `additionalDirectories`. The parallel server does not disable dangerous built-in tools beyond `mcp__parallel__run`. If a guest subtask gains write access to its vault (which is intended), it could use that to persist state. This is by design but worth noting.

**ask-user session lifetime:** After `askUserTriggered`, the session exits and the next user message starts a fresh query. There is no mechanism to resume the ask-user query in the same session context — the user's button tap becomes a new message. This is documented behavior but means Claude loses its in-progress reasoning state. Not a security issue, but a UX limitation.
