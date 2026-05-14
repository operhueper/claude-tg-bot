# Graph Report - graphify-input  (2026-05-14)

## Corpus Check
- 3 files · ~50,000 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1147 nodes · 1976 edges · 77 communities detected
- Extraction: 72% EXTRACTED · 28% INFERRED · 0% AMBIGUOUS · INFERRED: 544 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Message Handlers|Message Handlers]]
- [[_COMMUNITY_Subscription & Alerts|Subscription & Alerts]]
- [[_COMMUNITY_Session & Config Core|Session & Config Core]]
- [[_COMMUNITY_Security & Infra Ops|Security & Infra Ops]]
- [[_COMMUNITY_Dependencies & Scheduling|Dependencies & Scheduling]]
- [[_COMMUNITY_Container Manager|Container Manager]]
- [[_COMMUNITY_Bot Commands & Daemons|Bot Commands & Daemons]]
- [[_COMMUNITY_Guest Routing & Keys|Guest Routing & Keys]]
- [[_COMMUNITY_Memory & Goals System|Memory & Goals System]]
- [[_COMMUNITY_Feature Design & Docs|Feature Design & Docs]]
- [[_COMMUNITY_Analytics & Dashboard|Analytics & Dashboard]]
- [[_COMMUNITY_Concepts & Architecture|Concepts & Architecture]]
- [[_COMMUNITY_MCP Integrations|MCP Integrations]]
- [[_COMMUNITY_Security Audit Pack|Security Audit Pack]]
- [[_COMMUNITY_User Bootstrapping|User Bootstrapping]]
- [[_COMMUNITY_Admin & Cost Rules|Admin & Cost Rules]]
- [[_COMMUNITY_Legal & Tiers|Legal & Tiers]]
- [[_COMMUNITY_Context Compaction (removed)|Context Compaction (removed)]]
- [[_COMMUNITY_Interactive MCPs|Interactive MCPs]]
- [[_COMMUNITY_File Drop Box|File Drop Box]]
- [[_COMMUNITY_Crash & Alert Monitoring|Crash & Alert Monitoring]]
- [[_COMMUNITY_Documentation EN|Documentation EN]]
- [[_COMMUNITY_Bot Ideas Roadmap|Bot Ideas Roadmap]]
- [[_COMMUNITY_Memory Graph RAG|Memory Graph RAG]]
- [[_COMMUNITY_Vault Quota|Vault Quota]]
- [[_COMMUNITY_MCP Server Files|MCP Server Files]]
- [[_COMMUNITY_Security Hardening|Security Hardening]]
- [[_COMMUNITY_Subscription Gate|Subscription Gate]]
- [[_COMMUNITY_Vault Quota Code|Vault Quota Code]]
- [[_COMMUNITY_Roadmap Items|Roadmap Items]]
- [[_COMMUNITY_OpenRouter Provisioning|OpenRouter Provisioning]]
- [[_COMMUNITY_Archive Handler|Archive Handler]]
- [[_COMMUNITY_Daemon Lifecycle|Daemon Lifecycle]]
- [[_COMMUNITY_User Registry|User Registry]]
- [[_COMMUNITY_Ask User MCP|Ask User MCP]]
- [[_COMMUNITY_Architecture Docs|Architecture Docs]]
- [[_COMMUNITY_Prod Infrastructure|Prod Infrastructure]]
- [[_COMMUNITY_Container Spec|Container Spec]]
- [[_COMMUNITY_Guest Public Migration|Guest Public Migration]]
- [[_COMMUNITY_Scheduler Migration|Scheduler Migration]]
- [[_COMMUNITY_Privacy Template|Privacy Template]]
- [[_COMMUNITY_Oferta Template|Oferta Template]]
- [[_COMMUNITY_Dashboard Template|Dashboard Template]]
- [[_COMMUNITY_Graph Store|Graph Store]]
- [[_COMMUNITY_OpenRouter Engine|OpenRouter Engine]]
- [[_COMMUNITY_OpenRouter Vision|OpenRouter Vision]]
- [[_COMMUNITY_Composio & MCP Filter|Composio & MCP Filter]]
- [[_COMMUNITY_DeepSeek Fast Path|DeepSeek Fast Path]]
- [[_COMMUNITY_Egress Pipeline|Egress Pipeline]]
- [[_COMMUNITY_Guest CLAUDE.md Migration|Guest CLAUDE.md Migration]]
- [[_COMMUNITY_Skills Migration|Skills Migration]]
- [[_COMMUNITY_Memory Types|Memory Types]]
- [[_COMMUNITY_Memory Index|Memory Index]]
- [[_COMMUNITY_Containers Index|Containers Index]]
- [[_COMMUNITY_Handlers Index|Handlers Index]]
- [[_COMMUNITY_New Guest Users Config|New Guest Users Config]]
- [[_COMMUNITY_Owner Allowed Paths|Owner Allowed Paths]]
- [[_COMMUNITY_Rate Limit Config|Rate Limit Config]]
- [[_COMMUNITY_Owner System Prompt|Owner System Prompt]]
- [[_COMMUNITY_Guest System Prompt|Guest System Prompt]]
- [[_COMMUNITY_Daily Limit Module|Daily Limit Module]]
- [[_COMMUNITY_Bot Encyclopedia|Bot Encyclopedia]]
- [[_COMMUNITY_Public Encyclopedia|Public Encyclopedia]]
- [[_COMMUNITY_Daemon Encyclopedia|Daemon Encyclopedia]]
- [[_COMMUNITY_Commit Style|Commit Style]]
- [[_COMMUNITY_Deploy Constraint|Deploy Constraint]]
- [[_COMMUNITY_No Rsync Env Rule|No Rsync Env Rule]]
- [[_COMMUNITY_Security Layers|Security Layers]]
- [[_COMMUNITY_MCP Dropbox Pattern|MCP Dropbox Pattern]]
- [[_COMMUNITY_Vision Pipeline Arch|Vision Pipeline Arch]]
- [[_COMMUNITY_RU MCP Guide|RU MCP Guide]]
- [[_COMMUNITY_Graph Report File|Graph Report File]]
- [[_COMMUNITY_Firewall Uninstall|Firewall Uninstall]]
- [[_COMMUNITY_Idle Phrases|Idle Phrases]]
- [[_COMMUNITY_Connect Google MCP|Connect Google MCP]]
- [[_COMMUNITY_Landing Assets|Landing Assets]]
- [[_COMMUNITY_Test Server|Test Server]]

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

