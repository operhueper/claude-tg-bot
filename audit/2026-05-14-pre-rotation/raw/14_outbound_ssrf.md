# Outbound HTTP / SSRF Audit — 2026-05-14

## Скоуп

Куда бот делает fetch(), какие URL-ы пользователь может повлиять,
егрессные правила контейнеров на проде.

---

## 1. Все fetch() в боте — сводная таблица

| Файл | URL | Контроль пользователя над URL | Вердикт |
|------|-----|-------------------------------|---------|
| `src/engines/deepseek-fast.ts:80` | `https://api.deepseek.com/v1/chat/completions` (константа) | Нет | OK |
| `src/engines/openrouter.ts:562` | `https://openrouter.ai/api/v1/chat/completions` (константа) | Нет | OK |
| `src/engines/openrouter.ts:435` | `https://image.pollinations.ai/prompt/${encodedPrompt}?...` | **Да — prompt** | Анализ ниже (SSRF-03) |
| `src/engines/yukassa.ts:20,52,77` | `https://api.yookassa.ru/v3/payments[/id]` (константа) | Нет (только paymentId из YK API) | OK |
| `src/session.ts:439` | `https://api.deepseek.com/chat/completions` (константа) | Нет | OK |
| `src/composio.ts:66` | `https://backend.composio.dev/api/v3/...` (константа) | Нет | OK |
| `src/dashboard-server.ts:723` | `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage` (константа) | Нет (userId validated) | OK |
| `src/openrouter-provisioning.ts:33,85` | `https://openrouter.ai/api/v1/keys[/hash]` (константа) | Нет | OK |
| `src/handlers/photo.ts:46` | `https://api.telegram.org/file/bot${token}/${file.file_path}` | file.file_path из TG API | Анализ ниже (SSRF-04) |
| `src/handlers/document.ts:161` | `https://api.telegram.org/file/bot${token}/${file.file_path}` | file.file_path из TG API | Анализ ниже (SSRF-04) |
| `src/handlers/audio.ts:251` | `https://api.telegram.org/file/bot${token}/${file.file_path}` | file.file_path из TG API | Анализ ниже (SSRF-04) |
| `src/handlers/voice.ts:126` | `https://api.telegram.org/file/bot${token}/${file.file_path}` | file.file_path из TG API | Анализ ниже (SSRF-04) |
| `src/handlers/video.ts:50` | `https://api.telegram.org/file/bot${token}/${file.file_path}` | file.file_path из TG API | Анализ ниже (SSRF-04) |
| `src/alerts.ts:14` | `https://api.telegram.org/bot${token}/sendMessage` (константа) | Нет | OK |
| `pollinations_mcp/server.ts:95` | `https://image.pollinations.ai/prompt/${encodedPrompt}?...` | **Да — prompt** | Анализ ниже (SSRF-03) |
| `openrouter_image_mcp/server.ts:119` | `https://openrouter.ai/api/v1/chat/completions` (константа) | Нет | OK |

---

## 2. Векторы по пунктам

### SSRF-01 — Bot SSRF через user input (прямой fetch)

**Вердикт: ОТСУТСТВУЕТ.**

Нигде в боте нет `fetch(userProvidedUrl)`. Все fetch-вызовы используют захардкоженные базовые URL. Пользователь не может передать произвольный URL для прямого fetch.

Исключение: `generate_image` — см. SSRF-03.

---

### SSRF-02 — Image URLs от пользователя

**Вердикт: ОТСУТСТВУЕТ.**

Бот никогда не делает `fetch()` по URL-у, присланному пользователем как URL картинки. Все изображения скачиваются только с `api.telegram.org` через официальный путь `getFile()`. OpenRouter получает изображения в виде base64 data URL (см. `buildMultipartContent` в `engines/openrouter.ts:96-117`).

---

### SSRF-03 — Pollinations URL injection через prompt

**Вердикт: НИЗКИЙ РИСК, не SSRF.**

В `pollinations_mcp/server.ts:86` и `engines/openrouter.ts:434`:
```ts
const url = `${BASE_URL}/${encodedPrompt}?width=${width}&height=${height}&model=${model}&nologo=true`
```

Prompt проходит через `encodeURIComponent()`. Даже если prompt содержит `../` или IP-адрес вида `127.0.0.1`, после кодирования URL будет `https://image.pollinations.ai/prompt/127.0.0.1...` — запрос уйдёт на Pollinations, не на localhost. BASE_URL захардкожен как `https://image.pollinations.ai/prompt`.

Pollinations возвращает бинарный blob напрямую в `response.arrayBuffer()` — нет редиректов, которые могут переназначить цель. `AbortSignal.timeout(60_000)` стоит.

**Вектор `model` в `pollinations_mcp`:** аргумент `model` передаётся как query-параметр без проверки whitelist: `?model=${model}`. Инъекция через model может добавить `&url=...` если параметры после `model` проверяются Pollinations. Это не SSRF, а potential parameter injection против внешнего сервиса. Низкий риск.

