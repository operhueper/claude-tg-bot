#!/usr/bin/env bash
# migrate-jinru-to-proboi.sh
#
# Run from MacBook. NOT from inside the bot session — it would migrate over its
# own running instance. Causes downtime — bot stops on jinru while copying.
#
# Copies all bot data from jinru-web (5.223.82.96) to proboi-bot (89.167.125.175):
#   /opt/vault/                       per-user workdirs
#   /opt/claude-tg-bot/users.json     user registry
#   /opt/claude-tg-bot/metering.sqlite (+ -shm/-wal)  token accounting
#   /opt/claude-tg-bot/.env           prod env (contains secrets — not logged)
#   /opt/claude-tg-bot/mcp-config.ts  per-host MCP wiring
#   /var/log/claude-tg-bot.log        bot stdout log
#   /var/log/claude-tg-bot.err.log    bot stderr log
#   /tmp/claude-telegram-audit.log    audit log
#
# Repo source code is NOT migrated here — deploy that separately via your usual
# rsync from MacBook → new server.

set -euo pipefail

OLD_HOST="root@5.223.82.96"
NEW_HOST="root@89.167.125.175"
LOG_PREFIX="[migrate]"

log() { echo "${LOG_PREFIX} $(date -Iseconds) $*"; }
abort() { echo "${LOG_PREFIX} $(date -Iseconds) ABORT: $*" >&2; exit 1; }

# ---------------------------------------------------------------------------
# Pre-flight checks
# ---------------------------------------------------------------------------

log "Step 0/8: pre-flight checks"

log "  checking SSH to old host (${OLD_HOST})..."
ssh -o BatchMode=yes -o ConnectTimeout=5 "${OLD_HOST}" true \
  || abort "cannot SSH to ${OLD_HOST}"

log "  checking SSH to new host (${NEW_HOST})..."
ssh -o BatchMode=yes -o ConnectTimeout=5 "${NEW_HOST}" true \
  || abort "cannot SSH to ${NEW_HOST}"

log "  checking destination free disk (>10 GB required)..."
DEST_FREE_KB="$(ssh "${NEW_HOST}" "df --output=avail / | tail -1" | tr -d ' ')"
if [ "${DEST_FREE_KB}" -lt 10000000 ]; then
  abort "destination has only ${DEST_FREE_KB} KB free, need >10 GB"
fi
log "  destination free: ${DEST_FREE_KB} KB"

log "  checking destination has /opt/claude-tg-bot/ and /opt/vault/..."
ssh "${NEW_HOST}" 'test -d /opt/claude-tg-bot && test -d /opt/vault' \
  || abort "destination missing /opt/claude-tg-bot/ or /opt/vault/ — run bootstrap-proboi.sh first"

log "  bot must be stopped on jinru during migration to avoid writes mid-copy."
read -r -p "Stop claude-tg-bot.service on jinru NOW? [yes/no] " ANSWER
case "${ANSWER}" in
  yes)
    log "  stopping claude-tg-bot on ${OLD_HOST}..."
    ssh "${OLD_HOST}" 'systemctl stop claude-tg-bot'
    ;;
  *)
    abort "user declined to stop the bot — coordinate downtime first, then re-run"
    ;;
esac

# ---------------------------------------------------------------------------
# Copy steps
# ---------------------------------------------------------------------------

log "Step 1/8: rsync /opt/vault/ (per-user workdirs, ~1.7 GB)"
rsync -azH --info=progress2 \
  "${OLD_HOST}:/opt/vault/" "${NEW_HOST}:/opt/vault/"

log "Step 2/8: copy users.json (user registry)"
TMP_USERS="$(mktemp)"
trap 'rm -f "${TMP_USERS}"' EXIT
scp "${OLD_HOST}:/opt/claude-tg-bot/users.json" "${TMP_USERS}"
scp "${TMP_USERS}" "${NEW_HOST}:/opt/claude-tg-bot/users.json"

log "Step 3/8: checkpoint and copy metering DB"
log "  checkpointing WAL on jinru..."
ssh "${OLD_HOST}" "sqlite3 /opt/claude-tg-bot/metering.sqlite 'PRAGMA wal_checkpoint(TRUNCATE);'"
log "  rsyncing metering.sqlite{,-shm,-wal}..."
rsync -azH --info=progress2 \
  "${OLD_HOST}:/opt/claude-tg-bot/metering.sqlite" \
  "${NEW_HOST}:/opt/claude-tg-bot/metering.sqlite"
# -shm and -wal may or may not exist after checkpoint — copy if present.
for SUFFIX in -shm -wal; do
  if ssh "${OLD_HOST}" "test -f /opt/claude-tg-bot/metering.sqlite${SUFFIX}"; then
    rsync -azH \
      "${OLD_HOST}:/opt/claude-tg-bot/metering.sqlite${SUFFIX}" \
      "${NEW_HOST}:/opt/claude-tg-bot/metering.sqlite${SUFFIX}"
  else
    log "  metering.sqlite${SUFFIX} absent on source (post-checkpoint), skipping"
  fi
done

log "Step 4/8: copy .env (contains secrets — not logged)"
TMP_ENV="$(mktemp)"
chmod 600 "${TMP_ENV}"
scp -q "${OLD_HOST}:/opt/claude-tg-bot/.env" "${TMP_ENV}"
scp -q "${TMP_ENV}" "${NEW_HOST}:/opt/claude-tg-bot/.env"
ssh "${NEW_HOST}" 'chmod 600 /opt/claude-tg-bot/.env'
shred -u "${TMP_ENV}" 2>/dev/null || rm -f "${TMP_ENV}"

