/**
 * ContainerManager — lifecycle for per-user Docker sandboxes.
 *
 * Responsibilities:
 *   - Lazy-create + start a user's container on first need (`getOrStart`).
 *   - Run shell commands inside it (`exec`), unpausing if needed.
 *   - Track an idle watchdog: pause containers after IDLE_PAUSE_MS of
 *     inactivity, stop them after IDLE_STOP_MS. Saves RAM on shared hosts.
 *   - Survive Docker not being installed at all (warn once, stay alive).
 *
 * Concurrency model:
 *   We serialise per-user lifecycle ops behind a per-user promise chain so
 *   two concurrent user messages can't race on `docker run` / `docker start`.
 *   `exec` itself is parallel-safe (Docker handles that), so it doesn't go
 *   through the chain — only state-changing ops do.
 *
 * Logging:
 *   Every action logs with `[container:<userId>]` prefix so the systemd
 *   journal stays greppable.
 */

import { execFile } from "child_process";
import { chownSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join, resolve, dirname } from "path";
import { promisify } from "util";

import type { UserProfile } from "../config";
import { getNewGuestVaultDir } from "../config";
import {
  BOT_DATA_DIR,
  containerName,
  dropboxDir,
  pendingDir,
  userDataDir,
} from "./paths";
import { buildRunArgs } from "./spec";

const execFileAsync = promisify(execFile);

// ---------------------------------------------------------------------------
// Types & tunables
// ---------------------------------------------------------------------------

export type ContainerState = "absent" | "running" | "paused" | "stopped";

const IDLE_PAUSE_MS = 15 * 60 * 1000; // 15 min → docker pause
const IDLE_STOP_MS = 24 * 60 * 60 * 1000; // 24 h  → docker stop
const DEFAULT_EXEC_TIMEOUT_MS = 30_000;

// Match Dockerfile.user — guest containers run as uid:gid 1000:1000.
// Bind-mounted host dirs (vault, dropbox) must be writable by this uid or
// the sandbox process can't create files in its own workdir.
const SANDBOX_UID = 1000;
const SANDBOX_GID = 1000;

/**
 * chown a host dir to sandbox uid/gid. Silently no-ops on permission errors
 * (e.g. running locally as a non-root user) — production runs as root and
 * will succeed; dev environments don't have docker active anyway.
 */
function chownToSandbox(path: string): void {
  try {
    chownSync(path, SANDBOX_UID, SANDBOX_GID);
  } catch {
    // EPERM (not root) or ENOENT (dir already gone) — both are fine.
  }
}

// If /opt/vault/<id>/.daemons.yaml has at least one `enabled: true` daemon,
// we never pause/stop the container — the user has long-running automations
// and freezing them defeats the point.
function hasActiveDaemons(userId: number): boolean {
  try {
    const content = readFileSync(`/opt/vault/${userId}/.daemons.yaml`, "utf-8").toLowerCase();
    return /^\s*enabled:\s*(true|yes|on)\s*$/m.test(content);
  } catch {
    return false;
  }
}

interface ExecOptions {
  timeout?: number;
  cwd?: string;
}

interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

interface IdleTimers {
  pauseTimer: ReturnType<typeof setTimeout> | null;
  stopTimer: ReturnType<typeof setTimeout> | null;
}

// ---------------------------------------------------------------------------
// Egress rate-limit helpers (FAIR-03)
// ---------------------------------------------------------------------------

const EGRESS_SET_SCRIPT = resolve(
  dirname(dirname(import.meta.dir)),
  "scripts/firewall/set-baseline-egress.sh"
);
const EGRESS_REMOVE_SCRIPT = resolve(
  dirname(dirname(import.meta.dir)),
  "scripts/firewall/remove-baseline-egress.sh"
);

/**
 * Get the container's primary IP on the guest bridge.
 * Returns empty string on failure (Docker missing, container gone, macOS dev).
 */
async function getContainerIp(name: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync(
      "docker",
      [
        "inspect",
        "--format",
        "{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}",
        name,
      ],
      { timeout: 5_000 }
    );
    return stdout.trim();
  } catch {
    return "";
  }
}

/**
 * Apply a 20 Mbit/s HTB egress cap on the guest bridge for a new container.
 * No-op on macOS (script absent) or if IP resolution fails. Never throws.
 */