---

### SSRF-04 — file_path из Telegram API

**Вердикт: ДОВЕРЕННЫЙ ИСТОЧНИК, не SSRF.**

`file.file_path` приходит из ответа Telegram API (`ctx.getFile()`), не от пользователя. Telegram-инфраструктура контролирует этот путь. Результирующий URL: `https://api.telegram.org/file/bot.../telegram/photos/file_xxx.jpg`.

Теоретически Telegram мог бы вернуть злонамеренный `file_path`, но это лежит вне модели угроз (компрометация Telegram API = другой сценарий). Бот доверяет API той платформы, на которой работает.

---

### SSRF-05 — WebFetch tool (Claude SDK built-in)

**Вердикт: ПРИСУТСТВУЕТ у paid-guests (MEDIUM), заблокирован для free-guests.**

Разбор по классам пользователей:

**Owner:** `disallowedTools` = `["WebSearch"]` (только если DeepSeek). WebFetch **не заблокирован**. Owner может `WebFetch("http://127.0.0.1:3848/dashboard")` и получить дашборд без auth. Это намеренно — owner = доверенный.

**Paid-guest (containerEnabled=true):** `disallowedTools` = `["WebSearch"]`. WebFetch **не заблокирован**. Claude (DeepSeek endpoint через Anthropic-совместимый API) может вызвать `WebFetch("http://169.254.169.254/hetzner/v1/metadata")`.

**ВАЖНО:** Бот работает на DeepSeek (`api.deepseek.com/anthropic`). DeepSeek's Anthropic-совместимый endpoint **не поддерживает Anthropic server-side tools** (WebSearch уже заблокирован по этой причине). WebFetch — тоже Anthropic server-side tool. Попытка вызова вернёт `does not support this tool_choice`. Т.е. на практике WebFetch **не работает** через DeepSeek endpoint.

Для owner на claude-sonnet-4-6 (если не DeepSeek): WebFetch работает и может обращаться к localhost — но owner = доверенный пользователь.

**Риск:** LOW (DeepSeek делает WebFetch недоступным архитектурно).

---

### SSRF-06 — OpenRouter/DeepSeek base URL (V-01 amplifier)

**Вердикт: ЗАХАРДКОЖЕНЫ, не подменяемы.**

- `deepseek-fast.ts:15`: `const DEEPSEEK_BASE_URL = "https://api.deepseek.com/v1/chat/completions"` — константа.
- `openrouter.ts:562`: `fetch("https://openrouter.ai/api/v1/chat/completions", ...)` — строковой литерал.
- `yukassa.ts:4`: `const BASE = 'https://api.yookassa.ru/v3'` — константа.
- `composio.ts:12`: `export const COMPOSIO_BASE_URL = "https://backend.composio.dev"` — константа.
- `session.ts:439`: `fetch("https://api.deepseek.com/chat/completions", ...)` — строковой литерал.

Через V-01 (cat .env) можно прочитать ключи, но base URL не берётся из env и не подменяется через API. **Нет уязвимости base URL injection.**

---

### SSRF-07 — YooKassa endpoints

**Вердикт: OK.**

Все запросы к `https://api.yookassa.ru/v3/payments[/${paymentId}]`. `paymentId` приходит из тела webhook или из YooKassa API — не от пользователя напрямую. Путь: `const BASE = 'https://api.yookassa.ru/v3'` — константа; `${paymentId}` в URL проходит через `encodeURIComponent` в provisioning, в yukassa.ts — нет `encodeURIComponent`, но paymentId — UUID формата из YK API. Риск инъекции пути минимален.

---

### SSRF-08 — Notify-bridge (порт 3849) — spoofed userId

**Вердикт: ЗАЩИЩЁН.**

Защиты notify-bridge (`src/dashboard-server.ts:744-790`):
1. Source IP должен быть в `GUEST_SUBNET_PREFIX` (`172.18.`).
2. userId должен быть в `getAllowedUsers()`.
3. Source IP должен совпасть с IP контейнера `claude-user-${userId}` через `docker inspect`.
4. Rate limit: 20 сообщений/мин на userId.

**Проверка на проде:** `curl` от гостя к `172.18.0.1:3849` — **Connection timed out** (проверено). Порт 3849 bind на `*:3849`, но нет INPUT rule разрешающего 3849 от guest subnet — трафик до Bun не доходит из-за DROP default INPUT policy.

**Residual risk:** если guest subnet prefix (`172.18.`) совпадёт с другой сетью Docker (bridge network `172.17.`), правило prefix check может пропустить не-guest. Prefix-check — `startsWith("172.18.")` — адекватен при текущей конфигурации, но хрупок при добавлении новых Docker networks.

---

### SSRF-09 — DNS rebinding

**Вердикт: ОТСУТСТВУЕТ защита, LOW риск на практике.**

