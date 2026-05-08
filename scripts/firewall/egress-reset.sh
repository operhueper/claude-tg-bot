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
iptables -nvxL CLAUDE_TRAFFIC_COUNT 2>/dev/null | tail -n +3 | while read -r pkts bytes rest src dst; do
  [[ "$src" == "0.0.0.0/0" || -z "$src" ]] && continue
  IP="${src%%/*}"  # убрать маску /32
  [[ "$IP" == "0.0.0.0" ]] && continue
  BASE_FILE="${STATE_DIR}/base-${IP//./_}.byte"
  echo "$bytes" > "$BASE_FILE"
done

# ── Удалить state-файлы дня (счётчики и флаги нотификаций) ──────────────────

rm -f "${STATE_DIR}"/egress-*.byte \
       "${STATE_DIR}"/throttled-*.flag \
       "${STATE_DIR}"/notified-*.flag

ts=$(date '+%Y-%m-%d %H:%M')
echo "[${ts}] action=daily_reset" >> "$LOG_FILE"
log "Суточный сброс завершён"
