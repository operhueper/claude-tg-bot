# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Начало каждой сессии

Перед любой работой с проектом читать [memory/project_knowledge_graph.md](memory/project_knowledge_graph.md) — там текущее состояние проекта, список задач и что сделано. После выполнения задачи обновлять этот файл и запускать `/graphify graphify-input --update`.

## Commands

```bash
bun run start      # Run the bot
bun run dev        # Run with auto-reload (--watch)
bun run typecheck  # Run TypeScript type checking
bun install        # Install dependencies
```

## Architecture

This is a Telegram bot (~3,300 lines TypeScript) that lets you control Claude Code from your phone via text, voice, photos, and documents. Built with Bun and grammY.

### Message Flow

```
Telegram message → Handler → Auth check → Rate limit → Claude session → Streaming response → Audit log
```

### Key Modules

- **`src/index.ts`** - Entry point, registers handlers, starts polling, registers Telegram side-menu via `setMyCommands` (per-chat scope for owners, base scope for guests)
- **`src/config.ts`** - Environment parsing, MCP loading, **per-user profiles** (`getUserProfile(userId) → UserProfile`), guest dir bootstrap
- **`src/session.ts`** - `ClaudeSession` class wrapping the Agent SDK `query()` API with streaming and defense-in-depth safety checks. **Sessions are per-user**: use `getSession(userId)` — there is NO singleton. Each user has an isolated session file: `/tmp/claude-telegram-session-${userId}.json`
- **`src/security.ts`** - `RateLimiter` (token bucket, per-profile), `isPathAllowedFor(path, allowedPaths)`, `checkCommandSafety(cmd, allowedPaths)` — both take an explicit allowlist so callers pass the active user's paths
- **`src/formatting.ts`** - Markdown→HTML conversion for Telegram, tool status emoji formatting
- **`src/utils.ts`** - Audit logging, voice transcription (OpenAI), typing indicators, `checkInterrupt(text, userId)`, `replyFriendly(ctx, error, context)` (user-facing error replies)
- **`src/types.ts`** - Shared TypeScript types
- **`src/metering.ts`** - Token usage accounting backed by SQLite (`metering.sqlite`). Functions: `recordUsage()`, `getUserTotals()`, `getAllUsersTotals()`. Model prices are hardcoded. Request sources are tagged: `bot-anthropic`, `bot-deepseek`, `bot-openrouter`, `open-design` (reserved). DB path is `METERING_DB_PATH` (default `./metering.sqlite`); the file is created automatically on first run.
- **`src/dashboard-server.ts`** - Embedded HTTP server (port `DASHBOARD_PORT`, default 3848), started from `src/index.ts` alongside the health-webhook on port 3847. Routes: `GET /` (landing stub), `GET /dashboard` (Mini App), `POST /api/me` (per-user stats), `POST /api/admin/all` (all users, owner only). Telegram `initData` is verified with HMAC-SHA256 + 24h `auth_date` check.
- **`src/containers/metrics.ts`** - Guest container metrics: `getContainerMetrics(userId)`, `getAllContainerMetrics()`. Reads `docker stats` and `du`. Safe to call without Docker (returns zeros locally).
- **`src/templates/landing.ts`** - `renderLanding()` — placeholder landing page for proboi.site.
- **`src/templates/user-dashboard.ts`** - `renderDashboard()` — Mini App HTML: token totals, container resources, admin table (owner only). Supports `?mock=1` for layout preview without auth.

### Handlers (`src/handlers/`)

