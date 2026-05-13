# СПЕКА — устранение находок аудита 2026-05-13

Это исполняемая спецификация. Идти сверху вниз. Каждая запись — атомарная задача с file:line, конкретным фиксом и acceptance-критерием.

**Источник:** полный аудит бота 7-ю параллельными агентами. Детали по каждой находке — в `audit-out/zone-N-*.md`. Сводка с группировкой паттернов — `audit-out/SUMMARY.md`.

**Всего:** 5 critical / 19 high / 31 medium / 27 low (= 82 actionable + 7 info/смелл).

---

## 0. Правила работы (важно!)

1. **Не деплой на сервер без явного «деплой» от пользователя.** Локально менять — да; `git push` и `systemctl restart` — только по команде.
2. **Atomic commits.** Один фикс = один коммит. Commit message: `fix(audit-CRIT-01): закрыть утечку /root/.claude/projects/* для гостей` (формат: `fix(audit-<ID>): <одна строка по-русски>`).
3. **Без footer'ов** «Generated with Claude Code» / `Co-Authored-By`. См. `CLAUDE.md`.
4. **`bun run typecheck` после каждого фикса.** Не коммитить, пока не зелёный.
5. **Если фикс трогает поведение на проде (метеринг, auth, sandbox)** — добавить запись в `HANDOFF.md` под текущей датой с одной строкой «что изменилось и почему».
6. **Если по ходу обнаружится, что находка ложная** (агент ошибся) — отметить в этой спеке как `~~CRIT-XX~~ — отменено: <причина>` и идти дальше. Не пытаться чинить несуществующие баги.
7. **`git status` перед началом каждого фикса.** Не накладывать новый фикс на грязное дерево предыдущего.

---

## 1. Pre-flight — прочитать один раз перед началом

- `CLAUDE.md` (корень) — про архитектуру, прод-сервер, deploy, commit style.
- `memory/project_knowledge_graph.md` — текущее состояние проекта.
- `audit-out/SUMMARY.md` — общий контекст находок.
- Этот файл (`SPEC.md`) — план работы.

Не нужно перечитывать `audit-out/zone-N-*.md` целиком — там детали; используй для справки если фикс непонятен.

---

## 2. ЭТАП 1 — критические (CRIT-01 .. CRIT-05)

Эти 5 фиксов закрывают самые опасные дыры. Выполнить первыми, перед всем остальным.

---

### CRIT-01 — закрыть `/root/.claude/projects/*` для гостей
**Severity:** critical (security — утечка чужих данных)
**Файл:** `src/session.ts:914-921`
**Симптом:** хост-tool `Read` разрешён для любого пути в `/root/.claude/projects/` независимо от профиля. Гость через `Read /root/.claude/projects/-opt-claude-tg-bot/<uuid>.jsonl` достаёт transcripts всех пользователей и OAuth-state.

**Что менять:**
Заменить дисъюнкцию `isTmpRead` так, чтобы доступ к `/root/.claude/projects/` и любому `/.claude/` был только для owner:
```ts
const isTmpRead =
  toolName === "Read" &&
  (TEMP_PATHS.some((p) => filePath.startsWith(p)) ||
    (this.profile.isOwner &&
      (filePath.startsWith("/root/.claude/projects/") ||
       filePath.includes("/.claude/"))));
```

**Acceptance:**
- Гостевая сессия пытается `Read /root/.claude/projects/<любой>/<uuid>.jsonl` → отказ через `isPathAllowedFor`.
- Owner-сессия читает свой `/root/.claude/projects/-opt-claude-tg-bot/<uuid>.jsonl` как раньше.

---

### CRIT-02 — добавить `checkCommandSafety` в `mcp__container__Bash`
**Severity:** critical (sandbox bypass — fork-bomb / vault destruction внутри контейнера)
**Файл:** `src/containers/bash-mcp.ts:50-77`
**Симптом:** in-process MCP `mcp__container__Bash` принимает любую команду от модели и шлёт прямо в `containerManager.exec()` без `checkCommandSafety` / `BLOCKED_PATTERNS`. Гость через галлюцинацию модели может `:(){ :|:& };:` или `dd if=/dev/zero of=big bs=1M count=20000` (vault-quota закроется только через 60с — см. MED-04).

**Что менять:**
1. Добавить вызов `checkCommandSafety(command, [profile.workingDir])` перед `containerManager.exec`.
2. Если небезопасно — вернуть `{ content: [{ type: "text", text: \`Blocked: ${reason}\` }], isError: true }`.
3. Создать узкий контейнерный BLOCKED_PATTERNS_CONTAINER в `src/security.ts` (fork-bomb pattern, `dd if=/dev/zero`, `mkfs`) и использовать его в `bash-mcp.ts`.

**Acceptance:**
- В гостевом контейнере `mcp__container__Bash` отказывает на fork-bomb и `dd if=/dev/zero` с сообщением «Blocked: <pattern>».
- Безобидные команды (`ls`, `cat`, `python3 -c "print(1)"`) проходят как раньше.

---

### CRIT-03 — устранить heartbeat leak в 5 хендлерах
**Severity:** critical (memory leak + фантомные сообщения после краха)
**Файлы:**
- `src/handlers/voice.ts:183-197`
- `src/handlers/audio.ts` (район строки 200, где finally)
- `src/handlers/photo.ts:113-116`
- `src/handlers/document.ts` (~470 и ~560)
- `src/handlers/video.ts` (~191)

**Симптом:** `createStatusCallback` стартует `IdleHeartbeat` (setInterval + setTimeout). На happy-path он останавливается в `done`-callback. Но если SDK кинул исключение, или хендлер вышел через early return — heartbeat продолжает крутиться. Только `text.ts:440` явно зовёт `state.cleanup()`. Остальные — нет.

**Что менять:**
Вариант А (быстро): в `finally` каждого из пяти хендлеров добавить `await state.cleanup()` (если `state` уже определён).

Вариант Б (правильно, рекомендую): создать helper `runWithStreaming(ctx, profile, fn)` в `src/handlers/streaming.ts`, который владеет lifecycle `StreamingState` + `typing` + `IdleHeartbeat` и гарантирует cleanup в `finally`. Переписать все 6 хендлеров на этот helper. Это закрывает ещё и HIGH-06, HIGH-07.

Если выбран вариант Б — оформить как HIGH-06 в одну задачу.

**Acceptance:**
- Послать в гостевую сессию voice/audio/photo/document/video → после ответа `setInterval` /`setTimeout` не остаются (проверить через `process._getActiveHandles()` в dev-режиме или просто отсутствие повторных «✨ думаю…» через 30+ сек).
- Симулировать падение SDK (поднять отдельный тест с throw в session.sendMessageStreaming) → heartbeat останавливается.

---

### CRIT-04 — устранить double-billing на retry
**Severity:** critical (financial — пользователь платит x2 за неудачный запрос)
**Файлы:**
- `src/session.ts:1125-1159` (recordUsage в finally)
- `src/handlers/text.ts:333-394` (retry-loop)

**Симптом:** Когда первая попытка падает с exit-code-1 после получения `assistant` ивента, `currentUsage` уже выставлен (5000/2000 токенов), `finally` записывает в SQLite. Catch ловит крах, делает retry. Вторая попытка отрабатывает (5200/2200), снова `finally` пишет в SQLite. Итого юзеру списано 10200 input токенов вместо 5200.

**Что менять:**
1. Добавить колонку `request_id TEXT` в таблицу `usage` (`src/metering.ts:CREATE TABLE` и `INSERT`).
2. Сделать миграцию: `ALTER TABLE usage ADD COLUMN request_id TEXT` (см. идемпотентный паттерн в `metering.ts`).
3. Добавить unique constraint `(user_id, request_id, model)` — или партиально через `INSERT OR REPLACE`/`INSERT OR IGNORE`.
4. В `session.ts:sendMessageStreaming` сгенерировать `requestId = crypto.randomUUID()` ОДИН раз на вход в метод (не на попытку). Передавать в `recordUsage`.
5. На retry в `handlers/text.ts` — **тот же** requestId не пересоздавать.
6. При повторном `INSERT` с тем же `request_id` — `INSERT OR REPLACE` обновляет токены последней попытки (правильно: считаем максимум по попыткам).

Альтернатива (проще, но менее идеально): вообще не писать `recordUsage` в `finally` на пути ошибки; писать только на `queryCompleted=true`. Минус — теряем billing для частично-выполненных запросов.

**Acceptance:**
- Симулировать: первая попытка падает на exit-code-1 после 1000 input + 500 output, вторая успешно завершается на 1100 input + 600 output. После запроса `SELECT SUM(input_tokens) FROM usage WHERE request_id = '<X>'` возвращает 1100 (не 2100).

---

### CRIT-05 — устранить race в `acquireUserLock`
**Severity:** critical (correctness — silent skew если caller забудет `isUserBusy`)
**Файл:** `src/request-queue.ts:23-40`

**Симптом:** `acquireUserLock` chain'ит promises через `await existing` + перезапись `userLocks.set(userId, lock)`. Но каждый хендлер ДО его вызова делает `if (isUserBusy(userId)) return early`. То есть chain-ветка по факту никогда не достигается — это «dead code». Если будущий caller (webhook, callback) забудет `isUserBusy` — лок сcaйцится молча, юзер получит дублирующую обработку.

**Что менять:**
Выбрать одну семантику:
- **Семантика А (throw-if-busy):** `acquireUserLock` бросает исключение, если уже занято. Все callers обязаны проверять `isUserBusy` явно. Удаляет chain-логику. Согласовано с тем, как code сейчас фактически работает.
- **Семантика Б (queue):** оставить chain, но удалить `isUserBusy`-проверки из хендлеров. Все запросы выстраиваются в очередь автоматически.

**Рекомендация:** Семантика А. Меньше изменений, явнее ошибка.

```ts
export async function acquireUserLock(userId: number): Promise<() => void> {
  if (userLocks.has(userId)) {
    throw new Error(`acquireUserLock: user ${userId} already locked — caller must isUserBusy() first`);
  }
  // ... остальное как сейчас, без awaiting existing
}
```

**Acceptance:**
- Все 6 хендлеров продолжают работать (они уже делают `isUserBusy`).
- Симуляция: два concurrent вызова `acquireUserLock(123)` без `isUserBusy` → второй бросает `Error`.

---

## 3. ЭТАП 2 — high (HIGH-01 .. HIGH-19)

Стабильность runtime и закрытие обходов sandbox. Делать после Этапа 1.

---

### HIGH-01 — `addUser` без atomic write
**Severity:** high (data loss — двойной approve теряет одного гостя)
**Файл:** `src/user-registry.ts:155`
**Симптом:** `writeFileSync(USERS_FILE, JSON.stringify(users, null, 2))` — non-atomic. Параллельный double-approve затирает одного юзера.

