# Proboi — Roadmap (2026-05-11, rev 2)

> Этот файл — спецификация задач для параллельных агентов. Каждая задача выполняется на тест-сервере (jinru / @ORCH7_bot), деплой на прод только после явного подтверждения.

---

## Контекст

**Бот:** Proboi — ИИ-ассистент в Telegram (@proboiAI_bot / @ORCH7_bot)
**Стек:** TypeScript, Bun, grammY, DeepSeek, OpenRouter, YuKassa
**Серверы:**
- PROD: `root@89.167.125.175` (proboi-bot, @proboiAI_bot)
- TEST: `root@5.223.82.96` (jinru, @ORCH7_bot, токен `8678975502:...`)

**Ключевые инварианты:**
1. Owner (userId 292228713) — всегда `paid`, без лимитов, всегда с контейнером
2. `getUserProfile(userId)` — единственный источник истины
3. Деплой только на TEST первым, PROD — с явного разрешения
4. `replyFriendly(ctx, error, context)` — во всех catch-блоках
5. `bun run typecheck` — перед каждым деплоем

**Снятые блокеры (обновлено 2026-05-11):**
- ✅ ИП Энбом К.С. зарегистрировано — ОГРНИП/ИНН получены, вписать в задачу 4
- ✅ YuKassa зарегистрирована, тест-ключ `test_ZsMGCLq7wsJnMh4RXuCFVeJQhGX8sdqVoZoOix3cH4Q` активен
- ⚠️ `YUKASSA_SHOP_ID` — добавить в .env на TEST вручную перед задачей 5

**Бесплатный тариф — дневной лимит:**
Рекомендация совета: **10 сообщений/день** — достаточно для первого опыта, но создаёт реальное ощущение границы.
Хранить в `.env` как `FREE_DAILY_LIMIT=10` (если переменная не задана — 10 по умолчанию).
Счётчик сбрасывается в 00:00 UTC. Owner и Профи — без лимита.

---

## Философия конверсии (решение совета)

Мы не продаём — мы допродаём с каждым шагом. Пользователь должен видеть ценность Профи не в момент покупки, а в каждом взаимодействии с ботом. Главный инструмент — **guide-страница** (`/how-to-setup`). Это не справочник команд — это картина жизни с Профи.

**Guide появляется в пяти местах:**
1. Каждый `/start` — кнопка «Как использовать на полную»
2. Каждый блок (документ, лимит) — ссылка в CTA
3. День 4 триала — пуш «Профи истекает завтра. Вы уже успели попробовать...»
4. Дашборд — постоянная кнопка «Открыть гайд»
5. `/info` — первая кнопка

---

## ЗАДАЧА 1 — Очистка рабочих документов

**Агент:** haiku | **Зависимости:** нет

### Что удалить

```bash
rm -f ROADMAP.md.old UNIFIED_ROADMAP.md SPEC_PROMISE_DELIVERY.md \
      SECURITY_AUDIT_2026_05_10.md ЛОГИКА.md
rm -rf graphify-input/ graphify-out/ archive/
```

> ⚠️ ROADMAP.md — это уже новый файл (текущий). Старые — те что tracked в git.

### Что оставить

- `CLAUDE.md`, `memory/`, `OFERTA_DRAFT.md`, `AGENTS.md`

### Проверка

```bash
git status
bun run typecheck
```

---

## ЗАДАЧА 2 — YuKassa: API-клиент и типы

**Агент:** sonnet | **Зависимости:** нет | **Файлы:** `src/engines/yukassa.ts`, `src/types.ts`

### Новые переменные в `.env.example`

```
YUKASSA_SHOP_ID=        # ID магазина из личного кабинета YuKassa
YUKASSA_SECRET_KEY=     # Секретный ключ (test_... или live_...)
YUKASSA_WEBHOOK_SECRET= # Произвольная строка для верификации вебхука
FREE_DAILY_LIMIT=10     # Дневной лимит сообщений для бесплатного тарифа
```

### Новые типы в `src/types.ts`

