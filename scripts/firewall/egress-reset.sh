#!/usr/bin/env bash
# egress-reset.sh — сброс суточных счётчиков и throttle в 00:00
# Запускается один раз в сутки через systemd timer.
set -euo pipefail

STATE_DIR="/var/lib/claude-firewall"
IFACE="docker0"
LOG_FILE="/var/log/claude-egress.log"

mkdir -p "$STATE_DIR"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }

# ── Снять все throttle-классы и фильтры tc ───────────────────────────────────

if tc qdisc show dev "$IFACE" 2>/dev/null | grep -q "htb"; then
  # Удалить все фильтры
  tc filter del dev "$IFACE" parent 1: 2>/dev/null || true
  # Удалить все дочерние классы кроме default
  tc class show dev "$IFACE" 2>/dev/null | awk '{print $3}' | grep -v "^$" | while read -r classid; do
    [[ "$classid" == "1:9999" ]] && continue
    [[ "$classid" == "1:0" ]] && continue
    tc class del dev "$IFACE" classid "$classid" 2>/dev/null || true
  done
  log "tc throttle-классы сброшены"
fi

# ── Обновить базовые значения счётчиков iptables (текущее = новый ноль) ───────

# Читаем текущие абсолютные байты из iptables и записываем как новую базу
# Колонки iptables -nvxL: pkts bytes target prot opt in out source destination
# source = колонка 8, bytes = колонка 2
GUEST_SUBNET=$(docker network inspect claude-guest-net --format '{{range .IPAM.Config}}{{.Subnet}}{{end}}' 2>/dev/null)
if [ -n "$GUEST_SUBNET" ]; then
  SUBNET_PREFIX=$(echo "$GUEST_SUBNET" | cut -d'.' -f1,2,3)
  iptables -L FORWARD -n -v -x 2>/dev/null | awk -v prefix="$SUBNET_PREFIX" '
    $8 ~ prefix && $8 != "0.0.0.0/0" {
      src = $8
      sub(/\/[0-9]+$/, "", src)
      print src, $2
    }
  ' | while read -r ip bytes; do
    [[ -z "$ip" || "$ip" == "0.0.0.0" ]] && continue
    BASE_FILE="${STATE_DIR}/base-${ip//./_}.byte"
    echo "$bytes" > "$BASE_FILE"
  done
fi

# ── Удалить state-файлы дня (счётчики и флаги нотификаций) ──────────────────

rm -f "${STATE_DIR}"/egress-*.byte \
       "${STATE_DIR}"/throttled-*.flag \
       "${STATE_DIR}"/notified-*.flag

ts=$(date '+%Y-%m-%d %H:%M')
echo "[${ts}] action=daily_reset" >> "$LOG_FILE"
log "Суточный сброс завершён"
