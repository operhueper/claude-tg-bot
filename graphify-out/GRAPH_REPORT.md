# Graph Report - graphify-input  (2026-05-17)

## Corpus Check
- 42 files · ~55,000 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 367 nodes · 397 edges · 42 communities detected
- Extraction: 90% EXTRACTED · 10% INFERRED · 0% AMBIGUOUS · INFERRED: 40 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Bot Releases & Smoke Tests|Bot Releases & Smoke Tests]]
- [[_COMMUNITY_Session Streaming & Abort|Session Streaming & Abort]]
- [[_COMMUNITY_Google OAuth Integration|Google OAuth Integration]]
- [[_COMMUNITY_Parallel MCP & Guest Sandbox|Parallel MCP & Guest Sandbox]]
- [[_COMMUNITY_Context Compaction & Memory v1|Context Compaction & Memory v1]]
- [[_COMMUNITY_Container Security & Free Tier|Container Security & Free Tier]]
- [[_COMMUNITY_DeepSeek Routing & SDK Auth|DeepSeek Routing & SDK Auth]]
- [[_COMMUNITY_Bot Commands & Dashboard|Bot Commands & Dashboard]]
- [[_COMMUNITY_Memory Analyzer & Paid Tier|Memory Analyzer & Paid Tier]]
- [[_COMMUNITY_Legal Branch & DS Key Pool|Legal Branch & DS Key Pool]]
- [[_COMMUNITY_Always-On Containers & Daemons|Always-On Containers & Daemons]]
- [[_COMMUNITY_Timeweb Migration & Latency|Timeweb Migration & Latency]]
- [[_COMMUNITY_Session Commands & Threads|Session Commands & Threads]]
- [[_COMMUNITY_Composio MCP Slim & Auto-suggest|Composio MCP Slim & Auto-suggest]]
- [[_COMMUNITY_Status Bubble UX|Status Bubble UX]]
- [[_COMMUNITY_Payments & Legal Pages|Payments & Legal Pages]]
- [[_COMMUNITY_Memory Toxic Loop & Filter|Memory Toxic Loop & Filter]]
- [[_COMMUNITY_Consent Gate & 242-FZ|Consent Gate & 242-FZ]]
- [[_COMMUNITY_LXCFS & cgroup Visibility|LXCFS & cgroup Visibility]]
- [[_COMMUNITY_Security Audit & Skill Pack|Security Audit & Skill Pack]]
- [[_COMMUNITY_Key Rotation 2026-05-14|Key Rotation 2026-05-14]]
- [[_COMMUNITY_Google Disconnect MCP|Google Disconnect MCP]]
- [[_COMMUNITY_UX Hardening Prod|UX Hardening Prod]]
- [[_COMMUNITY_Daemon-runner God Node|Daemon-runner God Node]]
- [[_COMMUNITY_Subscription Gate|Subscription Gate]]
- [[_COMMUNITY_Memory Graph & Inject|Memory Graph & Inject]]
- [[_COMMUNITY_proboi.site Landing|proboi.site Landing]]
- [[_COMMUNITY_Composio OAuth Flow|Composio OAuth Flow]]
- [[_COMMUNITY_Profiler & DS Latency|Profiler & DS Latency]]
- [[_COMMUNITY_IdleHeartbeat|IdleHeartbeat]]
- [[_COMMUNITY_Landing Commit|Landing Commit]]
- [[_COMMUNITY_Open Tasks|Open Tasks]]
- [[_COMMUNITY_Docs Commit|Docs Commit]]
- [[_COMMUNITY_Prod Address Docs|Prod Address Docs]]
- [[_COMMUNITY_Subscription Channel Gate|Subscription Channel Gate]]
- [[_COMMUNITY_DS LLM Latency Trace|DS LLM Latency Trace]]
- [[_COMMUNITY_Progress Bubble Dedup|Progress Bubble Dedup]]
- [[_COMMUNITY_Env-check Info-leak Fix|Env-check Info-leak Fix]]
- [[_COMMUNITY_Memory Flush Double-fire|Memory Flush Double-fire]]
- [[_COMMUNITY_UX Hardening Commit|UX Hardening Commit]]
- [[_COMMUNITY_proboi.site Landing Sections|proboi.site Landing Sections]]
- [[_COMMUNITY_new Instant Ack|/new Instant Ack]]

