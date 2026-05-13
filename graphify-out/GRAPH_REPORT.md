# Graph Report - .  (2026-05-13)

## Corpus Check
- Large corpus: 364 files · ~240,303 words. Semantic extraction will be expensive (many Claude tokens). Consider running on a subfolder, or use --no-semantic to run AST-only.

## Summary
- 1118 nodes · 1953 edges · 78 communities detected
- Extraction: 72% EXTRACTED · 28% INFERRED · 0% AMBIGUOUS · INFERRED: 542 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Audio & Media Handlers|Audio & Media Handlers]]
- [[_COMMUNITY_Session & Config Core|Session & Config Core]]
- [[_COMMUNITY_Firewall & Composio OAuth|Firewall & Composio OAuth]]
- [[_COMMUNITY_FitCoach Cron Jobs|FitCoach Cron Jobs]]
- [[_COMMUNITY_Invite & Guest Bootstrap|Invite & Guest Bootstrap]]
- [[_COMMUNITY_Daemon Runner|Daemon Runner]]
- [[_COMMUNITY_Safety & Archive Guards|Safety & Archive Guards]]
- [[_COMMUNITY_Goals & Commands|Goals & Commands]]
- [[_COMMUNITY_Claude Code Features|Claude Code Features]]
- [[_COMMUNITY_Daily Limits & Dashboard|Daily Limits & Dashboard]]
- [[_COMMUNITY_Memory Graph & Injection|Memory Graph & Injection]]
- [[_COMMUNITY_MCP Concepts & Onboarding|MCP Concepts & Onboarding]]
- [[_COMMUNITY_Alerts & Subscription|Alerts & Subscription]]
- [[_COMMUNITY_Container Bash & MCP Filter|Container Bash & MCP Filter]]
- [[_COMMUNITY_Owner vs Guest Architecture|Owner vs Guest Architecture]]
- [[_COMMUNITY_Owner Personal Assistant|Owner Personal Assistant]]
- [[_COMMUNITY_Tiers & Legal Docs|Tiers & Legal Docs]]
- [[_COMMUNITY_Compaction & Context|Compaction & Context]]
- [[_COMMUNITY_Ask-User MCP|Ask-User MCP]]
- [[_COMMUNITY_User Registry|User Registry]]
- [[_COMMUNITY_Module Cluster 20|Module Cluster 20]]
- [[_COMMUNITY_Module Cluster 21|Module Cluster 21]]
- [[_COMMUNITY_Module Cluster 22|Module Cluster 22]]
- [[_COMMUNITY_Module Cluster 23|Module Cluster 23]]
- [[_COMMUNITY_Module Cluster 24|Module Cluster 24]]
- [[_COMMUNITY_Module Cluster 25|Module Cluster 25]]
- [[_COMMUNITY_Module Cluster 26|Module Cluster 26]]
- [[_COMMUNITY_Module Cluster 27|Module Cluster 27]]
- [[_COMMUNITY_Module Cluster 28|Module Cluster 28]]
- [[_COMMUNITY_Module Cluster 29|Module Cluster 29]]
- [[_COMMUNITY_Module Cluster 30|Module Cluster 30]]
- [[_COMMUNITY_Module Cluster 31|Module Cluster 31]]
- [[_COMMUNITY_Module Cluster 32|Module Cluster 32]]
- [[_COMMUNITY_Module Cluster 33|Module Cluster 33]]
- [[_COMMUNITY_Module Cluster 34|Module Cluster 34]]
- [[_COMMUNITY_Module Cluster 35|Module Cluster 35]]
- [[_COMMUNITY_Module Cluster 36|Module Cluster 36]]
- [[_COMMUNITY_Module Cluster 37|Module Cluster 37]]
- [[_COMMUNITY_Module Cluster 38|Module Cluster 38]]
- [[_COMMUNITY_Module Cluster 39|Module Cluster 39]]
- [[_COMMUNITY_Module Cluster 40|Module Cluster 40]]
- [[_COMMUNITY_Module Cluster 41|Module Cluster 41]]
- [[_COMMUNITY_Module Cluster 42|Module Cluster 42]]
- [[_COMMUNITY_Module Cluster 43|Module Cluster 43]]
- [[_COMMUNITY_Module Cluster 44|Module Cluster 44]]
- [[_COMMUNITY_Module Cluster 45|Module Cluster 45]]
- [[_COMMUNITY_Module Cluster 46|Module Cluster 46]]
- [[_COMMUNITY_Module Cluster 47|Module Cluster 47]]
- [[_COMMUNITY_Module Cluster 48|Module Cluster 48]]
- [[_COMMUNITY_Module Cluster 49|Module Cluster 49]]
- [[_COMMUNITY_Module Cluster 50|Module Cluster 50]]
- [[_COMMUNITY_Module Cluster 51|Module Cluster 51]]
- [[_COMMUNITY_Module Cluster 52|Module Cluster 52]]
- [[_COMMUNITY_Module Cluster 53|Module Cluster 53]]
- [[_COMMUNITY_Module Cluster 54|Module Cluster 54]]
- [[_COMMUNITY_Module Cluster 55|Module Cluster 55]]
- [[_COMMUNITY_Module Cluster 56|Module Cluster 56]]
- [[_COMMUNITY_Module Cluster 57|Module Cluster 57]]
- [[_COMMUNITY_Module Cluster 58|Module Cluster 58]]
- [[_COMMUNITY_Module Cluster 59|Module Cluster 59]]
- [[_COMMUNITY_Module Cluster 60|Module Cluster 60]]
- [[_COMMUNITY_Module Cluster 61|Module Cluster 61]]
- [[_COMMUNITY_Module Cluster 62|Module Cluster 62]]
- [[_COMMUNITY_Module Cluster 63|Module Cluster 63]]
- [[_COMMUNITY_Module Cluster 64|Module Cluster 64]]
- [[_COMMUNITY_Module Cluster 65|Module Cluster 65]]
- [[_COMMUNITY_Module Cluster 66|Module Cluster 66]]
- [[_COMMUNITY_Module Cluster 67|Module Cluster 67]]
- [[_COMMUNITY_Module Cluster 68|Module Cluster 68]]
- [[_COMMUNITY_Module Cluster 69|Module Cluster 69]]
- [[_COMMUNITY_Module Cluster 70|Module Cluster 70]]
- [[_COMMUNITY_Module Cluster 71|Module Cluster 71]]
- [[_COMMUNITY_Module Cluster 72|Module Cluster 72]]
- [[_COMMUNITY_Module Cluster 73|Module Cluster 73]]
- [[_COMMUNITY_Module Cluster 74|Module Cluster 74]]
- [[_COMMUNITY_Module Cluster 75|Module Cluster 75]]
- [[_COMMUNITY_Module Cluster 76|Module Cluster 76]]
- [[_COMMUNITY_Module Cluster 77|Module Cluster 77]]

