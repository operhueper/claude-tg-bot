# Lifecycle Audit: State Transitions, Resource Cleanup, Crash Recovery

Date: 2026-05-14
Scope: deleteUser, subscription expire/cancel, crash mid-session, container removed manually, /restart, /new, container pause, always-on daemon restart, vault not cleaned.

---

## V1. deleteUser — функции нет

**Дыра:** В `user-registry.ts` существует только `UserRegistry.saveUser()`, `UserRegistry.getUser()`, `UserRegistry.getAllUsers()`. Метода `deleteUser` или аналога нет вообще.

**Следствие:** Удалить пользователя из `users.json` можно только вручную редактируя файл на сервере. При этом:
- Vault `/opt/vault/<userId>/` — не удаляется
- Docker-контейнер — не удаляется
- Session file `/tmp/claude-telegram-session-<userId>.json` — не удаляется
- Memory graph (`memory/<userId>/graph.json`, `transcripts/`, `goals.json`) — не удаляется
- Consent file — не удаляется
- OpenRouter subkey — не отзывается (`openrouterKey` в users.json, реальный ключ в OpenRouter API остаётся живым)
- Metering записи — остаются в SQLite
- Ключ DeepSeek pool — не помечается отданным (но это in-memory, после рестарта стирается)

**Самый острый риск:** openrouterKey продолжает работать после удаления пользователя — чужой может получить его и делать запросы за счёт владельца бота. Никакого отзыва ключа нет в коде.

---

## V2. Subscription expire → downgrade — контейнер удаляется, vault нет

**Что происходит в `chargeExpiredTrials` (tasks.ts:168):**
1. Если grace_period_until истёк → `downgradeToFree(userId)` + `reclaimContainerForFreeUser(userId)` — вызывает `containerManager.remove(userId)`.
2. Если payment_method_id отсутствует → то же самое.

**Что НЕ происходит:**
- Vault `/opt/vault/<userId>/` сохраняется. Все файлы пользователя остаются. Это по замыслу (данные не теряются), но...
- **Дыра V2a:** Если в vault лежат материалы, которые пользователь оставил на paid-тарифе (код, документы), они остаются на сервере навсегда. После апгрейда обратно — пользователь получит их назад (хорошо), но это также означает неограниченное накопление данных free-пользователей.
- **Дыра V2b (связана с V-01 из VULNERABILITIES.md):** После даунгрейда `containerEnabled` ставится в `false` через `TIER_CONFIGS.free.containerEnabled = false` в `src/config.ts:1106`. Но profile-кэш в памяти (если есть) не инвалидируется. `getUserProfile()` не кэширует — читает из UserRegistry каждый раз, так что это безопасно. Однако `chargeExpiredTrials` не вызывает никакого browser-пуша или инвалидации сессии — при следующем запросе пользователь будет работать как free.
- **Дыра V2c:** `reclaimContainerForFreeUser` — async, вызывается fire-and-forget без ожидания результата в `chargeExpiredTrials`. Если он падает (docker unavailable), контейнер остаётся жить. `reapOrphanFreeContainers()` в конце `chargeExpiredTrials` должен подобрать это, но тоже может упасть. Нет алерта при провале.

**Что с `.daemons.yaml`:**
- Файл остаётся в vault. При следующем `containerManager.init()` (рестарт бота) `hasActiveDaemons(userId)` вернёт `true`, и `always-on` попробует поднять контейнер для теперь-free пользователя. `getOrStart(profile)` получит profile через `getUserProfile`, который увидит `containerEnabled: false` (через `TIER_CONFIGS.free.containerEnabled = false`) — но `getOrStart` принимает `UserProfile`, и если `profile.containerEnabled === false`, то `session.ts:806` пропустит `getOrStart`. Но `init()` в `manager.ts:258-270` фильтрует по `p.containerEnabled` — free-юзеры туда не попадают. Итого: `.daemons.yaml` молча игнорируется, дэмон не стартует. Это правильное поведение, но пользователь не получает уведомления.

---

## V3. /cancel — container НЕ удаляется

**Код (callback.ts:125-138):**
```
UserRegistry.saveUser({ ...user, payment_method_id: undefined });
```
Только очищает `payment_method_id`. `tier` остаётся `paid`, `subscription_expires` — не трогается. Доступ сохраняется до expiry.

**Что происходит дальше:** При следующем `chargeExpiredTrials` — payment_method_id отсутствует → `downgradeToFree` + `reclaimContainerForFreeUser`. Контейнер удаляется при expiry, не при cancel.

**Это правильное поведение** (пользователь платит до конца периода). Дыры нет — но важно задокументировать: vault остаётся даже после полного истечения.

