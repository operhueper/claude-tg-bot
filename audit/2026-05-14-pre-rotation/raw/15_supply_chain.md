# Supply-Chain & Build-Time Security Audit

Date: 2026-05-14  
Scope: package.json, Dockerfile.user, deploy scripts, systemd unit, prod server state

---

## SC-00. `system/users.json` не в .gitignore — зафиксирован в git

- **Где:** `.gitignore` (локально и на проде), `git log system/users.json` на проде
- **Факт:** `.gitignore` содержит только `system/deepseek-keys.json`. Файл `system/users.json` **не исключён**. Git-история на проде (`git ls-files system/`) показывает, что файл уже коммитился в прошлом (коммит `346f5b9`, `e3fc11e`, `d1b5c41` и др.) и сейчас лежит как untracked-modified (`D system/users.json` в `git status`). На проде `users.json` мировой 644.
- **Что внутри:** PII всех пользователей (Telegram ID, имена, подписочный статус, payment_method_id YooKassa, subscription_expires, tier, invited_by). Публикация в git-репозиторий = постоянная утечка PII даже после ротации ключей.
- **Severity:** HIGH (уже частично зафиксировано в V-1B как права 644, но gitignore-аспект новый)
- **Фикс:** добавить `system/users.json` в `.gitignore`; проверить что в remote-репозитории (если есть) нет истории с этим файлом (BFG/git-filter-repo); `chmod 600 /opt/claude-tg-bot/system/users.json` на проде.

---

## SC-01. `package.json` — нет postinstall хуков, но `bun install` без `--frozen-lockfile` в CLAUDE.md

- **Факт:** `package.json` не содержит `preinstall`/`postinstall`/`install` scripts. Все прямые зависимости проверены на проде через обход `node_modules` — **ни одного hook-скрипта не найдено** (ни в flat, ни в scoped пакетах). `grammy` имеет `prepare: "npm run backport"`, но это dev-only hook, не срабатывает при `bun install`.
- **Остаток риска:** `bun install` без `--frozen-lockfile` в инструкции деплоя (CLAUDE.md rsync-команда) и в `scripts/deploy-jinru.sh` использует `--frozen-lockfile`, но прямой деплой через rsync + `bun install` в CLAUDE.md — без флага. Если `bun.lock` рассинхронизирован, bun обновит пакет до нового SemVer-совместимого release с потенциально вредоносным postinstall.
- **Severity:** LOW (сейчас нет hooks, но паттерн небезопасный)
- **Фикс:** добавить `--frozen-lockfile` в rsync+bun-install команду в CLAUDE.md.

---

## SC-02. Bun установлен через `curl | unzip` без проверки хеша

- **Где:** `scripts/bootstrap-proboi.sh:77-83`
- **Факт:** Bun скачивается как `bun-linux-x64.zip` с `github.com/oven-sh/bun/releases/latest/download/` без проверки SHA256 или GPG подписи. На проде `/usr/local/bin/bun` (sha256: `b29d78892abd5a9398e0700f0cb602f725089602ed1a5082d681c7257b2bf4d0`, v1.3.13). Скрипт в Dockerfile.user использует `curl -fsSL https://bun.sh/install | bash` — pipe-to-shell без проверки.
- **Что внутри Dockerfile:** `RUN curl -fsSL https://bun.sh/install | bash` — classic pipe-to-shell. Если bun.sh скомпрометирован или CDN MITM — выполнится произвольный код при `docker build`. Аналогично для nodesource: `curl -fsSL https://deb.nodesource.com/setup_20.x | bash -`.
- **Severity:** MEDIUM (срабатывает только при пересборке образа, но образ `latest` без тега — см. SC-04)
- **Фикс:** закрепить версию (`BUN_VERSION=1.x.y`), скачивать конкретный release URL, проверять SHA256 из официального `releases/bun-linux-x64.zip.sha256`.

---

## SC-03. Docker image `claude-user-sandbox:latest` — только локальный, без digest pinning