```typescript
export interface YuKassaPayment {
  id: string;
  status: 'pending' | 'waiting_for_capture' | 'succeeded' | 'canceled';
  payment_method?: {
    id: string;
    saved: boolean;
    type: string;
    card?: { first6: string; last4: string; expiry_month: string; expiry_year: string };
  };
  confirmation?: { type: 'redirect'; confirmation_url: string };
  amount: { value: string; currency: string };
  created_at: string;
  metadata?: Record<string, string>;
}

export interface YuKassaWebhookEvent {
  type: 'payment.succeeded' | 'payment.canceled' | 'refund.succeeded';
  event: string;
  object: YuKassaPayment;
}
```

### Добавить в `UserNode` (`src/types.ts`)

```typescript
payment_method_id?: string;  // ID сохранённого метода оплаты
trial_used?: boolean;        // Триал уже использован
```

### Новый файл `src/engines/yukassa.ts`

```typescript
const BASE = 'https://api.yookassa.ru/v3';

function auth(): string {
  return 'Basic ' + Buffer.from(
    `${process.env.YUKASSA_SHOP_ID}:${process.env.YUKASSA_SECRET_KEY}`
  ).toString('base64');
}

function idempotencyKey(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export async function createBindingPayment(params: {
  userId: number;
  returnUrl: string;
}): Promise<{ id: string; confirmationUrl: string }> {
  const res = await fetch(`${BASE}/payments`, {
    method: 'POST',
    headers: {
      'Authorization': auth(),
      'Content-Type': 'application/json',
      'Idempotence-Key': idempotencyKey(),
    },
    body: JSON.stringify({
      amount: { value: '1.00', currency: 'RUB' },
      capture: true,
      save_payment_method: true,
      confirmation: { type: 'redirect', return_url: params.returnUrl },
      description: 'Привязка карты для Proboi Профи (1 ₽)',
      metadata: { userId: String(params.userId), purpose: 'card_binding' },
    }),
  });
  if (!res.ok) throw new Error(`YuKassa createBindingPayment: ${res.status} ${await res.text()}`);
  const data = await res.json() as any;
  return { id: data.id, confirmationUrl: data.confirmation.confirmation_url };
}

export async function chargeRecurring(params: {
  userId: number;
  paymentMethodId: string;
  amount: string;
  description: string;
}): Promise<YuKassaPayment> {
  const res = await fetch(`${BASE}/payments`, {
    method: 'POST',
    headers: {
      'Authorization': auth(),
      'Content-Type': 'application/json',
      'Idempotence-Key': idempotencyKey(),
    },
    body: JSON.stringify({
      amount: { value: params.amount, currency: 'RUB' },
      capture: true,
      payment_method_id: params.paymentMethodId,
      description: params.description,
      metadata: { userId: String(params.userId), purpose: 'recurring_subscription' },
    }),
  });
  if (!res.ok) throw new Error(`YuKassa chargeRecurring: ${res.status} ${await res.text()}`);
  return res.json() as Promise<YuKassaPayment>;
}

export async function getPayment(paymentId: string): Promise<YuKassaPayment> {
  const res = await fetch(`${BASE}/payments/${paymentId}`, {
    headers: { 'Authorization': auth() },
  });
  if (!res.ok) throw new Error(`YuKassa getPayment: ${res.status}`);
  return res.json() as Promise<YuKassaPayment>;
}

import type { YuKassaPayment } from '../types';
```

### Проверка

```bash
bun run typecheck
```

---

## ЗАДАЧА 3 — Огромная guide-страница «Как пользоваться»

**Агент:** sonnet | **Зависимости:** нет | **Файлы:** `src/templates/landing.ts`

### Принцип

Это не справочник команд. Это картина жизни до и после. Каждый раздел — сцена: «Раньше я делал X вручную. Теперь просто пишу боту — и готово.» Читатель должен видеть себя в тексте, не инструкцию.

Страница длинная. Это намеренно. Человек, который дочитал до конца, уже убеждён.

Функция: `renderHowToSetup()` в `src/templates/landing.ts`. Полностью переписать.

### Структура страницы

---

**Блок 0 — Герой (над всеми разделами)**

```
Proboi — это ваш личный ИИ-ассистент прямо в Telegram.
Голос, фото, файлы, код, Google — всё в одном чате.
Без установки. Без регистрации. Просто напишите.

[Открыть бот →]
```

