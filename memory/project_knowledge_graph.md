# Project Knowledge Graph

> Граф строится через `/graphify graphify-input`. Этот файл — место для ручных заметок между запусками graphify.

## Состояние: 2026-05-14 (EOD) — Security hardening ЗАВЕРШЁН, ключи ротированы, ветка смержена

### Итог дня
- Ветка `feature/legal-docs-consent-gate` смержена в `main`, запушена на GitHub
- 27 security-фиксов (V--2..V-34) задеплоены на prod + jinru
- Ротация ключей полностью завершена: TG, OpenAI, OpenRouter, DeepSeek×5, Composio
- V-1B: chmod 600 на users.json + metering.sqlite
- V-30D: basic auth на design.proboi.site (admin / [пароль в голове у Евгения])
- V-31: подтверждено — покрыт V-01 (FREE_DISALLOWED_TOOLS)
- Репо очищен от стале-файлов (10 root-MD + 23 raw audit файлов удалены)
- **Следующий этап:** `docs/arch-migration-rf-db.md` — миграция ПДн на RF-сервер (242-ФЗ), там же P2-фиксы (V-29,V-30,V-35..V-39)

---

## Состояние: 2026-05-14 — Consent Gate + DeepSeek Pool + Legal Docs (всё в проде)

### Новые фичи в этом пакете (ветка feature/legal-docs-consent-gate, задеплоена на prod)

#### 1. Consent Gate (commit 8c62b1d)
- **`src/consent.ts`**: SQLite-хранилище согласий в `metering.sqlite`, `DOC_VERSION="2026-05-14"`. При смене версии все старые согласия инвалидируются.
- **`src/handlers/consent-gate.ts`**: gate-сообщение с 3 ссылками (Оферта, Политика, Соглашение) + кнопка «✅ Принимаю условия».
- **`src/index.ts`**: middleware блокирует ВСЁ (кроме `/start` и callback `consent_accept`) до получения согласия. Это первый барьер перед авторизацией.
- **`src/handlers/callback.ts`**: обработчик `consent_accept` записывает согласие, удаляет gate-сообщение, пробрасывает в `handleStart`.
- **`/forget`**: дополнительно вызывает `revokeConsent(userId)`.

#### 2. DeepSeek Key Pool (commit 12233f2)
- **`src/deepseek-key-pool.ts`**: least-busy pool selector — выбирает ключ с наименьшим in-flight count (tie-break по `lastUsedMs`). Lazy load из `system/deepseek-keys.json`, fallback на `DEEPSEEK_API_KEY` env.
- **`system/deepseek-keys.json`**: 5-6 DS ключей, gitignored, per-host.
- **`src/session.ts`**: `withDeepSeekPoolKey()` обёрнут вокруг main query loop, compactIfNeeded и runBackgroundAnalysis; release в finally на каждом пути.
- **Routing**: гости снова через native DeepSeek API (`api.deepseek.com/anthropic`), НЕ через OpenRouter. OR sub-keys provisioning удалён из `callback.ts`.
- На проде при старте: `[deepseek-pool] Loaded 6 DeepSeek key(s)`.

#### 3. Юридические документы (commit 8c62b1d)
- **`src/templates/oferta.ts`**: 16 разделов, лимит ответственности 2000 ₽, рекуррент с notice-box, ЗоЗПП ст. 32, AI-disclaimer, претензионный порядок 30 дней.
- **`src/templates/privacy.ts`**: 14 разделов, 152-ФЗ, 5 категорий данных с правовыми основаниями, явное согласие на трансграничную передачу (ст. 12 ч. 4 п. 1).
- **`src/templates/terms.ts`** (новый): 10 разделов, 5 подразделов запретов, жёсткий блок ответственности за контейнер.
- **Реквизиты**: ИП Энбом Ксения Игоревна, ИНН 631609033320, ОГРНИП 324632700187012, Самара. АО «ТБанк».
- **`legal/`**: внутренние документы ПДН (`polozhenie_pdn.md`, `prikaz_otvetstvennyy_pdn.md`).

#### 4. Что ОСТАЛОСЬ (не закрыто)
- **Ротация ключей**: TELEGRAM_BOT_TOKEN (BotFather), OPENAI_API_KEY, OPENROUTER_API_KEY + PROVISIONING_KEY, DEEPSEEK keys (пул), COMPOSIO_API_KEY.
- **P2 (~35 пунктов V-07..V-39)**: reliability и мелочи — отдельная сессия.
- **V--1 filter-repo**: владелец отказался от переписывания истории (после ротации токены станут бесполезны).
- **YuKassa IP whitelist**: расширение диапазона — нет reconciliation job и `/check`.
- **Consent gate ещё не тестировался с новыми пользователями** — при первом реальном onboarding после деплоя убедиться, что gate работает корректно.

---

