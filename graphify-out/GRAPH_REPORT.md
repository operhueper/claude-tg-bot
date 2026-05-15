# Graph Report - graphify-input  (2026-05-15)

## Corpus Check
- 3 files · ~6,000 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 265 nodes · 309 edges · 29 communities detected
- Extraction: 95% EXTRACTED · 5% INFERRED · 0% AMBIGUOUS · INFERRED: 15 edges (avg confidence: 0.83)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 10|Community 10]]
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_Community 12|Community 12]]
- [[_COMMUNITY_Community 13|Community 13]]
- [[_COMMUNITY_Community 14|Community 14]]
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_Community 16|Community 16]]
- [[_COMMUNITY_Community 17|Community 17]]
- [[_COMMUNITY_Community 18|Community 18]]
- [[_COMMUNITY_Community 19|Community 19]]
- [[_COMMUNITY_Community 20|Community 20]]
- [[_COMMUNITY_Community 21|Community 21]]
- [[_COMMUNITY_Community 22|Community 22]]
- [[_COMMUNITY_Community 23|Community 23]]
- [[_COMMUNITY_Community 24|Community 24]]
- [[_COMMUNITY_Community 25|Community 25]]
- [[_COMMUNITY_Community 26|Community 26]]
- [[_COMMUNITY_Community 27|Community 27]]
- [[_COMMUNITY_Community 28|Community 28]]

## God Nodes (most connected - your core abstractions)
1. `src/session.ts` - 17 edges
2. `15-daemons-and-containers: Always-on container design decisions` - 12 edges
3. `Audit-fixes sprint: 25 atomic commits (2026-05-13 evening)` - 11 edges
4. `Security hardening: 9 targeted fixes (commit 39be7ab, 2026-05-13)` - 10 edges
5. `Smoke-batch 2026-05-16: 12 of 18 items closed` - 10 edges
6. `Tier enforcement hardening (2026-05-13) — SQLite daily counter` - 9 edges
7. `Batch #2: UI / UID / Composio polling / profiler` - 9 edges
8. `Состояние 2026-05-15 вечер — пакет из 7 блоков задеплоен на TEST jinru` - 8 edges
9. `src/config.ts` - 8 edges
10. `src/session.ts` - 7 edges

## Surprising Connections (you probably didn't know these)
- `src/session.ts` --used_by--> `parallel_mcp/server.ts`  [INFERRED]
  graphify-input/project_knowledge_graph.md → graphify-input/project_knowledge_graph.md  _Bridges community 0 → community 14_
- `Pack item 4 — P2 Security (V-29 resume-hijack, V-30 transcript sanitize, V-36..V-39)` --calls--> `src/session.ts`  [INFERRED]
  graphify-input/project_knowledge_graph.md → graphify-input/project_knowledge_graph.md  _Bridges community 3 → community 6_
- `src/consent.ts` --stores_data_in--> `metering.sqlite (SQLite DB)`  [EXTRACTED]
  graphify-input/project_knowledge_graph.md → graphify-input/project_knowledge_graph.md  _Bridges community 9 → community 2_
- `src/session.ts` --located_in--> `Metering bugs H1/H2/H3/M1/M2/M3 (token loss at ask-user, stop, memory analyzer)`  [EXTRACTED]
  graphify-input/project_knowledge_graph.md → graphify-input/project_knowledge_graph.md  _Bridges community 0 → community 6_
- `src/handlers/callback.ts` --affected--> `Tier enforcement hardening (2026-05-13) — SQLite daily counter`  [EXTRACTED]
  graphify-input/project_knowledge_graph.md → graphify-input/project_knowledge_graph.md  _Bridges community 0 → community 2_

## Hyperedges (group relationships)
- **Batch #2 и Batch #3 задеплоены на jinru, прод заморожен до smoke** — pkg_batch2, pkg_batch3, pkg_server_jinru, pkg_server_prod, pkg_rationale_no_prod_deploy [EXTRACTED 1.00]
- **Токсичная петля памяти: analyzer → саммари → инъекция → петля → фиксы Group B** — pkg_toxic_memory_loop, pkg_src_memory_analyzer, pkg_fix_group_b_memory, pkg_src_analyzer_scheduler, pkg_rationale_memory_filter [EXTRACTED 1.00]
- **Security pack 2026-05-14: 27 фиксов + ротация ключей + userns-remap на оба сервера** — pkg_security_pack_0514, pkg_key_rotation, pkg_v26_userns_remap, pkg_server_prod, pkg_server_jinru, pkg_branch_legal_consent [EXTRACTED 1.00]

## Communities

