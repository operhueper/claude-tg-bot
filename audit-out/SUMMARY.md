# Полный аудит бота — сводный отчёт

Дата: 2026-05-13
Аудит: 7 параллельных агентов (3 на Opus, 4 на Sonnet), по одной зоне на агента.
Скоуп: весь функционал @proboiAI_bot — auth, sandbox, sessions, metering, MCP, handlers, engines.

## Executive Summary

В целом архитектура **надёжная**: per-user изоляция через `getSession`, sandbox с `--cap-drop=ALL` + `--read-only` + `--user 1000:1000`, HMAC по спецификации Telegram, prepared statements в SQLite, `replyFriendly` во всех catch-блоках, drop-box файлы scoped по userId. Это правильно сделано.

Но найдено **5 critical / 19 high / 31 medium / 27 low** проблем (всего ~89 находок). Главные риски не в контейнере, а в **хостовой части бота** — там где Node-процесс читает/пишет файлы по командам модели без жёсткой валидации, и в **lifecycle ресурсов** (heartbeat-таймеры, container slots, session files).

**Самые опасные** (фиксить в первую очередь):
1. Гость читает `/root/.claude/projects/*` — утечка чужих сессий и токенов (Z2-#1)
2. `mcp__container__Bash` обходит `checkCommandSafety` — fork-bomb внутри контейнера (Z2-#2)
3. `IdleHeartbeat` течёт в 5 из 6 хендлеров (voice/audio/photo/document/video) — память растёт на каждый зафейленный запрос (Z3-F1)
4. `recordUsage` дублирует биллинг на retry — пользователь платит x2 за неудачный запрос (Z3-F2)
5. `addUser` пишет в users.json без atomic — двойной approve теряет одного гостя (Z1-F1)

---

## Severity totals по зонам

| Zone | Critical | High | Medium | Low | Info |
|------|----------|------|--------|-----|------|
| 1 — Auth + invite + subscription | 0 | 3 | 6 | 3 | — |
| 2 — Sandbox + firewall | **2** | 4 | 6 | 4 | 2 |
| 3 — Session + streaming + abort | **3** | 7 | 6 | 3 | — |
| 4 — Metering + dashboard + HMAC | 0 | 0 | 3 | 4 | 3 |
| 5 — MCP integrations | 0 | 0 | 1 | 3 | 1 |
| 6 — Handlers | 0 | 3 | 5 | 7 | — |
| 7 — Engines + vision | 0 | 2 | 4 | 3 | — |
| **Итого** | **5** | **19** | **31** | **27** | **6** |

---

## Critical (5) — фиксить немедленно

| # | Где | Проблема | Зона |
|---|-----|----------|------|
| C1 | `src/session.ts:914-921` | Гость может `Read /root/.claude/projects/*` — утечка чужих сессий, transcripts, OAuth-state | Z2 |
| C2 | `src/containers/bash-mcp.ts:50` + `session.ts:896` | `mcp__container__Bash` принимает любую команду без `checkCommandSafety` — fork-bomb / DoS своему vault | Z2 |
| C3 | `src/handlers/{voice,audio,photo,document,video}.ts` | `IdleHeartbeat` setInterval/setTimeout утекают на error path во всех хендлерах кроме `text.ts` | Z3 |
| C4 | `src/session.ts:1136-1150` + `handlers/text.ts:333-394` | `recordUsage` записывается в `finally` каждой попытки retry — двойная списанная стоимость | Z3 |
| C5 | `src/request-queue.ts:23-40` | `acquireUserLock` chain или dead, или сломает invariant если другой caller забудет `isUserBusy()` — silent skew | Z3 |

---

## High (19) — фиксить на этой неделе

### Безопасность и валидация (Z2)
- **Z2-#3** `src/security.ts:127` — `checkCommandSafety` lexical, обходится `'r''m' -rf /`, heredoc, eval+base64, `bash$IFS-c`
- **Z2-#4** `src/session.ts:914-916` — `TEMP_PATHS /tmp/telegram-bot/` shared, гость через Read достаёт чужие загрузки
- **Z2-#5** `src/security.ts:129-131` — substring без word-boundary; `arm -rf /` ложно сматчится, `r m -rf /` уходит мимо
- **Z2-#6** `src/security.ts:135-148` — `rm`-парсер ломается на quoted paths, `--`, `$HOME/../`, heredoc

### Auth и rate-limit (Z1)
- **Z1-F1** `src/user-registry.ts:155` — `addUser` использует `writeFileSync` вместо `writeUsersAtomic` — race при двойном approve
- **Z1-F2** `src/index.ts:113-157` — subscription gate не покрывает invite path и web_app/payments callbacks
- **Z1-F3** `src/handlers/text.ts:254-263` — `addPendingContext` сохраняет текст до rate-limit, обходит лимит

### Session lifecycle (Z3)
- **Z3-F4** `src/utils.ts:290-297` — `checkInterrupt` 100ms sleep слишком короткий, новый запрос идёт параллельно с умирающим subprocess
- **Z3-F5** `src/handlers/text.ts:361-392` — sub-request в pending-context drain создаёт второй `StreamingState`, double-cleanup
- **Z3-F6** `src/handlers/commands.ts:457-482` — `/restart` без user-lock, два concurrent `/restart` гоняются на pgrep
- **Z3-F7** `src/containers/vault-quota.ts:47-78` — `execFileSync("du", "-sb")` блокирует event loop на 1-5 секунд каждые 60 сек
- **Z3-F8** `src/session.ts:776-781,806-812` — hard-timeout 10min дропает `lastPartialResponse`
- **Z3-F9** `src/session.ts:660-664` — `disallowedTools` не содержит `BashOutput` / `KillShell`
- **Z3-F10** `src/session.ts:1288` — session-file write не атомарен, SIGKILL посреди записи теряет историю

### Handlers (Z6)
- **Z6-F1** `src/handlers/audio.ts:215-228` — `releaseContainerSlot` может утечь между acquire и rate-limit branch
- **Z6-F2** `src/handlers/voice.ts:133-135` — `stopProcessing()` вызывается дважды (на ранний return + в finally)
- **Z6-F3** `src/handlers/video.ts:161-168` — early return обходит uniform cleanup

### Engines (Z7)
- **Z7-F1** `src/metering.ts:63-79` + `src/config.ts:1044-1048` — нет цен для `deepseek/deepseek-v4-flash` и `deepseek/deepseek-r1`, `computeCost()` = $0 → бесплатный учёт для text-fallback гостей
- **Z7-F2** `src/session.ts:581-597` + `src/engines/openrouter.ts:557` — двойной 90-сек таймаут в vision

---

## Cross-cutting темы (системные паттерны)

### 1. Хост-FS path validation не выдерживает adversarial input
`isPathAllowedFor` (Z2-#13) + `checkCommandSafety` (Z2-#3, #5, #6) построены на substring/regex, обходятся quoted args, heredoc, env-expansion. Внутри контейнера эти проверки **вообще пропускаются** (C2). **Решение:** перейти на `shell-quote.parse()` + token-level allowlist бинарей, добавить `checkCommandSafety` в `bash-mcp.ts`.

### 2. Atomic-write нарушается в нескольких местах
- `addUser` (Z1-F1)
- session-file (Z3-F10)
- `ensureProjectSettings` (Z2-#9 — settings.json гостя в writable vault)
- `CLAUDE.md` гостя (Z2-#10 — bootstrap только если не существует, не валидирует)

Паттерн `writeUsersAtomic` уже существует — его нужно применить везде.

### 3. Lifecycle ресурсов асимметричен между хендлерами
Только `text.ts` корректно чистит `IdleHeartbeat` (C3). Только `voice.ts` явно вызывает `stopProcessing` (двойной call, Z6-F2). `video.ts` использует early return минуя cleanup (Z6-F3). **Решение:** один helper `runWithStreaming(ctx, fn)` который владеет lifecycle и применяется во всех хендлерах.

### 4. Cost-accounting имеет 3 разных дыры
- Double-billing на retry (C4, Z3-F2)
- Missing prices для DeepSeek-on-OpenRouter (Z7-F1) — silent $0
- Per-turn usage overwrite вместо аккумуляции (Z3-F15)
- Vision metering пропускается если OpenRouter не вернул `usage` (Z7-F3)
- Vault `du -sb` не записывается в метрики

### 5. Subscription gate не покрывает все entry points
Middleware пропускает только `subscription:check` (Z1-#9). Pay_upgrade callback, web_app dashboard, invite-флоу — все проходят без проверки. Если требование подписки продуктовое — нужно вынести гейт в общий middleware и проверять перед каждым action, а не только перед сообщениями.

### 6. Кэши и cache-инвалидация
- `vault-quota` cache 60s + нет invalidation (Z2-#8, Z3-F7) — гость пишет 20GB между проверками
- `UserRegistry._cache` ленив, может разойтись с диском (Z1-F6)
- `subscription` cache без rate-limit на recheck (Z1-#9)
- `NEW_GUEST_USERS` mutable global, push на каждый незнакомый ID → утечка памяти (Z1-F6)

### 7. Config drift между example и prod
- `mcp-config.example.ts` ≠ `mcp-config.ts` (Z5-F5)
- `NEW_GUEST_USERS` env vs hardcoded fallback (Z1-F7)
- Двойственная owner-модель: hardcoded `OWNER_USER_ID` vs `role: "owner"` (Z1-F4)
- `DASHBOARD_ALLOW_MOCK` не документирован в `.env.example` (Z4-F4)

---

## Recommended fix order (этапы)

### Этап 1 — критические дыры безопасности (1-2 дня)
1. **C1** — закрыть `/root/.claude/projects/*` для гостей (one-liner в `session.ts:914-921`)
2. **C2** — добавить `checkCommandSafety` в `bash-mcp.ts:50` перед `containerManager.exec`
3. **Z2-#9, #10** — settings.json и CLAUDE.md гостя положить в read-only bind-mount (`/var/lib/claude-bot/users/<id>/`)
4. **Z2-#1, Z6-F5** — убрать `/tmp/telegram-bot/` и `/tmp/pollinations/` из общих TEMP_PATHS, namespacing per user

### Этап 2 — стабильность runtime (3-5 дней)
5. **C3** — вынести `IdleHeartbeat` lifecycle в helper `runWithStreaming`, использовать во всех хендлерах
6. **C4, Z7-F1, Z3-F15** — переделать metering: добавить `request_id`, `recordUsage` только на success path или с idempotency-ключом, добавить цены для всех моделей
7. **Z3-F7** — `vault-quota` через `execFile` (async), либо kernel project quota
8. **Z1-F1, Z3-F10** — atomic write для `addUser` и session-file через rename pattern

### Этап 3 — auth и rate-limit (2-3 дня)
9. **Z1-F2** — subscription gate в общий middleware, покрыть pay_upgrade и web_app
10. **Z1-F3** — rate-limit перед `addPendingContext`, ограничить размер очереди
11. **Z2-#3, #5, #6** — перевести `checkCommandSafety` на shell-quote token parsing
12. **Z3-F6, Z3-F4** — `/restart` под user-lock, `checkInterrupt` ждать `signal observed` вместо 100ms sleep

### Этап 4 — code quality (по мере) 
13. Унифицировать owner-model (только через registry)
14. Убрать hardcoded fallback в `NEW_GUEST_USERS`
15. `mcp-config.example.ts` синхронизировать с prod
16. Documentation: `.env.example` дополнить отсутствующими переменными
17. **Z4-F2, F3** — порт 3849 в firewall, YuKassa webhook через `remoteAddress` а не `x-forwarded-for`
18. Composite index на `usage(user_id, ts)` (Z4-F5)

---

## Ссылки на детальные отчёты

- [zone-1-auth.md](./zone-1-auth.md) — auth, invite, subscription gate
- [zone-2-sandbox.md](./zone-2-sandbox.md) — sandbox, firewall, isolation
- [zone-3-session.md](./zone-3-session.md) — session, streaming, abort
- [zone-4-metering.md](./zone-4-metering.md) — metering, dashboard, HMAC
- [zone-5-mcp.md](./zone-5-mcp.md) — MCP integrations
- [zone-6-handlers.md](./zone-6-handlers.md) — message handlers
- [zone-7-engines.md](./zone-7-engines.md) — engines, vision pipeline

Каждый отчёт содержит конкретные file:line, объяснение почему это баг, и diff-уровневые рекомендации по фиксу.
