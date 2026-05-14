# Payment + subscription audit — 2026-05-14

## Сводка
- Critical: 1
- High: 3
- Medium: 3
- Low: 2

---

## Находки

### [CRITICAL P-01] Webhook IP-проверка обходится пустым X-Forwarded-For

- **Файл:** `src/dashboard-server.ts:451-459`
- **Что:** Условие проверки IP содержит ошибку: `if (clientIp && !isYuKassaIp(clientIp))`. Если nginx не передаёт заголовок `X-Forwarded-For` (либо он пустой), `clientIp` будет пустой строкой, условие `if (clientIp && ...)` — ложным, и блок `reject` не выполнится. Любой атакующий, напрямую обращающийся на порт 3848, минует IP-фильтр полностью.
- **Детали:**
  - `req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()` возвращает `undefined` → `""` если заголовка нет
  - `req.headers.get("x-real-ip")` тоже может отсутствовать при прямом доступе
  - Порт 3848 не должен быть доступен снаружи по firewall, но проверку нельзя считать защитой само по себе
  - nginx-конфиг `proboi.site.conf` не проксирует `/webhook/yukassa` (блок `location /` → `try_files $uri $uri/ =404`). Означает, что webhook **принимается только на прямой TCP-порт 3848**, который YooKassa должна достигать напрямую. Если порт открыт наружу без IP-фильтра на уровне iptables — любой может слать фейковые события.
- **Эксплуатация:** Атакующий напрямую шлёт `POST http://<server>:3848/webhook/yukassa` с телом `{"type":"notification","event":"payment.succeeded","object":{"id":"fake-id","status":"succeeded","metadata":{"userId":"<target_id>","purpose":"card_binding"},...}}`. IP-проверка пропускает запрос (пустой clientIp). Далее код вызывает `getPayment("fake-id")` для верификации через YooKassa API — это единственный барьер, который реально останавливает атаку. Если fake-id не существует в YooKassa — получит 404 и откажет. НО: если атакующий знает реальный платёжный ID (например, из другого источника) — верификация пройдёт, и подписка активируется повторно.
- **Фикс:** Изменить условие на `if (!clientIp || !isYuKassaIp(clientIp))` — пустой IP должен отклоняться, а не пропускаться. Параллельно: закрыть порт 3848 на iptables для внешних IP, разрешив только YooKassa-диапазоны.

---

### [HIGH P-02] Нет идемпотентности вебхука — повторная доставка дважды активирует подписку

- **Файл:** `src/payments.ts:102-168`
- **Что:** `handleYuKassaWebhook` не ведёт реестра обработанных `payment.id`. YooKassa гарантирует «at-least-once» доставку и ретраит вебхуки при отсутствии `200 OK` или при сетевых ошибках. При повторной доставке одного `payment.succeeded` с `purpose=recurring_subscription` функция `activateSubscription` вызовется дважды — и каждый раз добавит `SUBSCRIPTION_DAYS` к сроку подписки.
- **Пример:** YooKassa шлёт вебхук, бот отвечает 200, но через секунду шлёт ещё раз (стандартный retry). Пользователь получает +60 дней вместо +30.
- **Эксплуатация:** Непреднамеренная — просто стандартная ретрай-логика YooKassa. Намеренно: атакующий-оператор мог бы натриггерить повторную доставку через dashboard YooKassa.
- **Фикс:** Хранить `Set<string>` обработанных `payment.id` в памяти (до рестарта) + персистировать в `users.json` поле `processed_payment_ids: string[]` или отдельную SQLite-таблицу. Проверять перед любым `activateSubscription` / `savePaymentMethod`.

---

### [HIGH P-03] Webhook IP-проверка использует только `X-Forwarded-For` — подделывается клиентом

- **Файл:** `src/dashboard-server.ts:453-456`
- **Что:** Код читает `x-forwarded-for` заголовок для определения IP источника. При этом `dash.proboi.site.conf` использует `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for` — это **добавляет** реальный IP к цепочке, но **не перезаписывает** её. Если атакующий пошлёт запрос с заголовком `X-Forwarded-For: 185.71.76.1` (адрес из YooKassa CIDR), nginx добавит реальный IP в конец (`185.71.76.1, <real_ip>`), но код берёт только `split(",")[0]` — первый элемент, то есть подделанный IP атакующего.
- **Детали:** Это классический X-Forwarded-For bypass. nginx должен сбрасывать заголовок: `proxy_set_header X-Forwarded-For $remote_addr` (не `$proxy_add_x_forwarded_for`). Или использовать `X-Real-IP $remote_addr` — он тоже проксируется, но код предпочитает XFF.
- **Эксплуатация:** `curl -H "X-Forwarded-For: 185.71.76.1" https://proboi.site/webhook/yukassa -d '...'` — если `/webhook/yukassa` попадает под какой-то nginx location block, атакующий подделывает IP. Сейчас `/webhook/yukassa` не проксируется через nginx (в конфиге нет location для `/webhook/`), значит доступен только на порту 3848 напрямую, где nginx заголовки не добавляет. Severity снижается, но если nginx-конфиг изменится — баг активируется.
- **Фикс:** Если webhook будет проксироваться через nginx — использовать `proxy_set_header X-Real-IP $remote_addr` и читать только `x-real-ip` в коде. Для прямого доступа на 3848 — использовать `req.remoteAddress` (Bun API), что уже сделано для notify-bridge (строка 740), но НЕ сделано для webhook (строки 453-456).