## Состояние: 2026-05-14 — Pre-rotation security pack ЗАДЕПЛОЕН на PROD + jinru

### Деплой

Пакет 25 коммитов (3e0b1d6..fc6edb8) ветка `feature/legal-docs-consent-gate`.

**jinru (5.223.82.96, @ORCH7_bot):** code + image rebuild + V-26 migration + smoke V-01 ОК. Контейнеры пересозданы лениво. Storage driver на jinru сменился с **overlayfs → overlay2** автоматически после `systemctl restart docker` в рамках V-26.

**prod (89.167.125.175, @proboiAI_bot):** те же шаги. Vault 3.9G (19 юзеров, 3 paid). Backup: `.env.bak-20260514-074918`, `users.json.bak-…`, `metering.sqlite.bak-…`, `/opt/vault.bak-20260514-074918`. 3 paid контейнера были удалены и пересоздаются при следующем сообщении каждого юзера.

### Verify-snapshot обоих серверов

| Свойство | jinru | proboi-bot |
|---|---|---|
| Storage driver | overlay2 (после рестарта) | overlay2 |
| userns-remap | enabled, dockremap uid=111 | enabled, dockremap uid=108 |
| Vault ownership | 101000:101000 | 101000:101000 |
| Bun 3847 (health) | n/a (HEALTH_SECRET не задан) | 127.0.0.1 |
| Bun 3848 (dashboard) | 127.0.0.1 | 127.0.0.1 |
| Bun 3849 (notify) | 172.18.0.1 | 172.18.0.1 |
| iptables V-22 packets | 3 (metadata access blocked) | 0 |
| Sandbox digest | sha256:5ebde1979… | sha256:f6d97dca… |

### Что осталось (НЕ закрыто в этом пакете)

- **V--1 filter-repo**: владелец отказался от переписывания истории (после ротации ключей сами по себе токены в коммитах станут бесполезны).
- **P2 (~35 пунктов V-07..V-39)**: reliability и мелочи, отдельная сессия.
- **Ротация ключей** (всё ещё впереди): TELEGRAM_BOT_TOKEN на @BotFather, OPENAI_API_KEY, OPENROUTER_API_KEY + OPENROUTER_PROVISIONING_KEY, DEEPSEEK_API_KEY (5-key pool в system/deepseek-keys.json), COMPOSIO_API_KEY.

### Защитный посох на ходу

- 1 сторонний эксфильт-тест на jinru от Артёма дал отказ (V-01 работает).
- 0 утечек /etc/, /opt/ — Bash/Read/Write/Edit заблокированы для free.
- Контейнеры свежие (новый sandbox image со всеми security-патчами в Dockerfile.user).
- На случай регрессии — backup vault и .env существуют на обоих хостах.

---

## Состояние: 2026-05-14 — Pre-rotation security hardening (ветка feature/legal-docs-consent-gate) — HISTORY

### Что сделано за сессию 2026-05-14 — пакет security-фиксов перед ротацией ключей

**Триггер:** утечка `TELEGRAM_BOT_TOKEN` через free-гостя Артём (5615267984) — `cat /opt/claude-tg-bot/.env` под root на хосте. 14 из 18 пользователей могли повторить. См. `audit/2026-05-14-pre-rotation/`.

**Стратегия:** закрыть все известные дыры со старыми ключами одним пакетом, ротация — в самом конце. Без деплоя до явного подтверждения. См. `memory/security_audit_2026_05_14.md`.

**23 атомарных коммита (3e0b1d6..b30fba9), все в `feature/legal-docs-consent-gate`:**

