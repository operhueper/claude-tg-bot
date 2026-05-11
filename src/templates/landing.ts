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

const HEAD_LINKS = `
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
<title>Proboi — ИИ-ассистент в Telegram</title>
<meta name="description" content="Песочница для создания твоего ИИ-ассистента. Личный помощник в Telegram. Помнит всё, работает с твоими документами и сервисами, может работать сам пока ты спишь." />
<meta property="og:title" content="Proboi — твой ИИ-ассистент в Telegram" />
<meta property="og:description" content="Песочница для создания личного ИИ-помощника. Текст, голос, фото, документы. У каждого свой кусочек сервера. Доступ по приглашению." />
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
        Песочница для создания твоего ИИ-ассистента.
        Личный помощник в Telegram. Помнит всё, что ты ему сказал,
        работает с твоими документами и сервисами,
        может работать сам — пока ты спишь.
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
        а&nbsp;отправит десять помощников по&nbsp;разным районам сразу. Тебе об&nbsp;этом думать не&nbsp;нужно — это происходит само.
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
          <p>«Подключил через аккаунт разработчика — был приятно удивлен, что такой есть». Бот залез в систему записи и увидел всё, от чего отталкиваться.</p>
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
      <p>Нет. Твои файлы лежат в&nbsp;твоём личном пространстве, к&nbsp;которому ни&nbsp;мы, ни&nbsp;другие пользователи доступа не&nbsp;имеют.</p>
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
<title>Как пользоваться Proboi</title>
<meta name="description" content="Голос, фото, файлы, код, Google — всё что умеет ваш личный ИИ-ассистент в Telegram." />
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
  --orange:  #f97316;
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
  padding: 56px 32px 40px;
}
.g-hero h1 {
  font-family: var(--f-display); font-weight: 800;
  font-size: clamp(26px, 4.5vw, 48px);
  line-height: 1.08; letter-spacing: -.03em;
  color: var(--ink);
  margin-bottom: 18px;
}
.g-hero p {
  font-size: 18px; color: var(--ink-2); max-width: 54ch;
  line-height: 1.5; margin-bottom: 28px;
}

/* ── Content sections ──────────────────────────────── */
.g-content {
  max-width: 860px; margin: 0 auto;
  padding: 0 32px 140px;
  display: flex; flex-direction: column; gap: 0;
}
.g-section {
  padding: 48px 0;
  border-bottom: 1.5px solid var(--paper-2);
}
.g-section:last-child { border-bottom: none; }
.g-section h2 {
  font-family: var(--f-display); font-weight: 700;
  font-size: clamp(18px, 2.8vw, 26px);
  letter-spacing: -.02em; line-height: 1.15;
  color: var(--ink); margin-bottom: 20px;
  display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
}
.g-section__narrative {
  display: grid; grid-template-columns: 1fr 1fr; gap: 16px;
  margin-bottom: 24px;
}
.g-narrative-card {
  padding: 18px 20px;
  border: 1.5px solid var(--ink);
  border-radius: var(--r-lg);
  font-size: 15px; line-height: 1.55;
}
.g-narrative-card--before {
  background: #FFE5E0;
}
.g-narrative-card--after {
  background: #EDFFB0;
}
.g-narrative-card__label {
  font-family: var(--f-mono); font-size: 11px; font-weight: 500;
  letter-spacing: .06em; margin-bottom: 8px; display: block;
}
.g-narrative-card--before .g-narrative-card__label { color: #C0280D; }
.g-narrative-card--after .g-narrative-card__label { color: #5A7A00; }

.g-examples-list {
  list-style: none; padding: 0; margin: 0;
  display: flex; flex-direction: column; gap: 10px;
}
.g-examples-list li {
  padding: 13px 18px;
  background: var(--cream);
  border: 1.5px solid var(--paper-2);
  border-radius: var(--r-md);
  font-size: 15px; color: var(--ink-2); line-height: 1.4;
  font-style: italic;
}
.g-examples-list li::before {
  content: "\\00AB";
  color: var(--muted);
}
.g-examples-list li::after {
  content: "\\00BB";
  color: var(--muted);
}

.g-tip {
  margin-top: 20px; padding: 14px 18px;
  background: var(--paper-2); border: 1.5px solid var(--ink);
  border-radius: var(--r-md); font-size: 14px; color: var(--ink-2);
  line-height: 1.5;
}
.g-tip strong { color: var(--ink); font-weight: 600; }

.g-steps {
  list-style: none; padding: 0; margin: 0;
  display: flex; flex-direction: column; gap: 10px;
  counter-reset: step;
}
.g-steps li {
  counter-increment: step;
  padding: 13px 18px 13px 52px;
  background: var(--cream);
  border: 1.5px solid var(--paper-2);
  border-radius: var(--r-md);
  font-size: 15px; color: var(--ink-2); line-height: 1.5;
  position: relative;
}
.g-steps li::before {
  content: counter(step);
  position: absolute; left: 14px; top: 50%; transform: translateY(-50%);
  width: 26px; height: 26px;
  background: var(--ink); color: var(--cream);
  border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-family: var(--f-display); font-weight: 700; font-size: 12px;
}

/* ── Badge pro ─────────────────────────────────────── */
.badge-pro {
  display: inline-flex; align-items: center;
  background: var(--orange); color: #fff;
  border-radius: 6px;
  padding: 3px 10px;
  font-family: var(--f-body); font-size: 12px; font-weight: 600;
  letter-spacing: .02em;
  cursor: pointer;
  user-select: none;
  flex-shrink: 0;
  transition: opacity .15s;
}
.badge-pro:hover { opacity: .82; }

/* ── Primary button ────────────────────────────────── */
.btn-primary {
  display: inline-flex; align-items: center; gap: 8px;
  background: var(--lime); color: var(--ink);
  border: 1.5px solid var(--ink); border-radius: 999px;
  padding: 13px 28px;
  font-family: var(--f-body); font-weight: 700; font-size: 15px;
  text-decoration: none;
  transition: background .18s, transform .14s;
}
.btn-primary:hover { background: var(--lime-2); transform: translateY(-1px); }

/* ── FAQ ───────────────────────────────────────────── */
.g-faq { display: flex; flex-direction: column; gap: 14px; margin-top: 8px; }
.g-faq-item {
  padding: 20px 22px;
  background: var(--cream);
  border: 1.5px solid var(--paper-2);
  border-radius: var(--r-lg);
}
.g-faq-item dt {
  font-weight: 600; font-size: 15px; color: var(--ink);
  margin-bottom: 8px;
}
.g-faq-item dd {
  font-size: 15px; color: var(--ink-2); line-height: 1.55;
}

/* ── Pay CTA section ───────────────────────────────── */
.g-cta-section {
  margin-top: 56px;
  background: var(--ink); color: var(--cream);
  border-radius: var(--r-xl); padding: 48px 40px;
  display: flex; flex-direction: column; gap: 18px;
  align-items: flex-start;
}
.g-cta-section h2 {
  font-family: var(--f-display); font-weight: 800;
  font-size: clamp(22px, 3.5vw, 36px); letter-spacing: -.02em;
  line-height: 1.1; color: var(--lime);
  display: block;
}
.g-cta-section p {
  font-size: 16px; color: #B5AFA3; max-width: 52ch; line-height: 1.5;
}
.g-cta-section .btn-primary {
  background: var(--lime); color: var(--ink);
  border-color: var(--lime);
}
.g-cta-section .btn-primary:hover { background: var(--lime-2); }

/* ── Sticky CTA ────────────────────────────────────── */
.cta-sticky {
  position: fixed; bottom: 0; left: 0; right: 0;
  background: var(--ink); color: var(--cream);
  padding: 14px 24px;
  display: flex; align-items: center; justify-content: space-between;
  gap: 16px; z-index: 200;
  border-top: 2px solid var(--line);
}
.cta-sticky p {
  font-size: 14px; color: #B5AFA3; line-height: 1.3;
  flex: 1;
}
.cta-sticky .btn-primary {
  white-space: nowrap; flex-shrink: 0;
  padding: 10px 20px; font-size: 14px;
}

/* ── Footer ────────────────────────────────────────── */
.g-footer {
  max-width: 860px; margin: 0 auto 40px;
  padding: 24px 32px 0;
  display: flex; align-items: center; justify-content: space-between;
  font-size: 13px; color: var(--muted);
  border-top: 1.5px solid var(--paper-2);
}
.g-footer a { color: var(--muted); text-decoration: underline; text-underline-offset: 3px; }
.g-footer a:hover { color: var(--ink); }

/* ── Responsive ────────────────────────────────────── */
@media (max-width: 640px) {
  .g-nav { padding: 14px 18px; }
  .g-hero, .g-content { padding-left: 18px; padding-right: 18px; }
  .g-section__narrative { grid-template-columns: 1fr; }
  .g-cta-section { padding: 32px 22px; }
  .cta-sticky { flex-direction: column; gap: 10px; text-align: center; }
  .cta-sticky p { font-size: 13px; }
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

<main>

<!-- ── Hero ─────────────────────────────────────────── -->
<section id="hero" class="g-hero">
  <h1>Proboi — ваш личный ИИ-ассистент прямо в Telegram</h1>
  <p>Голос, фото, файлы, код, Google — всё в одном чате.<br/>Без установки. Без регистрации. Просто напишите.</p>
  <a href="${TG_URL}" class="btn-primary" target="_blank" rel="noopener">Открыть бот →</a>
</section>

<!-- ── Content sections ──────────────────────────────── -->
<div class="g-content">

  <!-- 1. Просто пишите -->
  <section id="text" class="g-section">
    <h2>Просто пишите</h2>
    <div class="g-section__narrative">
      <div class="g-narrative-card g-narrative-card--before">
        <span class="g-narrative-card__label">РАНЬШЕ</span>
        Открыть ChatGPT в браузере, скопировать текст, ждать. С телефона неудобно, нужно переключаться между вкладками.
      </div>
      <div class="g-narrative-card g-narrative-card--after">
        <span class="g-narrative-card__label">ТЕПЕРЬ</span>
        Откройте бот и напишите что думаете. Без формулировок и шаблонов. Бот понимает разговорный язык.
      </div>
    </div>
    <ul class="g-examples-list">
      <li>Объясни мне что такое НДС простыми словами</li>
      <li>Помоги написать вежливый отказ клиенту, вот его сообщение: [вставить]</li>
      <li>Я устал. Что посмотреть сегодня вечером?</li>
    </ul>
  </section>

  <!-- 2. Голосовые сообщения -->
  <section id="voice" class="g-section">
    <h2>Голосовые сообщения</h2>
    <div class="g-section__narrative">
      <div class="g-narrative-card g-narrative-card--before">
        <span class="g-narrative-card__label">РАНЬШЕ</span>
        Голосовые не работали ни в одном AI-инструменте без плясок с транскрибацией. Нужно было сначала распознать, потом вставить.
      </div>
      <div class="g-narrative-card g-narrative-card--after">
        <span class="g-narrative-card__label">ТЕПЕРЬ</span>
        Записали голосовое — бот расслышит и ответит. Удобно за рулём, на кухне, когда руки заняты.
      </div>
    </div>
    <ul class="g-examples-list">
      <li>Надиктовали задачу — получили структурированный список</li>
      <li>Сказали «перепиши вот этот абзац» и зачитали его вслух — бот исправит</li>
    </ul>
  </section>

  <!-- 3. Фотографии -->
  <section id="photos" class="g-section">
    <h2>Фотографии</h2>
    <div class="g-section__narrative">
      <div class="g-narrative-card g-narrative-card--before">
        <span class="g-narrative-card__label">РАНЬШЕ</span>
        Для анализа изображения нужны были отдельные сервисы. Каждый — своя регистрация и интерфейс.
      </div>
      <div class="g-narrative-card g-narrative-card--after">
        <span class="g-narrative-card__label">ТЕПЕРЬ</span>
        Отправьте фото — бот опишет, переведёт, посчитает, объяснит. Прямо в том же чате.
      </div>
    </div>
    <ul class="g-examples-list">
      <li>Фото чека → Сколько я потратил на еду?</li>
      <li>Фото меню на иностранном языке → перевод</li>
      <li>Скриншот переписки → Как лучше ответить?</li>
    </ul>
  </section>

  <!-- 4. Документы, таблицы, PDF -->
  <section id="docs" class="g-section">
    <h2>Документы, таблицы, PDF <span class="badge-pro" onclick="location.href='#pay-cta'">Профи</span></h2>
    <div class="g-section__narrative">
      <div class="g-narrative-card g-narrative-card--before">
        <span class="g-narrative-card__label">РАНЬШЕ</span>
        Чтобы разобраться в договоре на 30 страниц, нужен был час и юрист. Таблицы Excel — отдельная история.
      </div>
      <div class="g-narrative-card g-narrative-card--after">
        <span class="g-narrative-card__label">ТЕПЕРЬ</span>
        Загрузите PDF — задайте вопрос. Бот прочитал весь документ и ответит по существу.
      </div>
    </div>
    <ul class="g-examples-list">
      <li>Какие штрафы предусмотрены в этом договоре?</li>
      <li>Загрузить Excel с продажами → Какой месяц был лучшим?</li>
      <li>Перепиши этот раздел более официальным языком</li>
    </ul>
  </section>

  <!-- 5. Код и автоматизация -->
  <section id="code" class="g-section">
    <h2>Код и автоматизация <span class="badge-pro" onclick="location.href='#pay-cta'">Профи</span></h2>
    <div class="g-section__narrative">
      <div class="g-narrative-card g-narrative-card--before">
        <span class="g-narrative-card__label">РАНЬШЕ</span>
        Нужно было знать программирование или нанимать разработчика для каждой автоматизации.
      </div>
      <div class="g-narrative-card g-narrative-card--after">
        <span class="g-narrative-card__label">ТЕПЕРЬ</span>
        Опишите задачу словами — бот напишет код, запустит его в изолированной среде и покажет результат.
      </div>
    </div>
    <ul class="g-examples-list">
      <li>Напиши скрипт, который переименует все файлы в папке по дате</li>
      <li>Скачай это видео с YouTube [ссылка]</li>
      <li>Конвертируй этот PDF в Word</li>
    </ul>
    <div class="g-tip"><strong>Важно:</strong> бот не просто пишет код — он его запускает в изолированной среде и возвращает результат прямо в чат.</div>
  </section>

  <!-- 6. Google Workspace -->
  <section id="google" class="g-section">
    <h2>Google Workspace <span class="badge-pro" onclick="location.href='#pay-cta'">Профи</span></h2>
    <div class="g-section__narrative">
      <div class="g-narrative-card g-narrative-card--before">
        <span class="g-narrative-card__label">РАНЬШЕ</span>
        Найти письмо двухнедельной давности — нужно было помнить ключевые слова и листать папки в Gmail.
      </div>
      <div class="g-narrative-card g-narrative-card--after">
        <span class="g-narrative-card__label">ТЕПЕРЬ</span>
        Подключите Google-аккаунт один раз — работайте голосом или текстом с почтой, календарём и файлами.
      </div>
    </div>
    <ul class="g-examples-list">
      <li>Найди письмо от Ивана про контракт</li>
      <li>Создай документ с планом встречи на завтра</li>
      <li>Что у меня в календаре на следующей неделе?</li>
    </ul>
    <div class="g-tip"><strong>Как подключить:</strong> напишите боту «подключи Google» — он пришлёт кнопку для безопасной авторизации.</div>
  </section>

  <!-- 7. Напоминания и автономная работа -->
  <section id="tasks" class="g-section">
    <h2>Напоминания и автономная работа <span class="badge-pro" onclick="location.href='#pay-cta'">Профи</span></h2>
    <div class="g-section__narrative">
      <div class="g-narrative-card g-narrative-card--before">
        <span class="g-narrative-card__label">РАНЬШЕ</span>
        Приложения для задач и напоминалок — отдельные экосистемы, не знают о вашей переписке.
      </div>
      <div class="g-narrative-card g-narrative-card--after">
        <span class="g-narrative-card__label">ТЕПЕРЬ</span>
        Бот помнит контекст и умеет работать пока вы спите. Установите напоминание — получите результат.
      </div>
    </div>
    <ul class="g-examples-list">
      <li>Напомни мне в пятницу в 9 утра проверить отчёт</li>
      <li>Каждое утро в 8:00 пиши мне сводку погоды</li>
    </ul>
  </section>

  <!-- 8. Генерация изображений -->
  <section id="images" class="g-section">
    <h2>Генерация изображений <span class="badge-pro" onclick="location.href='#pay-cta'">Профи</span></h2>
    <div class="g-section__narrative">
      <div class="g-narrative-card g-narrative-card--before">
        <span class="g-narrative-card__label">РАНЬШЕ</span>
        Midjourney, DALL-E — отдельные сервисы с отдельными подписками и интерфейсами.
      </div>
      <div class="g-narrative-card g-narrative-card--after">
        <span class="g-narrative-card__label">ТЕПЕРЬ</span>
        Опишите что хотите — картинка придёт прямо в чат. Без дополнительных сервисов.
      </div>
    </div>
    <ul class="g-examples-list">
      <li>Нарисуй логотип для кофейни в минималистичном стиле</li>
      <li>Сделай обложку для поста в Instagram: синий фон, текст Новый запуск</li>
    </ul>
  </section>

  <!-- 9. Свои рецепты -->
  <section id="recipes" class="g-section">
    <h2>Свои рецепты <span class="badge-pro" onclick="location.href='#pay-cta'">Профи</span></h2>
    <p style="font-size:16px;color:var(--ink-2);line-height:1.6;margin-bottom:20px;">Бот умеет учиться вашим командам. Создайте файл с рецептом в своей рабочей папке — и бот будет следовать ему при каждом запросе.</p>
    <div class="g-tip"><strong>Попробуйте:</strong> напишите «Помоги мне создать рецепт для [задача]» — бот сам объяснит как это сделать.</div>
  </section>

  <!-- 10. Совет трёх экспертов -->
  <section id="council" class="g-section">
    <h2>Совет трёх экспертов</h2>
    <p style="font-size:16px;color:var(--ink-2);line-height:1.6;margin-bottom:20px;">Когда нужно принять сложное решение — попросите бота провести совет. Бот возьмёт роли предпринимателя, финансиста и скептика — каждый выскажет своё, потом они поспорят, и вы получите честный вывод.</p>
    <ul class="g-examples-list">
      <li>Проведи совет: стоит ли мне открывать второй магазин сейчас или подождать?</li>
    </ul>
  </section>

  <!-- 11. FAQ -->
  <section id="faq" class="g-section">
    <h2>Частые вопросы</h2>
    <dl class="g-faq">
      <div class="g-faq-item">
        <dt>Это безопасно? Бот видит мои файлы?</dt>
        <dd>Файлы обрабатываются только в момент запроса. Бот не хранит их постоянно.</dd>
      </div>
      <div class="g-faq-item">
        <dt>Чем Профи отличается от бесплатного?</dt>
        <dd>Бесплатный — текст и голос, до 10 сообщений в день. Профи — документы, код, Google, изображения, напоминания, свои рецепты. Без ограничений.</dd>
      </div>
      <div class="g-faq-item">
        <dt>Как отменить подписку?</dt>
        <dd>Напишите боту «отмени подписку» или нажмите кнопку в разделе /status. Карта не будет списана.</dd>
      </div>
      <div class="g-faq-item">
        <dt>Что если карта не прошла?</dt>
        <dd>Бот пришлёт уведомление и даст 48 часов на повторную оплату. Доступ не прекратится сразу.</dd>
      </div>
      <div class="g-faq-item">
        <dt>Можно ли работать с нескольких устройств?</dt>
        <dd>Да, это обычный Telegram-чат. Работает везде где есть Telegram.</dd>
      </div>
    </dl>
  </section>

  <!-- 12. Как работает подключение Google -->
  <section id="oauth" class="g-section">
    <h2>Как работает подключение Google (OAuth)</h2>
    <p style="font-size:16px;color:var(--ink-2);line-height:1.6;margin-bottom:20px;">Что происходит когда вы нажимаете «Подключить Google»:</p>
    <ol class="g-steps">
      <li>Открывается страница Google — не наша.</li>
      <li>Вы выбираете аккаунт и нажимаете «Разрешить».</li>
      <li>Google передаёт нам токен доступа — временный ключ только для указанных действий.</li>
    </ol>
    <div class="g-tip" style="margin-top:20px">
      <strong>Что бот не видит:</strong> ваш пароль Google. Никогда. Это технически невозможно при OAuth.<br/>
      <strong>Как отозвать доступ:</strong> <a href="https://myaccount.google.com/permissions" target="_blank" rel="noopener" style="color:var(--ink);text-underline-offset:3px">myaccount.google.com/permissions</a> → найдите Proboi → «Удалить доступ».
    </div>
  </section>

  <!-- Pay CTA -->
  <section id="pay-cta" class="g-cta-section">
    <h2>Попробуйте Профи</h2>
    <p>5 дней бесплатно при привязке карты. Потом 499 ₽/мес. Отменить можно в любой момент.</p>
    <a href="${TG_URL}?start=pay" class="btn-primary" target="_blank" rel="noopener">Привязать карту — 5 дней бесплатно</a>
  </section>

</div>
</main>

<!-- ── Footer ────────────────────────────────────────── -->
<footer class="g-footer">
  <span>© 2026 · Proboi · <a href="https://proboi.site/">proboi.site</a></span>
  <a href="${TG_URL}" target="_blank" rel="noopener">@proboiAI_bot</a>
</footer>

<!-- ── Sticky CTA ─────────────────────────────────────── -->
<div class="cta-sticky">
  <p>Попробуйте Профи — 5 дней бесплатно при привязке карты</p>
  <a href="${TG_URL}" class="btn-primary" target="_blank" rel="noopener">Открыть бот →</a>
</div>

</body>
</html>`;
}