async function setBaselineEgress(name: string): Promise<void> {
  if (!existsSync(EGRESS_SET_SCRIPT)) return; // macOS dev — skip silently
  const ip = await getContainerIp(name);
  if (!ip) return;
  try {
    await execFileAsync("bash", [EGRESS_SET_SCRIPT, ip], { timeout: 10_000 });
  } catch (err) {
    console.warn(
      `[container:egress] set-baseline-egress warning for ${name} (${ip}): ${(err as Error).message}`
    );
  }
}

/**
 * Remove the HTB egress cap for a container that is being removed.
 * No-op on macOS (script absent) or if IP resolution fails. Never throws.
 */
async function removeBaselineEgress(name: string): Promise<void> {
  if (!existsSync(EGRESS_REMOVE_SCRIPT)) return; // macOS dev — skip silently
  const ip = await getContainerIp(name);
  if (!ip) return;
  try {
    await execFileAsync("bash", [EGRESS_REMOVE_SCRIPT, ip], { timeout: 10_000 });
  } catch (err) {
    console.warn(
      `[container:egress] remove-baseline-egress warning for ${name} (${ip}): ${(err as Error).message}`
    );
  }
}

// ---------------------------------------------------------------------------
// ContainerManager
// ---------------------------------------------------------------------------

// Circuit-breaker tunables.
const CB_THRESHOLD = 5; // consecutive timeouts before forced kill+start
const CB_WINDOW_MS = 5 * 60 * 1000; // 5-minute rolling window

interface TimeoutCounter {
  count: number;
  windowStart: number;
}

class ContainerManager {
  /** Per-user lifecycle serialiser: getOrStart/pause/stop/remove queue here. */
  private locks = new Map<number, Promise<void>>();

  /** Idle watchdog timers. */
  private idle = new Map<number, IdleTimers>();

  /** Circuit-breaker: consecutive exec-timeout counters per user. */
  private timeoutCounters = new Map<number, TimeoutCounter>();

  /**
   * Result of last `docker --version` probe. `null` = not yet probed.
   * If probe fails we set this to `false` and every public method becomes
   * a no-op that logs once and returns sensibly.
   */
  private dockerAvailable: boolean | null = null;

  /** Avoid spamming the warning about missing Docker on every call. */
  private warnedDockerMissing = false;

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  async init(profiles: UserProfile[]): Promise<void> {
    if (!(await this.ensureDocker())) return;

    // Bootstrap host directory layout so subsequent `docker run -v` mounts
    // don't fail with "no such file or directory" on a fresh box.
    try {
      mkdirSync(BOT_DATA_DIR, { recursive: true });
      mkdirSync(pendingDir(), { recursive: true });
    } catch (err) {
      this.log(0, `failed to create bot data dirs: ${(err as Error).message}`);
    }

    // Pre-create dropbox dirs for each container-enabled user (idempotent).
    // Also bootstrap/migrate their project-scope Claude settings so existing
    // containers — not just freshly created ones — have bypassPermissions.
    for (const p of profiles) {
      if (!p.containerEnabled) continue;
      try {
        mkdirSync(dropboxDir(p.userId), { recursive: true });
        mkdirSync(userDataDir(p.userId), { recursive: true });
        mkdirSync(p.workingDir, { recursive: true });
        // Каталоги для daemon-runner — создаём заранее с правильным owner'ом,
        // иначе sandbox-процесс не сможет писать логи и события (EACCES).
        const logsPath = `${p.workingDir.replace(/\/$/, "")}/logs`;
        const eventsPath = `${p.workingDir.replace(/\/$/, "")}/.daemons-events`;
        mkdirSync(logsPath, { recursive: true });
        mkdirSync(eventsPath, { recursive: true });
        // Guest containers run as uid 1000 (sandbox); without ownership on the
        // bind-mounted dirs, the sandbox process gets EACCES on any write.
        // Owner runs as root and doesn't care about the chown.
        if (!p.isOwner) {
          chownToSandbox(dropboxDir(p.userId));
          chownToSandbox(userDataDir(p.userId));
          chownToSandbox(p.workingDir);
          chownToSandbox(logsPath);
          chownToSandbox(eventsPath);
        }
      } catch (err) {
        this.log(p.userId, `dropbox mkdir failed: ${(err as Error).message}`);
      }
      try {
        this.ensureProjectSettings(p);
      } catch (err) {
        this.log(
          p.userId,
          `project settings bootstrap failed: ${(err as Error).message}`
        );
      }
    }

    this.log(0, `init done (${profiles.filter(p => p.containerEnabled).length} container-enabled users)`);

    // Always-on: для юзеров с активными демонами поднять контейнер сразу,
    // не дожидаясь первого сообщения. Иначе после удаления/рестарта сервера
    // их боты лежат, пока юзер не зайдёт в чат.
    const alwaysOn = profiles.filter(
      (p) => p.containerEnabled && hasActiveDaemons(p.userId),
    );
    for (const p of alwaysOn) {
      try {
        await this.getOrStart(p);
        this.log(p.userId, "always-on: container revived");
      } catch (err) {
        this.log(
          p.userId,
          `always-on revive failed: ${(err as Error).message}`,
        );
      }
    }
  }

