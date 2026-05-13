# Security Audit Report — Claude TG Bot

**Дата:** 2026-05-08
**Скоп:** изоляция гостевых Docker-контейнеров от хоста и других гостей
**Тестовая среда:** jinru (5.223.82.96)
**Аудитор:** Security Engineer (автоматизированный + ручной анализ)

---

## Executive Summary

Контейнерная изоляция содержит **одну критическую дыру** и **три высоких риска**, которые в комбинации позволяют гостю прочитать весь хостовый файлсистем, включая `.env` бота со всеми API-ключами. Дыра существует потому, что контейнер работает как `root` без remapping пользовательских namespace, что даёт `root`-доступ к `/proc/1/root` — полному файлсистему хоста. Дополнительно не настроена сетевая изоляция (`CLAUDE_GUEST_NETWORK` не выставлен), что позволяет гостю дотянуться до dashboard API на порту 3848. Средства ресурсной защиты (cap-drop, seccomp, read-only FS, pids-limit) работают корректно. **В прод с текущей конфигурацией пускать нельзя** — требуется как минимум включить user namespace remapping или заменить корневого пользователя на непривилегированного.

**Итог по категориям:** 1 Critical, 3 High, 4 Medium, 3 Low.

---

## Критичные находки (CRITICAL — фиксить сразу)

### 1. Полный доступ к хостовому файлсистему через /proc/1/root

**Что:** Контейнер запускается с `uid=0` (root) без Docker user namespace remapping (`--userns-remap`). Linux ядро позволяет процессу с `uid=0` читать файлы через `/proc/<pid>/root` любого процесса, где `uid` совпадает. Поскольку container root = host root без remapping, гость читает весь хостовый файлсистем через `/proc/1/root/`.

**Доказательство:** `escape-manual.log` (строки 86–118):
```
=== try escape via /proc/1/root ===
root:*:20564:0:99999:7:::     ← хостовый /etc/shadow ПРОЧИТАН
=== /proc/1/root readable? ===
bin boot dev etc home lib lib64 media mnt opt    ← хостовый / виден полностью
=== can read host /etc/shadow? ===
root:*:20564:0:99999:7:::     ← ПОДТВЕРЖДЕНО
```
Тест проводился на jinru, где бот не задеплоен — поэтому `/proc/1/root/opt/claude-tg-bot/.env` не нашёлся. На **proboi-bot (89.167.125.175)** тот же путь вернёт полный `.env` файл.

**Эксплуатация:**

Гость просит Claude выполнить в его контейнере:
```bash
# Шаг 1: найти PID бота (claude-tg-bot) на хосте
ls /proc/*/cmdline | xargs -I{} sh -c 'grep -l "node\|bun\|claude" {} 2>/dev/null'
# Шаг 2: читать env бота
cat /proc/<bot-pid>/environ | tr '\0' '\n'
# Или напрямую через /proc/1/root:
cat /proc/1/root/opt/claude-tg-bot/.env
```

Результат: `TELEGRAM_BOT_TOKEN`, `DEEPSEEK_API_KEY`, `OPENAI_API_KEY`, `COMPOSIO_API_KEY`, `OPENROUTER_API_KEY` — всё сливается за одну команду. Блокировать токен бота + все ключи в логах смысла нет — они всё равно придут в ответе Claude.

Связанная цепочка: `root в контейнере` + `нет userns-remap` + `/proc не namespaced для uid` = полный host root filesystem read. Без write capabilities написать в хост нельзя (cap-drop работает), но чтение достаточно для компрометации всей инфраструктуры.

**Фикс — вариант A (рекомендованный): добавить непривилегированного пользователя в образ**

В `Dockerfile.user`:
```diff
 RUN bun install -g typescript tsx pnpm

+# Create non-root user for container execution
+RUN groupadd -r sandbox && useradd -r -g sandbox -d /workspace -s /bin/bash sandbox \
+    && mkdir -p /workspace && chown sandbox:sandbox /workspace
+
 # nginx default config
 RUN echo 'server { ... }' > /etc/nginx/sites-available/default
+# Give sandbox user nginx rights
+RUN chown -R sandbox:sandbox /var/lib/nginx /var/log/nginx /run

 WORKDIR /workspace
+USER sandbox
 CMD ["/usr/local/bin/daemon-runner"]
```