| Зона | Уязвимости | Файлы |
|---|---|---|
| Git history | V--1 untrack users.json | `.gitignore`, `system/users.json` |
| Notify-bridge / Webhook | V--2 source IP, V-00 IP-bypass, V-1A retry-dedup | `src/dashboard-server.ts`, `src/payments.ts`, `src/metering.ts` |
| Free-tier модель | V-01 disallowedTools, V-05 pdftotext в контейнере | `src/config.ts`, `src/session.ts`, `src/handlers/document.ts` |
| Nginx | V-04 X-Frame, V-30A CSP `/u/`, V-30B TLS 1.2+, V-30C rate-limit | `scripts/nginx/snippets/`, `sites-available/*.conf` |
| Memory injection | V-02 zod+escape, V-1J reply-to sanitize | `src/memory/inject.ts`, `src/memory/graph.ts`, `src/handlers/text.ts` |
| Path/Shell hardening | V-06 execFile, V-1G path traversal, V-25 daemon-runner cmd | `src/handlers/document.ts`, `scripts/daemon-runner/main.go` |
| Resource limits | V-1C voice duration, V-23 parallel maxItems, V-1I cwd allowlist, V-20 cgroup slice, V-24 quota TTL+storage | `src/handlers/voice.ts`, `parallel_mcp/server.ts`, `src/containers/spec.ts`, `vault-quota.ts`, `scripts/systemd/claude-guests.slice` |
| Network isolation | V-1D Bun bind 127.0.0.1, V-21 inter-container DROP, V-22 metadata DROP | `src/dashboard-server.ts`, `src/index.ts`, `scripts/firewall/docker-user-rules.sh` |
| Cross-user storage | V-1H pollinations per-user | `pollinations_mcp/server.ts`, `src/config.ts` |
| State cleanup / DoS | V-32 deleteUser cleanup, V-33 session.kill, V-34 /api rate-limit + docker stats cache | `src/user-registry.ts`, `src/handlers/commands.ts`, `src/session.ts`, `src/dashboard-server.ts` |
| Supply chain | V-30G Bun pin, V-30H sandbox digest TODO | `Dockerfile.user`, `src/containers/paths.ts` |
| Dashboard frontend | V-30I CSP meta, V-30J href scheme, V-30K caption truncate, V-30L editMessage catch | `src/templates/user-dashboard.ts`, `src/handlers/streaming.ts`, `src/handlers/voice.ts` |
| Metering / Logs / Alerts | V-30M OR request-id dedup, V-30N audit-log warn, V-30O suspicious-cmd alerts, V-30P watchdog docs | `src/engines/openrouter.ts`, `src/config.ts`, `src/owner-alerts.ts`, `CLAUDE.md` |
| Privilege gates | V-31 closed by V-01 (free=без Bash) | — |

**ОСТАЛОСЬ ВРУЧНУЮ (требует подтверждения деплоя):**

- `git filter-repo --path system/users.json --invert-paths` + force-push (V--1, переписать историю)
- На проде: `chmod 600 system/users.json metering.sqlite* .env` (V-1B)
- В прод-`.env`: `AUDIT_LOG_JSON=true`, `GUEST_BRIDGE_IP=172.18.0.1`, опционально `DOCKER_STORAGE_OPT=size=3G`
- Systemd: `sudo cp scripts/systemd/claude-guests.slice /etc/systemd/system/ && systemctl daemon-reload`
- ExecStartPre: добавить chmod 600 для `users.json`/`metering.sqlite` в systemd-юнит
- Применить iptables правила (через `ExecStartPre=-/opt/claude-tg-bot/scripts/firewall/docker-user-rules.sh` уже настроено)
- `nginx -T` сверить с репо, скопировать `ssl-params.conf` в `/etc/nginx/snippets/`, reload nginx
- Получить и применить sha256 digest для `claude-user-sandbox` (V-30H)
- V-26 (userns-remap) — отложено, требует отдельного согласования (пересоздание всех контейнеров)
- Ротация: TELEGRAM_BOT_TOKEN, OPENAI_API_KEY, OPENROUTER_API_KEY, DEEPSEEK_API_KEY (пул), COMPOSIO_API_KEY — только после smoke-теста пакета

**P2 (~35 пунктов) — V-07..V-39: reliability и мелочи, отдельная сессия.**

---

## Состояние: 2026-05-13 — Reliability hardening задеплоен на PROD

### Что сделано за эту сессию (2026-05-13) — таймауты, OR субключи, memory cap

**Коммит 05c76d6** — fix: reliability — request timeouts, per-user OR keys, DeepSeek V4 Flash

**Причина:** 12 мая бот дважды падал с OOM (1.3 ГБ и 1.6 ГБ RAM). Один зависший DeepSeek-запрос (Гоша, Google Sheets) блокировал всех пользователей.

**Что сделано:**

1. **Таймаут OpenRouter/DeepSeek fetch** (`src/engines/openrouter.ts`):
   - `AbortSignal.any([userAbort, AbortSignal.timeout(90_000)])` на основной fetch
   - 30с на Pollinations и служебные fetch

2. **Таймаут Claude Code subprocess** (`src/session.ts`):
   - `setTimeout(600_000)` → `abortController.abort()` — 10 минут максимум на query
   - `clearTimeout` в finally, существующий catch обрабатывает как чистый abort

3. **Per-user OpenRouter субключи** (новый `src/openrouter-provisioning.ts`):
   - `createGuestSubKey(userId, label)` → `POST https://openrouter.ai/api/v1/keys`
   - При approve гостя — автоматом создаётся ключ с лимитом $2
   - Ключ хранится в `users.json`, гость использует свой ключ (fallback на общий OR key)
   - Env vars: `OPENROUTER_PROVISIONING_KEY`, `OPENROUTER_GUEST_LIMIT_USD=2.0`

4. **Модель: deepseek/deepseek-v4-flash** (OpenRouter формат, 1M контекст):
   - Новые гости создаются сразу с этой моделью (`callback.ts`)
   - Существующие гости с `model: "deepseek-chat"` мигрируют автоматически при OR-роутинге (`config.ts`)

