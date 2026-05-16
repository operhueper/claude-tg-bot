# Graph Report - graphify-input  (2026-05-16)

## Corpus Check
- 3 files · ~12,000 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 263 nodes · 306 edges · 29 communities detected
- Extraction: 93% EXTRACTED · 7% INFERRED · 0% AMBIGUOUS · INFERRED: 20 edges (avg confidence: 0.77)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Session & Streaming Core|Session & Streaming Core]]
- [[_COMMUNITY_Batch Smoke Tests & Delivery|Batch Smoke Tests & Delivery]]
- [[_COMMUNITY_Guest Infra & Prompts|Guest Infra & Prompts]]
- [[_COMMUNITY_Context Compaction & Memory|Context Compaction & Memory]]
- [[_COMMUNITY_Artyom  Container Users|Artyom / Container Users]]
- [[_COMMUNITY_Google Workspace  Composio|Google Workspace / Composio]]
- [[_COMMUNITY_Legal, Consent & DeepSeek Pool|Legal, Consent & DeepSeek Pool]]
- [[_COMMUNITY_Container & Daemon Infra|Container & Daemon Infra]]
- [[_COMMUNITY_Session & Thread Commands|Session & Thread Commands]]
- [[_COMMUNITY_Bots & Server Topology|Bots & Server Topology]]
- [[_COMMUNITY_Free Tier & Permission Fixes|Free Tier & Permission Fixes]]
- [[_COMMUNITY_Owner Refactor & Migration|Owner Refactor & Migration]]
- [[_COMMUNITY_Security Hardening Fixes|Security Hardening Fixes]]
- [[_COMMUNITY_Payments & Subscription|Payments & Subscription]]
- [[_COMMUNITY_Container Spec & Manager|Container Spec & Manager]]
- [[_COMMUNITY_Profiler & Plan Features|Profiler & Plan Features]]
- [[_COMMUNITY_Parallel MCP|Parallel MCP]]
- [[_COMMUNITY_Metering & Dashboard|Metering & Dashboard]]
- [[_COMMUNITY_UX Hardening|UX Hardening]]
- [[_COMMUNITY_Daemon Always-On|Daemon Always-On]]
- [[_COMMUNITY_Subscription Gate|Subscription Gate]]
- [[_COMMUNITY_Idle Heartbeat|Idle Heartbeat]]
- [[_COMMUNITY_Landing Page|Landing Page]]
- [[_COMMUNITY_Open Tasks|Open Tasks]]
- [[_COMMUNITY_Pre-rotation Security Pack|Pre-rotation Security Pack]]
- [[_COMMUNITY_Vault Quota|Vault Quota]]
- [[_COMMUNITY_Rationale Nodes|Rationale Nodes]]
- [[_COMMUNITY_Open Design|Open Design]]
- [[_COMMUNITY_Fast-Path Engine|Fast-Path Engine]]

## God Nodes (most connected - your core abstractions)
1. `src/session.ts` - 19 edges
2. `src/session.ts` - 17 edges
3. `15-daemons-and-containers: Always-on container design decisions` - 12 edges
4. `src/config.ts` - 12 edges
5. `Smoke-batch 2026-05-16: 12 of 18 items closed` - 10 edges
6. `Batch #2: UI / UID / Composio polling / profiler` - 9 edges
7. `Toxic memory loop: analyzer writes infra errors as facts → injected back → loop` - 8 edges
8. `Состояние 2026-05-15 вечер — пакет из 7 блоков задеплоен на TEST jinru` - 8 edges
9. `src/config.ts` - 8 edges
10. `Test Server jinru (5.223.82.96, @ORCH7_bot)` - 7 edges

## Surprising Connections (you probably didn't know these)
- `Pack item 4 — P2 Security (V-29 resume-hijack, V-30 transcript sanitize, V-36..V-39)` --calls--> `src/session.ts`  [INFERRED]
  graphify-input/project_knowledge_graph.md → graphify-input/project_knowledge_graph.md  _Bridges community 8 → community 1_
- `Pack item 4 — P2 Security (V-29 resume-hijack, V-30 transcript sanitize, V-36..V-39)` --calls--> `src/memory/analyzer.ts`  [INFERRED]
  graphify-input/project_knowledge_graph.md → graphify-input/project_knowledge_graph.md  _Bridges community 8 → community 4_
- `parallel_mcp/server.ts: mcp__parallel__run for DeepSeek sessions instead of Task` --references--> `src/session.ts`  [INFERRED]
  graphify-input/project_knowledge_graph.md → graphify-input/project_knowledge_graph.md  _Bridges community 2 → community 0_
