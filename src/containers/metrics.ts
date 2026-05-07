/**
 * Container metrics — RAM, CPU, disk for per-user Docker sandboxes.
 *
 * All commands run via execFileSync (no shell injection) with a 3-second
 * timeout. Any individual command failure is swallowed: the field is set to
 * null and an error is logged, but the function always returns a result.
 *
 * On macOS (local dev) without Docker the functions gracefully return
 * containerExists: false with null for all metric fields.
 */

import { execFile } from "child_process";
import { promisify } from "util";
import { existsSync } from "fs";
import { cpus, freemem, totalmem, platform, loadavg } from "os";

const execFileAsync = promisify(execFile);

import { ALLOWED_USERS } from "../config";
import { containerName } from "./paths";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface ContainerMetrics {
  userId: number | string;
  containerExists: boolean;
  containerRunning: boolean;
  ram: { usedMb: number; limitMb: number; percent: number } | null;
  cpu: { percent: number } | null;
  disk: { usedMb: number } | null;
  timestamp: number; // unix epoch ms
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const EXEC_TIMEOUT_MS = 3_000;

/**
 * Run a command asynchronously, returning stdout as a trimmed string.
 * Returns null on any error (timeout, non-zero exit, ENOENT).
 */
async function run(cmd: string, args: string[]): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync(cmd, args, {
      timeout: EXEC_TIMEOUT_MS,
    });
    return stdout.trim();
  } catch (err) {
    const nodeErr = err as NodeJS.ErrnoException & { stderr?: Buffer | string };
    if (nodeErr.code === "ENOENT") return null;
    const stderr =
      nodeErr.stderr instanceof Buffer
        ? nodeErr.stderr.toString()
        : (nodeErr.stderr ?? "");
    if (typeof stderr === "string" && stderr.includes("Cannot connect to the Docker daemon")) {
      return null;
    }
    console.error(`[metrics] ${cmd} ${args.join(" ")} failed:`, err);
    return null;
  }
}

/**
 * Convert a Docker mem string like "123.4MiB", "1.5GiB", "512KiB" to MB.
 */
function parseDockerMemMb(raw: string): number {
  const trimmed = raw.trim();
  const match = trimmed.match(/^([\d.]+)\s*(KiB|MiB|GiB|B|kB|MB|GB)/i);
  if (!match || match[1] === undefined || match[2] === undefined) return 0;
  const value = parseFloat(match[1]);
  const unit = match[2].toLowerCase();
  switch (unit) {
    case "b":
      return value / (1024 * 1024);
    case "kb":
    case "kib":
      return value / 1024;
    case "mb":
    case "mib":
      return value;
    case "gb":
    case "gib":
      return value * 1024;
    default:
      return 0;
  }
}

/**
 * Parse "123.4MiB / 512MiB|45.2%|23.5%" from docker stats output.
 * Returns null if the format is unrecognised.
 */
function parseStatsLine(
  line: string
): { usedMb: number; limitMb: number; memPercent: number; cpuPercent: number } | null {
  // Format: "<used> / <limit>|<cpuPerc>|<memPerc>"
  const parts = line.split("|");
  if (parts.length < 3) return null;

  const part0 = parts[0];
  const part1 = parts[1];
  const part2 = parts[2];
  if (part0 === undefined || part1 === undefined || part2 === undefined) return null;

  const memParts = part0.split("/");
  if (memParts.length < 2) return null;

  const memPart0 = memParts[0];
  const memPart1 = memParts[1];
  if (memPart0 === undefined || memPart1 === undefined) return null;

  const usedMb = parseDockerMemMb(memPart0);
  const limitMb = parseDockerMemMb(memPart1);
  const cpuPercent = parseFloat(part1.replace("%", ""));
  const memPercent = parseFloat(part2.replace("%", ""));

  if (isNaN(cpuPercent) || isNaN(memPercent)) return null;

  return { usedMb, limitMb, memPercent, cpuPercent };
}

// ---------------------------------------------------------------------------
// Core function
// ---------------------------------------------------------------------------

