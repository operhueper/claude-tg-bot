# HANDOFF: 2026-05-16 — пакет фиксов по smoke 18 пунктов

> Деплой только на **jinru** (`@ORCH7_bot`, `5.223.82.96`). Прод **@proboiAI_bot** НЕ тронут.

## Что закрыто этим батчем

### Group A — критичные бизнес-блокеры
- **п.17 (401 на f1a7)**: `system/deepseek-blacklist.json` + фильтр в `src/deepseek-key-pool.ts:39-115`. Битый ключ не попадает в пул ни из файла, ни из env. Стартовый ping-чек уже был (fire-and-forget), blacklist гарантирует независимо от порядка старта.
- **п.18 (Профи после отмены)**: фильтр памяти в `src/memory/inject.ts` (regex `подписк|тариф|безлимит|499 ₽|₽/мес|subscription|paid tier|trial period`), плюс правило в `buildPaidGuestPrompt`/`buildFreeTierPrompt`: при вопросе про тариф — отправлять на `/status`, не отвечать из памяти. Regex ужесточён после code-review — больше не ловит «профиль», «базовый уровень», «студийная», «оплатил».

### Group B — memory analyzer
- **TypeError `g.label_index[key]`** и **`patch.upsert_nodes.map`**: null-safe в `src/memory/graph.ts` (`label_index ??= {}`, все iter по полям патча → `?? []`), null-safe в `src/memory/analyzer.ts` (filter/map/return).
- **subprocess code 1**: try/catch на `query()` loop в analyzer — graceful degradation (граф не трогаем при ошибке).
- **Analyzer в фон**: новый `src/memory/analyzer-scheduler.ts` с debounce 10 мин. `session.ts` зовёт `scheduleAnalyzerForUser` вместо синхронного `runBackgroundAnalysis`. `forceMemoryFlush` и `kill` сначала flushPendingForUser → если что-то было pending, не запускают второй вызов (защита от double/triple-fire). `commands.ts` /new теперь `await forceMemoryFlush()`.

### Group C — UI прогресса
- **п.1, п.4, п.15**: убрана фраза «Сейчас разберусь, мне нужно несколько шагов» (была `FALLBACK_PLAN_ANNOUNCEMENT` в `announce.ts`, ветка в `session.ts` удалена), убран заголовок «Шаги:» в пузыре, todo-list больше НЕ создаёт отдельное Telegram-сообщение (`todo_init`/`todo_update` только `console.log`). Остался один пузырь со статус-эмодзи, дописывается. Парсеры `TodoMarkerParser`/`PlanMarkerParser` сохранены.

### Group D+H — краткость и профилировщик
- **п.2, п.14**: блок «КРАТКОСТЬ И СУТЬ» в 3 системных промптах (`src/config.ts`): не показывать uname/версии/raw output, не «давай попробую», итог = что СДЕЛАНО и каков РЕЗУЛЬТАТ. Owner-промпт мягче.
- **Профилировщик**: `src/profiler.ts` + интеграция в `text.ts`/`session.ts`/`openrouter.ts`. Включается `PROFILER_ENABLED=true` в .env. Без флага — zero overhead. Trace в `/tmp/perf-trace-<userId>-<startMs>.json`. Документация: `docs/PROFILER-USAGE.md`.

### Group F — threads UX
- **п.12**: команды `/threads` и `/resume_thread` сняты из меню (`src/handlers/commands.ts`, `src/index.ts`, `src/config.ts`). Auto-park молча работает в фоне (`src/threads/manager.ts`: `sendMessage` → `console.log`). Сами модули `src/threads/*` живы — UX вернуть несложно.

### Group G — Composio
- **п.11**: ключ скопирован с прода в `.env` jinru (см. шаги деплоя ниже).

## Что НЕ закрыто этим батчем (вынесено отдельно)

### Group E — файловая система Write vs Bash (п.3, п.6, п.9, п.10)
**Корень:** Write идёт от бота (root) → файлы в `/opt/vault/<id>/` создаются `root:root mode 600`. Bash в контейнере работает от sandbox (uid=1000 в контейнере, host 101000 после userns-remap) — не может читать root:600. Плюс `/tmp` в контейнере и `/tmp` на хосте — разные tmpfs. Только `/var/lib/claude-bot/dropbox/<id>/` mount-нут как `/tmp/dropbox/`.