### Community 0 - "Message Handlers"
Cohesion: 0.04
Nodes (119): handleAudio(), isAudioFile(), processAudioFile(), handleCallback(), handlePlanCallback(), handleResumeCallback(), commandAllowed(), handleCancel() (+111 more)

### Community 1 - "Subscription & Alerts"
Cohesion: 0.06
Nodes (53): alertExpiringSubscription(), alertHighFreeUserCount(), alertNewSubscriber(), notifyOwner(), handleInviteCallback(), handleTaskConfirmCallback(), handlePay(), sendMessage() (+45 more)

### Community 2 - "Session & Config Core"
Cohesion: 0.03
Nodes (68): ClaudeSession class (per-user session state), ALLOWED_USERS (TELEGRAM_ALLOWED_USERS + UserRegistry merge), BLOCKED_PATTERNS (fork bomb, rm -rf /, etc.), bootstrapNewGuestDir() — vault structure setup on first access, buildGuestBaseEnv() — explicit passthrough (no process.env spread), .daemons.yaml bootstrap (bot-scheduler default daemon), getNewGuestOpenRouterKey() — per-user key file fallback, getUserProfile(userId) — single source of truth for profiles (+60 more)

### Community 3 - "Security & Infra Ops"
Cohesion: 0.04
Nodes (68): /etc/claude-firewall/env Config, Composio OAuth Flow — Account Binding, Composio Security Model, CPU Alert Logic, CPU Monitor Install Script, CPU Monitor State Files, Custom MCP Deployment Checklist, Custom MCP TypeScript Skeleton (+60 more)