**Что менять:** Заменить `writeFileSync(USERS_FILE, ...)` на `writeUsersAtomic(users)` (уже существует в этом же файле — используется в `saveUser`).

**Acceptance:**
- `grep -n "writeFileSync(USERS_FILE" src/user-registry.ts` возвращает 0 совпадений.
- `addUser` вызывает только `writeUsersAtomic`.

---

### HIGH-02 — subscription gate gaps
**Severity:** high (продуктовое требование обходится)
**Файл:** `src/index.ts:113-157`, `src/dashboard-server.ts:handleApiMe`, `src/handlers/callback.ts` (pay_upgrade)

**Симптом:** middleware проверяет подписку только для текстовых/медиа сообщений. Welcome callback после approve, `pay_upgrade` callback, web_app dashboard (`/api/me`, `/api/admin/all`) проходят без проверки.

**Что менять:**
1. Создать helper `requireSubscription(userId): Promise<boolean>` (если ещё нет в `src/subscription.ts`).
2. Вызвать его на входе:
   - `pay_upgrade` callback в `src/handlers/callback.ts`
   - `/api/me` в `src/dashboard-server.ts`
   - `/api/admin/all` (после owner-check)
3. Owner — освобождён от проверки (как и сейчас в middleware).

**Acceptance:**
- Гость без подписки тапает «Купить тариф» → бот отправляет subscription-gate сообщение, не открывает оплату.
- Гость без подписки открывает Mini App → `/api/me` отдаёт 403 с понятным `code: "subscription_required"`.

---

### HIGH-03 — `addPendingContext` обходит rate-limit
**Severity:** high (bypass rate-limit + потенциальное cost-blowout)
**Файл:** `src/handlers/text.ts:254-263`

**Симптом:** Если `session.isRunning`, сообщение кладётся в queue ДО проверки `rateLimiter.check`. Атакер шлёт 1000 строк за секунду, при следующем consume склеит в один мега-запрос.

**Что менять:**
1. Вынести `rateLimiter.check(userId)` ВЫШЕ `if (session.isRunning) { addPendingContext... }`.
2. Если rate-limit fail — отказать сразу, не класть в queue.
3. Дополнительно: ограничить размер `pendingContextMessages` (например, max 5 сообщений или max 5000 chars total в сумме). Реализовать в `ClaudeSession.addPendingContext`.

**Acceptance:**
- Owner с включённым rate-limit (`RATE_LIMIT_ENABLED=true`, лимит 5/min) шлёт 10 сообщений во время длинного query → первые 5 принимаются в queue, остальные отвергаются с сообщением о лимите.
- `pendingContextMessages.length` не превышает max-size.

---

### HIGH-04 — `checkCommandSafety` обходится lexically
**Severity:** high (sandbox bypass — quoted args, eval, heredoc)
**Файл:** `src/security.ts:127-152`

**Симптом:** `lowerCommand.includes(pattern)` ломается на:
- `'r''m' -rf /` (quoted чтобы spit substring)
- `eval "$(echo cm0gLXJmIC8K|base64 -d)"`
- `bash$IFS-c` (вместо `bash -c`)
- `arm -rf /` (substring `rm -rf /` ложно сматчится)
- `r m -rf /` (с пробелом — миновала бы паттерн `rm -rf`)

**Что менять:**
1. Установить пакет `shell-quote` (`bun add shell-quote`).
2. Заменить substring-чек на token-уровень:
   ```ts
   import { parse } from "shell-quote";
   const tokens = parse(command).filter(t => typeof t === "string");
   const firstBin = tokens[0]?.toLowerCase();
   ```
3. Проверять `firstBin` против allowlist (`["ls","cat","grep","sed","python3","node",...]`).
4. Substring-чек оставить как secondary canary, но не как primary gate.
5. Для `eval`, `exec`, `source` — явный отказ.
6. Дополнительно блокировать команды с `$()`, `\``backticks, `<(`, `>(` — кроме whitelisted кейсов.

**Acceptance:**
- `'r''m' -rf /` отвергается.
- `eval "echo hi"` отвергается.
- `bash$IFS-c "ls"` отвергается.
- `ls /opt/vault/123` проходит.

**Зависимости:** связано с HIGH-05 и HIGH-06 (один и тот же файл).

---

### HIGH-05 — substring без word-boundary в `BLOCKED_PATTERNS`
**Severity:** high (false positives + false negatives)
**Файл:** `src/security.ts:129-131`
**Симптом:** `lowerCommand.includes(pattern)` без `\b`. Паттерн `mkfs.` ловит `command-with-mkfs.foo.txt`. Паттерн `rm -rf` миновает `r m -rf`.

**Что менять:** Закрывается через HIGH-04 (переход на token-уровень).

**Acceptance:** см. HIGH-04.

---

### HIGH-06 — `rm`-парсер ломается на quoted/`--`/`$VAR`
**Severity:** high (sandbox bypass)
**Файл:** `src/security.ts:135-148`
**Симптом:**
- `rm "/etc/passwd"` → arg `"/etc/passwd"` не начинается с `/` → skip → не блокируется
- `rm -- /etc/passwd` → `--` skipped (dash-arg), но дальше проверяется (good)
- `rm $HOME/../etc/passwd` → arg начинается с `$` → skip → bypass
- `rm /etc/pass*` → glob не разворачивается

**Что менять:**
1. Использовать `shell-quote.parse()` (см. HIGH-04) для tokens.
2. Резолвить env-переменные (или отвергать команды с `$` в args для `rm`).
3. После tokenize — проверять каждый non-flag token через `isPathAllowedFor`.

**Acceptance:**
- `rm "/etc/passwd"` отвергается.
- `rm $HOME/secret` отвергается (либо отказ из-за `$`, либо после expand).
- `rm /opt/vault/123/file.txt` проходит для гостя 123.

---

### HIGH-07 — TEMP_PATHS shared между гостями
**Severity:** high (cross-user data leak)
**Файлы:** `src/session.ts:914-916`, `src/config.ts:1285-1293`

**Симптом:** `/tmp/telegram-bot/` в TEMP_PATHS. Любой Read с этим префиксом allowed. Гость B может `Read /tmp/telegram-bot/photo-<guestA-uuid>.jpg` и получить чужое фото.

**Что менять:**
1. Удалить `/tmp/telegram-bot/` из `TEMP_PATHS` глобально.
2. Сделать `inboxDirFor(userId)` per-user: `/tmp/telegram-bot/${userId}/` (или `/opt/vault/${userId}/inbox/` для container-гостей).
3. В `profile.allowedPaths` добавлять только этот per-user path.
4. Owner оставить broad-доступ как сейчас.

**Acceptance:**
- Гость 123 видит только `/tmp/telegram-bot/123/`.
- Гость 456 не может прочитать файл из `/tmp/telegram-bot/123/`.
- Owner читает любой `/tmp/telegram-bot/*` как раньше.

---

### HIGH-08 — `checkInterrupt` race с 100ms sleep
**Severity:** high (correctness — два subprocess одновременно)
**Файл:** `src/utils.ts:290-297`
**Симптом:** После `userSession.stop()` ждём 100ms и стартуем новый query. Subprocess не успевает умереть, эмитит финальные event'ы на dying state.

**Что менять:**
1. В `ClaudeSession` добавить `runningPromise: Promise<void> | null` — resolved when for-await loop exits.
2. В `stop()` — `await this.runningPromise` после `abortController.abort()`.
3. Убрать `Bun.sleep(100)` из `checkInterrupt`. Если `stop()` уже awaits — sleep не нужен.

**Acceptance:**
- Послать длинный запрос → во время стрима послать `!новый`. Второй запрос стартует только после полного выхода из первого (логи показывают `[session] query loop exited` ДО `[session] starting new query`).

---

### HIGH-09 — pending-context drain создаёт второй StreamingState без bound
**Severity:** high (cleanup confusion + потенциал лишних `stopProcessing` calls)
**Файл:** `src/handlers/text.ts:361-392`

**Симптом:** `consumePendingContext` запускает второй `sendMessageStreaming` внутри того же handler. `pendingState.cleanup()` в inner finally; outer state может быть очищен дважды; `return` на 391 минует outer break.

**Что менять:**
1. Вынести pending-context drain в отдельный helper `drainPendingContext(session, ctx, profile)`, который сам владеет своим state/typing/heartbeat в try/finally.
2. Из основного handler — вызвать `await drainPendingContext(...)` ПОСЛЕ outer finally (где outer state уже очищен).
3. Либо: внутри drain не вызывать `stopProcessing()` явно — пусть finally outer handler делает это один раз.

**Acceptance:**
- `stopProcessing()` и `typing.stop()` вызываются ровно один раз даже при drain pending-context.
- При исключении в drain — outer handler ловит и зовёт `replyFriendly`.

---

### HIGH-10 — `/restart` без user-lock + pgrep mismatch
**Severity:** high (correctness — два concurrent /restart гоняются)
**Файл:** `src/handlers/commands.ts:457-482`

**Симптом:**
1. `/restart` не вызывает `acquireUserLock`. Два concurrent `/restart` от owner гоняются на pgrep + kill.
2. `pgrep -f "--add-dir ${workingDir}/"` — trailing slash. Если SDK эмитит `--add-dir /opt/claude-tg-bot/workspace` без слэша — процессы не найдутся.

**Что менять:**
1. Обернуть `handleRestart` в `acquireUserLock(userId)` через `tryRunWithLock` или с явной проверкой `isUserBusy`.
2. Заменить pgrep-pattern на `pgrep -f "--add-dir ${workingDir.replace(/\/$/, '')}"` (без trailing slash) ИЛИ на `ps aux | grep claude` с filter в js.
3. Игнорировать `ESRCH` в `process.kill` (процесс уже умер — это OK).

**Acceptance:**
- Два concurrent `/restart` от owner: первый отрабатывает, второй сразу видит «уже идёт перезапуск».
- pgrep находит реальные SDK-процессы (проверить через `ps auxf | grep "claude.*add-dir"` на проде).

---

### HIGH-11 — `vault-quota` блокирует event loop
**Severity:** high (performance — 1-5 сек freeze для всех гостей)
**Файл:** `src/containers/vault-quota.ts:62-66`

**Симптом:** `execFileSync("du", ["-sb", vaultPath], {timeout: 5000})` блокирует Node event loop. На 2GB vault `du` идёт 1-5 секунд. Раз в минуту бот зависает.

**Что менять:**
1. Заменить `execFileSync` на `execFile` (promisified) с `await`.
2. Кэш переписать на «background refresh»:
   - При вызове `checkVaultQuota`: если кэш свежий (<60s) — вернуть сразу. Если устарел — вернуть устаревший И запустить async refresh.
   - Опционально: на старте бота прогреть кэш для всех активных гостей.

**Acceptance:**
- `await checkVaultQuota(123)` возвращается за <50ms даже при первом вызове (по устаревшему кэшу). Background du крутится отдельно.
- Event loop не блокируется (проверить через `process.hrtime` обёртку вокруг `checkVaultQuota`).

