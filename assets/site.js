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
    var x = 0, y = 0, cx = 0, cy = 0, vivo = false;
    window.addEventListener('pointermove', function (e) {
      x = e.clientX; y = e.clientY;
      if (!vivo) { vivo = true; cx = x; cy = y; ring.classList.add('on'); requestAnimationFrame(segue); }
      ring.classList.toggle('link', !!(e.target.closest && e.target.closest('a, button, summary, input, .tab')));
      ring.classList.toggle('claro', !!(e.target.closest && e.target.closest('.light')));
    }, { passive: true });
    document.addEventListener('pointerleave', function () { ring.classList.remove('on'); vivo = false; });
    function segue() {
      cx += (x - cx) * .2; cy += (y - cy) * .2;
      ring.style.transform = 'translate3d(' + cx + 'px,' + cy + 'px,0)';
      if (vivo) requestAnimationFrame(segue);
    }
  }

  /* rodapé: os pontos do nome acendem em verde perto do cursor */
  var mx = $('.foot__matrix');
  if (mx) {
    mx.addEventListener('pointermove', function (e) {
      var r = mx.getBoundingClientRect();
      mx.style.setProperty('--mx', (e.clientX - r.left) + 'px'); mx.style.setProperty('--my', (e.clientY - r.top) + 'px');
      mx.classList.add('on');
    });
    mx.addEventListener('pointerleave', function () { mx.classList.remove('on'); });
  }

  var ano = $('#ano'); if (ano) ano.textContent = new Date().getFullYear();
  var clock = $('#relogio');
  if (clock) {
    var fmt = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Fortaleza', hour: '2-digit', minute: '2-digit' });
    (function t() { clock.textContent = fmt.format(new Date()); setTimeout(t, 15000); })();
  }
})();