## God Nodes (most connected - your core abstractions)
1. `src/session.ts` - 19 edges
2. `src/session.ts` - 17 edges
3. `15-daemons-and-containers: Always-on container design decisions` - 12 edges
4. `src/config.ts` - 12 edges
5. `src/session.ts: ClaudeSession, sendMessageStreaming, SDK query() wrapper, allowedTools` - 11 edges
6. `Smoke-batch 2026-05-16: 12 of 18 items closed` - 10 edges
7. `Batch #2: UI / UID / Composio polling / profiler` - 9 edges
8. `Toxic memory loop: analyzer writes infra errors as facts → injected back → loop` - 8 edges
9. `Состояние 2026-05-15 вечер — пакет из 7 блоков задеплоен на TEST jinru` - 8 edges
10. `src/config.ts` - 8 edges

## Surprising Connections (you probably didn't know these)
- `Pack item 4 — P2 Security (V-29 resume-hijack, V-30 transcript sanitize, V-36..V-39)` --calls--> `src/session.ts`  [INFERRED]
  graphify-input/project_knowledge_graph.md → graphify-input/project_knowledge_graph.md  _Bridges community 12 → community 0_
- `Pack item 4 — P2 Security (V-29 resume-hijack, V-30 transcript sanitize, V-36..V-39)` --calls--> `src/memory/analyzer.ts`  [INFERRED]
  graphify-input/project_knowledge_graph.md → graphify-input/project_knowledge_graph.md  _Bridges community 12 → community 8_
- `parallel_mcp/server.ts: mcp__parallel__run for DeepSeek sessions instead of Task` --references--> `src/session.ts`  [INFERRED]
  graphify-input/project_knowledge_graph.md → graphify-input/project_knowledge_graph.md  _Bridges community 3 → community 1_
- `Зависание DeepSeek API на 9 мин на новом Timeweb IP (возможный throttle)` --prevents--> `OOM fix 2026-05-13: AbortSignal.timeout(90000) на fetch, queryTimeoutMs=600000, memory cap 1024MB`  [INFERRED]
  graphify-input/project_knowledge_graph.md → graphify-input/project_knowledge_graph.md  _Bridges community 11 → community 6_
- `Test Server jinru (5.223.82.96, @ORCH7_bot)` --references--> `Batch #3: Composio polling correctness + disconnect`  [EXTRACTED]
  graphify-input/project_knowledge_graph.md → graphify-input/project_knowledge_graph.md  _Bridges community 0 → community 2_

## Hyperedges (group relationships)
- **Stream Marker Pattern: ring buffer + debounce + marker parsers used by Plan Mode and Todo-list** — stream_marker_buffer, todo_marker_parser, plan_marker_parser, telegram_edit_debounce [INFERRED 0.80]
- **Session summarization shared pattern: compactSession + save_session_memory + buildSummaryPrompt** — compaction_compact_session, save_session_memory, compaction_summary_prompt [INFERRED 0.85]

## Communities

### Community 0 - "Bot Releases & Smoke Tests"
Cohesion: 0.06
Nodes (50): Batch #2: UI / UID / Composio polling / profiler, Smoke-batch 2026-05-16: 12 of 18 items closed, Telegram Bot @ORCH7_bot, Telegram Bot @proboiAI_bot, Команды /memory и /forget, Code-review (Sonnet): 2 HIGH blockers (subscription pattern, memory flush double-fire), Feat: Компакция + Redirect + /memory /forget (commit 633c634), Feat: Todo-list + Plan Mode (TodoMarkerParser, PlanMarkerParser, plan_confirm/cancel) (+42 more)