5. **Memory cap 1024 МБ** (на сервере):
   - `/etc/systemd/system/claude-tg-bot.service.d/memory.conf`
   - `Environment=NODE_OPTIONS=--max-old-space-size=1024`
   - Применено на проде без рестарта — активно с текущего запуска

**На проде (89.167.125.175):**
- OPENROUTER_API_KEY обновлён на новый ключ
- OPENROUTER_PROVISIONING_KEY = тот же ключ
- Бот перезапущен, статус active

---

## Состояние: 2026-05-12 — containerEnabled bugfix задеплоен на PROD

### Что сделано за эту сессию (2026-05-12) — hotfix контейнеров

**Коммит 10c83d0** — fix: containerEnabled per-user setting takes priority over tier config:

**Найденный баг:**
- `TIER_CONFIGS.free.containerEnabled = false` перебивал явный `containerEnabled: true` в `users.json` для всех free-тир гостей
- Логика `tierConfig.containerEnabled ? (node?.containerEnabled ?? true) : false` всегда давала `false` для free-тира
- Последствия: Claude CLI exit code 1 (MCP `mcp__container__Bash` не загружался, но промпт ссылался на него), `python3 -c` BLOCKED через fallback на host Bash

**Исправление (config.ts:1159):**
- Было: `tierConfig.containerEnabled ? (node?.containerEnabled ?? true) : false`
- Стало: `node?.containerEnabled ?? tierConfig.containerEnabled`
- Per-user настройка теперь приоритетнее тир-дефолта

**Что было диагностировано дополнительно:**
- `/pay`, `/cancel` — команды ЕСТЬ на проде, зарегистрированы в `baseCommands`; отсутствие в меню у Ксении — кеш Telegram (закрыть/открыть чат)
- YuKassa webhooks: отклоняются IP `103.232.213.234` и `77.75.154.206` — вне разрешённого CIDR, возможно YuKassa расширил диапазон

---

## Состояние: 2026-05-12 — UX hardening задеплоен на PROD (proboi-bot)

### Что сделано за эту сессию (2026-05-12) — UX аудит + хардининг

**Коммит e562cb0** — UX hardening (задеплоен на proboi-bot 89.167.125.175):

**Исправлено по результатам аудита 4 агентов (баги, UX, JTBD, resilience):**
- `commands.ts`: `/resume` — убраны итальянские строки (it-IT → ru-RU), дата/время по-русски
- `commands.ts`: кнопка «Оформить Профи» в `/pay` (trial used path) — мёртвая ссылка → callback `pay_upgrade`
- `invites.ts`: «Доступ закрыт» → дружелюбное приветствие с объяснением что такое бот
- `voice.ts`: все 4 английских error message → русские; кнопка лимита → callback; добавлено время сброса
- `text.ts`: утечка блокировки (releaseUserLock/releaseContainerSlot) при rate-limit + isRunning ранних return
- `text.ts`: кнопка лимита → callback `pay_upgrade`; добавлено «Лимит обновится в полночь по Москве»
- `text.ts`: онбординг-приветствие теперь показывается при ПЕРВОМ ТЕКСТЕ (не только /start)
- `video.ts`: полная перезапись — Whisper вместо сломанного Gemini-vision; daily limit; per-user lock; русские сообщения
- `tasks.ts`: catch в chargeRecurring теперь уведомляет пользователя + логирует ошибку
- `index.ts`: `process.on('uncaughtException')` + `process.on('unhandledRejection')` — процесс не падает молча

**Что осталось (не исправлено в этой сессии):**
- YuKassa missed webhook — нет reconciliation job и self-service `/check` команды
- `/subscribe?status=success` URL — ведёт на заглушку (нет страницы успеха)
- `addUser` в user-registry.ts — неатомарная запись для новых пользователей
- `callback.ts (plan_confirm)` — нет acquireUserLock при выполнении плана (race condition)
- IP check пропускается если x-forwarded-for пустой (webhook security)
- `/status` слишком технично для обычных пользователей

**Аудит проведён:** 4 независимых агента (bug hunt, user journey, JTBD, resilience) по всему коду бота.

---

## Состояние: 2026-05-12 — Claude Code Features (5 фич) задеплоены на TEST (jinru)

### Что сделано за эту сессию (2026-05-12) — Claude Code Features

**Коммит 9d61473** — Ф2 Todo-list + Ф1 Plan Mode:
- `TodoMarkerParser` + `PlanMarkerParser` в `session.ts` — line-buffer парсинг маркеров в тексте стрима
- `StreamingState.todoMsgId` + `todoItems` + `renderTodoList()` в `streaming.ts` — отдельное Telegram-сообщение с ◻/⏳/✅
- `statusCallback("todo_init" | "todo_update")` — новые типы событий
- Plan Mode: `pendingPlan` поле в `ClaudeSession`, abort при PLAN_END, показ с inline кнопками (✅/❌/✏️)
- `callback.ts`: handlers plan_confirm / plan_cancel / plan_clarify
- `config.ts`: блоки ПЛАН и МАРКЕРЫ ПРОГРЕССА добавлены во все системные промпты (owner/guest/group)

