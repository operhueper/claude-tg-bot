# Спека: Миграция ПДн на RF-сервер (242-ФЗ)

> Ветка: `feature/legal-docs-consent-gate` → тест на jinru → прод на proboi-bot  
> Дата: 2026-05-14  
> Статус: **ПЛАНИРОВАНИЕ**

---

## Цель

Вынести первичное хранилище персональных данных пользователей (реестр субъектов ПДн) на сервер в РФ (Timeweb), оставив runtime, контейнеры и vault на Hetzner. Это закрывает требование 242-ФЗ по локализации ПДн граждан РФ и позволяет честно заполнить п. 11.4 Положения об обработке ПДн.

**Vault** остаётся на Hetzner временно — переедет на собственный РФ-сервер когда он появится. В Положение вносим как «временная рабочая среда» с auto-cleanup 30 дней + согласие пользователя.

---

## Итоговая архитектура

```
┌───────────────────────────────┐     ┌────────────────────────────────┐
│  Hetzner 89.167.125.175       │     │  Timeweb (новый VPS, РФ)       │
│  (proboi-bot)                 │     │  (user-db service)             │
│                               │     │                                │
│  bot (Bun) ──── HTTPS ──────────────→ POST /users                   │
│  containers (Docker)          │     │  GET  /users/:id               │
│  /opt/vault/<userId>/         │     │  POST /metering/record         │
│  system/deepseek-keys.json    │     │  GET  /metering/:id            │
│  .env (токены, не ПДн)        │     │  POST /consent/:id             │
│                               │     │                                │
│                               │     │  → users.json (диск)          │
│                               │     │  → metering.sqlite (диск)     │
│                               │     │  → consent table (в SQLite)   │
└───────────────────────────────┘     └────────────────────────────────┘
```

**Что хранится где:**

| Данные | Hetzner | Timeweb (РФ) |
|---|---|---|
| users.json (Telegram ID, email, тариф, согласие) | кеш в памяти | **источник истины** |
| metering.sqlite (токены, биллинг) | очередь записей | **источник истины** |
| consent (согласия на обработку ПДн) | — | **в metering.sqlite** |
| /opt/vault/<userId>/ | да (временно) | — |
| deepseek-keys.json | да | — |
| .env (API-ключи) | да | — |

---

## Компоненты

### 1. `user-db/` — новый Bun-сервис

Отдельная папка в репо, деплоится на Timeweb VPS.

**Файлы:**
```
user-db/
  server.ts          — HTTP сервер (порт 3900)
  users.ts           — CRUD для users.json
  metering.ts        — CRUD для metering.sqlite
  consent.ts         — CRUD для consent table
  package.json
  systemd/user-db.service
```

**API (внутренний, не публичный):**

```
POST   /users                — создать пользователя
GET    /users/:id            — получить профиль
PUT    /users/:id            — обновить поля (patch-семантика)
DELETE /users/:id            — удалить

GET    /users                — все пользователи (admin)

POST   /metering/record      — { userId, model, source, inputTokens, outputTokens }
GET    /metering/:id         — totals по пользователю
GET    /metering/all         — все пользователи (admin)

GET    /consent/:id          — { hasConsent: bool, version, ts }
POST   /consent/:id          — { version } — запись согласия
DELETE /consent/:id          — revoke согласия

GET    /healthz              — liveness
```

**Аутентификация:** заголовок `X-Internal-Token: <secret>` на каждый запрос. Secret в `.env` обоих серверов как `USER_DB_TOKEN`.

**Надёжность:** при старте сервис загружает users.json в память. Записи атомарные (tmp-файл + rename, как в текущем user-registry.ts).

### 2. `src/user-db-client.ts` — HTTP-клиент для бота

Обёртка над fetch, прячет URL и токен. Реализует тот же интерфейс что сейчас у user-registry + metering + consent, чтобы минимально трогать вызывающий код.

