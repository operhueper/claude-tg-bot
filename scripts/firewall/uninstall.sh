#!/usr/bin/env bash
# uninstall.sh — полное удаление claude-firewall
set -euo pipefail

SBIN="/usr/local/sbin"
SYSTEMD="/etc/systemd/system"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }

# Остановить и выключить сервисы
systemctl disable --now \
  claude-firewall.service \
  claude-egress-monitor.timer \
  claude-egress-reset.timer \
  2>/dev/null || true

# Сбросить правила iptables и tc
[[ -x "$SBIN/claude-firewall-flush.sh" ]] && bash "$SBIN/claude-firewall-flush.sh" || true

# Удалить unit'ы
rm -f \
  "$SYSTEMD/claude-firewall.service" \
  "$SYSTEMD/claude-egress-monitor.service" \
  "$SYSTEMD/claude-egress-monitor.timer" \
  "$SYSTEMD/claude-egress-reset.service" \
  "$SYSTEMD/claude-egress-reset.timer"

# Удалить скрипты
rm -f \
  "$SBIN/claude-setup-firewall.sh" \
  "$SBIN/claude-firewall-flush.sh" \
  "$SBIN/claude-egress-monitor.sh" \
  "$SBIN/claude-egress-reset.sh"

systemctl daemon-reload
log "Удаление завершено. State-файлы в /var/lib/claude-firewall сохранены."
log "Для полной очистки: rm -rf /var/lib/claude-firewall /etc/claude-firewall"
