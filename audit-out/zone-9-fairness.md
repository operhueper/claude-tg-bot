# Zone 9 — Resource Fairness между гостевыми контейнерами

## Summary

Аудитировал плоскости CPU / RAM / IO / Network / PID / concurrent-slot / observability на предмет того, может ли один шумный гость деградировать сервис для остальных. Хост — Hetzner CX (≈7.6 GB RAM, shared CPU), потолок ~10 гостей.

Что хорошо: RAM-cap (`--memory=512m` + swap off), CPU-cap (`--cpus=1.0`), `--pids-limit=512`, `--ulimit=nofile=1024:2048`, swap off (no thrashing на хосте), egress-monitor с HTB-throttle при 20 GB/день, vault soft-quota 2 GB.

Что плохо: **полностью отсутствует disk-IO fairness** (нет `--blkio-weight`, нет `--device-read-bps`) — один гость через `dd if=/dev/zero of=foo` или `yt-dlp` в vault может насытить диск и заморозить overlay-FS всем (включая хост-бота). Дальше — **отсутствует CPU-burst-fairness между несколькими гостями на одном ядре** (cgroup v2 `cpu.weight` не выставлен; при overcommit (10 гостей × 1 CPU на 4 ядрах) CFS делит честно, но без приоритета для интерактивных хендлеров бота). Network ingress / egress в реальном времени **не лимитирован** (HTB-throttle включается только по сумме за день, не по burst). Profile/tier не пробрасывает ресурс-лимиты — все гости получают одинаковые 512 MB / 1 CPU, paid от free не отличается по ресурсам.

Всего находок: **3 critical**, **5 high**, **6 medium**, **4 low** = 18.

## Findings