**Кеш:**
- In-memory кеш пользователей (TTL 5 мин) — при недоступности Timeweb бот работает из кеша.
- Metering: локальная очередь записей. Если Timeweb недоступен — накапливаем, flush при восстановлении (retry с expo-backoff).
- Consent: кеш 5 мин (как сейчас в `src/consent.ts`).

**Fallback при полной недоступности user-db:**
- Авторизация: кеш пользователей → работаем из памяти.
- Metering: очередь → не теряем записи.
- Consent: кеш → работаем из памяти.
- Если кеш пустой и user-db недоступен → бот отвечает «технические проблемы, попробуйте через минуту».

### 3. Изменения в существующих модулях

| Файл | Что меняем |
|---|---|
| `src/user-registry.ts` | Заменить `fs.readFile/writeFile` на вызовы `user-db-client` |
| `src/metering.ts` | Заменить прямой SQLite на HTTP через `user-db-client` |
| `src/consent.ts` | Заменить SQLite на HTTP через `user-db-client` |
| `src/config.ts` | Добавить `USER_DB_URL`, `USER_DB_TOKEN` в env-parse |

### 4. Vault auto-cleanup

Новый systemd timer на Hetzner (или cron в daemon-runner):

```bash
# Удалять файлы в vault старше 30 дней (не папки, не CLAUDE.md)
find /opt/vault -mindepth 2 -not -name "CLAUDE.md" \
  -mtime +30 -type f -delete
```

Запускать ежедневно в 03:00 UTC.

---

## Этапы

### Этап 0: Подготовка (локально)

- [ ] Создать `user-db/` со скелетом сервиса
- [ ] Реализовать все endpoints
- [ ] Написать `src/user-db-client.ts` с кешем и fallback
- [ ] Добавить `USER_DB_URL`, `USER_DB_TOKEN` в `.env.example`
- [ ] Обновить `src/user-registry.ts`, `src/metering.ts`, `src/consent.ts`
- [ ] `bun run typecheck` — без ошибок

### Этап 1: Тест на jinru (user-db локально)

На jinru user-db запускается на том же VPS (localhost:3900). Данные уже там, никуда не переезжают.

- [ ] Скопировать код на jinru: `rsync ... root@5.223.82.96:/opt/claude-tg-bot/`
- [ ] На jinru: `cd user-db && bun install && bun run start` (или через systemd)
- [ ] `.env` на jinru: `USER_DB_URL=http://127.0.0.1:3900`, `USER_DB_TOKEN=<secret>`
- [ ] `systemctl restart claude-tg-bot`
- [ ] Smoke-тест:
  - [ ] `/start` → consent gate работает
  - [ ] Текстовое сообщение → ответ и запись в metering
  - [ ] `/status` → показывает токены из user-db
  - [ ] `/forget` → revoke consent, повторный `/start` → снова gate
  - [ ] Отключить user-db, послать сообщение → fallback (не падает)
  - [ ] Включить обратно → очередь metering-записей ушла

### Этап 2: Timeweb VPS

- [ ] Купить минимальный VPS на Timeweb (1 vCPU / 1-2 GB RAM, SSD 20+ GB, Москва)
- [ ] Установить Bun + systemd unit
- [ ] Скопировать `user-db/` на Timeweb
- [ ] Перенести данные:
  ```bash
  # С Hetzner-прода скопировать данные на Timeweb
  rsync -az /opt/claude-tg-bot/system/users.json root@<timeweb-ip>:/opt/user-db/data/
  rsync -az /opt/claude-tg-bot/metering.sqlite* root@<timeweb-ip>:/opt/user-db/data/
  ```
- [ ] Запустить user-db на Timeweb, проверить `/healthz`
- [ ] Настроить nginx на Timeweb: `/` → 127.0.0.1:3900 (или просто firewall + приватный IP)
- [ ] Firewall Timeweb: порт 3900 открыт только для IP Hetzner (`89.167.125.175`)

### Этап 3: Деплой на прод

> Без подтверждения не деплоить. Требует явного «да» от Евгения.