## God Nodes (most connected - your core abstractions)
1. `handleText()` - 38 edges
2. `getUserProfile()` - 37 edges
3. `isAuthorized()` - 28 edges
4. `getSession()` - 28 edges
5. `ClaudeSession` - 23 edges
6. `handleDocument()` - 23 edges
7. `handleCallback()` - 22 edges
8. `handleVideo()` - 21 edges
9. `handleVoice()` - 21 edges
10. `handleText handler` - 21 edges

## Surprising Connections (you probably didn't know these)
- `YuKassa Payment Phase` --related_to--> `Subscription gate — isSubscribed / invalidateSubscription`  [INFERRED]
  memory/project_knowledge_graph.md → src/subscription.ts
- `Plan mode: bot shows plan before execution, user confirms/cancels/refines` --implemented_by--> `handlePlanCallback — plan confirm/cancel/clarify`  [INFERRED]
  BOT_ENCYCLOPEDIA.md → src/handlers/callback.ts
- `Owner (292228713) vs Guest: separate cwd, settingSources, models, commands` --enforces--> `Owner-only guard for invite_approve/deny (OWNER_USER_ID check)`  [INFERRED]
  CLAUDE.md → src/handlers/callback.ts
- `sendMessage()` --calls--> `fetch()`  [INFERRED]
  fitcoach-evening.ts → src/index.ts
- `fetch()` --calls--> `sendMessage()`  [INFERRED]
  src/index.ts → fitcoach-morning.ts

