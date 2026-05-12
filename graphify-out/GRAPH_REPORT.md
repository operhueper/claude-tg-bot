# Graph Report - graphify-input  (2026-05-12)

## Corpus Check
- 3 files · ~50,000 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 102 nodes · 112 edges · 19 communities detected
- Extraction: 94% EXTRACTED · 6% INFERRED · 0% AMBIGUOUS · INFERRED: 7 edges (avg confidence: 0.82)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Always-On контейнеры|Always-On контейнеры]]
- [[_COMMUNITY_Сессия и память|Сессия и память]]
- [[_COMMUNITY_Plan Mode и прерывания|Plan Mode и прерывания]]
- [[_COMMUNITY_Компакция контекста|Компакция контекста]]
- [[_COMMUNITY_Платежи и дашборд|Платежи и дашборд]]
- [[_COMMUNITY_UX гостей и меню|UX гостей и меню]]
- [[_COMMUNITY_Лимиты и подписка|Лимиты и подписка]]
- [[_COMMUNITY_Гостевой промпт и тарифы|Гостевой промпт и тарифы]]
- [[_COMMUNITY_LXCFS и контейнер-менеджер|LXCFS и контейнер-менеджер]]
- [[_COMMUNITY_Fast-path (uncommitted)|Fast-path (uncommitted)]]
- [[_COMMUNITY_Composio и Google|Composio и Google]]
- [[_COMMUNITY_Daemon-runner|Daemon-runner]]
- [[_COMMUNITY_Firewall и egress|Firewall и egress]]
- [[_COMMUNITY_Callback-handler|Callback-handler]]
- [[_COMMUNITY_Vault-quota|Vault-quota]]
- [[_COMMUNITY_Idle heartbeat|Idle heartbeat]]
- [[_COMMUNITY_Parallel MCP|Parallel MCP]]
- [[_COMMUNITY_Connect-Google MCP|Connect-Google MCP]]
- [[_COMMUNITY_Landing page|Landing page]]

## God Nodes (most connected - your core abstractions)
1. `15-daemons-and-containers: Always-on container design decisions` - 12 edges
2. `src/session.ts` - 8 edges
3. `Claude Code features commits 9d61473+633c634 (2026-05-12)` - 7 edges
4. `Feature 3: Context compaction — auto-summarize old messages when approaching token limit` - 6 edges
5. `Feature 4: Guest memory — persistent session summaries in /opt/vault/{userId}/memory/` - 6 edges
6. `UX hardening commit e562cb0 (2026-05-12)` - 6 edges
7. `ROADMAP: Claude Code Features for Proboi bot (5 features)` - 5 edges
8. `Feature 2: Todo-list — live progress tracking with TODO_LIST_START/TODO_ITEM/TODO_START/TODO_DONE markers` - 5 edges
9. `src/payments.ts (YuKassa payment flow)` - 5 edges
10. `.daemons.yaml: manifest file for daemon registration, limit 3 per user` - 4 edges

## Surprising Connections (you probably didn't know these)
- `ROADMAP: Claude Code Features for Proboi bot (5 features)` --defines--> `Feature 3: Context compaction — auto-summarize old messages when approaching token limit`  [EXTRACTED]
  graphify-input/ROADMAP_CLAUDE_CODE_FEATURES.md → graphify-input/ROADMAP_CLAUDE_CODE_FEATURES.md  _Bridges community 2 → community 3_
- `handlers/commands.ts` --references--> `Claude Code features commits 9d61473+633c634 (2026-05-12)`  [EXTRACTED]
  graphify-input/project_knowledge_graph.md → graphify-input/project_knowledge_graph.md  _Bridges community 5 → community 1_
- `src/index.ts` --references--> `UX hardening commit e562cb0 (2026-05-12)`  [EXTRACTED]
  graphify-input/project_knowledge_graph.md → graphify-input/project_knowledge_graph.md  _Bridges community 5 → community 6_
- `src/config.ts` --references--> `Session 2026-05-12: tier awareness + guest menu + simplified /status (fb4a117)`  [EXTRACTED]
  graphify-input/project_knowledge_graph.md → graphify-input/project_knowledge_graph.md  _Bridges community 7 → community 5_
- `src/config.ts` --references--> `Claude Code features commits 9d61473+633c634 (2026-05-12)`  [EXTRACTED]
  graphify-input/project_knowledge_graph.md → graphify-input/project_knowledge_graph.md  _Bridges community 7 → community 1_

## Hyperedges (group relationships)
- **Watchdog stack hyperedge** — pkg_daemon_runner, pkg_daemons_yaml, pkg_manager_ts, pkg_spec_ts [INFERRED]
- **Egress monitoring pipeline hyperedge** — pkg_firewall_scripts, pkg_egress_monitor [INFERRED]
- **Claude Code 5-feature set (todo/plan/compact/redirect/memory)** — pkg_todo_marker_parser, pkg_plan_marker_parser, pkg_plan_mode, pkg_compact_if_needed, pkg_check_interrupt, pkg_memory_commands [INFERRED]