Each message type has a dedicated async handler:
- **`commands.ts`** - `/start`, `/new`, `/stop`, `/status`, `/resume`, `/restart`, `/retry`
- **`text.ts`** - Text messages with intent filtering. If `profile.onboardingComplete === false`, the first message uses `buildOnboardingPrompt(userId, vaultDir)` instead of the normal system prompt. When Claude replies with `[ONBOARDING_COMPLETE]`, the marker is stripped from the text and `markOnboardingComplete(userId)` is called, switching the user to the regular flow.
- **`voice.ts`** - Voice→text via OpenAI, then same flow as text
- **`audio.ts`** - Audio file transcription via OpenAI (mp3, m4a, ogg, wav, etc.), also handles audio sent as documents
- **`photo.ts`** - Image analysis with media group buffering (1s timeout for albums)
- **`document.ts`** - PDF extraction (pdftotext CLI), text files, archives, routes audio files to `audio.ts`
- **`video.ts`** - Video messages and video notes
- **`callback.ts`** - Inline keyboard button handling for ask_user MCP. Also handles `invite_approve` button (owner approves new guests): sets `onboardingComplete: false`, notifies the new user. The approve action is idempotent — repeated taps do not crash.
- **`streaming.ts`** - Shared `StreamingState` and status callback factory. `StreamingState` has a `maxSegmentId` field; on `done` all intermediate text messages are deleted, keeping only the final segment (eliminates mid-stream "noise" messages).

### User Profiles (owner vs guest)

The bot serves **two classes of users** with isolated state:

