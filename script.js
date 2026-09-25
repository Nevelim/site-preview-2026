/* ИТС — форум 2026. Визуальные эффекты.
   Vanilla JS без библиотек. Прогрессивное улучшение:
   без JS страница полностью работоспособна (класс .js ставится здесь).
   Тематика: живая транспортная сеть, маршруты, движение. */
(() => {
  'use strict';

  const root = document.documentElement;
  root.classList.add('js');

  const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  const reduceMotion = motionQuery.matches;
  const compactMotion = window.matchMedia('(max-width: 760px), (pointer: coarse)');
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  /* цель Яндекс.Метрики — срабатывает только когда включён счётчик
     (window.ITS_METRIKA_ID в index.html) */
  const goal = (name) => {
    try {
      if (window.ITS_METRIKA_ID && window.ym) window.ym(window.ITS_METRIKA_ID, 'reachGoal', name);
    } catch (e) {}
  };

  /* ---------- Табы дней программы форума (делегирование) ---------- */
  document.addEventListener('click', (e) => {
    const tab = e.target.closest('.program__tab');
    if (!tab) return;
    document.querySelectorAll('.program__tab').forEach((t) => {
      const on = t === tab;
      t.classList.toggle('is-active', on);
      t.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    document.querySelectorAll('.program__day').forEach((d) => {
      d.classList.toggle('is-active', d.dataset.day === tab.dataset.day);
    });
  });

  /* ---------- 1. Появление блоков при прокрутке ---------- */
  const revealTargets = document.querySelectorAll(
    '.section-title, .section-sub, ' +
    '.trust__item, .stats__grid, .stats__note, .route, .card, .experience__block, ' +
    '.steps__item, .regions li, .partners li, ' +
    '.contact-card, .contacts__actions, .contacts__social'
  );

  if (reduceMotion || compactMotion.matches || !('IntersectionObserver' in window)) {
    // без анимаций — просто показать всё
  } else {
    revealTargets.forEach((el, i) => {
      el.classList.add('reveal');
      // «лесенка»: у плиток гербов/партнёров — чаще, у крупных блоков — по трём шагам
      const isTile = el.tagName === 'LI';
      const delay = (i % (isTile ? 8 : 3)) * (isTile ? 55 : 90);
      el.style.transitionDelay = delay + 'ms';
    });

    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

    revealTargets.forEach((el) => io.observe(el));
  }

  /* ---------- 2. Счётчики цифр + «скан данных» по карточке ---------- */
  const animateCount = (el) => {
    const item = el.closest('.stats__item');
    // «406 000+» → число 406000 и суффикс «+»
    const m = el.textContent.replace(/[\s\u00A0\u202F]/g, '').match(/^(\d+)(.*)$/);
    if (!m) return;
    const target = parseInt(m[1], 10);
    const suffix = m[2];
    const fmt = (v) => (v >= 1000 ? v.toLocaleString('ru-RU') : String(v));
    const dur = 900;
    const t0 = performance.now();
    const tick = (t) => {
      const p = Math.min((t - t0) / dur, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      el.textContent = fmt(Math.round(target * eased)) + (p === 1 ? suffix : '');
      if (p < 1) requestAnimationFrame(tick);
      else if (item) item.classList.add('counted'); // запускает CSS-свечение
    };
    requestAnimationFrame(tick);
  };

  const nums = document.querySelectorAll('.stats__num');
  if (reduceMotion || !('IntersectionObserver' in window)) {
    // значения уже в HTML — ничего не делаем
  } else {
    const ioNums = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          animateCount(entry.target);
          ioNums.unobserve(entry.target);
        }
      });
    }, { threshold: 0.6 });
    nums.forEach((n) => ioNums.observe(n));
  }

  /* ---------- 3. Живая транспортная сеть: узлы, связи, «машины» на маршрутах ---------- */
  const hero = document.querySelector('.hero');
  const initNetwork = () => {
    if (!hero || reduceMotion || compactMotion.matches || !('IntersectionObserver' in window)) return;
    const canvas = document.createElement('canvas');
    canvas.className = 'hero__canvas';
    canvas.setAttribute('aria-hidden', 'true');
    hero.prepend(canvas);
    const ctx = canvas.getContext('2d');
    if (!ctx) { canvas.remove(); return; }

    const DPR = Math.min(window.devicePixelRatio || 1, 2);
    let W = 0, H = 0, nodes = [], vehicles = [], raf = null, running = false;

    // цвета сети — из темы (CSS-переменные), перекрашиваемся при смене темы
    const readPalette = () => {
      const cs = getComputedStyle(document.documentElement);
      return {
        lineRgb: cs.getPropertyValue('--net-line-rgb').trim() || '0, 122, 252',
        node: cs.getPropertyValue('--net-node').trim() || 'rgba(120, 175, 255, 0.55)',
        vehicle: cs.getPropertyValue('--net-vehicle').trim() || '#8ec2ff',
        halo: cs.getPropertyValue('--net-vehicle-halo').trim() || 'rgba(142, 194, 255, 0.25)',
        tail: cs.getPropertyValue('--net-tail').trim() || 'rgba(77, 163, 255, 0.5)'
      };
    };
    let palette = readPalette();
    window.addEventListener('its:theme', () => { palette = readPalette(); buildMapLayer(); });

    const LINK = 130;

    // «транспорт» сети красим в фирменные цвета систем (те же, что у карточек в 02)
    const SYS_COLORS = ['#007AFC', '#008774', '#C26B61', '#1677FF', '#8E6CF0'];
    const vehPalette = SYS_COLORS.map((hex) => {
      const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
      return { dot: hex, halo: 'rgba(' + r + ',' + g + ',' + b + ',0.25)', tail: 'rgba(' + r + ',' + g + ',' + b + ',0.5)' };
    });

    /* Контурная карта РФ за сетью (assets/russia-map.js): координаты — дельты в сотых
       градуса; по X применяется фактор 0.5 (сжатие долготы на широтах страны),
       Чукотка нормализована через 180-й меридиан. Регионы присутствия — с заливкой. */
    const mapData = window.RUSSIA_MAP || null;
    let mapLayers = null, mapPos = null;
    const decodeRing = (flat) => {
      const pts = [];
      let x = 0, y = 0;
      for (let i = 0; i < flat.length; i += 2) { x += flat[i]; y += flat[i + 1]; pts.push(x / 100, y / 100); }
      return pts;
    };
    const buildMapLayer = () => {
      mapLayers = null; mapPos = null;
      if (!mapData || !W || !H) return;
      const mnx = mapData.bbox[0] / 100, mny = mapData.bbox[1] / 100;
      const mxx = mapData.bbox[2] / 100, mxy = mapData.bbox[3] / 100;
      // прямая проекция: равномерное сжатие долготы (без изгиба меридианов —
      // эксперимент с cos(широты) искривлял границы и отвергнут заказчиком)
      const KX = 0.5;
      const spanX = (mxx - mnx) * KX, spanY = mxy - mny;
      let w = Math.min(W * 0.8, 940);
      let h = w * spanY / spanX;
      if (h > H * 0.82) { h = H * 0.82; w = h * spanX / spanY; }
      const mkLayer = () => {
        const cvx = document.createElement('canvas');
        cvx.width = Math.max(1, Math.round(w * DPR));
        cvx.height = Math.max(1, Math.round(h * DPR));
        const cc = cvx.getContext('2d');
        cc.setTransform(DPR, 0, 0, DPR, 0, 0);
        return [cvx, cc];
      };
      const [cvB, c] = mkLayer();   // слой 1: границы
      const [cvP, cp] = mkLayer();  // слой 2: присутствие (пульсирует в draw)
      const [cvL, cl] = mkLayer();  // слой 3: подписи + легенда
      const s = Math.min((w - 8) / spanX, (h - 8) / spanY);
      const px = (lon) => 4 + (lon - mnx) * KX * s;
      const py = (lat) => 4 + (mxy - lat) * s;
      const trace = (ctx2, pts) => {
        ctx2.beginPath();
        ctx2.moveTo(px(pts[0], pts[1]), py(pts[1]));
        for (let i = 2; i < pts.length; i += 2) ctx2.lineTo(px(pts[i], pts[i + 1]), py(pts[i + 1]));
        ctx2.closePath();
      };
      // слой 1: границы всех субъектов — тихая линия цвета темы
      c.strokeStyle = 'rgba(' + palette.lineRgb + ', 0.26)';
      c.lineWidth = 1;
      for (const flat of mapData.b) { trace(c, decodeRing(flat)); c.stroke(); }
      // слой 2: регионы присутствия — в цветах систем, которые там стоят (bv/rv/mix)
      const SYS_FILL = { bv: [0, 135, 116], rv: [194, 107, 97], hosta: [22, 119, 255] };
      const theme = root.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
      const fillA = theme === 'light' ? 0.30 : 0.34;
      const strA = theme === 'light' ? 0.85 : 0.9;
      // полосы трёх систем для Тюменской области (BV+RV+hosta)
      const stripeCv = document.createElement('canvas');
      stripeCv.width = 15; stripeCv.height = 15;
      const sc = stripeCv.getContext('2d');
      sc.globalAlpha = fillA;
      Object.values(SYS_FILL).forEach(([r, g, b], i) => {
        sc.fillStyle = 'rgba(' + r + ',' + g + ',' + b + ',1)';
        sc.fillRect(0, i * 5, 15, 5);
      });
      const stripePat = cp.createPattern(stripeCv, 'repeat');
      for (const item of mapData.p) {
        trace(cp, decodeRing(item.f));
        const mix = item.s === 'mix';
        if (mix) cp.fillStyle = stripePat;
        else { const [r, g, b] = SYS_FILL[item.s]; cp.fillStyle = 'rgba(' + r + ',' + g + ',' + b + ',' + fillA + ')'; }
        if (!mix) { const [r, g, b] = SYS_FILL[item.s]; cp.shadowColor = 'rgba(' + r + ',' + g + ',' + b + ',0.6)'; cp.shadowBlur = 5; }
        cp.fill();
        cp.shadowBlur = 0;
        if (mix) { cp.strokeStyle = 'rgba(' + palette.lineRgb + ', 0.7)'; cp.lineWidth = 1.2; }
        else { const [r, g, b] = SYS_FILL[item.s]; cp.strokeStyle = 'rgba(' + r + ',' + g + ',' + b + ',' + strA + ')'; cp.lineWidth = 1.4; }
        cp.stroke();
      }

      // слой 3: подписи регионов (широкие — внутри, европейская теснота — выносными линиями)
      if (w >= 640) {
        const dark = theme === 'dark';
        const LABELS = [
          ['ТЮМЕНСКАЯ ОБЛ.', 69, 57.2, null],
          ['СВЕРДЛОВСКАЯ', 63, 58.5, null],
          ['ЧЕЛЯБИНСКАЯ', 60.5, 54.3, null],
          ['ОРЕНБУРГСКАЯ', 55, 52.6, null],
          ['ОМСКАЯ', 73.5, 55.0, null],
          ['КРАСНОЯРСКИЙ КРАЙ', 95, 62, null],
          ['ЧУВАШИЯ', 30.5, 49.5, [47.3, 55.4]],
          ['МОРДОВИЯ', 30.5, 48.1, [44.9, 54.3]],
          ['ЛИПЕЦКАЯ', 30.5, 46.7, [39.6, 52.6]],
          ['ВОРОНЕЖСКАЯ', 30.5, 45.3, [40.2, 51.2]],
          ['БЕЛГОРОДСКАЯ', 30.5, 43.9, [36.6, 50.7]],
          ['СЕВАСТОПОЛЬ', 31.5, 42.5, [33.55, 44.55]]
        ];
        cl.font = '700 10.5px Gilroy, -apple-system, system-ui, sans-serif';
        cl.textBaseline = 'middle';
        cl.textAlign = 'left';
        for (const [name, lon, lat, target] of LABELS) {
          const x = px(lon), y = py(lat);
          if (target) {
            cl.strokeStyle = 'rgba(' + palette.lineRgb + ', 0.55)';
            cl.lineWidth = 1;
            cl.beginPath();
            cl.moveTo(x + 3, y);
            cl.lineTo(px(target[0]) - 3, py(target[1]));
            cl.stroke();
          }
          cl.lineWidth = 3.5;
          cl.lineJoin = 'round';
          cl.strokeStyle = dark ? 'rgba(21,24,27,0.9)' : 'rgba(244,246,249,0.95)';
          cl.strokeText(name, x, y);
          cl.fillStyle = dark ? 'rgba(233,239,246,0.95)' : 'rgba(16,20,26,0.92)';
          cl.fillText(name, x, y);
        }
        // мини-легенда систем
        const LEGEND = [['bv', 'bus:vision'], ['rv', 'run:vision'], ['hosta', 'hosta:dev']];
        cl.font = '700 10px Gilroy, -apple-system, system-ui, sans-serif';
        cl.lineJoin = 'round';
        let lx = w - 258, ly = h - 10;
        for (const [k, lab] of LEGEND) {
          const [r, g, b] = SYS_FILL[k];
          cl.fillStyle = 'rgba(' + r + ',' + g + ',' + b + ',1)';
          cl.beginPath(); cl.arc(lx, ly, 3.5, 0, Math.PI * 2); cl.fill();
          cl.lineWidth = 3;
          cl.strokeStyle = dark ? 'rgba(21,24,27,0.9)' : 'rgba(244,246,249,0.95)';
          cl.strokeText(lab, lx + 8, ly);
          cl.fillStyle = dark ? 'rgba(233,239,246,0.95)' : 'rgba(16,20,26,0.95)';
          cl.fillText(lab, lx + 8, ly);
          lx += 22 + cl.measureText(lab).width;
        }
      }
      mapLayers = { b: cvB, p: cvP, l: cvL };
      const mobile = W < 640;
      mapPos = {
        x: mobile ? (W - w) / 2 : W - w - Math.max(12, W * 0.04),
        y: mobile ? H * 0.40 : H - h - Math.max(8, H * 0.06),
        w: w, h: h,
        alpha: mobile ? 0.55 : 0.75,
        presenceBoost: mobile ? 1.25 : 1 // на мобильных присутствие ярче границ
      };
      // якоря регионов присутствия в координатах канваса — между ними летают «рейсы»
      const ANCHORS = [
        [69, 57.2], [60.5, 54.3], [55, 52.6], [63, 58.5], [73.5, 55], [95, 62],
        [39.6, 52.6], [40.2, 51.2], [36.6, 50.7], [44.9, 54.3], [47.3, 55.4], [33.55, 44.55]
      ];
      mapPos.anchorsPx = ANCHORS.map(([lon, lat]) => [mapPos.x + px(lon), mapPos.y + py(lat)]);
    };

    /* «Междугородние рейсы»: точки в цветах систем летают между регионами
       присутствия поверх карты — ИТС буквально связывает регионы */
    let flights = [];
    const newFlight = (i) => {
      const A = mapPos.anchorsPx, n = A.length;
      const a = (Math.random() * n) | 0;
      const b = (a + 1 + ((Math.random() * (n - 1)) | 0)) % n;
      return { a, b, t: Math.random() * 0.25, speed: 0.0011 + Math.random() * 0.0013, color: vehPalette[(i + 1) % vehPalette.length] };
    };
    const initFlights = () => {
      flights = (mapPos && mapPos.anchorsPx) ? [0, 1, 2].map((i) => newFlight(i)) : [];
    };

    const pickNeighbor = (a) => {
      const near = [];
      for (let i = 0; i < nodes.length; i++) {
        if (i === a) continue;
        if (Math.hypot(nodes[i].x - nodes[a].x, nodes[i].y - nodes[a].y) < LINK + 30) near.push(i);
      }
      return near.length ? near[(Math.random() * near.length) | 0] : (Math.random() * nodes.length) | 0;
    };

    const newVehicle = () => {
      const a = (Math.random() * nodes.length) | 0;
      return { a, b: pickNeighbor(a), t: Math.random(), speed: 0.004 + Math.random() * 0.005 };
    };

    const resize = () => {
      const r = hero.getBoundingClientRect();
      W = r.width; H = r.height;
      canvas.width = W * DPR; canvas.height = H * DPR;
      canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      const count = W < 640 ? 26 : W < 1024 ? 40 : 56;
      nodes = Array.from({ length: count }, () => ({
        x: Math.random() * W,
        y: Math.random() * H,
        vx: (Math.random() - 0.5) * 0.35,
        vy: (Math.random() - 0.5) * 0.35,
        r: Math.random() * 1.4 + 0.8,
        phase: Math.random() * Math.PI * 2 // для «дыхания» размера
      }));
      const vcount = W < 640 ? 5 : W < 1024 ? 8 : 11;
      vehicles = Array.from({ length: vcount }, (_, i) =>
        Object.assign(newVehicle(), { color: vehPalette[i % vehPalette.length] }));
      buildMapLayer();
      initFlights();
    };

    const draw = () => {
      const t = performance.now();
      ctx.clearRect(0, 0, W, H);
      // контурная карта — фоном: границы, «дышащее» присутствие, подписи
      if (mapLayers && mapPos) {
        ctx.globalAlpha = mapPos.alpha;
        ctx.drawImage(mapLayers.b, mapPos.x, mapPos.y, mapPos.w, mapPos.h);
        ctx.globalAlpha = Math.min(1, mapPos.alpha * (0.84 + 0.16 * Math.sin(t * 0.0009)) * mapPos.presenceBoost);
        ctx.drawImage(mapLayers.p, mapPos.x, mapPos.y, mapPos.w, mapPos.h);
        // подписи и легенда — для чтения, выводим почти без прозрачности водяного знака
        ctx.globalAlpha = Math.min(1, mapPos.alpha * 1.33);
        ctx.drawImage(mapLayers.l, mapPos.x, mapPos.y, mapPos.w, mapPos.h);
        ctx.globalAlpha = 1;
      }
      for (const n of nodes) {
        n.x += n.vx; n.y += n.vy;
        if (n.x < -20) n.x = W + 20; else if (n.x > W + 20) n.x = -20;
        if (n.y < -20) n.y = H + 20; else if (n.y > H + 20) n.y = -20;
      }
      // связи
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i], b = nodes[j];
          const d = Math.hypot(a.x - b.x, a.y - b.y);
          if (d < LINK) {
            const alpha = (1 - d / LINK) * 0.16;
            ctx.strokeStyle = 'rgba(' + palette.lineRgb + ', ' + alpha.toFixed(3) + ')';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
        }
      }
      // узлы («остановки») — размер «дышит»
      for (const n of nodes) {
        const pulse = 1 + 0.3 * Math.sin(t * 0.0018 + n.phase);
        ctx.fillStyle = palette.node;
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r * pulse, 0, Math.PI * 2);
        ctx.fill();
      }
      // «междугородние рейсы» поверх карты — между регионами присутствия
      if (flights.length && mapPos && mapPos.anchorsPx) {
        for (let i = 0; i < flights.length; i++) {
          const f = flights[i];
          f.t += f.speed;
          if (f.t >= 1) { flights[i] = newFlight(i); continue; }
          const A = mapPos.anchorsPx[f.a], B = mapPos.anchorsPx[f.b];
          const x = A[0] + (B[0] - A[0]) * f.t, y = A[1] + (B[1] - A[1]) * f.t;
          const t2 = Math.max(0, f.t - 0.10);
          const x2 = A[0] + (B[0] - A[0]) * t2, y2 = A[1] + (B[1] - A[1]) * t2;
          ctx.strokeStyle = f.color.tail;
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          ctx.moveTo(x2, y2);
          ctx.lineTo(x, y);
          ctx.stroke();
          ctx.fillStyle = f.color.halo;
          ctx.beginPath();
          ctx.arc(x, y, 4.6, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = f.color.dot;
          ctx.beginPath();
          ctx.arc(x, y, 1.8, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      // «транспорт» — яркие точки едут по связям с хвостом
      for (const v of vehicles) {
        v.t += v.speed;
        if (v.t >= 1) { v.a = v.b; v.b = pickNeighbor(v.a); v.t = 0; }
        const A = nodes[v.a], B = nodes[v.b];
        if (!A || !B) { Object.assign(v, newVehicle()); continue; }
        const x = A.x + (B.x - A.x) * v.t;
        const y = A.y + (B.y - A.y) * v.t;
        const t2 = Math.max(0, v.t - 0.14);
        const x2 = A.x + (B.x - A.x) * t2;
        const y2 = A.y + (B.y - A.y) * t2;
        // хвост
        ctx.strokeStyle = v.color.tail;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(x2, y2);
        ctx.lineTo(x, y);
        ctx.stroke();
        // ореол (пульсирует) + точка
        const glow = 5.5 + Math.sin(t * 0.004 + v.t * 10) * 1.6;
        ctx.fillStyle = v.color.halo;
        ctx.beginPath();
        ctx.arc(x, y, glow, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = v.color.dot;
        ctx.beginPath();
        ctx.arc(x, y, 2, 0, Math.PI * 2);
        ctx.fill();
      }
      window.__itsCv = (window.__itsCv || 0) + 1;
      if (running) raf = requestAnimationFrame(draw);
    };

    let heroVisible = false;
    const start = () => {
      if (!running && heroVisible && !document.hidden && !compactMotion.matches && !motionQuery.matches) {
        running = true; raf = requestAnimationFrame(draw);
      }
    };
    const stop = () => { running = false; if (raf) cancelAnimationFrame(raf); };
    const syncNetwork = () => {
      if (heroVisible && !document.hidden && !compactMotion.matches && !motionQuery.matches) start();
      else stop();
    };

    resize();
    let resizeTimer;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(resize, 150);
    });

    new IntersectionObserver((entries) => {
      heroVisible = entries[0].isIntersecting;
      syncNetwork();
    }, { threshold: 0.02 }).observe(hero);

    document.addEventListener('visibilitychange', syncNetwork);
    compactMotion.addEventListener('change', syncNetwork);
    motionQuery.addEventListener('change', syncNetwork);
  };
  initNetwork();

  /* ---------- 4. Декоративный маршрут между секциями ----------
     Транспорт ведёт requestAnimationFrame (SMIL-вариант не работал в iOS Safari):
     позиция и наклон считаются по сегментам полилинии, колёса и щётки вращаются по пробегу. */
  const initRoute = () => {
    const route = document.querySelector('.route');
    if (!route) return;
    const vehicles = Array.from(route.querySelectorAll('.route__veh'));
    if (reduceMotion || compactMotion.matches) {
      route.querySelectorAll('.route__dot').forEach((el) => el.remove());
      vehicles.forEach((v) => v.remove());
      return;
    }
    // загораемся остановками, когда маршрут появился
    route.querySelectorAll('.route__stop').forEach((s, i) => {
      s.style.transitionDelay = (300 + i * 260) + 'ms';
    });
    if (!vehicles.length) return;

    const PTS = [[-60, 86], [200, 40], [400, 80], [600, 40], [800, 80], [1060, 54]];
    const segs = [];
    let total = 0;
    for (let i = 1; i < PTS.length; i++) {
      const [x1, y1] = PTS[i - 1], [x2, y2] = PTS[i];
      const len = Math.hypot(x2 - x1, y2 - y1);
      segs.push({ x1, y1, dx: x2 - x1, dy: y2 - y1, len, acc: total });
      total += len;
    }

    const state = vehicles.map((v) => {
      const dur = Math.max(1, parseFloat(v.dataset.dur) || 14);
      const begin = parseFloat(v.dataset.begin) || 0;
      return {
        v,
        durMs: dur * 1000,
        phase: (((begin % dur) + dur) / dur) % 1,
        spins: v.querySelectorAll('.veh-spin')
      };
    });

    let visible = false;
    let routeFrame = null;
    window.__itsRouteVisible = false;
    if ('IntersectionObserver' in window) {
      new IntersectionObserver((entries) => {
        visible = entries[0].isIntersecting;
        window.__itsRouteVisible = visible;
        syncRoute();
      }, { rootMargin: '80px' }).observe(route);
    }

    const tick = (now) => {
      routeFrame = null;
      if (!visible || document.hidden || compactMotion.matches || motionQuery.matches) return;
      window.__itsRt = (window.__itsRt || 0) + 1;
      for (const s of state) {
        const p = ((now / s.durMs) + s.phase) % 1;
        const d = p * total;
        let seg = segs[segs.length - 1];
        for (const g of segs) { if (d >= g.acc && d <= g.acc + g.len) { seg = g; break; } }
        const k = seg.len ? (d - seg.acc) / seg.len : 1;
        const x = seg.x1 + seg.dx * k;
        const y = seg.y1 + seg.dy * k;
        const ang = Math.atan2(seg.dy, seg.dx) * 180 / Math.PI;
        s.v.setAttribute('transform', 'translate(' + x.toFixed(1) + ',' + y.toFixed(1) + ') rotate(' + ang.toFixed(1) + ')');
        const spin = ((d / 22.6) * 360) % 360; // колесо r≈3.6: полный оборот на 2πr
        s.spins.forEach((g) => g.setAttribute('transform', 'rotate(' + spin.toFixed(1) + ')'));
      }
      routeFrame = requestAnimationFrame(tick);
    };
    function syncRoute() {
      if (routeFrame !== null) cancelAnimationFrame(routeFrame);
      routeFrame = null;
      if (visible && !document.hidden && !compactMotion.matches && !motionQuery.matches) routeFrame = requestAnimationFrame(tick);
    }
    document.addEventListener('visibilitychange', syncRoute);
    compactMotion.addEventListener('change', syncRoute);
    motionQuery.addEventListener('change', syncRoute);
  };
  initRoute();

  /* ---------- 4b. Лёгкий параллакс героя (контент вниз, канвас-фон чуть вверх) ---------- */
  const initParallax = () => {
    if (reduceMotion || compactMotion.matches || !hero) return;
    const heroContent = hero.querySelector('.container');
    const heroCanvas = hero.querySelector('.hero__canvas');
    let tickingP = false;
    window.addEventListener('scroll', () => {
      if (tickingP) return;
      tickingP = true;
      requestAnimationFrame(() => {
        if (compactMotion.matches || motionQuery.matches) { tickingP = false; return; }
        const y = window.scrollY;
        const h = hero.offsetHeight || 600;
        if (y < h) {
          heroContent.style.transform = 'translateY(' + (y * 0.12).toFixed(1) + 'px)';
          if (heroCanvas) heroCanvas.style.transform = 'translateY(' + (y * -0.05).toFixed(1) + 'px)';
        }
        tickingP = false;
      });
    }, { passive: true });
  };
  initParallax();

  /* ---------- 5. Свечение за курсором + лёгкий 3D-наклон карточек ---------- */
  if (finePointer && !reduceMotion) {
    document.querySelectorAll('.card, .btn--ghost').forEach((el) => {
      const isCard = el.classList.contains('card');
      el.addEventListener('pointermove', (e) => {
        const r = el.getBoundingClientRect();
        const px = e.clientX - r.left;
        const py = e.clientY - r.top;
        el.style.setProperty('--mx', px + 'px');
        el.style.setProperty('--my', py + 'px');
        if (isCard) { // наклон — только у карточек
          el.style.setProperty('--ry', ((px / r.width) - 0.5) * 3 + 'deg');
          el.style.setProperty('--rx', (0.5 - (py / r.height)) * 3 + 'deg');
        }
      });
      if (isCard) {
        el.addEventListener('pointerleave', () => {
          el.style.setProperty('--rx', '0deg');
          el.style.setProperty('--ry', '0deg');
        });
      }
    });
  }

  /* ---------- 6. Шапка при прокрутке + прогресс-бар ---------- */
  const header = document.querySelector('.header');
  const progress = document.createElement('div');
  progress.className = 'progress';
  progress.setAttribute('aria-hidden', 'true');
  document.body.appendChild(progress);

  let ticking = false;
  const mobileCta = document.querySelector('.mobile-cta');
  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      const y = window.scrollY;
      if (header) header.classList.toggle('is-scrolled', y > 8);
      if (mobileCta) mobileCta.classList.toggle('is-shown', y > 420);
      const max = document.documentElement.scrollHeight - window.innerHeight;
      progress.style.transform = 'scaleX(' + (max > 0 ? Math.min(y / max, 1) : 0) + ')';
      ticking = false;
    });
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* ---------- 7. Светлая / тёмная тема ---------- */
  const THEME_COLORS = { dark: '#15181B', light: '#F4F6F9' };
  const applyTheme = (t) => {
    root.setAttribute('data-theme', t);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', THEME_COLORS[t] || THEME_COLORS.dark);
    window.dispatchEvent(new CustomEvent('its:theme', { detail: { theme: t } }));
  };

  const themeToggle = document.querySelector('.theme-toggle');
  const syncToggleState = (t) => {
    if (themeToggle) themeToggle.setAttribute('aria-pressed', t === 'light' ? 'true' : 'false');
  };
  if (themeToggle) {
    themeToggle.addEventListener('click', () => {
      const next = root.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
      try { localStorage.setItem('its-theme', next); } catch (e) {}
      applyTheme(next);
    });
  }

  // пока пользователь не выбрал тему сам — следуем системной схеме
  const scheme = window.matchMedia('(prefers-color-scheme: light)');
  const onScheme = (e) => {
    let stored = null;
    try { stored = localStorage.getItem('its-theme'); } catch (err) {}
    if (!stored) applyTheme(e.matches ? 'light' : 'dark');
  };
  if (scheme.addEventListener) scheme.addEventListener('change', onScheme);

  // синхронизируем meta theme-color с начальной темой (атрибут уже стоит из inline-скрипта)
  const initialTheme = root.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
  applyTheme(initialTheme);
  syncToggleState(initialTheme);
  window.addEventListener('its:theme', (e) => syncToggleState(e.detail.theme));

  /* ---------- 8. «Отправить коллеге» + тост ---------- */
  const shareBtn = document.querySelector('#share-btn');
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.setAttribute('role', 'status');
  document.body.appendChild(toast);
  let toastTimer = null;
  const showToast = (msg) => {
    toast.textContent = msg;
    toast.classList.add('is-shown');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('is-shown'), 2400);
  };

  if (shareBtn) {
    shareBtn.addEventListener('click', async () => {
      const data = {
        title: document.title,
        text: 'ИТС — цифровая трансформация транспорта. Форум ИТС России 2026.',
        url: location.href
      };
      if (navigator.share) {
        try {
          await navigator.share(data);
          goal('share');
          return; // пользователь поделился
        } catch (e) {
          if (e && e.name === 'AbortError') return; // сам закрыл меню — не навязываемся
          // шаринг не удался (например, окружение без UI) — копируем ссылку
        }
      }
      try {
        await navigator.clipboard.writeText(location.href);
        showToast('Ссылка скопирована — отправьте коллеге');
      } catch (e) {
        showToast(location.href);
      }
    });
  }

  /* ---------- 9. Плавное проявление lazy-изображений ---------- */
  document.querySelectorAll('img[loading="lazy"]').forEach((im) => {
    const done = () => im.classList.add('is-loaded');
    if (im.complete && im.naturalWidth > 0) done();
    else {
      im.addEventListener('load', done, { once: true });
      im.addEventListener('error', done, { once: true });
    }
  });

  /* ---------- 10. Диагностика анимаций: откройте страницу с #debug ---------- */
  if (location.hash === '#debug') {
    const dbg = document.createElement('div');
    dbg.setAttribute('style', 'position:fixed;top:8px;left:8px;z-index:9999;background:rgba(10,12,16,.92);color:#7CFC98;font:11px/1.7 Menlo,Consolas,monospace;padding:10px 12px;border-radius:10px;max-width:88vw;pointer-events:none;white-space:pre;');
    document.body.appendChild(dbg);
    const paint = () => {
      dbg.textContent = [
        'script: v22 (адаптивные эффекты и остановка вне экрана)',
        'reduceMotion: ' + reduceMotion,
        'машинок в DOM: ' + document.querySelectorAll('.route__veh').length,
        'маршрут на экране: ' + (window.__itsRouteVisible === undefined ? '—' : (window.__itsRouteVisible ? 'да' : 'нет')),
        'кадров маршрута: ' + (window.__itsRt || 0) + ' (растёт, когда маршрут на экране)',
        'кадров канваса: ' + (window.__itsCv || 0),
        'SMIL в DOM: ' + document.querySelectorAll('animate,animateMotion,animateTransform').length,
        'rAF за 1с: ' + (window.__itsRafProbe || 0),
        'UA: ' + navigator.userAgent.slice(0, 70)
      ].join('\n');
    };
    // независимый зонд rAF: считает реальные вызовы за секунду
    window.__itsRafProbe = 0;
    const probe = () => { window.__itsRafProbe++; requestAnimationFrame(probe); };
    requestAnimationFrame(probe);
    setInterval(() => { paint(); window.__itsRafProbe = 0; }, 1000);
    paint();
  }
  /* ---------- 11. «Моя программа форума»: звёзды у сессий + экспорт .ics ---------- */
  const STAR_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1.1 5.8-5.3-2.9-5.3 2.9 1.1-5.8-4.3-4.1 5.9-.8z"/></svg>';
  const CAL_SVG = '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" style="fill:currentColor;stroke:none"><path d="M7 2v3M17 2v3M3 9h18M5 5h14a2 2 0 012 2v12a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2z"/></svg>';
  const mineKey = 'its-program-2026';
  let mine = {};
  try { mine = JSON.parse(localStorage.getItem(mineKey) || '{}') || {}; } catch (e) { mine = {}; }

  const mineBtn = document.createElement('button');
  mineBtn.type = 'button';
  mineBtn.className = 'btn btn--ghost';
  mineBtn.hidden = true;
  const mineWrap = document.createElement('div');
  mineWrap.className = 'program__mine';
  mineWrap.appendChild(mineBtn);
  const tabsEl = document.querySelector('.program__tabs');
  if (tabsEl) tabsEl.after(mineWrap);

  // подсказка, пока не отмечено ни одной сессии
  const hint = document.createElement('p');
  hint.className = 'program__hint';
  hint.innerHTML = STAR_SVG + ' Отметьте звёздочкой интересные сессии — и скачайте свою программу форума в календарь';

  const idOf = (day, i) => day + '-' + i;
  const syncMine = () => {
    const n = Object.keys(mine).length;
    mineBtn.hidden = n === 0;
    if (n === 0 && !mineWrap.contains(hint)) mineWrap.appendChild(hint);
    else if (n > 0 && mineWrap.contains(hint)) hint.remove();
    const m10 = n % 10, m100 = n % 100;
    const word = (m10 === 1 && m100 !== 11) ? 'сессия' : (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) ? 'сессии' : 'сессий';
    mineBtn.innerHTML = CAL_SVG + ' Моя программа · ' + n + ' ' + word + ' — в календарь (.ics)';
    try { localStorage.setItem(mineKey, JSON.stringify(mine)); } catch (e) {}
  };

  document.querySelectorAll('.program__day').forEach((day) => {
    day.querySelectorAll('.program__item').forEach((item, i) => {
      if (item.dataset.kind === 'перерыв') return;
      const id = idOf(day.dataset.day, i);
      const star = document.createElement('button');
      star.type = 'button';
      star.className = 'program__star';
      star.title = 'Добавить в мою программу';
      star.setAttribute('aria-pressed', 'false');
      star.innerHTML = STAR_SVG;
      if (mine[id]) { star.classList.add('is-on'); star.setAttribute('aria-pressed', 'true'); }
      star.addEventListener('click', () => {
        const on = star.classList.toggle('is-on');
        star.setAttribute('aria-pressed', on ? 'true' : 'false');
        if (on) mine[id] = true; else delete mine[id];
        syncMine();
      });
      const body = item.querySelector('.program__body');
      if (body) body.appendChild(star);
    });
  });
  syncMine();

  mineBtn.addEventListener('click', () => {
    const pad = (v) => String(v).padStart(2, '0');
    const st = new Date();
    const dtstamp = st.getUTCFullYear() + pad(st.getUTCMonth() + 1) + pad(st.getUTCDate()) +
      'T' + pad(st.getUTCHours()) + pad(st.getUTCMinutes()) + pad(st.getUTCSeconds()) + 'Z';
    const esc = (s) => s.trim().replace(/\\/g, '\\\\').replace(/,/g, '\\,');
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//ITS//Forum ITS Rossii 2026//RU', 'CALSCALE:GREGORIAN'];
    document.querySelectorAll('.program__day').forEach((day) => {
      const dnum = parseInt(day.dataset.day, 10);
      const date = '202609' + (27 + dnum); // день 1 = 28 сентября
      day.querySelectorAll('.program__item').forEach((item, i) => {
        if (!mine[idOf(String(dnum), i)]) return;
        const tm = (item.querySelector('.program__time') || {}).textContent.match(/(\d{1,2}):(\d{2})\s*[–—-]\s*(\d{1,2}):(\d{2})/);
        if (!tm) return;
        const title = (item.querySelector('.program__title') || {}).textContent || 'Сессия форума';
        const hall = (item.querySelector('.program__hall') || {}).textContent || '';
        lines.push(
          'BEGIN:VEVENT',
          'UID:' + date + '-' + i + '@its-forum-2026',
          'DTSTAMP:' + dtstamp,
          'DTSTART:' + date + 'T' + pad(+tm[1]) + tm[2] + '00',
          'DTEND:' + date + 'T' + pad(+tm[3]) + tm[4] + '00',
          'SUMMARY:' + esc(title),
          'LOCATION:' + esc(hall || 'Azimut Отель Олимпик') + ', Москва',
          'DESCRIPTION:Форум «ИТС России 2026» · программа: 2026.itsrussiaforum.ru',
          'END:VEVENT'
        );
      });
    });
    lines.push('END:VCALENDAR');
    const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'ITS-forum-2026-moya-programma.ics';
    document.body.appendChild(a);
    a.click();
    goal('program_ics');
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 800);
    showToast('Календарь скачан — откройте файл на телефоне');
  });

  /* ---------- 12. Цели Метрики по кликам (звонок, визитка, календарь форума) ---------- */
  document.addEventListener('click', (e) => {
    const a = e.target.closest && e.target.closest('a');
    if (!a) return;
    const href = a.getAttribute('href') || '';
    if (href.indexOf('tel:') === 0) goal('call');
    else if (href.slice(-4) === '.vcf') goal('contact_save');
    else if (href.indexOf('forum-2026.ics') !== -1) goal('forum_ics');
  }, true);
})();
