# 16. Frontend JS — Mini App Dashboard

Дата: 2026-05-14  
Файлы: `src/templates/user-dashboard.ts`, `src/templates/landing.ts`, `src/dashboard-server.ts`

---

## Методология

Полный read-only анализ клиентского JavaScript и server-side HTML-рендеринга. Искали: `innerHTML`, `outerHTML`, `document.write`, `eval`, `Function(`, `setTimeout("`, DOM-источники (`location.*`, `document.referrer`), хранилища, внешние скрипты без SRI, заголовки безопасности.

---

## F-01 — innerHTML с неэкранированными числовыми полями (INFO/LOW)

**Файл:** `src/templates/user-dashboard.ts`, строки 622–735 (`renderMe`, `renderHost`)

**Что:** `resEl.innerHTML` и `el.innerHTML` строятся конкатенацией чисел вроде `ramPct`, `cpuPct`, `diskMb`, `ramUsedGb`, `ramTotalGb`, `host.cpu.cores`, `agg.containers.running`, `agg.containers.total` без вызова `esc()`. Числа берутся из JSON-ответа `/api/me` и `/api/admin/all`.

**Риск:** Эти поля приходят с сервера через `docker stats` / `os.cpus()` / арифметику — типизированы как `number`. Прямого способа подложить строку с `<script>` нет. Однако если когда-либо поле окажется `string` (например смена типа в API), XSS откроется без изменения клиентского кода. Поле `host.cpu.cores` конкретно берётся из `cpus().length` (Node) — всегда integer, но архитектурно это "доверие типу без санитизации на клиенте".

**Фикс:** оборачивать все числа в `Number(x).toFixed(0)` или `Math.round()` + `parseInt` прежде чем вставлять в innerHTML, либо переключиться на `textContent`+DOM-операции для этих блоков.

---

## F-02 — `btnPublic.href = u.publicUrl` без валидации схемы (LOW)

**Файл:** `src/templates/user-dashboard.ts`, строка 660

```js
if (u.publicUrl) {
  btnPublic.href = u.publicUrl;
}
```

**Что:** `publicUrl` берётся из JSON ответа `/api/me`. На сервере оно конструируется как `` `https://proboi.site/u/${userId}/` `` (строка 323 `dashboard-server.ts`), где `userId` — integer из валидированного `initData`. Прямого вектора нет при текущей архитектуре.

**Риск:** Если когда-нибудь `publicUrl` будет отдаваться из `users.json` или другого источника, управляемого пользователем, любое значение вида `javascript:alert(1)` исполнится при клике. Нет проверки схемы перед присваиванием в `href`.

**Фикс:** `if (u.publicUrl && u.publicUrl.startsWith('https://')) btnPublic.href = u.publicUrl;`

---

## F-03 — Отсутствует SRI на `telegram-web-app.js` (MEDIUM)

**Файл:** `src/templates/user-dashboard.ts`, строка 15

```html
<script src="https://telegram.org/js/telegram-web-app.js"></script>
```

**Что:** внешний скрипт Telegram загружается без `integrity=` атрибута. Если CDN telegram.org скомпрометирован или MITM на стороне пользователя (прокси, кафе-WiFi) — вредоносный JS выполнится в контексте Mini App с полным доступом к `window.Telegram.WebApp.initData`.

**Уточнение:** Telegram Mini App специфика — `integrity` возможен, но Telegram сам предписывает этот URL и не публикует хеши. SRI в данном случае не практичен без pin'а от Telegram. Это **архитектурная невозможность** а не баг кода, но стоит зафиксировать.

**Риск:** зависит от угрозной модели. Для Mini App это стандартная ситуация — LOW практически, но MEDIUM теоретически.

---

## F-04 — Нет CSP на `/dashboard` (HIGH)

**Файл:** `src/dashboard-server.ts`, функция `htmlResponse()` (строки 213–218)

```ts
function htmlResponse(html: string, status = 200): Response {
  return new Response(html, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
```

**Что:** все HTML-ответы (включая `/dashboard`) отдаются без `Content-Security-Policy` заголовка. Нет ни `default-src`, ни `script-src`, ни `object-src 'none'`.

**Риск:** если где-либо возникнет XSS (например F-01 + будущее изменение типов), CSP был бы последним рубежом. Без него — XSS немедленно даёт полный контроль над Mini App, включая `initData`. Также это требование Telegram Mini App best practices.

**Фикс (минимальный):**
```
Content-Security-Policy: default-src 'self'; script-src 'self' 'nonce-<random>' https://telegram.org; object-src 'none'; base-uri 'none'
```
Для inline-скриптов в dashboard (весь JS inline) нужен nonce или `unsafe-inline` (компромисс).

---

## F-05 — Нет X-Content-Type-Options и X-Frame-Options (LOW)

**Файл:** `src/dashboard-server.ts`, все ответы через `htmlResponse()` / `jsonOk()` / `jsonErr()`

