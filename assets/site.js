/* Comportamentos compartilhados do site: ícones de pontos, entradas ao rolar, barra de progresso, cursor e rodapé. */
(function () {
  var doc = document.documentElement;
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
  window.site = { $: $, $$: $$, reduce: reduce };

  /* ícones de pontos dos rótulos */
  $$('.dmx').forEach(function (el) {
    var order = [0, 1, 2, 5, 8, 7, 6, 3, 4], h = '';
    for (var i = 0; i < 9; i++) h += '<i style="--k:' + order.indexOf(i) + '"></i>';
    el.innerHTML = h;
  });

  /* títulos: cada palavra entra saindo do desfoque */
  function fatia(el, cls, attr) {
    var n = 0;
    (function walk(node) {
      Array.prototype.slice.call(node.childNodes).forEach(function (c) {
        if (c.nodeType === 3) {
          var f = document.createDocumentFragment();
          c.textContent.split(/(\s+)/).forEach(function (p) {
            if (!p) return;
            if (/^\s+$/.test(p)) { f.appendChild(document.createTextNode(' ')); return; }
            var s = document.createElement('span'); s.className = cls; s.style.setProperty(attr, n++); s.textContent = p; f.appendChild(s);
          });
          node.replaceChild(f, c);
        } else if (c.nodeType === 1) walk(c);
      });
    })(el);
    return n;
  }
  window.site.fatia = fatia;
  $$('[data-words]').forEach(function (el) { fatia(el, 'w', '--n'); });

  var io = new IntersectionObserver(function (es) {
    es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
  }, { threshold: .12, rootMargin: '0px 0px -5% 0px' });
  $$('.reveal, [data-words]').forEach(function (el) { io.observe(el); });

  /* números que contam até o valor */
  var ioN = new IntersectionObserver(function (es) {
    es.forEach(function (e) {
      if (!e.isIntersecting) return; ioN.unobserve(e.target);
      var el = e.target, fim = +el.dataset.count, t0 = null;
      if (reduce) { el.textContent = fim; return; }
      (function passo(t) {
        if (t0 === null) t0 = t;
        var p = Math.min(1, (t - t0) / 1300), v = Math.round(fim * (1 - Math.pow(1 - p, 3)));
        el.textContent = v; if (p < 1) requestAnimationFrame(passo);
      })(performance.now());
    });
  }, { threshold: .6 });
  $$('[data-count]').forEach(function (el) { ioN.observe(el); });

  /* barra de progresso + ganchos de rolagem das páginas */
  var bar = $('.progress span'), ganchos = [];
  window.site.aoRolar = function (fn) { ganchos.push(fn); };
  var tick = false;
  function rolar() {
    tick = false;
    var vh = window.innerHeight, max = document.documentElement.scrollHeight - vh;
    if (bar) bar.style.transform = 'scaleX(' + (max > 0 ? window.scrollY / max : 0) + ')';
    ganchos.forEach(function (fn) { fn(vh); });
  }
  window.addEventListener('scroll', function () { if (!tick) { tick = true; requestAnimationFrame(rolar); } }, { passive: true });
  window.addEventListener('resize', rolar);
  window.addEventListener('load', rolar);
  setTimeout(rolar, 0);

  /* cursor: anel que segue o mouse com atraso e cresce sobre links e botões */
  var ring = $('.cur-ring');
  if (ring && !reduce && window.matchMedia('(hover: hover)').matches) {
    var glow = document.createElement('div'); glow.className = 'cur-glow'; glow.setAttribute('aria-hidden', 'true'); document.body.appendChild(glow);
    var x = 0, y = 0, cx = 0, cy = 0, gx = 0, gy = 0, vivo = false;
    window.addEventListener('pointermove', function (e) {
      x = e.clientX; y = e.clientY;
      if (!vivo) { vivo = true; cx = gx = x; cy = gy = y; ring.classList.add('on'); glow.classList.add('on'); requestAnimationFrame(segue); }
      ring.classList.toggle('link', !!(e.target.closest && e.target.closest('a, button, summary, input, .tab')));
      var claro = !!(e.target.closest && e.target.closest('.light'));
      ring.classList.toggle('claro', claro); glow.classList.toggle('claro', claro);
    }, { passive: true });
    document.addEventListener('pointerleave', function () { ring.classList.remove('on'); glow.classList.remove('on'); vivo = false; });
    function segue() {
      cx += (x - cx) * .2; cy += (y - cy) * .2;
      ring.style.transform = 'translate3d(' + cx + 'px,' + cy + 'px,0)';
      gx += (x - gx) * .1; gy += (y - gy) * .1;
      glow.style.transform = 'translate3d(' + gx + 'px,' + gy + 'px,0)';
      if (vivo) requestAnimationFrame(segue);
    }
  }

  /* rodapé: o nome em pontos. Os pontos cintilam em verde ao acaso e acendem perto do cursor. */
  (function () {
    var mx = $('.foot__matrix'); if (!mx) return;
    var cv = document.createElement('canvas'), ctx = cv.getContext && cv.getContext('2d'); if (!ctx) return;
    var pts = [], W = 0, H = 0, dpr = 1, passo = 7, raio = 1.15, px = -9999, py = -9999, forca = 0, alvo = 0, visto = false, rodando = false, t0 = 0, parado = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    function monta() {
      var r = mx.getBoundingClientRect(), cs = getComputedStyle(mx); if (!r.width) return;
      W = Math.round(r.width); H = Math.round(r.height); dpr = Math.min(2, window.devicePixelRatio || 1);
      passo = W < 620 ? 4 : 7; raio = W < 620 ? .75 : 1.15;
      cv.width = W * dpr; cv.height = H * dpr;
      var tmp = document.createElement('canvas'); tmp.width = W; tmp.height = H;
      var c = tmp.getContext('2d'), fs = parseFloat(cs.fontSize), txt = (mx.getAttribute('data-t') || mx.textContent).toUpperCase();
      c.font = cs.fontWeight + ' ' + fs + 'px ' + cs.fontFamily; c.textBaseline = 'alphabetic'; c.fillStyle = '#000';
      var esp = -.03 * fs, larg = 0, i; for (i = 0; i < txt.length; i++) larg += c.measureText(txt[i]).width + esp; larg -= esp;
      var mt = c.measureText('H'), cap = mt.actualBoundingBoxAscent || fs * .7, sobe = cap + fs * .2, desce = fs * .2, x = (W - larg) / 2, base = Math.round((H - sobe - desce) / 2 + sobe);   // centra contando acento e cedilha
      for (i = 0; i < txt.length; i++) { c.fillText(txt[i], x, base); x += c.measureText(txt[i]).width + esp; }
      var d = c.getImageData(0, 0, W, H).data; pts = [];
      for (var gy = passo / 2; gy < H; gy += passo) for (var gx = passo / 2; gx < W; gx += passo) {
        if (d[((gy | 0) * W + (gx | 0)) * 4 + 3] > 120) pts.push({ x: gx, y: gy, prox: 1 + Math.random() * 9, dur: .7 + Math.random() * 1.1, ini: -9, pico: .55 + Math.random() * .45 });
      }
      if (!mx.classList.contains('vivo')) { mx.appendChild(cv); mx.classList.add('vivo'); }
      desenha(performance.now() / 1000);
    }
    function desenha(t) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
      var i, p, n = pts.length, R = Math.max(150, W * .16);
      ctx.fillStyle = 'rgba(245,245,243,.2)'; ctx.beginPath();
      for (i = 0; i < n; i++) { p = pts[i]; ctx.moveTo(p.x + raio, p.y); ctx.arc(p.x, p.y, raio, 0, 6.2832); }
      ctx.fill();
      for (i = 0; i < n; i++) {
        p = pts[i]; var a = 0;
        if (!parado) {
          if (t > p.prox) { p.ini = t; p.prox = t + p.dur + 2.5 + Math.random() * 11; }
          var k = (t - p.ini) / p.dur; if (k >= 0 && k <= 1) a = Math.sin(k * Math.PI) * p.pico;
        }
        if (forca > .01) { var dx = p.x - px, dy = p.y - py, q = 1 - Math.sqrt(dx * dx + dy * dy) / R; if (q > 0) a = Math.max(a, q * q * (3 - 2 * q) * forca); }
        if (a < .03) continue;
        ctx.fillStyle = 'rgba(211,234,85,' + Math.min(1, a) + ')'; ctx.beginPath(); ctx.arc(p.x, p.y, raio * (1 + a * .75), 0, 6.2832); ctx.fill();
      }
    }
    function quadro(ms) {
      var t = ms / 1000; forca += (alvo - forca) * .12; desenha(t);
      if (visto && !document.hidden && (!parado || alvo > 0 || forca > .01)) requestAnimationFrame(quadro); else rodando = false;
    }
    function liga() { if (!rodando && visto) { rodando = true; requestAnimationFrame(quadro); } }
    function onda() {   // ao entrar na tela, uma onda acende o nome da esquerda para a direita
      var t = performance.now() / 1000; pts.forEach(function (p) { p.prox = t + .15 + (p.x / W) * 1.1 + Math.random() * .25; });
    }
    (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(function () {
      monta();
      var tr; window.addEventListener('resize', function () { clearTimeout(tr); tr = setTimeout(monta, 180); });
      if ('IntersectionObserver' in window) new IntersectionObserver(function (es) {
        var era = visto; visto = es[0].isIntersecting; if (visto && !era && !parado) onda(); if (visto && !parado) liga();
      }, { threshold: .15 }).observe(mx); else { visto = true; if (!parado) liga(); }
      document.addEventListener('visibilitychange', function () { if (!document.hidden && !parado) liga(); });
      mx.addEventListener('pointermove', function (e) { var r = mx.getBoundingClientRect(); px = e.clientX - r.left; py = e.clientY - r.top; alvo = 1; liga(); }, { passive: true });
      mx.addEventListener('pointerleave', function () { alvo = 0; });
    });
  })();

  var ano = $('#ano'); if (ano) ano.textContent = new Date().getFullYear();
  var clocks = $$('#relogio, [data-relogio]');
  if (clocks.length) {
    var fmt = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Fortaleza', hour: '2-digit', minute: '2-digit' });
    (function t() { var agora = fmt.format(new Date()); clocks.forEach(function (c) { c.textContent = agora; }); setTimeout(t, 15000); })();
  }
})();