---

### [HIGH P-04] `trial_used` и `subscription_expires` редактируемы через AI (гость → Edit/Write)

- **Файл:** `system/users.json` + `src/payments.ts:52-58`
- **Что:** `users.json` хранится в рабочей директории бота `/opt/claude-tg-bot/system/users.json`. Гости на paid-тарифе имеют контейнер и доступ к инструментам. Если paid-пользователь может попросить AI написать `/opt/claude-tg-bot/system/users.json` через инструмент Edit/Write (или через сессию владельца), он может:
  1. Сбросить `trial_used: false` → получить ещё один пробный период
  2. Установить `subscription_expires: "2030-01-01T00:00:00.000Z"` без оплаты
  3. Установить `tier: "paid"` для свободного пользователя
- **Эксплуатация:** Paid-гость пишет в боте: «Измени файл /opt/claude-tg-bot/system/users.json, установи для userId=123 subscription_expires на 2030 год». Если bot-сессия гостя имеет доступ к пути `/opt/claude-tg-bot/` через `allowedPaths` — команда выполнится.
- **Контекст:** Гости сидят в `/opt/vault/{userId}/`, а `ALLOWED_PATHS` для гостей = их vault. Прямой Write в `system/users.json` заблокирован path-check. Но если AI запустит Bash-команду `echo '...' > /opt/claude-tg-bot/system/users.json` или Python-скрипт — path check на Bash недостаточен (см. V-01 из VULNERABILITIES.md). Для paid-гостей с контейнером: контейнер изолирован, доступа к хосту нет. **Реальный риск** — если гость каким-то образом окажется на хосте (деградация контейнера, V-01 вектор).
- **Фикс:** `users.json` должен лежать вне `ALLOWED_PATHS` любого пользователя. Дополнительно: добавить checksum или подпись на поля tier/subscription_expires/trial_used при записи.

---

### [MEDIUM P-05] Нет проверки суммы при webhook — возможен апгрейд через 1₽-платёж

- **Файл:** `src/payments.ts:142-168`
- **Что:** При `purpose=card_binding` вебхук проверяет только `status === 'succeeded'`, но не проверяет `verified.amount.value`. Сумма платежа берётся из verified-ответа YooKassa API, но в коде она игнорируется. Если атакующий каким-то образом проведёт платёж с `metadata.purpose=card_binding` на сумму 0.01₽ (что невозможно через стандартный flow, но теоретически через API), подписка активируется.
- **Контекст:** В нормальном flow сумма создаётся на сервере в `createBindingPayment` (1₽ hardcoded). Вектор реален только если атакующий создаёт платёж через YooKassa API напрямую со своими credenтиалами продавца (владелец магазина), что не применимо к атаке гостя. Severity: LOW-MEDIUM, скорее defence-in-depth.
- **Фикс:** В `handleYuKassaWebhook` для `purpose=card_binding` добавить: `if (Number(verified.amount.value) < 0.99) return;`. Для `recurring_subscription`: `if (Number(verified.amount.value) < Number(SUBSCRIPTION_PRICE) - 0.01) return;`.

---

### [MEDIUM P-06] Subscription gate — кэш не инвалидируется при downgrade

- **Файл:** `src/subscription.ts:20-22` + `src/tasks.ts:182-183`
- **Что:** `isSubscribed()` кэширует результат проверки членства в Telegram-канале на 5 минут (positive TTL). `downgradeToFree()` не вызывает `invalidateSubscription()`. Если пользователь отписывается от канала, он продолжает пользоваться ботом ещё до 5 минут. Это нормально для channel gate, но создаёт путаницу при комбинировании платного тарифа и channel gate.
- **Контекст:** Subscription gate (Telegram-канал) и payment tier — разные системы. Если REQUIRED_CHANNEL_ID активен, то пользователь без подписки на канал заблокирован, независимо от tier. Но функция `isSubscribed` — только про Telegram-членство, не про tier. Средний риск.
- **Фикс:** Добавить `invalidateSubscription(userId)` в `downgradeToFree()`. Также при `confirm_cancel_subscription` в callback.ts — строка 115 не вызывает invalidate.