---

### HIGH-12 — `lastPartialResponse` теряется на hard-timeout
**Severity:** high (data loss — пользователь не видит partial-ответ)
**Файл:** `src/session.ts:776-781, 806-812`

**Симптом:** 10-минутный hard-timeout зовёт `this.abortController.abort()` без установки `this.stopRequested = true`. Partial-saving срабатывает только при `stopRequested`. На hard-timeout `lastPartialResponse = ""`.

**Что менять:**
В timeout-callback (`session.ts:776-781`) добавить:
```ts
this.stopRequested = true;
this.lastPartialResponse = this.streamingState?.fullText ?? "";
```

**Acceptance:**
- Симулировать query, который идёт >10 минут (или временно понизить таймаут до 30 сек) → после abort `session.lastPartialResponse` содержит то что успело прийти.

---

### HIGH-13 — `disallowedTools` не включает BashOutput/KillShell
**Severity:** high (sandbox — background-shell tools могут проскочить)
**Файл:** `src/session.ts:660-664`

**Симптом:** Для container-гостей запрещён только `"Bash"`. SDK 0.2.x экспонирует `BashOutput`, `KillShell` отдельно — они проходят.

**Что менять:**
```ts
disallowedTools: profile.containerEnabled
  ? [...(profile.disallowedTools ?? []), "Bash", "BashOutput", "KillShell"]
  : profile.disallowedTools,
```
Уточнить через `grep -r "BashOutput\|KillShell" node_modules/@anthropic-ai/claude-agent-sdk/`, чтобы убедиться, что имена правильные для текущей версии SDK.

**Acceptance:**
- Гостевая сессия не имеет `Bash`, `BashOutput`, `KillShell` (проверить через query-debug или вывод `tools` в начале query).

---

### HIGH-14 — session-file write не атомарен
**Severity:** high (data loss при SIGKILL посреди записи)
**Файл:** `src/session.ts:1288`

**Симптом:** `Bun.write(profile.sessionFile, JSON.stringify(...))` — single write. SIGKILL в середине → truncated JSON → `loadSessionHistory` ловит exception и возвращает пусто. История теряется.

**Что менять:** Использовать `writeFileSync(tmp, json); renameSync(tmp, target)` (как сделано в `session-registry.ts:55-57` для `ACTIVE_USERS_FILE`).

**Acceptance:**
- Симулировать SIGKILL во время записи (вручную добавить `await Bun.sleep(5000)` посреди записи и kill -9). После restart — session.json или старая (rename не произошёл) или новая (rename прошёл). Не «битая».

---

### HIGH-15 — heartbeat leak в `audio.ts` между acquire и rate-limit
**Severity:** high (резервный container slot не отпускается)
**Файл:** `src/handlers/audio.ts:215-228`

**Симптом:** `acquireContainerSlot()` выполняется, потом проверка rate-limit. Если между ними async exception — slot не освобождается через `releaseContainerSlot`.

**Что менять:** Обернуть всю sequence от `acquireUserLock` до конца обработки в `try/finally`, который освобождает оба лока безусловно (паттерн как в `handleDocument`).

**Acceptance:** В `handleAudio` присутствует `try { ... } finally { releaseContainerSlot?.(); releaseUserLock?.(); }` обрамляющий всю критическую секцию.

---

### HIGH-16 — `stopProcessing` дважды в `voice.ts`
**Severity:** high (UX — состояние сессии может непредсказуемо рассогласоваться)
**Файл:** `src/handlers/voice.ts:133-135`

**Симптом:** На раннем return после null-transcription `stopProcessing()` зовётся явно, потом снова в `finally`. Если не идемпотентно — баг.

**Что менять:**
Удалить явный `stopProcessing()` на 133. Положиться на `finally`. (Альтернативно: убедиться, что `stopProcessing` идемпотентна, и добавить комментарий.)

**Acceptance:** Логирование показывает один `stopProcessing` call на запрос.

---

### HIGH-17 — early return в `video.ts` минует uniform cleanup
**Severity:** high (структурная inconsistency, потенциал багов)
**Файл:** `src/handlers/video.ts:161-168`

**Симптом:** Раний return после null-transcription. `finally` отрабатывает, но flow не симметричен другим хендлерам.

**Что менять:** Заменить `return` на `throw new Error("transcription_failed")` или просто на set-flag → outer if. Cleanup тогда уходит в общий path.

**Acceptance:** Структура `voice.ts` и `video.ts` одинаковая на raise/handle ошибки транскрипции.

---

### HIGH-18 — missing prices для DeepSeek-on-OpenRouter
**Severity:** high (financial — silent $0 для всех text-fallback гостей)
**Файлы:** `src/metering.ts:63-79` (PRICING_PER_1M), `src/config.ts:1044-1048`

**Симптом:** Модели `deepseek/deepseek-v4-flash` и `deepseek/deepseek-r1` (OpenRouter-prefixed) отсутствуют в `PRICING_PER_1M`. `computeCost()` возвращает 0. Гости без personal DeepSeek-ключа жгут токены бесплатно с точки зрения учёта.

**Что менять:**
Добавить в `PRICING_PER_1M`:
```ts
"deepseek/deepseek-v4-flash": { input: 0.07, output: 0.28 },
"deepseek/deepseek-r1":       { input: 0.55, output: 2.19 },
```
**Перед добавлением проверить актуальные цены** на https://openrouter.ai/models (могли измениться).

**Acceptance:**
- После запроса от гостя без deepseek-ключа `SELECT cost FROM usage WHERE user_id=<X> ORDER BY ts DESC LIMIT 1` возвращает >0.
- Дашборд показывает ненулевую стоимость.

---

### HIGH-19 — двойной 90-сек таймаут в vision
**Severity:** high (запутанная logic, потенциал double-cancel)
**Файлы:** `src/session.ts:581-597`, `src/engines/openrouter.ts:557`

**Симптом:** Vision создаёт `visionAbort + setTimeout(90000)` снаружи, `openRouterRequest` имеет `AbortSignal.timeout(90000)` внутри. Объединение через `AbortSignal.any` — двойная отмена reader'а.

**Что менять:** Убрать внешний `visionTimeout` в `session.ts`. Положиться на внутренний таймаут `openRouterRequest`. Если нужен абор от пользователя (`/stop`, `!`) — передавать только `this.abortController.signal`.

**Acceptance:**
- В `session.ts` нет `setTimeout(...,90_000)` для vision.
- Пользовательский `!` посреди vision-запроса отменяет его (зависит от MED-09 — vision branch должен иметь `this.abortController`).

---

## 4. ЭТАП 3 — medium (MED-01 .. MED-31)

Качество и надёжность. Делать после Этапов 1-2.

---

### MED-01 — двойственная owner-модель
**Файл:** `src/handlers/callback.ts:318` (использует `OWNER_USER_ID`), `src/config.ts:1015` (использует `role==="owner"`)
**Симптом:** Два источника правды.
**Фикс:** В `handleInviteCallback` заменить `ctx.from?.id !== OWNER_USER_ID` на `!getUserProfile(ctx.from!.id).isOwner`. Везде по коду — единый источник: registry.
**Acceptance:** `grep "OWNER_USER_ID" src/` показывает только определение в config.ts (1 место).

### MED-02 — ownerId через эвристику в invites.ts
**Файл:** `src/containers/invites.ts:96-101`
**Симптом:** `ALLOWED_USERS.find(id => !NEW_GUEST_USERS.includes(id))` — хрупко.
**Фикс:** Использовать `UserRegistry.getAllUsers().find(u => u.role === "owner")?.userId`.
**Acceptance:** инвайт-нотификация всегда уходит owner'у даже при сложных порядках ALLOWED_USERS.

### MED-03 — `UserRegistry._cache` lazy + mutable globals
**Файл:** `src/config.ts:62-69, 272-280, 1020`
**Симптом:** Ленивый кэш + `NEW_GUEST_USERS.push` без bound → дрейф с диском, memory growth.
**Фикс:**
- Добавить TTL на UserRegistry cache (например 60 сек) или явный invalidate при `addUser`/`saveUser`.
- `NEW_GUEST_USERS` сделать `Set<number>`, не Array.
- Чистить sticky-cache при первом успешном approve.
**Acceptance:** После manual `vim users.json` и 60 секунд ожидания — `getUserProfile` видит изменения без рестарта.

### MED-04 — `NEW_GUEST_USERS` hardcoded fallback
**Файл:** `src/config.ts:74-78`
**Симптом:** Если env пустой — 7 ID автоматически guests.
**Фикс:** Заменить fallback на `[]`. Полагаться только на env + registry.
**Acceptance:** При пустом `NEW_GUEST_USERS` env — массив пустой.

### MED-05 — нет audit-логирования отказов в авторизации
**Файлы:** `src/utils.ts:95-107` (auditLogAuth определён), все хендлеры (вызывают `ctx.reply("Unauthorized")`)
**Фикс:** В каждом `if (!isAuthorized(...))` → `await auditLogAuth(userId, ctx.from?.username, false)` перед reply.
**Acceptance:** Попытка от non-allowed userId → запись в `/tmp/claude-telegram-audit.log` с типом `auth_denied`.

### MED-06 — нет rate-limit на subscription recheck
**Файл:** `src/handlers/callback.ts` (subscription:check)
**Симптом:** invalidateSubscription cache → спам по `getChatMember` через таппы.
**Фикс:** Добавить cooldown 5 сек на subscription:check (per-userId Map с timestamp последнего вызова).
**Acceptance:** Гость спамит «Я подписался» → второй тап в течение 5 сек игнорируется с ответом «подождите».

### MED-07 — vault rw bind-mount + симлинк-trickery через TEMP_PATHS
**Файл:** `src/containers/spec.ts:78-83`
**Симптом:** Гость через `ln -s /tmp/telegram-bot /opt/vault/<id>/inbox-link` обходит изоляцию (через `realpathSync` → TEMP_PATHS allow).
**Фикс:** Закрывается через HIGH-07 (убрать `/tmp/telegram-bot/` из TEMP_PATHS).
**Acceptance:** После HIGH-07 — гость не может прочитать чужой inbox через symlink.

### MED-08 — vault-quota TOCTOU 60s
**Файл:** `src/containers/vault-quota.ts:39-41`
**Симптом:** За 60 сек гость через bash-mcp пишет 20GB.
**Фикс:**
1. Сократить TTL до 5-10 сек.
2. После каждого `containerManager.exec` (или хотя бы для команд, которые пишут — `wget`, `dd`, `cat >`) вызывать `invalidateQuotaCache(userId)`.
3. Долгосрочно — kernel project quota (ext4 + tune2fs -O project; задача на отдельный этап).
**Acceptance:** Гость пишет 5GB через `dd` → следующая проверка (через 5 сек) ловит превышение.

