# Zone 7 — Engines + Vision pipeline

## Summary

Проверены: `src/engines/openrouter.ts`, `src/engines/deepseek-fast.ts`, `src/engines/yukassa.ts`, а также relevantnye блоки `src/session.ts` (vision dispatch, engine selection) и `src/config.ts` (profile fields). Найдено 2 высоких, 4 средних, 3 низких находки. Критических (data leak, broken core feature) нет.

---

## Findings (таблица)

| # | Severity | Категория | Файл:строки | Суть |
|---|----------|-----------|------------|------|
| F1 | **HIGH** | Cost blowout / silent $0 | `metering.ts:63-79`, `config.ts:1044-1048` | Модели `deepseek/deepseek-v4-flash` и `deepseek/deepseek-r1` (OpenRouter-prefixed names) отсутствуют в `PRICING_PER_1M`. `computeCost()` возвращает 0 → бесплатный учёт для текстового fallback гостей без DeepSeek-ключа |
| F2 | **HIGH** | Double-timeout / abort race | `session.ts:581-597`, `openrouter.ts:557` | Для vision вызова существуют два независимых таймаута в 90 s: внешний `visionTimeout` в `sendMessageStreaming` и внутренний `AbortSignal.timeout(90_000)` в `openRouterRequest`. Сигналы объединены через `AbortSignal.any`, поэтому реальный таймаут — 90 s (первый сработавший), но логика запутана и может привести к двойному cancel reader'а |
| F3 | **MEDIUM** | Missing metering для vision (owner) | `session.ts:567-603` | Когда owner отправляет фото, ветка `mediaHint && OPENROUTER_API_KEY` выходит через `return` без вызова `recordUsage()`. `queryOpenRouter()` сам вызывает `recordUsage` внутри — но только если `totalPromptTokens > 0`. Если OpenRouter не вернул usage-поле (редкие модели/streaming edge) — cost вообще не логируется |
| F4 | **MEDIUM** | Prompt injection via prompt field в `generate_image` | `openrouter.ts:433-434` | `args.prompt` передаётся напрямую в `encodeURIComponent` и вставляется в URL без sanitization. Pollinations возвращает публичный PNG по этому URL. Это не RCE и не утечка хоста, но злоумышленник может сгенерировать контент с произвольным текстом. Нет ограничения длины промпта |
| F5 | **MEDIUM** | `buildMultipartContent` returns `text` if only 1 image loaded | `openrouter.ts:124` | `return parts.length > 1 ? parts : text` — если файл изображения прочитан (1 image part) и нет текстовой части (captionText пуст + fallback пустой), `parts` содержит только 1 элемент → функция возвращает исходный `text` (путь к файлу) вместо multipart. **В реальном коде это не происходит** — `textContent = captionText || "Что на изображении?"` гарантирует хотя бы 1 text part (итого 2), но логика хрупкая и зависит от дефолта |
| F6 | **MEDIUM** | Text fallback для гостя без DeepSeek использует `visionModel` | `session.ts:637-639` | Когда у нового гостя нет `deepseekApiKey` и он посылает **текстовое** сообщение (mediaHint=false), код всё равно вызывает `queryOpenRouter` с `this.profile.visionModel || "google/gemini-2.5-flash"`. Gemini Flash — vision-модель, не дешёвый text-only вариант. Для чистого текста правильнее `deepseek/deepseek-v4-flash` |
| F7 | **LOW** | `getNewGuestOpenRouterKey` читает файл без кэша | `config.ts:92-101` | Каждый вызов делает `readFileSync`. При нескольких параллельных сообщениях от одного пользователя — N disk reads за один запрос |
| F8 | **LOW** | Нет retry для 429/503 | `openrouter.ts:574-577` | При HTTP 429 или 5xx сразу `throw`. Без retry нет защиты от транзиентных ошибок OpenRouter; пользователь получает пустой ответ или ошибку |
| F9 | **LOW** | Hardcoded default prompt «Что на изображении?» | `openrouter.ts:121` | Если пользователь пишет по-английски и не даёт caption — Gemini получает русский вопрос. Ответ может быть на русском. Незначительная UX проблема |

---

## Detailed findings (с конкретным fix)

### F1 — Missing prices for OpenRouter-prefixed DeepSeek models (HIGH)

**Где:** `src/config.ts:1044-1048` выставляет `model = "deepseek/deepseek-v4-flash"` и `complexModel = "deepseek/deepseek-r1"` когда нет DeepSeek API key. Эти строки передаются в `recordUsage({ model })` → `metering.ts:computeCost()` ищет их в `PRICING_PER_1M` → не находит → возвращает 0.

**Fix:** добавить в `PRICING_PER_1M`:
```ts
"deepseek/deepseek-v4-flash": { input: 0.07, output: 0.28 }, // OpenRouter prices as of 2026-05
"deepseek/deepseek-r1":       { input: 0.55, output: 2.19 },
```
Цены уточнить по https://openrouter.ai/models.

---

### F2 — Double-timeout + abort race (HIGH)

**Где:** `session.ts:581-582` создаёт `visionAbort` + `setTimeout(90_000)`. `openrouter.ts:557` создаёт собственный `AbortSignal.timeout(90_000)`. `openRouterRequest` объединяет оба через `AbortSignal.any([abortSignal, timeoutSignal])`.

**Эффект:** при срабатывании внешнего `visionTimeout` → `visionAbort.abort()` → reader уже отменён через `onAbort`. Параллельно истекает внутренний сигнал → попытка второго cancel. Bun reader.cancel() идемпотентен, поэтому краша нет, но логика дублирования избыточна и затрудняет отладку.