## Communities

### Community 0 - "Always-On контейнеры"
Cohesion: 0.17
Nodes (16): Mental model shift: container = ephemeral workspace → personal 24/7 slot, --restart=unless-stopped: containers survive host reboot and docker daemon restart, scripts/monitoring/*: docker stats every minute, 60-point history, alert if avg >70% for 1hr, src/crashloop-watcher.ts: polls <vault>/.daemons-events/*-crashloop.json every 30s, Rationale: 3 daemon limit per user aligns with future Базовый=1/Профи=3/Студия=10 tiers, daemon-runner: Go binary PID 1 in claude-user-sandbox, ~5-10 MB, 15-daemons-and-containers: Always-on container design decisions, .daemons.yaml: manifest file for daemon registration, limit 3 per user (+8 more)

### Community 1 - "Сессия и память"
Cohesion: 0.14
Nodes (16): checkInterrupt() in utils.ts, Claude Code features commits 9d61473+633c634 (2026-05-12), compactIfNeeded() in session.ts, src/memory/analyzer.ts, Metering bugs H1/H2/H3 (token loss on ask-user, stop, memory analyzer), src/metering.ts (token accounting SQLite), src/engines/openrouter.ts, PlanMarkerParser in session.ts (+8 more)

### Community 2 - "Plan Mode и прерывания"
Cohesion: 0.18
Nodes (12): Feature 1: Plan Mode — pre-execution plan with PLAN_START/PLAN_END markers and confirm/cancel/clarify buttons, Feature 5: Redirect interrupt — !<text> aborts current execution and relaunches with new instruction, Feature 2: Todo-list — live progress tracking with TODO_LIST_START/TODO_ITEM/TODO_START/TODO_DONE markers, InterruptResult type: isInterrupt + isRedirect + redirectMessage, Plan Mode: AbortController stops stream after PLAN_END, plan stored in pendingPlan, SessionState.pendingPlan: stores planText + originalMessage + abortedAt, ROADMAP: Claude Code Features for Proboi bot (5 features), savePartialContext(): appends partial assistant response to sessionFile on abort (+4 more)

### Community 3 - "Компакция контекста"
Cohesion: 0.22
Nodes (10): compactSession(): summarizes old messages via LLM, replaces with summary block, rewrites sessionFile, estimateContextSize(): reads sessionFile, counts JSON bytes, approximates tokens, buildSummaryPrompt(): prompt for summarizing dialog history, max 2000 words, Feature 3: Context compaction — auto-summarize old messages when approaching token limit, Feature 4: Guest memory — persistent session summaries in /opt/vault/{userId}/memory/, Guest memory structure: /opt/vault/{userId}/memory/ with index.json, sessions/, facts.json, MEMORY.md, injectMemoryContext(): reads MEMORY.md, injects as first system message if >50 chars, Rationale: compaction is top priority because sessions break NOW — only existing-bug fix in the roadmap (+2 more)

### Community 4 - "Платежи и дашборд"
Cohesion: 0.33
Nodes (9): src/dashboard-server.ts, src/templates/oferta.ts (renderOferta), src/payments.ts (YuKassa payment flow), src/templates/privacy.ts (renderPrivacy), Technical debt backlog (atomic writes, race conditions, reconciliation), src/types.ts, src/user-registry.ts, YuKassa phase 11 commits (2026-05-11) (+1 more)

### Community 5 - "UX гостей и меню"
Cohesion: 0.32
Nodes (8): handlers/callback.ts, handlers/commands.ts, GUEST_MENU_COMMANDS export, handlers/index.ts, src/index.ts, /memory and /forget commands, Plan Mode (pendingPlan in ClaudeSession), Session 2026-05-12: tier awareness + guest menu + simplified /status (fb4a117)

### Community 6 - "Лимиты и подписка"
Cohesion: 0.29
Nodes (8): Daily limit gate (isDailyLimitReached / incrementDailyUsage), PROD server proboi-bot (89.167.125.175, @proboiAI_bot), src/subscription.ts (channel gate), src/tasks.ts, src/handlers/text.ts, UX hardening commit e562cb0 (2026-05-12), src/handlers/video.ts, src/handlers/voice.ts

### Community 7 - "Гостевой промпт и тарифы"
Cohesion: 0.5
Nodes (5): buildNewGuestSafetyPrompt(userId, vaultDir, tier), src/config.ts, containerEnabled per-user priority bugfix (10c83d0), Rationale: per-user containerEnabled takes priority over tier config, TIER_CONFIGS (free/paid tier config)

### Community 8 - "LXCFS и контейнер-менеджер"
Cohesion: 0.67
Nodes (4): LXCFS bind-mount fallback (skipLxcfs on kernel 6.8.0-90), src/containers/manager.ts (getOrStartUnlocked), Rationale: LXCFS fallback needed for kernel 6.8.0-90 read-only container restriction, src/containers/spec.ts (buildRunArgs)

### Community 9 - "Fast-path (uncommitted)"
Cohesion: 1.0
Nodes (2): src/engines/deepseek-fast.ts (queryDeepSeekFast, uncommitted), src/fast-path.ts (isSimpleQuery, uncommitted)

### Community 10 - "Composio и Google"
Cohesion: 1.0
Nodes (2): src/composio.ts (OAuth helpers), src/mcp-filter.ts (google-workspace inject)

### Community 11 - "Daemon-runner"
Cohesion: 1.0
Nodes (2): daemon-runner (Go PID 1 watchdog), .daemons.yaml manifest

### Community 12 - "Firewall и egress"
Cohesion: 1.0
Nodes (2): scripts/firewall/egress-monitor.sh, scripts/firewall/setup.sh + docker-user-rules.sh

### Community 13 - "Callback-handler"
Cohesion: 1.0
Nodes (1): src/handlers/callback.ts

### Community 14 - "Vault-quota"
Cohesion: 1.0
Nodes (1): vault-quota.ts: 2GB soft quota per guest

### Community 15 - "Idle heartbeat"
Cohesion: 1.0
Nodes (1): src/idle-phrases.ts (130 heartbeat phrases)

### Community 16 - "Parallel MCP"
Cohesion: 1.0
Nodes (1): parallel_mcp/server.ts (mcp__parallel__run)

### Community 17 - "Connect-Google MCP"
Cohesion: 1.0
Nodes (1): connect_google_mcp/server.ts (OAuth drop-box MCP)

### Community 18 - "Landing page"
Cohesion: 1.0
Nodes (1): src/templates/landing.ts (proboi.site, 1188 lines)

## Knowledge Gaps
- **44 isolated node(s):** `--restart=unless-stopped: containers survive host reboot and docker daemon restart`, `Rationale: 3 daemon limit per user aligns with future Базовый=1/Профи=3/Студия=10 tiers`, `Design decision: no user-hosted sites on proboi.site infrastructure — legal risk 149-ФЗ`, `koen-assistant migration: systemd on host → inside container 946882308 under daemon-runner`, `SessionState.pendingPlan: stores planText + originalMessage + abortedAt` (+39 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Fast-path (uncommitted)`** (2 nodes): `src/engines/deepseek-fast.ts (queryDeepSeekFast, uncommitted)`, `src/fast-path.ts (isSimpleQuery, uncommitted)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Composio и Google`** (2 nodes): `src/composio.ts (OAuth helpers)`, `src/mcp-filter.ts (google-workspace inject)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Daemon-runner`** (2 nodes): `daemon-runner (Go PID 1 watchdog)`, `.daemons.yaml manifest`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Firewall и egress`** (2 nodes): `scripts/firewall/egress-monitor.sh`, `scripts/firewall/setup.sh + docker-user-rules.sh`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Callback-handler`** (1 nodes): `src/handlers/callback.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Vault-quota`** (1 nodes): `vault-quota.ts: 2GB soft quota per guest`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Idle heartbeat`** (1 nodes): `src/idle-phrases.ts (130 heartbeat phrases)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Parallel MCP`** (1 nodes): `parallel_mcp/server.ts (mcp__parallel__run)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Connect-Google MCP`** (1 nodes): `connect_google_mcp/server.ts (OAuth drop-box MCP)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Landing page`** (1 nodes): `src/templates/landing.ts (proboi.site, 1188 lines)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `UX hardening commit e562cb0 (2026-05-12)` connect `Лимиты и подписка` to `UX гостей и меню`?**
  _High betweenness centrality (0.094) - this node is a cross-community bridge._
- **Why does `Claude Code features commits 9d61473+633c634 (2026-05-12)` connect `Сессия и память` to `UX гостей и меню`, `Гостевой промпт и тарифы`?**
  _High betweenness centrality (0.084) - this node is a cross-community bridge._
- **Why does `src/index.ts` connect `UX гостей и меню` to `Лимиты и подписка`?**
  _High betweenness centrality (0.072) - this node is a cross-community bridge._
- **What connects `--restart=unless-stopped: containers survive host reboot and docker daemon restart`, `Rationale: 3 daemon limit per user aligns with future Базовый=1/Профи=3/Студия=10 tiers`, `Design decision: no user-hosted sites on proboi.site infrastructure — legal risk 149-ФЗ` to the rest of the system?**
  _44 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Сессия и память` be split into smaller, more focused modules?**
  _Cohesion score 0.14 - nodes in this community are weakly interconnected._