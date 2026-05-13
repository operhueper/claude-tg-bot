# Zone 1 — Auth + Invite + Subscription gate

## Summary
Контур аутентификации в целом продуман (registry-first профиль, `isOwnerById` через role, атомарная запись в `saveUser`), но содержит **одну critical TOCTOU-гонку при approve** (расходящиеся write-пути), **два high-уровня обхода subscription gate** (callback-ы кроме `subscription:check` пропускаются без проверки только если они не доходят до middleware, и invite-флоу позволяет неавторизованным пользователям полностью миновать gate), а также серию medium-проблем: отсутствие atomic write в `addUser`, отсутствие audit-логирования отказов в авторизации, и доверие к мутируемому in-memory `ALLOWED_USERS`/`NEW_GUEST_USERS`, который может разойтись с диском.

## Findings

| # | Severity | File:line | Issue |
|---|----------|-----------|-------|
| 1 | high | src/user-registry.ts:137-159 | `addUser()` использует `writeFileSync` напрямую вместо `writeUsersAtomic` — два одновременных approve могут потерять записи |
| 2 | high | src/index.ts:113-157 | Subscription gate стоит ПОСЛЕ авторизации, но НЕ покрывает неавторизованных — owner может одобрить юзера, не подписанного на канал; владелец же шлёт `welcomeKb` сразу после approve (callback.ts:419), и тот спокойно работает |
| 3 | high | src/handlers/text.ts:254-263 | Если `session.isRunning` — `addPendingContext(message)` сохраняет произвольный текст в очередь до проверки `rateLimiter.check`, обходя per-profile лимит и сохраняя пользовательский ввод даже от заблокированного по лимиту |
| 4 | medium | src/handlers/callback.ts:316-321 | `handleInviteCallback` проверяет только `ctx.from?.id !== OWNER_USER_ID` — но `OWNER_USER_ID` это hardcoded 292228713 (config.ts:948), при этом `role === "owner"` в users.json может быть назначен ЛЮБОМУ id. Privilege model fragmented: подмена users.json или будущий мульти-owner ломают invariants |
| 5 | medium | src/containers/invites.ts:96-101 | `ownerId = ALLOWED_USERS.find(id => !NEW_GUEST_USERS.includes(id))` — нотификация о новом запросе уходит первому non-guest в массиве; если порядок изменится или будет approved owner ДО реального owner'а, нотификация уйдёт не туда |
| 6 | medium | src/config.ts:62-69, 272-280 | Слияние `UserRegistry.getAllUsers()` в `ALLOWED_USERS` и `NEW_GUEST_USERS` происходит при импорте модуля — но `UserRegistry._cache` ленив (`load()` на первом обращении), а `getUserProfile()` дальше может вытащить устаревший cache. Если `users.json` изменили на диске между перезапусками (вручную или другим процессом) — будет дрейф |
| 7 | medium | src/config.ts:74-78 | `NEW_GUEST_USERS` имеет hardcoded fallback `[893951298, 403360614, 299753724, 307773800, 5615267984, 946882308, 517872933]` — если `NEW_GUEST_USERS` env не задан, эти ID автоматически считаются гостями. На прод-сервере env-переменная может оказаться пустой (см. MEMORY: jinru_config_divergence) — тогда любой из них получает гостевой профиль БЕЗ записи в users.json и БЕЗ approve owner'ом |
| 8 | medium | src/utils.ts:74-93 + handlers/*.ts | `auditLogAuth` определена (utils.ts:95-107), но **нигде не вызывается** — все хендлеры пишут `ctx.reply("Unauthorized")` без записи попытки в audit-лог. Атаки brute-force на ID не фиксируются |
| 9 | medium | src/handlers/callback.ts:42-47 | Subscription gate в middleware пропускает callbackData=`subscription:check` (index.ts:128), но НЕ пропускает другие callback (`invite_approve_*`, `pay_upgrade`, etc.) — у owner'а проходит через `if (profile.isOwner) return next();`, но у любого нового non-owner юзера, кликнувшего welcome-кнопку до подписки на канал, gate сработает с alert — это OK, но reasoning хрупкий: добавление role-based callback (например, partner approve) сломает invariant |
| 10 | low | src/handlers/callback.ts:343-377 | После `addUser()` (write на диск) → `NEW_GUEST_USERS.push()` → `ALLOWED_USERS.push()`: если повторный approve успеет проскочить между `addUser()` (возвращает `isNew=false`) и `removePendingInvite` — `containerManager.getOrStart()` не запустится (ветка `if (!alreadyExisted)`), но новый owner-message с welcome-keyboard всё равно отправится. Юзер получит «✅ Доступ открыт!» дважды |
| 11 | low | src/handlers/callback.ts:50-53 | `invite_approve_` и `invite_deny_` parsed простым `replace(...)` без валидации структуры — `invite_approve_NaN` или `invite_approve_-5` пройдут до `parseInt`, который вернёт NaN/negative — отсекается на 327, но защита косвенная |
| 12 | low | src/handlers/commands.ts:399-404 | `commandAllowed(userId, "restart")` проверяет `getUserProfile(userId).allowedCommands.has(command)` — но `GUEST_COMMANDS` уже содержит "restart" (config.ts:990), так что проверка по факту ничего не блокирует для гостей. Не баг, но контракт расходится с docstring «Restricted users (guests) are blocked from /restart» |

## Detailed findings

### F1. addUser НЕ использует atomic write
**Severity:** high
**Файл:** src/user-registry.ts:137-159 (особенно строка 155)
**Что не так:**
```ts
export async function addUser(user: UserNode): Promise<boolean> {
  ...
  users.push(user);
  writeFileSync(USERS_FILE, JSON.stringify(users, null, 2) + "\n");  // ← НЕ writeUsersAtomic
```
`saveUser` (line 105) использует `writeUsersAtomic` (tmp + rename), а `addUser` пишет напрямую в `USERS_FILE`. Если два approve гонятся:
1. Approve A читает users (3 user'а)
2. Approve B читает users (3 user'а)
3. A push'нул → write `[..., A]` (4 user'а)
4. B push'нул в свой массив → write `[..., B]` (4 user'а, A потерян)

**Почему это баг:** Owner может одобрить двух гостей подряд (быстро таппая по двум pending invite в Telegram). Один из них потеряется из users.json, после рестарта он не будет считаться гостем — и упадёт в branch `!isOwnerById` (config.ts:1017), что отдаёт ему гостевой профиль ad-hoc (через auto-add в NEW_GUEST_USERS на 1020). Защита есть, но второй approve через `addUser → isNew=false` уже не пишет.

**Как чинить:** В `addUser` (line 155) заменить `writeFileSync(USERS_FILE, ...)` на `writeUsersAtomic(users)`.

---

### F2. Subscription gate не покрывает welcome-keyboard и invite-флоу полностью
**Severity:** high
**Файл:** src/index.ts:113-157, src/handlers/callback.ts:412-429
**Что не так:**
Middleware на 113-120 пропускает неавторизованных:
```ts
if (!isAuthorized(userId, ALLOWED_USERS)) return next();
```
Это правильно для invite flow. НО когда owner approve'ит юзера, callback.ts:419 шлёт ему inline-keyboard с web_app и pay_upgrade ДО того, как owner проверит/потребует подписку на @ProBoiAI. Само по себе welcome-сообщение — ОК, но текущая логика gate'а доверяет, что подписка проверится «при следующем сообщении» — а пользователь может: 1) тап'нуть `pay_upgrade` callback **до** того, как gate сработает (middleware пропустит — он авторизован, payments handler не проверяет подписку); 2) затап'нуть `web_app` (Mini App) — handler `dashboard-server.ts` верифицирует `initData`, но **не проверяет подписку**.

**Почему это баг:** REQUIRED_CHANNEL_ID задумывался как обязательный gate для всех гостей. Юзер, прошедший approve, может пользоваться платёжной воронкой и дашбордом, не подписавшись на канал.

**Как чинить:** Либо проверять подписку перед approve (в `handleInviteCallback`), либо добавить проверку в `pay_upgrade` callback и в dashboard-server.ts (`/api/me`, `/api/admin/all`).

---

### F3. addPendingContext запускается ДО rate-limiter
**Severity:** high
**Файл:** src/handlers/text.ts:254-263
**Что не так:**
```ts
if (session.isRunning) {
  session.addPendingContext(message);
  releaseContainerSlot?.();
  releaseUserLock?.();
  ...
  await ctx.react("👌");
  return;
}
// 3. Rate limit check     ← никогда не достигается для running session
const [allowed, retryAfter] = rateLimiter.check(userId);
```
Если у юзера сессия `isRunning`, текст помещается в `pendingContextMessages` БЕЗ проверки rate limit. Юзер может зафлудить очередь до того, как rate limiter сработает. Когда сессия завершится — `consumePendingContext()` (text.ts:362) склеит всё в один большой запрос через `\n\n` и отправит в Claude.

**Почему это баг:**
1. Обход rate limit — формально гость не имеет лимита (config.ts:1068 — `rateLimitEnabled: true` по умолчанию), но owner с включённым лимитом обходится.
2. Атакер может за 100 ms задампить тысячи строк в pending queue, и они уйдут одним мега-запросом → большой расход токенов владельца.

**Как чинить:** Проверять rate-limit перед `addPendingContext`, либо ограничивать размер очереди (например, max 5 сообщений / max 5000 chars total).

---

### F4. Двойственная owner-модель: hardcoded OWNER_USER_ID vs role==="owner"
**Severity:** medium
**Файл:** src/config.ts:948, src/handlers/callback.ts:318
**Что не так:**
- `OWNER_USER_ID = 292228713` (захардкожено)
- `handleInviteCallback` проверяет ТОЛЬКО `ctx.from?.id !== OWNER_USER_ID`
- А `getUserProfile()` определяет owner через `node?.role === "owner"` (config.ts:1015)
- Эти два пути могут разойтись: можно добавить вторую запись с `role: "owner"` в users.json — но invite-approve останется monopoly первого ID

**Почему это баг:** Inconsistency. Если когда-нибудь будет нужен второй owner — `handleInviteCallback` его отвергнет с «Недоступно». Также если злоумышленник получит запись `role: "owner"` в users.json (через bot-self-modification?) — он получит owner-профиль ВЕЗДЕ кроме invite approve. Это, по факту, защищает invite поток, но contract расходится.

**Как чинить:** В `handleInviteCallback` (callback.ts:318) проверять `getUserProfile(ctx.from!.id).isOwner` вместо `OWNER_USER_ID`. Или, наоборот, во всём коде использовать единственный источник истины — hardcoded `OWNER_USER_ID`.

---

### F5. ownerId в invites.ts вычисляется эвристикой
**Severity:** medium
**Файл:** src/containers/invites.ts:96-101
```ts
const ownerId = ALLOWED_USERS.find((id) => !NEW_GUEST_USERS.includes(id));
```
**Что не так:** Берётся ПЕРВЫЙ ID из ALLOWED_USERS, который не в NEW_GUEST_USERS. Зависит от порядка. Если из-за `NEW_GUEST_USERS.push()` (config.ts:1020 auto-add) порядок «не-гостей» в `ALLOWED_USERS` меняется, или если когда-нибудь добавится partner-owner — invite-нотификация может уйти не туда.

**Как чинить:** Использовать `OWNER_USER_ID` напрямую (consistent с callback.ts:318), либо найти `UserRegistry.getAllUsers().find(u => u.role === "owner")`.

---

### F6. UserRegistry cache + многократный mutate ALLOWED_USERS
**Severity:** medium
**Файл:** src/config.ts:62-69, 272-280, 1020
**Что не так:**
- При импорте модуля `for (const node of UserRegistry.getAllUsers())` мерджит юзеров в `ALLOWED_USERS` и `NEW_GUEST_USERS`.
- `UserRegistry._cache` живёт **на всю жизнь процесса** и сбрасывается только в `addUser` / `saveUser` (UserRegistry.reload()) или явно.
- `getUserProfile()` для не-owner делает `NEW_GUEST_USERS.push(userId)` (config.ts:1020) каждый раз, когда лезет к незарегистрированному ID — список бесконечно растёт.

**Почему это баг:**
1. Если `users.json` редактируется вручную (как написано в системном промпте — bot-self-modification) — изменения не подхватятся до перезапуска или `UserRegistry.reload()`.
2. `NEW_GUEST_USERS` распухает на каждый незнакомый ID, в т.ч. от случайных запросов. Утечка памяти (хотя медленная) и расхождение с диском.

**Как чинить:** Документировать TTL кэша, либо чистить `NEW_GUEST_USERS` после auto-add, либо использовать Set вместо Array.

---

### F7. NEW_GUEST_USERS fallback в src/config.ts даёт guest-profile без approve
**Severity:** medium
**Файл:** src/config.ts:74-78
```ts
const newGuestEnv = process.env.NEW_GUEST_USERS;
export const NEW_GUEST_USERS: number[] =
  newGuestEnv !== undefined && newGuestEnv.trim() !== ""
    ? parseUserList(newGuestEnv)
    : [893951298, 403360614, 299753724, 307773800, 5615267984, 946882308, 517872933];
```
**Что не так:** Если переменная `NEW_GUEST_USERS` не задана в `.env` — все эти 7 ID получают гостевой профиль (vault, deepseek, container) АВТОМАТИЧЕСКИ, даже если их нет в users.json. Авторизация дополнительно требует `ALLOWED_USERS` (env-список из `TELEGRAM_ALLOWED_USERS`), но если случайно их продублировать туда — они работают без approve owner'а.

**Почему это баг:** Hardcoded prod-IDs в open-source-style fallback — code smell. Если env потеряется (см. MEMORY: jinru_config_divergence), список не «обнуляется», а возвращается к старому состоянию.

**Как чинить:** Убрать fallback (использовать пустой массив `[]`), полностью полагаться на `UserRegistry.getAllUsers()` и env.

---

### F8. Отсутствует audit-логирование отказов в авторизации
**Severity:** medium
**Файл:** src/utils.ts:95-107 (auditLogAuth определён, но не используется), src/handlers/*.ts (все «Unauthorized» replies)
**Что не так:** Все `isAuthorized` ветки пишут `ctx.reply("Unauthorized.")` и возвращаются. `auditLogAuth(userId, username, false)` нигде не вызывается. Brute-force попытки или сканирование user-ID не попадают в аудит.

**Почему это баг:**
1. Невозможно увидеть в логах попытки несанкционированного доступа.
2. Также: попытки гостя вызвать `/reloadbot` или `/restart` (когда `commandAllowed` отказывает — commands.ts:399, 499) тоже не логируются.

**Как чинить:** Добавить `await auditLogAuth(userId, username, false)` в каждый `Unauthorized` branch. Логировать также отказы `commandAllowed`.

---

### F9. callback subscription gate bypass через любой не-`subscription:check`
**Severity:** medium
**Файл:** src/index.ts:128
**Что не так:**
```ts
if (ctx.callbackQuery?.data === "subscription:check") return next();
```
Это пропускает только эту команду. Все остальные callback'и проходят через `await isSubscribed(...)`. ОК для текущего набора кнопок (welcome `pay_upgrade` отображается только до подписки, но handler `handleInviteCallback` идёт через `pay_upgrade` callback после approve — gate уже включён). Однако:
- `invalidateSubscription(userId)` (subscription.ts:30) очищает кэш — нет защиты от спама recheck-кнопки.
- Кэш negative TTL = 60 сек (subscription.ts:21) — но `invalidateSubscription` сбрасывает мгновенно. Пользователь может ддосить `getChatMember` через таппы по «Я подписался».

**Почему это баг:** Нет rate-limit на recheck. Telegram API имеет свои лимиты, но бот не защищается.

**Как чинить:** Добавить rate-limit на `subscription:check` (например, не чаще 1 раза в 5 сек на юзера).

---

### F10. Дублирующиеся welcome-сообщения при двойном approve
**Severity:** low
**Файл:** src/handlers/callback.ts:343-378, 412-429
**Что не так:** Логика идемпотентности на уровне users.json (`addUser` → `isNew`), но welcome-message отправляется на любом approve где `!alreadyExisted` — а вот `pending-invite` удаляется ВСЕГДА (380). При двойном тапе:
1. Tap 1: `getPendingInvite` → есть; `addUser` → `isNew=true`; welcome шлётся.
2. Tap 2: `getPendingInvite` → null (уже удалён на step 1) → выход на 336 с «Запрос не найден».
Идемпотентность защищена. Но если pending всё-таки повторно создастся (race на `savePendingInvite` от двух `/start`), оба approve пройдут до `isNew` — второй вернёт `false`, и welcome не отправится — это OK.

**Почему это (потенциально) баг:** При очень узком окне между `getPendingInvite` (line 332) и `removePendingInvite` (380) два approve могут пройти параллельно, оба получат `invite != null`, и оба попытаются `addUser`. Из-за F1 (non-atomic write) один из них может потеряться в users.json.

**Как чинить:** Переместить `removePendingInvite` сразу после `getPendingInvite`, или использовать атомарную rename-based блокировку для invite файла.

---

### F11. invite callback parser слабый
**Severity:** low
**Файл:** src/handlers/callback.ts:50-53, 323-330
**Что не так:** `callbackData.startsWith("invite_approve_")` + `replace(...)` без regex — формально допускает `invite_approve_-9` или `invite_approve_99999999999999999999`. Защита через `parseInt + isNaN` есть, но большие числа могут overflow Number.MAX_SAFE_INTEGER (Telegram user IDs впихиваются в 53 бит, но не контролируется).

**Как чинить:** Жёстче валидировать: `/^invite_(approve|deny)_(\d{1,15})$/`.

---

### F12. GUEST_COMMANDS включает "restart" — docstring врёт
**Severity:** low
**Файл:** src/handlers/commands.ts:391-404, src/config.ts:980-993
**Что не так:** Docstring `handleRestart` говорит: «Restricted users (guests) are blocked from /restart» (commands.ts:8). Но в `GUEST_COMMANDS` есть `"restart"` (config.ts:990), и `commandAllowed(userId, "restart")` для гостя вернёт `true`. Проверка ничего не отсекает.

Если поведение задумано — обновить docstring. Если задумано блокировать `/restart` для гостей — убрать из GUEST_COMMANDS.

## Что в порядке

- **isOwnerById guard** (config.ts:1015): owner-ветка входит только если `node?.role === "owner"`. После 2026-05-07 инцидента с Мариной это правильный fix. Незнакомый ID попадает в guest branch, а не в owner.
- **ALLOWED_USERS merge from registry** (config.ts:62-69): даже без env-переменной approved гость переживает рестарт.
- **OWNER_USER_ID hardcoded check** в `handleInviteCallback` (callback.ts:318): нельзя получить право апрува через подмену users.json.
- **askuser:* callback per-user file path** (callback.ts:212): `/tmp/ask-user-${userId}-${requestId}.json` — нельзя прочитать чужой dropbox через подмену requestId. REQUEST_ID_RE валидация (callback.ts:203) на месте.
- **plan_confirm:* embedded userId** (callback.ts:638-642): проверка, что callback от того же юзера, который запустил план.
- **buildGuestBaseEnv** (config.ts:955-962): explicit passthrough, нет утечки `TELEGRAM_BOT_TOKEN`/`OPENAI_API_KEY` в guest sandbox.
- **disallowedTools: ["WebSearch"]** для guest (config.ts:1085) и owner-через-DeepSeek (config.ts:1131): передаётся в SDK query() — реально блокирует.
- **per-user sessionFile** `/tmp/claude-telegram-session-${userId}.json` — корректно изолировано.
- **subscription cache TTL** (subscription.ts:20-22): 5 мин positive, 1 мин negative — sane.
- **subscription `restricted` status включён в SUBSCRIBED_STATUSES** (subscription.ts:39-44): не отрубает легитимных юзеров.
- **sequentialize per chat** (index.ts:161-178): защищает от race в обработке сообщений; commands и callbacks намеренно не sequentialized — что соответствует требованию интерактива.
- **bot.catch + process.on('uncaughtException')** (index.ts:62-67, 224): бот не падает на необработанных ошибках хендлеров.

## Архитектурные замечания

1. **Owner-модель раздвоена.** `OWNER_USER_ID` (config.ts:948, hardcoded 292228713) и `node?.role === "owner"` (registry-based). Унификация: либо ВСЁ через registry (тогда `OWNER_USER_ID` — это просто `UserRegistry.getAllUsers().find(u => u.role === "owner")?.userId`), либо ВСЁ через hardcoded. Текущая микс-модель — источник субтильных багов.

2. **NEW_GUEST_USERS как mutable global.** Используется одновременно как «список default-гостей» (config.ts:74-78), «список приглашённых через approve» (push в callback.ts:354), и «sticky cache незнакомых ID» (push в config.ts:1020). Три разных смысла в одной переменной. Лучше разделить: `BUILTIN_GUESTS` (read-only), `RUNTIME_GUESTS` (mutable Set).

3. **Subscription gate не входит в invite path.** Юзер может получить approve без подписки на канал. Если требование подписки — продуктовое (а не security), нужно решить, проверять ли её до approve.

4. **users.json — single source of truth для прод-userов**, но fallback'и в config.ts (env + hardcoded array) могут расходиться с registry. Стоит снять fallback в prod (env пустой → пустой Set → только registry).

5. **Audit log не покрывает auth-decisions.** Это первое, что смотрят при расследовании инцидента. Все unauthorized/refused branches должны логироваться.
