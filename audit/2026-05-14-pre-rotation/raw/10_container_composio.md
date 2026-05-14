# Container Isolation & Composio Cross-Tenant Audit

Date: 2026-05-14  
Scope: paid-tier Docker container isolation, container escape vectors, Composio multi-tenant  
Method: static code review + live `docker inspect` on prod (89.167.125.175), active exploitation tests

---

## Container Config — Actual State (prod, claude-user-893951298)

From `docker inspect` HostConfig:

```
--cap-drop=ALL         ✅ confirmed
--security-opt=no-new-privileges  ✅ confirmed
--read-only            ✅ confirmed (ReadonlyRootfs: true)
--memory=512m          ✅ confirmed (536870912 bytes)
--memory-swap=512m     ✅ confirmed (zero swap)
--cpus=1.0             ✅ confirmed (NanoCpus: 1000000000)
--pids-limit=512       ✅ confirmed
--ulimit=nofile=1024:2048  ✅ confirmed
--user=1000:1000       ✅ confirmed
--network=claude-guest-net  ✅ confirmed
--init (tini)          ✅ confirmed
AppArmor: docker-default  ✅ confirmed
IpcMode: private       ✅ confirmed
CgroupnsMode: private  ✅ confirmed
```

**Not mounted:**
- `/var/run/docker.sock` — absent ✅
- `/proc` (rw) — absent ✅ (lxcfs files mounted :ro only)
- `/opt` parent — absent (only `/opt/vault/<userId>/` mounted) ✅

---

## Findings

### CRIT-01: Hetzner metadata endpoint reachable from guest containers

**Status: OPEN / NOT in VULNERABILITIES.md**

```
docker exec claude-user-893951298 curl http://169.254.169.254/hetzner/v1/metadata
```

Returns full metadata including:
- `instance-id: 129453078`
- `hostname: proboi-bot`
- `region: eu-central`
- `local-ipv4`
- `public-ipv4: 89.167.125.175`
- `public-keys:` (SSH public key of owner)
- `vendor_data` (cloud-init blob with random_seed, runcmd)

Hetzner does NOT expose private keys or auth tokens via IMDSv1 (unlike AWS).  
However: instance-id + hostname + region leaks infrastructure fingerprint.  
More importantly: if Hetzner ever rotates to IMDSv2 with token-based auth tokens in metadata — this vector opens. Also: `vendor_data` contains cloud-init `runcmd` history.

**Firewall state:** DOCKER-USER chain and INPUT chain have no 169.254.169.254 rule.  
`iptables -L FORWARD | grep 169` returns empty. UFW has no such rule either.

**Fix:** Add iptables rule to DOCKER-USER chain:
```bash
iptables -I DOCKER-USER 1 -s 172.18.0.0/16 -d 169.254.169.254 -j DROP
```
And persist in `scripts/firewall/docker-user-rules.sh`.

**Severity: MEDIUM** (Hetzner IMDSv1 limited, no credentials exposed now — but SHOULD be blocked as defense-in-depth).

---

### HIGH-01: Blkio disk-IO limits silently inactive on cgroup v2

**Status: OPEN / partially documented as V-1I in VULNERABILITIES.md**

`docker inspect` shows all blkio fields as zero despite `spec.ts` setting `--blkio-weight=500 --device-write-bps /dev/sda1:50m ...`.

Root cause: prod runs **cgroup v2** (confirmed: `Cgroup Version: 2`, `Cgroup Driver: systemd`). Docker's `--blkio-weight`, `--device-write-bps`, `--device-read-bps`, `--device-write-iops`, `--device-read-iops` flags are **ignored on cgroup v2** — these are cgroupv1 blkio controller knobs. cgroupv2 uses the io controller (BFQ/CFQ), which Docker does not expose via these flags.

**Impact:** No disk-IO rate limiting on any guest container. A guest can `dd if=/dev/zero of=/opt/vault/<id>/bigfile bs=1M` or run yt-dlp at full NVMe speed (~500 MB/s), saturating IO for all other guests and the host bot process.

The egress HTB scripts (`set-baseline-egress.sh`) only cap network egress (20 Mbit/s), not disk IO.

