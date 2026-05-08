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