### Community 1 - "Session Streaming & Abort"
Cohesion: 0.07
Nodes (33): AbortSignal.any + timeout(90_000) on main OpenRouter/DeepSeek fetch, src/announce.ts, Batch #3: Composio polling correctness + disconnect MCP tool, commit 6a2f66c: fix crashes + remove context compression, Composio OAuth polling: 24×5s polling after OAuth button, GRACE_MS=10000, Context compression removed (compactIfNeeded + sanitizeCompactionSummary deleted), Daily limit gate + free doc gate with upsell CTA, src/engines/deepseek-fast.ts: direct REST to DeepSeek without CLI (+25 more)

### Community 2 - "Google OAuth Integration"
Cohesion: 0.08
Nodes (24): Batch #2: UI / UID / Composio polling / profiler fixes, Batch #3: Composio polling correctness + disconnect, Cluster 09: Composio OAuth для Google Workspace (seed 09-composio-google.md), MCP tool mcp__connect-google__disconnect, MCP tool mcp__connect-google__connect, Cluster 09: Composio OAuth for Google Workspace (mcp__connect-google), src/composio.ts: OAuth helpers for Composio Google, connect_google_mcp/server.ts: mcp__connect-google__disconnect tool (+16 more)

### Community 3 - "Parallel MCP & Guest Sandbox"
Cohesion: 0.09
Nodes (23): Cluster 15: Always-on automations (daemon-runner, .daemons.yaml, crashloop), buildNewGuestSafetyPrompt(userId, vaultDir): 6 edges, god node, Cluster 10: parallel_mcp mcp__parallel__run для DeepSeek-сессий (seed 10), MCP tool mcp__parallel__run, Consent Gate: src/consent.ts + src/handlers/consent-gate.ts, src/handlers/consent-gate.ts, src/consent.ts: SQLite consent store in metering.sqlite, DOC_VERSION, daemon-runner (Go PID 1 supervisor): 12 edges, top god node (+15 more)

### Community 4 - "Context Compaction & Memory v1"
Cohesion: 0.1
Nodes (22): compactSession(): summarizes old messages via LLM, replaces with summary block, rewrites sessionFile, estimateContextSize(): reads sessionFile, counts JSON bytes, approximates tokens, buildSummaryPrompt(): prompt for summarizing dialog history, max 2000 words, Feature 3: Context compaction — auto-summarize old messages when approaching token limit, Feature 4: Guest memory — persistent session summaries in /opt/vault/{userId}/memory/, Feature 1: Plan Mode — pre-execution plan with PLAN_START/PLAN_END markers and confirm/cancel/clarify buttons, Feature 5: Redirect interrupt — !<text> aborts current execution and relaunches with new instruction, Feature 2: Todo-list — live progress tracking with TODO_LIST_START/TODO_ITEM/TODO_START/TODO_DONE markers (+14 more)

### Community 5 - "Container Security & Free Tier"
Cohesion: 0.11
Nodes (20): API container→resources Field Rename, API: поле container: → resources: в /api/me и /api/admin/all (убираем слово container из DevTools), B1 fix: free-tier — расширен FREE_DISALLOWED_TOOLS + отдельная buildFreeTierPrompt() без paid-capabilities, containerEnabled bugfix (commit 10c83d0): per-user настройка приоритетнее tier-дефолта, Container Hostname + DNS Blackhole for IP-check Services, Container hostname fix: --hostname proboi-workspace (было user-{userId}), daemon-runner Go PID 1: надсмотрщик контейнеров, God Node с 12 рёбрами, DNS blackhole --add-host для 8 IP-check сервисов → 0.0.0.0 (+12 more)

