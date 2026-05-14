# Спека: gVisor для изоляции гостевых контейнеров

> Дата: 2026-05-14  
> Статус: **ПЛАНИРОВАНИЕ**  
> Приоритет: средний (после arch-migration-rf-db)

---

## Цель

Заменить стандартный Docker runtime (`runc`) на gVisor (`runsc`) для гостевых контейнеров. Это добавляет userspace-ядро между контейнером и хостом: syscalls гостя не уходят напрямую к хостовому ядру, а обрабатываются изолированным процессом `runsc`. Kernel CVE перестаёт быть вектором escape для гостей.

**Что не меняется:** Docker API, docker-compose, containerManager.ts — всё остаётся. gVisor — это runtime, drop-in замена на уровне одного параметра.

---

## Контекст

Текущая схема: `runc` (стандартный Docker runtime). Shared kernel с хостом. Kernel exploit → escape несмотря на userns-remap и firewall.

gVisor (Google): каждый контейнер получает свой userspace-kernel (`Sentry`). Syscall из контейнера → `Sentry` (userspace) → минимальный набор host-syscalls. Используется в Google Cloud Run, GKE Sandbox.

---

## Ограничения gVisor

Перед деплоем проверить совместимость:

| Компонент | Совместимость | Примечание |
|---|---|---|
| Python / Node / Bun | ✅ | Работает |
| LibreOffice | ⚠️ | Требует проверки — сложный IPC |
| ffmpeg | ✅ | Работает |
| Docker volumes (bind-mount) | ✅ | `/opt/vault` монтируется нормально |
| `/proc`, `/sys` | ⚠️ | Частично виртуализированы — некоторые команды возвращают другие данные |
| `docker stats` (из хоста) | ⚠️ | Метрики могут отличаться |
| Performance | ~15-20% overhead | CPU-интенсивные задачи медленнее |

---

## Этапы

### Этап 0: Проверка на jinru (TEST)

```bash
# Установить gVisor
curl -fsSL https://gvisor.dev/archive.key | gpg --dearmor -o /usr/share/keyrings/gvisor-archive-keyring.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/gvisor-archive-keyring.gpg] https://storage.googleapis.com/gvisor/releases release main" \
  > /etc/apt/sources.list.d/gvisor.list
apt update && apt install -y runsc

# Зарегистрировать runtime в Docker
runsc install
systemctl restart docker
```

- [ ] Убедиться что `docker info | grep Runtimes` содержит `runsc`
- [ ] Запустить тестовый контейнер с `--runtime=runsc` и проверить базовые команды
- [ ] Запустить sandbox-образ `claude-user-sandbox` с runsc, прогнать smoke-тест

### Этап 1: Smoke-тест гостевых инструментов под runsc

Для каждого инструмента sandbox-образа:
- [ ] `python3 -c "import pandas, numpy, matplotlib"` — OK
- [ ] `pdftotext /tmp/test.pdf -` — OK
- [ ] `node -e "console.log('ok')"` — OK
- [ ] `bun --version` — OK
- [ ] `ffmpeg -version` — OK
- [ ] LibreOffice: `libreoffice --headless --convert-to pdf test.docx` — проверить отдельно

### Этап 2: Включить runsc для гостей в containerManager.ts

```typescript
// src/containers/manager.ts — в createContainer()
const runtimeFlag = isGuest ? '--runtime=runsc' : '';
// добавить в docker run args
```

Альтернатива: настроить Docker daemon так, чтобы `runsc` был default runtime только для конкретной сети (`claude-guest0`). Тогда код не меняется.

- [ ] Определить подход (код vs daemon config)
- [ ] Реализовать
- [ ] `bun run typecheck` — без ошибок
- [ ] Рестарт бота на jinru, smoke-тест через Telegram

### Этап 3: Деплой на proboi-bot (PROD)

> Без явного подтверждения Евгения не деплоить.

- [ ] Повторить установку runsc на `89.167.125.175`
- [ ] Пересобрать контейнеры (или дать умереть и воскреснуть через init())
- [ ] Мониторить логи 30 мин после деплоя

---

## Rollback

```bash
# Вернуть стандартный runtime
# В manager.ts убрать --runtime=runsc
# или в daemon.json вернуть default-runtime: "runc"
systemctl restart docker
systemctl restart claude-tg-bot
```

---

## Что не входит в эту спеку

- Замена Docker на Firecracker/Kata (другой уровень сложности)
- CPU/network limits (отдельная задача, независима от runtime)
- Перенос owner-сессии на runsc (owner на runc, гости на runsc)
