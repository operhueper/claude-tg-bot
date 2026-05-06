/**
 * Landing page for proboi.site — a static HTML stub served by the bot's web server.
 * Full-featured landing will be built later; this is the placeholder.
 */

export function renderLanding(): string {
  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>proboi — AI-ассистент в Telegram</title>
  <meta property="og:title" content="proboi — AI-ассистент в Telegram">
  <meta property="og:description" content="Персональный помощник на основе Claude и DeepSeek. Доступ по приглашению.">
  <meta property="og:type" content="website">
  <meta property="og:url" content="https://proboi.site">
  <style>
    *, *::before, *::after {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    html, body {
      height: 100%;
    }

    body {
      background: #111111;
      color: #ffffff;
      font-family: -apple-system, system-ui, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      padding: 24px 16px;
      text-align: center;
    }

    .main {
      max-width: 480px;
      width: 100%;
    }

    .brand {
      font-size: clamp(52px, 14vw, 80px);
      font-weight: 700;
      letter-spacing: -2px;
      line-height: 1;
      margin-bottom: 12px;
      color: #ffffff;
    }

    .tagline {
      font-size: clamp(16px, 4vw, 20px);
      font-weight: 400;
      color: #aaaaaa;
      margin-bottom: 28px;
    }

    .description {
      font-size: clamp(14px, 3.5vw, 16px);
      color: #888888;
      line-height: 1.6;
      margin-bottom: 40px;
    }

    .btn {
      display: inline-block;
      background: #229ED9;
      color: #ffffff;
      text-decoration: none;
      font-size: clamp(15px, 4vw, 17px);
      font-weight: 600;
      padding: 14px 36px;
      border-radius: 12px;
      transition: background 0.15s ease;
    }

    .btn:hover {
      background: #1a8bbf;
    }

    .btn:active {
      background: #1579a8;
    }

    .invite-note {
      margin-top: 16px;
      font-size: 13px;
      color: #666666;
    }

    .invite-note a {
      color: #888888;
      text-decoration: none;
      border-bottom: 1px solid #444444;
    }

    .invite-note a:hover {
      color: #aaaaaa;
      border-bottom-color: #666666;
    }

    footer {
      margin-top: auto;
      padding-top: 48px;
      font-size: 13px;
      color: #444444;
    }
  </style>
</head>
<body>
  <main class="main">
    <div class="brand">proboi</div>
    <div class="tagline">AI-ассистент в Telegram</div>
    <p class="description">
      Персональный помощник на основе Claude и DeepSeek.<br>
      Работает с текстом, голосом, фото, документами и кодом.<br>
      Ведёт твою публичную страничку. Запускает скрипты в твоём контейнере.
    </p>
    <a href="https://t.me/proboiAI_bot" class="btn">Открыть в Telegram</a>
    <p class="invite-note">Доступ по приглашению. Напиши <a href="https://t.me/ev_mironoff">@ev_mironoff</a></p>
  </main>
  <footer>© <span id="year"></span> proboi</footer>
  <script>document.getElementById('year').textContent = new Date().getFullYear();</script>
</body>
</html>`;
}
