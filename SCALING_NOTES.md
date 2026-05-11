# Scaling Notes — 50-100 Users

> Analysis date: 2026-05-11 | Server: jinru (5.223.82.96)

## Current Server Capacity

| Metric | Value |
|---|---|
| RAM total | 1.9 GiB |
| RAM available | 1.4 GiB (377 MiB free + 1.2 GiB buff/cache) |
| Swap | 2.0 GiB (339 MiB used) |
| Disk / | 38 GB total, 22 GB used (15 GB free, 60% used) |
| CPU cores | 1 |
| Load average | 0.05 / 0.03 / 0.01 (essentially idle) |

## Docker Container Capacity

- Active containers: 1 (claude-user-7767881645, using 2.65 MiB / 512 MiB)
- At 512 MB limit: server can host approximately **2-3 containers simultaneously** before exhausting available RAM
  - Calculation: 1,400 MiB available / 512 MiB = ~2.7 containers at full limit
  - Realistic idle usage per container: ~10-30 MiB (observed: 2.65 MiB at idle), so at idle the server could host ~40-50 containers
  - But under load (DeepSeek agentic loop with tool calls), a container easily spikes to 100-200 MiB
  - At 100 MiB active usage average: ~14 containers before RAM pressure
  - **Swap is available (1.7 GiB free)** but relying on swap for containers causes severe latency

## Bottlenecks

### 1. Single CPU core [SEVERITY: CRITICAL at 10+ concurrent users]
- The server has exactly **1 CPU core** (`nproc = 1`).
- Bun/Node.js is single-threaded. One blocking call or CPU-heavy task freezes all users.
- Heavy Python/LibreOffice/ffmpeg operations inside containers still share CPU scheduling with the bot process.
- **This is the primary hard ceiling.** Even with enough RAM, 50-100 users will cause severe queuing on 1 core.
- Mitigation: Upgrade to a multi-core server (2-4 vCPUs minimum). Current jinru spec is inadequate for 50 users.

### 2. RAM — 1.9 GiB total [SEVERITY: HIGH at 15+ concurrent users]
- Bot process: ~86 MiB RSS currently
- dockerd + containerd: ~106 MiB
- Open Design sidecars: ~46 MiB
- Remaining OS/other: ~280 MiB
- Headroom for containers: ~1.4 GiB available
- At 512 MiB hard limit per container and realistic active usage, the server starts swapping around **8-10 concurrently active containers**.
- Mitigation: Upgrade to 4-8 GiB RAM. Alternatively keep the global container semaphore (`MAX_CONCURRENT_CONTAINER_SESSIONS`, default 5) set conservatively.

### 3. openrouter.ts execSync — owner host-mode path [SEVERITY: LOW — owner only]
- Location: `src/engines/openrouter.ts:347`
- `execSync` is used in the **host-mode (owner) path only** — the `if (profile.containerEnabled)` branch runs `exec()` in the container (async), and the `execSync` path is reached only for the owner or legacy non-container mode.
- With 1 owner, this is not a concurrent-user risk in practice.
- `execFileSync` at line 500 (`create_excel` tool) similarly runs synchronously and blocks the event loop for up to 30 seconds.
- Mitigation: Low priority given owner-only scope. If guests ever get host-mode access, convert to `execFileAsync`.

### 4. vault-quota.ts — synchronous execFileSync du [SEVERITY: MEDIUM at 50+ users]
- Location: `src/containers/vault-quota.ts:62`
- `execFileSync("du", ...)` is called synchronously, blocking the event loop for the duration of `du` on the vault directory.
- With 50 users each sending messages in parallel, this is called up to 50 times concurrently — but because it is sync, each call serialises against the others.
- **Mitigation already partially in place**: 60-second TTL cache (`CACHE_TTL_MS = 60_000`). After the cache warms up, blocking calls drop to at most 1 per user per 60 seconds. Cache hits are instant.
- At 50 users with cold cache (bot restart, or 60s cache expire): 50 sequential `du` calls of ~100-200ms each = up to 10 seconds of event loop blocking.
- Full mitigation: convert to `execFileAsync` (already used in `metrics.ts` — just import `execFile` from `node:child_process` and promisify).

