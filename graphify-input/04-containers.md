# Контейнеры Docker: история и текущее состояние

## Хронология появления изоляции

До 2 мая 2026: гостей не было вообще. Ксюша была соавтором, а не гостем.
3 мая 2026 (коммит 2687033): первая файловая изоляция без Docker. Vault-папки, settingSources разделение, отдельный промпт для гостей. Bash-команды гостей всё ещё выполнялись на хосте, просто в ограниченной директории.
6 мая 2026 10:56 (коммит 92f0506): добавлен Docker. Dockerfile.user, ContainerManager, specs, invite-flow.

## Что появилось в коммите 92f0506 (1246 строк)

Новые файлы:
- Dockerfile.user — образ debian:bookworm-slim с Bun, Node 20, Python 3, nginx, dev-tools (~314MB)
- src/containers/manager.ts — ContainerManager singleton: getOrStart, exec через docker exec, пауза/стоп/удаление, idle watchdog
- src/containers/spec.ts — лимиты контейнера: 512m RAM, 1 CPU; владелец получает docker.sock
- src/containers/paths.ts — хелперы для имён контейнеров и volume'ов
- src/containers/invites.ts — хранение PendingInvite в /var/lib/claude-bot/pending/
- src/containers/metrics.ts — метрики контейнеров для дашборда

Изменения в существующих файлах:
- openrouter.ts — Bash-вызовы для containerEnabled пользователей идут через docker exec вместо хоста
- handlers/text.ts — незнакомый пользователь → инвайт + уведомление владельцу с кнопками Approve/Deny
- handlers/callback.ts — invite_approve/invite_deny кнопки

## Idle watchdog логика
- Контейнер паузируется через 15 минут неактивности
- Контейнер останавливается через 24 часа
- При следующем запросе автоматически запускается/разворачивается

## Реальное состояние на test-сервере (7 мая 2026, после коммита 769810c)

На proboi-bot (89.167.125.175):
- Docker 29.4.2 установлен и работает.
- Образ claude-user-sandbox:latest СОБРАН (1.34GB, debian:bookworm-slim).
- Контейнеров пока нет — создаются лениво при первом сообщении пользователя.
- Manual smoke test пройден: контейнер стартует, hostname отличается от хоста, /opt/vault/{userId} bind-mount синхронизирован, python3/bun/node/git/pip присутствуют.

На jinru (5.223.82.96, prod): не задеплоено пока — ждём проверки на test.

## Архитектура Bash-в-контейнере (как реализовано в 769810c)

SDK не имеет hook'а для подмены выполнения Bash. Решение через комбинацию:

1. Для гостей с containerEnabled: built-in Bash добавляется в `disallowedTools`. Модель его НЕ видит.
2. В mcp-filter.ts регистрируется in-process MCP сервер `container` с инструментом Bash. Surface name: `mcp__container__Bash`.
3. Хендлер MCP вызывает `containerManager.exec(userId, command, { cwd: profile.workingDir })` — то есть `docker exec` внутри песочницы.
4. В системный промпт гостя дописывается блок про mcp__container__Bash чтобы модель знала имя инструмента.
5. session.ts вызывает `containerManager.getOrStart(profile)` перед каждым query (lazy create / unpause), и `resetIdleTimer` после успешного завершения.

## Изменения в монтировании (769810c)

Старая схема: named volume `claude-user-{uid}-data:/workspace`. Хост видит файлы только через docker cp.

Новая схема: bind-mount `/opt/vault/{userId}:/opt/vault/{userId}` (тот же абсолютный путь). 
Read/Write/Edit на хосте и Bash в контейнере резолвят ОДИНАКОВЫЕ пути → нет двух файловых систем.
spec.ts workdir = profile.workingDir.
Named volume больше не используется.

## Артём корректный userId

Артём = 5615267984 (НЕ 403360614 — старый id был ошибкой). users.json исправлен.
TELEGRAM_ALLOWED_USERS на обоих серверах уже содержит 5615267984.

## Старые проблемы deploy (актуальны)

- metering.sqlite — rsync с --exclude metering.sqlite уже добавлен в команду деплоя.
- musl/glibc trap — после bun install нужен swap бинаря CLI (см. CLAUDE.md).

## metrics.ts — что делает
getContainerMetrics(userId): запускает docker ps (существование), docker ps (активность), docker stats (RAM+CPU), du /opt/vault/{userId}/ (диск). Возвращает ContainerMetrics.
getAllContainerMetrics(): для всех пользователей параллельно через Promise.all.
Graceful degradation: если Docker недоступен — возвращает containerExists:false, все поля null.
Таймаут каждой команды: 3 секунды. ПРОБЛЕМА: execFileSync блокирующий! Promise.all не помогает — 50 пользователей × 3 секунды = 150 секунд блокировки event loop.