### Community 6 - "DeepSeek Routing & SDK Auth"
Cohesion: 0.11
Nodes (20): Paid-режим: permissionMode acceptEdits в SDK options для tier=paid в session.ts, Batch #2 Fix E: Write→Bash UID Hook (PostToolUse chown), Context compression полностью удалена из session.ts (commit 6a2f66c): maxSegmentId=99 баг, DeepSeek blacklist: system/deepseek-blacklist.json — f1a7 ключ пропускается, DeepSeek Key Pool (commit 12233f2): least-busy selector из system/deepseek-keys.json, 6 ключей на старте, Фикс File access blocked: /root/.claude/projects/-opt-vault-{userId}/ теперь разрешён для Read-tool гостей, Filesystem Write vs Bash UID mismatch: Write от бота root:600, Bash в контейнере sandbox(1000)→host 101000, Docker image claude-user-sandbox:latest пересобран на jinru (sha256:85315f91, 2.36GB) (+12 more)

### Community 7 - "Bot Commands & Dashboard"
Cohesion: 0.12
Nodes (18): B1: free-tier no longer requests Approve (FREE_DISALLOWED_TOOLS expanded + buildFreeTierPrompt), B3: Mini App Dashboard URL per-host config (DASHBOARD_URL env), src/handlers/commands.ts, commit 10c83d0: fix containerEnabled per-user priority, commit c24994e: refactor owner profile merged into unified guest code-path, containerEnabled bugfix: per-user setting takes priority over tier config, forceMemoryFlush double/triple-fire fix: boolean guard flushPendingForUser, FREE_DISALLOWED_TOOLS: blocks Bash/Read/Write/WebFetch/Task for free tier (+10 more)

### Community 8 - "Memory Analyzer & Paid Tier"
Cohesion: 0.14
Nodes (17): src/memory/analyzer-scheduler.ts: 10-min debounce scheduler, Artem user (5615267984): paid test profile on jinru, MCP tool mcp__container__Bash, Fix acceptEdits + allowedTools for paid tier (PAID_ALLOWED_TOOLS 17 names), Smoke Group B — memory (label_index, try/catch, debounce scheduler, forceMemoryFlush), docs/HANDOFF-2026-05-15-night.md, src/memory/analyzer.ts, Metering bugs H1/H2/H3 (token losses on ask-user, stop, memory analyzer) (+9 more)

### Community 9 - "Legal Branch & DS Key Pool"
Cohesion: 0.12
Nodes (16): Branch feature/legal-docs-consent-gate (25 commits, 3e0b1d6..fc6edb8), system/deepseek-blacklist.json: f1a7 blacklisted key filter, DeepSeek Key Pool (src/deepseek-key-pool.ts, least-busy selector), DeepSeek Key Pool: least-busy selector from system/deepseek-keys.json, src/deepseek-key-pool.ts, Smoke Group A — критичные (blacklist, memory filter, subscription pattern), Ротация ключей 2026-05-14 (TG, OpenAI, OpenRouter, DeepSeek×5, Composio), Legal docs: oferta.ts, privacy.ts, terms.ts (IP Enbom K.I., INN 631609033320) (+8 more)

