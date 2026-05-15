# ROADMAP: безопасный пакет фиксов после аудита 2026-05-15

> Стартуй новый чат с этого файла. Прод (`@proboiAI_bot` / `proboi-bot 89.167.125.175`) **не катаем** до явного согласия.
> Все правки → деплой на jinru → smoke → обсуждение → только потом прод.

---

## TL;DR

После трёх параллельных аудитов (Sonnet × 2 + Opus, 2026-05-15) собран **единый безопасный пакет из ~17 фиксов**, разбитый на 5 шагов в правильном порядке. Главное открытие — `this.profile` кешируется в `ClaudeSession` и не обновляется на лету; это корень для трёх разных симптомов (Гоша 188062855, downgrade paid→free, скрин со склееной narration).

Прод сейчас работает, никто не помрёт. Фиксы повышают качество, закрывают тихие тарифные баги, убирают утечки в чат и логи.

---

## Контекст из этой сессии

### Что вылезло

1. **Скрин с зарплатным клиентом** (вероятно Денис Коэн, не Гоша): склеенный поток «проверю/нашёл/прочитаю/вижу проблемы» в одном Telegram-сообщении + «контейнер пока нестабилен» — это галлюцинация от **memory analyzer toxic loop**.
2. **Гоша 188062855** на проде: гость DeepSeek, в `users.json` `containerEnabled=true`, но контейнера `claude-user-188062855` нет в `docker ps -a`, vault есть. При просьбе сгенерить аудио из аккордов модель упала на `python3 -c` → `BLOCKED_PATTERNS` → throw.
3. **Артём 5615267984** на jinru: ночной фикс `allowedTools` сработал **частично** — `mcp__container__Bash` доступен, но `mcp__send-file__send_file` всё ещё требует permissions, потому что в whitelist стоит `mcp__send-file__deliver` (неверное имя).
4. **Ксения 893951298** на проде: `BLOCKED: File access outside allowed paths: /tmp/oecd_ai_sme.pdf` и WebFetch-кеш в `/root/.claude/projects/...` нечитаемы для самой Ксении.
5. **Куча шумов на jinru**: `forceMemoryFlush failed: g.label_index[key]`, `iptables: command not found`, `notify-bridge bind ... no docker bridge`, `1 битый DeepSeek ключ`, `[graph] Dropping invalid node id=preference:color`.

### Корневая находка (Opus B4)

`ClaudeSession` в `getSession(userId)` создаётся один раз и хранит **снимок** `this.profile`. После любого изменения (`tier` в users.json, `containerEnabled`, `model`) живая сессия работает со старым профилем до перезапуска бота или `/new`. Это объясняет:
- Гошин `useContainer=false` несмотря на `containerEnabled=true` в users.json (профиль был кеширован, когда контейнер ещё не был включён).
- Молчаливый downgrade paid→free, который не подхватывается до рестарта.
- Возможно — синдром на скрине у зарплатного клиента (старый профиль с устаревшими тулзами и промптом).

**Один фикс в `session.ts` (pull-fresh профиль на каждый message) закрывает три симптома.**

### Артефакты для контекста

- Полный список багов с file:line — три аудита Opus + Sonnet × 2 в этом чате выше (по `/Users/evgeniy/.claude/projects/.../tasks/{a55ebf50e50732858, afb170c7f71edd7f5, a0e2292679c01ce8c}.output`)
- Ночной HANDOFF (что катали ночью на jinru): [HANDOFF-2026-05-15-night.md](HANDOFF-2026-05-15-night.md)
- Вечерний HANDOFF (большой пакет 2026-05-15): [HANDOFF-2026-05-15-evening.md](HANDOFF-2026-05-15-evening.md)

---

## Пакет фиксов (порядок имеет значение)

### Шаг 1 — корневые. Без них остальное бесполезно.

