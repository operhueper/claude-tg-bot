# claude-firewall

Firewall и egress-мониторинг для Docker-контейнеров гостей бота.

## Что делает

- Блокирует TCP/25 (SMTP) из подсети 172.17.0.0/16, логирует через NFLOG group 25.
- Rate-limit на TCP/465 и TCP/587: не более 30 новых соединений/час на контейнер.
- Считает суточный egress каждого контейнера; при достижении 20 GB/день — throttle через `tc htb` до 100 KB/s.
- В полночь сбрасывает счётчики и снимает throttle.
- Отправляет алерты в Telegram-канал (один раз на событие/день).

## Установка

```bash
sudo bash scripts/firewall/install.sh
```

После установки заполнить `/etc/claude-firewall/env`:

```
TELEGRAM_BOT_TOKEN=<токен бота>
OWNER_PROBLEM_CHANNEL_ID=<chat_id канала>
```

## Просмотр статистики

```bash
# Суточный egress по контейнерам (байты)
cat /var/lib/claude-firewall/egress-*.byte

# Кто сейчас throttled
ls /var/lib/claude-firewall/throttled-*.flag 2>/dev/null

# Лог событий throttle
tail -50 /var/log/claude-egress.log

# Статус сервиса
systemctl status claude-firewall.service
journalctl -u claude-egress-monitor.service --since "1 hour ago"
```

## Удаление

```bash
sudo bash scripts/firewall/uninstall.sh
# Опционально: rm -rf /var/lib/claude-firewall /etc/claude-firewall
```

## DOCKER-USER mirror rules (defense-in-depth)

`docker-user-rules.sh` зеркалирует блокировки из INPUT-цепочки в DOCKER-USER.
Это защищает на случай, если гостевой трафик пойдёт через FORWARD
(другой bridge, новая гостевая сеть, изменение роутинга).

### Применить на свежем сервере

```bash
# 1. INPUT-цепочка (основные правила)
sudo bash scripts/firewall/setup-firewall.sh

# 2. DOCKER-USER mirror
sudo bash scripts/firewall/docker-user-rules.sh

# 3. Сохранить правила (пережить перезагрузку)
iptables-save > /etc/iptables/rules.v4
```

### Добавить в claude-tg-bot.service (правила переживут рестарт Docker)

Добавь в секцию `[Service]` юнита (файл на сервере, не в репо):

```ini
ExecStartPre=/opt/claude-tg-bot/scripts/firewall/docker-user-rules.sh
```

### Проверить

```bash
iptables -L DOCKER-USER -n -v
# Должны быть 3 DROP-правила на интерфейс claude-guest0 (порты 22, 3847, 3848).
```

### Идемпотентность

Скрипт использует `iptables -C` перед каждым `iptables -I` — повторный запуск
не дублирует правила, только выводит `[docker-user-rules] done`.
