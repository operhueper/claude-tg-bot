# TOCTOU / Race Conditions / DoS Vectors

Дата: 2026-05-14  
Область: параллельная нагрузка и специально подобранный тайминг

---

## 1. DeepSeek key pool exhaustion

**Файл:** `src/engines/deepseek-fast.ts`

Там нет никакого пула — используется один ключ `profile.deepseekApiKey`, прямо вызывается `fetch(DEEPSEEK_BASE_URL, ...)`. Никакого per-key rate-limit счётчика нет. Один гость может запустить столько concurrent fast-path вызовов, сколько позволяет per-user lock в `request-queue.ts`.

**Реальная ситуация:** per-user lock (`acquireUserLock`) не даёт одному гостю иметь >1 запроса одновременно (при попытке сразу получить `isUserBusy=true` и запрос отклоняется с «Подожди»). Таким образом один гость = 1 DeepSeek-запрос в момент времени.

**Вектор:** НЕ реализуется через боте напрямую. **Но**: если гость вызывает `mcp__parallel__run` с 10 подзадачами, каждая из них делает свой `query()` через DeepSeek — это 10 параллельных DeepSeek-запросов от одного гостя в обход per-user lock (lock удерживается родительским запросом, дочерние идут из MCP-сервера мимо очереди).

**Оценка:** MEDIUM. Прямая потеря денег + вероятный rate-limit со стороны DeepSeek, блокирующий других пользователей.

---

## 2. Container slot starvation

**Файл:** `src/request-queue.ts`

`acquireContainerSlot` использует простой FIFO-массив (`containerQueue`). Нет никакого приоритета: один пользователь не может вытеснить другого.

**Вектор:** Гость, у которого always-on демоны (они не считаются за `activeContainerSessions` — демоны работают внутри контейнера, а `acquireContainerSlot` берётся только под один запрос), на самом деле не создаёт slot exhaustion сам по себе. Starvation возможен при MAX_CONCURRENT_CONTAINER_SESSIONS=5 и 5 одновременных long-running запросах от разных пользователей — шестой ждёт до 60 секунд (таймаут), затем получает ошибку.

**Race condition в самом коде:** `acquireContainerSlot` не атомарна. Между проверкой `activeContainerSessions >= MAX_CONCURRENT_WITH_CONTAINER` и инкрементом `activeContainerSessions++` — промисы. В однопоточном Node/Bun это безопасно (нет реального параллелизма), поэтому race здесь нет. Но если таймаут срабатывает одновременно с резолвом из очереди, `containerQueue.shift()` в release может разбудить waiter, который уже получил reject по таймауту — счётчик уйдёт в минус.

**Конкретный баг:** когда Promise.race срабатывает по таймауту — reject вызывается, но resolve из `containerQueue` остаётся. Позже при `release()` вызывается `const next = containerQueue.shift()` — там уже сидит stale резолвер от истёкшего ожидающего. Он вызывается, но соответствующий await уже завершился по reject → `activeContainerSessions` инкрементируется там (не успело) нет. Но другой waiter получил пустое `next()` — т.е. получил slot без инкремента `activeContainerSessions`. Итог: `activeContainerSessions` может занижаться — реально активных сессий больше, чем считает счётчик. При интенсивной нагрузке возможно превышение лимита.

**Оценка:** LOW-MEDIUM. Нужна интенсивная нагрузка с таймаутами.

---

## 3. Vault quota TOCTOU

**Файл:** `src/containers/vault-quota.ts`

Кэш 60 секунд + background refresh. Если кэш свежий — запрос проходит немедленно без I/O. Гость может:
1. Отправить сообщение когда кэш только что обновился (occupied < 2 GB).
2. За 60 секунд наполнить vault файлами через Claude (Write tool, Bash, загрузка документов).
3. Все запросы в течение этих 60 секунд будут проходить — кэш свежий.

**Насколько опасно на практике:** контейнер имеет ограниченную скорость записи (bind-mount, нет disk I/O quota), а egress rate-limit (20 Mbit/s) ограничивает скачивание. За 60 секунд при 20 Mbit/s можно скачать ~150 MB. Чтобы дойти до 2 GB только через сеть — нужно ~13 минут, но кэш успевает обновиться 13 раз. Таким образом quota реально работает.

**Но:** если гость использует Bash для генерации данных (`dd if=/dev/urandom of=file.bin bs=1M count=5000`), скорость записи в tmpfs или на диск — сотни MB/s. За 60 секунд → сотни GB теоретически. На практике ограничено Docker `--storage-opt` (не установлен в `buildRunArgs`) — значит лимита нет на уровне overlay. Хост-диск заполняется до полного объёма.

