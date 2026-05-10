# CSV/Excel → анализ данных

Триггер: загружен .csv или .xlsx + «проанализируй», «что интересного», «статистика»

Шаги:
1. Файл уже в vault/inbox/
2. Загрузи через pandas:
   ```python
   import pandas as pd
   df = pd.read_csv("file.csv")  # или read_excel для xlsx
   print(df.describe())
   print(df.dtypes)
   print(df.head())
   ```
3. Определи: типы данных, пропуски, диапазоны, топ-значения
4. Построй графики если нужно: matplotlib → сохрани как .png
5. Отправь результат в чате + через mcp__send-file если есть файлы
