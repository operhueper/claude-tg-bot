# Host Surface Audit — proboi-bot (89.167.125.175)

**Дата:** 2026-05-14  
**Метод:** read-only SSH-разведка  
**Не дублирует:** уязвимости из VULNERABILITIES.md (V-01..V-28)

---

## 1. Открытые порты (ss -tlnp)

| Порт | Адрес | Процесс | Доступен извне? |
|------|-------|---------|-----------------|
| 22 | 0.0.0.0 / :: | sshd | ДА |
| 80 | 0.0.0.0 / :: | nginx | ДА |
| 443 | 0.0.0.0 / :: | nginx | ДА |
| 53 | 127.0.0.53 / 127.0.0.54 | systemd-resolved | нет (loopback) |
| 17573 | 127.0.0.1 | MainThread (PID 39921) | нет (nginx proxy) |
| 17456 | 127.0.0.1 | MainThread (PID 39897) | нет (nginx proxy) |
| **3847** | `*` (0.0.0.0 + ::) | bun | **ПОТЕНЦИАЛЬНО ДА** |
| **3848** | `*` (0.0.0.0 + ::) | bun | **ПОТЕНЦИАЛЬНО ДА** |
| **3849** | `*` (0.0.0.0 + ::) | bun | **ПОТЕНЦИАЛЬНО ДА** |

### Критическая находка: порты 3847/3848/3849 слушают на `*`, а не `127.0.0.1`

Bun-процесс бота слушает на всех интерфейсах. Это значит:
- **3847** — health-webhook доступен всем без аутентификации
- **3848** — dashboard-сервер с `/api/admin/all` (owner-only по логике, но голая HTTP) доступен через direct IP
- **3849** — неизвестный порт, отвечает 404 на `/` и `/healthz`. Видимо внутренний сервис (YooKassa webhook? Отдельный HTTP listener?). Не проксируется nginx и не задокументирован.

Nginx проксирует 3848 через `dash.proboi.site` и `proboi.site`, но **firewall не блокирует direct IP-доступ** к 3847/3848/3849. Кто угодно может достучаться до `http://89.167.125.175:3848/api/admin/all` напрямую, без TLS. Аутентификация через Telegram initData есть, но:
1. Отправляется по plain HTTP (no TLS)
2. Brute-force `auth_date` теоретически возможен, если у атакующего есть валидный `initData`

---

## 2. Firewall (iptables)

### INPUT chain
- Policy: **DROP** (хорошо — default-deny)
- Три явных DROP для `claude-guest0` → хост на портах 3848, 3847, 22

**Пропуск:** нет правил DROP для портов 3847/3848/3849 с интерфейсов, отличных от `claude-guest0`. Если гость находится на хосте (free-tier без контейнера), он использует loopback, а не `claude-guest0` — firewall его не поймает. Это подтверждает V-01.

Весь нормальный входящий трафик фильтруется UFW (цепочки ufw-before-input и т.д.). UFW настройки не проверялись напрямую — неизвестно, закрывает ли UFW 3847/3848/3849 для внешнего мира.

### DOCKER-USER chain
- DROP: tcp dpt:22, 3848, 3847 из `claude-guest0` — соответствует документации в CLAUDE.md
- **Пропуск:** нет правила DROP для порта **3849** в DOCKER-USER. Контейнерный гость может достучаться до 3849.

### FORWARD chain
- `CLAUDE_SMTP_BLOCK` и `CLAUDE_TRAFFIC_COUNT` на 172.17.0.0/16 — для стандартного docker bridge

---

## 3. Systemd unit (claude-tg-bot)

```
User=root
WorkingDirectory=/opt/claude-tg-bot
EnvironmentFile=/opt/claude-tg-bot/.env
ExecStart=/usr/local/bin/bun run src/index.ts
Restart=on-failure
RestartSec=5
```

**Отсутствуют hardening-директивы:**
- Нет `CapabilityBoundingSet` — бот имеет полный набор capabilities root
- Нет `NoNewPrivileges=true`
- Нет `ProtectSystem=strict` или `ProtectSystem=full`
- Нет `PrivateTmp=true` — /tmp общий с системой
- Нет `ReadOnlyPaths=` или `InaccessiblePaths=`
- Нет `MemoryMax=` или `TasksMax=` (зафиксировано как V-21, но без CapabilityBoundingSet это критичнее)
- `EnvironmentFile` загружает `.env` с секретами прямо в process environment — весь env читается через `/proc/self/environ` любым процессом с root-доступом

Это усугубляет V-01: бот не просто читает файлы как root, у него нет никаких systemd-ограничений на capabilities или filesystem.

---

## 4. SSH

Из `/etc/ssh/sshd_config.d/99-hardening.conf`:
```
PasswordAuthentication no
PermitRootLogin prohibit-password
MaxAuthTries 3
ClientAliveInterval 300
ClientAliveCountMax 2
```

