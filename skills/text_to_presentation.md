# Текст → презентация (.pptx)

Триггер: «сделай презентацию», «N слайдов», «pptx», «создай слайды»

Шаги:
1. Определи тему и количество слайдов из запроса
2. Сгенерируй контент для каждого слайда
3. Создай .pptx через python-pptx:
   ```python
   from pptx import Presentation
   from pptx.util import Inches, Pt
   prs = Presentation()
   for title, content in slides:
       slide = prs.slides.add_slide(prs.slide_layouts[1])
       slide.shapes.title.text = title
       slide.placeholders[1].text = content
   prs.save("presentation.pptx")
   ```
4. Отправь pptx через mcp__send-file__send_file
