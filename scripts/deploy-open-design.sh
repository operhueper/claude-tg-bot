#!/usr/bin/env bash
# deploy-open-design.sh — fresh Open Design install on proboi-bot.
#
# Source repo:   https://github.com/nexu-io/open-design.git (branch: main)
# Target:        root@89.167.125.175:/opt/open-design
# Runtime:       Node ~24, pnpm@10.33.2 (must already be on the box — see bootstrap)
# Service:       systemd unit open-design.service
# Ports:         web=17573, daemon=17456 (both bound to 127.0.0.1)
# nginx:         design.proboi.site → http://127.0.0.1:17573 (configured separately)
#
# Idempotent: re-running fetches+resets the repo, re-runs pnpm install, rewrites
# the unit, restarts. No persistent runtime data is migrated from jinru — OD
# recreates .od/ (sqlite, projects, artifacts) on first launch by design.
set -euo pipefail

JINRU=root@5.223.82.96
TARGET=root@89.167.125.175
TARGET_HOST=89.167.125.175
OD_DIR=/opt/open-design
OD_REPO=https://github.com/nexu-io/open-design.git
OD_BRANCH=main
WEB_PORT=17573
DAEMON_PORT=17456
UNIT_PATH=/etc/systemd/system/open-design.service

log() { echo "[od-deploy] $(date -Iseconds) $*"; }
die() { echo "[od-deploy] $(date -Iseconds) ERROR: $*" >&2; exit 1; }

# 1. Pre-flight: SSH reachability
log "step 1/10: pre-flight SSH check → $TARGET"
ssh -o BatchMode=yes -o ConnectTimeout=10 "$TARGET" 'echo ok' >/dev/null \
    || die "cannot SSH to $TARGET (set up keys / check VPN / DNS)"

# 2. Verify bootstrap (node, pnpm, git on target)
log "step 2/10: verify bootstrap (node, pnpm, git) on target"
ssh "$TARGET" 'set -e
    command -v git >/dev/null  || { echo "MISSING: git";  exit 11; }
    command -v node >/dev/null || { echo "MISSING: node"; exit 12; }
    command -v pnpm >/dev/null || { echo "MISSING: pnpm"; exit 13; }
    node_v=$(node -v)
    pnpm_v=$(pnpm -v)
    echo "node=$node_v pnpm=$pnpm_v"
' || die "bootstrap incomplete — run scripts/bootstrap-proboi.sh first (need node ~24, pnpm >=10.33.2)"

