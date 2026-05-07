/**
 * Build the `docker run` argv for a user's sandbox container.
 *
 * Owner gets an unconstrained container with docker.sock + /var/log mount
 * (so they can manage the bot itself from inside the box).
 * Guests get a hardened container with cgroup limits and no docker.sock.
 *
 * The container itself just runs `sleep infinity` — the bot drives it via
 * `docker exec`. So no PORT/EXPOSE here, no entrypoint override. The image
 * (`claude-user-sandbox:latest`) is expected to default-cmd into sleep.
 */

import type { UserProfile } from "../config";
import {
  SANDBOX_IMAGE,
  containerName,
  dropboxDir,
} from "./paths";

export function buildRunArgs(profile: UserProfile): string[] {
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
    "--name",
    containerName(userId),
    "--hostname",
    `user-${userId}`,
    "--label",
    `claude-bot-user=${userId}`,
    "--workdir",
    vaultPath,
    // Vault: bind-mount, NOT a named volume — keeps host and container in sync.
    "-v",
    `${vaultPath}:${vaultPath}`,
    // Claude credentials & settings — read-only so guests can't tamper
    "-v",
    "/root/.claude:/root/.claude:ro",
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
  } else {
    // Guest sandbox limits. memory-swap >= memory; cap at 2x memory so a
    // misbehaving process can't grind the host into swap. CPU capped at 1
    // full core (but bursting allowed within that ceiling).
    args.push("--memory", "512m");
    args.push("--memory-swap", "1024m");
    args.push("--cpus", "1.0");
  }

  // Image goes last; everything after it is treated as the container CMD.
  args.push(SANDBOX_IMAGE);

  return args;
}