### MED-09 — vision branch не прерывается
**Файл:** `src/session.ts:566-603`
**Симптом:** Vision создаёт `visionAbort` локально, `this.abortController` остаётся null. `stop()` не имеет на что повлиять.
**Фикс:** В vision-ветке выставить `this.isQueryRunning = true; this.abortController = new AbortController()` перед запросом. Соединять с `visionAbort` через `AbortSignal.any`. В `finally` — сбросить обратно.
**Acceptance:** Пользователь шлёт `!` посреди vision-запроса → запрос реально отменяется в течение секунды.

### MED-10 — гость может писать в свой `settings.json`
**Файлы:** `src/config.ts:204-228`, `src/containers/manager.ts:572-579`
**Симптом:** `.claude/settings.json` гостя в writable vault. Гость может его переписать.
**Фикс:**
1. Положить `settings.json` гостя в `/var/lib/claude-bot/users/<id>/.claude/settings.json` (host-side, root-owned).
2. Bind-mount этот путь в контейнер как `:ro`.
3. На каждый старт сессии (или на restart контейнера) перезаписывать canonical-версию (не доверять файлу гостя).
**Acceptance:** Гость через bash-mcp `cat > /opt/vault/123/.claude/settings.json` не влияет на permissions модели — settings берётся из host-side read-only mount.

### MED-11 — гость может подменить свой CLAUDE.md
**Файл:** `src/config.ts:189-195`
**Симптом:** Bootstrap пишет CLAUDE.md только если файл отсутствует. Гость переписывает.
**Фикс:** Положить CLAUDE.md гостя read-only (как в MED-10). Либо: на каждый старт сессии проверять hash и перезаписывать при несовпадении.
**Acceptance:** Подмена CLAUDE.md в vault не меняет system memory модели.

### MED-12 — firewall не покрывает IPv6
**Файл:** `scripts/firewall/setup-guest-network.sh:41-57`
**Симптом:** Только `iptables`, не `ip6tables`.
**Фикс:** Зеркалировать DROP-правила в `ip6tables` для интерфейса `claude-guest0` (если Docker network имеет IPv6 — проверить через `docker network inspect claude-guest-net`).
**Acceptance:** `ip6tables -L INPUT -n | grep claude-guest0` показывает правила.

### MED-13 — daemons обходят idle-pause
**Файл:** `src/containers/manager.ts:73-79, 298-308`
**Симптом:** Гость через `.daemons.yaml: enabled: true` держит контейнер 24/7.
**Фикс:**
1. Whitelist для daemon-команд (только `["python3", "node", "bun"]` — без `sleep infinity`).
2. Лимит количества always-on контейнеров (max 3).
3. Free-tier не имеет права на enabled daemons (проверка по `profile.tier`).
**Acceptance:** Гость с `cmd: ["sleep", "infinity"]` в `.daemons.yaml` получает отказ на старте daemon'а.

### MED-14 — `compactIfNeeded` дропает транскрипты
**Файл:** `src/session.ts:411-414`
**Симптом:** Сбрасывает `transcriptRecorder = null` без вызова `runBackgroundAnalysis`. Pre-compaction история не попадает в memory analyzer.
**Фикс:** Перед обнулением — `await this.transcriptRecorder.close()` + fire-and-forget `runBackgroundAnalysis(...)`.
**Acceptance:** После compaction в memory/ остаётся запись о pre-compaction turns.

### MED-15 — `currentUsage` overwrite per-turn
**Файл:** `src/session.ts:843-863`
**Симптом:** Multi-turn запрос — последний `assistant` event перетирает usage предыдущих. На abort — биллится только последний turn.
**Фикс:** Аккумулировать:
```ts
this.currentUsage = {
  input: (this.currentUsage?.input ?? 0) + (turn.input ?? 0),
  output: (this.currentUsage?.output ?? 0) + (turn.output ?? 0),
};
```
На `result` event SDK сам отдаёт aggregate — там overwrite уже корректен.
**Acceptance:** Abort посреди 3-turn запроса → SUM из metering для requestId совпадает с реальным расходом.

### MED-16 — `IdleHeartbeat.rotatePhrase` спамит при 429
**Файл:** `src/handlers/streaming.ts:367-380`
**Симптом:** Heartbeat продолжает редактировать сообщение при retry_after ≤ 30 сек.
**Фикс:** Останавливать на любом 429.
**Acceptance:** При 429 от Telegram — heartbeat паузится до конца запроса.

### MED-17 — heartbeat фаерит до старта query
**Файл:** `src/handlers/streaming.ts:453-455, 302-309`
**Симптом:** При очереди container-slot >15с пользователь видит «✨ думаю…» до того, как реально что-то делается.
**Фикс:** Перенести `heartbeat.start()` ПОСЛЕ acquire container slot / lock.
**Acceptance:** Симуляция: 5+ concurrent гостей → новый запрос не показывает «✨ думаю…» до того, как реально начал обрабатываться.

### MED-18 — exit-code-1 suppression слишком permissive
**Файл:** `src/session.ts:1101-1124`
**Симптом:** Маскирует легитимные post-result crashes.
**Фикс:**
1. Сузить условие: подавлять только если `queryCompleted=true AND errorMessage matches /AbortError|cancelled|aborted/`.
2. Логировать stderr полностью при подавлении.
3. Добавить счётчик `metrics.session.exit1_suppressed` (хотя бы в console.warn для будущей graafana).
**Acceptance:** В логах видно, сколько раз exit-code-1 был подавлен; не подавляется crash который НЕ выглядит как abort.

### MED-19 — `timingSafeEqual` бросает на non-hex hash
**Файл:** `src/dashboard-server.ts:154-158`
**Симптом:** Если `hash` в initData не hex — `Buffer.from("xyz", "hex")` короче 32 байт → `timingSafeEqual` throws → 500 вместо 401.
**Фикс:**
```ts
if (!/^[0-9a-f]{64}$/.test(hash)) return null;
```
Или try/catch вокруг `timingSafeEqual`.
**Acceptance:** Запрос с `hash=NOTHEX...` возвращает 401, не 500.

### MED-20 — notify-bridge на порту 3849 не в firewall
**Файлы:** `src/dashboard-server.ts:719`, `scripts/firewall/docker-user-rules.sh:16`
**Симптом:** `Bun.serve({ port: 3849 })` на `0.0.0.0`, firewall не DROP'ает 3849 для гостевой сети.
**Фикс:**
1. Добавить `3849` в `HOST_PORTS` массив в `docker-user-rules.sh` И `setup-guest-network.sh`.
2. В `Bun.serve` указать `hostname: "127.0.0.1"` (или адрес docker-bridge).
3. Перезапустить firewall (`bash scripts/firewall/docker-user-rules.sh` на сервере — после твоего деплоя).
**Acceptance:** Из guest container `curl http://172.x.x.1:3849` → connection refused.

### MED-21 — YuKassa webhook IP через x-forwarded-for
**Файл:** `src/dashboard-server.ts:440-448`
**Симптом:** Доверие к header'у. Если бот напрямую на 3848 без nginx — spoofable.
**Фикс:** Использовать `server.requestIP(req)` (Bun-native, не header). Если за nginx — задокументировать в `CLAUDE.md` что nginx должен ставить `x-real-ip` и читать только его.
**Acceptance:** Запрос с подделанным `X-Forwarded-For: 185.71.76.1` от другого IP отвергается.

### MED-22 — нет index `(user_id, ts)` в metering
**Файл:** `src/metering.ts:36-37`
**Симптом:** На больших объёмах rolling-window query будет full-scan.
**Фикс:** Добавить `CREATE INDEX IF NOT EXISTS idx_usage_user_ts ON usage(user_id, ts)`.
**Acceptance:** `EXPLAIN QUERY PLAN SELECT ... WHERE user_id=? AND ts>=?` использует `idx_usage_user_ts`.

### MED-23 — vision metering пропускается при usage=0
**Файл:** `src/engines/openrouter.ts:793-808`
**Симптом:** Если OpenRouter не вернул usage chunk — `recordUsage` не вызывается, запись теряется.
**Фикс:** Всегда вызывать `recordUsage` даже с нулями. Дополнительно — `console.warn` для отслеживания.
**Acceptance:** Каждый vision-запрос имеет хотя бы одну запись в `usage` SQLite.

### MED-24 — нет limit длины prompt в `generate_image`
**Файл:** `src/engines/openrouter.ts:433-434`
**Симптом:** `args.prompt` через `encodeURIComponent` в URL без bound.
**Фикс:** `const safePrompt = (args.prompt ?? "").slice(0, 500);`
**Acceptance:** Очень длинный prompt от модели → URL ≤ 2048 символов.

### MED-25 — `buildMultipartContent` хрупкий guard
**Файл:** `src/engines/openrouter.ts:124`
**Симптом:** `parts.length > 1` — зависит от того, что default text «Что на изображении?» всегда есть.
**Фикс:** Изменить на `parts.length > 0 ? parts : text;` + комментарий, объясняющий почему обязательно есть хотя бы один part.
**Acceptance:** Логика не зависит от наличия default-promt.

### MED-26 — text fallback гостя использует `visionModel`
**Файл:** `src/session.ts:637-639`
**Симптом:** Для text-only сообщения от нового гостя без DeepSeek key — используется `visionModel`. Gemini Flash дороже text-model.
**Фикс:**
- Завести в profile отдельные поля: `model` (text), `visionModel` (для фото).
- В text-fallback ветке использовать `this.profile.model`, не `visionModel`.
**Acceptance:** Текстовое сообщение нового гостя → запрос идёт через text-модель (например `deepseek/deepseek-v4-flash`), не через `google/gemini-2.5-flash`.

### MED-27 — `MAX_FILE_SIZE` 500MB — dead code
**Файл:** `src/handlers/document.ts:717-729`
**Симптом:** Первый чек на 500MB никогда не срабатывает — раньше срабатывает Telegram-лимит 20MB.
**Фикс:** Либо удалить первый чек (dead), либо изменить `MAX_FILE_SIZE` на 20MB и удалить второй (`TG_API_LIMIT`).
**Acceptance:** Один чек, понятное сообщение «файл больше 20MB».

### MED-28 — cross-user filename collision в `downloadDocument`
**Файл:** `src/handlers/document.ts:155-157`
**Симптом:** Если `inboxDirFor` отдаёт shared path для двух гостей — sanitized name collision.
**Фикс:** Закрывается через HIGH-07 (per-user inbox dir). Дополнительно: добавить timestamp + 4-char random в имя файла (`${safeName}.${ts}.${rand}.${ext}`).
**Acceptance:** Гость 123 и гость 456 загружают `report.pdf` → два разных файла на диске.

### MED-29 — audio extension fallback на «bin»
**Файл:** `src/handlers/audio.ts:237-238`
**Симптом:** Whisper отвергает `.bin`.
**Фикс:** Fallback на `.mp3`. Дополнительно — определять формат по MIME (`audio/mp4` → `.m4a` etc).
**Acceptance:** Аудио с расширением `.m4b` сохраняется как `.mp3` (или `.m4a` по mime), Whisper распознаёт.

