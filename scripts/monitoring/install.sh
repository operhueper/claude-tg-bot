#!/usr/bin/env bash
# install.sh — идемпотентная установка claude-cpu-monitor
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Запускать от root: sudo bash install.sh" >&2
  exit 1
fi

# Директория для state-файлов
mkdir -p /var/lib/claude-cpu-monitor
log "Директория /var/lib/claude-cpu-monitor готова"

# Скрипт
install -m 755 "$SCRIPT_DIR/cpu-monitor.sh" /usr/local/sbin/cpu-monitor.sh
log "Скопирован cpu-monitor.sh → /usr/local/sbin/cpu-monitor.sh"

# systemd units
install -m 644 "$SCRIPT_DIR/claude-cpu-monitor.service" /etc/systemd/system/claude-cpu-monitor.service
install -m 644 "$SCRIPT_DIR/claude-cpu-monitor.timer"   /etc/systemd/system/claude-cpu-monitor.timer
log "systemd units установлены"

systemctl daemon-reload
systemctl enable --now claude-cpu-monitor.timer
log "Таймер включён и запущен"

systemctl status claude-cpu-monitor.timer --no-pager || true
