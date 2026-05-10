# Фото чека → таблица

Триггер: «фото чека», «распознай чек», «обработай чеки», «сколько потратил»

Шаги:
1. Изображение уже в vault/inbox/. Используй tesseract для OCR:
   `tesseract image.jpg /tmp/receipt_text -l rus`
2. Распарси текст Python-скриптом (ищи паттерны: название товара, цена)
3. Сохрани в Excel через openpyxl или pandas DataFrame
4. Отправь через mcp__send-file__send_file
