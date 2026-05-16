/**
 * Landing page for proboi.site / Proboi bot.
 *
 * Implementation of the Anthropic Design handoff bundle (kK4PqIqoB-rLyZ8URrFAFA).
 * Static CSS/JS assets live under src/templates/assets/ and are served by
 * src/dashboard-server.ts. This module just emits HTML strings.
 *
 * Two pages:
 *   renderLanding()    — the full marketing site at "/"
 *   renderHowToSetup() — placeholder guide page at "/how-to-setup.html"
 */

const TG_URL = "https://t.me/proboiAI_bot";
const OWNER_TG = "https://t.me/ev_mironoff";
const REAL_GUIDE_URL =
  "https://github.com/jinrupro/claude-tg-bot/tree/main/guide/ru";

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

const FAVICON_SVG = `data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><defs><radialGradient id='fv' cx='32%25' cy='30%25' r='82%25'><stop offset='0%25' stop-color='%23FFC979'/><stop offset='45%25' stop-color='%23FF7A48'/><stop offset='100%25' stop-color='%23E0345E'/></radialGradient></defs><circle cx='16' cy='16' r='16' fill='url(%23fv)'/><circle cx='11.2' cy='13' r='3.6' fill='%23FFF7E8'/><circle cx='21' cy='13' r='3.6' fill='%23FFF7E8'/><circle cx='11.6' cy='13.4' r='1.4' fill='%2314130F'/><circle cx='21.4' cy='13.4' r='1.4' fill='%2314130F'/><circle cx='11.0' cy='12.5' r='0.55' fill='%23FFF7E8'/><circle cx='20.8' cy='12.5' r='0.55' fill='%23FFF7E8'/><ellipse cx='16' cy='22.2' rx='2.5' ry='3.4' fill='%2314130F'/><circle cx='6.5' cy='20' r='1.6' fill='%23FF8FA8' opacity='.55'/><circle cx='25.5' cy='20' r='1.6' fill='%23FF8FA8' opacity='.55'/></svg>`;

const HEAD_LINKS = `
<link rel="icon" type="image/svg+xml" href="${FAVICON_SVG}" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Unbounded:wght@400;500;600;700;800&family=Onest:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
<link rel="stylesheet" href="/assets/landing.css" />
<link rel="stylesheet" href="/assets/landing-blocks.css" />`;

const NAV_HTML = `
<header class="nav" data-screen-label="00 Nav">
  <a class="nav__brand" href="/">
    <span class="nav__mark logo-mark" aria-hidden="true">
      <svg class="logo-mark__face" width="30" height="30"><use href="#logo"/></svg>
    </span>
    <span class="nav__name"><em>Proboi</em></span>
  </a>
  <nav class="nav__links">
    <a href="/#features">Возможности</a>
    <a href="/how-to-setup.html">Как настроить</a>
    <a href="/security">Безопасность</a>
    <a href="/#faq">Вопросы</a>
  </nav>
  <a class="nav__cta" href="${TG_URL}" target="_blank" rel="noopener">
    Открыть в Telegram
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
  </a>
</header>`;

const FOOTER_HTML = `
<footer class="footer" data-screen-label="17 Footer">
  <div class="footer__row">
    <div class="footer__brand">
      <span class="nav__mark logo-mark" aria-hidden="true">
        <svg class="logo-mark__face" width="22" height="22"><use href="#logo"/></svg>
      </span>
      Proboi&nbsp;· proboi.site
    </div>
    <div class="footer__links">
      <a href="${TG_URL}" target="_blank" rel="noopener">@proboiAI_bot</a>
      <a href="${OWNER_TG}" target="_blank" rel="noopener">@ev_mironoff</a>
      <a href="/how-to-setup.html">как настроить</a>
      <a href="/security">безопасность</a>
    </div>
  </div>
  <div class="footer__row footer__row--legal">
    <div class="footer__links">
      <a href="/oferta">Публичная оферта</a>
      <a href="/privacy">Политика конфиденциальности</a>
      <a href="/terms">Пользовательское соглашение</a>
    </div>
  </div>
  <div class="footer__small">
    Этот сайт собрал сам бот за&nbsp;один вечер. <span>© <span id="year">2026</span></span>
  </div>
</footer>`;

