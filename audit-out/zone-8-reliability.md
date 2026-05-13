# Zone 8 — Reliability + Crash recovery

Аудит трёх плоскостей: процесс бота под systemd, гостевые Docker-контейнеры, утечки ресурсов на долгом горизонте. Все находки подтверждены чтением кода. Что уже покрыто в `SPEC.md` — только упоминаю с ID, новых деталей не дублирую.

## Summary

Поверх существующих находок SPEC.md обнаружено **3 critical / 7 high / 8 medium / 5 low** ранее не описанных reliability-проблем — итого 23. Главные точки отказа:

1. **`containerManager.withLock` имеет broken cleanup** — Map `locks` растёт навсегда, плюс лок никогда не освобождается формально (всегда true identity-check broken) → утечка closure'ов на каждое сообщение.
2. **`uncaughtException` / `unhandledRejection` только логируют** — Node-процесс остаётся в неопределённом состоянии после fatal-ошибки; следующее сообщение может прийти в полу-сломанный runtime.
3. **`docker exec` без watchdog внутри `containerManager.exec`** — если контейнер «застрял» (D-state в kernel, paused gone wrong), `--timeout=30s` сработает, но stuck состояние самого контейнера не лечится. Бот будет вечно получать таймауты, пока кто-то вручную не сделает `docker restart`.
4. **`getRecentlyActiveUsers` хранится в `/tmp`** — после reboot хоста (не systemd-restart) файл пропадает → пользователи активные за минуту до краша не получат уведомления о рестарте.
5. **Idle pause race**: между `setTimeout(pause)` и реальным `docker pause` пользователь может прислать сообщение → `exec` поднимет контейнер сразу же, а через секунду `pause` опустит его снова → запрос упадёт с пустым stderr.

## Findings

| # | severity | file:line | issue |
|---|----------|-----------|-------|
| R-01 | critical | `src/containers/manager.ts:523` | `locks` Map течёт — identity check на `prev.then(() => next)` всегда false |
| R-02 | critical | `src/index.ts:62-67` | `uncaughtException/unhandledRejection` только log — процесс остаётся «полу-живой» |
| R-03 | critical | `src/containers/manager.ts:206-290` | `docker exec` не имеет circuit-breaker'а — stuck container = бесконечные таймауты |
| R-04 | high | `src/session-registry.ts:38` | `/tmp/claude-active-users.json` теряется при reboot → нет restart-уведомлений |
| R-05 | high | `src/containers/manager.ts:355-373` | idle pause race: pause timer срабатывает между exec calls — следующий exec падает на race |
| R-06 | high | `src/containers/spec.ts:103-108` | `--memory=512m` без `--oom-score-adj` → OOMkiller может выбрать сам бот вместо контейнера |
| R-07 | high | `src/containers/manager.ts:634-649` | `ensureDocker()` cache-result навсегда — если dockerd рестартанулся, бот считает Docker down |
| R-08 | high | `src/index.ts:294-313` | `RESTART_FILE` через 30 сек устаревает — slow startup (image pull, FS-fsck) приводит к фантомному «✅ Bot restarted» в чужом сообщении |
| R-09 | high | `src/containers/manager.ts:176-190` | `init()` always-on revive sequential — 10 пользователей × 30s docker-pull = 5 минут startup, бот не отвечает |
| R-10 | high | `src/containers/spec.ts:135` | `--ulimit=nofile=1024:2048` per-container, на host 100 контейнеров × 2048 = 200K FDs → host лимит |
| R-11 | medium | `src/handlers/streaming.ts:295-381` | `IdleHeartbeat.silenceTimer/tickTimer` без `unref()` — задерживают `process.exit()` на shutdown |
| R-12 | medium | `src/index.ts:446` | `setInterval(chargeExpiredTrials, 6h)` без `unref()` — то же самое |
| R-13 | medium | `src/crashloop-watcher.ts:113-117` | `setInterval(processOnce, 30s)` без `unref()` + handled-флаг чистится только при крахе |
| R-14 | medium | `src/utils.ts:67-68` | `fs.appendFile` через dynamic import на каждый аудит-event — нет write-stream, FD создаётся/закрывается каждый раз |
| R-15 | medium | `src/index.ts:449` | `run(bot)` без `onError` — runner-level network error в долгом polling приводит к silent stall, нет восстановления |
| R-16 | medium | `src/containers/manager.ts:283-287` | exit code `1` (timeout/killed) маскируется под код 124 только в одной ветке — kernel SIGKILL даст код 137, тоже не различаем |
| R-17 | medium | `src/index.ts:459-468` | `SIGTERM`-handler не дожидается inflight-сессий — `process.exit(0)` обрывает MCP subprocess'ы |
| R-18 | medium | `src/containers/manager.ts:197-244` | На concurrent `exec` для **absent** контейнера: первый сделает getOrStart, остальные пройдут withLock и упрутся в «exec called on absent container» — без recovery |
| R-19 | low | `src/handlers/streaming.ts:282-288` | `StreamingState.cleanup()` идемпотентна, но не nulls `_heartbeat` после двойного вызова при double-cleanup гонке |
| R-20 | low | `src/owner-alerts.ts:24-28` | `notifyOwnerDM` ловит ошибку silently — alerts могут теряться, owner думает что всё ок |
| R-21 | low | `src/index.ts:393-434` | health-webhook на 3847 без CSRF/replay protection — старый Apple Watch payload можно re-послать |
| R-22 | low | `src/handlers/streaming.ts:331-336` | `armSilenceTimer` пересчитывает 15s заново даже если уже шёл tick — может никогда не показать idle-фразу при частом стриминге |
| R-23 | low | `src/containers/manager.ts:72-78` | `hasActiveDaemons` читает yaml на каждый pause/stop/timer — нет cache; для 10 юзеров × 1 idle reset/min = 10 sync FS reads/min |

