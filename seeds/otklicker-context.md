# Откликер — состояние проекта на 2026-05-03

Контекст для seed graph. Это не CLAUDE.md и не documentation — это снапшот фактов про проект «Откликер» для извлечения в граф памяти.

## Проект

**Откликер** (otklicker.ru) — Telegram-бот @otklicker_bot, помогает соискателям на HH.ru: собирает резюме за 7-10 минут, авторизуется в HH по одноразовому коду, скорит вакансии, откликается, отвечает HR в Telegram. Запуск 

Три зоны проекта живут раздельно:
- Лендинг otklicker.ru — на TimeWeb-хостинге, репо `DreamGangVVS/otklicker_landing` на GitHub.
- Marketing-engine (HR-промо userbot Артём) — репо `operhueper/otklicker-marketing-engine`, развёртывается на jinru (5.223.82.96), путь `/opt/marketing-engine/`.
- Канал @otklicker — Telegram-канал, ведёт Ксеня (founder/команда-голос «мы»).

## Инфраструктура

### Канал @otklicker

Публичный Telegram-канал для соискателей. chat_id `-1003964848299`. Бот @proboiAI_bot — админ канала с правом can_post_messages: true. Голос канала — «мы» / команда (founder voice), НЕ Артём. Правила голоса в `/opt/claude-tg-bot/workspace-ksenia/otklicker/channel-voice.md`. Бренд-токены в `/opt/claude-tg-bot/workspace-ksenia/otklicker/brand-tokens.md`. 7 заготовок постов в `/opt/claude-tg-bot/workspace-ksenia/otklicker/prewritten_queue.json`. Лог опубликованного — `posted.md` в той же папке, источник правды — `https://t.me/s/otklicker` через WebFetch.

### Группа уведомлений «Работа с мойКлод»

Приватная Telegram-группа на двоих (Евгений + @proboiAI_bot). chat_id `-5115756668` (тип: group, не supergroup). Бот добавлен админом. Назначение: бот пушит туда уведомления Артёма (новый лид, упал, очередь пуста), Евгений отвечает reply'ями. На реплай бот разбирает контекст конкретного пуша и выполняет команду. Темы (forum topics) НЕ включены — для Topics нужна конвертация в supergroup, отложили.

### Marketing-engine на jinru

Целевой хост `5.223.82.96` (jinru), путь `/opt/marketing-engine/`. На текущий момент НЕ развёрнут. Старый прод на Hetzner снесён вместе с Telethon-сессией и БД — переезд с нуля. Источник кода: `git@github.com:operhueper/otklicker-marketing-engine.git`. systemd-юнит будет `marketing-engine.service`. Админ-функции (вкл/выкл, очередь, лиды) делаются текстом через @proboiAI_bot, отдельный admin_bot НЕ разворачивать. Ресурсный бюджет на jinru: 1 CPU, 1.5 GB RAM, 28 GB диск свободно — Артём должен быть лёгким, в systemd-юните выставить MemoryMax=400M, CPUQuota=50%.

## Правила работы из @proboiAI_bot

### hands-off лендинг otklicker

В сессиях бота @proboiAI_bot (любой профиль — owner или guest) НИКОГДА не редактируются: лендинг otklicker.ru, репо `DreamGangVVS/otklicker_landing`, TimeWeb-хост, nginx-конфиг лендинга, GitHub Actions workflow деплоя. Пользователь правит лендинг отдельно, вне бота. Если тебя просят править лендинг из бота — переспроси и откажись.

### scope бота для откликера

Допустимая работа из бота: marketing-engine код и его GitHub-репо `operhueper/otklicker-marketing-engine`, Артём (Telethon userbot), посты для канала @otklicker, админ-операции на jinru, материалы для Ксени в её workspace.

### проектные факты — в граф, не в CLAUDE.md