### Community 4 - "Dependencies & Scheduling"
Cohesion: 0.04
Nodes (60): Cron: 21:00 daily (evening summary), Cron: 10:00 daily (morning nudge), Cron: every 2 minutes (sync), Bun Runtime, @anthropic-ai/claude-agent-sdk, @modelcontextprotocol/sdk, Env: OPENROUTER_API_KEY, Env: TELEGRAM_PARALLEL_ALLOWED_PATHS (+52 more)

### Community 5 - "Container Manager"
Cohesion: 0.06
Nodes (16): stopRunner(), chownToSandbox(), ContainerManager, hasActiveDaemons(), containerName(), dropboxDir(), userDataDir(), ClaudeSession (+8 more)

### Community 6 - "Bot Commands & Daemons"
Cohesion: 0.06
Nodes (32): newCmd(), crashEvent, daemon, DaemonSpec, Manifest, runner, add(), applyTimeline() (+24 more)

### Community 7 - "Guest Routing & Keys"
Cohesion: 0.05
Nodes (54): src/handlers/audio.ts, C-1: voice.ts rate limit moved after acquireUserLock, C-2: profile.md prompt injection: wrapAsProfileData() (session.ts), src/handlers/callback.ts, src/handlers/commands.ts, compactIfNeeded() (session.ts), Compact thresholds ×2: guest 100k, owner 320k (DeepSeek V4 1M ctx), src/config.ts (+46 more)

### Community 8 - "Memory & Goals System"
Cohesion: 0.08
Nodes (25): handleForget(), GoalsStore, handleAchieve(), handleGoalCallback(), handleGoals(), handleGoalsAdd(), ulid(), GraphStore (+17 more)