**Коммит 633c634** — Ф3 Компакция + Ф5 Redirect + Ф4 /memory /forget:
- `compactIfNeeded()` в `session.ts`: если `input_tokens > 80% лимита` → DeepSeek суммаризует 20 последних turn'ов → `sessionId = null` (новая сессия SDK) → summary инжектируется в system prompt
- `lastPartialResponse` в `ClaudeSession`: при abort накапливает `currentSegmentText` для redirect
- `checkInterrupt()` в `utils.ts` → возвращает `InterruptResult` с `isRedirect` + `redirectMessage`
- `text.ts`: redirect flow — 600ms задержка → читает partial response → строит redirect message → fire new query
- `/memory` и `/forget` команды в `commands.ts`: показывает knowledge graph (buildMemoryContext) / удаляет файлы памяти
- Обе команды добавлены в `baseCommands` + `GUEST_COMMANDS`

**Деплой**: rsync → jinru (5.223.82.96, @ORCH7_bot), `systemctl restart` ✅, 12 base / 13 owner команд

### Ключевые открытия при ревизии roadmap

- **Ф4 (Память)** — ядро уже было реализовано: `src/memory/` с knowledge graph (nodes/edges/goals/achievements). Добавлены только UI-команды /memory и /forget
- **Ф3 (Компакция)** — roadmap описывал манипуляцию `messages[]` в session file, но SDK хранит историю внутри, доступна только через session_id. Реализована через reset sessionId + summary в system prompt
- `profile.sessionFile` — хранит только session_id метаданные, НЕ messages[]

### Технический долг / follow-up

- Тестирование на реальных сессиях: план-маркеры и todo-маркеры нужно проверить на обеих моделях (DeepSeek + Claude)
- Компакция: порог 50K токенов для гостей (DeepSeek 64K лимит), может требовать калибровки
- Plan Mode: `pendingClarification` поле — простая реализация, не сохраняет текст плана в clarify-flow
- Todo-парсер: буферизует по строкам, маркеры внутри одной строки без \n не распознаются (намеренно)
- `analyzeSession` bug на jinru (TypeError: undefined is not an object) — pre-existing, не связан с новыми фичами

---

## Состояние: 2026-05-11 — YuKassa-фаза ВЫПОЛНЕНА, задеплоено на TEST (jinru)

11 коммитов сегодня (волны 1-4 + security fixes). Бот `@ORCH7_bot` активен на jinru.

### Что сделано за эту сессию (2026-05-11)

**Волна 1 (параллельно):**
- `chore: remove stale docs` — удалены UNIFIED_ROADMAP, SPEC_PROMISE_DELIVERY, SECURITY_AUDIT, graphify-input/out/, archive/
- `feat: YuKassa types + UserNode fields` — `YuKassaPayment`, `YuKassaWebhookEvent` в types.ts; новые поля `payment_method_id`, `trial_used`, `trial_activated_at`, `day4_push_sent`, `grace_period_until` в UserNode (user-registry.ts)
- `feat: guide page /how-to-setup` — 22k chars, 12 секций «до/после», badge-pro, sticky CTA
- `feat: legal pages` — `src/templates/oferta.ts` (renderOferta) + `src/templates/privacy.ts` (renderPrivacy), плейсхолдеры ОГРНИП/ИНН

**Волна 2:**
- `feat: YuKassa payment flow` — `src/payments.ts` полностью переписан: `sendYuKassaBindingLink`, `handleYuKassaWebhook`, `activateSubscription`, `downgradeToFree`, `chargeExpiredTrials` (в tasks.ts), `/cancel` команда
- `feat: webhook + subscribe routes` — `POST /webhook/yukassa`, `GET /subscribe?status=`, `GET /oferta`, `GET /privacy` в dashboard-server.ts

**Волна 3:**
- `feat: daily limit gate + free doc gate` — `isDailyLimitReached`/`getDailyUsage`/`incrementDailyUsage` + `hasFreeDocUsed`/`markFreeDocUsed`; text.ts + voice.ts + document.ts с upsell CTA
- `feat: guide links + /cancel + dashboard` — кнопка guide в /start, /info, /status, dashboard; callback handlers для cancel_subscription; /cancel в baseCommands + config

**Волна 4:**
- `test: unit tests` — 30 тестов (payments.test.ts + daily-limit.test.ts), 100% pass
- SCALING_NOTES.md + TESTING_CHECKLIST.md (не закоммичены — анализ)

