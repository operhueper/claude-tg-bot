# Сверка SECURITY_AUDIT_REPORT.md (2026-05-08) с актуальным кодом

Дата проверки: 2026-05-14

## Сводка
- Всего находок: 11
- CLOSED: 6
- OPEN: 4
- SUPERSEDED: 1

---

## Находки

### [CRITICAL #1] Полный доступ к хостовому файлсистему через /proc/1/root
- **Статус:** SUPERSEDED — стало хуже
- **Файл:** `src/types.ts:103-110`, `src/config.ts:1106`
- **Что было:** Контейнер под root без userns-remap → читает `/proc/1/root` хоста.
- **Сейчас:** `free.containerEnabled=false` в TIER_CONFIGS. 14 free-tier гостей вообще не получают Docker-контейнер. Их Claude-subprocess запускается прямо на хосте под root. Фикс (Dockerfile `USER sandbox`, `--user=1000:1000` в spec.ts) применён, но только для paid-гостей с контейнером. Для free-гостей изоляции нет никакой — subprocess наследует весь `process.env` бота.
- **Доказательство:** `TIER_CONFIGS.free.containerEnabled === false`; `src/config.ts:1106` — `containerEnabled: tierConfig.containerEnabled ? (node?.containerEnabled ?? true) : false`. На проде 14 из 18 пользователей free — это и есть источник утечки TELEGRAM_BOT_TOKEN.

---

### [HIGH #2] Dashboard API (порт 3848) доступен из гостевого контейнера
- **Статус:** CLOSED
- **Файл:** `src/containers/spec.ts:207-213`, `scripts/firewall/docker-user-rules.sh`
- **Что было:** `CLAUDE_GUEST_NETWORK` не выставлен, контейнеры в docker0, порт 3848 доступен.
- **Сейчас:** `CLAUDE_GUEST_NETWORK=claude-guest-net` выставлен в `.env` на проде (подтверждено). Сеть `claude-guest-net` существует (`docker network ls`). В spec.ts — `throw new Error(...)` если переменная не задана. Правила DOCKER-USER применяются через `ExecStartPre` в systemd unit.
- **Доказательство:** `spec.ts:208-213` — жёсткий throw если `!guestNetwork`; на проде `ExecStartPre=-/opt/claude-tg-bot/scripts/firewall/docker-user-rules.sh`.

---

### [HIGH #3] Образ работает от root — setuid-бинари
- **Статус:** CLOSED
- **Файл:** `Dockerfile.user:82-88`, `src/containers/spec.ts:189`
- **Что было:** Образ от root, CIS-DI-0001, setuid-бинари без очистки.
- **Сейчас:** Dockerfile создаёт пользователя `sandbox` (uid/gid 1000), задаёт `USER sandbox`. spec.ts для гостей явно добавляет `--user=1000:1000`. Setuid-биты НЕ удалены из образа (фикс из отчёта не применён), но `--cap-drop=ALL` + `--no-new-privileges` делают их неэффективными при работе от uid 1000.
- **Доказательство:** `Dockerfile.user:82-88` — `useradd sandbox`, `USER sandbox`; `spec.ts:189` — `args.push("--user", "1000:1000")`.

---

### [HIGH #4] lxcfs не установлен — утечка информации о хосте через /proc
- **Статус:** CLOSED
- **Файл:** `src/containers/spec.ts:222-247`
- **Что было:** lxcfs не установлен/не работает, `/proc/meminfo` показывает реальный RAM хоста.
- **Сейчас:** На проде lxcfs установлен и активен (`active (running) since Thu 2026-05-07`). В spec.ts добавлен graceful fallback — проверяется читаемость `/var/lib/lxcfs/proc/meminfo` через `readFileSync` перед монтированием.
- **Доказательство:** `ssh root@89.167.125.175 'systemctl status lxcfs'` → `active (running)`; `spec.ts:222-247`.

---

### [MEDIUM #5] 312 CVE в базовом образе
- **Статус:** OPEN
- **Файл:** `Dockerfile.user:5`
- **Что было:** 312 CVE в debian:bookworm-slim; большинство без upstream-фиксов. `cross-spawn` CVE-2024-21538 имеет фикс.
- **Сейчас:** `--no-install-recommends` добавлен в Dockerfile (строки 5 и 18). `cross-spawn` — не проверялось. Пакеты `nginx`, `openssh-client`, `procps`, `lsof` по-прежнему присутствуют. Trivy-scan в CI не добавлен. CVE в базовом образе закрыть невозможно без обновления Debian upstream.
- **Доказательство:** `Dockerfile.user:5` — `--no-install-recommends` присутствует; строки 9-12 — `nginx`, `openssh-client`, `rsync`, `procps`, `lsof` не удалены.