### Community 10 - "Always-On Containers & Daemons"
Cohesion: 0.17
Nodes (16): Mental model shift: container = ephemeral workspace → personal 24/7 slot, --restart=unless-stopped: containers survive host reboot and docker daemon restart, scripts/monitoring/*: docker stats every minute, 60-point history, alert if avg >70% for 1hr, src/crashloop-watcher.ts: polls <vault>/.daemons-events/*-crashloop.json every 30s, Rationale: 3 daemon limit per user aligns with future Базовый=1/Профи=3/Студия=10 tiers, daemon-runner: Go binary PID 1 in claude-user-sandbox, ~5-10 MB, 15-daemons-and-containers: Always-on container design decisions, .daemons.yaml: manifest file for daemon registration, limit 3 per user (+8 more)

### Community 11 - "Timeweb Migration & Latency"
Cohesion: 0.12
Nodes (16): B3 fix: DASHBOARD_URL per-host env в config.ts, 4 хардкода в commands.ts заменены, Зависание DeepSeek API на 9 мин на новом Timeweb IP (возможный throttle), Trace-анализ: локальная инфра ~850мс, DeepSeek round-trip 5800-9100мс до first_tool, gVisor runsc Runtime for Guest Containers, Hetzner 89.167.125.175 (proboi-bot) выведен из hot-standby после миграции на Timeweb, HTTPS_PROXY for DeepSeek via Hetzner WireGuard Tunnel, HTTPS_PROXY для DeepSeek через Hetzner EU tinyproxy (WireGuard туннель 10.200.0.1:3128), Owner Profile Merged into Unified Guest Code-path (+8 more)

### Community 12 - "Session Commands & Threads"
Cohesion: 0.14
Nodes (15): Команда /new, Команды /threads и /resume_thread (сняты из меню), Fix C — /new instant ack (reply → flush → kill), Smoke Group F — threads (/threads /resume_thread сняты из меню), Pack item 3 — Capacity P0+P2 (DEFAULT_GUEST_CPUS=0.5, GUEST_CPU_OVERRIDES), Pack item 7 — Capacity P1 (MAX_CONCURRENT_CONTAINER_SESSIONS=10), Pack item 2 — Dashboard fix + V-35 (self-reporting, HEAD-роуты, cache-bust), Pack item 1 — pending-deploy прогресс-пузырь (announce, progressMsgId, streaming.ts) (+7 more)

### Community 13 - "Composio MCP Slim & Auto-suggest"
Cohesion: 0.14
Nodes (14): Auto-suggest /new After 16 Turns, Batch #2 Fix B: Env-check Info-leak Fix, Composio Google MCP Slim (v3), Conditional Composio MCP Loading (googleConnected flag), src/config.ts: Owner Profile + Prompt Changes, src/dashboard-server.ts: Disconnect Resets googleConnected, googleConnected Flag in UserNode, HISTORY_LIMIT 12→8 Reduction (+6 more)

### Community 14 - "Status Bubble UX"
Cohesion: 0.22
Nodes (9): B2 fix: дедуп прогресс-пузыря — единая строка, A→B→A→B схлопывается, Batch #2 Fix D: Composio OAuth Polling (24×5s), Batch #2 Fix A: Single Status Bubble, Batch #2 Fix A: один пузырь статуса — удалены progressLines, дедуп ×N, маппинг •, Batch #3: Accurate Google Connection Text, Batch #3: точный текст подключения Composio (pre-snapshot Map<id,status>, GRACE_MS=10000), Composio OAuth Grace Period (GRACE_MS=10000ms), src/handlers/streaming.ts: StreamingState, statusCallback, progress bubble, Composio polling (+1 more)

### Community 15 - "Payments & Legal Pages"
Cohesion: 0.4
Nodes (5): Daily limit gate + free doc gate (isDailyLimitReached, upsell CTA), Legal pages (oferta.ts + privacy.ts placeholders), YuKassa payment flow (payments.ts, webhook, activateSubscription, chargeExpiredTrials), src/payments.ts, Состояние 2026-05-11 — YuKassa-фаза + Claude Code Features на TEST

### Community 16 - "Memory Toxic Loop & Filter"
Cohesion: 0.4
Nodes (5): Память Артёма (5615267984) очищена дважды + CLI transcript кэш удалён, Memory analyzer fixes: label_index ??= {}, try/catch code 1, debounce-scheduler 10 мин, Фильтр памяти: regex для терминов подписки/тарифа — блокирует toxic-loop injection, SUBSCRIPTION_PATTERN false positive: старый regex ловил «профиль», «базовый», «студия» — ужесточён, Токсичная петля памяти Артёма: memory/analyzer.ts записывает инфра-ошибки → CLAUDE.md читает → модель повторяет

### Community 17 - "Consent Gate & 242-FZ"
Cohesion: 0.4
Nodes (5): Consent Gate (commit 8c62b1d): SQLite consent.ts, DOC_VERSION=2026-05-14, middleware блокирует всё до согласия, Юридические документы: oferta.ts, privacy.ts, terms.ts — ИП Энбом К.И., 152-ФЗ, ЗоЗПП, Rationale: Consent Gate — 242-ФЗ требования локализации ПДн и явного согласия пользователя, RF-DB migration (docs/arch-migration-rf-db.md): 242-ФЗ, user-db microservice на localhost:3900, YuKassa payment flow: payments.ts, webhook, binding link, chargeExpiredTrials, /cancel команда

### Community 18 - "LXCFS & cgroup Visibility"
Cohesion: 0.67
Nodes (3): LXCFS: 7 /proc bind-mounts for cgroup-aware free/top (512MB shown as limit), src/containers/manager.ts: getOrStartUnlocked, lxcfs fallback, src/containers/spec.ts: buildRunArgs with skipLxcfs option

### Community 19 - "Security Audit & Skill Pack"
Cohesion: 0.67
Nodes (3): Go scheduler daemon: 5.2MB linux/amd64, notify-bridge port 3849, maxDaemons=5, Security audit 2026-05-10: 56 commits, 17 HIGH + 22 MEDIUM + 14 LOW closed, Skill pack: 7 recipes in skills/, bootstrap, migrate-skills.ts

### Community 20 - "Key Rotation 2026-05-14"
Cohesion: 0.67
Nodes (3): Ротация ключей 2026-05-14: TG, OpenAI, OpenRouter, DeepSeek×5, Composio — все 5 ротированы, Security hardening завершён: 27 фиксов (V--2..V-34), ротация ключей завершена (2026-05-14), Триггер security: утечка TELEGRAM_BOT_TOKEN через Артёма (cat /opt/claude-tg-bot/.env под root)

### Community 21 - "Google Disconnect MCP"
Cohesion: 0.67
Nodes (3): Batch #3: mcp__connect-google__disconnect Tool, connect_google_mcp/server.ts: disconnect Tool Added, PAID_ALLOWED_TOOLS List (17 tools including disconnect)

### Community 22 - "UX Hardening Prod"
Cohesion: 1.0
Nodes (2): Состояние 2026-05-12 — UX hardening на PROD (4 агента аудит), UX hardening (commit e562cb0): resume/pay/invites/voice/text/video/tasks/index

### Community 23 - "Daemon-runner God Node"
Cohesion: 1.0
Nodes (2): Cluster 15: Always-on автоматизации daemon-runner + .daemons.yaml (seed 15), God Node: daemon-runner (Go PID 1, 12 edges)

### Community 24 - "Subscription Gate"
Cohesion: 1.0
Nodes (2): Cluster 12: subscription gate src/subscription.ts (seed 12), src/subscription.ts

### Community 25 - "Memory Graph & Inject"
Cohesion: 1.0
Nodes (2): src/memory/graph.ts, src/memory/inject.ts

### Community 26 - "proboi.site Landing"
Cohesion: 1.0
Nodes (2): src/templates/landing.ts + assets: proboi.site landing (1188 lines + 1975 lines assets), proboi.site domain (primary, replaces ksenyaenbom.ru and jinru.pro)

### Community 27 - "Composio OAuth Flow"
Cohesion: 1.0
Nodes (2): Batch #3: MCP mcp__connect-google__disconnect — DELETE /api/v3/connected_accounts/{id}, Composio Google Workspace MCP: /google заменён на mcp__connect-google, OAuth-кнопки, 146+ тулзов

### Community 28 - "Profiler & DS Latency"
Cohesion: 1.0
Nodes (2): Batch #2 Fix F: Profiler Marks (6 blind spots), DeepSeek Latency Trace Analysis (10 Artyom requests)

### Community 29 - "IdleHeartbeat"
Cohesion: 1.0
Nodes (1): Cluster 13: IdleHeartbeat + idle-phrases.ts (seed 13)

### Community 30 - "Landing Commit"
Cohesion: 1.0
Nodes (1): Cluster 14: лендинг proboi.site (seed 14, commit 3c046db)

### Community 31 - "Open Tasks"
Cohesion: 1.0
Nodes (1): Open tasks: parallel_mcp testing, AAAA DNS, hf_llm_mcp, openrouter execSync→async

### Community 32 - "Docs Commit"
Cohesion: 1.0
Nodes (1): commit 01341ca: docs RKN notifications and security article

### Community 33 - "Prod Address Docs"
Cohesion: 1.0
Nodes (1): commit b629b39: docs update prod address in CLAUDE.md

### Community 34 - "Subscription Channel Gate"
Cohesion: 1.0
Nodes (1): Open task: Subscription gate activation (REQUIRED_CHANNEL_ID)

### Community 35 - "DS LLM Latency Trace"
Cohesion: 1.0
Nodes (1): Trace analysis: local infra ~850ms, DeepSeek LLM 5800-20500ms

### Community 36 - "Progress Bubble Dedup"
Cohesion: 1.0
Nodes (1): B2: progress bubble dedup (single string, full-array search)

### Community 37 - "Env-check Info-leak Fix"
Cohesion: 1.0
Nodes (1): Batch #2 Fix B: info-leak в env-check — запрет df, free, uname, cat /proc/*, lscpu в промптах

### Community 38 - "Memory Flush Double-fire"
Cohesion: 1.0
Nodes (1): forceMemoryFlush double/triple-fire: boolean из flushPendingForUser защищает от параллельных запусков

### Community 39 - "UX Hardening Commit"
Cohesion: 1.0
Nodes (1): UX hardening (commit e562cb0): русификация, утечка блокировки в text.ts, video.ts перезапись

### Community 40 - "proboi.site Landing Sections"
Cohesion: 1.0
Nodes (1): Лендинг proboi.site (commit 3c046db): 17 секций, 3163 строки, маршруты /how-to-setup и /assets/

### Community 41 - "/new Instant Ack"
Cohesion: 1.0
Nodes (1): Batch #2 Fix C: /new Instant Ack

## Knowledge Gaps
- **182 isolated node(s):** `Telegram Bot @proboiAI_bot`, `Telegram Bot @ORCH7_bot`, `Smoke Group G — COMPOSIO_API_KEY скопирован на jinru`, `Smoke Group E — Write vs Bash UID research (only research, no impl)`, `Code-review (Sonnet): 2 HIGH blockers (subscription pattern, memory flush double-fire)` (+177 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `UX Hardening Prod`** (2 nodes): `Состояние 2026-05-12 — UX hardening на PROD (4 агента аудит)`, `UX hardening (commit e562cb0): resume/pay/invites/voice/text/video/tasks/index`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Daemon-runner God Node`** (2 nodes): `Cluster 15: Always-on автоматизации daemon-runner + .daemons.yaml (seed 15)`, `God Node: daemon-runner (Go PID 1, 12 edges)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Subscription Gate`** (2 nodes): `Cluster 12: subscription gate src/subscription.ts (seed 12)`, `src/subscription.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Memory Graph & Inject`** (2 nodes): `src/memory/graph.ts`, `src/memory/inject.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `proboi.site Landing`** (2 nodes): `src/templates/landing.ts + assets: proboi.site landing (1188 lines + 1975 lines assets)`, `proboi.site domain (primary, replaces ksenyaenbom.ru and jinru.pro)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Composio OAuth Flow`** (2 nodes): `Batch #3: MCP mcp__connect-google__disconnect — DELETE /api/v3/connected_accounts/{id}`, `Composio Google Workspace MCP: /google заменён на mcp__connect-google, OAuth-кнопки, 146+ тулзов`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Profiler & DS Latency`** (2 nodes): `Batch #2 Fix F: Profiler Marks (6 blind spots)`, `DeepSeek Latency Trace Analysis (10 Artyom requests)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `IdleHeartbeat`** (1 nodes): `Cluster 13: IdleHeartbeat + idle-phrases.ts (seed 13)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Landing Commit`** (1 nodes): `Cluster 14: лендинг proboi.site (seed 14, commit 3c046db)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Open Tasks`** (1 nodes): `Open tasks: parallel_mcp testing, AAAA DNS, hf_llm_mcp, openrouter execSync→async`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Docs Commit`** (1 nodes): `commit 01341ca: docs RKN notifications and security article`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Prod Address Docs`** (1 nodes): `commit b629b39: docs update prod address in CLAUDE.md`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Subscription Channel Gate`** (1 nodes): `Open task: Subscription gate activation (REQUIRED_CHANNEL_ID)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `DS LLM Latency Trace`** (1 nodes): `Trace analysis: local infra ~850ms, DeepSeek LLM 5800-20500ms`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Progress Bubble Dedup`** (1 nodes): `B2: progress bubble dedup (single string, full-array search)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Env-check Info-leak Fix`** (1 nodes): `Batch #2 Fix B: info-leak в env-check — запрет df, free, uname, cat /proc/*, lscpu в промптах`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Memory Flush Double-fire`** (1 nodes): `forceMemoryFlush double/triple-fire: boolean из flushPendingForUser защищает от параллельных запусков`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `UX Hardening Commit`** (1 nodes): `UX hardening (commit e562cb0): русификация, утечка блокировки в text.ts, video.ts перезапись`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `proboi.site Landing Sections`** (1 nodes): `Лендинг proboi.site (commit 3c046db): 17 секций, 3163 строки, маршруты /how-to-setup и /assets/`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `/new Instant Ack`** (1 nodes): `Batch #2 Fix C: /new Instant Ack`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `src/session.ts` connect `Session Streaming & Abort` to `Memory Analyzer & Paid Tier`, `Legal Branch & DS Key Pool`, `Parallel MCP & Guest Sandbox`?**
  _High betweenness centrality (0.100) - this node is a cross-community bridge._
- **Why does `src/session.ts` connect `Bot Releases & Smoke Tests` to `Memory Analyzer & Paid Tier`, `Legal Branch & DS Key Pool`, `Google OAuth Integration`, `Session Commands & Threads`?**
  _High betweenness centrality (0.097) - this node is a cross-community bridge._
- **Why does `src/config.ts` connect `Bot Commands & Dashboard` to `Legal Branch & DS Key Pool`, `Parallel MCP & Guest Sandbox`?**
  _High betweenness centrality (0.048) - this node is a cross-community bridge._
- **Are the 4 inferred relationships involving `src/session.ts` (e.g. with `parallel_mcp/server.ts: mcp__parallel__run for DeepSeek sessions instead of Task` and `File access blocked fix: /root/.claude/projects/ + /root/.claude/plans/ + /tmp/ allowed for Read`) actually correct?**
  _`src/session.ts` has 4 INFERRED edges - model-reasoned connections that need verification._
- **Are the 2 inferred relationships involving `src/session.ts` (e.g. with `Pack item 4 — P2 Security (V-29 resume-hijack, V-30 transcript sanitize, V-36..V-39)` and `Fix: File access blocked — 3 класса путей разрешены для Read-tool гостей`) actually correct?**
  _`src/session.ts` has 2 INFERRED edges - model-reasoned connections that need verification._
- **Are the 2 inferred relationships involving `src/session.ts: ClaudeSession, sendMessageStreaming, SDK query() wrapper, allowedTools` (e.g. with `Фикс File access blocked: /root/.claude/projects/-opt-vault-{userId}/ теперь разрешён для Read-tool гостей` and `parallel_mcp/server.ts: mcp__parallel__run для DeepSeek-сессий вместо Task`) actually correct?**
  _`src/session.ts: ClaudeSession, sendMessageStreaming, SDK query() wrapper, allowedTools` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `Telegram Bot @proboiAI_bot`, `Telegram Bot @ORCH7_bot`, `Smoke Group G — COMPOSIO_API_KEY скопирован на jinru` to the rest of the system?**
  _182 weakly-connected nodes found - possible documentation gaps or missing edges._