**Спека следующего батча:**
1. Post-Write hook в `src/session.ts` (или в SDK callback): для путей в `/opt/vault/<id>/` после Write → `fs.chownSync(path, 101000, 101000)` + `chmod 0644`.
2. Альтернатива: `mcp__container__Write` — пишет через `docker exec -u 1000 <cont>`. Дольше, но архитектурно чище.
3. Для shared `/tmp` между ботом и контейнером — расширить `dropbox` или добавить отдельный shared volume.

## Шаги деплоя на jinru

```bash
# 1. Sync кода (НЕ .env, НЕ system/users.json, НЕ system/deepseek-keys.json)
rsync -az --exclude node_modules --exclude .git --exclude .env \
  --exclude 'metering.sqlite*' --exclude 'system/users.json' \
  --exclude 'system/deepseek-keys.json' \
  ./ root@5.223.82.96:/opt/claude-tg-bot/

# 2. Composio key в .env jinru (значение с прода)
ssh root@5.223.82.96 'grep -q "^COMPOSIO_API_KEY=" /opt/claude-tg-bot/.env || echo "COMPOSIO_API_KEY=<value-from-prod>" >> /opt/claude-tg-bot/.env'

# 3. Рестарт
ssh root@5.223.82.96 'cd /opt/claude-tg-bot && bun install && systemctl restart claude-tg-bot'

# 4. Проверка
ssh root@5.223.82.96 'systemctl is-active claude-tg-bot && tail -5 /var/log/claude-tg-bot.log'
```

## Чек-лист для smoke (Артёму)

Бот: **@ORCH7_bot** на jinru. Стартуй с `/new` (важно!).

| # | Запрос | Ожидание |
|---|---|---|
| **T-UI-1** | «привет» | ОДИН пузырь со статус-эмодзи. НЕТ «Сейчас разберусь». НЕТ блока «Шаги:». |
| **T-UI-2** | «проверь окружение» | Финальный ответ короткий: «работает» или «готово». БЕЗ uname/версий/raw output. |
| **T-UI-3** | «создай файл /opt/vault/5615267984/test.txt с текстом hi и прочитай его» | ⚠️ Знаем: Write пишет root:600, Bash может не прочитать. Если упало — это Group E (вне этого батча). Скрин. |
| **T-MEM-1** | «запомни: у меня собака Рекс» (→ дождаться окончания) → `/new` → «как зовут собаку» | Бот **должен** ответить «Рекс». Если «не помню» — проблема с memory analyzer flush. |
| **T-MEM-2** | «у меня тариф какой?» | Бот должен сказать «гляну в системе» / `/status`. Не должен говорить «Профи 499 ₽» из памяти. |
| **T-MEM-3** | «у меня базовый уровень python и я работаю в студии» → `/new` → «что ты помнишь обо мне?» | Memory сохраняет эти факты (regex больше не блокирует «базовый», «студи»). |
| **T-SUB-1** | `/status` | Реальный tier из user-registry. Если подписка отменена — должно показать. |
| **T-401-1** | Любой запрос на 3-4 туре | НЕ должно крашиться с `Authentication Fails ...f1a7`. |
| **T-SPEED-1** | 5 разных запросов: «привет», «проверь окружение», «создай файл», «найди в интернете курс рубля», «реши задачу 2+2*3» | Замерять время. Если включить `PROFILER_ENABLED=true` в .env jinru — будут trace-файлы в `/tmp/perf-trace-*.json`. |
| **T-THREADS-1** | В меню команд | НЕТ `/threads`, НЕТ `/resume_thread`. |
| **T-GOOG-1** | «подключи мой Google» / `/google` | Composio OAuth кнопки. После авторизации — `mcp__google-workspace__*` тулзы доступны. |

## Что НЕ ожидаем починенным

- п.3, п.6, п.9, п.10 — Write vs Bash файлы — отдельный батч (Group E spec выше).
- п.16 — скорость в целом. Без профилировщика — гадание. С профилировщиком — данные.

## Откат

`ssh root@5.223.82.96 'rm -rf /opt/claude-tg-bot && cp -a /opt/claude-tg-bot.bak-2026-05-15-pre-pack /opt/claude-tg-bot && systemctl restart claude-tg-bot'`
