# Nginx и публичная раздача файлов — аудит

**Дата:** 2026-05-14  
**Аудитор:** Claude Code (субагент)  
**Источники:** локальные `scripts/nginx/`, `nginx -T` с прода, curl-пробы, docker inspect

---

## Окружение

- **Прод:** `89.167.125.175` (proboi-bot), nginx/1.24.0 (Ubuntu)
- **Домены:** `proboi.site`, `www.proboi.site`, `dash.proboi.site`, `design.proboi.site`
- **Cert:** Let's Encrypt, единый на все 4 домена из `/etc/letsencrypt/live/proboi.site/`
- **Renewal timer:** `certbot.timer` активен, последний run 4+ ч назад — OK
- **Активные vhosts:** `dash.proboi.site.conf`, `design.proboi.site.conf`, `proboi.site.conf` — `default` удалён

---

## Находки по векторам

### N-01. [HIGH] Guest-HTML в `/u/` без CSP — XSS на том же origin, что и dashboard

**Что:** `location /u/` раздаёт статику из `/var/www/u/<id>/` → symlink на `/opt/vault/<id>/public/`. Nginx возвращает `.html`-файлы с `Content-Type: text/html` без `Content-Security-Policy`. Гость просит Клода «опубликуй мой файл» → бот копирует файл в `public/` от имени root (это явно описано в system prompt: `src/config.ts:616`). Payload будет выполнен в браузере любого, кто откроет ссылку.

**Опасность:** `proboi.site/u/<id>/evil.html` и `proboi.site/dashboard` — **один и тот же origin**. JS из guest-страницы может:
- Обратиться к `fetch('/api/me')` с куками браузера (если есть сессия)
- Прочитать `localStorage` / `sessionStorage` (например, Telegram initData если Mini App его кеширует)
- Сделать `fetch('/api/admin/all')` если в браузере залогинен владелец

**Проверка:** `curl -s -I https://proboi.site/u/893951298/` → `Content-Type: text/html`, нет CSP. `X-Content-Type-Options: nosniff` есть — предотвращает MIME-sniffing, но не XSS.

**Фикс:** добавить в `location /u/` заголовок `Content-Security-Policy: default-src 'none'; style-src 'self' 'unsafe-inline'; script-src 'none'; img-src 'self' data:; font-src 'self'` или как минимум `sandbox allow-same-origin allow-scripts` — что блокирует кражу cookies/storage соседних origin-ов. Либо перенести `/u/` на отдельный поддомен `u.proboi.site` (iframe isolation).

---

### N-02. [HIGH] TLS 1.0 и 1.1 включены в nginx.conf

**Что:** глобальный `ssl_protocols TLSv1 TLSv1.1 TLSv1.2 TLSv1.3;` — TLS 1.0 и 1.1 официально устарели (RFC 8996, 2021), уязвимы к BEAST, POODLE (частично), CRIME.

**Проверка:** `nginx -T | grep ssl_protocols` → `TLSv1 TLSv1.1 TLSv1.2 TLSv1.3`

**Фикс:** `ssl_protocols TLSv1.2 TLSv1.3;` в `/etc/nginx/nginx.conf`. Современные клиенты поддерживают TLS 1.2+, отказ от 1.0/1.1 ломает только IE 8 на WinXP.

---

### N-03. [MEDIUM] `/api/` и `/webhook/yukassa` без rate-limiting в prod

**Что:** в _локальном_ `scripts/nginx/sites-available/proboi.site.conf` в `location /api/` стоит `limit_req zone=api burst=20 nodelay;`. На **проде** этой директивы нет — конфиг устарел по сравнению с локальным шаблоном (prod развёрнут из более старого варианта).

`/webhook/yukassa` также без rate-limit. В сочетании с V-00 (IP-фильтр webhook пропускает запросы с пустым IP) это значит: flood-атака на webhook ничем не ограничена.

**Проверка:** `nginx -T` на проде — в `location /api/` нет `limit_req`. В `location = /webhook/yukassa` тоже нет.

**Фикс:** пересинхронизировать prod-конфиг с локальным шаблоном, добавив `limit_req zone=api burst=20 nodelay;` в обоих местах. Для webhook можно ужесточить до `zone=webhook:1m rate=30r/m` (YooKassa делает не более 3 retry).

---

### N-04. [MEDIUM] `server_tokens` не отключён — версия nginx в ответах

**Что:** `Server: nginx/1.24.0 (Ubuntu)` возвращается в каждом ответе. Раскрывает версию и ОС, упрощает fingerprinting для сканеров.

**Проверка:** `curl -I https://proboi.site/` → `Server: nginx/1.24.0 (Ubuntu)`.

**Фикс:** раскомментировать `server_tokens off;` в `/etc/nginx/nginx.conf`.

---

### N-05. [MEDIUM] `/dashboard` на proboi.site в prod не переопределяет `X-Frame-Options`

**Что:** в _локальном_ шаблоне `location /dashboard` явно очищает `X-Frame-Options` и добавляет CSP `frame-ancestors`. На **проде** `location /dashboard` в `proboi.site.conf` не имеет этих overrides — унаследовал глобальный `X-Frame-Options: DENY` из `security-headers.conf`. Telegram Mini App не может открыть dashboard в iframe.