### MED-30 — rate-limit не на album-photos
**Файл:** `src/handlers/photo.ts:194-208`, `src/handlers/media-group.ts:120-128`
**Симптом:** Rate-limit срабатывает только на первое фото альбома. До 10 фото на один rate-limit-токен.
**Фикс:** Документировать в коде («1 альбом = 1 rate-limit charge»), либо charge'ить N токенов за N фото.
**Acceptance:** Поведение явно задокументировано в `media-group.ts` (комментарий).

### MED-31 — media-group обработка вне user-lock
**Файл:** `src/handlers/media-group.ts:141-146`
**Симптом:** `setTimeout` fires вне `acquireUserLock`. Новое сообщение того же гостя может стартовать query параллельно с альбомом.
**Фикс:** В `processGroup` callback — `await acquireUserLock(userId)` перед вызовом `processCallback`. Если занято — попробовать `isUserBusy` → отложить альбом ещё на 1 сек / отказать.
**Acceptance:** Гость шлёт альбом + сразу текст → текст ждёт обработки альбома, не идёт параллельно.

---

## 5. ЭТАП 4 — low (LOW-01 .. LOW-27)

Code quality, документация, defense-in-depth. Делать опционально, по мере спокойствия.

---

### LOW-01 — дублирующиеся welcome-сообщения при race approve
**Файл:** `src/handlers/callback.ts:343-378, 412-429`
**Фикс:** Переместить `removePendingInvite` сразу после `getPendingInvite` (под exclusive lock).

### LOW-02 — invite callback parser слабый
**Файл:** `src/handlers/callback.ts:50-53`
**Фикс:** Регекс `/^invite_(approve|deny)_(\d{1,15})$/` с явной валидацией.

### LOW-03 — `GUEST_COMMANDS` содержит `"restart"`, docstring врёт
**Файл:** `src/handlers/commands.ts:8`, `src/config.ts:990`
**Фикс:** Решить — либо убрать `restart` из `GUEST_COMMANDS`, либо обновить docstring.

### LOW-04 — `~`-replace неполный в `isPathAllowedFor`
**Файл:** `src/security.ts:78`
**Фикс:** Если важно — обработать `~user/` через `os.userInfo()`. Иначе оставить как есть и задокументировать.

### LOW-05 — `/tmp:exec` в контейнере
**Файл:** `src/containers/spec.ts:157`
**Фикс:** Оставить exec (нужен Claude CLI), но добавить AppArmor profile.

### LOW-06 — hardcoded `claude-guest0` без алерта
**Файл:** `scripts/firewall/docker-user-rules.sh:13`
**Фикс:** В `containerManager.init()` проверять `iptables -L INPUT | grep claude-guest0`. Если нет — `console.warn` или health-webhook алерт.

### LOW-07 — lxcfs fallback скрывает утечку /proc
**Файл:** `src/containers/manager.ts:464-471`
**Фикс:** Не fallback'аться без lxcfs. Уронить старт контейнера с явной ошибкой.

### LOW-08 — `consumeInterruptFlag` partial reset
**Файл:** `src/session.ts:262-269`
**Фикс:** Всегда сбрасывать `stopRequested = false`, не зависеть от `was`.

### LOW-09 — `getSession` Map не expires
**Файл:** `src/session-registry.ts:18-28`
**Фикс:** Periodic timer `setInterval(() => evictInactive(24*3600*1000), 3600*1000)`.

### LOW-10 — typing indicator one-shot leak после stop
**Файл:** `src/utils.ts:195-217`
**Фикс:** Использовать `AbortController` и передавать signal в `Bun.sleep`.

### LOW-11 — `DASHBOARD_ALLOW_MOCK` не в `.env.example`
**Файл:** `.env.example`
**Фикс:** Добавить строку `# DASHBOARD_ALLOW_MOCK=` с комментарием.

### LOW-12 — `BOT_USERNAME` interpolated bare в JS
**Файл:** `src/dashboard-server.ts:477,495`
**Фикс:** Заменить `"...${botUsername}"` на `"..." + ${JSON.stringify(botUsername)}`.

### LOW-13 — rate-limiter state in-memory
**Файл:** `src/security.ts:21`
**Фикс:** Документировать поведение в коде. Для текущего масштаба (1 owner) — приемлемо. Если scale — мигрировать в metering SQLite.

### LOW-14 — zip-bomb guard обходится malformed listing
**Файл:** `src/handlers/document.ts:44-50`
**Фикс:** Если `match === null` — fail-safe: отказать (вместо `totalSize = 0`).

### LOW-15 — `replyFriendly` сам бросает на Telegram-down
**Файл:** `src/utils.ts:233-250`
**Фикс:** Обернуть `ctx.reply` в try/catch с `console.error` fallback.

### LOW-16 — intent filter FP в `text.ts`
**Файл:** `src/handlers/text.ts:43-46`
**Фикс:** Уточнить регекс с учётом cyrillic word-boundary (использовать `(?:\W|^)варианты(?:\W|$)`).

### LOW-17 — silent drop в `processDocumentPaths`
**Файл:** `src/handlers/document.ts:614-616`
**Фикс:** Заменить `ctx.reply("❌ Failed to extract...")` на `replyFriendly(ctx, error, "documents")`.

### LOW-18 — English fallback message в `audio.ts`
**Файл:** `src/handlers/audio.ts:65-70`
**Фикс:** Заменить на «Транскрипция голоса не настроена. Обратитесь к админу.» (без упоминания env var).

### LOW-19 — `parallel_mcp` subtask `cwd` без валидации
**Файл:** `parallel_mcp/server.ts:162-173`
**Фикс:** Клампить `task.cwd` в `allowedPaths` или удалять поле для guest subtasks.

### LOW-20 — `checkPendingAskUserRequests` без `userId`
**Файл:** `src/session.ts:963`
**Фикс:** Передавать `this.profile.userId` как третий аргумент.

### LOW-21 — drop-box `ask-user-*.json` без TTL
**Файлы:** `ask_user_mcp/server.ts`, `src/handlers/streaming.ts`
**Фикс:** Periodic cleanup в `src/index.ts`: `setInterval(() => cleanupOldDropboxes(3600*1000), 600*1000)`. Удалить `/tmp/ask-user-*.json`, `/tmp/send-file-*.json`, `/tmp/connect-google-*.json` старше 1 часа.

### LOW-22 — `mcp-config.example.ts` ≠ `mcp-config.ts`
**Файл:** `mcp-config.example.ts`
**Фикс:** Раскомментировать `ask-user`, `send-file`, `parallel`, `pollinations-image` в example (общие для всех хостов). Или добавить комментарий объясняющий что прод-config содержит больше серверов.

### LOW-23 — pricing table hardcoded
**Файл:** `src/metering.ts:63-79`
**Фикс:** Вынести в `pricing.json` (или env-driven). Заодно — мониторить актуальность.

### LOW-24 — `getNewGuestOpenRouterKey` без кэша
**Файл:** `src/config.ts:92-101`
**Фикс:** Module-level Map<userId, key> с invalidation при approve.

### LOW-25 — нет retry на 429/503 в OpenRouter
**Файл:** `src/engines/openrouter.ts:574`
**Фикс:** Exponential backoff: max 2 retries, 1s + 2s.

### LOW-26 — hardcoded русский default prompt в vision
**Файл:** `src/engines/openrouter.ts:121`
**Фикс:** Если photo пришло без caption — детектить язык из `ctx.from?.language_code` или оставить нейтральный `"Describe the image."`.

### LOW-27 — audit-log token masking floor
**Файл:** `src/utils.ts:29`
**Фикс:** Снизить regex floor с `\d{8,12}` до `\d{6,12}` (будущая защита).

---

## 6. Тестирование после каждого этапа

После Этапа 1 (критические):
```bash
bun run typecheck
bun run start  # локально
# В Telegram (test bot @ORCH7_bot если деплоился, иначе локально):
# - послать voice от owner → ответ нормальный, после ответа нет фантомных «✨ думаю…» через 1 мин
# - послать photo от owner → vision-ответ, нет artifacts
# - попытаться (вручную через session.ts debug) Read /root/.claude/projects/* как guest → отказ
# - guest посылает текст «запусти fork bomb» → отказ от mcp__container__Bash
# - симулировать exit-code-1 (вручную через session crash) → recordUsage не дублируется
```

После Этапа 2 (high):
```bash
bun run typecheck
# - sandbox escape attempts (см. HIGH-04..06): пользователь шлёт через бот «'r''m' -rf /», «eval ...» — Claude должен попытаться выполнить, security.ts должен отвергать
# - test invite-флоу: два concurrent approve через разные клиенты Telegram → оба гостя в users.json
# - vault-quota: глянуть метрики event loop lag через `process.uptime` обвязку
# - dashboard auth: запрос с malformed initData → 401, не 500
```

После Этапа 3 (medium): smoke-тесты, нет хард acceptance — большинство фиксов улучшают качество, не закрывают активную дыру.

---

## 7. Известные нюансы (не баги — учитывать при работе)

1. **`mcp-config.ts` — per-host.** Не коммитить. На прод-сервере свой; на локали свой. CI деплой не трогает.
2. **Не деплоить `system/users.json` через rsync** — он live-database на сервере.
3. **Не деплоить `.env`** — у test и prod разные токены (см. `CLAUDE.md`).
4. **Exit code 1 после успешного запроса — нормально для SDK.** Подавляется в `session.ts` catch. См. memory `exit_code_1_is_abort_race.md`. После MED-18 — подавление сужается, но не убирается.
5. **Owner=292228713, hardcoded.** Если когда-нибудь будет multi-owner — см. MED-01 (нужна полная унификация через registry).
6. **Subscription gate (REQUIRED_CHANNEL_ID) — продуктовое требование, не security.** После HIGH-02 покрывает все entry points.
7. **Прод-сервер:** `root@89.167.125.175` (`proboi-bot`, `@proboiAI_bot`). Тест: `root@5.223.82.96` (`jinru`, `@ORCH7_bot`). Команды деплоя — в `CLAUDE.md`. **Не деплоить без явного «деплой» от пользователя.**

---

## 8. Прогресс (заполнять по ходу)

```
ЭТАП 1 (5/5):  [ ] CRIT-01  [ ] CRIT-02  [ ] CRIT-03  [ ] CRIT-04  [ ] CRIT-05
ЭТАП 2 (0/19): [ ] HIGH-01  [ ] HIGH-02  [ ] HIGH-03  [ ] HIGH-04  [ ] HIGH-05
                [ ] HIGH-06  [ ] HIGH-07  [ ] HIGH-08  [ ] HIGH-09  [ ] HIGH-10
                [ ] HIGH-11  [ ] HIGH-12  [ ] HIGH-13  [ ] HIGH-14  [ ] HIGH-15
                [ ] HIGH-16  [ ] HIGH-17  [ ] HIGH-18  [ ] HIGH-19
ЭТАП 3 (0/31): [ ] MED-01  ... [ ] MED-31
ЭТАП 4 (0/27): [ ] LOW-01  ... [ ] LOW-27
```