**Хорошо:**
- Пароль отключён
- Root login только по ключу

**Авторизованные ключи (`/root/.ssh/authorized_keys`):**
```
ssh-ed25519 ...GXp8W  evgeniy@jinru.vip
ssh-ed25519 ...J/+Rp  artemyasuoko@gmail.com
```

**Находка:** В `authorized_keys` присутствует ключ `artemyasuoko@gmail.com` — это тестовый пользователь Артём (userId 5615267984), который уже фигурировал в инциденте утечки токена 2026-05-13. Наличие его SSH-ключа в `/root/.ssh/authorized_keys` означает **полный root-доступ к продакшн-серверу**. Это не гостевой sandbox — это прямой shell на хосте.

Вопрос: этот ключ добавлен намеренно (для отладки) или остался как артефакт?

**Дополнительно:** `X11Forwarding yes` включён — создаёт поверхность для X11 forwarding атак, если у атакующего есть SSH-доступ.

---

## 5. Cron и таймеры

**Системные cron:**
- `certbot` — обновление TLS-сертификата (норма)
- `e2scrub_all`, `sysstat` — системные (норма)
- `apt-daily`, `apt-daily-upgrade` — автообновления пакетов активны

**Кастомные systemd-таймеры (claude-*):**
- `claude-cpu-monitor.timer` — каждую минуту
- `claude-egress-monitor.timer` — каждую минуту
- `claude-egress-reset.timer` — ежесуточно в 00:00

**Проблема с автообновлениями:** `apt-daily-upgrade.timer` активен. На продакшн-сервере с чувствительной инфраструктурой unattended upgrades могут сломать зависимости (bun, docker, nginx) без уведомления. Рекомендация: настроить уведомления или отключить auto-upgrade.

**Гость не может подменить таймеры** — systemd управляется root, а гость в контейнере без `--privileged` не имеет доступа к systemd хоста.

---

## 6. Секреты в логах

**journalctl:** чисто — нет токенов, ключей, secrets за последний час.

**claude-tg-bot.log (stdout):** единственная строка с совпадением по regex:
```
[billing] reaping orphan container for free user 2141605259
```
Это не секрет, просто userId. Логи stdout чистые.

**claude-tg-bot.err.log (stderr):** чисто.

**Вывод:** секреты в логах не обнаружены. `AUDIT_LOG_JSON=false` (V-03 из VULNERABILITIES.md) остаётся риском для log injection, но не для утечки секретов.

---

## 7. Permissions на /tmp

**Мировое чтение всех файлов в /tmp:**

Все файлы в `/tmp` принадлежат root и имеют права `rw-r--r--` (644) — world-readable.

Это означает, что любой процесс на хосте (включая Claude subprocess free-tier гостя, работающего как root) может читать:

| Файл | Чувствительность |
|------|-----------------|
| `/tmp/claude-active-users.json` | Список всех userId + время последней активности (PII) |
| `/tmp/claude-telegram-session-{userId}.json` | История сессий всех пользователей (разговоры) |
| `/tmp/ask-user-{userId}-{id}.json` | Содержимое inline-кнопок запросов (данные из чатов) |
| `/tmp/audit_0509.txt`, `/tmp/audit_summary.txt` | Полные аудит-логи (~76KB, ~72KB) — могут содержать разговоры, ответы бота |
| `/tmp/claude-0/` — session dirs | Артефакты Claude-subprocess для разных пользователей |

**Критично:** `/tmp/claude-telegram-session-{userId}.json` cross-readable — гость под root видит сессии ВСЕХ пользователей, включая владельца (292228713). Хотя содержимое — это только список `sessions` (не сами сообщения), сам факт world-readable при root-процессе проблематичен.

**В /tmp также:**
- `aphrodite-final*.jpg` и другие — генерированные изображения, не секреты, но загрязнение
- `build_payload.js` (May 10) — неизвестный payload-скрипт, стоит проверить содержимое
- `bot_restart.flag` — флаг рестарта, world-readable
- `chinese_voice.mp3` — аудио от пользователя, world-readable

---

## 8. Бекапы

Найдено:
```
/opt/vault/{userId}/.claude/settings.json.bak  (9 пользователей)
/etc/.resolv.conf.systemd-resolved.bak
```

`settings.json.bak` — резервные копии настроек Claude Code для каждого гостя. Могут содержать токены MCP, пути, разрешения. Находятся в vault-директориях, доступных своему гостю. Не являются критичными сами по себе, но `.bak` файлы не должны накапливаться бесконтрольно.

Никаких `.sql`, `.dump`, `.sql.gz` файлов не найдено — хорошо.

---

## 9. Permissions на чувствительные файлы

