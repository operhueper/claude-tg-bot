# Graph Report - graphify-input  (2026-05-13)

## Corpus Check
- 1 files · ~3,000 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1241 nodes · 2098 edges · 88 communities detected
- Extraction: 73% EXTRACTED · 27% INFERRED · 0% AMBIGUOUS · INFERRED: 567 edges (avg confidence: 0.8)
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
- [[_COMMUNITY_Community 29|Community 29]]
- [[_COMMUNITY_Community 30|Community 30]]
- [[_COMMUNITY_Community 31|Community 31]]
- [[_COMMUNITY_Community 32|Community 32]]
- [[_COMMUNITY_Community 33|Community 33]]
- [[_COMMUNITY_Community 34|Community 34]]
- [[_COMMUNITY_Community 35|Community 35]]
- [[_COMMUNITY_Community 36|Community 36]]
- [[_COMMUNITY_Community 37|Community 37]]
- [[_COMMUNITY_Community 38|Community 38]]
- [[_COMMUNITY_Community 39|Community 39]]
- [[_COMMUNITY_Community 40|Community 40]]
- [[_COMMUNITY_Community 41|Community 41]]
- [[_COMMUNITY_Community 42|Community 42]]
- [[_COMMUNITY_Community 43|Community 43]]
- [[_COMMUNITY_Community 44|Community 44]]
- [[_COMMUNITY_Community 45|Community 45]]
- [[_COMMUNITY_Community 46|Community 46]]
- [[_COMMUNITY_Community 47|Community 47]]
- [[_COMMUNITY_Community 48|Community 48]]
- [[_COMMUNITY_Community 49|Community 49]]
- [[_COMMUNITY_Community 50|Community 50]]
- [[_COMMUNITY_Community 51|Community 51]]
- [[_COMMUNITY_Community 52|Community 52]]
- [[_COMMUNITY_Community 53|Community 53]]
- [[_COMMUNITY_Community 54|Community 54]]
- [[_COMMUNITY_Community 55|Community 55]]
- [[_COMMUNITY_Community 56|Community 56]]
- [[_COMMUNITY_Community 57|Community 57]]
- [[_COMMUNITY_Community 58|Community 58]]
- [[_COMMUNITY_Community 59|Community 59]]
- [[_COMMUNITY_Community 60|Community 60]]
- [[_COMMUNITY_Community 61|Community 61]]
- [[_COMMUNITY_Community 62|Community 62]]
- [[_COMMUNITY_Community 63|Community 63]]
- [[_COMMUNITY_Community 64|Community 64]]
- [[_COMMUNITY_Community 65|Community 65]]
- [[_COMMUNITY_Community 66|Community 66]]
- [[_COMMUNITY_Community 67|Community 67]]
- [[_COMMUNITY_Community 68|Community 68]]
- [[_COMMUNITY_Community 69|Community 69]]
- [[_COMMUNITY_Community 70|Community 70]]
- [[_COMMUNITY_Community 71|Community 71]]
- [[_COMMUNITY_Community 72|Community 72]]
- [[_COMMUNITY_Community 73|Community 73]]
- [[_COMMUNITY_Community 74|Community 74]]
- [[_COMMUNITY_Community 75|Community 75]]
- [[_COMMUNITY_Community 76|Community 76]]
- [[_COMMUNITY_Community 77|Community 77]]
- [[_COMMUNITY_Community 78|Community 78]]
- [[_COMMUNITY_Community 79|Community 79]]
- [[_COMMUNITY_Community 80|Community 80]]
- [[_COMMUNITY_Community 81|Community 81]]
- [[_COMMUNITY_Community 82|Community 82]]
- [[_COMMUNITY_Community 83|Community 83]]
- [[_COMMUNITY_Community 84|Community 84]]
- [[_COMMUNITY_Community 85|Community 85]]
- [[_COMMUNITY_Community 86|Community 86]]
- [[_COMMUNITY_Community 87|Community 87]]

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
- `Subscription gate — isSubscribed / invalidateSubscription` --related_to--> `YuKassa Payment Phase`  [INFERRED]
  src/subscription.ts → memory/project_knowledge_graph.md