---

**Блок 1 — Просто пишите**

Раньше: нужно было открывать ChatGPT в браузере, копировать текст, ждать. Если с телефона — неудобно.

Теперь: откройте бот и напишите что думаете. Без формулировок, без шаблонов. Бот понимает разговорный язык.

Примеры в кавычках:
- «Объясни мне что такое НДС простыми словами»
- «Помоги написать вежливый отказ клиенту, вот его сообщение: [вставить]»
- «Я устал. Что посмотреть сегодня вечером?»

---

**Блок 2 — Голосовые сообщения**

Раньше: голосовые не работали ни в одном AI-инструменте без плясок с транскрибацией.

Теперь: записали голосовое — бот расслышит и ответит. Удобно за рулём, на кухне, когда руки заняты.

Примеры:
- Надиктовали задачу — получили структурированный список
- Сказали «перепиши вот этот абзац» и зачитали его вслух — бот исправит
- «Напомни мне завтра в 10 позвонить Алексею» — работает [Профи]

---

**Блок 3 — Фотографии**

Раньше: для анализа изображения нужны были отдельные сервисы.

Теперь: отправьте фото — бот опишет, переведёт, посчитает, объяснит.

Примеры:
- Фото чека → «Сколько я потратил на еду?»
- Фото меню на иностранном языке → перевод
- Фото графика или таблицы → «Объясни что здесь»
- Скриншот переписки → «Как лучше ответить?»

---

**Блок 4 — Документы, таблицы, PDF** [Профи]

Раньше: чтобы разобраться в договоре на 30 страниц, нужен был час и юрист.

Теперь: загрузите PDF — и задайте вопрос. Бот прочитал весь документ.

Примеры:
- «Какие штрафы предусмотрены в этом договоре?»
- Загрузить Excel с продажами → «Какой месяц был лучшим?»
- Word-документ → «Найди все даты и список участников»
- «Перепиши этот раздел более официальным языком»

---

**Блок 5 — Код и автоматизация** [Профи]

Раньше: нужно было знать программирование или нанимать разработчика.

Теперь: опишите задачу словами — бот напишет код, запустит и покажет результат.

Примеры:
- «Напиши скрипт, который переименует все файлы в папке по дате»
- «У меня есть таблица CSV — посчитай среднее по столбцу»
- «Скачай это видео с YouTube» → ссылка → файл
- «Конвертируй этот PDF в Word»

Бот не просто пишет код — он его запускает в изолированной среде и возвращает результат.

---

**Блок 6 — Google Workspace** [Профи]

Раньше: чтобы найти письмо двухнедельной давности, нужно было помнить ключевые слова и листать папки.

Теперь: подключите Google-аккаунт один раз — и работайте голосом или текстом.

Примеры:
- «Найди письмо от Ивана про контракт»
- «Создай документ с планом встречи на завтра»
- «Что у меня в календаре на следующей неделе?»
- «Скопируй эту таблицу из Drive и добавь новый столбец»

Как подключить: напишите боту «подключи Google» — он пришлёт кнопку для безопасной авторизации.

---

**Блок 7 — Напоминания и автономная работа** [Профи]

Раньше: приложения для задач и напоминалок — это отдельные экосистемы, которые не знают о вашей переписке.

Теперь: бот помнит контекст и умеет работать пока вы спите.

Примеры:
- «Напомни мне в пятницу в 9 утра проверить отчёт»
- «Каждое утро в 8:00 пиши мне сводку погоды»
- «Запусти этот скрипт в 3 часа ночи и пришли результат»

---

**Блок 8 — Генерация изображений** [Профи]

Раньше: Midjourney, DALL-E — отдельные сервисы с отдельными подписками.

Теперь: опишите что хотите — картинка придёт прямо в чат.

Примеры:
- «Нарисуй логотип для кофейни в минималистичном стиле»
- «Сделай обложку для поста в Instagram: синий фон, текст "Новый запуск"»
- «Портрет кота в стиле японской гравюры»

---

**Блок 9 — Свои рецепты (для опытных пользователей)** [Профи]

Бот умеет учиться вашим командам. Создайте файл с рецептом в своей рабочей папке — и бот будет следовать ему при каждом запросе.