Отмечать `[x]` после коммита фикса. Если фикс пропущен с reasoning — `[~]` + одна строка почему.

---

## 9. ЭТАП 5 — RELIABILITY (REL-01 .. REL-23) + RESOURCE FAIRNESS (FAIR-01 .. FAIR-18)

Этот этап — отдельный аудит «что и почему падает» и «один шумный гость не должен мешать остальным». Источники: `audit-out/zone-8-reliability.md`, `audit-out/zone-9-fairness.md`.

**Этот этап — параллельный к Этапам 1-4.** Можно делать ДО или ПОСЛЕ — он не блокирует и не блокируется ими (пересечения помечены явно).

---

### 9A. RELIABILITY — стабильность процесса бота

#### REL-01 — `containerManager.withLock` Map течёт навсегда
**Severity:** critical
**Файл:** `src/containers/manager.ts:508-526` (около 523)
**Симптом:** `prev.then(() => next)` создаёт новый promise каждый раз; `this.locks.get(userId) === prev.then(() => next)` всегда false → `locks.delete` никогда не срабатывает. Map растёт навсегда, удерживая closures.
**Фикс:**
```ts
const chained = prev.then(() => next);
this.locks.set(userId, chained);
// ...
if (this.locks.get(userId) === chained) {
  this.locks.delete(userId);
}
```
**Acceptance:** после 1000 запросов от одного userId — `containerManager.locks.size <= N_active_users` (не 1000+).

---

#### REL-02 — `uncaughtException` / `unhandledRejection` только логирует
**Severity:** critical
**Файл:** `src/index.ts:62-67`
**Симптом:** После uncaughtException Node остаётся в неопределённом состоянии (открытые транзакции SQLite, висящие promises). Бот продолжает «работать», но в полу-сломанном runtime.
**Фикс:** Сделать `uncaughtException` → `console.error(...); process.exit(1)`. Полагаться на systemd `Restart=always`. Для `unhandledRejection` — оставить как warn, но ввести throttle (если >10/min — `process.exit(1)`).
**Acceptance:** Симулировать `throw` в обработчике через тестовый дебаг-флаг → процесс падает с кодом 1, systemd поднимает в течение 5 сек.

---

#### REL-03 — нет circuit-breaker для stuck container
**Severity:** critical
**Файл:** `src/containers/manager.ts:206-290`
**Симптом:** Если контейнер «застрял» (kernel D-state, NFS hang, FUSE stuck) — `docker exec` уходит в timeout каждый раз. Бот молча получает таймауты до ручного `docker restart`.
**Фикс:** Счётчик последовательных таймаутов per userId. После 5 timeout'ов в окне 5 минут — принудительный `docker kill && docker start` + DM owner с алертом. Сбрасывать счётчик на успешный exec.
**Acceptance:** Запустить `mcp__container__Bash` с `sleep infinity` 5 раз подряд → 6-й вызов автоматически рестартит контейнер.

---

#### REL-04 — `/tmp/claude-active-users.json` теряется при reboot
**Severity:** high
**Файл:** `src/session-registry.ts:38`
**Симптом:** `/tmp` чистится при reboot хоста (Hetzner maintenance, kernel update). Пользователи, активные минуту назад, не получают restart-уведомление.
**Фикс:** Перенести `ACTIVE_USERS_FILE` из `/tmp/` в `/var/lib/claude-tg-bot/active-users.json` или `/opt/claude-tg-bot/runtime/active-users.json`. Создать директорию в deploy/Dockerfile.
**Acceptance:** После `reboot` файл существует и содержит users из предыдущей сессии.

---

#### REL-05 — idle pause race с inflight exec
**Severity:** high
**Файл:** `src/containers/manager.ts:355-373` + `:206-242`
**Симптом:** `pause()` берёт lock, видит state=running, делает `docker pause`. Если между snapshot'ом state и pause'ом успел стартануть `exec` — команда зависает в pause'нутом контейнере, истекает по таймауту с пустым stderr.
**Фикс:** Держать `withLock` на всё время `execFileAsync`, не освобождать перед вызовом. Минус — теряется параллелизм exec'ов для одного юзера, но для UX это правильно (sequential).
**Acceptance:** Симуляция: pause-timer firing while exec пушит команду → exec доходит до конца, pause выполняется после.

---

#### REL-06 — OOMkiller может выбрать сам бот
**Severity:** high
**Файлы:** systemd unit `claude-tg-bot.service` на сервере + `src/containers/spec.ts:103-108`
**Симптом:** Под глобальным OOM-давлением (10 контейнеров × 512MB + рост bot) kernel OOMkiller глядит на `oom_score`. Bun-процесс бота со 200+ MB RSS — кандидат на отстрел.
**Фикс:**
1. В systemd-unit добавить `OOMScoreAdjust=-500`.
2. В `spec.ts` для гостевых контейнеров добавить `--oom-score-adj=500`.
3. На сервере: `systemctl edit claude-tg-bot` → дописать `[Service]\nOOMScoreAdjust=-500`. **Это деплой — сделать вручную с подтверждением.**
**Acceptance:** `cat /proc/$(pgrep -f "bun.*src/index.ts")/oom_score_adj` показывает -500. У гостевых контейнеров — `+500`.

---

#### REL-07 — `ensureDocker` cache навсегда
**Severity:** high
**Файл:** `src/containers/manager.ts:634-649`
**Симптом:** `dockerAvailable=false` запоминается навсегда. После `apt upgrade docker-ce` (dockerd рестарт 5 сек) бот навсегда в noop-режиме до своего рестарта.
**Фикс:** TTL-cache на 30 секунд: `{ value: boolean, ts: number }`. Если `Date.now() - ts > 30000` — re-probe.
**Acceptance:** Симуляция: timing-mock на `docker --version` (первый раз fail, второй раз через 31 сек ok) → `ensureDocker` возвращает true на второй раз.

---

#### REL-08 — `RESTART_FILE` 30s window — фантомный edit чужого сообщения
**Severity:** high
**Файл:** `src/index.ts:294-313`
**Симптом:** Если startup >30 сек (image-pull, FS-fsck), `RESTART_FILE` устарел, но `unlink` ещё не сделан. При очень медленном startup — `editMessageText` может попасть в чужой message_id (новое сообщение от того же юзера).
**Фикс:** При чтении RESTART_FILE сравнить `data.ts` с `bot.startTime`. Если `data.ts > bot.startTime - 30000` — патчить, иначе не трогать.
**Acceptance:** Симуляция: `RESTART_FILE.ts = bot.startTime - 60000` → editMessageText не вызывается.

---

#### REL-09 — `containerManager.init()` always-on revive sequential
**Severity:** high
**Файл:** `src/containers/manager.ts:176-190`
**Симптом:** 10 always-on гостей × 5s docker start = 50s блокирующего startup, бот не отвечает.
**Фикс:** Заменить `for ... await getOrStart` на `await Promise.allSettled(alwaysOn.map(p => this.getOrStart(p)))`. Логирование по каждому — внутри `getOrStart`.
**Acceptance:** Startup-time бота на 10 always-on юзерах < 15 секунд (вместо 50+).

---

#### REL-10 — `--ulimit=nofile=1024:2048` без host-budget
**Severity:** high
**Файл:** `src/containers/spec.ts:135`
**Симптом:** 10 контейнеров × 2048 FDs = 20K FDs. Host-уровневый лимит на UID 1000 (общий для всех гостей) может быть 4096. → open() начнёт фейлить.
**Фикс:** Один из вариантов:
- (a) Снизить `nofile` до 512 (хватит для типичных bash+node+python скриптов).
- (b) На сервере: `/etc/security/limits.d/sandbox.conf` поднять `* nofile 131072` для UID 1000.
- (c) Долгосрочно: per-user UID (см. FAIR-08).
**Acceptance:** `ulimit -n` внутри контейнера = 512 (если выбран вариант a) или host limit достаточен.

---

#### REL-11 — `IdleHeartbeat` timers без `unref()`
**Severity:** medium
**Файлы:** `src/handlers/streaming.ts:295-381`, `src/index.ts:446`, `src/crashloop-watcher.ts:113-117`
**Симптом:** На SIGTERM Node ждёт завершения всех активных timer'ов. systemd ждёт до `TimeoutStopSec` (90 сек по умолчанию). Long-polling уже остановлен → пользователи висят.
**Фикс:** К каждому top-level `setInterval`/`setTimeout` дописать `.unref?.()`. Pattern уже есть в `manager.ts:369-370`.
**Acceptance:** `systemctl restart claude-tg-bot` завершается за < 5 секунд.

---

#### REL-12 — `setInterval(chargeExpiredTrials, 6h)` без unref
**Severity:** medium
**Файл:** `src/index.ts:446`
**Фикс:** То же что REL-11 — добавить `.unref()`.

---

#### REL-13 — `setInterval(processOnce, 30s)` в `crashloop-watcher` без unref
**Severity:** medium
**Файл:** `src/crashloop-watcher.ts:113-117`
**Фикс:** То же что REL-11.

---

#### REL-14 — `fs.appendFile` в audit-log на каждое событие
**Severity:** medium
**Файл:** `src/utils.ts:67-68`
**Симптом:** Dynamic import + open+write+close на каждый audit event. Под 10 RPS — 30 syscalls/sec. Под disk-pressure — блокирует event loop.
**Фикс:** При старте бота создать `const auditStream = fs.createWriteStream(AUDIT_LOG_PATH, { flags: 'a' })`. `auditStream.write(line)` неблокирующий. Закрывать на SIGTERM.
**Acceptance:** В hot-path audit-log нет `import()` и `appendFile`; используется stream.write.

---

#### REL-15 — `run(bot)` без `onError`
**Severity:** medium
**Файл:** `src/index.ts:449`
**Симптом:** grammY runner может тихо стопиться на network errors (DNS fail, Telegram 502).
**Фикс:**
```ts
const runner = run(bot, {
  runner: { silent: false, retryInterval: 'exponential' },
});
```
Дополнительно — счётчик consecutive errors; >10 за минуту → `process.exit(1)`.
**Acceptance:** При симуляции `iptables -A OUTPUT -d api.telegram.org -j DROP` (на тесте) — бот не зависает, ошибки видны в логах.

---