- **Где:** `src/containers/paths.ts` (упоминается в V-19 VULNERABILITIES.md как `:latest` без SHA256)
- **Факт на проде:** `docker images` показывает `claude-user-sandbox:latest` sha256 `472d89e26210...`. Образ **локальный** (нет docker registry pull, `docker auth config` пуст). Кто угодно с доступом к `/var/run/docker.sock` (группа `docker` или root) может пересобрать образ командой `docker build -t claude-user-sandbox:latest -f Dockerfile.user .` — и все новые контейнеры будут использовать подменённый образ.
- **Кто имеет доступ к docker.sock:** `/var/run/docker.sock` принадлежит группе `docker` (gid=988). Бот работает как root — root может всё. Гости работают в контейнере без docker.sock — вектор не прямой. Но через V-01 (Bash от root) гость может выполнить `docker build` сам.
- **Severity:** MEDIUM (усиливается V-01)
- **Фикс:** после каждой пересборки закрепить digest в `paths.ts`: `claude-user-sandbox@sha256:472d89e2...`; либо сохранить image ID и при старте контейнера проверять `docker inspect --format={{.Id}}`.

---

## SC-04. Dockerfile.user: финальный `USER sandbox` корректен, но pip без hash

- **Факт:** Dockerfile.user строка 88 — `USER sandbox`. Docker inspect подтверждает: `User: sandbox`. Это корректно — контейнер стартует от UID 1000, не root.
- **Риск pip:** строка 41-47 — `pip3 install --no-cache-dir --break-system-packages openpyxl pandas numpy ...` — без `--require-hashes` и без `requirements.txt` с закреплёнными версиями. При пересборке образа пакеты разрезолвятся на latest PyPI release.
- **Severity:** LOW (pip без hash) — MEDIUM (если часто пересобирают)
- **Фикс:** зафиксировать версии через `requirements.txt` с `pip-compile --generate-hashes`.

---

## SC-05. rsync без `--delete` — мёртвые файлы остаются на проде

- **Где:** CLAUDE.md деплой-команды, `scripts/deploy-jinru.sh:14-26`
- **Факт:** ни одна rsync-команда не содержит `--delete`. `grep -r "\-\-delete" scripts/` → ничего.
- **Следствие:** если локально удалить файл (например старый handler с уязвимостью), на сервере он останется и бот продолжит его загружать (`import` в TypeScript). Это позволяет «зомби»-коду оставаться активным без обнаружения.
- **Пример:** был удалён `scripts/backfill-openrouter-subkeys.ts` с секретами? Он до сих пор на проде, если не чистили вручную.
- **Severity:** MEDIUM
- **Фикс:** добавить `--delete` к rsync-командам деплоя. Или перейти на git pull на сервере.

---

## SC-06. `system/users.json` не исключён из rsync

- **Где:** CLAUDE.md (rsync-команда), `scripts/deploy-jinru.sh`
- **Факт:** в CLAUDE.md явно написано «⚠️ Never rsync `system/users.json`» и объяснена причина. Однако `--exclude system/users.json` **отсутствует в обеих rsync-командах**. Это ручная дисциплина, не техническая защита.
- **Риск:** случайный `rsync ./ root@...:/opt/claude-tg-bot/` с локальным `system/users.json` (который может быть пустым или устаревшим) затрёт продакшн базу пользователей и сотрёт платные подписки.
- **Severity:** HIGH (data loss при человеческой ошибке)
- **Фикс:** добавить `--exclude system/users.json` в rsync-команды в CLAUDE.md и `deploy-jinru.sh`.

---

## SC-07. `mcp-config.ts` gitignored, но на проде 644 и доступен для чтения

- **Где:** `/opt/claude-tg-bot/mcp-config.ts` на проде
- **Факт:** файл gitignored (корректно), на проде `stat: 644 UNKNOWN staff`. Содержит MCP-конфигурацию с потенциальными API ключами (COMPOSIO, OpenRouter URLs с токенами). При V-01 (Bash от root) любой free-гость может прочитать `mcp-config.ts` и получить дополнительные ключи.
- **Severity:** LOW-MEDIUM (зависит от содержимого; усиливается V-01)
- **Фикс:** `chmod 600 /opt/claude-tg-bot/mcp-config.ts`; убедиться что ключи в .env, а не hardcoded в mcp-config.ts.

---

## SC-08. `bun.lock` принадлежит UID 1001 (не root) с правами 644

