// VEDAOS film component: prajna — the Prajna (Mastery Mode) card / running panel (S40–S74, S96 UI).
//
// draw(ctx, t, o)  paints the Prajna card inside o.rect (window units, w 300, h 65 idle → 343 running).
//   t is local run time in seconds: t < 0 → idle card ("Ready · No active mastery run"), 0..dur → the
//   mastery run, > dur → done ("✓ 12 / 12", mastery 0.91).
//   The run: a short curriculum build (12 rows cascade in) → 12 nodes foundational → advanced, each pass
//   going RESEARCH → EMBED → VERIFY (live blackboard cards, a replace-sweep as each stage posts), its
//   mastery = coverage × depth × saturation × competency converging live in the meter (tick at 0.85).
//   The `rerun` node's first pass lands at 0.79 < 0.85: it flashes brick, re-runs (+3 sources, gap
//   re-query) and passes at 0.88. Final node scores average 0.91 (the last node also reads 0.91).
//   Layout adapts to the card height: the compact card (header + one status line) cross-fades into the
//   full panel as `open` rises. The panel body is laid out for 343 and anchored to the card's bottom edge
//   (the card grows upward in the app), so it stays still while the rising header uncovers it.
// demo(ctx, t, o)  reference choreography: grows 65 → 343 at t 0.05–0.45, runs, holds, folds back.
//
// Pure function of t: everything derives from (t, o); static data is built once at load.
(function () {
  'use strict';
  const V = window.V;
  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const lerp = (a, b, k) => a + (b - a) * k;
  const prog = (t, a, b) => (b <= a ? (t >= b ? 1 : 0) : clamp((t - a) / (b - a)));
  const smooth = (x) => { x = clamp(x); return x * x * (3 - 2 * x); };
  const outCubic = (x) => 1 - Math.pow(1 - clamp(x), 3);
  const inOutCubic = (x) => { x = clamp(x); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
  const outBack = (x) => { x = clamp(x); const c1 = 1.9, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };
  const TAU = Math.PI * 2;

  const MIN_H = 65, MAX_H = 343, THRESH = 0.85, PAD = 14;

  // ------------------------------------------------------------------ curriculum (Bitcoin, verified live run S40)
  const NODES = [
    'Money & ledgers', 'Hash functions', 'Public-key cryptography', 'Transactions & UTXOs',
    'Blocks & the chain', 'Proof of work', 'Mining economics', 'Difficulty adjustment',
    'Nodes & consensus', 'Lightning & scaling', 'Security & attacks', 'Monetary policy & halving',
  ];
  // per node: mastery factors [coverage, depth, saturation, competency] (product = node score),
  // research card topic + source count, embedded chunks, competency questions.
  const DATA = [
    { f: [0.98, 0.96, 0.99, 0.99], src: 4, topic: 'ledgers & trust', chunks: 34, q: 6 },
    { f: [0.99, 0.98, 0.99, 0.98], src: 4, topic: 'SHA-256 avalanche', chunks: 41, q: 6 },
    { f: [0.97, 0.95, 0.99, 0.99], src: 5, topic: 'ECDSA on secp256k1', chunks: 52, q: 8 },
    { f: [0.96, 0.96, 0.98, 0.99], src: 6, topic: 'the UTXO model', chunks: 47, q: 7 },
    { f: [0.98, 0.98, 0.99, 0.98], src: 4, topic: 'Merkle roots', chunks: 39, q: 6 },
    { f: [0.97, 0.95, 0.98, 0.97], src: 5, topic: 'nonce search', chunks: 44, q: 7,
      fail: [0.91, 0.94, 0.97, 0.95], reTopic: 'difficulty target', reChunks: 18 },
    { f: [0.98, 0.96, 0.99, 0.99], src: 5, topic: 'fees & block subsidy', chunks: 37, q: 6 },
    { f: [0.96, 0.97, 0.98, 0.99], src: 4, topic: '2016-block retarget', chunks: 33, q: 5 },
    { f: [0.98, 0.96, 0.99, 0.98], src: 6, topic: 'most-work chain', chunks: 49, q: 7 },
    { f: [0.95, 0.97, 0.98, 0.99], src: 5, topic: 'payment channels', chunks: 45, q: 6 },
    { f: [0.98, 0.98, 0.98, 0.98], src: 6, topic: '51% & double-spend', chunks: 56, q: 8 },
    { f: [0.97, 0.96, 0.99, 0.99], src: 4, topic: '21M cap & halvings', chunks: 31, q: 6 },
  ];
  const prod = (f) => f[0] * f[1] * f[2] * f[3];
  const r2 = (x) => Math.round(x * 100) / 100;
  // a first pass that lands at ~0.79: competency and coverage short of the bar
  function failFactors(f) {
    const d = r2(f[1] - 0.01), s = r2(f[2] - 0.01), k = r2(f[3] - 0.02);
    return [r2(clamp(0.79 / (d * s * k), 0.5, 0.99)), d, s, k];
  }
  function normNode(n, i) {
    const base = DATA[i % DATA.length];
    const title = typeof n === 'string' ? n : (n && n.title) || `Node ${i + 1}`;
    const d = Object.assign({}, base, typeof n === 'object' && n ? n : {});
    d.title = title;
    // a custom title without its own research topic: the card names the node itself
    if (title !== NODES[i] && !(n && n.topic)) d.topic = title.toLowerCase();
    if (n && n.score != null && !(n && n.f)) { // scale the base factors to hit a requested score
      const k = Math.pow(clamp(+n.score, 0.5, 0.999) / prod(base.f), 0.25);
      d.f = base.f.map((x) => Math.min(0.999, x * k));
    }
    if (!d.fail || (n && n.f && !n.fail)) d.fail = failFactors(d.f);
    d.score = prod(d.f);
    d.failScore = prod(d.fail);
    d.reTopic = d.reTopic || 'filling gaps';
    d.reChunks = d.reChunks || 16;
    return d;
  }
  const DEFAULT_DATA = NODES.map(normNode);
  const IDX = Array.from({ length: 99 }, (_, i) => String(i + 1).padStart(2, '0'));

  // ------------------------------------------------------------------ colour (theme tokens, parsed once)
  function parseCol(s) {
    if (s[0] === '#') { const c = V.hexRGB(s); return [c[0], c[1], c[2], 1]; }
    const m = s.match(/[\d.]+/g).map(Number);
    return [m[0], m[1], m[2], m.length > 3 ? m[3] : 1];
  }
  const KEYS = ['bg', 'text', 'muted', 'faint', 'line', 'glass', 'glassHi', 'accent', 'success', 'fail'];
  function palette(th) {
    const p = {};
    for (const k of KEYS) p[k] = parseCol(th[k]);
    return p;
  }
  const PAL = {};
  for (const k of Object.keys(V.THEMES)) PAL[k] = palette(V.THEMES[k]);
  const css = (c, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${+(c[3] * a).toFixed(4)})`;

  // ------------------------------------------------------------------ run plan (pure function of dur/n/rerun)
  const ST = [0, 0.42, 0.7];            // stage starts within a pass: RESEARCH, EMBED, VERIFY
  const STAGE = ['RESEARCH', 'EMBED', 'VERIFY'];
  const RE_FRAC = 0.8;                   // a re-run pass is a little quicker (only the gaps are researched)
  function plan(dur, n, rerun) {
    dur = Math.max(0.6, +dur || 8);
    const T0 = clamp(dur * 0.065, 0.07, 0.6);                 // curriculum build
    const tail = clamp(dur * 0.04, 0.04, 0.4);                // settle on "12 / 12" inside dur
    const has = rerun >= 0 && rerun < n;
    const hold = has ? clamp(dur * 0.06, 0.24, 0.6) : 0;     // the below-threshold flash, readable even at 1.5 s
    const u = Math.max(0.02, (dur - T0 - tail - hold) / (n + (has ? RE_FRAC : 0)));
    const segs = [];
    let s = T0, holdS = -1, holdE = -1;
    for (let i = 0; i < n; i++) {
      const failing = has && i === rerun;
      segs.push({ node: i, pass: failing ? 1 : 0, s, e: s + u, u });
      s += u;
      if (failing) {
        holdS = s; s += hold; holdE = s;
        segs.push({ node: i, pass: 2, s, e: s + u * RE_FRAC, u: u * RE_FRAC });
        s += u * RE_FRAC;
      }
    }
    return { dur, T0, u, hold, holdS, holdE, segs, end: s, n, rerun: has ? rerun : -1 };
  }
  // index of the pass running at t (the failing pass during the hold; last pass after the end; -1 before)
  function segAt(P, t) {
    if (t < P.T0) return -1;
    const S = P.segs;
    for (let i = S.length - 1; i >= 0; i--) if (t >= S[i].s) return i;
    return -1;
  }
  const targetF = (D, seg) => (seg.pass === 1 ? D[seg.node].fail : D[seg.node].f);
  // displayed factors + product at t: each factor converges during its stage, from the previous pass's value
  const FW = [[0.04, 0.42], [0.2, 0.62], [0.42, 0.72], [0.7, 0.97]];
  const FW0 = [[0.04, 0.62], [0.14, 0.72], [0.3, 0.84], [0.5, 0.97]]; // first node: count up from nothing
  function factorsAt(P, D, t) {
    const c = segAt(P, t);
    if (c < 0) return { f: null, M: null, c };
    const seg = P.segs[c], p = prog(t, seg.s, seg.e);
    const tgt = targetF(D, seg);
    const prev = c > 0 ? targetF(D, P.segs[c - 1]) : null;
    const f = [], def = [];
    for (let j = 0; j < 4; j++) {
      const w = prev ? FW[j] : FW0[j];
      const k = prog(p, w[0], w[1]);
      f.push(prev ? lerp(prev[j], tgt[j], inOutCubic(k)) : tgt[j] * outCubic(k));
      def.push(!!prev || p > w[0]);
    }
    const all = def[0] && def[1] && def[2] && def[3];
    return { f, def, M: all ? prod(f) : null, c, p };
  }

  // ------------------------------------------------------------------ text helpers
  const CAP = 0.727; // Inter cap height / em
  function tracked(ctx, s, x, y, font, color, track, align = 'left') {
    ctx.font = font;
    ctx.letterSpacing = track + 'px';
    const w = ctx.measureText(s).width - track;
    ctx.textAlign = 'left';
    ctx.fillStyle = color;
    ctx.fillText(s, align === 'right' ? x - w : align === 'center' ? x - w / 2 : x, y);
    ctx.letterSpacing = '0px';
    return w;
  }
  function trackedW(ctx, s, font, track) {
    ctx.font = font; ctx.letterSpacing = track + 'px';
    const w = ctx.measureText(s).width - track;
    ctx.letterSpacing = '0px';
    return w;
  }
  // tabular figures: each digit centred in a '0'-wide cell (canvas has no font-variant-numeric)
  function tnumW(ctx, s, font) {
    ctx.font = font;
    const dw = ctx.measureText('0').width;
    let w = 0;
    for (const ch of s) w += ch >= '0' && ch <= '9' ? dw : ctx.measureText(ch).width;
    return w;
  }
  function tnum(ctx, s, x, y, font, color, align = 'left') {
    ctx.font = font;
    const dw = ctx.measureText('0').width;
    let w = 0;
    const ws = [];
    for (const ch of s) { const cw = ch >= '0' && ch <= '9' ? dw : ctx.measureText(ch).width; ws.push(cw); w += cw; }
    let cx = align === 'right' ? x - w : align === 'center' ? x - w / 2 : x;
    ctx.fillStyle = color;
    let i = 0;
    if (s.length > 2 && s[0] === '0' && s[1] === '.') { // "0." is the same in every cell layout: one call
      ctx.textAlign = 'left'; ctx.fillText('0.', cx, y); cx += ws[0] + ws[1]; i = 2;
    }
    ctx.textAlign = 'center';
    for (; i < s.length; i++) { ctx.fillText(s[i], cx + ws[i] / 2, y); cx += ws[i]; }
    return w;
  }
  function plain(ctx, s, x, y, font, color, align = 'left') {
    ctx.font = font; ctx.fillStyle = color; ctx.textAlign = align; ctx.fillText(s, x, y);
  }
  function ellipsize(ctx, s, maxW) {
    if (ctx.measureText(s).width <= maxW) return s;
    let lo = 0, hi = s.length;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (ctx.measureText(s.slice(0, mid).trimEnd() + '…').width <= maxW) lo = mid; else hi = mid - 1; }
    return s.slice(0, lo).trimEnd() + '…';
  }
  // one fillText with a horizontal alpha ramp ending at `edge`: visible left of it (or right of it if inverse)
  function sweep(ctx, s, x, y, col, a, edge, feather, inverse) {
    const g = ctx.createLinearGradient(edge - feather, 0, edge, 0);
    g.addColorStop(0, css(col, inverse ? 0 : a)); g.addColorStop(1, css(col, inverse ? a : 0));
    ctx.fillStyle = g; ctx.textAlign = 'left'; ctx.fillText(s, x, y);
  }
  const f2 = (x) => (x == null ? '—' : clamp(x, 0, 0.999).toFixed(2));

  // ------------------------------------------------------------------ glyphs
  function check(ctx, x, y, s, col, lw, k = 1) {
    if (k <= 0) return;
    const q = s * k;
    ctx.strokeStyle = col; ctx.lineWidth = lw * k; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(x - q * 0.46, y + q * 0.02); ctx.lineTo(x - q * 0.13, y + q * 0.33); ctx.lineTo(x + q * 0.48, y - q * 0.33); ctx.stroke();
  }
  function dot(ctx, x, y, r, col) { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fillStyle = col; ctx.fill(); }
  function ringAt(ctx, x, y, r, col, lw) { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.stroke(); }
  // live node: accent core + one expanding ring (no glow)
  function pulse(ctx, x, y, t, pal, a, r = 3) {
    const ph = (((t / 1.15) % 1) + 1) % 1;
    const e = outCubic(ph);
    ctx.globalAlpha = a * 0.55 * (1 - ph) * (1 - ph);
    ringAt(ctx, x, y, r + 4.8 * e, css(pal.accent), 1);
    ctx.globalAlpha = a;
    dot(ctx, x, y, r, css(pal.accent));
  }
  function spinner(ctx, x, y, t, col, r = 3.6) {
    const a0 = t * TAU * 1.25;
    ctx.beginPath(); ctx.arc(x, y, r, a0, a0 + TAU * 0.72);
    ctx.strokeStyle = col; ctx.lineWidth = 1.25; ctx.lineCap = 'round'; ctx.stroke();
  }
  function chip(ctx, label, x, cy, fontPx, fg, bg) {
    const font = V.ui(fontPx, 680);
    const w = trackedW(ctx, label, font, 0.7);
    const h = Math.round(fontPx + 5.5), px = 5;
    V.rr(ctx, x, cy - h / 2, w + px * 2, h, h / 2); ctx.fillStyle = bg; ctx.fill();
    tracked(ctx, label, x + px, cy + (fontPx * CAP) / 2, font, fg, 0.7);
    return w + px * 2;
  }

  // Standalone glass card. Over the flat app background the glass is pre-composited to opaque fills
  // (one body fill + a hairline of thin rects and corner arcs) — no full-area overdraw.
  const over = (c, u) => [0, 1, 2].map((i) => u[i] + (c[i] - u[i]) * c[3]);
  const rgb = (c) => `rgb(${c[0].toFixed(1)},${c[1].toFixed(1)},${c[2].toFixed(1)})`;
  function glassCard(ctx, x, y, w, h, th, pal, A0) {
    if (A0 < 0.999) { V.glass(ctx, x, y, w, h, 14, th, 1); return; }
    const g = over(pal.glass, pal.bg), l = rgb(over(pal.line, g)), R = 14;
    // one area fill for the body; the hairline is four 1-unit rects + four small corner arcs
    V.rr(ctx, x, y, w, h, R); ctx.fillStyle = rgb(g); ctx.fill();
    ctx.fillStyle = l;
    ctx.fillRect(x + R, y, w - 2 * R, 1); ctx.fillRect(x + R, y + h - 1, w - 2 * R, 1);
    ctx.fillRect(x, y + R, 1, h - 2 * R); ctx.fillRect(x + w - 1, y + R, 1, h - 2 * R);
    ctx.strokeStyle = l; ctx.lineWidth = 1; ctx.lineCap = 'butt';
    const q = Math.PI / 2, rr = R - 0.5;
    ctx.beginPath();
    ctx.arc(x + R, y + R, rr, 2 * q, 3 * q);
    ctx.moveTo(x + w - R, y + 0.5); ctx.arc(x + w - R, y + R, rr, 3 * q, 4 * q);
    ctx.moveTo(x + w - 0.5, y + h - R); ctx.arc(x + w - R, y + h - R, rr, 0, q);
    ctx.moveTo(x + R, y + h - 0.5); ctx.arc(x + R, y + h - R, rr, q, 2 * q);
    ctx.stroke();
  }

  // ------------------------------------------------------------------ layout (window units, relative to rect)
  const L = {
    headY: 25,
    rowY0: 48, rowDY: 13.0,            // 12 curriculum rows: centres 48 … 191
    boardY: 205, cardH: 20, cardDY: 24, // 3 blackboard cards: 205 … 273
    meterY: 290,                        // factor labels baseline; values +15.5; bar +23; tick label +39
  };

  // ------------------------------------------------------------------ draw
  function draw(ctx, t, o) {
    o = o || {};
    t -= +o.start || 0;
    const th = V.theme(o.theme || 'dark');
    const pal = PAL[th.name] && V.THEMES[th.name] === th ? PAL[th.name] : palette(th);
    const r = o.rect || { x: 0, y: 0, w: 300, h: MAX_H };
    const X0 = r.x, Y0 = r.y, W = r.w, H = r.h;
    const X = X0 + PAD, R = X0 + W - PAD, CW = W - PAD * 2;
    const subject = o.subject != null ? String(o.subject) : 'Bitcoin';
    const D = Array.isArray(o.nodes) && o.nodes.length ? o.nodes.map(normNode) : DEFAULT_DATA;
    const n = D.length;
    const rerun = o.rerun == null ? 5 : Math.round(+o.rerun);
    const P = plan(o.dur == null ? 8 : +o.dur, n, rerun);
    const open = o.open != null ? clamp(+o.open) : clamp((H - MIN_H) / (MAX_H - MIN_H));
    const phase = t < 0 ? 'idle' : t < P.T0 ? 'build' : t < P.end ? 'run' : 'done';
    const c = segAt(P, t);
    const seg = c >= 0 ? P.segs[c] : null;
    const inHold = P.rerun >= 0 && t >= P.holdS && t < P.holdE;
    const FX = factorsAt(P, D, t);

    ctx.save();
    const A0 = ctx.globalAlpha;
    ctx.globalCompositeOperation = 'source-over';
    ctx.filter = 'none';
    ctx.textBaseline = 'alphabetic';
    ctx.lineCap = 'butt';
    // never inherit the caller's text/line state
    ctx.letterSpacing = '0px'; ctx.wordSpacing = '0px'; ctx.direction = 'ltr'; ctx.setLineDash([]);

    if (o.card) glassCard(ctx, X0, Y0, W, H, th, pal, A0);
    ctx.beginPath(); ctx.rect(X0, Y0, W, H); ctx.clip();

    // ---- node status helpers (sequential passes → everything before the current pass is done)
    const nodeOf = (i) => {
      if (phase === 'idle' || phase === 'build') return { st: 'pending' };
      if (phase === 'done') return { st: 'done', at: lastEnd(i) };
      const cur = seg.node;
      if (i < cur) return { st: 'done', at: lastEnd(i) };
      if (i > cur) return { st: 'pending' };
      if (inHold) return { st: 'fail' };
      if (t >= seg.e) return { st: 'done', at: seg.e };
      return { st: 'active', pass: seg.pass };
    };
    function lastEnd(i) { let e = 0; for (const s of P.segs) if (s.node === i) e = s.e; return e; }
    const liveM = FX.M;

    // ================================================================ header (shared by compact + full)
    const hb = Y0 + L.headY;
    ctx.globalAlpha = A0;
    const hw = tracked(ctx, 'PRAJNA', X, hb, V.ui(12, 600), th.muted, 1.2);
    const running = phase !== 'idle';
    if (running) {
      ctx.font = V.ui(12.5, 560);
      const sub = ellipsize(ctx, subject, CW - hw - 100);
      ctx.fillStyle = th.text; ctx.textAlign = 'left';
      ctx.globalAlpha = A0 * smooth(prog(t, 0, 0.12));
      ctx.fillText(sub, X + hw + 9, hb);
      ctx.globalAlpha = A0;
    }
    // right side: Ready / Building / Node k of N / ✓ N of N
    {
      const font = V.ui(11, 500);
      if (phase === 'idle') {
        ctx.font = font; ctx.fillStyle = th.muted; ctx.textAlign = 'right';
        ctx.fillText('Ready', R, hb);
        const w = ctx.measureText('Ready').width;
        ctx.globalAlpha = A0 * 0.9;
        ringAt(ctx, R - w - 7, hb - 4, 2.6, th.muted, 1.1);
        ctx.globalAlpha = A0;
      } else if (phase === 'build') {
        const k = smooth(prog(t, 0, 0.1));
        ctx.globalAlpha = A0 * k;
        ctx.font = font; ctx.fillStyle = th.muted; ctx.textAlign = 'right';
        ctx.fillText('Building curriculum', R, hb);
        ctx.globalAlpha = A0;
      } else {
        const k = seg.node + 1;
        // rolling index: the digit slides up when a new node starts
        const rollD = Math.min(0.16, P.u * 0.6);
        const rk = seg.pass === 2 ? 1 : inOutCubic(prog(t, seg.s, seg.s + rollD));
        const prevK = c > 0 && seg.pass !== 2 ? P.segs[c - 1].node + 1 : k;
        const nf = V.ui(11, 600);
        const tail = ` / ${n}`;   // the app's #pj-node-count reads "Node X / Y" (S68)
        ctx.font = font;
        const tailW = ctx.measureText(tail).width;
        const numW = Math.max(tnumW(ctx, String(k), nf), tnumW(ctx, String(prevK), nf));
        const nx = R - tailW;
        ctx.font = font; ctx.fillStyle = th.muted; ctx.textAlign = 'right';
        ctx.fillText(tail, R, hb);
        if (rk < 1 && prevK !== k) {
          ctx.globalAlpha = A0 * (1 - rk);
          tnum(ctx, String(prevK), nx, hb - 6 * rk, nf, th.text, 'right');
          ctx.globalAlpha = A0 * rk;
          tnum(ctx, String(k), nx, hb + 6 * (1 - rk), nf, th.text, 'right');
        } else tnum(ctx, String(k), nx, hb, nf, th.text, 'right');
        // at the end "Node" gives way to a sage check: "✓ 12 / 12"
        const doneK = phase === 'done' ? prog(t, P.end, P.end + 0.14) : 0;
        const lx = R - tailW - numW;
        if (doneK < 1) {
          ctx.globalAlpha = A0 * (1 - smooth(doneK));
          ctx.font = font; ctx.fillStyle = th.muted; ctx.textAlign = 'right';
          ctx.fillText('Node ', lx, hb);
        }
        if (doneK > 0) {
          ctx.globalAlpha = A0;
          check(ctx, lx - 6, hb - 4, 8, th.success, 1.6, outBack(prog(t, P.end + 0.04, P.end + 0.3)));
        }
        ctx.globalAlpha = A0;
      }
    }

    // ================================================================ compact card (fades out as it opens)
    const compactA = 1 - smooth(prog(open, 0.02, 0.2));
    if (compactA > 0.001) {
      const cy = Y0 + Math.min(47, H - 18) - 4; // status line centre (≈ y 43 at h 65)
      const lb = cy + 4.4;
      ctx.globalAlpha = A0 * compactA;
      if (phase === 'idle') {
        ctx.font = V.ui(12, 450); ctx.fillStyle = th.muted; ctx.textAlign = 'left';
        ctx.fillText('No active mastery run', X, lb);
      } else if (phase === 'build') {
        ctx.font = V.ui(12, 450); ctx.fillStyle = th.muted; ctx.textAlign = 'left';
        ctx.fillText(`${n} nodes · foundational to advanced`, X, lb);
      } else {
        // micro curriculum: one dot per node, right-aligned
        const dg = 7.2, dr = 2.1, dx0 = R - (n - 1) * dg;
        for (let i = 0; i < n; i++) {
          const s = nodeOf(i), x = dx0 + i * dg;
          if (s.st === 'done') { ctx.globalAlpha = A0 * compactA * 0.62; dot(ctx, x, cy, dr, th.text); }
          else if (s.st === 'active') { ctx.globalAlpha = A0 * compactA; dot(ctx, x, cy, dr + 0.6, th.accent); }
          else if (s.st === 'fail') { ctx.globalAlpha = A0 * compactA; dot(ctx, x, cy, dr + 0.6, th.fail); }
          else { ctx.globalAlpha = A0 * compactA; ringAt(ctx, x, cy, dr - 0.3, th.faint, 1); }
        }
        ctx.globalAlpha = A0 * compactA;
        const maxW = dx0 - 14 - X - 14;
        if (phase === 'done') {
          ctx.font = V.ui(12, 520); ctx.fillStyle = th.text; ctx.textAlign = 'left';
          ctx.fillText('Mastered', X, lb);
          const w = ctx.measureText('Mastered').width;
          const mean = D.reduce((a, d) => a + d.score, 0) / n;
          ctx.fillStyle = th.muted; ctx.font = V.ui(12, 450);
          ctx.fillText(' · ' + f2(mean), X + w, lb);
        } else {
          const s = nodeOf(seg.node);
          if (s.st === 'fail') dot(ctx, X + 4, cy, 3, th.fail);
          else pulse(ctx, X + 4, cy, t, pal, A0 * compactA);
          ctx.globalAlpha = A0 * compactA;
          ctx.font = V.ui(12, 520); ctx.fillStyle = th.text; ctx.textAlign = 'left';
          const ttl = ellipsize(ctx, D[seg.node].title, maxW - 50);
          ctx.fillText(ttl, X + 14, lb);
          if (seg.node === P.rerun && (s.st === 'fail' || seg.pass === 2)) {
            const tw = ctx.measureText(ttl).width;
            const fail = s.st === 'fail';
            chip(ctx, 'RE-RUN', X + 14 + tw + 7, cy, 7.5, fail ? th.fail : th.accent, css(fail ? pal.fail : pal.accent, 0.16));
          }
        }
      }
      ctx.globalAlpha = A0;
    }

    // ================================================================ full running panel
    const fullA = smooth(prog(open, 0.08, 0.34));
    // The body is laid out for the open card and anchored to the card's bottom edge (the card grows
    // upward in the app), so it stays still while the header rises and uncovers it — no smear.
    const BY = Y0 + Math.min(0, H - MAX_H);
    const clipTop = Y0 + 33;
    // an element whose top sits at layout y `lt` fades in as the rising header line clears it
    const vis = (lt) => fullA * smooth(prog(BY + lt - clipTop, -1, 13));
    if (fullA > 0.001 && phase !== 'idle') {
      ctx.save();
      ctx.beginPath(); ctx.rect(X0, clipTop, W, Math.max(0, Y0 + H - clipTop)); ctx.clip();
      // ---------------------------------------------------------- curriculum rows
      const rowY = (i) => BY + L.rowY0 + i * L.rowDY;
      const gx = X + 4.5, ix = X + 14, tx = X + 31;
      const barW = 34, barX = R - 28 - barW;
      // active row band: glides between rows
      if ((phase === 'run' || phase === 'done') && seg) {
        const glide = Math.min(0.2, P.u * 0.55);
        const prevNode = c > 0 ? P.segs[c - 1].node : seg.node;
        const by = lerp(rowY(prevNode), rowY(seg.node), inOutCubic(prog(t, seg.s, seg.s + glide)));
        const bandIn = smooth(prog(t, P.T0, P.T0 + 0.15)) * (1 - smooth(prog(t, P.end, P.end + 0.25)));
        let bandCol = pal.accent, bandA = 0.1;
        if (inHold) {
          const q = prog(t, P.holdS, P.holdE);
          bandCol = pal.fail;
          const flashes = P.hold >= 0.4 ? 2 : 1; // never strobes: one flash in a fast slam, two when there is time
          bandA = 0.1 + 0.12 * Math.pow(Math.sin(q * Math.PI * flashes), 2) * (1 - q * 0.4);
        }
        ctx.globalAlpha = A0 * vis(by - BY - 7) * bandIn;
        V.rr(ctx, X - 6, by - 7.2, CW + 12, 14.4, 5);
        ctx.fillStyle = css(bandCol, bandA); ctx.fill();
      }
      // rows are drawn in batched passes (one font / style per pass) — fewer state changes per sample
      const rows = [];
      for (let i = 0; i < n; i++) {
        const cy = rowY(i);
        const va = vis(cy - BY - 6);
        if (va <= 0.002) continue;
        // rows cascade in during the curriculum build
        const r0 = P.T0 * (0.15 + 0.7 * (i / n));
        const rowIn = smooth(prog(t, r0, r0 + Math.max(0.06, P.T0 * 0.35)));
        if (rowIn <= 0) continue;
        const s = nodeOf(i);
        let val = null, fillV = null, numA = 1;
        if (s.st === 'done') val = fillV = D[i].score;
        else if (s.st === 'fail') val = fillV = D[i].failScore;
        else if (s.st === 'active' && liveM != null) {
          val = liveM;
          if (s.pass === 2) fillV = liveM; // a re-run continues from its failed score
          else {
            const pn = prog(t, seg.s, seg.e);
            fillV = liveM * outCubic(pn);
            numA = smooth(prog(pn, ST[2], ST[2] + 0.12)); // the score exists once the self-test runs
          }
        }
        rows.push({ i, cy, a: A0 * va * rowIn, dx: (1 - rowIn) * 6, s, val, fillV, numA });
      }
      const setA = (x) => { if (ctx.globalAlpha !== x) ctx.globalAlpha = x; };
      // pass 1 — glyphs: pending rings + settled checks share one path each when their alpha matches
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      let pathA = -1, pathKind = '';
      const flush = () => {
        if (pathKind === 'check') { ctx.strokeStyle = th.success; ctx.lineWidth = 1.55; ctx.stroke(); }
        pathKind = '';
      };
      for (const w of rows) {
        const { s, cy } = w;
        const x = gx + w.dx;
        const settled = s.st === 'done' && t >= s.at + Math.min(0.26, P.u * 1.2);
        if (s.st === 'pending') { flush(); setA(w.a); ringAt(ctx, x, cy, 3, th.faint, 1.1); continue; } // lone oval: analytic
        if (settled) {
          if (pathKind !== 'check' || w.a !== pathA) { flush(); setA(w.a); ctx.beginPath(); pathKind = 'check'; pathA = w.a; }
          ctx.moveTo(x - 3.68, cy + 0.46); ctx.lineTo(x - 1.04, cy + 2.94); ctx.lineTo(x + 3.84, cy - 2.34);
          continue;
        }
        flush();
        setA(w.a);
        if (s.st === 'active') pulse(ctx, x, cy, t, pal, w.a);
        else if (s.st === 'fail') { dot(ctx, x, cy, 3, th.fail); setA(w.a * 0.45); ringAt(ctx, x, cy, 5.6, th.fail, 1); }
        else {
          const pk = outBack(prog(t, s.at, s.at + Math.min(0.26, P.u * 1.2)));
          if (pk < 1) { setA(w.a * (1 - pk)); dot(ctx, x, cy, 3, th.accent); }
          setA(w.a * clamp(pk * 1.4));
          check(ctx, x, cy + 0.3, 8, th.success, 1.55, 0.55 + 0.45 * pk);
          ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        }
      }
      flush();
      // pass 2 — index numbers
      ctx.font = V.ui(9.5, 500); ctx.fillStyle = th.faint; ctx.textAlign = 'left';
      for (const w of rows) { setA(w.a); ctx.fillText(IDX[w.i] || String(w.i + 1), ix + w.dx, w.cy + 3.5); }
      // pass 3 — titles (settled weight first, then the live row)
      const titleMax = barX - 12 - tx;
      for (const live of [false, true]) {
        ctx.font = V.ui(11, live ? 590 : 460);
        for (const w of rows) {
          const st = w.s.st;
          if ((st === 'active' || st === 'fail') !== live) continue;
          const col = st === 'pending' ? th.muted : th.text;
          if (ctx.fillStyle !== col) ctx.fillStyle = col;
          setA(w.a * (st === 'done' ? 0.86 : 1));
          const title = ellipsize(ctx, D[w.i].title, titleMax);
          ctx.fillText(title, tx + w.dx, w.cy + 4);
          // re-run tag on the rerun node once it has failed
          if (w.i === P.rerun && (st === 'fail' || (st === 'active' && w.s.pass === 2) || (st === 'done' && t >= P.holdS))) {
            const tw = ctx.measureText(title).width;
            const tagA = smooth(prog(t, P.holdS, P.holdS + 0.08));
            const fg = st === 'fail' ? th.fail : st === 'active' ? th.accent : th.muted;
            const bg = st === 'fail' ? css(pal.fail, 0.16) : st === 'active' ? css(pal.accent, 0.16) : css(pal.text, 0.07);
            setA(w.a * tagA);
            chip(ctx, 'RE-RUN', tx + tw + 7, w.cy, 7.5, fg, bg);
            ctx.font = V.ui(11, live ? 590 : 460);
          }
        }
      }
      // pass 4 — mini mastery bars (track, then fill)
      ctx.fillStyle = th.line;
      for (const w of rows) { setA(w.a); ctx.fillRect(barX, w.cy - 1, barW, 2); }
      for (const w of rows) {
        if (w.fillV == null) continue;
        const st = w.s.st;
        ctx.fillStyle = st === 'active' ? th.accent : st === 'fail' ? th.fail : th.text;
        setA(w.a * (st === 'done' ? 0.42 : 1));
        ctx.fillRect(barX, w.cy - 1, Math.max(2, barW * clamp(w.fillV)), 2);
      }
      // pass 5 — scores (the live one in tabular figures so it doesn't jitter while counting)
      const sf = V.ui(10, 520);
      ctx.font = sf; ctx.textAlign = 'right';
      for (const w of rows) {
        if (w.val == null || w.numA <= 0) continue;
        const st = w.s.st;
        const col = st === 'active' ? th.text : st === 'fail' ? th.fail : th.muted;
        setA(w.a * w.numA);
        if (st === 'active') { tnum(ctx, f2(w.val), R, w.cy + 3.7, sf, col, 'right'); ctx.textAlign = 'right'; }
        else { ctx.fillStyle = col; ctx.fillText(f2(w.val), R, w.cy + 3.7); }
      }
      ctx.lineCap = 'butt';

      // ---------------------------------------------------------- blackboard cards (RESEARCH / EMBED / VERIFY)
      if (phase === 'run' || phase === 'done') {
        const textOf = (sg, j) => {
          const d = D[sg.node], f = targetF(D, sg);
          if (j === 0) return sg.pass === 2 ? `+3 sources · ${d.reTopic}` : `${d.src} sources · ${d.topic}`;
          if (j === 1) return sg.pass === 2 ? `+${d.reChunks} chunks · saturation ${f[2].toFixed(2)}` : `${d.chunks} chunks · saturation ${f[2].toFixed(2)}`;
          return `${d.q} questions · competency ${f[3].toFixed(2)}`;
        };
        const stageS = (sg, j) => sg.s + ST[j] * sg.u;
        const stageE = (sg, j) => (j < 2 ? sg.s + ST[j + 1] * sg.u : sg.e);
        for (let j = 0; j < 3; j++) {
          const top = BY + L.boardY + j * L.cardDY;
          const va = vis(top - BY);
          if (va <= 0.002) continue;
          const cyc = top + L.cardH / 2;
          const cardIn = smooth(prog(t, P.T0 + j * 0.04, P.T0 + j * 0.04 + 0.2));
          // which pass's card occupies this slot now
          let ci = c;
          if (t < stageS(P.segs[ci], j)) ci = c - 1;
          const cur = ci >= 0 ? P.segs[ci] : null;
          const isCur = ci === c && cur;
          const live = isCur && t < stageE(cur, j) && !(phase === 'done');
          const failCard = j === 2 && inHold && isCur;
          const stale = !isCur;
          let a = A0 * va * cardIn;
          // card body
          ctx.globalAlpha = a * (stale ? 0.6 : 1);
          V.rr(ctx, X, top, CW, L.cardH, 6);
          ctx.fillStyle = failCard ? css(pal.fail, 0.13) : th.glassHi; ctx.fill();
          if (live) { ctx.strokeStyle = css(pal.accent, 0.28); ctx.lineWidth = 1; V.rr(ctx, X + 0.5, top + 0.5, CW - 1, L.cardH - 1, 5.5); ctx.stroke(); }
          // type chip
          ctx.globalAlpha = a * (stale ? 0.55 : 1);
          const chipFg = live ? th.accent : th.muted;
          const chipBg = live ? css(pal.accent, 0.15) : css(pal.text, 0.06);
          chip(ctx, STAGE[j], X + 6, cyc, 7.5, chipFg, chipBg);
          // text (new card streams in with a feathered wipe; the previous one lifts out)
          const textX = X + 70, textMax = R - 22 - textX;
          const font = V.ui(11, live ? 520 : 460);
          if (cur) {
            const tIn = stageS(cur, j);
            const dIn = Math.max(0.05, Math.min(0.32, (stageE(cur, j) - tIn) * 0.7));
            const k = prog(t, tIn, tIn + dIn);
            const prevSeg = ci > 0 ? P.segs[ci - 1] : null;
            ctx.font = font;
            const s = ellipsize(ctx, textOf(cur, j), textMax);
            const col = stale ? pal.muted : pal.text;
            const aNew = stale ? 1 : live ? 1 : 0.82;
            const ty = cyc + 4;
            if (k >= 1 || !prevSeg) {
              ctx.globalAlpha = a * (stale ? 0.5 : 1);
              if (k >= 1) { ctx.fillStyle = css(col, aNew); ctx.textAlign = 'left'; ctx.fillText(s, textX, ty); }
              else sweep(ctx, s, textX, ty, col, aNew, textX + (ctx.measureText(s).width + 26) * outCubic(k), 26, false);
            } else {
              // replace sweep: the new card writes in from the left over the old one
              ctx.globalAlpha = a;
              ctx.font = V.ui(11, 460);
              const so = ellipsize(ctx, textOf(prevSeg, j), textMax);
              const wo = ctx.measureText(so).width;
              ctx.font = font;
              const wn = ctx.measureText(s).width;
              const edge = textX + (Math.max(wo, wn) + 26) * outCubic(k);
              ctx.font = V.ui(11, 460);
              sweep(ctx, so, textX, ty, pal.muted, 0.9, edge + 16, 16, true);
              ctx.font = font;
              sweep(ctx, s, textX, ty, col, aNew, edge, 26, false);
            }
            // status at right: spinner while live, sage check when done, brick score on a failed verify
            const sx = R - 9;
            if (failCard) {
              ctx.globalAlpha = a;
              plain(ctx, f2(D[cur.node].failScore), R - 6, cyc + 3.6, V.ui(10, 600), th.fail, 'right');
            } else if (live) {
              ctx.globalAlpha = a * smooth(prog(t, tIn, tIn + 0.06));
              spinner(ctx, sx, cyc, t, th.accent);
            } else if (!stale) {
              const ck = outBack(prog(t, stageE(cur, j), stageE(cur, j) + Math.min(0.22, P.u)));
              ctx.globalAlpha = a * clamp(ck * 1.5);
              check(ctx, sx, cyc + 0.3, 8, th.success, 1.5, 0.6 + 0.4 * ck);
            }
          }
        }
      }

      // ---------------------------------------------------------- mastery meter
      {
        const my = BY + L.meterY;
        const va = vis(L.meterY - 9);
        if (va > 0.002) {
          const a = A0 * va * smooth(prog(t, P.T0 * 0.5, P.T0 + 0.15));
          const labels = ['coverage', 'depth', 'saturation', 'competency', 'mastery'];
          const lf = V.ui(10, 480);
          ctx.font = lf;
          const lw = labels.map((s) => ctx.measureText(s).width);
          const gap = (CW - lw.reduce((x, y) => x + y, 0)) / 4;
          const cols = [];
          let x = X;
          for (let i = 0; i < 5; i++) { cols.push(x + lw[i] / 2); x += lw[i] + gap; }
          // state colour for the result
          const M = FX.M;
          let mCol = th.text, fill = pal.accent;
          if (inHold) { mCol = th.fail; fill = pal.fail; }
          const doneK = phase === 'done' ? smooth(prog(t, P.end, P.end + 0.3)) : 0;
          // a rerun node that just passed: a brief sage confirmation
          let passK = 0;
          if (P.rerun >= 0) {
            const reSeg = P.segs.find((s) => s.pass === 2);
            const hold = clamp(P.u * 2.5, 0.15, 0.5);
            if (reSeg) passK = t >= reSeg.e ? Math.max(0, 1 - (t - reSeg.e) / hold) * smooth(prog(t, reSeg.e, reSeg.e + 0.05)) : 0;
          }
          const sageK = Math.max(doneK, passK);
          // labels + operators
          ctx.globalAlpha = a;
          for (let i = 0; i < 5; i++) {
            ctx.font = lf; ctx.textAlign = 'center'; ctx.fillStyle = th.muted;
            ctx.fillText(labels[i], cols[i], my);
          }
          const vb = my + 15.5;
          const resFont = V.ui(15, 650), valFont = V.ui(11.5, 500);
          const vw = [0, 1, 2, 3, 4].map((i) => tnumW(ctx, '0.00', i < 4 ? valFont : resFont));
          ctx.globalAlpha = a * 0.8;
          for (let i = 0; i < 4; i++) {
            const ox = (cols[i] + vw[i] / 2 + cols[i + 1] - vw[i + 1] / 2) / 2;
            ctx.font = V.ui(11, 400); ctx.textAlign = 'center'; ctx.fillStyle = th.muted;
            ctx.fillText(i < 3 ? '×' : '=', ox, vb - 0.5);
          }
          ctx.globalAlpha = a;
          // values
          for (let i = 0; i < 4; i++) {
            const has = FX.f && FX.def[i];
            tnum(ctx, has ? f2(FX.f[i]) : '—', cols[i], vb, valFont, has ? th.text : th.faint, 'center');
          }
          // result
          if (sageK >= 1 && M != null) tnum(ctx, f2(M), cols[4], vb + 0.5, resFont, th.success, 'center');
          else if (sageK > 0 && M != null) {
            ctx.globalAlpha = a * (1 - sageK);
            tnum(ctx, f2(M), cols[4], vb + 0.5, resFont, mCol, 'center');
            ctx.globalAlpha = a * sageK;
            tnum(ctx, f2(M), cols[4], vb + 0.5, resFont, th.success, 'center');
            ctx.globalAlpha = a;
          } else tnum(ctx, M != null ? f2(M) : '—', cols[4], vb + 0.5, resFont, M != null ? mCol : th.faint, 'center');
          // bar + 0.85 threshold tick
          const bY = my + 23, bH = 4;
          V.rr(ctx, X, bY, CW, bH, 2); ctx.fillStyle = th.line; ctx.fill();
          if (M != null) {
            const fw = Math.max(bH, CW * clamp(M));
            V.rr(ctx, X, bY, fw, bH, 2);
            ctx.fillStyle = sageK >= 1 ? th.success : css(fill, 1); ctx.fill();
            if (sageK > 0 && sageK < 1) { ctx.globalAlpha = a * sageK; ctx.fillStyle = th.success; ctx.fill(); ctx.globalAlpha = a; }
          }
          const tx = X + CW * THRESH;
          const tickHot = inHold ? 1 : 0;
          ctx.fillStyle = tickHot ? th.fail : th.muted;
          ctx.fillRect(Math.round(tx) - 0.5, bY - 3.5, 1, bH + 7);
          // tick label (+ the verdict on a failed node)
          const tlb = bY + bH + 12.5;
          plain(ctx, '0.85', tx, tlb, V.ui(9.5, 500), tickHot ? th.fail : th.muted, 'center');
          if (inHold) {
            const q = prog(t, P.holdS, P.holdS + 0.08);
            ctx.globalAlpha = a * q;
            ctx.font = V.ui(10, 560); ctx.fillStyle = th.fail; ctx.textAlign = 'left';
            ctx.fillText(`Below threshold · re-running node ${P.rerun + 1}`, X, tlb);
            ctx.globalAlpha = a;
          } else if (phase === 'done') {
            ctx.globalAlpha = a * doneK;
            ctx.font = V.ui(10, 500); ctx.fillStyle = th.muted; ctx.textAlign = 'left';
            ctx.fillText(`All ${n} nodes ≥ 0.85`, X, tlb);
            ctx.globalAlpha = a;
          } else if (phase === 'run' && seg) {
            ctx.font = V.ui(10, 460); ctx.fillStyle = th.muted; ctx.textAlign = 'left';
            ctx.fillText(`Node ${seg.node + 1} mastery${seg.pass === 2 ? ' · re-run' : ''}`, X, tlb);
          }
        }
      }
      ctx.restore();
    }

    ctx.restore();
  }

  // Reference choreography (lab + film): the card grows 65 → 343 as the run starts, runs for `dur`,
  // holds the result, then folds back to the compact card. o.rect is the OPEN rect; the card stays
  // bottom-anchored like the app (y = bottom − h). Draws its own glass unless o.card === false.
  function demo(ctx, t, o) {
    o = o || {};
    const dur = o.dur == null ? 8 : +o.dur;
    const r = o.rect || { x: 0, y: 0, w: 300, h: MAX_H };
    const hold = o.hold == null ? 1.0 : +o.hold;
    const open = inOutCubic(prog(t, 0.05, 0.45)) * (1 - inOutCubic(prog(t, dur + hold, dur + hold + 0.6)));
    const sh = o.shell && V.components.shell;
    if (sh) { // integration check: the real app window behind (lab: --deps shell)
      sh.draw(ctx, t, { theme: o.theme, prajnaOpen: open, state: 'thinking',
        queue: [{ lane: 'PRAJNA', label: 'Bitcoin · 12 nodes', status: 'running', progress: clamp(t / dur), at: 0 }] });
      draw(ctx, t, Object.assign({}, o, { rect: sh.layout({ prajnaOpen: open }).prajna, open, card: false }));
      return;
    }
    const h = lerp(MIN_H, r.h, open);
    draw(ctx, t, Object.assign({}, o, { rect: { x: r.x, y: r.y + r.h - h, w: r.w, h }, open, card: o.card !== false }));
  }

  V.components.prajna = { demo, NODES, DATA: DEFAULT_DATA, plan, draw, MIN_H, MAX_H, THRESH };
})();