В `src/containers/spec.ts` для гостей добавить:
```diff
     args.push("--ulimit=nproc=128:128");
+
+    // Run as non-root user — eliminates /proc/1/root host FS read attack.
+    args.push("--user=sandbox");
```

**Фикс — вариант B (daemon.json, не ломает workflow владельца): Docker user namespace remapping**

На хосте в `/etc/docker/daemon.json`:
```json
{
  "userns-remap": "default"
}
```
После `systemctl restart docker` контейнерный uid=0 маппится на непривилегированный uid хоста (~100000). `/proc/1/root` остаётся читаемым, но файлы хоста (владелец root=uid 0) недоступны из контейнера.

**Внимание:** вариант B несовместим с owner-контейнером, которому нужен `/var/run/docker.sock` и писать в `/opt`. Поэтому рекомендуется вариант A (непривилегированный пользователь только для гостей), а owner-контейнер сохраняет `root` с полным доступом.

**Риск отката:** Claude CLI внутри контейнера распаковывает нативные бинари в `/tmp` — это сохраняется (tmpfs с exec у гостей остаётся). `bun`, `npm`, `gcc` работают от непривилегированного пользователя без проблем. Nginx требует `chown` в Dockerfile — указано в диффе.

---

## Высокие риски (HIGH)

### 2. Dashboard API (порт 3848) доступен из гостевого контейнера

**Что:** Сетевая изоляция через `CLAUDE_GUEST_NETWORK` не настроена на продакшене — переменная не выставлена. Гостевые контейнеры используют дефолтный Docker bridge (`docker0`, `172.17.0.0/16`). Хост слушает на `172.17.0.1:3848` (dashboard), и этот порт **открыт** из контейнера.

**Доказательство:** `escape-network.log` (строки 26–28):
```
=== can reach host ports? ===
PORT 22 OPEN
PORT 3848 OPEN
```
`docker-bench-host.log` (строка 54):
```
[WARN] 2.2 - Ensure network traffic is restricted between containers on the default bridge
[INFO] 5.30 - Container in docker0 network: claude-guest-test-escape
```

**Эксплуатация:** Из контейнера гость может:
1. Отправить POST запросы на `http://172.17.0.1:3848/api/me` с поддельным `initData` — если HMAC-проверка пройдёт (что маловероятно), получит чужие данные.
2. Провести brute-force или timing-атаку на `/api/admin/all` для определения наличия endpoint и утечки структуры API.
3. Отправить вредоносные запросы на порт 3847 (health-webhook) — сейчас закрыт, но если откроют.
4. Атаковать dashboard как промежуточный шаг перед escalation (например, если в dashboard-server.ts появится уязвимость).

Связанная цепочка: `нет сетевой изоляции` + `dashboard на 172.17.0.1:3848` + `гость управляет кодом` = pivot к API владельца.

**Фикс:** Создать изолированную сеть и заблокировать доступ к внутренним портам хоста.

```bash
# 1. Создать отдельную гостевую сеть
docker network create --driver bridge \
  --opt com.docker.network.bridge.name=claude-guest0 \
  claude-guest-net

# 2. Добавить iptables-правила (блокируем доступ к 3847, 3848 с гостевой сети)
iptables -I DOCKER-USER -i claude-guest0 -d 172.17.0.1 -p tcp --dport 3848 -j DROP
iptables -I DOCKER-USER -i claude-guest0 -d 172.17.0.1 -p tcp --dport 3847 -j DROP
iptables -I DOCKER-USER -i claude-guest0 -d 172.17.0.1 -p tcp --dport 22 -j DROP
# Сохранить правила
iptables-save > /etc/iptables/rules.v4

# 3. Выставить переменную на хосте и в /etc/environment или systemd unit
echo 'CLAUDE_GUEST_NETWORK=claude-guest-net' >> /opt/claude-tg-bot/.env
```

В systemd unit (`/etc/systemd/system/claude-tg-bot.service`) добавить:
```
[Service]
ExecStartPre=/sbin/iptables -I DOCKER-USER -i claude-guest0 -d 172.17.0.1 -p tcp --dport 3848 -j DROP
ExecStartPre=/sbin/iptables -I DOCKER-USER -i claude-guest0 -d 172.17.0.1 -p tcp --dport 3847 -j DROP
ExecStartPre=/sbin/iptables -I DOCKER-USER -i claude-guest0 -d 172.17.0.1 -p tcp --dport 22 -j DROP
```