export async function getContainerMetrics(
  userId: number | string
): Promise<ContainerMetrics> {
  const base: ContainerMetrics = {
    userId,
    containerExists: false,
    containerRunning: false,
    ram: null,
    cpu: null,
    disk: null,
    timestamp: Date.now(),
  };

  const name = containerName(
    typeof userId === "string" ? parseInt(userId, 10) : userId
  );

  // --- Existence check (docker ps -a) ---
  const existsOut = await run("docker", [
    "ps",
    "-a",
    "--filter",
    `name=^/${name}$`,
    "--format",
    "{{.Names}}",
  ]);
  // null means docker not available
  if (existsOut === null) return base;

  base.containerExists = existsOut.length > 0;
  // NOTE: do NOT early-return here when the container is missing. Old guests
  // (added before per-user containers existed) still have a vault on disk and
  // we want to show its size in the admin dashboard. Skip only the docker-stats
  // section below for non-existing containers.
  if (!base.containerExists) {
    // Fall through to the disk-usage block below.
  }

  // --- Running check (docker ps, no -a) ---
  if (base.containerExists) {
    const runningOut = await run("docker", [
      "ps",
      "--filter",
      `name=^/${name}$`,
      "--format",
      "{{.Names}}",
    ]);
    base.containerRunning = runningOut !== null && runningOut.length > 0;
  }

  // --- RAM + CPU via docker stats (only meaningful when running) ---
  if (base.containerRunning) {
    const statsOut = await run("docker", [
      "stats",
      "--no-stream",
      "--format",
      "{{.MemUsage}}|{{.CPUPerc}}|{{.MemPerc}}",
      name,
    ]);
    if (statsOut !== null && statsOut.length > 0) {
      const parsed = parseStatsLine(statsOut);
      if (parsed !== null) {
        base.ram = {
          usedMb: Math.round(parsed.usedMb * 10) / 10,
          limitMb: Math.round(parsed.limitMb * 10) / 10,
          percent: Math.round(parsed.memPercent * 10) / 10,
        };
        base.cpu = {
          percent: Math.round(parsed.cpuPercent * 10) / 10,
        };
      }
    }
  }

  // --- Disk usage of the vault directory ---
  const vaultPath = `/opt/vault/${userId}/`;

  if (existsSync(vaultPath)) {
    const isMac = platform() === "darwin";
    // macOS du: -sk gives KiB total; Linux du: -sm gives MiB total
    const duArgs = isMac
      ? ["-sk", vaultPath]
      : ["-sm", "--apparent-size", vaultPath];

    const duOut = await run("du", duArgs);
    if (duOut !== null) {
      const firstToken = duOut.split(/\s/)[0] ?? "";
      const raw = parseInt(firstToken, 10);
      if (!isNaN(raw)) {
        const usedMb = isMac ? raw / 1024 : raw;
        base.disk = { usedMb: Math.round(usedMb * 10) / 10 };
      }
    }
  }

  return base;
}

// ---------------------------------------------------------------------------
// Batch function
// ---------------------------------------------------------------------------

export async function getAllContainerMetrics(): Promise<ContainerMetrics[]> {
  // Iterate ALLOWED_USERS (env + UserRegistry merge) so old guests who were
  // authorised before users.json existed still appear in the admin dashboard.
  // Without this, the table only shows users registered via the invite flow.
  return Promise.all(ALLOWED_USERS.map((uid) => getContainerMetrics(uid)));
}

// ---------------------------------------------------------------------------
// Host metrics + aggregate
// ---------------------------------------------------------------------------

export interface HostMetrics {
  cpu: { percent: number; cores: number };
  ram: { usedMb: number; totalMb: number; percent: number };
}

export interface GuestsAggregate {
  containers: { total: number; running: number };
  ramUsedMb: number;
  cpuPercent: number;
  diskUsedMb: number;
}

/**
 * Whole-host CPU% via 1-minute loadavg (smoothed by the kernel — same metric
 * `top`, `uptime`, `htop` show). A 250ms instantaneous sample was previously
 * used but caught streaming spikes and reported 90%+ on an otherwise idle box.
 */
export async function getHostMetrics(): Promise<HostMetrics> {
  const cores = cpus().length;
  const load1 = loadavg()[0] ?? 0;
  const cpuPercent = Math.max(0, Math.min(100, (load1 / cores) * 100));

  const totalBytes = totalmem();
  const freeBytes = freemem();
  const usedBytes = totalBytes - freeBytes;
  const totalMb = totalBytes / (1024 * 1024);
  const usedMb = usedBytes / (1024 * 1024);

  return {
    cpu: {
      percent: Math.round(cpuPercent * 10) / 10,
      cores: cpus().length,
    },
    ram: {
      usedMb: Math.round(usedMb),
      totalMb: Math.round(totalMb),
      percent: Math.round((usedBytes / totalBytes) * 1000) / 10,
    },
  };
}

/**
 * Sum container metrics across all guests.
 * cpuPercent here is the sum of per-container CPU% (each one normalised to
 * "100% per core consumed"). Useful to see total CPU pressure from sandboxes.
 */
export function getGuestsAggregate(metrics: ContainerMetrics[]): GuestsAggregate {
  let ramUsedMb = 0;
  let cpuPercent = 0;
  let diskUsedMb = 0;
  let total = 0;
  let running = 0;
  for (const m of metrics) {
    if (m.containerExists) total++;
    if (m.containerRunning) running++;
    if (m.ram) ramUsedMb += m.ram.usedMb;
    if (m.cpu) cpuPercent += m.cpu.percent;
    if (m.disk) diskUsedMb += m.disk.usedMb;
  }
  return {
    containers: { total, running },
    ramUsedMb: Math.round(ramUsedMb * 10) / 10,
    cpuPercent: Math.round(cpuPercent * 10) / 10,
    diskUsedMb: Math.round(diskUsedMb * 10) / 10,
  };
}