- `handlePlanCallback — plan confirm/cancel/clarify` --implemented_by--> `Plan mode: bot shows plan before execution, user confirms/cancels/refines`  [INFERRED]
  src/handlers/callback.ts → BOT_ENCYCLOPEDIA.md
- `Owner-only guard for invite_approve/deny (OWNER_USER_ID check)` --enforces--> `Owner (292228713) vs Guest: separate cwd, settingSources, models, commands`  [INFERRED]
  src/handlers/callback.ts → CLAUDE.md
- `sendMessage()` --calls--> `fetch()`  [INFERRED]
  fitcoach-evening.ts → src/index.ts
- `sendMessage()` --calls--> `send()`  [INFERRED]
  fitcoach-morning.ts → src/owner-alerts.ts

## Communities

### Community 0 - "Community 0"
Cohesion: 0.04
Nodes (120): handleAudio(), isAudioFile(), processAudioFile(), handleCallback(), handlePlanCallback(), handleResumeCallback(), commandAllowed(), handleCancel() (+112 more)

### Community 1 - "Community 1"
Cohesion: 0.04
Nodes (73): Archive bomb protection (D-1/D-2), compactIfNeeded() context compaction, containerEnabled tier-priority logic, Egress pipeline (tc htb baseline), Plan Mode (PlanMarkerParser), File-content prompt injection wrap, request_id deduplication for retry billing, SQLite daily_counts persistent counter (+65 more)

### Community 2 - "Community 2"
Cohesion: 0.05
Nodes (34): newCmd(), crashEvent, daemon, DaemonSpec, Manifest, runner, pickRandomPhrase(), add() (+26 more)

### Community 3 - "Community 3"
Cohesion: 0.05
Nodes (22): stopRunner(), buildMemoryContext(), sanitizeForPrompt(), chownToSandbox(), ContainerManager, hasActiveDaemons(), containerName(), dropboxDir() (+14 more)

### Community 4 - "Community 4"
Cohesion: 0.03
Nodes (68): ClaudeSession class (per-user session state), ALLOWED_USERS (TELEGRAM_ALLOWED_USERS + UserRegistry merge), BLOCKED_PATTERNS (fork bomb, rm -rf /, etc.), bootstrapNewGuestDir() — vault structure setup on first access, buildGuestBaseEnv() — explicit passthrough (no process.env spread), .daemons.yaml bootstrap (bot-scheduler default daemon), getNewGuestOpenRouterKey() — per-user key file fallback, getUserProfile(userId) — single source of truth for profiles (+60 more)

### Community 5 - "Community 5"
Cohesion: 0.04
Nodes (68): /etc/claude-firewall/env Config, Composio OAuth Flow — Account Binding, Composio Security Model, CPU Alert Logic, CPU Monitor Install Script, CPU Monitor State Files, Custom MCP Deployment Checklist, Custom MCP TypeScript Skeleton (+60 more)

### Community 6 - "Community 6"
Cohesion: 0.04
Nodes (60): Cron: 21:00 daily (evening summary), Cron: 10:00 daily (morning nudge), Cron: every 2 minutes (sync), Bun Runtime, @anthropic-ai/claude-agent-sdk, @modelcontextprotocol/sdk, Env: OPENROUTER_API_KEY, Env: TELEGRAM_PARALLEL_ALLOWED_PATHS (+52 more)

### Community 7 - "Community 7"
Cohesion: 0.05
Nodes (47): analyzeSession(), containerManager.exec(userId, cmd, opts), containerManager.getOrStart(profile), nextResetAt(), handleApiAdminAll(), handleApiMe(), handleYuKassaWebhookRoute(), isYuKassaIp() (+39 more)

### Community 8 - "Community 8"
Cohesion: 0.05
Nodes (55): buildNewGuestSafetyPrompt(userId, tier), src/handlers/callback.ts, checkArchiveSize() - zip/tar bomb prevention, Claude Code Features Session 2026-05-12 (commit 9d61473, 633c634), src/handlers/commands.ts, compactIfNeeded() - token threshold → DeepSeek summarize → reset sessionId, Compact thresholds doubled: guest 50k→100k, owner 160k→320k, src/config.ts (+47 more)