  /**
   * Make sure the user's container is running. No-op if already running.
   * Creates the container if absent, starts it if stopped, unpauses if paused.
   */
  async getOrStart(profile: UserProfile): Promise<void> {
    if (!(await this.ensureDocker())) return;
    await this.withLock(profile.userId, () => this.getOrStartUnlocked(profile));
  }

  /**
   * Run a bash command inside the user's container.
   * Auto-starts/unpauses the container if needed.
   */
  async exec(
    userId: number,
    cmd: string,
    options: ExecOptions = {}
  ): Promise<ExecResult> {
    if (!(await this.ensureDocker())) {
      return {
        stdout: "",
        stderr: "Error: Docker is not available on this host",
        exitCode: 127,
      };
    }

    // Make sure the container is alive before we try `docker exec`.
    // We need a profile to (re)create it if absent; if we don't have one
    // (e.g. exec called for a userId we've never seen), we can only start
    // an existing container, not bootstrap a fresh one.
    await this.withLock(userId, async () => {
      const state = await this.getStateUnlocked(userId);
      if (state === "running") return;
      if (state === "paused") {
        await this.dockerArgs(["unpause", containerName(userId)]);
        this.log(userId, "unpaused");
        return;
      }
      if (state === "stopped") {
        await this.dockerArgs(["start", containerName(userId)]);
        this.log(userId, "started (was stopped)");
        return;
      }
      // state === "absent" — caller should have called getOrStart() with a
      // profile to create the container. We can't synthesise a profile here.
      this.log(
        userId,
        "exec called on absent container — no profile to bootstrap, command will fail"
      );
    });

    const timeout = options.timeout ?? DEFAULT_EXEC_TIMEOUT_MS;
    const cwd = options.cwd ?? getNewGuestVaultDir(userId);

    const dockerArgs = [
      "exec",
      "-i",
      "--workdir",
      cwd,
      containerName(userId),
      "bash",
      "-lc",
      cmd,
    ];

    try {
      const { stdout, stderr } = await execFileAsync("docker", dockerArgs, {
        timeout,
        maxBuffer: 8 * 1024 * 1024,
      });
      // Successful exec — reset the circuit-breaker for this user.
      this.timeoutCounters.delete(userId);
      return { stdout, stderr, exitCode: 0 };
    } catch (err) {
      // execFile rejects on non-zero exit OR timeout. Both look like
      // ChildProcess errors with stdout/stderr/code/signal fields.
      const e = err as {
        stdout?: string | Buffer;
        stderr?: string | Buffer;
        code?: number | string;
        killed?: boolean;
        signal?: string;
        message?: string;
      };
      const stdout = (e.stdout?.toString?.() ?? "") || "";
      const stderr =
        (e.stderr?.toString?.() ?? "") ||
        e.message ||
        "docker exec failed";
      // If killed by timeout, surface that distinctly so the caller can
      // present a useful error instead of a confusing empty stderr.
      const exitCode =
        typeof e.code === "number"
          ? e.code
          : e.killed
            ? 124 // standard "timeout" exit code
            : 1;

      // Circuit-breaker: track consecutive timeouts and force-restart on threshold.
      // A timeout is identified by e.killed === true (Node kills the child on
      // timeout and sets killed=true before rejecting) or exit code 124.
      if (e.killed === true || exitCode === 124) {
        const now = Date.now();
        const cb = this.timeoutCounters.get(userId) ?? { count: 0, windowStart: now };
        // Reset window if it expired.
        if (now - cb.windowStart > CB_WINDOW_MS) {
          cb.count = 0;
          cb.windowStart = now;
        }
        cb.count += 1;
        this.timeoutCounters.set(userId, cb);

        this.log(userId, `exec timeout (${cb.count}/${CB_THRESHOLD} in window)`);

        if (cb.count >= CB_THRESHOLD) {
          const name = containerName(userId);
          this.log(userId, `circuit-breaker tripped — force kill+start ${name}`);
          try {
            await execFileAsync("docker", ["kill", name]).catch(() => {});
            await execFileAsync("docker", ["start", name]).catch(() => {});
            this.log(userId, "container revived after circuit-breaker");
          } catch {
            // Best-effort; ignore errors — the next exec attempt will retry.
          }
          // Reset counter after recovery attempt.
          this.timeoutCounters.delete(userId);
        }
      }

      return { stdout, stderr, exitCode };
    }
  }