- `Prod Server proboi-bot (89.167.125.175)` --references--> `Состояние 2026-05-14 EOD+ — фикс крашей, удаление context compression`  [EXTRACTED]
  graphify-input/project_knowledge_graph.md → graphify-input/project_knowledge_graph.md  _Bridges community 9 → community 1_
- `Test Server jinru (5.223.82.96, @ORCH7_bot)` --references--> `Batch #3: Composio polling correctness + disconnect`  [EXTRACTED]
  graphify-input/project_knowledge_graph.md → graphify-input/project_knowledge_graph.md  _Bridges community 9 → community 5_

## Communities

### Community 0 - "Session & Streaming Core"
Cohesion: 0.07
Nodes (33): AbortSignal.any + timeout(90_000) on main OpenRouter/DeepSeek fetch, src/announce.ts, Batch #3: Composio polling correctness + disconnect MCP tool, commit 6a2f66c: fix crashes + remove context compression, Composio OAuth polling: 24×5s polling after OAuth button, GRACE_MS=10000, Context compression removed (compactIfNeeded + sanitizeCompactionSummary deleted), Daily limit gate + free doc gate with upsell CTA, src/engines/deepseek-fast.ts: direct REST to DeepSeek without CLI (+25 more)

### Community 1 - "Batch Smoke Tests & Delivery"
Cohesion: 0.11
Nodes (26): Batch #2: UI / UID / Composio polling / profiler, Smoke-batch 2026-05-16: 12 of 18 items closed, Команды /memory и /forget, Code-review (Sonnet): 2 HIGH blockers (subscription pattern, memory flush double-fire), Feat: Компакция + Redirect + /memory /forget (commit 633c634), Feat: Todo-list + Plan Mode (TodoMarkerParser, PlanMarkerParser, plan_confirm/cancel), Fix A — Single status bubble (дедуп прогресс-пузыря), Fix B2 — dedup прогресс-пузыря (единая строка announce.ts, progressLines поиск) (+18 more)

### Community 2 - "Guest Infra & Prompts"
Cohesion: 0.09
Nodes (23): Cluster 15: Always-on automations (daemon-runner, .daemons.yaml, crashloop), buildNewGuestSafetyPrompt(userId, vaultDir): 6 edges, god node, Cluster 10: parallel_mcp mcp__parallel__run для DeepSeek-сессий (seed 10), MCP tool mcp__parallel__run, Consent Gate: src/consent.ts + src/handlers/consent-gate.ts, src/handlers/consent-gate.ts, src/consent.ts: SQLite consent store in metering.sqlite, DOC_VERSION, daemon-runner (Go PID 1 supervisor): 12 edges, top god node (+15 more)

### Community 3 - "Context Compaction & Memory"
Cohesion: 0.1
Nodes (22): compactSession(): summarizes old messages via LLM, replaces with summary block, rewrites sessionFile, estimateContextSize(): reads sessionFile, counts JSON bytes, approximates tokens, buildSummaryPrompt(): prompt for summarizing dialog history, max 2000 words, Feature 3: Context compaction — auto-summarize old messages when approaching token limit, Feature 4: Guest memory — persistent session summaries in /opt/vault/{userId}/memory/, Feature 1: Plan Mode — pre-execution plan with PLAN_START/PLAN_END markers and confirm/cancel/clarify buttons, Feature 5: Redirect interrupt — !<text> aborts current execution and relaunches with new instruction, Feature 2: Todo-list — live progress tracking with TODO_LIST_START/TODO_ITEM/TODO_START/TODO_DONE markers (+14 more)

### Community 4 - "Artyom / Container Users"
Cohesion: 0.14
Nodes (17): src/memory/analyzer-scheduler.ts: 10-min debounce scheduler, Artem user (5615267984): paid test profile on jinru, MCP tool mcp__container__Bash, Fix acceptEdits + allowedTools for paid tier (PAID_ALLOWED_TOOLS 17 names), Smoke Group B — memory (label_index, try/catch, debounce scheduler, forceMemoryFlush), docs/HANDOFF-2026-05-15-night.md, src/memory/analyzer.ts, Metering bugs H1/H2/H3 (token losses on ask-user, stop, memory analyzer) (+9 more)