| # | Severity | File:Line | Issue |
|---|----------|-----------|-------|
| F-01 | critical | src/containers/spec.ts:107 (отсутствие) | Нет disk-IO лимитов (`--device-read-bps`, `--device-write-bps`, `--blkio-weight`). Один гость через `dd`/`yt-dlp` насыщает диск, замораживает overlay-FS всех гостей и хоста-бота. |
| F-02 | critical | src/request-queue.ts:7-10 | `MAX_CONCURRENT_CONTAINER_SESSIONS=5` при 10 гостях формирует FIFO без weight/priority. Один тяжёлый запрос-победитель (на 30+ секунд) держит слот; остальные ждут. Нет timeout на удержание слота → leaked slot deadlocks (см. SPEC HIGH-15). |
| F-03 | critical | src/containers/spec.ts (нет ingress) | Egress лимит срабатывает только при >20 GB/день суммарно (scripts/firewall/egress-monitor.sh:16). Один гость может в пике скачать 5 GB за 5 минут (yt-dlp 4K video) и насытить uplink, мешая остальным запросам бот→Telegram/Anthropic. Нет burst-rate-limit. |
| F-04 | high | src/containers/spec.ts:111 | `--cpus=1.0` фиксированный = hard cap, нет `--cpu-shares`/cgroup v2 `cpu.weight`. При overcommit (10 контейнеров × 1.0 CPU = 10 vCPU на 4 физических) host-процесс бота (PID 1 systemd-сервис) не имеет приоритета над guest-burst — может страдать latency Telegram polling и Anthropic streaming. |
| F-05 | high | src/types.ts:94-120 | `TierConfig` не содержит resource-полей (`memoryMb`, `cpus`, `diskQuotaBytes`, `egressBytesPerDay`). Paid пользователь получает ровно те же 512 MB / 1 CPU / 2 GB / 20 GB-day, что и free — невозможно дифференцировать без хардкода в spec.ts. |
| F-06 | high | src/containers/spec.ts:106-108 | `--memory=512m` × 10 гостей = 5.1 GB committed только под гостей. Хост 7.6 GB - 5.1 = 2.5 GB на бот/MCP/lxcfs/nginx/systemd. Бот легко может за-allocate ≥1 GB сам (V8 heap + кэши) — близко к OOM-краю host'а при пике. Защиты для bot-процесса (`--oom-score-adj`) нет. |
| F-07 | high | src/containers/manager.ts:46-47 | `IDLE_PAUSE_MS = 15 min` и `IDLE_STOP_MS = 24h` — освобождают RAM, но `hasActiveDaemons()` (manager.ts:72-79) полностью отключает pause/stop. Если 10 гостей включат `.daemons.yaml` с `enabled: true` (а это поощряется через bot-scheduler) — все 10 × 512 MB = 5 GB заблокированы навсегда. |
| F-08 | high | src/containers/spec.ts:147 | Все гости `--user=1000:1000` (общий UID на хосте, см. комментарий manager.ts:50-54). Файловые системные лимиты на per-UID (хост: `nproc`, `nofile`, `RLIMIT_NPROC`) общие → если один гость захватит весь UID-budget (даже косвенно через bind-mount FD share), затронет остальных. spec.ts:138 правильно замечает это для `--ulimit=nproc`, но не решает для других host-uid-границ (например inotify per-user). |
| F-09 | medium | src/containers/spec.ts:107-108 (отсутствие `--memory-reservation`) | Нет `--memory-reservation=N`, который даёт soft-guarantee. При memory pressure ядро может реклаймить cache у "тихого" гостя, замедляя его IO — нет указания "минимум-сохранения" под каждый контейнер. |
| F-10 | medium | src/handlers/text.ts:212-213 | UX-сообщение про очередь `⏳ В очереди (${queued + 1}-й)` показывает только позицию; не сообщает ETA, нет timeout на ожидание. Если 5 активных слотов застряли (см. F-02), 6+ юзер ждёт молча. |
| F-11 | medium | src/containers/spec.ts:157-159 | `--tmpfs=/tmp:size=128m` × 10 гостей = 1.28 GB RAM-tmpfs суммарно. Эти 1.28 GB не учтены в `--memory=512m` (tmpfs живёт в page cache хоста, не cgroup контейнера!) — реальный committed RAM выше декларируемого. |
| F-12 | medium | src/containers/metrics.ts:181-202 | `getContainerMetrics` запускает `docker stats --no-stream` per-container последовательно (точнее в `Promise.all`, но каждый stats — это 1-2с blocking docker API call). При 10 гостях `getAllContainerMetrics()` = >10с латентности → дашборд лагает, race с idle-watchdog. |
| F-13 | medium | src/containers/metrics.ts:289-308 | `getGuestsAggregate` суммирует CPU% — но `docker stats` показывает CPU normalized "100% per core", и при `--cpus=1.0` потолок per-container 100%. Сумма 10×100% = 1000%, что больше 4 ядер × 100% = 400% host'а. Метрика mislead'ит — нет нормировки на physical-cores. |
| F-14 | medium | src/containers/vault-quota.ts:47-78 | Soft-quota check проверяет `du -sb` (60s TTL) до сообщения, но НЕ блокирует запись внутри контейнера. Между двумя проверками гость может писать сколько угодно (overlay-FS лимита нет, --read-only только rootfs, vault bind-mount writable). 2 GB → 200 GB за минуту вполне реально. |
| F-15 | low | src/containers/spec.ts:128-129 | `--pids-limit=512` — разумно, но для гостей с активными daemons (bot-scheduler) можно дойти. Per-user override (`GUEST_PIDS_OVERRIDES`) есть, но никем не используется автоматически — paid-tier не получает повышенный лимит. |
| F-16 | low | scripts/firewall/egress-monitor.sh:17,184 | Throttle-rate жёстко 100 kbit/s после превышения 20 GB/день — нет градации (например 1 mbit для paid, 100 kbit для free) и нет per-user reset до полуночи (egress-reset.sh запускается раз в день). |
| F-17 | low | src/containers/manager.ts:46 | `IDLE_PAUSE_MS = 15 min` — слишком быстро для UX «пользователь думает», слишком медленно для освобождения RAM при пике. Нет адаптивности (например уменьшать при memory-pressure хоста). |
| F-18 | low | src/containers/spec.ts (отсутствие `--oom-kill-disable=false`) | По умолчанию OOM-killer убивает PID 1 (tini) контейнера → весь контейнер с daemons. Лучше явно ставить `--oom-score-adj=500` (выше score для guest), чтобы при глобальном OOM хоста сначала умирали guest'ы, а не bot-процесс. |

## Текущие лимиты (фактическая таблица)