- **Где:** `/opt/claude-tg-bot/bun.lock` на проде
- **Факт:** `stat -c "%a %U %G" bun.lock` → `644 UNKNOWN UNKNOWN` (UID 1001 без записи в passwd). Значит файл создан другим пользователем (возможно sync с jinru где был другой UID).
- **Риск:** если кто-то получит write-доступ к UID 1001 (или через bun install с `--no-save`) — может подменить lockfile. При следующем `bun install` без `--frozen-lockfile` бот получит другие версии зависимостей.
- **Severity:** LOW (теоретический)
- **Фикс:** `chown root:root /opt/claude-tg-bot/bun.lock && chmod 644 bun.lock`.

---

## SC-09. `metering.sqlite` мировой 644 (дублирует V-1B, подтверждён на проде)

- **Факт:** `ls -la /opt/claude-tg-bot/metering.sqlite` → `-rw-r--r-- 1 root root 114688`. Любой пользователь на хосте может прочитать финансовую статистику (токены, стоимость, userId).
- **Severity:** MEDIUM (дублирует V-1B из VULNERABILITIES.md, не новая дыра — подтверждение)
- **Фикс:** `chmod 600 /opt/claude-tg-bot/metering.sqlite`.

---

## SC-10. `bun install` race — рестарт во время установки

- **Где:** CLAUDE.md деплой-команды: `bun install && systemctl restart claude-tg-bot`
- **Факт:** `bun install` атомарно заменяет `node_modules`, но если `systemctl restart` запустит бот пока `bun install` ещё пишет файлы — бот может загрузить частично обновлённый модуль.
- **Severity:** LOW-MEDIUM (reliability, не security)
- **Фикс:** `systemctl stop claude-tg-bot && bun install --frozen-lockfile && systemctl start claude-tg-bot` (остановить до install).

---

## SC-11. Bun `minimumReleaseAge = 604800` в bunfig.toml — хорошая практика

- **Факт:** `bunfig.toml` содержит `[install] minimumReleaseAge = 604800` (7 дней). Это снижает риск supply-chain атаки через «hour-zero» зловредный пакет — bun не установит пакет моложе 7 дней.
- **Оценка:** POSITIVE control, не уязвимость.

---

## SC-12. `@anthropic-ai/claude-agent-sdk` сильно отстаёт от latest

- **Факт:** `bun outdated` на проде: текущая версия `0.1.76`, latest `0.2.132`. Разрыв в `0.1.x` → `0.2.x` (мажорный минор). SDK может содержать security-исправления.
- **`openai` SDK:** `6.15.0` vs `6.36.0` (+21 minor releases). OpenAI SDK использует для Whisper и OpenRouter; CVE в OpenAI SDK при обработке ответов маловероятны, но обновление желательно.
- **Severity:** LOW-MEDIUM
- **Фикс:** обновить зависимости через `bun update`, запустить typecheck, тест на dev перед деплоем.

---

## Резюме новых находок

| ID | Severity | Суть |
|---|---|---|
| SC-00 | HIGH | `system/users.json` не в .gitignore, исторически коммитился |
| SC-01 | LOW | `bun install` без `--frozen-lockfile` в CLAUDE.md деплое |
| SC-02 | MEDIUM | `curl \| bash` при Bun и Node установке в Dockerfile без hash |
| SC-03 | MEDIUM | `claude-user-sandbox:latest` без digest pin, пересборка = подмена |
| SC-04 | LOW | pip без `--require-hashes` в Dockerfile |
| SC-05 | MEDIUM | rsync без `--delete` — мёртвые файлы остаются на проде |
| SC-06 | HIGH | `system/users.json` не исключён из rsync — риск data-loss |
| SC-07 | LOW-MEDIUM | `mcp-config.ts` права 644, может содержать ключи |
| SC-08 | LOW | `bun.lock` принадлежит UID 1001 не root |
| SC-09 | MEDIUM | `metering.sqlite` 644 (подтверждение V-1B) |
| SC-10 | LOW | race при `bun install` + `systemctl restart` одной командой |
| SC-12 | LOW | claude-agent-sdk 0.1.76 vs latest 0.2.132 (+openai 6.15 vs 6.36) |

### Критичные для ротации ключей

**SC-06** — `system/users.json` не исключён из rsync → при следующем деплое может быть затёрт. Добавить `--exclude system/users.json` немедленно.

**SC-00** — `system/users.json` не в .gitignore → если появится git remote, PII утечёт. Добавить в .gitignore немедленно.

### Dockerfile финальный USER

Подтверждено: `USER sandbox` (UID 1000) — корректно. Не уязвимость.
