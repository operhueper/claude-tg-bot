# MCP Servers Security Audit
Date: 2026-05-14
Scope: parallel_mcp, ask_user_mcp, send_file_mcp, connect_google_mcp, pollinations_mcp, openrouter_image_mcp, src/composio.ts, src/mcp-filter.ts, src/handlers/streaming.ts, src/containers/bash-mcp.ts

## Already closed (do not re-report)
Per VULNERABILITIES.md: send_file path check (realpathSync + isPathAllowedFor), parallel_mcp sandbox (TELEGRAM_PARALLEL_* env), cross-user dropbox (userId in filename + JSON check), Composio env leak (removed from guest env).

---

## NEW FINDINGS

### M-01. ask_user polling: userId not passed in streaming query path
**File:** `src/session.ts:1026-1028`
**Severity:** LOW (private chats only; chatId=userId in Telegram private chat)

`checkPendingAskUserRequests(ctx, chatId)` is called without the `userId` argument at the tool-intercept point (session.ts:1026). The function then falls back to the broad glob `ask-user-*.json` (streaming.ts:57) and skips the userId JSON body check (streaming.ts:73). Only `data.chat_id === chatId` is enforced.

In Telegram private chats `chatId === userId`, so the isolation holds. In any future group-chat or multi-user context this would allow cross-user button delivery.

Compare with send-file (line 1049) which correctly passes `this.profile.userId` — the ask-user call is inconsistent.

**Fix:** Pass `this.profile.userId` as third argument to `checkPendingAskUserRequests` at session.ts:1026.

---

### M-02. Session startup: checkPendingSendFileRequests without userId (legacy cleanup)
**File:** `src/session.ts:511`
**Severity:** LOW

At session start, `checkPendingSendFileRequests(ctx, chatId)` is called without `userId` (startup delivery cleanup path). The fallback glob `send-file-*.json` picks up ALL users' pending files, filtered only by `data.chat_id`. In private chats chatId uniquely identifies the user, so practical impact is nil — but the startup path is inconsistent with the in-query path (line 1052) which correctly passes `this.profile.userId`.

**Fix:** Pass the session userId to the startup call. Requires making userId available at that point in `sendMessageStreaming`.

---

### M-03. pollinations_mcp: shared /tmp/pollinations/ — cross-user image enumeration via Read tool
**File:** `pollinations_mcp/server.ts:21,141` + `src/config.ts:1309` + `src/session.ts:977-984`
**Severity:** MEDIUM

All images from all users land in one flat directory: `/tmp/pollinations/pollinations-${timestamp}-${uuid}.png`. The directory is world-readable (created with `mkdirSync` default 0755). No per-user subdirectory.

`TEMP_PATHS` in config.ts (line 1309) explicitly includes `/tmp/pollinations/`, and the `isTmpRead` exception (session.ts:977-984) allows the `Read` tool to access any file under TEMP_PATHS without consulting `profile.allowedPaths`. So any guest can use the `Read` tool to open another user's generated image if they know (or enumerate) the filename.

For free-tier guests (V-01 is open), Bash makes this trivial: `ls /tmp/pollinations/` + `cat`. For container-enabled paid guests: `Read` tool is available and `/tmp/pollinations/` is explicitly allowed by `isTmpRead`. Glob tool enumeration is not validated against `allowedPaths` in session.ts (no `if (["Glob"...` block), so the Claude CLI may also allow Glob over `/tmp/pollinations/`.

The same applies to `/tmp/openrouter_images/` for the owner-side tool.

No cleanup mechanism exists — images accumulate indefinitely, enlarging the exposure window.

**Fix options:**
1. Per-user subdirectory: `OUTPUT_DIR = /tmp/pollinations/${userId}/` (requires passing userId via env to MCP subprocess — analogous to `TELEGRAM_USER_ID`).
2. Remove `/tmp/pollinations/` and `/tmp/openrouter_images/` from `TEMP_PATHS`; add per-user subpath to each guest's `allowedPaths` instead.
3. Unlink the PNG file from `/tmp/pollinations/` after the file is delivered via `send_file_mcp` (follow the dropbox pattern: delete-after-deliver).

