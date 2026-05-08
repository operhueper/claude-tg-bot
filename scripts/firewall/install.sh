#!/usr/bin/env bash
# install.sh — установить claude-firewall на сервер
# Использование: sudo bash install.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SBIN="/usr/local/sbin"
SYSTEMD="/etc/systemd/system"
STATE_DIR="/var/lib/claude-firewall"
CONF_DIR="/etc/claude-firewall"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }

# ── 1. Копировать скрипты ─────────────────────────────────────────────────────

install -m 0750 "$SCRIPT_DIR/setup-firewall.sh"      "$SBIN/claude-setup-firewall.sh"
install -m 0750 "$SCRIPT_DIR/firewall-flush.sh"      "$SBIN/claude-firewall-flush.sh"
install -m 0750 "$SCRIPT_DIR/egress-monitor.sh"      "$SBIN/claude-egress-monitor.sh"
install -m 0750 "$SCRIPT_DIR/egress-reset.sh"        "$SBIN/claude-egress-reset.sh"
install -m 0750 "$SCRIPT_DIR/setup-guest-network.sh" "$SBIN/claude-setup-guest-network.sh"
log "Скрипты скопированы в $SBIN"

# ── 2. Копировать systemd unit'ы ──────────────────────────────────────────────

for UNIT in \
  claude-firewall.service \
  claude-guest-network.service \
  claude-egress-monitor.service \
  claude-egress-monitor.timer \
  claude-egress-reset.service \
  claude-egress-reset.timer; do
  install -m 0644 "$SCRIPT_DIR/$UNIT" "$SYSTEMD/$UNIT"
done
log "Unit'ы скопированы в $SYSTEMD"

# ── 3. Создать директории ─────────────────────────────────────────────────────

mkdir -p "$STATE_DIR" "$CONF_DIR"
chmod 700 "$CONF_DIR"
log "Директории: $STATE_DIR, $CONF_DIR"

# ── 4. Шаблон env-файла (если нет) ───────────────────────────────────────────

ENV_FILE="$CONF_DIR/env"
if [[ ! -f "$ENV_FILE" ]]; then
  cat > "$ENV_FILE" <<'EOF'
# Telegram Bot API — заполнить перед запуском
TELEGRAM_BOT_TOKEN=REPLACE_ME
OWNER_PROBLEM_CHANNEL_ID=REPLACE_ME
EOF
  chmod 600 "$ENV_FILE"
  log "Создан шаблон $ENV_FILE — заполните переменные!"
else
  log "$ENV_FILE уже существует, не перезаписываем"
fi

# ── 5. Активировать ──────────────────────────────────────────────────────────

systemctl daemon-reload
systemctl enable --now \
  claude-firewall.service \
  claude-guest-network.service \
  claude-egress-monitor.timer \
  claude-egress-reset.timer
log "Сервисы активированы"

echo ""
echo "Установка завершена."
echo "Проверить статус: systemctl status claude-firewall.service"
echo "Логи egress:      journalctl -u claude-egress-monitor.service -f"
echo "Суточный трафик:  cat /var/lib/claude-firewall/egress-*.byte 2>/dev/null"
echo ""
echo "ВАЖНО: заполните $ENV_FILE (токен и channel_id) для Telegram-алертов."