Например, вы всегда хотите чтобы бот отвечал в определённом стиле, или автоматически сохранял резюме встреч в Google Docs. Это можно записать один раз и больше не повторять.

Попросите бота: «Помоги мне создать рецепт для [задача]» — он сам объяснит как это сделать.

---

**Блок 10 — Совет трёх экспертов**

Когда нужно принять сложное решение — попросите бота провести совет. Он выступит от лица трёх разных экспертов, которые будут спорить друг с другом и в итоге дадут вам выжимку.

Пример:
«Проведи совет: стоит ли мне открывать второй магазин сейчас или подождать?»

Бот возьмёт роли предпринимателя, финансиста и скептика — каждый выскажет своё, потом они поспорят, и вы получите честный вывод с рекомендацией.

---

**Блок 11 — Часто задаваемые вопросы**

В: Это безопасно? Бот видит мои файлы?
О: Файлы обрабатываются только в момент запроса. Бот не хранит их постоянно.

В: Чем Профи отличается от бесплатного?
О: Бесплатный — текст и голос, до 10 сообщений в день. Профи — документы, код, Google, изображения, напоминания, свои рецепты. Без ограничений.

В: Как отменить подписку?
О: Напишите боту «отмени подписку» или нажмите кнопку в разделе /status. Карта не будет списана.

В: Что если карта не прошла?
О: Бот пришлёт уведомление и даст 48 часов на повторную оплату. Доступ не прекратится сразу.

В: Можно ли работать с нескольких устройств?
О: Да, это обычный Telegram-чат. Работает везде где есть Telegram.

---

**Блок 12 — OAuth: как работает подключение Google**

Что происходит когда вы нажимаете «Подключить Google»:
1. Открывается страница Google — не наша.
2. Вы выбираете аккаунт и нажимаете «Разрешить».
3. Google передаёт нам токен доступа — временный ключ только для указанных действий.

Что бот видит: только то, что вы разрешили (например, файлы в Drive или письма в Gmail).
Что бот не видит: ваш пароль Google. Никогда. Это технически невозможно при OAuth.
Как отозвать доступ: myaccount.google.com/permissions → найдите Proboi → «Удалить доступ».

Токен хранится в зашифрованном виде у нашего провайдера авторизации (Composio). Мы не храним пароли.

---

### Технические требования

- Русский язык, простые слова
- Каждый блок — отдельный `<section>` с якорем (`id="docs"`, `id="code"` и т.д.) — чтобы можно было ссылаться на конкретный блок из CTA
- Те же CSS-переменные что в основном лендинге
- Значки [Профи] — оранжевый бейдж рядом с заголовком блока, кликабельный на `/pay` (или `#pay-cta` якорь в конце страницы)
- В конце страницы — фиксированный блок:
  ```html
  <div class="cta-sticky">
    <p>Попробуйте Профи — 5 дней бесплатно при привязке карты</p>
    <a href="https://t.me/proboiAI_bot" class="btn-primary">Открыть бот →</a>
  </div>
  ```

---

## ЗАДАЧА 4 — Юридические документы

**Агент:** sonnet | **Зависимости:** нет
**Файлы:** `src/templates/oferta.ts`, `src/templates/privacy.ts`

### Контекст

Юридическая форма: **ИП Энбом Ксения Сергеевна** (ИП зарегистрировано).
Реквизиты: вписать в код как `[ОГРНИП: _______]`, `[ИНН: _______]`, `[Расчётный счёт: _______]` — заменить после получения банковских реквизитов.
Основание: ст. 435-436 ГК РФ (публичная оферта).

### `src/templates/oferta.ts` — `renderOferta()`

HTML-страница. Разделы:
1. Предмет договора
2. Стоимость (Профи 499 ₽/мес, триал 1 ₽ → 5 дней → автопродление)
3. Порядок активации и отмены (через бота командой или кнопкой)
4. Права и обязанности сторон
5. Запреты (из `OFERTA_DRAFT.md`)
6. Ответственность сторон
7. Конфиденциальность (ссылка на `/privacy`)
8. Заключительные положения
9. Реквизиты ИП

### `src/templates/privacy.ts` — `renderPrivacy()`