---

### M-04. parallel_mcp: task.cwd is model-controlled and not validated against allowedPaths
**File:** `parallel_mcp/server.ts:97-98,115,162,173`
**Severity:** LOW-MEDIUM

The `tasks[].cwd` and top-level `cwd` fields accepted from the model are passed directly to child `query()` as `cwd: taskCwd` without validation against the guest's `allowedPaths`. This shifts the subprocess's working directory to any path the model specifies (e.g. `/opt/claude-tg-bot`, `/root`, `/etc`).

The `additionalDirectories` restriction still applies to `Read/Write/Edit` operations. Bash is correctly disabled for container guests via `TELEGRAM_PARALLEL_DISALLOWED_TOOLS`. So file read/write cannot escape the vault for paid container guests.

However, for **free-tier guests** (V-01 open, Bash not in `disallowedTools`): a guest-controlled `task.cwd = "/opt/claude-tg-bot"` with `prompt: "cat .env"` would succeed in a subtask. This is a V-01 amplifier rather than a standalone issue.

For **paid container guests**: changing `cwd` to `/opt/claude-tg-bot` means relative-path Glob/Grep patterns in the subtask prompt resolve relative to the bot source directory. The Claude CLI may or may not enforce `additionalDirectories` for Glob/Grep (not visible from TypeScript-level code). Requires empirical verification.

**Fix:** Validate `task.cwd` against `allowedPaths` (from `TELEGRAM_PARALLEL_ALLOWED_PATHS`) before passing to query. Reject or clamp to vault root if outside.

```ts
// in parallel_mcp/server.ts, before: const taskCwd = task.cwd ?? rootCwd;
function isCwdAllowed(cwd: string, allowed: string[]): boolean {
  return allowed.some(p => cwd === p.replace(/\/$/, '') || cwd.startsWith(p));
}
const taskCwd = (task.cwd && allowedPaths && isCwdAllowed(task.cwd, allowedPaths))
  ? task.cwd
  : rootCwd;
```

---

### M-05. openrouter_image_mcp: owner-only guarantee is enforcement-by-omission, not explicit deny
**File:** `src/mcp-filter.ts:37`
**Severity:** LOW (informational)

`openrouter_image_mcp` is excluded from guests by `if (key === "openrouter-image") continue` in `mcpServersForProfile`. This means guests never have the tool surfaced. **The MCP server itself has no access check** — it relies entirely on the caller not offering the tool.

If someone adds a new code path that calls `mcpServersForProfile` differently, or if the MCP config is accidentally loaded for a guest session, the tool would execute and spend owner's OpenRouter budget.

**Fix:** Add a guard in `openrouter_image_mcp/server.ts` that checks `TELEGRAM_USER_ID` against a known owner ID, or checks that `OPENROUTER_API_KEY` is present and returns an error if the calling env matches a guest (e.g., presence of `TELEGRAM_PARALLEL_IS_GUEST=1`).

---

### M-06. send_file_mcp: isFile() check does not cover /proc or /dev special files
**File:** `send_file_mcp/server.ts:148`
**Severity:** LOW

`fileStat.isFile()` returns `true` for `/proc/self/mem`, `/dev/sda` and other character/block devices on Linux if read as a regular file via stat. This is because on Linux `/proc/*/fd/*` entries appear as regular files. An adversarial model on a non-container guest (free-tier, V-01) could ask to send `/proc/self/environ` or `/proc/1/cmdline`.

Mitigation: path validation in `streaming.ts:153` (`isPathAllowedFor`) would block `/proc/` since it's not in any guest's `allowedPaths`. But the check only runs AFTER the dropbox is written — meaning the send_file_mcp has already `statSync`'d the sensitive path and written a dropbox entry. No data is transmitted, but the path access is logged/visible.

