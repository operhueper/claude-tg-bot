# Project Knowledge Graph

> Граф строится через `/graphify graphify-input`. Этот файл — место для ручных заметок между запусками graphify.

## Состояние: 2026-05-07 (last `/graphify --update`)

Граф актуален по состоянию на коммит `675efee` + параллельный рефакторинг 07-unified-guest-profile. Seed-файлы: 01–07 в `graphify-input/`. Визуализация: `graphify-out/graph.html`.

Размер графа: **84 узла, 84 ребра, 21 сообщество**. Топ-кластеры: Test Server & Deploy (14), Users/Roles/Onboarding (10), Container Runtime (10), Platform Growth & Risks (9). God-узлы: `test_server_state` (deg 13), `guest_regular` (deg 9), `guest_system_prompt` (5), `request_path` (5), `vault_directories` (5).

Последний прогон `/graphify graphify-input --update`: все 5 изменённых seed-файлов попали в кеш по content-hash, новых нод не добавлено — изменения 07 уже были учтены в предыдущем прогоне.

## Inbox для контейнерных гостей (2026-05-07, коммит 678cd5a)

Бот не мог отдать гостю в контейнере присланный файл неизвестного типа (epub и т.п.): `downloadDocument` сохранял в `/tmp/telegram-bot/`, а этот путь не пробрасывается в контейнер. Фикс: для guests с `containerEnabled=true` файлы теперь падают в `/opt/vault/{userId}/inbox/`. Vault — same-path bind-mount, Claude видит идентичный путь снаружи и внутри. Owner и не-контейнерные гости остаются на TEMP_DIR.

Затронут только `src/handlers/document.ts` (новый хелпер `inboxDirFor(userId)`). Photo/voice/video не трогались — там Claude работает с уже извлечённым контентом, путь к исходному файлу не нужен. Деплой: только на test (proboi-bot), на jinru ждёт подтверждения после live-теста. Подробности — `graphify-input/08-inbox-fix.md`.

## Рефакторинг профилей гостей (2026-05-07)

Параллельный агент убрал понятие именованных пользователей из кода:

- Удалена константа `KSENIA_USER_ID` и ветка `if (isKsenia)` из `src/config.ts`
- Все гости теперь получают одинаковый профиль: deepseek-chat, `maxTurns=20`, `containerEnabled=true`, WebSearch заблокирован
- При одобрении нового гостя через invite-кнопку Docker-контейнер создаётся сразу
- Персонализация теперь только в `system/users.json` (данные), не в коде

Seed-файл с деталями: `graphify-input/07-unified-guest-profile.md`.

После завершения рефакторинга запустить `/graphify graphify-input --update` для обновления графа.

## Idle heartbeat и анонс плана (2026-05-07)

Закрыт пробел «бот молчит и юзер не понимает что он делает». Два слоя:

1. **Анонс плана** — модель сама перед сложной задачей пишет одно предложение «что планирую сделать». Блок «Анонс плана перед работой» добавлен во ВСЕ четыре системных промпта в `src/config.ts`: `buildOwnerSafetyPrompt`, `buildNewGuestSafetyPrompt`, `buildGroupSystemPrompt`, `buildOnboardingPrompt`. Касается всех типов пользователей без исключений.

2. **Heartbeat-фразы без LLM** — новый модуль `src/idle-phrases.ts` с 53 утверждёнными фразами («дискобомбулирую», «чищу бипки», «жонглирую тезисами» и т.п.) + хелпер `pickRandomPhrase(exclude?)`. Класс `IdleHeartbeat` в `src/handlers/streaming.ts`: после 15 сек тишины шлёт ОДНО сообщение с фразой и каждые 3 сек редактирует его (`editMessageText`) новой фразой. На любое событие стрима (`tick()`) сообщение удаляется и таймер 15 сек перезапускается. На `done` — финальная остановка. Заводится в `createStatusCallback` сразу при создании, до первого события от SDK (закрывает «думает внутри у себя» до первого токена).

3. **Защита анонса от удаления.** В `done`-ветке `streaming.ts` логика удаления промежуточных text-сегментов изменена: теперь оставляется и `segmentId === 0` (анонс), но только если общее число сегментов >1. Один сегмент = простой ответ, не трогаем.

Деплой не делался — фича готова к ручному тестированию через `bun run dev`. Перед деплоем на test (proboi-bot) нужна явная команда от пользователя.

## Открытые задачи (из 06-unfinished-and-risks.md)

- [ ] Prod-миграция на jinru: стоп → смена токена → рестарт → retire старого бота
- [ ] Smoke-тест контейнеров end-to-end на proboi-bot
- [ ] Nginx /u/ симлинки на jinru (prod)
- [ ] AAAA DNS/IPv6 TLS
- [ ] hf_llm_mcp — найти модель с живыми провайдерами
- [ ] openrouter.ts: заменить execSync на async
