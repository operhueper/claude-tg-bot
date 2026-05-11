/**
 * Privacy policy (политика конфиденциальности) page for proboi.site.
 * Route: GET /privacy
 */

const TG_URL = "https://t.me/proboiAI_bot";

const SHARED_LOGO_SVG = `
<svg width="0" height="0" style="position:absolute" aria-hidden="true">
  <defs>
    <radialGradient id="logoBg" cx="32%" cy="30%" r="82%">
      <stop offset="0%" stop-color="#FFC979"/>
      <stop offset="45%" stop-color="#FF7A48"/>
      <stop offset="100%" stop-color="#E0345E"/>
    </radialGradient>
    <symbol id="logo" viewBox="0 0 32 32">
      <circle cx="16" cy="16" r="15.2" fill="url(#logoBg)"/>
      <circle cx="16" cy="16" r="15.2" fill="none" stroke="#14130F" stroke-width="0.6" opacity=".4"/>
      <circle cx="11.2" cy="13" r="3.6" fill="#FFF7E8"/>
      <circle cx="21"   cy="13" r="3.6" fill="#FFF7E8"/>
      <circle cx="11.6" cy="13.4" r="1.4" fill="#14130F"/>
      <circle cx="21.4" cy="13.4" r="1.4" fill="#14130F"/>
      <circle cx="11.0" cy="12.5" r="0.55" fill="#FFF7E8"/>
      <circle cx="20.8" cy="12.5" r="0.55" fill="#FFF7E8"/>
      <ellipse cx="16" cy="22.2" rx="2.5" ry="3.4" fill="#14130F"/>
      <ellipse cx="16" cy="23.2" rx="1.5" ry="1.6" fill="#E0345E" opacity=".75"/>
      <circle cx="6.5"  cy="20" r="1.6" fill="#FF8FA8" opacity=".55"/>
      <circle cx="25.5" cy="20" r="1.6" fill="#FF8FA8" opacity=".55"/>
    </symbol>
  </defs>
</svg>`;

export function renderPrivacy(): string {
  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>Политика конфиденциальности — Proboi</title>
<meta name="description" content="Политика конфиденциальности сервиса Proboi. Какие данные собираем, как храним и как защищаем." />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Unbounded:wght@400;600;700&family=Onest:wght@300;400;500;600&display=swap" rel="stylesheet" />
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --c-bg: #0E0D0B;
    --c-surface: #1A1916;
    --c-border: #2A2825;
    --c-text: #F0EDE6;
    --c-text-muted: #8A8680;
    --c-accent: #FF7A48;
    --c-accent-warm: #FFC979;
    --font-display: 'Unbounded', sans-serif;
    --font-body: 'Onest', sans-serif;
  }

  html { scroll-behavior: smooth; }

  body {
    background: var(--c-bg);
    color: var(--c-text);
    font-family: var(--font-body);
    font-size: 16px;
    line-height: 1.7;
    min-height: 100vh;
  }

  a { color: var(--c-accent); text-decoration: none; }
  a:hover { text-decoration: underline; }

  /* ---- NAV ---- */
  .nav {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 32px;
    border-bottom: 1px solid var(--c-border);
    position: sticky;
    top: 0;
    background: rgba(14,13,11,.92);
    backdrop-filter: blur(12px);
    z-index: 100;
  }

  .nav__brand {
    display: flex;
    align-items: center;
    gap: 10px;
    font-family: var(--font-display);
    font-weight: 700;
    font-size: 18px;
    color: var(--c-text);
    text-decoration: none;
  }

  .nav__brand em { font-style: normal; color: var(--c-accent); }

  .nav__cta {
    display: flex;
    align-items: center;
    gap: 6px;
    background: var(--c-accent);
    color: #14130F;
    font-weight: 600;
    font-size: 14px;
    padding: 8px 16px;
    border-radius: 8px;
    text-decoration: none;
    transition: opacity .15s;
  }

  .nav__cta:hover { opacity: .85; text-decoration: none; }

  /* ---- LAYOUT ---- */
  .doc-wrap {
    max-width: 800px;
    margin: 0 auto;
    padding: 48px 24px 80px;
  }

  .doc-title {
    font-family: var(--font-display);
    font-size: 28px;
    font-weight: 700;
    margin-bottom: 8px;
    line-height: 1.2;
  }

  .doc-subtitle {
    color: var(--c-text-muted);
    font-size: 14px;
    margin-bottom: 40px;
  }

  /* ---- SECTIONS ---- */
  h2 {
    font-family: var(--font-display);
    font-size: 17px;
    font-weight: 600;
    color: var(--c-accent-warm);
    margin: 40px 0 12px;
    padding-bottom: 8px;
    border-bottom: 1px solid var(--c-border);
  }

  h3 {
    font-size: 15px;
    font-weight: 600;
    margin: 20px 0 8px;
    color: var(--c-text);
  }

  p { margin-bottom: 12px; }

  ul, ol {
    padding-left: 24px;
    margin-bottom: 12px;
  }

  li { margin-bottom: 6px; }

  /* ---- TABLE ---- */
  .data-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 14px;
    margin: 12px 0 16px;
  }

  .data-table th,
  .data-table td {
    text-align: left;
    padding: 10px 14px;
    border: 1px solid var(--c-border);
  }

  .data-table th {
    background: var(--c-surface);
    color: var(--c-text-muted);
    font-weight: 500;
    font-size: 13px;
    text-transform: uppercase;
    letter-spacing: .04em;
  }

  .data-table tr:nth-child(even) td {
    background: rgba(26,25,22,.5);
  }

  /* ---- RIGHTS BOX ---- */
  .rights-box {
    background: var(--c-surface);
    border: 1px solid var(--c-border);
    border-left: 3px solid var(--c-accent);
    border-radius: 8px;
    padding: 16px 20px;
    font-size: 14px;
    margin: 12px 0;
  }

  /* ---- FOOTER ---- */
  .doc-footer {
    margin-top: 60px;
    padding-top: 24px;
    border-top: 1px solid var(--c-border);
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 12px;
    font-size: 13px;
    color: var(--c-text-muted);
  }

  .doc-footer a { color: var(--c-text-muted); }
  .doc-footer a:hover { color: var(--c-accent); }

  @media (max-width: 600px) {
    .nav { padding: 12px 16px; }
    .doc-wrap { padding: 32px 16px 60px; }
    .doc-title { font-size: 22px; }
    .nav__cta { display: none; }
    .data-table { font-size: 13px; }
    .data-table th, .data-table td { padding: 8px 10px; }
  }