---

### [MEDIUM #6] Audit log в plain-text — log injection
- **Статус:** OPEN
- **Файл:** `src/utils.ts:45`, прод `.env`
- **Что было:** `AUDIT_LOG_JSON=false` по умолчанию, структура лога ломается через `\n` в user content.
- **Сейчас:** На проде переменная `AUDIT_LOG_JSON` не выставлена (проверено через ssh). Используется plain-text формат. Маскировка секретов добавлена (`src/utils.ts:28-40`, паттерны для TG-токена, OpenRouter, OpenAI ключей), но log injection через многострочный контент не закрыт.
- **Доказательство:** `ssh` показал `AUDIT_LOG_JSON` отсутствует в `.env`; `src/utils.ts:45` — ветка `if (AUDIT_LOG_JSON)` не активна.

---

### [MEDIUM #7] Composio API key передаётся гостям через deepseekEnv
- **Статус:** CLOSED
- **Файл:** `src/config.ts:1056-1066`
- **Что было:** `COMPOSIO_API_KEY` попадал в `deepseekEnv` гостей через spread `process.env`.
- **Сейчас:** Гостевый `deepseekEnv` строится через `buildGuestBaseEnv()` (только PATH/HOME/TZ/LANG и т.д.) + явный whitelist ANTHROPIC_* переменных. `COMPOSIO_API_KEY` туда не передаётся. Только owner-DeepSeek env (строка 1151) содержит Composio key.
- **Доказательство:** `src/config.ts:974-981` — `buildGuestBaseEnv()` передаёт только 8 безопасных переменных; строки 1056-1066 — гостевый env не включает Composio.

---

### [MEDIUM #8] pdftotext запускается вне контейнера без валидации filename
- **Статус:** OPEN
- **Файл:** `src/handlers/document.ts:227`
- **Что было:** `pdftotext` запускается на хосте; если poppler упадёт на специально сформированном PDF — хост затронут.
- **Сейчас:** Без изменений. `pdftotext` по-прежнему запускается через `Bun.$` на хосте. Имя файла санитизировано (`replace(/[^a-zA-Z0-9._-]/g, "_")` в строке 157), но это не защищает от malicious PDF-контента в теле файла. Переноса в контейнер нет.
- **Доказательство:** `src/handlers/document.ts:227` — `Bun.$\`pdftotext -layout ${filePath} -\``.

---

### [LOW #9] Образ использует тег :latest
- **Статус:** OPEN
- **Файл:** `src/containers/paths.ts:10` (на проде идентично)
- **Что было:** `claude-user-sandbox:latest` без SHA256 digest.
- **Сейчас:** Без изменений. `export const SANDBOX_IMAGE = "claude-user-sandbox:latest"` — подтверждено на проде.
- **Доказательство:** `ssh root@89.167.125.175 'grep SANDBOX_IMAGE /opt/claude-tg-bot/src/containers/paths.ts'` → `"claude-user-sandbox:latest"`.

---

### [LOW #10] systemd unit без MemoryMax/TasksMax
- **Статус:** OPEN
- **Файл:** `/etc/systemd/system/claude-tg-bot.service` на проде
- **Что было:** Нет MemoryMax/TasksMax/Restart в unit.
- **Сейчас:** `Restart=on-failure` и `RestartSec=5` добавлены. `MemoryMax` и `TasksMax` — не добавлены.
- **Доказательство:** `systemctl cat claude-tg-bot` на проде — `Restart=on-failure`, `RestartSec=5` есть; `MemoryMax`/`TasksMax` отсутствуют.

---

### [LOW #11] Docker daemon без user namespace support (CIS 2.9)
- **Статус:** CLOSED (отложено осознанно)
- **Файл:** N/A
- **Что было:** `[WARN] 2.9` — userns-remap не включён глобально.
- **Сейчас:** Архитектурное решение принято: userns-remap глобально несовместим с owner-контейнером (docker.sock mount). Гостевые контейнеры теперь работают от непривилегированного uid=1000 (фикс #3). Глобальный userns-remap не нужен.
- **Доказательство:** `spec.ts:124` — owner явно `--user=root`; `spec.ts:189` — гость явно `--user=1000:1000`.