## Hyperedges (group relationships)
- **Stream Marker Pattern: ring buffer + debounce + marker parsers used by Plan Mode and Todo-list** — stream_marker_buffer, todo_marker_parser, plan_marker_parser, telegram_edit_debounce [INFERRED 0.80]
- **Session summarization shared pattern: compactSession + save_session_memory + buildSummaryPrompt** — compaction_compact_session, save_session_memory, compaction_summary_prompt [INFERRED 0.85]
- **Layered auth on notify bridge: subnet + allowlist + docker-inspect + rate-limit** —  [EXTRACTED 1.00]
- **Layered auth on dashboard: HMAC-SHA256 initData + auth_date freshness + timingSafeEqual + owner gate** —  [EXTRACTED 1.00]
- **Per-session security stack: vault quota + bash safety + path safety + thinking sanitize + compaction sanitize** —  [EXTRACTED 1.00]
- **Guest isolation: owner guard + base env whitelist + deepseek env no-spread + disallowed tools + maxTurns cap** —  [EXTRACTED 1.00]
- **MCP file drop-box pattern (fire-and-forget): send-file + connect-google** —  [EXTRACTED 1.00]
- **Container Watchdog Stack** —  [EXTRACTED 1.00]
- **Alert Pipeline** —  [EXTRACTED 1.00]
- **Egress Control Pipeline** —  [INFERRED 0.85]
- **Owner Context & Routing System** —  [EXTRACTED 1.00]
- **Billing and Access Control Stack** —  [INFERRED 0.90]
- **Evgeniy owns and operates all main projects** — workspace_user_evgeniy, project_otklicker, project_fitcoach, second_brain_vault, marketing_rag_library [EXTRACTED 1.00]
- **Shared workspace between Evgeniy and Kseniya** — workspace_user_evgeniy, workspace_user_kseniya, shared_docs_index, kseniya_inbox, second_brain_vault [EXTRACTED 1.00]
- **Memory system: profile + topics-index + sessions + graph** — workspace_user_profile, workspace_topics_index, memory_graph_system, topic_otklicker_sessions, topic_fitcoach_sessions, topic_open_design_sessions [EXTRACTED 1.00]

## Communities

### Community 0 - "Audio & Media Handlers"
Cohesion: 0.04
Nodes (103): handleAudio(), isAudioFile(), processAudioFile(), handleCallback(), handlePlanCallback(), handleResumeCallback(), commandAllowed(), handleCancel() (+95 more)

### Community 1 - "Session & Config Core"
Cohesion: 0.03
Nodes (68): ClaudeSession class (per-user session state), ALLOWED_USERS (TELEGRAM_ALLOWED_USERS + UserRegistry merge), BLOCKED_PATTERNS (fork bomb, rm -rf /, etc.), bootstrapNewGuestDir() — vault structure setup on first access, buildGuestBaseEnv() — explicit passthrough (no process.env spread), .daemons.yaml bootstrap (bot-scheduler default daemon), getNewGuestOpenRouterKey() — per-user key file fallback, getUserProfile(userId) — single source of truth for profiles (+60 more)

### Community 2 - "Firewall & Composio OAuth"
Cohesion: 0.04
Nodes (68): /etc/claude-firewall/env Config, Composio OAuth Flow — Account Binding, Composio Security Model, CPU Alert Logic, CPU Monitor Install Script, CPU Monitor State Files, Custom MCP Deployment Checklist, Custom MCP TypeScript Skeleton (+60 more)

### Community 3 - "FitCoach Cron Jobs"
Cohesion: 0.04
Nodes (60): Cron: 21:00 daily (evening summary), Cron: 10:00 daily (morning nudge), Cron: every 2 minutes (sync), Bun Runtime, @anthropic-ai/claude-agent-sdk, @modelcontextprotocol/sdk, Env: OPENROUTER_API_KEY, Env: TELEGRAM_PARALLEL_ALLOWED_PATHS (+52 more)

### Community 4 - "Invite & Guest Bootstrap"
Cohesion: 0.07
Nodes (33): handleInviteCallback(), bootstrapNewGuestDir(), escapeHtml(), processOnce(), readEvent(), startCrashloopWatcher(), sendMessage(), generateGuestClaudeMd() (+25 more)

### Community 5 - "Daemon Runner"
Cohesion: 0.06
Nodes (32): newCmd(), crashEvent, daemon, DaemonSpec, Manifest, runner, add(), applyTimeline() (+24 more)

### Community 6 - "Safety & Archive Guards"
Cohesion: 0.05
Nodes (55): buildNewGuestSafetyPrompt(userId, tier), src/handlers/callback.ts, checkArchiveSize() - zip/tar bomb prevention, Claude Code Features Session 2026-05-12 (commit 9d61473, 633c634), src/handlers/commands.ts, compactIfNeeded() - token threshold → DeepSeek summarize → reset sessionId, Compact thresholds doubled: guest 50k→100k, owner 160k→320k, src/config.ts (+47 more)

### Community 7 - "Goals & Commands"
Cohesion: 0.09
Nodes (24): handleForget(), GoalsStore, handleAchieve(), handleGoalCallback(), handleGoals(), handleGoalsAdd(), ulid(), GraphStore (+16 more)

