# Аудит внутреннего API (порты 3847, 3848, 3849)

Дата: 2026-05-14  
Файлы: `src/index.ts`, `src/dashboard-server.ts`, `src/composio.ts`, `src/templates/user-dashboard.ts`

---

## Топология

| Порт | Сервер | Bind | Запускает |
|------|--------|------|-----------|
| 3847 | Health webhook (Apple Watch → бот) | `0.0.0.0` | `src/index.ts:443` |
| 3848 | Dashboard + API + YuKassa webhook | `0.0.0.0` | `src/dashboard-server.ts:604` |
| 3849 | Notify-bridge (контейнер → Telegram) | `0.0.0.0` | `src/dashboard-server.ts:734` |

Все три Bun.serve-вызова **не передают `hostname`** → биндятся на `0.0.0.0`. На проде UFW открывает только 22/80/443, остальное дропает. Но это единственная защита на сетевом уровне — если UFW правило слетит или появится новый интерфейс, порты станут внешне доступны. Это уже зафиксировано как V-1D.

---

## Порт 3847 — Health webhook

### Что принимает

Только `POST /`. Любой другой метод — 405. Эндпоинт поднимается **только** если в env заданы `HEALTH_WEBHOOK_SECRET` и обнаружен `HEALTH_OWNER_ID`.

### Аутентификация

Заголовок `x-secret` сравнивается с `HEALTH_WEBHOOK_SECRET` через простой `===`. Нет `timingSafeEqual` — уязвимо к timing-атаке.

**Риск:** при утечке secret (через V-01 / cat .env) или угадывании (если слабый secret) злоумышленник может слать владельцу поддельные health-данные через Telegram. Атака социальная: «пульс 190, давление критическое». Прямой угрозы безопасности системы нет, но timing-oracle на коротких секретах — известный вектор.

**Что отвечает `/healthz`:** эндпоинт `GET /healthz` существует ТОЛЬКО на 3848 (dashboard). На 3847 нет GET-роута, любой GET получает 405. Нет утечки данных через `/healthz`.

### Инъекция через payload

Тело парсится как JSON. Все поля (`steps`, `heart_rate`, `active_calories`, `sleep`, `weight`, `period`) подставляются в строку через template literal:
```ts
lines.push(`👟 Шаги: ${body.steps}`);
```
Сообщение отправляется через `bot.api.sendMessage(HEALTH_OWNER_ID, message)` — **plain text**, не HTML parse mode. Telegram игнорирует разметку в plain text. Инъекция в HTML/Markdown невозможна. Но нет ограничения длины полей — злоумышленник отправит `steps: "A".repeat(1_000_000)` → Telegram отклонит (лимит 4096 символов), но до этого память выделится.

**Вывод:** не критично, рекомендуется `timingSafeEqual` для сравнения секрета + truncate полей до 100 символов.

---

## Порт 3848 — Dashboard

### GET /healthz

Возвращает `"OK"` (200), никаких данных. Нет инфо об окружении, версиях, userId. Безопасен.

### GET / (landing), GET /dashboard

Server-side render из `src/templates/landing.ts` и `src/templates/user-dashboard.ts`. HTML статичный, не содержит пользовательских данных — никакой серверной интерполяции кроме флага `ALLOW_MOCK` (bool). HTML-инъекция через сервер невозможна.

**Все поля в dashboard экранируются через `esc()`** (строка 522-527 user-dashboard.ts):
```js
function esc(s) {
  return String(s).replace(/[<>&"']/g, function(c) {
    return ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' })[c];
  });
}
```
`esc()` применяется к `item.label` и `item.model` в admin-таблице. `userId` выводится через `fmt(n)` (числовой форматер, не строка). **XSS в admin-таблице закрыт.**

**Одно исключение:** `btnPublic.href = u.publicUrl` — без проверки схемы. Если сервер вернёт `publicUrl: "javascript:..."`, клик пользователя выполнит JS. Зафиксировано как V-30J в VULNERABILITIES.md, не дублируем.

### GET /subscribe?status=...