| Файл | Права | Владелец | Риск |
|------|-------|---------|------|
| `/opt/claude-tg-bot/.env` | `rw-------` (600) | root | Хорошо — только root |
| `/opt/claude-tg-bot/system/users.json` | `rw-r--r--` (644) | root | **World-readable** — содержит PII всех пользователей |
| `/opt/claude-tg-bot/metering.sqlite` | `rw-r--r--` (644) | root | **World-readable** — финансовые данные использования |

**users.json (644):** любой локальный процесс на хосте читает файл с именами, тарифами, статусами подписок, payment_method_id YooKassa всех пользователей. При V-01 (free-tier bash на хосте как root) это мгновенная утечка PII.

**metering.sqlite (644):** токены, стоимость запросов по всем пользователям.

---

## 10. Docker socket

```
srw-rw---- 1 root docker  /var/run/docker.sock
```

- Группа `docker` имеет RW-доступ. Не примонтирован в гостевые контейнеры (проверено через `docker inspect` — сокет в mounts отсутствует).
- Гостевые контейнеры имеют только: `/opt/vault/{userId}`, `/tmp/dropbox`, lxcfs `/proc/*` в read-only.

---

## 11. Nginx vhosts

**proboi.site.conf:**
- `autoindex off` для `/u/` — хорошо
- `location ~ /\.` deny — скрытые файлы заблокированы
- Отдельные `location = /webhook/yukassa` без авторизации nginx — только IP-whitelist отсутствует (валидация подписи в коде бота)

**Потенциальная проблема:** `location /u/` использует `alias /var/www/u/` — при неправильном trailing slash в nginx возможен path traversal (classic nginx alias + location trailing slash bug). Текущая конфигурация `location /u/` + `alias /var/www/u/` без trailing slash в alias и без trailing slash в location — **уязвима к CVE-style alias traversal**. Запрос `GET /u../etc/passwd` или похожий может дать доступ вне `/var/www/u/`. Требует проверки.

**design.proboi.site.conf:**
- Проксирует `127.0.0.1:17573` — это, видимо, Next.js dev-сервер Open Design
- `proxy_read_timeout 300s` — разумно для streaming

---

## 12. Публичные файлы vault (/opt/vault/*/public/)

Найденные файлы не выглядят как секреты:
- `index.html`, `commercial_proposal.html`, `social_posts.txt`, `borisenko-partners.html`, `mtproto-proxy.html` — пользовательский контент
- `index.html.bak.2026-05-08` — backup от 8 мая у нескольких пользователей

**Замечание:** нет `.env` или ключей в публичных папках. Но `.bak` файлы публично доступны через `proboi.site/u/{userId}/index.html.bak.2026-05-08`.

---

## Сводка новых находок (не в VULNERABILITIES.md)

### Высокий приоритет

| ID | Находка | Severity |
|----|---------|----------|
| H-01 | Порты 3847/3848/3849 слушают на `*` вместо `127.0.0.1` — dashboard и health доступны через direct IP без TLS | HIGH |
| H-02 | SSH-ключ `artemyasuoko@gmail.com` в `/root/.ssh/authorized_keys` — пользователь из инцидента имеет root shell на проде | HIGH |
| H-03 | `system/users.json` и `metering.sqlite` world-readable (644) — PII и финансовые данные | HIGH |
| H-04 | Порт 3849 слушает наружу, не задокументирован, не проксируется nginx, не заблокирован firewall | MEDIUM |

### Средний приоритет

| ID | Находка | Severity |
|----|---------|----------|
| H-05 | `/tmp` — все файлы world-readable: session histories, active users, audit logs, ask-user payloads | MEDIUM |
| H-06 | Nginx `location /u/` + `alias /var/www/u/` без trailing slash — потенциальный alias traversal | MEDIUM |
| H-07 | Нет `PrivateTmp=true`, `NoNewPrivileges=true`, `CapabilityBoundingSet=` в systemd unit | MEDIUM |
| H-08 | `apt-daily-upgrade` активен — неконтролируемые автообновления на проде | LOW |
| H-09 | `X11Forwarding yes` в sshd — лишняя поверхность атаки | LOW |
| H-10 | `.bak` файлы в `/opt/vault/*/public/` публично доступны по HTTP | LOW |
| H-11 | `build_payload.js` в `/tmp` от 10 мая — неизвестный артефакт, стоит проверить | LOW |

---

## Что проверено и чисто

- `.env` имеет права 600 — только root читает
- Нет секретов в stdout/stderr логах и journalctl
- Docker socket не пробрасывается в контейнеры
- Нет `.sql` / `.dump` бекапов с данными
- PasswordAuthentication отключён на SSH
- DOCKER-USER chain блокирует 22/3847/3848 из контейнеров (но не 3849)
- Публичные vault-папки без секретов
