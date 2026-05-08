#!/usr/bin/env bash
# setup-guest-network.sh — изолированная Docker-сеть для гостевых контейнеров.
#
# Создаёт сеть claude-guest-net (bridge с интернетом) и iptables-правила,
# которые блокируют доступ из этой сети к локальным портам бота на хосте:
#   - 22   (SSH)
#   - 3847 (health-webhook)
#   - 3848 (dashboard API)
#
# Гости остаются с интернетом (npm, curl, git clone), но не могут достучаться
# до хоста и провести pivot к API владельца. Закрывает HIGH из аудита 2026-05-08.
#
# Идемпотентно: повторные запуски ничего не ломают.
# Запускать: sudo bash setup-guest-network.sh
set -euo pipefail

GUEST_NET_NAME="claude-guest-net"
GUEST_BRIDGE="claude-guest0"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }

# ── 1. Docker network ─────────────────────────────────────────────────────────

if ! docker network inspect "$GUEST_NET_NAME" &>/dev/null; then
  docker network create \
    --driver bridge \
    --opt "com.docker.network.bridge.name=$GUEST_BRIDGE" \
    "$GUEST_NET_NAME"
  log "Создана сеть $GUEST_NET_NAME (bridge=$GUEST_BRIDGE)"
else
  log "Сеть $GUEST_NET_NAME уже существует, пропускаю create"
fi

# ── 2. iptables: блокировка доступа из гостевой сети к хостовым портам ───────
#
# Трафик контейнер → хостовый IP попадает в цепочку INPUT (адресован самому
# хосту), а не в FORWARD (тот для трафика, идущего «через» хост наружу).
# Поэтому правил в DOCKER-USER (которая хукается через FORWARD) недостаточно —
# нужно ставить блок в INPUT с фильтром по входному интерфейсу $GUEST_BRIDGE.

ensure_drop_rule() {
  local dport="$1"
  local comment="$2"

  if ! iptables -C INPUT \
      -i "$GUEST_BRIDGE" \
      -p tcp --dport "$dport" \
      -m comment --comment "$comment" \
      -j DROP &>/dev/null; then
    iptables -I INPUT 1 \
      -i "$GUEST_BRIDGE" \
      -p tcp --dport "$dport" \
      -m comment --comment "$comment" \
      -j DROP
    log "DROP -i $GUEST_BRIDGE -> host:$dport ($comment)"
  fi
}

ensure_drop_rule 22   "claude-guest-block-ssh"
ensure_drop_rule 3847 "claude-guest-block-health"
ensure_drop_rule 3848 "claude-guest-block-dashboard"

log "setup-guest-network.sh завершён успешно"