### Community 0 - "Community 0"
Cohesion: 0.08
Nodes (31): C-2: profile.md prompt injection: wrapAsProfileData() (session.ts), src/handlers/callback.ts, src/handlers/commands.ts, compactIfNeeded() (session.ts), Compact thresholds ×2: guest 100k, owner 320k (DeepSeek V4 1M ctx), src/config.ts, containerEnabled bugfix: per-user > tier-default (10c83d0), DeepSeek Key Pool (commit 12233f2) (+23 more)

### Community 1 - "Community 1"
Cohesion: 0.09
Nodes (27): Batch #2: UI / UID / Composio polling / profiler, Batch #3: Composio polling correctness + disconnect, Telegram Bot @ORCH7_bot, Fix A — Single status bubble (дедуп прогресс-пузыря), Fix B1 — free-tier не просит Approve (FREE_DISALLOWED_TOOLS + buildFreeTierPrompt), Fix B2 — dedup прогресс-пузыря (единая строка announce.ts, progressLines поиск), Fix B3 — Mini App открывается на jinru (DASHBOARD_URL env + config.ts export), Fix B — env-check info-leak block in prompts (+19 more)

### Community 2 - "Community 2"
Cohesion: 0.1
Nodes (26): src/handlers/audio.ts, Audit-fixes sprint: 25 atomic commits (2026-05-13 evening), C-1: voice.ts rate limit moved after acquireUserLock, src/containers/bash-mcp.ts (mcp__container__Bash), CRIT-01: /root/.claude/projects/* owner-only (ae0d652), CRIT-02: mcp__container__Bash BLOCKED_PATTERNS_CONTAINER (7fde99c), CRIT-03: heartbeat leak closed all 5 handlers (e60e32e), CRIT-04: double-billing on retry fixed, request_id unique index (9f2d3b5) (+18 more)

### Community 3 - "Community 3"
Cohesion: 0.09
Nodes (26): MCP tool mcp__container__Bash, Команда /new, Команды /threads и /resume_thread (сняты из меню), Fix acceptEdits + allowedTools for paid tier (PAID_ALLOWED_TOOLS 17 names), Fix C — /new instant ack (reply → flush → kill), Smoke Group B — memory (label_index, try/catch, debounce scheduler, forceMemoryFlush), Smoke Group F — threads (/threads /resume_thread сняты из меню), docs/HANDOFF-2026-05-15-night.md (+18 more)

### Community 4 - "Community 4"
Cohesion: 0.1
Nodes (22): compactSession(): summarizes old messages via LLM, replaces with summary block, rewrites sessionFile, estimateContextSize(): reads sessionFile, counts JSON bytes, approximates tokens, buildSummaryPrompt(): prompt for summarizing dialog history, max 2000 words, Feature 3: Context compaction — auto-summarize old messages when approaching token limit, Feature 4: Guest memory — persistent session summaries in /opt/vault/{userId}/memory/, Feature 1: Plan Mode — pre-execution plan with PLAN_START/PLAN_END markers and confirm/cancel/clarify buttons, Feature 5: Redirect interrupt — !<text> aborts current execution and relaunches with new instruction, Feature 2: Todo-list — live progress tracking with TODO_LIST_START/TODO_ITEM/TODO_START/TODO_DONE markers (+14 more)

### Community 5 - "Community 5"
Cohesion: 0.11
Nodes (18): Smoke-batch 2026-05-16: 12 of 18 items closed, Branch feature/legal-docs-consent-gate (25 commits, 3e0b1d6..fc6edb8), Code-review (Sonnet): 2 HIGH blockers (subscription pattern, memory flush double-fire), Consent Gate (src/consent.ts + src/handlers/consent-gate.ts), system/deepseek-blacklist.json (новый), DeepSeek Key Pool (src/deepseek-key-pool.ts, least-busy selector), Smoke Group A — критичные (blacklist, memory filter, subscription pattern), Smoke Group E — Write vs Bash UID research (only research, no impl) (+10 more)

### Community 6 - "Community 6"
Cohesion: 0.15
Nodes (18): Команды /memory и /forget, Feat: Компакция + Redirect + /memory /forget (commit 633c634), Feat: Todo-list + Plan Mode (TodoMarkerParser, PlanMarkerParser, plan_confirm/cancel), Fix: удалена context compression (compactIfNeeded + sanitizeCompactionSummary), Fix F — Profiler marks (6 blindspot marks, PROFILER_ENABLED), Fix: File access blocked — 3 класса путей разрешены для Read-tool гостей, Smoke Group D+H — промпты + профилировщик (КРАТКОСТЬ И СУТЬ, profiler.ts), Fix: request timeouts OpenRouter/DeepSeek + Claude subprocess (90s/600s) (+10 more)

### Community 7 - "Community 7"
Cohesion: 0.17
Nodes (16): Mental model shift: container = ephemeral workspace → personal 24/7 slot, --restart=unless-stopped: containers survive host reboot and docker daemon restart, scripts/monitoring/*: docker stats every minute, 60-point history, alert if avg >70% for 1hr, src/crashloop-watcher.ts: polls <vault>/.daemons-events/*-crashloop.json every 30s, Rationale: 3 daemon limit per user aligns with future Базовый=1/Профи=3/Студия=10 tiers, daemon-runner: Go binary PID 1 in claude-user-sandbox, ~5-10 MB, 15-daemons-and-containers: Always-on container design decisions, .daemons.yaml: manifest file for daemon registration, limit 3 per user (+8 more)

### Community 8 - "Community 8"
Cohesion: 0.13
Nodes (15): audit/2026-05-14-pre-rotation/ (23 docs + FIX_PLAN + VULNERABILITIES), Telegram Bot @proboiAI_bot, Fix: Memory cap 1024 MB (NODE_OPTIONS systemd conf), Fix: per-user OpenRouter sub-keys (createGuestSubKey, $2 limit), Key Rotation TODO (TG/OPENAI/OPENROUTER/DEEPSEEK/COMPOSIO), Rationale: Мягкая квота вместо kernel quota — ext4 без prjquota, remount рискован, Rationale: userns-remap uid offset 100000 (UID escape → host UID 101000, no access to other vaults), Security hardening 2026-05-10 (56 коммитов, S-01..S-53 закрыты) (+7 more)

### Community 9 - "Community 9"
Cohesion: 0.14
Nodes (14): Consent Gate (commit 8c62b1d), src/handlers/consent-gate.ts, src/consent.ts, DOC_VERSION=2026-05-14, src/index.ts, ИП Энбом Ксения Игоревна (ИНН 631609033320), legal/ (internal PDN docs), Legal Documents (commit 8c62b1d) (+6 more)

### Community 10 - "Community 10"
Cohesion: 0.29
Nodes (7): Cluster 09: Composio OAuth для Google Workspace (seed 09-composio-google.md), MCP tool mcp__connect-google__disconnect, MCP tool mcp__connect-google__connect, connect_google_mcp/server.ts, Batch #3 Fix — mcp__connect-google__disconnect tool, src/composio.ts, src/mcp-filter.ts

### Community 11 - "Community 11"
Cohesion: 0.33
Nodes (6): src/dashboard-server.ts, notify-bridge container ownership fix (dashboard-server.ts), src/payments.ts, src/tasks.ts, src/user-registry.ts (UserNode, addUser), YuKassa payment flow (src/payments.ts, 2026-05-11)

### Community 12 - "Community 12"
Cohesion: 0.4
Nodes (5): Alert chain: alert-bot → owner-alerts → problem channel, Always-on automations cluster (seed 15: daemon-runner, .daemons.yaml, crashloop), Cluster 15: Always-on автоматизации daemon-runner + .daemons.yaml (seed 15), God Node: daemon-runner (Go PID 1, 12 edges), .daemons.yaml manifest — 6 edges

### Community 13 - "Community 13"
Cohesion: 0.4
Nodes (5): Daily limit gate + free doc gate (isDailyLimitReached, upsell CTA), Legal pages (oferta.ts + privacy.ts placeholders), YuKassa payment flow (payments.ts, webhook, activateSubscription, chargeExpiredTrials), src/payments.ts, Состояние 2026-05-11 — YuKassa-фаза + Claude Code Features на TEST

### Community 14 - "Community 14"
Cohesion: 0.67
Nodes (4): Cluster 10: parallel_mcp mcp__parallel__run для DeepSeek-сессий (seed 10), MCP tool mcp__parallel__run, God Node: parallel_mcp/server.ts mcp__parallel__run (7 edges), parallel_mcp/server.ts

### Community 15 - "Community 15"
Cohesion: 0.67
Nodes (3): src/templates/landing.ts (proboi.site landing, 1188 lines), proboi.site (89.167.125.175, prod domain), proboi-bot (89.167.125.175, @proboiAI_bot)

### Community 16 - "Community 16"
Cohesion: 0.67
Nodes (3): lxcfs fallback fix: kernel 6.8.0-90 read-only bind-mount (manager.ts), src/containers/manager.ts, src/containers/spec.ts (buildRunArgs)

### Community 17 - "Community 17"
Cohesion: 1.0
Nodes (2): OPENROUTER_API_KEY (env), Vision pipeline (OpenRouter Gemini Flash)

### Community 18 - "Community 18"
Cohesion: 1.0
Nodes (2): src/composio.ts, src/mcp-filter.ts

### Community 19 - "Community 19"
Cohesion: 1.0
Nodes (2): src/engines/deepseek-fast.ts (uncommitted), src/fast-path.ts (uncommitted)

### Community 20 - "Community 20"
Cohesion: 1.0
Nodes (2): Egress pipeline: setup→monitor→reset via systemd, scripts/firewall/egress-monitor.sh — 6 edges

### Community 21 - "Community 21"
Cohesion: 1.0
Nodes (2): Состояние 2026-05-12 — UX hardening на PROD (4 агента аудит), UX hardening (commit e562cb0): resume/pay/invites/voice/text/video/tasks/index

### Community 22 - "Community 22"
Cohesion: 1.0
Nodes (2): Cluster 12: subscription gate src/subscription.ts (seed 12), src/subscription.ts

### Community 23 - "Community 23"
Cohesion: 1.0
Nodes (1): src/idle-phrases.ts (130 heartbeat phrases)

### Community 24 - "Community 24"
Cohesion: 1.0
Nodes (1): src/templates/assets/ (CSS/JS, 3 files, 1975 lines)

### Community 25 - "Community 25"
Cohesion: 1.0
Nodes (1): jinru (5.223.82.96, @ORCH7_bot, disabled)

### Community 26 - "Community 26"
Cohesion: 1.0
Nodes (1): Cluster 13: IdleHeartbeat + idle-phrases.ts (seed 13)

### Community 27 - "Community 27"
Cohesion: 1.0
Nodes (1): Cluster 14: лендинг proboi.site (seed 14, commit 3c046db)

### Community 28 - "Community 28"
Cohesion: 1.0
Nodes (1): Открытые задачи (AAAA DNS, hf_llm_mcp, execSync async, parallel test)

## Knowledge Gaps
- **125 isolated node(s):** `src/handlers/consent-gate.ts`, `DOC_VERSION=2026-05-14`, `system/deepseek-keys.json`, `src/templates/oferta.ts`, `src/templates/privacy.ts` (+120 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Community 17`** (2 nodes): `OPENROUTER_API_KEY (env)`, `Vision pipeline (OpenRouter Gemini Flash)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 18`** (2 nodes): `src/composio.ts`, `src/mcp-filter.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 19`** (2 nodes): `src/engines/deepseek-fast.ts (uncommitted)`, `src/fast-path.ts (uncommitted)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 20`** (2 nodes): `Egress pipeline: setup→monitor→reset via systemd`, `scripts/firewall/egress-monitor.sh — 6 edges`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 21`** (2 nodes): `Состояние 2026-05-12 — UX hardening на PROD (4 агента аудит)`, `UX hardening (commit e562cb0): resume/pay/invites/voice/text/video/tasks/index`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 22`** (2 nodes): `Cluster 12: subscription gate src/subscription.ts (seed 12)`, `src/subscription.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 23`** (1 nodes): `src/idle-phrases.ts (130 heartbeat phrases)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 24`** (1 nodes): `src/templates/assets/ (CSS/JS, 3 files, 1975 lines)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 25`** (1 nodes): `jinru (5.223.82.96, @ORCH7_bot, disabled)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 26`** (1 nodes): `Cluster 13: IdleHeartbeat + idle-phrases.ts (seed 13)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 27`** (1 nodes): `Cluster 14: лендинг proboi.site (seed 14, commit 3c046db)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 28`** (1 nodes): `Открытые задачи (AAAA DNS, hf_llm_mcp, execSync async, parallel test)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Metering bugs H1/H2/H3/M1/M2/M3 (token loss at ask-user, stop, memory analyzer)` connect `Community 6` to `Community 0`, `Community 3`?**
  _High betweenness centrality (0.276) - this node is a cross-community bridge._
- **Why does `src/session.ts` connect `Community 6` to `Community 1`, `Community 10`, `Community 3`, `Community 5`?**
  _High betweenness centrality (0.262) - this node is a cross-community bridge._
- **Why does `Tier enforcement hardening (2026-05-13) — SQLite daily counter` connect `Community 2` to `Community 0`, `Community 6`?**
  _High betweenness centrality (0.174) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `src/session.ts` (e.g. with `Pack item 4 — P2 Security (V-29 resume-hijack, V-30 transcript sanitize, V-36..V-39)` and `Fix: File access blocked — 3 класса путей разрешены для Read-tool гостей`) actually correct?**
  _`src/session.ts` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `src/handlers/consent-gate.ts`, `DOC_VERSION=2026-05-14`, `system/deepseek-keys.json` to the rest of the system?**
  _125 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.08 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.09 - nodes in this community are weakly interconnected._