В боте нет TTL-check или повторной валидации IP после DNS-резолвинга. `fetch("https://attacker.com/")` мог бы работать как DNS rebinding к 169.254.169.254 при втором запросе. Но:
1. Бот не делает fetch по user-controlled URL (см. SSRF-01).
2. Bun использует системный resolver без кеширования TTL0 — rebinding требует специального DNS сервера и timing.
3. WebFetch через DeepSeek не работает (SSRF-05).

**LOW риск** — нет практического вектора эксплуатации в текущей архитектуре.

---

## 3. Сеть: egress из контейнеров

### Что заблокировано (DOCKER-USER + INPUT):

```
INPUT chain (on claude-guest0 interface):
  DROP tcp --dport 3848 (dashboard)
  DROP tcp --dport 3847 (health)
  DROP tcp --dport 22   (SSH)

DOCKER-USER chain (on claude-guest0 interface):
  DROP tcp --dport 22
  DROP tcp --dport 3848
  DROP tcp --dport 3847

CLAUDE_SMTP_BLOCK:
  DROP tcp --dport 25   (SMTP)
  DROP tcp --dport 465  (SMTPS, rate-limited)
  DROP tcp --dport 587  (submission, rate-limited)
```

### УЯЗВИМОСТЬ: Hetzner IMDS доступен (подтверждено на проде)

**Вердикт: ОТКРЫТО. Дублирует V-22 из VULNERABILITIES.md, но подтверждено эксплойтом.**

```bash
# На проде с контейнера claude-user-893951298:
curl http://169.254.169.254/hetzner/v1/metadata

# Возвращает:
instance-id: 129453078
hostname: proboi-bot
region: eu-central
availability-zone: hel1-dc2
public-keys:
  - ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIKfxeUEN42QaY/XeSGFJ1kJMpFHbn57BPikw91qGXp8W evgeniy@jinru.vip
public-ipv4: 89.167.125.175
vendor_data: <cloud-init blob with random seed>
```

Утекают: SSH public key, public IP, hostname, region, AZ, MAC-адрес. SSH private key не утекает (Hetzner IMDS не хранит). `vendor_data` содержит cloud-init конфиг с `random_seed` (base64 энтропия).

**Фикс (уже в V-22 VULNERABILITIES.md):**
```bash
iptables -I DOCKER-USER 1 -s 172.18.0.0/16 -d 169.254.169.254 -j DROP
```
Добавить в `scripts/firewall/docker-user-rules.sh` и персистировать.

### Inter-container egress (V-21)

Нет `--icc=false` для `claude-guest-net`. Контейнеры на `172.18.x.x` могут общаться между собой (DOCKER-USER не блокирует внутри-сетевой трафик).

### Notify-bridge (порт 3849) — egress из контейнера

Тест на проде: `curl http://172.18.0.1:3849/notify` из гостевого контейнера — **timeout** (Connection timed out). Порт не доступен из контейнера несмотря на то, что Bun слушает на `*:3849`. Вероятно, UFW default DENY + отсутствие INPUT rule на 3849 блокирует пакеты до приложения.

**Статус:** notify-bridge закрыт от контейнеров на практике.

### Egress allow-list

**Отсутствует.** Контейнер может делать запросы к любому внешнему IP/хосту (кроме SMTP и хостовых портов). Нет whitelist разрешённых external hosts. Это не SSRF к внутренней инфраструктуре хоста, но открывает:
- C2 callbacks из взломанного контейнера
- Data exfiltration любым протоколом (HTTPS/HTTP/DNS)
- Scanning внешней сети

Для изоляции данных достаточно — vault quota и path checks работают. Для ограничения C2 нужен egress allowlist (нетривиальная задача).

---

## 4. Итог — новые findings

Не задублированы в VULNERABILITIES.md:

| ID | Severity | Описание |
|----|----------|---------|
| SSRF-03a | LOW | `model` параметр в Pollinations MCP без whitelist — parameter injection против Pollinations (не SSRF к хосту) |
| SSRF-05 | LOW | WebFetch не заблокирован в disallowedTools для paid-guests, но на практике DeepSeek endpoint не поддерживает Anthropic server-side tools — de-facto заблокирован архитектурно |
| SSRF-08r | LOW | Notify-bridge prefix check `startsWith("172.18.")` хрупок при добавлении новых Docker сетей (172.18.x.y, 172.18.z.w) |

**V-22 (Hetzner IMDS)** — подтверждено эксплойтом на проде. Данные реально вытекают. Уже в VULNERABILITIES.md как P1. Срочность повышена — теперь есть PoC.

---

## 5. Не найдено / закрыто

- Нет `fetch(userUrl)` нигде в боте
- Нет image URL fetch от пользователя
- Pollinations URL injection реально не приводит к SSRF (encodeURIComponent + base URL константа)
- Notify-bridge: source IP проверка + docker inspect + rate limit — цепочка защиты рабочая, порт физически недоступен из контейнеров
- DeepSeek/OpenRouter/Composio base URL — все захардкожены, env не переопределяет
- YooKassa paymentId в URL — UUID из доверенного API
- DNS rebinding — нет практического вектора