## Detailed findings

### R-01 — `withLock` cleanup сломан, Map течёт навсегда (`src/containers/manager.ts:508-526`)

```ts
const next = new Promise<void>((r) => { resolveLock = r; });
this.locks.set(userId, prev.then(() => next));
// ...
if (this.locks.get(userId) === prev.then(() => next)) {  // <-- ВСЕГДА false
  this.locks.delete(userId);
}
```

`prev.then(() => next)` создаёт **новый** promise при каждом вызове — `===` никогда не совпадёт со значением в `Map`. Поэтому `this.locks` для активного пользователя растёт навсегда: каждый `getOrStart`/`pause`/`stop`/`remove`/`exec`-на-absent добавляет запись, которая никогда не удаляется.

**Влияние:** на 10 пользователей × 50 lock-acquire/день = 500 утекших closure'ов в день, держат references на `next` promise + `fn` closure (включая `profile` объект). На горизонте недели — заметная утечка для 10MB-RES процесса.

**Fix:** сохранить ссылку в локальную:
```ts
const chained = prev.then(() => next);
this.locks.set(userId, chained);
// ...
if (this.locks.get(userId) === chained) {
  this.locks.delete(userId);
}
```

### R-02 — `uncaughtException`/`unhandledRejection` только логируют (`src/index.ts:62-67`)

```ts
process.on('uncaughtException', (err) => { console.error('[FATAL] uncaughtException:', err); });
process.on('unhandledRejection', (reason) => { console.error('[FATAL] unhandledRejection:', reason); });
```

После uncaughtException Node-runtime **в неопределённом состоянии** — открытые файлы, незавершённые promises, частично записанные данные. По умолчанию Node бы упал; здесь мы перехватываем и продолжаем работать. Это значит:

- Грязный SQLite (metering.sqlite) после exception в `recordUsage()` остаётся с открытым transaction'ом.
- Telegram polling может застрять с висящим request'ом.
- Container locks (см R-01) ещё хуже текут.
- Memory может быть corrupted (V8 bugs).

