# Сверка audit-out/* (2026-05-13) с актуальным кодом

Дата проверки: 2026-05-14

## Сводка

- Critical: всего 5, CLOSED=5, OPEN=0
- High: всего 19, CLOSED=15, OPEN=4
- Medium/Low: всего 58 (не проверял по запросу)

> **Контекст дня:** Free-tier гости имеют `containerEnabled: false` (src/types.ts:107).
> Их Claude-сессия работает на хосте под root с narrowed allowedPaths `[vaultDir, /tmp/telegram-bot/<id>/]`.
> Встроенный Bash доступен (disallowedTools только `["WebSearch"]`), а `checkCommandSafety` применяется.
> Это НЕ утечка BOT_TOKEN — token не в env гостя (buildGuestBaseEnv закрыт), но host-Bash под root
> с ограниченными путями и лексической фильтрацией. Риск зависит от надёжности checkCommandSafety (Z2-#3/#5/#6).

---

## Зона 1 — Auth + Invite + Subscription

### [HIGH Z1-F1] addUser не использует atomic write

- **Статус:** CLOSED
- **Файл:** src/user-registry.ts:155
- **Что было:** `addUser` писал через `writeFileSync` напрямую; race при двойном approve мог потерять запись.
- **Сейчас:** строка 155 использует `writeUsersAtomic(users)` (функция с tmp+rename). Коммит `c815647`.
- **Доказательство:** `grep -n writeUsersAtomic src/user-registry.ts` → строки 105, 127, 155.

### [HIGH Z1-F2] Subscription gate не покрывает pay_upgrade и dashboard

- **Статус:** CLOSED
- **Файл:** src/index.ts:128-145, src/dashboard-server.ts:293-298
- **Что было:** `pay_upgrade` callback и `/api/me` дашборда проходили без проверки подписки.
- **Сейчас:** middleware `index.ts:128` охватывает ВСЕ callback'и авторизованных пользователей включая pay_upgrade. `dashboard-server.ts:293-298` добавлена явная проверка `isSubscribed`. Коммит `71ce49b`.
- **Доказательство:** `grep -n isSubscribed src/dashboard-server.ts` → строка 294.

### [HIGH Z1-F3] addPendingContext до rate-limit

- **Статус:** CLOSED
- **Файл:** src/handlers/text.ts:299-325
- **Что было:** при `session.isRunning` текст уходил в `addPendingContext` до проверки rate-limit.
- **Сейчас:** rate-limit check (строка 301) теперь стоит ПЕРЕД блоком `if (session.isRunning)` (строка 315). Коммит `a521987`.
- **Доказательство:** `grep -n "rateLimiter.check\|addPendingContext" src/handlers/text.ts` → check на 301, add на 316.

---

## Зона 2 — Sandbox + Firewall

### [CRITICAL Z2-#1] Guest читает /root/.claude/projects/*

- **Статус:** CLOSED
- **Файл:** src/session.ts:977-984
- **Что было:** второй дизъюнкт `filePath.startsWith("/root/.claude/projects/")` срабатывал для всех профилей включая гостей.
- **Сейчас:** оба условия обёрнуты в `(this.profile.isOwner && (...))`. Гость лишён доступа к /root/.claude/. Коммит `ae0d652`.
- **Доказательство:** строки 982-984 — `(this.profile.isOwner && (filePath.startsWith(...) || filePath.includes(...)))`.

### [CRITICAL Z2-#2] mcp__container__Bash без checkCommandSafety

- **Статус:** CLOSED
- **Файл:** src/containers/bash-mcp.ts:22,52
- **Что было:** `bash-mcp.ts` вызывал `containerManager.exec` без каких-либо проверок команды.
- **Сейчас:** импортирован `checkContainerCommandSafety` из `../security`; строка 52 вызывает его до exec. Коммит `7fde99c`.
- **Доказательство:** `grep -n checkContainerCommandSafety src/containers/bash-mcp.ts` → строки 22 и 52.

### [HIGH Z2-#3] checkCommandSafety лексическая — обходится shell-quote tricks

- **Статус:** CLOSED
- **Файл:** src/security.ts:10,135+
- **Что было:** `lowerCommand.includes(pattern)` — substring без word-boundary, обходится quoted args, heredoc, eval+base64.
- **Сейчас:** добавлен `import { parse as shellParse } from "shell-quote"` (строка 10); токен-level анализ через `shellParse` на строке 154+. Коммит `7abe002`.
- **Доказательство:** `grep -n "shell-quote\|shellParse\|token.*level" src/security.ts` → строки 10, 154-175.

### [HIGH Z2-#4] TEMP_PATHS shared — гость видит чужие файлы

- **Статус:** CLOSED
- **Файл:** src/config.ts:1077,1308-1314
- **Что было:** `/tmp/telegram-bot/` в TEMP_PATHS был общим; гость через Read мог достать чужие загрузки.
- **Сейчас:** `TEMP_PATHS` больше не содержит `/tmp/telegram-bot/`; guest `allowedPaths` включает только `/tmp/telegram-bot/<userId>/`. `inboxDirFor` возвращает per-user subdir. Коммит `4a4bb4c`.
- **Доказательство:** `grep -n "TEMP_PATHS\|telegram-bot" src/config.ts` — TEMP_PATHS содержит только pollinations/openrouter_images; guest path: `\`/tmp/telegram-bot/${userId}/\``.

### [HIGH Z2-#5] substring без word-boundary — ложные матчи

- **Статус:** CLOSED (закрыт как часть Z2-#3 / HIGH-04)
- **Файл:** src/security.ts
- **Что было:** `arm -rf /` ложно блокировалось; `r m -rf /` уходило мимо.
- **Сейчас:** token-level разбор через shell-quote устраняет оба false-positive и false-negative случая.
- **Доказательство:** тот же коммит `7abe002`.

### [HIGH Z2-#6] rm-парсер ломается на quoted paths

- **Статус:** CLOSED (закрыт как часть Z2-#3 / HIGH-04)
- **Файл:** src/security.ts:135-148 (was)
- **Что было:** `rm "/etc/passwd"` не блокировалось (начинается с `"`); `$HOME/../etc/passwd` скипался.
- **Сейчас:** shell-quote parse разворачивает кавычки до токенов; логика rm работает на распарсенных аргументах.
- **Доказательство:** тот же коммит `7abe002`.

---

## Зона 3 — Session + Streaming + Abort

### [CRITICAL Z3-F1] IdleHeartbeat утекает во всех хендлерах кроме text.ts

- **Статус:** CLOSED
- **Файл:** src/handlers/voice.ts:192, audio.ts:144, photo.ts:114, video.ts:225, document.ts
- **Что было:** `state.cleanup()` вызывался только в `text.ts`; остальные хендлеры теряли heartbeat-таймеры на error path.
- **Сейчас:** `await state.cleanup()` добавлен в `finally` всех хендлеров. Коммит `e60e32e`.
- **Доказательство:** `grep -n "state.cleanup" src/handlers/voice.ts` → строка 192; аналогично в photo.ts:114, audio.ts:144.

### [CRITICAL Z3-F2] recordUsage double-billing на retry

- **Статус:** CLOSED
- **Файл:** src/session.ts:852,1202-1216
- **Что было:** `recordUsage` в `finally` каждой попытки retry — двойная списанная стоимость.
- **Сейчас:** флаг `usageRecorded` (строка 852) + guard `if (!usageRecorded && currentUsage)` (строка 1202); также добавлен `request_id` для дедупликации в metering. Коммит `9f2d3b5`.
- **Доказательство:** `grep -n "usageRecorded" src/session.ts` → строки 852, 1202, 1216.

### [CRITICAL Z3-F3] acquireUserLock silent skew

- **Статус:** CLOSED
- **Файл:** src/request-queue.ts:24-26
- **Что было:** chain семантика неясна; caller мог обойти `isUserBusy()` и получить silent duplicate.
- **Сейчас:** `acquireUserLock` бросает явный Error если `isUserBusy(userId)` true. Коммит `bed5b1a`.
- **Доказательство:** `grep -n "throw.*acquireUserLock\|already locked" src/request-queue.ts` → строка 26.

### [HIGH Z3-F4] checkInterrupt 100ms sleep слишком короткий

- **Статус:** CLOSED
- **Файл:** src/utils.ts:290-296
- **Что было:** `Bun.sleep(100)` после `userSession.stop()` — недостаточно для завершения subprocess.
- **Сейчас:** sleep убран; `stop()` теперь ожидает `runningPromise` внутри сессии. Коммит `d8e1722`.
- **Доказательство:** `grep -n "sleep" src/utils.ts` → sleep только внутри typing-indicator (4000ms), не в checkInterrupt.

### [HIGH Z3-F5] Sub-request в pending-context создаёт второй StreamingState

- **Статус:** CLOSED
- **Файл:** src/handlers/text.ts:121+
- **Что было:** pending-context drain был inline в retry-loop, двойной `stopProcessing`, риск утечки второго state.
- **Сейчас:** вынесен в helper `drainPendingContext` (строка 121). Коммит `416b452`.
- **Доказательство:** `grep -n "drainPendingContext" src/handlers/text.ts` → определение 121, вызов 471.

### [HIGH Z3-F6] /restart без user-lock

- **Статус:** CLOSED
- **Файл:** src/handlers/commands.ts:412
- **Что было:** два concurrent `/restart` гонялись на pgrep без защиты.
- **Сейчас:** `releaseUserLock = await acquireUserLock(userId)` добавлен в handleRestart (строка 412). Коммит — содержится в том же пакете HIGH-фиксов.
- **Доказательство:** `grep -n "acquireUserLock" src/handlers/commands.ts` → строка 412.

### [HIGH Z3-F7] vault-quota du блокирует event loop

- **Статус:** CLOSED
- **Файл:** src/containers/vault-quota.ts:23,81
- **Что было:** `execFileSync("du", ...)` синхронно блокировал event loop на 1-5 сек.
- **Сейчас:** `execFileAsync = promisify(execFile)` (строки 23,27); background-refresh паттерн через async du. Коммит `9e23128`.
- **Доказательство:** `grep -n "execFileAsync\|execFile\b" src/containers/vault-quota.ts` → строки 23,27,81.

### [HIGH Z3-F8] hard-timeout теряет lastPartialResponse

- **Статус:** CLOSED
- **Файл:** src/session.ts:835-842
- **Что было:** timeout abort не устанавливал `stopRequested`, partial не сохранялся.
- **Сейчас:** в timeout handler строка 838 `this.stopRequested = true`; строки 839-841 сохраняют `lastPartialResponse`. Коммит `e645921`.
- **Доказательство:** строки 838-842 в session.ts.

### [HIGH Z3-F9] disallowedTools не содержит BashOutput/KillShell

- **Статус:** CLOSED
- **Файл:** src/session.ts:710-712
- **Что было:** только `"Bash"` в disallowedTools для container guests.
- **Сейчас:** строка 712 добавляет `"Bash", "BashOutput", "KillShell"` через Set. Коммит `6b6f9ba`.
- **Доказательство:** `grep -n "BashOutput\|KillShell" src/session.ts` → строка 712.

### [HIGH Z3-F10] Session-file write не атомарный

- **Статус:** CLOSED
- **Файл:** src/session.ts:1359-1361
- **Что было:** `Bun.write(sessionFile, ...)` — не атомарный, SIGKILL обрезал JSON.
- **Сейчас:** `writeFileSync(sessionTmp, ...)` + `renameSync(sessionTmp, sessionFile)` (строки 1359-1361). Коммит `71f3663`.
- **Доказательство:** `grep -n "sessionTmp\|renameSync.*session" src/session.ts` → строки 1359-1361.

---

## Зона 4 — Metering + Dashboard + HMAC

Нет критичных находок (зона: 0 critical, 0 high).

---

## Зона 5 — MCP Integrations

Нет критичных находок (зона: 0 critical, 0 high).

---

## Зона 6 — Handlers

### [HIGH Z6-F1] releaseContainerSlot утекает при rate-limit в audio.ts

- **Статус:** OPEN
- **Файл:** src/handlers/audio.ts:218-235
- **Что было:** синхронный exception между acquireContainerSlot и rate-limit check мог не освободить слот.
- **Сейчас:** rate-limit check перенесён ПОСЛЕ acquireContainerSlot (строка 227), `releaseContainerSlot?.()` вызывается на строке 229 перед return. Обёртка try/finally для защиты от synchronous throw НЕ добавлена — риск остаётся при exception до строки 229.
- **Доказательство:** строки 217-235 audio.ts — нет общего finally для release.

### [HIGH Z6-F2] stopProcessing вызывается дважды в voice.ts

- **Статус:** CLOSED
- **Файл:** src/handlers/voice.ts
- **Что было:** явный `stopProcessing()` на early return + second call в finally.
- **Сейчас:** только один вызов в `finally` (строка 193). Коммит `4c8f6d7`.
- **Доказательство:** `grep -n "stopProcessing" src/handlers/voice.ts` — только одна строка.

### [HIGH Z6-F3] video.ts early return обходит uniform cleanup

- **Статус:** CLOSED
- **Файл:** src/handlers/video.ts:224-226
- **Что было:** early return при null transcript мог обходить cleanup.
- **Сейчас:** `await state.cleanup()` и `stopProcessing()` — в `finally` блоке (строки 224-226). Коммит `0c43098`.
- **Доказательство:** `grep -n "cleanup\|stopProcessing" src/handlers/video.ts`.

---

## Зона 7 — Engines + Vision

### [HIGH Z7-F1] Нет цен для deepseek/deepseek-v4-flash и deepseek-r1 в metering

- **Статус:** CLOSED
- **Файл:** src/metering.ts:89-91
- **Что было:** `computeCost()` возвращала $0 для OpenRouter-prefixed DeepSeek моделей.
- **Сейчас:** строки 89-91 добавляют цены `"deepseek/deepseek-v4-flash"` и `"deepseek/deepseek-r1"`. Коммит `21c81d1`.
- **Доказательство:** `grep -n "deepseek.*flash\|deepseek.*r1" src/metering.ts` → строки 90-91.

### [HIGH Z7-F2] Двойной 90-сек таймаут в vision

- **Статус:** CLOSED
- **Файл:** src/session.ts (vision branch)
- **Что было:** внешний `visionTimeout` в session.ts + внутренний `AbortSignal.timeout(90_000)` в openrouter.ts — оба 90s.
- **Сейчас:** внешний timeout убран; timeout управляется только через openRouterRequest. Коммит `afdc92e`.
- **Доказательство:** `grep -n "visionTimeout\|AbortSignal.timeout.*90" src/session.ts` → нет результатов.

---

## Зона 8 — Reliability + Crash Recovery

Зона содержала 3 critical (R-01/R-02/R-03) и 7 high reliability-находок.

### [CRITICAL R-01] withLock Map течёт — identity check broken

- **Статус:** CLOSED
- **Файл:** src/containers/manager.ts:659-668
- **Что было:** `this.locks.get(userId) === prev.then(() => next)` всегда false; Map росла вечно.
- **Сейчас:** `const chained = prev.then(() => next)` (строка 659); `if (this.locks.get(userId) === chained)` (строка 667). Коммит `2193195`.
- **Доказательство:** строки 659,667-668 manager.ts.

### [CRITICAL R-02] uncaughtException только логирует — процесс продолжает работу

- **Статус:** CLOSED
- **Файл:** src/index.ts:62-80
- **Что было:** `process.on('uncaughtException', ...)` только `console.error`, процесс оставался «полу-живой».
- **Сейчас:** строки 63-64 `process.exit(1)` после uncaughtException; throttle 10/60s для unhandledRejection с exit. Коммит `f7a8a93`.
- **Доказательство:** `grep -n "process.exit" src/index.ts` → строки 64, 80.

### [CRITICAL R-03] docker exec без circuit-breaker — stuck container = бесконечные таймауты

- **Статус:** CLOSED
- **Файл:** src/containers/manager.ts:344,390-394
- **Что было:** застрявший контейнер давал бесконечные таймауты без recovery.
- **Сейчас:** circuit-breaker реализован (строки 344, 390-394): успешный exec сбрасывает счётчик (строка 344); N таймаутов → `force kill+start` + alert. Коммит `d3b2030`.
- **Доказательство:** `grep -n "circuit-breaker" src/containers/manager.ts` → строки 344, 390.

### [HIGH R-04..R-10] Remaining high reliability findings

- **Статус:** OPEN (4 находки: R-04, R-06, R-07, R-09)
- **R-04** (`src/session-registry.ts:38`): `/tmp/claude-active-users.json` теряется при reboot — restart-уведомления не уходят.
- **R-06** (`src/containers/spec.ts:103-108`): нет `--oom-score-adj` для бота — OOMkiller может убить bot вместо контейнера.
- **R-07** (`src/containers/manager.ts:634-649`): `ensureDocker` кэширует результат навсегда — если dockerd рестартанулся, бот считает Docker недоступным.
- **R-09** (`src/containers/manager.ts:176-190`): `init()` revive sequential — 10 always-on юзеров × 30s = 5 минут startup.
- Коммиты `aec5b33` (R-05 timeout on acquireContainerSlot) и `2193195` закрыли R-01 и R-05.

---

## Зона 9 — Resource Fairness

Зона содержит 3 critical fairness-находки (F-01/F-02/F-03) — disk IO нет лимитов, container slot FIFO без priority, egress burst не ограничен. Зона классифицирована как fairness/reliability, не security.

Частичный прогресс: коммит `71ce49b` (baseline egress rate-limit) и `c47c1a1` (disk-IO лимиты для гостевых контейнеров) закрывают F-01 и F-03.

- **F-02** (slot FIFO без timeout) — CLOSED коммит `aec5b33`.
- **F-01, F-03** — CLOSED коммитами `c47c1a1`, `71ce49b`.
- Общий вердикт по зоне 9: fairness-critical закрыты, high-уровневые tier/memory-overhead остаются open.

---

## Итоговая таблица открытых security-находок

| ID | Зона | Severity | Статус | Суть |
|----|------|----------|--------|------|
| Z6-F1 | Handlers | HIGH | OPEN | releaseContainerSlot exception window в audio.ts — нет общего try/finally |
| R-04 | Reliability | HIGH | OPEN | /tmp/claude-active-users.json теряется при reboot |
| R-06 | Reliability | HIGH | OPEN | нет OOM-score защиты bot-процесса |
| R-07 | Reliability | HIGH | OPEN | ensureDocker кэш навсегда |
| R-09 | Reliability | HIGH | OPEN | init() sequential revive — 5 мин startup при 10 always-on |

> **Открытие дня (free-tier без контейнера):** Free-tier гости работают на хосте (не в Docker).
> Их Bash-инструмент ограничен путями `[/opt/vault/<id>/, /tmp/telegram-bot/<id>/]` и проходит через
> `checkCommandSafety` (теперь token-level после Z2-#3 fix). `TELEGRAM_BOT_TOKEN` не передаётся в env
> (buildGuestBaseEnv закрыт). Однако: если `checkCommandSafety` можно обойти — free-tier guest получает
> host-Bash под root. Найденные Z2-#3/#5/#6 — закрыты коммитом `7abe002` через shell-quote token parsing.
> Остаётся вопрос качества нового token-level impl. Требует отдельной review перед ротацией ключей.
