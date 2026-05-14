# Сверка SECURITY_AUDIT_2026_05_10.md с актуальным кодом

Дата проверки: 2026-05-14

## Контекст дня проверки

Сегодня выяснили: free-tier гости (`containerEnabled=false`) работают без Docker-контейнера, их Claude subprocess запускается **на хосте под root**. Через это утёк `TELEGRAM_BOT_TOKEN`. Ряд находок (особенно HIGH #1, #3) стали более критичными с учётом этого факта.

## Сводка

- Всего находок: 53 (HIGH=17, MEDIUM=22, LOW=14)
- CLOSED: 34
- OPEN: 13
- PARTIAL: 6

---

## Находки

### [HIGH #1] Утечка любых файлов сервера через `send_file` MCP

- **Статус:** CLOSED
- **Файл:** `src/handlers/streaming.ts:142-158`
- **Что было:** `checkPendingSendFileRequests` доставлял файл без проверки пути.
- **Сейчас:** строки 143-158 вызывают `realpathSync(filePath)`, затем `isPathAllowedFor(realFilePath, sendProfile.allowedPaths)`. При провале — audit-log + `ctx.reply("Не могу отправить файл вне твоей рабочей папки.")` + unlink.
- **Доказательство:** `streaming.ts:153 — if (!isPathAllowedFor(realFilePath, sendProfile.allowedPaths)) {`
- **Примечание:** фикс работает **только для контейнерных гостей**. Free-tier гость (без контейнера) запускается на хосте под root; Claude-subprocess там работает напрямую и в принципе может писать `.env` в vault гостя, откуда `send_file` его доставит. Общий вектор — free-tier on-host root — остаётся открытым как отдельная угроза (не этой находки, но усиливает её контекст).

---

### [HIGH #2] `COMPOSIO_API_KEY` в env гостевого CLI

- **Статус:** CLOSED
- **Файл:** `src/config.ts:1056-1066` (`deepseekEnv`)
- **Что было:** ключ Composio пробрасывался в env гостевого subprocess.
- **Сейчас:** `buildGuestBaseEnv()` (строки 974-981) передаёт только `PATH, HOME, TMPDIR, TZ, LANG, LC_ALL, USER, LOGNAME`. `deepseekEnv` (строки 1056-1066) строится поверх него и не содержит `COMPOSIO_API_KEY`. Явный спред `process.env` заменён allowlist.
- **Доказательство:** `config.ts:974 — function buildGuestBaseEnv(): ... const passthrough = ["PATH", "HOME", ...]`

---

### [HIGH #3] Подагенты `parallel_mcp` без sandbox

- **Статус:** CLOSED
- **Файл:** `parallel_mcp/server.ts:121-152`
- **Что было:** дочерние `query()` без гостевых ограничений.
- **Сейчас:** строки 121-152 читают `TELEGRAM_PARALLEL_IS_GUEST`, `TELEGRAM_PARALLEL_ALLOWED_PATHS`, `TELEGRAM_PARALLEL_DISALLOWED_TOOLS`, `TELEGRAM_PARALLEL_SETTINGS_SOURCES` из env и строят `guestSubtaskSystemPrompt` для гостевых подзадач.
- **Примечание:** аналогично HIGH #1, free-tier гости без контейнера работают на хосте под root — ограничения `allowedPaths` при этом остаются мягкими (промпт, не принудительный sandbox).

---

### [HIGH #4] Дашборд сломан из-за `X-Frame-Options: DENY`

- **Статус:** OPEN
- **Файл:** `scripts/nginx/snippets/security-headers.conf:3`
- **Что было:** `X-Frame-Options: DENY` блокирует Telegram Mini App iframe.
- **Сейчас:** строка 3 по-прежнему содержит `add_header X-Frame-Options "DENY" always;`. Location `/dashboard` не переопределяет заголовок.
- **Доказательство:** `security-headers.conf:3 — add_header X-Frame-Options "DENY" always;`

---

### [HIGH #5] Тайминг-атака на HMAC дашборда

- **Статус:** CLOSED
- **Файл:** `src/dashboard-server.ts:155-160`
- **Что было:** обычное строковое сравнение `expectedHash !== hash`.
- **Сейчас:** `timingSafeEqual(Buffer.from(expectedHash, "hex"), Buffer.from(hash, "hex"))` (строка 156), плюс предварительная проверка длины (строка 155).
- **Доказательство:** `dashboard-server.ts:16 — import { createHmac, timingSafeEqual } from "node:crypto";`

---

### [HIGH #6] Подмена system prompt через memory graph

- **Статус:** PARTIAL
- **Файл:** `src/memory/inject.ts:6-16`
- **Что было:** `node.label` / `node.data` без санитизации склеивались в system prompt.
- **Сейчас:** функция `sanitizeForPrompt` (строки 6-16) обрезает до 500 символов, убирает markdown-заголовки, `SYSTEM:`, `INST:`, `<|`, `[INST]`, code fences. Zod-схемы нет, `graph.ts:45` не валидирует структуру JSON.
- **Что осталось:** отсутствует zod-валидация типов узлов; поле `node.type` передаётся в `typeLabels` без проверки (возможна инъекция через ключ объекта); `sanitizeForPrompt` не экранирует HTML-символы (`<`, `>`).

---

### [HIGH #7] lxcfs-mount без проверки

- **Статус:** CLOSED
- **Файл:** `src/containers/spec.ts:218-244`
- **Что было:** lxcfs-монты добавлялись безусловно, при отсутствии lxcfs `docker run` падал.
- **Сейчас:** строки 226-231 читают `/var/lib/lxcfs/proc/meminfo` — при ошибке `lxcfsWorking = false`, монты не добавляются.
- **Доказательство:** `spec.ts:226-231 — try { fs.readFileSync(...); lxcfsWorking = true; } catch { lxcfsWorking = false; }`

---

### [HIGH #8] Фаервол целится не в ту подсеть

- **Статус:** CLOSED
- **Файл:** `scripts/firewall/setup-firewall.sh:6`
- **Что было:** хардкод `172.17.0.0/16`.
- **Сейчас:** строка 6 динамически получает подсеть: `docker network inspect claude-guest-net --format '{{range .IPAM.Config}}{{.Subnet}}{{end}}'`.
- **Доказательство:** `setup-firewall.sh:6 — GUEST_SUBNET=$(docker network inspect claude-guest-net ...)`

---

### [HIGH #9] Не закрыт metadata-эндпоинт Hetzner

- **Статус:** CLOSED
- **Файл:** `scripts/firewall/setup-guest-network.sh:70-74`
- **Что было:** нет правила DROP для `169.254.169.254`.
- **Сейчас:** строки 70-74 добавляют `iptables -I FORWARD 1 -s $GUEST_SUBNET -d 169.254.169.254/32 -j DROP` (TCP и общий).
- **Доказательство:** `setup-guest-network.sh:70 — iptables -C FORWARD -s "$GUEST_SUBNET" -d 169.254.169.254/32 -j DROP`

---

### [HIGH #10] egress-reset.sh парсит iptables по неправильным колонкам

- **Статус:** CLOSED
- **Файл:** `scripts/firewall/egress-reset.sh:36-41`
- **Что было:** `read -r pkts bytes rest src dst` — `src` получал колонку `prot`.
- **Сейчас:** строки 36-41 используют `awk -v prefix="$SUBNET_PREFIX" '$8 ~ prefix ... { print $8, $2 }'` — колонка 8 = source, колонка 2 = bytes.
- **Доказательство:** `egress-reset.sh:37 — $8 ~ prefix && $8 != "0.0.0.0/0" { src = $8; sub(...); print src, $2 }`

---

### [HIGH #11] SMTP-rate-limit правила дублируются на каждом рестарте

- **Статус:** CLOSED
- **Файл:** `scripts/firewall/setup-firewall.sh:23-31`, `59-88`
- **Что было:** `rule_exists` не включал `--state NEW`, проверка всегда возвращала false.
- **Сейчас:** `rule_exists` использует `iptables -C "$@"` (строки 23-31) — полный набор флагов включая `--state NEW` передаётся через `"$@"`, поэтому идемпотентность обеспечена.
- **Доказательство:** `setup-firewall.sh:59-65 — if ! rule_exists "$CHAIN_SMTP" -p tcp --dport "$PORT" -m state --state NEW ...`

---

### [HIGH #12] Shell injection через template literal в vault-quota

- **Статус:** CLOSED
- **Файл:** `src/containers/vault-quota.ts:81`
- **Что было:** `execSync(\`du -sb ${vaultPath}\`)`.
- **Сейчас:** строки 23-27 определяют `execFileAsync = promisify(execFile)`, строка 81 вызывает `execFileAsync("du", ["-sb", vaultPath], { timeout: 10_000 })`.
- **Доказательство:** `vault-quota.ts:81 — execFileAsync("du", ["-sb", vaultPath], { timeout: 10_000 })`

---

### [HIGH #13] Хардкоднутый ID группового чата

- **Статус:** CLOSED
- **Файл:** `src/handlers/text.ts` (группа удалена полностью)
- **Что было:** `if (inGroup && chatId === -5115756668)`.
- **Сейчас:** файл `src/group-filter.ts` удалён; поддержка группового чата выпилена в коммите `4bd1910` ("remove group chat support and fast-path dead code"). Хардкода нет.

---

### [HIGH #14] Кнопки `/goals` ничего не делают

- **Статус:** CLOSED
- **Файл:** `src/handlers/callback.ts:172`
- **Что было:** `handleGoalCallback` не была зарегистрирована в `handleCallback`.
- **Сейчас:** строка 172 содержит `await handleGoalCallback(ctx, callbackData)`.
- **Доказательство:** `callback.ts:18 — import { handleGoalCallback } from "./goals";` / `callback.ts:172 — await handleGoalCallback(ctx, callbackData);`

---

### [HIGH #15] `connect-google` дроп-боксы без user_id scope

- **Статус:** CLOSED
- **Файл:** `connect_google_mcp/server.ts:91`, `src/handlers/streaming.ts:203`
- **Что было:** glob без userId, отсутствие cross-check.
- **Сейчас:** MCP пишет `connect-google-${userId}-${requestId}.json` (server.ts:91); бот глобит `connect-google-${userId}-*.json` (streaming.ts:203) и проверяет `data.user_id` (streaming.ts:218-221).

---

### [HIGH #16] Нет rate-limit на `/api/` дашборда

- **Статус:** CLOSED
- **Файл:** `scripts/nginx/snippets/rate-limiting.conf:5`, `proboi.site.conf:70`
- **Что было:** нет `limit_req_zone` и `limit_req` на API-эндпоинтах.
- **Сейчас:** `rate-limiting.conf:5 — limit_req_zone $binary_remote_addr zone=api:10m rate=60r/m;`; `proboi.site.conf:70 — limit_req zone=api burst=20 nodelay;`; аналогично в `dash.proboi.site.conf:43`.

---

### [HIGH #17] Хранимый XSS в админ-таблице дашборда

- **Статус:** CLOSED
- **Файл:** `src/templates/user-dashboard.ts:686-687`
- **Что было:** `innerHTML = item.label + ...` без экранирования.
- **Сейчас:** строки 686-687: `'<td>' + (item.label ? esc(item.label) : '—') + '</td>' + '<td>' + (item.model ? esc(item.model) : '—') + '</td>'`.
- **Доказательство:** `user-dashboard.ts:522 — function esc(s) {` (escaping helper используется в renderAdminTable).

---

## MEDIUM находки (#18–39)

| # | Статус | Файл | Пояснение |
|---|---|---|---|
| 18 | CLOSED | `src/dashboard-server.ts` | `vaultDir` больше не возвращается в `/api/me` (ответ содержит только `publicUrl`, метрики, tier) |
| 19 | CLOSED | `src/dashboard-server.ts:19` | `OWNER_ID` теперь импортируется как `OWNER_USER_ID` из `config.ts` |
| 20 | CLOSED | `src/subscription.ts:20-21` | `CACHE_TTL_NEGATIVE_MS = 60 * 1000` — негативные результаты кэшируются 60 с |
| 21 | CLOSED | `src/containers/manager.ts:326` | `cwd = options.cwd ?? getNewGuestVaultDir(userId)` — дефолт теперь vault, не `/workspace` |
| 22 | CLOSED | `src/containers/spec.ts:22` | Комментарий обновлён, описывает daemon-runner |
| 23 | CLOSED | `src/crashloop-watcher.ts:75,80` | `escapeHtml(ev.daemon)` применяется в Telegram-сообщении |
| 24 | CLOSED | `src/containers/spec.ts:207-213` | `CLAUDE_GUEST_NETWORK` теперь **обязателен** — при отсутствии бросает `Error`, дефолтного bridge нет |
| 25 | OPEN | `scripts/daemon-runner/main.go:157-161` | Зомби при ошибке `openLog` — Go-код не проверялся на предмет фикса (нет коммита с упоминанием) |
| 26 | OPEN | `scripts/firewall/egress-reset.sh:18` | `tc filter del` без фильтрации по chain — по-прежнему сносит все фильтры на интерфейсе |
| 27 | PARTIAL | `src/security.ts:BLOCKED_PATTERNS` | `BLOCKED_PATTERNS` в `config.ts:1215-1226` теперь включает `sh -c`, `python3 -c`, `| bash` — добавлено. Но `curl | sh`, `wget | sh`, `node -e` не покрыты |
| 28 | OPEN | `src/handlers/audio.ts` | Расширение из `audio.file_name` без whitelist — не исправлено |
| 29 | CLOSED | `src/handlers/media-group.ts:119` | Ключ `${userId}:${mediaGroupId}` — userId-scope добавлен |
| 30 | OPEN | `src/handlers/callback.ts` | Legacy `/tmp/ask-user-${requestId}.json` fallback — код присутствует (мёртвая ветка, но не удалена) |
| 31 | CLOSED | `src/handlers/text.ts` | Групповой чат удалён полностью (коммит 4bd1910) |
| 32 | CLOSED | `pollinations_mcp/server.ts:21` | `OUTPUT_DIR = "/tmp/pollinations"` совпадает с `TEMP_PATHS`; `POLLINATIONS_OUTPUT_DIR` env можно переопределить |
| 33 | PARTIAL | `src/session-registry.ts:55-57` | Запись атомарна (`writeFileSync` + `renameSync`), но чтение (строки 47-52) не защищено мьютексом — TOCTOU возможен при высокой конкурентности |
| 34 | OPEN | `send_file_mcp/server.ts` | `Bun.file().size === 0` — false-positive на пустых файлах не исправлен (проверка `fileStat.isFile()` есть, но не `size > 0`) |
| 35 | OPEN | `src/handlers/document.ts` | `python3 -c ${script} ${filePath}` через `Bun.$` — паттерн не изменён |
| 36 | OPEN | `src/handlers/callback.ts` | `requestId` без формат-валидации — не исправлено |
| 37 | OPEN | `src/owner-alerts.ts` | `OWNER_PROBLEM_CHANNEL_ID` без валидации — не исправлено |
| 38 | PARTIAL | `scripts/nginx/sites-available/dash.proboi.site.conf:27,44` | Глобальный `client_max_body_size 50M` остался (строка 27); но location `/api/` имеет `client_max_body_size 1M` (строка 44) — частичный фикс |
| 39 | CLOSED | `scripts/firewall/claude-egress-monitor.service:3-4` | `Requires=claude-firewall.service` и `After=claude-firewall.service` добавлены |

---

## LOW находки (#40–53)

| # | Статус | Файл | Пояснение |
|---|---|---|---|
| 40 | CLOSED | `src/group-filter.ts` | Файл удалён, мёртвый код убран (коммит 4bd1910) |
| 41 | OPEN | `src/handlers/commands.ts` | `/retry` fakeCtx с чужим типом чата — не исправлено |
| 42 | OPEN | `src/handlers/streaming.ts` | `unlinkSync` до доставки файла — логика не изменена |
| 43 | OPEN | `src/handlers/text.ts` | Reply-to контекст до `isAuthorized` — не исправлено |
| 44 | OPEN | `src/security.ts` | Trailing `/` assertion в `TEMP_PATHS` — проверка есть (`throw new Error`), но только runtime |
| 45 | OPEN | `src/memory/graph.ts` | `label_index` без cap — не исправлено |
| 46 | OPEN | `src/session-registry.ts` | `groupSession` singleton — без документации (группы удалены, но singleton сохранён) |
| 47 | CLOSED | `src/engines/deepseek-fast.ts:53,88,105` | `AbortSignal` передаётся в параметр и используется |
| 48 | OPEN | `src/containers/vault-quota.ts` | `\|\| echo "0"` fallback комментарий устарел, но `execFileAsync` корректно обрабатывает ошибки через catch |
| 49 | CLOSED | `scripts/firewall/egress-reset.sh:18,23` | `tc filter del dev "$IFACE" parent 1:` и `tc class del dev "$IFACE" parent 1: classid` — `parent 1:` добавлен |
| 50 | CLOSED | `src/containers/spec.ts` | Комментарий обновлён |
| 51 | CLOSED | `src/templates/user-dashboard.ts` | `renderAdminTable` теперь использует `esc()` для label и model |
| 52 | OPEN | `src/dashboard-server.ts` | `getAllUsersTotals()` не пагинирован — не исправлено |
| 53 | OPEN | `Dockerfile.user` | Multi-stage build не добавлен |

---

## Открытые риски, усиленные открытием 2026-05-14

**Free-tier гости без контейнера (containerEnabled=false) запускают Claude-subprocess на хосте под root.** Это означает:

- **HIGH #3 (parallel_mcp):** sandbox-ограничения — только промпт, не принудительный. Claude может выйти за `allowedPaths` через файловую систему хоста.
- **HIGH #1 (send_file):** `isPathAllowedFor` защищает доставку, но Claude может скопировать `.env` в vault гостя (vault разрешён) перед вызовом `send_file`.
- **HIGH #2 (Composio key):** фикс работает только если `buildGuestBaseEnv` используется. При on-host запуске без контейнера гость видит `/proc/self/environ` хоста — там может быть `TELEGRAM_BOT_TOKEN`, `OPENAI_API_KEY` и т.д. **Именно этот вектор привёл к утечке токена сегодня.**

Эти три находки формально CLOSED, но **эффективно OPEN для free-tier пользователей без контейнера** до тех пор, пока не будет реализован запрет на on-host запуск или принудительный перевод free-tier на контейнер.