| Плоскость | Текущий механизм | Per-container | Per-host total (10 guests) | Источник |
|---|---|---|---|---|
| **RAM** | `--memory=512m` + `--memory-swap=512m` | 512 MB | 5.1 GB | spec.ts:106-108 |
| **RAM (tmpfs /tmp)** | `--tmpfs=/tmp:size=128m` (НЕ в --memory cgroup) | +128 MB | +1.28 GB (page cache) | spec.ts:157 |
| **CPU** | `--cpus=1.0` (cgroup quota) | 1 core | 10 vCPU (overcommit на 4-core host) | spec.ts:111 |
| **CPU weight** | Отсутствует (нет `cpu-shares`/`cpu.weight`) | — | — | — |
| **Disk IO** | Отсутствует | unlimited | unlimited | — |
| **Disk space (vault)** | Soft-check `du -sb` per request | 2 GB (1 user — 6 GB) | 20-26 GB | vault-quota.ts:18-24 |
| **Disk space (rootfs)** | `--read-only` | 0 (нельзя писать) | 0 | spec.ts:152 |
| **Network egress (sum)** | HTB throttle при >20 GB/день | 20 GB/day | 200 GB/day | egress-monitor.sh:16 |
| **Network egress (burst)** | Отсутствует | unlimited | unlimited | — |
| **Network ingress** | Отсутствует | unlimited | unlimited | — |
| **PIDs** | `--pids-limit=512` | 512 threads | 5120 (cgroup-per-container) | spec.ts:128-129 |
| **File descriptors** | `--ulimit=nofile=1024:2048` | 1024 soft / 2048 hard | per-container | spec.ts:133 |
| **Concurrent guests on bot** | Global semaphore | — | 5 (MAX_CONCURRENT_CONTAINER_SESSIONS) | request-queue.ts:7-10 |
| **Capabilities** | `--cap-drop=ALL` | 0 caps | — | spec.ts:115 |
| **Idle pause** | 15 min → docker pause | освобождает RAM | до 5 GB | manager.ts:46 |
| **Idle stop** | 24h → docker stop | освобождает всё | до 5 GB | manager.ts:47 |

## Detailed findings

### F-01 — Disk IO fairness отсутствует (critical)