  async getState(userId: number): Promise<ContainerState> {
    if (!(await this.ensureDocker())) return "absent";
    return this.getStateUnlocked(userId);
  }

  async pause(userId: number): Promise<void> {
    if (!(await this.ensureDocker())) return;
    if (hasActiveDaemons(userId)) {
      this.log(userId, "pause skipped — active daemons present");
      return;
    }
    await this.withLock(userId, async () => {
      const state = await this.getStateUnlocked(userId);
      if (state !== "running") return;
      await this.dockerArgs(["pause", containerName(userId)]);
      this.log(userId, "paused (idle)");
    });
  }

  async stop(userId: number): Promise<void> {
    if (!(await this.ensureDocker())) return;
    if (hasActiveDaemons(userId)) {
      this.log(userId, "stop skipped — active daemons present");
      return;
    }
    await this.withLock(userId, async () => {
      const state = await this.getStateUnlocked(userId);
      if (state === "absent" || state === "stopped") return;
      // Unpause first or `docker stop` won't deliver SIGTERM cleanly.
      if (state === "paused") {
        await this.dockerArgs(["unpause", containerName(userId)]);
      }
      await this.dockerArgs(["stop", containerName(userId)]);
      this.log(userId, "stopped (idle)");
    });
  }

  async remove(userId: number): Promise<void> {
    if (!(await this.ensureDocker())) return;
    await this.withLock(userId, async () => {
      const state = await this.getStateUnlocked(userId);
      if (state === "absent") return;
      // Remove egress cap before the container disappears (IP still resolvable).
      await removeBaselineEgress(containerName(userId));
      // -f handles paused/running; we don't need a separate stop step.
      await this.dockerArgs(["rm", "-f", containerName(userId)]);
      this.log(userId, "removed");
    });
    this.clearIdleTimers(userId);
  }

