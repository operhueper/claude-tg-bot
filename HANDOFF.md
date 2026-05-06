# HANDOFF.md

Бегущий лог сессий — контекст, который не попал в CLAUDE.md. Последние сессии сверху.

---

### Сессия 2026-05-06 (вечер) — заказ proboi-bot, bootstrap, TLS, Open Design

**Новый сервер:** `proboi-bot` (Hetzner cx33 в Helsinki, **89.167.125.175**, IPv6 `2a01:4f9:c012:b2a5::1`). SSH-ключ только `jinru-deploy`. Лейблы env=production, project=proboi-bot. Цена €7.99/мес.

**Сделано:**
1. DNS на TimeWeb: A/AAAA для `proboi.site`, `www.`, `dash.`, `design.` → новый IP. Распространилось.
2. `scripts/bootstrap-proboi.sh` отработал на сервере (apt, swap 4ГБ, docker 29.4.2, bun 1.3.13, **node 24.15.0**, pnpm 10.33.2, nginx, certbot 2.9.0, ufw, fail2ban, hardening). Установлены пакеты, создан /opt/vault, /var/www/u, /var/www/proboi, /var/log/claude-tg-bot.
3. nginx-конфиги: `scripts/nginx/sites-available/{proboi,dash.proboi,design.proboi}.site.conf` (HTTP→HTTPS redirect + полный HTTPS-блок с location'ами /dashboard, /api, /u/, /healthz).
4. `scripts/nginx/issue-certs.sh` отработал — Let's Encrypt cert на 4 хоста (`proboi.site` + 3 поддомена), issuer "Let's Encrypt E7", expires 2026-08-04. Ключевая правка: исходно использовали self-signed bootstrap в `live/proboi.site/`, certbot путался; пересобрали через `certbot certonly --standalone --cert-name proboi.site` (предварительно остановив nginx).
5. Landing-заглушка `/var/www/proboi/index.html` — `https://proboi.site/` отдаёт 200 OK с HSTS.
6. Open Design развёрнут: `scripts/deploy-open-design.sh` склонировал `github.com/nexu-io/open-design` (public, branch main), pnpm install, systemd unit `open-design.service` (active enabled), слушает 127.0.0.1:17573 и :17456. `https://design.proboi.site/` → 200.
7. rsync репы бота на /opt/claude-tg-bot/ (25 МБ, без node_modules/.git/.env/mcp-config.ts/metering.sqlite).

**Не сделано (на момент паузы):**
- env+mcp-config с jinru на новый сервер с подменой токена на тестовый (8678975502:... — выдан владельцем для параллельного тестирования)
- bun install на новом сервере
- musl→glibc swap бинаря Claude CLI (см. CLAUDE.md → Production Deployment)
- systemd unit для тестового бота (имя `claude-tg-bot.service` — не конфликтует с jinru, разные машины)
- Запуск + дымовой тест в @testbot

**Тестовый бот живой:** `@ORCH7_bot` запущен на `89.167.125.175`, systemd unit `claude-tg-bot.service` active enabled. `TELEGRAM_ALLOWED_USERS=292228713,5615267984` (только owner + один тестер). Dashboard доступен на `https://dash.proboi.site/` (proxy 3848 ← nginx, проверен 200 OK).

**SANDBOX ADMIN промпт-фикс:** бот галлюцинировал «не могу писать вне workspace» и предлагал «отправь /restart, чтобы я мог». Починено:
  - `src/config.ts` `buildOwnerSafetyPrompt()` — добавлен блок SANDBOX ADMIN в конце: owner — полный root, `/opt/claude-tg-bot/` — его песочница, `.env`/`mcp-config.ts`/`src/**`/`system/users.json`/`/root/.claude/**` редактировать напрямую, никогда не предлагать /restart как обходной путь для задач, которые можно сделать прямо сейчас.
  - `workspace/CLAUDE.md` — секция `## Ты на сервере jinru` заменена на `## Хост и админ-операции` (детект хоста через `hostname`, явно: полный root, не привязано к jinru).

**users.json — реальный путь:** `/opt/claude-tg-bot/system/users.json` (не в корне репы и не в /root — проверено `find /opt/claude-tg-bot -name users.json` на новом сервере).

**SDK 0.1.76 на новом сервере — нет musl/glibc-ловушки:** SDK 0.1.76 использует bundled `cli.js` (Node.js), а не нативный бинарь. Swap `/root/.local/share/claude/...` → `node_modules/.../claude` не нужен на proboi-bot. Ловушка остаётся только на jinru (SDK старой версии с нативным бинарём) — не повторять `bun install` на jinru без последующего свапа бинаря.

**Артефакты в репе:** `scripts/bootstrap-proboi.sh`, `scripts/nginx/{sites-available/*,snippets/*,issue-certs.sh}`, `scripts/migrate-jinru-to-proboi.sh` (для финальной миграции), `scripts/deploy-open-design.sh`.

**Не сделано (после паузы сессии):**
- `/var/www/u/{userId}/` — публичные папки пользователей (nginx уже роутит `/u/`, но каталоги не созданы, квота не реализована, индикатор на дашборде отсутствует).
- Миграция vault'ов гостей с jinru на proboi-bot (файлы `/opt/vault/`).
- Prod-миграция: stop jinru бота → `migrate-jinru-to-proboi.sh` → swap `TELEGRAM_BOT_TOKEN` на боевой → рестарт → retire jinru bot.
- Дымовой тест `@ORCH7_bot` end-to-end (чтение `.env`, редактирование файла, проверка SANDBOX ADMIN на практике).
- URL команды `/dashboard` в `src/handlers/commands.ts:400` всё ещё ведёт на `ksenyaenbom.ru/dashboard` — обновить на `https://proboi.site/dashboard`.
- AAAA-записи DNS — проверить, что IPv6 `2a01:4f9:c012:b2a5::1` отвечает нормально (TLS по IPv6 не тестировался).

---

### Сессия 2026-05-06 (вторая половина дня) — анти-галлюцинация, отключение WebSearch у гостей, обновление токена Hetzner

**Что обнаружено:** бот дважды галлюцинировал причины отказа инструментов.

1. Галлюцинация «российский IP» — на самом деле сервер Hetzner Singapore, IPv6 `2a01:4ff:2f0:1ab0::1`, country=SG, ASN AS215859. Никакой блокировки по IP нет.
2. Галлюцинация «нет прав на запись в память» у Ксении — на самом деле права 755, файлы пишутся, в логах есть Edit graph.json в 09:57.

Корневая причина: при запросе к `api.deepseek.com/anthropic` Claude Code пытался вызвать WebSearch (серверный tool Anthropic). DeepSeek этот эндпоинт не проксирует и возвращает `deepseek-reasoner does not support this tool_choice`. Вместо того чтобы сообщить об ошибке инструмента, бот придумывал правдоподобную причину.

**Что сделано:**

1. `src/config.ts` (`buildOwnerSafetyPrompt`) — добавлен блок ANTI-HALLUCINATION ON ERRORS: при ошибке инструмента сообщать точную техническую причину, не придумывать объяснений.
2. `src/config.ts` (`buildNewGuestSafetyPrompt`) — добавлен блок «Анти-галлюцинация ошибок» (по-русски): та же логика для гостевого промпта.
3. `src/templates/guest-claude-md.ts` — добавлен раздел «Анти-галлюцинация ошибок» в шаблон CLAUDE.md гостя (дублирование в памяти).
4. `src/config.ts` (`getUserProfile`) — для DeepSeek-гостей (все кроме Ксении) проставляется `disallowedTools: ["WebSearch"]`. `UserProfile` получил опциональное поле `disallowedTools?: string[]`. В `src/session.ts` поле пробрасывается в опции SDK `query()`.
5. Токен Hetzner обновлён в `~/.claude.json` → `mcpServers.hetzner.env.HETZNER_API_TOKEN`. Прямой curl к Hetzner API подтвердил валидность: видит jinru-web (sin) и tg-bots (hel1). MCP подхватит после перезапуска Claude Code.

**Деплой не делался** — ждём команды владельца.

**Следующий шаг:** ребут Claude Code на ноуте чтобы Hetzner MCP подцепил новый токен, затем деплой: `rsync + bun install + systemctl restart claude-tg-bot` + обязательный musl→glibc swap бинаря Claude CLI после `bun install` (см. CLAUDE.md → Production Deployment).

---

### Сессия 2026-05-06 — подготовка миграции на proboi.site (Фаза A)

### Что обсудили и решили

- **Новый домен `proboi.site`** куплен в TimeWeb. Старый `ksenyaenbom.ru` остаётся у Ксюши на jinru, не трогаем.
- **Структура поддоменов:**
  - `proboi.site` — заглушка-лендинг
  - `proboi.site/dashboard` — Мини Апп дашборд пользователя
  - `proboi.site/u/{userId}/` — публичные странички пользователей (как сейчас jinru.pro/u/)
  - `dash.proboi.site` — административный вид (только владельцу)
  - `design.proboi.site` — Open Design (через прокси к jinru)
- **Бот переезжает на новый сервер, jinru остаётся** под лендинги владельца (jinru.pro), лендинг Ксюши, Open Design. Причина — физическая изоляция: контейнеры пользователей не должны иметь доступа к чужим проектам.
- **До 10 активных пользователей**, один общий ключ владельца, тарифов нет, биллинг отложен.
- **Считаем токены на каждого** уже сейчас — накопительно с момента запуска счётчика.
- **Open Design** — судьба не решена («развернём, потестим, может прибьём»).

### Что сделано локально (Фаза A — два раунда)

**Раунд 1:**
1. Бот не «думает вслух» в чат — все промежуточные сообщения удаляются, остаётся финальный ответ. Файл `src/handlers/streaming.ts`.
2. Технические ошибки заменены дружелюбными в семи местах. Общая функция `replyFriendly` в `src/utils.ts`. Затронуты `text.ts`, `audio.ts`, `voice.ts`, `callback.ts`, `media-group.ts`, `document.ts`, `commands.ts`.
3. Подсчёт токенов на пользователя через SQLite — новый файл `src/metering.ts`. Перехват в `src/session.ts` (через Claude CLI) и `src/engines/openrouter.ts`. Файл `metering.sqlite` добавлен в `.gitignore`.
4. Claude знает свои ресурсы (512 МБ памяти, 1 ядро) и возможности (интернет, поиск, установка пакетов). Блоки добавлены в системные запросы (`src/config.ts`) и в шаблон CLAUDE.md гостя (`src/templates/guest-claude-md.ts`).
5. Баг с приёмом нового пользователя (Марина 188062855) починен. Функция добавления стала повторяемой без побочных эффектов. Файлы `src/user-registry.ts`, `src/handlers/callback.ts`.
6. Онбординг для новых пользователей — Claude ведёт диалог по 6 шагам, в конце ставит метку `[ONBOARDING_COMPLETE]`, бот переключает режим. Существующих пользователей не трогает. Файлы `src/config.ts` (новая функция `buildOnboardingPrompt`), `src/user-registry.ts` (поле `onboardingComplete`, функция `markOnboardingComplete`), `src/handlers/text.ts` (переключение режима), `src/handlers/callback.ts` (флаг при одобрении).

**Раунд 2:**
7. Сбор метрик контейнера — новый файл `src/containers/metrics.ts`. Возвращает память/процессор/диск через `docker stats` и `du`. Безопасно работает без Docker при локальной разработке.
8. Веб-сервер дашборда на порту 3848 — новый файл `src/dashboard-server.ts`. Запускается рядом с health-webhook (порт 3847). Маршруты: `/`, `/dashboard`, `/api/me`, `/api/admin/all`. Подпись Telegram initData проверяется по официальной инструкции.
9. Шаблон Мини Апп дашборда — `src/templates/user-dashboard.ts`. Тёмная тема под Telegram, три блока (токены, ресурсы, кнопки), внизу таблица для администратора. Режим `?mock=1` для проверки вёрстки.
10. Заглушка лендинга — `src/templates/landing.ts`. Простая центральная страница с кнопкой «Открыть в Telegram».
11. Файл `логика проекта.md` обновлён двумя разделами по обоим раундам.

**Сборка:** `bun run typecheck` — без ошибок. Никаких изменений на сервере не делалось.

### Что осталось до следующего этапа

- **Прокси для Open Design** — отложено до момента, когда судьба Open Design будет решена.
- **Команда `/dashboard`** в `src/handlers/commands.ts:400` всё ещё ведёт на старый `https://ksenyaenbom.ru/dashboard` — поменять на `https://proboi.site/dashboard` при переключении на новый домен.
- **Замер jinru** — нужны цифры (свободная память, диск, нагрузка) для подбора размера нового сервера. Требует разрешения владельца.
- **Токен Hetzner** — на момент сессии не работал (`Authentication failed`). Владельцу нужно обновить токен в настройках MCP.

### План на следующую сессию

1. Владелец обновляет токен Hetzner в MCP.
2. Замер jinru через read-only SSH.
3. Подбор размера нового сервера (стартовая точка — CX22, 4 ядра / 8 ГБ).
4. Заказ сервера через Hetzner API.
5. Настройка: Docker, swap, nginx, TLS Let's Encrypt для всех поддоменов.
6. Развёртывание тестового бота с отдельным токеном Telegram — параллельно с боевым.
7. Тестирование онбординга, дашборда, метеринга.
8. После проверки — переключение боевого токена на новый сервер, перенос данных пользователей с jinru, переключение DNS, гашение старого экземпляра.

### Что важно помнить новой сессии

- На сервер ничего не деплоить без явного «давай».
- Нетривиальные правки кода — через делегирование, не делать самому.
- Простой русский язык, без примесей иностранных терминов там, где есть русский аналог.
- Метеринг есть, но база данных пока не создана — `metering.sqlite` появится при первом запуске бота.

---

## 2026-05-06 — Унификация профилей

### Что изменилось

- **Legacy Guest (Ксения) — упразднён.** Больше нет отдельного класса профилей с `GUEST_WORKING_DIR`/`GUEST_CLAUDE_MODEL`/`TELEGRAM_GUEST_USERS`. Все гости — единый тип `Guest`.
- **Ксения (`893951298`)** переведена на `/opt/vault/893951298/` как workdir. Остаётся на `claude-sonnet-4-6` — осознанное решение. Ей явно разрешено читать `CLAUDE_WORKING_DIR` (owner workspace) в `allowedPaths`.
- **workspace-ksenia/** и **workspace-artem/** удалены из репозитория (были `git rm`-нуты + физически удалены). Артём работал из `/opt/vault/403360614/` уже несколько недель — workspace-artem был мёртв.
- **DEEPSEEK_API_KEY** — единый shared ключ для всех гостевых сессий (ранее предполагался per-user файл или через OpenRouter). Env-var `DEEPSEEK_API_KEY` добавлен в `.env.example` (другой агент).
- **GOOGLE_API_KEY** удалён из `.env.example` — нигде не использовался.
- **openrouter-image MCP** — только для owner (ограничено в `mcp-config.ts`).
- Тест-пользователи (`299753724`, `307773800`, `5615267984`, `946882308`, `517872933`) — подтверждены как тестеры, имена не важны, оставлены как есть.

### Что НЕ изменилось

- Owner (Евгений, `292228713`) — без изменений.
- Ксения (`893951298`) — модель `claude-sonnet-4-6` сохранена.
- Артём (`403360614`) — в `NEW_GUEST_USERS`, `/opt/vault/403360614/`.
- Контейнерная изоляция (Docker sandbox) — без изменений.
- Cron-задачи (fitcoach-sync, fitcoach-morning, fitcoach-evening) — без изменений.
- Группа `-5115756668` (Семейный бизнес) — без изменений.

### Инфра (актуальное)

- Сервер: `root@5.223.82.96`
- Репо: `/opt/claude-tg-bot/`
- Owner workspace: `/opt/claude-tg-bot/workspace/`
- Vault: `/opt/vault/{userId}/`
- Сервис: `systemctl {status,restart,stop} claude-tg-bot`
- Логи: `/var/log/claude-tg-bot.log`, `/var/log/claude-tg-bot.err.log`
- Claude CLI: `/root/.local/share/claude/versions/2.1.126`
- После `bun install` на сервере — обязательно делать musl→glibc swap (см. CLAUDE.md → Production Deployment)