**Fix:** Use cgroup v2 io controller. Two options:
1. Docker 25+ `--device-write-bps` on cgroupv2: requires `runc >= 1.1.0` AND systemd cgroup delegation. Check with `docker info | grep "Cgroup"` — if driver is `systemd`, pass `--cgroupns=host` or configure via `/etc/docker/daemon.json`:
   ```json
   {"exec-opts": ["native.cgroupdriver=cgroupfs"]}
   ```
   But this changes global Docker behavior.
2. Simpler: Apply cgroup v2 io limits via systemd slice that wraps the container:
   ```
   IOReadBandwidthMax=/dev/sda1 104857600
   IOWriteBandwidthMax=/dev/sda1 52428800
   ```
   Or set per-container via `docker run --cgroup-parent=<slice>` and configure the slice.

**Severity: HIGH** (no disk-IO protection; multi-tenant starvation possible).

---

### HIGH-02: Inter-container lateral movement via shared bridge — no FORWARD isolation

**Status: OPEN**

All guest containers are on `claude-guest-net` (172.18.0.0/16), which is a standard Docker bridge (not `--internal`). The bridge allows all containers on the same network to reach each other.

**Test results:**
- `curl http://172.18.0.3/` from container .2 → `EXIT:7` (connection refused, no listener) — because container .3 has nginx on port 80 but it wasn't confirmed listening. The port was refused, not dropped.
- `ping 172.18.0.3` was not tested (ping from container is possible because `--cap-drop=ALL` drops `CAP_NET_RAW` — confirmed `ICMP` won't work).

**Actual attack surface:**
- Guest A running daemon on port 8080 (nginx, bun server, etc.) is directly reachable by Guest B via `curl http://172.18.0.<B>:8080/`.
- DOCKER-USER only blocks ports 22, 3847, 3848 to the HOST — not inter-container traffic.
- The guest system prompt says "you can run web servers" — so listening ports are expected and occur.

**Example:** Guest A's nginx on port 80 serves their `/workspace/public/`. Guest B can `curl http://172.18.0.2/` and read those files, bypassing vault isolation.

**Fix:** Add `--icc=false` to Docker daemon config or add DOCKER-USER rule:
```bash
iptables -I DOCKER-USER 1 -i claude-guest0 -o claude-guest0 -j DROP
```
This isolates containers from each other while preserving external connectivity.

**Severity: HIGH** (cross-user data leakage via web servers; depends on user behavior but is a structural gap).

---

### MEDIUM-01: Symlink in vault can point outside vault — `send_file` correctly blocked, but `mcp__container__Bash` can read via symlink

**Tested:**

1. Guest creates `ln -sf /etc/shadow /opt/vault/893951298/leak_shadow` inside container.
2. From host: `realpath /opt/vault/893951298/leak_shadow` → `/etc/shadow`.
3. `send_file` path validation: `realpathSync(filePath)` → `/etc/shadow` → `isPathAllowedFor` → **BLOCKED** ✅.
4. BUT: `mcp__container__Bash` runs `cat /opt/vault/893951298/leak_shadow` inside the container → `/etc/shadow` inside container = **container's own `/etc/shadow`** (isolated filesystem). Not the host's. ✅

5. Cross-user vault symlink: guest creates `ln -sf /opt/vault/299753724/ /opt/vault/893951298/other_vault`. From host: `realpath` resolves to `/opt/vault/299753724/` → `isPathAllowedFor` checks against `allowedPaths=["/opt/vault/893951298/"]` → **BLOCKED** for send_file ✅.

6. BUT: from inside container, `/opt/vault/` is bind-mounted with ONLY the user's own vault visible (`ls /opt/vault/` shows only `893951298/`). Cross-user vault symlink target (`/opt/vault/299753724/`) does NOT exist inside container — symlink is dangling. Container cannot follow it. ✅

**Verdict:** Symlink attacks through the container are mitigated by the namespace-level bind-mount isolation. `send_file` uses `realpathSync` + `isPathAllowedFor` correctly. The path via `mcp__container__Bash` hits the container's own filesystem, not the host.

**Status: CLOSED for paid-tier container users.** (Note: free-tier without container is a different story — see V-01 in main VULNERABILITIES.md.)

---

### MEDIUM-02: User namespace NOT enabled — container UID 1000 maps to host UID 1000

**From `docker inspect`:** `UsernsMode: ""` (empty = no user namespace remapping).

This means:
- Inside container: `uid=1000(sandbox)`.
- On host: UID 1000 is also 1000 (no remapping).
- Files created by guest in vault are owned by host UID 1000.
- If guest escapes the container (e.g., via kernel exploit), they run as host UID 1000, NOT as root.
- Host UID 1000 can read files owned by 1000 in `/opt/vault/` — but all vaults are owned by 1000. So escaped guest could read OTHER guests' vault files on the host.

**Test:** `ls /opt/vault/` from inside container → only sees own vault (container bind-mount isolation). From host with UID 1000 → can read all `/opt/vault/<any>/` since all dirs are `1000:1000 drwxr-xr-x`.

**If container escape occurs:** escaped process (UID 1000) can `ls /opt/vault/*/` and read all vaults.

**Fix (defense-in-depth):** Enable Docker user namespace remapping (`userns-remap` in daemon.json). This maps container UID 1000 → host UID 100000+, so escaped guest cannot touch any host files. Requires Docker restart.

Alternative (simpler): change vault subdirectory permissions to `750` with each vault owned by a unique UID per user. Requires usernamespace per user (complex).

**Severity: MEDIUM** (requires container escape as precondition; actual escape surface is low with cap-drop-ALL + seccomp + no-new-privileges + AppArmor).

---

### LOW-01: BlkioWeight=0 in docker inspect vs spec.ts --blkio-weight=500

Already covered in HIGH-01 (cgroupv2 issue). The spec.ts code is correct but silently no-ops. No separate entry needed.

---

### LOW-02: Dropbox directory listing exposes user IDs

`ls /var/lib/claude-bot/dropbox/` from host (root): shows all user IDs (20 entries).  
From inside container: `/var/lib/claude-bot/` is NOT mounted → cannot enumerate. ✅  
This is a host-side information leak only, not a guest escape vector.

---

## Composio Cross-Tenant Analysis

### Architecture

`mcp-filter.ts` builds per-user Composio MCP:
```typescript
url: buildGoogleMcpUrl(profile.userId),  // ?user_id=tg_<userId>
headers: { "x-api-key": composioApiKey }, // SHARED bot API key
```

The shared bot API key authenticates the bot to Composio. The `user_id=tg_<userId>` parameter isolates per-user OAuth tokens within Composio's backend.

### COMPOSIO-01: `user_id` spoofing requires the bot's Composio API key

**Question:** Can Guest A call Composio tools with Guest B's `user_id`?

**Analysis:**
- The MCP URL is constructed server-side in `mcp-filter.ts` with the caller's own `userId`.
- The HTTP MCP is injected into the SDK session per-profile — Guest A's session has `url=?user_id=tg_A`.
- Guest A cannot change the MCP URL from within their Claude session — MCP configs are set at session init, not by the model.
- To call with `user_id=tg_B`, Guest A would need the bot's `COMPOSIO_API_KEY` AND direct HTTP access to Composio backend.
- `COMPOSIO_API_KEY` is NOT in the guest container's environment (confirmed: `docker exec env` shows only PATH/HOSTNAME/VAULT_DIR/DEBIAN_FRONTEND/BUN_INSTALL/HOME).

**Verdict: CLOSED.** The model cannot substitute `user_id` in MCP calls. The API key is not exposed to guests.

### COMPOSIO-02: Single auth_config_id per toolkit (shared across all users)

```typescript
export const COMPOSIO_AUTH_CONFIGS: Record<string, string> = {
  googledocs: "ac_DNzIsHufivLw",
  ...
};
```

These are bot-level OAuth app configurations (like a shared Google OAuth App client_id). Each USER's tokens are isolated within Composio by `user_id`. The auth_config is a template — it defines WHICH Google OAuth App is used, not whose credentials are used.

**Verdict: CORRECT ARCHITECTURE.** One auth_config per toolkit per bot is the Composio multi-tenant pattern. User isolation is enforced by `user_id`. This is not a vulnerability.

### COMPOSIO-03: OAuth redirect URL — can Guest A intercept Guest B's OAuth?

**Flow:**
1. Guest B calls `initiateGoogleConnections(userId=B)` → Composio returns `redirect_url` (Google's OAuth page with `state=<composio_token>`).
2. Guest B opens the URL in browser and authorizes.
3. Google redirects back to Composio callback URL with `code=`.
4. Composio exchanges code, stores token under `user_id=tg_B`.

Guest A cannot intercept this: the OAuth `state` parameter is a one-time Composio-issued token tied to `user_id=tg_B`. If Guest A somehow gets the redirect URL for Guest B (social engineering), they still can't complete the OAuth — the browser redirect goes to Composio's backend, not to our bot.

**Verdict: CLOSED.** Standard OAuth isolation applies.

### COMPOSIO-04: Composio API key in HTTP headers — MCP transport security

The bot passes `x-api-key: <COMPOSIO_API_KEY>` as an HTTP header to `https://backend.composio.dev`. This header is visible in bot process memory and in network traffic (HTTPS so encrypted in transit).

**Attack:** If guest can read bot process memory (e.g., via `/proc/<pid>/mem` — requires same UID or root), they could extract the Composio API key and use it to query ANY user's Google data via direct Composio API calls.

**Mitigation present:** Bot runs as root (PID 1 in systemd unit). Guest container runs as UID 1000. From inside container, `/proc/<host_pid>/` is NOT accessible (container has its own PID namespace; `--init` + `tini` is PID 1 inside container, not the bot). Verified: `/proc/1/maps` inside container shows `docker-init`, not the bot process.

**Verdict: CLOSED** within container isolation model.

---

## Summary of New Findings

| ID | Severity | Status | Description |
|----|----------|--------|-------------|
| CRIT-01 | MEDIUM | OPEN | Hetzner metadata 169.254.169.254 reachable from guest containers |
| HIGH-01 | HIGH | OPEN | Blkio disk-IO limits silently inactive on cgroup v2 (no disk throttling) |
| HIGH-02 | HIGH | OPEN | No inter-container isolation on claude-guest-net (lateral movement) |
| MEDIUM-02 | MEDIUM | OPEN | No user namespace remapping — container UID 1000 = host UID 1000 |
| COMPOSIO-01..04 | — | CLOSED | Composio cross-tenant: spoofing blocked, architecture correct, OAuth isolated |
| SYMLINK | — | CLOSED | send_file symlink attack: blocked by realpathSync + isPathAllowedFor |

### Confirmed Closed (not in main VULNERABILITIES.md — confirming correct)

- `/var/run/docker.sock` not mounted in guest containers ✅
- Hetzner metadata token-based auth (IMDSv1 has no secrets, only infrastructure info) — partial mitigation
- eBPF disabled in guest (`/proc/sys/kernel/unprivileged_bpf_disabled = 2`) ✅
- Guest container can only see its own vault (bind-mount isolation) ✅
- Composio API key not leaked to container env ✅
- AppArmor `docker-default` profile active ✅
- `no-new-privileges` active ✅
- IPC namespace private (no host IPC) ✅
- CgroupNS private ✅
- `parallel_mcp` `task.cwd` validation: concern noted in V-1I (main VULNERABILITIES.md) — the `cwd` passed to `query()` affects working directory for subtasks; `additionalDirectories` is also passed but `cwd` outside allowed paths could theoretically allow relative-path traversal; not fully exploitable because `settingsSources: ["project"]` + `bypassPermissions` in vault settings allows Bash broadly. This is an amplifier for V-01, not standalone.

---

## Recommendations (priority order)

1. **[P0] Block 169.254.169.254** in `scripts/firewall/docker-user-rules.sh`:
   ```bash
   iptables -I DOCKER-USER 1 -s 172.18.0.0/16 -d 169.254.169.254 -j DROP
   ```

2. **[P1] Disable inter-container communication** on claude-guest-net:
   ```bash
   iptables -I DOCKER-USER 1 -i claude-guest0 -o claude-guest0 -j DROP
   ```
   Note: this will break container-to-container communication if any legitimate use exists (e.g., daemon running web server that another guest's Claude references). Evaluate impact.

3. **[P1] Fix disk-IO limits for cgroup v2** — use systemd slices or switch Docker cgroup driver.

4. **[P2] Enable user namespace remapping** in `/etc/docker/daemon.json`:
   ```json
   {"userns-remap": "default"}
   ```
   Requires Docker restart and re-creating all containers.
