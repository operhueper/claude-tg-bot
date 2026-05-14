# Аудит: работа со временем и датами

Дата: 2026-05-14  
Scope: subscription_expires, trial_used, rate-limit windows, retry timeouts, audit-log timestamps, cache TTLs, daily counters.  
Метод: read-only, grep + manual review.

---

## Суммарно — новых критичных не найдено

Основные подсистемы работают корректно через UTC. Дублирование с VULNERABILITIES.md исключено.  
Найдено 7 новых LOW/MEDIUM находок, не задокументированных ранее.

---

## TD-01. `nextResetAt()` — неправильный UTC-сдвиг (`daily-limit.ts:36-45`)

**Файл:** `src/daily-limit.ts:36-45`

```ts
const mskNow = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Moscow' }));
const tomorrow = new Date(mskNow);
tomorrow.setDate(tomorrow.getDate() + 1);
tomorrow.setHours(0, 0, 0, 0);
const utcReset = new Date(tomorrow.getTime() - 3 * 60 * 60 * 1000);
```

**Проблема:** `new Date(now.toLocaleString(...))` создаёт Date, который интерпретируется как **локальное время процесса**, а не UTC. На сервере с `TZ=UTC` это нейтрально (local = UTC), но `tomorrow.getTime()` возвращает timestamp объекта `tomorrow` который уже **представляет MSK-midnight как локальный** — то есть timestamp уже UTC. Вычитание `-3h` делает двойной сдвиг: MSK midnight - 3h = 21:00 UTC предыдущих суток.

Итоговая `utcReset` = **21:00 UTC** = midnight MSK. Математически верно на `TZ=UTC`, но логика хрупкая: если процесс запустится с `TZ=Europe/Moscow` (что возможно при ручном запуске), сдвиг применится дважды и `utcReset` будет на 3 часа раньше правильного значения.

**Функция используется только как display-строка** в API ответа (не для сброса счётчика — сброс идёт через `todayMsk()` в metering.ts). Поэтому фактического сброса-в-неправильное-время нет, только неверный countdown до reset в UI.

**Severity:** LOW — пользователь видит неправильное время до сброса при нестандартном `TZ` процесса.  
**Фикс:** использовать `Intl.DateTimeFormat` + явный парсинг, либо просто вычислять через `moscowDayStartUtcSeconds()` из metering.ts.

---

## TD-02. `activateSubscription()` — арифметика дней через миллисекунды (`payments.ts:37`)

**Файл:** `src/payments.ts:37`

```ts
const newExpiry = new Date(base.getTime() + days * 24 * 60 * 60 * 1000);
```

**Проблема:** `24 * 60 * 60 * 1000` = 86 400 000 мс = 86 400 секунд. В ночь перехода на/с летнего времени сутки = 23 или 25 часов. Пользователь из страны с DST получает подписку короче/длиннее на 1 час.

**Контекст:** `subscription_expires` хранится как ISO-строка (UTC). Сравнение `expiry > now` в `chargeExpiredTrials` — UTC vs UTC. **Реального эффекта нет для юзеров из UTC+X без DST** (Москва UTC+3 без DST). Для западноевропейских юзеров (если когда-либо появятся) — разница 1 час.

**Severity:** LOW — сервис ориентирован на Россию, MSK без DST. Но стоит зафиксировать.  
**Фикс:** использовать `date-fns/addDays` или явно добавлять дни через `setDate(d.getDate() + days)` на Date в UTC.

---

## TD-03. `checkSubscriptionExpiry()` — `expiry <= new Date()` boundary (`payments.ts:182`)

**Файл:** `src/payments.ts:182`

```ts
if (expiry <= new Date()) {
    downgradeToFree(userId);
```

**Проблема:** при точном совпадении `expiry === now` (до миллисекунды) условие `<=` срабатывает, и пользователь даунгрейдится. Это правильная семантика. Но функция помечена `@deprecated` и может вызываться в разных местах. В `chargeExpiredTrials` та же логика `expiry > now` — но с обратным знаком `> ` вместо `>=`, то есть в момент exactly-on-boundary `chargeExpiredTrials` не считает подписку истёкшей, а `checkSubscriptionExpiry` — считает.

**Конфликт:** если `chargeExpiredTrials` запускается ровно в момент expiry, он пропускает пользователя (не перезаряжает, не даунгрейдит), а `checkSubscriptionExpiry` (если вызывается при следующем сообщении) — даунгрейдит без попытки зарядить. Пользователь теряет возможность рекуррентного списания при точном совпадении.