---

## V4. Bot crash mid-session — session file atomic, subprocess orphan

**Session file write:** `saveSession()` использует write-to-tmp + `renameSync` — атомарный. Crash во время записи не corrupts session file.

**Running query на момент краша:**
- Claude CLI subprocess запущен через `@anthropic-ai/claude-agent-sdk`. Если процесс бота убивается (SIGKILL от systemd), subprocess получает SIGKILL тоже (поскольку systemd убивает cgroup целиком) или продолжает работать если он запущен в отдельном cgroup.
- **Дыра V4a:** subprocess может пережить SIGKILL бота, если systemd не убивает дочерние процессы агрессивно (зависит от `KillMode=control-group` в unit-файле). Нужно проверить unit: если `KillMode=process` (default), subprocess живёт дальше и продолжает делать вызовы к DeepSeek без ограничений. Orphan-процессы подбираются `/restart` через `killUserClaudeProcesses`, но только по запросу.
- **Дыра V4b:** Если subprocess работал внутри контейнера (`mcp__container__Bash` exec), незавершённые команды продолжают выполняться в контейнере. Нет механизма прерывания in-flight `docker exec` при краше бота.

**После рестарта бота:**
- `sessionId` загружается из session file — при следующем сообщении пользователь возобновит тот же session_id через `resume`. Это корректно.
- DeepSeek ключ в pool: `acquireDeepSeekKey()` возвращает ключ + release callback. При краше release не вызывается — `inFlight` счётчик остаётся повышенным. Но это in-memory структура — сбрасывается при рестарте. После рестарта счётчики обнуляются и все ключи снова свободны.

---

## V5. Container removed manually — exec fails gracefully

**Поведение:** если `docker rm -f claude-user-<id>` снаружи:
1. Следующий `session.sendMessageStreaming` вызывает `containerManager.getOrStart(profile)`.
2. `getOrStartUnlocked` делает `docker inspect` → получает "No such object" → state = "absent" → создаёт контейнер заново. Это восстановление.

**Дыра V5a:** Если `exec` вызывается напрямую (из mcp__container__Bash) без предварительного `getOrStart`:
- `exec()` в manager.ts:300-323 делает lock + `getStateUnlocked` → если "absent" логирует ошибку, выходит без создания контейнера.
- Следующий `docker exec` на отсутствующий контейнер вернёт stderr = "No such container" и exitCode = 1.
- Пользователь получит сообщение об ошибке от Bash, но сессия не зависнет. Следующее сообщение снова пройдёт через `getOrStart` и поднимет контейнер.
- **Это не критичная дыра** — graceful degradation есть.

**Дыра V5b (потенциальная):** Idle-таймеры (pause после 15 мин, stop после 24 ч) остаются активными даже если контейнер уже удалён. `pause(userId)` вызовет `docker pause` на несуществующий контейнер → `dockerArgs` бросит ошибку → ловится в `.catch()` с логом. Безопасно, но шум в логах.

---

## V6. /restart — session.stop() ждёт subprocess, vault не чистится

**Последовательность (commands.ts:402-469):**
1. `session.stop()` → abort signal + `await this.runningPromise` — **ждёт** завершения subprocess.
2. `await Bun.sleep(2000)` — дополнительные 2 сек для propagation.
3. `killUserClaudeProcesses(profile.workingDir)` — SIGKILL по pgrep.
4. `session.forceMemoryFlush()` — fire-and-forget.
5. `session.kill()` — очищает sessionId, lastActivity.
6. Удаление session file (`profile.sessionFile`).

**Что НЕ чистится:**
- Vault — по замыслу (пользователь хочет сохранить файлы).
- Memory graph — по замыслу.
- Container — не трогается. Container idle timer не сбрасывается.

**Дыра V6a:** `forceMemoryFlush()` — fire-and-forget (`.catch(warn)`). Если анализ идёт медленно (DeepSeek timeout), `session.kill()` уже выполнится и `transcriptRecorder` станет null. `forceMemoryFlush` вызывает `runBackgroundAnalysis` с snapshot — это нормально, snapshot независим. Память может не записаться при гонке, но не corrupts.

**Дыра V6b:** Session file удаляется для профиля, но `session.kill()` не удаляет `ClaudeSession` из session-registry. При следующем `getSession(userId)` — объект существует с `sessionId = null`. Это корректно.

---

## V7. /new — старый sessionId, pending tasks

**Последовательность (commands.ts:148-175):**
1. `session.stop()` если isRunning.
2. `session.forceMemoryFlush()` если isActive.
3. `session.kill()` — сбрасывает sessionId, transcriptRecorder.

