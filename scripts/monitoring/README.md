# claude-cpu-monitor

Мониторинг CPU гостевых Docker-контейнеров. Запускается раз в минуту, хранит историю за последний час. Если средний CPU > 70% за 60 минут — уведомляет владельца в канал и пользователя в личку.

## Установка

```bash
sudo bash scripts/monitoring/install.sh
```

Скрипт идемпотентен — повторный запуск безопасен.

## Зависимости

- Docker (docker stats)
- `/etc/claude-firewall/env` с переменными `TELEGRAM_BOT_TOKEN` и `OWNER_PROBLEM_CHANNEL_ID`

## Файлы состояния

- `/var/lib/claude-cpu-monitor/<container>.state` — история последних 60 показаний CPU (CSV)
- `/var/lib/claude-cpu-monitor/<container>.notified` — timestamp последнего уведомления (cooldown 6 часов)
- `/var/log/claude-cpu-monitor.log` — лог работы скрипта

## Тестирование

Запустить busy-loop внутри контейнера пользователя и подождать 60 минут:

```bash
# В контейнере
docker exec -it claude-user-<userId> bash -c "while true; do :; done" &

# Проверить, что история накапливается (через ~5 мин будет 5 точек)
cat /var/lib/claude-cpu-monitor/claude-user-<userId>.state

# Принудительный запуск скрипта (не ждать таймер)
sudo systemctl start claude-cpu-monitor.service

# Логи
tail -f /var/log/claude-cpu-monitor.log
```

Для ускоренного теста можно временно уменьшить `HISTORY_SIZE=5` и `CPU_THRESHOLD=10.0` прямо в `/usr/local/sbin/cpu-monitor.sh`, запустить `systemctl start` 5 раз вручную и убедиться, что уведомления приходят.