HTML-страница. Разделы:
1. Какие данные собираем (Telegram ID, username, история запросов, метаданные оплаты)
2. Цели обработки
3. Срок хранения (логи — 6 мес, данные оплаты — по требованиям ЮКасса)
4. Передача третьим лицам (ЮКасса, Anthropic/DeepSeek как AI-провайдеры, Composio для OAuth)
5. Права субъекта ПДн (152-ФЗ)
6. Контакты для обращений: `abuse@proboi.site`

### Технические требования

Оба файла — TypeScript, экспортируют `renderOferta(): string` и `renderPrivacy(): string`.
Стиль — те же CSS-переменные что в `src/templates/landing.ts`.

---

## ЗАДАЧА 5 — YuKassa: интеграция в платёжный флоу

**Агент:** sonnet | **Зависимости:** ЗАДАЧА 2
**Файлы:** `src/payments.ts`, `src/handlers/commands.ts`, `src/index.ts`, `src/user-registry.ts`, `src/tasks.ts`

### Логика триала

```
/pay (free-тир)
→ createBindingPayment() → ссылка с кнопкой [Привязать карту]
→ Пользователь платит 1 ₽ и привязывает карту
→ Вебхук payment.succeeded → savePaymentMethod() + activateSubscription(userId, 5)
→ Бот: "✅ Карта привязана! 5 дней Профи — бесплатно. Вот что теперь доступно:"
        + ссылка на /how-to-setup
→ День 4 (96 часов после активации) → пуш:
   "Ваш бесплатный Профи истекает завтра.
    Вы уже успели попробовать документы, голос и Google Docs.
    Завтра карта спишет 499 ₽ — и доступ продолжится.
    Хотите отменить — напишите /cancel."
    + кнопка [Что ещё можно сделать за сегодня →] → /how-to-setup
→ День 5 → chargeRecurring(499 ₽)
→ При успехе: продление +30 дней
→ При ошибке: уведомление пользователю + 48ч grace period + повторная попытка
→ Если повторная попытка не прошла → downgrade на free + уведомление
```

### `src/payments.ts`

- Убрать `sendSubscriptionInvoice()` (Telegram Stars) и `SUBSCRIPTION_PRICE_STARS`
- Добавить `sendYuKassaBindingLink(ctx, userId)` — сообщение со ссылкой
- Добавить `handleYuKassaWebhook(event: YuKassaWebhookEvent)` — центральный обработчик
- Сохранить `activateSubscription(userId, days)`
- Добавить `savePaymentMethod(userId, paymentMethodId)`

### `src/user-registry.ts`

```typescript
static savePaymentMethod(userId: number, methodId: string): void
static markTrialUsed(userId: number): void
static isTrialUsed(userId: number): boolean
static getSubscriptionExpiresAt(userId: number): Date | null
```

### `src/handlers/commands.ts` — `handlePay`

```
if tier === 'paid':
  статус подписки: когда истекает, сумма следующего списания
  кнопка [Отменить подписку]

if tier === 'free' && isTrialUsed:
  ссылка на оплату 499 ₽/мес

if tier === 'free' && !isTrialUsed:
  "Привяжи карту — получи 5 дней Профи бесплатно.
   После триала автоматически 499 ₽/мес. Отменить можно в любой момент командой /cancel."
  кнопка [Привязать карту — 5 дней бесплатно]
  под кнопкой: ссылка "Что даёт Профи → proboi.site/how-to-setup"
```

### `src/index.ts`

**Удалить:**
```typescript
bot.on('pre_checkout_query', ...)
bot.on('message:successful_payment', ...)
```

Зарегистрировать команду `/cancel`.

### `src/tasks.ts` — задача `chargeExpiredTrials`

```typescript
// Запускать каждые 6 часов через setInterval
// Найти users: tier='paid', subscription_expires < now
// Для каждого: chargeRecurring(499.00)
//   → success: продлить на 30 дней
//   → fail (первый раз): уведомить, установить grace_period_until = now + 48h
//   → fail (grace истёк): downgrade на free + финальное уведомление

// Найти users: tier='paid', trial_used=true, activated_at + 96h < now, day4_sent != true
// Для каждого: отправить Day-4 пуш (см. логику триала выше), пометить day4_sent=true
```