**Что НЕ чистится:**
- Pending tasks в `/tmp/task-<id>.json` — остаются.
- Ask-user файлы в `/tmp/ask-user-*.json` — остаются.
- Send-file файлы в `/tmp/send-file-*.json` — остаются.

**Дыра V7a:** После `/new` старые ask-user дропбоксы остаются. Пользователь нажимает на старую кнопку inline-keyboard → `checkPendingAskUserRequests` видит файл, записывает ответ → Claude SDK в новой сессии не ждёт этого файла. Файл остаётся до следующего рестарта или очистки /tmp. Реального риска нет, но `/tmp` засоряется.

**Дыра V7b:** `pendingPlan` и `pendingClarification` на объекте сессии — `session.kill()` не очищает их (смотреть `ClaudeSession.kill()`):
```typescript
async kill(): Promise<void> {
  // ...
  this.sessionId = null;
  this.lastActivity = null;
  this.conversationTitle = null;
}
```
`pendingPlan`, `pendingContextMessages`, `pendingClarification`, `lastPartialResponse` — не сбрасываются. При следующем сообщении старый `pendingPlan` может инициировать неожиданный flows (plan-confirm callback в `callback.ts` читает session.pendingPlan).

---

## V8. Container pause → запрос приходит → unpause гарантирован?

**Поток:**
1. Idle timer срабатывает → `containerManager.pause(userId)`.
2. Пользователь пишет сообщение → `handleText` → `session.sendMessageStreaming`.
3. `containerManager.getOrStart(profile)` вызывается → `getOrStartUnlocked` → state = "paused" → `docker unpause`.

**Гарантия:** да, unpause происходит через lock (`withLock`). Нет race с другим сообщением: lock сериализует. Запрос дождётся unpause.

**Потенциальная дыра V8a:** Если `getOrStart` бросает (docker timeout 30s) → `console.warn` + continue (`session.ts:806-813`). Запрос продолжается, но контейнер не unpaused. Последующий `docker exec` попадёт на paused контейнер → зависнет (docker exec на paused container блокируется). `execFileAsync` имеет timeout 30s → вернёт exitCode 124. Пользователь получит timeout error. Следующее сообщение снова вызовет `getOrStart` и ситуация разрешится.

**Это не deadlock**, но пользователь теряет один запрос с timeout.

---

## V9. always-on daemon: init() падает — что происходит?

**Код (manager.ts:256-271):**
```typescript
for (const p of alwaysOn) {
  try {
    await this.getOrStart(p);
    this.log(p.userId, "always-on: container revived");
  } catch (err) {
    this.log(p.userId, `always-on revive failed: ${(err as Error).message}`);
  }
}
```

**Каждый юзер — в отдельном try/catch.** Если один падает — другие продолжают. Если сам `init()` падает до этого цикла (например, `mkdirSync` бросает) → весь `init()` вылетает вверх по стеку. В `index.ts` — нужно проверить как вызывается:

Если `containerManager.init()` не обёрнут в try/catch в `index.ts` — бот может не запуститься. Надо проверить:
- **Смотреть** `src/index.ts` на предмет try/catch вокруг `containerManager.init()`.

---

## V10. Vault не удаляется при удалении пользователя

**Подтверждение:** нет ни одной строки кода в кодовой базе, которая удаляет `/opt/vault/<userId>/`. Ни в downgrade, ни в revoke, ни в "удалении" (которого нет).

**Риск:**
- **Утечка данных (не хакер, а просто утечка):** если пользователь отменил подписку и ушёл — его данные вечно хранятся на сервере. GDPR требует право на забвение.
- **Диск:** неограниченный рост vault при большом количестве ушедших пользователей.
- **openrouterKey в vault:** файл `openrouterKey` нигде не хранится в vault (он в `users.json`), но если пользователь записал его туда сам — останется.

**Важно:** `/forget` команда удаляет memory graph + transcripts + revoke consent. Но НЕ удаляет все файлы vault — только `memory/<userId>/` внутри `memoryRoot`. Произвольные файлы в `/opt/vault/<userId>/` остаются.

---

## V11. Subscription end → free → V-01 (критичная связь)

**Подтверждение из кода:**
- `downgradeToFree` в payments.ts: меняет tier → `free`, убирает subscription_expires, payment_method_id, grace_period_until.
- `reclaimContainerForFreeUser` → `containerManager.remove(userId)` — удаляет Docker контейнер.
- Следующий запрос: `getUserProfile(userId)` → `tier=free` → `TIER_CONFIGS.free.containerEnabled = false` (config.ts:1106) → `useContainer = false` → **built-in Bash активен** → V-01.

