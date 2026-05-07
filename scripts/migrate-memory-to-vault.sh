#!/usr/bin/env bash
# Миграция памяти owner'а и Ксении в /opt/vault/
# Запускать на сервере от root. Идемпотентен — безопасно запускать повторно.
# НЕ удаляет исходные данные — только копирует. Удаление — вручную после проверки.
set -euo pipefail

# ── Проверка прав ────────────────────────────────────────────────────────────
if [[ "$(id -u)" -ne 0 ]]; then
  echo "ERROR: Скрипт должен запускаться от root." >&2
  exit 1
fi

# ── Конфигурация путей ───────────────────────────────────────────────────────
OWNER_ID="292228713"
KSENIA_ID="893951298"

OWNER_SRC="/opt/claude-tg-bot/workspace/memory/${OWNER_ID}"
OWNER_DST="/opt/vault/${OWNER_ID}/memory/${OWNER_ID}"

KSENIA_SRC="/opt/claude-tg-bot/workspace-ksenia/memory/${KSENIA_ID}"
KSENIA_DST="/opt/vault/${KSENIA_ID}/memory/${KSENIA_ID}"

KSENIA_CLAUDE_SRC="/opt/claude-tg-bot/workspace-ksenia/CLAUDE.md"
KSENIA_CLAUDE_DST="/opt/vault/${KSENIA_ID}/CLAUDE.md"

owner_files=0
ksenia_files=0

# ── Хелпер: rsync с подсчётом файлов ────────────────────────────────────────
rsync_and_count() {
  local src="$1" dst="$2" varname="$3"
  local count
  count=$(rsync -av --ignore-existing "${src}/" "${dst}/" | grep -c '^[^/].*[^/]$' || true)
  printf -v "$varname" '%d' "$count"
}

# ── 1. Owner (292228713) ─────────────────────────────────────────────────────
echo ""
echo "=== Owner ${OWNER_ID} ==="
if [[ ! -d "${OWNER_SRC}" ]]; then
  echo "  SKIP: источник ${OWNER_SRC} не существует."
else
  mkdir -p "${OWNER_DST}"
  echo "  rsync ${OWNER_SRC}/ → ${OWNER_DST}/"
  rsync_and_count "${OWNER_SRC}" "${OWNER_DST}" owner_files
  echo "  Скопировано новых файлов: ${owner_files}"
fi

# ── 2. Ксения (893951298): память ────────────────────────────────────────────
echo ""
echo "=== Ксения ${KSENIA_ID}: память ==="
if [[ ! -d "${KSENIA_SRC}" ]]; then
  echo "  SKIP: источник ${KSENIA_SRC} не существует."
else
  mkdir -p "${KSENIA_DST}"
  echo "  rsync ${KSENIA_SRC}/ → ${KSENIA_DST}/"
  rsync_and_count "${KSENIA_SRC}" "${KSENIA_DST}" ksenia_files
  echo "  Скопировано новых файлов: ${ksenia_files}"
fi

# ── 3. Ксения: CLAUDE.md ─────────────────────────────────────────────────────
echo ""
echo "=== Ксения ${KSENIA_ID}: CLAUDE.md ==="
if [[ ! -f "${KSENIA_CLAUDE_SRC}" ]]; then
  echo "  SKIP: ${KSENIA_CLAUDE_SRC} не существует."
elif [[ -f "${KSENIA_CLAUDE_DST}" ]]; then
  echo "  SKIP: ${KSENIA_CLAUDE_DST} уже есть — не перезаписываем."
else
  cp "${KSENIA_CLAUDE_SRC}" "${KSENIA_CLAUDE_DST}"
  echo "  Скопировано: ${KSENIA_CLAUDE_DST}"
  ksenia_files=$((ksenia_files + 1))
fi

# ── Итог ─────────────────────────────────────────────────────────────────────
echo ""
echo "════════════════════════════════════════════════"
echo "ИТОГ МИГРАЦИИ"
echo "════════════════════════════════════════════════"
echo "  Owner  (${OWNER_ID}): ${owner_files} файл(ов) → ${OWNER_DST}"
echo "  Ксения (${KSENIA_ID}): ${ksenia_files} файл(ов) → /opt/vault/${KSENIA_ID}/"
echo ""
echo "Исходные данные НЕ удалены. Проверьте таргет и удалите руками:"
echo "  rm -rf /opt/claude-tg-bot/workspace-ksenia/"
echo "  rm -rf /opt/claude-tg-bot/workspace/memory/"
echo ""
echo "════════════════════════════════════════════════"
echo "СЛЕДУЮЩИЕ ШАГИ"
echo "════════════════════════════════════════════════"
echo ""
echo "1. Добавить DEEPSEEK_API_KEY в /opt/claude-tg-bot/.env:"
echo "   echo 'DEEPSEEK_API_KEY=<ваш_ключ>' >> /opt/claude-tg-bot/.env"
echo "   ВНИМАНИЕ: без этого ключа бот не запустится!"
echo ""
echo "2. Проверить типы (на сервере или локально):"
echo "   cd /opt/claude-tg-bot && bun run typecheck"
echo ""
echo "3. Задеплоить:"
echo "   systemctl restart claude-tg-bot && journalctl -u claude-tg-bot -n 30 --no-pager"
echo ""
echo "Готово."
