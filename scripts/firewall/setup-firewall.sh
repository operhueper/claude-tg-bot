#!/usr/bin/env bash
# setup-firewall.sh — идемпотентное применение firewall-правил для контейнеров
# Запускать: sudo bash setup-firewall.sh
set -euo pipefail

GUEST_SUBNET=$(docker network inspect claude-guest-net --format '{{range .IPAM.Config}}{{.Subnet}}{{end}}' 2>/dev/null)
if [ -z "$GUEST_SUBNET" ]; then
    echo "ERROR: claude-guest-net не найдена. Сначала запусти scripts/firewall/setup-guest-network.sh"
    exit 1
fi
CONTAINER_SUBNET="$GUEST_SUBNET"
CHAIN_SMTP="CLAUDE_SMTP_BLOCK"
CHAIN_TRAFFIC="CLAUDE_TRAFFIC_COUNT"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }

# ── Вспомогательные функции ───────────────────────────────────────────────────

chain_exists() {
  iptables -n -L "$1" &>/dev/null
}

rule_exists() {
  # $1 = table (-t nat / пусто для filter), $2..N = остаток правила
  local table_args=()
  if [[ "$1" == -t ]]; then
    table_args=("-t" "$2")
    shift 2
  fi
  iptables "${table_args[@]}" -C "$@" &>/dev/null
}

# ── 1. Цепочка блокировки SMTP ─────────────────────────────────────────────────

if ! chain_exists "$CHAIN_SMTP"; then
  iptables -N "$CHAIN_SMTP"
  log "Создана цепочка $CHAIN_SMTP"
fi

# Переход в цепочку из FORWARD (только для src из подсети контейнеров)
if ! rule_exists FORWARD -s "$CONTAINER_SUBNET" -j "$CHAIN_SMTP"; then
  iptables -I FORWARD 1 -s "$CONTAINER_SUBNET" -j "$CHAIN_SMTP"
  log "FORWARD → $CHAIN_SMTP для $CONTAINER_SUBNET"
fi

# TCP/25: полный блок с NFLOG
if ! rule_exists "$CHAIN_SMTP" -p tcp --dport 25 -j NFLOG --nflog-group 25; then
  iptables -A "$CHAIN_SMTP" -p tcp --dport 25 -j NFLOG --nflog-group 25
  log "TCP/25 → NFLOG group 25"
fi
if ! rule_exists "$CHAIN_SMTP" -p tcp --dport 25 -j DROP; then
  iptables -A "$CHAIN_SMTP" -p tcp --dport 25 -j DROP
  log "TCP/25 → DROP"
fi

# TCP/465 и 587: rate-limit 30 новых соединений / час / src-IP
for PORT in 465 587; do
  # NEW соединения, превысившие лимит — NFLOG + DROP
  if ! rule_exists "$CHAIN_SMTP" -p tcp --dport "$PORT" \
      -m state --state NEW \
      -m hashlimit --hashlimit-mode srcip \
      --hashlimit-above 30/hour \
      --hashlimit-burst 5 \
      --hashlimit-name "smtp${PORT}" \
      -j NFLOG --nflog-group 25; then
    iptables -A "$CHAIN_SMTP" -p tcp --dport "$PORT" \
      -m state --state NEW \
      -m hashlimit --hashlimit-mode srcip \
      --hashlimit-above 30/hour \
      --hashlimit-burst 5 \
      --hashlimit-name "smtp${PORT}" \
      -j NFLOG --nflog-group 25
    log "TCP/${PORT} rate-exceed → NFLOG"
  fi
  if ! rule_exists "$CHAIN_SMTP" -p tcp --dport "$PORT" \
      -m state --state NEW \
      -m hashlimit --hashlimit-mode srcip \
      --hashlimit-above 30/hour \
      --hashlimit-burst 5 \
      --hashlimit-name "smtp${PORT}" \
      -j DROP; then
    iptables -A "$CHAIN_SMTP" -p tcp --dport "$PORT" \
      -m state --state NEW \
      -m hashlimit --hashlimit-mode srcip \
      --hashlimit-above 30/hour \
      --hashlimit-burst 5 \
      --hashlimit-name "smtp${PORT}" \
      -j DROP
    log "TCP/${PORT} rate-exceed → DROP"
  fi
done

# ── 2. Цепочка счётчиков трафика (для egress-monitor.sh) ──────────────────────

if ! chain_exists "$CHAIN_TRAFFIC"; then
  iptables -N "$CHAIN_TRAFFIC"
  log "Создана цепочка $CHAIN_TRAFFIC"
fi

# Переход в цепочку из FORWARD для src из подсети
if ! rule_exists FORWARD -s "$CONTAINER_SUBNET" -j "$CHAIN_TRAFFIC"; then
  iptables -I FORWARD 2 -s "$CONTAINER_SUBNET" -j "$CHAIN_TRAFFIC"
  log "FORWARD → $CHAIN_TRAFFIC для $CONTAINER_SUBNET"
fi

# Правила-счётчики добавляются динамически в egress-monitor.sh при обнаружении IP.
# Здесь добавляем catch-all return чтобы цепочка не блокировала трафик.
if ! rule_exists "$CHAIN_TRAFFIC" -j RETURN; then
  iptables -A "$CHAIN_TRAFFIC" -j RETURN
  log "$CHAIN_TRAFFIC → RETURN (pass-through)"
fi

log "setup-firewall.sh завершён успешно"