**Security fixes (post-review):**
- `fix: security hardening` — 6 CVE закрыты:
  - CRIT-2: cancel callback теперь очищает payment_method_id
  - CRIT-1: webhook верифицирует платёж через GET /payments/{id} перед активацией
  - HIGH-1: `ipInCidr` строгая 4-octet валидация
  - HIGH-2: YuKassa error logs санитизированы (без тела ответа)
  - HIGH-3: webhook проверяет userId в реестре перед активацией
  - LOW-1: `randomUUID()` вместо `Math.random()` для idempotency keys

### Не выполнено / следующая сессия

**Обязательно перед PROD:**
- Добавить `YUKASSA_SHOP_ID` в `.env` на обоих серверах
- Заполнить ОГРНИП/ИНН в oferta.ts + privacy.ts после получения реквизитов банка
- Добавить `YUKASSA_IP_CHECK=false` в .env на jinru (тест — IP check отключить для тестирования)
- Провести ручное тестирование по TESTING_CHECKLIST.md (сценарии 1-13)

**Технический долг (из SCALING_NOTES.md):**
- `vault-quota.ts:62` — `execFileSync("du")` → async (блокирует event loop на cold start)
- Upgrade jinru с 1 vCPU/1.9GB до минимум 2 vCPU/4GB перед 50+ пользователями
- DeepSeek 429-retry при общем ключе и 20+ concurrent users
- Persist daily limit counter в SQLite (сейчас теряется при рестарте)

**Бэклог (из ROADMAP.md):**
- `/council` как Telegram-команда для Профи
- `/skills` + bootstrap при создании vault
- Backup vault rsync cron
- AAAA DNS/IPv6 TLS для proboi.site

Seed-файлы удалены после задачи 1. Следующий graphify — после выполнения волны 4.

### God Nodes (топ-связность)
1. `daemon-runner (Go PID 1 надсмотрщик)` — 12 рёбер ⬆ новое
2. `Test Server State` — 8 рёбер
3. `src/fast-path.ts isSimpleQuery()` — 8 рёбер (uncommitted, мёртвый код)
4. `parallel_mcp/server.ts mcp__parallel__run` — 7 рёбер
5. `buildNewGuestSafetyPrompt(userId, vaultDir)` — 6 рёбер
6. `.daemons.yaml manifest` — 6 рёбер ⬆ новое
7. `scripts/firewall/egress-monitor.sh` — 6 рёбер ⬆ новое
8. `Landing files (landing.ts + 3 asset)` — 6 рёбер
9. `Request Path (15 шагов)` — 5 рёбер
10. `Единый гостевой профиль` — 5 рёбер

### Новые гиперрёбра
- **Стек надсмотрщика:** image + daemon-runner + manifest + watcher
- **Egress pipeline:** setup → monitor → reset через systemd
- **Цепочка алертов:** alert-bot → owner-alerts → problem channel

### Новый кластер: «Always-on автоматизации» (seed 15)

`15-daemons-always-on.md` — переход на постоянные slot'ы пользователя. Ключевые узлы: daemon-runner (Go PID 1), .daemons.yaml manifest, crashloop event, hasActiveDaemons (pause/stop skip), notifyProblemChannel, scripts/firewall/*, scripts/monitoring/cpu-monitor.sh, OFERTA_DRAFT.md. Связан с кластерами «Алерты и мониторинг» и «Прод-сервер и деплой».

## Что изменилось с 2026-05-07

### Новые кластеры (seed-файлы 09–14)

**09-composio-google.md** — Composio OAuth для Google Workspace. Миграция с MCP-сервера v1 (e3008da4) на v2 (6e3516f8, 146 тулзов без GMAIL_FETCH_EMAILS). Команда /google удалена, заменена на mcp__connect-google — Claude сам вызывает тул, бот шлёт OAuth-кнопки. Протокол Gmail в оба промпта.

**10-parallel-mcp.md** — bundled parallel_mcp/server.ts: `mcp__parallel__run` для DeepSeek-сессий вместо Task. Детектор `maybePrependOrchestrationHint` в text.ts (6 правил, uncommitted). Промпт-блок с примером.

**11-fast-path-deepseek.md** — fast-path: `isSimpleQuery()` в src/fast-path.ts + `queryDeepSeekFast()` в src/engines/deepseek-fast.ts. Для простых разговорных запросов обходит Claude CLI (10-15 сек экономии). Uncommitted, не задеплоен.

**12-subscription-gate.md** — src/subscription.ts: гейт подписки на @ProBoiAI с кешем 5 мин. Написан, не активирован (REQUIRED_CHANNEL_ID не задан).

**13-idle-heartbeat-and-prompts.md** — IdleHeartbeat (15с тишины → фраза из idle-phrases.ts, 10с интервал), анонс плана в промптах, блоки DeepSeek-ограничений (vision, pip, пути), выпиленный онбординг, owner на DeepSeek, дневной счётчик в дашборде.

