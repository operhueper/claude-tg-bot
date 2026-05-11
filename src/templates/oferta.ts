/**
 * Public offer (публичная оферта) page for proboi.site.
 * Route: GET /oferta
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

export function renderOferta(): string {
  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>Публичная оферта — Proboi</title>
<meta name="description" content="Публичная оферта на оказание услуг сервиса Proboi. ИП Энбом Ксения Сергеевна." />
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

  /* ---- REQUISITES BOX ---- */
  .req-box {
    background: var(--c-surface);
    border: 1px solid var(--c-border);
    border-radius: 12px;
    padding: 20px 24px;
    font-size: 14px;
    line-height: 1.8;
    margin-top: 8px;
  }

  .req-box strong {
    display: block;
    font-size: 15px;
    margin-bottom: 8px;
    color: var(--c-accent-warm);
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

  <h1 class="doc-title">Публичная оферта</h1>
  <p class="doc-subtitle">
    Договор на оказание услуг по предоставлению доступа к сервису Proboi.
    Редакция от мая 2026 года.
  </p>

  <h2>1. Предмет договора</h2>
  <p>
    Индивидуальный предприниматель Энбом Ксения Сергеевна (далее — Исполнитель) предоставляет
    физическим лицам (далее — Заказчик) доступ к AI-ассистенту «Proboi» через мессенджер Telegram.
  </p>
  <p>
    Настоящий документ является публичной офертой в соответствии со ст. 435–436 Гражданского кодекса
    Российской Федерации. Акцептом оферты является оплата услуг Заказчиком.
  </p>
  <p>
    С момента акцепта настоящий договор считается заключённым на условиях, изложенных ниже.
  </p>

  <h2>2. Стоимость услуг</h2>
  <ul>
    <li>Тариф «Профи»: <strong>499 ₽/месяц</strong>.</li>
    <li>
      Пробный период: <strong>1 ₽</strong> за привязку карты, после чего Заказчику предоставляется
      5 дней доступа. По истечении пробного периода подписка автоматически продлевается по тарифу
      499 ₽/месяц, если Заказчик не отменил её до окончания пробного периода.
    </li>
    <li>
      Оплата осуществляется через платёжный сервис ЮКасса (ООО «Яндекс.Касса»). Банковские
      реквизиты карты обрабатываются ЮКасса и Исполнителю не передаются.
    </li>
  </ul>

  <h2>3. Порядок активации и отмены</h2>
  <ul>
    <li>Активация: оплата производится через бот командой <code>/pay</code>.</li>
    <li>Отмена: командой <code>/cancel</code> или через кнопку в меню <code>/status</code> в любое время без объяснения причин.</li>
    <li>При отмене доступ к сервису сохраняется до конца уже оплаченного периода.</li>
    <li>Автоматические списания прекращаются в день подтверждения отмены.</li>
  </ul>

  <h2>4. Права и обязанности сторон</h2>
  <h3>Исполнитель обязуется:</h3>
  <ul>
    <li>Предоставлять бесперебойный доступ к сервису 24/7 с целевым уровнем доступности не менее 95% в месяц (SLA 95%).</li>
    <li>Уведомлять Заказчика о плановых технических работах не позднее чем за 24 часа.</li>
    <li>Обеспечивать конфиденциальность персональных данных Заказчика согласно Политике конфиденциальности.</li>
    <li>Рассматривать обращения по адресу <a href="mailto:abuse@proboi.site">abuse@proboi.site</a> в разумный срок (не более 48 часов до первого ответа).</li>
  </ul>
  <h3>Заказчик обязуется:</h3>
  <ul>
    <li>Использовать сервис в соответствии с условиями настоящей оферты.</li>
    <li>Не нарушать законодательство Российской Федерации и стран, гражданином или резидентом которых является.</li>
    <li>Не передавать реквизиты доступа третьим лицам.</li>
  </ul>

  <h2>5. Запреты</h2>
  <p>Заказчику запрещается использовать сервис для:</p>
  <ul>
    <li>Нарушения законов РФ и стран, гражданином/резидентом которых он является.</li>
    <li>Генерации незаконного контента, в том числе попавшего в реестры запрещённой информации Роскомнадзора.</li>
    <li>Хостинга персональных данных третьих лиц без законных оснований (152-ФЗ).</li>
    <li>Фишинга, рассылки спама, распространения вредоносного программного обеспечения, пиратства.</li>
    <li>Попыток обойти ограничения системы или получить несанкционированный доступ к инфраструктуре.</li>
    <li>Перепродажи доступа или предоставления доступа третьим лицам без письменного согласия Исполнителя.</li>
    <li>Использования в коммерческих целях без письменного согласия Исполнителя.</li>
  </ul>
  <p>
    Исполнитель вправе приостановить или прекратить доступ без объяснения причин при поступлении
    обоснованной жалобы или подозрении на нарушение указанных пунктов. Восстановление доступа
    производится после разбирательства, если нарушение не подтвердилось.
  </p>

  <h2>6. Ответственность сторон</h2>
  <ul>
    <li>
      Ответственность Исполнителя ограничена стоимостью услуг за последний оплаченный месяц.
      Исполнитель не несёт ответственности за косвенный ущерб, упущенную выгоду или потерю данных.
    </li>
    <li>
      Исполнитель не несёт ответственности за содержание ответов AI и принятые Заказчиком решения
      на основе этих ответов. Сервис не является источником юридических, медицинских или финансовых
      консультаций.
    </li>
    <li>
      Ответственность за содержимое, код и автоматизации, запускаемые в пользовательском контейнере,
      несёт Заказчик.
    </li>
    <li>
      Исполнитель выступает информационным посредником в смысле ст. 17 Федерального закона
      № 149-ФЗ «Об информации, информационных технологиях и о защите информации» и не контролирует
      содержимое запросов в реальном времени.
    </li>
    <li>
      Исполнитель вправе передавать запрашиваемые сведения правоохранительным органам
      в установленном законом порядке.
    </li>
  </ul>

  <h2>7. Конфиденциальность</h2>
  <p>
    Порядок сбора, обработки и хранения персональных данных регулируется
    <a href="/privacy">Политикой конфиденциальности</a>.
  </p>

  <h2>8. Заключительные положения</h2>
  <ul>
    <li>Настоящий договор регулируется законодательством Российской Федерации.</li>
    <li>Споры разрешаются в порядке, предусмотренном законодательством РФ.</li>
    <li>
      Исполнитель вправе в одностороннем порядке изменять условия оферты с уведомлением
      Заказчика не менее чем за 5 дней до вступления изменений в силу. Уведомление направляется
      через бот или публикацию обновлённой версии на сайте.
    </li>
    <li>
      Продолжение использования сервиса после вступления изменений в силу означает согласие
      Заказчика с новыми условиями.
    </li>
  </ul>

  <h2>9. Реквизиты Исполнителя</h2>
  <div class="req-box">
    <strong>ИП Энбом Ксения Сергеевна</strong>
    ОГРНИП: [ОГРНИП: _______]<br/>
    ИНН: [ИНН: _______]<br/>
    Расчётный счёт: [Расчётный счёт: _______]<br/>
    E-mail: <a href="mailto:abuse@proboi.site">abuse@proboi.site</a>
  </div>

  <footer class="doc-footer">
    <span>Последнее обновление: май 2026</span>
    <span>
      <a href="/">proboi.site</a>&ensp;·&ensp;
      <a href="/privacy">Политика конфиденциальности</a>
    </span>
  </footer>

</main>
</body>
</html>`;
}