### Community 9 - "Feature Design & Docs"
Cohesion: 0.06
Nodes (47): Claude Code Features (5 features), Session Compaction Feature, containerEnabled Per-User Bugfix, Mental model shift: container = ephemeral workspace → personal 24/7 slot, Container Pause Skip for Active Daemons, --restart=unless-stopped: containers survive host reboot and docker daemon restart, CPU Monitor Script, scripts/monitoring/*: docker stats every minute, 60-point history, alert if avg >70% for 1hr (+39 more)

### Community 10 - "Analytics & Dashboard"
Cohesion: 0.07
Nodes (31): analyzeSession(), nextResetAt(), handleApiAdminAll(), handleApiMe(), handleYuKassaWebhookRoute(), isYuKassaIp(), jsonErr(), jsonOk() (+23 more)

### Community 11 - "Concepts & Architecture"
Cohesion: 0.06
Nodes (40): Access Approval Flow, BotFather Token, Guest Container (isolated env), ! Interrupt Shorthand, MCP (Model Context Protocol), New User Onboarding Flow, Skill (Claude Code skill), Composio Guide (EN) — stub (+32 more)

### Community 12 - "MCP Integrations"
Cohesion: 0.07
Nodes (22): buildContainerBashMcp(), buildGoogleMcpUrl(), getComposioApiKey(), initiateGoogleConnections(), connect-google-{userId}-*.json drop-box pattern, code(), convertBlockquotes(), convertMarkdownToHtml() (+14 more)

### Community 13 - "Security Audit Pack"
Cohesion: 0.07
Nodes (29): Audit-fixes sprint: 25 atomic commits (2026-05-13 evening), Consent Gate (commit 8c62b1d), src/handlers/consent-gate.ts, src/consent.ts, src/containers/bash-mcp.ts (mcp__container__Bash), CRIT-01: /root/.claude/projects/* owner-only (ae0d652), CRIT-02: mcp__container__Bash BLOCKED_PATTERNS_CONTAINER (7fde99c), CRIT-03: heartbeat leak closed all 5 handlers (e60e32e) (+21 more)

### Community 14 - "User Bootstrapping"
Cohesion: 0.08
Nodes (25): ALLOWED_USERS in-memory mutation on invite approve, Owner (292228713) vs Guest: separate cwd, settingSources, models, commands, bootstrapNewGuestDir — vault layout provisioning on approve, askuser inline keyboard response handler, cancel_subscription / confirm_cancel_subscription callbacks, handleGoalCallback — goal done/pause/delete, handleCallback — main callback router, handleInviteCallback — invite approve/deny handler (+17 more)

### Community 15 - "Admin & Cost Rules"
Cohesion: 0.12
Nodes (24): Admin Operations Map, Agent Routing Rules, API Cost Rules, Agent Routing Rules (CLAUDE.md workspace), Group Chat Persona: Клод, Kseniya Inbox (shared workspace), Marketing Knowledge Base Rule, Marketing RAG Library (9 books, 4435 chunks) (+16 more)

### Community 16 - "Legal & Tiers"
Cohesion: 0.09
Nodes (23): Proboi tiers: Free (10 msg/day) vs Профи (499₽/мес, unlimited), Data retention policy: logs stored minimum 6 months, OFERTA_DRAFT.md — legal terms draft for Proboi platform, Platform rights: suspend account, inspect containers, cooperate with law, User prohibitions: no spam/phishing/malware/piracy/PD hosting, Pre-publication checklist: abuse@ email, SLA, logs, lawyer review, onboarding gate, Conversion philosophy: upsell at every interaction via guide page, not at purchase, Task 7: daily limit — FREE_DAILY_LIMIT=10, counter in-memory, resets 00:00 UTC (+15 more)

### Community 17 - "Context Compaction (removed)"
Cohesion: 0.1
Nodes (22): compactSession(): summarizes old messages via LLM, replaces with summary block, rewrites sessionFile, estimateContextSize(): reads sessionFile, counts JSON bytes, approximates tokens, buildSummaryPrompt(): prompt for summarizing dialog history, max 2000 words, Feature 3: Context compaction — auto-summarize old messages when approaching token limit, Feature 4: Guest memory — persistent session summaries in /opt/vault/{userId}/memory/, Feature 1: Plan Mode — pre-execution plan with PLAN_START/PLAN_END markers and confirm/cancel/clarify buttons, Feature 5: Redirect interrupt — !<text> aborts current execution and relaunches with new instruction, Feature 2: Todo-list — live progress tracking with TODO_LIST_START/TODO_ITEM/TODO_START/TODO_DONE markers (+14 more)

### Community 18 - "Interactive MCPs"
Cohesion: 0.11
Nodes (15): Ask User Drop-box Pattern, Ask User MCP Server, ask_user tool, .daemons.yaml, Notify Bridge (http://172.18.0.1:3849/notify), Notify bridge allowed users gate, docker inspect IP verification (container owns userId), Message truncation to 4000 chars before Telegram send (+7 more)

### Community 19 - "File Drop Box"
Cohesion: 0.18
Nodes (16): containerManager.exec(userId, cmd, opts), containerManager.getOrStart(profile), send-file-{userId}-*.json drop-box pattern, checkPendingSendFileRequests (per-user drop-box), executeToolAsync(), create_excel tool (python3 openpyxl), generate_image tool (Pollinations AI), list_dir tool (+8 more)

### Community 20 - "Crash & Alert Monitoring"
Cohesion: 0.29
Nodes (8): escapeHtml(), processOnce(), readEvent(), startCrashloopWatcher(), notifyGuest(), notifyOwnerDM(), notifyProblemChannel(), send()

### Community 21 - "Documentation EN"
Cohesion: 0.53
Nodes (11): Guide EN — FAQ and Limits (09), Guide EN — What is MCP (02), Guide EN — Roadmap (04), Guide EN — Build Your Own Bot (08), Guide EN — README (index), Guide EN — Scenarios (01), Guide EN — Skills (07), Guide EN — Getting Started (00) (+3 more)

### Community 22 - "Bot Ideas Roadmap"
Cohesion: 0.18
Nodes (11): Idea #7: Bots On Demand Agency, Idea #26: Freelancer Assistant Bot, Idea #5: Micro-Learning Platform, Idea #30: Second Brain for Managers, Idea #11: Smart Savings Bot, Idea #2: Tax Assistant Bot, Music Server Idea (Navidrome), Evgeniy Inbox (+3 more)

### Community 23 - "Memory Graph RAG"
Cohesion: 0.33
Nodes (6): buildMemoryContext(), sanitizeForPrompt(), jaccard(), rankNodesByQuery(), scoreNode(), tokenize()

### Community 24 - "Vault Quota"
Cohesion: 0.22
Nodes (9): Vault quota: 2 GB soft limit per guest, 60s TTL cache, checkVaultQuota() pre-message, Vault structure: inbox/, public/, notes/, projects/, skills/, memory/, MEDIUM bottleneck: MAX_CONCURRENT_CONTAINER_SESSIONS=5 global semaphore, CRITICAL bottleneck: single CPU core — hard ceiling at 10+ concurrent users, MEDIUM bottleneck: shared DeepSeek API key — rate limits at 20+ concurrent, HIGH bottleneck: 1.9 GiB RAM — comfortable only for 3-5 active containers, MEDIUM bottleneck: vault-quota.ts execFileSync du — blocks event loop, Decision: jinru TEST server NOT ready for 50 users (+1 more)

### Community 25 - "MCP Server Files"
Cohesion: 0.25
Nodes (1): main()

### Community 26 - "Security Hardening"
Cohesion: 0.29
Nodes (7): audit/2026-05-14-pre-rotation/ (23 docs + FIX_PLAN + VULNERABILITIES), Key Rotation TODO (TG/OPENAI/OPENROUTER/DEEPSEEK/COMPOSIO), Rationale: userns-remap uid offset 100000 (UID escape → host UID 101000, no access to other vaults), Security Hardening Pack (25 commits 3e0b1d6..fc6edb8), V-01 free-tier: text only (no Bash/Read/Write/MCP), V-02 memory injection: zod+escape, reply_to sanitize, V-26 userns-remap (uid 101000 on vault)

### Community 27 - "Subscription Gate"
Cohesion: 0.6
Nodes (5): handleSubscriptionCheckCallback(), invalidateSubscription(), isSubscribed(), isSubscriptionGateEnabled(), parseChannelId()

### Community 28 - "Vault Quota Code"
Cohesion: 0.47
Nodes (4): checkVaultQuota(), formatBytes(), getVaultPath(), getVaultQuotaBytes()

### Community 29 - "Roadmap Items"
Cohesion: 0.33
Nodes (6): Feature: Context Compaction — Auto-compress Near Limit, Feature: Guest Memory — Persistent Context Between Sessions, Feature: Interrupt with Redirect — Graceful Execution Control, Feature: Plan Mode — Pre-execution Plan, Roadmap Technical Risks, Feature: Todo List — Real-time Progress

### Community 30 - "OpenRouter Provisioning"
Cohesion: 0.5
Nodes (5): createGuestSubKey() — POST /api/v1/keys, deleteGuestSubKey() — DELETE /api/v1/keys/{hash}, OpenRouter Provisioning (per-user subkeys), OPENROUTER_PROVISIONING_KEY env var, OPENROUTER_GUEST_LIMIT_USD (default $2.0)

### Community 31 - "Archive Handler"
Cohesion: 0.5
Nodes (4): checkArchiveSize (zip bomb prevention), preScanTar (path traversal guard), processArchive (zip/tar with zip-slip guard), assertNoZipSlip (post-extraction path check)

### Community 32 - "Daemon Lifecycle"
Cohesion: 0.5
Nodes (4): Alert chain: alert-bot → owner-alerts → problem channel, Always-on automations cluster (seed 15: daemon-runner, .daemons.yaml, crashloop), daemon-runner (Go PID 1 supervisor) — 12 edges, .daemons.yaml manifest — 6 edges

### Community 33 - "User Registry"
Cohesion: 0.67
Nodes (3): UserRegistry, UserNode interface, UserRole type (owner|guest|new_guest)

### Community 34 - "Ask User MCP"
Cohesion: 0.67
Nodes (3): ask-user-{userId}-*.json drop-box pattern, checkPendingAskUserRequests (per-user drop-box), createAskUserKeyboard (inline buttons)

### Community 35 - "Architecture Docs"
Cohesion: 0.67
Nodes (3): AGENTS.md is a symlink to CLAUDE.md — identical content for Codex/other tools, Message flow: Telegram → Handler → Auth → Rate limit → Claude session → Stream → Audit, CLAUDE.md: read project_knowledge_graph.md before any work; update after tasks

### Community 36 - "Prod Infrastructure"
Cohesion: 0.67
Nodes (3): src/templates/landing.ts (proboi.site landing, 1188 lines), proboi.site (89.167.125.175, prod domain), proboi-bot (89.167.125.175, @proboiAI_bot)

### Community 37 - "Container Spec"
Cohesion: 0.67
Nodes (3): lxcfs fallback fix: kernel 6.8.0-90 read-only bind-mount (manager.ts), src/containers/manager.ts, src/containers/spec.ts (buildRunArgs)

### Community 38 - "Guest Public Migration"
Cohesion: 1.0
Nodes (0): 

### Community 39 - "Scheduler Migration"
Cohesion: 1.0
Nodes (0): 

### Community 40 - "Privacy Template"
Cohesion: 1.0
Nodes (0): 

### Community 41 - "Oferta Template"
Cohesion: 1.0
Nodes (0): 

### Community 42 - "Dashboard Template"
Cohesion: 1.0
Nodes (0): 

### Community 43 - "Graph Store"
Cohesion: 1.0
Nodes (1): GraphStore

### Community 44 - "OpenRouter Engine"
Cohesion: 1.0
Nodes (2): src/engines/openrouter.ts, OpenRouterMessage interface

### Community 45 - "OpenRouter Vision"
Cohesion: 1.0
Nodes (2): OPENROUTER_API_KEY (env), Vision pipeline (OpenRouter Gemini Flash)

### Community 46 - "Composio & MCP Filter"
Cohesion: 1.0
Nodes (2): src/composio.ts, src/mcp-filter.ts

### Community 47 - "DeepSeek Fast Path"
Cohesion: 1.0
Nodes (2): src/engines/deepseek-fast.ts (uncommitted), src/fast-path.ts (uncommitted)

### Community 48 - "Egress Pipeline"
Cohesion: 1.0
Nodes (2): Egress pipeline: setup→monitor→reset via systemd, scripts/firewall/egress-monitor.sh — 6 edges

### Community 49 - "Guest CLAUDE.md Migration"
Cohesion: 1.0
Nodes (0): 

### Community 50 - "Skills Migration"
Cohesion: 1.0
Nodes (0): 

### Community 51 - "Memory Types"
Cohesion: 1.0
Nodes (0): 

### Community 52 - "Memory Index"
Cohesion: 1.0
Nodes (0): 

### Community 53 - "Containers Index"
Cohesion: 1.0
Nodes (0): 

### Community 54 - "Handlers Index"
Cohesion: 1.0
Nodes (0): 

### Community 55 - "New Guest Users Config"
Cohesion: 1.0
Nodes (1): NEW_GUEST_USERS list (env override or hardcoded defaults)

### Community 56 - "Owner Allowed Paths"
Cohesion: 1.0
Nodes (1): OWNER_ALLOWED_PATHS (ALLOWED_PATHS env or defaults)

### Community 57 - "Rate Limit Config"
Cohesion: 1.0
Nodes (1): Rate limit config (RATE_LIMIT_ENABLED/REQUESTS/WINDOW env vars)

### Community 58 - "Owner System Prompt"
Cohesion: 1.0
Nodes (1): Owner system prompt (buildOwnerSafetyPrompt, DeepSeek-aware)

### Community 59 - "Guest System Prompt"
Cohesion: 1.0
Nodes (1): Guest system prompt (buildNewGuestSafetyPrompt, tier-aware)

### Community 60 - "Daily Limit Module"
Cohesion: 1.0
Nodes (1): daily-limit.ts module

### Community 61 - "Bot Encyclopedia"
Cohesion: 1.0
Nodes (1): BOT_ENCYCLOPEDIA.md — user-facing feature reference for @proboiAI_bot

### Community 62 - "Public Encyclopedia"
Cohesion: 1.0
Nodes (1): User public page at proboi.site/u/<userId>/ — public/ folder mapped

### Community 63 - "Daemon Encyclopedia"
Cohesion: 1.0
Nodes (1): Daemon tasks: scheduled (cron) and persistent (max 3 concurrent) background processes

### Community 64 - "Commit Style"
Cohesion: 1.0
Nodes (1): Commit style: no Generated-with / Co-Authored-By footers

### Community 65 - "Deploy Constraint"
Cohesion: 1.0
Nodes (1): Deploy constraint: test on jinru first, PROD only with explicit user confirmation

### Community 66 - "No Rsync Env Rule"
Cohesion: 1.0
Nodes (1): Never rsync .env or system/users.json between servers

### Community 67 - "Security Layers"
Cohesion: 1.0
Nodes (1): 8 security layers: allowlist, rate limit, path validation, command safety, system prompt, command allowlist, audit, disallowedTools

### Community 68 - "MCP Dropbox Pattern"
Cohesion: 1.0
Nodes (1): MCP file-dropbox pattern: ask-user/send-file/connect-google write files, bot polls

### Community 69 - "Vision Pipeline Arch"
Cohesion: 1.0
Nodes (1): Vision pipeline: all photos → OpenRouter Gemini (google/gemini-2.5-flash)

### Community 70 - "RU MCP Guide"
Cohesion: 1.0
Nodes (1): Installed MCPs guide reference (RU)

### Community 71 - "Graph Report File"
Cohesion: 1.0
Nodes (1): GRAPH_REPORT.md (graphify output)

### Community 72 - "Firewall Uninstall"
Cohesion: 1.0
Nodes (1): Firewall Uninstall Script

### Community 73 - "Idle Phrases"
Cohesion: 1.0
Nodes (1): src/idle-phrases.ts (130 heartbeat phrases)

### Community 74 - "Connect Google MCP"
Cohesion: 1.0
Nodes (1): connect_google_mcp/server.ts (OAuth drop-box MCP)

### Community 75 - "Landing Assets"
Cohesion: 1.0
Nodes (1): src/templates/assets/ (CSS/JS, 3 files, 1975 lines)

### Community 76 - "Test Server"
Cohesion: 1.0
Nodes (1): jinru (5.223.82.96, @ORCH7_bot, disabled)

## Knowledge Gaps
- **336 isolated node(s):** `Schedule`, `ScheduleConfig`, `notifyPayload`, `DaemonSpec`, `Manifest` (+331 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Guest Public Migration`** (2 nodes): `isPlaceholder()`, `migrate-guest-public-index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Scheduler Migration`** (2 nodes): `SCHEDULER_ENTRY()`, `migrate-scheduler.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Privacy Template`** (2 nodes): `renderPrivacy()`, `privacy.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Oferta Template`** (2 nodes): `renderOferta()`, `oferta.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Dashboard Template`** (2 nodes): `user-dashboard.ts`, `renderDashboard()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Graph Store`** (2 nodes): `GraphStore`, `import-handoff.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `OpenRouter Engine`** (2 nodes): `src/engines/openrouter.ts`, `OpenRouterMessage interface`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `OpenRouter Vision`** (2 nodes): `OPENROUTER_API_KEY (env)`, `Vision pipeline (OpenRouter Gemini Flash)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Composio & MCP Filter`** (2 nodes): `src/composio.ts`, `src/mcp-filter.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `DeepSeek Fast Path`** (2 nodes): `src/engines/deepseek-fast.ts (uncommitted)`, `src/fast-path.ts (uncommitted)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Egress Pipeline`** (2 nodes): `Egress pipeline: setup→monitor→reset via systemd`, `scripts/firewall/egress-monitor.sh — 6 edges`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Guest CLAUDE.md Migration`** (1 nodes): `migrate-guest-claude-md.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Skills Migration`** (1 nodes): `migrate-skills.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Memory Types`** (1 nodes): `types.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Memory Index`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Containers Index`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Handlers Index`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `New Guest Users Config`** (1 nodes): `NEW_GUEST_USERS list (env override or hardcoded defaults)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Owner Allowed Paths`** (1 nodes): `OWNER_ALLOWED_PATHS (ALLOWED_PATHS env or defaults)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Rate Limit Config`** (1 nodes): `Rate limit config (RATE_LIMIT_ENABLED/REQUESTS/WINDOW env vars)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Owner System Prompt`** (1 nodes): `Owner system prompt (buildOwnerSafetyPrompt, DeepSeek-aware)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Guest System Prompt`** (1 nodes): `Guest system prompt (buildNewGuestSafetyPrompt, tier-aware)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Daily Limit Module`** (1 nodes): `daily-limit.ts module`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Bot Encyclopedia`** (1 nodes): `BOT_ENCYCLOPEDIA.md — user-facing feature reference for @proboiAI_bot`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Public Encyclopedia`** (1 nodes): `User public page at proboi.site/u/<userId>/ — public/ folder mapped`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Daemon Encyclopedia`** (1 nodes): `Daemon tasks: scheduled (cron) and persistent (max 3 concurrent) background processes`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Commit Style`** (1 nodes): `Commit style: no Generated-with / Co-Authored-By footers`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Deploy Constraint`** (1 nodes): `Deploy constraint: test on jinru first, PROD only with explicit user confirmation`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `No Rsync Env Rule`** (1 nodes): `Never rsync .env or system/users.json between servers`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Security Layers`** (1 nodes): `8 security layers: allowlist, rate limit, path validation, command safety, system prompt, command allowlist, audit, disallowedTools`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `MCP Dropbox Pattern`** (1 nodes): `MCP file-dropbox pattern: ask-user/send-file/connect-google write files, bot polls`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Vision Pipeline Arch`** (1 nodes): `Vision pipeline: all photos → OpenRouter Gemini (google/gemini-2.5-flash)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `RU MCP Guide`** (1 nodes): `Installed MCPs guide reference (RU)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Graph Report File`** (1 nodes): `GRAPH_REPORT.md (graphify output)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Firewall Uninstall`** (1 nodes): `Firewall Uninstall Script`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Idle Phrases`** (1 nodes): `src/idle-phrases.ts (130 heartbeat phrases)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Connect Google MCP`** (1 nodes): `connect_google_mcp/server.ts (OAuth drop-box MCP)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Landing Assets`** (1 nodes): `src/templates/assets/ (CSS/JS, 3 files, 1975 lines)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Test Server`** (1 nodes): `jinru (5.223.82.96, @ORCH7_bot, disabled)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `handleText()` connect `Message Handlers` to `Subscription & Alerts`, `MCP Integrations`, `Container Manager`?**
  _High betweenness centrality (0.030) - this node is a cross-community bridge._
- **Why does `getUserProfile()` connect `Message Handlers` to `Subscription & Alerts`, `Memory & Goals System`, `Analytics & Dashboard`, `MCP Integrations`, `File Drop Box`?**
  _High betweenness centrality (0.029) - this node is a cross-community bridge._
- **Why does `handleCallback()` connect `Message Handlers` to `Memory & Goals System`, `Subscription & Alerts`, `Subscription Gate`, `Container Manager`?**
  _High betweenness centrality (0.027) - this node is a cross-community bridge._
- **Are the 35 inferred relationships involving `handleText()` (e.g. with `getDailyUsage()` and `incrementDailyUsage()`) actually correct?**
  _`handleText()` has 35 INFERRED edges - model-reasoned connections that need verification._
- **Are the 25 inferred relationships involving `getUserProfile()` (e.g. with `handleApiMe()` and `maybeWarmInfrastructure()`) actually correct?**
  _`getUserProfile()` has 25 INFERRED edges - model-reasoned connections that need verification._
- **Are the 23 inferred relationships involving `isAuthorized()` (e.g. with `handleStart()` and `handleNew()`) actually correct?**
  _`isAuthorized()` has 23 INFERRED edges - model-reasoned connections that need verification._
- **Are the 24 inferred relationships involving `getSession()` (e.g. with `checkInterrupt()` and `getUserProfile()`) actually correct?**
  _`getSession()` has 24 INFERRED edges - model-reasoned connections that need verification._