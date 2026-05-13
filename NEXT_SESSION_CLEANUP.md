# ТЗ для следующей сессии: чистка промптов, parallel cwd, лимиты, миграция CLAUDE.md

> Этот файл — ТЗ. Прочти его целиком, потом начинай работу. После каждого блока — атомарный коммит с понятным сообщением. Деплой — только когда явно подтвердят.

## Контекст

Что было сделано в предыдущем коммите `be46bdc`:
- `recordUsage` закрыт во всех ветках выхода из session.ts (ask-user break, stop-interrupt, finally).
- Подключён `mcp__parallel__run` — MCP добавлен в `mcp-config.example.ts` и раскомментирован там же.
- В гостевой промпт добавлен блок «отвечай простым языком», правила DeepSeek-ограничений, инструкция про `vault/inbox`.
- Оркестрационные блоки (анонс плана, параллельные агенты) добавлены в оба промпта — owner и guest.

Что **не** было сделано и что делаем сейчас:
- Промпты местами противоречат сами себе (Bash vs mcp__container__Bash, WebSearch заблокирован но обещан).
- `parallel_mcp/server.ts` не знает о vault гостя — все подзадачи запускаются в чужом cwd.
- Лимиты запросов стоят с ног на голову: гости без лимита, owner с лимитом.
- Существующие гости имеют устаревший `CLAUDE.md` в vault — нет механизма обновления.

Прод-сервер: `proboi-bot` `89.167.125.175` (@proboiAI_bot). Тестовой площадки сейчас нет. **Деплой только с явного «ок, деплоим» от владельца.**

Ключевые файлы:
- [CLAUDE.md](CLAUDE.md) — архитектура и деплой, читай перед правками.
- [memory/project_knowledge_graph.md](memory/project_knowledge_graph.md) — текущее состояние, задачи, риски.

---

## Блок 1 — Промпты: расхождения между обещанием и реальностью (HIGH)

Все правки в `src/config.ts`. Перед началом перечитай функции `buildNewGuestSafetyPrompt` (строка 507) и `buildOwnerSafetyPrompt` (строка 377) целиком.

### P-H1. Bash обещан гостям, но для них это mcp__container__Bash