| № | Фикс | Файл/строка | Эффект |
|---|---|---|---|
| **1.1** | Pull-fresh профиль на каждый message | [src/session.ts](../src/session.ts) первой строкой `sendMessageStreaming`: `this.profile = getUserProfile(this.profile.userId)` | Закрывает Гошу + downgrade + кешированные tier-флаги |
| **1.2** | Имена `PAID_ALLOWED_TOOLS` | [src/session.ts:645-658](../src/session.ts#L645) | `__deliver→__send_file`, `__ask→__ask_user`, `__generate→__generate_image`. Добавить `mcp__google-workspace__*` (если SDK поддерживает wildcard) или перечислить нужные тулзы Composio |
| **1.3** | Фильтр выхода memory analyzer | [src/memory/analyzer.ts](../src/memory/analyzer.ts) — функция, которая принимает patch перед `upsertNode` | Blacklist substring'ов в `patch.upsert_nodes[].label/data`: `permission denied`, `haven't granted`, `is_error`, `Unsafe command`, `python3 -c`, `container exited`, `tool_choice`, `ENOENT`, `ANTHROPIC`, `DeepSeek key`, `CLI exit`, `Claude requested permissions`, `BLOCKED:` |
| **1.4** | Защита `g.label_index` от undefined | [src/memory/graph.ts:73 в `load()`](../src/memory/graph.ts#L73) | `g.label_index ??= {}` после JSON.parse — иначе `forceMemoryFlush` крашит на старых графах |

**Почему именно этот порядок:** 1.1 чинит UX *прямо сейчас* (Гоша начнёт работать). 1.2 чинит paid (Артём). 1.3 предотвращает повторение токсичной петли после первого инфра-сбоя. 1.4 убирает спам, который мешает диагностировать остальное.

**Зависимостей между 1.1-1.4 нет — можно в одном коммите.**

### Шаг 2 — пользовательский флоу (видимая часть)

| № | Фикс | Файл/строка | Эффект |
|---|---|---|---|
| **2.1** | `checkSubscriptionExpiry(userId)` в text/voice/photo/document handlers | [src/handlers/text.ts](../src/handlers/text.ts), [voice.ts](../src/handlers/voice.ts), [photo.ts](../src/handlers/photo.ts), [document.ts](../src/handlers/document.ts) — перед `processCombinedMessage` | Сейчас юзер с истёкшей подпиской работает как paid до 6h (cron). После фикса — мгновенно. Функция уже есть в [src/payments.ts:186-196](../src/payments.ts#L186), просто не вызывается |
| **2.2** | Уведомление за 3 дня и 1 день до истечения | [src/tasks.ts](../src/tasks.ts) — рядом с `chargeExpiredTrials` | Цикл по `subscription_expires - now < 3д` с пушем самому юзеру через `bot.api.sendMessage`. Сейчас есть только `alertExpiringSubscription` — алертит owner'а, не юзера |
| **2.3** | Сообщение «подписка истекла, переключил на Бесплатный» | [src/handlers/text.ts](../src/handlers/text.ts) | После downgrade и при первом message — дружелюбно объяснить что произошло, дать `/pay` |
| **2.4** | 4 недостающих ключа в `FRIENDLY_MESSAGES` | [src/utils.ts:258-268](../src/utils.ts#L258) | `"обработка видео"`, `"обработка отложенного контекста"`, `"подключение Google"`, `"pay"` — сейчас попадают в generic «Что-то пошло не так» |
| **2.5** | OpenRouter-key warning не дёргать как `ctx.reply` напрямую | [src/session.ts:569](../src/session.ts#L569) и [:597](../src/session.ts#L597) | Сейчас юзер видит «⚠️ OpenRouter ключ не настроен — обработка изображений недоступна» — инфра-деталь. Заменить на `replyFriendly` |
| **2.6** | Убрать `model` из `/api/me` JSON | [src/dashboard-server.ts:389](../src/dashboard-server.ts#L389) | Технически грамотный free-юзер видит `"deepseek-chat"` в DevTools, хоть в UI не отображается. Для admin-таблицы (owner only) — оставить, но мапить на `"DeepSeek"`/`"Claude"` |

### Шаг 3 — порядок гейтов и согласия

| № | Фикс | Файл/строка | Эффект |
|---|---|---|---|
| **3.1** | Поменять порядок: consent → subscription gate | [src/index.ts:133-177 vs 209-230](../src/index.ts) — поменять `bot.use` блоки местами | Сейчас subscription гейт идёт раньше consent — нарушение «согласие до любых действий» (РКН-нюанс) |

### Шаг 4 — гигиена инструкций (быстро, без рисков)

| № | Фикс | Файл/строка |
|---|---|---|
| **4.1** | `/info` врёт free-юзеру про интернет — разветвить по `isPaid` | [src/handlers/commands.ts:650](../src/handlers/commands.ts#L650) |
| **4.2** | Добавить в `OWNER_COMMANDS`: `cancel`, `info`, `reloadbot` | [src/config.ts:1078-1112](../src/config.ts#L1078) |
| **4.3** | `mcp__google-workspace__*` в `FREE_DISALLOWED_TOOLS` (defence-in-depth) | [src/config.ts:53-66](../src/config.ts#L53) |
| **4.4** | Удалить мёртвый блок «Если пользователь на бесплатном...» из paid-промпта | [src/config.ts:643-651](../src/config.ts#L643) |
| **4.5** | Заменить пример `nohup bash -c '...'` на mcp-вариант в paid-промпте | [src/config.ts:860](../src/config.ts#L860) |
| **4.6** | Уточнить CLAUDE.md про модель owner'а («может переопределяться через node.model») | [CLAUDE.md:60](../CLAUDE.md#L60) |
| **4.7** | Гость может читать `/root/.claude/projects/-opt-vault-${userId}/tool-results/` | [src/session.ts:937](../src/session.ts#L937) — добавить условие для своего vault |

### Шаг 5 — гигиена jinru (только сервер, не код)

| № | Действие |
|---|---|
| **5.1** | `apt install iptables` на jinru, ИЛИ убрать `ExecStartPre=-/.../docker-user-rules.sh` из `firewall.conf` на jinru |
| **5.2** | Удалить битый `sk-578…f1a7` из `system/deepseek-keys.json` после `bun run scripts/ping-deepseek-keys.ts`. Помни: правка через scp напрямую, файл в rsync-исключениях |
| **5.3** | `GUEST_BRIDGE_IP=127.0.0.1` в `.env` jinru (или поднять docker bridge) |

---

## Что НЕ катаем в этом пакете (отдельные обсуждения)

1. **Topic-parking для free-tier** (Opus C2) — удваивает нагрузку на DeepSeek pool на 80% юзеров. Нужно отдельное решение: только для paid? Кешировать классификатор? Архитектурный разговор отдельной веткой.
2. **`python3 -c` блок для контейнерных гостей** — нужен отдельный аудит [containers/bash-mcp.ts](../src/containers/bash-mcp.ts), чтобы понять реально ли host-level `BLOCKED_PATTERNS` срабатывает для контейнерного потока. Вероятно нет (он использует `checkContainerCommandSafety`), но Гоша словил блок именно через host Bash из-за устаревшего профиля. Закроется фиксом 1.1.
3. **Расширение `FREE_DISALLOWED_TOOLS`** (WebFetch/Task/parallel в локальной ветке) — намеренное изменение, но юзерам нужна in-bot announce-коммуникация перед катом.
4. **Деплой dirty working tree** (+19461/-26625 строк по `git diff HEAD --stat`) — без поэтапной нарезки опасно. Этот пакет минимально инвазивный: только нужные фиксы, не весь tree.
5. **Topic-parking файлы (`src/threads/`)** — новый код, не покрыт тестами для free.

---

## Smoke-чек на jinru после деплоя

### Артём (paid, 5615267984)
- [ ] `mcp__container__Bash` — `ls /opt/vault/5615267984` без permission_denied
- [ ] Попросить «отправь мне файл X» → `mcp__send-file__send_file` срабатывает (ключевая проверка фикса 1.2)
- [ ] «Сгенерь картинку» → `mcp__pollinations-image__generate_image` срабатывает
- [ ] `/connect google` → `mcp__connect-google__connect` без отказа
- [ ] `tail -f /var/log/claude-tg-bot.err.log` — НЕТ `forceMemoryFlush failed`, НЕТ `Claude requested permissions`

### Free-гость (любой 100% free)
- [ ] «Погугли X» → дружелюбный отказ с предложением `/pay` (не «у меня нет WebFetch»)
- [ ] Открыть дашборд, посмотреть DevTools `/api/me` JSON → нет поля `model`
- [ ] `/info` не упоминает «интернет» в блоке «всегда доступно»

### Истечение подписки (симуляция)
- [ ] В `system/users.json` на jinru: выставить `subscription_expires` Артёма на «вчера»
- [ ] Прислать сообщение → бот отвечает «подписка истекла, переключил на Бесплатный, /pay»
- [ ] Проверить — `containerEnabled` для Артёма стал false, тулзы `FREE_DISALLOWED_TOOLS`

### Гигиена ошибок
- [ ] Спровоцировать ошибку в `text.ts/photo.ts` (например битый файл) → юзер видит дружелюбное сообщение БЕЗ stack trace и БЕЗ имени модели

### Логи jinru
- [ ] Нет спама `forceMemoryFlush failed: g.label_index[key]`
- [ ] Нет `iptables: command not found`
- [ ] DeepSeek pool — `0 битых` в health-check

---

## Команды быстрого старта в новом чате

```bash
# Локально — статус
cd /Users/evgeniy/projects/claude-tg-bot
git status --short
git log --oneline -5

# jinru — сервис
ssh root@5.223.82.96 'systemctl is-active claude-tg-bot && tail -5 /var/log/claude-tg-bot.log'

# jinru — логи в правильных путях
ssh root@5.223.82.96 'tail -100 /var/log/claude-tg-bot.err.log'

# Артём — свежий transcript
ssh root@5.223.82.96 'JSONL=$(ls -t /root/.claude/projects/-opt-vault-5615267984/*.jsonl | head -1); grep -E "tool_result|haven.t granted|is_error" "$JSONL" | tail -10'

# Прод — статус (только посмотреть, ничего не катать)
ssh root@89.167.125.175 'hostname && systemctl is-active claude-tg-bot'

# Деплой ТОЛЬКО на jinru
rsync -az --exclude node_modules --exclude .git --exclude .env \
  --exclude 'metering.sqlite*' --exclude 'system/users.json' \
  --exclude 'system/deepseek-keys.json' \
  ./ root@5.223.82.96:/opt/claude-tg-bot/
ssh root@5.223.82.96 'cd /opt/claude-tg-bot && bun install && systemctl restart claude-tg-bot'

# Откат на jinru если что
ssh root@5.223.82.96 'rm -rf /opt/claude-tg-bot && cp -a /opt/claude-tg-bot.bak-2026-05-15-pre-pack /opt/claude-tg-bot && systemctl restart claude-tg-bot'
```

---

## Карта возможностей по классам юзеров (из Opus-аудита)

| Фича | Owner (292228713) | Paid (5615267984) | Free / new_guest |
|---|---|---|---|
| Системный промпт | `buildOwnerSafetyPrompt` | `buildNewGuestSafetyPrompt(tier='paid')` | `buildFreeTierPrompt` |
| Модель | `claude-sonnet-4-6` (env override) | DeepSeek pool → `deepseek-chat` | то же |
| Bash | host, без капов | `mcp__container__Bash` через Docker | **заблокирован полностью** |
| Read/Write/Edit/Glob/Grep | да | да | **заблокированы** |
| WebFetch / WebSearch | оба | WebFetch только | оба заблокированы |
| Контейнер | false | true | false |
| Документы handlers | да | да | HARD-блок на приёме файла |
| Daily limit | без лимита | без лимита | 10/день |
| Composio Google | да | да если googleEnabled | mcp-filter режет |
| Topic-parking | bypass | работает | работает (НО удваивает нагрузку!) |

---

## Файлы памяти, которые надо обновить после деплоя

- `memory/paid_acceptedits_fix.md` — добавить раздел «реальные имена тулзов: __send_file, __ask_user, __generate_image»
- `memory/memory_analyzer_toxic_loop.md` — отметить «исправлено фильтром выхода в analyzer.ts»
- `memory/MEMORY.md` — индекс
- `memory/project_knowledge_graph.md` — обновить через `/graphify graphify-input --update` после серии коммитов

---

## Принципы, которые НЕ нарушаем

- **No deploy without confirmation** ([feedback_no_deploy.md](../memory/feedback_no_deploy.md)) — прод не катаем без явного «катим прод»
- **No error logs to user** ([feedback_no_error_logs_to_user.md](../memory/feedback_no_error_logs_to_user.md)) — только дружелюбные сообщения
- **No intermediate narration** ([feedback_no_intermediate_narration.md](../memory/feedback_no_intermediate_narration.md)) — только финальный сегмент
- **Simple Russian** ([feedback_simple_russian.md](../memory/feedback_simple_russian.md)) — без англицизмов в текстах юзеру
- **rsync исключения** — `system/users.json`, `system/deepseek-keys.json`, `.env`, `metering.sqlite*` НЕ синкать

---

**Старт следующей сессии:** прочти этот файл, открой `system/users.json` Артёма на jinru для контекста, начни с шага 1.1 — pull-fresh профиль. После каждого шага — коммит и `bun run typecheck`.