`status` читается как `url.searchParams.get("status")` и сравнивается с `=== "success"`. Значение `status` **не интерполируется в HTML** — используется только для ветвления. `heading` и `body` — хардкоженные строки. `botUsername` берётся из `process.env.BOT_USERNAME` и вставляется в `tgDeep` / `TG_URL` без экранирования. Если `BOT_USERNAME` содержит `"` или `</script>`, возможен XSS в теге `<script>`. На практике значение задаётся в `.env` вручную — LOW риск, но antipattern.

### POST /api/me

**Аутентификация:** Telegram initData HMAC-SHA256 + `auth_date` не старше 24 ч + `timingSafeEqual`. Корректно.

**Авторизация:** проверяет `ALLOWED_USERS.includes(userId)`. Если нет — 403.

**Rate-limit:** **ОТСУТСТВУЕТ**. Любой с валидным initData (живым 24 часа) может слать POST сколько угодно. Каждый запрос выполняет:
- `getUserTotals()` — SQLite запрос
- `getContainerMetrics()` — `docker stats` (subprocess)
- `getTodayCount()`, `resetIfNewDay()` — файловые операции
- `getUserSubscriptionExpiry()` — SQLite

Атака: злоумышленник с токенами жертвы (или с валидным своим initData) долбит `/api/me` в 1000 rps → `docker stats` форкает дочерние процессы → subprocess exhaustion → DoS бота.

**Что отдаёт payload:**
```json
{
  "ok": true,
  "user": {
    "id": <userId>,
    "label": <display name>,
    "role": "owner" | "guest",
    "model": <model name>,
    "publicUrl": "https://proboi.site/u/<userId>/"
  },
  "today": { inputTokens, outputTokens, cacheReadTokens, cacheCreationTokens },
  "container": { exists, running, ram, cpu, disk },
  "isAdmin": <bool>,
  "tier": "free" | "paid",
  "dailyUsed": <int>,
  "dailyLimit": <int>,
  "dailyResetAt": <ISO>,
  "subscriptionExpires": <ISO | null>
}
```

Утечки: `userId` числовой (Telegram ID — полупубличный), `label` (имя), `model` (model string). Vault path **не раскрывается**. API-ключи, env, пути — не раскрываются. Информация умеренная, за HMAC-барьером.

**CORS:** `Access-Control-Allow-Origin: https://web.telegram.org` — жёстко ограничен. Браузер с evil.com не получит ответ (CORS preflighted). DNS rebinding сюда не применим — браузер получит 200, но Origin будет `http://evil.com` → CORS отклонит. **DNS rebinding закрыт корректным CORS.**

**Host header injection:** Bun.serve не проверяет Host заголовок. Запрос с `Host: evil.com` обрабатывается нормально. Нет server-side редиректов по Host, нет построения URL из Host. Риск ограничен — нет механизма, где Host влиял бы на результат. MEDIUM риск в теории (open redirect), на практике не эксплуатируется.

### POST /api/admin/all

**Аутентификация:** та же схема initData + timingSafeEqual.

**Авторизация:** `validated.user.id !== OWNER_ID` → 403. Жёсткая проверка на числовое равенство с константой OWNER_ID.

**Rate-limit:** **ОТСУТСТВУЕТ** (как и у /api/me). Дополнительно вызывает `getAllContainerMetrics()` → `docker stats` для ВСЕХ контейнеров + `getHostMetrics()` → `free -m`, `nproc`, `uptime`. Потенциально тяжелее /api/me.

**Инъекция в payload:** ответ содержит `label` из `getUserProfile()` и `model` из profile — оба берутся из `users.json` + `config.ts`. Если гость через V-01 изменил `users.json`, его label уйдёт в JSON ответа. JSON — не HTML, injection в DOM невозможна без рендера. `esc()` применяется на клиенте. **SQL-инъекция:** нет SQL в этом эндпоинте, только SQLite read-API. **Injection нет.**

**Курсор пагинации:** `cursor` — строка userId, используется в `findIndex`. Нет SQL, нет файловых операций. Безопасен.

---

