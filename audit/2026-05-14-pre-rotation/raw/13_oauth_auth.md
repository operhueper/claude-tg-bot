# Аудит OAuth/Auth flows — 2026-05-14

Скоуп: Telegram initData, Composio OAuth, YooKassa, subscription/consent middleware, редиректы.

---

## 1. Telegram initData replay (вектор: replay в 24-часовом окне)

**Файл:** `src/dashboard-server.ts:163-169`

**Код:**
```ts
if (nowSeconds - authDate > 86400) return null;
```

**Статус: ИНФОРМАЦИОННЫЙ (не дыра, но осознанный компромисс)**

`auth_date` проверяется. Replay в рамках 24 часов — **принимается как допустимый риск**: это стандартное поведение для Telegram Mini App (Telegram сам не предоставляет one-time nonce). initData, перехваченный в окне 24ч, даёт доступ к API `/api/me` (токены, тир) — никаких мутирующих действий этот endpoint не совершает. Атака требует MITM на HTTPS-соединение к Telegram или компрометацию клиента. Оценка: ACCEPTABLE.

---

## 2. initData forge через утечку BOT_TOKEN (вектор: V-01 → forge initData)

**Файл:** `src/dashboard-server.ts:147-154`

**Код:**
```ts
const secretKey = createHmac("sha256", "WebAppData").update(BOT_TOKEN).digest();
const expectedHash = createHmac("sha256", secretKey).update(dataCheckString).digest("hex");
```

**Статус: HIGH — цепочка через V-01**

Если атакующий через V-01 (Bash на хосте) прочитал `.env` и получил `TELEGRAM_BOT_TOKEN`, он может сгенерировать валидный initData для **любого** `user.id` (включая `292228713` — владельца) и вызвать `POST /api/admin/all`, получив PII всех пользователей + финансовые данные.

HMAC реализован корректно, `timingSafeEqual` применяется (строка 157). Уязвимость — только в качестве второго звена атаки после V-01.

**Самостоятельная дыра отсутствует**. Закрывается автоматически фиксом V-01. После ротации токена (цель этого пакета) окно закроется.

---

## 3. OAuth state parameter — Composio (вектор: CSRF на OAuth callback)

**Файл:** `src/composio.ts:62-104`, `connect_google_mcp/server.ts:80-92`

**Статус: ДЫРА — LOW/MEDIUM**

Наш код вызывает `POST /api/v3/connected_accounts` на Composio API → получает `redirect_url`. Пользователь переходит по ней в Composio. После авторизации Composio делает **свой** OAuth callback обратно к своим серверам (не к нашему боту). Мы не получаем callback и не проверяем state — это **намеренно**, т.к. используется managed OAuth (Composio хранит токены сам).

Однако наш запрос не включает `state` параметр и не проверяет, что авторизовался именно тот пользователь, которому выдали ссылку. Если атакующий получил OAuth-ссылку другого пользователя (например через MITM или через V-01 → чтение `/tmp/connect-google-*.json`) и авторизовал свой Google-аккаунт под чужим `user_id`, то Composio свяжет **чужой Google** с `tg_<victimUserId>`. Следующий запрос жертвы через `google-workspace` MCP будет исполнен от аккаунта атакующего.

**Вектор:** злоумышленник → читает `/tmp/connect-google-<victim>-*.json` → берёт `redirect_url` (из Composio ответа — но он в бот-callback, не в файле). Практически: атакующий должен перехватить URL кнопки, которую бот показывает жертве. При текущей архитектуре — сложно без V-01.

**Реальный риск:** если жертва сама отправила ссылку атакующему или атакующий имеет доступ к её устройству. Composio не отображает в UI кому принадлежит `user_id` перед согласием.

**Итог:** дыра существует, эксплуатация нетривиальна. Пометить как LOW.

---

## 4. OAuth redirect_uri — открытый параметр

**Файл:** `src/composio.ts:66-78`

**Статус: НЕ ПРИМЕНИМО**

