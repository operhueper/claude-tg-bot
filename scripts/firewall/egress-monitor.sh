#!/usr/bin/env bash
# egress-monitor.sh — считает исходящий трафик контейнеров, throttle при >20 GB/день
# Запускается каждую минуту через systemd timer.
set -euo pipefail

CONTAINER_SUBNET_PREFIX="172.17."
CHAIN_TRAFFIC="CLAUDE_TRAFFIC_COUNT"
STATE_DIR="/var/lib/claude-firewall"
LOG_FILE="/var/log/claude-egress.log"
ENV_FILE="/etc/claude-firewall/env"
DAILY_LIMIT_BYTES=$((20 * 1024 * 1024 * 1024))  # 20 GB
THROTTLE_RATE="100kbit"
TC_HANDLE_BASE=10
IFACE="docker0"

mkdir -p "$STATE_DIR"

# ── Загрузка env (токен и channel_id) ────────────────────────────────────────

TELEGRAM_BOT_TOKEN=""
OWNER_PROBLEM_CHANNEL_ID=""
if [[ -f "$ENV_FILE" ]]; then
  # shellcheck source=/dev/null
  source "$ENV_FILE"
fi

# ── Алерт в Telegram ──────────────────────────────────────────────────────────

send_alert() {
  local text="$1"
  if [[ -z "$TELEGRAM_BOT_TOKEN" || -z "$OWNER_PROBLEM_CHANNEL_ID" ]]; then
    echo "[WARN] Telegram env не настроен, алерт пропущен: $text"
    return 0
  fi
  curl -s --max-time 10 \
    "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
    --data-urlencode "chat_id=${OWNER_PROBLEM_CHANNEL_ID}" \
    --data-urlencode "text=${text}" \
    >/dev/null || echo "[WARN] Не удалось отправить алерт в Telegram"
}

maybe_notify() {
  local ip="$1" kind="$2" text="$3"
  local flag="${STATE_DIR}/notified-${ip//./_}-${kind}.flag"
  if [[ ! -f "$flag" ]]; then
    touch "$flag"
    send_alert "$text"
  fi
}

# ── Инициализация tc qdisc (один раз) ────────────────────────────────────────

ensure_tc_root() {
  # HTB qdisc root на docker0
  if ! tc qdisc show dev "$IFACE" | grep -q "htb"; then
    tc qdisc add dev "$IFACE" root handle 1: htb default 9999
    # Класс-default для нелимитированного трафика
    tc class add dev "$IFACE" parent 1: classid 1:9999 htb rate 1gbit
  fi
}

# ── Получить handle по IP ─────────────────────────────────────────────────────

ip_to_handle() {
  # Последний октет (172.17.0.X → X), 10 ≤ classid ≤ 254
  local ip="$1"
  local octet4
  octet4=$(echo "$ip" | awk -F. '{print $4}')
  echo "$((TC_HANDLE_BASE + octet4))"
}

# ── Проверить, есть ли уже throttle для IP ────────────────────────────────────

is_throttled() {
  local ip="$1"
  [[ -f "${STATE_DIR}/throttled-${ip//./_}.flag" ]]
}

# ── Применить throttle для IP ─────────────────────────────────────────────────

apply_throttle() {
  local ip="$1"
  local daily_gb="$2"
  local flag="${STATE_DIR}/throttled-${ip//./_}.flag"

  if is_throttled "$ip"; then
    return 0  # уже throttled, ничего не делать
  fi

  ensure_tc_root

  local handle
  handle=$(ip_to_handle "$ip")

  # Добавить htb-класс если ещё нет
  if ! tc class show dev "$IFACE" | grep -q "classid 1:${handle}"; then
    tc class add dev "$IFACE" parent 1: classid "1:${handle}" htb rate "$THROTTLE_RATE"
  fi

  # Фильтр по src IP
  # Удалить старый фильтр если есть (идемпотентность)
  tc filter del dev "$IFACE" protocol ip parent 1: \
    u32 match ip src "${ip}/32" 2>/dev/null || true
  tc filter add dev "$IFACE" protocol ip parent 1: \
    u32 match ip src "${ip}/32" flowid "1:${handle}"

  touch "$flag"

  local ts
  ts=$(date '+%Y-%m-%d %H:%M')
  echo "[${ts}] container=${ip} daily=${daily_gb} action=throttled" >> "$LOG_FILE"

  maybe_notify "$ip" "throttle" \
    "⚠️ Egress throttle: container ${ip} hit ${daily_gb} GB/day, throttled to 100 KB/s"
}

# ── Читать счётчики из iptables CLAUDE_TRAFFIC_COUNT ─────────────────────────

# Вывод iptables -nvxL CLAUDE_TRAFFIC_COUNT:
# Chain CLAUDE_TRAFFIC_COUNT (1 references)
#     pkts      bytes target     prot opt in     out     source               destination
#        0          0 RETURN     all  --  *      *       0.0.0.0/0            0.0.0.0/0

# Для per-IP нам нужны отдельные правила с match на каждый src IP.
# Если правило для IP ещё не создано — создаём его (первое появление IP).

ensure_counter_rule() {
  local ip="$1"
  # Проверить наличие правила с этим src (колонка 8 в выводе iptables -nvxL = source)
  if ! iptables -nvxL "$CHAIN_TRAFFIC" | awk '{print $8}' | grep -qF "${ip}"; then
    # Вставить перед финальным RETURN (последняя строка)
    local line_count
    line_count=$(iptables -nvxL "$CHAIN_TRAFFIC" --line-numbers | tail -n +3 | wc -l)
    iptables -I "$CHAIN_TRAFFIC" "$line_count" \
      -s "$ip" -j RETURN
  fi
}

# ── Основной цикл по активным IP контейнеров ─────────────────────────────────

# Собрать IP контейнеров из docker inspect (если docker доступен)
CONTAINER_IPS=()
if command -v docker &>/dev/null; then
  while IFS= read -r ip; do
    [[ "$ip" == ${CONTAINER_SUBNET_PREFIX}* ]] && CONTAINER_IPS+=("$ip")
  done < <(docker inspect $(docker ps -q 2>/dev/null) \
    --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' 2>/dev/null || true)
fi

if [[ ${#CONTAINER_IPS[@]} -eq 0 ]]; then
  exit 0  # нет контейнеров — ничего делать
fi

for IP in "${CONTAINER_IPS[@]}"; do
  [[ -z "$IP" ]] && continue

  # Убедиться что счётчик-правило существует
  ensure_counter_rule "$IP"

  # Прочитать байты из iptables для этого IP
  BYTES=$(iptables -nvxL "$CHAIN_TRAFFIC" \
    | awk -v ip="$IP" '$8 == ip {print $2; exit}')
  BYTES=${BYTES:-0}

  STATE_FILE="${STATE_DIR}/egress-${IP//./_}.byte"

  # Загрузить базовое значение на начало дня
  BASE_FILE="${STATE_DIR}/base-${IP//./_}.byte"
  BASE=0
  [[ -f "$BASE_FILE" ]] && BASE=$(cat "$BASE_FILE")

  DAILY_BYTES=$(( BYTES - BASE ))
  [[ $DAILY_BYTES -lt 0 ]] && DAILY_BYTES=0

  # Сохранить накопленное
  echo "$DAILY_BYTES" > "$STATE_FILE"

  # Проверить лимит
  if [[ $DAILY_BYTES -ge $DAILY_LIMIT_BYTES ]]; then
    DAILY_GB=$(echo "scale=2; $DAILY_BYTES / 1073741824" | bc)
    apply_throttle "$IP" "$DAILY_GB"
  fi
done