export function renderLanding(): string {
  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>Proboi — личный ИИ-исполнитель в Telegram</title>
<meta name="description" content="Личный ИИ в Telegram, который не просто отвечает — делает. Пишет код, собирает сайты, работает с документами и сервисами. У каждого свой кусочек сервера." />
<meta property="og:title" content="Proboi — личный ИИ-исполнитель" />
<meta property="og:description" content="Не просто отвечает — выполняет задачи. Пишет код, собирает сайты, работает с файлами и сервисами. Свой кусочек сервера у каждого. Доступ по приглашению." />
<meta property="og:type" content="website" />
<meta property="og:url" content="https://proboi.site" />
${HEAD_LINKS}
</head>
<body>

${SHARED_LOGO_SVG}

<!-- ===========================================================
     0. NAV
     =========================================================== -->
${NAV_HTML}

<main id="top">

<!-- ===========================================================
     1. HERO
     =========================================================== -->
<section class="hero" data-screen-label="01 Hero">
  <div class="hero__grid">
    <div class="hero__copy">
      <div class="badge badge--lime">этот сайт собрал сам бот&nbsp;— пришлось повозиться, но теперь умеет</div>
      <h1 class="display">
        <span class="ink-stroke">Proboi</span><span class="hero__punct">.</span>
      </h1>
      <p class="hero__desc">
        Твой личный ИИ в Telegram, который не просто отвечает — делает.
        Пишет код, собирает сайты, разбирает документы, работает с твоими сервисами.
        Ставь задачу голосом — и иди заниматься своим делом.
      </p>
      <div class="hero__cta">
        <a class="btn btn--big" href="${TG_URL}" target="_blank" rel="noopener">
          <span>Пробуй прямо сейчас</span>
          <span class="btn__arrow">→</span>
        </a>
        <a class="btn btn--ghost" href="#features">Сначала посмотрю</a>
      </div>
      <div class="hero__meta">
        <span class="hero__metaitem"><span class="dot"></span> доступ по приглашению, бесплатно</span>
        <span class="hero__metaitem"><span class="dot"></span> работает в Telegram, без приложений</span>
      </div>
    </div>

    <aside class="hero__chat" id="heroChat" aria-label="Демо-чат">
      <div class="chat">
        <div class="chat__head">
          <div class="chat__avatar">
            <svg width="32" height="32"><use href="#logo"/></svg>
          </div>
          <div>
            <div class="chat__name">Proboi</div>
            <div class="chat__status"><span class="dot dot--green"></span> печатает…</div>
          </div>
        </div>
        <div class="chat__body" id="chatBody">
          <!-- messages injected by JS -->
        </div>
        <div class="chat__compose">
          <span class="chat__field" id="chatField">собери мне сайт-визитку</span>
          <button class="chat__send" aria-label="Отправить">
            <svg viewBox="0 0 24 24" width="18" height="18"><path d="M3 12 21 4l-4 18-5-7-9-3z" fill="var(--ink)"/></svg>
          </button>
        </div>
      </div>
      <div class="hero__sticker">
        <span class="sticker">сайт за 4 минуты</span>
      </div>
    </aside>
  </div>

  <div class="marquee" aria-hidden="true">
    <div class="marquee__row">
      <span>живая память</span><span>·</span>
      <span>работает пока ты спишь</span><span>·</span>
      <span>твой кусочек сервера</span><span>·</span>
      <span>голос вместо клавиатуры</span><span>·</span>
      <span>делает других ботов</span><span>·</span>
      <span>презентации одной фразой</span><span>·</span>
      <span>живая память</span><span>·</span>
      <span>работает пока ты спишь</span><span>·</span>
      <span>твой кусочек сервера</span><span>·</span>
      <span>голос вместо клавиатуры</span><span>·</span>
      <span>делает других ботов</span><span>·</span>
      <span>презентации одной фразой</span><span>·</span>
    </div>
  </div>
</section>

<!-- ===========================================================
     2. ГРАФ + ПАМЯТЬ
     =========================================================== -->
<section class="block block--graph" id="features" data-screen-label="02 Граф памяти">
  <div class="block__head">
    <span class="kicker">02 — память</span>
    <h2 class="display display--md">Второй мозг,<br/><span class="ink-stroke">который ничего не забывает.</span></h2>
    <p class="lead">
      Всё, что ты говоришь боту, попадает в твой личный граф.
      Через месяц молчания вернёшься — он помнит каждую деталь.
    </p>
  </div>

  <div class="block__grid block__grid--graph">
    <ul class="bulletlist">
      <li><span class="num">01</span><div><b>Каждая мысль — узел.</b> Заметки, задачи, контакты, файлы. Связи между ними бот строит сам.</div></li>
      <li><span class="num">02</span><div><b>Ничего не теряется.</b> Не нужно листать чат и искать, что ты сказал в феврале.</div></li>
      <li><span class="num">03</span><div><b>Можно вернуться через год.</b> Бот ответит, как будто разговор был вчера.</div></li>
    </ul>

    <figure class="visual visual--graph">
      <div class="visual__header">
        <div class="visual__title">твой граф · потяни любой узел</div>
        <div class="timeline" id="timeline">
          <span class="timeline__label timeline__label--left">месяц назад</span>
          <input type="range" min="0" max="100" value="100" id="timelineRange" />
          <span class="timeline__label timeline__label--right">сегодня</span>
        </div>
      </div>
      <div class="visual__stage">
        <svg id="graphSvg" viewBox="0 0 1180 760" preserveAspectRatio="xMidYMid meet"></svg>
        <div class="visual__legend">
          <span><i style="background:var(--lime)"></i>идея</span>
          <span><i style="background:var(--coral)"></i>задача</span>
          <span><i style="background:var(--ink)"></i>человек</span>
          <span><i style="background:var(--violet)"></i>файл</span>
          <span><i style="background:#3FB984"></i>событие</span>
          <span><i style="background:#F2A93B"></i>поездка</span>
          <span><i style="background:#D8A93B"></i>финансы</span>
        </div>
      </div>
    </figure>
  </div>

  <a class="cta-row" href="${TG_URL}" target="_blank" rel="noopener">
    <span>Пробуй прямо сейчас</span><span class="cta-row__arrow">→</span>
  </a>
</section>

<!-- ===========================================================
     3. ГОЛОС
     =========================================================== -->
<section class="block block--voice" data-screen-label="03 Голос">
  <div class="block__head block__head--center">
    <span class="kicker">03 — голос</span>
    <h2 class="display display--md">Говори,<br/>не печатай.</h2>
    <p class="lead">
      Надиктуй голосовое — бот разберёт.
      Ставь задачи, ищи в своих заметках, запускай автоматизации голосом.
    </p>
  </div>

  <figure class="voice">
    <div class="voice__bubble">
      <div class="voice__head"><span class="dot dot--red"></span> голосовое · 0:08</div>
      <div class="voice__wave" id="voiceWave" aria-hidden="true"></div>
      <div class="voice__transcript" id="voiceTranscript">«Запиши идею для книги: глава про&nbsp;то, как утро ломает день»</div>
    </div>

    <svg class="voice__rays" viewBox="0 0 800 240" aria-hidden="true">
      <path d="M400 60 C 500 80, 580 110, 680 100" stroke="var(--ink)" stroke-width="1.5" fill="none" stroke-dasharray="4 6"/>
      <path d="M400 60 C 500 110, 580 150, 680 160" stroke="var(--ink)" stroke-width="1.5" fill="none" stroke-dasharray="4 6"/>
      <path d="M400 60 C 300 80, 220 110, 120 100" stroke="var(--ink)" stroke-width="1.5" fill="none" stroke-dasharray="4 6"/>
      <path d="M400 60 C 300 110, 220 150, 120 160" stroke="var(--ink)" stroke-width="1.5" fill="none" stroke-dasharray="4 6"/>
    </svg>

    <div class="voice__cards">
      <div class="vcard">
        <div class="vcard__icon" data-icon="note"></div>
        <div class="vcard__cmd">«Запиши идею для книги: …»</div>
        <div class="vcard__act">→ попадает в граф</div>
      </div>
      <div class="vcard">
        <div class="vcard__icon" data-icon="search"></div>
        <div class="vcard__cmd">«Найди, что я говорил про того клиента»</div>
        <div class="vcard__act">→ бот ищет и отвечает</div>
      </div>
      <div class="vcard">
        <div class="vcard__icon" data-icon="clock"></div>
        <div class="vcard__cmd">«По понедельникам в 9 — сводка почты»</div>
        <div class="vcard__act">→ автоматизация</div>
      </div>
      <div class="vcard">
        <div class="vcard__icon" data-icon="file"></div>
        <div class="vcard__cmd">«Собери PDF из моих заметок за неделю»</div>
        <div class="vcard__act">→ готовый файл</div>
      </div>
    </div>
  </figure>

  <a class="cta-row" href="${TG_URL}" target="_blank" rel="noopener">
    <span>Пробуй прямо сейчас</span><span class="cta-row__arrow">→</span>
  </a>
</section>

<!-- ===========================================================
     4. ЛИЧНАЯ БИБЛИОТЕКА
     =========================================================== -->
<section class="block block--library" data-screen-label="04 Библиотека">
  <div class="block__grid block__grid--split">
    <div>
      <span class="kicker">04 — личная библиотека</span>
      <h2 class="display display--md">Загружай статьи —<br/>бот их прочитает<br/><span class="ink-stroke">и не наврёт.</span></h2>
      <p class="lead">
        Скидывай статьи, методички, учебники — бот хранит их у тебя в личной библиотеке.
        Можно спрашивать. Бот всегда отвечает по тексту, а не выдумывает.
      </p>

      <ul class="bulletlist bulletlist--compact">
        <li><span class="num">→</span><div>Кидаешь PDF, ссылки, целые подборки в один «ящик».</div></li>
        <li><span class="num">→</span><div>Спрашиваешь по этому ящику — бот достаёт ответ из реального текста и показывает кусок-источник.</div></li>
        <li><span class="num">→</span><div>Не выдумывает фактов, которых не было. Если не нашёл — так и скажет.</div></li>
      </ul>

      <div class="forwhom">
        <span class="forwhom__title">кому полезно</span>
        <span class="chip">студент с курсовой</span>
        <span class="chip">юрист с законами</span>
        <span class="chip">врач с клин-рекомендациями</span>
        <span class="chip">любой, кто живёт в текстах</span>
      </div>

      <a class="cta-row" href="${TG_URL}" target="_blank" rel="noopener">
        <span>Пробуй прямо сейчас</span><span class="cta-row__arrow">→</span>
      </a>
    </div>

    <figure class="visual visual--library">
      <div class="library">
        <div class="library__stack" aria-hidden="true">
          <div class="pdf pdf--1"><span>методичка.pdf</span></div>
          <div class="pdf pdf--2"><span>статья.pdf</span></div>
          <div class="pdf pdf--3"><span>лекция.pdf</span></div>
          <div class="pdf pdf--4"><span>конспект.pdf</span></div>
        </div>
        <div class="library__box">
          <div class="library__boxlabel">личная библиотека</div>
          <div class="library__boxchip">14 источников</div>
        </div>
        <div class="library__answer">
          <div class="library__q">— что говорят про&nbsp;утренний свет?</div>
          <div class="library__a">Утренний свет в&nbsp;первые 30 минут после пробуждения сильнее всего сдвигает фазу сна <mark>[стр.&nbsp;47, методичка]</mark>.</div>
          <div class="library__source">источник · методичка.pdf</div>
        </div>
      </div>
    </figure>
  </div>
</section>

<!-- ===========================================================
     5. ПОДКЛЮЧЕНИЯ
     =========================================================== -->
<section class="block block--connect" data-screen-label="05 Сервисы">
  <div class="block__head block__head--center">
    <span class="kicker">05 — подключения</span>
    <h2 class="display display--md">Подключи свой Gmail, Календарь, Заметки —<br/><span class="ink-stroke">и работай с ними через бота.</span></h2>
    <p class="lead">Один раз нажал «разрешить» — бот пишет письма, ставит встречи, ведёт заметки за тебя.</p>
  </div>

  <figure class="tornado" id="tornado">
    <div class="tornado__core">
      <div class="tornado__bot">
        <svg width="120" height="120"><use href="#logo"/></svg>
      </div>
      <div class="tornado__label">мой&nbsp;Клод</div>
    </div>
    <div class="tornado__ring tornado__ring--1" id="tRing1"></div>
    <div class="tornado__ring tornado__ring--2" id="tRing2"></div>
    <div class="tornado__ring tornado__ring--3" id="tRing3"></div>
  </figure>

  <div class="examples">
    <div class="example">
      <div class="example__cmd">«Прочитай последние 10 писем от&nbsp;босса, выдай главное»</div>
      <div class="example__arrow">→</div>
      <div class="example__res">сводка в&nbsp;чат</div>
    </div>
    <div class="example">
      <div class="example__cmd">«Поставь встречу с&nbsp;Машей в&nbsp;четверг в&nbsp;15:00»</div>
      <div class="example__arrow">→</div>
      <div class="example__res">событие в&nbsp;календаре</div>
    </div>
    <div class="example">
      <div class="example__cmd">«Сохрани этот разговор в&nbsp;мои заметки»</div>
      <div class="example__arrow">→</div>
      <div class="example__res">улетает в&nbsp;Notion</div>
    </div>
  </div>

  <a class="cta-row" href="${TG_URL}" target="_blank" rel="noopener">
    <span>Пробуй прямо сейчас</span><span class="cta-row__arrow">→</span>
  </a>
</section>

<!-- ===========================================================
     6. ЛЮБОЙ ДОКУМЕНТ → ЛЮБОЙ
     =========================================================== -->
<section class="block block--morph" data-screen-label="06 Морфинг">
  <div class="block__grid block__grid--split block__grid--reverse">
    <figure class="visual visual--morph">
      <div class="morph">
        <div class="morph__chip morph__chip--from"><span id="morphFrom">PDF договора</span></div>
        <svg class="morph__arrow" viewBox="0 0 200 60" aria-hidden="true">
          <path d="M10 30 H180" stroke="var(--ink)" stroke-width="2"/>
          <path d="M170 22 L185 30 L170 38" stroke="var(--ink)" stroke-width="2" fill="none"/>
          <path d="M40 30 q15 -18 30 0 t30 0 t30 0" stroke="var(--coral)" stroke-width="2" fill="none" opacity="0.7"/>
        </svg>
        <div class="morph__chip morph__chip--to"><span id="morphTo">таблица контрактов</span></div>
      </div>
      <div class="morph__deck" id="morphDeck"></div>
    </figure>

    <div>
      <span class="kicker">06 — конвертация</span>
      <h2 class="display display--md">Преврати<br/>что угодно<br/><span class="ink-stroke">во что угодно.</span></h2>
      <p class="lead">
        PDF в&nbsp;Excel, Excel в&nbsp;PDF, фотка чека в&nbsp;табличку, голосовое в&nbsp;отчёт.
        Без программ, конвертеров, копипаста.
      </p>

      <ul class="bulletlist bulletlist--compact">
        <li><span class="num">⌗</span><div>PDF договора → таблица «дата, контрагент, сумма, штрафы»</div></li>
        <li><span class="num">⌗</span><div>Фото чека → строки в&nbsp;Excel расходов</div></li>
        <li><span class="num">⌗</span><div>Excel плана → красивый PDF для распечатки</div></li>
        <li><span class="num">⌗</span><div>Голосовое за&nbsp;10&nbsp;минут → структурированная статья</div></li>
      </ul>

      <a class="cta-row" href="${TG_URL}" target="_blank" rel="noopener">
        <span>Пробуй прямо сейчас</span><span class="cta-row__arrow">→</span>
      </a>
    </div>
  </div>
</section>

<!-- ===========================================================
     7. ПРЕЗЕНТАЦИИ
     =========================================================== -->
<section class="block block--slides" data-screen-label="07 Слайды">
  <div class="block__head">
    <span class="kicker">07 — слайды</span>
    <h2 class="display display--md">Соберёт презентацию<br/><span class="ink-stroke">и нарисует к&nbsp;ней картинки.</span></h2>
    <p class="lead">Опиши идею текстом — получи 12&nbsp;слайдов и&nbsp;иллюстрации к&nbsp;ним. Бесплатно.</p>
  </div>

  <div class="slidedeck">
    <!-- 01 — обложка с иллюстрацией -->
    <article class="bigslide bigslide--cover">
      <div class="bigslide__num">01 · обложка</div>
      <div class="bigslide__cover" style="color: rgb(216, 255, 54)">
        <svg viewBox="0 0 480 320" preserveAspectRatio="xMidYMid slice" class="bigslide__art" aria-hidden="true">
          <defs>
            <linearGradient id="dawn" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="#FFD089"/>
              <stop offset="45%" stop-color="#F08A3E"/>
              <stop offset="100%" stop-color="#C44A2C"/>
            </linearGradient>
          </defs>
          <rect width="480" height="320" fill="url(#dawn)"/>
          <circle cx="345" cy="170" r="62" fill="#FFF1CF" opacity=".95"/>
          <circle cx="345" cy="170" r="92" fill="#FFF1CF" opacity=".15"/>
          <g stroke="#FFF1CF" stroke-width="1" opacity=".35">
            <line x1="0" y1="170" x2="240" y2="170"/>
            <line x1="0" y1="158" x2="200" y2="158"/>
            <line x1="0" y1="182" x2="220" y2="182"/>
          </g>
          <path d="M0 220 L80 200 L160 215 L240 195 L320 215 L400 200 L480 215 V320 H0 Z" fill="#7A2E22" opacity=".75"/>
          <path d="M0 250 L60 240 L130 255 L210 235 L290 255 L370 240 L480 255 V320 H0 Z" fill="#3A1810"/>
          <g fill="#14130F">
            <rect x="40" y="270" width="36" height="50"/>
            <rect x="82" y="262" width="22" height="58"/>
            <rect x="110" y="276" width="48" height="44"/>
            <rect x="166" y="258" width="18" height="62"/>
            <rect x="192" y="272" width="40" height="48"/>
            <rect x="240" y="266" width="28" height="54"/>
            <rect x="276" y="278" width="50" height="42"/>
            <rect x="334" y="260" width="22" height="60"/>
            <rect x="364" y="272" width="44" height="48"/>
            <rect x="416" y="266" width="26" height="54"/>
            <rect x="448" y="276" width="32" height="44"/>
          </g>
          <g fill="#FFD089" opacity=".9">
            <rect x="48" y="282" width="3" height="4"/>
            <rect x="56" y="288" width="3" height="4"/>
            <rect x="120" y="284" width="3" height="4"/>
            <rect x="200" y="282" width="3" height="4"/>
            <rect x="248" y="276" width="3" height="4"/>
            <rect x="288" y="288" width="3" height="4"/>
            <rect x="372" y="282" width="3" height="4"/>
            <rect x="424" y="276" width="3" height="4"/>
          </g>
        </svg>
        <div class="bigslide__title">
          <span class="bigslide__kicker">презентация · 12 слайдов</span>
          <h3>Утро делает твой
день.</h3>
          <p>почему первые 30&nbsp;минут решают всё —<br/>и&nbsp;что с&nbsp;этим делать на&nbsp;этой неделе</p>
        </div>
      </div>
    </article>

    <!-- 02 — слайд с графиком -->
    <article class="bigslide bigslide--chart">
      <div class="bigslide__num">02 · данные</div>
      <h3 class="bigslide__h">Что меняется за&nbsp;14 дней</h3>
      <p class="bigslide__sub">Замеры людей, которые перенесли первый кофе с&nbsp;7:00 на&nbsp;8:30 и&nbsp;добавили 10 минут света.</p>
      <div class="chartbox">
        <svg viewBox="0 0 480 220" class="chart">
          <g stroke="#E8E2D2" stroke-width="1">
            <line x1="40" y1="40"  x2="460" y2="40"/>
            <line x1="40" y1="100" x2="460" y2="100"/>
            <line x1="40" y1="160" x2="460" y2="160"/>
          </g>
          <text x="32" y="45"  text-anchor="end" font-size="10" fill="#7A7466">100</text>
          <text x="32" y="105" text-anchor="end" font-size="10" fill="#7A7466"> 60</text>
          <text x="32" y="165" text-anchor="end" font-size="10" fill="#7A7466"> 20</text>
          <g fill="#14130F" opacity=".15">
            <rect x="60"  y="120" width="22" height="40"/>
            <rect x="120" y="110" width="22" height="50"/>
            <rect x="180" y="115" width="22" height="45"/>
            <rect x="240" y="105" width="22" height="55"/>
            <rect x="300" y="100" width="22" height="60"/>
            <rect x="360" y="98"  width="22" height="62"/>
            <rect x="420" y="96"  width="22" height="64"/>
          </g>
          <g fill="#D8FF36" stroke="#14130F" stroke-width="1.2">
            <rect x="86"  y="80" width="22" height="80"/>
            <rect x="146" y="60" width="22" height="100"/>
            <rect x="206" y="50" width="22" height="110"/>
            <rect x="266" y="42" width="22" height="118"/>
            <rect x="326" y="38" width="22" height="122"/>
            <rect x="386" y="34" width="22" height="126"/>
            <rect x="446" y="32" width="22" height="128"/>
          </g>
          <g font-size="10" fill="#7A7466" text-anchor="middle">
            <text x="84"  y="200">пн</text>
            <text x="144" y="200">вт</text>
            <text x="204" y="200">ср</text>
            <text x="264" y="200">чт</text>
            <text x="324" y="200">пт</text>
            <text x="384" y="200">сб</text>
            <text x="444" y="200">вс</text>
          </g>
        </svg>
        <div class="chartlegend">
          <span><i class="lg lg--ink"></i>до</span>
          <span><i class="lg lg--lime"></i>после</span>
          <strong>+38% энергии к&nbsp;вечеру</strong>
        </div>
      </div>
    </article>

    <!-- 03 — текстовый слайд с врезкой -->
    <article class="bigslide bigslide--text">
      <div class="bigslide__num">04 · действие</div>
      <h3 class="bigslide__h">Один эксперимент<br/>на&nbsp;эту неделю</h3>
      <ol class="bigslide__list">
        <li><strong>Свет в&nbsp;глаза 5&nbsp;минут.</strong> Сразу после пробуждения — окно или улица. Никакого экрана.</li>
        <li><strong>Стакан воды.</strong> До&nbsp;кофе. До&nbsp;любых решений и&nbsp;писем.</li>
        <li><strong>10 минут движения.</strong> Прогулка вокруг дома, лестница, что угодно — кроме сидения.</li>
      </ol>
      <div class="bigslide__quote">
        «Не пытайся изменить день в&nbsp;14:00. Меняй первые 30 минут — остальное подтянется само.»
      </div>
    </article>

    <!-- 04 — финал -->
    <article class="bigslide bigslide--end">
      <div class="bigslide__num">5 · финал</div>
      <svg viewBox="0 0 480 240" class="bigslide__art bigslide__art--end" preserveAspectRatio="xMidYMid slice">
        <rect width="480" height="240" fill="#14130F"/>
        <g fill="#D8FF36">
          <circle cx="80"  cy="60"  r="2"/>
          <circle cx="180" cy="40"  r="1.5"/>
          <circle cx="260" cy="80"  r="1.2"/>
          <circle cx="360" cy="50"  r="2.2"/>
          <circle cx="420" cy="100" r="1.4"/>
          <circle cx="120" cy="120" r="1.1"/>
        </g>
        <text x="240" y="140" text-anchor="middle" font-family="Unbounded, sans-serif" font-weight="700" font-size="42" fill="#F6F2E7" letter-spacing="-1">Спасибо.</text>
        <text x="240" y="180" text-anchor="middle" font-family="Onest, sans-serif" font-size="16" fill="#D8FF36">@proboiAI_bot</text>
      </svg>
      <p class="bigslide__sub">Все 5 слайдов и иллюстрации — собрал бот. По одной фразе.</p>
    </article>
  </div>

  <div class="slides-foot">
    <div class="format-pill">.pptx</div>
    <p>Открывается в&nbsp;любом PowerPoint, Keynote или Google Slides. Любой слайд или картинку — переделать одной фразой.</p>
    <a class="cta-row" href="${TG_URL}" target="_blank" rel="noopener">
      <span>Пробуй прямо сейчас</span><span class="cta-row__arrow">→</span>
    </a>
  </div>
</section>

<!-- ===========================================================
     8. РАСПИСАНИЕ
     =========================================================== -->
<section class="block block--clock" data-screen-label="08 Расписание">
  <div class="block__grid block__grid--split">
    <div>
      <span class="kicker">08 — расписание</span>
      <h2 class="display display--md">Заведи бота на расписание —<br/><span class="ink-stroke">он сам напомнит и&nbsp;сделает.</span></h2>
      <p class="lead">
        «Каждое утро в&nbsp;9 — сводка важных писем».
        «Каждый понедельник — отчёт за&nbsp;неделю».
        Настраивается одной фразой.
      </p>

      <ul class="bulletlist bulletlist--compact">
        <li><span class="num">⏱</span><div>«Каждый день в&nbsp;21:00 спрашивай как день прошёл и&nbsp;записывай» → дневник сам</div></li>
        <li><span class="num">⏱</span><div>«По понедельникам в&nbsp;8 утра — обзор моих задач на&nbsp;неделю»</div></li>
        <li><span class="num">⏱</span><div>«Если на&nbsp;Авито появится квартира за&nbsp;80&nbsp;к в&nbsp;моём районе — пинг»</div></li>
      </ul>

      <div class="note-pill">
        <span class="dot dot--lime"></span>
        Расписание настраивается в&nbsp;чате одной фразой. Никаких панелей.
      </div>

      <a class="cta-row" href="${TG_URL}" target="_blank" rel="noopener">
        <span>Пробуй прямо сейчас</span><span class="cta-row__arrow">→</span>
      </a>
    </div>

    <figure class="visual visual--clock">
      <div class="clock" id="clock">
        <svg viewBox="0 0 400 400" class="clock__svg">
          <circle cx="200" cy="200" r="170" fill="none" stroke="var(--ink)" stroke-width="2"/>
          <circle cx="200" cy="200" r="170" fill="none" stroke="var(--ink)" stroke-width="14" stroke-dasharray="2 18" stroke-linecap="round"/>
          <g id="clockTicks"></g>
          <line id="clockHand" x1="200" y1="200" x2="200" y2="60" stroke="var(--coral)" stroke-width="3" stroke-linecap="round"/>
          <circle cx="200" cy="200" r="6" fill="var(--ink)"/>
        </svg>
        <div class="clock__task clock__task--1"><span>09:00</span> сводка почты</div>
        <div class="clock__task clock__task--2"><span>13:00</span> отчёт за&nbsp;день</div>
        <div class="clock__task clock__task--3"><span>21:00</span> «как день?»</div>
        <div class="clock__task clock__task--4"><span>пн 08:00</span> план недели</div>
      </div>
    </figure>
  </div>
</section>

<!-- ===========================================================
     9. РАБОТАЕТ ПОКА ТЫ СПИШЬ
     =========================================================== -->
<section class="block block--night" data-screen-label="09 Ночь">
  <div class="night">
    <div class="night__sky" id="nightSky"></div>
    <div class="night__inner">
      <span class="kicker kicker--inverse">09 — фон</span>
      <h2 class="display display--md inverse">Дал задачу вечером —<br/><span class="lime-stroke">утром получил результат.</span></h2>
      <p class="lead inverse">
        Долгие задачи бот тащит сам в&nbsp;фоне.
        Можешь закрыть Telegram, выключить телефон — он всё равно сделает и&nbsp;пришлёт.
      </p>

      <div class="night__cards">
        <div class="ncard">
          <div class="ncard__time">22:14 → 07:30</div>
          <div class="ncard__cmd">«Прочитай отчёт на&nbsp;200 страниц и&nbsp;выдай суть»</div>
          <div class="ncard__bar"><span style="width:100%"></span></div>
          <div class="ncard__res">✓ суть на&nbsp;1&nbsp;страницу</div>
        </div>
        <div class="ncard">
          <div class="ncard__time">23:02 → 24:00</div>
          <div class="ncard__cmd">«Цены на&nbsp;этот товар по&nbsp;20&nbsp;магазинам»</div>
          <div class="ncard__bar"><span style="width:100%"></span></div>
          <div class="ncard__res">✓ таблица .xlsx</div>
        </div>
        <div class="ncard">
          <div class="ncard__time">00:11 → 08:05</div>
          <div class="ncard__cmd">«Перепиши все мои черновики в&nbsp;один пост»</div>
          <div class="ncard__bar"><span style="width:100%"></span></div>
          <div class="ncard__res">✓ пост на&nbsp;1&nbsp;500&nbsp;знаков</div>
        </div>
      </div>

      <a class="cta-row cta-row--inverse" href="${TG_URL}" target="_blank" rel="noopener">
        <span>Пробуй прямо сейчас</span><span class="cta-row__arrow">→</span>
      </a>
    </div>
  </div>
</section>

<!-- ===========================================================
     10. ДЕЛАЕТ ТЕБЕ ТВОИХ БОТОВ
     =========================================================== -->
<section class="block block--bots" data-screen-label="10 Боты">
  <div class="block__head">
    <span class="kicker">10 — боты</span>
    <h2 class="display display--md">Свой телеграм-бот<br/><span class="ink-stroke">за&nbsp;вечер.</span></h2>
    <p class="lead">
      Описал, какой бот тебе нужен — наш бот напишет код, поднимет твоего бота
      и&nbsp;даст ссылку. Без программистов.
    </p>
  </div>

  <figure class="botfarm">
    <div class="botfarm__big">
      <svg width="120" height="120"><use href="#logo"/></svg>
      <div class="botfarm__biglabel">мой&nbsp;Клод</div>
    </div>
    <svg class="botfarm__lines" viewBox="0 0 800 280" aria-hidden="true">
      <path d="M400 20 Q200 80 80 200" stroke="var(--ink)" stroke-width="1.4" fill="none" stroke-dasharray="3 6"/>
      <path d="M400 20 Q300 80 240 200" stroke="var(--ink)" stroke-width="1.4" fill="none" stroke-dasharray="3 6"/>
      <path d="M400 20 Q400 100 400 200" stroke="var(--ink)" stroke-width="1.4" fill="none" stroke-dasharray="3 6"/>
      <path d="M400 20 Q500 80 560 200" stroke="var(--ink)" stroke-width="1.4" fill="none" stroke-dasharray="3 6"/>
      <path d="M400 20 Q600 80 720 200" stroke="var(--ink)" stroke-width="1.4" fill="none" stroke-dasharray="3 6"/>
    </svg>
    <div class="botfarm__row">
      <div class="minibot"><div class="minibot__face"></div><div class="minibot__tag">бот-напоминалка<br/>для клиентов</div></div>
      <div class="minibot"><div class="minibot__face"></div><div class="minibot__tag">собирает заявки<br/>и&nbsp;шлёт в&nbsp;чат</div></div>
      <div class="minibot"><div class="minibot__face"></div><div class="minibot__tag">бот-словарик<br/>для курса английского</div></div>
      <div class="minibot"><div class="minibot__face"></div><div class="minibot__tag">парсит цены<br/>раз в&nbsp;час</div></div>
      <div class="minibot"><div class="minibot__face"></div><div class="minibot__tag">отвечает<br/>в&nbsp;поддержке</div></div>
    </div>
  </figure>

  <a class="cta-row" href="${TG_URL}" target="_blank" rel="noopener">
    <span>Пробуй прямо сейчас</span><span class="cta-row__arrow">→</span>
  </a>
</section>

<!-- ===========================================================
     11. КОМАНДА ПОМОЩНИКОВ
     =========================================================== -->
<section class="block block--swarm" data-screen-label="11 Команда">
  <div class="block__grid block__grid--split block__grid--reverse">
    <figure class="visual visual--swarm">
      <div class="swarm">
        <div class="swarm__main"><span>один большой</span></div>
        <svg class="swarm__fan" viewBox="0 0 600 240" aria-hidden="true">
          <path d="M300 30 Q200 90 100 210" stroke="var(--ink)" stroke-width="1.4" fill="none" stroke-dasharray="3 6"/>
          <path d="M300 30 Q260 100 200 210" stroke="var(--ink)" stroke-width="1.4" fill="none" stroke-dasharray="3 6"/>
          <path d="M300 30 Q300 100 300 210" stroke="var(--ink)" stroke-width="1.4" fill="none" stroke-dasharray="3 6"/>
          <path d="M300 30 Q340 100 400 210" stroke="var(--ink)" stroke-width="1.4" fill="none" stroke-dasharray="3 6"/>
          <path d="M300 30 Q400 90 500 210" stroke="var(--ink)" stroke-width="1.4" fill="none" stroke-dasharray="3 6"/>
        </svg>
        <div class="swarm__row">
          <div class="swarmkid">район&nbsp;1</div>
          <div class="swarmkid">район&nbsp;2</div>
          <div class="swarmkid">район&nbsp;3</div>
          <div class="swarmkid">район&nbsp;4</div>
          <div class="swarmkid">район&nbsp;5</div>
        </div>
        <div class="swarm__result">→ один итоговый список из&nbsp;50&nbsp;кафе</div>
      </div>
    </figure>

    <div>
      <span class="kicker">11 — командная работа</span>
      <h2 class="display display--md">Большие задачи делает<br/><span class="ink-stroke">командой,</span> а&nbsp;не один.</h2>
      <p class="lead">
        Когда задача большая — бот сам поручает её нескольким маленьким помощникам,
        они работают параллельно. Получается в&nbsp;разы быстрее.
      </p>
      <p class="lead lead--quiet">
        Попросишь «собери список 50&nbsp;кафе с&nbsp;рейтингом и&nbsp;ценой» — бот не&nbsp;пойдёт по&nbsp;одному,
        а&nbsp;отправит десять помощников по&nbsp;разным районам сразу. Сам разберёт, сам соберёт, сам пришлёт итог.
      </p>

      <a class="cta-row" href="${TG_URL}" target="_blank" rel="noopener">
        <span>Пробуй прямо сейчас</span><span class="cta-row__arrow">→</span>
      </a>
    </div>
  </div>
</section>

<!-- ===========================================================
     12. СВОЙ КУСОЧЕК СЕРВЕРА
     =========================================================== -->
<section class="block block--server" data-screen-label="12 Сервер">
  <div class="block__head">
    <span class="kicker">12 — изоляция</span>
    <h2 class="display display--md">Все твои файлы —<br/><span class="ink-stroke">в&nbsp;твоём личном пространстве.</span></h2>
    <p class="lead">
      У&nbsp;каждого пользователя свой изолированный кусок сервера.
      Никто кроме тебя туда не&nbsp;заходит — даже другие пользователи бота.
    </p>
  </div>

  <div class="vaults">
    <div class="vault vault--locked" aria-hidden="true"><div class="vault__lock">🔒</div><div class="vault__name vault__name--hidden">недоступно</div></div>
    <div class="vault vault--locked" aria-hidden="true"><div class="vault__lock">🔒</div><div class="vault__name vault__name--hidden">недоступно</div></div>
    <div class="vault vault--mine">
      <div class="vault__head">это твоё</div>
      <div class="vault__icon">
        <svg width="56" height="56"><use href="#logo"/></svg>
      </div>
      <div class="vault__files">
        <span class="vfile">📁 проекты</span>
        <span class="vfile">🗒 заметки</span>
        <span class="vfile">📊 базы</span>
        <span class="vfile">⚙ скрипты</span>
      </div>
      <div class="vault__name vault__name--mine">только ты</div>
    </div>
    <div class="vault vault--locked" aria-hidden="true"><div class="vault__lock">🔒</div><div class="vault__name vault__name--hidden">недоступно</div></div>
    <div class="vault vault--locked" aria-hidden="true"><div class="vault__lock">🔒</div><div class="vault__name vault__name--hidden">недоступно</div></div>
  </div>

  <ul class="bulletlist bulletlist--inline">
    <li>Файлы, проекты, заметки, базы — всё в&nbsp;твоём личном хранилище.</li>
    <li>Бот может запускать там скрипты, ставить программы, держать твои данные.</li>
    <li>Других пользователей ты не&nbsp;видишь, и&nbsp;они не&nbsp;видят тебя.</li>
  </ul>

  <a class="cta-row" href="${TG_URL}" target="_blank" rel="noopener">
    <span>Пробуй прямо сейчас</span><span class="cta-row__arrow">→</span>
  </a>
</section>

<!-- ===========================================================
     12.5 ЛЮБАЯ РОЛЬ / КОНФИГУРАЦИЯ
     =========================================================== -->
<section class="block block--mkt block--config" data-screen-label="12 Любая роль">
  <div class="block__head block__head--center">
    <span class="kicker">12 — настройка</span>
    <h2 class="display display--md inverse">Любые параметры —<br/><span class="ink-stroke">любая роль.</span></h2>
    <p class="lead">Опиши словами, кого ты хочешь рядом — бот становится этим. Ассистентом, аналитиком, репетитором, целым отделом. Никаких форм с&nbsp;галочками, просто текст.</p>
  </div>

  <div class="cfg">
    <div class="cfg__card">
      <div class="cfg__head">
        <div class="cfg__dots"><span></span><span></span><span></span></div>
        <div class="cfg__title">собрать своего</div>
        <div class="cfg__meta">текстом, ~&nbsp;2&nbsp;минуты</div>
      </div>

      <div class="cfg__rows">
        <div class="cfg__row">
          <span class="cfg__label">кто это</span>
          <span class="cfg__value">маркетолог </span>
          <span class="cfg__hint">или финдир, тренер, ассистент…</span>
        </div>
        <div class="cfg__row">
          <span class="cfg__label">что знает</span>
          <span class="cfg__value">мои заметки по клиентам</span>
          <span class="cfg__hint">любые файлы, ссылки, таблицы</span>
        </div>
        <div class="cfg__row">
          <span class="cfg__label">как говорит</span>
          <span class="cfg__value">просто, без формальностей</span>
          <span class="cfg__hint">любой тон голоса</span>
        </div>
        <div class="cfg__row">
          <span class="cfg__label">с&nbsp;чем&nbsp;связан</span>
          <span class="cfg__value">Gmail · Sheets · CRM записи</span>
          <span class="cfg__hint">любые сервисы</span>
        </div>
        <div class="cfg__row">
          <span class="cfg__label">когда</span>
          <span class="cfg__value">каждое утро в&nbsp;8:30</span>
          <span class="cfg__hint">по&nbsp;триггеру или расписанию</span>
        </div>
      </div>

      <div class="cfg__foot">
        <span class="cfg__caret">▍</span>
        <span class="cfg__placeholder">допиши свои параметры…</span>
      </div>
    </div>

    <aside class="cfg__side">
      <div class="cfg__sideLabel">КАКИЕ ЛИЧНОСТИ УЖЕ БЫЛИ СДЕЛАНЫ ПОЛЬЗОВАТЕЛЯМИ</div>
      <div class="cfg__chips">
        <span class="cfg__chip">личный ассистент</span>
        <span class="cfg__chip">аналитик продаж</span>
        <span class="cfg__chip">маркетолог</span>
        <span class="cfg__chip">финдир</span>
        <span class="cfg__chip">репетитор по&nbsp;английскому</span>
        <span class="cfg__chip">эйчар</span>
        <span class="cfg__chip">саппорт</span>
        <span class="cfg__chip">копирайтер</span>
        <span class="cfg__chip">бухгалтер</span>
        <span class="cfg__chip">редактор</span>
        <span class="cfg__chip">админ записи</span>
        <span class="cfg__chip cfg__chip--more">+&nbsp;что угодно</span>
      </div>
    </aside>
  </div>

  <a class="cta-row cta-row--center" href="${TG_URL}" target="_blank" rel="noopener">
    <span>Собрать своего</span><span class="cta-row__arrow">→</span>
  </a>
</section>

<!-- ===========================================================
     13. КЕЙС: АДМИН В БАРБЕРШОПЕ
     =========================================================== -->
<section class="block block--case" data-screen-label="13 Кейс барбершоп">
  <div class="block__head">
    <span class="kicker">13 — реальный кейс</span>
    <h2 class="display display--md">Админ в&nbsp;барбершопе<br/><span class="ink-stroke">собрал себе помощника за&nbsp;пару часов.</span></h2>
    <p class="lead">Подключил CRM записи, таблицы, расписание барберов. Бот сам каждое утро присылает план дня, срез по&nbsp;мастерам и&nbsp;остаток бюджета по&nbsp;точкам.</p>
  </div>

  <div class="case">
    <ol class="caseflow">
      <li>
        <div class="caseflow__step">01</div>
        <div>
          <h4>Подцепил CRM записи и&nbsp;свои таблицы</h4>
          <p>«Подключил через аккаунт разработчика — был приятно удивлен, что такой есть». Бот залез в систему записи и сразу увидел всю картину.</p>
        </div>
      </li>
      <li>
        <div class="caseflow__step">02</div>
        <div>
          <h4>Поставил отложенные тайминги</h4>
          <p>Каждый день в&nbsp;09:30 — план на&nbsp;день и&nbsp;срез: продажи, допы, средний чек, возвращаемость.</p>
        </div>
      </li>
      <li>
        <div class="caseflow__step">03</div>
        <div>
          <h4>Подкрутил метрики, которых не&nbsp;было</h4>
          <p>Возвращаемость гостей. Теперь считается автоматически.</p>
        </div>
      </li>
      <li>
        <div class="caseflow__step">04</div>
        <div>
          <h4>Сам составляет расписание дежурных</h4>
          <p>Бот синхронизировался с&nbsp;графиком и&nbsp;сам ставит дежурного барбера на&nbsp;каждый день.</p>
        </div>
      </li>
      <li>
        <div class="caseflow__step">05</div>
        <div>
          <h4>Уловил стиль</h4>
          <p>«Моментами была убогая формулировка. Но он чуть мой стиль уловил, начал менять. Либо я&nbsp;прогнулся под него за&nbsp;сутки плотного общения.»</p>
        </div>
      </li>
    </ol>

    <div class="casereport">
      <div class="casereport__head">
        <span>09:30 · ежедневная сводка</span>
        <span class="casereport__bot">бот</span>
      </div>

      <div class="caseblock">
        <div class="caseblock__title">📊 точка №1 — сегодня</div>
        <div class="caseblock__rows">
          <div><span>Записей</span><b>16</b></div>
          <div><span>Выручка</span><b>36 130 ₽</b></div>
          <div><span>План</span><b>48 000 ₽</b></div>
          <div><span>Выполнение</span><b class="b-lime">75%</b></div>
        </div>
        <div class="caseblock__bar">
          <div class="caseblock__bar__fill" style="width: 75%"></div>
        </div>
      </div>

      <div class="caseblock">
        <div class="caseblock__title">📈 срез за&nbsp;месяц · мастера</div>
        <table class="masttable">
          <thead><tr><th>мастер</th><th>оборот</th><th>ср.&nbsp;чек</th><th>возвр.</th></tr></thead>
          <tbody>
            <tr><td>М&nbsp;1</td><td>19&nbsp;840</td><td>2&nbsp;459</td><td><b class="b-lime">71%</b></td></tr>
            <tr><td>М&nbsp;2</td><td>10&nbsp;320</td><td>2&nbsp;528</td><td>62%</td></tr>
            <tr><td>М&nbsp;3</td><td>3&nbsp;000</td><td>1&nbsp;901</td><td>57%</td></tr>
            <tr class="muted"><td>М&nbsp;4 · отпуск</td><td>1&nbsp;300</td><td>1&nbsp;971</td><td>65%</td></tr>
          </tbody>
        </table>
      </div>

      <div class="caseblock">
        <div class="caseblock__title">💸 остаток бюджета · 3 точки</div>
        <div class="budgrid">
          <div class="budgrid__item">
            <span class="budgrid__name">точка №1</span>
            <span class="budgrid__amount">46&nbsp;046 ₽</span>
            <span class="budgrid__cap">из&nbsp;87&nbsp;925 ₽</span>
          </div>
          <div class="budgrid__item">
            <span class="budgrid__name">точка №2</span>
            <span class="budgrid__amount">53&nbsp;584 ₽</span>
            <span class="budgrid__cap">из&nbsp;80&nbsp;244 ₽</span>
          </div>
          <div class="budgrid__item">
            <span class="budgrid__name">точка №3</span>
            <span class="budgrid__amount">54&nbsp;178 ₽</span>
            <span class="budgrid__cap">из&nbsp;71&nbsp;133 ₽</span>
          </div>
        </div>
      </div>

      <div class="caseblock">
        <div class="caseblock__title">📅 дежурный сегодня</div>
        <div class="dutyrow">
          <div class="dutyrow__avatar">М 2</div>
          <div>
            <b>М&nbsp;2</b><br/>
            <span class="muted-s">бот сам подобрал по&nbsp;графику</span>
          </div>
          <div class="dutyrow__pill">✓ закреплено</div>
        </div>
      </div>
    </div>
  </div>

  <div class="case__quote">«Сама суть — что он рутинную работу взял на себя. Вроде мелочь, но очень экономит время. В совокупности классно выходит.»
— админ сети барбершопов</div>

  <a class="cta-row cta-row--center" href="${TG_URL}" target="_blank" rel="noopener">
    <span>Собери такого&nbsp;же помощника</span><span class="cta-row__arrow">→</span>
  </a>
</section>

<!-- ===========================================================
     14. ЧЕМ ОТЛИЧАЕТСЯ
     =========================================================== -->
<section class="block block--vs" id="vs" data-screen-label="14 Сравнение">
  <div class="block__head">
    <span class="kicker">14 — сравнение</span>
    <h2 class="display display--md">Чем отличается от<br/><span class="ink-stroke">обычных чат-ботов?</span></h2>
  </div>

  <div class="vs">
    <div class="vs__head vs__head--left">обычный чат-бот</div>
    <div class="vs__head vs__head--right">Proboi</div>

    <div class="vs__row">
      <div class="vs__cell vs__cell--left">Забывает разговор, как только закрыл вкладку</div>
      <div class="vs__cell vs__cell--right">Помнит всё, делает систему памяти всех твоих мыслей</div>
    </div>
    <div class="vs__row">
      <div class="vs__cell vs__cell--left">Не работает с&nbsp;твоими файлами</div>
      <div class="vs__cell vs__cell--right">У&nbsp;тебя <b>выделенное хранилище</b> с&nbsp;твоими файлами</div>
    </div>
    <div class="vs__row">
      <div class="vs__cell vs__cell--left">Не работает в&nbsp;фоне</div>
      <div class="vs__cell vs__cell--right"><b>Работает постоянно, можно поставить отложенную задачу</b></div>
    </div>
    <div class="vs__row">
      <div class="vs__cell vs__cell--left">Не подключается к&nbsp;твоей почте, календарю, заметкам</div>
      <div class="vs__cell vs__cell--right"><b>Подключается одной кнопкой, легко управлять</b></div>
    </div>
    <div class="vs__row">
      <div class="vs__cell vs__cell--left">Не делает других ботов</div>
      <div class="vs__cell vs__cell--right"><b>Делает ботов, автоматизации</b></div>
    </div>
  </div>

  <a class="cta-row" href="${TG_URL}" target="_blank" rel="noopener">
    <span>Попробовать самому</span><span class="cta-row__arrow">→</span>
  </a>
</section>

<!-- ===========================================================
     15. FAQ
     =========================================================== -->
<section class="block block--faq" id="faq" data-screen-label="15 FAQ">
  <div class="block__head">
    <span class="kicker">15 — вопросы</span>
    <h2 class="display display--md">Что обычно<br/><span class="ink-stroke">спрашивают.</span></h2>
  </div>

  <div class="faq">
    <details class="faq__item" open>
      <summary>Это безопасно? Бот видит мои данные?</summary>
      <p>Нет. Твои файлы лежат в&nbsp;твоём личном пространстве — никто туда не&nbsp;заглянет, ни&nbsp;мы, ни&nbsp;другие пользователи.</p>
    </details>
    <details class="faq__item">
      <summary>Сколько это стоит?</summary>
      <p>Сейчас доступ по&nbsp;приглашению, бесплатно. Тарифы введём позже.</p>
    </details>
    <details class="faq__item">
      <summary>Я не&nbsp;программист, у&nbsp;меня получится?</summary>
      <p>Да. Боту достаточно сказать на&nbsp;обычном языке, что ты хочешь.</p>
    </details>
    <details class="faq__item">
      <summary>А&nbsp;если я&nbsp;хочу отменить и&nbsp;удалить всё?</summary>
      <p>Скажешь боту — он удалит. Без отдела поддержки.</p>
    </details>
    <details class="faq__item">
      <summary>Что если я&nbsp;перестану писать на&nbsp;месяц?</summary>
      <p>Вернёшься — бот вспомнит, на&nbsp;чём остановились.</p>
    </details>
    <details class="faq__item">
      <summary>Чем отличается от&nbsp;обычного чат-бота?</summary>
      <p><a href="#vs">→ короткое сравнение в&nbsp;блоке выше</a>.</p>
    </details>
  </div>
</section>

<!-- ===========================================================
     16. FINAL CTA
     =========================================================== -->
<section class="block block--final" data-screen-label="16 Финал">
  <div class="final">
    <h2 class="display display--xl">Хватит<br/>читать.</h2>
    <p class="final__sub">Открой Telegram и&nbsp;напиши боту, что хочешь.</p>
    <a class="btn btn--big btn--final" href="${TG_URL}" target="_blank" rel="noopener">
      <span>Пробуй прямо сейчас</span>
      <span class="btn__arrow">→</span>
    </a>
    <p class="final__small">Доступ по&nbsp;приглашению — напиши <a href="${OWNER_TG}" target="_blank" rel="noopener">@ev_mironoff</a>, если бот тебя не&nbsp;пускает.</p>
  </div>
</section>

</main>

${FOOTER_HTML}

<script src="/assets/landing-visuals.js" defer></script>
</body>
</html>`;
}


export function renderHowToSetup(): string {
  return renderHowToSetupGuide();
}

export function renderHowToSetupGuide(): string {
  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>Как пользоваться Proboi — твоим личным ИИ</title>
<meta name="description" content="Всё что умеет Proboi: голос, файлы, память, почта, своя страничка, дашборд. Открывай нужный блок." />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Unbounded:wght@600;700;800&family=Onest:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
<style>
/* ── Reset ─────────────────────────────────────────── */
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html { scroll-behavior: smooth; }
body {
  --paper:   #F1ECE0;
  --paper-2: #E8E1D2;
  --ink:     #14130F;
  --ink-2:   #2A2823;
  --muted:   #6F695C;
  --lime:    #D8FF36;
  --lime-2:  #B7E022;
  --coral:   #FF4F2E;
  --cream:   #FFF9EC;
  --line:    #1A1814;
  --r-md:    14px;
  --r-lg:    22px;
  --r-xl:    32px;
  --f-display: "Unbounded", system-ui, sans-serif;
  --f-body:    "Onest", system-ui, sans-serif;
  --f-mono:    "JetBrains Mono", ui-monospace, monospace;

  background: var(--paper);
  color: var(--ink);
  font-family: var(--f-body);
  font-size: 16px;
  line-height: 1.6;
  -webkit-font-smoothing: antialiased;
}

/* ── Nav ───────────────────────────────────────────── */
.g-nav {
  display: flex; align-items: center; justify-content: space-between;
  padding: 18px 32px;
  border-bottom: 1.5px solid var(--ink);
  position: sticky; top: 0; z-index: 100;
  background: var(--paper);
}
.g-nav__brand {
  display: flex; align-items: center; gap: 10px;
  text-decoration: none; color: var(--ink);
  font-family: var(--f-display); font-weight: 700; font-size: 15px;
}
.g-nav__logo {
  width: 36px; height: 36px; border-radius: 50%;
  display: block; flex-shrink: 0;
}
.g-nav__cta {
  display: inline-flex; align-items: center; gap: 7px;
  background: var(--lime); color: var(--ink);
  border: 1.5px solid var(--ink); border-radius: 999px;
  padding: 9px 20px; font-family: var(--f-body); font-weight: 600;
  font-size: 14px; text-decoration: none;
  transition: background .18s, transform .14s;
}
.g-nav__cta:hover { background: var(--lime-2); transform: translateY(-1px); }

/* ── Hero ──────────────────────────────────────────── */
.g-hero {
  max-width: 860px; margin: 0 auto;
  padding: 56px 32px 12px;
}
.g-hero__badge {
  display: inline-block;
  background: var(--lime); color: var(--ink);
  border: 1.5px solid var(--ink); border-radius: 999px;
  font-family: var(--f-mono); font-size: 12px; font-weight: 500;
  padding: 5px 14px; letter-spacing: .04em;
  margin-bottom: 28px;
}
.g-hero__title {
  font-family: var(--f-display); font-weight: 800;
  font-size: clamp(28px, 5vw, 52px);
  line-height: 1.08; letter-spacing: -.03em;
  color: var(--ink);
  margin-bottom: 18px;
}
.g-hero__title em { font-style: normal; color: var(--coral); }
.g-hero__sub {
  font-size: 18px; color: var(--ink-2); max-width: 54ch;
  line-height: 1.5;
}

/* ── Toggles wrapper ───────────────────────────────── */
.g-toggles {
  max-width: 860px; margin: 48px auto 0;
  padding: 0 32px 80px;
  display: flex; flex-direction: column; gap: 12px;
}

/* ── Single toggle card ────────────────────────────── */
details.g-block {
  border: 1.5px solid var(--ink);
  border-radius: var(--r-lg);
  background: var(--cream);
  overflow: hidden;
  transition: box-shadow .18s;
}
details.g-block:hover { box-shadow: 3px 3px 0 var(--ink); }
details.g-block[open] { box-shadow: 4px 4px 0 var(--ink); }

details.g-block summary {
  list-style: none;
  display: flex; align-items: center; justify-content: space-between;
  gap: 16px;
  padding: 20px 24px;
  cursor: pointer;
  user-select: none;
  min-height: 64px;
}
details.g-block summary::-webkit-details-marker { display: none; }

.g-block__hd { display: flex; flex-direction: column; gap: 3px; flex: 1; }
.g-block__title {
  font-family: var(--f-display); font-weight: 700;
  font-size: clamp(14px, 2vw, 17px); color: var(--ink);
  letter-spacing: -.01em; line-height: 1.2;
}
.g-block__hint {
  font-size: 13px; color: var(--muted); font-weight: 400;
}
.g-block__arrow {
  font-size: 18px; color: var(--ink); flex-shrink: 0;
  transition: transform .22s cubic-bezier(.4,0,.2,1);
  line-height: 1;
}
details.g-block[open] .g-block__arrow { transform: rotate(180deg); }

.g-block__body {
  padding: 0 24px 26px;
  border-top: 1.5px solid var(--paper-2);
}
.g-block__body p {
  color: var(--ink-2); font-size: 16px; line-height: 1.6;
  margin-top: 18px; max-width: 65ch;
}
.g-block__body ul, .g-block__body ol {
  padding-left: 20px; margin-top: 14px;
}
.g-block__body li {
  color: var(--ink-2); font-size: 15px; line-height: 1.5;
  margin-bottom: 8px;
}
.g-block__tip {
  margin-top: 18px; padding: 14px 18px;
  background: var(--paper-2); border: 1.5px solid var(--ink);
  border-radius: var(--r-md); font-size: 14px; color: var(--ink-2);
}
.g-block__tip strong { color: var(--ink); font-weight: 600; }

/* SVG mockup container */
.g-mock {
  margin-top: 22px;
  display: flex; justify-content: flex-start;
  overflow-x: auto;
}
.g-mock svg { max-width: 100%; height: auto; }

/* Example pairs (блок 3) */
.g-examples { display: flex; flex-direction: column; gap: 14px; margin-top: 18px; }
.g-ex-pair { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.g-ex {
  padding: 14px 16px; border-radius: var(--r-md);
  border: 1.5px solid var(--ink); font-size: 14px; line-height: 1.5;
}
.g-ex--bad { background: #FFE5E0; }
.g-ex--good { background: #EDFFB0; }
.g-ex__label {
  font-family: var(--f-mono); font-size: 11px; font-weight: 500;
  letter-spacing: .06em; margin-bottom: 6px; display: block;
}
.g-ex--bad .g-ex__label { color: #C0280D; }
.g-ex--good .g-ex__label { color: #5A7A00; }

/* Capabilities grid (блок 2) */
.g-caps { display: grid; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap: 10px; margin-top: 18px; }
.g-cap {
  padding: 14px 12px; border: 1.5px solid var(--ink);
  border-radius: var(--r-md); background: var(--paper);
  font-size: 13px; color: var(--ink-2); line-height: 1.4;
  display: flex; flex-direction: column; gap: 6px;
}
.g-cap__ico { font-size: 20px; line-height: 1; }

/* Cases list (блок 5) */
.g-cases { display: flex; flex-direction: column; gap: 16px; margin-top: 18px; }
.g-case { padding: 16px 18px; background: var(--paper); border: 1.5px solid var(--ink); border-radius: var(--r-md); }
.g-case__title { font-weight: 600; font-size: 15px; color: var(--ink); margin-bottom: 4px; }
.g-case__desc { font-size: 14px; color: var(--ink-2); line-height: 1.5; }

/* ── CTA block ─────────────────────────────────────── */
.g-cta {
  max-width: 860px; margin: 0 auto 80px;
  padding: 0 32px;
}
.g-cta__box {
  background: var(--ink); color: var(--cream);
  border-radius: var(--r-xl); padding: 48px 40px;
  display: flex; flex-direction: column; gap: 18px;
  align-items: flex-start;
}
.g-cta__title {
  font-family: var(--f-display); font-weight: 800;
  font-size: clamp(22px, 3.5vw, 36px); letter-spacing: -.02em;
  line-height: 1.1;
}
.g-cta__sub { font-size: 16px; color: #B5AFA3; max-width: 50ch; line-height: 1.5; }
.g-cta__sub code {
  font-family: var(--f-mono); background: #2A2823;
  padding: 1px 7px; border-radius: 5px; font-size: 14px; color: var(--lime);
}
.g-cta__btn {
  display: inline-flex; align-items: center; gap: 8px;
  background: var(--lime); color: var(--ink);
  border-radius: 999px; padding: 14px 30px;
  font-family: var(--f-body); font-weight: 700; font-size: 16px;
  text-decoration: none; border: 1.5px solid var(--lime);
  transition: background .18s, transform .14s;
  margin-top: 6px;
}
.g-cta__btn:hover { background: var(--lime-2); transform: translateY(-2px); }
.g-cta__btns { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 6px; }
.g-cta__btn--ghost {
  background: transparent; color: var(--cream);
  border: 1.5px solid var(--cream);
}
.g-cta__btn--ghost:hover { background: var(--cream); color: var(--ink); }

/* ── Footer ────────────────────────────────────────── */
.g-footer {
  max-width: 860px; margin: 0 auto 40px;
  padding: 0 32px;
  display: flex; align-items: center; justify-content: space-between;
  font-size: 13px; color: var(--muted);
  border-top: 1.5px solid var(--paper-2);
  padding-top: 24px;
}
.g-footer a { color: var(--muted); text-decoration: underline; text-underline-offset: 3px; }
.g-footer a:hover { color: var(--ink); }

/* ── Responsive ────────────────────────────────────── */
@media (max-width: 640px) {
  .g-nav { padding: 14px 18px; }
  .g-hero, .g-toggles, .g-cta, .g-footer { padding-left: 18px; padding-right: 18px; }
  .g-ex-pair { grid-template-columns: 1fr; }
  .g-cta__box { padding: 32px 22px; }
  .g-nav__cta span.label { display: none; }
}
</style>
</head>
<body>

${SHARED_LOGO_SVG}

<!-- ── Nav ──────────────────────────────────────────── -->
<header class="g-nav">
  <a class="g-nav__brand" href="https://proboi.site/">
    <svg class="g-nav__logo" width="36" height="36" aria-hidden="true"><use href="#logo"/></svg>
    Proboi
  </a>
  <a class="g-nav__cta" href="${TG_URL}" target="_blank" rel="noopener">
    <span class="label">Открыть в Telegram</span>
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
  </a>
</header>

<!-- ── Hero ─────────────────────────────────────────── -->
<section class="g-hero">
  <div class="g-hero__badge">proboi.site/how-to-setup — добавь в закладки</div>
  <h1 class="g-hero__title">Как работать<br/>с <em>Proboi</em></h1>
  <p class="g-hero__sub">Всё что умеет бот — по блокам. Открывай что нужно.</p>
</section>

<!-- ── Toggles ───────────────────────────────────────── -->
<div class="g-toggles">

  <!-- Блок 1: голос (открыт по умолчанию) -->
  <details class="g-block" open>
    <summary>
      <div class="g-block__hd">
        <span class="g-block__title">Как поговорить с ботом голосом?</span>
        <span class="g-block__hint">Самый быстрый способ — наговори вместо набора</span>
      </div>
      <span class="g-block__arrow" aria-hidden="true">▾</span>
    </summary>
    <div class="g-block__body">
      <p>Бот понимает голосовые сообщения и аудиофайлы любого формата. Можно говорить как угодно — нечётко, со словами-паразитами, на ходу. Бот сам распознает речь и ответит.</p>
      <p>Идеально, когда руки заняты: едешь, идёшь или просто лень печатать длинное.</p>
      <div class="g-block__tip"><strong>Совет:</strong> можешь надиктовать сразу всё, что в голове — бот разберётся, что это была одна задача, а не пять.</div>
      <div class="g-mock">
        <svg width="420" height="160" viewBox="0 0 420 160" fill="none" xmlns="http://www.w3.org/2000/svg">
          <!-- Телефон -->
          <rect x="10" y="10" width="90" height="140" rx="14" fill="#D8FF36" stroke="#14130F" stroke-width="1.5"/>
          <rect x="22" y="26" width="66" height="100" rx="6" fill="#14130F"/>
          <!-- Кнопка микрофона -->
          <circle cx="55" cy="110" r="12" fill="#FF4F2E" stroke="#14130F" stroke-width="1.5"/>
          <rect x="51" y="102" width="8" height="12" rx="4" fill="#FFF9EC"/>
          <path d="M48 112 Q55 120 62 112" stroke="#FFF9EC" stroke-width="1.5" fill="none" stroke-linecap="round"/>
          <line x1="55" y1="120" x2="55" y2="124" stroke="#FFF9EC" stroke-width="1.5" stroke-linecap="round"/>
          <!-- Волна голоса -->
          <g transform="translate(32, 62)">
            <line x1="0"  y1="10" x2="0"  y2="18" stroke="#D8FF36" stroke-width="2" stroke-linecap="round"/>
            <line x1="7"  y1="4"  x2="7"  y2="24" stroke="#D8FF36" stroke-width="2" stroke-linecap="round"/>
            <line x1="14" y1="0"  x2="14" y2="28" stroke="#D8FF36" stroke-width="2.5" stroke-linecap="round"/>
            <line x1="21" y1="6"  x2="21" y2="22" stroke="#D8FF36" stroke-width="2" stroke-linecap="round"/>
            <line x1="28" y1="11" x2="28" y2="17" stroke="#D8FF36" stroke-width="2" stroke-linecap="round"/>
          </g>
          <!-- Стрелка -->
          <path d="M112 80 L148 80" stroke="#14130F" stroke-width="2" stroke-linecap="round" marker-end="url(#arr)"/>
          <defs>
            <marker id="arr" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
              <path d="M0 0 L6 3 L0 6" fill="none" stroke="#14130F" stroke-width="1.2"/>
            </marker>
          </defs>
          <!-- Пузырь ответа -->
          <rect x="152" y="44" width="248" height="72" rx="16" fill="#FFF9EC" stroke="#14130F" stroke-width="1.5"/>
          <text x="168" y="72" font-family="Onest, sans-serif" font-size="13" fill="#2A2823">«Напомни завтра в 10 созвониться</text>
          <text x="168" y="90" font-family="Onest, sans-serif" font-size="13" fill="#2A2823">с Ивановым по поводу договора»</text>
          <text x="168" y="108" font-family="Onest, sans-serif" font-size="11" fill="#6F695C">распознано и сохранено ✓</text>
        </svg>
      </div>
    </div>
  </details>

  <!-- Блок 2: что умеет -->
  <details class="g-block">
    <summary>
      <div class="g-block__hd">
        <span class="g-block__title">Что бот вообще умеет?</span>
        <span class="g-block__hint">Короткий список — пробегись глазами</span>
      </div>
      <span class="g-block__arrow" aria-hidden="true">▾</span>
    </summary>
    <div class="g-block__body">
      <div class="g-caps">
        <div class="g-cap"><span class="g-cap__ico">💬</span>Обычный чат — отвечает, объясняет, советует</div>
        <div class="g-cap"><span class="g-cap__ico">🎤</span>Голос — распознаёт всё что наговоришь</div>
        <div class="g-cap"><span class="g-cap__ico">📷</span>Фото — смотрит на картинки, чеки, скриншоты</div>
        <div class="g-cap"><span class="g-cap__ico">📄</span>Файлы — PDF, Excel, Word, презентации, архивы</div>
        <div class="g-cap"><span class="g-cap__ico">🌐</span>Интернет — ищет в сети, читает сайты</div>
        <div class="g-cap"><span class="g-cap__ico">💻</span>Код — пишет программы, сайты, скрипты</div>
        <div class="g-cap"><span class="g-cap__ico">🧠</span>Память — запоминает важное про тебя</div>
        <div class="g-cap"><span class="g-cap__ico">📨</span>Gmail и Google Calendar — почта и события</div>
        <div class="g-cap"><span class="g-cap__ico">🗂️</span>Google Drive, Docs, Sheets — файлы и таблицы</div>
        <div class="g-cap"><span class="g-cap__ico">⚙️</span>Скиллы — научи его своим штукам</div>
      </div>
      <div class="g-mock">
        <svg width="420" height="130" viewBox="0 0 420 130" fill="none" xmlns="http://www.w3.org/2000/svg">
          <!-- 5 иконок-плиток в ряд -->
          <rect x="8"   y="10" width="72" height="64" rx="10" fill="#FFF9EC" stroke="#14130F" stroke-width="1.5"/>
          <text x="44"  y="46" font-size="22" text-anchor="middle" font-family="sans-serif">💬</text>
          <rect x="92"  y="10" width="72" height="64" rx="10" fill="#FFF9EC" stroke="#14130F" stroke-width="1.5"/>
          <text x="128" y="46" font-size="22" text-anchor="middle" font-family="sans-serif">🎤</text>
          <rect x="176" y="10" width="72" height="64" rx="10" fill="#D8FF36" stroke="#14130F" stroke-width="1.5"/>
          <text x="212" y="46" font-size="22" text-anchor="middle" font-family="sans-serif">📷</text>
          <rect x="260" y="10" width="72" height="64" rx="10" fill="#FFF9EC" stroke="#14130F" stroke-width="1.5"/>
          <text x="296" y="46" font-size="22" text-anchor="middle" font-family="sans-serif">📄</text>
          <rect x="344" y="10" width="72" height="64" rx="10" fill="#FFF9EC" stroke="#14130F" stroke-width="1.5"/>
          <text x="380" y="46" font-size="22" text-anchor="middle" font-family="sans-serif">🌐</text>
          <!-- Второй ряд -->
          <rect x="8"   y="84" width="72" height="40" rx="10" fill="#FFF9EC" stroke="#14130F" stroke-width="1.5"/>
          <text x="44"  y="109" font-size="18" text-anchor="middle" font-family="sans-serif">💻</text>
          <rect x="92"  y="84" width="72" height="40" rx="10" fill="#FFF9EC" stroke="#14130F" stroke-width="1.5"/>
          <text x="128" y="109" font-size="18" text-anchor="middle" font-family="sans-serif">🧠</text>
          <rect x="176" y="84" width="72" height="40" rx="10" fill="#FFF9EC" stroke="#14130F" stroke-width="1.5"/>
          <text x="212" y="109" font-size="18" text-anchor="middle" font-family="sans-serif">📨</text>
          <rect x="260" y="84" width="72" height="40" rx="10" fill="#FFF9EC" stroke="#14130F" stroke-width="1.5"/>
          <text x="296" y="109" font-size="18" text-anchor="middle" font-family="sans-serif">🗂️</text>
          <rect x="344" y="84" width="72" height="40" rx="10" fill="#FF4F2E" stroke="#14130F" stroke-width="1.5"/>
          <text x="380" y="109" font-size="18" text-anchor="middle" font-family="sans-serif">⚙️</text>
        </svg>
      </div>
    </div>
  </details>

  <!-- Блок 3: как объяснять задачи -->
  <details class="g-block">
    <summary>
      <div class="g-block__hd">
        <span class="g-block__title">Как объяснять задачу так, чтобы бот понял?</span>
        <span class="g-block__hint">Несколько примеров — плохо vs хорошо</span>
      </div>
      <span class="g-block__arrow" aria-hidden="true">▾</span>
    </summary>
    <div class="g-block__body">
      <div class="g-examples">
        <div class="g-ex-pair">
          <div class="g-ex g-ex--bad">
            <span class="g-ex__label">❌ Плохо</span>
            напиши письмо
          </div>
          <div class="g-ex g-ex--good">
            <span class="g-ex__label">✅ Хорошо</span>
            напиши деловое письмо клиенту Иванову, что задержим поставку на 3 дня по причине логистики, тон — извиняющийся но уверенный
          </div>
        </div>
        <div class="g-ex-pair">
          <div class="g-ex g-ex--bad">
            <span class="g-ex__label">❌ Плохо</span>
            помоги с экселем
          </div>
          <div class="g-ex g-ex--good">
            <span class="g-ex__label">✅ Хорошо</span>
            у меня в файле «продажи.xlsx» 200 строк, нужно посчитать сумму по каждому менеджеру и сделать сводную таблицу
          </div>
        </div>
        <div class="g-ex-pair">
          <div class="g-ex g-ex--bad">
            <span class="g-ex__label">❌ Плохо</span>
            найди инфу
          </div>
          <div class="g-ex g-ex--good">
            <span class="g-ex__label">✅ Хорошо</span>
            найди 3 свежих статьи (за 2026 год) про то как ИИ применяют в малом бизнесе, дай ссылки и краткие выводы
          </div>
        </div>
      </div>
      <div class="g-block__tip"><strong>Главное правило:</strong> чем больше деталей — тем точнее результат. Не бойся писать длинно, бот любит контекст.</div>
    </div>
  </details>

  <!-- Блок 4: как запоминает -->
  <details class="g-block">
    <summary>
      <div class="g-block__hd">
        <span class="g-block__title">Как бот тебя запоминает?</span>
        <span class="g-block__hint">Второй мозг — личная память бота про тебя</span>
      </div>
      <span class="g-block__arrow" aria-hidden="true">▾</span>
    </summary>
    <div class="g-block__body">
      <p>Бот ведёт твою личную память — туда попадает всё важное: кто ты, чем занимаешься, твои проекты, заметки, интересы, предпочтения. Это твоя личная папка на сервере, никто кроме тебя её не видит.</p>
      <p>Можно сказать «запомни что я работаю в ИКЕА» или «забудь про того клиента». Бот сам решает что важно сохранить, но можно явно попросить.</p>
      <div class="g-block__tip"><strong>Попробуй:</strong> скажи боту «покажи мою память» или «что ты обо мне знаешь».</div>
      <div class="g-mock">
        <svg width="380" height="160" viewBox="0 0 380 160" fill="none" xmlns="http://www.w3.org/2000/svg">
          <!-- Голова -->
          <circle cx="60" cy="80" r="38" fill="#FFF9EC" stroke="#14130F" stroke-width="1.5"/>
          <circle cx="51" cy="74" r="5" fill="#14130F"/>
          <circle cx="69" cy="74" r="5" fill="#14130F"/>
          <path d="M50 90 Q60 100 70 90" stroke="#14130F" stroke-width="1.5" fill="none" stroke-linecap="round"/>
          <!-- Стрелки -->
          <path d="M100 60 L150 40" stroke="#14130F" stroke-width="1.5" stroke-linecap="round" stroke-dasharray="4 3"/>
          <path d="M100 80 L150 80" stroke="#14130F" stroke-width="1.5" stroke-linecap="round" stroke-dasharray="4 3"/>
          <path d="M100 100 L150 120" stroke="#14130F" stroke-width="1.5" stroke-linecap="round" stroke-dasharray="4 3"/>
          <!-- Карточки памяти -->
          <rect x="152" y="18" width="100" height="34" rx="8" fill="#D8FF36" stroke="#14130F" stroke-width="1.5"/>
          <text x="162" y="38" font-family="Onest,sans-serif" font-size="13" font-weight="600" fill="#14130F">📋 профиль</text>
          <rect x="152" y="63" width="100" height="34" rx="8" fill="#FFF9EC" stroke="#14130F" stroke-width="1.5"/>
          <text x="162" y="83" font-family="Onest,sans-serif" font-size="13" font-weight="600" fill="#14130F">🗂 проекты</text>
          <rect x="152" y="108" width="100" height="34" rx="8" fill="#FFF9EC" stroke="#14130F" stroke-width="1.5"/>
          <text x="162" y="128" font-family="Onest,sans-serif" font-size="13" font-weight="600" fill="#14130F">✏️ заметки</text>
          <!-- Справа -->
          <rect x="268" y="40" width="100" height="34" rx="8" fill="#FFF9EC" stroke="#14130F" stroke-width="1.5"/>
          <text x="278" y="60" font-family="Onest,sans-serif" font-size="13" font-weight="600" fill="#14130F">🎯 навыки</text>
          <path d="M252 35 L266 55" stroke="#14130F" stroke-width="1.5" stroke-linecap="round" stroke-dasharray="4 3"/>
          <path d="M252 80 L266 57" stroke="#14130F" stroke-width="1.5" stroke-linecap="round" stroke-dasharray="4 3"/>
        </svg>
      </div>
    </div>
  </details>

  <!-- Блок 5: кейсы второго мозга -->
  <details class="g-block">
    <summary>
      <div class="g-block__hd">
        <span class="g-block__title">Что можно сделать со вторым мозгом?</span>
        <span class="g-block__hint">Реальные сценарии — для чего это вообще нужно</span>
      </div>
      <span class="g-block__arrow" aria-hidden="true">▾</span>
    </summary>
    <div class="g-block__body">
      <div class="g-cases">
        <div class="g-case">
          <div class="g-case__title">📚 Личная база знаний</div>
          <div class="g-case__desc">«Запомни, что я нашёл интересную статью про X» — потом через месяц спросишь «что я читал про X?» и бот всё вытащит.</div>
        </div>
        <div class="g-case">
          <div class="g-case__title">🧾 Учёт расходов и финансов</div>
          <div class="g-case__desc">Кидаешь чеки фотками, бот распознаёт и складывает в табличку. В конце месяца спросишь — он покажет на что ушли деньги.</div>
        </div>
        <div class="g-case">
          <div class="g-case__title">👥 CRM по клиентам</div>
          <div class="g-case__desc">«Запомни про клиента Иванов: предпочитает звонки утром, аллергия на спам». В следующий раз бот сам достанет и напомнит нужное.</div>
        </div>
        <div class="g-case">
          <div class="g-case__title">📅 Дневник и журнал</div>
          <div class="g-case__desc">Каждый вечер наговариваешь голосом «как прошёл день», бот складывает. Потом за год можно посмотреть динамику.</div>
        </div>
        <div class="g-case">
          <div class="g-case__title">🎯 Цели и привычки</div>
          <div class="g-case__desc">Поставил цель — бот спрашивает прогресс, ведёт статистику.</div>
        </div>
        <div class="g-case">
          <div class="g-case__title">📖 Конспекты книг и видео</div>
          <div class="g-case__desc">Скинул главу или транскрипт лекции — бот делает выжимку и кладёт в твою библиотеку. Потом легко найти.</div>
        </div>
      </div>
      <div class="g-mock">
        <svg width="380" height="120" viewBox="0 0 380 120" fill="none" xmlns="http://www.w3.org/2000/svg">
          <!-- Имитация мини-таблицы чеков -->
          <rect x="8" y="8" width="360" height="104" rx="12" fill="#FFF9EC" stroke="#14130F" stroke-width="1.5"/>
          <!-- Заголовок -->
          <rect x="8" y="8" width="360" height="28" rx="12" fill="#14130F"/>
          <text x="24" y="27" font-family="JetBrains Mono,monospace" font-size="12" fill="#D8FF36">дата</text>
          <text x="100" y="27" font-family="JetBrains Mono,monospace" font-size="12" fill="#D8FF36">магазин</text>
          <text x="270" y="27" font-family="JetBrains Mono,monospace" font-size="12" fill="#D8FF36">сумма</text>
          <!-- Строка 1 -->
          <line x1="8" y1="50" x2="368" y2="50" stroke="#E8E1D2" stroke-width="1"/>
          <text x="24"  y="66" font-family="Onest,sans-serif" font-size="12" fill="#2A2823">05.05</text>
          <text x="100" y="66" font-family="Onest,sans-serif" font-size="12" fill="#2A2823">Магнит</text>
          <text x="270" y="66" font-family="Onest,sans-serif" font-size="12" fill="#2A2823">1 240 ₽</text>
          <!-- Строка 2 -->
          <line x1="8" y1="78" x2="368" y2="78" stroke="#E8E1D2" stroke-width="1"/>
          <text x="24"  y="94" font-family="Onest,sans-serif" font-size="12" fill="#2A2823">06.05</text>
          <text x="100" y="94" font-family="Onest,sans-serif" font-size="12" fill="#2A2823">Вкусвилл</text>
          <text x="270" y="94" font-family="Onest,sans-serif" font-size="12" fill="#2A2823">870 ₽</text>
          <!-- Итого -->
          <text x="24"  y="114" font-family="Onest,sans-serif" font-size="11" font-weight="600" fill="#6F695C">из фото-чеков за май</text>
          <rect x="240" y="102" width="118" height="16" rx="4" fill="#D8FF36"/>
          <text x="250" y="114" font-family="Onest,sans-serif" font-size="11" font-weight="600" fill="#14130F">итого: 2 110 ₽</text>
        </svg>
      </div>
    </div>
  </details>

  <!-- Блок 6: что можно кинуть -->
  <details class="g-block">
    <summary>
      <div class="g-block__hd">
        <span class="g-block__title">Что можно кинуть боту в чат?</span>
        <span class="g-block__hint">Любые файлы, фото, документы — бот разберётся</span>
      </div>
      <span class="g-block__arrow" aria-hidden="true">▾</span>
    </summary>
    <div class="g-block__body">
      <ul>
        <li><strong>Фото</strong> — чек из магазина, скриншот переписки, фотография документа, экран ноутбука</li>
        <li><strong>PDF</strong> — счета, договоры, статьи, книги</li>
        <li><strong>Excel/CSV</strong> — таблицы данных</li>
        <li><strong>Word, PowerPoint</strong> — документы и презентации</li>
        <li><strong>Аудиофайлы</strong> — лекции, подкасты, звонки (бот распознает речь)</li>
        <li><strong>Архивы (zip, tar)</strong> — пакетная обработка</li>
      </ul>
      <p>Бот распознает текст, выпишет цифры из чеков, переведёт на другой язык, объяснит непонятное, найдёт нужное, сделает сводку.</p>
      <div class="g-mock">
        <svg width="400" height="140" viewBox="0 0 400 140" fill="none" xmlns="http://www.w3.org/2000/svg">
          <!-- Чек -->
          <rect x="10" y="10" width="120" height="120" rx="6" fill="#FFF9EC" stroke="#14130F" stroke-width="1.5"/>
          <text x="70"  y="30"  text-anchor="middle" font-family="JetBrains Mono,monospace" font-size="11" font-weight="500" fill="#14130F">МАГНИТ</text>
          <line x1="20" y1="36" x2="120" y2="36" stroke="#E8E1D2" stroke-width="1"/>
          <text x="20"  y="52" font-family="JetBrains Mono,monospace" font-size="10" fill="#2A2823">Молоко 1л</text>
          <text x="110" y="52" text-anchor="end" font-family="JetBrains Mono,monospace" font-size="10" fill="#2A2823">89р</text>
          <text x="20"  y="66" font-family="JetBrains Mono,monospace" font-size="10" fill="#2A2823">Хлеб</text>
          <text x="110" y="66" text-anchor="end" font-family="JetBrains Mono,monospace" font-size="10" fill="#2A2823">45р</text>
          <text x="20"  y="80" font-family="JetBrains Mono,monospace" font-size="10" fill="#2A2823">Яйца 10шт</text>
          <text x="110" y="80" text-anchor="end" font-family="JetBrains Mono,monospace" font-size="10" fill="#2A2823">149р</text>
          <line x1="20" y1="88" x2="120" y2="88" stroke="#14130F" stroke-width="1"/>
          <text x="20"  y="103" font-family="JetBrains Mono,monospace" font-size="11" font-weight="500" fill="#14130F">ИТОГО</text>
          <text x="110" y="103" text-anchor="end" font-family="JetBrains Mono,monospace" font-size="11" font-weight="500" fill="#14130F">283р</text>
          <text x="70"  y="122" text-anchor="middle" font-family="JetBrains Mono,monospace" font-size="9" fill="#6F695C">05.05.2026 14:22</text>
          <!-- Стрелка -->
          <path d="M140 70 L190 70" stroke="#14130F" stroke-width="2" stroke-linecap="round"/>
          <path d="M183 63 L190 70 L183 77" stroke="#14130F" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          <!-- Таблица -->
          <rect x="200" y="20" width="190" height="100" rx="10" fill="#FFF9EC" stroke="#14130F" stroke-width="1.5"/>
          <rect x="200" y="20" width="190" height="26" rx="10" fill="#D8FF36" stroke="#14130F" stroke-width="1.5"/>
          <text x="215" y="36" font-family="Onest,sans-serif" font-size="12" font-weight="600" fill="#14130F">Позиция</text>
          <text x="345" y="36" text-anchor="end" font-family="Onest,sans-serif" font-size="12" font-weight="600" fill="#14130F">Цена</text>
          <text x="215" y="60" font-family="Onest,sans-serif" font-size="12" fill="#2A2823">Молоко 1л</text>
          <text x="345" y="60" text-anchor="end" font-family="Onest,sans-serif" font-size="12" fill="#2A2823">89 ₽</text>
          <text x="215" y="78" font-family="Onest,sans-serif" font-size="12" fill="#2A2823">Хлеб</text>
          <text x="345" y="78" text-anchor="end" font-family="Onest,sans-serif" font-size="12" fill="#2A2823">45 ₽</text>
          <text x="215" y="96" font-family="Onest,sans-serif" font-size="12" fill="#2A2823">Яйца 10шт</text>
          <text x="345" y="96" text-anchor="end" font-family="Onest,sans-serif" font-size="12" fill="#2A2823">149 ₽</text>
          <line x1="210" y1="103" x2="382" y2="103" stroke="#14130F" stroke-width="1"/>
          <text x="215" y="116" font-family="Onest,sans-serif" font-size="12" font-weight="600" fill="#14130F">Итого</text>
          <text x="345" y="116" text-anchor="end" font-family="Onest,sans-serif" font-size="12" font-weight="600" fill="#14130F">283 ₽</text>
        </svg>
      </div>
    </div>
  </details>

  <!-- Блок 7: почта и календарь -->
  <details class="g-block">
    <summary>
      <div class="g-block__hd">
        <span class="g-block__title">Как подключить почту, календарь и файлы Google?</span>
        <span class="g-block__hint">Один разговор — и бот работает с Gmail, Calendar, Drive, Docs и Sheets</span>
      </div>
      <span class="g-block__arrow" aria-hidden="true">▾</span>
    </summary>
    <div class="g-block__body">
      <p>Просто скажи боту в чат — «подключи мою почту», «хочу подключить календарь» или «дай доступ к моему гугл-диску». Бот пришлёт ссылку, нажмёшь, разрешишь доступ — и всё.</p>
      <p>После этого бот может:</p>
      <ul style="margin:6px 0 12px 22px;line-height:1.7;">
        <li><strong>Gmail</strong> — читать письма, искать по архиву, отвечать, отправлять новые</li>
        <li><strong>Calendar</strong> — смотреть расписание, создавать и переносить события</li>
        <li><strong>Drive</strong> — открывать любые твои файлы (PDF, картинки, что угодно)</li>
        <li><strong>Docs</strong> — читать и редактировать документы, делать новые</li>
        <li><strong>Sheets</strong> — работать с таблицами, считать, заполнять данные</li>
      </ul>
      <div class="g-block__tip"><strong>Важно:</strong> доступ только к твоему аккаунту, ни к кому больше. Можно отозвать в любой момент через настройки Google.</div>
      <div class="g-mock">
        <svg width="380" height="110" viewBox="0 0 380 110" fill="none" xmlns="http://www.w3.org/2000/svg">
          <!-- Gmail иконка -->
          <rect x="10" y="30" width="90" height="60" rx="12" fill="#FFF9EC" stroke="#14130F" stroke-width="1.5"/>
          <text x="55" y="58" text-anchor="middle" font-size="22" font-family="sans-serif">📧</text>
          <text x="55" y="80" text-anchor="middle" font-family="Onest,sans-serif" font-size="11" fill="#6F695C">Gmail</text>
          <!-- Стрелка с подписью -->
          <path d="M108 60 L180 60" stroke="#14130F" stroke-width="1.5" stroke-linecap="round"/>
          <path d="M173 53 L180 60 L173 67" stroke="#14130F" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          <rect x="116" y="38" width="56" height="18" rx="6" fill="#D8FF36" stroke="#14130F" stroke-width="1"/>
          <text x="144" y="50" text-anchor="middle" font-family="Onest,sans-serif" font-size="10" font-weight="600" fill="#14130F">🔗 разрешил</text>
          <!-- Бот -->
          <rect x="188" y="30" width="90" height="60" rx="12" fill="#D8FF36" stroke="#14130F" stroke-width="1.5"/>
          <use href="#logo" x="217" y="38" width="32" height="32"/>
          <text x="233" y="80" text-anchor="middle" font-family="Onest,sans-serif" font-size="11" fill="#14130F">Proboi</text>
          <!-- Google Calendar -->
          <path d="M286 60 L320 60" stroke="#14130F" stroke-width="1.5" stroke-dasharray="4 3" stroke-linecap="round"/>
          <rect x="286" y="25" width="86" height="70" rx="12" fill="#FFF9EC" stroke="#14130F" stroke-width="1.5"/>
          <text x="329" y="52" text-anchor="middle" font-size="20" font-family="sans-serif">📅</text>
          <text x="329" y="72" text-anchor="middle" font-family="Onest,sans-serif" font-size="10" fill="#6F695C">Calendar</text>
          <text x="329" y="86" text-anchor="middle" font-family="Onest,sans-serif" font-size="10" fill="#6F695C">Drive, Docs</text>
          <path d="M279 55 L288 60 L279 65" stroke="#14130F" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </div>
    </div>
  </details>

  <!-- Блок 8: личная страничка -->
  <details class="g-block">
    <summary>
      <div class="g-block__hd">
        <span class="g-block__title">Что за страничка по адресу /u/твой_id/?</span>
        <span class="g-block__hint">Твоя личная веб-страница в интернете — этот сайт и есть пример</span>
      </div>
      <span class="g-block__arrow" aria-hidden="true">▾</span>
    </summary>
    <div class="g-block__body">
      <p>У тебя есть своя папка на сервере, которая видна в интернете. Можно положить туда что угодно — заметки, дашборд, мини-сайт, портфолио. Достаточно сказать боту «сделай мне страничку про мой проект Х» — и он сам соберёт HTML.</p>
      <p>Адрес твоей странички: <code style="font-family:var(--f-mono);background:var(--paper-2);padding:2px 8px;border-radius:5px;font-size:14px">proboi.site/u/{твой_id}/</code> (бот пришлёт точный адрес если спросить «где моя страничка»).</p>
      <div class="g-block__tip"><strong>Кстати:</strong> этот гайд, который ты сейчас читаешь — и есть та самая страничка. Бот сам её собрал. Можешь попросить переделать под себя или сказать «верни как было».</div>
      <div class="g-mock">
        <svg width="380" height="130" viewBox="0 0 380 130" fill="none" xmlns="http://www.w3.org/2000/svg">
          <!-- Окно браузера -->
          <rect x="10" y="10" width="360" height="115" rx="12" fill="#FFF9EC" stroke="#14130F" stroke-width="1.5"/>
          <!-- Тулбар -->
          <rect x="10" y="10" width="360" height="28" rx="12" fill="#E8E1D2" stroke="#14130F" stroke-width="1.5"/>
          <circle cx="30" cy="24" r="5" fill="#FF4F2E" stroke="#14130F" stroke-width="1"/>
          <circle cx="46" cy="24" r="5" fill="#D8FF36" stroke="#14130F" stroke-width="1"/>
          <circle cx="62" cy="24" r="5" fill="#B7E022" stroke="#14130F" stroke-width="1"/>
          <!-- Адресная строка -->
          <rect x="80" y="16" width="240" height="16" rx="5" fill="#FFF9EC" stroke="#14130F" stroke-width="1"/>
          <text x="90" y="27" font-family="JetBrains Mono,monospace" font-size="10" fill="#6F695C">proboi.site/u/me/</text>
          <!-- Контент страницы -->
          <rect x="24" y="48" width="140" height="66" rx="8" fill="#D8FF36" stroke="#14130F" stroke-width="1.5"/>
          <text x="34"  y="68"  font-family="Onest,sans-serif" font-size="12" font-weight="600" fill="#14130F">Мои проекты</text>
          <text x="34"  y="84"  font-family="Onest,sans-serif" font-size="11" fill="#2A2823">• Сайт для кафе</text>
          <text x="34"  y="98"  font-family="Onest,sans-serif" font-size="11" fill="#2A2823">• Дашборд продаж</text>
          <text x="34"  y="112" font-family="Onest,sans-serif" font-size="11" fill="#2A2823">• Мои заметки</text>
          <rect x="176" y="48" width="180" height="30" rx="8" fill="#14130F"/>
          <text x="186" y="67" font-family="Onest,sans-serif" font-size="12" fill="#D8FF36">Привет! Это моя страничка</text>
          <rect x="176" y="84" width="84" height="30" rx="8" fill="#FFF9EC" stroke="#14130F" stroke-width="1.5"/>
          <text x="186" y="103" font-family="Onest,sans-serif" font-size="11" fill="#2A2823">📊 Статистика</text>
          <rect x="270" y="84" width="86" height="30" rx="8" fill="#FF4F2E" stroke="#14130F" stroke-width="1.5"/>
          <text x="280" y="103" font-family="Onest,sans-serif" font-size="11" fill="#FFF9EC">📁 Документы</text>
        </svg>
      </div>
    </div>
  </details>

  <!-- Блок 9: дашборд и лимиты -->
  <details class="g-block">
    <summary>
      <div class="g-block__hd">
        <span class="g-block__title">Где смотреть статистику и лимиты?</span>
        <span class="g-block__hint">Дашборд: токены, ресурсы, что бот знает про тебя</span>
      </div>
      <span class="g-block__arrow" aria-hidden="true">▾</span>
    </summary>
    <div class="g-block__body">
      <p>У тебя есть веб-дашборд со статистикой использования. Скажи боту «открой дашборд» или «покажи мои лимиты» — пришлёт кнопку. Там видно: сколько токенов потратил, сколько места занимают твои файлы, ресурсы контейнера, тарифы.</p>
      <div class="g-mock">
        <svg width="400" height="140" viewBox="0 0 400 140" fill="none" xmlns="http://www.w3.org/2000/svg">
          <!-- Фон дашборда -->
          <rect x="10" y="10" width="380" height="120" rx="14" fill="#14130F" stroke="#14130F" stroke-width="1.5"/>
          <!-- Виджет 1: токены -->
          <rect x="20" y="22" width="170" height="48" rx="8" fill="#1E1C19"/>
          <text x="32" y="40" font-family="Onest,sans-serif" font-size="11" fill="#6F695C">Токены сегодня</text>
          <text x="32" y="60" font-family="Unbounded,sans-serif" font-size="16" font-weight="700" fill="#D8FF36">12 480</text>
          <!-- Прогресс-бар токенов -->
          <rect x="32" y="65" width="148" height="4" rx="2" fill="#2A2823"/>
          <rect x="32" y="65" width="86"  height="4" rx="2" fill="#D8FF36"/>
          <!-- Виджет 2: место -->
          <rect x="202" y="22" width="178" height="48" rx="8" fill="#1E1C19"/>
          <text x="214" y="40" font-family="Onest,sans-serif" font-size="11" fill="#6F695C">Место на диске</text>
          <text x="214" y="60" font-family="Unbounded,sans-serif" font-size="16" font-weight="700" fill="#FFF9EC">234 МБ</text>
          <rect x="214" y="65" width="154" height="4" rx="2" fill="#2A2823"/>
          <rect x="214" y="65" width="46"  height="4" rx="2" fill="#FF4F2E"/>
          <!-- Виджет 3: тариф -->
          <rect x="20" y="80" width="112" height="40" rx="8" fill="#D8FF36"/>
          <text x="32" y="96" font-family="Onest,sans-serif" font-size="11" font-weight="600" fill="#14130F">Тариф</text>
          <text x="32" y="112" font-family="Unbounded,sans-serif" font-size="13" font-weight="700" fill="#14130F">Базовый</text>
          <!-- Виджет 4: контейнер -->
          <rect x="144" y="80" width="236" height="40" rx="8" fill="#1E1C19"/>
          <text x="156" y="96" font-family="Onest,sans-serif" font-size="11" fill="#6F695C">CPU контейнера</text>
          <rect x="156" y="103" width="212" height="6" rx="3" fill="#2A2823"/>
          <rect x="156" y="103" width="30"  height="6" rx="3" fill="#B7E022"/>
          <text x="372" y="112" text-anchor="end" font-family="JetBrains Mono,monospace" font-size="10" fill="#6F695C">14%</text>
        </svg>
      </div>
    </div>
  </details>

  <!-- Блок 10: научить бота -->
  <details class="g-block">
    <summary>
      <div class="g-block__hd">
        <span class="g-block__title">Как научить бота своим штукам?</span>
        <span class="g-block__hint">Сделай ему персону или роль — будет работать так, как надо именно тебе</span>
      </div>
      <span class="g-block__arrow" aria-hidden="true">▾</span>
    </summary>
    <div class="g-block__body">
      <p>Можно научить бота особому поведению или роли. Например: «когда я говорю "редактор" — будь строгим редактором текстов и режь воду без жалости». Или создать персонажей — «инвестор», «врач», «преподаватель английского» — и переключаться между ними.</p>
      <p style="margin-top:10px">Скажи боту «давай научим тебя новой роли» или «запомни мой стиль работы» — он сохранит и будет применять когда надо.</p>
      <div class="g-mock">
        <svg width="280" height="140" viewBox="0 0 280 140" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="10" y="10" width="260" height="120" rx="14" fill="#FFF9EC" stroke="#14130F" stroke-width="1.5"/>
          <text x="140" y="36" text-anchor="middle" font-family="Onest,sans-serif" font-size="12" font-weight="600" fill="#14130F">персоны и роли</text>
          <circle cx="140" cy="72" r="20" fill="#E8E1D2" stroke="#14130F" stroke-width="1.5"/>
          <circle cx="130" cy="68" r="3" fill="#14130F"/>
          <circle cx="150" cy="68" r="3" fill="#14130F"/>
          <path d="M132 79 Q140 85 148 79" stroke="#14130F" stroke-width="1.5" fill="none" stroke-linecap="round"/>
          <rect x="100" y="38" width="30" height="10" rx="3" fill="#D8FF36" stroke="#14130F" stroke-width="1"/>
          <text x="115" y="46" text-anchor="middle" font-family="Onest,sans-serif" font-size="9" fill="#14130F">редактор</text>
          <rect x="135" y="28" width="32" height="10" rx="3" fill="#FF4F2E" stroke="#14130F" stroke-width="1"/>
          <text x="151" y="36" text-anchor="middle" font-family="Onest,sans-serif" font-size="9" fill="#FFF9EC">врач</text>
          <rect x="170" y="38" width="34" height="10" rx="3" fill="#14130F" stroke="#14130F" stroke-width="1"/>
          <text x="187" y="46" text-anchor="middle" font-family="Onest,sans-serif" font-size="9" fill="#D8FF36">тренер</text>
          <text x="140" y="115" text-anchor="middle" font-family="Onest,sans-serif" font-size="11" fill="#6F695C">переключайся командой</text>
        </svg>
      </div>
    </div>
  </details>

  <!-- Блок 11: исследуй сам -->
  <details class="g-block">
    <summary>
      <div class="g-block__hd">
        <span class="g-block__title">А что ещё? Тут точно всё?</span>
        <span class="g-block__hint">Нет — пробуй сам, бот подскажет</span>
      </div>
      <span class="g-block__arrow" aria-hidden="true">▾</span>
    </summary>
    <div class="g-block__body">
      <p>Бот умеет больше, чем здесь написано. Многие фишки появляются и обновляются быстрее, чем эта страничка успевает за ними. Не стесняйся пробовать — попроси что-нибудь необычное.</p>
      <p style="margin-top:10px">Спроси напрямую:</p>
      <ul style="margin:6px 0 12px 22px;line-height:1.7;">
        <li>«Что ты ещё умеешь?»</li>
        <li>«Можешь ли ты сделать вот такое: …?»</li>
        <li>«Как мне лучше сделать Х?»</li>
        <li>«Покажи примеры что у тебя обычно спрашивают»</li>
      </ul>
      <p>Бот сам подскажет лучший способ. Если что-то не получится — объяснит почему и предложит, как обойти.</p>
      <div class="g-block__tip"><strong>Совет:</strong> лучший способ узнать возможности — наглеть. Попроси сделать что-нибудь странное — посмотришь что выйдет. Часто оказывается, что бот может то, о чём ты даже не думал.</div>
      <div class="g-mock">
        <svg width="320" height="130" viewBox="0 0 320 130" fill="none" xmlns="http://www.w3.org/2000/svg">
          <!-- Лупа большая -->
          <circle cx="80" cy="65" r="38" fill="#FFF9EC" stroke="#14130F" stroke-width="2"/>
          <line x1="108" y1="92" x2="128" y2="112" stroke="#14130F" stroke-width="4" stroke-linecap="round"/>
          <text x="80" y="74" text-anchor="middle" font-family="Unbounded,sans-serif" font-weight="800" font-size="32" fill="#14130F">?</text>
          <!-- Стрелочки в разные стороны -->
          <path d="M150 35 L210 28" stroke="#14130F" stroke-width="1.5" stroke-linecap="round" stroke-dasharray="3 3"/>
          <path d="M204 24 L210 28 L206 34" stroke="#14130F" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
          <path d="M150 65 L210 65" stroke="#14130F" stroke-width="1.5" stroke-linecap="round" stroke-dasharray="3 3"/>
          <path d="M204 61 L210 65 L204 69" stroke="#14130F" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
          <path d="M150 95 L210 102" stroke="#14130F" stroke-width="1.5" stroke-linecap="round" stroke-dasharray="3 3"/>
          <path d="M204 96 L210 102 L206 108" stroke="#14130F" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
          <!-- Три «облачка» с возможностями -->
          <rect x="212" y="14" width="98" height="28" rx="14" fill="#D8FF36" stroke="#14130F" stroke-width="1.5"/>
          <text x="261" y="32" text-anchor="middle" font-family="Onest,sans-serif" font-size="11" font-weight="600" fill="#14130F">а так можешь?</text>
          <rect x="212" y="51" width="98" height="28" rx="14" fill="#FFF9EC" stroke="#14130F" stroke-width="1.5"/>
          <text x="261" y="69" text-anchor="middle" font-family="Onest,sans-serif" font-size="11" font-weight="600" fill="#14130F">а так?</text>
          <rect x="212" y="88" width="98" height="28" rx="14" fill="#FF4F2E" stroke="#14130F" stroke-width="1.5"/>
          <text x="261" y="106" text-anchor="middle" font-family="Onest,sans-serif" font-size="11" font-weight="600" fill="#FFF9EC">а вот так?</text>
        </svg>
      </div>
    </div>
  </details>

</div>

<!-- ── CTA ───────────────────────────────────────────── -->
<div class="g-cta">
  <div class="g-cta__box">
    <p class="g-cta__title">Возвращайся когда захочешь</p>
    <p class="g-cta__sub">Эту страничку всегда можно открыть и добавить в закладки.</p>
    <div class="g-cta__btns">
      <a class="g-cta__btn" href="${TG_URL}" target="_blank" rel="noopener">
        Открыть бота в Telegram
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </a>
      <a class="g-cta__btn g-cta__btn--ghost" href="https://proboi.site/how-to-setup">
        proboi.site/how-to-setup
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </a>
    </div>
  </div>
</div>

<!-- ── Footer ────────────────────────────────────────── -->
<footer class="g-footer">
  <span>© 2026 · Proboi · <a href="https://proboi.site/">proboi.site</a></span>
  <span style="margin-left: 12px;">
    <a href="/oferta">Публичная оферта</a> ·
    <a href="/privacy">Политика конфиденциальности</a> ·
    <a href="/terms">Пользовательское соглашение</a>
  </span>
</footer>

</body>
</html>`;
}