## Порт 3849 — Notify-bridge

### Многоуровневая защита (существующая)

1. **Source IP в guest subnet:** `sourceIp.startsWith(GUEST_SUBNET_PREFIX)` (default `"172.18."`). Принимает `req.remoteAddress` как приоритет над spoofable `x-forwarded-for`. Bun не гарантирует `remoteAddress` — если свойство undefined, fallback на `x-forwarded-for`. Если Bun не экспонирует `remoteAddress` для данного запроса → падает на `x-forwarded-for` → **спуфируемо** (гость добавляет `X-Forwarded-For: 172.18.0.99`).
2. **userId в ALLOWED_USERS:** есть.
3. **IP контейнера matches userId:** `docker inspect` + сравнение. Есть.
4. **Rate-limit:** 20 req/min per userId. Есть.

### Найденные дыры

#### INT-01. `remoteAddress` недоступен в Bun.serve — fallback на spoofable header

**Код** (строки 746-749):
```ts
const sourceIp =
  (req as any).remoteAddress ||
  req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
  "";
```

В Bun HTTP сервере `req` является объектом `Request` (Web API), у которого нет `remoteAddress`. Это свойство существует в Node.js `http.IncomingMessage`, но не в Web `Request`. Типизация использует `(req as any)` — явный признак, что разработчик не уверен в доступности.

**Тест:** надо проверить на продовой версии Bun. Если `req.remoteAddress === undefined`, то `undefined ||` → переход к `x-forwarded-for`. Любой хост в интернете, получивший доступ к 3849 (например, при сбое UFW), может отправить `X-Forwarded-For: 172.18.0.1` и пройти первый guard.

**Статус Bun:** в Bun 1.x `Request` не имеет `remoteAddress`. Свойство добавлено в `Server.fetch(req, server)` через второй аргумент `server.requestIP(req)` — не через `req` напрямую.

**Риск:** если Bun не передаёт `remoteAddress` на `req` — первый check провалится к x-forwarded-for. Атака требует: (а) обойти UFW (низкий риск при правильном UFW) ИЛИ (б) быть контейнером с IP из 172.18.0.0/16 но НЕ принадлежать этому userId. Тогда check 3 (docker inspect) поймает. Итого: check-1 может быть нерабочим, но check-3 (docker inspect) компенсирует. Без обоих — только userId-check остаётся.

**Рекомендация:** использовать `server.requestIP(req)` в Bun — второй аргумент `fetch(req, server)`. Передать `server` через closure.

#### INT-02. `_allowedUsers` Set строится один раз — новые пользователи не подхватываются

Уже зафиксировано как V-35, не дублируем.

#### INT-03. ARP spoofing в docker-bridge сети

**Вопрос:** может ли гость A получить IP контейнера B через ARP spoofing и пройти check-3?

Docker bridge сети используют Linux bridge (`docker0` / `claude-guest0`). ARP spoofing внутри bridge технически возможен — гость A отправляет gratuitous ARP с IP гостя B, ядро обновляет ARP-кеш на bridge. После этого пакеты, адресованные B, уходят к A.

**Реальность:** в стандартном Docker bridge нет защиты от ARP spoofing (`ebtables` с `--arp-protect` не включены по умолчанию). Если гость A имеет raw socket capability (CAP_NET_RAW), он может отравить ARP-кеш.

**Caps в Dockerfile.user:** `--cap-drop=ALL --cap-add=NET_BIND_SERVICE` — CAP_NET_RAW дропнут. Без NET_RAW гость не может слать raw packets → ARP spoofing невозможен стандартными инструментами (`arping`, `arpspoof` требуют raw socket).

**Вывод:** ARP spoofing защищён через cap-drop=ALL. Если в будущем добавят NET_RAW для какой-то фичи — check-3 станет уязвимым.

#### INT-04. CSRF на notify-bridge

