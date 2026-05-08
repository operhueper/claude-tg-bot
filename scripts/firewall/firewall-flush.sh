#!/usr/bin/env bash
# firewall-flush.sh — удаляет все правила и цепочки claude-firewall (для ExecStop / uninstall)
set -euo pipefail

CHAIN_SMTP="CLAUDE_SMTP_BLOCK"
CHAIN_TRAFFIC="CLAUDE_TRAFFIC_COUNT"
CONTAINER_SUBNET="172.17.0.0/16"
IFACE="docker0"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }

# Удалить переходы из FORWARD
iptables -D FORWARD -s "$CONTAINER_SUBNET" -j "$CHAIN_SMTP"    2>/dev/null && log "Удалён jump → $CHAIN_SMTP" || true
iptables -D FORWARD -s "$CONTAINER_SUBNET" -j "$CHAIN_TRAFFIC" 2>/dev/null && log "Удалён jump → $CHAIN_TRAFFIC" || true

# Flush и удалить цепочки
for CHAIN in "$CHAIN_SMTP" "$CHAIN_TRAFFIC"; do
  if iptables -n -L "$CHAIN" &>/dev/null; then
    iptables -F "$CHAIN"
    iptables -X "$CHAIN"
    log "Удалена цепочка $CHAIN"
  fi
done

# Удалить tc qdisc (снимает все классы и фильтры)
if tc qdisc show dev "$IFACE" 2>/dev/null | grep -q "htb"; then
  tc qdisc del dev "$IFACE" root 2>/dev/null && log "Удалён tc qdisc root на $IFACE" || true
fi

log "firewall-flush завершён"