**Что:** не выставляются заголовки:
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY` (или `SAMEORIGIN`)
- `Referrer-Policy: strict-origin-when-cross-origin`

**Риск:**
- Без `nosniff`: браузер может MIME-sniff текстовый файл как исполняемый скрипт в некоторых old-IE сценариях.
- Без `X-Frame-Options`: страница может быть встроена в iframe злоумышленником для clickjacking (хотя Telegram Mini App сам ставит iframe). Актуально для `/subscribe` и `/` (landing).
- Примечание: VULNERABILITIES.md уже содержит похожее в части CORS (V-04 упомянуто), но X-Frame отдельно не зафиксировано.

**Фикс:** добавить в `htmlResponse()` и `jsonErr()`.

---

## F-06 — CSRF на `/api/me`, `/api/admin/all` — теоретически есть, практически закрыт особенностью CORS (INFO)

**Файл:** `src/dashboard-server.ts`, строки 190–195

```ts
const JSON_HEADERS_BASE = {
  "Access-Control-Allow-Origin": "https://web.telegram.org",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};
```

**Что:** `/api/me` принимает `POST` с `Content-Type: application/json`. Это не "simple request" — браузер должен сначала сделать OPTIONS preflight. CORS разрешает только `https://web.telegram.org`. Таким образом, кросс-сайтовый запрос с произвольного origin будет заблокирован браузером: preflight вернёт 204 без `Access-Control-Allow-Origin: <evil-origin>`, и браузер не отправит основной запрос.

**Но:** это работает только если у атакующего нет XSS на `web.telegram.org`. Если Telegram Web сам скомпрометирован — CORS не поможет.

**Вывод:** CSRF практически закрыт CORS. Классический anti-CSRF токен был бы избыточен для Mini App, которая сама передаёт `initData` в body (это функциональный аналог).

**Риск:** NONE при текущей архитектуре. Зафиксировано для полноты.

---

## F-07 — `location.search.includes('mock=1')` — не источник XSS (INFO)

**Файл:** `src/templates/user-dashboard.ts`, строка 471

```js
const MOCK = ALLOW_MOCK && location.search.includes('mock=1');
```

**Что:** `location.search` читается только для булева флага, результат не вставляется в DOM. `ALLOW_MOCK` контролируется server-side: `renderDashboard({ allowMock: process.env.DASHBOARD_ALLOW_MOCK === "1" })`. По умолчанию `false` на проде. Мок-данные — хардкод в скрипте, не берутся из URL.

**Риск:** NONE. DOM-based XSS через `location.search` отсутствует.

---

## F-08 — Нет localStorage/sessionStorage (INFO)

`initData` нигде не пишется в `localStorage` или `sessionStorage` — только в переменную `_initData` в памяти страницы. При закрытии вкладки токен теряется. Это правильно.

---

## F-09 — Google Fonts CDN без SRI (INFO/LOW)

**Файл:** `src/templates/landing.ts`, строка 49

```html
<link href="https://fonts.googleapis.com/css2?family=..." rel="stylesheet" />
```

SRI для CSS-stylesheet с Google Fonts технически возможен но непрактичен (динамический URL). Применимо только к landing (не к Mini App с чувствительными данными).

**Риск:** LOW для landing, NONE для dashboard (Google Fonts там не подключены).

---

## F-10 — `handleSubscribePage`: `status` параметр не рефлектируется в HTML (INFO)

**Файл:** `src/dashboard-server.ts`, строки 485–521

`url.searchParams.get("status")` используется только для булева `isSuccess = status === "success"`. В HTML попадает только захардкоженный текст. `botUsername` берётся из `process.env.BOT_USERNAME`, а не из request. Рефлексивный XSS через query string отсутствует.

**Риск:** NONE.

---

## Итог по векторам

| # | Вектор | Статус | Приоритет |
|---|--------|--------|-----------|
| F-01 | innerHTML с числами без esc | Архитектурный риск (не актуальный) | INFO |
| F-02 | `href = u.publicUrl` без валидации схемы | Потенциальный JS-URL | LOW |
| F-03 | SRI на telegram-web-app.js | Теоретически, неустранимо | MEDIUM |
| F-04 | Нет CSP на /dashboard | Отсутствует последний рубеж | HIGH |
| F-05 | Нет X-Content-Type-Options / X-Frame-Options | Базовые заголовки | LOW |
| F-06 | CSRF | Закрыт CORS + initData | NONE |
| F-07 | DOM XSS через location.search | Нет | NONE |
| F-08 | Storage leak | Нет | NONE |
| F-09 | Google Fonts CDN без SRI | LOW (landing only) | INFO |
| F-10 | XSS через status param | Нет | NONE |

**Новые находки, не дублирующие VULNERABILITIES.md:** F-01, F-02, F-03, F-04, F-05.  
**Критически новое:** F-04 (отсутствие CSP на `/dashboard`) — не зафиксировано в существующем audit.

---

## Рекомендации (по убыванию приоритета)

1. **F-04 (HIGH)**: добавить CSP хотя бы в `htmlResponse()`. Для dashboard с inline JS: `script-src 'unsafe-inline' https://telegram.org; object-src 'none'; base-uri 'none'` — не идеально, но блокирует инъекции через `<script src=...>` и data-URI.

2. **F-02 (LOW)**: добавить проверку схемы перед `btnPublic.href = url`.

3. **F-05 (LOW)**: добавить `X-Content-Type-Options: nosniff` и `X-Frame-Options: SAMEORIGIN` в `htmlResponse()`.

4. **F-01 (INFO)**: рефакторинг `renderHost` + `renderMe` с использованием `textContent` вместо `innerHTML` для числовых блоков (долгосрочно).