  /**
   * Reset the idle watchdog. Call on every user message so the container
   * stays warm while they're actively chatting, and gets paused/stopped
   * once they go quiet.
   */
  resetIdleTimer(userId: number, profile: UserProfile): void {
    if (!profile.containerEnabled) return;

    this.clearIdleTimers(userId);

    // Active daemons → never schedule pause/stop. The user is paying for
    // 24/7 compute; freezing the container freezes their bots and crons.
    if (hasActiveDaemons(userId)) return;

    const pauseTimer = setTimeout(() => {
      this.pause(userId).catch((err) =>
        this.log(userId, `idle pause failed: ${(err as Error).message}`)
      );
    }, IDLE_PAUSE_MS);

    const stopTimer = setTimeout(() => {
      this.stop(userId).catch((err) =>
        this.log(userId, `idle stop failed: ${(err as Error).message}`)
      );
    }, IDLE_STOP_MS);

    // Don't keep the Node event loop alive solely for these timers — we
    // want the bot process to be able to exit on systemd restart.
    pauseTimer.unref?.();
    stopTimer.unref?.();

    this.idle.set(userId, { pauseTimer, stopTimer });
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  /** Caller already holds the per-user lock. */
  private async getOrStartUnlocked(profile: UserProfile): Promise<void> {
    const userId = profile.userId;
    const state = await this.getStateUnlocked(userId);

    if (state === "running") return;

    if (state === "paused") {
      await this.dockerArgs(["unpause", containerName(userId)]);
      this.log(userId, "unpaused");
      return;
    }

    if (state === "stopped") {
      try {
        await this.dockerArgs(["start", containerName(userId)]);
        this.log(userId, "started (was stopped)");
        return;
      } catch (err) {
        // If the stopped container has broken lxcfs mounts it won't start.
        // Remove and fall through to recreate without lxcfs.
        const msg = (err as Error).message || "";
        if (msg.includes("not a directory") || msg.includes("lxcfs")) {
          this.log(userId, "stopped container has broken lxcfs mounts — removing to recreate");
          try { await this.dockerArgs(["rm", "-f", containerName(userId)]); } catch {}
          // fall through to create-from-scratch path below
        } else {
          throw err;
        }
      }
    }

    // state === "absent" — create from scratch.
    // 1. Make sure host dirs the run-spec mounts actually exist.
    try {
      mkdirSync(dropboxDir(userId), { recursive: true });
      mkdirSync(userDataDir(userId), { recursive: true });
      // Vault dir is bind-mounted at the same path inside the container.
      // If it doesn't exist on the host, `docker run -v` creates an empty
      // host dir owned by root with weird perms — better to do it ourselves.
      mkdirSync(profile.workingDir, { recursive: true });
      const logsPath = `${profile.workingDir.replace(/\/$/, "")}/logs`;
      const eventsPath = `${profile.workingDir.replace(/\/$/, "")}/.daemons-events`;
      mkdirSync(logsPath, { recursive: true });
      mkdirSync(eventsPath, { recursive: true });
      // Guests run as uid 1000 (see Dockerfile.user) — bind-mount dirs must
      // belong to that uid or sandbox can't write to its own workdir.
      if (!profile.isOwner) {
        chownToSandbox(dropboxDir(userId));
        chownToSandbox(userDataDir(userId));
        chownToSandbox(profile.workingDir);
        chownToSandbox(logsPath);
        chownToSandbox(eventsPath);
      }
    } catch (err) {
      this.log(
        userId,
        `host dir mkdir failed: ${(err as Error).message}`
      );
    }

    // Bootstrap project-scope Claude settings inside the vault. Guests have
    // settingSources: ["project"], so they DON'T read /root/.claude/settings.json.
    // Without this file the SDK's permission gate prompts for every Bash and
    // every mcp__container__Bash call — there's no UI to answer the prompt,
    // so the model just hallucinates "permission required" indefinitely.
    // Idempotent: only write if absent, never overwrite a customised file.
    try {
      this.ensureProjectSettings(profile);
    } catch (err) {
      this.log(
        userId,
        `project settings bootstrap failed: ${(err as Error).message}`
      );
    }

    // 2. docker run with the full spec.
    const args = buildRunArgs(profile);
    this.log(userId, `creating container`);
    try {
      await this.dockerArgs(args);
    } catch (err) {
      // lxcfs bind-mounts over /proc fail on some kernel/runc combinations
      // when --read-only is used (error: "not a directory"). Retry without them.
      const msg = (err as Error).message || "";
      if (msg.includes("not a directory") || msg.includes("lxcfs")) {
        this.log(userId, "lxcfs mount failed — retrying without lxcfs");
        try { await this.dockerArgs(["rm", "-f", containerName(userId)]); } catch {}
        await this.dockerArgs(buildRunArgs(profile, { skipLxcfs: true }));
      } else {
        throw err;
      }
    }
    this.log(userId, "created & running");
    // Apply baseline egress rate-limit on the host bridge (FAIR-03).
    // Fire-and-forget: failure logs a warning but never blocks the container start.
    setBaselineEgress(containerName(userId)).catch(() => {});
  }

  /** Caller already holds the per-user lock. */
  private async getStateUnlocked(userId: number): Promise<ContainerState> {
    // `docker inspect -f {{.State.Status}}` returns one of:
    //   created | running | paused | restarting | removing | exited | dead
    // We collapse those into our 4-state model.
    const name = containerName(userId);
    try {
      const { stdout } = await execFileAsync(
        "docker",
        ["inspect", "-f", "{{.State.Status}}", name],
        { timeout: 5_000 }
      );
      const status = stdout.trim();
      if (status === "running") return "running";
      if (status === "paused") return "paused";
      // `created` means run was issued but container never started — treat
      // as stopped so we'll `docker start` it next.
      return "stopped";
    } catch (err) {
      // Most likely "No such object" — container doesn't exist.
      const msg = (err as Error).message || "";
      if (/no such (object|container)/i.test(msg)) return "absent";
      // Some other docker error — log and treat as absent so caller will
      // try to recreate. Better than getting stuck.
      this.log(userId, `inspect failed (${msg}), treating as absent`);
      return "absent";
    }
  }

  private async withLock<T>(
    userId: number,
    fn: () => Promise<T>
  ): Promise<T> {
    const prev = this.locks.get(userId) ?? Promise.resolve();
    let resolveLock: () => void = () => {};
    const next = new Promise<void>((r) => {
      resolveLock = r;
    });
    const chained = prev.then(() => next);
    this.locks.set(userId, chained);
    try {
      await prev;
      return await fn();
    } finally {
      resolveLock();
      // Best-effort cleanup so the map doesn't grow unbounded.
      if (this.locks.get(userId) === chained) {
        this.locks.delete(userId);
      }
    }
  }

  private clearIdleTimers(userId: number): void {
    const timers = this.idle.get(userId);
    if (!timers) return;
    if (timers.pauseTimer) clearTimeout(timers.pauseTimer);
    if (timers.stopTimer) clearTimeout(timers.stopTimer);
    this.idle.delete(userId);
  }

  /**
   * Make sure {workingDir}/.claude/settings.json grants enough permissions
   * for the headless bot — `bypassPermissions` mode plus an explicit allow
   * for our in-process container Bash tool. Creates the file if missing,
   * upgrades `acceptEdits` → `bypassPermissions` if needed, and adds
   * `mcp__container` to the allow list when absent.
   */
  private ensureProjectSettings(profile: UserProfile): void {
    const settingsDir = join(profile.workingDir, ".claude");
    const settingsPath = join(settingsDir, "settings.json");

    mkdirSync(settingsDir, { recursive: true });

    const desiredAllow = [
      "Bash(*)",
      "Write",
      "Edit",
      "MultiEdit",
      "Read",
      "Glob",
      "Grep",
      "WebSearch",
      "WebFetch",
      "NotebookEdit",
      "TodoWrite",
      "Task",
      "mcp__ask-user",
      "mcp__send-file",
      "mcp__pollinations-image",
      "mcp__knowledge",
      "mcp__connect-google",
      "mcp__container",
      "mcp__container__Bash",
    ];

    if (!existsSync(settingsPath)) {
      const fresh = {
        permissions: {
          defaultMode: "bypassPermissions",
          allow: desiredAllow,
        },
      };
      writeFileSync(settingsPath, JSON.stringify(fresh, null, 2));
      this.log(profile.userId, `bootstrapped ${settingsPath}`);
      return;
    }

    // File exists — only patch what's strictly necessary so we don't trample
    // any local customisation. Bring the mode up to bypass and union the
    // allow list with what we need.
    let raw: string;
    try {
      raw = readFileSync(settingsPath, "utf8");
    } catch {
      return;
    }
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(raw);
    } catch {
      this.log(profile.userId, `existing settings.json invalid JSON, leaving alone`);
      return;
    }

    const perms = (parsed.permissions ??= {}) as {
      defaultMode?: string;
      allow?: unknown;
    };
    let changed = false;

    if (perms.defaultMode !== "bypassPermissions") {
      perms.defaultMode = "bypassPermissions";
      changed = true;
    }
    const existingAllow = Array.isArray(perms.allow) ? (perms.allow as string[]) : [];
    const merged = Array.from(new Set([...existingAllow, ...desiredAllow]));
    if (merged.length !== existingAllow.length) {
      perms.allow = merged;
      changed = true;
    } else {
      perms.allow = existingAllow;
    }

    if (changed) {
      writeFileSync(settingsPath, JSON.stringify(parsed, null, 2));
      this.log(profile.userId, `migrated ${settingsPath} to bypassPermissions`);
    }
  }

  private async dockerArgs(args: string[]): Promise<string> {
    const { stdout } = await execFileAsync("docker", args, {
      timeout: 30_000,
      maxBuffer: 4 * 1024 * 1024,
    });
    return stdout;
  }

  private async ensureDocker(): Promise<boolean> {
    if (this.dockerAvailable !== null) return this.dockerAvailable;
    try {
      await execFileAsync("docker", ["--version"], { timeout: 3_000 });
      this.dockerAvailable = true;
    } catch {
      this.dockerAvailable = false;
      if (!this.warnedDockerMissing) {
        this.warnedDockerMissing = true;
        console.warn(
          "[container:0] docker CLI not found or not responding — container features disabled. Bot will continue without sandboxing."
        );
      }
    }
    return this.dockerAvailable;
  }

  private log(userId: number, msg: string): void {
    console.log(`[container:${userId}] ${msg}`);
  }
}

export const containerManager = new ContainerManager();
