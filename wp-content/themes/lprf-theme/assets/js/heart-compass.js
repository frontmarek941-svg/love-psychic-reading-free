/**
 * Heart Compass: роза з шести пелюсток, дві форми ("я відчуваю" / "я відчуваю, що вони відчувають"),
 * розрив між ними читає AI-голос спеціаліста. Запит іде на window.LPRF_COMPASS.endpoint (Cloudflare Worker),
 * відповідь приходить потоком SSE {"t": "..."}.
 */
(function () {
  'use strict';
  var root = document.getElementById('hc-app');
  var cfgEl = document.getElementById('hc-config');
  if (!root || !cfgEl) return;
  var cfg;
  try { cfg = JSON.parse(cfgEl.textContent); } catch (e) { return; }
  var ENDPOINT = (window.LPRF_COMPASS && window.LPRF_COMPASS.endpoint) || '/api/heart-compass/';
  // Локально Worker працює окремим Node-процесом; на проді маршрут same-origin.
  if (/^(127\.0\.0\.1|localhost)$/.test(location.hostname)) ENDPOINT = 'http://127.0.0.1:8843/api/heart-compass/';

  var DIMS = [
    { k: 'spark', n: 'Spark', h: 'Attraction and excitement' },
    { k: 'trust', n: 'Trust', h: 'Feeling safe to be honest' },
    { k: 'talk', n: 'Talk', h: 'Open, easy conversation' },
    { k: 'timing', n: 'Timing', h: 'Wanting the same pace' },
    { k: 'commitment', n: 'Commitment', h: 'Clarity about where this is going' },
    { k: 'ease', n: 'Ease', h: 'Feels natural, not forced' }
  ];
  var STAGES = [
    { k: 'crush', n: 'Curious about someone', ph: 'e.g. We talk every day, but I cannot tell if it is more than friendship.' },
    { k: 'dating', n: 'Dating', ph: 'e.g. We have been seeing each other for two months and have not defined it.' },
    { k: 'together', n: 'In a relationship', ph: 'e.g. We are happy, but we keep having the same argument about time together.' },
    { k: 'unsure', n: 'On a break or unsure', ph: 'e.g. We are taking space and I do not know what I want to say when we talk.' },
    { k: 'over', n: 'After a breakup', ph: 'e.g. It ended a few weeks ago and I keep replaying the last conversation.' }
  ];
  var R = 118, CX = 0, CY = 0, MAXV = 10;
  var state = { stage: 'dating', reader: cfg.voices[0].slug, you: {}, them: {}, active: 'you', busy: false };
  DIMS.forEach(function (d) { state.you[d.k] = 5; state.them[d.k] = 5; });
  var qs = new URLSearchParams(location.search).get('reader');
  cfg.voices.forEach(function (v) { if (v.slug === qs) state.reader = v.slug; });

  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function svgEl(tag, attrs) { var e = document.createElementNS('http://www.w3.org/2000/svg', tag); for (var k in attrs) e.setAttribute(k, attrs[k]); return e; }
  function ang(i) { return -Math.PI / 2 + i * Math.PI / 3; }
  function pt(i, v) { var r = R * v / MAXV; return [CX + r * Math.cos(ang(i)), CY + r * Math.sin(ang(i))]; }
  function f(n) { return Math.round(n * 10) / 10; }

  // Замкнений сплайн Катмулла-Рома → гладка "пелюсткова" форма.
  function smooth(points) {
    var n = points.length, d = 'M' + f(points[0][0]) + ' ' + f(points[0][1]);
    for (var i = 0; i < n; i++) {
      var p0 = points[(i - 1 + n) % n], p1 = points[i], p2 = points[(i + 1) % n], p3 = points[(i + 2) % n];
      var c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
      var c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
      d += 'C' + f(c1[0]) + ' ' + f(c1[1]) + ' ' + f(c2[0]) + ' ' + f(c2[1]) + ' ' + f(p2[0]) + ' ' + f(p2[1]);
    }
    return d + 'Z';
  }

  // ---------- каркас ----------
  root.textContent = '';
  var app = el('div', 'hc');
  var stage = el('div', 'hc-stage');
  var panel = el('div', 'hc-panel');
  var result = el('div', 'hc-result');
  result.setAttribute('aria-live', 'polite');
  result.hidden = true;
  app.appendChild(stage); app.appendChild(panel); app.appendChild(result);
  root.appendChild(app);

  // ---------- SVG-роза ----------
  var svg = svgEl('svg', { viewBox: '-205 -172 410 344', class: 'hc-rose', role: 'img', 'aria-label': 'Heart Compass rose showing your ratings and how you sense theirs' });
  var defs = svgEl('defs', {});
  defs.innerHTML = '<radialGradient id="hc-glow"><stop offset="0" stop-color="#e58ac8" stop-opacity=".35"/><stop offset="1" stop-color="#e58ac8" stop-opacity="0"/></radialGradient>';
  svg.appendChild(defs);
  svg.appendChild(svgEl('circle', { cx: 0, cy: 0, r: R + 14, fill: 'url(#hc-glow)' }));
  var g = svgEl('g', {});
  svg.appendChild(g);
  for (var ring = 2; ring <= MAXV; ring += 2) {
    var pts = DIMS.map(function (_, i) { return pt(i, ring); });
    g.appendChild(svgEl('path', { d: smooth(pts), class: 'hc-ring' + (ring === MAXV ? ' hc-ring-outer' : '') }));
  }
  DIMS.forEach(function (d, i) {
    var a = pt(i, MAXV);
    g.appendChild(svgEl('line', { x1: 0, y1: 0, x2: f(a[0]), y2: f(a[1]), class: 'hc-axis' }));
    var lp = [CX + (R + 24) * Math.cos(ang(i)), CY + (R + 24) * Math.sin(ang(i))];
    var t = svgEl('text', { x: f(lp[0]), y: f(lp[1] + 4), class: 'hc-label', 'text-anchor': Math.abs(lp[0]) < 4 ? 'middle' : (lp[0] > 0 ? 'start' : 'end') });
    t.textContent = d.n;
    g.appendChild(t);
  });
  var gapRing = svgEl('circle', { r: 11, class: 'hc-gapring', cx: 0, cy: 0, visibility: 'hidden' });
  var shapeThem = svgEl('path', { class: 'hc-shape hc-them' });
  var shapeYou = svgEl('path', { class: 'hc-shape hc-you' });
  g.appendChild(shapeThem); g.appendChild(shapeYou); g.appendChild(gapRing);
  var handles = { you: [], them: [] };
  ['them', 'you'].forEach(function (who) {
    DIMS.forEach(function (d, i) {
      var h = svgEl('circle', { r: 7, class: 'hc-handle hc-h-' + who, 'data-who': who, 'data-i': i });
      g.appendChild(h); handles[who].push(h);
    });
  });
  var heart = svgEl('path', { d: 'M0 7 C-9 -1 -7 -9 0 -4 C7 -9 9 -1 0 7Z', class: 'hc-heart' });
  svg.appendChild(heart);
  stage.appendChild(svg);

  var legend = el('div', 'hc-legend');
  var tabs = {};
  [['you', 'You feel'], ['them', 'You sense they feel']].forEach(function (x) {
    var b = el('button', 'hc-tab hc-tab-' + x[0]); b.type = 'button';
    b.appendChild(el('i', 'hc-dot')); b.appendChild(document.createTextNode(x[1]));
    b.addEventListener('click', function () { state.active = x[0]; syncTabs(); });
    tabs[x[0]] = b; legend.appendChild(b);
  });
  stage.appendChild(legend);
  stage.appendChild(el('p', 'hc-hint', 'Drag the glowing dots on the rose, or use the sliders. Pick which shape you are editing above.'));
  var stats = el('div', 'hc-stats');
  stage.appendChild(stats);

  function syncTabs() {
    for (var w in tabs) { tabs[w].classList.toggle('on', state.active === w); tabs[w].setAttribute('aria-pressed', state.active === w ? 'true' : 'false'); }
    svg.setAttribute('data-active', state.active);
  }

  function analysis() {
    var rows = DIMS.map(function (d, i) { return { i: i, d: d, y: state.you[d.k], t: state.them[d.k], g: Math.abs(state.you[d.k] - state.them[d.k]) }; });
    var widest = rows.slice().sort(function (a, b) { return b.g - a.g; })[0];
    var avg = rows.reduce(function (s, r) { return s + r.g; }, 0) / rows.length;
    var overlap = Math.round(100 - avg * (100 / 9));
    var closest = rows.filter(function (r) { return r !== widest; }).sort(function (a, b) { return a.g - b.g || (b.y + b.t) - (a.y + a.t); })[0];
    return { rows: rows, widest: widest, closest: closest, overlap: Math.max(0, overlap) };
  }

  function draw() {
    shapeYou.setAttribute('d', smooth(DIMS.map(function (d, i) { return pt(i, state.you[d.k]); })));
    shapeThem.setAttribute('d', smooth(DIMS.map(function (d, i) { return pt(i, state.them[d.k]); })));
    ['you', 'them'].forEach(function (w) {
      DIMS.forEach(function (d, i) { var p = pt(i, state[w][d.k]); handles[w][i].setAttribute('cx', f(p[0])); handles[w][i].setAttribute('cy', f(p[1])); });
    });
    var a = analysis();
    if (a.widest.g > 0) {
      var wp = pt(a.widest.i, (a.widest.y + a.widest.t) / 2);
      gapRing.setAttribute('cx', f(wp[0])); gapRing.setAttribute('cy', f(wp[1])); gapRing.setAttribute('visibility', 'visible');
    } else { gapRing.setAttribute('visibility', 'hidden'); }
    stats.textContent = '';
    var s1 = el('div', 'hc-stat'); s1.appendChild(el('b', null, a.overlap + '%')); s1.appendChild(el('span', null, 'overlap of the two shapes'));
    var s2 = el('div', 'hc-stat'); s2.appendChild(el('b', null, a.widest.g ? a.widest.d.n : 'None')); s2.appendChild(el('span', null, a.widest.g ? 'widest gap (' + a.widest.y + ' vs ' + a.widest.t + ')' : 'no gap yet'));
    stats.appendChild(s1); stats.appendChild(s2);
    DIMS.forEach(function (d) {
      ['you', 'them'].forEach(function (w) {
        var inp = inputs[w + d.k]; if (inp) { inp.value = state[w][d.k]; inp.style.setProperty('--p', ((state[w][d.k] - 1) / 9 * 100) + '%'); }
        var out = outs[w + d.k]; if (out) out.textContent = state[w][d.k];
      });
    });
  }

  // Перетягування крапок: проєкція вказівника на вісь.
  var drag = null;
  function toSvg(ev) {
    var pt0 = svg.createSVGPoint(); pt0.x = ev.clientX; pt0.y = ev.clientY;
    var m = svg.getScreenCTM(); return m ? pt0.matrixTransform(m.inverse()) : { x: 0, y: 0 };
  }
  svg.addEventListener('pointerdown', function (ev) {
    var t = ev.target; if (!t.getAttribute || t.getAttribute('data-who') !== state.active) return;
    drag = { i: +t.getAttribute('data-i'), w: t.getAttribute('data-who') };
    try { svg.setPointerCapture(ev.pointerId); } catch (e) { /* ігноруємо */ }
    ev.preventDefault();
  });
  svg.addEventListener('pointermove', function (ev) {
    if (!drag) return;
    var p = toSvg(ev), a = ang(drag.i);
    var proj = p.x * Math.cos(a) + p.y * Math.sin(a);
    var v = Math.max(1, Math.min(MAXV, Math.round(proj / R * MAXV)));
    if (state[drag.w][DIMS[drag.i].k] !== v) { state[drag.w][DIMS[drag.i].k] = v; draw(); }
  });
  function endDrag() { drag = null; }
  svg.addEventListener('pointerup', endDrag); svg.addEventListener('pointercancel', endDrag);

  // ---------- права панель ----------
  var inputs = {}, outs = {};
  function section(n, title, sub) {
    var s = el('section', 'hc-sec'); var h = el('h2', 'hc-h'); h.appendChild(el('span', 'hc-n', String(n))); h.appendChild(document.createTextNode(title));
    s.appendChild(h); if (sub) s.appendChild(el('p', 'hc-sub', sub)); panel.appendChild(s); return s;
  }

  var s1 = section(1, 'Where are you in this story?');
  var stageRow = el('div', 'hc-chips'); stageRow.setAttribute('role', 'radiogroup'); stageRow.setAttribute('aria-label', 'Relationship stage');
  var stageBtns = {};
  STAGES.forEach(function (s) {
    var b = el('button', 'hc-chip', s.n); b.type = 'button'; b.setAttribute('role', 'radio');
    b.addEventListener('click', function () { state.stage = s.k; syncStage(); });
    stageBtns[s.k] = b; stageRow.appendChild(b);
  });
  s1.appendChild(stageRow);

  var s2 = section(2, 'Rate the six petals', 'From 1 (very low) to 10 (very high). Rate how you feel, then how you sense they feel.');
  var list = el('div', 'hc-rows');
  DIMS.forEach(function (d) {
    var row = el('div', 'hc-row');
    var head = el('div', 'hc-rowhead'); head.appendChild(el('strong', null, d.n)); head.appendChild(el('span', null, d.h)); row.appendChild(head);
    [['you', 'You feel'], ['them', 'They feel (your sense)']].forEach(function (x) {
      var line = el('label', 'hc-line hc-line-' + x[0]);
      line.appendChild(el('span', 'hc-who', x[1]));
      var inp = document.createElement('input'); inp.type = 'range'; inp.min = 1; inp.max = 10; inp.step = 1; inp.value = 5;
      inp.setAttribute('aria-label', d.n + ': ' + x[1]);
      inp.addEventListener('input', function () { state[x[0]][d.k] = +inp.value; state.active = x[0]; syncTabs(); draw(); });
      var out = el('output', 'hc-val', '5');
      inputs[x[0] + d.k] = inp; outs[x[0] + d.k] = out;
      line.appendChild(inp); line.appendChild(out); row.appendChild(line);
    });
    list.appendChild(row);
  });
  s2.appendChild(list);

  var s3 = section(3, 'In a sentence (optional)', 'Do not include names or contact details.');
  var note = document.createElement('textarea'); note.className = 'hc-note'; note.maxLength = 300; note.rows = 3;
  note.setAttribute('aria-label', 'Your situation in a sentence');
  var cnt = el('div', 'hc-count', '0 / 300');
  note.addEventListener('input', function () { cnt.textContent = note.value.length + ' / 300'; });
  s3.appendChild(note); s3.appendChild(cnt);

  var s4 = section(4, 'Choose a voice', 'Each voice is an AI-written style inspired by one of our readers.');
  var voices = el('div', 'hc-voices'); voices.setAttribute('role', 'radiogroup'); voices.setAttribute('aria-label', 'Reader voice');
  var voiceBtns = {};
  cfg.voices.forEach(function (v) {
    var b = el('button', 'hc-voice'); b.type = 'button'; b.setAttribute('role', 'radio');
    var im = document.createElement('img'); im.src = v.avatar; im.alt = ''; im.width = 56; im.height = 56; im.loading = 'lazy';
    var tx = el('span', 'hc-vtx'); tx.appendChild(el('b', null, v.name)); tx.appendChild(el('em', null, v.voice));
    b.appendChild(im); b.appendChild(tx);
    b.addEventListener('click', function () { state.reader = v.slug; syncVoice(); });
    voiceBtns[v.slug] = b; voices.appendChild(b);
  });
  s4.appendChild(voices);

  var go = el('button', 'btn btn-primary hc-go', 'Read my compass');
  go.type = 'button'; go.setAttribute('data-nebula-preserve', '1');
  var goWrap = el('div', 'hc-gowrap'); goWrap.appendChild(go);
  goWrap.appendChild(el('p', 'hc-fine', 'AI-written reflection for entertainment. It cannot know what another person feels or predict what will happen.'));
  panel.appendChild(goWrap);

  function syncStage() {
    STAGES.forEach(function (s) { var on = s.k === state.stage; stageBtns[s.k].classList.toggle('on', on); stageBtns[s.k].setAttribute('aria-checked', on ? 'true' : 'false'); if (on) note.placeholder = s.ph; });
  }
  function syncVoice() {
    cfg.voices.forEach(function (v) { var on = v.slug === state.reader; voiceBtns[v.slug].classList.toggle('on', on); voiceBtns[v.slug].setAttribute('aria-checked', on ? 'true' : 'false'); });
  }

  // ---------- відповідь ----------
  function renderReading(text, box) {
    var parts = text.replace(/\r/g, '').split(/\n{2,}/);
    box.textContent = '';
    var first = parts[0] || '';
    var i0 = 0;
    var m = /^\s*THEME:\s*(.*)$/i.exec(first);
    if (m) { var h = el('h3', 'hc-theme', m[1].replace(/\*+/g, '').trim()); box.appendChild(h); i0 = 1; }
    var cls = ['meet', 'gap', 'ask', 'step'];
    var n = 0;
    for (var i = i0; i < parts.length; i++) {
      var p = parts[i].trim(); if (!p) continue;
      var pm = /^\*\*(.+?)\*\*\s*([\s\S]*)$/.exec(p);
      var card = el('div', 'hc-card hc-card-' + (cls[n] || 'step')); n++;
      if (pm) { card.appendChild(el('strong', null, pm[1].replace(/\.$/, ''))); card.appendChild(el('p', null, pm[2].replace(/\*\*/g, ''))); }
      else card.appendChild(el('p', null, p.replace(/\*\*/g, '')));
      box.appendChild(card);
    }
  }

  function showError(msg) {
    result.querySelector('.hc-body').textContent = '';
    var e = el('div', 'hc-error'); e.appendChild(el('p', null, msg));
    var b = el('button', 'btn btn-outline', 'Try again'); b.type = 'button'; b.setAttribute('data-nebula-preserve', '1');
    b.addEventListener('click', function () { runReading(); });
    e.appendChild(b); result.querySelector('.hc-body').appendChild(e);
  }

  function runReading() {
    if (state.busy) return;
    state.busy = true; go.disabled = true; go.textContent = 'Reading the rose…';
    var a = analysis();
    var voice = cfg.voices.filter(function (v) { return v.slug === state.reader; })[0];
    result.hidden = false; result.textContent = '';
    var head = el('div', 'hc-rhead');
    var av = document.createElement('img'); av.src = voice.avatar; av.alt = ''; av.width = 64; av.height = 64;
    var ht = el('div', 'hc-rwho'); ht.appendChild(el('b', null, voice.name + ' (AI reflection)')); ht.appendChild(el('span', null, a.widest.g ? 'Widest gap: ' + a.widest.d.n + ' (' + a.widest.y + ' vs ' + a.widest.t + ')  |  Overlap ' + a.overlap + '%' : 'Your two shapes match  |  Overlap 100%'));
    head.appendChild(av); head.appendChild(ht); result.appendChild(head);
    var body = el('div', 'hc-body'); result.appendChild(body);
    body.appendChild(el('p', 'hc-wait', voice.first + ' is looking at your rose…'));
    result.scrollIntoView({ behavior: 'smooth', block: 'start' });
    var payload = { reader: state.reader, stage: state.stage, you: state.you, them: state.them, note: note.value.trim() };
    var full = '', cut = false, started = false;
    function finish(ok) {
      state.busy = false; go.disabled = false; go.textContent = 'Read my compass again';
      if (!ok) return;
      var foot = el('div', 'hc-foot');
      foot.appendChild(el('p', 'hc-fine', 'AI-written reflection for entertainment. Not a live session and not professional advice. For a personal answer, talk to a real psychic.'));
      var cta = el('a', 'btn btn-primary', 'Get Your Free Reading'); cta.href = cfg.cta_url;
      foot.appendChild(cta);
      var other = el('button', 'btn btn-outline', 'Hear another voice'); other.type = 'button'; other.setAttribute('data-nebula-preserve', '1');
      other.addEventListener('click', function () { var idx = 0; cfg.voices.forEach(function (v, i) { if (v.slug === state.reader) idx = i; }); state.reader = cfg.voices[(idx + 1) % cfg.voices.length].slug; syncVoice(); runReading(); });
      foot.appendChild(other);
      result.appendChild(foot);
    }
    fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }).then(function (res) {
      if (!res.ok) {
        return res.json().catch(function () { return {}; }).then(function (j) { showError(j.error || 'The reading is unavailable right now. Please try again in a moment.'); finish(false); });
      }
      var rd = res.body.getReader(), dec = new TextDecoder(), buf = '';
      function pump() {
        return rd.read().then(function (r) {
          if (r.done) return end();
          buf += dec.decode(r.value, { stream: true });
          var lines = buf.split('\n'); buf = lines.pop();
          for (var i = 0; i < lines.length; i++) {
            var ln = lines[i].trim(); if (ln.indexOf('data:') !== 0) continue;
            var d = ln.slice(5).trim(); if (d === '[DONE]') return end();
            try { var j = JSON.parse(d); if (typeof j.t === 'string') full += j.t; if (j.cut) cut = true; } catch (e) { /* неповний рядок */ }
          }
          if (full) { started = true; renderReading(full, body); }
          return pump();
        });
      }
      function end() {
        if (!started || cut) { showError(cut ? 'This reading was cut short. Please try again for a complete one.' : 'The reading is unavailable right now. Please try again in a moment.'); finish(false); return; }
        renderReading(full, body); finish(true);
      }
      return pump();
    }).catch(function () { showError('Could not reach the reading service. Please try again in a moment.'); finish(false); });
  }
  go.addEventListener('click', runReading);

  syncTabs(); syncStage(); syncVoice(); draw();
})();
