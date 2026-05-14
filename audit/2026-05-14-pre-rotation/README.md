# Security audit — 2026-05-14, pre-rotation

**Зачем:** утечка `TELEGRAM_BOT_TOKEN` через тестовый аккаунт Артём (5615267984, free-tier, без контейнера, root на хосте). Перед ротацией ключей закрыть все известные дыры единым пакетом — чтобы новые ключи не утекли через те же лазейки.

**Решение пользователя:**
- НЕ менять ключи до полной починки.
- Один сводный документ — `VULNERABILITIES.md`.
- Деплой только когда весь пакет протестирован.

## Источники

- `SECURITY_AUDIT_REPORT.md` (2026-05-08, `/proc/1/root`)
- `SECURITY_AUDIT_2026_05_10.md` (2026-05-10, `send_file`, Composio, parallel)
- `audit-out/SUMMARY.md` + `zone-*.md` (2026-05-13, ~89 находок по 9 зонам)
- Найденное сегодня (2026-05-14):
  - `free.containerEnabled = false` → 14 гостей сейчас имеют root на хосте
  - `audit-HIGH-07` (per-user inbox) сделан, но не закрывает root-доступ через Bash
  - `EnvironmentFile=/opt/claude-tg-bot/.env` в systemd unit → весь .env в process.env

## Структура

- `raw/` — сырые отчёты от агентов, по одному файлу на источник
- `VULNERABILITIES.md` — итоговый список **открытых** дыр после сверки с кодом
- `FIX_PLAN.md` — порядок фиксов (создам после VULNERABILITIES)
