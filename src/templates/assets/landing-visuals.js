/* О, мойКлод — interactive visuals */
(() => {
  const yr = document.getElementById('year');
  if (yr) yr.textContent = new Date().getFullYear();

  /* reveal on scroll */
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
    }
  }, { threshold: 0.12 });
  document.querySelectorAll('.block, .hero__chat, .vcard, .ncard, .minibot, .vault, .swarmkid, .slide, .imgcell')
    .forEach(el => { el.classList.add('reveal'); io.observe(el); });

  /* ---------- HERO chat loop ---------- */
  const chatBody = document.getElementById('chatBody');
  const field = document.getElementById('chatField');
  if (chatBody && field) {
    const script = [
      { who: 'me',  text: 'собери мне сайт-визитку про мою студию керамики' },
      { who: 'typing' },
      { who: 'bot', text: 'Понял. Делаю — пять блоков, твои фото, форма обратной связи. Минута.' },
      { who: 'typing' },
      { who: 'bot', text: 'Готово 👇' },
      { who: 'link', text: 'studio-glina.proboi.site' },
      { who: 'me',  text: 'красиво. поменяй обложку на охристый' },
      { who: 'bot', text: 'Сделано. Перезалил.' },
    ];
    const fields = [
      'собери мне сайт-визитку',
      'найди что я говорил про того клиента',
      'каждое утро в 9 — сводка почты',
      'сделай PDF из заметок за неделю',
      'поставь встречу с Машей в четверг',
    ];
    let fi = 0;
    function rotateField() {
      field.textContent = fields[fi % fields.length];
      fi++; setTimeout(rotateField, 3200);
    }
    rotateField();

    function add(item) {
      if (item.who === 'typing') {
        const t = document.createElement('div');
        t.className = 'typing';
        t.innerHTML = '<span></span><span></span><span></span>';
        chatBody.appendChild(t); return t;
      }
      const b = document.createElement('div');
      b.className = 'bubble bubble--' + (item.who === 'me' ? 'me' : item.who === 'link' ? 'link' : 'bot');
      b.textContent = item.text;
      chatBody.appendChild(b); return b;
    }
    let i = 0;
    function step() {
      if (i >= script.length) {
        setTimeout(() => { chatBody.innerHTML = ''; i = 0; step(); }, 4500);
        return;
      }
      const item = script[i++];
      const node = add(item);
      const delay = item.who === 'typing' ? 900 : (item.who === 'link' ? 700 : 1100);
      if (item.who === 'typing') setTimeout(() => { node.remove(); step(); }, delay);
      else setTimeout(step, delay);
    }
    step();
  }

  /* ===================================================================
     GRAPH — bigger + draggable nodes
     =================================================================== */
  const gsvg = document.getElementById('graphSvg');
  const gtl  = document.getElementById('timelineRange');
  if (gsvg) {
    const VB_W = 1180, VB_H = 760;
    const types = {
      note:    'var(--lime)',
      task:    'var(--coral)',
      contact: 'var(--ink)',
      file:    'var(--violet)',
      event:   '#3FB984',
      trip:    '#F2A93B',
      money:   '#D8A93B',
    };
    const nodes = [
      // центр
      { id: 0,  x: 590, y: 380, t: 0,  label: 'я',                 type: 'contact', big: true },

      // КОМАНДА
      { id: 1,  x: 350, y: 220, t: 4,  label: 'Маша · дизайн',     type: 'contact' },
      { id: 2,  x: 220, y: 320, t: 7,  label: 'Артур · разработка',type: 'contact' },
      { id: 3,  x: 200, y: 450, t: 10, label: 'админ барбершопа',  type: 'contact' },
      { id: 4,  x: 360, y: 560, t: 13, label: 'юрист',             type: 'contact' },

      // РАБОТА
      { id: 5,  x: 560, y: 180, t: 16, label: 'запуск лендинга',   type: 'task' },
      { id: 6,  x: 720, y: 130, t: 19, label: 'спринт #14',        type: 'task' },
      { id: 7,  x: 460, y: 280, t: 22, label: 'договор.pdf',       type: 'file' },
      { id: 8,  x: 820, y: 240, t: 25, label: 'КП клиенту',        type: 'task' },
      { id: 9,  x: 940, y: 180, t: 28, label: 'отправить счёт',    type: 'task' },

      // СОБЫТИЯ
      { id: 10, x: 720, y: 360, t: 32, label: 'звонок с Машей',    type: 'event' },
      { id: 11, x: 870, y: 380, t: 36, label: 'встреча · вторник', type: 'event' },
      { id: 12, x: 1010,y: 320, t: 40, label: 'демо-день',         type: 'event' },
      { id: 13, x: 580, y: 510, t: 44, label: 'созвон с юристом',  type: 'event' },

      // ПОЕЗДКИ
      { id: 14, x: 1020,y: 540, t: 48, label: 'Питер · 12-14 мая', type: 'trip' },
      { id: 15, x: 900, y: 600, t: 52, label: 'билеты.pdf',        type: 'file' },
      { id: 16, x: 1080,y: 440, t: 56, label: 'отель Astoria',     type: 'file' },
      { id: 17, x: 760, y: 640, t: 60, label: 'Тбилиси · июнь',    type: 'trip' },

      // ИДЕИ / ЗАМЕТКИ
      { id: 18, x: 460, y: 90,  t: 64, label: 'идея для книги',    type: 'note' },
      { id: 19, x: 680, y: 50,  t: 67, label: 'мысль про утро',    type: 'note' },
      { id: 20, x: 100, y: 220, t: 70, label: 'дневник',           type: 'note' },
      { id: 21, x: 120, y: 580, t: 73, label: 'питч в трёх абзацах',type: 'note' },
      { id: 22, x: 280, y: 660, t: 76, label: 'статья · черновик', type: 'note' },

      // ФАЙЛЫ
      { id: 23, x: 70,  y: 380, t: 80, label: 'методичка.pdf',     type: 'file' },
      { id: 24, x: 1100,y: 100, t: 83, label: 'отчёт q2.xlsx',     type: 'file' },
      { id: 25, x: 480, y: 700, t: 86, label: 'фото референса',    type: 'file' },

      // ФИНАНСЫ
      { id: 26, x: 920, y: 700, t: 89, label: 'налоги · до 25',    type: 'money' },
      { id: 27, x: 1080,y: 660, t: 92, label: 'подписки 12&nbsp;к/мес', type: 'money' },
      { id: 28, x: 240, y: 130, t: 95, label: 'счёт от Артура',    type: 'money' },

      // СВЕЖЕЕ
      { id: 29, x: 600, y: 400, t: 100,label: 'сегодня',           type: 'task' },
    ];
    const edges = [
      // ядро вокруг "я"
      [0,1],[0,2],[0,3],[0,4],[0,5],[0,7],[0,10],[0,18],[0,29],
      // команда — работа
      [1,5],[1,7],[1,10],[2,6],[2,8],[2,9],[3,11],[4,7],[4,13],
      // работа — события
      [5,10],[6,11],[6,12],[8,11],[8,9],[9,24],
      // поездки
      [14,15],[14,16],[14,11],[14,5],
      [17,1],[17,21],
      // идеи
      [18,19],[18,22],[19,20],[20,21],[21,22],
      // файлы
      [23,4],[23,20],[24,6],[24,9],[25,18],
      // финансы
      [26,9],[26,27],[27,2],[28,2],[28,4],
      // сегодня
      [29,5],[29,11],[29,8],[29,18],
    ];

    gsvg.setAttribute('viewBox', `0 0 ${VB_W} ${VB_H}`);

    const eg = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    gsvg.appendChild(eg);
    const ng = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    gsvg.appendChild(ng);

    const edgeEls = edges.map(([a, b]) => {
      const ln = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      ln.setAttribute('class', 'gedge');
      ln.dataset.a = a; ln.dataset.b = b;
      eg.appendChild(ln);
      return ln;
    });

    function updateEdges() {
      edgeEls.forEach((ln) => {
        const a = nodes[+ln.dataset.a], b = nodes[+ln.dataset.b];
        ln.setAttribute('x1', a.x); ln.setAttribute('y1', a.y);
        ln.setAttribute('x2', b.x); ln.setAttribute('y2', b.y);
      });
    }

    const nodeEls = nodes.map((n) => {
      const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      g.setAttribute('class', 'gnode');
      g.dataset.id = n.id;
      g.setAttribute('transform', `translate(${n.x},${n.y})`);

      const halo = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      halo.setAttribute('r', n.big ? 22 : 16);
      halo.setAttribute('fill', types[n.type]);
      halo.setAttribute('opacity', '0.18');
      g.appendChild(halo);

      const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      c.setAttribute('r', n.big ? 16 : 11);
      c.setAttribute('fill', types[n.type]);
      c.setAttribute('stroke', 'var(--ink)');
      c.setAttribute('stroke-width', '2');
      g.appendChild(c);

      const lbl = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      lbl.setAttribute('y', n.big ? 36 : 28);
      lbl.setAttribute('text-anchor', 'middle');
      lbl.setAttribute('font-family', 'JetBrains Mono, monospace');
      lbl.setAttribute('font-size', '12');
      lbl.setAttribute('fill', 'var(--ink-2)');
      lbl.setAttribute('paint-order', 'stroke');
      lbl.setAttribute('stroke', 'var(--cream)');
      lbl.setAttribute('stroke-width', '4');
      lbl.textContent = n.label;
      g.appendChild(lbl);

      ng.appendChild(g);

      g.addEventListener('mouseenter', () => focusNode(n.id));
      g.addEventListener('mouseleave', () => clearFocus());

      // drag
      g.addEventListener('pointerdown', (ev) => startDrag(ev, n, g));
      return g;
    });

    function svgPoint(ev) {
      const r = gsvg.getBoundingClientRect();
      return {
        x: (ev.clientX - r.left) * (VB_W / r.width),
        y: (ev.clientY - r.top) * (VB_H / r.height),
      };
    }

    let dragging = null;
    function startDrag(ev, n, g) {
      ev.preventDefault();
      g.setPointerCapture(ev.pointerId);
      const p = svgPoint(ev);
      dragging = { n, g, dx: n.x - p.x, dy: n.y - p.y, pid: ev.pointerId };
      gsvg.classList.add('dragging');
    }
    gsvg.addEventListener('pointermove', (ev) => {
      if (!dragging) return;
      const p = svgPoint(ev);
      dragging.n.x = Math.max(20, Math.min(VB_W - 20, p.x + dragging.dx));
      dragging.n.y = Math.max(20, Math.min(VB_H - 30, p.y + dragging.dy));
      dragging.g.setAttribute('transform', `translate(${dragging.n.x},${dragging.n.y})`);
      // wobble neighbors slightly
      updateEdges();
    });
    function endDrag(ev) {
      if (!dragging) return;
      try { dragging.g.releasePointerCapture(dragging.pid); } catch (_) {}
      dragging = null;
      gsvg.classList.remove('dragging');
    }
    gsvg.addEventListener('pointerup', endDrag);
    gsvg.addEventListener('pointercancel', endDrag);
    gsvg.addEventListener('pointerleave', endDrag);

    function focusNode(id) {
      const neigh = new Set([id]);
      edges.forEach(([a, b]) => { if (a === id) neigh.add(b); if (b === id) neigh.add(a); });
      nodeEls.forEach((el, i) => {
        el.classList.toggle('gnode--dim', !neigh.has(i));
        el.classList.toggle('gnode--hot', i === id);
      });
      edgeEls.forEach((el) => {
        const a = +el.dataset.a, b = +el.dataset.b;
        el.classList.toggle('gedge--hot', a === id || b === id);
      });
    }
    function clearFocus() {
      nodeEls.forEach(el => { el.classList.remove('gnode--dim'); el.classList.remove('gnode--hot'); });
      edgeEls.forEach(el => el.classList.remove('gedge--hot'));
    }

    function applyTimeline(val) {
      nodeEls.forEach((el, i) => {
        const visible = nodes[i].t <= val;
        el.style.opacity = visible ? 1 : 0;
        el.style.pointerEvents = visible ? 'auto' : 'none';
      });
      edgeEls.forEach((el) => {
        const a = +el.dataset.a, b = +el.dataset.b;
        el.style.opacity = (nodes[a].t <= val && nodes[b].t <= val) ? '' : 0;
      });
    }
    updateEdges();
    if (gtl) {
      gtl.addEventListener('input', () => applyTimeline(+gtl.value));
      const blockEl = gsvg.closest('.block');
      const onReveal = () => {
        let v = 0; gtl.value = 0; applyTimeline(0);
        const tick = () => {
          v += 2; if (v > 100) v = 100;
          gtl.value = v; applyTimeline(v);
          if (v < 100) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      };
      const ro = new IntersectionObserver((es) => {
        es.forEach(e => { if (e.isIntersecting) { onReveal(); ro.disconnect(); } });
      }, { threshold: 0.3 });
      ro.observe(blockEl);
    }
  }

  /* ===================================================================
     VOICE wave
     =================================================================== */
  const wave = document.getElementById('voiceWave');
  if (wave) {
    const N = 38;
    for (let i = 0; i < N; i++) {
      const s = document.createElement('span');
      const h = 8 + Math.abs(Math.sin(i * 0.6) * 28) + Math.random() * 8;
      s.style.setProperty('--h', h + 'px');
      s.style.animationDelay = (i * 0.04) + 's';
      wave.appendChild(s);
    }
    const transcript = document.getElementById('voiceTranscript');
    const lines = [
      '«Запиши идею для книги: глава про&nbsp;то, как утро ломает день»',
      '«Найди, что я&nbsp;говорил про того клиента из&nbsp;Питера»',
      '«Каждый понедельник в&nbsp;9 утра присылай сводку почты»',
      '«Собери PDF из&nbsp;моих заметок за&nbsp;неделю»',
    ];
    let ti = 0;
    setInterval(() => {
      ti = (ti + 1) % lines.length;
      transcript.style.opacity = 0;
      setTimeout(() => { transcript.innerHTML = lines[ti]; transcript.style.opacity = 1; }, 250);
    }, 3500);
    transcript.style.transition = 'opacity .25s ease';
  }

  /* ===================================================================
     TORNADO of tools — orbiting service logos
     =================================================================== */
  const tornado = document.getElementById('tornado');
  if (tornado) {
    // Brand-correct service logos (original SVG, simple recognizable marks)
    const tools = {
      gmail:    `<svg viewBox="0 0 24 24"><path d="M2 6.5C2 5.7 2.7 5 3.5 5h17c.8 0 1.5.7 1.5 1.5V18c0 .8-.7 1.5-1.5 1.5h-17C2.7 19.5 2 18.8 2 18V6.5Z" fill="#fff" stroke="#14130F" stroke-width="1.2"/><path d="M2 6.5 12 13l10-6.5" stroke="#EA4335" stroke-width="2" fill="none"/><path d="M2 6.5V18c0 .8.7 1.5 1.5 1.5H7V11.6L2 6.5Z" fill="#4285F4" opacity=".25"/><path d="M22 6.5V18c0 .8-.7 1.5-1.5 1.5H17V11.6L22 6.5Z" fill="#34A853" opacity=".25"/></svg>`,
      gcal:     `<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="2" fill="#fff" stroke="#14130F" stroke-width="1.2"/><path d="M3 9h18" stroke="#14130F" stroke-width="1.2"/><rect x="3" y="5" width="18" height="4" rx="2" fill="#4285F4"/><text x="12" y="18" text-anchor="middle" font-family="Unbounded, sans-serif" font-weight="700" font-size="8" fill="#1A73E8">26</text><line x1="8" y1="3" x2="8" y2="7" stroke="#14130F" stroke-width="1.6" stroke-linecap="round"/><line x1="16" y1="3" x2="16" y2="7" stroke="#14130F" stroke-width="1.6" stroke-linecap="round"/></svg>`,
      gdrive:   `<svg viewBox="0 0 24 24"><path d="M8 3h8l6 11-4 7H6L2 14 8 3Z" fill="#fff" stroke="#14130F" stroke-width="1.2" stroke-linejoin="round"/><path d="M8 3 2 14h8L16 3H8Z" fill="#FFCD46"/><path d="m16 3 6 11h-8L8 3h8Z" fill="#34A853" opacity=".85"/><path d="M2 14l4 7h12L10 14H2Z" fill="#1A73E8" opacity=".85"/></svg>`,
      notion:   `<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="3" fill="#fff" stroke="#14130F" stroke-width="1.2"/><path d="M8 7v10M8 7l8 10M16 7v10" stroke="#14130F" stroke-width="2" fill="none" stroke-linecap="round"/></svg>`,
      sheets:   `<svg viewBox="0 0 24 24"><rect x="4" y="3" width="16" height="18" rx="2" fill="#0F9D58"/><rect x="6" y="8" width="12" height="11" fill="#fff"/><line x1="6" y1="11" x2="18" y2="11" stroke="#0F9D58" stroke-width="1"/><line x1="6" y1="14" x2="18" y2="14" stroke="#0F9D58" stroke-width="1"/><line x1="6" y1="17" x2="18" y2="17" stroke="#0F9D58" stroke-width="1"/><line x1="12" y1="8" x2="12" y2="19" stroke="#0F9D58" stroke-width="1"/><rect x="4" y="3" width="16" height="18" rx="2" fill="none" stroke="#14130F" stroke-width="1.2"/></svg>`,
      telegram: `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#229ED9"/><path d="M7 12.5 17 8l-1.6 9-3.6-2.5-2 2-.4-3.5L7 12.5Z" fill="#fff"/><circle cx="12" cy="12" r="10" fill="none" stroke="#14130F" stroke-width="1.2"/></svg>`,
      whatsapp: `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#25D366"/><path d="M8.5 8.5c.5-.5 1-.4 1.4 0 .4.4.7 1 .9 1.5.2.4.1.7-.2 1l-.5.5c.6 1.2 1.5 2.1 2.7 2.7l.5-.5c.3-.3.6-.4 1-.2.5.2 1.1.5 1.5.9.4.4.5.9 0 1.4-.6.7-1.6 1.2-2.5 1-2.4-.4-4.4-2.4-4.8-4.8-.2-.9.3-1.9 1-2.5Z" fill="#fff"/><circle cx="12" cy="12" r="10" fill="none" stroke="#14130F" stroke-width="1.2"/></svg>`,
      slack:    `<svg viewBox="0 0 24 24"><rect x="9" y="3" width="3" height="9" rx="1.5" fill="#36C5F0"/><rect x="9" y="12" width="3" height="9" rx="1.5" fill="#2EB67D"/><rect x="3" y="9" width="9" height="3" rx="1.5" fill="#ECB22E"/><rect x="12" y="9" width="9" height="3" rx="1.5" fill="#E01E5A"/><g stroke="#14130F" stroke-width=".8" fill="none"><rect x="9" y="3" width="3" height="9" rx="1.5"/><rect x="9" y="12" width="3" height="9" rx="1.5"/><rect x="3" y="9" width="9" height="3" rx="1.5"/><rect x="12" y="9" width="9" height="3" rx="1.5"/></g></svg>`,
      gdocs:    `<svg viewBox="0 0 24 24"><path d="M6 3h8l4 4v14H6V3Z" fill="#fff" stroke="#14130F" stroke-width="1.2" stroke-linejoin="round"/><path d="M14 3v4h4" fill="#1A73E8" stroke="#14130F" stroke-width="1.2" stroke-linejoin="round"/><line x1="8" y1="11" x2="16" y2="11" stroke="#1A73E8" stroke-width="1.4"/><line x1="8" y1="14" x2="16" y2="14" stroke="#1A73E8" stroke-width="1.4"/><line x1="8" y1="17" x2="13" y2="17" stroke="#1A73E8" stroke-width="1.4"/></svg>`,
      figma:    `<svg viewBox="0 0 24 24"><circle cx="9" cy="6" r="3" fill="#F24E1E" stroke="#14130F" stroke-width="1"/><circle cx="9" cy="12" r="3" fill="#A259FF" stroke="#14130F" stroke-width="1"/><circle cx="9" cy="18" r="3" fill="#0ACF83" stroke="#14130F" stroke-width="1"/><circle cx="15" cy="6" r="3" fill="#FF7262" stroke="#14130F" stroke-width="1"/><circle cx="15" cy="12" r="3" fill="#1ABCFE" stroke="#14130F" stroke-width="1"/></svg>`,
      airtable: `<svg viewBox="0 0 24 24"><path d="M12 3 3 7l9 4 9-4-9-4Z" fill="#FFCD46" stroke="#14130F" stroke-width="1"/><path d="M3 7v5l9 4V11L3 7Z" fill="#1A73E8" stroke="#14130F" stroke-width="1"/><path d="M21 7v5l-9 4V11l9-4Z" fill="#FF6B6B" stroke="#14130F" stroke-width="1"/><path d="M12 16v5" stroke="#14130F" stroke-width="1.2"/></svg>`,
      youtube:  `<svg viewBox="0 0 24 24"><rect x="2" y="6" width="20" height="12" rx="3" fill="#FF0000" stroke="#14130F" stroke-width="1.2"/><path d="M10 9.5v5l5-2.5-5-2.5Z" fill="#fff" stroke="#14130F" stroke-width=".8" stroke-linejoin="round"/></svg>`,
    };

    // ring 1 (inner, fastest) — 4 chips
    // ring 2 (middle) — 5 chips
    // ring 3 (outer, slowest) — 6 chips
    const layout = [
      { ring: '#tRing1', radius: 180, items: ['gmail', 'gcal', 'gdrive', 'notion'], big: true },
      { ring: '#tRing2', radius: 270, items: ['sheets', 'gdocs', 'telegram', 'slack', 'figma'] },
      { ring: '#tRing3', radius: 360, items: ['whatsapp', 'youtube', 'airtable', 'gmail', 'gcal', 'notion'] },
    ];

    layout.forEach((cfg) => {
      const ring = tornado.querySelector(cfg.ring);
      if (!ring) return;
      const N = cfg.items.length;
      const animDur = parseFloat(getComputedStyle(ring).animationDuration) || 20;
      cfg.items.forEach((key, i) => {
        const angle = (i / N) * Math.PI * 2;
        const x = Math.cos(angle) * cfg.radius;
        const y = Math.sin(angle) * cfg.radius;
        const chip = document.createElement('div');
        chip.className = 'tornado__chip' + (cfg.big ? ' tornado__chip--big' : '');
        chip.style.transform = `translate(${x}px, ${y}px)`;
        // counter-rotate inner content so it stays upright
        const inner = document.createElement('div');
        inner.className = 'tornado__chipinner';
        inner.style.animation = `tornadoSpin ${animDur}s linear infinite ${ring.classList.contains('tornado__ring--2') ? '' : 'reverse'}`;
        inner.innerHTML = tools[key] + `<span>${labelFor(key)}</span>`;
        chip.appendChild(inner);
        ring.appendChild(chip);
      });
    });

    function labelFor(k) {
      return ({
        gmail: 'Gmail', gcal: 'Календарь', gdrive: 'Диск', notion: 'Notion',
        sheets: 'Sheets', gdocs: 'Docs', telegram: 'Telegram', slack: 'Slack',
        figma: 'Figma', whatsapp: 'WhatsApp', youtube: 'YouTube', airtable: 'Airtable',
      })[k] || k;
    }
  }

  /* ===================================================================
     MORPH cycle
     =================================================================== */
  const morphFrom = document.getElementById('morphFrom');
  const morphTo   = document.getElementById('morphTo');
  const morphDeck = document.getElementById('morphDeck');
  if (morphDeck) {
    const tiles = [
      { ext: 'PDF',  label: 'договор' },
      { ext: 'XLSX', label: 'таблица' },
      { ext: 'JPG',  label: 'фото чека' },
      { ext: 'DOCX', label: 'статья' },
    ];
    tiles.forEach(t => {
      const el = document.createElement('div');
      el.className = 'mtile';
      el.dataset.ext = t.ext;
      el.textContent = t.label;
      morphDeck.appendChild(el);
    });
    const tileEls = morphDeck.querySelectorAll('.mtile');
    const pairs = [
      ['PDF договора', 'таблица контрактов', 0, 1],
      ['фото чека', 'строки расходов', 2, 1],
      ['Excel плана', 'PDF на печать', 1, 0],
      ['голосовое 10 мин', 'структурная статья', 2, 3],
    ];
    let pi = 0;
    function cycle() {
      const [from, to, ai, bi] = pairs[pi % pairs.length];
      morphFrom.textContent = from;
      morphTo.textContent = to;
      tileEls.forEach((t, i) => t.classList.toggle('is-active', i === ai || i === bi));
      pi++;
    }
    cycle(); setInterval(cycle, 2400);
  }

  /* CLOCK ticks */
  const ticks = document.getElementById('clockTicks');
  if (ticks) {
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
      const x1 = 200 + Math.cos(a) * 156, y1 = 200 + Math.sin(a) * 156;
      const x2 = 200 + Math.cos(a) * 168, y2 = 200 + Math.sin(a) * 168;
      const ln = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      ln.setAttribute('x1', x1); ln.setAttribute('y1', y1);
      ln.setAttribute('x2', x2); ln.setAttribute('y2', y2);
      ln.setAttribute('stroke', 'var(--ink)'); ln.setAttribute('stroke-width', '2');
      ticks.appendChild(ln);
    }
  }

  /* NIGHT sky */
  const sky = document.getElementById('nightSky');
  if (sky) {
    for (let i = 0; i < 60; i++) {
      const s = document.createElement('div');
      s.className = 'star';
      s.style.left = Math.random() * 100 + '%';
      s.style.top = Math.random() * 100 + '%';
      s.style.animationDelay = (Math.random() * 3) + 's';
      const sz = 1 + Math.random() * 2.4;
      s.style.width = sz + 'px'; s.style.height = sz + 'px';
      s.style.opacity = 0.3 + Math.random() * 0.7;
      sky.appendChild(s);
    }
    const moon = document.createElement('div');
    moon.className = 'moon'; sky.appendChild(moon);
  }
})();