**Fix:** после первой uncaughtException залогировать + `process.exit(1)` (systemd рестартанёт через `Restart=always`). unhandledRejection — можно оставить как warn, но нужен ratelimit (если за минуту > 10 — экзитить).

**Альтернатива:** оба → `process.exit(1)` + полагаться на systemd. Это правильный pattern для long-running daemons.

### R-03 — `docker exec` без circuit-breaker'а (`src/containers/manager.ts:206-290`)

`exec()` имеет `DEFAULT_EXEC_TIMEOUT_MS = 30_000` (default) или 120s через `bash-mcp.ts`. Но что происходит, если **контейнер сам застрял** (zombie в kernel-mode, `D` state процессы, kernel mount stuck, docker daemon glitching) — `docker exec` будет уходить в timeout **каждый раз**.

**Сценарий:**
1. Гость запустил Python с C-extension'ом который ушёл в kernel D-state (NFS hang / FUSE mount).
2. Каждый `mcp__container__Bash` → 120s timeout → exit code 124 → пользователь видит «❌ Не получилось…».
3. Бот не пытается рестартануть контейнер, ничего не алертит.

**Fix:** добавить per-container «N последовательных таймаутов в окне M сек → принудительный `docker kill && docker start` + alert владельцу». Можно тривиально: счётчик в `ContainerManager`, инкремент в catch ветке `exec`, после 5 подряд timeout'ов в течение 5 минут — `remove(userId)` (или `restart`).

### R-04 — restart-уведомления теряются при reboot хоста (`src/session-registry.ts:38`)

```ts
const ACTIVE_USERS_FILE = "/tmp/claude-active-users.json";
```

`/tmp` чистится при `reboot` (на Debian обычно через `tmpfiles.d`, в зависимости от дистра). После reboot хоста файл пропадает → блок «Restart notifications» в `index.ts:319-333` отрабатывает пустым списком → пользователи которые писали 2 минуты назад **не получат** уведомление, что бот рестартанулся.

**Влияние:** UX — пользователь думает, что бот «не ответил», шлёт повторку, удивляется.

**Fix:** переехать на `/opt/claude-tg-bot/runtime/active-users.json` или `/var/lib/claude-tg-bot/` (нужно создать) — переживёт reboot. Альтернатива — синхронизировать через `session-registry` map в-память + persist на каждый shutdown через `SIGTERM`.

### R-05 — idle pause race (`src/containers/manager.ts:346-373` + `:206-242`)

Цепочка:
1. `t=0`: пользователь шлёт сообщение → `resetIdleTimer` ставит `setTimeout(pause, 15min)`.
2. `t=15min - 100ms`: pause-timer firing.
3. `t=15min`: пользователь шлёт следующее сообщение → `exec` берёт lock, `getStateUnlocked` возвращает `running` → отдаёт команду.
4. `t=15min + 50ms`: pause callback (запущен **до** acquiring lock) дожидается lock'а, проверяет state, видит `running`, делает `docker pause`.
5. `t=15min + 100ms`: команда из шага 3 ещё в полёте внутри контейнера — `docker pause` его замораживает. Stdout не доходит до `execFileAsync`. Через 30s timeout — exit code 124, пустой stderr.

`pause()` (line 297-309) защищается `withLock`, но `exec()` (line 206-290) проверяет state **внутри** withLock и **снимает** lock перед запуском `execFileAsync` (line 243-263). То есть pause может вклиниться **между** snapshot'ом состояния и реальным выполнением команды.

**Fix:** держать lock на всё время `execFileAsync`. Это упростит и concurrent-exec случай (R-18). Минус — теряется параллелизм, но `exec` для одного юзера всё равно sequential по UX.

### R-06 — OOMkiller может выбрать сам бот (`src/containers/spec.ts:103-108`)

Контейнерам гостей `--memory=512m` (default), `--memory-swap=512m`. Но **сам Node-процесс бота** запущен с обычным `oom_score_adj=0`. Если внутри контейнера случается RAM-всплеск (например, Python ML loads huge model) — Linux OOMkiller выбирает жертву по `oom_score`. Контейнер с маленьким лимитом + большим использованием = высокий score. **Но** если на хосте мало RAM (proboi-bot — Hetzner ~16 GB?), OOMkiller глядит на абсолютные значения. Bun-процесс бота с 200+ MB RSS на фоне 10 контейнеров по 400 MB — кандидат на отстрел.