### Community 5 - "Google Workspace / Composio"
Cohesion: 0.12
Nodes (17): Batch #3: Composio polling correctness + disconnect, Cluster 09: Composio OAuth для Google Workspace (seed 09-composio-google.md), MCP tool mcp__connect-google__disconnect, MCP tool mcp__connect-google__connect, Cluster 09: Composio OAuth for Google Workspace (mcp__connect-google), src/composio.ts: OAuth helpers for Composio Google, connect_google_mcp/server.ts: mcp__connect-google__disconnect tool, Batch #3 Fix — Точный текст подключения Composio (Map<id,status> snapshot) (+9 more)

### Community 6 - "Legal, Consent & DeepSeek Pool"
Cohesion: 0.12
Nodes (16): Branch feature/legal-docs-consent-gate (25 commits, 3e0b1d6..fc6edb8), system/deepseek-blacklist.json: f1a7 blacklisted key filter, DeepSeek Key Pool (src/deepseek-key-pool.ts, least-busy selector), DeepSeek Key Pool: least-busy selector from system/deepseek-keys.json, src/deepseek-key-pool.ts, Smoke Group A — критичные (blacklist, memory filter, subscription pattern), Ротация ключей 2026-05-14 (TG, OpenAI, OpenRouter, DeepSeek×5, Composio), Legal docs: oferta.ts, privacy.ts, terms.ts (IP Enbom K.I., INN 631609033320) (+8 more)