Добавить в `UserNode`:
```typescript
trial_activated_at?: string;   // ISO timestamp активации триала
day4_push_sent?: boolean;      // Пуш отправлен
grace_period_until?: string;   // Крайний срок повторной оплаты
```

---

## ЗАДАЧА 6 — YuKassa: вебхук и страница результата

**Агент:** sonnet | **Зависимости:** ЗАДАЧА 2
**Файлы:** `src/dashboard-server.ts`

### Новые маршруты

**`POST /webhook/yukassa`**

```typescript
// IP-фильтрация: принимать только с диапазонов YuKassa
const YUKASSA_IPS = [
  '185.71.76.0/27', '185.71.77.0/27',
  '77.75.153.0/25', '77.75.156.11/32', '77.75.156.35/32'
];
// Неверный IP → 403

// Тело: YuKassaWebhookEvent
// payment.succeeded → handleYuKassaWebhook(event) → 200 OK
// payment.canceled → уведомить пользователя через бот → 200 OK
// Всегда отвечать 200 (даже при ошибке обработки, чтобы YuKassa не ретраила)
// Ошибки логировать в console.error, не в ответ
```

**`GET /subscribe`**

```
?status=success&userId=<id>&payment_id=<id>
  → "Карта привязана! Возвращайтесь в бот — там уже всё активировано."
  → [Открыть бот →]

?status=cancel&userId=<id>
  → "Оплата отменена. Вы всегда можете вернуться."
  → [Вернуться в бот →]
```

**`GET /oferta`** — `renderOferta()` (зависит от задачи 4)
**`GET /privacy`** — `renderPrivacy()` (зависит от задачи 4)

---

## ЗАДАЧА 7 — Дневной лимит и прогресс-предупреждение (HIGH)

**Агент:** sonnet | **Зависимости:** ЗАДАЧА 5
**Файлы:** `src/daily-limit.ts`, `src/handlers/text.ts`, `src/handlers/voice.ts`

> ⚡ Это главный конверсионный рычаг для casual-пользователей. Приоритет выше документного гейта.

### Логика дневного лимита

```typescript
// FREE_DAILY_LIMIT из env (default: 10)
// Счётчик в памяти: Map<userId, { count: number; resetAt: Date }>
// Сбрасывается в 00:00 UTC
// Owner и tier='paid' — не проверяются

export function getDailyUsage(userId: number): { used: number; limit: number; remaining: number }
export function incrementDailyUsage(userId: number): void
export function isDailyLimitReached(userId: number): boolean
```

### Добавить в `src/handlers/text.ts` и `voice.ts`

В начале обработчика после auth check:

```typescript
// Проверить лимит
if (isDailyLimitReached(userId)) {
  const { limit } = getDailyUsage(userId);
  await ctx.reply(
    `Вы использовали все ${limit} бесплатных сообщений сегодня.\n\n` +
    `На тарифе Профи — без ограничений. Плюс документы, код, Google и многое другое.\n\n` +
    `Привяжите карту — первые 5 дней бесплатно.`,
    { reply_markup: new InlineKeyboard()
        .url('5 дней Профи бесплатно', 'https://t.me/proboiAI_bot?start=pay')
        .row()
        .url('Что даёт Профи →', 'https://proboi.site/how-to-setup') }
  );
  return;
}

// Предупреждение при достижении 80% лимита
const usage = getDailyUsage(userId);
if (usage.remaining === Math.floor(usage.limit * 0.2) && usage.remaining > 0) {
  // fire-and-forget: не блокировать основной ответ
  ctx.reply(
    `💡 Осталось ${usage.remaining} из ${usage.limit} бесплатных сообщений сегодня.\n` +
    `Хотите без лимитов? → /pay`
  ).catch(() => {});
}

// Обработать сообщение как обычно
// После успешного ответа:
incrementDailyUsage(userId);
```

---

## ЗАДАЧА 7b — Free-тир: первый документ бесплатно

**Агент:** sonnet | **Зависимости:** ЗАДАЧА 7
**Файлы:** `src/daily-limit.ts`, `src/handlers/document.ts`

### Логика