#### REL-16 — exit code/signal disambiguation
**Severity:** medium
**Файл:** `src/containers/manager.ts:283-287`
**Симптом:** SIGKILL изнутри контейнера (OOMkiller убил процесс) — `e.code=null, e.signal='SIGKILL'`, попадает в exit code 1, неотличимо от обычной ошибки.
**Фикс:** Возвращать в `ExecResult` дополнительное поле `signal`. Caller (`bash-mcp.ts`) при `signal==='SIGKILL'` отдаёт пользователю «команда исчерпала память».
**Acceptance:** `dd if=/dev/zero of=/dev/null bs=1G count=10` под `--memory=64m` → пользователь видит «исчерпана память», не «exit code 1».

---

#### REL-17 — `SIGTERM`-handler не ждёт inflight
**Severity:** medium
**Файл:** `src/index.ts:459-468`
**Симптом:** `stopRunner(); process.exit(0)` обрывает активные `sendMessageStreaming` и MCP subprocess'ы.
**Фикс:**
```ts
process.on("SIGTERM", async () => {
  console.log("SIGTERM — graceful shutdown");
  const sessions = getAllSessions();
  await Promise.allSettled(sessions.map(s => s.stop()));
  await runner.stop();
  process.exit(0);
});
```
Дать systemd `TimeoutStopSec=30s`.
**Acceptance:** `systemctl restart` во время длинного запроса → пользователь получает финальный текст или явное «бот перезапускается, попробуй заново».

---

#### REL-18 — concurrent exec на absent container
**Severity:** medium
**Файл:** `src/containers/manager.ts:223-242`
**Симптом:** 5 параллельных `exec` на absent контейнер → 5 ошибок «exec called on absent container».
**Фикс:** Хранить last-known `profile` в `ContainerManager` (Map<userId, profile>). При `exec` если контейнер absent — попытаться `getOrStart` сам.
**Acceptance:** После `containerManager.remove(123)` 5 concurrent `exec(123, ...)` — все 5 успешно стартуют контейнер и выполняются.

---

#### REL-19 — `StreamingState.cleanup` не nulls `_heartbeat`
**Severity:** low
**Файл:** `src/handlers/streaming.ts:282-288`
**Фикс:** После `_heartbeat?.stop()` сделать `this._heartbeat = null`. Защита от двойного cleanup.

---

#### REL-20 — `notifyOwnerDM` молча проглатывает ошибки
**Severity:** low
**Файл:** `src/owner-alerts.ts:24-28`
**Фикс:** `catch` → `console.error("[owner-alert] failed to send:", err)`. Опционально — fallback в audit-log.

---

#### REL-21 — health-webhook 3847 без replay protection
**Severity:** low
**Файл:** `src/index.ts:393-434`
**Фикс:** Добавить HMAC signature header (как dashboard) или хотя бы timestamp с 60-сек окном.

---

#### REL-22 — `armSilenceTimer` пересчитывает 15s заново
**Severity:** low
**Файл:** `src/handlers/streaming.ts:331-336`
**Фикс:** Если уже идёт tick — не сбрасывать silence timer.

---

#### REL-23 — `hasActiveDaemons` без cache
**Severity:** low
**Файл:** `src/containers/manager.ts:72-78`
**Фикс:** Module-level Map<userId, {value: boolean, ts: number}> с TTL 10 секунд.

---

### 9B. RESOURCE FAIRNESS — гость не должен ронять остальных

#### FAIR-01 — нет disk-IO лимитов
**Severity:** critical
**Файл:** `src/containers/spec.ts:99-205` (отсутствие флагов)
**Симптом:** Гость через `dd`, `yt-dlp`, `tar` насыщает NVMe и замораживает overlay-FS для всех гостей и хост-бота. Это **самая зияющая дыра** в fairness.
**Фикс:**
1. На старте `containerManager.init()` определить устройство vault: `df /opt/vault | tail -1 | awk '{print $1}'`. Сохранить в переменной.
2. В `spec.ts` для non-owner ветки добавить:
   ```ts
   args.push("--blkio-weight=500");
   args.push("--device-write-bps", `${vaultDev}:50m`);
   args.push("--device-read-bps",  `${vaultDev}:100m`);
   args.push("--device-write-iops", `${vaultDev}:2000`);
   args.push("--device-read-iops",  `${vaultDev}:4000`);
   ```
3. Значения брать из `profile.tierConfig` (см. FAIR-05).
**Acceptance:** Гость через `dd if=/dev/zero of=big bs=1M count=1000` пишет не быстрее 50 MB/s. Другие гости и бот работают нормально (latency `getUpdates` < 1с).

---

#### FAIR-02 — concurrent-slot semaphore без timeout/priority
**Severity:** critical
**Файл:** `src/request-queue.ts:7-10, 53-66`
**Симптом:** `MAX_CONCURRENT_CONTAINER_SESSIONS=5` без timeout на удержание. Один долгий MCP-call (5 минут `yt-dlp`) держит слот. 5 параллельных тяжёлых запросов от любых 5 гостей — DoS для остальных.

**Связано с:** HIGH-15 (slot leak window). REL-03 (stuck container).

**Фикс:**
1. `acquireContainerSlot(timeoutMs: number = 60000)` — `Promise.race([waitForSlot, timeout])`. На timeout — отказать с понятным сообщением «бот перегружен, попробуй через минуту».
2. Hard-timeout на удержание слота (например 5 минут). После этого — forced release + alert owner.
3. Per-user priority через `profile.tierConfig.tier`: paid → отдельная очередь / выше приоритет.
**Acceptance:** Гость в ожидании > 60 сек получает «попробуй позже», слот не висит навсегда.

---

#### FAIR-03 — нет egress rate-limit для burst
**Severity:** critical
**Файлы:** `src/containers/spec.ts` (нет ingress), `scripts/firewall/egress-monitor.sh:16` (throttle только при daily 20GB)
**Симптом:** Egress throttle включается только когда суммарный daily трафик > 20GB. До этого гость может 5-10 минут забирать весь 1 Gbit uplink. Бот не может стримить ответы остальным.
**Фикс:** Baseline `tc htb` cap на каждый container IP сразу при создании контейнера (например 20 mbit). При >20GB/day — снижение до 100 kbit (текущий штрафной режим).
1. Создать `scripts/firewall/set-baseline-egress.sh` — принимает IP, ставит tc htb 20 mbit.
2. Вызывать из `containerManager.getOrStart` сразу после `docker run` (получить IP через `docker inspect`).
3. Удалять правило при `docker rm`.
**Acceptance:** Гость через `wget` качает файл не быстрее 20 mbit/s. Другие гости не тормозят.

---

#### FAIR-04 — нет CPU-weight
**Severity:** high
**Файл:** `src/containers/spec.ts:111`
**Симптом:** `--cpus=1.0` — hard cap, но `cpu-shares` (или cgroup v2 `cpu.weight`) не выставлен. При burst всех 10 гостей одновременно CFS делит честно 1:1, но host-процесс бота не получает приоритета → пропускает Telegram polling.
**Фикс:**
- `args.push("--cpu-shares=512");` для гостей.
- В systemd-unit бота: `CPUWeight=1024`.
- Опционально — `nice -n 10` для гостевых процессов через ENTRYPOINT.
**Acceptance:** Под 100% CPU нагрузкой от 10 гостей — `getUpdates` latency бота < 2 сек.

---

#### FAIR-05 — `TierConfig` без resource-полей
**Severity:** high
**Файл:** `src/types.ts:94-120`
**Симптом:** Paid и free получают одинаковые 512MB/1CPU/2GB. Без resource-дифференциации платная подписка не имеет смысла.
**Фикс:** Расширить `TierConfig`:
```ts
export interface TierConfig {
  tier: UserTier;
  dailyMessageLimit: number | null;
  containerEnabled: boolean;
  voiceEnabled: boolean;
  fileEnabled: boolean;
  googleEnabled: boolean;
  // Resource limits
  memoryMb: number;
  cpus: number;
  cpuShares: number;
  pidsLimit: number;
  diskQuotaGb: number;
  diskWriteMbps: number;
  diskReadMbps: number;
  diskWriteIops: number;
  diskReadIops: number;
  egressDailyGb: number;
  egressBaselineMbps: number;
}
```
В `spec.ts` читать `profile.tierConfig.memoryMb` вместо хардкода `DEFAULT_GUEST_MEMORY_MB`.
**Acceptance:** Изменение `tierConfig.paid.memoryMb` в одном месте → все paid гости получают новый лимит при следующем restart контейнера.

---

#### FAIR-06 — host memory близок к границе
**Severity:** high
**Файл:** `src/containers/spec.ts:106-108`
**Симптом:** 7.6 GB - (10×512 + 1.28 tmpfs + 1 bot + 0.5 system) ≈ 0 свободно при пике. Один лишний tmpfs allocation от гостя → host OOM.
**Фикс:** Пакет:
1. Через FAIR-05: снизить free до 256MB, paid до 768MB.
2. `args.push("--memory-reservation", "${Math.floor(memMb/2)}m")` — soft guarantee.
3. tmpfs урезать до 64m: `args.push("--tmpfs=/tmp:size=64m,exec")` (см. FAIR-11).
4. REL-06 — OOM-score-adj.
**Acceptance:** Под нагрузкой 10 одновременных активных гостей — host имеет ≥1.5 GB free RAM.

---

#### FAIR-07 — daemons блокируют pause/stop без лимита
**Severity:** high
**Файлы:** `src/containers/manager.ts:46-47, 72-79`
**Симптом:** Гость с `.daemons.yaml: enabled: true` держит контейнер 24/7. 10 always-on = 5GB заблокированной RAM.

**Связано с:** MED-13 (whitelist daemon-команд).

**Фикс:**
1. Ввести константу `MAX_ALWAYS_ON = 5` (или `tierConfig.maxAlwaysOnDaemons`).
2. При попытке поднять always-on выше лимита — отказ + DM.
3. Опционально: «wake on schedule» (контейнер стартует из stopped по cron) вместо continuous-run.
**Acceptance:** 6-й гость пытается включить daemon → отказ «лимит always-on достигнут».

---

#### FAIR-08 — все гости делят host-UID 1000
**Severity:** high
**Файл:** `src/containers/spec.ts:147`, `src/containers/manager.ts:50-54`
**Симптом:** Host-уровневые per-UID лимиты (`fs.inotify.max_user_watches=8192`, `file-max`, shared memory) shared между всеми гостями.
**Фикс:** Два варианта:
- (a, проще) На хосте поднять sysctl:
  ```
  fs.inotify.max_user_watches=524288
  fs.inotify.max_user_instances=1024
  ```
  В `/etc/sysctl.d/99-claude-bot.conf`. Деплой вручную с подтверждением.
- (b, правильнее) Per-user UID: `useradd -u $((10000 + userId)) sandbox-<id>` + `chown -R` vault'а на этот UID. Требует существенной правки `manager.ts:50-54`.
**Acceptance:** Вариант (a) — `sysctl fs.inotify.max_user_watches` = 524288 на сервере.

---

#### FAIR-09 — нет `--memory-reservation`
**Severity:** medium
**Файл:** `src/containers/spec.ts:107-108`
**Фикс:** `args.push("--memory-reservation", "${Math.floor(memMb / 2)}m")`. См. FAIR-06.