export function renderSecurity(): string {
  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>Безопасность Proboi — архитектура защиты данных</title>
<meta name="description" content="Архитектурный подход к защите данных и инфраструктуры Proboi: изоляция окружений, gVisor, сетевая сегментация, управление секретами." />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Unbounded:wght@600;700;800&family=Onest:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
<style>
/* ── Reset ─────────────────────────────────────────── */
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html { scroll-behavior: smooth; }
body {
  --paper:   #F1ECE0;
  --paper-2: #E8E1D2;
  --ink:     #14130F;
  --ink-2:   #2A2823;
  --muted:   #6F695C;
  --lime:    #D8FF36;
  --lime-2:  #B7E022;
  --coral:   #FF4F2E;
  --cream:   #FFF9EC;
  --line:    #1A1814;
  --r-md:    14px;
  --r-lg:    22px;
  --r-xl:    32px;
  --f-display: "Unbounded", system-ui, sans-serif;
  --f-body:    "Onest", system-ui, sans-serif;
  --f-mono:    "JetBrains Mono", ui-monospace, monospace;

  background: var(--paper);
  color: var(--ink);
  font-family: var(--f-body);
  font-size: 16px;
  line-height: 1.6;
  -webkit-font-smoothing: antialiased;
}

/* ── Nav ───────────────────────────────────────────── */
.s-nav {
  display: flex; align-items: center; justify-content: space-between;
  padding: 18px 32px;
  border-bottom: 1.5px solid var(--ink);
  position: sticky; top: 0; z-index: 100;
  background: var(--paper);
}
.s-nav__brand {
  display: flex; align-items: center; gap: 10px;
  text-decoration: none; color: var(--ink);
  font-family: var(--f-display); font-weight: 700; font-size: 15px;
}
.s-nav__cta {
  display: inline-flex; align-items: center; gap: 7px;
  background: var(--lime); color: var(--ink);
  border: 1.5px solid var(--ink); border-radius: 999px;
  padding: 9px 20px; font-family: var(--f-body); font-weight: 600;
  font-size: 14px; text-decoration: none;
  transition: background .18s, transform .14s;
}
.s-nav__cta:hover { background: var(--lime-2); transform: translateY(-1px); }

/* ── Hero ──────────────────────────────────────────── */
.s-hero {
  max-width: 1100px; margin: 0 auto;
  padding: 64px 32px 48px;
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 40px;
  align-items: center;
}
.s-hero__left { min-width: 0; }
.s-hero__badge {
  display: inline-block;
  background: var(--lime); color: var(--ink);
  border: 1.5px solid var(--ink); border-radius: 999px;
  font-family: var(--f-mono); font-size: 11px; font-weight: 500;
  padding: 5px 14px; letter-spacing: .05em;
  margin-bottom: 28px;
}
.s-hero__title {
  font-family: var(--f-display); font-weight: 800;
  font-size: clamp(30px, 5vw, 54px);
  line-height: 1.06; letter-spacing: -.03em;
  color: var(--ink);
  margin-bottom: 20px;
}
.s-hero__title em { font-style: normal; color: var(--coral); }
.s-hero__sub {
  font-size: 17px; color: var(--ink-2);
  line-height: 1.6; max-width: 52ch;
}
.s-hero__diagram { flex-shrink: 0; }

/* ── Stats bar ─────────────────────────────────────── */
.s-stats {
  max-width: 1100px; margin: 0 auto 64px;
  padding: 0 32px;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
}
.s-stat {
  background: var(--cream);
  border: 1.5px solid var(--ink);
  border-radius: var(--r-md);
  padding: 24px 28px;
}
.s-stat__num {
  font-family: var(--f-display); font-weight: 800;
  font-size: 40px; line-height: 1;
  color: var(--ink);
  margin-bottom: 8px;
}
.s-stat__label {
  font-size: 14px; color: var(--muted);
  line-height: 1.4;
}

/* ── Section title ─────────────────────────────────── */
.s-section {
  max-width: 1100px; margin: 0 auto 64px;
  padding: 0 32px;
}
.s-section__heading {
  font-family: var(--f-display); font-weight: 700;
  font-size: clamp(20px, 3vw, 28px);
  letter-spacing: -.02em; color: var(--ink);
  margin-bottom: 32px;
  padding-bottom: 12px;
  border-bottom: 1.5px solid var(--ink);
}

/* ── Layer cards (6-grid) ──────────────────────────── */
.s-layers {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
}
.s-layer {
  background: var(--cream);
  border: 1.5px solid var(--ink);
  border-radius: var(--r-lg);
  padding: 28px 24px;
}
.s-layer__icon {
  width: 44px; height: 44px;
  margin-bottom: 16px;
}
.s-layer__title {
  font-family: var(--f-display); font-weight: 600;
  font-size: 15px; letter-spacing: -.01em;
  color: var(--ink);
  margin-bottom: 8px;
}
.s-layer__desc {
  font-size: 14px; color: var(--muted);
  line-height: 1.5;
}

/* ── Flow diagram wrapper ──────────────────────────── */
.s-flow {
  overflow-x: auto;
  padding-bottom: 4px;
}

/* ── Mode comparison ───────────────────────────────── */
.s-modes {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0;
  border: 1.5px solid var(--ink);
  border-radius: var(--r-lg);
  overflow: hidden;
}
.s-modes__col {
  padding: 28px 32px;
}
.s-modes__col--paid {
  background: var(--cream);
  border-left: 1.5px solid var(--ink);
}
.s-modes__col-header {
  display: flex; align-items: center; gap: 10px;
  margin-bottom: 24px;
}
.s-modes__col-title {
  font-family: var(--f-display); font-weight: 700;
  font-size: 16px; color: var(--ink);
}
.s-modes__badge {
  background: var(--lime); color: var(--ink);
  border: 1.5px solid var(--ink); border-radius: 999px;
  font-family: var(--f-mono); font-size: 10px; font-weight: 500;
  padding: 3px 10px; letter-spacing: .04em;
}
.s-modes__row {
  display: flex; align-items: center; gap: 12px;
  padding: 10px 0;
  border-top: 1px solid var(--paper-2);
  font-size: 14px; color: var(--ink-2);
}
.s-modes__row:first-of-type { border-top: none; }
.s-modes__check {
  width: 20px; height: 20px; flex-shrink: 0;
}
.s-modes__accent {
  margin-top: 20px;
  padding: 14px 18px;
  background: var(--paper-2);
  border-radius: var(--r-md);
  font-size: 13px; color: var(--ink);
  font-weight: 600;
  font-family: var(--f-mono);
  border: 1.5px solid var(--ink);
}

/* ── Limits (coral border cards) ──────────────────── */
.s-limits {
  display: flex; flex-direction: column; gap: 12px;
}
.s-limit {
  background: var(--cream);
  border: 1.5px solid var(--ink);
  border-left: 4px solid var(--coral);
  border-radius: var(--r-md);
  padding: 20px 24px;
}
.s-limit__title {
  font-family: var(--f-display); font-weight: 700;
  font-size: 15px; color: var(--ink);
  margin-bottom: 6px;
}
.s-limit__text {
  font-size: 14px; color: var(--muted);
  line-height: 1.5;
}

/* ── User responsibility ───────────────────────────── */
.s-resp__list {
  list-style: none; padding: 0;
  display: flex; flex-direction: column; gap: 12px;
  margin-bottom: 24px;
}
.s-resp__list li {
  display: flex; gap: 12px;
  font-size: 15px; color: var(--ink-2);
  line-height: 1.5;
}
.s-resp__list li::before {
  content: "—";
  color: var(--coral);
  flex-shrink: 0; font-weight: 600;
  margin-top: 1px;
}
.s-rule {
  background: var(--cream);
  border: 1.5px solid var(--lime-2);
  border-radius: var(--r-md);
  padding: 20px 24px;
  font-size: 15px; color: var(--ink-2);
}
.s-rule strong { color: var(--ink); }

/* ── Footer ────────────────────────────────────────── */
.s-footer {
  border-top: 1.5px solid var(--ink);
  padding: 24px 32px;
  display: flex; align-items: center; justify-content: space-between;
  flex-wrap: wrap; gap: 12px;
  color: var(--muted); font-size: 13px;
}
.s-footer a {
  color: var(--muted); text-decoration: none;
}
.s-footer a:hover { color: var(--ink); }

/* ── Prose ─────────────────────────────────────────── */
.s-prose {
  max-width: 1100px; margin: 0 auto 64px;
  padding: 0 32px;
}
.s-prose p {
  font-size: 16px; color: var(--ink-2);
  line-height: 1.8; margin-bottom: 20px;
  max-width: 74ch;
}
.s-prose h3 {
  font-family: var(--f-display); font-weight: 700;
  font-size: 17px; letter-spacing: -.02em; color: var(--ink);
  margin-bottom: 12px; margin-top: 40px;
}
.s-prose h3:first-child { margin-top: 0; }
.s-prose strong { color: var(--ink); font-weight: 600; }
.s-callout {
  background: var(--cream);
  border: 1.5px solid var(--ink);
  border-left: 4px solid var(--lime);
  border-radius: var(--r-md);
  padding: 18px 22px;
  font-size: 15px; color: var(--ink);
  line-height: 1.65; margin: 24px 0;
  max-width: 74ch;
}
.s-tech {
  background: var(--ink);
  color: var(--lime);
  border-radius: var(--r-md);
  padding: 14px 18px;
  font-family: var(--f-mono); font-size: 12px;
  line-height: 1.7; margin: 16px 0;
  max-width: 74ch;
}
/* ── Threat model ──────────────────────────────────── */
.s-threats {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
}
.s-threat {
  background: var(--cream);
  border: 1.5px solid var(--ink);
  border-radius: var(--r-md);
  padding: 22px 24px;
}
.s-threat__tag {
  font-family: var(--f-mono); font-size: 10px;
  letter-spacing: .08em; color: var(--muted);
  margin-bottom: 8px; text-transform: uppercase;
}
.s-threat__title {
  font-family: var(--f-display); font-weight: 700;
  font-size: 14px; color: var(--ink);
  margin-bottom: 8px;
}
.s-threat__text {
  font-size: 13px; color: var(--muted);
  line-height: 1.55;
}
.s-threat__defense {
  margin-top: 10px;
  font-size: 12px; color: var(--ink);
  font-family: var(--f-mono);
  background: var(--paper-2);
  border-radius: 6px; padding: 6px 10px;
}
@media (max-width: 600px) {
  .s-threats { grid-template-columns: 1fr; }
}

/* ── Responsive ────────────────────────────────────── */
@media (max-width: 600px) {
  .s-nav { padding: 14px 20px; }
  .s-hero {
    grid-template-columns: 1fr;
    padding: 40px 20px 32px;
    gap: 32px;
  }
  .s-hero__diagram { display: flex; justify-content: center; }
  .s-stats {
    grid-template-columns: 1fr;
    padding: 0 20px;
    margin-bottom: 48px;
  }
  .s-section { padding: 0 20px; margin-bottom: 48px; }
  .s-layers { grid-template-columns: 1fr; }
  .s-modes {
    grid-template-columns: 1fr;
  }
  .s-modes__col--paid { border-left: none; border-top: 1.5px solid var(--ink); }
  .s-footer { padding: 20px; flex-direction: column; align-items: flex-start; }
  .s-prose { padding: 0 20px; margin-bottom: 48px; }
}
@media (min-width: 601px) and (max-width: 900px) {
  .s-layers { grid-template-columns: repeat(2, 1fr); }
  .s-stats { grid-template-columns: repeat(3, 1fr); }
}
</style>
</head>
<body>

<!-- ── NAV ────────────────────────────────────────── -->
<nav class="s-nav">
  <a class="s-nav__brand" href="/">
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="var(--ink)"/>
      <path d="M16 6 L26 11 L26 18 C26 22.5 21.5 26.5 16 28 C10.5 26.5 6 22.5 6 18 L6 11 Z" stroke="var(--lime)" stroke-width="1.8" fill="none" stroke-linejoin="round"/>
      <path d="M12 16 L15 19 L20 13" stroke="var(--lime)" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
    Proboi
  </a>
  <a class="s-nav__cta" href="${TG_URL}" target="_blank" rel="noopener">
    @proboiAI_bot
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
  </a>
</nav>

<!-- ── HERO ───────────────────────────────────────── -->
<div class="s-hero">
  <div class="s-hero__left">
    <div class="s-hero__badge">БЕЗОПАСНОСТЬ · ИЮНЬ 2026</div>
    <h1 class="s-hero__title">Ваши данные —<br /><em>под замком.</em></h1>
    <p class="s-hero__sub">Это не декларация о намерениях. Это архитектура.</p>
  </div>
  <div class="s-hero__diagram">
    <!-- SVG: луковица изоляции -->
    <svg width="320" height="320" viewBox="0 0 320 320" fill="none" aria-label="Слои изоляции Proboi">
      <!-- Внешнее кольцо: Сетевой файрволл -->
      <circle cx="160" cy="160" r="148" stroke="var(--muted)" stroke-width="1.5" stroke-dasharray="6 4"/>
      <!-- Кольцо 2: gVisor -->
      <circle cx="160" cy="160" r="116" stroke="var(--ink-2)" stroke-width="2"/>
      <!-- Кольцо 3: User namespaces -->
      <circle cx="160" cy="160" r="86" stroke="var(--ink)" stroke-width="2.5"/>
      <!-- Кольцо 4: cgroups -->
      <circle cx="160" cy="160" r="58" stroke="var(--ink)" stroke-width="3"/>
      <!-- Центр: ваш код -->
      <circle cx="160" cy="160" r="32" fill="var(--lime)" stroke="var(--ink)" stroke-width="2"/>
      <!-- Текст центра -->
      <text x="160" y="155" text-anchor="middle" font-family="Onest, sans-serif" font-size="9" font-weight="600" fill="var(--ink)">ваш</text>
      <text x="160" y="166" text-anchor="middle" font-family="Onest, sans-serif" font-size="9" font-weight="600" fill="var(--ink)">код</text>

      <!-- Метки колец -->
      <text x="160" y="18" text-anchor="middle" font-family="Onest, sans-serif" font-size="10" fill="var(--muted)">Сетевой файрволл</text>
      <text x="160" y="50" text-anchor="middle" font-family="Onest, sans-serif" font-size="10" fill="var(--ink-2)">gVisor</text>
      <text x="160" y="79" text-anchor="middle" font-family="Onest, sans-serif" font-size="10" fill="var(--ink)">User namespaces</text>
      <text x="160" y="107" text-anchor="middle" font-family="Onest, sans-serif" font-size="10" fill="var(--ink)">cgroups</text>

      <!-- Стрелка "атакующий" снаружи → отбивается -->
      <path d="M300 70 L248 98" stroke="var(--coral)" stroke-width="1.5" stroke-dasharray="4 3" marker-end="url(#arr-coral)"/>
      <text x="302" y="66" font-family="Onest, sans-serif" font-size="10" fill="var(--coral)" text-anchor="start">атака</text>

      <!-- Deflect marker на кольце 1 -->
      <path d="M248 98 L258 80" stroke="var(--coral)" stroke-width="1.5" stroke-linecap="round"/>

      <defs>
        <marker id="arr-coral" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
          <path d="M0 0 L6 3 L0 6" stroke="var(--coral)" stroke-width="1.2" fill="none"/>
        </marker>
      </defs>
    </svg>
  </div>
</div>

<!-- ── STATS BAR ───────────────────────────────────── -->
<div class="s-stats">
  <div class="s-stat">
    <div class="s-stat__num">Только ваш</div>
    <div class="s-stat__label">контейнер — другие пользователи физически не видят ваши файлы и историю</div>
  </div>
  <div class="s-stat">
    <div class="s-stat__num">Москва</div>
    <div class="s-stat__label">серверы в России — данные не покидают страну, 242-ФЗ выполняется на уровне железа</div>
  </div>
  <div class="s-stat">
    <div class="s-stat__num">Не обучают</div>
    <div class="s-stat__label">DeepSeek и Anthropic не тренируют модели на запросах через API — это зафиксировано в условиях</div>
  </div>
</div>

<!-- ── НЕ ОБЕЩАНИЯ — МЕХАНИЗМЫ ────────────────────── -->
<div class="s-prose">
  <p>Большинство сервисов публикуют политику конфиденциальности и считают тему закрытой. Политика — юридический документ. Он фиксирует обязательства компании в суде, но не описывает, что происходит с вашим запросом на уровне операционной системы: какой процесс его принимает, в каком окружении выполняется код, куда пишутся журналы и что из них маскируется автоматически.</p>
  <p>Каждое требование безопасности в Proboi закрыто конкретной технической мерой. Не политикой, не регламентом — кодом и конфигурацией, которые можно проверить. На этой странице — как именно устроена каждая из них.</p>
</div>

<!-- ── СЛОИ ЗАЩИТЫ ────────────────────────────────── -->
<div class="s-section">
  <h2 class="s-section__heading">Что именно защищает вас</h2>
  <div class="s-layers">

    <!-- 1 Изоляция ядра -->
    <div class="s-layer">
      <svg class="s-layer__icon" viewBox="0 0 44 44" fill="none" aria-hidden="true">
        <rect x="4" y="4" width="36" height="36" rx="8" stroke="var(--ink)" stroke-width="1.5"/>
        <rect x="10" y="10" width="24" height="24" rx="5" stroke="var(--ink)" stroke-width="1.5"/>
        <rect x="16" y="16" width="12" height="12" rx="3" fill="var(--lime)" stroke="var(--ink)" stroke-width="1.5"/>
      </svg>
      <div class="s-layer__title">Изоляция ядра</div>
      <div class="s-layer__desc">User namespaces Linux. При прорыве контейнера атакующий получает аккаунт без прав — не хост.</div>
    </div>

    <!-- 2 gVisor -->
    <div class="s-layer">
      <svg class="s-layer__icon" viewBox="0 0 44 44" fill="none" aria-hidden="true">
        <path d="M22 4 L38 12 L38 24 C38 32 30 39 22 42 C14 39 6 32 6 24 L6 12 Z" stroke="var(--ink)" stroke-width="1.5" stroke-linejoin="round"/>
        <text x="22" y="26" text-anchor="middle" font-family="Unbounded, sans-serif" font-weight="700" font-size="12" fill="var(--ink)">G</text>
      </svg>
      <div class="s-layer__title">gVisor</div>
      <div class="s-layer__desc">Технология Google. Системные вызовы проходят через посредника — не напрямую к ядру Linux.</div>
    </div>

    <!-- 3 Сеть -->
    <div class="s-layer">
      <svg class="s-layer__icon" viewBox="0 0 44 44" fill="none" aria-hidden="true">
        <rect x="14" y="6" width="16" height="12" rx="4" stroke="var(--ink)" stroke-width="1.5"/>
        <rect x="4" y="26" width="14" height="12" rx="4" stroke="var(--ink)" stroke-width="1.5"/>
        <rect x="26" y="26" width="14" height="12" rx="4" stroke="var(--ink)" stroke-width="1.5"/>
        <path d="M22 18 L11 26 M22 18 L33 26" stroke="var(--ink)" stroke-width="1.5" stroke-dasharray="3 2"/>
        <!-- замок поверх -->
        <rect x="19" y="28" width="6" height="5" rx="1" fill="var(--lime)" stroke="var(--ink)" stroke-width="1"/>
        <path d="M20 28 L20 26 C20 24.3 24 24.3 24 26 L24 28" stroke="var(--ink)" stroke-width="1" fill="none"/>
      </svg>
      <div class="s-layer__title">Сеть</div>
      <div class="s-layer__desc">Два независимых уровня фильтрации. Гости изолированы друг от друга и от инфраструктуры.</div>
    </div>

    <!-- 4 Ресурсы -->
    <div class="s-layer">
      <svg class="s-layer__icon" viewBox="0 0 44 44" fill="none" aria-hidden="true">
        <rect x="6" y="28" width="6" height="10" rx="2" fill="var(--lime)" stroke="var(--ink)" stroke-width="1.5"/>
        <rect x="15" y="20" width="6" height="18" rx="2" fill="var(--lime)" stroke="var(--ink)" stroke-width="1.5"/>
        <rect x="24" y="14" width="6" height="24" rx="2" stroke="var(--ink)" stroke-width="1.5"/>
        <rect x="33" y="8" width="6" height="30" rx="2" stroke="var(--ink)" stroke-width="1.5"/>
        <path d="M4 38 L40 38" stroke="var(--ink)" stroke-width="1.5" stroke-linecap="round"/>
        <!-- крышка-ограничитель -->
        <path d="M4 14 L40 14" stroke="var(--coral)" stroke-width="2" stroke-linecap="round" stroke-dasharray="4 2"/>
      </svg>
      <div class="s-layer__title">Ресурсы</div>
      <div class="s-layer__desc">Лимиты памяти, процессов и диска на уровне cgroups. Resource exhaustion атаки заблокированы.</div>
    </div>

    <!-- 5 Секреты -->
    <div class="s-layer">
      <svg class="s-layer__icon" viewBox="0 0 44 44" fill="none" aria-hidden="true">
        <rect x="14" y="20" width="16" height="14" rx="4" stroke="var(--ink)" stroke-width="1.5"/>
        <path d="M17 20 L17 16 C17 11.6 27 11.6 27 16 L27 20" stroke="var(--ink)" stroke-width="1.5" fill="none"/>
        <circle cx="22" cy="27" r="2" fill="var(--ink)"/>
        <!-- зачёркивание -->
        <path d="M8 8 L36 36" stroke="var(--coral)" stroke-width="2" stroke-linecap="round"/>
        <path d="M36 8 L8 36" stroke="var(--coral)" stroke-width="2" stroke-linecap="round"/>
      </svg>
      <div class="s-layer__title">Секреты</div>
      <div class="s-layer__desc">Токены и ключи маскируются в журналах автоматически. Утечка через лог физически невозможна.</div>
    </div>

    <!-- 6 Аудит -->
    <div class="s-layer">
      <svg class="s-layer__icon" viewBox="0 0 44 44" fill="none" aria-hidden="true">
        <circle cx="20" cy="20" r="12" stroke="var(--ink)" stroke-width="1.5"/>
        <path d="M29 29 L38 38" stroke="var(--ink)" stroke-width="2" stroke-linecap="round"/>
        <path d="M15 20 L18 23 L24 17" stroke="var(--lime-2)" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      <div class="s-layer__title">Аудит</div>
      <div class="s-layer__desc">Регулярные циклы внутреннего review с документированным реестром найденных и закрытых проблем.</div>
    </div>

  </div>
</div>

<!-- ── КАК ЭТО РАБОТАЕТ НА ПРАКТИКЕ ─────────────── -->
<div class="s-prose">
  <h3>gVisor</h3>
  <p>Open-source технология Google. Между кодом контейнера и ядром Linux вставляется компонент Sentry — он перехватывает системные вызовы и эмулирует ядро в пространстве пользователя. К реальному ядру проходит только безопасное подмножество вызовов.</p>
  <p>Большинство побегов из контейнеров работают через уязвимости ядра: код делает syscall с особыми аргументами, эксплуатирует баг, получает права хоста. gVisor разрывает эту цепочку — даже при наличии уязвимости в настоящем ядре атакующий сначала должен сломать эмулятор Sentry. Накладные расходы — около 10–20% на I/O-операциях. Для чат-бота это незаметно.</p>

  <h3>User namespaces</h3>
  <p>По умолчанию UID 1000 внутри контейнера совпадает с UID 1000 на хосте. Побег из контейнера даёт атакующему UID 1000 на хосте — а у него есть доступ к <code>/opt/vault/</code> со всеми данными других пользователей.</p>
  <p>С включённым userns-remap: UID 1000 внутри контейнера отображается на UID 101000 на хосте (смещение 100000). У хостового UID 101000 нет прав ни на что вне собственного vault'а. Побег из контейнера перестаёт быть ключом к инфраструктуре.</p>

  <div class="s-tech">UID 1000 (контейнер) → UID 101000 (хост, offset 100000)
/opt/vault/101000/ — права есть
/opt/vault/другой_пользователь/ — 403</div>

  <h3>Сетевая изоляция</h3>
  <p>Каждый пользователь работает в отдельном Docker-контейнере. По умолчанию контейнеры одной сети общаются между собой и с хостом. Два независимых слоя перекрывают это: правила цепочки INPUT на интерфейсе <strong>claude-guest0</strong> блокируют трафик к портам 22, 3847 и 3848 хоста. Зеркальные правила в цепочке <strong>DOCKER-USER</strong> применяются до INPUT и работают как страховка на случай изменений конфигурации Docker. Правила идемпотентны — повторный запуск скрипта не создаёт дублей.</p>

  <h3>cgroups и ресурсные лимиты</h3>
  <p><strong>pids-limit=512</strong> блокирует форк-бомбу. Без него вредоносный код запускает тысячи процессов за секунды и укладывает весь хост. Лимиты памяти ограничивают радиус OOM-ситуации одним контейнером. Мягкая квота 2 ГБ на <code>/opt/vault/{userId}/</code> реализована через <code>du</code> — ядерные квоты (ext4 prjquota) требуют ремаунта на живом сервере, что создаёт больший риск, чем soft-проверка.</p>

  <h3>Маскирование секретов</h3>
  <p>Токены Telegram вида <code>\d+:[A-Za-z0-9_-]{35}</code> автоматически заменяются на <code>&lt;TG_TOKEN&gt;</code> во всех audit-записях. <strong>COMPOSIO_API_KEY</strong> никогда не попадает в окружение гостевого контейнера — запросы к Composio проксируются через локальный HTTP-прокси бота. Ключ физически недостижим из гостевой среды, даже если модель попросит его вывести.</p>
</div>

<!-- ── КАК РАБОТАЕТ ИЗОЛЯЦИЯ (flow) ───────────────── -->
<div class="s-section">
  <h2 class="s-section__heading">Как проходит ваш запрос</h2>
  <div class="s-flow">
    <svg width="860" height="160" viewBox="0 0 860 160" fill="none" aria-label="Схема прохождения запроса">
      <!-- Узлы -->
      <!-- [Вы] -->
      <rect x="20" y="56" width="110" height="48" rx="12" stroke="var(--ink)" stroke-width="1.5" fill="var(--cream)"/>
      <text x="75" y="84" text-anchor="middle" font-family="Unbounded, sans-serif" font-weight="700" font-size="12" fill="var(--ink)">Вы</text>

      <!-- [Telegram] -->
      <rect x="220" y="56" width="130" height="48" rx="12" stroke="var(--ink)" stroke-width="1.5" fill="var(--cream)"/>
      <text x="285" y="84" text-anchor="middle" font-family="Unbounded, sans-serif" font-weight="700" font-size="12" fill="var(--ink)">Telegram</text>

      <!-- [Proboi] -->
      <rect x="445" y="56" width="130" height="48" rx="12" stroke="var(--ink)" stroke-width="1.5" fill="var(--lime)"/>
      <text x="510" y="84" text-anchor="middle" font-family="Unbounded, sans-serif" font-weight="700" font-size="12" fill="var(--ink)">Proboi</text>

      <!-- [Нейросеть] -->
      <rect x="670" y="56" width="150" height="48" rx="12" stroke="var(--ink)" stroke-width="1.5" fill="var(--cream)"/>
      <text x="745" y="84" text-anchor="middle" font-family="Unbounded, sans-serif" font-weight="700" font-size="12" fill="var(--ink)">Нейросеть</text>

      <!-- Стрелки dashed -->
      <!-- Вы → Telegram -->
      <path d="M130 80 L220 80" stroke="var(--ink)" stroke-width="1.5" stroke-dasharray="5 3" marker-end="url(#arr-ink-flow)"/>
      <!-- Telegram → Proboi -->
      <path d="M350 80 L445 80" stroke="var(--ink)" stroke-width="1.5" stroke-dasharray="5 3" marker-end="url(#arr-ink-flow)"/>
      <!-- Proboi → Нейросеть -->
      <path d="M575 80 L670 80" stroke="var(--ink)" stroke-width="1.5" stroke-dasharray="5 3" marker-end="url(#arr-ink-flow)"/>

      <!-- Надписи над стрелками -->
      <text x="175" y="68" text-anchor="middle" font-family="Onest, sans-serif" font-size="10" fill="var(--muted)">TLS</text>
      <text x="397" y="68" text-anchor="middle" font-family="Onest, sans-serif" font-size="10" fill="var(--muted)">Маскирование секретов</text>
      <text x="622" y="68" text-anchor="middle" font-family="Onest, sans-serif" font-size="10" fill="var(--muted)">Без обучения на данных</text>

      <defs>
        <marker id="arr-ink-flow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
          <path d="M0 0 L6 3 L0 6" stroke="var(--ink)" stroke-width="1.2" fill="none"/>
        </marker>
      </defs>
    </svg>
  </div>
</div>

<!-- ── ЧТО ПРОИСХОДИТ НА КАЖДОМ ШАГЕ ─────────────── -->
<div class="s-prose">
  <h3>Шаг 1 — TLS до Telegram</h3>
  <p>Сообщение идёт от вашего устройства до серверов Telegram по TLS 1.3. Содержание зашифровано в транзите. Telegram хранит и доставляет сообщения — они видят текст на своей стороне, как любой мессенджер. Это общий предел для всех сервисов на базе Telegram Bot API.</p>

  <h3>Шаг 2 — Аутентификация</h3>
  <p>Бот проверяет ID отправителя по явному allowlist. Сообщения от неизвестных Telegram ID отбрасываются до любой обработки — без ответа пользователю, без записи в журнал.</p>

  <h3>Шаг 3 — Изоляция контекста</h3>
  <p>Для каждого пользователя создаётся отдельная сессия. Гостевая сессия работает с параметром <code>settingSources: ["project"]</code> — конфигурация <code>~/.claude/</code> владельца физически недоступна из гостевого контекста. Память, навыки и настройки одного пользователя не пересекаются с другим.</p>

  <h3>Шаг 4 — Маскирование перед логированием</h3>
  <p>До записи в audit-журнал текст проходит через фильтр регулярных выражений. Токены и ключи API заменяются плейсхолдерами. Журнал содержит факт запроса, не его секретное содержимое.</p>

  <h3>Шаг 5 — Передача в модель</h3>
  <p>Запрос уходит к провайдеру модели (DeepSeek для гостей, Claude для владельца). Ни DeepSeek, ни Anthropic не используют данные через API для обучения моделей — это зафиксировано в их условиях использования API-доступа. Браузерные интерфейсы и API — разные режимы с разными условиями.</p>
</div>

<!-- ── ВНЕШНЯЯ ГРАНИЦА ─────────────────────────────── -->
<div class="s-section">
  <h2 class="s-section__heading">Как защищено снаружи</h2>
  <div class="s-prose" style="margin-bottom:0">
    <p>Прямого доступа к боту из интернета нет. Все входящие соединения принимает <strong>nginx</strong> — он терминирует TLS и проксирует трафик внутрь. Внешний мир видит только порты 80 и 443. Всё остальное закрыто на уровне фаервола.</p>
    <p>TLS-сертификат — Let's Encrypt, автообновление. SSH на сервер работает только по ключу, авторизация по паролю отключена. Это стандартная мера, но она исключает целый класс атак методом перебора.</p>
    <p>За доступностью следит внешний монитор — он проверяет <code>/healthz</code> каждые 5 минут с независимого адреса. Если сервер завис или упал, сигнал приходит раньше, чем первый пользователь напишет в поддержку. Мониторинг внешний — значит, проблемы на самом сервере его не заглушат.</p>
    <div class="s-callout">Nginx стоит перед всем. Даже если в каком-то компоненте бота будет уязвимость, напрямую до неё из интернета не добраться — трафик проходит через прокси-слой с заголовками безопасности и rate-limiting.</div>

    <h3>Что закрыто на периметре</h3>
    <p>Порты бота (3847, 3848) и SSH (22) не торчат наружу. nginx проксирует только <code>/</code>, <code>/dashboard</code>, <code>/healthz</code> и несколько явно разрешённых маршрутов. Всё остальное возвращает 404 не добравшись до бота. Случайный сканнер не найдёт ничего интересного.</p>
  </div>
</div>

<!-- ── МОДЕЛЬ УГРОЗ ────────────────────────────────── -->
<div class="s-section">
  <h2 class="s-section__heading">Модель угроз</h2>
  <div class="s-threats">
    <div class="s-threat">
      <div class="s-threat__tag">угроза</div>
      <div class="s-threat__title">Горизонтальная изоляция</div>
      <div class="s-threat__text">Гость А читает данные гостя Б через общую файловую систему или сеть контейнеров.</div>
      <div class="s-threat__defense">userns-remap: UID 1000 → 101000 · отдельные vault'ы · сетевые правила INPUT + DOCKER-USER</div>
    </div>
    <div class="s-threat">
      <div class="s-threat__tag">угроза</div>
      <div class="s-threat__title">Вертикальная изоляция</div>
      <div class="s-threat__text">Гость эксплуатирует уязвимость ядра и получает root на хосте.</div>
      <div class="s-threat__defense">gVisor Sentry перехватывает syscalls · userns-remap ограничивает права при побеге</div>
    </div>
    <div class="s-threat">
      <div class="s-threat__tag">угроза</div>
      <div class="s-threat__title">Resource exhaustion</div>
      <div class="s-threat__text">Форк-бомба, OOM или дисковое переполнение одним пользователем кладут весь хост.</div>
      <div class="s-threat__defense">pids-limit=512 · memory limit · мягкая квота 2 ГБ через du · проверка до обработки сообщения</div>
    </div>
    <div class="s-threat">
      <div class="s-threat__tag">угроза</div>
      <div class="s-threat__title">Prompt injection → Bash</div>
      <div class="s-threat__text">Вредоносный файл содержит инструкции, заставляющие модель выполнить произвольный shell-код.</div>
      <div class="s-threat__defense">У бесплатных пользователей инструмент Bash физически отсутствует в списке разрешённых — промпт не поможет получить то, чего нет</div>
    </div>
    <div class="s-threat">
      <div class="s-threat__tag">угроза</div>
      <div class="s-threat__title">Утечка через логи</div>
      <div class="s-threat__text">Токен бота или API-ключ попадает в audit-журнал в открытом виде.</div>
      <div class="s-threat__defense">Regex-маскирование до записи · COMPOSIO_API_KEY не проксируется в контейнер</div>
    </div>
    <div class="s-threat">
      <div class="s-threat__tag">угроза</div>
      <div class="s-threat__title">Межпользовательский контекст</div>
      <div class="s-threat__text">Один пользователь получает доступ к истории или памяти другого.</div>
      <div class="s-threat__defense">Сессии per-userId · settingSources без ~/.claude владельца · отдельные session-файлы в /tmp</div>
    </div>
  </div>
</div>

<!-- ── РЕЖИМЫ ─────────────────────────────────────── -->
<div class="s-section">
  <h2 class="s-section__heading">Бесплатный и платный: разница в правах</h2>
  <div class="s-modes">
    <div class="s-modes__col">
      <div class="s-modes__col-header">
        <div class="s-modes__col-title">Бесплатный</div>
      </div>
      <div class="s-modes__row">
        <svg class="s-modes__check" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="9" stroke="var(--ink)" stroke-width="1.5"/><path d="M6 10 L9 13 L14 7" stroke="var(--lime-2)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        Разговор с ИИ
      </div>
      <div class="s-modes__row">
        <svg class="s-modes__check" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="9" stroke="var(--muted)" stroke-width="1.5"/><path d="M6 14 L14 6 M6 6 L14 14" stroke="var(--muted)" stroke-width="1.5" stroke-linecap="round"/></svg>
        Файловая система
      </div>
      <div class="s-modes__row">
        <svg class="s-modes__check" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="9" stroke="var(--muted)" stroke-width="1.5"/><path d="M6 14 L14 6 M6 6 L14 14" stroke="var(--muted)" stroke-width="1.5" stroke-linecap="round"/></svg>
        Выполнение кода
      </div>
      <div class="s-modes__row">
        <svg class="s-modes__check" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="9" stroke="var(--muted)" stroke-width="1.5"/><path d="M6 14 L14 6 M6 6 L14 14" stroke="var(--muted)" stroke-width="1.5" stroke-linecap="round"/></svg>
        Браузер / интернет
      </div>
      <div class="s-modes__row">
        <svg class="s-modes__check" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="9" stroke="var(--muted)" stroke-width="1.5"/><path d="M6 14 L14 6 M6 6 L14 14" stroke="var(--muted)" stroke-width="1.5" stroke-linecap="round"/></svg>
        Google Workspace
      </div>
      <div class="s-modes__row">
        <svg class="s-modes__check" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="9" stroke="var(--muted)" stroke-width="1.5"/><path d="M6 14 L14 6 M6 6 L14 14" stroke="var(--muted)" stroke-width="1.5" stroke-linecap="round"/></svg>
        Изолированный контейнер
      </div>
      <div class="s-modes__accent">Блокировка на уровне архитектуры — промпт-инъекция не поможет</div>
    </div>
    <div class="s-modes__col s-modes__col--paid">
      <div class="s-modes__col-header">
        <div class="s-modes__col-title">Платный</div>
        <span class="s-modes__badge">PRO</span>
      </div>
      <div class="s-modes__row">
        <svg class="s-modes__check" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="9" stroke="var(--ink)" stroke-width="1.5"/><path d="M6 10 L9 13 L14 7" stroke="var(--lime-2)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        Разговор с ИИ
      </div>
      <div class="s-modes__row">
        <svg class="s-modes__check" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="9" stroke="var(--ink)" stroke-width="1.5"/><path d="M6 10 L9 13 L14 7" stroke="var(--lime-2)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        Файловая система
      </div>
      <div class="s-modes__row">
        <svg class="s-modes__check" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="9" stroke="var(--ink)" stroke-width="1.5"/><path d="M6 10 L9 13 L14 7" stroke="var(--lime-2)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        Выполнение кода
      </div>
      <div class="s-modes__row">
        <svg class="s-modes__check" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="9" stroke="var(--ink)" stroke-width="1.5"/><path d="M6 10 L9 13 L14 7" stroke="var(--lime-2)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        Браузер / интернет
      </div>
      <div class="s-modes__row">
        <svg class="s-modes__check" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="9" stroke="var(--ink)" stroke-width="1.5"/><path d="M6 10 L9 13 L14 7" stroke="var(--lime-2)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        Google Workspace
      </div>
      <div class="s-modes__row">
        <svg class="s-modes__check" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="9" stroke="var(--ink)" stroke-width="1.5"/><path d="M6 10 L9 13 L14 7" stroke="var(--lime-2)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        Изолированный контейнер
      </div>
    </div>
  </div>
</div>

<!-- ── ПОЧЕМУ У БЕСПЛАТНОГО НЕТ ФАЙЛОВОЙ СИСТЕМЫ ─── -->
<div class="s-prose">
  <p>Отсутствие файловой системы и выполнения кода в бесплатном режиме — не экономия на инфраструктуре. Это снижение поверхности атаки. Prompt injection в разговорной модели не даёт доступ к Bash, потому что инструмент Bash физически отсутствует в списке разрешённых для этого пользователя — не потому что промпт запрещает. Нельзя использовать то, чего нет в конфигурации.</p>
  <p>Платный уровень добавляет реальные инструменты — и вместе с ними изолированный контейнер с полным набором защитных слоёв: gVisor, userns-remap, сетевые правила, ресурсные лимиты. Расширение прав идёт в паре с расширением изоляции.</p>
</div>

<!-- ── ЧЕСТНЫЕ ПРЕДЕЛЫ ────────────────────────────── -->
<div class="s-section">
  <h2 class="s-section__heading">Честные пределы</h2>
  <div class="s-limits">
    <div class="s-limit">
      <div class="s-limit__title">End-to-end шифрования нет ни у кого</div>
      <div class="s-limit__text">Модели требуется открытый текст для обработки. Канал, в котором даже провайдер не видит содержания запроса, существовать не может в принципе — ни у Proboi, ни у ChatGPT, ни у кого другого. Это архитектурное ограничение всех языковых моделей без исключения.</div>
    </div>
    <div class="s-limit">
      <div class="s-limit__title">0-day защита не 100%</div>
      <div class="s-limit__text">Слоистая архитектура снижает вероятность успешной атаки и ограничивает её радиус. Но 100% защиту от ещё неизвестных уязвимостей не предоставляет никто, включая крупнейших облачных провайдеров. gVisor и userns-remap делают эксплуатацию значительно сложнее — не невозможной.</div>
    </div>
    <div class="s-limit">
      <div class="s-limit__title">SOC 2 / ISO 27001 нет</div>
      <div class="s-limit__text">Эти сертификации актуальны для корпоративных контрактов и не отражают реальное качество технической защиты. Ресурсы направляются в реализацию мер защиты, а не в подготовку аудиторской отчётности. Если сертификация критична для вашего кейса — это честный стоп-фактор.</div>
    </div>
  </div>
</div>

<!-- ── ОТВЕТСТВЕННОСТЬ ПОЛЬЗОВАТЕЛЯ ──────────────── -->
<div class="s-section">
  <h2 class="s-section__heading">Что зависит от вас</h2>
  <ul class="s-resp__list">
    <li>Не передавайте паспортные данные, СНИЛС, медицинские записи, реквизиты карт, пароли и биометрию.</li>
    <li>Документ коллеги, отправленный боту, — ваш правовой риск. Помните об ответственности за чужие персональные данные.</li>
    <li>При случайной передаче чувствительной информации очищайте контекст командами <code>/forget</code> и <code>/new</code>.</li>
    <li>Относитесь к чату с ИИ как к любому облачному сервису: не отправляйте то, что не отправили бы в корпоративный email.</li>
  </ul>
  <div class="s-rule">
    <strong>Простое правило:</strong> если бы вы не отправили это в ChatGPT — не отправляйте и в Proboi.
  </div>
</div>

<!-- ── ДАННЫЕ В РОССИИ ─────────────────────────────── -->
<div class="s-section">
  <h2 class="s-section__heading">Данные в России</h2>
  <div class="s-prose" style="margin-bottom:0">
    <p>Серверы Proboi работают на Timeweb Cloud в Москве. Ни один запрос не покидает территорию Российской Федерации — это физическое расположение железа, не маркетинговое заявление. Хостинг соответствует требованиям <strong>242-ФЗ</strong> о локализации персональных данных российских граждан.</p>
    <div class="s-callout">Исключение: запросы к моделям DeepSeek и Anthropic уходят на их серверы за рубежом. Это неизбежно при использовании внешних AI-провайдеров. Для задач, где это принципиально, используйте Proboi только для разговорных запросов без персональных данных.</div>
  </div>
</div>

<!-- ── О ПРОЦЕССЕ АУДИТА ──────────────────────────── -->
<div class="s-section">
  <h2 class="s-section__heading">О процессе аудита</h2>
  <div class="s-prose" style="margin-bottom:0">
    <p>Внутренние циклы безопасности проводятся регулярно. Последний завершён в мае 2026 — закрыто 27 проблем. Каждая проблема получает приоритет: <strong>P0</strong> — критический (эксплуатируется немедленно), <strong>P1</strong> — высокий (вектор атаки реален), <strong>P2</strong> — улучшение защиты глубины.</p>
    <p>P0 и P1 закрываются до деплоя — это жёсткое правило, а не рекомендация. P2 идут в roadmap с конкретными сроками. Реестр проблем ведётся в формате: описание уязвимости, способ эксплуатации, принятая техническая мера, коммит закрытия. Не «исправлено», а «исправлено так-то, вот коммит».</p>
    <div class="s-tech">Аудит май 2026: 27 проблем закрыто
P0 — 0 открытых · P1 — 0 открытых · P2 — в roadmap
Категории: изоляция контейнеров, утечки через env, сетевая фильтрация,
           ротация секретов, маскирование в логах</div>
  </div>
</div>

<!-- ── FOOTER ─────────────────────────────────────── -->
<footer class="s-footer">
  <span>© 2026 · Proboi · <a href="https://proboi.site/">proboi.site</a></span>
  <span>
    <a href="/oferta">Публичная оферта</a> ·
    <a href="/privacy">Политика конфиденциальности</a> ·
    <a href="/terms">Пользовательское соглашение</a>
  </span>
</footer>

</body>
</html>`;
}