**Severity:** LOW — окно равно 1 мс, практически невозможно.  
**Фикс:** выровнять логику — использовать `expiry <= now` везде (или `expiry < now` везде).

---

## TD-04. Rate-limiter: `lastUpdate` в будущем при NTP-прыжке назад (`security.ts:41-43`)

**Файл:** `src/security.ts:41-43`

```ts
const elapsed = (now - bucket.lastUpdate) / 1000;
bucket.tokens = Math.min(maxTokens, bucket.tokens + elapsed * refillRate);
bucket.lastUpdate = now;
```

**Проблема:** если NTP скорректирует время назад (например, на 10 секунд), `now < bucket.lastUpdate` → `elapsed` отрицательный → `bucket.tokens` уменьшится на `|elapsed| * refillRate`. При rate 1 req/min и прыжке 60 сек: `tokens -= 1` → если было 1.0, стало 0.0 → следующий запрос блокируется. После ещё одного прыжка `tokens` уйдёт в минус.

**Контекст:** NTP-коррекции на Linux редки (обычно slew, не step), но не исключены. На Hetzner VPS возможны.

**Severity:** LOW — пользователь получает временный false-отказ в rate-limit. Самовосстанавливается при следующем запросе (через минуту).  
**Фикс:** добавить `if (elapsed < 0) elapsed = 0;` перед вычислением tokens.

---

## TD-05. Subscription gate cache — нет защиты от `ts` в будущем (`subscription.ts:50-55`)

**Файл:** `src/subscription.ts:50-55`

```ts
if (cached) {
  const ttl = cached.subscribed ? CACHE_TTL_POSITIVE_MS : CACHE_TTL_NEGATIVE_MS;
  if (Date.now() - cached.ts < ttl) {
    return cached.subscribed;
  }
}
```

**Проблема:** `cached.ts` = `Date.now()` в момент записи. Если `Date.now()` по какой-то причине вернёт значение в будущем (clock jump forward, потом NTP поправил назад) — `cached.ts > Date.now()` → `Date.now() - cached.ts` будет **отрицательным** → `< TTL` всегда истинно → кеш никогда не инвалидируется, пользователь залипает в «не подписан» состоянии навсегда (до рестарта бота).

**Severity:** LOW — требует clock jump forward.  
**Фикс:** `if (Date.now() - cached.ts < 0 || Date.now() - cached.ts < ttl)` → инвалидировать при отрицательной разнице.

То же самое применимо к `vault-quota.ts:104` (`now - cached.ts < CACHE_TTL_MS`).

---

## TD-06. `chargeExpiredTrials` — Day-4 push использует `trial_activated_at`, а не UTC-нормализованное (`tasks.ts:237`)

**Файл:** `src/tasks.ts:237`

```ts
const activatedAt = new Date(user.trial_activated_at);
const day4 = new Date(activatedAt.getTime() + 96 * 60 * 60 * 1000); // 96h = day 4
if (now < day4) continue;
```

**Проблема:** `trial_activated_at` записывается как `new Date().toISOString()` — UTC, корректно. Сравнение UTC-to-UTC через `getTime()`. **Логика правильна.**

Но: функция `chargeExpiredTrials` запускается каждые 6 часов (`setInterval(... 6h)`, `src/index.ts:498`). Если push уже должен быть отправлен (now > day4) но бот был перезапущен — push отправится в первые 6 часов после рестарта. Если day4 попадает между двумя интервалами → задержка push до 6 часов после day4. Пользователь получает «завтра истекает» уведомление через 6 часов после дня-4, а не в начале дня-4.

**Severity:** LOW — только UX-последствие.  
**Фикс:** выровнять интервал или отправлять при первом `chargeExpiredTrials` вызове после day4 (уже так работает, но задержка до 6h остаётся).

---

## TD-07. Audit log timestamps — UTC, но без timezone-суффикса в plain-text формате (`utils.ts:82`)

**Файл:** `src/utils.ts:82`

```ts
timestamp: new Date().toISOString(),
```

В JSON-режиме (`AUDIT_LOG_JSON=true`) — ISO 8601 с `Z`, всё корректно и сравнимо.  
В plain-text режиме (default) формат не задокументирован и зависит от реализации `auditLog`. Если plain-text использует `toString()` вместо `toISOString()`, timestamps будут в local timezone — несравнимы с UTC timestamps из других источников (metering.ts, session.ts).

Grep показывает, что `utils.ts` всегда пишет `timestamp: new Date().toISOString()` — это UTC. Проблема **потенциальная**, не актуальная.