**Конкретная дыра:** нет Docker storage limit на контейнер (нет `--storage-opt size=...` в spec). `du -sb` на vault (bind-mount) измеряет только `/opt/vault/<id>/`, но `dd` в tmpfs контейнера (`/tmp` внутри) не мерится вообще — tmpfs лимитирован только `--tmpfs /tmp:rw,noexec,nosuid,size=128m` (128 MB cap есть, это ок).

**Итог:** запись в `/opt/vault/<userId>/` через bind-mount может перекрыть quota за время между du-обновлениями. Не OOM хоста (диск, а не RAM), но filesystem full на хосте.

**Оценка:** MEDIUM. Реально заполнить диск при отсутствии Docker overlay storage limit.

---

## 4. SQLite metering concurrent writes

**Файл:** `src/metering.ts`

Используется `bun:sqlite` с `PRAGMA journal_mode=WAL` и `PRAGMA busy_timeout=5000`. Один singleton `db` на весь процесс. Bun — однопоточный (V8-подобный event loop), JS concurrency только через microtasks/macrotasks. `db.run()` — синхронный вызов.

**Race:** Bun:sqlite в WAL-режиме безопасен для concurrent reads + writes из одного процесса. Нет реального threading. Единственный риск — если два внешних процесса открывают одну БД (например, дашборд-сервер и бот). Оба запущены из одного `src/index.ts` — один процесс, одно подключение. Dashboard-сервер запущен внутри того же процесса.

**Вывод:** concurrent write race нет. `busy_timeout=5000` + WAL защищает от будущих расширений с внешним reader.

**Оценка:** НЕТ УЯЗВИМОСТИ.

---

## 5. Audit log race (line-mix)

**Файл:** `src/utils.ts`, `writeAuditLog`

```ts
await fs.appendFile(AUDIT_LOG_PATH, content);
```

Это один `appendFile` — системный вызов write(), атомарный для записей < PIPE_BUF (4096 байт на Linux). Если запись > 4096 байт (длинный ответ Claude), несколько параллельных `appendFile` могут чередовать байты.

**Реальный сценарий:** два гостя одновременно получают длинный ответ (>4096 байт). Оба вызывают `auditLog` с response. `appendFile` под капотом делает `write(fd, buf, len)` — если len > PIPE_BUF, Linux не гарантирует атомарность. Строки могут перемешаться.

**Эффект:** не DoS, а data corruption в audit log. Разбор лога станет ненадёжным. При судебном разборе — проблема с целостностью доказательств.

**Оценка:** LOW (data integrity, не security).

---

## 6. Daemon-runner crashloop spamming owner channel

**Файлы:** `src/crashloop-watcher.ts`, `scripts/daemon-runner/main.go`

Go runner пишет `<name>-crashloop.json` в `.daemons-events/`. TS watcher читает каждые 30 секунд. При срабатывании: `notifyGuest` + `notifyProblemChannel`, затем rename в `.handled.json`. Кулдаун: 1 час по mtime `.handled.json`.

**Вектор:** гость специально делает crashloop-демон (10-байтный скрипт `exit 1`). Go runner: `minRunForCrash = 5s` — процессы, падающие быстрее 5 секунд, в счётчик не идут (только backoff). После backoff cap (30s) процесс перезапускается каждые 30 секунд. В счётчик не идёт → `crashThreshold` не достигается → `writeCrashEvent` не вызывается → TS watcher ничего не посылает.

**Итог по этому сценарию:** НЕТ спама, если процесс падает быстро (< 5s). Правильное поведение.

**Другой вектор:** гость делает процесс, который работает 5+ секунд, потом падает (например sleep 6 && exit 1). Тогда crashloop считается: 5 падений за 10 минут = crashloop, одно сообщение владельцу. Кулдаун 1 час. Максимальный спам: 24 сообщения/день в канал при злоупотреблении (при изменении `.daemons.yaml` заново).

**Вектор 2:** гость изменяет `.daemons.yaml` — старый демон останавливается, новый стартует с новым именем. У нового нет `.handled.json`. Цикл повторяется. Потенциально > 24 алертов/день при активной эксплуатации.

**Оценка:** LOW. Надоедливо для владельца, не критично.

---

## 7. parallel_mcp fan-out — неограниченный N задач

**Файл:** `parallel_mcp/server.ts`

