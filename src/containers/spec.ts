/**
 * Build the `docker run` argv for a user's sandbox container.
 *
 * Owner gets an unconstrained container with docker.sock + /var/log mount
 * (so they can manage the bot itself from inside the box).
 * Guests get a hardened container with cgroup limits and no docker.sock.
 *
 * The container runs daemon-runner as PID 1 (see Dockerfile.user). The bot
 * drives execution via `docker exec`. No PORT/EXPOSE here, no entrypoint override.
 *
 * Network isolation for guests:
 *   Set CLAUDE_GUEST_NETWORK env var to a Docker network name to attach
 *   guest containers to a restricted network. The network must be created
 *   manually on the host before starting the bot. Recommended setup:
 *
 *     # Internet-accessible but guests cannot reach host-internal ports:
 *     docker network create claude-guest-net
 *     # Then add iptables rules to block 172.x.x.x -> host ports 22,3847,3848
 *
 *   Or for fully internal (no internet):
 *     docker network create --internal claude-guest-net
 *
 *   If CLAUDE_GUEST_NETWORK is empty/unset, no --network flag is added and
 *   Docker's default bridge is used — functional but less isolated.
 */

import fs from "node:fs";
import { execSync } from "node:child_process";
import type { UserProfile } from "../config";
import {
  SANDBOX_IMAGE,
  containerName,
  dropboxDir,
} from "./paths";

/**
 * Detect the block device backing /opt/vault (used for disk-IO cgroup limits).
 * Returns undefined when detection fails (e.g. macOS dev, path missing, df error).
 * Result is cached after first successful lookup.
 */
let _vaultDevice: string | undefined | null = null; // null = not yet resolved

function getVaultDevice(): string | undefined {
  if (_vaultDevice !== null) return _vaultDevice;
  try {
    const out = execSync("df -P /opt/vault 2>/dev/null | tail -1 | awk '{print $1}'", {
      encoding: "utf8",
      timeout: 5000,
    }).trim();
    if (out && out.startsWith("/dev/")) {
      _vaultDevice = out;
    } else {
      _vaultDevice = undefined;
    }
  } catch {
    _vaultDevice = undefined;
  }
  return _vaultDevice;
}

// Per-user memory overrides (userId → megabytes). Increase here when a user
// needs more RAM than the default 512 MB (e.g. heavy daemons, ML workloads).
const GUEST_MEMORY_OVERRIDES: Record<number, number> = {};
const DEFAULT_GUEST_MEMORY_MB = 512;

// Per-user pids-limit overrides. Raise for users running persistent daemons
// (bot-scheduler etc.) that spawn many threads. Default 512 is fork-bomb-safe.
const GUEST_PIDS_OVERRIDES: Record<number, number> = {};
const DEFAULT_GUEST_PIDS = 512;