- [ ] На Hetzner обновить `.env`: `USER_DB_URL=http://<timeweb-ip>:3900`, `USER_DB_TOKEN=<secret>`
- [ ] `rsync` код на Hetzner + `bun install`
- [ ] `systemctl restart claude-tg-bot`
- [ ] Проверить логи — нет ошибок подключения к user-db
- [ ] Smoke-тест: всё то же что на jinru

### Этап 4: Юридические документы

- [ ] Обновить `legal/polozhenie_pdn.md` п. 11.4: вписать адрес Timeweb ЦОД
- [ ] Обновить `src/templates/privacy.ts`: добавить адрес ЦОД в раздел «хранение данных»
- [ ] Добавить в оферту/terms пункт про auto-cleanup vault (30 дней)
- [ ] Подать уведомление в РКН через Госуслуги

### Этап 5: Vault auto-cleanup

- [ ] Написать скрипт `scripts/vault-cleanup.sh`
- [ ] Добавить systemd timer: `scripts/systemd/vault-cleanup.timer` + `.service`
- [ ] Задеплоить на Hetzner, проверить что не удаляет `CLAUDE.md`

---

## ENV-переменные

Новые переменные в `.env`:

```env
# user-db service
USER_DB_URL=http://127.0.0.1:3900   # jinru: localhost; prod: http://<timeweb-ip>:3900
USER_DB_TOKEN=<random-secret-32-chars>
```

На Timeweb (в `user-db/.env`):
```env
PORT=3900
DATA_DIR=/opt/user-db/data
INTERNAL_TOKEN=<тот же secret>
```

---

## Тест-план (jinru)

| Сценарий | Ожидание |
|---|---|
| Новый пользователь → `/start` | consent gate → accept → запись в users.json через user-db |
| Текстовое сообщение | ответ + `POST /metering/record` в user-db |
| `/status` | токены из `GET /metering/:id` |
| `/forget` | `DELETE /consent/:id` → повторный `/start` снова gate |
| user-db упал | кеш в памяти работает, metering в очереди |
| user-db восстановился | очередь metering отправилась |
| Неверный X-Internal-Token | 401, в логах бота ошибка |

---

## Риски

| Риск | Митигация |
|---|---|
| Timeweb VPS упал | In-memory кеш на 5 мин + очередь metering |
| Latency 20-30ms на каждый запрос | Кеш пользователей (TTL 5 мин), metering async |
| Timeweb IP сменился (при перезаказе VPS) | `USER_DB_URL` в .env, обновить за 1 минуту |
| Данные рассинхронизировались при мигации | Снять `metering.sqlite` с Hetzner в момент рестарта бота |

---

## Что не входит в эту спеку

- Перенос vault в РФ (отдельная задача, когда появится собственный РФ-сервер)
- AAAA DNS/IPv6
- Ротация ключей (отдельная задача)
- YuKassa reconciliation

---

## P2 Security fixes (отложено, сделать одним заходом)

Из аудита 2026-05-14, не блокируют, но закрыть до публичного запуска.

| ID | Файл | Суть | Severity |
|----|------|------|----------|
| V-29 | `src/session.ts` | resume-hijack: sessionId не проверяется на принадлежность userId | HIGH |
| V-30 | `src/memory/analyzer.ts:113-123` | prompt-injection через транскрипт → запись в граф пользователя | MEDIUM |
| V-35 | `src/dashboard-server.ts` notify-bridge | `_allowedUsers` Set строится один раз — новые approve'ы не подхватываются до рестарта | LOW |
| V-36 | `src/engines/openrouter.ts` vision | нет daily-лимита на vision-запросы per-user → экономический DoS | MEDIUM |
| V-37 | `src/utils.ts` writeAuditLog | `appendFile` не атомарен для записей > 4096 байт | LOW |
| V-38 | `src/crashloop-watcher.ts` | гость через переименование daemon сбрасывает 1-часовой кулдаун алертов | LOW |
| V-39 | `src/request-queue.ts` `acquireContainerSlot` | stale resolver при таймауте занижает счётчик активных сессий | LOW-MEDIUM |