</style>
</head>
<body>

${SHARED_LOGO_SVG}

<header class="nav">
  <a class="nav__brand" href="/">
    <svg width="28" height="28"><use href="#logo"/></svg>
    <span><em>Proboi</em></span>
  </a>
  <a class="nav__cta" href="${TG_URL}" target="_blank" rel="noopener">
    Открыть в Telegram
    <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
  </a>
</header>

<main class="doc-wrap">

  <h1 class="doc-title">Политика конфиденциальности</h1>
  <p class="doc-subtitle">
    Как сервис Proboi собирает, использует и защищает ваши данные.
    Редакция от мая 2026 года.
  </p>

  <h2>1. Какие данные мы собираем</h2>
  <table class="data-table">
    <thead>
      <tr>
        <th>Тип данных</th>
        <th>Назначение</th>
        <th>Обязательность</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>Telegram ID и username</td>
        <td>Идентификация пользователя, авторизация</td>
        <td>Обязательно</td>
      </tr>
      <tr>
        <td>История запросов к AI</td>
        <td>Контекст сессии, улучшение ответов</td>
        <td>Обязательно</td>
      </tr>
      <tr>
        <td>Метаданные оплаты</td>
        <td>Подтверждение подписки (статус, ID транзакции — не номер карты)</td>
        <td>При наличии подписки</td>
      </tr>
      <tr>
        <td>Технические логи запросов</td>
        <td>Безопасность, борьба со злоупотреблениями</td>
        <td>Автоматически</td>
      </tr>
    </tbody>
  </table>
  <p>
    Мы <strong>не собираем</strong>: номера банковских карт, платёжные реквизиты (их обрабатывает
    ЮКасса напрямую), геолокацию, контакты телефонной книги.
  </p>
  <p>
    История запросов хранится в памяти текущей сессии. После завершения сессии или команды
    <code>/new</code> история очищается и не сохраняется постоянно.
  </p>

  <h2>2. Цели обработки персональных данных</h2>
  <ul>
    <li>Предоставление услуг согласно публичной оферте.</li>
    <li>Авторизация и управление доступом к сервису.</li>
    <li>Борьба со злоупотреблениями и нарушениями условий использования.</li>
    <li>Аналитика и улучшение сервиса — исключительно в агрегированном, обезличенном виде.</li>
    <li>Выполнение требований законодательства РФ.</li>
  </ul>

  <h2>3. Сроки хранения данных</h2>
  <ul>
    <li>Технические логи запросов: <strong>6 месяцев</strong> с момента создания.</li>
    <li>Данные оплаты: в соответствии с требованиями ЮКасса и Федерального закона № 54-ФЗ.</li>
    <li>
      При удалении аккаунта или по запросу пользователя: персональные данные удаляются
      в течение <strong>30 дней</strong> с момента обращения на
      <a href="mailto:abuse@proboi.site">abuse@proboi.site</a>.
    </li>
  </ul>

  <h2>4. Передача данных третьим лицам</h2>
  <p>
    Мы передаём минимально необходимые данные следующим провайдерам для обеспечения работы сервиса:
  </p>
  <ul>
    <li>
      <strong>ЮКасса (ООО «Яндекс.Касса»)</strong> — обработка платежей.
      Политика конфиденциальности: <a href="https://yookassa.ru/docs/support/merchant/payments/privacy" target="_blank" rel="noopener">yookassa.ru</a>.
    </li>
    <li>
      <strong>DeepSeek / Anthropic</strong> — AI-провайдеры, обрабатывающие текст запросов
      для формирования ответов. Запросы могут содержать текст ваших сообщений.
    </li>
    <li>
      <strong>Composio</strong> — OAuth-авторизация Google Workspace (только при
      добровольном подключении через команду <code>/google</code>).
    </li>
    <li>
      <strong>OpenAI (Whisper)</strong> — транскрипция голосовых сообщений (только при
      отправке голосовых сообщений).
    </li>
  </ul>
  <p>
    Все провайдеры работают в соответствии со своими политиками конфиденциальности. Мы не
    продаём и не передаём ваши данные рекламным сетям или иным третьим лицам, не указанным выше.
  </p>

  <h2>5. Права субъекта персональных данных (152-ФЗ)</h2>
  <p>
    В соответствии с Федеральным законом № 152-ФЗ «О персональных данных» вы имеете право:
  </p>
  <div class="rights-box">
    <ul style="list-style:none; padding:0; margin:0;">
      <li style="margin-bottom:8px">Получить доступ к своим персональным данным, которые мы обрабатываем.</li>
      <li style="margin-bottom:8px">Потребовать исправления неточных или неполных данных.</li>
      <li style="margin-bottom:8px">Потребовать удаления данных («право на забвение»).</li>
      <li style="margin-bottom:8px">Отозвать согласие на обработку данных в любое время.</li>
      <li>Обратиться с жалобой в Роскомнадзор, если считаете, что ваши права нарушены.</li>
    </ul>
  </div>
  <p>
    Для реализации любого из перечисленных прав направьте запрос на
    <a href="mailto:abuse@proboi.site">abuse@proboi.site</a>.
    Мы ответим в течение 10 рабочих дней.
  </p>

  <h2>6. Безопасность</h2>
  <p>
    Мы применяем технические и организационные меры для защиты ваших данных: изоляцию
    пользовательских контейнеров, ограничение сетевого доступа, шифрование трафика (HTTPS/TLS).
    Доступ к логам и базам данных ограничен кругом уполномоченных лиц.
  </p>
  <p>
    При обнаружении инцидента безопасности, затрагивающего ваши данные, мы уведомим вас
    в установленном законом порядке.
  </p>

  <h2>7. Контакты</h2>
  <p>По вопросам обработки персональных данных:</p>
  <ul>
    <li>E-mail: <a href="mailto:abuse@proboi.site">abuse@proboi.site</a></li>
    <li>Оператор: ИП Энбом Ксения Сергеевна, ИНН: [ИНН: _______]</li>
  </ul>

  <footer class="doc-footer">
    <span>Последнее обновление: май 2026</span>
    <span>
      <a href="/">proboi.site</a>&ensp;·&ensp;
      <a href="/oferta">Публичная оферта</a>
    </span>
  </footer>

</main>
</body>
</html>`;
}