**Severity:** MINIMAL — фактически не проявляется при текущей реализации.

---

## TD-08. Session `saved_at` без timezone (`session.ts:1342`)

**Файл:** `src/session.ts:1342`

```ts
saved_at: new Date().toISOString(),
```

Корректно — ISO 8601 UTC. В `/resume` парсится как `new Date(s.saved_at)` → UTC. Форматируется через `toLocaleDateString("ru-RU")` — **без explicit timezone** → использует TZ процесса. На сервере `TZ=UTC` или MSK — возможно расхождение отображаемой даты с реальной на ±day в районе midnight.

**Severity:** LOW — только отображение. Пользователь может видеть «вчера» вместо «сегодня» для сессии сохранённой в 22:00 UTC (01:00 MSK следующего дня).  
**Фикс:** `toLocaleDateString("ru-RU", { timeZone: "Europe/Moscow" })`.

---

## TD-09. `setInterval` для billing — `6 * 60 * 60 * 1000` = 21 600 000 мс

**Файл:** `src/index.ts:498`

```ts
setInterval(() => chargeExpiredTrials(bot).catch(console.error), 6 * 60 * 60 * 1000);
```

Node.js/Bun `setInterval` принимает ms как `uint32` (max ~49.7 дней). 6h = 21 600 000 мс — в пределах uint32 (max 2^31 = 2 147 483 647). **Нет overflow.**

Но: `setInterval` не компенсирует drift. Если `chargeExpiredTrials` занимает 5 секунд, следующий вызов через 6h+0 (не 6h-5s). Накопленный drift за месяц — минуты. Для биллинга некритично.

**Severity:** INFORMATIONAL — не баг.

---

## TD-10. `todayMsk()` использует `toLocaleDateString` — корректно, но замечание

**Файл:** `src/metering.ts:311-312`

```ts
function todayMsk(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Moscow' });
}
```

`sv-SE` locale возвращает `YYYY-MM-DD` — фактически ISO date без timezone suffix. Используется как DB key для `daily_counts`. **Логика корректна:** всегда UTC-moment → MSK date → строка.

**Edge case:** `sv-SE` locale зависит от ICU данных, встроенных в Bun/Node. На сервере без full-ICU данных `timeZone` опция может быть проигнорирована. Bun по умолчанию включает ICU — вероятность низкая.

**Severity:** INFORMATIONAL.

---

## Итог по векторам из ТЗ

| Вектор | Статус | Примечание |
|--------|--------|------------|
| Timezone confusion в `subscription_expires` | **OK** — UTC через `toISOString()`/`new Date()` | |
| DST-переход | **LOW** — TD-02, только страны с DST | |
| subscription_expires арифметика | **LOW** — TD-02 | |
| trial_used reset | **OK** — boolean, не дата | |
| Rate-limit window при NTP-коррекции | **LOW** — TD-04 | |
| Retry timeout overflow | **OK** — 6h << uint32 max | |
| Audit log timestamps | **OK** — всегда `toISOString()` | |
| Cache TTL при `ts` в будущем | **LOW** — TD-05 (vault-quota + subscription gate) | |
| Subscription gate CACHE_TTL_NEGATIVE_MS = 60s | **OK** — задокументированное поведение | |
| /pay link expiration (YooKassa) | **OPEN** — TTL YooKassa confirmation_url не проверяется ботом; пользователь может открыть ссылку через час — она уже недействительна | |
| Concurrent webhook extension | **OPEN** — V-1A в VULNERABILITIES.md (задокументировано) | |
| `timezone` поле в users.json | **OK** — используется только в `session.ts:538` как `profile.timezone` для `datePrefix` в prompt | |

---

## /pay link expiration — не задокументировано в VULNERABILITIES.md

**ID:** TD-11  
**Файл:** `src/payments.ts:83-89`

YooKassa `confirmation_url` имеет TTL (обычно 1 час). Бот шлёт ссылку, пользователь открывает через >1h → получает ошибку YooKassa без объяснения. Бот не знает об истечении ссылки.

**Severity:** UX/LOW — не security, но фрустрация для пользователей.  
**Фикс:** добавить в сообщение «ссылка действительна 1 час» + кнопку «Получить новую ссылку» через callback.

---

## Заключение

Критических time/date уязвимостей нет. Все `subscription_expires` сравнения идут через UTC. Daily counters привязаны к MSK-дате через надёжный `sv-SE locale + timeZone`. Rate-limiter работает через `Date.now()` монотонно.

Новые находки (TD-01..TD-11) — все LOW или ниже, не блокируют ротацию ключей.