- Free-пользователь получает **1 попытку** обработки документа бесплатно (в сессии, сбрасывается при рестарте)
- После — блок с CTA
- Голосовые — всегда бесплатно, не трогать `voice.ts`

### Добавить в `src/daily-limit.ts`

```typescript
const freeDocUsed = new Map<number, boolean>();
export function hasFreeDocUsed(userId: number): boolean
export function markFreeDocUsed(userId: number): void
```

### `src/handlers/document.ts`

При блоке включить ссылку на guide-страницу:
```typescript
await ctx.reply(
  'Работа с документами — функция тарифа Профи.\n\n' +
  'Привяжи карту и получи 5 дней бесплатно 👇',
  { reply_markup: new InlineKeyboard()
      .text('Попробовать Профи', 'pay_upgrade')
      .row()
      .url('Что даёт Профи →', 'https://proboi.site/how-to-setup#docs') }
);
```

После первой успешной обработки:
```typescript
ctx.reply(
  '📎 Документ обработан!\n\n' +
  'На бесплатном тарифе — 1 документ в сессию. ' +
  'На Профи — без ограничений + код, Google Workspace, изображения и многое другое.',
  { reply_markup: new InlineKeyboard()
      .text('Попробовать 5 дней бесплатно', 'pay_upgrade')
      .row()
      .url('Посмотреть все возможности →', 'https://proboi.site/how-to-setup') }
).catch(() => {});
```

---

## ЗАДАЧА 8 — /info + дашборд + guide во всех точках касания

**Агент:** haiku | **Зависимости:** ЗАДАЧА 3, ЗАДАЧА 5
**Файлы:** `src/handlers/commands.ts`, `src/templates/user-dashboard.ts`, `src/index.ts`

### `handleStart` — каждый /start

Добавить в конец welcome-сообщения кнопку:

```typescript
keyboard.url('📖 Как использовать на полную →', 'https://proboi.site/how-to-setup')
```

### `handleInfo`

```typescript
keyboard
  .url('📖 Полный гайд', 'https://proboi.site/how-to-setup')
  .row()
  .url('💳 Попробовать Профи', 'https://t.me/proboiAI_bot?start=pay')
```

### `handleCancel` — новая команда `/cancel`

```typescript
// Если tier='paid': подтверждение отмены + кнопки [Да, отменить] / [Нет, оставить]
// Если tier='free': "У вас нет активной подписки"
// При подтверждении: помечаем cancel_at_period_end=true, уведомляем когда истекает
```

Зарегистрировать `/cancel` в `src/index.ts` и добавить в `baseCommands`.

### `user-dashboard.ts`

```html
<a href="https://proboi.site/how-to-setup" class="btn btn-secondary" target="_blank">
  📖 Открыть гайд
</a>
```

---

## ЗАДАЧА 9 — Юридические страницы в роутах и лендинге

**Агент:** haiku | **Зависимости:** ЗАДАЧА 4, ЗАДАЧА 6
**Файлы:** `src/dashboard-server.ts`, `src/templates/landing.ts`

Роуты добавлены в задаче 6. В этой задаче — только:
1. Убедиться что шаблоны подключены и страницы отдаются
2. В footer лендинга:

```html
<a href="/oferta">Публичная оферта</a>
<a href="/privacy">Политика конфиденциальности</a>
```

---

## ЗАДАЧА 10 — Анализ готовности к 50-100 пользователям

**Агент:** sonnet | **Зависимости:** ЗАДАЧА 5, ЗАДАЧА 7

### Что проверить (на TEST-сервере через SSH)

1. RAM, CPU, диск — текущий запас
2. Сколько Профи-контейнеров может работать одновременно (Memory limit: 512 MB на контейнер)
3. DeepSeek rate limit: есть ли ограничение на параллельные запросы с одного ключа?
4. `request-queue.ts`: есть ли ограничение для free-пользователей без контейнера?
5. `openrouter.ts` execSync — оценить риск блокировки event loop при 10 параллельных запросах
6. `vault-quota.ts`: `du` при 100 пользователях — реальная скорость

### Выход: `SCALING_NOTES.md`