(Уже упомянуто в VULNERABILITIES.md как V-04, но причина — рассинхрон prod vs local конфигов.)

**Проверка:** `curl -I https://proboi.site/dashboard` → `X-Frame-Options: DENY`.

**Фикс:** задеплоить актуальный конфиг (rsync `scripts/nginx/` + reload).

---

### N-06. [MEDIUM] `design.proboi.site` без аутентификации — Open Design проксируется всем

**Что:** `design.proboi.site` проксирует порт 17573 (Next.js dev-сервер) без какой-либо аутентификации. Любой знающий домен получает доступ к Open Design app. Если Next.js запущен в dev-режиме, это даёт HMR websocket, source maps, `/__nextjs_original-stack-frame`.

**Проверка:** `curl -I https://design.proboi.site/` → 200 (или 502 если Next.js не запущен, но без auth).

**Фикс:** добавить `auth_basic` или IP allowlist на `location /` в `design.proboi.site.conf`.

---

### N-07. [MEDIUM] HSTS без `preload` — не попадает в браузерный preload-список

**Что:** `Strict-Transport-Security: max-age=31536000; includeSubDomains` — нет флага `preload`. Без него браузер не включит домен в встроенный HSTS preload list. Первый HTTP-запрос до первого HSTS-ответа уязвим к SSL-stripping.

**Проверка:** `curl -I https://proboi.site/ | grep hsts` — нет `preload`.

**Фикс:** добавить `preload` в `security-headers.conf` и зарегистрировать на https://hstspreload.org. Требование: `max-age >= 31536000`, `includeSubDomains`, `preload` — всё уже есть кроме последнего.

---

### N-08. [LOW] OCSP stapling не настроен

**Что:** `ssl_stapling on` не задан в nginx. Клиент при TLS-хендшейке должен делать отдельный OCSP-запрос к CA для проверки отзыва сертификата — это +100–300 мс латентности и зависимость от OCSP-сервера Let's Encrypt.

**Фикс:** добавить в nginx.conf или в каждый HTTPS-блок:
```
ssl_stapling on;
ssl_stapling_verify on;
resolver 1.1.1.1 8.8.8.8 valid=300s;
```

---

### N-09. [LOW] Нет `X-Permitted-Cross-Domain-Policies` и `Permissions-Policy` заголовков

**Что:** `security-headers.conf` включает HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, но пропускает:
- `X-Permitted-Cross-Domain-Policies: none` — предотвращает загрузку Flash/PDF crossdomain.xml
- `Permissions-Policy: camera=(), microphone=(), geolocation=()` — ограничивает API браузера

Не критично, но нужны для A+ на securityheaders.com.

---

## Что проверено и закрыто (не является уязвимостью)

| Вектор | Результат |
|--------|-----------|
| **Directory listing `/u/`** | `autoindex off;` — закрыто |
| **Dotfiles через `/u/`** | `location ~ /\. { deny all; }` работает: curl → 403 |
| **Alias-traversal `/u/../etc/passwd`** | Nginx нормализует путь до proxy: 404, URL-encode → 400 |
| **Symlink follow в `/u/`** | `/var/www/u/<id>` — symlink на `public/` (root:root). Контейнер (uid 1000) не может писать в `public/`. Symlinks внутри vault root не видны nginx. `protect_symlinks=1` в ядре. Вектор закрыт. |
| **Default vhost при IP-доступе** | Нет `default_server` — первый vhost по алфавиту (`dash.proboi.site`) отдаёт 404. Не раскрывает ничего лишнего. |
| **X-Forwarded-For proxy bypass** | nginx ставит `X-Real-IP $remote_addr` — этим гость управлять не может. Приложение использует `X-Real-IP` для IP-фильтра webhook. |
| **CORS misconfiguration** | `Access-Control-Allow-Origin` не возвращается нигде — CORS не включён. |
| **LE autorenewal** | `certbot.timer` активен, последний run 4+ ч назад. |
| **Range-header DoS** | nginx обрабатывает Range штатно. Размер файлов в `public/` невелик — вектор несущественен. |
| **Webhook endpoint в nginx** | Правильно проксирует `X-Real-IP`. Но rate-limit отсутствует (см. N-03). |

---

## Сводная таблица приоритетов (только новые)

| ID | Приоритет | Краткое описание |
|----|-----------|-----------------|
| N-01 | HIGH | Нет CSP на `/u/` — guest XSS на origin proboi.site |
| N-02 | HIGH | TLS 1.0/1.1 включены |
| N-03 | MEDIUM | Нет rate-limit на `/api/` и `/webhook` в prod |
| N-04 | MEDIUM | `server_tokens` не отключён — версия nginx раскрыта |
| N-05 | MEDIUM | `/dashboard` в prod не переопределяет X-Frame-Options (prod/local рассинхрон) |
| N-06 | MEDIUM | `design.proboi.site` без аутентификации |
| N-07 | MEDIUM | HSTS без `preload` |
| N-08 | LOW | OCSP stapling не настроен |
| N-09 | LOW | Отсутствуют Permissions-Policy и X-Permitted-Cross-Domain-Policies |