**Fix:** systemd unit для `claude-tg-bot.service` добавить `OOMScoreAdjust=-500` (бот защищён). Гостевым контейнерам — наоборот, `--oom-score-adj=+500` через `--security-opt`. Проверить через `cat /proc/$(pgrep bun)/oom_score_adj`.

### R-07 — `ensureDocker` кэширует навсегда (`src/containers/manager.ts:634-649`)

```ts
private dockerAvailable: boolean | null = null;
async ensureDocker(): Promise<boolean> {
  if (this.dockerAvailable !== null) return this.dockerAvailable;
  // ...
}
```

Один раз `docker --version` зафейлил (например, dockerd рестартовался на момент старта бота) — `dockerAvailable = false` навсегда. Бот молча работает в noop-режиме для контейнеров до перезапуска.

**Сценарий:** `apt upgrade docker-ce` на хосте → dockerd рестарт → бот при первом старте поймал `false` → юзеры месяц жалуются «команды не работают».

**Fix:** TTL-cache на `dockerAvailable`, например 30 секунд. Или ретраить probe только если предыдущий вызов был > 5 минут назад. Или вообще удалить cache и делать `docker --version` lazy раз в N запросов.

### R-08 — RESTART_FILE через 30 сек устаревает (`src/index.ts:294-313`)

```ts
if (age < 30000 && data.chat_id && data.message_id) {
  await bot.api.editMessageText(data.chat_id, data.message_id, "✅ Bot restarted");
}
```

Если бот после `/reloadbot` стартует > 30 секунд (image-pull в always-on revive, FS-fsck), `RESTART_FILE` уже «протух». Не критично — `unlinkSync` ниже всё равно удалит. Но при медленном старте плюс **новое** сообщение от того же пользователя успеет занять `message_id`-слот → editMessageText вылетит, поправит чужое сообщение. На практике редко, но в always-on с 10+ юзерами всё чаще.

**Fix:** проверять message_id из RESTART_FILE против самого старого `lastActivity` — если сообщение появилось ПОСЛЕ rebot timestamp, не патчить.

### R-09 — `init()` always-on revive sequential (`src/containers/manager.ts:176-190`)

```ts
for (const p of alwaysOn) {
  try {
    await this.getOrStart(p);  // <-- sequential
  } catch (err) { ... }
}
```

При 10 always-on юзерах × 5s на `docker start` = 50 секунд startup. На холодном хосте, где образ нужно подтянуть — десятки секунд × 10. Бот не отвечает на сообщения всё это время.

**Fix:** `Promise.allSettled(alwaysOn.map(p => this.getOrStart(p)))` — параллельный revive. Docker сам сериализует internally если нужно. Логирование одинаковое.

### R-10 — `nofile=1024:2048` без host-budget (`src/containers/spec.ts:135`)

Каждый контейнер получает 2048 FDs. На хосте default `fs.file-max` — обычно 1M+, но **per-uid** лимит (UID 1000 sandbox-user) может быть 4096 без specific tuning. При 10+ активных контейнерах, шарящих UID 1000, total FDs > 20K — host начинает отказывать в open().

**Fix:** либо снизить `nofile` до 512 (хватит для bash+node+python скриптов), либо на хосте поднять `/etc/security/limits.d/sandbox.conf nofile=131072` для UID 1000. Также упоминаемый в `spec.ts:140-141` `--ulimit=nproc` — выключен по правильным соображениям, но та же проблема может быть с nofile.

### R-11/12/13 — `setInterval` без `unref()` (`streaming.ts:295-381`, `index.ts:446`, `crashloop-watcher.ts:113`)