---

#### FAIR-10 — очередь без timeout/ETA в UI
**Severity:** medium
**Файл:** `src/handlers/text.ts:212-213`
**Симптом:** Юзер видит «⏳ В очереди (N-й)» без ETA. Если слоты застряли — ждёт молча навсегда.
**Фикс:** Связано с FAIR-02. После `acquireContainerSlot(timeoutMs)` пользователь получит явный отказ. Опционально — обновлять статус каждые 10 сек с новой позицией.
**Acceptance:** Юзер ждёт > 60 сек → видит понятное «попробуй через минуту».

---

#### FAIR-11 — tmpfs не учитывается в memory cgroup
**Severity:** medium
**Файл:** `src/containers/spec.ts:157-159`
**Симптом:** `--tmpfs=/tmp:size=128m` живёт в page cache хоста, не в cgroup контейнера. Реальный committed RAM = 512 + 128 = 640 MB на гостя.
**Фикс:** Проверить эмпирически на сервере: внутри контейнера `dd if=/dev/zero of=/tmp/big bs=1M count=100`, потом `cat /sys/fs/cgroup/memory.current` — учлось или нет. Если не учлось → урезать до 64m или сменить на bind-mount.
**Acceptance:** `memory.current` гостя при заполнении tmpfs растёт пропорционально (учёт работает).

---

#### FAIR-12 — `getContainerMetrics` блокирует docker daemon
**Severity:** medium
**Файл:** `src/containers/metrics.ts:181-202`
**Симптом:** `docker stats --no-stream` per-container в `Promise.all` — 10 параллельных API calls. Тормозит docker daemon.
**Фикс:** `docker stats --no-stream --format ...` без указания контейнеров — вернёт все running контейнеры одним вызовом. Распарсить вывод per-container.
**Acceptance:** `getAllContainerMetrics()` для 10 гостей возвращается за < 2 секунды (вместо 10+).

---

#### FAIR-13 — CPU% summ misleading
**Severity:** medium
**Файл:** `src/containers/metrics.ts:289-308`
**Симптом:** `cpu.percent` нормализован «100% per core». Sum 10 × 100% = 1000% на дашборде — мисли́д.
**Фикс:** В `metrics.ts:301` делить на `os.cpus().length` или показывать «X cores out of Y» вместо процента.
**Acceptance:** Дашборд показывает «использовано 3.2 из 4 ядер», не «использовано 320%».

---

#### FAIR-14 — vault quota не блокирует runtime запись
**Severity:** medium
**Файл:** `src/containers/vault-quota.ts:47-78`

**Связано с:** MED-08 (TOCTOU 60s).

**Фикс:**
- Краткосрочно: см. MED-08 — снизить TTL до 5-10 сек + invalidate после каждого `containerManager.exec`.
- Долгосрочно (отдельная задача): kernel-level quota. ext4 `prjquota` через `tune2fs -O project /dev/sdX` + remount. Или: loopback-file фиксированного размера на vault `fallocate -l 2G + mkfs.ext4 + mount`. **Это инфраструктурное изменение — отдельный этап.**
**Acceptance:** Закрывается через MED-08 на короткой дистанции; долгосрочное решение — задача в roadmap.

---

#### FAIR-15 — `GUEST_PIDS_OVERRIDES` не привязан к tier
**Severity:** low
**Файл:** `src/containers/spec.ts:42-43`
**Фикс:** Через FAIR-05 — добавить `tierConfig.pidsLimit`. В `spec.ts:128` читать `profile.tierConfig.pidsLimit ?? DEFAULT_GUEST_PIDS`.

---

#### FAIR-16 — egress throttle без градации
**Severity:** low
**Файл:** `scripts/firewall/egress-monitor.sh:17,184`
**Фикс:** Двухступенчатый throttle. Warning 5 mbit/s при 15 GB/day, hard 100 kbit/s при 25 GB/day. Per-tier лимиты через FAIR-05.

---

#### FAIR-17 — idle timer статичен
**Severity:** low
**Файл:** `src/containers/manager.ts:46`
**Фикс:** Адаптивный pause: если host memory > 80% — pause через 5 минут; < 50% — через 30 минут. Метрика через `os.freemem()` каждые 60 сек.

---

#### FAIR-18 — OOM score не настроен
**Severity:** low
**Файл:** `src/containers/spec.ts` (отсутствие флага)
**Фикс:** `args.push("--oom-score-adj=500")` для гостей. См. REL-06 (бот → -500).

---

### 9C. Рекомендованная схема лимитов для текущей машины

Цель: 8 paid + 2 free = 10 одновременных, оставить ≥1.5 GB RAM хосту, защититься от IO/CPU/network starvation.

**TierConfig поля (расширить `src/types.ts` через FAIR-05):**
```ts
const FREE_TIER: TierConfig = {
  tier: "free",
  memoryMb: 256,
  cpus: 0.5,
  cpuShares: 256,
  pidsLimit: 256,
  diskQuotaGb: 1,
  diskWriteMbps: 20,
  diskReadMbps: 50,
  diskWriteIops: 1000,
  diskReadIops: 2000,
  egressDailyGb: 5,
  egressBaselineMbps: 5,
  // ... остальные поля
};

const PAID_TIER: TierConfig = {
  ...,
  memoryMb: 768,
  cpus: 2.0,
  cpuShares: 1024,
  pidsLimit: 1024,
  diskQuotaGb: 5,
  diskWriteMbps: 100,
  diskReadMbps: 200,
  diskWriteIops: 4000,
  diskReadIops: 8000,
  egressDailyGb: 30,
  egressBaselineMbps: 30,
};
```

**Host-level бюджет (10 гостей, 7.6 GB RAM):**
- RAM: 8 × 768 + 2 × 256 = 6.6 GB — **слишком много**. Реальный сценарий: max 5 одновременно активных (idle pause освобождает) → 5 × 768 = 3.84 GB + 1 GB бот + 0.5 system = 5.3 GB committed, остаётся 2.3 GB. OK.
- CPU: 8 × 2.0 + 2 × 0.5 = 17 vCPU overcommit на 4 cores → 4.25x. CFS делит честно если `cpu-shares` гарантируют weight. Bot имеет `CPUWeight=1024` (приоритет).
- Disk: NVMe ~400 MB/s. 8 × 100 + 2 × 20 = 840 MB/s aggregated — overcommit, но не одновременно. Blkio-weight=500.
- Network: 1 Gbit uplink = 125 MB/s. 8 × 30 + 2 × 5 = 250 mbit baseline — overcommit OK.

**`MAX_CONCURRENT_CONTAINER_SESSIONS`:**
- На текущей машине (4-core, 7.6 GB) — понизить с 5 до **3**.
- На будущей машине 16 GB / 8-core — можно поднять до 6-8.

**Host-level (на сервере, деплой вручную):**
```bash
# systemd: бот в приоритете
systemctl edit claude-tg-bot
# добавить:
[Service]
OOMScoreAdjust=-500
CPUWeight=1024
IOWeight=1000
MemoryHigh=2G

# Inotify per-UID повысить
echo "fs.inotify.max_user_watches=524288" > /etc/sysctl.d/99-claude-bot.conf
echo "fs.inotify.max_user_instances=1024" >> /etc/sysctl.d/99-claude-bot.conf
sysctl --system
```

---

### 9D. Cascading-failure сценарии (для понимания, не отдельные фиксы)

Эти сценарии закрываются комбинацией фиксов выше. Перечислены для контекста, что мы защищаем:

1. **Гость с kernel D-state.** Python с C-extension в kernel-mode hang. `docker exec` уходит в timeout навсегда. → закрывает REL-03.
2. **Docker daemon рестартовался.** `apt upgrade docker-ce` после bot startup → `dockerAvailable=true` навсегда. → закрывает REL-07.
3. **50 сообщений за 10 сек.** `addPendingContext` без bound → биллинг улетает. → закрывает HIGH-03.
4. **OOMkiller убивает бот.** Под глобальным OOM кандидат — bun-процесс. → закрывает REL-06.
5. **Reboot Hetzner.** `/tmp/claude-active-users.json` пропадает → restart-уведомлений нет. → закрывает REL-04.
6. **100 always-on юзеров после crash.** Sequential revive 5 минут. → закрывает REL-09.
7. **Один гость съел host-UID FDs.** Inotify per-UID 8192. → закрывает FAIR-08.
8. **SQLite WAL contention.** Synchronous `recordUsage` блокирует event loop под нагрузкой. → не закрыто, см. roadmap.
9. **Telegram API 429 на массовое deleteMessage.** Long session × 20 tool-вызовов → 40 deleteMessage/sec. → не закрыто, см. roadmap (batched cleanup с retry-after persist).
10. **Disk full на `/var/lib/docker`.** Новые контейнеры не стартуют, юзер видит ❌ бесконечно. → не закрыто, нужен alert owner + временный containerDisabled.

---

## 10. Обновлённый прогресс (заполнять по ходу)

```
ЭТАП 1 (0/5):    [ ] CRIT-01  [ ] CRIT-02  [ ] CRIT-03  [ ] CRIT-04  [ ] CRIT-05
ЭТАП 2 (0/19):   [ ] HIGH-01  [ ] HIGH-02  [ ] HIGH-03  [ ] HIGH-04  [ ] HIGH-05
                  [ ] HIGH-06  [ ] HIGH-07  [ ] HIGH-08  [ ] HIGH-09  [ ] HIGH-10
                  [ ] HIGH-11  [ ] HIGH-12  [ ] HIGH-13  [ ] HIGH-14  [ ] HIGH-15
                  [ ] HIGH-16  [ ] HIGH-17  [ ] HIGH-18  [ ] HIGH-19
ЭТАП 3 (0/31):   [ ] MED-01 ... [ ] MED-31
ЭТАП 4 (0/27):   [ ] LOW-01 ... [ ] LOW-27
ЭТАП 5 RELIABILITY (0/23): [ ] REL-01 ... [ ] REL-23
ЭТАП 5 FAIRNESS   (0/18): [ ] FAIR-01 ... [ ] FAIR-18
```

Итого: **5 critical + 19 high + 31 medium + 27 low + 23 reliability + 18 fairness = 123 actionable фикса.**

Реальный порядок выполнения (рекомендация):
1. CRIT-01..05 (критические security)
2. FAIR-01, FAIR-02, FAIR-03 (критические fairness — disk-IO, slot timeout, egress burst)
3. REL-01, REL-02, REL-03 (критические reliability — leak, uncaught, stuck)
4. HIGH-01..19 (security/correctness high)
5. REL-04..10, FAIR-04..08 (high reliability/fairness)
6. MED + REL-medium + FAIR-medium вперемешку по логическим связкам
7. LOW в конце

Отмечать `[x]` после коммита фикса. Если фикс пропущен — `[~]` + причина.
