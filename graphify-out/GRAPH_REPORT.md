# Graph Report - graphify-input  (2026-05-13)

## Corpus Check
- Corpus is ~7,684 words - fits in a single context window. You may not need a graph.

## Summary
- 122 nodes · 138 edges · 20 communities detected
- Extraction: 93% EXTRACTED · 7% INFERRED · 0% AMBIGUOUS · INFERRED: 9 edges (avg confidence: 0.84)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Context Compaction|Context Compaction]]
- [[_COMMUNITY_Guest UX & Commands|Guest UX & Commands]]
- [[_COMMUNITY_Container Infra & Daemons|Container Infra & Daemons]]
- [[_COMMUNITY_Claude Code Features 2026-05|Claude Code Features 2026-05]]
- [[_COMMUNITY_Security Hardening & Handlers|Security Hardening & Handlers]]
- [[_COMMUNITY_Dashboard & Payments|Dashboard & Payments]]
- [[_COMMUNITY_Always-On Automation|Always-On Automation]]
- [[_COMMUNITY_Tier Config & Profiles|Tier Config & Profiles]]
- [[_COMMUNITY_Prod Server & Subscription|Prod Server & Subscription]]
- [[_COMMUNITY_Container Runtime|Container Runtime]]
- [[_COMMUNITY_Composio Google OAuth|Composio Google OAuth]]
- [[_COMMUNITY_Streaming Engine|Streaming Engine]]
- [[_COMMUNITY_Technical Debt|Technical Debt]]
- [[_COMMUNITY_Knowledge Graph|Knowledge Graph]]
- [[_COMMUNITY_God Nodes|God Nodes]]
- [[_COMMUNITY_Idle Heartbeat|Idle Heartbeat]]
- [[_COMMUNITY_Landing Page|Landing Page]]
- [[_COMMUNITY_Test Server|Test Server]]
- [[_COMMUNITY_Spec Promises|Spec Promises]]
- [[_COMMUNITY_Vault Quota|Vault Quota]]

## God Nodes (most connected - your core abstractions)
1. `15-daemons-and-containers: Always-on container design decisions` - 12 edges
2. `Security Hardening Session 2026-05-13 (commit 39be7ab)` - 10 edges
3. `src/session.ts` - 8 edges
4. `UX Audit Session 2026-05-12 (commit e562cb0) - 4 agents` - 7 edges
5. `Feature 3: Context compaction — auto-summarize old messages when approaching token limit` - 6 edges
6. `Feature 4: Guest memory — persistent session summaries in /opt/vault/{userId}/memory/` - 6 edges
7. `Claude Code Features Session 2026-05-12 (commit 9d61473, 633c634)` - 6 edges
8. `ROADMAP: Claude Code Features for Proboi bot (5 features)` - 5 edges
9. `Feature 2: Todo-list — live progress tracking with TODO_LIST_START/TODO_ITEM/TODO_START/TODO_DONE markers` - 5 edges
10. `src/handlers/document.ts` - 5 edges

## Surprising Connections (you probably didn't know these)
- `Tier System: free (10 msg/day) / paid (499₽/мес Профи)` --enforces--> `Daily limit gate - isDailyLimitReached/getDailyUsage/incrementDailyUsage`  [INFERRED]
  graphify-input/project_knowledge_graph.md → graphify-input/project_knowledge_graph.md  _Bridges community 7 → community 4_
- `src/handlers/callback.ts` --implemented_in--> `handleInviteCallback - approve sets guest menu commands`  [EXTRACTED]
  graphify-input/project_knowledge_graph.md → graphify-input/project_knowledge_graph.md  _Bridges community 4 → community 1_
- `src/session.ts` --implemented_in--> `Plan Mode - pendingPlan, abort at PLAN_END, inline buttons`  [EXTRACTED]
  graphify-input/project_knowledge_graph.md → graphify-input/project_knowledge_graph.md  _Bridges community 3 → community 4_
- `UX Hardening Session 2026-05-12 (commit fb4a117)` --modifies--> `buildNewGuestSafetyPrompt(userId, tier)`  [EXTRACTED]
  graphify-input/project_knowledge_graph.md → graphify-input/project_knowledge_graph.md  _Bridges community 1 → community 7_
- `UX Audit Session 2026-05-12 (commit e562cb0) - 4 agents` --modifies--> `src/tasks.ts`  [EXTRACTED]
  graphify-input/project_knowledge_graph.md → graphify-input/project_knowledge_graph.md  _Bridges community 1 → community 5_

## Communities