**Fix:** убрать внешний `visionTimeout` в `session.ts` — `openRouterRequest` уже обрабатывает 90-секундный таймаут внутри. Если нужен внешний abort (например, `/stop` от пользователя) — передавать только `this.abortController.signal`.

---

### F3 — Vision меtering не вызывается при usage=0 (MEDIUM)

**Где:** `openrouter.ts:793-808`. `queryOpenRouter` вызывает `recordUsage` только если `totalPromptTokens > 0 || totalCompletionTokens > 0`. Если OpenRouter streaming не вернул `usage` chunk — cost $0 и запись в SQLite не создаётся (warn в console, но данные теряются).

**Fix:** всегда вызывать `recordUsage` с нулями если usage отсутствует, чтобы зафиксировать сам факт запроса:
```ts
recordUsage({
  userId: profile.userId,
  source: "bot-openrouter",
  model,
  inputTokens: totalPromptTokens,
  outputTokens: totalCompletionTokens,
});
if (totalPromptTokens === 0 && totalCompletionTokens === 0) {
  console.warn(`[metering] OpenRouter usage missing for ${model} (user ${profile.userId})`);
}
```

---

### F4 — generate_image prompt без length limit (MEDIUM)

**Где:** `openrouter.ts:427-447`. `args.prompt` приходит от модели (DeepSeek/Gemini), может быть длинным. `encodeURIComponent(prompt)` вставляется в GET URL — некоторые серверы/CDN обрезают URL > 2048 символов.

**Fix:** добавить `const safePrompt = prompt.slice(0, 500);` перед `encodeURIComponent`.

---

### F5 — buildMultipartContent хрупкий guard (MEDIUM)

**Где:** `openrouter.ts:124`. Условие `parts.length > 1` — неочевидная инварiant-зависимость от дефолта «Что на изображении?».

**Fix:** изменить guard на явный: `return parts.length > 0 ? parts : text;` и добавить комментарий.

---

### F6 — Text fallback гостя использует vision model (MEDIUM)

**Где:** `session.ts:637-639`. `visionModel || "google/gemini-2.5-flash"` применяется для text-only fallback.

**Fix:** использовать `this.profile.model` (уже содержит `deepseek/deepseek-v4-flash` или другой text model) вместо `visionModel` в блоке без deepseekKey.

---

### F7-F9 — Low severity (без отдельных fix-блоков)

- **F7** (`config.ts:92-101`): добавить кэш в `getNewGuestOpenRouterKey` (Map<userId, string>), инвалидировать при approve.
- **F8** (`openrouter.ts:574`): добавить retry с exponential backoff для 429/503 (max 2 retries, 1s/2s).
- **F9** (`openrouter.ts:121`): заменить хардкод на `"What is in the image?"` или определять язык из профиля.

---

## Что в порядке

1. **Base64 encoding** корректен: `readFileSync` → `toString("base64")` → `data:${mime};base64,...` — стандартный формат для OpenRouter vision.
2. **MIME type map** покрывает jpg/jpeg/png/gif/webp — все форматы, которые Telegram отдаёт.
3. **System prompt** передаётся в OpenRouter как первое `messages[0]` с `role: "system"` — гостевой safety prompt попадает туда же.
4. **DeepSeek WebSearch блокировка** правильно реализована через `disallowedTools: ["WebSearch"]` в profile (`config.ts:1085`) — блок применяется на уровне SDK, не OpenRouter.
5. **Anti-loop protection** в `queryOpenRouter` (seenToolCalls Set) — корректно детектит повторные вызовы одного tool с теми же аргументами.
6. **`isPathAllowedFor` в send_file** (`openrouter.ts:402`) — правильно проверяет allowedPaths гостя, включает `TEMP_PATHS` (`/tmp/openrouter_images/`).
7. **`execFileSync` в create_excel** (`openrouter.ts:500`) — no-shell, аргументы не интерполируются — безопасно.
8. **`getNewGuestOpenRouterKey` не fallback** на глобальный ключ (`config.ts:98-100`) — правильно: незарегистрированный гость не тратит shared OPENROUTER_API_KEY.
9. **Streaming реализован** через SSE reader в `openRouterRequest` с throttling `STREAMING_THROTTLE_MS` — корректно.
10. **Abort signal propagation** через `AbortSignal.any` в `openRouterRequest` — reader корректно отменяется через `onAbort` listener в `finally` блоке.

---

## Архитектурные замечания

1. **Dual-purpose `visionModel` field** в профиле используется и для vision (photo), и как text-fallback model для гостей без DeepSeek key (session.ts:639). Это семантически неверно — поле должно называться `fallbackOpenRouterModel` или разделиться на два.

2. **`queryOpenRouter` вызывается без `abortSignal`** в блоке text-fallback (session.ts:637-646) — нет внешнего abort при `/stop`. Добавить `this.abortController?.signal`.

3. **Pricing table в metering.ts хардкод** — при добавлении новых моделей нужно помнить обновить его вручную. Рассмотреть вариант с загрузкой цен из конфига или env.

4. **Vision metering attribution** — запись идёт с `source: "bot-openrouter"` и `model: "google/gemini-2.5-flash"`. Если owner отправляет фото — стоимость записана как OpenRouter, но owner платит за OPENROUTER_API_KEY из общего env. Для правильного split-billing по источнику — норм.