Нет ни `--device-read-bps`, ни `--device-write-bps`, ни `--device-read-iops`, ни `--blkio-weight` (cgroup v1) / `io.weight` (cgroup v2) в `buildRunArgs()` (spec.ts:45-212). Гость через `dd if=/dev/zero of=/opt/vault/<id>/big.bin bs=1M count=10000`, `yt-dlp -f bestvideo`, `tar` на большой директории, `pip install` (распаковка), `apt-get` (если бы было разрешено) — каждый из этих процессов может насытить пропускную способность диска. На Hetzner CX-серверах диск — это NVMe shared SSD; при насыщении IO любая операция overlay-FS (включая bot'а, читающего session-files) встаёт.

**Fix:** добавить в spec.ts (для не-owner ветки):
```
args.push("--blkio-weight=500");              // default 500, можно дать paid=800, free=200
args.push("--device-write-bps", "/dev/sda:50m");  // 50 MB/s write cap
args.push("--device-read-bps", "/dev/sda:100m");  // 100 MB/s read cap
args.push("--device-write-iops", "/dev/sda:2000");
args.push("--device-read-iops", "/dev/sda:4000");
```
Точное имя устройства (`/dev/sda` или `/dev/nvme0n1`) определять на старте бота через `df /opt/vault | tail -1 | awk '{print $1}'`.

### F-02 — Concurrent slot semaphore без priority + leak risk (critical)

`request-queue.ts:53-66`: FIFO queue без timeout на ожидание, без priority. Слот удерживается всё время handler'а (handlers/text.ts:200-443). Если запрос упирается в долгий MCP-call (например `mcp__container__Bash` с `yt-dlp` на 5 минут), слот занят 5 минут.

При `MAX_CONCURRENT=5` и 10 гостях, 5 могут эффективно DoS'нуть остальных 5, просто все одновременно начав долгий запрос.

**Fix:** (a) добавить `await Promise.race([acquireContainerSlot(), timeout(30s)])` с возвратом `try again later`; (b) per-user priority queue (free → low, paid → high); (c) hard timeout на удержание слота (см. SPEC HIGH-15).

### F-03 — Network egress: burst не лимитирован (critical)

`egress-monitor.sh` срабатывает только когда суммарный daily трафик контейнера превысил 20 GB. До этого момента гость может в течение 5-10 минут забирать ВСЮ полосу uplink хоста. Сервер Hetzner CX обычно имеет 1 Gbit shared; 5 минут × 1 Gbit ≈ 37 GB — и только тогда сработает throttle. В этот период бот не сможет нормально стримить ответы.

**Fix:** baseline `tc htb` cap на КАЖДЫЙ container IP сразу при создании, например 20 mbit/s каждому. Throttle до 100 kbit при >20 GB остаётся как штрафной режим. Ingress (download) аналогично через `ifb` (intermediate functional block).

### F-04 — CPU weight не выставлен (high)

`--cpus=1.0` — это hard cap. Когда контейнер ничего не делает, его CPU свободен. Когда 10 контейнеров одновременно делают heavy work, CFS делит честно 1:1:1:...:1 (default), но host-процессы (включая bot) не получают приоритета. При spike'ах бот может пропускать Telegram-polling heartbeat'ы.

**Fix:**
```
args.push("--cpu-shares=512");  // guest default; bot systemd-unit получает CPUWeight=1024
```
Или через cgroup v2 `cpu.weight` (default 100; guest=50, bot=200). Также добавить `nice -n 10` или `--cpu-rt-runtime=0` (запрет real-time scheduling гостям).

### F-05 — TierConfig без resource-полей (high)

`src/types.ts:94-120` — `TierConfig` определяет `dailyMessageLimit`, `containerEnabled`, `voiceEnabled` etc. Нет полей `memoryMb`, `cpus`, `diskQuotaBytes`, `egressDailyBytes`, `diskBpsLimit`. Хардкоды в spec.ts:38 (`DEFAULT_GUEST_MEMORY_MB = 512`) и vault-quota.ts:18 единые для всех.

**Fix:** расширить TierConfig:
```typescript
export interface TierConfig {
  tier: UserTier;
  dailyMessageLimit: number | null;
  containerEnabled: boolean;
  voiceEnabled: boolean;
  fileEnabled: boolean;
  googleEnabled: boolean;
  // Resource limits
  memoryMb: number;          // free: 256, paid: 1024
  cpus: number;              // free: 0.5, paid: 2.0
  diskQuotaGb: number;       // free: 1, paid: 5
  egressDailyGb: number;     // free: 5, paid: 50
  diskWriteMbps: number;     // free: 20, paid: 100
  pidsLimit: number;         // free: 256, paid: 1024
}
```
И в spec.ts читать `profile.tierConfig.memoryMb` вместо хардкодов.

### F-06 — Host memory committed close to ceiling (high)

7.6 GB - (5.1 GB guests + 1.28 GB tmpfs + ~1 GB bot Bun process + 500 MB systemd/lxcfs/nginx) = около 0 свободно при пике. Если еще один гость закомиттит 512 MB tmpfs (через `dd of=/tmp/big`) — OOM-killer на хосте начнёт убивать процессы. Тарgeт OOM-killer'а выбирается по oom_score; bot может стать жертвой.

**Fix:**
1. Снизить default memory до 384 MB (10 × 384 = 3.84 GB).
2. Добавить `--memory-reservation=256m` (soft-guarantee, kernel reclaim не уйдёт ниже).
3. Bot systemd-unit: `OOMScoreAdjust=-500` + контейнеры `--oom-score-adj=500`.
4. Tmpfs урезать до 64 MB (Claude CLI распаковывает <50 MB).

### F-07 — Always-on daemons блокируют pause/stop indefinitely (high)

`hasActiveDaemons()` (manager.ts:72-79) при наличии `.daemons.yaml` с `enabled: true` полностью отменяет pause/stop. Для 10 paid-пользователей с включёнными ботами это означает 5+ GB заблокированной RAM 24/7. Нет лимита "максимум N always-on контейнеров".

**Fix:** Ввести `MAX_ALWAYS_ON = 5`; если превышено — ставить daemon в режим "wake on schedule" вместо continuous-run (контейнер просыпается из stopped по cron'у). Или per-tier лимит количества daemon'ов.

### F-08 — Все гости делят host-UID 1000 (high)

Замечание в spec.ts:138 правильно отказывается от `--ulimit=nproc` (UID-wide), но не решает: inotify watches per-UID (`/proc/sys/fs/inotify/max_user_watches`, default 8192), open files per-UID (`/proc/sys/fs/file-max`), shared memory per-UID. Если один гость заберёт все 8192 inotify-слота, остальные 9 гостей не смогут запустить даже `tsc --watch`.

**Fix:** запустить каждого гостя под уникальным UID (`useradd -u $((10000 + userId))` в init-скрипте контейнера + `chown -R` vault'а на этот UID). Это потребует существенной правки manager.ts:50-54 (chownToSandbox). Альтернатива — bumpнуть host'овые лимиты (`sysctl fs.inotify.max_user_watches=524288`).

### F-09 — Нет --memory-reservation (medium)

Под memory pressure хоста ядро реклаймит page cache и anonymous pages по LRU. Контейнер без `--memory-reservation` уязвим — его cache могут вычистить, чтобы освободить страницы под другой контейнер. Симптом: после паузы гость "медленнее стартует" — всё перечитывается с диска.

**Fix:** `args.push("--memory-reservation", "128m")` — soft guarantee, что 128 MB не будут реклаймиться.

### F-10 — Очередь без timeout/ETA (medium)

handlers/text.ts:211-216 показывает только `⏳ В очереди (N-й)`. Если все 5 слотов застряли в leaked-state (F-02), 6+ юзер ждёт молча навсегда. Нет timeout на acquireContainerSlot.

**Fix:** в request-queue.ts:53 ввести `acquireContainerSlot(timeoutMs: number = 60000)` с `Promise.race([waitForSlot, timeout])`; при timeout — отказать с понятным сообщением и логом.

### F-11 — Tmpfs не учитывается в memory cgroup (medium)

`--tmpfs=/tmp:size=128m` в Docker реализован через `mount -t tmpfs`. На уровне ядра tmpfs учитывается в `kmem` (cgroup v1) или общем `memory.current` (cgroup v2), НО только если задан тот же memory cgroup. По дефолту Docker для tmpfs использует отдельный mount namespace — это значит 128 MB tmpfs могут вырасти **сверх** `--memory=512m`, не сработает OOM.

**Fix:** проверить на проде `cat /sys/fs/cgroup/.../memory.current` под нагрузкой `dd of=/tmp/big`. Если tmpfs не учитывается — урезать до 64 MB или использовать bind-mount on regular volume вместо tmpfs.

### F-12 — getContainerMetrics блокирует docker daemon (medium)

metrics.ts:181-202 для каждого контейнера делает `docker stats --no-stream` (это локальный API, ~500ms-2s). 10 параллельных вызовов через `Promise.all` могут затормозить docker daemon, что отразится на других guest-операциях.

**Fix:** `docker stats --no-stream --format ...` без указания контейнеров — вернёт все running контейнеры одним вызовом. В metrics.ts:232-237 переписать `getAllContainerMetrics()` чтобы получать stats одним batch'ем.

### F-13 — getGuestsAggregate CPU% сумма мисли́д (medium)

metrics.ts:289-308 суммирует `cpu.percent` по всем контейнерам. При `--cpus=1.0` cap — каждый показывает 100% при загрузке. Сумма 1000% на дашборде выглядит как "хост загружен на 1000%", хотя физически это 4 ядра × 100% = max 400%. Нужно нормировать.

**Fix:** в metrics.ts:301 поделить `cpuPercent` на `cpus().length` (host cores) или показывать "guests use X cores out of Y".

### F-14 — Vault quota не блокирует runtime запись (medium)

vault-quota.ts:47-78 проверяет ДО получения сообщения. Внутри сессии гость может писать неограниченно — между двумя проверками `du -sb` (60s TTL) контейнер мог записать гигабайты. Лимит реально проверяется только перед следующим сообщением.

**Fix:** короткосрочно — уменьшить CACHE_TTL_MS с 60s до 10s. Долгосрочно — quota на уровне ядра (`prjquota` на ext4, как и упомянуто в vault-quota.ts:11), либо bind-mount каждого vault'а как loopback-file фиксированного размера (`fallocate -l 2G /var/vaults/<id>.img; mkfs.ext4; mount`).

### F-15 — pids-limit override unused (low)

spec.ts:42-43 GUEST_PIDS_OVERRIDES пустой Record. Per-user повышение лимита есть, но не привязано к TierConfig. Paid пользователь с тяжёлыми daemons упирается в 512 без возможности расширить.

**Fix:** в TierConfig добавить `pidsLimit`, spec.ts:128 читать `profile.tierConfig.pidsLimit ?? DEFAULT_GUEST_PIDS`.

### F-16 — Egress throttle без градации (low)

100 kbit/s — это «punishment mode», непригодное даже для apt-get update. После throttle гость практически парализован до полуночи (egress-reset запускается раз в день). Нет «нежного» режима, например снижение до 5 mbit/s или alerting перед фактическим throttle.

**Fix:** двухступенчатый throttle — warning 5 mbit/s при 15 GB/day, hard 100 kbit/s при 25 GB/day. Per-tier лимиты.

### F-17 — Idle timer не адаптивный (low)

15 min/24h — статика. Под memory pressure хоста надо пожёстче (5 min), без давления — мягче (30 min). Нет дашборд-команды для админа «эвакуируй всех idle сейчас».

### F-18 — OOM score не настроен (low)

spec.ts не добавляет `--oom-score-adj`. При глобальном OOM хоста ядро выбирает жертву по `oom_score`, которая включает RSS — bot-процесс с Bun runtime (heap 500MB+) может стать первой жертвой раньше любого гостя.

**Fix:** `args.push("--oom-score-adj=500")` для гостей; в systemd unit бота `OOMScoreAdjust=-500`.

## Что в порядке

- **`--memory-swap` равен `--memory`** (spec.ts:108) — гарантирует zero swap, исключает silent grind / thrashing на хосте.
- **`--pids-limit=512`** (spec.ts:129) — корректный fork-bomb cap, изолирован на cgroup (per-container), не на UID.
- **`--ulimit=nofile=1024:2048`** (spec.ts:133) — разумно для веба и небольших ETL процессов.
- **`--read-only` rootfs** (spec.ts:152) — гость не может затрагивать систему контейнера.
- **`--cap-drop=ALL` + `--security-opt=no-new-privileges`** (spec.ts:115,119) — privesc невозможен.
- **lxcfs `/proc` masking** (spec.ts:180-205) — гость видит свой cgroup memory, не хостовые 7.6 GB; правильное info-hiding.
- **Egress per-IP HTB throttle** (egress-monitor.sh) — pre-emptive defense, хоть и грубая.
- **Vault soft-quota check** (vault-quota.ts) — даёт UX-friendly отказ до OOM/ENOSPC.
- **Idle pause/stop** (manager.ts:46-47) — реально освобождает RAM для неактивных пользователей.
- **--restart=unless-stopped** (spec.ts:61) — выживает host reboot, но не лечит crash-loop (что хорошо).
- **--init/tini** (spec.ts:65) — reaps zombies; критично для контейнеров с long-running tools (LibreOffice fork'ает).

## Архитектурные замечания

1. **Resource limits должны жить в TierConfig, не в спецификации.** Сейчас spec.ts хардкодит DEFAULT_GUEST_MEMORY_MB=512; чтобы дать paid 1024 MB, нужно править код. Архитектурно правильно: `profile.tierConfig` источник истины для всех ресурсных лимитов.

2. **CPU/Memory cap'ы должны быть пропорциональны host'у, не абсолютные.** При смене сервера на 16 GB хост текущие 512 MB станут абсурдно низкими, при смене на 4 GB — оверкомитом. Нужна функция `derive_limits(host_ram_gb, host_cpus, n_guests) → { memory, cpus, ... }`.

3. **Disk IO — самый зияющий пробел.** Все остальные плоскости имеют хоть какой-то лимит (cap, soft-check, threshold). Disk полностью открыт — это критический риск для shared host'а.

4. **Tmpfs не учитывается в `--memory` cgroup** (F-11). Это означает фактический memory commit гостя = 512 + 128 = 640 MB; реальные числа capacity-planning должны это учитывать.

5. **Один UID для всех гостей** (F-08) — компромисс ради простоты bind-mount'ов, но создаёт хост-уровневые шарящие лимиты (inotify, file-max). При росте до 10+ гостей надо либо повышать host sysctl, либо переходить на per-user UID.

6. **Метрики собираются "по requestу" от дашборда.** Нет real-time alerting на превышение порогов (например >80% RAM в контейнере). Когда юзер замечает проблему — она уже произошла.

7. **Egress monitor работает в KB scope, без burst-control.** Защищает от total-volume атаки за день, но не от 5-минутного burst'а.

## Рекомендованная схема лимитов для текущей машины (7.6 GB RAM, ~4-8 vCPU, до 10 гостей)

Цель: 8 paid + 2 free = 10 одновременных гостей, оставить ≥1.5 GB RAM хосту, не допустить ни IO, ни network, ни CPU starvation.

### TierConfig поля (расширить types.ts):
```typescript
free: {
  memoryMb: 256,
  cpus: 0.5,             // half-core cap
  cpuShares: 256,        // half-weight под нагрузкой
  pidsLimit: 256,
  diskQuotaGb: 1,
  diskWriteMbps: 20,
  diskReadMbps: 50,
  diskWriteIops: 1000,
  diskReadIops: 2000,
  egressDailyGb: 5,
  egressBaselineMbps: 5,    // tc htb cap всегда
  egressBurstMbps: 20,      // короткий burst позволен
}
paid: {
  memoryMb: 768,
  cpus: 2.0,             // 2 cores burst
  cpuShares: 1024,
  pidsLimit: 1024,
  diskQuotaGb: 5,
  diskWriteMbps: 100,
  diskReadMbps: 200,
  diskWriteIops: 4000,
  diskReadIops: 8000,
  egressDailyGb: 30,
  egressBaselineMbps: 30,
  egressBurstMbps: 100,
}
```

### Host-level бюджет:
- RAM: 8 paid × 768 + 2 free × 256 = 6.6 GB. Это слишком — урезать до 8 × 512 + 2 × 256 = 4.6 GB, оставить 3 GB хосту/bot/lxcfs. Или: понизить MAX_CONCURRENT_CONTAINER_SESSIONS=5 и считать что максимум 5 одновременно жрут RAM (idle pause освобождает).
- CPU: 8 × 2.0 + 2 × 0.5 = 17 vCPU при 4 физических ядрах — overcommit 4.25x. Это нормально (CFS делит честно), пока cpuShares гарантирует weight'ы. Bot имеет CPUWeight=1024 (приоритет над любым гостем).
- Disk: NVMe Hetzner ≈400 MB/s write. 8 × 100 + 2 × 20 = 840 MB/s aggregated — overcommit, но реалистично если не все одновременно. blkio-weight=500 default.
- Network: 1 Gbit uplink = 125 MB/s. 8 × 30 + 2 × 5 = 250 mbit baseline — overcommit, ОК если не все одновременно качают.

### Docker run-args диff (spec.ts:99-205 не-owner ветка):

Добавить:
```
args.push("--memory", `${profile.tierConfig.memoryMb}m`);
args.push("--memory-swap", `${profile.tierConfig.memoryMb}m`);
args.push("--memory-reservation", `${Math.floor(profile.tierConfig.memoryMb / 2)}m`);
args.push("--cpus", String(profile.tierConfig.cpus));
args.push("--cpu-shares", String(profile.tierConfig.cpuShares));
args.push("--pids-limit", String(profile.tierConfig.pidsLimit));
args.push("--blkio-weight=500");
args.push("--device-write-bps", `/dev/sda:${profile.tierConfig.diskWriteMbps}m`);
args.push("--device-read-bps", `/dev/sda:${profile.tierConfig.diskReadMbps}m`);
args.push("--device-write-iops", `/dev/sda:${profile.tierConfig.diskWriteIops}`);
args.push("--device-read-iops", `/dev/sda:${profile.tierConfig.diskReadIops}`);
args.push("--oom-score-adj=500");
```

Убрать (или урезать):
```
args.push("--tmpfs=/tmp:size=64m,exec");  // было 128m
```

### Host-level настройки:

```bash
# systemd: бот в приоритете при OOM
systemctl edit claude-tg-bot
[Service]
OOMScoreAdjust=-500
CPUWeight=1024
IOWeight=1000
MemoryHigh=2G

# Inotify per-UID повысить
sysctl -w fs.inotify.max_user_watches=524288
sysctl -w fs.inotify.max_user_instances=1024

# Egress baseline для каждого контейнера сразу при docker create
# (новый скрипт scripts/firewall/set-baseline-egress.sh, hook от docker events)
```

### MAX_CONCURRENT_CONTAINER_SESSIONS:
- Понизить до **3** на текущей машине (4-core, 7.6 GB) — за раз обрабатывается не более 3 тяжёлых запросов. Очередь со 60s timeout.
- На сервере 16 GB / 8-core можно поднять до 6-8.