**Файл:** [`src/config.ts:552`](src/config.ts#L552)

**Текущий код:**
```
- Bash — выполнить команду в терминале (pip install, curl, python, node, и т.д.)
```

**Проблема:** Контейнер включён для всех гостей по умолчанию (`containerEnabled: node?.containerEnabled ?? true`, строка 1005). Для них реальный `Bash` добавляется в `disallowedTools` в `session.ts`. Доступен только `mcp__container__Bash`. Но промпт врёт, что есть просто `Bash`.

**Фикс:** В строке 552 заменить на:
```
- mcp__container__Bash — выполнить команду в твоём изолированном контейнере (pip install, curl, python, node, git, apt-get — всё работает)
```

И убрать ссылку на просто `Bash` из секции «ВЫПОЛНЕНИЕ КОДА» (строка 636) — там написано `Bash: python3 ...`. Заменить `Bash:` на `mcp__container__Bash:` (или просто «выполни команду:» если не хочется хардкодить имя инструмента в тексте).

---

### P-H2. WebSearch обещан гостям, но заблокирован

**Файл:** [`src/config.ts:555`](src/config.ts#L555)

**Текущий код:**
```
- WebSearch / WebFetch — поиск в интернете
```

**Проблема:** `disallowedTools: ["WebSearch"]` стоит у всех гостей (строка 1009). Строка 674 в том же промпте правильно говорит «WebSearch НЕДОСТУПЕН», но строка 555 его обещает — противоречие в одном тексте.

**Фикс:** Строка 555:
```
- WebFetch — загрузить страницу или API по конкретному URL (WebSearch недоступен — используй curl через mcp__container__Bash или WebFetch на duckduckgo)
```

---

### P-H3. Owner-промпт обещает WebSearch, но owner тоже на DeepSeek

**Файл:** [`src/config.ts:404`](src/config.ts#L404)

**Текущий код:**
```
- WebFetch and WebSearch — full internet access, no caveats
```

**Проблема:** Когда owner на DeepSeek (`ownerModel.startsWith("deepseek-")`), у него тоже стоит `ownerDisallowedTools = ["WebSearch"]` (строка 1046). Но `buildOwnerSafetyPrompt` вызывается один раз без учёта модели: `const OWNER_SAFETY_PROMPT = buildOwnerSafetyPrompt(OWNER_ALLOWED_PATHS)` (строка 905).

**Фикс:**
1. Изменить сигнатуру: `function buildOwnerSafetyPrompt(allowedPaths: string[], isDeepSeek: boolean = false)`.
2. Внутри функции, вместо жёстко зашитой строки 404, сделать условно:
   ```ts
   const webCaps = isDeepSeek
     ? "- WebFetch — full internet access (WebSearch unavailable on DeepSeek endpoint — use curl in Bash instead)"
     : "- WebFetch and WebSearch — full internet access, no caveats";
   ```
3. Строку 905 (`const OWNER_SAFETY_PROMPT = buildOwnerSafetyPrompt(OWNER_ALLOWED_PATHS)`) пересчитать лениво или перенести внутрь `getUserProfile()` чтобы знать `ownerDeepseekEnv`. Самый чистый вариант: убрать константу `OWNER_SAFETY_PROMPT`, вычислять промпт прямо в `getUserProfile` — там уже знаем `ownerDeepseekEnv` к строке 1066:
   ```ts
   systemPrompt: buildOwnerSafetyPrompt(OWNER_ALLOWED_PATHS, !!ownerDeepseekEnv),
   ```

**Проверь сам:** Убедись что строка 905 и вызов в строке 1066 (`systemPrompt: OWNER_SAFETY_PROMPT`) правильно связаны — возможно надо просто передать флаг и пересчитывать в `getUserProfile`. Логика там уже есть.

---

### P-H4. Хардкод /opt/claude-tg-bot/workspace/ в owner-промпте

**Файл:** [`src/config.ts:414-418`](src/config.ts#L414)

**Текущий код:**
```
- Python code: ALWAYS Write to a file at /opt/claude-tg-bot/workspace/<name>.py, then Bash: python3 /opt/claude-tg-bot/workspace/<name>.py.
  ...
  · quick: python3 -m pip install --break-system-packages <package>
  · clean: python3 -m venv /opt/claude-tg-bot/workspace/venv && /opt/claude-tg-bot/workspace/venv/bin/pip install <package>
```

И строка 422:
```
- Photos and documents are saved to /tmp/telegram-bot/ (names like photo-<id>.jpg, document-<id>.<ext>).
- To copy to workspace: cp /tmp/telegram-bot/photo-XXXX.jpg /opt/claude-tg-bot/workspace/
```

**Проблема:** Функция `buildOwnerSafetyPrompt` принимает `allowedPaths: string[]` (строка 377). Но пути в теле функции захардкожены, не используют параметр.

**Фикс:** Заменить все `'/opt/claude-tg-bot/workspace/'` внутри функции на `${allowedPaths[0] || "/opt/claude-tg-bot/workspace/"}`. Это даст корректный путь на любой машине если `CLAUDE_WORKING_DIR` настроен иначе.

---

### P-H5. mcp__connect-google обещан гостям, но не инжектируется в их MCP-список

**Файл:** [`src/config.ts:560`](src/config.ts#L560) и [`src/mcp-filter.ts`](src/mcp-filter.ts)

**Текущий код в промпте (строка 560):**
```
- mcp__connect-google__connect — подключить Google-аккаунт пользователя через OAuth (вызывай сам, когда просят)
```

**Текущий код в mcp-filter.ts:** функция `mcpServersForProfile` инжектирует `google-workspace` и `container` для гостей, но не `connect-google` (строки 33-50 mcp-filter.ts).

**Проблема:** Если `connect-google` не попадает в список MCP гостя — инструмент `mcp__connect-google__connect` недоступен. Модель будет его вызывать и получать ошибку «tool not found».

**Что нужно проверить перед правкой:**
1. В `mcp-config.example.ts` строка 44-49: `connect-google` закомментирован. **Раскомментирован ли он на проде?** Проверь через пользователя: `ssh root@89.167.125.175 'grep -A3 connect-google /opt/claude-tg-bot/mcp-config.ts'` — сначала спроси разрешения.
2. Если `connect-google` раскомментирован на проде: добавить в `mcp-filter.ts` аналогично google-workspace — он не требует условий, добавляется всем гостям всегда (как `parallel`). Также раскомментировать в `mcp-config.example.ts`.
3. Если не раскомментирован: убрать упоминание `mcp__connect-google__connect` из гостевого промпта (строка 560) до момента когда MCP будет включён. Мёртвые обещания хуже чем честное молчание.
4. В `bootstrapNewGuestDir` строки 197-204: `mcp__connect-google` уже есть в permissions.allow — если MCP включён, права уже настроены.

---

### P-H6. Конфликт двух блоков про путь входящих файлов

**Файл:** [`src/config.ts:642-655`](src/config.ts#L642)

**Проблема:** В гостевом промпте есть ДВА блока, которые противоречат друг другу:

Блок А (строки 642-645, «ГДЕ ЛЕЖАТ ВХОДЯЩИЕ ФАЙЛЫ»):
```
- Фото и документы от пользователя бот складывает в /tmp/telegram-bot/ (имена вида photo-<id>.jpg...)
- Папки inbox в твоём vault НЕТ, если сам не создал.
```

Блок Б (строки 651-655, «МЕДИА»):
```
- Документы, фото, видео → ${vaultDir}/inbox/<имя_файла>
```

**Реальность:** `inboxDirFor(userId)` (строка 1196) для контейнерных гостей возвращает `${vaultDir}/inbox`. А контейнер включён у всех гостей (`containerEnabled ?? true`). Значит файлы всегда идут в vault/inbox, а не в /tmp/telegram-bot.

**Фикс:** Удалить блок А (строки 642-645) целиком. Оставить только блок Б. Если хочешь defensive fallback — оставь строки 642-645 только под условием `!containerEnabled`, но это гипотетический случай которого на проде нет.

**Что НЕ трогать:** `inboxDirFor` (строка 1196) — функция правильная, менять не нужно. `allowedPaths` в гостевом профиле строка 977 `[vaultDir, "/tmp/telegram-bot"]` — оставить, это про доступ к файлам, не про inbox.

---

**Коммит после блока 1:** `fix(prompts): убрать противоречия в списке инструментов и путях входящих файлов`

**Тест блока 1:**
1. `bun run typecheck` — без ошибок.
2. Локально `bun run dev`, гостевое сообщение «запусти ls» — модель должна вызвать `mcp__container__Bash`, не `Bash`.
3. Гостевое «найди что-нибудь в интернете» — модель не должна вызывать WebSearch, использовать WebFetch или curl.
4. Owner на DeepSeek — «найди что-нибудь» — то же самое: только WebFetch/curl.

---

## Блок 2 — parallel MCP: подзадачи в правильной папке (HIGH)

**Файл:** [`parallel_mcp/server.ts`](parallel_mcp/server.ts)

**Симптом:** MCP-сервер стартует один раз. `cwd` для всех подзадач берётся из env `TELEGRAM_PARALLEL_CWD` или `process.cwd()` (строка 98). Все пользователи наследуют один и тот же `cwd` — тот, что был при запуске бота (`/opt/claude-tg-bot/`). Гость просит «создай файл» через parallel — файл падает в корень репо.

**Фикс — вариант A (выбранный):**

Добавить поля `cwd` в схему задачи и на уровень всего вызова:

**Шаг 1.** В `ListToolsRequestSchema` handler, в `inputSchema.properties.tasks.items.properties` добавить:
```ts
cwd: {
  type: "string",
  description: "Рабочая директория для этой подзадачи. Если не указана — используется общий cwd из родительского поля или TELEGRAM_PARALLEL_CWD.",
}
```

И в `inputSchema.properties` добавить поле верхнего уровня:
```ts
cwd: {
  type: "string",
  description: "Общий cwd для всех подзадач (если не указан в каждой задаче отдельно). Передай ${vaultDir} для гостя чтобы подзадачи писали файлы в правильное место.",
}
```

**Шаг 2.** В `CallToolRequestSchema` handler, изменить тип `args`:
```ts
const args = request.params.arguments as {
  tasks?: Array<{ name: string; prompt: string; cwd?: string }>;
  cwd?: string;
};
```

**Шаг 3.** Перед запуском задач:
```ts
const rootCwd = args.cwd || process.env.TELEGRAM_PARALLEL_CWD || process.cwd();
```

**Шаг 4.** В `tasks.map(...)`, при создании `queryInstance`:
```ts
cwd: task.cwd ?? rootCwd,
```

То есть полный приоритет: `task.cwd` → `args.cwd` (общий для всего вызова) → `TELEGRAM_PARALLEL_CWD` → `process.cwd()`.

**Шаг 5.** Обновить пример в промпте (строки 612-619 гостевого промпта в `config.ts`). Добавить `cwd` в пример:
```
tasks = [
  { name: "cafe_1", prompt: "...", cwd: "${vaultDir}" },
  ...
]
```
Или — лучше — добавить `cwd: "${vaultDir}"` на уровень всего вызова:
```
mcp__parallel__run({ cwd: "${vaultDir}", tasks: [...] })
```

Аналогично добавить в owner-промпт (строки 498-502 в `config.ts`): указать что нужно передавать `cwd` соответствующей рабочей папки.

**Коммит:** `fix(parallel): подзадачи запускаются в cwd вызывающего пользователя`

**Тест блока 2:**
- Гостевое «найди 3 кафе в Краснодаре и сохрани каждое в файл с названием» — через parallel.
- После выполнения проверить: файлы должны лежать в `/opt/vault/<userId>/`, а не в `/opt/claude-tg-bot/`.
- `ls /opt/claude-tg-bot/*.md` — нет левых файлов от подзадач.

---

## Блок 3 — Лимиты запросов с ног на голову (HIGH)

**Файл:** [`src/config.ts`](src/config.ts), функция `getUserProfile`

**Симптом:** 
- Гостям `rateLimitEnabled: node?.rateLimitEnabled ?? false` (строка 992) — по умолчанию **без лимита**.
- Owner `rateLimitEnabled: node?.rateLimitEnabled ?? RATE_LIMIT_ENABLED_DEFAULT` (строка 1067), а `RATE_LIMIT_ENABLED_DEFAULT` из env, по умолчанию `true` (строка 877) — **owner по умолчанию с лимитом**.

Это ровно наоборот тому что нужно: гости тратят деньги владельца, их надо ограничивать. Owner сам себя ограничивать смысла нет.

**Фикс:**

1. Строка 992 (гостевая ветка):
   ```ts
   // было:
   rateLimitEnabled: node?.rateLimitEnabled ?? false,
   // стало:
   rateLimitEnabled: node?.rateLimitEnabled ?? true,
   ```

2. Строка 1067 (owner-ветка):
   ```ts
   // было:
   rateLimitEnabled: node?.rateLimitEnabled ?? RATE_LIMIT_ENABLED_DEFAULT,
   // стало:
   rateLimitEnabled: node?.rateLimitEnabled ?? false,
   ```

3. Значения по умолчанию для гостей — те же `RATE_LIMIT_REQUESTS_DEFAULT = 20` и `RATE_LIMIT_WINDOW_DEFAULT = 60` (20 запросов в минуту). Разумно. Если захочешь отдельные переменные для гостей — можно потом добавить `GUEST_RATE_LIMIT_REQUESTS`/`GUEST_RATE_LIMIT_WINDOW`, сейчас MVP.

4. Сообщение при срабатывании лимита сейчас на английском и техническое (строка 255 в `src/handlers/text.ts`):
   ```ts
   await ctx.reply(`⏳ Rate limited. Please wait ${retryAfter!.toFixed(1)} seconds.`);
   ```
   Заменить на человеческое русское:
   ```ts
   const waitSec = Math.ceil(retryAfter!);
   await ctx.reply(`⏳ Слишком много запросов подряд. Подожди ${waitSec} сек и попробуй снова.`);
   ```

**Коммит:** `fix(rate-limit): гости получают лимит запросов по умолчанию, owner — без лимита`

**Тест блока 3:**
- Гостем отправить 21 сообщение подряд быстро — на 21-м должна прийти нормальное сообщение на русском с количеством секунд ожидания.
- Owner отправить 21 сообщение — не должно лимитировать.
- Проверить что у конкретного гостя можно выставить `rateLimitEnabled: false` в `system/users.json` через поле `node?.rateLimitEnabled` — тогда его освободит от лимита. (Это уже работает через `?? true`, если `node.rateLimitEnabled = false` — будет false.)

---

## Блок 4 — Миграция CLAUDE.md у существующих гостей (MEDIUM)

**Контекст:** `bootstrapNewGuestDir` создаёт `${vaultDir}/CLAUDE.md` при первом заходе гостя через функцию `generateGuestClaudeMd` (строки 173-177 в `config.ts`). Проблема: файл создаётся только если не существует (`if (!existsSync(claudeMd))`). Значит у гостей которые уже давно зарегистрированы — в vault лежит старая версия, и они никогда не получат новый текст при обновлении шаблона.

### Вариант A — Версионирование через маркер (рекомендован на перспективу)

В `generateGuestClaudeMd` (`src/templates/guest-claude-md.ts`) первой строкой ставить:
```
<!-- claude-md-version: 4 -->
<!-- user-edited: false -->
```

В `bootstrapNewGuestDir`:
```ts
if (!existsSync(claudeMd)) {
  // первый раз — создаём
  writeFileSync(claudeMd, generateGuestClaudeMd(userId, vaultDir));
} else {
  // файл есть — проверяем версию
  const existing = readFileSync(claudeMd, "utf8");
  const userEdited = existing.includes("user-edited: true");
  const hasCurrentVersion = existing.includes("claude-md-version: 4");
  if (!hasCurrentVersion && !userEdited) {
    writeFileSync(claudeMd, generateGuestClaudeMd(userId, vaultDir));
    console.log(`Migrated CLAUDE.md for guest ${userId}`);
  } else if (!hasCurrentVersion && userEdited) {
    console.warn(`[bootstrap] Guest ${userId} has manually edited CLAUDE.md — migration skipped`);
  }
}
```

Плюсы: автоматически, без ручного шага. Минусы: перетирает файл без бекапа если пользователь не поставил маркер.

### Вариант B — Скрипт-разовая миграция (рекомендован прямо сейчас)

Создать `scripts/migrate-guest-claude-md.ts`:
```ts
#!/usr/bin/env bun
import { readdirSync, readFileSync, writeFileSync, existsSync, copyFileSync } from "fs";
import { generateGuestClaudeMd } from "../src/templates/guest-claude-md";

const VAULT_ROOT = "/opt/vault";
const DRY_RUN = process.argv.includes("--dry-run");

const dirs = readdirSync(VAULT_ROOT);
for (const dir of dirs) {
  const userId = parseInt(dir, 10);
  if (isNaN(userId)) continue;
  const claudeMd = `${VAULT_ROOT}/${userId}/CLAUDE.md`;
  if (!existsSync(claudeMd)) continue;
  
  const backupPath = `${claudeMd}.bak.${new Date().toISOString().split("T")[0]}`;
  if (!DRY_RUN) {
    copyFileSync(claudeMd, backupPath);
    writeFileSync(claudeMd, generateGuestClaudeMd(userId, `${VAULT_ROOT}/${userId}`));
    console.log(`Migrated ${userId} (backup: ${backupPath})`);
  } else {
    console.log(`Would migrate ${userId}`);
  }
}
```

Запуск: `bun run scripts/migrate-guest-claude-md.ts --dry-run` (посмотреть) → `bun run scripts/migrate-guest-claude-md.ts` (применить).

**Рекомендация:** сделать **вариант B** сейчас (гостей мало, скрипт простой), запустить на проде вручную после деплоя. Вариант A — при росте до 10+ гостей.

**Коммит:** `feat(migration): скрипт обновления CLAUDE.md для существующих гостей`

---

## Блок 5 — Чек-лист перед деплоем

После всех правок выполни по порядку:

| Что делаем | Ожидаемый результат |
|---|---|
| `bun run typecheck` | 0 ошибок |
| `bun run dev` + гостем «запусти ls в моей папке» | Вызывается `mcp__container__Bash`, не `Bash`; выводит содержимое vault |
| Гостем «найди 3 кафе в Краснодаре, сохрани каждое в файл» | `mcp__parallel__run` с `cwd: vaultDir`; файлы появляются в `/opt/vault/<id>/`, не в `/opt/claude-tg-bot/` |
| Гостем отправить фото → «что на фото?» | Модель ищет файл в `vault/inbox/`, не в `/tmp/telegram-bot/`; получает текстовое описание из контекста (Gemini уже обработал) |
| Гостем 21 сообщение подряд | На 21-м: «⏳ Слишком много запросов подряд. Подожди N сек» |
| Owner «найди что-нибудь в интернете» (если owner на DeepSeek) | Модель использует WebFetch или curl, не WebSearch |
| Owner: отправить `/stop` во время генерации | После прерывания в `metering.sqlite` должна быть запись токенов (M-H2 из предыдущего FIXES.md уже закрыт в `be46bdc` — проверь что реально записалось) |
| Локально: `sqlite3 metering.sqlite "SELECT * FROM usage ORDER BY id DESC LIMIT 5;"` | Есть свежие записи после тестов |
| На проде: вручную добавить `mcp-config.ts` через rsync или scp (он gitignored) | Бот поднимается с `parallel` MCP в списке; в логах `Loaded N MCP servers` |

---

## Деплой

**Не запускать самому — только после явного «давай деплоим» от владельца.**

```bash
# Сначала rsync (без .env — у сервера свой токен)
rsync -az --exclude node_modules --exclude .git --exclude .env ./ root@89.167.125.175:/opt/claude-tg-bot/

# Потом на сервере
ssh root@89.167.125.175 'cd /opt/claude-tg-bot && bun install && systemctl restart claude-tg-bot'
```

После `bun install` — **обязательно** musl/glibc swap (иначе каждый запрос будет падать молча):
```bash
ssh root@89.167.125.175 'ls /root/.local/share/claude/versions/'
# возьми актуальную версию из вывода выше, подставь вместо 2.1.126
ssh root@89.167.125.175 'cp /root/.local/share/claude/versions/2.1.126 \
  /opt/claude-tg-bot/node_modules/@anthropic-ai/claude-agent-sdk-linux-x64-musl/claude && \
  chmod +x /opt/claude-tg-bot/node_modules/@anthropic-ai/claude-agent-sdk-linux-x64-musl/claude && \
  systemctl restart claude-tg-bot'
```

`mcp-config.ts` gitignored — он НЕ прилетит через rsync. Если конфиг на проде уже настроен — не трогать. Если нужно обновить — сначала посмотреть что там есть, потом добавить только новые блоки.

После деплоя — запустить скрипт миграции CLAUDE.md (если делали вариант B):
```bash
ssh root@89.167.125.175 'cd /opt/claude-tg-bot && bun run scripts/migrate-guest-claude-md.ts --dry-run'
# убедиться что список правильный
ssh root@89.167.125.175 'cd /opt/claude-tg-bot && bun run scripts/migrate-guest-claude-md.ts'
```

---

## Что НЕ делать в этой сессии

- **НЕ трогать онбординг** (`buildOnboardingPrompt`, `onboardingComplete` в profile, логику в text.ts) — владелец считает что сделано добротно, оставить как есть.
- **НЕ деплоить** без явного «давай деплоим» от владельца — прод живой.
- **НЕ менять движки, модели, метеринг** — это уже сделано в `be46bdc`.
- **НЕ переписывать «Анонс плана» блоки** в отдельную константу — косметика, не блокер.
- **НЕ трогать лендинг и дашборд** (`src/templates/landing.ts`, `src/dashboard-server.ts`) — отдельная тема.
- **НЕ рефакторить группу** (`buildGroupSystemPrompt`) — там свои настройки, не смешивать с гостевыми правками.
- **НЕ делать вариант A миграции CLAUDE.md** прямо сейчас — только скрипт B. Вариант A при следующем большом рефакторинге промптов.

---

## Финальный отчёт после сессии

После коммитов сообщи владельцу:
1. Что починено (P-H1..P-H6, parallel cwd, rate-limit переворот, скрипт миграции).
2. Что нужно подтверждение перед правкой: P-H5 (connect-google) — активен ли MCP на проде?
3. Обновить [memory/project_knowledge_graph.md](memory/project_knowledge_graph.md) — закрыть пункты про промпт-противоречия и rate-limit инверсию.