**Это означает:**
- Пользователь, который был paid (с контейнером, в котором Bash безопасен), после downgrade получает доступ к host Bash **без контейнера**, что немедленно активирует V-01.
- `reapOrphanFreeContainers` правильно удаляет контейнер. Но дальше ничего не блокирует Bash на хосте.

**Severity:** Если V-01 не закрыт через `disallowedTools` для free (см. VULNERABILITIES.md), то каждый expired paid user становится потенциальным вектором атаки.

---

## V12. Race: subscription expire + message

**Scenario:** `chargeExpiredTrials` запускается в setInterval, пользователь шлёт сообщение одновременно.

**Анализ:**
- `chargeExpiredTrials` читает и пишет `users.json` через `UserRegistry.saveUser()` (atomic rename).
- `handleText` → `getUserProfile(userId)` — читает через `UserRegistry.getUser()` → читает `_cache`.
- `UserRegistry` использует in-memory кэш `_cache`. Запись через `saveUser` сразу обновляет `_cache`. Чтение через `getUser` читает `_cache`.
- JavaScript single-threaded — нет true concurrency. Если `chargeExpiredTrials` и `handleText` запускаются в одном event loop — между ними нет race в классическом смысле.

**Но есть тонкая дыра V12a:** если `chargeExpiredTrials` начал итерацию `for (const user of users)` и в середине итерации `saveUser` обновил кэш — последующие итерации читают обновлённый `users` (это одна и та же ссылка на `_cache`). Это может вызвать двойную обработку в edge cases.

**Более реальная дыра V12b:** Tier проверяется через `getUserProfile` в момент обработки сообщения. Если пользователь отправил сообщение, оно начало обрабатываться (query запущен), а в этот момент `chargeExpiredTrials` сделал downgrade и `reclaimContainerForFreeUser` удалил контейнер — **in-flight query продолжается с теперь-удалённым контейнером**. Это вызовет ошибку `docker exec` на следующем tool call.

**Severity:** Medium. Пользователь получит ошибку на текущий запрос, следующий — уже как free.

---

## Summary таблица

| Вектор | Что чистится | Что остаётся | Severity |
|--------|-------------|--------------|----------|
| deleteUser (нет функции) | ничего | vault, container, session file, memory, openrouterKey (активный!) | HIGH |
| Subscription expire | container (через reclaimContainerForFreeUser) | vault, memory, session file, metering | LOW (vault retention intentional) |
| /cancel | payment_method_id | tier=paid до expiry, container до expiry | OK (by design) |
| Bot crash mid-session | - (session file atomic) | subprocess может выжить (V4a), in-flight docker exec продолжается | MEDIUM |
| Container removed manually | - | idle timers (шум в логах) | LOW |
| /restart | session state, session file | vault, container, memory | OK (by design) |
| /new | session state | pendingPlan, pendingContextMessages, /tmp dropboxes | LOW (V7b pendingPlan — medium) |
| Container pause + request | unpause через getOrStart | - | OK (graceful) |
| always-on init() crash | - (per-user try/catch) | нужно проверить внешний try/catch в index.ts | LOW-MEDIUM |
| Vault retention | - | Все данные ушедшего пользователя навсегда | MEDIUM (GDPR) |
| Subscription end → free → Bash | container удалён | V-01 активируется (host Bash без контейнера) | CRITICAL (производная от V-01) |
| Race expire + message | - | in-flight query на удалённый контейнер → ошибка | MEDIUM |

---

## Главные новые findings (не дублируют VULNERABILITIES.md)

1. **LCY-01 (HIGH):** Нет функции deleteUser → openrouterKey остаётся активным после "удаления" пользователя.
2. **LCY-02 (MEDIUM):** `session.kill()` не очищает `pendingPlan` / `pendingContextMessages` / `pendingClarification` — старые state objects переживают /new.
3. **LCY-03 (MEDIUM):** Bot crash → Claude CLI subprocess может пережить SIGKILL если systemd KillMode != control-group; надо проверить unit.
4. **LCY-04 (MEDIUM):** In-flight `docker exec` продолжается при downgrade в момент активного запроса → ошибка 404 от Docker.
5. **LCY-05 (LOW):** `/tmp` dropboxes (ask-user, send-file, task-*) не чистятся при /new или /restart — медленное засорение.
6. **LCY-06 (LOW):** `reclaimContainerForFreeUser` fire-and-forget без алерта при провале; `reapOrphanFreeContainers` — дублирующий safety net, но тоже без алерта.
7. **LCY-07 (GDPR/MEDIUM):** `/forget` удаляет только memory root, не весь vault. Пользователь думает что данные стёрты, а файлы в vault остаются.