**14-landing-proboi.md** — новый лендинг proboi.site (коммит 3c046db): 17 секций, 3163 строк, маршруты /how-to-setup и /assets/*.

### Обновлённые seed-файлы

**01-users-and-access.md** — убрана секция про Ксению-special-case (удалена в d1b5c41), добавлен invite-флоу (9d17b04), subscription gate, выпиленный онбординг (f575052), owner на DeepSeek.

**02-guest-prompt.md** — полностью переписан: новые MCPs (container, google-workspace, connect-google, parallel), все промпт-блоки 2026-05-07/08, mcp__parallel__run вместо Task.

**06-unfinished-and-risks.md** — landing закрыт; добавлены пункты 7 (subscription gate), 8 (fast-path не задеплоен), 9 (parallel не тестирован); prod-задачи актуализированы.

### Ключевые новые модули (с 2026-05-07)

| Файл | Назначение |
|---|---|
| `src/composio.ts` | OAuth helpers для Composio Google |
| `src/mcp-filter.ts` | инжект google-workspace для owner и guest |
| `src/subscription.ts` | гейт подписки |
| `src/fast-path.ts` | детектор простых запросов |
| `src/engines/deepseek-fast.ts` | прямой REST к DeepSeek без CLI |
| `src/idle-phrases.ts` | 130 heartbeat-фраз |
| `connect_google_mcp/server.ts` | MCP дроп-бокс для OAuth |
| `parallel_mcp/server.ts` | MCP параллельной оркестрации |
| `src/templates/landing.ts` | лендинг proboi.site (1188 строк) |
| `src/templates/assets/` | CSS/JS лендинга (3 файла, 1975 строк) |

### Что изменилось в containers

- `--init` (tini) для всех гостевых контейнеров (коммит 3f63b8e): reap zombie-дочерей
- LXCFS: 7 /proc/... bind-mount для cgroup-aware free/top (512 MB виден как лимит, не 7.6 GB хоста)
- mcp__connect-google и mcp__parallel добавлены в авто-мердж allow-листа (manager.ts)
- `python-is-python3` добавлен в образ (2026-05-10): команда `python` теперь работает наравне с `python3`; промпт гостя обновлён

### Изменения 2026-05-11

**spec.ts:** `buildRunArgs(opts?: { skipLxcfs? })` — новый параметр для отключения lxcfs-монтов.

**manager.ts (getOrStartUnlocked):**
- При `docker run` с ошибкой "not a directory"/"lxcfs" → rm -f контейнер → retry `buildRunArgs(skipLxcfs: true)`.
- При `docker start` (stopped state) с той же ошибкой → rm -f → fall through к create.
- Причина: ядро `6.8.0-90` (jinru) не разрешает bind-mount lxcfs-файлов поверх `/proc` в `--read-only` контейнере. На проде (`6.8.0-71`) проблемы нет, но фикс там страхует при обновлении ядра.

**session.ts:** убраны `statusCallback("tool", "Access denied: …")` и `statusCallback("tool", "BLOCKED: …")` — теперь только `console.warn`, пользователь не видит технических сообщений.

**config.ts (buildNewGuestSafetyPrompt):** при недоступности `mcp__container__Bash` Claude пишет «Рабочая среда сейчас недоступна, попробуй через минуту» вместо технических объяснений.

**Гейт подписки (subscription.ts):**
- На проде активен: `REQUIRED_CHANNEL_ID=@ProBoiAI`, `REQUIRED_CHANNEL_URL=https://t.me/ProBoiAI`.
- Позитивный кеш 5 мин (подписан), негативный 1 мин (не подписан).
- Кнопка «Я подписался» → инвалидирует кеш мгновенно.
- На jinru не активирован (переменная не задана).

### Server state

Прод: **proboi-bot** (89.167.125.175, @proboiAI_bot). jinru — тест-сервер (`@ORCH7_bot`). Домен proboi.site → 89.167.125.175.

## Открытые задачи

- [ ] Задеплоить uncommitted изменения (fast-path, orchestration hint, parallel mcp, модельные ограничения в промптах) на proboi-bot
- [ ] ~~Активировать subscription gate~~ ✅ уже активен на проде
- [ ] Протестировать mcp__parallel на живых пользователях
- [ ] AAAA DNS/IPv6 TLS
- [ ] hf_llm_mcp — найти модель с живыми провайдерами
- [ ] openrouter.ts: execSync → async (всё ещё блокирует event loop)

## Известные баги (аудит 2026-05-08)

### Промпты — Этап 1 SPEC_PROMISE_DELIVERY закрыт 2026-05-09 (коммит `41aab2d`)
- ✅ **C1 ЗАКРЫТ** — `buildOnboardingPrompt` удалён, поле `onboardingComplete` выпилено из `UserProfile`/`UserNode`/`addUser`, `markOnboardingComplete` удалена. Онбординг был выпилен ранее в `f575052`, мёртвый код снесён.
- ✅ **C2 ЗАКРЫТ** — блок про `/tmp/telegram-bot/` уже отсутствовал (был удалён ранее), осталась только корректная секция МЕДИА с `${vaultDir}/inbox/`.
- ✅ **H1 ЗАКРЫТ** — `Bash → mcp__container__Bash` в списке инструментов, добавлен явный блок «ТЫ В КОНТЕЙНЕРЕ» в начало промпта с реальным составом окружения.
- ✅ **H2 ЗАКРЫТ** — упоминание Bash заменено на `mcp__container__Bash` в подсказке WebFetch. WebSearch уже был помечен как недоступный.
- 🟡 **C3** — `connect-google` АКТИВЕН на проде в `mcp-config.ts` (проверено 2026-05-09); пункт уже не актуален.
- 🟡 **C4** — `parallel` АКТИВЕН на проде в `mcp-config.ts` (проверено 2026-05-09); пункт уже не актуален.
- ❌ **H3** — owner на DeepSeek всё ещё получает обещание WebSearch. Откладываем (не блокер для гостевого UX).
- ❌ **H4** — хардкод `/opt/claude-tg-bot/workspace/` в owner-промпте. Откладываем.

### Метеринг (3 HIGH, 3 MEDIUM)
- **H1** [session.ts:680-681](../src/session.ts#L680) — `askUserTriggered` break до `event.type === "result"` → токены за все ask-user туры теряются
- **H2** [session.ts:478-480](../src/session.ts#L478) — `stopRequested` break без записи lastUsage → прерванные запросы не учитываются
- **H3** [memory/analyzer.ts:131](../src/memory/analyzer.ts#L131) — фоновый SDK `query()` каждые 6 ходов и при /new вообще не вызывает `recordUsage`
- **M1** [session.ts:706](../src/session.ts#L706) — `model` берётся из `profile.model`, не из `event.model` SDK-ответа
- **M2** [openrouter.ts:765](../src/engines/openrouter.ts#L765) — тихий пропуск без лога если usage не пришёл
- **M3** [metering.ts:56-72](../src/metering.ts#L56) — `claude-haiku-4-5` (модель анализатора памяти) отсутствует в `PRICING_PER_1M` → `$0.00`

## Открытые задачи (см. UNIFIED_ROADMAP.md)

### Обновление 2026-05-10 (сессия security + SPEC + прод-деплой)

**✅ ЗАКРЫТО за эту сессию (56 коммитов, всё задеплоено на прод 89.167.125.175):**

- Этап 0: все 17 HIGH security (S-01–S-17) + S-07b hotfix lxcfs
- Этап 2: все 22 MEDIUM security (S-18–S-39)
- Этап 8: все 14 LOW security (S-40–S-53)
- Этап 1: M-01/M-02 сняты — Anthropic модели не используются в боте
- Этап 3 SPEC: skill-pack (7 рецептов в `skills/`, bootstrap, промпт, migrate-skills.ts)
- Этап 7 SPEC: web-публикация (промпт /public/ + URL)
- Этап 4 SPEC: Go scheduler daemon (5.2 MB linux/amd64, notify-bridge port 3849, maxDaemons=5)
- Этап 5 SPEC: .daemons.yaml bootstrap, промпты РАСПИСАНИЕ + ДОЛГИЕ ЗАДАЧИ
- Этап 6 SPEC: migrate-scheduler.ts, skills/background_tasks.md, skills/create_telegram_bot.md
- **Прод-деплой**: rsync ✅ → bun install ✅ → systemctl active ✅ → docker rebuild ✅ → migrate-scheduler ✅ (13 вольтов обработано)

**🔴 Открыто (требует решений):**
- Subscription gate активация (текст отказа утверждён: «вы не подписаны на @ProBoiAI — подпишитесь прежде чем мы продолжим»; нужен REQUIRED_CHANNEL_ID)
- AAAA DNS/IPv6 TLS для proboi.site
- Тарифы и ребрендинг (Бесплатный/Базовый/Профи/Студия)
- Метеринг баги H1/H2/H3 (потери токенов при ask-user, stop, memory analyzer)
- fast-path (uncommitted, src/fast-path.ts + src/engines/deepseek-fast.ts)
- S-03: параллельные подагенты без sandbox (parallel_mcp — нужен investigation)
- openrouter.ts execSync → async (блокирует event loop)

Архивированы (закрыто): `archive/NEXT_SESSION_FIXES_2026-05-08.md`, `archive/NEXT_SESSION_CLEANUP_2026-05-08.md`, `archive/SECURITY_AUDIT_REPORT_2026-05-08.md`.