### 5. Global container semaphore — default 5 slots [SEVERITY: MEDIUM at 20+ users]
- Location: `src/request-queue.ts:7`
- `MAX_CONCURRENT_CONTAINER_SESSIONS = parseInt(process.env.MAX_CONCURRENT_CONTAINER_SESSIONS || "5", 10)`
- Only 5 container sessions can run concurrently. At 20+ active guests, 15+ requests queue up waiting for a slot.
- With 1 CPU core, raising this limit beyond 5 provides no real throughput gain and makes starvation worse.
- Mitigation: Keep at 5 until CPU is upgraded. Set user expectation: responses may queue.

### 6. DeepSeek API — shared single key [SEVERITY: MEDIUM at 20+ concurrent requests]
- All guests share one DeepSeek API key (owner's key).
- DeepSeek documented rate limits: Tier-1 (~20 RPM or ~300K TPM depending on account tier).
- At 20+ concurrent users each sending messages within 1 minute, the shared key will hit rate limits.
- Rate limit errors surface as failed requests (no retry implemented in `openrouter.ts`).
- Mitigation: Monitor via metering.sqlite. If rate limits hit, add DeepSeek-specific retry-with-backoff in `openrouter.ts`, or upgrade the DeepSeek account tier.

### 7. Disk — 15 GB free, 60% used [SEVERITY: MEDIUM at 50 users with active vaults]
- Guest vault default quota: 2 GB per user.
- 50 users × 2 GB = up to 100 GB potential vault data — far exceeds available disk.
- In practice vaults start near-empty and grow slowly. The 15 GB free is comfortable for ~7 fully-utilised vaults.
- Mitigation: Per-user quota enforcement (`checkVaultQuota`) is already implemented. Keep default at 2 GB. Add a periodic cleanup cron or alert when `/` exceeds 80%.

## Recommendation

**Ready for 50 users: NO**

Primary blockers:

1. **1 CPU core** — the bot and all guest container workloads share a single core. Even with async I/O, CPU-intensive container tasks will queue and block other users. At 10+ concurrent tool-using sessions the system will feel sluggish. At 50 active users it will be unusably slow.

2. **1.9 GiB RAM** — comfortable for 3-5 active containers but not 50. Swap will be hit regularly with 10+ active sessions.

The TEST server (jinru) is adequate for **staging with 5-10 users**. For 50-100 users, the PROD server (proboi-bot, 89.167.125.175) needs to be verified against the same metrics — it may have better specs. This TEST server is not suitable for the 50-user goal without a hardware upgrade.

## Priority Fixes Before Scaling

1. **[CRITICAL] Upgrade jinru to 2+ vCPUs and 4+ GiB RAM** — single core is the hard ceiling. Without this, no code fix helps. For PROD, verify specs first.

2. **[HIGH] Fix vault-quota.ts execFileSync du** — convert to async (`execFileAsync` pattern already exists in `metrics.ts`). Copy the `promisify(execFile)` pattern. This removes the 1-per-user event loop block on cold-cache messages.

3. **[MEDIUM] Add DeepSeek retry with exponential backoff** — `openrouter.ts` `openRouterRequest()` should catch HTTP 429 and retry up to 3 times with jitter. Prevents silent failures when the shared key is rate-limited.

4. **[MEDIUM] Disk monitoring** — add a startup check that logs a warning when `/` is above 75% usage. At 60% now with 15 GB free, 50 users filling vaults will hit the limit within weeks.

5. **[LOW] execFileSync in create_excel tool** — convert to async. Blocks event loop for up to 30 seconds when a user creates a large Excel file. Low priority since it is owner-only today, but should be fixed before guests get the tool.
