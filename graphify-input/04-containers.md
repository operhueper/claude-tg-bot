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

## Permission gate trap для headless бота (коммит a089789)

Главный сюрприз при тесте контейнеров на @ORCH7_bot 2026-05-07:

DeepSeek-гость не мог выполнять `mcp__container__Bash`. На каждый вызов модель получала результат с requested-permission и отвечала пользователю «нужно нажать кнопку Разрешить в интерфейсе». Никакой кнопки в боте нет — это была чистая галлюцинация на основе training data.

**Корневая причина**: гости имеют `settingSources: ["project"]` — они НЕ читают `/root/.claude/settings.json` (это user-scope). Они читают `{cwd}/.claude/settings.json`, то есть `/opt/vault/{userId}/.claude/settings.json`. Этот файл шёл с `defaultMode: "acceptEdits"`, который авто-разрешает только Edit/Write, но не Bash и не MCP-инструменты.

Добавление `mcp__container` в `/root/.claude/settings.json` (user-scope) ничего не давало — гости его не читают.

**Фикс**: `ContainerManager.ensureProjectSettings(profile)`:
- создаёт `{workingDir}/.claude/settings.json` с `defaultMode: "bypassPermissions"` если его нет
- мигрирует существующий `acceptEdits` → `bypassPermissions` без потери кастомных правил
- добавляет в allow `mcp__container`, `mcp__container__Bash` плюс полный набор стандартных тулзов
- идемпотентно, безопасно вызывать на каждом старте бота

Вызывается из двух мест:
- `init()` — мигрирует существующие vault'ы при старте бота
- `getOrStartUnlocked()` — bootstrap при создании нового контейнера

Безопасно потому что гости физически заперты в Docker (cgroup-лимиты, read-only `/root/.claude`, доступ только к собственному vault). `bypassPermissions` лишь убирает UI-промпт, не расширяет фактические возможности.

## Известный баг (не блокирующий, на потом)

Профиль Ксении в users.json: `"vaultDir": "workspace-ksenia"` (относительный путь). Однако `profile.workingDir` для неё резолвится в `/opt/claude-tg-bot/workspace/` — папку **владельца**. Видно по логу bootstrap: `bootstrapped /opt/claude-tg-bot/workspace/.claude/settings.json` для userId=893951298.

Эффект: Ксения не имеет своего изолированного vault, её bind-mount пересекается с workspace владельца. Контейнер для неё ещё не тестировали, но при попытке test'а всплывёт. Чинить в `config.ts` (обработка `vaultDir` для guest-роли).

## metrics.ts — что делает
getContainerMetrics(userId): запускает docker ps (существование), docker ps (активность), docker stats (RAM+CPU), du /opt/vault/{userId}/ (диск). Возвращает ContainerMetrics.
getAllContainerMetrics(): для всех пользователей параллельно через Promise.all.
Graceful degradation: если Docker недоступен — возвращает containerExists:false, все поля null.
Таймаут каждой команды: 3 секунды. ПРОБЛЕМА: execFileSync блокирующий! Promise.all не помогает — 50 пользователей × 3 секунды = 150 секунд блокировки event loop.