```markdown
# Scaling Notes — 50-100 пользователей

## Текущая ёмкость сервера
...

## Узкие места
1. openrouter.ts execSync [КРИТИЧНО при > N одновременных]
2. vault-quota.ts du при 100 users [СРЕДНЕ]
3. ...

## Рекомендации
- Апгрейд при > N paid-пользователей
- Приоритет фикса: execSync → async (Task 10b)
- ...

## Готов к привлечению: ДА / НУЖНЫ ПРАВКИ
```

---

## ЗАДАЧА 11 — Сквозная проверка сценариев

**Агент:** sonnet | **Зависимости:** все предыдущие | **Только TEST**

### Сценарии

1. Новый пользователь → /start (убедиться, что кнопка guide есть) → 10 сообщений → предупреждение на 8/10 → блок на 11-м
2. Free → фото → ответ
3. Free → документ → первый ок + upsell → второй документ → блок с guide-ссылкой
4. /pay (free, без триала) → ссылка YuKassa → привязка тест-карты (4242...) → активация 5 дней → /status показывает верно
5. Day-4 пуш: создать пользователя с `trial_activated_at = now - 96h`, запустить задачу chargeExpiredTrials, убедиться что пуш отправлен
6. Истечение триала: `subscription_expires = now - 1m`, запустить задачу, убедиться что списание прошло (тест-карта)
7. **Карта отклонена (тест-карта 4000000000000002):** убедиться что пользователь получил уведомление, grace period установлен, доступ не потерян сразу
8. Grace period истёк: downgrade на free, финальное уведомление
9. Профи → запустить Python-код → результат
10. Профи → /google → OAuth → работа с Google Docs
11. /cancel → подтверждение → cancel_at_period_end → /status показывает дату окончания
12. /info → все кнопки работают → guide открывается
13. Dashboard → кнопка guide работает
14. GET /oferta, GET /privacy — страницы отдаются корректно

### Документация

Каждый сценарий: `PASS` / `FAIL` + описание проблемы.
Результат добавить в `memory/project_knowledge_graph.md`.

---

## Порядок запуска

```
Волна 1 (параллельно — нет зависимостей между собой):
├── Задача 1: Очистка
├── Задача 2: YuKassa engine + типы
├── Задача 3: Огромная guide-страница
└── Задача 4: Юридические документы

Волна 2 (после волны 1):
├── Задача 5: YuKassa платёжный флоу (зависит от 2)
└── Задача 6: YuKassa вебхук + dashboard routes (зависит от 2)

Волна 3 (после волны 2):
├── Задача 7:  Дневной лимит + прогресс-предупреждение (HIGH)
├── Задача 7b: Документный гейт (после 7)
├── Задача 8:  /info + дашборд + guide-ссылки (зависит от 3, 5)
└── Задача 9:  Юр. страницы в роутах (зависит от 4, 6)

Волна 4 (после волны 3):
├── Задача 10: Анализ нагрузки
└── Задача 11: Сквозная проверка (включая failed card scenarios)
```

---

## Что ещё не сделано (бэклог следующего роадмапа)

### Технический долг (MEDIUM)
- [ ] `openrouter.ts`: `execSync` → async (блокирует event loop под нагрузкой)
- [ ] Метеринг H1/H2/H3 — потери токенов при ask-user, stop, memory analyzer
- [ ] `fast-path.ts` + `deepseek-fast.ts` — решить: удалить или задеплоить
- [ ] AAAA DNS/IPv6 TLS для proboi.site

### Функции (следующая волна)
- [ ] `/council` как Telegram-команда для Профи (совет трёх экспертов прямо в боте)
- [ ] User-defined skills: документация в guide уже есть, нужна команда `/skills` и bootstrap при создании vault
- [ ] Backup vault-данных (cron rsync → второй диск)
- [ ] Owner-команда `/admin sub <userId> <days>` — ручное управление подпиской
- [ ] Push-уведомление об успешном списании (сейчас только об ошибках)

---

## Чеклист перед деплоем каждой задачи

- [ ] `bun run typecheck` — нет ошибок TypeScript
- [ ] Smoke-test: /start, /status, /pay, отправить сообщение
- [ ] Деплой только на TEST (jinru) первым
- [ ] PROD (@proboiAI_bot) — только с явного разрешения пользователя