---

### [MEDIUM P-07] Race condition в chargeExpiredTrials: параллельный запуск дважды зарядит карту

- **Файл:** `src/tasks.ts:168-253` + `src/index.ts:463-464`
- **Что:** `chargeExpiredTrials` запускается раз в 6 часов через `setInterval`. Если функция выполняется >6 часов (например, из-за долгих YooKassa-запросов или сетевых таймаутов), следующий запуск стартует параллельно. Оба экземпляра увидят expired-юзера, оба попытаются зарядить карту. Нет mutex/lock/флага `charging_in_progress`.
- **Вероятность:** Низкая при нормальной работе. Высокая при деградации YooKassa (3 retry × 2s = +6s на пользователя, 50 пользователей = 5 минут). Если очередь занимает >6ч — оба запуска заряжают.
- **Эксплуатация:** Не управляемая пользователем — инфраструктурный баг. Последствие: пользователь оплачен дважды за один период.
- **Фикс:** Добавить `let _chargeRunning = false; if (_chargeRunning) return; _chargeRunning = true; try { ... } finally { _chargeRunning = false; }`.

---

### [LOW P-08] /subscribe redirect — userId в return_url не валидируется

- **Файл:** `src/payments.ts:83`
- **Что:** `returnUrl = ${RETURN_BASE_URL}/subscribe?status=success&userId=${userId}`. После оплаты YooKassa редиректит пользователя на эту страницу. `handleSubscribePage` (dashboard-server.ts:484) только показывает HTML и не обрабатывает `userId` — он используется лишь для UX. Само присвоение подписки происходит через webhook, не через redirect. Реальной уязвимости нет, но URL содержит `userId` — информация об аккаунте в браузерной истории/логах.
- **Фикс:** Убрать `userId` из return_url; для UX достаточно `status=success`.

---

### [LOW P-09] Идемпотентность `createBindingPayment` — новый UUID на каждый `/pay`

- **Файл:** `src/engines/yukassa.ts:12-14`
- **Что:** `idempotencyKey()` генерирует `randomUUID()` при каждом вызове. YooKassa использует этот ключ для дедупликации создания платежа. Если пользователь нажимает `/pay` дважды за короткое время — создаются два отдельных платежа с двумя binding-линками. Пользователь может привязать карту дважды, хотя второй вебхук не сделает ничего вредного (trial уже помечен как использованный после первого).
- **Фикс:** Хранить `paymentId` в памяти per-user на 10 минут; если есть активный pending-платёж — переиспользовать существующую ссылку вместо создания новой.

---

## Чисто (проверено, проблем нет)

- **Cross-user payment_method_id.** Гость не может передать свой `payment_method_id` другому пользователю: `chargeRecurring` принимает `paymentMethodId` параметром, но вызывается только из `chargeExpiredTrials`, которая берёт `methodId` исключительно из `user.payment_method_id` той же записи. Внешних API-эндпоинтов для этого поля нет.

- **Webhook подпись.** YooKassa не поддерживает HMAC-подпись вебхуков (в отличие от Stripe). IP-allowlist является их официальным методом верификации источника — реализован верно, ошибка только в логике empty-string bypass (P-01).

- **Верификация через API (cross-verify).** `handleYuKassaWebhook` вызывает `getPayment(payment.id)` и проверяет статус через YooKassa REST API независимо от тела вебхука. Это корректно предотвращает атаку где тело вебхука содержит `status=succeeded` для несуществующего или cancelled платежа.

- **Metadata spoofing в webhook body.** После верификации через API используется `verified.metadata?.userId` (не `payment.metadata?.userId` из тела вебхука). Строка 133-134: `const verifiedUserIdStr = verified.metadata?.userId; if (!verifiedUserIdStr || Number(verifiedUserIdStr) !== userId) return;`. Подмена userId в теле вебхука заблокирована.

- **Admin-only для `/api/admin/all`.** Проверка `validated.user.id !== OWNER_ID` выполняется после HMAC-верификации initData. Гость не может получить данные всех пользователей.

- **`confirm_cancel_subscription` — доступен только авторизованному пользователю.** Callback обрабатывается после `isAuthorized(userId, ALLOWED_USERS)` в начале `handleCallback`. Чужой пользователь не может отменить чужую подписку.

- **Trial flag атомарен.** `markTrialUsed` и `activateSubscription` вызываются последовательно внутри `handleYuKassaWebhook` в одной синхронной цепочке после верификации. Нет window между «trial отмечен» и «подписка активирована».

- **`downgradeToFree` очищает `payment_method_id`.** При downgrade карта удаляется из записи — повторный автозаряд невозможен после ручной отмены.