- **Owner** (`292228713` — Евгений) — full access: `CLAUDE_WORKING_DIR` (`workspace/`), broad `ALLOWED_PATHS`, `settingSources: ["user", "project"]` (loads `~/.claude/CLAUDE.md`), all commands including `/restart` and `/reloadbot`, configurable rate limit, Claude Sonnet model.
- **Guest** (all other IDs in `TELEGRAM_ALLOWED_USERS`) — sandboxed: `cwd = /opt/vault/{userId}/`, `settingSources: ["project"]` (the owner's `~/.claude` is NOT loaded — no memory/skills cross-contamination), no `/restart` or `/reloadbot`, no rate limit, dedicated guest system prompt. Model is deepseek-chat by default via OpenRouter.
  - **Ксения (`893951298`)** — special case within Guest: uses claude-sonnet-4-6 instead of deepseek-chat, and is explicitly allowed to read `CLAUDE_WORKING_DIR` (owner workspace) in her `allowedPaths`.

`getUserProfile(userId)` is the single source of truth — handlers, sessions, and security checks all consume the resulting `UserProfile`. Vault dir (`/opt/vault/{userId}/`) is auto-bootstrapped on first access.

### Side Menu

`bot.api.setMyCommands(...)` runs at startup. Default (base) scope = guest menu (no `/restart`). For each owner ID, a per-chat scope override adds `/restart`. If you add a new command, update both `baseCommands` and `ownerCommands` arrays in `src/index.ts` AND the corresponding `allowedCommands` set in `src/config.ts`. Telegram clients cache the menu — restart the app if changes don't appear.

### Security Layers

1. User allowlist (`TELEGRAM_ALLOWED_USERS`) — gate at the handler boundary
2. Per-profile rate limiting (token bucket; can be disabled per profile)
3. Per-profile path validation — `isPathAllowedFor(path, profile.allowedPaths)` (NOT the legacy global `isPathAllowed`)
4. Per-profile command safety — `checkCommandSafety(cmd, profile.allowedPaths)` (rm targets validated against the caller's allowlist)
5. Per-profile system prompt — guests get an explicit "you are a regular user, refuse bot-modification requests" prompt
6. Per-profile command allowlist — `/restart` is rejected for guests in `commands.ts`
7. Audit logging
8. Per-profile `disallowedTools` — DeepSeek guests do not receive WebSearch (architecturally incompatible with the DeepSeek Anthropic-compatible API: `api.deepseek.com/anthropic` does not proxy Anthropic server-side tools and returns `does not support this tool_choice`)

### Configuration

All config via `.env` (copy from `.env.example`). Key variables:
- `TELEGRAM_BOT_TOKEN`, `TELEGRAM_ALLOWED_USERS` (required; comma-separated IDs — include all guests)
- `CLAUDE_WORKING_DIR` - Working directory for owner (e.g. `/opt/claude-tg-bot/workspace/`)
- `ALLOWED_PATHS` - Directories owner can access (comma-separated). Guests are always pinned to `/opt/vault/{userId}/`
- `DEEPSEEK_API_KEY` - Single shared DeepSeek API key used for all guest sessions
- `OPENROUTER_API_KEY` - For OpenRouter routing (DeepSeek via OpenRouter, openrouter-image MCP — owner only)
- `OPENAI_API_KEY` - For voice transcription (Whisper)
- `HF_API_TOKEN` - Hugging Face API token. Required when `hf-image` / `hf-llm` MCPs are enabled in `mcp-config.ts`
- `CLAUDE_MODEL` - Override owner Claude model (default `claude-sonnet-4-6`)
- `SHOW_TOOL_USE`, `SHOW_THINKING` - UI verbosity. Both default false: tool calls and thinking blocks are hidden, only final assistant text reaches the chat
- `TRANSCRIPTION_CONTEXT_FILE` - Path to text file appended to Whisper prompt (proper nouns, jargon)
- `RATE_LIMIT_ENABLED`, `RATE_LIMIT_REQUESTS`, `RATE_LIMIT_WINDOW` - Token bucket settings (owner only; guests have no limit)
- `AUDIT_LOG_PATH`, `AUDIT_LOG_JSON`
- `METERING_DB_PATH` - Path to the SQLite token-accounting database (default `./metering.sqlite`). Created automatically on first run.
- `DASHBOARD_PORT` - Port for the embedded dashboard web server (default `3848`).

MCP servers defined in `mcp-config.ts`, which is **gitignored** — each host (your laptop, the prod server) keeps its own copy seeded from `mcp-config.example.ts`. The example file has all servers commented out; the prod box runs a customised version with `ask-user`, `send-file`, `hf-image`, `hf-llm` enabled. When deploying to a fresh host, copy `mcp-config.example.ts → mcp-config.ts` and uncomment what you need — otherwise no MCPs load.

For each enabled MCP, the corresponding tool prefix (e.g. `mcp__hf-image`) must also appear in `/root/.claude/settings.json` under `permissions.allow`. A bare `mcp__*` wildcard does NOT work — list each server explicitly. If the bot says «Нет прав на использование инструмента» / «No permission to use tool», that's the missing entry.

### Bundled MCPs

Four MCPs ship with this repo and have first-class integration in `src/session.ts`:

- **`ask_user_mcp/`** — Claude calls `mcp__ask-user__*`, the bot detects the tool-name prefix and renders Telegram inline-keyboard buttons via `src/handlers/callback.ts`. The query loop breaks after the call and resumes when the user taps a button.
- **`send_file_mcp/`** — Claude calls `mcp__send-file__*`, the bot intercepts and uploads the file via `src/handlers/streaming.ts:checkPendingSendFileRequests`. Unlike `ask-user`, the query continues streaming.
- **`hf_image_mcp/`** — Claude calls `mcp__hf-image__generate_image(prompt)`. Hits Hugging Face's Inference Providers router (`router.huggingface.co/fal-ai/fal-ai/z-image/base`), which proxies to fal-ai's hosted `Tongyi-MAI/Z-Image`. fal-ai responds with JSON `{images: [{url}]}`; the server downloads the URL and saves a PNG to `/tmp/hf_images/`, returning the absolute path so `send-file` can deliver it. Requires `HF_API_TOKEN`.
- **`hf_llm_mcp/`** — Claude calls `mcp__hf-llm__ask_uncensored(prompt)` for an unfiltered second opinion. **Currently broken**: targets `HauhauCS/Qwen3.6-35B-A3B-Uncensored-HauhauCS-Aggressive`, which has empty `inferenceProviderMapping` (no provider hosts it). To revive, swap to a model with live providers — check via `GET https://huggingface.co/api/models/<id>?expand[]=inferenceProviderMapping`.

`ask-user` and `send-file` rely on a file-drop-box pattern (MCP server writes a request file, bot polls/reads it). When adding similar interactive MCPs, follow the same `mcp__<name>` prefix convention so `session.ts` can hook them.

**HF Inference API migration (2025)**: the old `api-inference.huggingface.co/models/<id>` serverless endpoints are deprecated and return 404 for most models. Use the new router: `https://router.huggingface.co/<provider>/<providerId>` with the body shape that *provider* expects (e.g. fal-ai wants `{"prompt": "..."}` and replies with `{images: [{url}]}`, NOT a binary). Find a model's available providers via `?expand[]=inferenceProviderMapping`. Don't reintroduce the old endpoint — it will silently 404.

### Runtime Files

- `/tmp/claude-telegram-session-${userId}.json` - Per-user session history for `/resume` (each user has their own file; `SESSION_FILE` constant in `config.ts` is legacy and no longer written by the runtime)
- `/tmp/telegram-bot/` - Downloaded photos/documents (in `TEMP_PATHS`, always allowed for both profiles)
- `/tmp/claude-telegram-audit.log` - Audit log
- `/tmp/ask-user-*.json`, `/tmp/send-file-*.json` - MCP file-drop boxes (see Bundled MCPs)
- `metering.sqlite`, `metering.sqlite-shm`, `metering.sqlite-wal` - SQLite token-accounting database (repo root, gitignored). Auto-created by `src/metering.ts` on first `recordUsage()` call. WAL files appear when SQLite is opened with WAL journal mode.
- Port 3848 — dashboard web server (`src/dashboard-server.ts`), bound on startup alongside the health-webhook on port 3847.

### Metering

Token usage is recorded in `metering.sqlite` (SQLite, repo root) via `src/metering.ts`. Every completed request calls `recordUsage(userId, model, source, inputTokens, outputTokens)` — callers are `src/session.ts` (sources `bot-anthropic`, `bot-deepseek`) and `src/engines/openrouter.ts` (source `bot-openrouter`). Source `open-design` is reserved for future proxy attribution. Model prices are hardcoded in `metering.ts`; update them when adding new models. The DB file is gitignored. On a fresh server it is created automatically — no migration step needed.

Query helpers:
- `getUserTotals(userId)` — per-model token/cost breakdown for one user
- `getAllUsersTotals()` — same, across all users (used by the admin dashboard view)

### Dashboard

`src/dashboard-server.ts` starts an HTTP server at `DASHBOARD_PORT` (default 3848). It is launched from `src/index.ts` at bot startup. The server exposes:

- `GET /` — landing page stub (`src/templates/landing.ts`)
- `GET /dashboard` — Mini App HTML (`src/templates/user-dashboard.ts`). Add `?mock=1` to bypass auth and preview layout.
- `POST /api/me` — returns the authenticated user's token totals (JSON)
- `POST /api/admin/all` — returns all users' totals; responds 403 unless `userId === 292228713`
- `GET /healthz` — plain-text liveness check

Authentication: the client posts `initData` from `window.Telegram.WebApp.initData`. The server verifies the HMAC-SHA256 signature using the bot token (per Telegram Mini App spec) and rejects requests where `auth_date` is older than 24 hours.

The bot currently opens the dashboard via a `web_app` button pointing to `https://ksenyaenbom.ru/dashboard` (`src/handlers/commands.ts:400`). This URL will be updated when the domain moves to proboi.site.

### Onboarding

When an owner approves a new guest via the invite inline button (`callback.ts`), `addUser()` sets `onboardingComplete: false` in `users.json`. The new user receives "Напиши мне любое сообщение, чтобы начать."

On their first message (`text.ts`), the bot detects `profile.onboardingComplete === false` and calls `buildOnboardingPrompt(userId, vaultDir)` (defined in `src/config.ts`) as the system prompt override. This prompt drives a 6-step introduction sequence. When Claude finishes and appends `[ONBOARDING_COMPLETE]` to its reply, `text.ts` strips the marker from the displayed text and calls `markOnboardingComplete(userId)` (`src/user-registry.ts`), setting the flag to `true`. Subsequent messages use the normal guest system prompt.

Existing users (Евгений, Ксения, Артём, testers) have no `onboardingComplete` key in `users.json`, which is treated as `true` — they skip onboarding entirely.

## Patterns

**Adding a command**: Create handler in `commands.ts`, register in `index.ts` with `bot.command("name", handler)`. If the command should appear in the side menu, also add it to `baseCommands` and/or `ownerCommands` in `index.ts`. If guests should be blocked from running it, add the name to `OWNER_COMMANDS` only (not `GUEST_COMMANDS`) in `config.ts` and check via `getUserProfile(userId).allowedCommands.has(...)` in the handler.

**Adding a message handler**: Create in `handlers/`, export from `index.ts`, register in `index.ts` with appropriate filter. Always look up the session via `const session = getSession(userId)` after the auth check — never import a global `session`. Pass `userId` (not just text) into `checkInterrupt` so `!`-prefixed messages target the correct user's running query.

**Streaming pattern**: All handlers use `createStatusCallback()` from `streaming.ts` and `session.sendMessageStreaming()` for live updates.

**Type checking**: Run `bun run typecheck` periodically while editing TypeScript files. Fix any type errors before committing.

**Error handling in handlers**: Use `replyFriendly(ctx, error, "<context label>")` from `src/utils.ts` instead of raw `ctx.reply("❌ Error: ${error}")`. `replyFriendly` logs the full error to `console.error` and sends a static human-readable message to the user. Add it to every `catch` block in new handlers — this is the established pattern across `text.ts`, `audio.ts`, `voice.ts`, `document.ts`, `commands.ts`, and `callback.ts`.

**Adding a guest-only tool restriction**: add the tool name to `profile.disallowedTools` inside `getUserProfile()` in `src/config.ts`. The field is picked up automatically by `src/session.ts` and passed to SDK `query()`. Use this for tools that are structurally incompatible with a guest's model/endpoint (not for permission-level restrictions, which belong in `/root/.claude/settings.json`).

**After code changes**: Restart the bot so changes can be tested. Locally use `bun run start` or `launchctl kickstart -k gui/$(id -u)/com.claude-telegram-ts`. On the server use `ssh root@5.223.82.96 'systemctl restart claude-tg-bot'` (see Production Deployment).

## Standalone Build

The bot can be compiled to a standalone binary with `bun build --compile`. This is used by the ClaudeBot macOS app wrapper.

### External Dependencies

PDF extraction uses `pdftotext` CLI instead of an npm package (to avoid bundling issues):

```bash
brew install poppler  # Provides pdftotext
```

### PATH Requirements

When running as a standalone binary (especially from a macOS app), the PATH may not include Homebrew. The launcher must ensure PATH includes:
- `/opt/homebrew/bin` (Apple Silicon Homebrew)
- `/usr/local/bin` (Intel Homebrew)

Without this, `pdftotext` won't be found and PDF parsing will fail silently with an error message.

## Commit Style

Do not add "Generated with Claude Code" footers or "Co-Authored-By" trailers to commit messages.

## Production Deployment

The bot runs on jinru server as a systemd service. This is the canonical runtime — local execution is dev-only.

- Host: `root@5.223.82.96`, repo root: `/opt/claude-tg-bot/`
- Owner workspace: `CLAUDE_WORKING_DIR=/opt/claude-tg-bot/workspace/` (contains owner's `CLAUDE.md`)
- Guest workdirs: `/opt/vault/{userId}/` — auto-bootstrapped per user, each with its own `CLAUDE.md`
- Allowlist: `TELEGRAM_ALLOWED_USERS=292228713,893951298,403360614,...` (owner Евгений + all guests)
- Service: `systemctl {status,restart,stop} claude-tg-bot`
- Logs: `/var/log/claude-tg-bot.log`, `/var/log/claude-tg-bot.err.log`
- Native Claude CLI: `/root/.local/share/claude/versions/2.1.126`
- OAuth credentials: `/root/.claude/.credentials.json` (already provisioned)
- Claude Code permissions live in `/root/.claude/settings.json` — `defaultMode: "acceptEdits"` plus a broad `permissions.allow` list (Bash, Write, Edit, WebSearch, etc.). This is how the bot avoids interactive permission prompts; do NOT pass `permissionMode`/`allowDangerouslySkipPermissions` from the SDK side (see SDK Permission Mode below).
- `ALLOWED_PATHS` on the server is broad (`/opt,/root,/home,/tmp,/var/tmp,/usr/local,/etc`) so the bot can manage its own filesystem freely. Tighten only with reason.
- `metering.sqlite` is created automatically in the repo root (`/opt/claude-tg-bot/`) on the first request after deployment. No migration or seed step required. The file is gitignored; do not commit it.

Deploy after local edits:

```bash
# Production (jinru, @proboiAI_bot)
rsync -az --exclude node_modules --exclude .git --exclude .env ./ root@5.223.82.96:/opt/claude-tg-bot/
ssh root@5.223.82.96 'cd /opt/claude-tg-bot && bun install && systemctl restart claude-tg-bot'

# Test (proboi-bot, @ORCH7_bot) — token is 8678975502:... configured on the server, never sync .env
rsync -az --exclude node_modules --exclude .git --exclude .env ./ root@89.167.125.175:/opt/claude-tg-bot/
ssh root@89.167.125.175 'cd /opt/claude-tg-bot && bun install && systemctl restart claude-tg-bot'
```

⚠️ **Never rsync `.env`** — each server has its own token. Syncing `.env` overwrites the test server token with the prod token, causing 409 Conflict crash-loop on prod (jinru) and restart-notification spam to all users.

⚠️ **musl/glibc trap**: bun resolves to `@anthropic-ai/claude-agent-sdk-linux-x64-musl` but the server runs glibc Ubuntu. Production has a manual binary swap inside `node_modules/.../claude` to a glibc build. A clean `bun install` overwrites this — re-do the swap or the SDK subprocess exits 1.

Symptom: every query fails with `ReferenceError: Claude Code native binary not found at .../claude-agent-sdk-linux-x64-musl/claude` in `/var/log/claude-tg-bot.err.log`. The systemd unit stays "active" because the bot survives — only the SDK subprocess crashes per-request, so don't trust `systemctl is-active` here.

Recovery (run after every `bun install` on the server):

```bash
ssh root@5.223.82.96 'cp /root/.local/share/claude/versions/2.1.126 \
  /opt/claude-tg-bot/node_modules/@anthropic-ai/claude-agent-sdk-linux-x64-musl/claude && \
  chmod +x /opt/claude-tg-bot/node_modules/@anthropic-ai/claude-agent-sdk-linux-x64-musl/claude && \
  systemctl restart claude-tg-bot'
```

The version path `/root/.local/share/claude/versions/2.1.126` may need bumping when Claude Code is upgraded — `ls /root/.local/share/claude/versions/` to find the current build.

### SDK Permission Mode

Permission control belongs in `/root/.claude/settings.json`, NOT in SDK options. An earlier iteration passed `permissionMode: "bypassPermissions"` + `allowDangerouslySkipPermissions: true` to `query()` — Claude CLI 2.1.126 rejected those keys and the subprocess exited with code 1. SDK 0.2.120+ accepts them again, but the settings.json route (`defaultMode: "acceptEdits"` + explicit `allow` list) is the canonical pattern for this bot. Don't reintroduce the SDK flags without verifying against the deployed CLI.

## Running as Service (macOS dev)

```bash
cp launchagent/com.claude-telegram-ts.plist.template ~/Library/LaunchAgents/com.claude-telegram-ts.plist
# Edit plist with your paths
launchctl load ~/Library/LaunchAgents/com.claude-telegram-ts.plist

# Logs
tail -f /tmp/claude-telegram-bot-ts.log
tail -f /tmp/claude-telegram-bot-ts.err
```

## Sibling Files

- `AGENTS.md` is a symlink to `CLAUDE.md` for tools that look for that filename (Codex, etc.). Edit `CLAUDE.md` only.
- `HANDOFF.md` is a hand-edited running log of session-to-session context (server creds, recent debugging, open todos). Read it for prod context that hasn't yet graduated into this file.