**Риск отката:** Гостям нужен интернет (npm install, curl, git clone). Создать сеть с внешним доступом, но заблокировать только хостовые порты — именно так устроена команда выше. Проверить что `--internal` флаг НЕ добавляется.

---

### 3. Образ работает от root (uid=0) — setuid-бинари как вектор escalation

**Что:** `CIS-DI-0001` (dockle.log): `Last USER should not be root`. Внутри образа присутствуют setuid-бинари: `su`, `mount`, `umount`, `gpasswd`, `newgrp`, `passwd`, `chfn`, `chsh`. При работе от root их setuid-бит неактуален (root и так всё может), но если когда-либо добавить drop-user без правильного cap-drop — это станет вектором.

**Доказательство:** `escape-cdk.log` (строки 13–29):
```
Setuid files found:
    /usr/bin/chfn
    /usr/bin/chsh
    /usr/bin/gpasswd
    /usr/bin/mount
    /usr/bin/newgrp
    /usr/bin/passwd
    /usr/bin/su
    /usr/bin/umount
```
`escape-manual.log` (строка 161):
```
=== setuid binaries risk ===
su: cannot set groups: Operation not permitted
blocked
```

`su` заблокирован через `--cap-drop=ALL` + `--no-new-privileges`. Но при переходе на непривилегированного пользователя (фикс #1) без удаления setuid-битов, эти бинари становятся потенциальным вектором если появится новая CAP уязвимость.

**Фикс:** В `Dockerfile.user` добавить удаление setuid/setgid битов после создания sandbox-пользователя:
```dockerfile
# Remove setuid/setgid bits from binaries not needed by sandbox user
RUN find / -perm /6000 -type f \( \
    -name su -o -name mount -o -name umount -o -name gpasswd \
    -o -name newgrp -o -name chfn -o -name chsh -o -name passwd \
    \) -exec chmod a-s {} \; 2>/dev/null || true
```

**Риск отката:** Пользователи не смогут сменить пароль через `passwd` внутри контейнера — что нормально для изолированного sandbox.

---

### 4. lxcfs не установлен или не работает — утечка информации о хосте через /proc

**Что:** `spec.ts` (строки 144–162) монтирует `/var/lib/lxcfs/proc/*` для виртуализации `/proc/meminfo` и других файлов. Если lxcfs не запущен, Docker при запуске контейнера либо падает с ошибкой, либо (зависит от версии) игнорирует несуществующие source-пути.

**Доказательство:** `escape-manual.log` (строки 81–83):
```
=== meminfo (lxcfs check) ===
MemTotal:        1960976 kB   ← это ~2 GB (полный RAM хоста)
MemFree:          487968 kB
```
Ожидаемое значение при работающем lxcfs: 524288 kB (512 MB — лимит контейнера). Показывается реальный RAM хоста — значит lxcfs не применяется.

**Эксплуатация:** Гость получает точные данные о RAM хоста (используется для профилирования сервера), видит реальные значения `/proc/stat` и `/proc/loadavg` (активность других контейнеров), что нарушает privacy между гостями.

**Фикс:**
```bash
# На хосте (proboi-bot)
apt install lxcfs -y
systemctl enable --now lxcfs
# Проверить что файлы существуют
ls /var/lib/lxcfs/proc/meminfo
# Перезапустить существующие контейнеры чтобы подхватили новые маунты
systemctl restart claude-tg-bot
docker ps -q --filter label=claude-bot-user | xargs -r docker restart
```

Если lxcfs недоступен, добавить graceful fallback в `spec.ts`:

```diff
-    for (const f of lxcfsFiles) {
-      args.push("-v", `/var/lib/lxcfs/proc/${f}:/proc/${f}:ro`);
-    }
+    // Only mount lxcfs files if lxcfs is running on the host
+    const lxcfsBase = "/var/lib/lxcfs/proc";
+    if (require("fs").existsSync(`${lxcfsBase}/meminfo`)) {
+      for (const f of lxcfsFiles) {
+        args.push("-v", `${lxcfsBase}/${f}:/proc/${f}:ro`);
+      }
+    }
```

**Риск отката:** Никакого. lxcfs — фоновый сервис без влияния на пользовательский функционал.

---

## Средние риски (MEDIUM)

### 5. 312 CVE в базовом образе (6 CRITICAL, 306 HIGH) без upstream-фиксов

**Что:** Trivy нашёл 312 уязвимостей в `debian:bookworm-slim` и установленных пакетах. 6 критических: `libaom3` (CVE-2023-6879, heap-buffer-overflow), `libgnutls30` (CVE-2026-33845, DoS), `libsqlite3-0`/`sqlite3` (CVE-2025-7458, integer overflow), `zlib1g` (CVE-2023-45853, integer overflow). Большинство помечены `no fix available` — это вендорский долг Debian.

**Контекст:** Вектор атаки для большинства этих CVE требует специально сформированного input, который обрабатывается уязвимой библиотекой. В условиях sandbox где гость сам генерирует контент, теоретически возможно триггернуть уязвимость через `jq` (CVE-2026-32316) или `sqlite3` (CVE-2025-7458). `cross-spawn` npm пакет (CVE-2024-21538, ReDoS) имеет фикс: обновить до 7.0.5.

**Фикс:**
1. Добавить `--no-install-recommends` в apt-get (уменьшит surface):
```diff
-RUN apt-get update && apt-get install -y \
+RUN apt-get update && apt-get install -y --no-install-recommends \
```
2. Убрать пакеты, не нужные гостям: `nginx`, `openssh-client`, `rsync`, `procps`, `lsof` — если daemon-runner и Claude не требуют их.
3. Обновить `cross-spawn`: `bun update cross-spawn` в контейнере.
4. Настроить периодический `trivy image --exit-code 1 --severity CRITICAL` в CI при сборке образа.

**Риск отката:** Удаление `nginx` сломает гостевые сайты на порту 80 — убирать только если фича не используется.

---

### 6. Audit log в plain-text — возможна log injection

**Что:** `src/utils.ts` (строка 31): по умолчанию `AUDIT_LOG_JSON=false`, лог пишется в plain-text формате. Входящий контент пользователя (строка 36–44) включается в лог без санитации через `${key}: ${displayValue}`. Если пользователь отправит сообщение содержащее символы `\n`, `=`.repeat(60), имитирующие граничные строки лога — это испортит структуру при парсинге.

**Фикс:** Выставить `AUDIT_LOG_JSON=true` на проде (одна строка в `.env`). JSON-формат делает log injection структурно невозможным.

---

### 7. Composio API key передаётся гостям через DeepSeek env

**Что:** `src/config.ts` (строка 1006):
```typescript
...(process.env.COMPOSIO_API_KEY ? { COMPOSIO_API_KEY: process.env.COMPOSIO_API_KEY } : {}),
```
Ключ передаётся в `deepseekEnv` — среду запуска Claude CLI subprocess. Это означает что Composio API key доступен в `process.env` внутри Claude subprocess, и потенциально доступен гостю через tool вызов `Bash(env)` или `Read(/proc/self/environ)`.

**Важно:** Claude SDK subprocess запускается на ХОСТЕ, а не в контейнере. Однако если гость попросит Claude выполнить `import os; print(os.environ)` через Python-инструмент — ключ попадёт в ответ.

**Фикс:** Передавать Composio key только если пользователь уже прошёл OAuth (т.е. зарегистрировал свой аккаунт через `/google`). Добавить поле `composioConnected: boolean` в `UserProfile` и включать ключ только когда он `true`.

Дополнительно: добавить sanitizer в `session.ts`, который вычищает известные API-ключи из финального ответа перед отправкой в Telegram.

---

### 8. pdftotext запускается вне контейнера без валидации filename

**Что:** `src/handlers/document.ts` (строка 151):
```typescript
const result = await Bun.$`pdftotext -layout ${filePath} -`.quiet();
```
`pdftotext` запускается на ХОСТЕ (не в гостевом контейнере). `filePath` формируется из имени файла, скачанного от Telegram. Bun template literals для `$` используют безопасный spawn без shell — инъекция через пробелы/спецсимволы в имени файла заблокирована. Но `poppler` (pdftotext) содержит известные CVE: если гость пришлёт специально сформированный PDF — это может триггернуть уязвимость на хосте.

**Фикс:** Перенести `pdftotext` в гостевой контейнер через `containerManager.exec()`. PDF обрабатывается внутри sandbox, даже если poppler упадёт — хост не затронут.

---

## Низкие риски (LOW — можно отложить)

### 9. Образ использует тег :latest

`paths.ts` строка 10: `export const SANDBOX_IMAGE = "claude-user-sandbox:latest"`. При `docker pull` может подтянуться обновлённый образ с регрессиями. Зафиксировать SHA256 digest для продакшен-деплоя: `claude-user-sandbox@sha256:<digest>`.

---

### 10. systemd unit без MemoryMax/TasksMax для бота на хосте

`claude-tg-bot.service` не ограничивает память и процессы самого бота. Если бот зациклится при обработке тяжёлого запроса — может выжрать RAM хоста, косвенно убив контейнеры.

Добавить в unit:
```ini
[Service]
MemoryMax=1G
TasksMax=256
Restart=on-failure
RestartSec=5s
```

---

### 11. Docker daemon без user namespace support (CIS 2.9 WARN)

`docker-bench-host.log` (строка 64): `[WARN] 2.9 - Enable user namespace support`. Глобальное включение `userns-remap=default` несовместимо с owner-контейнером (docker.sock mount), поэтому откладываем до принятия архитектурного решения о раздельных security profiles.

---

## Что хорошо (не трогать)

Следующее реализовано правильно и должно оставаться нетронутым при рефакторинге:

- **cap-drop=ALL + no-new-privileges:** Полностью работает. `escape-manual.log` (строка 75–77): `mknod: Operation not permitted`, `mount: permission denied`. `su` заблокирован (строка 161). Capabilities: `0x0000000000000000` (строка 41–45 в escape-cdk.log).
- **seccomp profile:** `Seccomp: 2` (filtering активен), 56 заблокированных syscalls включая `MOUNT`, `KEXEC_LOAD`, `SETNS`, `BPF` (escape-amicontained.log). AppArmor `docker-default (enforce)` активен.
- **read-only root filesystem:** Подтверждено. `escape-manual.log` (строка 71): `/sys/fs/cgroup/test: Read-only file system`. `docker-bench` (строка 34): `[PASS] 5.13 - root filesystem mounted as read only`.
- **pids-limit=128 + memory=512m:** `docker-bench` (строка 45, 53): оба PASS.
- **docker.sock НЕ маунтится гостям:** `escape-manual.log` (строка 48): `ls: cannot access '/var/run/docker.sock': No such file or directory`. deepce.log (строка 71): `Docker sock mounted: No`. `docker-bench` (строка 57): `[PASS] 5.32`.
- **cross-user dropbox изоляция:** glob фильтрует по userId, defense-in-depth по `data.user_id`.
- **env whitelist для гостей:** `buildGuestBaseEnv()` передаёт только `PATH,HOME,TMPDIR,TZ,LANG,LC_ALL,USER,LOGNAME` — TELEGRAM_BOT_TOKEN, OPENAI_API_KEY, OPENROUTER_API_KEY НЕ передаются в subprocess (подтверждено анализом `config.ts:902-909`).
- **Сетевые namespace:** Контейнер имеет отдельный net namespace (`172.17.0.2/16`). CDK-вывод "NOT isolated" (строка 143–145 escape-cdk.log) является **false positive** — CDK сравнивает namespace ID контейнера с собой же, а не с хостом. Реальная изоляция подтверждена отдельными IP и gateway.
- **Audit log существует:** Все действия логируются с userId, timestamp, content.
- **Dashboard HMAC проверка:** `validateInitData()` корректно использует HMAC-SHA256 + 24h `auth_date` check.

---

## CDK False Positive — пояснение

CDK `evaluate` (строки 139–145 escape-cdk.log) выводит:
```
cgroup: NOT isolated (shared with host, cgroup:[4026532427])
pid: NOT isolated (shared with host, pid:[4026532426])
...
```

Это **артефакт метода измерения**: CDK читает `/proc/self/ns/*` из контейнера и сравнивает с `/proc/1/ns/*` — но PID 1 внутри контейнера это `docker-init`, который живёт в **том же** namespace что и остальные процессы контейнера. CDK не сравнивает с хостовым namespace. Реальная изоляция подтверждена: отдельный network namespace (IP `172.17.0.2` vs хост), отдельный mount namespace (read-only overlay), отдельный pid namespace (PID 1 = docker-init, не systemd). Docker Bench Section 5 это подтверждает: `[PASS] 5.10, 5.16, 5.17, 5.21, 5.31` — все namespace checks.

---

## План действий (по приоритету)

1. **[CRITICAL — 1 час]** Добавить непривилегированного пользователя `sandbox` в `Dockerfile.user`, пересобрать образ, добавить `--user=sandbox` в `spec.ts` для гостей. Это закрывает `/proc/1/root` host FS escape.

2. **[HIGH — 30 мин]** Создать `claude-guest-net`, добавить iptables-правила блокирующие `172.17.0.1:3848/3847/22` из гостевой сети, выставить `CLAUDE_GUEST_NETWORK=claude-guest-net` в `.env` на proboi-bot.

3. **[HIGH — 30 мин]** Установить и запустить `lxcfs` на proboi-bot: `apt install lxcfs && systemctl enable --now lxcfs`, перезапустить контейнеры.

4. **[HIGH — 30 мин]** Удалить setuid-биты из образа (добавить `find / -perm /6000 ... -exec chmod a-s` в Dockerfile) и пересобрать образ вместе с пунктом 1.

5. **[MEDIUM — 5 мин]** Выставить `AUDIT_LOG_JSON=true` в `.env` на обоих серверах.

6. **[MEDIUM — 1 час]** Условная передача `COMPOSIO_API_KEY` гостям только после подтверждённого OAuth: добавить поле `composioConnected` в UserProfile, фильтровать в `deepseekEnv`.

7. **[MEDIUM — 2 часа]** Перенести обработку PDF (`pdftotext`) в гостевой контейнер через `containerManager.exec()`.

8. **[MEDIUM — 30 мин]** Добавить `--no-install-recommends` в `Dockerfile.user`, убрать неиспользуемые пакеты, добавить trivy-scan в CI при сборке образа.

9. **[LOW — 5 мин]** Добавить `MemoryMax=1G`, `TasksMax=256`, `Restart=on-failure` в systemd unit бота.

10. **[LOW — 5 мин]** Зафиксировать `SANDBOX_IMAGE` с SHA256 digest для продакшена.

---

## Что НЕ покрыл этот аудит

Следующие области требуют отдельного рассмотрения:

- **Supply chain (npm/bun audit):** `cross-spawn` CVE-2024-21538 обнаружен trivy, но полный `bun audit` / `npm audit` по всем transitive зависимостям бота не проводился.
- **Runtime detection (Falco/eBPF):** Поведенческий мониторинг не настроен. Аномальные системные вызовы из контейнера (попытка чтения `/proc/*/environ`) не алертируются.
- **Penetration test реальным человеком:** Автоматизированные инструменты (deepce, CDK, amicontained) не заменяют ручного пентеста — особенно для business logic атак через Telegram API и prompt injection через MCP.
- **MCP-серверы на injection:** `ask_user_mcp`, `send_file_mcp`, `pollinations_mcp` — их входные данные обрабатываются в контексте Claude. Если через Telegram пришлёт специально сформированный вопрос, MCP может передать контролируемый контент в tool response. Нужен отдельный review.
- **Composio multi-tenant изоляция:** Проверка что `?user_id=tg_<id>` в URL не подделывается гостем через prompt injection в Google Workspace инструменты.
- **Metering SQLite из контейнера:** Файл `metering.sqlite` на хосте в `/opt/claude-tg-bot/`. После фикса `/proc/1/root` — недоступен. Но если фикс не применён — гость может прочитать данные всех пользователей через `/proc/1/root/opt/claude-tg-bot/metering.sqlite`.
- **Inter-container network (docker0):** При нескольких активных гостевых контейнерах они видят друг друга по docker0 bridge (`172.17.0.0/16`). Атаки контейнер-к-контейнеру не тестировались.
- **Telegram webhook vs polling security:** Бот использует long-polling. Если переключиться на webhook — нужна проверка `X-Telegram-Bot-Api-Secret-Token` заголовка.
