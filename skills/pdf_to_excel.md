# PDF → Excel

Триггер: «извлеки таблицу из pdf», «pdf в excel», «переведи pdf в таблицу»

Шаги:
1. Извлеки текст: `pdftotext -layout /path/to/file.pdf /tmp/out.txt`
2. Или для PDF с таблицами: используй pdfplumber через Python:
   ```python
   import pdfplumber, openpyxl
   with pdfplumber.open("file.pdf") as pdf:
       rows = []
       for page in pdf.pages:
           table = page.extract_table()
           if table: rows.extend(table)
   wb = openpyxl.Workbook(); ws = wb.active
   for row in rows: ws.append(row)
   wb.save("result.xlsx")
   ```
3. Отправь через mcp__send-file__send_file с path к result.xlsx