`IdleHeartbeat.silenceTimer` (line 334) и `tickTimer` (line 350) — `setTimeout`/`setInterval` без `.unref()`. То же для `chargeExpiredTrials` interval и `crashloop-watcher` interval. Это значит на `SIGTERM` Node будет ждать их завершения, даже если runner.stop() уже вызван. Контейнерные timers в `manager.ts:369-370` правильно делают `unref?.()` — этот pattern нужно повторить везде.

**Влияние:** при `systemctl restart claude-tg-bot` shutdown занимает до `TimeoutStopSec` (default 90 сек) пока эти timers не отстрелятся естественным образом. Telegram polling уже стоит → юзеры висят без ответа.

**Fix:** добавить `.unref?.()` ко всем top-level `setInterval`/`setTimeout`.

### R-14 — `fs.appendFile` через dynamic import на каждый event (`src/utils.ts:67-68`)

```ts
const fs = await import("fs/promises");
await fs.appendFile(AUDIT_LOG_PATH, content);
```

`import` кэшируется V8'ом, но `appendFile` каждый раз open()+write()+close() — отдельный syscall-цикл. Для 10 RPS аудит-log это ~30 syscalls/sec. Под нагрузкой блокирует event loop когда диск занят.

**Fix:** один write-stream `fs.createWriteStream(AUDIT_LOG_PATH, { flags: 'a' })` инициализировать при старте; `.write()` неблокирующий. Закрывать на SIGTERM.

### R-15 — `run(bot)` без onError (`src/index.ts:449`)

`grammyjs/runner.run(bot)` имеет опцию `runner.run(bot, { onError })` для отлова ошибок polling-loop'а. Без неё ошибки сваливаются в `bot.catch` только если grammY их поймает; network-уровневые проблемы в `getUpdates` (DNS resolve fail, TCP reset, Telegram 502) могут привести к silent stall цикла.

**Fix:** `const runner = run(bot, { runner: { silent: false, retryInterval: 'exponential' } });` или явный `onError` колбэк, который при N consecutive errors будет звать `process.exit(1)` → systemd рестарт.

### R-16 — Exit code disambiguation (`src/containers/manager.ts:283-287`)

```ts
const exitCode = typeof e.code === "number" ? e.code : e.killed ? 124 : 1;
```

`e.code` может быть строкой `'ETIMEDOUT'` или `'ENOBUFS'` (превышен maxBuffer) — тогда мы фоллбэкаем на `e.killed ? 124 : 1`. На SIGKILL изнутри контейнера (OOMkiller убил процесс) — `e.code = null, e.signal = 'SIGKILL'` — попадает в exit code 1, неотличимо от обычной ошибки.

**Fix:** возвращать также `signal` field из ExecResult. Caller (bash-mcp.ts) сможет отличить «exited 1» от «killed by SIGKILL» и сказать пользователю «команда исчерпала память» вместо общего «exit 1».

### R-17 — `SIGTERM`-handler не дожидается inflight (`src/index.ts:459-468`)

```ts
process.on("SIGTERM", () => {
  stopRunner();
  process.exit(0);
});
```

`runner.stop()` — асинхронный (возвращает Promise), но мы тут же `process.exit(0)`. Активные `sendMessageStreaming` обрываются — пользователь видит «думаю…» навсегда (если heartbeat утёк — см. SPEC C3). Также MCP subprocess'ы получают SIGPIPE.

**Fix:**
```ts
process.on("SIGTERM", async () => {
  console.log("SIGTERM");
  const sessions = getAllSessions();
  await Promise.allSettled(sessions.map(s => s.stop()));
  await runner.stop();
  process.exit(0);
});
```

### R-18 — Concurrent exec на absent container (`src/containers/manager.ts:223-242`)

Если 5 параллельных `exec(userId, ...)` приходят на absent container (например, после `remove` или fresh-start), все 5 берут lock, видят `state === "absent"`, логируют «exec called on absent container — no profile to bootstrap», ОБРЫВАЮТСЯ без recovery. Юзер видит 5 ошибок подряд.