Notify-bridge принимает POST без CSRF-токена. **Применимость CSRF:** классический CSRF возможен только из браузера — браузер автоматически шлёт cookies/credentials. Notify-bridge не использует cookie-based auth, вместо это source IP. Браузер из evil.com может сделать cross-origin POST на `http://172.18.0.1:3849/notify` — но это возможно только из контейнера, не из публичного интернета. CORS не защищает (simple request без preflight для `text/plain`, но JSON с Content-Type=application/json требует preflight → CORS отклонит для браузера). **CSRF не применим для этого эндпоинта.**

---

## Mutual auth между сервисами

**Нет.** Ни один из трёх серверов не аутентифицирует запросы к другим внутренним компонентам через shared secret. Коммуникации:
- Dashboard (3848) → Telegram: через bot token (внешний API).
- Notify-bridge (3849) → Telegram: через прямой fetch к `api.telegram.org` с BOT_TOKEN.
- Health (3847) → Telegram: через grammy bot instance.
- Между 3847, 3848, 3849: нет прямых HTTP-запросов друг к другу.

Нет межсервисного аутентифицированного канала. Это **не проблема** — все три сервера в одном процессе, разделяют модули через JS imports. HTTP между ними не нужен.

---

## Итоговая таблица находок

| ID | Порт | Вектор | Риск | Статус |
|----|------|--------|------|--------|
| INT-01 | 3849 | `remoteAddress` undefined → fallback x-forwarded-for → IP spoof | MEDIUM | Новый |
| INT-02 | 3849 | `_allowedUsers` stale при новых approve | LOW | V-35 (дубль) |
| INT-03 | 3849 | ARP spoof теоретически возможен; закрыт cap-drop | LOW/теория | Закрыто |
| INT-04 | 3849 | CSRF — неприменим | N/A | Закрыто |
| INT-05 | 3847 | `===` вместо timingSafeEqual для secret | LOW | Новый |
| INT-06 | 3847 | Нет truncate на health payload полях | LOW | Новый |
| INT-07 | 3848 | Нет rate-limit на /api/me и /api/admin/all → docker stats DoS | MEDIUM | Новый |
| INT-08 | 3848 | BOT_USERNAME в .env интерполируется в HTML без экранирования | LOW | Новый |
| INT-09 | 3848 | Host header не проверяется (нет open redirect vector) | INFO | Не опасно |
| INT-10 | 3848 | DNS rebinding закрыт CORS `Access-Control-Allow-Origin: https://web.telegram.org` | N/A | Закрыто |
| V-1D | все | bind на 0.0.0.0 вместо 127.0.0.1 | MEDIUM | VULNERABILITIES.md |
| V-30J | 3848 | `btnPublic.href = u.publicUrl` без схема-проверки | MEDIUM | VULNERABILITIES.md |
| V-30I | 3848 | Нет CSP на /dashboard | MEDIUM | VULNERABILITIES.md |

---

## Рекомендации (новые, не в VULNERABILITIES.md)

### INT-01 fix — реальный remoteAddress в Bun

```ts
// В startNotifyBridge():
Bun.serve({
  port: NOTIFY_BRIDGE_PORT,
  async fetch(req, server) {  // <-- добавить server
    const socketAddr = server.requestIP(req);
    const sourceIp = socketAddr?.address ||
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "";
    // ...
  }
});
```

### INT-05 fix — timingSafeEqual для health secret

```ts
const authBuf = Buffer.from(auth || "");
const secretBuf = Buffer.from(HEALTH_SECRET);
const ok = authBuf.length === secretBuf.length &&
  timingSafeEqual(authBuf, secretBuf);
```

### INT-07 fix — rate-limit на /api/me и /api/admin/all

Добавить простой в-памяти лимит per-userId: 10 req/30s для /api/me, 5 req/60s для /api/admin/all.

### INT-06 fix — truncate health payload

```ts
const safeStr = (v: unknown) => String(v).slice(0, 100);
if (body.steps !== undefined) lines.push(`👟 Шаги: ${safeStr(body.steps)}`);
```

### INT-08 fix — экранировать BOT_USERNAME

```ts
const botUsername = (process.env.BOT_USERNAME || "proboiAI_bot")
  .replace(/[^a-zA-Z0-9_]/g, "");
```