**Fix:** Add `/proc/`, `/dev/`, `/sys/` to a blocklist in `send_file_mcp/server.ts` before `statSync`.

---

### M-07. connect_google_mcp: no authentication of Composio OAuth URL before rendering to user
**File:** `src/handlers/streaming.ts:235-243`
**Severity:** LOW (supply-chain / phishing surface)

`initiateGoogleConnections(userId)` fetches OAuth redirect URLs from Composio and renders them as inline-keyboard URL buttons to the user. The URLs are `data.redirect_url` from an external HTTPS API with no domain validation. If Composio's API is compromised or returns a malicious redirect URL (e.g. `javascript:` or a phishing page), the bot will faithfully render it as a tappable button.

Telegram's URL-button handler would reject `javascript:` but not a lookalike HTTPS URL.

**Fix:** Validate that `redirectUrl` starts with `https://` and is from a known Composio domain before adding to keyboard.

---

### M-08. Composio MCP tool description injection (supply-chain risk)
**File:** `src/mcp-filter.ts:53`, `src/composio.ts:37`
**Severity:** LOW (external dependency)

The Composio Google Workspace MCP is an HTTP MCP. Its tool list (names + descriptions) is fetched live from `https://backend.composio.dev`. These descriptions are injected into the system prompt by the Claude Agent SDK. If Composio's server returns tampered tool descriptions containing prompt-injection payloads, they would be embedded in every request's system prompt.

This is inherent to all HTTP MCPs and cannot be fixed in bot code alone. Mitigation: pin tool IDs explicitly and filter/sanitize tool descriptions if the SDK provides that hook.

---

## CONFIRMED CLOSED (re-verified in this audit)

| Vector | Status | Verification |
|--------|--------|--------------|
| Cross-user dropbox (guest A writes ask-user/send-file for B's userId) | CLOSED | Glob is scoped by userId in filename; JSON body double-checked |
| Path traversal in requestId (callback.ts) | CLOSED | `REQUEST_ID_RE = /^[a-zA-Z0-9_-]{8,64}$/` enforced at callback.ts:202 |
| JSON injection: bot trusts `user_id` from JSON over filename | CLOSED | streaming.ts:73 + :128 verify JSON user_id matches glob-derived userId |
| Composio multi-tenant: guest injects different tg_userId | CLOSED | MCP URL hardcoded in McpServerConfig by mcpServersForProfile(profile.userId) |
| MCP subprocess env — TELEGRAM_BOT_TOKEN leaks to guests | CLOSED | buildGuestBaseEnv() explicit allowlist; no spread of process.env |
| openrouter_image_mcp for guests (key leak) | CLOSED | Excluded by mcp-filter.ts:37; no OPENROUTER_API_KEY in guest deepseekEnv |
| send_file symlink attack | CLOSED | realpathSync + isPathAllowedFor in streaming.ts:144-157 |
| parallel_mcp Bash in subtasks for container guests | CLOSED | session.ts:710-713 adds Bash/BashOutput/KillShell to disallowedTools → TELEGRAM_PARALLEL_DISALLOWED_TOOLS |
| MCP timeout → bot hang | CLOSED | session.ts:834 hard 10-min query timeout with AbortController |

---

## Summary

No P0/critical new findings — the MCP dropbox and path-isolation mechanisms are solid. Seven new findings, all LOW-MEDIUM:

- **M-03** (pollinations shared dir, MEDIUM) — cross-user image access via Read tool; fixable with per-user OUTPUT_DIR.
- **M-04** (parallel task.cwd injection, LOW-MEDIUM) — model can shift cwd for subtasks; validate against allowedPaths.
- **M-01, M-02** (missing userId in ask-user/startup send-file polls, LOW) — inconsistency, fix by passing userId.
- **M-05, M-06, M-07, M-08** (LOW, informational) — defense-in-depth hardening.