Источник проблемы — `exec` принимает `userId`, а не `profile`, поэтому не может сам сделать `getOrStart`. Обычно `getOrStart` вызван заранее из `session.ts:758` под условием `useContainer`. Но если этот вызов не сработал (Docker temporarily glitched), exec падает.

**Fix:** хранить последний known `profile` в `ContainerManager` (lazy map), чтобы `exec` мог bootstrap'ить контейнер сам.

## Что в порядке

- **`--restart=unless-stopped`** в `spec.ts:60-61` — контейнеры переживут reboot хоста и рестарт dockerd. ✅
- **`--init`** в `spec.ts:64` + `daemon-runner` в Dockerfile — zombie processes ridieваются корректно. ✅
- **Per-user lock** в `request-queue.ts:23-40` (acquireUserLock) — освобождается через explicit `releaseFn`, не через identity check как `manager.ts`. ✅
- **`abortController` + hard 10-min timeout** в `session.ts:776-781` — query не висит навсегда. ✅
- **Exit code 1 supress logic** в `session.ts:1095-1117` — race между abort и subprocess teardown подавлен. ✅
- **`writeAuditLog`** в try/catch — не падает на full disk. ✅
- **Daemon runner crashThreshold/healUptime** в `main.go:28-35` — здоровый процесс через 60 сек обнуляет историю, fork-bomb на старте не бесконечный revive loop. ✅
- **Crashloop watcher с 1h cooldown** в `crashloop-watcher.ts:7` — не спамит owner. ✅
- **`--memory-swap == --memory`** в `spec.ts:108` — нет silent swap-thrashing. ✅

## Архитектурные замечания

1. **Нет health-endpoint'а у самого бота.** На хосте есть webhook на 3847 (Apple Watch) и dashboard на 3848, но `/healthz` для bot-process'а нет. Если bot.api.getUpdates loop остановился, но HTTP-серверы живут — внешний healthcheck не отловит. Добавить `/healthz` в dashboard-server с проверкой `runner.isRunning()` + age последнего processed update.

2. **Нет SLI/SLO.** Ни latency, ни error rate не измеряются. Audit-log пишется, но нет агрегатора. Минимум — собирать в metering.sqlite поле `latency_ms` и `error` для каждого message, и нарисовать график в дашборде. Сейчас "is the system healthy?" ответить можно только через `journalctl`-tail.

3. **Нет distinction между «бот не работает» и «модель медленная».** Heartbeat в `streaming.ts` показывает «✨ думаю…», но это включается через 15с silence. Если grammY polling lag даёт 30+ секунд между prismитель и обработкой, юзер ничего не понимает. Добавить `processing-started`-reaction (👌) сразу при получении message, как в `text.ts:259`.

4. **Cascading failure: один guest с OOM → Docker daemon под давлением → все контейнеры тормозят.** На хосте 16GB RAM, 10 контейнеров × 512MB = 5GB баланс, ещё бот 200MB. Запас 10GB. Но `du` в `vault-quota.ts` синхронный (см. Z3-F7), под нагрузкой может выжрать минуту. Нужен либо async `du`, либо переход на ext4 prjquota (упомянуто в комментариях, отложено).

5. **`getRecentlyActiveUsers` хранит state в `/tmp`** — см. R-04. Та же категория — место для будущих `runtime/`-данных, которое должно переживать reboot.

## Сценарии failure (numbered)

1. **«Контейнер застрял на kernel D-state».** Гость запустил `python -c "import socket; socket.create_connection(('192.0.2.1', 80))"` на маршрут с blackhole. Сокет ждёт TCP retry forever. `docker exec ... bash -c "ls"` тоже ждёт kernel — exec-timeout 30s сработает, юзер видит «❌». **Текущее поведение:** молча отбрасывает каждый запрос. **Желаемое:** счётчик exec-timeouts → restart контейнера + DM юзеру (см. R-03).