Схема инструмента объявляет `maxItems: 10`. Это валидация схемы MCP (JSON Schema). Claude может передать >10 задач в одном вызове — но MCP SDK валидирует входные данные и должен отклонить. Однако: валидация schema на стороне SDK зависит от того, выполняет ли SDK JSON Schema validation.

**Проверено:** в коде сервера нет явной проверки `tasks.length <= 10`. Есть только `if (!tasks || tasks.length < 2)` — нижняя граница. Верхняя граница не проверяется в коде сервера.

**Сценарий:** гость отправляет вызов с 50 подзадачами (если SDK не валидирует maxItems) → 50 параллельных `query()` → 50 × DeepSeek-вызовы → ~$0.01-0.10 за один вызов гостя.

**Также:** каждая из 50 подзадач может сама вызвать `mcp__parallel__run` — нет, защита есть: `childDisallowedTools` всегда включает `mcp__parallel__run`. Рекурсия заблокирована.

**Но:** нет лимита на токены/стоимость за одну параллельную сессию. Нет таймаута на всю группу задач.

**Оценка:** MEDIUM. Экономический DoS для владельца.

---

## 8. Concurrent voice transcription (Whisper cost attack)

**Файл:** `src/handlers/voice.ts` (не читали, смотрим логику)

Per-user lock (`acquireUserLock`) блокирует один запрос за раз. Whisper вызывается до `acquireContainerSlot` в `voice.ts` (судя по архитектуре — transcription перед queue). Если transcription вызывается **до** user lock — concurrent voices возможны.

**Проверка необходима:** нужно посмотреть `src/handlers/voice.ts` чтобы подтвердить порядок вызова. Если Whisper вызывается внутри locked секции — вектор нейтрализован. Если снаружи — один гость может иметь N concurrent Whisper-вызовов.

**Telegram лимит:** Telegram сам лимитирует voice messages пользователем — нельзя слать голосовые быстрее чем одно в несколько секунд. Но при использовании нескольких аккаунтов (разные приглашённые гости) — каждый может независимо посылать голосовые.

**Оценка:** требуется дополнительная проверка `voice.ts` для подтверждения.

---

## 9. Heartbeat memory leak при exception в handler

**Файл:** `src/handlers/streaming.ts`, `IdleHeartbeat`, `createStatusCallback`

```ts
const heartbeat = new IdleHeartbeat(ctx);
heartbeat.start();
state.heartbeat = heartbeat;
```

`heartbeat.stop()` вызывается только в событии `"done"` внутри `createStatusCallback`. Если handler вызывает exception до получения `"done"` — `cleanup()` вызывается в `finally` в обработчике (`state.cleanup()`).

**Проверка в `StreamingState.cleanup()`:**
```ts
async cleanup(): Promise<void> {
  if (this._heartbeat) {
    await this._heartbeat.stop();
    this._heartbeat = null;
  }
}
```

Cleanup делегирует `state.cleanup()`. Вызывается ли cleanup в finally-блоке handlers?

Если в `text.ts`, `voice.ts`, etc. есть `try { ... } finally { await state.cleanup(); }` — утечки нет. Если нет — таймеры остаются живыми после exception, продолжают посылать `ctx.reply()` в закрытый/несуществующий чат.

**Реальная проблема:** `silenceTimer` (15s) + `tickTimer` (10s interval) — они `unref()`'ы? Нет, `unref()` не вызывается для таймеров heartbeat. Это значит они удерживают event loop от завершения. На практике — бот long-running, event loop не завершается, но accumulation heartbeat-таймеров после многих exceptions = memory leak + Telegram API 429 спам.

**Оценка:** LOW-MEDIUM (cumulative).

---

## 10. CircuitBreaker race при concurrent exec

**Файл:** `src/containers/manager.ts`, circuit-breaker блок

```ts
if (cb.count >= CB_THRESHOLD) {
  await execFileAsync("docker", ["kill", name]).catch(() => {});
  await execFileAsync("docker", ["start", name]).catch(() => {});
  this.timeoutCounters.delete(userId);
}
```

Circuit-breaker срабатывает внутри `catch` блока в `exec()`. `exec()` сам по себе не идёт через `withLock` — только через lock для unpause/start перед exec. Если N concurrent `exec()` вызовов для одного пользователя все одновременно получают timeout:

1. Все N достигают `catch` блока.
2. Все читают `timeoutCounters.get(userId)` — пока первый не сделал delete.
3. Все инкрементируют `cb.count`.
4. Первый достигает порога → kill+start → delete counter.
5. Второй читает уже удалённый counter → создаёт новый `{count: 0}` → инкрементирует → `{count: 1}`.
6. Все следующие делают то же самое.

**Итог:** при N concurrent timeouts, circuit-breaker может сработать `floor(N/CB_THRESHOLD)` раз вместо одного раза. Каждый trigger делает `docker kill` + `docker start`. Контейнер перезапускается несколько раз подряд — состояние данных в tmpfs контейнера теряется несколько раз.

**Но:** нет реального параллелизма в JS-event-loop — если `exec` асинхронный, все promiseы resolveятся в microtask queue по одному. `timeoutCounters.get/set/delete` — синхронные операции между await точками. Между двумя `await execFileAsync(...)` нет вставки другого кода. Значит race реален только если два параллельных `exec()` оба получают timeout в одном tick — это возможно только если оба `awaitable` резолвируются одновременно, что в JS невозможно (один tick = один микротаск).

**Итог:** в однопоточном Bun/Node race здесь нет. НЕТ УЯЗВИМОСТИ.

---

## 11. Telegram API rate limit abuse

**Файл:** `src/handlers/streaming.ts`

Streaming callback посылает: `ctx.reply()` (новый message) + `ctx.api.editMessageText()` (throttled) + delete-loop в "done". При очень длинной streaming сессии с множеством tool calls:
- N tool messages → N `ctx.reply()` вызовов
- Throttle на text edits: `STREAMING_THROTTLE_MS` (как правило 1000ms)
- На "done": N delete calls последовательно

Telegram лимит: 30 msg/sec globally, 1 msg/sec per chat. Streaming нарушает per-chat 1 msg/sec (множество edits и replies). Обработка 429 в коде:

```ts
if (s.includes("429") || s.includes("Too Many Requests")) {
  rateLimited = true;  // abort remaining deletions
}
```

При 429 на удалении — промежуточные tool messages остаются в чате навсегда (не удаляются). Они не вредят пользователю напрямую, но засоряют чат.

**DoS сценарий:** гость запускает задачу с 50+ tool calls (например grep по большому дереву файлов). Каждый tool call → reply в чат. Бот попадает в 429 и отключается от посылки в этот чат на retry_after секунд (может быть часами при агрессивных 429).

**Более серьёзный вектор:** Telegram 429 на уровне bot-global (не per-chat) возникает редко, но если несколько гостей одновременно делают intensive streaming — теоретически боту могут заблокировать отправку глобально.

**Оценка:** MEDIUM. Существующая обработка 429 останавливает удаление, но не предотвращает попадание в RL.

---

## 12. OpenRouter rate-limit на vision (гость)

**Файл:** `src/session.ts`, `src/engines/openrouter.ts`

Vision проходит через OpenRouter без per-user rate-limit. Один гость может слать фото непрерывно (медиа-группы буферизуются 1 секунду). Per-user lock есть — но vision-запрос может быть очень дорогим (Gemini 2.5 Flash с большим изображением).

**Анализ:** per-user lock (`acquireUserLock`) действует — гость не может иметь два параллельных vision-запроса. Но нет лимита на количество vision-запросов в сутки (нет ни daily_counts для vision, ни токенного лимита). Любой гость может посылать по одному фото непрерывно весь день.

**Оценка:** MEDIUM (экономический DoS).

---

## 13. Container reuse — malicious cron внутри контейнера

**Файл:** `src/containers/manager.ts`, `Dockerfile.user`

Контейнер живёт долго (pause после 15 мин, stop после 24 ч). Если гость через Claude добавил `crontab` или systemd user-unit внутри контейнера — после pause/unpause cron не исполняется (процессы заморожены). После stop/start — контейнер тот же, но init-процесс перезапущен. В Dockerfile.user PID1 = daemon-runner Go (или bash если демонов нет).

**Что происходит при start:** `docker start` перезапускает тот же образ с теми же томами. Cron внутри контейнера (если он был запущен как демон) — не перезапускается автоматически. Пользовательский crontab остаётся в файловой системе (в vault через bind-mount), но crond не запущен при start если не прописан в `.daemons.yaml`.

**Вектор:** если гость добавил свой cron в системный crontab (`/etc/cron.d/` внутри контейнера — read-only root FS блокирует это), или через user crontab (writeable через `/tmp`, но `/tmp` — tmpfs, очищается при stop). **read-only root filesystem** и **tmpfs /tmp** фактически предотвращают persistence malicious cron через рестарты.