### Community 9 - "Community 9"
Cohesion: 0.08
Nodes (40): alertExpiringSubscription(), alertHighFreeUserCount(), alertNewSubscriber(), notifyOwner(), handleInviteCallback(), handleTaskConfirmCallback(), sendMessage(), fetch() (+32 more)

### Community 10 - "Community 10"
Cohesion: 0.09
Nodes (24): handleForget(), GoalsStore, handleAchieve(), handleGoalCallback(), handleGoals(), handleGoalsAdd(), ulid(), GraphStore (+16 more)

### Community 11 - "Community 11"
Cohesion: 0.06
Nodes (47): Claude Code Features (5 features), Session Compaction Feature, containerEnabled Per-User Bugfix, Mental model shift: container = ephemeral workspace → personal 24/7 slot, Container Pause Skip for Active Daemons, --restart=unless-stopped: containers survive host reboot and docker daemon restart, CPU Monitor Script, scripts/monitoring/*: docker stats every minute, 60-point history, alert if avg >70% for 1hr (+39 more)

### Community 12 - "Community 12"
Cohesion: 0.06
Nodes (40): Access Approval Flow, BotFather Token, Guest Container (isolated env), ! Interrupt Shorthand, MCP (Model Context Protocol), New User Onboarding Flow, Skill (Claude Code skill), Composio Guide (EN) — stub (+32 more)

### Community 13 - "Community 13"
Cohesion: 0.1
Nodes (20): buildContainerBashMcp(), buildGoogleMcpUrl(), getComposioApiKey(), initiateGoogleConnections(), connect-google-{userId}-*.json drop-box pattern, code(), convertBlockquotes(), convertMarkdownToHtml() (+12 more)

### Community 14 - "Community 14"
Cohesion: 0.08
Nodes (25): ALLOWED_USERS in-memory mutation on invite approve, Owner (292228713) vs Guest: separate cwd, settingSources, models, commands, bootstrapNewGuestDir — vault layout provisioning on approve, askuser inline keyboard response handler, cancel_subscription / confirm_cancel_subscription callbacks, handleGoalCallback — goal done/pause/delete, handleCallback — main callback router, handleInviteCallback — invite approve/deny handler (+17 more)

### Community 15 - "Community 15"
Cohesion: 0.1
Nodes (25): audio.ts Daily Limit + User Lock + Container Slot, audio.ts Missing Daily Limit Check (Free Users Unlimited Audio), Audit: 4 Parallel Research Agents Found 7 Problems, callback.ts Approve Flow: Remove Hardcoded containerEnabled, config.ts containerEnabled Tier Logic Fix, containerEnabled Bug: callback.ts ALWAYS set containerEnabled:true on approve, Container Slot Gap: Only text.ts Had acquireContainerSlot (voice/video/photo/audio Missing), Container Slot acquireContainerSlot Added to voice/video/photo/audio Handlers (+17 more)

### Community 16 - "Community 16"
Cohesion: 0.12
Nodes (24): Admin Operations Map, Agent Routing Rules, API Cost Rules, Agent Routing Rules (CLAUDE.md workspace), Group Chat Persona: Клод, Kseniya Inbox (shared workspace), Marketing Knowledge Base Rule, Marketing RAG Library (9 books, 4435 chunks) (+16 more)

### Community 17 - "Community 17"
Cohesion: 0.09
Nodes (23): Proboi tiers: Free (10 msg/day) vs Профи (499₽/мес, unlimited), Data retention policy: logs stored minimum 6 months, OFERTA_DRAFT.md — legal terms draft for Proboi platform, Platform rights: suspend account, inspect containers, cooperate with law, User prohibitions: no spam/phishing/malware/piracy/PD hosting, Pre-publication checklist: abuse@ email, SLA, logs, lawyer review, onboarding gate, Conversion philosophy: upsell at every interaction via guide page, not at purchase, Task 7: daily limit — FREE_DAILY_LIMIT=10, counter in-memory, resets 00:00 UTC (+15 more)

### Community 18 - "Community 18"
Cohesion: 0.1
Nodes (22): compactSession(): summarizes old messages via LLM, replaces with summary block, rewrites sessionFile, estimateContextSize(): reads sessionFile, counts JSON bytes, approximates tokens, buildSummaryPrompt(): prompt for summarizing dialog history, max 2000 words, Feature 3: Context compaction — auto-summarize old messages when approaching token limit, Feature 4: Guest memory — persistent session summaries in /opt/vault/{userId}/memory/, Feature 1: Plan Mode — pre-execution plan with PLAN_START/PLAN_END markers and confirm/cancel/clarify buttons, Feature 5: Redirect interrupt — !<text> aborts current execution and relaunches with new instruction, Feature 2: Todo-list — live progress tracking with TODO_LIST_START/TODO_ITEM/TODO_START/TODO_DONE markers (+14 more)

### Community 19 - "Community 19"
Cohesion: 0.11
Nodes (15): Ask User Drop-box Pattern, Ask User MCP Server, ask_user tool, .daemons.yaml, Notify Bridge (http://172.18.0.1:3849/notify), Notify bridge allowed users gate, docker inspect IP verification (container owns userId), Message truncation to 4000 chars before Telegram send (+7 more)

### Community 20 - "Community 20"
Cohesion: 0.22
Nodes (12): addUser(), UserRegistry.getAllUsers, UserRegistry.getUser, load(), UserRegistry.reload, UserRegistry.saveUser, setUserOpenRouterKey, setUserOpenRouterKey() (+4 more)

### Community 21 - "Community 21"
Cohesion: 0.29
Nodes (8): escapeHtml(), processOnce(), readEvent(), startCrashloopWatcher(), notifyGuest(), notifyOwnerDM(), notifyProblemChannel(), send()

### Community 22 - "Community 22"
Cohesion: 0.53
Nodes (11): Guide EN — FAQ and Limits (09), Guide EN — What is MCP (02), Guide EN — Roadmap (04), Guide EN — Build Your Own Bot (08), Guide EN — README (index), Guide EN — Scenarios (01), Guide EN — Skills (07), Guide EN — Getting Started (00) (+3 more)

### Community 23 - "Community 23"
Cohesion: 0.18
Nodes (11): Idea #7: Bots On Demand Agency, Idea #26: Freelancer Assistant Bot, Idea #5: Micro-Learning Platform, Idea #30: Second Brain for Managers, Idea #11: Smart Savings Bot, Idea #2: Tax Assistant Bot, Music Server Idea (Navidrome), Evgeniy Inbox (+3 more)

### Community 24 - "Community 24"
Cohesion: 0.25
Nodes (5): bootstrapNewGuestDir(), generateGuestClaudeMd(), generateGuestDashboard(), renderHowToSetup(), renderHowToSetupGuide()

### Community 25 - "Community 25"
Cohesion: 0.22
Nodes (9): Vault quota: 2 GB soft limit per guest, 60s TTL cache, checkVaultQuota() pre-message, Vault structure: inbox/, public/, notes/, projects/, skills/, memory/, MEDIUM bottleneck: MAX_CONCURRENT_CONTAINER_SESSIONS=5 global semaphore, CRITICAL bottleneck: single CPU core — hard ceiling at 10+ concurrent users, MEDIUM bottleneck: shared DeepSeek API key — rate limits at 20+ concurrent, HIGH bottleneck: 1.9 GiB RAM — comfortable only for 3-5 active containers, MEDIUM bottleneck: vault-quota.ts execFileSync du — blocks event loop, Decision: jinru TEST server NOT ready for 50 users (+1 more)

### Community 26 - "Community 26"
Cohesion: 0.22
Nodes (8): getUserProfile() in src/config.ts, src/deepseek-key-pool.ts (key pool module), system/deepseek-keys.json (5 keys, gitignored), DEEPSEEK_POOL_MARKER constant ('pool'), hasAnyDeepSeekKey() check, Rationale: avoid loading one key with multiple concurrent users, src/session.ts (query loop, compactIfNeeded, runBackgroundAnalysis), withDeepSeekPoolKey(env) helper in session.ts

### Community 27 - "Community 27"
Cohesion: 0.25
Nodes (1): main()

### Community 28 - "Community 28"
Cohesion: 0.29
Nodes (7): Always-on automations cluster (seed 15), daemon-runner (Go PID 1 supervisor) - 12 edges, .daemons.yaml manifest - 6 edges, scripts/firewall/egress-monitor.sh - 6 edges, Go scheduler daemon (5.2 MB, notify-bridge port 3849, maxDaemons=5), Security Session 2026-05-10 (56 commits, all stages deployed), Skill pack - 7 recipes in skills/, bootstrap, migrate-skills.ts

### Community 29 - "Community 29"
Cohesion: 0.6
Nodes (5): handleSubscriptionCheckCallback(), invalidateSubscription(), isSubscribed(), isSubscriptionGateEnabled(), parseChannelId()

### Community 30 - "Community 30"
Cohesion: 0.47
Nodes (4): checkVaultQuota(), formatBytes(), getVaultPath(), getVaultQuotaBytes()

### Community 31 - "Community 31"
Cohesion: 0.33
Nodes (6): Feature: Context Compaction — Auto-compress Near Limit, Feature: Guest Memory — Persistent Context Between Sessions, Feature: Interrupt with Redirect — Graceful Execution Control, Feature: Plan Mode — Pre-execution Plan, Roadmap Technical Risks, Feature: Todo List — Real-time Progress

### Community 32 - "Community 32"
Cohesion: 0.5
Nodes (5): createGuestSubKey() — POST /api/v1/keys, deleteGuestSubKey() — DELETE /api/v1/keys/{hash}, OpenRouter Provisioning (per-user subkeys), OPENROUTER_PROVISIONING_KEY env var, OPENROUTER_GUEST_LIMIT_USD (default $2.0)

### Community 33 - "Community 33"
Cohesion: 0.5
Nodes (4): proboi.site domain → 89.167.125.175, PROD server: proboi-bot (89.167.125.175, @proboiAI_bot), Subscription gate active on PROD (REQUIRED_CHANNEL_ID=@ProBoiAI), src/subscription.ts - @ProBoiAI channel gate

### Community 34 - "Community 34"
Cohesion: 0.83
Nodes (4): Container infrastructure changes (tini, LXCFS, python-is-python3), LXCFS fallback - kernel 6.8.0-90 read-only bind-mount workaround, src/containers/manager.ts - getOrStartUnlocked with lxcfs fallback, src/containers/spec.ts - buildRunArgs(opts: {skipLxcfs?})

### Community 35 - "Community 35"
Cohesion: 0.5
Nodes (4): deepseek-chat (deprecated alias), deepseek-v4-flash (native DeepSeek model), Native DeepSeek API guest text route, OpenRouter pipeline (bypassed for guest text)

### Community 36 - "Community 36"
Cohesion: 0.67
Nodes (3): Composio OAuth Google Workspace (seed 09), src/composio.ts - OAuth helpers for Composio Google, src/mcp-filter.ts - inject google-workspace MCP

### Community 37 - "Community 37"
Cohesion: 0.67
Nodes (3): UserRegistry, UserNode interface, UserRole type (owner|guest|new_guest)

### Community 38 - "Community 38"
Cohesion: 0.67
Nodes (3): ask-user-{userId}-*.json drop-box pattern, checkPendingAskUserRequests (per-user drop-box), createAskUserKeyboard (inline buttons)

### Community 39 - "Community 39"
Cohesion: 0.67
Nodes (3): AGENTS.md is a symlink to CLAUDE.md — identical content for Codex/other tools, Message flow: Telegram → Handler → Auth → Rate limit → Claude session → Stream → Audit, CLAUDE.md: read project_knowledge_graph.md before any work; update after tasks

### Community 40 - "Community 40"
Cohesion: 1.0
Nodes (0): 

### Community 41 - "Community 41"
Cohesion: 1.0
Nodes (0): 

### Community 42 - "Community 42"
Cohesion: 1.0
Nodes (0): 

### Community 43 - "Community 43"
Cohesion: 1.0
Nodes (0): 

### Community 44 - "Community 44"
Cohesion: 1.0
Nodes (0): 

### Community 45 - "Community 45"
Cohesion: 1.0
Nodes (2): segment_end fix for short responses (streaming.ts), src/handlers/streaming.ts

### Community 46 - "Community 46"
Cohesion: 1.0
Nodes (2): Technical Debt (2026-05-13): YuKassa reconciliation, addUser atomic write, IP check, src/user-registry.ts - addUser (non-atomic write issue)

### Community 47 - "Community 47"
Cohesion: 1.0
Nodes (1): GraphStore

### Community 48 - "Community 48"
Cohesion: 1.0
Nodes (2): src/engines/openrouter.ts, OpenRouterMessage interface

### Community 49 - "Community 49"
Cohesion: 1.0
Nodes (2): FAIR-01: disk-IO limits for guests, src/containers/spec.ts

### Community 50 - "Community 50"
Cohesion: 1.0
Nodes (2): src/user-registry.ts, HIGH-01: writeUsersAtomic in addUser

### Community 51 - "Community 51"
Cohesion: 1.0
Nodes (2): scripts/disable-openrouter-subkeys.ts, openrouterKey field in system/users.json

### Community 52 - "Community 52"
Cohesion: 1.0
Nodes (0): 

### Community 53 - "Community 53"
Cohesion: 1.0
Nodes (0): 

### Community 54 - "Community 54"
Cohesion: 1.0
Nodes (0): 

### Community 55 - "Community 55"
Cohesion: 1.0
Nodes (0): 

### Community 56 - "Community 56"
Cohesion: 1.0
Nodes (0): 

### Community 57 - "Community 57"
Cohesion: 1.0
Nodes (0): 

### Community 58 - "Community 58"
Cohesion: 1.0
Nodes (1): Project Knowledge Graph

### Community 59 - "Community 59"
Cohesion: 1.0
Nodes (1): God Nodes - top connectivity nodes

### Community 60 - "Community 60"
Cohesion: 1.0
Nodes (1): IdleHeartbeat + idle-phrases.ts (seed 13)

### Community 61 - "Community 61"
Cohesion: 1.0
Nodes (1): src/templates/landing.ts - proboi.site landing (seed 14)

### Community 62 - "Community 62"
Cohesion: 1.0
Nodes (1): TEST server: jinru (5.223.82.96, @ORCH7_bot)

### Community 63 - "Community 63"
Cohesion: 1.0
Nodes (1): SPEC PROMISE DELIVERY Этап 1 CLOSED (commit 41aab2d)

### Community 64 - "Community 64"
Cohesion: 1.0
Nodes (1): src/containers/vault-quota.ts - 2GB soft quota

### Community 65 - "Community 65"
Cohesion: 1.0
Nodes (1): NEW_GUEST_USERS list (env override or hardcoded defaults)

### Community 66 - "Community 66"
Cohesion: 1.0
Nodes (1): OWNER_ALLOWED_PATHS (ALLOWED_PATHS env or defaults)

### Community 67 - "Community 67"
Cohesion: 1.0
Nodes (1): Rate limit config (RATE_LIMIT_ENABLED/REQUESTS/WINDOW env vars)

### Community 68 - "Community 68"
Cohesion: 1.0
Nodes (1): Owner system prompt (buildOwnerSafetyPrompt, DeepSeek-aware)

### Community 69 - "Community 69"
Cohesion: 1.0
Nodes (1): Guest system prompt (buildNewGuestSafetyPrompt, tier-aware)

### Community 70 - "Community 70"
Cohesion: 1.0
Nodes (1): daily-limit.ts module

### Community 71 - "Community 71"
Cohesion: 1.0
Nodes (1): BOT_ENCYCLOPEDIA.md — user-facing feature reference for @proboiAI_bot

### Community 72 - "Community 72"
Cohesion: 1.0
Nodes (1): User public page at proboi.site/u/<userId>/ — public/ folder mapped

### Community 73 - "Community 73"
Cohesion: 1.0
Nodes (1): Daemon tasks: scheduled (cron) and persistent (max 3 concurrent) background processes

### Community 74 - "Community 74"
Cohesion: 1.0
Nodes (1): Commit style: no Generated-with / Co-Authored-By footers

### Community 75 - "Community 75"
Cohesion: 1.0
Nodes (1): Deploy constraint: test on jinru first, PROD only with explicit user confirmation

### Community 76 - "Community 76"
Cohesion: 1.0
Nodes (1): Never rsync .env or system/users.json between servers

### Community 77 - "Community 77"
Cohesion: 1.0
Nodes (1): 8 security layers: allowlist, rate limit, path validation, command safety, system prompt, command allowlist, audit, disallowedTools

### Community 78 - "Community 78"
Cohesion: 1.0
Nodes (1): MCP file-dropbox pattern: ask-user/send-file/connect-google write files, bot polls

### Community 79 - "Community 79"
Cohesion: 1.0
Nodes (1): Vision pipeline: all photos → OpenRouter Gemini (google/gemini-2.5-flash)

### Community 80 - "Community 80"
Cohesion: 1.0
Nodes (1): Installed MCPs guide reference (RU)

### Community 81 - "Community 81"
Cohesion: 1.0
Nodes (1): GRAPH_REPORT.md (graphify output)

### Community 82 - "Community 82"
Cohesion: 1.0
Nodes (1): Firewall Uninstall Script

### Community 83 - "Community 83"
Cohesion: 1.0
Nodes (1): HIGH-09: drainPendingContext helper

### Community 84 - "Community 84"
Cohesion: 1.0
Nodes (1): src/fast-path.ts

### Community 85 - "Community 85"
Cohesion: 1.0
Nodes (1): daemon-runner (Go PID 1)

### Community 86 - "Community 86"
Cohesion: 1.0
Nodes (1): Rationale: soft quota over kernel quota

### Community 87 - "Community 87"
Cohesion: 1.0
Nodes (1): Key pool / least-busy distribution concept

## Ambiguous Edges - Review These
- `deepseek-v4-flash (native DeepSeek model)` → `deepseek-chat (deprecated alias)`  [AMBIGUOUS]
  graphify-input/project_knowledge_graph.md · relation: aliases

## Knowledge Gaps
- **361 isolated node(s):** `Schedule`, `ScheduleConfig`, `notifyPayload`, `DaemonSpec`, `Manifest` (+356 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Community 40`** (2 nodes): `isPlaceholder()`, `migrate-guest-public-index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 41`** (2 nodes): `SCHEDULER_ENTRY()`, `migrate-scheduler.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 42`** (2 nodes): `renderPrivacy()`, `privacy.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 43`** (2 nodes): `renderOferta()`, `oferta.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 44`** (2 nodes): `user-dashboard.ts`, `renderDashboard()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 45`** (2 nodes): `segment_end fix for short responses (streaming.ts)`, `src/handlers/streaming.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 46`** (2 nodes): `Technical Debt (2026-05-13): YuKassa reconciliation, addUser atomic write, IP check`, `src/user-registry.ts - addUser (non-atomic write issue)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 47`** (2 nodes): `GraphStore`, `import-handoff.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 48`** (2 nodes): `src/engines/openrouter.ts`, `OpenRouterMessage interface`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 49`** (2 nodes): `FAIR-01: disk-IO limits for guests`, `src/containers/spec.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 50`** (2 nodes): `src/user-registry.ts`, `HIGH-01: writeUsersAtomic in addUser`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 51`** (2 nodes): `scripts/disable-openrouter-subkeys.ts`, `openrouterKey field in system/users.json`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 52`** (1 nodes): `migrate-guest-claude-md.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 53`** (1 nodes): `migrate-skills.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 54`** (1 nodes): `types.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 55`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 56`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 57`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 58`** (1 nodes): `Project Knowledge Graph`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 59`** (1 nodes): `God Nodes - top connectivity nodes`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 60`** (1 nodes): `IdleHeartbeat + idle-phrases.ts (seed 13)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 61`** (1 nodes): `src/templates/landing.ts - proboi.site landing (seed 14)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 62`** (1 nodes): `TEST server: jinru (5.223.82.96, @ORCH7_bot)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 63`** (1 nodes): `SPEC PROMISE DELIVERY Этап 1 CLOSED (commit 41aab2d)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 64`** (1 nodes): `src/containers/vault-quota.ts - 2GB soft quota`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 65`** (1 nodes): `NEW_GUEST_USERS list (env override or hardcoded defaults)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 66`** (1 nodes): `OWNER_ALLOWED_PATHS (ALLOWED_PATHS env or defaults)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 67`** (1 nodes): `Rate limit config (RATE_LIMIT_ENABLED/REQUESTS/WINDOW env vars)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 68`** (1 nodes): `Owner system prompt (buildOwnerSafetyPrompt, DeepSeek-aware)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 69`** (1 nodes): `Guest system prompt (buildNewGuestSafetyPrompt, tier-aware)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 70`** (1 nodes): `daily-limit.ts module`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 71`** (1 nodes): `BOT_ENCYCLOPEDIA.md — user-facing feature reference for @proboiAI_bot`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 72`** (1 nodes): `User public page at proboi.site/u/<userId>/ — public/ folder mapped`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 73`** (1 nodes): `Daemon tasks: scheduled (cron) and persistent (max 3 concurrent) background processes`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 74`** (1 nodes): `Commit style: no Generated-with / Co-Authored-By footers`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 75`** (1 nodes): `Deploy constraint: test on jinru first, PROD only with explicit user confirmation`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 76`** (1 nodes): `Never rsync .env or system/users.json between servers`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 77`** (1 nodes): `8 security layers: allowlist, rate limit, path validation, command safety, system prompt, command allowlist, audit, disallowedTools`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 78`** (1 nodes): `MCP file-dropbox pattern: ask-user/send-file/connect-google write files, bot polls`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 79`** (1 nodes): `Vision pipeline: all photos → OpenRouter Gemini (google/gemini-2.5-flash)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 80`** (1 nodes): `Installed MCPs guide reference (RU)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 81`** (1 nodes): `GRAPH_REPORT.md (graphify output)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 82`** (1 nodes): `Firewall Uninstall Script`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 83`** (1 nodes): `HIGH-09: drainPendingContext helper`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 84`** (1 nodes): `src/fast-path.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 85`** (1 nodes): `daemon-runner (Go PID 1)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 86`** (1 nodes): `Rationale: soft quota over kernel quota`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 87`** (1 nodes): `Key pool / least-busy distribution concept`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `deepseek-v4-flash (native DeepSeek model)` and `deepseek-chat (deprecated alias)`?**
  _Edge tagged AMBIGUOUS (relation: aliases) - confidence is low._
- **Why does `getUserProfile()` connect `Community 0` to `Community 9`, `Community 10`, `Community 13`, `Community 7`?**
  _High betweenness centrality (0.037) - this node is a cross-community bridge._
- **Why does `handleText()` connect `Community 0` to `Community 9`, `Community 3`, `Community 13`?**
  _High betweenness centrality (0.025) - this node is a cross-community bridge._
- **Why does `queryOpenRouter()` connect `Community 7` to `Community 0`, `Community 2`, `Community 3`, `Community 13`?**
  _High betweenness centrality (0.018) - this node is a cross-community bridge._
- **Are the 35 inferred relationships involving `handleText()` (e.g. with `getDailyUsage()` and `incrementDailyUsage()`) actually correct?**
  _`handleText()` has 35 INFERRED edges - model-reasoned connections that need verification._
- **Are the 25 inferred relationships involving `getUserProfile()` (e.g. with `handleApiMe()` and `maybeWarmInfrastructure()`) actually correct?**
  _`getUserProfile()` has 25 INFERRED edges - model-reasoned connections that need verification._
- **Are the 23 inferred relationships involving `isAuthorized()` (e.g. with `handleStart()` and `handleNew()`) actually correct?**
  _`isAuthorized()` has 23 INFERRED edges - model-reasoned connections that need verification._