### Community 8 - "Claude Code Features"
Cohesion: 0.06
Nodes (47): Claude Code Features (5 features), Session Compaction Feature, containerEnabled Per-User Bugfix, Mental model shift: container = ephemeral workspace → personal 24/7 slot, Container Pause Skip for Active Daemons, --restart=unless-stopped: containers survive host reboot and docker daemon restart, CPU Monitor Script, scripts/monitoring/*: docker stats every minute, 60-point history, alert if avg >70% for 1hr (+39 more)

### Community 9 - "Daily Limits & Dashboard"
Cohesion: 0.07
Nodes (31): analyzeSession(), nextResetAt(), handleApiAdminAll(), handleApiMe(), handleYuKassaWebhookRoute(), isYuKassaIp(), jsonErr(), jsonOk() (+23 more)

### Community 10 - "Memory Graph & Injection"
Cohesion: 0.06
Nodes (14): stopRunner(), buildMemoryContext(), sanitizeForPrompt(), jaccard(), rankNodesByQuery(), scoreNode(), tokenize(), ClaudeSession (+6 more)

### Community 11 - "MCP Concepts & Onboarding"
Cohesion: 0.06
Nodes (40): Access Approval Flow, BotFather Token, Guest Container (isolated env), ! Interrupt Shorthand, MCP (Model Context Protocol), New User Onboarding Flow, Skill (Claude Code skill), Composio Guide (EN) — stub (+32 more)

### Community 12 - "Alerts & Subscription"
Cohesion: 0.11
Nodes (30): alertExpiringSubscription(), alertHighFreeUserCount(), alertNewSubscriber(), notifyOwner(), handleTaskConfirmCallback(), handlePay(), fetch(), activateSubscription() (+22 more)

### Community 13 - "Container Bash & MCP Filter"
Cohesion: 0.08
Nodes (21): buildContainerBashMcp(), buildGoogleMcpUrl(), getComposioApiKey(), initiateGoogleConnections(), connect-google-{userId}-*.json drop-box pattern, code(), convertBlockquotes(), convertMarkdownToHtml() (+13 more)

### Community 14 - "Owner vs Guest Architecture"
Cohesion: 0.08
Nodes (25): ALLOWED_USERS in-memory mutation on invite approve, Owner (292228713) vs Guest: separate cwd, settingSources, models, commands, bootstrapNewGuestDir — vault layout provisioning on approve, askuser inline keyboard response handler, cancel_subscription / confirm_cancel_subscription callbacks, handleGoalCallback — goal done/pause/delete, handleCallback — main callback router, handleInviteCallback — invite approve/deny handler (+17 more)

### Community 15 - "Owner Personal Assistant"
Cohesion: 0.12
Nodes (24): Admin Operations Map, Agent Routing Rules, API Cost Rules, Agent Routing Rules (CLAUDE.md workspace), Group Chat Persona: Клод, Kseniya Inbox (shared workspace), Marketing Knowledge Base Rule, Marketing RAG Library (9 books, 4435 chunks) (+16 more)

### Community 16 - "Tiers & Legal Docs"
Cohesion: 0.09
Nodes (23): Proboi tiers: Free (10 msg/day) vs Профи (499₽/мес, unlimited), Data retention policy: logs stored minimum 6 months, OFERTA_DRAFT.md — legal terms draft for Proboi platform, Platform rights: suspend account, inspect containers, cooperate with law, User prohibitions: no spam/phishing/malware/piracy/PD hosting, Pre-publication checklist: abuse@ email, SLA, logs, lawyer review, onboarding gate, Conversion philosophy: upsell at every interaction via guide page, not at purchase, Task 7: daily limit — FREE_DAILY_LIMIT=10, counter in-memory, resets 00:00 UTC (+15 more)

### Community 17 - "Compaction & Context"
Cohesion: 0.1
Nodes (22): compactSession(): summarizes old messages via LLM, replaces with summary block, rewrites sessionFile, estimateContextSize(): reads sessionFile, counts JSON bytes, approximates tokens, buildSummaryPrompt(): prompt for summarizing dialog history, max 2000 words, Feature 3: Context compaction — auto-summarize old messages when approaching token limit, Feature 4: Guest memory — persistent session summaries in /opt/vault/{userId}/memory/, Feature 1: Plan Mode — pre-execution plan with PLAN_START/PLAN_END markers and confirm/cancel/clarify buttons, Feature 5: Redirect interrupt — !<text> aborts current execution and relaunches with new instruction, Feature 2: Todo-list — live progress tracking with TODO_LIST_START/TODO_ITEM/TODO_START/TODO_DONE markers (+14 more)

### Community 18 - "Ask-User MCP"
Cohesion: 0.11
Nodes (15): Ask User Drop-box Pattern, Ask User MCP Server, ask_user tool, .daemons.yaml, Notify Bridge (http://172.18.0.1:3849/notify), Notify bridge allowed users gate, docker inspect IP verification (container owns userId), Message truncation to 4000 chars before Telegram send (+7 more)

### Community 19 - "User Registry"
Cohesion: 0.22
Nodes (12): addUser(), UserRegistry.getAllUsers, UserRegistry.getUser, load(), UserRegistry.reload, UserRegistry.saveUser, setUserOpenRouterKey, setUserOpenRouterKey() (+4 more)

### Community 20 - "Module Cluster 20"
Cohesion: 0.18
Nodes (16): containerManager.exec(userId, cmd, opts), containerManager.getOrStart(profile), send-file-{userId}-*.json drop-box pattern, checkPendingSendFileRequests (per-user drop-box), executeToolAsync(), create_excel tool (python3 openpyxl), generate_image tool (Pollinations AI), list_dir tool (+8 more)

### Community 21 - "Module Cluster 21"
Cohesion: 0.24
Nodes (12): assertNoZipSlip(), buildFileTree(), checkArchiveSize(), extractArchive(), extractArchiveContent(), extractText(), getArchiveExtension(), isArchive() (+4 more)

### Community 22 - "Module Cluster 22"
Cohesion: 0.53
Nodes (11): Guide EN — FAQ and Limits (09), Guide EN — What is MCP (02), Guide EN — Roadmap (04), Guide EN — Build Your Own Bot (08), Guide EN — README (index), Guide EN — Scenarios (01), Guide EN — Skills (07), Guide EN — Getting Started (00) (+3 more)

### Community 23 - "Module Cluster 23"
Cohesion: 0.18
Nodes (11): Idea #7: Bots On Demand Agency, Idea #26: Freelancer Assistant Bot, Idea #5: Micro-Learning Platform, Idea #30: Second Brain for Managers, Idea #11: Smart Savings Bot, Idea #2: Tax Assistant Bot, Music Server Idea (Navidrome), Evgeniy Inbox (+3 more)

### Community 24 - "Module Cluster 24"
Cohesion: 0.22
Nodes (9): Vault quota: 2 GB soft limit per guest, 60s TTL cache, checkVaultQuota() pre-message, Vault structure: inbox/, public/, notes/, projects/, skills/, memory/, MEDIUM bottleneck: MAX_CONCURRENT_CONTAINER_SESSIONS=5 global semaphore, CRITICAL bottleneck: single CPU core — hard ceiling at 10+ concurrent users, MEDIUM bottleneck: shared DeepSeek API key — rate limits at 20+ concurrent, HIGH bottleneck: 1.9 GiB RAM — comfortable only for 3-5 active containers, MEDIUM bottleneck: vault-quota.ts execFileSync du — blocks event loop, Decision: jinru TEST server NOT ready for 50 users (+1 more)

### Community 25 - "Module Cluster 25"
Cohesion: 0.25
Nodes (1): main()

### Community 26 - "Module Cluster 26"
Cohesion: 0.29
Nodes (7): Always-on automations cluster (seed 15), daemon-runner (Go PID 1 supervisor) - 12 edges, .daemons.yaml manifest - 6 edges, scripts/firewall/egress-monitor.sh - 6 edges, Go scheduler daemon (5.2 MB, notify-bridge port 3849, maxDaemons=5), Security Session 2026-05-10 (56 commits, all stages deployed), Skill pack - 7 recipes in skills/, bootstrap, migrate-skills.ts

### Community 27 - "Module Cluster 27"
Cohesion: 0.6
Nodes (5): handleSubscriptionCheckCallback(), invalidateSubscription(), isSubscribed(), isSubscriptionGateEnabled(), parseChannelId()

### Community 28 - "Module Cluster 28"
Cohesion: 0.47
Nodes (4): checkVaultQuota(), formatBytes(), getVaultPath(), getVaultQuotaBytes()

### Community 29 - "Module Cluster 29"
Cohesion: 0.33
Nodes (6): Feature: Context Compaction — Auto-compress Near Limit, Feature: Guest Memory — Persistent Context Between Sessions, Feature: Interrupt with Redirect — Graceful Execution Control, Feature: Plan Mode — Pre-execution Plan, Roadmap Technical Risks, Feature: Todo List — Real-time Progress

### Community 30 - "Module Cluster 30"
Cohesion: 0.5
Nodes (5): createGuestSubKey() — POST /api/v1/keys, deleteGuestSubKey() — DELETE /api/v1/keys/{hash}, OpenRouter Provisioning (per-user subkeys), OPENROUTER_PROVISIONING_KEY env var, OPENROUTER_GUEST_LIMIT_USD (default $2.0)

### Community 31 - "Module Cluster 31"
Cohesion: 0.5
Nodes (4): proboi.site domain → 89.167.125.175, PROD server: proboi-bot (89.167.125.175, @proboiAI_bot), Subscription gate active on PROD (REQUIRED_CHANNEL_ID=@ProBoiAI), src/subscription.ts - @ProBoiAI channel gate

### Community 32 - "Module Cluster 32"
Cohesion: 0.83
Nodes (4): Container infrastructure changes (tini, LXCFS, python-is-python3), LXCFS fallback - kernel 6.8.0-90 read-only bind-mount workaround, src/containers/manager.ts - getOrStartUnlocked with lxcfs fallback, src/containers/spec.ts - buildRunArgs(opts: {skipLxcfs?})

### Community 33 - "Module Cluster 33"
Cohesion: 0.5
Nodes (4): checkArchiveSize (zip bomb prevention), preScanTar (path traversal guard), processArchive (zip/tar with zip-slip guard), assertNoZipSlip (post-extraction path check)

### Community 34 - "Module Cluster 34"
Cohesion: 0.67
Nodes (3): Composio OAuth Google Workspace (seed 09), src/composio.ts - OAuth helpers for Composio Google, src/mcp-filter.ts - inject google-workspace MCP

### Community 35 - "Module Cluster 35"
Cohesion: 0.67
Nodes (3): UserRegistry, UserNode interface, UserRole type (owner|guest|new_guest)

### Community 36 - "Module Cluster 36"
Cohesion: 0.67
Nodes (3): ask-user-{userId}-*.json drop-box pattern, checkPendingAskUserRequests (per-user drop-box), createAskUserKeyboard (inline buttons)

### Community 37 - "Module Cluster 37"
Cohesion: 0.67
Nodes (3): AGENTS.md is a symlink to CLAUDE.md — identical content for Codex/other tools, Message flow: Telegram → Handler → Auth → Rate limit → Claude session → Stream → Audit, CLAUDE.md: read project_knowledge_graph.md before any work; update after tasks

### Community 38 - "Module Cluster 38"
Cohesion: 1.0
Nodes (0): 

### Community 39 - "Module Cluster 39"
Cohesion: 1.0
Nodes (0): 

### Community 40 - "Module Cluster 40"
Cohesion: 1.0
Nodes (0): 

### Community 41 - "Module Cluster 41"
Cohesion: 1.0
Nodes (0): 

### Community 42 - "Module Cluster 42"
Cohesion: 1.0
Nodes (0): 

### Community 43 - "Module Cluster 43"
Cohesion: 1.0
Nodes (2): segment_end fix for short responses (streaming.ts), src/handlers/streaming.ts

### Community 44 - "Module Cluster 44"
Cohesion: 1.0
Nodes (2): Technical Debt (2026-05-13): YuKassa reconciliation, addUser atomic write, IP check, src/user-registry.ts - addUser (non-atomic write issue)

### Community 45 - "Module Cluster 45"
Cohesion: 1.0
Nodes (1): GraphStore

### Community 46 - "Module Cluster 46"
Cohesion: 1.0
Nodes (2): src/engines/openrouter.ts, OpenRouterMessage interface

### Community 47 - "Module Cluster 47"
Cohesion: 1.0
Nodes (0): 

### Community 48 - "Module Cluster 48"
Cohesion: 1.0
Nodes (0): 

### Community 49 - "Module Cluster 49"
Cohesion: 1.0
Nodes (0): 

### Community 50 - "Module Cluster 50"
Cohesion: 1.0
Nodes (0): 

### Community 51 - "Module Cluster 51"
Cohesion: 1.0
Nodes (0): 

### Community 52 - "Module Cluster 52"
Cohesion: 1.0
Nodes (0): 

### Community 53 - "Module Cluster 53"
Cohesion: 1.0
Nodes (1): Project Knowledge Graph

### Community 54 - "Module Cluster 54"
Cohesion: 1.0
Nodes (1): God Nodes - top connectivity nodes

### Community 55 - "Module Cluster 55"
Cohesion: 1.0
Nodes (1): IdleHeartbeat + idle-phrases.ts (seed 13)

### Community 56 - "Module Cluster 56"
Cohesion: 1.0
Nodes (1): src/templates/landing.ts - proboi.site landing (seed 14)

### Community 57 - "Module Cluster 57"
Cohesion: 1.0
Nodes (1): TEST server: jinru (5.223.82.96, @ORCH7_bot)

### Community 58 - "Module Cluster 58"
Cohesion: 1.0
Nodes (1): SPEC PROMISE DELIVERY Этап 1 CLOSED (commit 41aab2d)

### Community 59 - "Module Cluster 59"
Cohesion: 1.0
Nodes (1): src/containers/vault-quota.ts - 2GB soft quota

### Community 60 - "Module Cluster 60"
Cohesion: 1.0
Nodes (1): NEW_GUEST_USERS list (env override or hardcoded defaults)

### Community 61 - "Module Cluster 61"
Cohesion: 1.0
Nodes (1): OWNER_ALLOWED_PATHS (ALLOWED_PATHS env or defaults)

### Community 62 - "Module Cluster 62"
Cohesion: 1.0
Nodes (1): Rate limit config (RATE_LIMIT_ENABLED/REQUESTS/WINDOW env vars)

### Community 63 - "Module Cluster 63"
Cohesion: 1.0
Nodes (1): Owner system prompt (buildOwnerSafetyPrompt, DeepSeek-aware)

### Community 64 - "Module Cluster 64"
Cohesion: 1.0
Nodes (1): Guest system prompt (buildNewGuestSafetyPrompt, tier-aware)

### Community 65 - "Module Cluster 65"
Cohesion: 1.0
Nodes (1): daily-limit.ts module

### Community 66 - "Module Cluster 66"
Cohesion: 1.0
Nodes (1): BOT_ENCYCLOPEDIA.md — user-facing feature reference for @proboiAI_bot

### Community 67 - "Module Cluster 67"
Cohesion: 1.0
Nodes (1): User public page at proboi.site/u/<userId>/ — public/ folder mapped

### Community 68 - "Module Cluster 68"
Cohesion: 1.0
Nodes (1): Daemon tasks: scheduled (cron) and persistent (max 3 concurrent) background processes

### Community 69 - "Module Cluster 69"
Cohesion: 1.0
Nodes (1): Commit style: no Generated-with / Co-Authored-By footers

### Community 70 - "Module Cluster 70"
Cohesion: 1.0
Nodes (1): Deploy constraint: test on jinru first, PROD only with explicit user confirmation

### Community 71 - "Module Cluster 71"
Cohesion: 1.0
Nodes (1): Never rsync .env or system/users.json between servers

### Community 72 - "Module Cluster 72"
Cohesion: 1.0
Nodes (1): 8 security layers: allowlist, rate limit, path validation, command safety, system prompt, command allowlist, audit, disallowedTools

### Community 73 - "Module Cluster 73"
Cohesion: 1.0
Nodes (1): MCP file-dropbox pattern: ask-user/send-file/connect-google write files, bot polls

### Community 74 - "Module Cluster 74"
Cohesion: 1.0
Nodes (1): Vision pipeline: all photos → OpenRouter Gemini (google/gemini-2.5-flash)

### Community 75 - "Module Cluster 75"
Cohesion: 1.0
Nodes (1): Installed MCPs guide reference (RU)

### Community 76 - "Module Cluster 76"
Cohesion: 1.0
Nodes (1): GRAPH_REPORT.md (graphify output)

### Community 77 - "Module Cluster 77"
Cohesion: 1.0
Nodes (1): Firewall Uninstall Script

## Knowledge Gaps
- **306 isolated node(s):** `Schedule`, `ScheduleConfig`, `notifyPayload`, `DaemonSpec`, `Manifest` (+301 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Module Cluster 38`** (2 nodes): `isPlaceholder()`, `migrate-guest-public-index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Module Cluster 39`** (2 nodes): `SCHEDULER_ENTRY()`, `migrate-scheduler.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Module Cluster 40`** (2 nodes): `renderPrivacy()`, `privacy.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Module Cluster 41`** (2 nodes): `renderOferta()`, `oferta.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Module Cluster 42`** (2 nodes): `user-dashboard.ts`, `renderDashboard()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Module Cluster 43`** (2 nodes): `segment_end fix for short responses (streaming.ts)`, `src/handlers/streaming.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Module Cluster 44`** (2 nodes): `Technical Debt (2026-05-13): YuKassa reconciliation, addUser atomic write, IP check`, `src/user-registry.ts - addUser (non-atomic write issue)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Module Cluster 45`** (2 nodes): `GraphStore`, `import-handoff.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Module Cluster 46`** (2 nodes): `src/engines/openrouter.ts`, `OpenRouterMessage interface`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Module Cluster 47`** (1 nodes): `migrate-guest-claude-md.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Module Cluster 48`** (1 nodes): `migrate-skills.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Module Cluster 49`** (1 nodes): `types.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Module Cluster 50`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Module Cluster 51`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Module Cluster 52`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Module Cluster 53`** (1 nodes): `Project Knowledge Graph`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Module Cluster 54`** (1 nodes): `God Nodes - top connectivity nodes`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Module Cluster 55`** (1 nodes): `IdleHeartbeat + idle-phrases.ts (seed 13)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Module Cluster 56`** (1 nodes): `src/templates/landing.ts - proboi.site landing (seed 14)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Module Cluster 57`** (1 nodes): `TEST server: jinru (5.223.82.96, @ORCH7_bot)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Module Cluster 58`** (1 nodes): `SPEC PROMISE DELIVERY Этап 1 CLOSED (commit 41aab2d)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Module Cluster 59`** (1 nodes): `src/containers/vault-quota.ts - 2GB soft quota`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Module Cluster 60`** (1 nodes): `NEW_GUEST_USERS list (env override or hardcoded defaults)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Module Cluster 61`** (1 nodes): `OWNER_ALLOWED_PATHS (ALLOWED_PATHS env or defaults)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Module Cluster 62`** (1 nodes): `Rate limit config (RATE_LIMIT_ENABLED/REQUESTS/WINDOW env vars)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Module Cluster 63`** (1 nodes): `Owner system prompt (buildOwnerSafetyPrompt, DeepSeek-aware)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Module Cluster 64`** (1 nodes): `Guest system prompt (buildNewGuestSafetyPrompt, tier-aware)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Module Cluster 65`** (1 nodes): `daily-limit.ts module`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Module Cluster 66`** (1 nodes): `BOT_ENCYCLOPEDIA.md — user-facing feature reference for @proboiAI_bot`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Module Cluster 67`** (1 nodes): `User public page at proboi.site/u/<userId>/ — public/ folder mapped`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Module Cluster 68`** (1 nodes): `Daemon tasks: scheduled (cron) and persistent (max 3 concurrent) background processes`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Module Cluster 69`** (1 nodes): `Commit style: no Generated-with / Co-Authored-By footers`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Module Cluster 70`** (1 nodes): `Deploy constraint: test on jinru first, PROD only with explicit user confirmation`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Module Cluster 71`** (1 nodes): `Never rsync .env or system/users.json between servers`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Module Cluster 72`** (1 nodes): `8 security layers: allowlist, rate limit, path validation, command safety, system prompt, command allowlist, audit, disallowedTools`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Module Cluster 73`** (1 nodes): `MCP file-dropbox pattern: ask-user/send-file/connect-google write files, bot polls`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Module Cluster 74`** (1 nodes): `Vision pipeline: all photos → OpenRouter Gemini (google/gemini-2.5-flash)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Module Cluster 75`** (1 nodes): `Installed MCPs guide reference (RU)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Module Cluster 76`** (1 nodes): `GRAPH_REPORT.md (graphify output)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Module Cluster 77`** (1 nodes): `Firewall Uninstall Script`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `getUserProfile()` connect `Audio & Media Handlers` to `Invite & Guest Bootstrap`, `Goals & Commands`, `Daily Limits & Dashboard`, `Alerts & Subscription`, `Module Cluster 20`?**
  _High betweenness centrality (0.028) - this node is a cross-community bridge._
- **Why does `handleCallback()` connect `Audio & Media Handlers` to `Module Cluster 27`, `Invite & Guest Bootstrap`, `Alerts & Subscription`, `Goals & Commands`?**
  _High betweenness centrality (0.024) - this node is a cross-community bridge._
- **Why does `main()` connect `FitCoach Cron Jobs` to `Invite & Guest Bootstrap`?**
  _High betweenness centrality (0.019) - this node is a cross-community bridge._
- **Are the 35 inferred relationships involving `handleText()` (e.g. with `handleRetry()` and `isAuthorized()`) actually correct?**
  _`handleText()` has 35 INFERRED edges - model-reasoned connections that need verification._
- **Are the 25 inferred relationships involving `getUserProfile()` (e.g. with `handleApiMe()` and `maybeWarmInfrastructure()`) actually correct?**
  _`getUserProfile()` has 25 INFERRED edges - model-reasoned connections that need verification._
- **Are the 23 inferred relationships involving `isAuthorized()` (e.g. with `handleStart()` and `handleNew()`) actually correct?**
  _`isAuthorized()` has 23 INFERRED edges - model-reasoned connections that need verification._
- **Are the 24 inferred relationships involving `getSession()` (e.g. with `checkInterrupt()` and `getUserProfile()`) actually correct?**
  _`getSession()` has 24 INFERRED edges - model-reasoned connections that need verification._