2. **«Docker daemon рестартовался после bot startup».** Например, unattended-upgrades обновили `docker-ce`. Бот видел Docker на старте → `dockerAvailable=true`. Через час dockerd рестартанулся за 5с — все live `docker exec` упали, новые не идут (но `ensureDocker` всё ещё true). Бот ловит exec-ошибки и думает «команда упала». **Желаемое:** на N подряд exec-fail → перепроверить `ensureDocker` + restart all-on контейнеры (см. R-07).

3. **«Юзер шлёт 50 сообщений за 10 секунд».** `sequentialize` в `index.ts:161` serialise'ит per-chat. Но `addPendingContext` (text.ts:255) — массив без bound, накапливает все 50 в `pendingContextMessages`. После завершения текущей сессии всё 50 сообщений идут в один query как «контекст» → input tokens × 50. **Текущее поведение:** биллинг улетает в космос. **Желаемое:** bound `pendingContextMessages` 5-10 сообщений + drop oldest.

4. **«OOMkiller убивает бот вместо контейнера».** Гость через `mcp__container__Bash` запустил `python -c "x = bytearray(10**10)"` — контейнер OOM-падает (правильно), но если в этот момент Node-процесс делал I/O — OOMkiller глядит на live `oom_score` и может зацепить **бота** (см. R-06). systemd рестартанёт через `Restart=always`, но 5-секундный downtime + потеря inflight-сессий.

5. **«Reboot хоста (Hetzner maintenance)».** Хост рестартанулся. Бот стартанул, контейнеры стартанули (`--restart=unless-stopped`). Но `/tmp/claude-active-users.json` пропал (см. R-04) → восстановительные DM не уходят. Пользователи, которые писали 30 секунд до reboot'а, висят с «думаю…» — heartbeat уже мертвый, текст не приходит, никакого алерта нет. **Желаемое:** persistent `runtime/` + при старте проверить — есть ли `/tmp/ask-user-*.json` и реанимировать.

6. **«100 always-on юзеров после bot crash».** `init()` revive sequential (см. R-09). Если каждый getOrStart занимает 3 секунды (start + healthcheck) — 5 минут пока бот вообще начнёт принимать сообщения. polling-runner не запущен, обновления копятся → длинный backlog → когда runner стартанёт, лавина параллельных handlers → OOM. **Желаемое:** Promise.allSettled + не блокировать `run(bot)`.

7. **«Один guest съел все pids у host UID 1000».** Хотя `--pids-limit=512` per-container правильный, host UID 1000 (sandbox-user тоже UID 1000) shared. **`spec.ts:138-141`** комментарий правильно объясняет, **что nproc УБРАН именно потому**. Но nofile (см. R-10) — то же самое, не покрыто. Под нагрузкой 10 контейнеров × 2048 FDs может уехать в host limit.

8. **«SQLite WAL lock contention под нагрузкой».** `recordUsage` в `metering.ts` через synchronous SQLite call. Если 10 пользователей одновременно завершают query, 10 INSERT'ов сериализуются на WAL. На SSD это микросекунды. На загруженном диске (если рядом крутится `du` от vault-quota — см. SPEC Z3-F7) — лаги до секунд. Event loop блокируется. **Желаемое:** перевести `recordUsage` в async через batched writer (буферизировать 100ms-окно).

9. **«Telegram API 429 при rate-limit на массовое удаление сообщений».** `streaming.ts:611-668` — на `done` бот удаляет промежуточные tool-messages и text-segments. При длинной сессии (20 tool-вызовов × 2 пользователя одновременно = 40 deleteMessage за секунду) Telegram отвечает 429. Код **частично** защищён (`rateLimited` flag breakя loop), но не сохраняет state — на следующий `done` снова попытается удалить старые. **Желаемое:** persist «what to delete next» в сессии, чтобы делать batched cleanup с экспоненциальным retry-after.

10. **«Disk full на /var/lib/docker».** Новые `docker run` упадут с «no space left on device». `getOrStartUnlocked` бросит ошибку → withLock release → следующий `exec` снова попробует — снова упадёт. Юзер видит «❌» бесконечно. **Желаемое:** на disk-full ошибки → alert owner + временно отключить containerEnabled для новых сессий.