export function buildRunArgs(profile: UserProfile, opts?: { skipLxcfs?: boolean }): string[] {
  const userId = profile.userId;
  const isOwner = profile.isOwner;

  // Mount the host vault at the SAME absolute path inside the container.
  // This way file tools on host (Read/Write/Edit) and Bash inside the container
  // resolve identical absolute paths (e.g. /opt/vault/403360614/foo.txt).
  // No more two-filesystems-out-of-sync surprises.
  const vaultPath = profile.workingDir;

  const args: string[] = [
    "run",
    "--detach",
    // Survive host reboots, dockerd restarts, and claude-tg-bot restarts.
    // The container only stops on explicit `docker stop` (admin or user
    // action). Without this, every host reboot kills user automations.
    "--restart=unless-stopped",
    // tini as PID 1 — reaps zombie children (e.g. QtWebEngineProc spawned
    // by Calibre). Without --init, sleep infinity ignores SIGCHLD and zombies
    // pile up forever.
    "--init",
    "--name",
    containerName(userId),
    "--hostname",
    `user-${userId}`,
    "--label",
    `claude-bot-user=${userId}`,
    "--workdir",
    vaultPath,
    // daemon-runner (PID 1 inside the image) reads VAULT_DIR to locate
    // .daemons.yaml, logs/, and .daemons-events/.
    "-e",
    `VAULT_DIR=${vaultPath}`,
    // Vault: bind-mount, NOT a named volume — keeps host and container in sync.
    "-v",
    `${vaultPath}:${vaultPath}`,
    // Host-side dropbox: how the bot hands files to / takes files from the container
    "-v",
    `${dropboxDir(userId)}:/tmp/dropbox`,
  ];

  if (isOwner) {
    // Owner needs to manage Docker itself (build images, restart sibling
    // containers, run docker compose). Mounting the host socket gives the
    // container effective root on the host — that's intentional for the
    // owner profile, NEVER do this for guests.
    args.push("-v", "/var/run/docker.sock:/var/run/docker.sock");
    args.push("-v", "/var/log:/var/log:ro");
    args.push("-v", "/opt:/opt");
    // Owner gets their own ~/.claude (OAuth token, settings, skills, memory).
    args.push("-v", "/root/.claude:/root/.claude:ro");
    // Image defaults to USER sandbox; owner needs root for /opt access and
    // docker.sock control. Override the image-level USER directive.
    args.push("--user", "root");
  } else {
    // -----------------------------------------------------------------------
    // Guest sandbox hardening
    // -----------------------------------------------------------------------

    // Memory limit. Per-user overrides in GUEST_MEMORY_OVERRIDES; default 512 MB.
    // --memory-swap == --memory means zero host swap (prevents silent swap grind).
    const memMb = GUEST_MEMORY_OVERRIDES[userId] ?? DEFAULT_GUEST_MEMORY_MB;
    args.push("--memory", `${memMb}m`);
    args.push("--memory-swap", `${memMb}m`);

    // CPU: capped at 1 full core (bursting within the ceiling is fine).
    args.push("--cpus", "1.0");

    // Drop ALL Linux capabilities — guests don't need any (no raw sockets,
    // no mknod, no sys_admin). Prevents privilege escalation via capabilities.
    args.push("--cap-drop=ALL");

    // Prevent any process inside the container from gaining new privileges via
    // setuid binaries or filesystem capabilities (e.g. sudo, ping).
    args.push("--security-opt=no-new-privileges");

    // Docker applies its default seccomp profile automatically when no
    // --security-opt=seccomp=... is passed. We rely on that default rather than
    // overriding (passing "default" as a value is invalid Docker syntax).

    // Limit total number of processes/threads. 512 is still fork-bomb-safe
    // (exhausting this stalls the container, not the host) while giving daemons
    // (bot-scheduler, etc.) enough room. Per-user overrides in GUEST_PIDS_OVERRIDES.
    const pidsLimit = GUEST_PIDS_OVERRIDES[userId] ?? DEFAULT_GUEST_PIDS;
    args.push(`--pids-limit=${pidsLimit}`);

    // Restrict file-descriptor count — limits some DoS vectors (e.g. inotify
    // exhaustion, socket floods). Soft 1024 / hard 2048.
    args.push("--ulimit=nofile=1024:2048");

    // Disk-IO cgroup limits — prevent dd/yt-dlp/tar from saturating the NVMe
    // and stalling overlay-FS for other guests and the host bot.
    // blkio-weight sets relative IO priority (512 = half of max 1000).
    // bps/iops caps are per-device hard limits; device path auto-detected from df.
    // Skipped gracefully when /opt/vault is unavailable (macOS dev, CI).
    //
    // NOTE: on Linux with cgroup v2 (all modern kernels / systemd 240+) the
    // --blkio-weight / --device-write-bps / --device-read-bps / --device-write-iops /
    // --device-read-iops Docker flags are silent no-ops because they rely on the
    // cgroup v1 blkio controller which is absent on unified-hierarchy hosts.
    // The real IO limits are enforced by the systemd slice below via the cgroup v2
    // io controller.  The blkio flags below are kept as a best-effort fallback for
    // cgroup v1 environments (e.g. older kernels, cgroupfs driver).
    //
    // To activate the systemd slice on a new host:
    //   sudo cp scripts/systemd/claude-guests.slice /etc/systemd/system/
    //   sudo systemctl daemon-reload
    //   sudo systemctl restart claude-tg-bot
    // Verify with: systemd-cgls | grep claude-guests
    // !! Before deploying: check the disk path in claude-guests.slice matches
    //    the actual block device: df -P /opt/vault | tail -1 | awk '{print $1}'
    {
      const vaultDev = getVaultDevice();
      if (vaultDev) {
        args.push("--blkio-weight=500");
        args.push("--device-write-bps", `${vaultDev}:50m`);
        args.push("--device-read-bps", `${vaultDev}:100m`);
        args.push("--device-write-iops", `${vaultDev}:2000`);
        args.push("--device-read-iops", `${vaultDev}:4000`);
      }
    }

    // Attach all guest containers to the claude-guests.slice systemd slice.
    // This activates the cgroup v2 io controller (IOWriteBandwidthMax /
    // IOReadBandwidthMax) defined in scripts/systemd/claude-guests.slice,
    // enforcing 50 MB/s write / 100 MB/s read limits per-slice.
    // Safe to include even when the slice is not yet installed — Docker silently
    // creates a transient cgroup under the system.slice in that case (no error).
    args.push("--cgroup-parent=claude-guests.slice");

    // NOTE: --ulimit=nproc is intentionally NOT set here. nproc is a per-UID
    // limit on the HOST, so setting it 128 on each container means all containers
    // sharing uid 1000 compete for the same 128-slot budget. Once the total
    // threads for uid 1000 reach 128, every new fork in every container fails
    // with EAGAIN. The cgroup --pids-limit above provides the correct per-container
    // fork-bomb protection without this cross-container interference.

    // Run as the non-root sandbox user defined in Dockerfile.user. Without this
    // override Docker would respect the image-level `USER sandbox`, but pinning
    // it explicitly here makes the security posture obvious from the run-spec
    // and survives image changes. Critical: closes /proc/1/root host FS read
    // (root in container could read host root files via that path).
    args.push("--user", "1000:1000");

    // Read-only root filesystem. Everything a guest writes must go to an
    // explicit tmpfs or the bind-mounted vault. Prevents tampering with
    // the image layer (e.g. replacing system binaries).
    args.push("--read-only");

    // Writable tmpfs for directories that tools legitimately need.
    // exec flag on /tmp is required because Claude CLI unpacks native binaries
    // there at startup; /run and /home need no exec.
    args.push("--tmpfs=/tmp:size=128m,exec");
    args.push("--tmpfs=/run:size=8m");
    args.push("--tmpfs=/home:size=64m");

    // Required: attach to a dedicated guest Docker network. All guest containers
    // share it and can be firewalled uniformly (e.g. block access to host-only
    // ports 22/3847/3848 via iptables). See the file-level comment for network
    // creation instructions.
    const guestNetwork = process.env.CLAUDE_GUEST_NETWORK;
    if (!guestNetwork) {
      throw new Error(
        "CLAUDE_GUEST_NETWORK env var is required. Set it to the docker network name (e.g. claude-guest-net)."
      );
    }
    args.push(`--network=${guestNetwork}`);

    // LXCFS: cgroup-aware /proc inside the container. Without these mounts
    // `free`, `top`, `/proc/meminfo` show the host's memory (e.g. 7.6 GB),
    // not the cgroup limit (512 MB) — guests then leak host info to users.
    // Hard requirement: lxcfs must be installed and running on the host
    // (`apt install lxcfs && systemctl enable --now lxcfs`).
    // Mounted :ro — these are virtual files synthesised by lxcfs; write access
    // is meaningless and the :rw flag is misleading / unnecessarily permissive.
    if (!opts?.skipLxcfs) {
      const lxcfsBase = "/var/lib/lxcfs/proc";
      let lxcfsWorking = false;
      try {
        // existsSync is not enough — file may exist but fuse daemon may be down.
        // readFileSync throws if the fuse mount is broken.
        fs.readFileSync(`${lxcfsBase}/meminfo`, { encoding: "utf8" });
        lxcfsWorking = true;
      } catch {
        lxcfsWorking = false;
      }
      if (lxcfsWorking) {
        const lxcfsFiles = [
          "cpuinfo",
          "diskstats",
          "meminfo",
          "stat",
          "swaps",
          "uptime",
          "loadavg",
        ];
        for (const f of lxcfsFiles) {
          args.push("-v", `${lxcfsBase}/${f}:/proc/${f}:ro`);
        }
      }
    }
  }

  // Image goes last; everything after it is treated as the container CMD.
  args.push(SANDBOX_IMAGE);

  return args;
}
