/**
 * Template for the initial dashboard.html placed in a new guest's vault.
 * Generated once during bootstrap. The guest can ask Claude to customize it —
 * add tabs, change colours, add their own data sections, or build something
 * completely different.
 */

export function generateGuestDashboard(userId: number, vaultDir: string): string {
  return `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Мой дашборд</title>
<script src="https://telegram.org/js/telegram-web-app.js"></script>
<script src="https://cdn.jsdelivr.net/npm/echarts@5/dist/echarts.min.js"></script>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  :root {
    --dark: #1A1A2E;
    --accent: #7C3AED;
    --gold: #F59E0B;
    --green: #10B981;
    --bg: #F4F6F9;
    --card: #FFFFFF;
    --text: #2C2C2C;
    --muted: #888;
    --pad: 16px;
  }
  html, body { width: 100%; overflow-x: hidden; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: var(--bg); color: var(--text); -webkit-text-size-adjust: 100%; }

  .header { background: var(--dark); color: white; padding: 14px var(--pad); display: flex; align-items: center; justify-content: space-between; }
  .header h1 { font-size: 16px; font-weight: 700; letter-spacing: .3px; }
  .header .date { font-size: 11px; color: #aaa; }

  .tabs { background: var(--dark); padding: 0; display: flex; gap: 0; border-top: 1px solid #2a2a4a; overflow-x: auto; -webkit-overflow-scrolling: touch; scrollbar-width: none; }
  .tabs::-webkit-scrollbar { display: none; }
  .tab { padding: 11px 14px; font-size: 12px; font-weight: 600; cursor: pointer; color: #888; border-bottom: 3px solid transparent; transition: all .2s; white-space: nowrap; flex-shrink: 0; }
  .tab:hover { color: #ccc; }
  .tab.active { color: white; border-bottom-color: var(--accent); }

  .content { display: none; padding: 16px var(--pad); width: 100%; }
  .content.active { display: block; }

  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 10px; margin-bottom: 16px; }
  .card { background: var(--card); border-radius: 12px; padding: 14px; box-shadow: 0 2px 8px rgba(0,0,0,.07); }
  .card .label { font-size: 10px; text-transform: uppercase; letter-spacing: .8px; color: var(--muted); margin-bottom: 4px; }
  .card .value { font-size: 20px; font-weight: 700; color: var(--dark); }
  .card .sub { font-size: 11px; color: var(--muted); margin-top: 3px; }
  .card.accent { border-left: 4px solid var(--accent); }
  .card.gold { border-left: 4px solid var(--gold); }
  .card.green { border-left: 4px solid var(--green); }

  .section-title { font-size: 14px; font-weight: 700; color: var(--dark); margin-bottom: 10px; display: flex; align-items: center; gap: 8px; }

  /* ── HINT BLOCK ── */
  .hint-block {
    background: linear-gradient(135deg, #7C3AED22, #7C3AED08);
    border: 1px solid #7C3AED33;
    border-radius: 14px;
    padding: 20px;
    margin-bottom: 16px;
  }
  .hint-block h2 { font-size: 18px; font-weight: 800; color: var(--dark); margin-bottom: 8px; }
  .hint-block p { font-size: 13px; color: var(--muted); line-height: 1.6; margin-bottom: 8px; }
  .hint-block ul { font-size: 12px; color: #555; line-height: 1.8; padding-left: 18px; }
  .hint-block code { background: #f0eafb; color: #7C3AED; padding: 1px 6px; border-radius: 4px; font-size: 11px; }

  /* ── TASKS ── */
  .task-list { background: var(--card); border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,.07); margin-bottom: 16px; }
  .task-row { display: flex; align-items: flex-start; gap: 10px; padding: 12px 14px; border-bottom: 1px solid #F0F0F0; }
  .task-row:last-child { border-bottom: none; }
  .task-row .tag { font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 20px; white-space: nowrap; flex-shrink: 0; margin-top: 1px; }
  .tag-todo { background: #EDE9FE; color: var(--accent); }
  .tag-done { background: #D1FAE5; color: var(--green); }
  .tag-must { background: #FEF3C7; color: #B45309; }
  .task-row .task-text { font-size: 13px; flex: 1; line-height: 1.4; }
  .task-row .task-date { font-size: 11px; color: var(--muted); white-space: nowrap; flex-shrink: 0; }

  /* ── CHART ── */
  #demo-chart { width: 100%; height: 220px; background: var(--card); border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,.07); }

  /* ── ANIMATIONS ── */
  @keyframes cardIn { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
  .card.animate { animation: cardIn .35s ease both; }
  @keyframes slideInFromRight { from { opacity: 0; transform: translateX(30px); } to { opacity: 1; transform: translateX(0); } }
  @keyframes slideOutToLeft { from { opacity: 1; transform: translateX(0); } to { opacity: 0; transform: translateX(-30px); } }
  .slide-in { animation: slideInFromRight 200ms ease both; }
  .slide-out { animation: slideOutToLeft 200ms ease both; }

  .footer { text-align: center; padding: 16px; font-size: 11px; color: var(--muted); }
</style>
</head>
<body>

<div class="header">
  <h1>✨ Мой дашборд</h1>
  <span class="date" id="current-date"></span>
</div>

<div class="tabs">
  <div class="tab active" onclick="switchTab('home', this)">🏠 Главная</div>
  <div class="tab" onclick="switchTab('tasks', this)">✅ Задачи</div>
  <div class="tab" onclick="switchTab('stats', this)">📊 Статистика</div>
</div>

<!-- ═══ HOME ═══ -->
<div class="content active" id="tab-home">

  <div class="hint-block">
    <h2>👋 Это твой дашборд</h2>
    <p>Он создан как стартовый шаблон — можно полностью кастомизировать под себя или создать новый с нуля.</p>
    <ul>
      <li>Скажи мне <strong>«добавь вкладку с питанием»</strong> — добавлю</li>
      <li>Скажи <strong>«измени цвета на синие»</strong> — изменю</li>
      <li>Скажи <strong>«добавь граф памяти»</strong> — добавлю интерактивную сеть знаний</li>
      <li>Скажи <strong>«пересоздай дашборд полностью»</strong> — расскажи что хочешь видеть</li>
    </ul>
    <p style="margin-top:12px;">Файл: <code>/opt/vault/${userId}/dashboard.html</code></p>
  </div>

  <div class="grid">
    <div class="card accent">
      <div class="label">Дашборд</div>
      <div class="value">Активен</div>
      <div class="sub">Готов к кастомизации</div>
    </div>
    <div class="card gold">
      <div class="label">Память</div>
      <div class="value">Граф</div>
      <div class="sub">Связи и контекст</div>
    </div>
    <div class="card green">
      <div class="label">Ассистент</div>
      <div class="value">Онлайн</div>
      <div class="sub">Отвечает в Telegram</div>
    </div>
  </div>

  <div class="section-title">💡 Примеры что можно добавить</div>
  <div class="task-list">
    <div class="task-row">
      <span class="tag tag-todo">ИДЕЯ</span>
      <span class="task-text">Трекер привычек — ежедневные чекбоксы</span>
    </div>
    <div class="task-row">
      <span class="tag tag-todo">ИДЕЯ</span>
      <span class="task-text">Питание и КБЖУ — трекер калорий и БЖУ</span>
    </div>
    <div class="task-row">
      <span class="tag tag-todo">ИДЕЯ</span>
      <span class="task-text">Цели и прогресс — визуальные прогресс-бары</span>
    </div>
    <div class="task-row">
      <span class="tag tag-todo">ИДЕЯ</span>
      <span class="task-text">Граф памяти — интерактивная сеть знаний</span>
    </div>
    <div class="task-row">
      <span class="tag tag-todo">ИДЕЯ</span>
      <span class="task-text">Финансы — расходы, бюджет, категории</span>
    </div>
    <div class="task-row">
      <span class="tag tag-todo">ИДЕЯ</span>
      <span class="task-text">Список чтения / подкасты / фильмы</span>
    </div>
  </div>

</div>

<!-- ═══ TASKS ═══ -->
<div class="content" id="tab-tasks">

  <div class="section-title">✅ Мои задачи</div>
  <div class="task-list">
    <div class="task-row">
      <span class="tag tag-must">ВАЖНО</span>
      <span class="task-text">Кастомизировать этот дашборд под себя</span>
      <span class="task-date">сегодня</span>
    </div>
    <div class="task-row">
      <span class="tag tag-todo">TODO</span>
      <span class="task-text">Добавить свои задачи — скажи ассистенту</span>
    </div>
    <div class="task-row">
      <span class="tag tag-done">ГОТОВО</span>
      <span class="task-text" style="text-decoration:line-through;color:var(--muted)">Подключиться к боту</span>
    </div>
  </div>

</div>

<!-- ═══ STATS ═══ -->
<div class="content" id="tab-stats">

  <div class="section-title">📊 Пример графика</div>
  <div id="demo-chart"></div>

  <div style="margin-top:16px;">
    <div class="card">
      <div class="label">Подсказка</div>
      <div class="value" style="font-size:14px;font-weight:600;">Скажи что отслеживать</div>
      <div class="sub">Ассистент добавит нужные данные и графики</div>
    </div>
  </div>

</div>

<div class="footer">Клод · дашборд обновляется</div>

<script>
  const tg = window.Telegram && window.Telegram.WebApp;
  if (tg) { tg.ready(); tg.expand(); }

  // Set current date
  const d = new Date();
  document.getElementById('current-date').textContent = d.toLocaleDateString('ru-RU', {weekday:'short', day:'numeric', month:'long'});

  function switchTab(name, el) {
    const currentContent = document.querySelector('.content.active');
    const nextContent = document.getElementById('tab-' + name);
    if (currentContent === nextContent) return;

    currentContent.classList.add('slide-out');
    currentContent.addEventListener('animationend', function onOut() {
      currentContent.removeEventListener('animationend', onOut);
      currentContent.classList.remove('active', 'slide-out');
      nextContent.classList.add('active', 'slide-in');
      nextContent.addEventListener('animationend', function onIn() {
        nextContent.removeEventListener('animationend', onIn);
        nextContent.classList.remove('slide-in');
        if (name === 'stats') renderDemoChart();
      }, { once: true });
    }, { once: true });

    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    el.classList.add('active');
  }

  function renderDemoChart() {
    var el = document.getElementById('demo-chart');
    if (!el || el._initialized) return;
    el._initialized = true;
    var chart = echarts.init(el);
    chart.setOption({
      animation: true,
      grid: { top: 20, right: 20, bottom: 30, left: 40 },
      xAxis: { type: 'category', data: ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'], axisLine: { lineStyle: { color: '#ddd' } }, axisLabel: { color: '#888', fontSize: 11 } },
      yAxis: { type: 'value', splitLine: { lineStyle: { color: '#f0f0f0' } }, axisLabel: { color: '#888', fontSize: 11 } },
      series: [{
        type: 'bar',
        data: [3, 5, 2, 8, 6, 4, 7],
        itemStyle: {
          borderRadius: [6,6,0,0],
          color: {
            type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [{ offset: 0, color: '#7C3AED' }, { offset: 1, color: '#7C3AED44' }]
          }
        }
      }]
    });
    window.addEventListener('resize', function() { chart.resize(); });
  }
</script>
</body>
</html>`;
}
