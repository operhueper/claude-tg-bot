# Скилл: Создать своего Telegram-бота

## Когда применять
- Пользователь говорит «сделай мне бота», «хочу своего телеграм-бота», «помоги создать бота»
- Пользователь хочет бота, который работает когда он не в чате

## Лимит
**Максимум 3 пользовательских бота одновременно** (системный scheduler не в счёт).  
Перед созданием нового: `grep -c "name:" /workspace/.daemons.yaml` — если ≥ 4 (с scheduler), предложи отключить старый.

## Алгоритм

### 1. Получи токен от BotFather
Попроси пользователя создать бота в @BotFather и прислать токен:
```
Чтобы создать своего бота:
1. Напиши в @BotFather команду /newbot
2. Придумай имя и username (оканчивается на Bot)
3. Скопируй токен вида 1234567890:AABBcc...
```
Используй mcp__ask-user для получения токена (он не попадёт в логи).

### 2. Создай структуру проекта
```bash
BOT_NAME="my_bot"   # замени на нормальное имя из диалога
mkdir -p /workspace/projects/${BOT_NAME}
cd /workspace/projects/${BOT_NAME}
```

### 3. Выбери шаблон по запросу пользователя

#### Python (простой echo-бот)
```python
# bot.py
import os, logging
from telegram import Update
from telegram.ext import ApplicationBuilder, CommandHandler, MessageHandler, filters, ContextTypes

logging.basicConfig(level=logging.INFO)
TOKEN = os.environ["BOT_TOKEN"]

async def start(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text("Привет! Я работаю 🚀")

async def echo(update: Update, ctx: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text(update.message.text)

app = ApplicationBuilder().token(TOKEN).build()
app.add_handler(CommandHandler("start", start))
app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, echo))
app.run_polling()
```

Установить зависимости: `pip install python-telegram-bot`

#### Bun/TypeScript (если пользователь хочет JS)
```typescript
// bot.ts
import { Bot } from "grammy";
const bot = new Bot(process.env.BOT_TOKEN!);
bot.command("start", ctx => ctx.reply("Привет! 🚀"));
bot.on("message:text", ctx => ctx.reply(ctx.message.text));
bot.start();
```

Установить: `bun add grammy`

### 4. Сохрани токен в .env
```bash
echo "BOT_TOKEN=<токен>" > /workspace/projects/${BOT_NAME}/.env
chmod 600 /workspace/projects/${BOT_NAME}/.env
```

### 5. Проверь что бот запускается
```bash
cd /workspace/projects/${BOT_NAME}
# Python:
BOT_TOKEN=$(grep BOT_TOKEN .env | cut -d= -f2) timeout 8 python3 bot.py || true
# Bun:
BOT_TOKEN=$(grep BOT_TOKEN .env | cut -d= -f2) timeout 8 bun bot.ts || true
```
Если вышел с ошибкой импорта — почини сначала, потом включай.

### 6. Зарегистрируй в daemon-runner
Добавь в `/workspace/.daemons.yaml`:
```yaml
  - name: ${BOT_NAME}
    cmd: ["python3", "/workspace/projects/${BOT_NAME}/bot.py"]
    # или для Bun: ["bun", "/workspace/projects/${BOT_NAME}/bot.ts"]
    workdir: /workspace/projects/${BOT_NAME}
    env:
      BOT_TOKEN: "<токен>"
    enabled: true
```

После сохранения файла бот запустится автоматически через ~5 секунд.  
Логи: `/workspace/logs/${BOT_NAME}.log`

### 7. Проверь что работает
```bash
tail -20 /workspace/logs/${BOT_NAME}.log
```
Должна быть строка вроде `Started polling` или `Application started`.  
Напиши в свой бот `/start` — должен ответить.

## Если бот падает
```bash
# Последние 50 строк лога
tail -50 /workspace/logs/${BOT_NAME}.log
# Запустить вручную чтобы увидеть ошибку
cd /workspace/projects/${BOT_NAME}
BOT_TOKEN=<токен> python3 bot.py
```

## Доработка функционала
После базового запуска пользователь может описывать что должен делать бот — дорабатывай bot.py/bot.ts в чате. daemon-runner автоматически перезапустит процесс после изменений файла (следит за crashloop).