log "Step 5/8: copy mcp-config.ts (per-host, gitignored)"
TMP_MCP="$(mktemp)"
scp "${OLD_HOST}:/opt/claude-tg-bot/mcp-config.ts" "${TMP_MCP}"
scp "${TMP_MCP}" "${NEW_HOST}:/opt/claude-tg-bot/mcp-config.ts"
rm -f "${TMP_MCP}"

log "Step 6/8: copy bot stdout/stderr logs into /var/log/claude-tg-bot/"
ssh "${NEW_HOST}" 'mkdir -p /var/log/claude-tg-bot'
TMP_LOG="$(mktemp)"
TMP_ERR="$(mktemp)"
scp "${OLD_HOST}:/var/log/claude-tg-bot.log"     "${TMP_LOG}"
scp "${OLD_HOST}:/var/log/claude-tg-bot.err.log" "${TMP_ERR}"
scp "${TMP_LOG}" "${NEW_HOST}:/var/log/claude-tg-bot/migrated-from-jinru.log"
scp "${TMP_ERR}" "${NEW_HOST}:/var/log/claude-tg-bot/migrated-from-jinru.err.log"
rm -f "${TMP_LOG}" "${TMP_ERR}"

log "Step 7/8: copy /tmp/claude-telegram-audit.log"
TMP_AUDIT="$(mktemp)"
if ssh "${OLD_HOST}" 'test -f /tmp/claude-telegram-audit.log'; then
  scp "${OLD_HOST}:/tmp/claude-telegram-audit.log" "${TMP_AUDIT}"
  scp "${TMP_AUDIT}" "${NEW_HOST}:/var/log/claude-tg-bot/audit-from-jinru.log"
  rm -f "${TMP_AUDIT}"
else
  log "  /tmp/claude-telegram-audit.log absent on source, skipping"
fi

# ---------------------------------------------------------------------------
# Post-flight checks
# ---------------------------------------------------------------------------

log "Step 8/8: post-flight verification"

log "  /opt/vault/ entry counts:"
SRC_VAULT_COUNT="$(ssh "${OLD_HOST}" 'ls /opt/vault/ | wc -l' | tr -d ' ')"
DST_VAULT_COUNT="$(ssh "${NEW_HOST}" 'ls /opt/vault/ | wc -l' | tr -d ' ')"
log "    source: ${SRC_VAULT_COUNT}    destination: ${DST_VAULT_COUNT}"
if [ "${SRC_VAULT_COUNT}" != "${DST_VAULT_COUNT}" ]; then
  log "  WARNING: vault entry count mismatch (destination may have pre-existing test users)"
fi

log "  /opt/vault/ size on destination:"
ssh "${NEW_HOST}" 'du -sh /opt/vault/'

log "  metering.usage row counts:"
SRC_USAGE="$(ssh "${OLD_HOST}" "sqlite3 /opt/claude-tg-bot/metering.sqlite 'SELECT COUNT(*) FROM usage;'" | tr -d ' ')"
DST_USAGE="$(ssh "${NEW_HOST}" "sqlite3 /opt/claude-tg-bot/metering.sqlite 'SELECT COUNT(*) FROM usage;'" | tr -d ' ')"
log "    source: ${SRC_USAGE}    destination: ${DST_USAGE}"
if [ "${SRC_USAGE}" != "${DST_USAGE}" ]; then
  abort "metering row count mismatch — investigate before starting bot"
fi

log "  validating users.json on destination..."
ssh "${NEW_HOST}" 'jq . /opt/claude-tg-bot/users.json > /dev/null' \
  || abort "users.json on destination is not valid JSON"
log "  users.json: OK"

# ---------------------------------------------------------------------------
# Manual checklist
# ---------------------------------------------------------------------------

cat <<'EOF'

[migrate] ============================================================
[migrate] DATA COPY COMPLETE. Bot is STOPPED on jinru. Do NOT auto-start.
[migrate]
[migrate] MANUAL TODO before starting bot on the new server:
[migrate]
[migrate]   1. Edit /opt/claude-tg-bot/.env on destination:
[migrate]        - keep TELEGRAM_BOT_TOKEN as-is (becomes prod token after switchover)
[migrate]        - verify ALLOWED_PATHS=/opt,/root,/home,/tmp,/var/tmp,/usr/local,/etc
[migrate]        - verify CLAUDE_WORKING_DIR=/opt/claude-tg-bot/workspace/
[migrate]
[migrate]   2. Deploy repo source code (rsync from MacBook → new server):
[migrate]        rsync -az --exclude node_modules --exclude .git \
[migrate]          ./ root@89.167.125.175:/opt/claude-tg-bot/
[migrate]
[migrate]   3. Install deps on destination:
[migrate]        ssh root@89.167.125.175 'cd /opt/claude-tg-bot && bun install'
[migrate]
[migrate]   4. Apply musl→glibc Claude CLI swap (well-known trap; see CLAUDE.md):
[migrate]        ssh root@89.167.125.175 'ls /root/.local/share/claude/versions/'
[migrate]        # then for the latest version <V>:
[migrate]        ssh root@89.167.125.175 "cp /root/.local/share/claude/versions/<V>/claude \
[migrate]          /opt/claude-tg-bot/node_modules/@anthropic-ai/claude-agent-sdk-linux-x64-musl/claude && \
[migrate]          chmod +x /opt/claude-tg-bot/node_modules/@anthropic-ai/claude-agent-sdk-linux-x64-musl/claude"
[migrate]
[migrate]   5. Deploy systemd unit file (separate step — not part of this script).
[migrate]
[migrate]   6. Start service manually:
[migrate]        ssh root@89.167.125.175 'systemctl restart claude-tg-bot'
[migrate]
[migrate] Bot remains STOPPED on jinru. Do not restart it there.
[migrate] ============================================================
EOF

log "done."