### Community 0 - "Context Compaction"
Cohesion: 0.1
Nodes (22): compactSession(): summarizes old messages via LLM, replaces with summary block, rewrites sessionFile, estimateContextSize(): reads sessionFile, counts JSON bytes, approximates tokens, buildSummaryPrompt(): prompt for summarizing dialog history, max 2000 words, Feature 3: Context compaction — auto-summarize old messages when approaching token limit, Feature 4: Guest memory — persistent session summaries in /opt/vault/{userId}/memory/, Feature 1: Plan Mode — pre-execution plan with PLAN_START/PLAN_END markers and confirm/cancel/clarify buttons, Feature 5: Redirect interrupt — !<text> aborts current execution and relaunches with new instruction, Feature 2: Todo-list — live progress tracking with TODO_LIST_START/TODO_ITEM/TODO_START/TODO_DONE markers (+14 more)

### Community 1 - "Guest UX & Commands"
Cohesion: 0.13
Nodes (17): src/handlers/commands.ts, src/fast-path.ts + deepseek-fast.ts (uncommitted), GUEST_MENU_COMMANDS - exported Telegram BotCommand array, handleInviteCallback - approve sets guest menu commands, src/handlers/index.ts, src/index.ts, src/invites.ts - friendly welcome message, /memory and /forget commands (+9 more)

