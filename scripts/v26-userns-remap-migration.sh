#!/usr/bin/env bash
# =============================================================================
# V-26 Migration: Enable Docker userns-remap (defense-in-depth)
#
# Назначение: предотвратить privilege-escalation при container escape.
# Без userns-remap: UID 1000 внутри контейнера = UID 1000 на хосте.
# После включения: UID 1000 внутри = UID 101000 на хосте (subuid offset).
# При любом kernel-CVE escape гость получит непривилегированный host UID,
# у которого нет доступа ни к /opt/vault других гостей, ни к /opt/claude-tg-bot.
#
# Известные риски и ограничения:
#   1. Docker при рестарте пересоздаёт весь imagestore под новый namespace —
#      понадобится ~6+ ГБ свободного места для копии слоёв.
#   2. На этом сервере нет других (non-claude) контейнеров, поэтому пересоздание
#      всего Docker-стейта безопасно.
#   3. userns-remap независим от ext4 prjquota — можно включать без remount.
#   4. После включения все bind-mount каталоги (/opt/vault/*) надо
#      перевести в UID 101000:101000.
#   5. --storage-opt size= продолжит работать (overlay2 + userns совместимы).
#   6. Rollback: убрать userns-remap из daemon.json, restart docker,
#      chown -R 1000:1000 /opt/vault.
#
# Использование:
#   bash v26-userns-remap-migration.sh            # реальный запуск
#   bash v26-userns-remap-migration.sh --dry-run  # только вывод, без изменений
#   bash v26-userns-remap-migration.sh --force    # пересоздать даже если уже включено
#
# Предусловия (оператор проверяет вручную до запуска):
#   1. Выполняется под root на Linux-хосте (proboi-bot, 89.167.125.175).
#   2. docker и systemctl присутствуют.
#   3. jq установлен (для безопасного merge daemon.json).
#      Если нет — скрипт создаст daemon.json с нуля или добавит userns-remap вручную.
#   4. Свободное место >= 6 ГБ (df -h /var/lib/docker).
#   5. Сделан backup vault и daemon.json (см. CLAUDE.md → «Migration: V-26 userns-remap»).
# =============================================================================

set -euo pipefail

# ---------- константы --------------------------------------------------------

DAEMON_JSON="/etc/docker/daemon.json"
VAULT_DIR="/opt/vault"
BOT_SERVICE="claude-tg-bot"
DOCKER_SERVICE="docker"
# subuid/subgid по умолчанию для dockremap: offset=100000, count=65536
# → host UID = container_uid + 100000
HOST_UID_OFFSET=100000
CONTAINER_UID=1000
HOST_UID=$(( HOST_UID_OFFSET + CONTAINER_UID ))   # 101000
HOST_GID=$HOST_UID

# ---------- режимы -----------------------------------------------------------

DRY_RUN=false
FORCE=false

for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=true ;;
    --force)   FORCE=true ;;
    *)
      echo "Использование: $0 [--dry-run] [--force]"
      exit 1
      ;;
  esac
done

# ---------- вспомогательные функции ------------------------------------------

log()  { echo "[INFO]  $*"; }
warn() { echo "[WARN]  $*"; }
err()  { echo "[ERROR] $*" >&2; }

run() {
  # Запускает команду с учётом --dry-run
  if $DRY_RUN; then
    echo "[DRY-RUN] $*"
  else
    "$@"
  fi
}

require_root() {
  if [[ $EUID -ne 0 ]]; then
    err "Скрипт должен запускаться под root (euid=$EUID)"
    exit 1
  fi
}