CLAUDE.md (как owner так и guest) держать чистым и компактным — только инструкции уровня бота и общие правила. Проектные факты, инфраструктуру, инциденты, runbook'и — в граф памяти `memory/<user_id>/graph.json` через скрипт `scripts/import-handoff.ts <path-to-md>`. Это даёт переиспользуемые ноды с timestamp и importance, которые сами стареют и не засоряют системный промпт.

## Развёртывание Артёма — runbook

Чек-лист, когда придёт время разворачивать marketing-engine на jinru:

1. Решить блокер GH-доступа (см. ниже).
2. `git clone` репо в `/opt/marketing-engine/`.
3. `python3 -m venv venv && source venv/bin/activate && pip install -e .`
4. Заполнить `.env`: TELEGRAM_API_ID, TELEGRAM_API_HASH, OPENROUTER_API_KEY/ANTHROPIC_API_KEY, NOTIFY_GROUP_CHAT_ID=-5115756668, OTKLICKER_CHANNEL_CHAT_ID=-1003964848299.
5. Миграции БД (alembic или ручной schema.sql — посмотреть в репо).
6. Telethon-логин (см. блокер).
7. systemd-юнит → `/etc/systemd/system/marketing-engine.service`, daemon-reload, enable --now. Прописать MemoryMax=400M, CPUQuota=50%.
8. `journalctl -u marketing-engine -f` — проверить, что Артём подключился.

## Блокеры развёртывания Артёма

### Блокер GH-доступа с jinru

На jinru нет ни SSH-ключа, ни gh CLI, ни PAT. Для git clone приватного репо `operhueper/otklicker-marketing-engine` нужен один из них. Опции:
- (a) Сгенерировать SSH-ключ ed25519 на jinru, добавить публичную часть как Deploy Key в репо на GitHub с правом read-only. Один заход в браузер, дальше git pull работает без вмешательства. Рекомендуется.
- (b) Fine-grained PAT с Contents: read только на этот репо, прописать в `.env` как GH_TOKEN, использовать в URL `https://${GH_TOKEN}@github.com/...`. Без браузера, но менее чисто.
- (c) Сделать репо public — не рекомендуется.

### Блокер Telethon SMS-логина

Telegram автоматически инвалидирует SMS-код, переданный как текст в любой чат (включая ботов) — анти-фишинг защита с 2022. Поэтому классическая схема «Claude бот спрашивает код, ты пишешь цифры в чат» не сработает. Опции:
- (A) Один раз с ноутбука: запустить локально Telethon-скрипт авторизации, ввести код, получить файл `*.session`, скопировать на jinru через scp. Дальше Telethon работает годами без переавторизации. Самый надёжный.
- (B) Скриншот кода: получить код в Telegram, сделать screenshot, отправить картинку в @proboiAI_bot, Claude через vision читает цифры и подсовывает Telethon. Полностью remote. Скорее всего сработает (картинка не классифицируется как forwarded text-code), но 100% гарантии нет.
- (C) tdata от Telegram Desktop: сложнее, требует Desktop-клиент.

## Открытые вопросы

- Какой Telegram-аккаунт будет «Артёмом» — отдельный с собственным номером или существующий? Влияет на легенду в HR-чатах.
- TELEGRAM_API_ID и TELEGRAM_API_HASH — генерируются на https://my.telegram.org, нужны для Telethon.
- БД — sqlite в файле или postgres? Посмотреть pyproject.toml и alembic/ в репо при развёртывании.

## Состояние на 2026-05-03

Сделано: репо marketing-engine выселен из otklicker_landing в отдельный operhueper/otklicker-marketing-engine; материалы для Ксени положены в `workspace-ksenia/otklicker/`; chat_id канала и группы получены; план развёртывания Артёма зафиксирован.

НЕ сделано: marketing-engine не развёрнут на jinru, Telethon не авторизован, Артём не работает; chat_id канала и группы не прошиты в `.env` claude-tg-bot; временный console.log в `src/handlers/text.ts` для логирования chat_id групп ещё на месте (надо убрать или превратить в штатный audit).
