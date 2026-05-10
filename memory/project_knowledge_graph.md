# Project Knowledge Graph

> Граф строится через `/graphify graphify-input`. Этот файл — место для ручных заметок между запусками graphify.

## Состояние: 2026-05-08 после миграции автоматизаций (коммит `96bcc67`)

Граф пересчитан по seed-файлам 01–15. Размер: **162 узла, 146 рёбер, 31 сообщество** (было 117/98/28).

Seed-файлы: `graphify-input/01–15`. Визуализация: `graphify-out/graph.html`. Аудит: `graphify-out/GRAPH_REPORT.md`.

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

### Обновление 2026-05-10 (сессия security + SPEC)

**✅ ЗАКРЫТО за эту сессию (53 коммита, задеплоено на jinru):**
- Этап 0: все 17 HIGH security (S-01–S-17) + S-07b hotfix lxcfs
- Этап 2: все 22 MEDIUM security (S-18–S-39)
- Этап 8: все 14 LOW security (S-40–S-53)
- Этап 1: M-01/M-02 сняты — Anthropic модели не используются в боте вообще
- Этап 3 SPEC: skill-pack (7 рецептов в `skills/`, bootstrap, промпт, migrate-skills.ts)
- Этап 7 SPEC: web-публикация (промпт /public/ + URL)

**⏳ ЖДЁТ «ок» для деплоя на прод (89.167.125.175):**
- rsync + bun install + systemctl restart
- Добавить `include /etc/nginx/snippets/rate-limiting.conf;` в nginx.conf http{}
- Запустить `VAULT_BASE=/opt/vault bun scripts/migrate-skills.ts` для существующих гостей

**🔴 Открыто (требует решений):**
- Этапы 4-6 SPEC (scheduler, фоновые задачи, шаблон бота) — архитектурный review нужен
- Subscription gate активация (текст отказа утверждён: «вы не подписаны на @ProBoiAI — подпишитесь прежде чем мы продолжим»)
- AAAA DNS/IPv6 TLS для proboi.site
- Тарифы и ребрендинг

Архивированы (закрыто): `archive/NEXT_SESSION_FIXES_2026-05-08.md`, `archive/NEXT_SESSION_CLEANUP_2026-05-08.md`, `archive/SECURITY_AUDIT_REPORT_2026-05-08.md`.
