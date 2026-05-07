/**
 * Telegram Mini App dashboard template.
 * Rendered server-side as a single HTML string, fetches live data from /api/me
 * (and /api/admin/all for admins) using Telegram WebApp initData for auth.
 */

export function renderDashboard(): string {
  return `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<title>proboi</title>
<script src="https://telegram.org/js/telegram-web-app.js"></script>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --bg:      var(--tg-theme-bg-color,       #1c1c1e);
    --bg2:     var(--tg-theme-secondary-bg-color, #2c2c2e);
    --text:    var(--tg-theme-text-color,     #ffffff);
    --hint:    var(--tg-theme-hint-color,     #8e8e93);
    --link:    var(--tg-theme-link-color,     #0a84ff);
    --btn:     var(--tg-theme-button-color,   #0a84ff);
    --btn-txt: var(--tg-theme-button-text-color, #ffffff);
    --pad: 16px;
    --radius: 12px;
  }

  html, body {
    width: 100%;
    min-height: 100vh;
    overflow-x: hidden;
    background: var(--bg);
    color: var(--text);
    font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', system-ui, sans-serif;
    -webkit-text-size-adjust: 100%;
  }

  /* ── LAYOUT ── */
  .page {
    max-width: 600px;
    margin: 0 auto;
    padding: 0 0 32px;
  }

  /* ── HEADER ── */
  .header {
    padding: 20px var(--pad) 14px;
    border-bottom: 1px solid rgba(255,255,255,.08);
  }
  .header-logo {
    font-size: 22px;
    font-weight: 800;
    letter-spacing: -0.5px;
    color: var(--text);
    margin-bottom: 8px;
  }
  .header-user {
    display: flex;
    align-items: baseline;
    gap: 8px;
    flex-wrap: wrap;
  }
  .header-name {
    font-size: 16px;
    font-weight: 600;
    color: var(--text);
  }
  .header-role {
    font-size: 12px;
    color: var(--hint);
  }
  .header-model {
    font-size: 11px;
    color: var(--hint);
    margin-top: 3px;
  }

  /* ── CARDS ── */
  .card {
    background: var(--bg2);
    border-radius: var(--radius);
    padding: var(--pad);
    margin: 12px var(--pad) 0;
  }
  .card-title {
    font-size: 13px;
    font-weight: 700;
    color: var(--hint);
    text-transform: uppercase;
    letter-spacing: .5px;
    margin-bottom: 14px;
  }

  /* ── TOKEN ROWS ── */
  .token-row {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    padding: 5px 0;
    border-bottom: 1px solid rgba(255,255,255,.05);
  }
  .token-row:last-of-type { border-bottom: none; }
  .token-label { font-size: 14px; color: var(--text); }
  .token-value { font-size: 14px; font-weight: 600; color: var(--text); font-variant-numeric: tabular-nums; }
  .token-cost {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    padding: 10px 0 4px;
    border-top: 1px solid rgba(255,255,255,.12);
    margin-top: 6px;
  }
  .token-cost .token-label { font-weight: 600; }
  .token-cost .token-value { font-size: 17px; color: var(--btn); }
  .card-footnote {
    font-size: 11px;
    color: var(--hint);
    margin-top: 10px;
    line-height: 1.5;
  }

  /* ── PROGRESS BAR ── */
  .res-row {
    margin-bottom: 14px;
  }
  .res-row:last-child { margin-bottom: 0; }
  .res-header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin-bottom: 6px;
  }
  .res-label { font-size: 14px; color: var(--text); }
  .res-value { font-size: 13px; color: var(--hint); font-variant-numeric: tabular-nums; }
  .progress-track {
    height: 5px;
    background: rgba(255,255,255,.12);
    border-radius: 3px;
    overflow: hidden;
  }
  .progress-fill {
    height: 100%;
    background: var(--btn);
    border-radius: 3px;
    transition: width .4s ease;
  }
  .res-notice {
    font-size: 14px;
    color: var(--hint);
    line-height: 1.5;
  }

  /* ── BUTTONS ── */
  .btn-list {
    padding: 0 var(--pad);
    margin-top: 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .btn {
    display: block;
    width: 100%;
    padding: 13px var(--pad);
    background: var(--btn);
    color: var(--btn-txt);
    border: none;
    border-radius: var(--radius);
    font-size: 15px;
    font-weight: 600;
    text-align: center;
    text-decoration: none;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
  }
  .btn:active { opacity: .8; }
  .btn-secondary {
    background: var(--bg2);
    color: var(--link);
  }

  /* ── ADMIN TABLE ── */
  .admin-section {
    margin: 12px var(--pad) 0;
  }
  .admin-title {
    font-size: 13px;
    font-weight: 700;
    color: var(--hint);
    text-transform: uppercase;
    letter-spacing: .5px;
    margin-bottom: 12px;
    padding: var(--pad) var(--pad) 0;
  }
  .admin-table-wrap {
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
    background: var(--bg2);
    border-radius: var(--radius);
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
  }
  thead th {
    padding: 10px 12px;
    text-align: left;
    font-size: 11px;
    font-weight: 600;
    color: var(--hint);
    text-transform: uppercase;
    letter-spacing: .4px;
    border-bottom: 1px solid rgba(255,255,255,.08);
    white-space: nowrap;
  }
  tbody td {
    padding: 9px 12px;
    color: var(--text);
    border-bottom: 1px solid rgba(255,255,255,.05);
    white-space: nowrap;
  }
  tbody tr:last-child td { border-bottom: none; }
  .td-mono { font-variant-numeric: tabular-nums; }

  /* ── ERROR / STATE SCREENS ── */
  .state-screen {
    display: none;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 60vh;
    padding: 32px var(--pad);
    text-align: center;
  }
  .state-screen.visible { display: flex; }
  .state-icon { font-size: 48px; margin-bottom: 16px; }
  .state-title { font-size: 18px; font-weight: 700; color: var(--text); margin-bottom: 8px; }
  .state-desc { font-size: 14px; color: var(--hint); line-height: 1.6; max-width: 320px; }

  /* ── SKELETON LOADER ── */
  .skeleton {
    background: linear-gradient(90deg, rgba(255,255,255,.06) 25%, rgba(255,255,255,.12) 50%, rgba(255,255,255,.06) 75%);
    background-size: 200% 100%;
    animation: shimmer 1.4s infinite;
    border-radius: 4px;
    height: 16px;
    margin: 6px 0;
  }
  @keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
</style>
</head>
<body>

<!-- ═══ STATE: NOT TELEGRAM ═══ -->
<div class="state-screen" id="screen-not-telegram">
  <div class="state-icon">📵</div>
  <div class="state-title">Дашборд работает только из Telegram</div>
  <div class="state-desc">Открой бота @proboiAI_bot и нажми /dashboard</div>
</div>

<!-- ═══ STATE: UNAUTHORIZED ═══ -->
<div class="state-screen" id="screen-unauthorized">
  <div class="state-icon">🔐</div>
  <div class="state-title">Не удалось проверить подпись</div>
  <div class="state-desc">Подпись Telegram не прошла проверку. Попробуй переоткрыть дашборд из бота.</div>
</div>

<!-- ═══ STATE: FORBIDDEN ═══ -->
<div class="state-screen" id="screen-forbidden">
  <div class="state-icon">🚫</div>
  <div class="state-title">Нет доступа</div>
  <div class="state-desc">У тебя нет доступа к боту. Попроси приглашение у <a href="https://t.me/ev_mironoff" style="color:var(--link)">@ev_mironoff</a></div>
</div>

<!-- ═══ STATE: NETWORK ERROR ═══ -->
<div class="state-screen" id="screen-error">
  <div class="state-icon">⚠️</div>
  <div class="state-title">Не удалось загрузить данные</div>
  <div class="state-desc">Что-то пошло не так при загрузке. Попробуй позже или обнови страницу.</div>
</div>

<!-- ═══ STATE: LOADING ═══ -->
<div class="state-screen visible" id="screen-loading">
  <div class="page" style="width:100%;padding:20px var(--pad)">
    <div class="skeleton" style="height:28px;width:80px;margin-bottom:16px"></div>
    <div class="skeleton" style="width:60%;margin-bottom:6px"></div>
    <div class="skeleton" style="width:40%;margin-bottom:24px"></div>
    <div class="skeleton" style="height:120px;border-radius:12px;margin-bottom:12px"></div>
    <div class="skeleton" style="height:100px;border-radius:12px"></div>
  </div>
</div>

<!-- ═══ MAIN CONTENT ═══ -->
<div id="screen-main" style="display:none">
  <div class="page">

    <!-- 1. Шапка -->
    <div class="header">
      <div class="header-logo">proboi</div>
      <div class="header-user">
        <span class="header-name" id="user-label"></span>
        <span class="header-role" id="user-role"></span>
      </div>
      <div class="header-model" id="user-model"></div>
    </div>

    <!-- 2. Карточка токенов -->
    <div class="card" id="card-tokens">
      <div class="card-title">Сколько ты потратил</div>
      <div class="token-row">
        <span class="token-label">Входящих токенов</span>
        <span class="token-value" id="tok-input"></span>
      </div>
      <div class="token-row">
        <span class="token-label">Исходящих токенов</span>
        <span class="token-value" id="tok-output"></span>
      </div>
      <div class="token-row" id="row-cache-read" style="display:none">
        <span class="token-label">Из кэша</span>
        <span class="token-value" id="tok-cache-read"></span>
      </div>
      <div class="token-row" id="row-cache-create" style="display:none">
        <span class="token-label">Создание кэша</span>
        <span class="token-value" id="tok-cache-create"></span>
      </div>
      <div class="token-cost">
        <span class="token-label">Примерная стоимость</span>
        <span class="token-value" id="tok-cost"></span>
      </div>
      <div class="card-footnote">считаем с момента запуска счётчика; рассчитано по тарифам моделей</div>
    </div>

    <!-- 3. Карточка ресурсов -->
    <div class="card" id="card-resources">
      <div class="card-title">Сколько занято в твоём контейнере</div>
      <div id="res-content"></div>
    </div>

    <!-- 4. Кнопки -->
    <div class="btn-list">
      <a id="btn-public" class="btn btn-secondary" href="#" target="_blank">Открыть публичную страничку</a>

      <button class="btn btn-secondary" onclick="reloadData()">Обновить</button>
    </div>

    <!-- 5. Админская секция -->
    <div id="admin-section" style="display:none">
      <div class="admin-title">По всем пользователям</div>
      <div class="admin-section">
        <div class="admin-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Имя</th>
                <th>Модель</th>
                <th>Токены</th>
                <th>Стоимость</th>
                <th>ОЗУ %</th>
                <th>Диск МБ</th>
              </tr>
            </thead>
            <tbody id="admin-table-body"></tbody>
          </table>
        </div>
      </div>
    </div>

  </div>
</div>

<script>
  // ─── MOCK DATA ────────────────────────────────────────────────────────────
  const MOCK = location.search.includes('mock=1');

  const MOCK_ME = {
    ok: true,
    user: {
      id: 292228713,
      label: 'Евгений',
      role: 'owner',
      model: 'claude-sonnet-4-6',
      vaultDir: '/opt/vault/292228713',
      publicUrl: 'https://proboi.site/u/evgeniy'
    },
    totals: {
      inputTokens: 12345,
      outputTokens: 6789,
      cacheReadTokens: 1234,
      cacheCreationTokens: 567,
      costUsd: 0.42
    },
    container: {
      exists: true,
      running: true,
      ram: { usedMb: 123, limitMb: 512, percent: 24 },
      cpu: { percent: 15 },
      disk: { usedMb: 47 }
    },
    isAdmin: true
  };

  const MOCK_ADMIN = {
    ok: true,
    users: [
      { user: { label: 'Евгений', model: 'claude-sonnet-4-6' }, totals: { inputTokens: 12345, outputTokens: 6789, costUsd: 0.42 }, container: { exists: true, running: true, ram: { percent: 24 }, disk: { usedMb: 47 } } },
      { user: { label: 'Ксения', model: 'claude-sonnet-4-6' }, totals: { inputTokens: 8100, outputTokens: 3200, costUsd: 0.27 }, container: { exists: true, running: false, ram: null, disk: null } },
      { user: { label: 'Гость #403', model: 'deepseek-chat' }, totals: { inputTokens: 2000, outputTokens: 800, costUsd: 0.003 }, container: { exists: false, running: false, ram: null, disk: null } }
    ]
  };

  // ─── UTILITIES ────────────────────────────────────────────────────────────
  function fmt(n) {
    if (n == null) return '—';
    return Number(n).toLocaleString('ru-RU');
  }

  function fmtCost(usd) {
    if (usd == null) return '—';
    return '$' + Number(usd).toFixed(2);
  }

  function roleLabel(role) {
    if (role === 'owner') return 'владелец';
    if (role === 'admin') return 'администратор';
    return 'гость';
  }

  // ─── SCREEN MANAGEMENT ────────────────────────────────────────────────────
  function showScreen(id) {
    ['screen-loading', 'screen-not-telegram', 'screen-unauthorized',
     'screen-forbidden', 'screen-error', 'screen-main'].forEach(function(s) {
      var el = document.getElementById(s);
      if (!el) return;
      if (s === id) {
        el.style.display = '';
        if (el.classList.contains('state-screen')) el.classList.add('visible');
      } else {
        el.style.display = 'none';
        el.classList.remove('visible');
      }
    });
  }

  // ─── RENDER ───────────────────────────────────────────────────────────────
  function renderMe(data) {
    var u = data.user;
    var t = data.totals;
    var c = data.container;

    // Header
    document.getElementById('user-label').textContent = u.label || '';
    document.getElementById('user-role').textContent = roleLabel(u.role);
    document.getElementById('user-model').textContent = u.model || '';

    // Token card
    document.getElementById('tok-input').textContent = fmt(t.inputTokens);
    document.getElementById('tok-output').textContent = fmt(t.outputTokens);

    if (t.cacheReadTokens && t.cacheReadTokens > 0) {
      document.getElementById('tok-cache-read').textContent = fmt(t.cacheReadTokens);
      document.getElementById('row-cache-read').style.display = '';
    }
    if (t.cacheCreationTokens && t.cacheCreationTokens > 0) {
      document.getElementById('tok-cache-create').textContent = fmt(t.cacheCreationTokens);
      document.getElementById('row-cache-create').style.display = '';
    }
    document.getElementById('tok-cost').textContent = fmtCost(t.costUsd);

    // Resources card
    var resEl = document.getElementById('res-content');
    if (!c || !c.exists) {
      resEl.innerHTML = '<p class="res-notice">Контейнер пока не создан, появится при первом сообщении.</p>';
    } else if (!c.running) {
      resEl.innerHTML = '<p class="res-notice">Контейнер в режиме сна, проснётся при первом сообщении.</p>';
    } else {
      var rows = '';

      // RAM
      if (c.ram) {
        var ramPct = Math.min(100, Math.round(c.ram.percent || 0));
        rows += '<div class="res-row">' +
          '<div class="res-header">' +
            '<span class="res-label">ОЗУ</span>' +
            '<span class="res-value">' + fmt(c.ram.usedMb) + ' / ' + fmt(c.ram.limitMb) + ' МБ (' + ramPct + '%)</span>' +
          '</div>' +
          '<div class="progress-track"><div class="progress-fill" style="width:' + ramPct + '%"></div></div>' +
        '</div>';
      }

      // CPU
      if (c.cpu) {
        var cpuPct = Math.min(100, Math.round(c.cpu.percent || 0));
        rows += '<div class="res-row">' +
          '<div class="res-header">' +
            '<span class="res-label">Процессор</span>' +
            '<span class="res-value">' + cpuPct + '% (1 ядро)</span>' +
          '</div>' +
          '<div class="progress-track"><div class="progress-fill" style="width:' + cpuPct + '%"></div></div>' +
        '</div>';
      }

      // Disk
      if (c.disk) {
        rows += '<div class="res-row">' +
          '<div class="res-header">' +
            '<span class="res-label">Диск</span>' +
            '<span class="res-value">' + fmt(c.disk.usedMb) + ' МБ</span>' +
          '</div>' +
        '</div>';
      }

      resEl.innerHTML = rows || '<p class="res-notice">Данные о ресурсах недоступны.</p>';
    }

    // Public link button
    var btnPublic = document.getElementById('btn-public');
    if (u.publicUrl) {
      btnPublic.href = u.publicUrl;
    } else {
      btnPublic.style.display = 'none';
    }

    // Admin section
    if (data.isAdmin) {
      document.getElementById('admin-section').style.display = '';
      loadAdminData();
    }

    showScreen('screen-main');
  }

  function renderAdminTable(users) {
    var rows = '';
    users.forEach(function(item) {
      var u = item.user || {};
      var t = item.totals || {};
      var c = item.container || {};
      var ramPct = (c.ram && c.ram.percent != null) ? Math.round(c.ram.percent) + '%' : '—';
      var diskMb = (c.disk && c.disk.usedMb != null) ? fmt(c.disk.usedMb) : '—';
      var totalTok = (t.inputTokens || 0) + (t.outputTokens || 0);
      rows += '<tr>' +
        '<td>' + (u.label || '—') + '</td>' +
        '<td>' + (u.model || '—') + '</td>' +
        '<td class="td-mono">' + fmt(totalTok) + '</td>' +
        '<td class="td-mono">' + fmtCost(t.costUsd) + '</td>' +
        '<td class="td-mono">' + ramPct + '</td>' +
        '<td class="td-mono">' + diskMb + '</td>' +
      '</tr>';
    });
    document.getElementById('admin-table-body').innerHTML = rows;
  }

  // ─── DATA LOADING ─────────────────────────────────────────────────────────
  var _initData = '';

  function loadAdminData() {
    if (MOCK) {
      renderAdminTable(MOCK_ADMIN.users);
      return;
    }
    fetch('/api/admin/all', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ initData: _initData })
    })
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (data.users) renderAdminTable(data.users);
      })
      .catch(function() {
        document.getElementById('admin-table-body').innerHTML =
          '<tr><td colspan="6" style="color:var(--hint);padding:12px">Не удалось загрузить</td></tr>';
      });
  }

  function loadData(initData) {
    _initData = initData;
    if (MOCK) {
      renderMe(MOCK_ME);
      return;
    }
    fetch('/api/me', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ initData: initData })
    })
      .then(function(r) {
        if (r.status === 401) { showScreen('screen-unauthorized'); return null; }
        if (r.status === 403) { showScreen('screen-forbidden'); return null; }
        if (!r.ok) { showScreen('screen-error'); return null; }
        return r.json();
      })
      .then(function(data) {
        if (!data) return;
        if (!data.ok) { showScreen('screen-error'); return; }
        renderMe(data);
      })
      .catch(function() {
        showScreen('screen-error');
      });
  }

  function reloadData() {
    showScreen('screen-loading');
    loadData(_initData);
  }

  // ─── INIT ─────────────────────────────────────────────────────────────────
  (function() {
    var tg = window.Telegram && window.Telegram.WebApp;

    if (MOCK) {
      if (tg) { tg.ready(); tg.expand(); }
      loadData('mock');
      return;
    }

    if (!tg || !tg.initData) {
      showScreen('screen-not-telegram');
      return;
    }

    tg.ready();
    tg.expand();

    loadData(tg.initData);
  })();
</script>
</body>
</html>`;
}