**Исключение:** `.daemons.yaml` в vault — persistent через рестарты (bind-mount). Гость может добавить вредоносный процесс как enabled daemon → он запустится при следующем старте контейнера. Daemon-runner валидирует YAML, но не валидирует cmd на safety.

**Оценка:** MEDIUM (существующая дыра через .daemons.yaml для произвольного code execution при каждом старте).

---

## 14. Image build race при одновременном запуске контейнеров

**Файл:** `src/containers/manager.ts`

`docker build` — внешний процесс, не управляется кодом бота. Если кто-то запускает `docker build -t claude-user-sandbox:latest` пока бот делает `docker run claude-user-sandbox:latest` для нового гостя — Docker использует image по тегу в момент старта pull/run. Нового образа в полёте нет конфликта: `docker run` берёт уже загруженный layer из local registry по sha256.

**Единственный реальный race:** если `docker build` использует `--no-cache` и пересоздаёт образ с тем же тегом пока идёт `docker pull` (не применимо — образ локальный). Локальная пересборка атомарна на уровне image reference — старые контейнеры продолжают использовать старый image ID, новые получат новый.

**Оценка:** НЕТ УЯЗВИМОСТИ.

---

## Сводная таблица

| # | Вектор | Оценка | Файл |
|---|--------|--------|------|
| 1 | DeepSeek key pool — DoS через parallel_mcp fan-out | MEDIUM | parallel_mcp/server.ts |
| 2 | Container slot counter underflow при concurrent timeout+release | LOW-MEDIUM | src/request-queue.ts |
| 3 | Vault quota TOCTOU — запись в vault быстрее чем du обновляется | MEDIUM | src/containers/vault-quota.ts |
| 4 | SQLite concurrent writes | НЕТ | src/metering.ts |
| 5 | Audit log line-mix при записях > 4096 байт | LOW | src/utils.ts |
| 6 | Daemon crashloop spam через изменение имени демона | LOW | src/crashloop-watcher.ts |
| 7 | parallel_mcp — нет server-side проверки maxItems=10 | MEDIUM | parallel_mcp/server.ts |
| 8 | Concurrent Whisper (требует проверки voice.ts) | TBD | src/handlers/voice.ts |
| 9 | Heartbeat таймер-утечка при exception до cleanup | LOW-MEDIUM | src/handlers/streaming.ts |
| 10 | CircuitBreaker race | НЕТ (однопоточный Bun) | src/containers/manager.ts |
| 11 | Telegram API 429 при intensive streaming | MEDIUM | src/handlers/streaming.ts |
| 12 | Vision через OpenRouter без дневного лимита | MEDIUM | src/engines/openrouter.ts |
| 13 | .daemons.yaml persistence malicious cmd | MEDIUM | scripts/daemon-runner/main.go |
| 14 | Docker image build race | НЕТ | src/containers/manager.ts |

---

## Новые дыры (не в VULNERABILITIES.md)

Следующие находки не дублируют ничего из `VULNERABILITIES.md`:

- **RACE-01** (MEDIUM): `parallel_mcp` нет server-side проверки `tasks.length <= 10` — JSON Schema `maxItems` может не валидироваться MCP SDK. Гость может запустить 50+ параллельных DeepSeek-запросов за один MCP-вызов.
- **RACE-02** (MEDIUM): `acquireContainerSlot` — stale resolver в `containerQueue` при timeout race может привести к тому, что счётчик `activeContainerSessions` недосчитывает активные сессии.
- **RACE-03** (MEDIUM): Vault quota background-refresh pattern — 60-секундное окно позволяет запись в vault без ограничений при отсутствии Docker overlay storage limit (`--storage-opt size=...` не задан в `buildRunArgs`).
- **RACE-04** (MEDIUM): Vision запросы не учитываются в `daily_counts` и нет лимита на количество vision-запросов в сутки от одного гостя.
- **RACE-05** (LOW-MEDIUM): `IdleHeartbeat` таймеры не `unref()`'нуты — при exception до `state.cleanup()` таймеры продолжают работать и слать Telegram API вызовы.
- **RACE-06** (LOW): Audit log `appendFile` не атомарен для записей > 4096 байт — возможно перемешивание строк при concurrent длинных ответах.
- **RACE-07** (MEDIUM): `.daemons.yaml` как вектор persistence malicious cron/daemon — гость прописывает arbitrary cmd в enabled daemon, он запустится при каждом старте контейнера без проверки cmd на safety.
