# Project Knowledge Graph

> Граф строится через `/graphify graphify-input`. Этот файл — место для ручных заметок между запусками graphify.

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