### Community 7 - "Container & Daemon Infra"
Cohesion: 0.17
Nodes (16): Mental model shift: container = ephemeral workspace → personal 24/7 slot, --restart=unless-stopped: containers survive host reboot and docker daemon restart, scripts/monitoring/*: docker stats every minute, 60-point history, alert if avg >70% for 1hr, src/crashloop-watcher.ts: polls <vault>/.daemons-events/*-crashloop.json every 30s, Rationale: 3 daemon limit per user aligns with future Базовый=1/Профи=3/Студия=10 tiers, daemon-runner: Go binary PID 1 in claude-user-sandbox, ~5-10 MB, 15-daemons-and-containers: Always-on container design decisions, .daemons.yaml: manifest file for daemon registration, limit 3 per user (+8 more)

### Community 8 - "Session & Thread Commands"
Cohesion: 0.14
Nodes (15): Команда /new, Команды /threads и /resume_thread (сняты из меню), Fix C — /new instant ack (reply → flush → kill), Smoke Group F — threads (/threads /resume_thread сняты из меню), Pack item 3 — Capacity P0+P2 (DEFAULT_GUEST_CPUS=0.5, GUEST_CPU_OVERRIDES), Pack item 7 — Capacity P1 (MAX_CONCURRENT_CONTAINER_SESSIONS=10), Pack item 2 — Dashboard fix + V-35 (self-reporting, HEAD-роуты, cache-bust), Pack item 1 — pending-deploy прогресс-пузырь (announce, progressMsgId, streaming.ts) (+7 more)

### Community 9 - "Bots & Server Topology"
Cohesion: 0.14
Nodes (14): Telegram Bot @ORCH7_bot, Telegram Bot @proboiAI_bot, Fix: Memory cap 1024 MB (NODE_OPTIONS systemd conf), Fix: per-user OpenRouter sub-keys (createGuestSubKey, $2 limit), Fix: request timeouts OpenRouter/DeepSeek + Claude subprocess (90s/600s), Rationale: Soft quota chosen over kernel quotas (ext4 mount lacks prjquota, remounting risky on live server), Security hardening 2026-05-10 (56 коммитов, S-01..S-53 закрыты), Pre-rotation security pack (23 commits, V--2..V-34, 14 зон) (+6 more)

### Community 10 - "Free Tier & Permission Fixes"
Cohesion: 0.15
Nodes (14): B1: free-tier no longer requests Approve (FREE_DISALLOWED_TOOLS expanded + buildFreeTierPrompt), B3: Mini App Dashboard URL per-host config (DASHBOARD_URL env), src/handlers/commands.ts, commit 10c83d0: fix containerEnabled per-user priority, containerEnabled bugfix: per-user setting takes priority over tier config, forceMemoryFlush double/triple-fire fix: boolean guard flushPendingForUser, FREE_DISALLOWED_TOOLS: blocks Bash/Read/Write/WebFetch/Task for free tier, HTTPS_PROXY for DeepSeek via Hetzner EU tinyproxy (WireGuard 10.200.0.1:3128) (+6 more)

### Community 11 - "Owner Refactor & Migration"
Cohesion: 0.18
Nodes (11): Batch #2: UI / UID / Composio polling / profiler fixes, commit c24994e: refactor owner profile merged into unified guest code-path, Hetzner server 89.167.125.175 (proboi-bot, retired), jinru test server 5.223.82.96 (@ORCH7_bot), Owner exit code 1 bug (orphan process with wrong flags), Owner profile merged into unified guest code-path, Project State 2026-05-16 Night (Owner→paid, Timeweb deploy), Rationale: Owner profile unified with paid guest to fix exit code 1 and orphan process bug (+3 more)

### Community 12 - "Security Hardening Fixes"
Cohesion: 0.22
Nodes (10): Fix B1 — free-tier не просит Approve (FREE_DISALLOWED_TOOLS + buildFreeTierPrompt), Fix B3 — Mini App открывается на jinru (DASHBOARD_URL env + config.ts export), Fix B — env-check info-leak block in prompts, Fix containerEnabled per-user priority over tier config (config.ts:1159), Fix paid permissionMode: acceptEdits (SDK options для tier=paid в session.ts), God Node: buildNewGuestSafetyPrompt(userId, vaultDir) (6 edges), docs/HANDOFF-2026-05-15-evening.md, src/config.ts (+2 more)

### Community 13 - "Payments & Subscription"
Cohesion: 0.4
Nodes (5): Daily limit gate + free doc gate (isDailyLimitReached, upsell CTA), Legal pages (oferta.ts + privacy.ts placeholders), YuKassa payment flow (payments.ts, webhook, activateSubscription, chargeExpiredTrials), src/payments.ts, Состояние 2026-05-11 — YuKassa-фаза + Claude Code Features на TEST

### Community 14 - "Container Spec & Manager"
Cohesion: 0.67
Nodes (3): LXCFS: 7 /proc bind-mounts for cgroup-aware free/top (512MB shown as limit), src/containers/manager.ts: getOrStartUnlocked, lxcfs fallback, src/containers/spec.ts: buildRunArgs with skipLxcfs option

### Community 15 - "Profiler & Plan Features"
Cohesion: 0.67
Nodes (3): Go scheduler daemon: 5.2MB linux/amd64, notify-bridge port 3849, maxDaemons=5, Security audit 2026-05-10: 56 commits, 17 HIGH + 22 MEDIUM + 14 LOW closed, Skill pack: 7 recipes in skills/, bootstrap, migrate-skills.ts

### Community 16 - "Parallel MCP"
Cohesion: 1.0
Nodes (2): Состояние 2026-05-12 — UX hardening на PROD (4 агента аудит), UX hardening (commit e562cb0): resume/pay/invites/voice/text/video/tasks/index

### Community 17 - "Metering & Dashboard"
Cohesion: 1.0
Nodes (2): Cluster 15: Always-on автоматизации daemon-runner + .daemons.yaml (seed 15), God Node: daemon-runner (Go PID 1, 12 edges)

### Community 18 - "UX Hardening"
Cohesion: 1.0
Nodes (2): Cluster 12: subscription gate src/subscription.ts (seed 12), src/subscription.ts

### Community 19 - "Daemon Always-On"
Cohesion: 1.0
Nodes (2): src/memory/graph.ts, src/memory/inject.ts

### Community 20 - "Subscription Gate"
Cohesion: 1.0
Nodes (2): src/templates/landing.ts + assets: proboi.site landing (1188 lines + 1975 lines assets), proboi.site domain (primary, replaces ksenyaenbom.ru and jinru.pro)

### Community 21 - "Idle Heartbeat"
Cohesion: 1.0
Nodes (1): Cluster 13: IdleHeartbeat + idle-phrases.ts (seed 13)

### Community 22 - "Landing Page"
Cohesion: 1.0
Nodes (1): Cluster 14: лендинг proboi.site (seed 14, commit 3c046db)

### Community 23 - "Open Tasks"
Cohesion: 1.0
Nodes (1): Open tasks: parallel_mcp testing, AAAA DNS, hf_llm_mcp, openrouter execSync→async

### Community 24 - "Pre-rotation Security Pack"
Cohesion: 1.0
Nodes (1): commit 01341ca: docs RKN notifications and security article

### Community 25 - "Vault Quota"
Cohesion: 1.0
Nodes (1): commit b629b39: docs update prod address in CLAUDE.md

### Community 26 - "Rationale Nodes"
Cohesion: 1.0
Nodes (1): Open task: Subscription gate activation (REQUIRED_CHANNEL_ID)

### Community 27 - "Open Design"
Cohesion: 1.0
Nodes (1): Trace analysis: local infra ~850ms, DeepSeek LLM 5800-20500ms

### Community 28 - "Fast-Path Engine"
Cohesion: 1.0
Nodes (1): B2: progress bubble dedup (single string, full-array search)

## Knowledge Gaps
- **120 isolated node(s):** `Telegram Bot @proboiAI_bot`, `Telegram Bot @ORCH7_bot`, `Smoke Group G — COMPOSIO_API_KEY скопирован на jinru`, `Smoke Group E — Write vs Bash UID research (only research, no impl)`, `Code-review (Sonnet): 2 HIGH blockers (subscription pattern, memory flush double-fire)` (+115 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Parallel MCP`** (2 nodes): `Состояние 2026-05-12 — UX hardening на PROD (4 агента аудит)`, `UX hardening (commit e562cb0): resume/pay/invites/voice/text/video/tasks/index`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Metering & Dashboard`** (2 nodes): `Cluster 15: Always-on автоматизации daemon-runner + .daemons.yaml (seed 15)`, `God Node: daemon-runner (Go PID 1, 12 edges)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `UX Hardening`** (2 nodes): `Cluster 12: subscription gate src/subscription.ts (seed 12)`, `src/subscription.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Daemon Always-On`** (2 nodes): `src/memory/graph.ts`, `src/memory/inject.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Subscription Gate`** (2 nodes): `src/templates/landing.ts + assets: proboi.site landing (1188 lines + 1975 lines assets)`, `proboi.site domain (primary, replaces ksenyaenbom.ru and jinru.pro)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Idle Heartbeat`** (1 nodes): `Cluster 13: IdleHeartbeat + idle-phrases.ts (seed 13)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Landing Page`** (1 nodes): `Cluster 14: лендинг proboi.site (seed 14, commit 3c046db)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Open Tasks`** (1 nodes): `Open tasks: parallel_mcp testing, AAAA DNS, hf_llm_mcp, openrouter execSync→async`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Pre-rotation Security Pack`** (1 nodes): `commit 01341ca: docs RKN notifications and security article`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Vault Quota`** (1 nodes): `commit b629b39: docs update prod address in CLAUDE.md`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Rationale Nodes`** (1 nodes): `Open task: Subscription gate activation (REQUIRED_CHANNEL_ID)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Open Design`** (1 nodes): `Trace analysis: local infra ~850ms, DeepSeek LLM 5800-20500ms`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Fast-Path Engine`** (1 nodes): `B2: progress bubble dedup (single string, full-array search)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `src/session.ts` connect `Session & Streaming Core` to `Guest Infra & Prompts`, `Artyom / Container Users`, `Legal, Consent & DeepSeek Pool`?**
  _High betweenness centrality (0.195) - this node is a cross-community bridge._
- **Why does `src/session.ts` connect `Batch Smoke Tests & Delivery` to `Artyom / Container Users`, `Google Workspace / Composio`, `Legal, Consent & DeepSeek Pool`, `Session & Thread Commands`, `Bots & Server Topology`, `Security Hardening Fixes`?**
  _High betweenness centrality (0.189) - this node is a cross-community bridge._
- **Why does `src/config.ts` connect `Free Tier & Permission Fixes` to `Guest Infra & Prompts`, `Owner Refactor & Migration`, `Legal, Consent & DeepSeek Pool`?**
  _High betweenness centrality (0.094) - this node is a cross-community bridge._
- **Are the 4 inferred relationships involving `src/session.ts` (e.g. with `parallel_mcp/server.ts: mcp__parallel__run for DeepSeek sessions instead of Task` and `File access blocked fix: /root/.claude/projects/ + /root/.claude/plans/ + /tmp/ allowed for Read`) actually correct?**
  _`src/session.ts` has 4 INFERRED edges - model-reasoned connections that need verification._
- **Are the 2 inferred relationships involving `src/session.ts` (e.g. with `Pack item 4 — P2 Security (V-29 resume-hijack, V-30 transcript sanitize, V-36..V-39)` and `Fix: File access blocked — 3 класса путей разрешены для Read-tool гостей`) actually correct?**
  _`src/session.ts` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `Telegram Bot @proboiAI_bot`, `Telegram Bot @ORCH7_bot`, `Smoke Group G — COMPOSIO_API_KEY скопирован на jinru` to the rest of the system?**
  _120 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Session & Streaming Core` be split into smaller, more focused modules?**
  _Cohesion score 0.07 - nodes in this community are weakly interconnected._