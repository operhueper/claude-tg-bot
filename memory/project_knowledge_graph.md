# Project Knowledge Graph

> Граф строится через `/graphify graphify-input`. Этот файл — место для ручных заметок между запусками graphify.

## Состояние: 2026-05-08 (после `/graphify --update` на коммите `559a17d` + uncommitted)

Граф пересчитан по seed-файлам 01–14. Размер: **117 узлов, 98 рёбер, 28 сообществ** (было 84/84/21).

Seed-файлы: `graphify-input/01–14`. Визуализация: `graphify-out/graph.html`. Аудит: `graphify-out/GRAPH_REPORT.md`.

### God Nodes (топ-связность)
1. `Test Server State` — 8 рёбер
2. `src/fast-path.ts isSimpleQuery()` — 8 рёбер (uncommitted, мёртвый код — нигде не импортируется)
3. `parallel_mcp/server.ts mcp__parallel__run` — 7 рёбер
4. `buildNewGuestSafetyPrompt(userId, vaultDir)` — 6 рёбер
5. `Landing files (landing.ts + 3 asset)` — 6 рёбер
6. `Request Path (15 шагов)` — 5 рёбер
7. `Единый гостевой профиль` — 5 рёбер

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

### Server state

Прод: **proboi-bot** (89.167.125.175, @proboiAI_bot). jinru.pro заморожен как бэкап ≥7 дней. Домен proboi.site → 89.167.125.175.

## Открытые задачи

- [ ] Задеплоить uncommitted изменения (fast-path, orchestration hint, parallel mcp, модельные ограничения в промптах) на proboi-bot
- [ ] Активировать subscription gate (REQUIRED_CHANNEL_ID=@ProBoiAI + REQUIRED_CHANNEL_URL)
- [ ] Протестировать mcp__parallel на живых пользователях
- [ ] AAAA DNS/IPv6 TLS
- [ ] hf_llm_mcp — найти модель с живыми провайдерами
- [ ] openrouter.ts: execSync → async (всё ещё блокирует event loop)

## Известные баги (аудит 2026-05-08)

### Промпты (4 CRITICAL, 4 HIGH)
- **C1** [text.ts](../src/handlers/text.ts) — `buildOnboardingPrompt` определена в config.ts:727 но НЕ вызывается; маркер `[ONBOARDING_COMPLETE]` нигде не стрипается → попадает в чат как есть
- **C2** [config.ts:642-644](../src/config.ts#L642) vs [config.ts:651-653](../src/config.ts#L651) — гостевой промпт врёт: говорит «фото в /tmp/telegram-bot/», реально `inboxDirFor()` кладёт в `${vaultDir}/inbox/`
- **C3** [config.ts:559](../src/config.ts#L559) — промпт обещает `mcp__connect-google__connect`, но `connect-google` закомментирован в `mcp-config.example.ts:45-48` и не инжектируется в `mcp-filter.ts`
- **C4** [config.ts:557](../src/config.ts#L557) + [text.ts:301](../src/handlers/text.ts#L301) — гостям обещан `mcp__parallel__run` и форсится через `maybePrependOrchestrationHint`, но `parallel` не активен в mcp-config и фильтре
- **H1** [config.ts:551](../src/config.ts#L551) — промпт говорит «Bash есть», `session.ts:375-378` его блокирует для контейнерных гостей
- **H2** [config.ts:554](../src/config.ts#L554) — `WebSearch` в списке доступных, но в `disallowedTools` (config.ts:1006)
- **H3** [config.ts:404](../src/config.ts#L404) — owner на DeepSeek получает обещание WebSearch без оговорки
- **H4** [config.ts:414-418](../src/config.ts#L414) — owner-промпт жёстко зашит на `/opt/claude-tg-bot/workspace/`, не использует `allowedPaths[0]`

### Метеринг (3 HIGH, 3 MEDIUM)
- **H1** [session.ts:680-681](../src/session.ts#L680) — `askUserTriggered` break до `event.type === "result"` → токены за все ask-user туры теряются
- **H2** [session.ts:478-480](../src/session.ts#L478) — `stopRequested` break без записи lastUsage → прерванные запросы не учитываются
- **H3** [memory/analyzer.ts:131](../src/memory/analyzer.ts#L131) — фоновый SDK `query()` каждые 6 ходов и при /new вообще не вызывает `recordUsage`
- **M1** [session.ts:706](../src/session.ts#L706) — `model` берётся из `profile.model`, не из `event.model` SDK-ответа
- **M2** [openrouter.ts:765](../src/engines/openrouter.ts#L765) — тихий пропуск без лога если usage не пришёл
- **M3** [metering.ts:56-72](../src/metering.ts#L56) — `claude-haiku-4-5` (модель анализатора памяти) отсутствует в `PRICING_PER_1M` → `$0.00`

## Открытые задачи

- [ ] **Метеринг — починить ask-user/stop/analyzer пропуски** (систематическая потеря токенов в самых горячих ветках)
- [ ] **Промпты — починить C1–C4 + H1–H4** (модель уверенно делает не то)
- [ ] Задеплоить uncommitted изменения (fast-path, orchestration hint, parallel mcp, модельные ограничения в промптах) на proboi-bot
- [ ] Активировать subscription gate (REQUIRED_CHANNEL_ID=@ProBoiAI + REQUIRED_CHANNEL_URL)
- [ ] Протестировать mcp__parallel на живых пользователях
- [ ] AAAA DNS/IPv6 TLS
- [ ] hf_llm_mcp — найти модель с живыми провайдерами
- [ ] openrouter.ts: execSync → async (всё ещё блокирует event loop)
