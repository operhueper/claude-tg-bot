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
- **`text.ts`** - Text messages with intent filtering. Routes via `session.sendMessageStreaming` (which itself dispatches DeepSeek text / OpenRouter vision / OpenRouter text-fallback based on profile and `mediaHint`).
- **`voice.ts`** - Voice→text via OpenAI, then same flow as text
- **`audio.ts`** - Audio file transcription via OpenAI (mp3, m4a, ogg, wav, etc.), also handles audio sent as documents
- **`photo.ts`** - Image analysis with media group buffering (1s timeout for albums)
- **`document.ts`** - PDF extraction (pdftotext CLI), text files, archives, routes audio files to `audio.ts`
- **`video.ts`** - Video messages and video notes
- **`callback.ts`** - Inline keyboard button handling for ask_user MCP. Also handles `invite_approve` button (owner approves new guests): adds the new user to `users.json` and `NEW_GUEST_USERS`, notifies them. The approve action is idempotent — repeated taps do not crash.
- **`streaming.ts`** - Shared `StreamingState` and status callback factory. `StreamingState` has a `maxSegmentId` field; on `done` all intermediate text messages are deleted, keeping only the final segment (eliminates mid-stream "noise" messages).

### User Profiles (owner vs guest)

The bot serves **two classes of users** with isolated state:

- **Owner** (`292228713` — Евгений) — full access: `CLAUDE_WORKING_DIR` (`workspace/`), broad `ALLOWED_PATHS`, `settingSources: ["user", "project"]` (loads `~/.claude/CLAUDE.md`), all commands including `/restart` and `/reloadbot`, configurable rate limit, Claude Sonnet model.
- **Guest** (all other IDs in `TELEGRAM_ALLOWED_USERS`) — sandboxed: `cwd = /opt/vault/{userId}/`, `settingSources: ["project"]` (the owner's `~/.claude` is NOT loaded — no memory/skills cross-contamination), no `/restart` or `/reloadbot`, no rate limit, dedicated guest system prompt. Все гости работают на DeepSeek через общий ключ владельца, в собственном Docker-контейнере.

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
- `CLAUDE_MODEL` - Override owner Claude model (default `claude-sonnet-4-6`)
- `SHOW_TOOL_USE`, `SHOW_THINKING` - UI verbosity. Both default false: tool calls and thinking blocks are hidden, only final assistant text reaches the chat
- `TRANSCRIPTION_CONTEXT_FILE` - Path to text file appended to Whisper prompt (proper nouns, jargon)
- `RATE_LIMIT_ENABLED`, `RATE_LIMIT_REQUESTS`, `RATE_LIMIT_WINDOW` - Token bucket settings (owner only; guests have no limit)
- `AUDIT_LOG_PATH`, `AUDIT_LOG_JSON`
- `METERING_DB_PATH` - Path to the SQLite token-accounting database (default `./metering.sqlite`). Created automatically on first run.
- `DASHBOARD_PORT` - Port for the embedded dashboard web server (default `3848`).
- `COMPOSIO_API_KEY` - Composio API key for Google Workspace MCP (managed OAuth). Guests connect via `/google`. Get from https://app.composio.dev/developers. Optional — if absent, Google MCP is silently disabled.

MCP servers defined in `mcp-config.ts`, which is **gitignored** — each host (your laptop, the prod server) keeps its own copy seeded from `mcp-config.example.ts`. When deploying to a fresh host, copy `mcp-config.example.ts → mcp-config.ts` and add the servers you need — otherwise no MCPs load.

For each enabled MCP, the corresponding tool prefix (e.g. `mcp__pollinations-image`) must also appear in `/root/.claude/settings.json` under `permissions.allow`. A bare `mcp__*` wildcard does NOT work — list each server explicitly. If the bot says «Нет прав на использование инструмента», that's the missing entry.

### Bundled MCPs

Six MCPs ship with this repo (`mcp-config.example.ts` is the seed; `mcp-config.ts` is gitignored and per-host):

- **`parallel_mcp/`** — `mcp__parallel__run`: fan out independent subtasks concurrently. Active for all users. Replaces the SDK Task tool for DeepSeek-routed guests where Task isn't available.
- **`ask_user_mcp/`** — Claude calls `mcp__ask-user__*`, the bot detects the tool-name prefix and renders Telegram inline-keyboard buttons via `src/handlers/callback.ts`. The query loop breaks after the call and resumes when the user taps a button.
- **`send_file_mcp/`** — Claude calls `mcp__send-file__*`, the bot intercepts and uploads the file via `src/handlers/streaming.ts:checkPendingSendFileRequests`. Unlike `ask-user`, the query continues streaming.
- **`connect_google_mcp/`** — `mcp__connect-google__connect`: kicks off Composio Google Workspace OAuth. Bot intercepts and renders OAuth inline-keyboard buttons. Together with the Composio HTTP MCP this replaces the legacy `/google` command flow.
- **`pollinations_mcp/`** — free image generation via Pollinations.ai (Flux model, no API key). Saves PNG to `/tmp/pollinations/` and returns the absolute path so `send-file` can deliver it. Available to all users.
- **`openrouter_image_mcp/`** — paid image generation via OpenRouter (Nano Banana / Gemini image models). Owner-only — guests use `pollinations-image`. Requires `OPENROUTER_API_KEY`.
- **Composio Google Workspace** (cloud-hosted HTTP MCP, not bundled) — managed OAuth for Google Docs/Drive/Sheets/Gmail/Calendar. Per-user isolation via `?user_id=tg_<id>` in the MCP URL. Requires `COMPOSIO_API_KEY` in env. Tools surface as `mcp__google-workspace__*`. Implemented in `src/composio.ts`; injected by `src/mcp-filter.ts` when the API key is present.

`ask-user`, `send-file`, and `connect-google` rely on a file-drop-box pattern (MCP server writes a request file, bot polls/reads it). When adding similar interactive MCPs, follow the same `mcp__<name>` prefix convention so `session.ts` can hook them.

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

The bot opens the dashboard via a `web_app` button pointing to `https://proboi.site/dashboard` (`src/handlers/commands.ts`). The legacy `ksenyaenbom.ru` URL is no longer used — primary domain is `proboi.site`.

### Vision pipeline

All photo messages from any user (owner + guests) are routed through OpenRouter Gemini (`google/gemini-2.5-flash` by default; override via `profile.visionModel`). The dispatch happens in [src/session.ts](src/session.ts) `sendMessageStreaming` — universal vision block fires when `mediaHint === true` AND `process.env.OPENROUTER_API_KEY` is set. New-guest with DeepSeek key gets the key via `getNewGuestOpenRouterKey()` (per-user fallback); everyone else gets it from env directly.

The earlier behaviour (owner went through Claude SDK with raw `[Photo: /path]` string and replied "I cannot see images") was a bug fixed in `ba38106`. Caption + photo are joined into a single multipart-content message via [src/engines/openrouter.ts](src/engines/openrouter.ts) `buildMultipartContent`; if no caption, the default prompt "Что на изображении?" is used.

### Vault quota (guests)

Each guest has a **2 GB soft quota** on their `/opt/vault/<userId>/` enforced by [src/containers/vault-quota.ts](src/containers/vault-quota.ts). Before any message is processed, `session.sendMessageStreaming` calls `checkVaultQuota(userId)` — if the vault exceeds the limit, the message is rejected with a friendly Russian explanation and the function returns early. Owner is exempt (their vault is the bot's working directory). Soft quota was chosen over kernel quotas because the prod ext4 mount lacks `prjquota` and remounting is risky on a live server.

Cache TTL is 60 seconds (du is slow on large vaults). To force re-check after a deletion, call `invalidateQuotaCache(userId)`.

To raise the limit per user, edit `VAULT_QUOTA_BYTES` in `vault-quota.ts` (currently global) — per-user overrides aren't implemented in v1.

### Sandbox image (guest container)

Each guest gets a Docker container from `claude-user-sandbox:latest` (built from [Dockerfile.user](Dockerfile.user) at the repo root). Image v2 (~3.3 GB) preinstalls:

- **Document tooling:** `poppler-utils` (pdftotext), `pandoc`, `wkhtmltopdf`, `libreoffice` (impress + calc + writer), `imagemagick` (with hardened policy.xml — RCE-prone coders disabled), `ffmpeg`, `tesseract-ocr` (rus + eng), liberation/dejavu/noto fonts.
- **Python stack:** `openpyxl`, `pandas`, `numpy`, `python-pptx`, `python-docx`, `pillow`, `reportlab`, `pypdf2`, `pdfplumber`, `requests`, `beautifulsoup4`, `lxml`, `matplotlib`, `yt-dlp`.
- **Runtimes:** Python 3.11, Node.js 20 LTS, Bun, npm, pnpm, tsx, typescript.
- **Web:** nginx (for guest sites on container port 80, exposed via host nginx reverse-proxy on `proboi.site/u/<userId>/`).

To rebuild after editing `Dockerfile.user`:
```bash
ssh root@89.167.125.175 'cd /opt/claude-tg-bot && docker build -t claude-user-sandbox:latest -f Dockerfile.user .'
```
Then either let containers pick up the new image lazily on next-message recreation, or `docker rm -f $(docker ps -aq --filter label=claude-bot-user)` + `systemctl restart claude-tg-bot` to force-recycle (always-on containers are revived automatically by `containerManager.init()`).

### Firewall (defense-in-depth)

Two layers protect host services from guest containers:

1. **INPUT chain** ([scripts/firewall/setup.sh](scripts/firewall/setup.sh)) — DROP guest traffic to host ports 22, 3847, 3848 on interface `claude-guest0`. Default policy on INPUT is DROP, so anything not explicitly accepted is blocked.
2. **DOCKER-USER chain** ([scripts/firewall/docker-user-rules.sh](scripts/firewall/docker-user-rules.sh)) — same DROP rules mirrored, in case a future guest network bypasses INPUT (e.g., FORWARD path on a different bridge).

Persistence: rules are saved to `/etc/iptables/rules.v4` and re-applied on bot start via systemd drop-in `/etc/systemd/system/claude-tg-bot.service.d/firewall.conf` (`ExecStartPre=-/opt/claude-tg-bot/scripts/firewall/docker-user-rules.sh`). The script is idempotent — `iptables -C` guards every `iptables -I`.

## Patterns

**Adding a command**: Create handler in `commands.ts`, register in `index.ts` with `bot.command("name", handler)`. If the command should appear in the side menu, also add it to `baseCommands` and/or `ownerCommands` in `index.ts`. If guests should be blocked from running it, add the name to `OWNER_COMMANDS` only (not `GUEST_COMMANDS`) in `config.ts` and check via `getUserProfile(userId).allowedCommands.has(...)` in the handler.

**Adding a message handler**: Create in `handlers/`, export from `index.ts`, register in `index.ts` with appropriate filter. Always look up the session via `const session = getSession(userId)` after the auth check — never import a global `session`. Pass `userId` (not just text) into `checkInterrupt` so `!`-prefixed messages target the correct user's running query.

**Streaming pattern**: All handlers use `createStatusCallback()` from `streaming.ts` and `session.sendMessageStreaming()` for live updates.

**Type checking**: Run `bun run typecheck` periodically while editing TypeScript files. Fix any type errors before committing.

**Error handling in handlers**: Use `replyFriendly(ctx, error, "<context label>")` from `src/utils.ts` instead of raw `ctx.reply("❌ Error: ${error}")`. `replyFriendly` logs the full error to `console.error` and sends a static human-readable message to the user. Add it to every `catch` block in new handlers — this is the established pattern across `text.ts`, `audio.ts`, `voice.ts`, `document.ts`, `commands.ts`, and `callback.ts`.

**Adding a guest-only tool restriction**: add the tool name to `profile.disallowedTools` inside `getUserProfile()` in `src/config.ts`. The field is picked up automatically by `src/session.ts` and passed to SDK `query()`. Use this for tools that are structurally incompatible with a guest's model/endpoint (not for permission-level restrictions, which belong in `/root/.claude/settings.json`).

**After code changes**: Restart the bot so changes can be tested. Locally use `bun run start` or `launchctl kickstart -k gui/$(id -u)/com.claude-telegram-ts`. On the server use `ssh root@89.167.125.175 'systemctl restart claude-tg-bot'` (see Production Deployment).

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

The bot runs as a systemd service on the prod server. This is the canonical runtime — local execution is dev-only.

**Server topology (canonical, post-2026-05-07 migration):**

| Role | Host | hostname | Telegram bot |
|---|---|---|---|
| **PROD** | `root@89.167.125.175` | `proboi-bot` | `@proboiAI_bot` |
| **TEST** | `root@5.223.82.96` | `jinru` | `@ORCH7_bot` (token `8678975502:...`) |

> If you read `hostname` and see `proboi-bot` — you are on PROD. If `jinru` — you are on TEST. Don't trust folder names or env labels alone.

- Owner workspace: `CLAUDE_WORKING_DIR=/opt/claude-tg-bot/workspace/` (contains owner's `CLAUDE.md`)
- Guest workdirs: `/opt/vault/{userId}/` — auto-bootstrapped per user, each with its own `CLAUDE.md`
- Allowlist: `TELEGRAM_ALLOWED_USERS=292228713,893951298,403360614,...` (owner Евгений + all guests)
- Service: `systemctl {status,restart,stop} claude-tg-bot`
- Logs: `/var/log/claude-tg-bot/claude-tg-bot.log` (stdout) and `/var/log/claude-tg-bot/claude-tg-bot.err.log` (stderr) — paths set in the systemd unit's `StandardOutput=append:` / `StandardError=append:`. `journalctl -u claude-tg-bot` only contains systemd lifecycle events. Audit log: `/var/log/claude-tg-bot.audit.log` (incoming user messages + bot responses)
- Native Claude CLI: `/root/.local/share/claude/versions/2.1.126`
- OAuth credentials: `/root/.claude/.credentials.json` (already provisioned)
- Claude Code permissions live in `/root/.claude/settings.json` — `defaultMode: "acceptEdits"` plus a broad `permissions.allow` list (Bash, Write, Edit, WebSearch, etc.). This is how the bot avoids interactive permission prompts; do NOT pass `permissionMode`/`allowDangerouslySkipPermissions` from the SDK side (see SDK Permission Mode below).
- `ALLOWED_PATHS` on the server is broad (`/opt,/root,/home,/tmp,/var/tmp,/usr/local,/etc`) so the bot can manage its own filesystem freely. Tighten only with reason.
- `metering.sqlite` is created automatically in the repo root (`/opt/claude-tg-bot/`) on the first request after deployment. No migration or seed step required. The file is gitignored; do not commit it.

Deploy after local edits:

```bash
# PROD (proboi-bot, @proboiAI_bot) — real users
rsync -az --exclude node_modules --exclude .git --exclude .env --exclude 'metering.sqlite*' --exclude 'system/users.json' \
  ./ root@89.167.125.175:/opt/claude-tg-bot/
ssh root@89.167.125.175 'cd /opt/claude-tg-bot && bun install && systemctl restart claude-tg-bot'

# TEST (jinru, @ORCH7_bot) — staging, token configured on the server, never sync .env
rsync -az --exclude node_modules --exclude .git --exclude .env --exclude 'metering.sqlite*' --exclude 'system/users.json' \
  ./ root@5.223.82.96:/opt/claude-tg-bot/
ssh root@5.223.82.96 'cd /opt/claude-tg-bot && bun install && systemctl restart claude-tg-bot'
```

⚠️ **Never rsync `.env`** — each server has its own token. Syncing `.env` overwrites the test server token with the prod token, causing 409 Conflict crash-loop on prod and restart-notification spam to all users.

⚠️ **Never rsync `system/users.json`** — this file is the live user database, written by the bot on the server (invite approvals, payment webhooks, subscription state). Overwriting it from a local copy erases users and wipes paid subscriptions. It is excluded from rsync above. To inspect or restore it, access it directly on the server via `ssh root@89.167.125.175 'cat /opt/claude-tg-bot/system/users.json'`.

> **Historical note (resolved):** earlier versions of this bot relied on a manual musl→glibc binary swap inside `node_modules/@anthropic-ai/claude-agent-sdk-linux-x64-musl/claude`. The current SDK (`@anthropic-ai/claude-agent-sdk` 0.2.x+) bundles the binary in the main package and does NOT use an architecture-specific subpackage — `find /opt/claude-tg-bot/node_modules/@anthropic-ai/` shows only `claude-agent-sdk`. No swap needed. If you see this error path mentioned in old logs or memory, ignore it.

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

## External Watchdog (V-30P)

The bot exposes a health endpoint at `GET /healthz` (port 3847, proxied through nginx as `https://proboi.site/healthz`). Configure an **external uptime monitor** to detect deadlocks and silent crashes that internal checks cannot catch:

1. Go to [UptimeRobot](https://uptimerobot.com) (free tier: 50 monitors, 5-min interval).
2. Create a new monitor:
   - **Type:** HTTP(S)
   - **URL:** `https://proboi.site/healthz`
   - **Interval:** 5 minutes
   - **Alert contacts:** owner Telegram or email
3. Alternatively use [Healthchecks.io](https://healthchecks.io) — bot pings it on each successful startup; silence = alert.

Note: nginx must proxy `/healthz` to `127.0.0.1:3847`. If the vhost does not have this location block, add it:

```nginx
location /healthz {
    proxy_pass http://127.0.0.1:3847/healthz;
    proxy_read_timeout 5s;
}
```

## Sibling Files

- `AGENTS.md` is a symlink to `CLAUDE.md` for tools that look for that filename (Codex, etc.). Edit `CLAUDE.md` only.
- `HANDOFF.md` is a hand-edited running log of session-to-session context (server creds, recent debugging, open todos). Read it for prod context that hasn't yet graduated into this file.