`redirect_uri` в нашем потоке не передаётся вообще — используется Composio managed OAuth. Composio сам управляет redirect_uri (к своим серверам). Мы не получаем code/token. Вектор закрыт по архитектуре.

---

## 5. Subscription check race — cache poisoning при быстрой отписке/подписке

**Файл:** `src/subscription.ts:20-21, 46-72`

**Код:**
```ts
const CACHE_TTL_POSITIVE_MS = 5 * 60 * 1000;  // 5 минут
const CACHE_TTL_NEGATIVE_MS = 60 * 1000;       // 1 минута
```

**Статус: НИЗКИЙ РИСК (поведение соответствует документации)**

Сценарий «отписался → подписался обратно за 30с»: пользователь попадёт в негативный кеш (1 минута). Это **ожидаемое поведение** — пользователь нажимает кнопку «Я подписался», которая вызывает `invalidateSubscription(userId)` → кеш сбрасывается немедленно → следующий `getChatMember` возвращает актуальный статус.

`invalidateSubscription` вызывается в `handleSubscriptionCheckCallback` в `src/handlers/callback.ts` (см. строку импорта `invalidateSubscription`). Ложного блокирования нет.

Потенциальная проблема: `isSubscribed` в `dashboard-server.ts:294-298` **не инвалидирует кеш**, он только читает его. Пользователь может быть заблокирован в API дашборда на 1 минуту после отписки. Это не security-проблема, а UX-нюанс.

---

## 6. Consent gate bypass

**Файл:** `src/index.ts:197-227`, `src/handlers/callback.ts:38-52`

**Статус: ЗАКРЫТО (одна архитектурная оговорка)**

Consent gate корректен. Пропускает:
1. `consent_accept` callback — сам записывает согласие через `recordConsent()`
2. `/start` — чтобы онбординг работал (там свой вызов `sendConsentGate`)

`recordConsent` пишет в SQLite с `user_id`, `doc_version`, `accepted_at`, `source`. Записать согласие за другого пользователя нельзя — функция берёт `userId` из `ctx.from.id` (Telegram-валидированный).

Однако: **нет дедупликации callback_id на уровне Telegram**. Telegram гарантирует доставку callback_query, но кнопка `consent_accept` может быть нажата несколько раз (пользователь возвращается к старому сообщению). `recordConsent` делает `INSERT OR REPLACE` — идемпотентно. Без проблем.

**Единственная оговорка:** если `db = null` (SQLite недоступен), `hasConsented()` возвращает `false` → пользователь блокируется навсегда. `recordConsent` не кидает исключение, просто делает warn. Пользователь попадёт в петлю: тапает кнопку → согласие не записывается → снова показывается gate. Это availability-проблема, не security.

---

## 7. /start с deep-link payload

**Файл:** `src/handlers/commands.ts:58-144`

**Статус: НЕ ПРИМЕНИМО — payload не используется**

```ts
export async function handleStart(ctx: Context): Promise<void> {
  const userId = ctx.from?.id;
  // ...
  // нет ctx.match, нет startPayload обработки
```

`/start` handler не читает payload (`ctx.match` / `ctx.startParam` не вызываются). Telegram позволяет передавать `?start=payload` в deep-link, но здесь он полностью игнорируется. Вектор атаки через payload отсутствует.

---

## 8. Owner OAuth в Composio

**Файл:** `src/mcp-filter.ts:24-33`

**Статус: ИНФОРМАЦИОННЫЙ**

Owner получает `google-workspace` MCP через `buildGoogleMcpUrl(profile.userId)` — то есть его аккаунт Composio имеет `user_id = tg_292228713`. Composio-токены владельца хранятся на стороне Composio (не у нас). При компрометации `COMPOSIO_API_KEY` атакующий может:
- Выдать новый OAuth URL для `tg_292228713` → перелинковать аккаунт владельца на свой Google
- Обратиться к `COMPOSIO_BASE_URL/v3/mcp/<MCP_ID>?user_id=tg_292228713` напрямую с `x-api-key` и выполнить любые Google-операции от имени владельца

