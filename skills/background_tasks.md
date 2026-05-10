# Скилл: Долгие задачи в фоне

## Когда применять
- Задача займёт больше 60 секунд
- Анализ большого количества файлов
- Скачивание и обработка видео/аудио
- Парсинг большого сайта
- Обучение/файн-тюнинг модели
- Генерация большого отчёта

## Паттерн запуска

```bash
TASK_ID="task_$(date +%s)"
mkdir -p /workspace/.tasks

# Запуск в фоне: stdout/stderr → .log, статус → .status
nohup bash -c '
  python3 /workspace/scripts/process.py > /workspace/.tasks/'"${TASK_ID}"'.log 2>&1
  if [ $? -eq 0 ]; then
    echo done > /workspace/.tasks/'"${TASK_ID}"'.status
  else
    echo error > /workspace/.tasks/'"${TASK_ID}"'.status
  fi
' &

echo "🚀 Запустил задачу. Пришлю результат когда готово (~N минут)"
```

## Важно после запуска
- **Сразу сообщи пользователю** что задача запущена и он получит уведомление
- **Не жди завершения** — отвечай «работаю, пришлю как готово»
- Scheduler автоматически отслеживает `.status` файлы каждые 30 секунд

## Проверить статус текущей задачи

```bash
# Список активных задач
ls /workspace/.tasks/*.status 2>/dev/null | head -10

# Последние строки лога конкретной задачи
tail -20 /workspace/.tasks/${TASK_ID}.log
```

## Отмена задачи

```bash
# Найти PID фонового процесса
ps aux | grep process.py
kill <PID>
# Или убить всё что связано с задачей:
pkill -f "process.py"
```

## Пример: анализ 100 PDF

```bash
TASK_ID="pdf_analysis_$(date +%s)"
mkdir -p /workspace/.tasks

nohup bash -c '
  cd /workspace
  python3 - <<EOF
import os, pdfplumber

results = []
for f in sorted(os.listdir("inbox"))[:100]:
    if not f.endswith(".pdf"): continue
    with pdfplumber.open(f"inbox/{f}") as pdf:
        text = " ".join(p.extract_text() or "" for p in pdf.pages)
        results.append(f"{f}: {len(text)} chars")

with open("reports/pdf_summary.txt", "w") as out:
    out.write("\n".join(results))
print("Done:", len(results), "files")
EOF
  echo done > /workspace/.tasks/'"${TASK_ID}"'.status
' > /workspace/.tasks/${TASK_ID}.log 2>&1 &

echo "🚀 Анализирую PDF-файлы в фоне, пришлю результат когда готово"
```

## Ограничения
- Max 128 процессов в контейнере (pids-limit) — не запускай тысячи параллельных задач
- Max 512 MB RAM — тяжёлые задачи могут быть убиты OOM killer
- Если контейнер перезапустится — фоновые задачи остановятся (лог сохранится)
