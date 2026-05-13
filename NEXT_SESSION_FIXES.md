# Промпт для следующей сессии: фикс багов метеринга и промптов

> Этот файл — ТЗ. Прочти его целиком, потом начинай работу. После каждого фикса — атомарный коммит с понятным сообщением. Деплой — только когда явно подтвердят.

## Контекст

Проект `claude-tg-bot` — Telegram-бот, оборачивает Claude Agent SDK. Пользователи: owner (Евгений, id 292228713) и гости. Гости работают на DeepSeek в Docker-контейнере с vault'ом `/opt/vault/{userId}/`.

Прод-сервер: `proboi-bot` (89.167.125.175, @proboiAI_bot). Тестовая площадка временно отсутствует — деплой не делать без явного подтверждения.

Полная архитектура — в [CLAUDE.md](CLAUDE.md). Текущее состояние графа знаний — в [memory/project_knowledge_graph.md](memory/project_knowledge_graph.md).

## Что фиксим и в каком порядке

**Сначала метеринг** (систематическая потеря токенов, бьёт по биллингу), потом промпты (UX гостя). В каждом блоке — атомарный коммит.

---

## Блок 1 — Метеринг (HIGH приоритет)

### M-H1. ask-user тур не пишет recordUsage

**Файл:** [src/session.ts:680-681](src/session.ts#L680)

**Симптом:** когда модель вызывает `mcp__ask-user`, цикл `for await` ломается через `break` ДО события `event.type === "result"`. Ветка с `recordUsage` (строки 703-711) не выполняется. Все интерактивные туры с кнопками — 0 в счётчике.

**Фикс:**
- Ввести флаг `let usageRecorded = false;` в начале цикла.
- В блоке `if (event.type === "result")` сначала `recordUsage(...)`, потом `usageRecorded = true`.
- Перед `break` при `askUserTriggered` (и в любом другом раннем выходе): если `lastUsage` уже был получен из промежуточного события и `!usageRecorded` — записать.
- Альтернатива покруглее: вынести `recordUsage` в `finally`-блок (строки 733-742) с проверкой `lastUsage !== null && !usageRecorded`.

Проверь, что SDK действительно отдаёт `usage` в промежуточных событиях `assistant` (а не только в финальном `result`). Если только в финальном — токены за ask-user объективно недоступны на момент `break`, тогда фикс не возможен через recordUsage; в таком случае обнови комментарий в коде, что эти туры не метерятся by design, и не делай молчаливую заглушку.

### M-H2. stopRequested break теряет токены

**Файл:** [src/session.ts:478-480](src/session.ts#L478)

**Симптом:** при `/stop` или прерывании новым сообщением (`markInterrupt`) цикл выходит до `result`-события. Токены частичной генерации не учитываются.

**Фикс:** та же логика что в M-H1 — единый `usageRecorded`-флаг + запись в `finally` или непосредственно перед `break`. Делай ОДНИМ фиксом с M-H1 — это симметричные ветки.

### M-H3. Анализатор памяти вообще без recordUsage

**Файл:** [src/memory/analyzer.ts:131](src/memory/analyzer.ts#L131)

**Симптом:** `analyzeSession` вызывает SDK `query()` каждые 6 ходов (см. [session.ts:780](src/session.ts#L780)) и при `/new` ([session.ts:803](src/session.ts#L803)). Использует `profile.lightModel ?? "claude-haiku-4-5"` или `deepseek-chat` для гостей. Ни один токен не учтён.

**Фикс:**
- В цикле `for await (const event of query(...))` добавить обработку `event.type === "result"`: вычислить `inputTokens`, `outputTokens`, `model`, `source` и вызвать `recordUsage`.
- `userId` и `model` нужно передать из вызывающего кода (если их там нет — расширить сигнатуру `analyzeSession`).
- Source: тот же что в основной сессии (`bot-anthropic` или `bot-deepseek` по `profile.deepseekEnv`).

### M-M1. (понижено в LOW) Модель из профиля, а не из ответа SDK

**Файл:** [src/session.ts:700-711](src/session.ts#L700)

**Контекст:** у пользователей нет способа переключить модель — гости жёстко на DeepSeek, owner на `CLAUDE_MODEL` из env (меняется только рестартом). Никакой команды `/model` в боте нет, `profile.model` всегда соответствует выбранной модели.

**Когда это всё-таки баг:** silent fallback внутри SDK при перегрузке Anthropic, или несоответствие имени между профилем (`deepseek-chat`) и тем что DeepSeek реально вернёт в response. Цена может посчитаться не по той строке прайс-листа.

**Фикс (если время будет, не блокер):** если `event.model` присутствует в `result`-событии и отличается от `profile.model` — использовать `event.model` + лог `[metering] model mismatch profile=X vs event=Y`. Так заодно увидим реальные случаи расхождения, прежде чем считать это багом.

### M-M2. OpenRouter тихий пропуск usage

**Файл:** [src/engines/openrouter.ts:765](src/engines/openrouter.ts#L765)

**Фикс:** перед `if (totalPromptTokens > 0 || ...)` добавить:
```ts
if (totalPromptTokens === 0 && totalCompletionTokens === 0) {
  console.warn(`[metering] OpenRouter usage missing for ${model} (user ${userId})`);
}
```
Запись в БД по-прежнему пропускаем (нечего писать), но в логах видно факт пропуска.

### M-M3. claude-haiku-4-5 отсутствует в прайсах

**Файл:** [src/metering.ts:56-72](src/metering.ts#L56)

**Фикс:** добавить в `PRICING_PER_1M` запись `"claude-haiku-4-5"` с актуальными ценами Anthropic (Haiku 4.5: $1.00/$5.00 за 1M input/output на момент январь 2026 — проверь актуальные через WebFetch на https://www.anthropic.com/pricing перед коммитом). Без этого все вызовы анализатора памяти при owner-сессии = $0.00.

**Тест Блока 1:**
1. `bun run typecheck` — должен пройти чисто.
2. Локальный smoke: `bun run dev`, послать обычное сообщение → проверить что в `metering.sqlite` появилась запись (sqlite3 + SELECT).
3. Симулировать ask-user (модель должна сама вызвать mcp__ask-user) → проверить что запись таки есть.
4. Симулировать `/new` → проверить запись с моделью haiku/deepseek и source соответствующим.

**Коммит:** `fix(metering): закрыть пропуски recordUsage в ask-user, stop, анализаторе`

---

## Блок 2 — Промпты (CRITICAL → HIGH)

Все правки в [src/config.ts](src/config.ts). Перед началом перечитай функции `buildNewGuestSafetyPrompt`, `buildOwnerSafetyPrompt`, `buildOnboardingPrompt` целиком — они длинные.

### P-C1. Онбординг-промпт мёртвый

**Симптом:** `buildOnboardingPrompt` определена ([config.ts:727](src/config.ts#L727)) но в [src/handlers/text.ts](src/handlers/text.ts) не вызывается, маркер `[ONBOARDING_COMPLETE]` нигде не стрипается. CLAUDE.md обещает поведение, которого нет.

**Решение — выбрать один путь и сделать:**

**Вариант A (восстановить онбординг):** в `text.ts` после получения профиля проверять `profile.onboardingComplete === false` и подставлять `buildOnboardingPrompt(userId, vaultDir)` в `systemPromptOverride`. После ответа проверить наличие `[ONBOARDING_COMPLETE]`, срезать его, вызвать `markOnboardingComplete(userId)` из `src/user-registry.ts`.

**Вариант B (удалить мёртвый код):** убрать `buildOnboardingPrompt` из `config.ts`, поле `onboardingComplete` из `UserProfile`/users.json, упоминания в [CLAUDE.md](CLAUDE.md) (раздел «Onboarding»), упоминания в графе знаний.

**Какой вариант — спроси у пользователя ПЕРЕД кодом.** В памяти отмечено что онбординг был выпилен (коммит `f575052`). Скорее всего правильный вариант — B (удалить), но это поведенческое решение, не техническое.

### P-C2. Два взаимоисключающих блока про путь входящих файлов

**Файл:** [src/config.ts](src/config.ts), функция `buildNewGuestSafetyPrompt`.

**Симптом:**
- Строки 642-644: «Фото и документы → `/tmp/telegram-bot/` ... Папки inbox в твоём vault НЕТ, если сам не создал»
- Строки 651-653: «Документы, фото, видео → `${vaultDir}/inbox/<имя_файла>`»

Реальность: `inboxDirFor(userId)` ([config.ts:1184-1188](src/config.ts#L1184)) для контейнерных гостей (по умолчанию `containerEnabled = true`) использует `${vaultDir}/inbox/`. Использует `handleDocument` ([handlers/document.ts:82](src/handlers/document.ts#L82)) и `handlePhoto` ([handlers/photo.ts:40](src/handlers/photo.ts#L40)).

**Фикс:** удалить блок 642-644 целиком (или — если это был fallback для не-контейнерных гостей, чего сейчас нет — переписать как условие). Оставить только секцию «МЕДИА» с `${vaultDir}/inbox/`.

### P-C3. mcp__connect-google обещан, но MCP не активен

**Симптом:** [config.ts:559](src/config.ts#L559) в списке доступных тулзов: `mcp__connect-google__connect`. В [mcp-config.example.ts:45-48](mcp-config.example.ts#L45) сервер закомментирован. В [src/mcp-filter.ts](src/mcp-filter.ts) не инжектируется (только `google-workspace` и `container`).

**Фикс — выясни сначала:**
1. На проде в `mcp-config.ts` (gitignored) `connect-google` РАСКОММЕНТИРОВАН? Если да — добавить в `mcp-config.example.ts` тоже (раскомментировать в шаблоне) и при необходимости — в `mcp-filter.ts` для гостей. Если нет — либо включить, либо убрать упоминание из промпта.
2. Проверка: `ssh root@89.167.125.175 'grep -A3 connect-google /opt/claude-tg-bot/mcp-config.ts'` — спроси разрешения у пользователя перед SSH.

### P-C4. mcp__parallel__run обещан и форсится, но MCP не активен

**Симптом:** [config.ts:557, 604-618](src/config.ts#L557) — обещают `mcp__parallel__run`. [text.ts:301-302](src/handlers/text.ts#L301) — `maybePrependOrchestrationHint` форсирует его при 6 паттернах. [mcp-config.example.ts:24-26](mcp-config.example.ts#L24) — закомментирован. `mcp-filter.ts` — не инжектируется.

**Фикс — та же логика что C3:**
1. Проверь активность `parallel` в проде (через пользователя).
2. Если активен — раскомментировать в `mcp-config.example.ts`, проверить что `bootstrapNewGuestDir` ставит `mcp__parallel` в гостевой `settings.json` permissions.allow ([config.ts:201-205](src/config.ts#L201) — там уже есть `mcp__parallel`, проверь что попадает в активные).
3. Если не активен — убрать из промпта строки 557 и 604-618, отключить `maybePrependOrchestrationHint` (или вообще удалить функцию пока не подключим parallel).

### P-H1. Bash обещан, но заблокирован для контейнерных гостей

**Файл:** [config.ts:551](src/config.ts#L551)

**Симптом:** в списке доступных «`Bash — выполнить команду в терминале`», но `session.ts:375-378` для контейнерных гостей добавляет `Bash` в `disallowedTools`. Параллельно `CONTAINER_BASH_PROMPT` ([session.ts:62-65](src/session.ts#L62)) говорит «используй `mcp__container__Bash`». Противоречие в одном контексте.

**Фикс:** в строке 551 заменить `- Bash — выполнить команду в терминале` на `- mcp__container__Bash — выполнить команду в твоём контейнере (изолированный sandbox с pip/apt/python)`.

### P-H2. WebSearch в списке доступных тулзов гостя

**Файл:** [config.ts:554](src/config.ts#L554)

**Симптом:** `- WebSearch / WebFetch — поиск в интернете`. Но `disallowedTools: ["WebSearch"]` ([config.ts:1006](src/config.ts#L1006)). Строка 672-673 правильно говорит «WebSearch недоступен» — но это в другой секции, противоречие в одном промпте.

**Фикс:** в строке 554 убрать `WebSearch /` — оставить `- WebFetch — загрузить страницу или API по URL`.

### P-H3. Owner на DeepSeek получает обещание WebSearch

**Файл:** [config.ts:404](src/config.ts#L404), функция `buildOwnerSafetyPrompt`.

**Симптом:** «WebFetch and WebSearch — full internet access, no caveats». Но если owner на DeepSeek — `disallowedTools = ["WebSearch"]` ([config.ts:1043](src/config.ts#L1043)). Промпт `buildOwnerSafetyPrompt` всегда одинаков ([config.ts:1055](src/config.ts#L1055)), не учитывает движок.

**Фикс:** расширить сигнатуру `buildOwnerSafetyPrompt(allowedPaths, isDeepSeek)`. Если `isDeepSeek === true` — заменить «WebFetch and WebSearch — full internet» на «WebFetch — full internet access (WebSearch unavailable on DeepSeek)». Проверить call-site в `buildSystemPrompt` (config.ts:1055) и пробросить `profile.deepseekEnv`.

### P-H4. Хардкод /opt/claude-tg-bot/workspace/ в owner-промпте

**Файл:** [config.ts:414-418](src/config.ts#L414)

**Симптом:** примеры Python предполагают `/opt/claude-tg-bot/workspace/<name>.py`, venv путь тот же. Если `CLAUDE_WORKING_DIR` другой — ведёт в неправильную папку.

**Фикс:** заменить хардкод на `${allowedPaths[0] || "/opt/claude-tg-bot/workspace/"}`. Функция уже принимает `allowedPaths` — просто использовать первый элемент в шаблонной строке.

**Тест Блока 2:**
1. `bun run typecheck` — должен пройти.
2. Локально `bun run dev`, послать гостевое сообщение «найди топ-3 кофейни в Краснодаре» → не должно быть ошибки «нет прав на mcp__parallel» (если решили что parallel активен) или модель должна использовать что-то другое (если решили выключить).
3. Послать гостю «открой фото photo.jpg» — модель должна искать в `${vaultDir}/inbox/`, не в `/tmp/telegram-bot/`.
4. Owner на DeepSeek: послать «найди в интернете курс рубля» → модель не должна звать WebSearch.

**Коммит:** `fix(prompts): убрать противоречия и сломанные ссылки на тулзы в guest/owner промптах`

---

## Блок 3 — Опциональные mediums (если время осталось)

### MEDIUM из metering-аудита

- M3 (haiku-4-5 в прайсах) — уже в Блоке 1.

### MEDIUM из prompts-аудита

- **M1** Task в DeepSeek-промптах — заменить упоминание Task в разделе параллельных агентов на `mcp__parallel__run` (если подключим parallel в C4). Если нет — оставить как есть.
- **M2** `mcp__openrouter-image` в гостевом settings.json но фильтрован — убрать из строки 203 (`bootstrapNewGuestDir`).
- **M3** Устаревший комментарий `// or Claude for Ksenia` в [config.ts:69](src/config.ts#L69) и [config.ts:245](src/config.ts#L245).

Делать одним коммитом: `chore(prompts): подчистить устаревшие комментарии и settings`

---

## Что НЕ делать в этой сессии

- НЕ деплоить на прод без явной команды от пользователя — `proboi-bot` живой, юзеры могут быть онлайн.
- НЕ рефакторить fast-path/deepseek-fast — это мёртвый код, можно тронуть отдельной задачей.
- НЕ переписывать четыре copy-paste «Анонс плана» блока в константу (LOW из аудита) — это косметика.
- НЕ вписывать новые правила в CLAUDE.md ради этих фиксов — баги, не фичи.
- НЕ трогать лендинг (`src/templates/landing.ts`, `assets/*`) — отдельная огромная тема.

## Финальный отчёт пользователю

После всех коммитов:
1. Список того что починено (M-H1..M-M3, P-C1..P-H4).
2. Что осталось спорным и нужно подтверждение пользователя (P-C1 вариант A vs B, P-C3/C4 — активны ли MCP на проде).
3. Команды для деплоя (НЕ запускать самому):
   ```bash
   rsync -az --exclude node_modules --exclude .git --exclude .env ./ root@89.167.125.175:/opt/claude-tg-bot/
   ssh root@89.167.125.175 'cd /opt/claude-tg-bot && bun install && systemctl restart claude-tg-bot'
   ```
   Напомнить про musl/glibc swap после `bun install` (см. CLAUDE.md → Production Deployment).
4. Обновить [memory/project_knowledge_graph.md](memory/project_knowledge_graph.md) — закрыть пункты в секции «Известные баги».
