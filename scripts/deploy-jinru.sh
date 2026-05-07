#!/usr/bin/env bash
# deploy-jinru.sh — deploy to production server (jinru, @proboiAI_bot)
#
# Usage: ./scripts/deploy-jinru.sh
#
# After bun install the script auto-swaps the musl SDK binary with the
# glibc build from /root/.local/share/claude/versions/<latest>.
# Without the swap every bot query fails with "native binary not found".

set -euo pipefail

HOST="root@5.223.82.96"
REMOTE_DIR="/opt/claude-tg-bot"

log() { echo "[deploy-jinru] $*"; }

# ---------------------------------------------------------------------------
# 1. Sync code (never sync .env — jinru has its own token)
# ---------------------------------------------------------------------------
log "rsync → jinru..."
rsync -az \
  --exclude node_modules \
  --exclude .git \
  --exclude .env \
  --exclude metering.sqlite \
  --exclude metering.sqlite-shm \
  --exclude metering.sqlite-wal \
  ./ "${HOST}:${REMOTE_DIR}/"

# ---------------------------------------------------------------------------
# 2. bun install + binary swap + restart
# ---------------------------------------------------------------------------
log "bun install + musl→glibc swap + restart..."
ssh "${HOST}" bash <<'REMOTE'
set -euo pipefail
cd /opt/claude-tg-bot

bun install --frozen-lockfile

# Find the latest Claude CLI build (glibc)
CLAUDE_BIN=$(ls -1t /root/.local/share/claude/versions/ | head -1)
if [ -z "${CLAUDE_BIN}" ]; then
  echo "[deploy-jinru] ERROR: no Claude binary found in /root/.local/share/claude/versions/" >&2
  exit 1
fi
CLAUDE_SRC="/root/.local/share/claude/versions/${CLAUDE_BIN}"

# Destination inside the musl SDK package
MUSL_TARGET="node_modules/@anthropic-ai/claude-agent-sdk-linux-x64-musl/claude"
if [ ! -d "$(dirname "${MUSL_TARGET}")" ]; then
  echo "[deploy-jinru] WARNING: musl SDK dir not found — skipping swap (SDK may be pure-JS now)"
else
  cp "${CLAUDE_SRC}" "${MUSL_TARGET}"
  chmod +x "${MUSL_TARGET}"
  echo "[deploy-jinru] swapped ${MUSL_TARGET} ← ${CLAUDE_SRC}"
fi

systemctl restart claude-tg-bot
echo "[deploy-jinru] restarted"
REMOTE

log "done. Check logs: ssh ${HOST} 'journalctl -u claude-tg-bot -n 30'"