# 3. Clone or update repo on target
log "step 3/10: clone or update $OD_REPO → $OD_DIR (branch: $OD_BRANCH)"
ssh "$TARGET" "set -e
    if [ ! -d $OD_DIR/.git ]; then
        if [ -d $OD_DIR ] && [ \"\$(ls -A $OD_DIR 2>/dev/null)\" ]; then
            echo 'ERROR: $OD_DIR exists and is not empty but has no .git — aborting' >&2
            exit 21
        fi
        mkdir -p $OD_DIR
        git clone --branch $OD_BRANCH $OD_REPO $OD_DIR
    else
        cd $OD_DIR
        git fetch origin $OD_BRANCH --tags --prune
        git reset --hard origin/$OD_BRANCH
    fi
    cd $OD_DIR
    echo \"HEAD=\$(git rev-parse --short HEAD) branch=\$(git rev-parse --abbrev-ref HEAD)\"
"

# 4. .env handling — jinru currently has NO .env (verified 2026-05-06).
#    Probe again at deploy-time in case that changed; if absent, continue clean.
log "step 4/10: .env handling"
JINRU_ENV_PRESENT=$(ssh "$JINRU" "test -s $OD_DIR/.env && echo yes || echo no")
if [ "$JINRU_ENV_PRESENT" = "yes" ]; then
    read -r -p "[od-deploy] jinru has $OD_DIR/.env — copy it to proboi? [yes/no] " ans
    if [ "$ans" = "yes" ]; then
        log "scp $JINRU:$OD_DIR/.env → $TARGET:$OD_DIR/.env"
        scp -3 "$JINRU:$OD_DIR/.env" "$TARGET:$OD_DIR/.env"
        ssh "$TARGET" "chmod 600 $OD_DIR/.env"
    else
        log "WARNING: skipped .env copy — set vars manually later if OD needs them"
    fi
else
    log "no .env on jinru — proceeding with clean install (OD has no required env vars)"
fi

# 5. Install dependencies
log "step 5/10: pnpm install --frozen-lockfile (≈1.6 GB on jinru, may take several minutes)"
ssh "$TARGET" "cd $OD_DIR && pnpm install --frozen-lockfile" \
    || die "pnpm install failed — check pnpm-lock.yaml integrity / network"

# 6. Build step
#    Root package.json has no 'build' script. Per-workspace builds are driven
#    on-demand by tools-dev at runtime (the systemd ExecStart launches it).
#    We skip a separate build step — matches jinru's working setup.
log "step 6/10: build — skipped (no root build script; tools-dev builds on demand)"

# 7. Write systemd unit (mirror jinru's exactly)
log "step 7/10: write $UNIT_PATH"
ssh "$TARGET" "cat > $UNIT_PATH" <<'UNIT'
[Unit]
Description=Open Design
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/open-design
ExecStart=/usr/bin/node /opt/open-design/tools/dev/bin/tools-dev.mjs run web --web-port 17573 --daemon-port 17456
Restart=on-failure
RestartSec=5
Environment=PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
Environment=HOME=/root
EnvironmentFile=-/opt/open-design/.env

[Install]
WantedBy=multi-user.target
UNIT

# 8. Resolve node path & enable+start
log "step 8/10: daemon-reload + enable + start"
ssh "$TARGET" "set -e
    # Patch ExecStart to use whichever node is on PATH (in case it isn't /usr/bin/node)
    NODE_BIN=\$(command -v node)
    if [ \"\$NODE_BIN\" != /usr/bin/node ]; then
        sed -i \"s|/usr/bin/node|\$NODE_BIN|\" $UNIT_PATH
        echo \"patched ExecStart node path → \$NODE_BIN\"
    fi
    systemctl daemon-reload
    systemctl enable open-design.service
    systemctl restart open-design.service
"

# 9. Health check
log "step 9/10: wait 5s, verify service + HTTP"
sleep 5
HEALTH=$(ssh "$TARGET" "set +e
    systemctl is-active open-design >/dev/null 2>&1 || { echo 'SERVICE_DOWN'; exit 0; }
    # OD web may take longer to bind on first run; retry a few times
    for i in 1 2 3 4 5 6; do
        if curl -fsS -o /dev/null -m 5 http://127.0.0.1:$WEB_PORT/; then
            echo 'OK'; exit 0
        fi
        sleep 5
    done
    echo 'HTTP_FAIL'
")
if [ "$HEALTH" != "OK" ]; then
    log "healthcheck failed ($HEALTH) — last 30 lines of journal:"
    ssh "$TARGET" 'journalctl -u open-design -n 30 --no-pager' || true
    die "open-design did not come up healthy"
fi

# 10. Summary
log "step 10/10: SUCCESS"
cat <<EOF

========================================================================
  Open Design deployed on proboi-bot ($TARGET_HOST)
------------------------------------------------------------------------
  Path:          $OD_DIR
  Branch:        $OD_BRANCH
  Service:       open-design.service (active, enabled)
  Web port:      127.0.0.1:$WEB_PORT
  Daemon port:   127.0.0.1:$DAEMON_PORT
  nginx target:  design.proboi.site → http://127.0.0.1:$WEB_PORT
  Logs:          ssh $TARGET 'journalctl -u open-design -f'
========================================================================
EOF
