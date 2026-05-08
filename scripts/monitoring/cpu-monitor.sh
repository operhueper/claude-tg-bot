#!/usr/bin/env bash
# cpu-monitor.sh — мониторинг CPU гостевых контейнеров, уведомления в Telegram
# Запускается раз в минуту через claude-cpu-monitor.timer
set -uo pipefail

ENV_FILE="/etc/claude-firewall/env"
STATE_DIR="/var/lib/claude-cpu-monitor"
LOG_FILE="/var/log/claude-cpu-monitor.log"
HISTORY_SIZE=60        # точек (= 60 минут)
CPU_THRESHOLD=70.0     # % среднего за час для триггера
NOTIFY_COOLDOWN=21600  # 6 часов в секундах

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" >> "$LOG_FILE"; }

# ── Загрузка env ───────────────────────────────────────────────────────────────

if [[ ! -f "$ENV_FILE" ]]; then
  log "WARN: env-файл $ENV_FILE не найден, пропускаем уведомления"
  TELEGRAM_BOT_TOKEN=""
  OWNER_PROBLEM_CHANNEL_ID=""
else
  # shellcheck source=/dev/null
  source "$ENV_FILE"
fi

# ── Вспомогательные функции ────────────────────────────────────────────────────

send_telegram() {
  local chat_id="$1"
  local text="$2"
  if [[ -z "$TELEGRAM_BOT_TOKEN" ]]; then
    log "WARN: TELEGRAM_BOT_TOKEN не задан, уведомление пропущено (chat_id=$chat_id)"
    return 0
  fi
  local http_code
  http_code=$(curl -s -o /dev/null -w "%{http_code}" \
    "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
    --data-urlencode "chat_id=${chat_id}" \
    --data-urlencode "text=${text}" 2>/dev/null) || true
  if [[ "$http_code" != "200" ]]; then
    log "WARN: Telegram sendMessage вернул $http_code (chat_id=$chat_id)"
  fi
}

# Среднее значение из CSV-строки чисел
calc_avg() {
  local csv="$1"
  # Заменяем запятые на пробелы, суммируем через awk
  echo "$csv" | tr ',' '\n' | awk '
    BEGIN { sum=0; count=0 }
    NF    { sum += $1; count++ }
    END   { if (count > 0) printf "%.2f", sum/count; else print "0.00" }
  '
}

# Сравнение float: возвращает 0 (true) если $1 > $2
float_gt() {
  awk -v a="$1" -v b="$2" 'BEGIN { exit (a > b) ? 0 : 1 }'
}

# Проверка cooldown флага: возвращает 0 (true) если нужно уведомить
should_notify() {
  local flag_file="$1"
  if [[ ! -f "$flag_file" ]]; then
    return 0
  fi
  local flag_ts now elapsed
  flag_ts=$(cat "$flag_file" 2>/dev/null) || flag_ts=0
  now=$(date +%s)
  elapsed=$(( now - flag_ts ))
  if (( elapsed >= NOTIFY_COOLDOWN )); then
    return 0
  fi
  return 1
}

# ── Основной цикл ──────────────────────────────────────────────────────────────

mkdir -p "$STATE_DIR"

# Получаем статистику всех контейнеров за один вызов
# Формат вывода: claude-user-12345|3.45%
docker stats --no-stream --format '{{.Name}}|{{.CPUPerc}}' 2>/dev/null \
| grep '^claude-user-' \
| while IFS='|' read -r container_name cpu_perc_raw; do

  # Убираем символ % и пробелы
  cpu_val="${cpu_perc_raw//%/}"
  cpu_val="${cpu_val// /}"

  # Извлекаем userId из имени контейнера: claude-user-<userId>
  user_id="${container_name#claude-user-}"

  state_file="${STATE_DIR}/${container_name}.state"
  notified_file="${STATE_DIR}/${container_name}.notified"

  # Читаем текущую историю (CSV)
  history=""
  if [[ -f "$state_file" ]]; then
    history=$(cat "$state_file" 2>/dev/null) || history=""
  fi

  # Добавляем новое значение
  if [[ -z "$history" ]]; then
    history="$cpu_val"
  else
    history="${history},${cpu_val}"
  fi

  # Обрезаем до последних HISTORY_SIZE точек
  history=$(echo "$history" | tr ',' '\n' | tail -n "$HISTORY_SIZE" | tr '\n' ',' | sed 's/,$//')

  # Сохраняем обновлённую историю
  echo "$history" > "$state_file"

  # Считаем количество точек
  point_count=$(echo "$history" | tr ',' '\n' | wc -l | tr -d ' ')

  # Триггер только при полном наборе (60 точек = 1 час)
  if (( point_count >= HISTORY_SIZE )); then
    avg=$(calc_avg "$history")

    if float_gt "$avg" "$CPU_THRESHOLD"; then
      avg_int=$(printf "%.0f" "$avg")
      log "ANOMALY: $container_name avg_cpu=${avg}% (threshold=${CPU_THRESHOLD}%)"

      if should_notify "$notified_file"; then
        # Уведомление в канал владельца
        if [[ -n "${OWNER_PROBLEM_CHANNEL_ID:-}" ]]; then
          send_telegram "$OWNER_PROBLEM_CHANNEL_ID" \
            "⚠️ CPU аномалия: контейнер ${container_name}, средний CPU ${avg_int}% за последний час"
        fi

        # Личное сообщение пользователю
        send_telegram "$user_id" \
          "Заметил, что твоя автоматизация час подряд грузит процессор на ${avg_int}%+. Возможно, что-то заглючило. Проверь, пожалуйста — если задача правда такая тяжёлая, напиши Евгению, обсудим тариф побольше."

        # Ставим cooldown-флаг с текущим timestamp
        date +%s > "$notified_file"
        log "NOTIFIED: $container_name (user_id=$user_id), cooldown установлен на ${NOTIFY_COOLDOWN}s"
      else
        log "SKIP_NOTIFY: $container_name — в cooldown (notified_file=$notified_file)"
      fi
    fi
  fi

done

exit 0