Это — стандартный риск managed-OAuth провайдера. После ротации `COMPOSIO_API_KEY` риск снимается.

---

## 9. YooKassa return URL — userid в query param

**Файл:** `src/payments.ts:83`

**Код:**
```ts
const returnUrl = `${RETURN_BASE_URL}/subscribe?status=success&userId=${userId}`;
```

**Статус: ИНФОРМАЦИОННЫЙ (не security-дыра)**

`returnUrl` — это только страница подтверждения (`/subscribe`), которая **не выполняет никаких действий** (`handleSubscribePage` в `dashboard-server.ts:485-597`). Она только показывает HTML с обратным редиректом в Telegram. `userId` в URL никуда не записывается и не обрабатывается.

Атакующий не может подменить callback URL — он жёстко захардкожен в `RETURN_BASE_URL` (env), не принимается от клиента. YooKassa использует `return_url` только для браузерного редиректа пользователя, не для серверного callback.

---

## 10. YooKassa webhook signature

**Файл:** `src/dashboard-server.ts:451-479`

**Статус: ЧАСТИЧНО ЗАКРЫТО (V-00 в VULNERABILITIES.md — не дублирую)**

Webhook не проверяет `Notification-Secret` / HMAC signature — YooKassa предоставляет этот механизм опционально через `HTTP Basic Auth` на callback endpoint (не подпись тела). IP-фильтрация есть, но V-00 уже задокументирован (пустая строка → bypass).

Дополнительная находка: YooKassa cross-verify через `getPayment(payment.id)` в `src/payments.ts:112-128` **эффективно заменяет проверку подписи** — даже фейковый webhook с реальным `payment.id` (который атакующий мог узнать из другого канала) пройдёт верификацию. Однако это работает только если `payment.id` существует в YooKassa системе И имеет статус `succeeded/waiting_for_capture`. Создать платёж на чужой аккаунт для атакующего без доступа к YooKassa магазину невозможно.

**Вывод:** cross-verify с YooKassa API — сильная защита. Единственная оставшаяся дыра — это V-00 (IP bypass при пустом clientIp).

---

## 11. Channel subscription check — cache poisoning

**Файл:** `src/subscription.ts:46-72`

**Статус: НЕ ПРИМЕНИМО**

`getChatMember` — API Telegram, возвращает актуальный статус в реальном времени. Кеш (1-5 мин) снижает нагрузку на Telegram API. «Отравить» кеш через что-либо кроме как через `cache.set()` нельзя — Map в памяти процесса, нет внешнего хранилища.

Единственный способ «отравить» — это race: если атакующий успевает отправить сообщение **до** того, как негативный TTL истёк после ручного `invalidateSubscription`. Но `invalidateSubscription` вызывается только при нажатии кнопки «Я подписался» самим пользователем. Без контроля над моментом вызова — гонки нет.

---

## Итог — новые дыры

| ID | Суть | Severity | Файл |
|---|---|---|---|
| O-01 | Composio OAuth: атакующий может авторизовать свой Google под чужим `user_id`, если перехватит OAuth-ссылку | LOW | `src/composio.ts` |
| O-02 | Если `BOT_TOKEN` утёк (V-01), атакующий может forge initData для любого userId и вызвать `/api/admin/all` | HIGH (цепочка) | `src/dashboard-server.ts:147` |
| O-03 | Consent DB failure → пользователь в infinite loop, не может дать согласие | AVAILABILITY | `src/consent.ts:37-40` |

**Уже задокументировано в VULNERABILITIES.md и не дублируется:** V-00 (YooKassa IP bypass), V-01 (free → root через Bash).

**Закрыто по архитектуре (векторы не применимы):**
- initData replay — 24ч окно принято как стандарт Telegram Mini App
- OAuth redirect_uri — managed OAuth, redirect_uri не наш
- /start deep-link payload — не используется
- Channel subscription cache poisoning — нет внешнего хранилища, invalidate работает корректно
- YooKassa return URL подмена — URL хардкожен в env
- YooKassa cross-verify — эффективная защита без HMAC