require_commands() {
  local missing=()
  for cmd in docker systemctl; do
    command -v "$cmd" &>/dev/null || missing+=("$cmd")
  done
  if (( ${#missing[@]} > 0 )); then
    err "Не найдены обязательные команды: ${missing[*]}"
    exit 1
  fi
}

check_storage_driver() {
  local driver
  driver=$(docker info --format '{{.Driver}}' 2>/dev/null || true)
  log "Docker storage driver: ${driver:-unknown}"
  if [[ "$driver" != "overlay2" && "$driver" != "overlay" ]]; then
    warn "Driver '$driver' может не поддерживать userns-remap полностью."
    warn "Рекомендуется overlay2. Продолжаем на свой страх."
  fi
}

check_free_disk() {
  local threshold_gb=6
  local path="/var/lib/docker"
  [[ -d "$path" ]] || path="/"
  local free_kb
  free_kb=$(df --output=avail "$path" 2>/dev/null | tail -1 || echo 0)
  local free_gb=$(( free_kb / 1024 / 1024 ))
  log "Свободное место на $path: ${free_gb} ГБ"
  if (( free_gb < threshold_gb )); then
    warn "Свободно ${free_gb} ГБ < ${threshold_gb} ГБ. userns-remap требует ~6 ГБ для пересборки слоёв."
    warn "Продолжаем, но возможна нехватка места в процессе."
  fi
}

is_userns_remap_enabled() {
  # Проверить через daemon.json (если существует) или через docker info
  if [[ -f "$DAEMON_JSON" ]]; then
    local val
    val=$(python3 -c "import json,sys; d=json.load(open('$DAEMON_JSON')); print(d.get('userns-remap',''))" 2>/dev/null || true)
    if [[ -n "$val" ]]; then
      return 0
    fi
  fi
  # Дополнительная проверка через docker info
  local info
  info=$(docker info 2>/dev/null | grep -i "userns" || true)
  if [[ -n "$info" ]]; then
    return 0
  fi
  return 1
}

# ---------- шаг 1: проверки --------------------------------------------------

log "=== V-26 Migration: Docker userns-remap ==="
$DRY_RUN && log "Режим: DRY-RUN (изменений не будет)"
$FORCE   && log "Режим: FORCE (пересоздать даже если уже включено)"

require_root
require_commands

check_storage_driver
check_free_disk

# ---------- шаг 2: проверить, уже ли включено --------------------------------

if is_userns_remap_enabled && ! $FORCE; then
  log "userns-remap уже включён в daemon.json или docker info. Выход."
  log "Чтобы принудительно пересоздать — запустите с --force."
  exit 0
fi

if is_userns_remap_enabled; then
  log "userns-remap уже включён, но запущено с --force — продолжаем."
fi

# ---------- шаг 3: список running claude-контейнеров -------------------------

log "Собираем список running claude-bot-user контейнеров..."
CLAUDE_CONTAINERS=()
while IFS= read -r cid; do
  [[ -n "$cid" ]] && CLAUDE_CONTAINERS+=("$cid")
done < <(docker ps --filter "label=claude-bot-user" --format "{{.Names}}" 2>/dev/null || true)

if (( ${#CLAUDE_CONTAINERS[@]} > 0 )); then
  log "Найдено ${#CLAUDE_CONTAINERS[@]} claude-контейнеров: ${CLAUDE_CONTAINERS[*]}"
else
  log "Нет запущенных claude-контейнеров."
fi

# ---------- шаг 4: остановить бот --------------------------------------------

log "Останавливаем сервис $BOT_SERVICE..."
if systemctl is-active --quiet "$BOT_SERVICE" 2>/dev/null; then
  run systemctl stop "$BOT_SERVICE"
  log "Сервис $BOT_SERVICE остановлен."
else
  log "Сервис $BOT_SERVICE не запущен — пропускаем stop."
fi

# ---------- шаг 5: остановить и удалить все claude-контейнеры ----------------

log "Останавливаем и удаляем claude-user-* контейнеры..."

ALL_CLAUDE_CONTAINERS=()
while IFS= read -r cid; do
  [[ -n "$cid" ]] && ALL_CLAUDE_CONTAINERS+=("$cid")
done < <(docker ps -a --filter "label=claude-bot-user" --format "{{.Names}}" 2>/dev/null || true)

if (( ${#ALL_CLAUDE_CONTAINERS[@]} > 0 )); then
  log "Удаляем контейнеры: ${ALL_CLAUDE_CONTAINERS[*]}"
  run docker rm -f "${ALL_CLAUDE_CONTAINERS[@]}"
else
  log "Нет claude-контейнеров для удаления."
fi

# ---------- шаг 6: прописать userns-remap в daemon.json ----------------------

log "Обновляем $DAEMON_JSON..."

if $DRY_RUN; then
  echo "[DRY-RUN] Добавим {\"userns-remap\": \"default\"} в $DAEMON_JSON"
else
  if command -v jq &>/dev/null; then
    # Безопасный merge через jq
    if [[ -f "$DAEMON_JSON" ]]; then
      local_backup="${DAEMON_JSON}.bak.$(date +%Y%m%d%H%M%S)"
      cp "$DAEMON_JSON" "$local_backup"
      log "Backup daemon.json → $local_backup"
      jq '. + {"userns-remap": "default"}' "$DAEMON_JSON" > "${DAEMON_JSON}.tmp"
      mv "${DAEMON_JSON}.tmp" "$DAEMON_JSON"
    else
      mkdir -p "$(dirname "$DAEMON_JSON")"
      echo '{"userns-remap": "default"}' > "$DAEMON_JSON"
    fi
  else
    warn "jq не установлен — используем python3 для merge."
    if [[ -f "$DAEMON_JSON" ]]; then
      local_backup="${DAEMON_JSON}.bak.$(date +%Y%m%d%H%M%S)"
      cp "$DAEMON_JSON" "$local_backup"
      log "Backup daemon.json → $local_backup"
      python3 - <<'PYEOF'
import json, sys
with open('/etc/docker/daemon.json') as f:
    d = json.load(f)
d['userns-remap'] = 'default'
with open('/etc/docker/daemon.json', 'w') as f:
    json.dump(d, f, indent=2)
PYEOF
    else
      mkdir -p "$(dirname "$DAEMON_JSON")"
      echo '{"userns-remap": "default"}' > "$DAEMON_JSON"
    fi
  fi
  log "daemon.json обновлён:"
  cat "$DAEMON_JSON"
fi

# ---------- шаг 7: перезапустить Docker --------------------------------------

log "Перезапускаем Docker ($DOCKER_SERVICE)..."
run systemctl restart "$DOCKER_SERVICE"

if ! $DRY_RUN; then
  # Подождать пока Docker поднимется
  local_try=0
  while ! docker info &>/dev/null; do
    (( local_try++ ))
    if (( local_try > 15 )); then
      err "Docker не поднялся за 30 секунд после рестарта."
      exit 1
    fi
    log "Ждём Docker... (попытка $local_try/15)"
    sleep 2
  done
  log "Docker запущен."
fi

# ---------- шаг 8: проверить dockremap --------------------------------------

if ! $DRY_RUN; then
  log "Проверяем dockremap user/group..."
  if id dockremap &>/dev/null; then
    log "dockremap: $(id dockremap)"
  else
    warn "Пользователь dockremap не создан автоматически. Создаём вручную..."
    # Docker при userns-remap: default должен создать dockremap сам.
    # Если не создал — это проблема на старых версиях.
    if ! getent passwd dockremap &>/dev/null; then
      useradd --system --no-create-home --shell /usr/sbin/nologin dockremap || true
      # Добавить subuid/subgid если нет
      if ! grep -q "dockremap" /etc/subuid 2>/dev/null; then
        echo "dockremap:100000:65536" >> /etc/subuid
        echo "dockremap:100000:65536" >> /etc/subgid
        log "Добавлены subuid/subgid для dockremap."
      fi
    fi
    # Перезапустить ещё раз после добавления пользователя
    systemctl restart "$DOCKER_SERVICE"
    sleep 3
  fi

  # Проверить subuid
  if grep -q "dockremap" /etc/subuid 2>/dev/null; then
    log "subuid: $(grep dockremap /etc/subuid)"
    log "subgid: $(grep dockremap /etc/subgid)"
  else
    warn "dockremap отсутствует в /etc/subuid — userns-remap может не работать."
  fi
fi

# ---------- шаг 9: chown /opt/vault ------------------------------------------

log "Меняем владельца $VAULT_DIR → $HOST_UID:$HOST_GID..."

if [[ -d "$VAULT_DIR" ]]; then
  if $DRY_RUN; then
    echo "[DRY-RUN] chown -R ${HOST_UID}:${HOST_GID} ${VAULT_DIR}/"
    echo "[DRY-RUN] Вот что изменится (первые 20 строк):"
    find "$VAULT_DIR" -maxdepth 2 | head -20 || true
  else
    run chown -R "${HOST_UID}:${HOST_GID}" "${VAULT_DIR}/"
    log "chown завершён. Проверка:"
    stat "$VAULT_DIR" | grep -E "Uid|Gid" || true
  fi
else
  warn "Каталог $VAULT_DIR не существует — пропускаем chown."
fi

# ---------- шаг 10: запустить бот --------------------------------------------

log "Запускаем сервис $BOT_SERVICE..."
run systemctl start "$BOT_SERVICE"

if ! $DRY_RUN; then
  sleep 3
  if systemctl is-active --quiet "$BOT_SERVICE"; then
    log "Сервис $BOT_SERVICE успешно запущен."
  else
    err "Сервис $BOT_SERVICE не поднялся. Проверьте: journalctl -u $BOT_SERVICE -n 50"
    exit 1
  fi
fi

# ---------- итог --------------------------------------------------------------

cat <<SUMMARY

=== Миграция завершена ===

Что сделано:
  1. Проверен Docker storage driver и свободное место.
  2. Список claude-контейнеров сохранён в памяти.
  3. Сервис $BOT_SERVICE остановлен.
  4. Все claude-user-* контейнеры удалены.
  5. userns-remap: default добавлен в $DAEMON_JSON.
  6. Docker перезапущен.
  7. dockremap user/group проверены.
  8. $VAULT_DIR chown → ${HOST_UID}:${HOST_GID}.
  9. Сервис $BOT_SERVICE запущен.
 10. Бот сам пересоздаст always-on контейнеры через containerManager.init().

Верификация:
  docker exec claude-user-<userid> id
    → ожидаем: uid=1000(user) gid=1000(user)
  stat /opt/vault/<userid>/
    → ожидаем: uid=${HOST_UID}

Rollback:
  1. Убрать "userns-remap" из $DAEMON_JSON
  2. systemctl restart docker
  3. chown -R 1000:1000 /opt/vault
  4. systemctl restart $BOT_SERVICE

SUMMARY

$DRY_RUN && log "Это был DRY-RUN — никаких изменений не произведено."
log "Готово."