### Community 2 - "Container Infra & Daemons"
Cohesion: 0.17
Nodes (16): Mental model shift: container = ephemeral workspace → personal 24/7 slot, --restart=unless-stopped: containers survive host reboot and docker daemon restart, scripts/monitoring/*: docker stats every minute, 60-point history, alert if avg >70% for 1hr, src/crashloop-watcher.ts: polls <vault>/.daemons-events/*-crashloop.json every 30s, Rationale: 3 daemon limit per user aligns with future Базовый=1/Профи=3/Студия=10 tiers, daemon-runner: Go binary PID 1 in claude-user-sandbox, ~5-10 MB, 15-daemons-and-containers: Always-on container design decisions, .daemons.yaml: manifest file for daemon registration, limit 3 per user (+8 more)

### Community 3 - "Claude Code Features 2026-05"
Cohesion: 0.19
Nodes (13): Claude Code Features Session 2026-05-12 (commit 9d61473, 633c634), compactIfNeeded() - token threshold → DeepSeek summarize → reset sessionId, Compact thresholds doubled: guest 50k→100k, owner 160k→320k, DeepSeek V4 Flash - 1M context window, src/memory/analyzer.ts - background SDK query every 6 turns, Metering bugs: H1 askUser tokens, H2 stop tokens, H3 analyzer tokens, src/metering.ts - token accounting SQLite, src/engines/openrouter.ts (+5 more)

### Community 4 - "Security Hardening & Handlers"
Cohesion: 0.24
Nodes (12): src/handlers/callback.ts, checkArchiveSize() - zip/tar bomb prevention, Daily limit gate - isDailyLimitReached/getDailyUsage/incrementDailyUsage, src/handlers/document.ts, PDF hang fix - Promise.race 30s timeout, plan_confirm userId ownership fix (callback.ts), Plan Mode - pendingPlan, abort at PLAN_END, inline buttons, preScanTar() - symlink TOCTOU fix (+4 more)

### Community 5 - "Dashboard & Payments"
Cohesion: 0.29
Nodes (7): src/dashboard-server.ts, notify-bridge container ownership fix (dashboard-server.ts), src/payments.ts - sendYuKassaBindingLink, handleYuKassaWebhook, activateSubscription, src/tasks.ts, src/types.ts - YuKassaPayment, YuKassaWebhookEvent, UserNode fields, YuKassa Phase 2026-05-11 (11 commits, waves 1-4), YuKassa Security Fixes - 6 CVEs (CRIT-1/2, HIGH-1/2/3, LOW-1)

### Community 6 - "Always-On Automation"
Cohesion: 0.29
Nodes (7): Always-on automations cluster (seed 15), daemon-runner (Go PID 1 supervisor) - 12 edges, .daemons.yaml manifest - 6 edges, scripts/firewall/egress-monitor.sh - 6 edges, Go scheduler daemon (5.2 MB, notify-bridge port 3849, maxDaemons=5), Security Session 2026-05-10 (56 commits, all stages deployed), Skill pack - 7 recipes in skills/, bootstrap, migrate-skills.ts

### Community 7 - "Tier Config & Profiles"
Cohesion: 0.4
Nodes (6): buildNewGuestSafetyPrompt(userId, tier), src/config.ts, containerEnabled bugfix (commit 10c83d0) - per-user > tier default, TIER_CONFIGS - free/paid tier configuration, Tier System: free (10 msg/day) / paid (499₽/мес Профи), system/users.json - live user database

### Community 8 - "Prod Server & Subscription"
Cohesion: 0.5
Nodes (4): proboi.site domain → 89.167.125.175, PROD server: proboi-bot (89.167.125.175, @proboiAI_bot), Subscription gate active on PROD (REQUIRED_CHANNEL_ID=@ProBoiAI), src/subscription.ts - @ProBoiAI channel gate

### Community 9 - "Container Runtime"
Cohesion: 0.83
Nodes (4): Container infrastructure changes (tini, LXCFS, python-is-python3), LXCFS fallback - kernel 6.8.0-90 read-only bind-mount workaround, src/containers/manager.ts - getOrStartUnlocked with lxcfs fallback, src/containers/spec.ts - buildRunArgs(opts: {skipLxcfs?})

### Community 10 - "Composio Google OAuth"
Cohesion: 0.67
Nodes (3): Composio OAuth Google Workspace (seed 09), src/composio.ts - OAuth helpers for Composio Google, src/mcp-filter.ts - inject google-workspace MCP

### Community 11 - "Streaming Engine"
Cohesion: 1.0
Nodes (2): segment_end fix for short responses (streaming.ts), src/handlers/streaming.ts

### Community 12 - "Technical Debt"
Cohesion: 1.0
Nodes (2): Technical Debt (2026-05-13): YuKassa reconciliation, addUser atomic write, IP check, src/user-registry.ts - addUser (non-atomic write issue)

### Community 13 - "Knowledge Graph"
Cohesion: 1.0
Nodes (1): Project Knowledge Graph

### Community 14 - "God Nodes"
Cohesion: 1.0
Nodes (1): God Nodes - top connectivity nodes

### Community 15 - "Idle Heartbeat"
Cohesion: 1.0
Nodes (1): IdleHeartbeat + idle-phrases.ts (seed 13)

### Community 16 - "Landing Page"
Cohesion: 1.0
Nodes (1): src/templates/landing.ts - proboi.site landing (seed 14)

### Community 17 - "Test Server"
Cohesion: 1.0
Nodes (1): TEST server: jinru (5.223.82.96, @ORCH7_bot)

### Community 18 - "Spec Promises"
Cohesion: 1.0
Nodes (1): SPEC PROMISE DELIVERY Этап 1 CLOSED (commit 41aab2d)

### Community 19 - "Vault Quota"
Cohesion: 1.0
Nodes (1): src/containers/vault-quota.ts - 2GB soft quota

## Knowledge Gaps
- **46 isolated node(s):** `--restart=unless-stopped: containers survive host reboot and docker daemon restart`, `Rationale: 3 daemon limit per user aligns with future Базовый=1/Профи=3/Студия=10 tiers`, `Design decision: no user-hosted sites on proboi.site infrastructure — legal risk 149-ФЗ`, `koen-assistant migration: systemd on host → inside container 946882308 under daemon-runner`, `SessionState.pendingPlan: stores planText + originalMessage + abortedAt` (+41 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Streaming Engine`** (2 nodes): `segment_end fix for short responses (streaming.ts)`, `src/handlers/streaming.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Technical Debt`** (2 nodes): `Technical Debt (2026-05-13): YuKassa reconciliation, addUser atomic write, IP check`, `src/user-registry.ts - addUser (non-atomic write issue)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Knowledge Graph`** (1 nodes): `Project Knowledge Graph`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `God Nodes`** (1 nodes): `God Nodes - top connectivity nodes`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Idle Heartbeat`** (1 nodes): `IdleHeartbeat + idle-phrases.ts (seed 13)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Landing Page`** (1 nodes): `src/templates/landing.ts - proboi.site landing (seed 14)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Test Server`** (1 nodes): `TEST server: jinru (5.223.82.96, @ORCH7_bot)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Spec Promises`** (1 nodes): `SPEC PROMISE DELIVERY Этап 1 CLOSED (commit 41aab2d)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Vault Quota`** (1 nodes): `src/containers/vault-quota.ts - 2GB soft quota`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Daily limit gate - isDailyLimitReached/getDailyUsage/incrementDailyUsage` connect `Security Hardening & Handlers` to `Guest UX & Commands`, `Dashboard & Payments`, `Tier Config & Profiles`?**
  _High betweenness centrality (0.055) - this node is a cross-community bridge._
- **Why does `Security Hardening Session 2026-05-13 (commit 39be7ab)` connect `Security Hardening & Handlers` to `Claude Code Features 2026-05`, `Dashboard & Payments`?**
  _High betweenness centrality (0.051) - this node is a cross-community bridge._
- **Why does `src/session.ts` connect `Claude Code Features 2026-05` to `Security Hardening & Handlers`?**
  _High betweenness centrality (0.046) - this node is a cross-community bridge._
- **What connects `--restart=unless-stopped: containers survive host reboot and docker daemon restart`, `Rationale: 3 daemon limit per user aligns with future Базовый=1/Профи=3/Студия=10 tiers`, `Design decision: no user-hosted sites on proboi.site infrastructure — legal risk 149-ФЗ` to the rest of the system?**
  _46 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Context Compaction` be split into smaller, more focused modules?**
  _Cohesion score 0.1 - nodes in this community are weakly interconnected._
- **Should `Guest UX & Commands` be split into smaller, more focused modules?**
  _Cohesion score 0.13 - nodes in this community are weakly interconnected._