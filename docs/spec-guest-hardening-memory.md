# Spec: Guest Hardening + Auto-Memory

Дата: 2026-05-16  
Статус: **ЗАКОММИЧЕНО, НЕ ЗАДЕПЛОЕНО**

---

## Проблемы

### 1. Хостовые метрики видны гостям (все гости)
`free`, `/proc/cpuinfo`, `/proc/loadavg`, `/proc/uptime` в гостевых контейнерах = данные хоста,
потому что lxcfs не установлен на Timeweb-сервере (код в spec.ts уже умеет монтировать lxcfs, но тихо делает fallback).

Артём опубликовал `proboi.site/u/5615267984/monitor.html` с реальными RAM 7.9 GB, CPU-моделью и uptime сервера.

### 2. Неконтролируемые while-true циклы (все гости)
Нет явного запрета на `while true / nohup loop &`. Артём запустил:
```
PID 326: while true; do python3 gen-monitor.py; sleep 60; done
```
Умирает при рестарте контейнера, но пока жив — ест ресурсы без логирования.

### 3. Память гостей не автоинжектируется (все гости)
CLAUDE.md шаблон утверждал что `profile.md` «инжектируется автоматически» — ложь.
Гость начинает каждую сессию с нуля; Claude не видит что было построено в прошлый раз.

---

## Изменения в коде (уже в коммите)

| Файл | Что изменилось |
|------|----------------|
| `src/config.ts` | Добавлен `loadGuestMemory()` — читает `profile.md` + `MEMORY.md` при билде промпта |
| `src/config.ts` | Платный промпт теперь начинается с блока `📖 Память (автозагружена)` если файлы не пустые |
| `src/config.ts` | Добавлена секция **MEMORY.md** в блок Memory платного промпта |
| `src/config.ts` | Добавлен явный запрет `while true / nohup loop` в Automations с redirect → .daemons.yaml |
| `src/config.ts` | `bootstrapNewGuestDir` создаёт `MEMORY.md` stub для новых платных гостей |
| `src/templates/guest-claude-md.ts` | Исправлено: profile.md не auto-inject, зато MEMORY.md — да |
| `src/templates/guest-claude-md.ts` | Добавлена инструкция обновлять MEMORY.md после сессии |
| `src/templates/guest-claude-md.ts` | Запрет while-true / nohup loop → только манифест |
| `skills/background_tasks.md` | Добавлен раздел «Когда nohup НЕ подходит» → .daemons.yaml |

---

## Серверные действия при деплое (TEST → PROD)

### Шаг 0: Убить фоновый процесс Артёма (сейчас)
```bash
ssh root@5.129.250.87 'docker restart claude-user-5615267984'
```
PID 326 (while-true monitor loop) умрёт при рестарте контейнера.

### Шаг 1: Установить lxcfs на TEST (jinru)
```bash
ssh root@5.223.82.96 'apt-get install -y lxcfs && systemctl enable --now lxcfs'
```
Проверить:
```bash
ssh root@5.223.82.96 'cat /var/lib/lxcfs/proc/meminfo | head -3'
# Должно показать: MemTotal: ~524288 kB (512 MB лимит контейнера), а не 8 GB хоста
```

### Шаг 2: Задеплоить код на TEST
```bash
rsync -az --exclude node_modules --exclude .git --exclude .env --exclude 'metering.sqlite*' \
  --exclude 'system/users.json' --exclude 'system/deepseek-keys.json' \
  ./ root@5.223.82.96:/opt/claude-tg-bot/
ssh root@5.223.82.96 'cd /opt/claude-tg-bot && bun install && systemctl restart claude-tg-bot'
```

### Шаг 3: Пересоздать контейнеры на TEST (чтобы lxcfs-монты заработали)
```bash
ssh root@5.223.82.96 'docker rm -f $(docker ps -aq --filter label=claude-bot-user) 2>/dev/null || true'
# Бот поднимет их сам при первом сообщении или через init()
```

### Шаг 4: Smoke-тесты на TEST (@ORCH7_bot)
- [ ] `free -m` в контейнере показывает ~512 MB, а не 7.9 GB  
  ```bash
  ssh root@5.223.82.96 'docker exec claude-user-<testUserId> bash -c "free -m"'
  ```
- [ ] `cat /proc/cpuinfo` показывает lxcfs-виртуальный CPU (модель = QEMU или container)
- [ ] Новый гость получает `MEMORY.md` в vault после первого сообщения
- [ ] После разговора Claude обновляет `MEMORY.md` (проверить `cat /opt/vault/<id>/MEMORY.md`)
- [ ] На следующей сессии Claude видит память в системном промпте (попросить Claude сказать что он помнит)
- [ ] `while true` больше не запускается — Claude предлагает .daemons.yaml

### Шаг 5: Задеплоить на PROD (после успешного TEST)
```bash
rsync -az --exclude node_modules --exclude .git --exclude .env --exclude 'metering.sqlite*' \
  --exclude 'system/users.json' --exclude 'system/deepseek-keys.json' \
  ./ root@5.129.250.87:/opt/claude-tg-bot/
ssh root@5.129.250.87 'apt-get install -y lxcfs && systemctl enable --now lxcfs'
ssh root@5.129.250.87 'cd /opt/claude-tg-bot && bun install && systemctl restart claude-tg-bot'
```

### Шаг 6: Пересоздать контейнеры на PROD
```bash
ssh root@5.129.250.87 'docker rm -f $(docker ps -aq --filter label=claude-bot-user) 2>/dev/null || true'
```
Контейнеры поднимутся при первом обращении каждого гостя.  
Для Артёма это случится сразу — его контейнер самый активный.

---

## Что НЕ изменилось (намеренно)

- Код `spec.ts` — lxcfs-монты там уже есть, только нужен запущенный lxcfs на хосте
- Тарифы, гейты, Composio, MCP — без правок
- Owner-профиль — без правок
- jinru-тест — меняется только в рамках шагов 1-4 выше

---

## Анализ: что ещё у owner есть, чего нет у гостей

Проверено при подготовке этого патча. Намеренные разрывы (owner-only, не портировать):
- Docker socket, root, /opt и /var/log монты — owner управляет ботом
- OPENAI/OPENROUTER ключи в env субагентов — риск утечки через субагентов гостей
- Нет лимитов CPU/RAM — хозяин платит за сервер

Устранено этим патчем:
- Автоинжекция памяти (MEMORY.md + profile.md) ✅
- Запрет while-true / nohup циклов ✅
- Консистентные инструкции в skills/background_tasks.md ✅
- Правда в CLAUDE.md шаблоне про auto-inject ✅

Потенциально стоит портировать в будущем (не в этом патче):
- Более подробная секция `ANTI-HALLUCINATION ON ERRORS` (у owner длиннее)
- Секция `КРАТКОСТЬ И СУТЬ` — у гостей уже есть, у owner немного богаче
- Инструкции по Composio (добавление новых toolkit'ов) — у owner есть, у гостя нет, но гостю это и не нужно
