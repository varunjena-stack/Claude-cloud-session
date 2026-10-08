// VEDAOS film component: memory — the "REMEMBERS" explainer. Full-frame, 1920×1080 film space.
//
// The cross-domain recall proven live in S100, told in pictures:
//   1. the question appears the instant it is heard — plain, DIMMED (as in the product's transcript),
//      with a small voice glyph that moves while it is being heard;
//   2. a quick sweep through the four retrieval tiers (Curated · Mem0 · Vectors · Graph); the marker
//      comes to rest on Graph, which lights in accent;
//   3. two fact cards land far apart — different domains (icon + meta say so), no topical overlap;
//   4. the shared entity is underlined inside each fact, a line draws from each card toward the centre,
//      they meet at the entity node and the connection LIGHTS (node fills, one ring, lines run accent
//      back out to both cards) — the product's differentiator, so it gets the beat;
//   5. the answer resolves under the node in accent (each word settles in weight); the question
//      brightens to full strength as the reply lands.
//
// draw(ctx, t, o) — t in seconds (t < 0 draws nothing; t > dur holds the final frame). Draws content only (no
// background fill), full-frame 1920×1080, relative to the current transform. Options (all optional):
//   theme 'dark'|'cream'|'light' ('dark') · dur s (1.6) · top px kept clear for the film's headline (200)
//   question · factA {text, meta, icon} · factB {text, meta, icon} · entity · answer — see DEFAULTS below;
//   icon 'doc'|'peak'|'person'|'none'; tiers [4 labels] (Curated · Mem0 · Vectors · Graph; the last one lights)
//   _preview  lab only: draws a stand-in headline (e.g. "Remembers.") at the film's spot to judge composition
// Choreography scales with o.dur: ≤ ~1.6 s is the montage slam (all beats compressed, essentials only);
// 3–9 s is the narrative pillar scaled (question heard mid-frame then glides up, caption, breathing hold).
//
// Pure function of t: no randomness, no clock, no module state mutated during draw.
(function () {
  'use strict';
  const V = window.V;
  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const lerp = (a, b, k) => a + (b - a) * k;
  const prog = (t, a, d) => (d <= 0 ? (t >= a ? 1 : 0) : clamp((t - a) / d));
  const smooth = (x) => { x = clamp(x); return x * x * (3 - 2 * x); };
  const outCubic = (x) => 1 - Math.pow(1 - clamp(x), 3);
  const outQuart = (x) => 1 - Math.pow(1 - clamp(x), 4);
  const outExpo = (x) => { x = clamp(x); return x >= 1 ? 1 : 1 - Math.pow(2, -10 * x); };
  const inOutCubic = (x) => { x = clamp(x); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
  const TAU = Math.PI * 2;

  // ------------------------------------------------------------------ colour (theme tokens only, parsed once)
  function parseCol(s) {
    if (s[0] === '#') { const c = V.hexRGB(s); return [c[0], c[1], c[2], 1]; }
    const m = s.match(/[\d.]+/g).map(Number);
    return [m[0], m[1], m[2], m.length > 3 ? m[3] : 1];
  }
  const KEYS = ['bg', 'text', 'muted', 'faint', 'line', 'glass', 'glassHi', 'accent', 'shadow'];
  const PAL = {};
  for (const k of Object.keys(V.THEMES)) {
    PAL[k] = {};
    for (const key of KEYS) PAL[k][key] = parseCol(V.THEMES[k][key]);
  }
  const mix = (a, b, k) => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k), lerp(a[3], b[3], k)];
  const css = (c, a = 1) => `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${+(c[3] * a).toFixed(4)})`;

  // ------------------------------------------------------------------ defaults
  const DEFAULTS = {
    theme: 'dark',
    dur: 1.6,
    top: 200,
    question: 'Anything I should know before Saturday?',
    factA: { text: 'Maya wants clause 7 of the NDA narrowed', meta: '3 weeks ago · work', icon: 'doc' },
    factB: { text: 'Climbing meetup Saturday, 9 am — Maya’s coming', meta: 'last week · personal', icon: 'peak' },
    entity: 'Maya',
    answer: 'Maya’s at climbing on Saturday — a good moment to settle clause 7.',
    tiers: ['Curated', 'Mem0', 'Vectors', 'Graph'],
  };

  // ------------------------------------------------------------------ choreography
  // Event times (s) authored twice: for the 1.6 s slam and for the 9 s pillar. ≤ 1.6 s compresses the slam;
  // 1.6–3 s blends slam → pillar; 3–9 s is the pillar scaled to fit; > 9 s stretches gently and holds longer.
  //   q   question heard         sw  tier sweep (Graph lights at sw+swd)    ca/cb  cards land
  //   hl  entity underlined      ln  lines draw (connect at ln+lnd)          an     answer resolves
  //   pl  light running back out to the cards after the connection
  const SHORT = { q: 0.0, qd: 0.16, sw: 0.04, swd: 0.32, ca: 0.12, cb: 0.17, cad: 0.36,
    hl: 0.36, hld: 0.16, ln: 0.40, lnd: 0.29, an: 0.77, and: 0.38, pl: 0.40 };
  const LONG = { q: 0.25, qd: 1.0, sw: 1.85, swd: 1.4, ca: 3.15, cb: 3.4, cad: 0.95,
    hl: 4.4, hld: 0.55, ln: 4.75, lnd: 1.15, an: 6.3, and: 1.5, pl: 0.9 };
  function schedule(D) {
    const S = {};
    if (D <= 1.6) {
      for (const k in SHORT) S[k] = (SHORT[k] / 1.6) * D;
    } else if (D < 3) {
      const k = smooth((D - 1.6) / (3 - 1.6));
      for (const key in SHORT) S[key] = lerp(SHORT[key] / 1.6, LONG[key] / 9, k) * D;
    } else if (D <= 9) {
      for (const k in LONG) S[k] = (LONG[k] / 9) * D;
    } else {
      const s = 1 + 0.5 * (D / 9 - 1);
      for (const k in LONG) S[k] = LONG[k] * s;
    }
    S.tc = S.ln + S.lnd;   // the connection
    S.brief = D < 3;       // essentials only: no caption, no breathing hold
    // the question is heard mid-frame and glides up to its slot — only when there is a real pause for it
    S.glide = !S.brief && S.sw - (S.q + S.qd) >= 0.4;
    return S;
  }

  // ------------------------------------------------------------------ layout (film space, recomputed per call)
  // A funnel read top → bottom: question · tiers · two facts far apart · their lines converge on the entity
  // node below and between them · the answer comes out under the node.
  const MARGIN = 120, CARD_W = 520, CARD_MIN = 420, CARD_PAD = 34, NODE_R = 62;
  function layout(ctx, o, S) {
    const top = o.top;
    const avail = 1080 - top - 120;                 // room down to a 120 px bottom margin
    const k = clamp(avail / 760, 0.72, 1.1);         // compress / relax the vertical rhythm with `top`
    const L = { k };
    L.qY = top + 82 * k;                            // question baseline (final)
    L.tierY = top + 166 * k;                        // tier labels baseline
    L.cardY = top + 240 * k;                        // card tops
    return L;
  }

  // ------------------------------------------------------------------ type helpers
  // o.sizes {tier, meta, fact} lets a film enlarge the small text for phones. SZ is (re)set from o at the top of
  // every draw() before anything reads it, so output still depends only on (t, o).
  let SZ = { tier: 28, meta: 26, fact: 34 };
  const F = {
    q: (w) => V.display(58, w),   // same as research's question (Fraunces 58 / 460): one type role, one style
    tier: (w) => V.ui(SZ.tier, w),
    meta: () => V.ui(SZ.meta, 450),
    fact: () => V.ui(SZ.fact, 500),
    node: () => V.ui(30, 620),
    cap: () => V.ui(26, 450),
  };

  // Balanced word wrap: greedy at the narrowest width that still gives the greedy line count, so lines come
  // out even ("Maya wants clause 7 / of the NDA narrowed"). Glue rules: a number keeps its am/pm, an em dash
  // stays at the end of its line, never at the start. Returns V.wrap's shape: [[{w, x, width}]].
  function tokens(s) {
    const raw = String(s || '').trim().split(/\s+/).filter(Boolean);
    const out = [];
    for (const w of raw) {
      const prev = out[out.length - 1];
      if (prev && (/^[—–]$/.test(w) || (/^(am|pm|a\.m\.|p\.m\.)[,.;]?$/i.test(w) && /\d$/.test(prev)))) out[out.length - 1] = prev + ' ' + w;
      else out.push(w);
    }
    return out;
  }
  function greedy(toks, ws, space, maxW) {
    const lines = [];
    let cur = [], curW = 0;
    for (let i = 0; i < toks.length; i++) {
      const ww = ws[i];
      if (cur.length && curW + space + ww > maxW) { lines.push(cur); cur = []; curW = 0; }
      cur.push({ w: toks[i], x: cur.length ? curW + space : 0, width: ww });
      curW = cur.length > 1 ? curW + space + ww : ww;
    }
    if (cur.length) lines.push(cur);
    return lines;
  }
  function wrapBalanced(ctx, s, maxW, font) {
    ctx.font = font;
    const toks = tokens(s);
    const ws = toks.map((w) => ctx.measureText(w).width);
    const space = ctx.measureText(' ').width;
    const base = greedy(toks, ws, space, maxW);
    if (base.length < 2) return base;
    let lo = Math.max(...ws), hi = maxW;
    for (let it = 0; it < 14; it++) {
      const mid = (lo + hi) / 2;
      if (greedy(toks, ws, space, mid).length > base.length) lo = mid; else hi = mid;
    }
    return greedy(toks, ws, space, hi);
  }

  // word-by-word line layout (centered), measured at the final font so animation never reflows
  function centeredLines(ctx, s, maxW, font, cx, y0, lh) {
    const lines = wrapBalanced(ctx, s, maxW, font);
    const out = [];
    let idx = 0;
    lines.forEach((ln, li) => {
      const last = ln[ln.length - 1];
      let w = last.x + last.width;
      // optical centring: a line-final dash hangs outside the measure
      const m = /\s[—–]$/.exec(last.w);
      if (m && li < lines.length - 1) { ctx.font = font; w -= ctx.measureText(m[0]).width; }
      const x0 = cx - w / 2;
      for (const wd of ln) out.push({ s: wd.w, x: x0 + wd.x, y: y0 + li * lh, w: wd.width, i: idx++, line: li });
    });
    return { words: out, n: lines.length };
  }

  // find the entity inside a fact's wrapped layout → [{x, y, w}] spans (substring-precise, e.g. "Maya" in "Maya’s")
  function entitySpans(ctx, words, entity, font) {
    const spans = [];
    if (!entity) return spans;
    const ent = entity.toLowerCase();
    ctx.font = font;
    for (const wd of words) {
      const j = wd.s.toLowerCase().indexOf(ent);
      if (j < 0) continue;
      const pre = ctx.measureText(wd.s.slice(0, j)).width;
      const mw = ctx.measureText(wd.s.slice(j, j + entity.length)).width;
      spans.push({ word: wd, j, x: wd.x + pre, w: mw });
    }
    return spans;
  }

  // ------------------------------------------------------------------ icons (paths; the fonts carry no pictographs)
  function iconDoc(ctx, x, y, s, col, lw) {
    // a page with a folded corner and two text lines — "a document" (work)
    const w = s * 0.74, h = s, f = s * 0.26, x0 = x - w / 2, y0 = y - h / 2;
    ctx.save(); ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x0, y0); ctx.lineTo(x0 + w - f, y0); ctx.lineTo(x0 + w, y0 + f); ctx.lineTo(x0 + w, y0 + h); ctx.lineTo(x0, y0 + h); ctx.closePath();
    ctx.moveTo(x0 + w - f, y0); ctx.lineTo(x0 + w - f, y0 + f); ctx.lineTo(x0 + w, y0 + f);
    ctx.moveTo(x0 + w * 0.24, y0 + h * 0.56); ctx.lineTo(x0 + w * 0.76, y0 + h * 0.56);
    ctx.moveTo(x0 + w * 0.24, y0 + h * 0.76); ctx.lineTo(x0 + w * 0.62, y0 + h * 0.76);
    ctx.stroke(); ctx.restore();
  }
  function iconPeak(ctx, x, y, s, col, lw) {
    // two peaks on a ground line — "the outdoors" (personal / climbing)
    const b = y + s * 0.42;
    ctx.save(); ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x - s * 0.56, b); ctx.lineTo(x - s * 0.12, y - s * 0.40); ctx.lineTo(x + s * 0.14, y + s * 0.02);
    ctx.lineTo(x + s * 0.28, y - s * 0.16); ctx.lineTo(x + s * 0.56, b); ctx.closePath();
    ctx.moveTo(x - s * 0.27, y - s * 0.12); ctx.lineTo(x - s * 0.12, y - s * 0.02); ctx.lineTo(x + s * 0.01, y - s * 0.16);
    ctx.stroke(); ctx.restore();
  }
  function iconPerson(ctx, x, y, s, col, lw) {
    ctx.save(); ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(x, y - s * 0.16, s * 0.2, 0, TAU);
    ctx.moveTo(x - s * 0.38, y + s * 0.46); ctx.quadraticCurveTo(x - s * 0.36, y + s * 0.1, x, y + s * 0.1);
    ctx.quadraticCurveTo(x + s * 0.36, y + s * 0.1, x + s * 0.38, y + s * 0.46);
    ctx.stroke(); ctx.restore();
  }
  const ICONS = { doc: iconDoc, peak: iconPeak, person: iconPerson };

  // ------------------------------------------------------------------ pieces
  // 1. the question, heard: words pop in at speech pace (no fade-rise), dimmed until the answer lands
  function drawQuestion(ctx, t, o, S, L, P) {
    if (t < S.q) return;
    const font = F.q(460);
    ctx.font = font;
    const s = '“' + o.question + '”';
    const words = s.split(' ');
    const space = ctx.measureText(' ').width;
    const ws = words.map((w) => ctx.measureText(w).width);
    const textW = ws.reduce((a, b) => a + b, 0) + space * (words.length - 1);
    const glyphW = 38, gap = 26;
    const x0 = 960 - (textW + glyphW + gap) / 2;
    // long version: heard alone, mid-frame; glides up to its slot as the search begins
    let y = L.qY;
    if (S.glide) {
      const g0 = S.q + S.qd + 0.08;
      y = lerp(L.qMid, L.qY, inOutCubic(prog(t, g0, S.sw + 0.02 - g0)));
    }

    // dimmed → full as the answer lands
    const lit = smooth(prog(t, S.an + S.and * 0.15, S.and * 0.6));
    const col = mix(P.muted, P.text, lit);

    // voice glyph: five rounded bars that move while the question is being heard, then rest as dots
    const heard = prog(t, S.q, S.qd);
    const live = clamp((t - S.q) / 0.08) * (1 - smooth(prog(t, S.q + S.qd, 0.25)));
    const gx = x0, gy = y - 20;
    ctx.save();
    ctx.fillStyle = css(P.accent, lerp(0.95, 0.7, lit));
    for (let i = 0; i < 5; i++) {
      const env = [0.45, 0.8, 1, 0.75, 0.5][i];
      const n = 0.5 + 0.5 * Math.sin(t * 19 + i * 1.7 + V.noise1(t * 5 + i, 11) * 2.2);
      const rest = [9, 17, 24, 15, 9][i];
      const h = lerp(rest, 7 + 28 * env * (0.3 + 0.7 * n), live);
      V.rr(ctx, gx + i * 8, gy - h / 2, 4.5, h, 2.25);
      ctx.fill();
    }
    ctx.restore();

    // words appear as heard (each one snaps in over ~70 ms)
    const n = words.length;
    let x = x0 + glyphW + gap;
    ctx.save();
    ctx.font = font; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    if (t >= S.q + S.qd + 0.08) {         // fully heard: one run
      ctx.fillStyle = css(col);
      ctx.fillText(s, x, y);
      ctx.restore();
      return heard;
    }
    for (let i = 0; i < n; i++) {
      const wt = S.q + (i / n) * S.qd * 0.92;
      const a = S.brief && S.qd < 0.2 ? clamp((t - wt) / 0.05) : clamp((t - wt) / 0.07);
      if (a > 0) {
        ctx.fillStyle = css(col, a);
        ctx.fillText(words[i], x, y);
      }
      x += ws[i] + space;
    }
    ctx.restore();
    return heard;
  }

  // 2. the four tiers; a marker sweeps across and comes to rest on Graph, which lights
  function drawTiers(ctx, t, o, S, L, P) {
    const appear = smooth(prog(t, S.sw - (S.brief ? 0.04 : 0.1), S.brief ? 0.1 : 0.35));
    if (appear <= 0) return;
    const tiers = o.tiers;
    const n = tiers.length;
    const sep = 46;
    const lit = smooth(prog(t, S.sw + S.swd * 0.94, S.brief ? 0.1 : 0.28));   // Graph lights
    // measure at the final weights so nothing reflows
    ctx.font = F.tier(500);
    const ws = tiers.map((s, i) => { ctx.font = F.tier(i === n - 1 ? 600 : 500); return ctx.measureText(s).width; });
    const total = ws.reduce((a, b) => a + b, 0) + sep * (n - 1);
    const xs = [];
    let x = 960 - total / 2;
    for (let i = 0; i < n; i++) { xs.push(x); x += ws[i] + sep; }
    const y = L.tierY;

    // marker position along 0..n-1: dwell on each tier, glide between
    const p = prog(t, S.sw, S.swd);
    const seg = p * (n - 1);
    const si = Math.min(n - 2, Math.floor(seg));
    const pos = si + inOutCubic(seg - si);

    ctx.save();
    ctx.globalAlpha *= appear;
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    for (let i = 0; i < n; i++) {
      const near = t >= S.sw ? clamp(1 - Math.abs(pos - i) / 0.7) : 0;
      let c, w = 500;
      if (i === n - 1) {
        c = mix(mix(P.muted, P.text, near), P.accent, lit);
        w = lerp(500, 600, lit);
      } else {
        // searched and passed: settles quieter than the tier still to come, but stays legible
        const passed = t >= S.sw ? clamp((pos - i) / 0.7) : 0;
        c = mix(mix(P.muted, mix(P.faint, P.muted, 0.45), passed), P.text, near);
      }
      ctx.font = F.tier(w);
      ctx.fillStyle = css(c);
      ctx.fillText(tiers[i], xs[i], y);
      if (i < n - 1) {
        ctx.fillStyle = css(P.faint);
        ctx.font = F.tier(500);
        ctx.textAlign = 'center';
        ctx.fillText('·', xs[i] + ws[i] + sep / 2, y);
        ctx.textAlign = 'left';
      }
    }
    // marker: a short accent rule under the tier being searched
    if (t >= S.sw) {
      const i0 = Math.floor(pos), i1 = Math.min(n - 1, i0 + 1), f = pos - i0;
      const mx = lerp(xs[i0], xs[i1], f), mw = lerp(ws[i0], ws[i1], f);
      const a = lerp(0.85, 1, lit);
      ctx.fillStyle = css(P.accent, a);
      V.rr(ctx, mx, y + 16, mw, 3, 1.5);
      ctx.fill();
    }
    ctx.restore();
    return { lit, xs, ws };
  }

  // card geometry + text layout for one fact (measured at final fonts)
  // wrapped fact text + the width it needs (text block and meta row)
  function cardText(ctx, fact) {
    const lines = wrapBalanced(ctx, fact.text, CARD_W - CARD_PAD * 2, F.fact());
    let w = 0;
    for (const ln of lines) { const l = ln[ln.length - 1]; w = Math.max(w, l.x + l.width); }
    ctx.font = F.meta();
    w = Math.max(w, (ICONS[fact.icon] ? 40 : 0) + ctx.measureText(fact.meta).width);
    return { lines, w };
  }
  const factLH = () => Math.round(46 * SZ.fact / 34);
  const metaH = () => Math.round(34 * SZ.meta / 26);
  const cardH = (nLines) => CARD_PAD + metaH() + 22 + nLines * factLH() - 12 + CARD_PAD;
  // h: the shared card height; a shorter fact's block (meta + text) is centred in it
  function cardModel(ctx, fact, x, y, w, o, lines, h) {
    const pad = CARD_PAD;
    const font = F.fact();
    const lh = factLH();
    const mH = metaH(), gapMF = 22;
    const y0 = y + (h - cardH(lines.length)) / 2;
    const words = [];
    lines.forEach((ln, li) => { for (const wd of ln) words.push({ s: wd.w, x: x + pad + wd.x, y: y0 + pad + mH + gapMF + Math.round(30 * SZ.fact / 34) + li * lh, w: wd.width }); });
    const spans = entitySpans(ctx, words, o.entity, font);
    // text runs per line: plain runs drawn as one string each, entity pieces split out so they can turn accent
    const runs = [];
    const spanByWord = new Map(spans.map((sp) => [sp.word, sp]));
    let cur = null;
    const flush = () => { if (cur && cur.s) runs.push(cur); cur = null; };
    let lastY = null;
    for (const wd of words) {
      if (wd.y !== lastY) { flush(); lastY = wd.y; }
      const sp = spanByWord.get(wd);
      if (!sp) {
        if (!cur) cur = { s: wd.s, x: wd.x, y: wd.y, ent: false };
        else cur.s += ' ' + wd.s;
        continue;
      }
      const n = o.entity.length;
      const pre = wd.s.slice(0, sp.j), mid = wd.s.slice(sp.j, sp.j + n), post = wd.s.slice(sp.j + n);
      if (cur) cur.s += ' ' + pre; else if (pre) cur = { s: pre, x: wd.x, y: wd.y, ent: false };
      flush();
      runs.push({ s: mid, x: sp.x, y: wd.y, ent: true });
      cur = { s: post, x: sp.x + sp.w, y: wd.y, ent: false };
    }
    flush();
    return { x, y, w, h, pad, font, words, spans, runs, lines: lines.length, metaY: y0 + pad + Math.round(25 * SZ.meta / 26) };
  }

  // 3./4. one fact card
  function drawCard(ctx, t, o, S, P, th, m, fact, side, t0, G) {
    const k = outExpo(prog(t, t0, S.cad));
    if (k <= 0) return;
    const a = smooth(prog(t, t0, S.cad * 0.5));
    const dx = (1 - k) * 70 * side;
    const warm = smooth(prog(t, G.tp, 0.35));                        // the light has reached this card
    const hl = outCubic(prog(t, S.hl + (side > 0 ? (S.brief ? 0.03 : 0.2) : 0), S.hld));   // found here… and here

    ctx.save();
    ctx.globalAlpha *= a;
    ctx.translate(dx, 0);
    // card: glass + hairline (flat)
    V.rr(ctx, m.x, m.y, m.w, m.h, 22);
    ctx.fillStyle = th.glass; ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = css(mix(P.line, [P.accent[0], P.accent[1], P.accent[2], 0.5], warm));
    ctx.stroke();

    // meta row: domain icon + "when · domain"
    const ic = ICONS[fact.icon];
    let mx = m.x + m.pad;
    if (ic) { ic(ctx, mx + 13, m.metaY - 9, 26, css(P.muted), 2); mx += 26 + 14; }
    ctx.font = F.meta(); ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = css(P.muted);
    ctx.fillText(fact.meta, mx, m.metaY);

    // when the light gets back here, the entity flashes a soft marker tint — recognition — and lets go
    if (t >= G.tp && hl > 0) {
      const u = t - G.tp;
      const flash = smooth(u / 0.08) * Math.exp(-u * 4.2);
      if (flash > 0.004) {
        ctx.fillStyle = css(P.accent, 0.3 * flash);
        for (const sp of m.spans) { V.rr(ctx, sp.x - 7, sp.word.y - 32, sp.w + 14, 46, 9); ctx.fill(); }
      }
    }
    // fact text; the entity substring turns accent and gets underlined when the graph finds it
    ctx.font = m.font;
    const plain = css(P.text), ent = css(mix(P.text, P.accent, hl));
    for (const r of m.runs) {
      ctx.fillStyle = r.ent ? ent : plain;
      ctx.fillText(r.s, r.x, r.y);
    }
    // underline draws left → right
    if (hl > 0) {
      ctx.fillStyle = css(P.accent);
      for (const sp of m.spans) { V.rr(ctx, sp.x, sp.word.y + 9, Math.max(0.1, sp.w * hl), 3, 1.5); ctx.fill(); }
    }
    ctx.restore();
  }

  // ---- connector geometry: cubic S-curves sampled by arc length (so partial strokes move at even speed)
  function curve(p0, c1, c2, p3) {
    const N = 40, pts = [], len = [0];
    for (let i = 0; i <= N; i++) {
      const u = i / N, v = 1 - u;
      const x = v * v * v * p0.x + 3 * v * v * u * c1.x + 3 * v * u * u * c2.x + u * u * u * p3.x;
      const y = v * v * v * p0.y + 3 * v * v * u * c1.y + 3 * v * u * u * c2.y + u * u * u * p3.y;
      pts.push({ x, y });
      if (i) len.push(len[i - 1] + Math.hypot(x - pts[i - 1].x, y - pts[i - 1].y));
    }
    return { pts, len, total: len[N], p0, c1, c2, p3 };
  }
  // a rounded orthogonal route (down, across, down) sampled like curve(), drawn as a polyline
  function route(p0, yRun, e, rad) {
    const pts = [];
    const dir = Math.sign(e.x - p0.x) || 1;
    const rr = Math.min(rad, Math.abs(e.x - p0.x) / 2, (yRun - p0.y) / 2, (e.y - yRun) / 2);
    const push = (x, y) => pts.push({ x, y });
    for (let i = 0; i <= 12; i++) push(p0.x, lerp(p0.y, yRun - rr, i / 12));
    for (let i = 1; i <= 8; i++) { const a = (i / 8) * Math.PI / 2; push(p0.x + dir * rr * (1 - Math.cos(a)), yRun - rr + rr * Math.sin(a)); }
    for (let i = 1; i <= 16; i++) push(lerp(p0.x + dir * rr, e.x - dir * rr, i / 16), yRun);
    for (let i = 1; i <= 8; i++) { const a = (i / 8) * Math.PI / 2; push(e.x - dir * rr + dir * rr * Math.sin(a), yRun + rr - rr * Math.cos(a)); }
    for (let i = 1; i <= 8; i++) push(e.x, lerp(yRun + rr, e.y, i / 8));
    const len = [0];
    for (let i = 1; i < pts.length; i++) len.push(len[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
    return { pts, len, total: len[len.length - 1], p0, p3: e, poly: true };
  }
  function at(cv, f) {
    const L = clamp(f) * cv.total, n = cv.pts.length - 1;
    let i = 1;
    while (i < n && cv.len[i] < L) i++;
    const a = cv.pts[i - 1], b = cv.pts[i], seg = cv.len[i] - cv.len[i - 1] || 1;
    const k = clamp((L - cv.len[i - 1]) / seg);
    return { x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k), i };
  }
  function strokeRange(ctx, cv, f0, f1) {
    if (f1 - f0 <= 1e-4) return;
    if (f0 <= 0 && f1 >= 1 && !cv.poly) {            // whole curve: let the rasteriser do the bezier
      ctx.beginPath(); ctx.moveTo(cv.p0.x, cv.p0.y);
      ctx.bezierCurveTo(cv.c1.x, cv.c1.y, cv.c2.x, cv.c2.y, cv.p3.x, cv.p3.y);
      ctx.stroke();
      return;
    }
    const A = at(cv, f0), B = at(cv, f1);
    ctx.beginPath(); ctx.moveTo(A.x, A.y);
    for (let i = A.i; i < B.i; i++) ctx.lineTo(cv.pts[i].x, cv.pts[i].y);
    ctx.lineTo(B.x, B.y);
    ctx.stroke();
  }

  function geometry(S, A, B, L) {
    const cy = A.y + A.h / 2;
    const nx = 960, ny = cy + 138 * L.k;
    const pa = { x: A.x + A.w, y: cy }, pb = { x: B.x, y: cy };
    const ea = { x: nx - NODE_R - 9, y: ny }, eb = { x: nx + NODE_R + 9, y: ny };
    const h = 0.55 * (ea.x - pa.x);
    return {
      cy, nx, ny, pa, pb,
      ca: curve(pa, { x: pa.x + h, y: pa.y }, { x: ea.x - h, y: ea.y }, ea),
      cb: curve(pb, { x: pb.x - h, y: pb.y }, { x: eb.x + h, y: eb.y }, eb),
      tp: S.tc + S.pl * 0.5,                       // the light arrives back at the cards
    };
  }

  // link:'query' — plain retrieval: the question's own word finds both facts. Lines run from that word in the question
  // down to the matching word in each card; there is no entity node (that picture belongs to the graph tier).
  function questionSpan(ctx, o, L) {
    ctx.font = F.q(460);
    const s = '“' + o.question + '”';
    const words = s.split(' ');
    const space = ctx.measureText(' ').width;
    const ws = words.map((w) => ctx.measureText(w).width);
    const textW = ws.reduce((a, b) => a + b, 0) + space * (words.length - 1);
    let x = 960 - (textW + 38 + 26) / 2 + 38 + 26;
    const ent = String(o.entity || '').toLowerCase();
    for (let i = 0; i < words.length; i++) {
      const j = words[i].toLowerCase().indexOf(ent);
      if (ent && j >= 0) {
        const pre = ctx.measureText(words[i].slice(0, j)).width;
        return { x: x + pre, w: ctx.measureText(words[i].slice(j, j + ent.length)).width, y: L.qY };
      }
      x += ws[i] + space;
    }
    return { x: 960, w: 0, y: L.qY };
  }
  function queryGeometry(S, A, B, L, q) {
    const p0 = { x: q.x + q.w / 2, y: q.y + 16 };
    // land on the card's top edge, straight above the matching word (never through the card's text)
    const end = (m) => { const sp = m.spans[0]; return { x: sp ? sp.x + sp.w / 2 : m.x + m.w / 2, y: m.y - 2 }; };
    const ea = end(A), eb = end(B);
    // run level in the gap between the tier row and the cards, so the lines never cross any text
    const yRun = Math.round((L.tierY + 16 + Math.min(A.y, B.y)) / 2);
    const mk = (e) => route(p0, yRun, e, 22);
    return { ca: mk(ea), cb: mk(eb), q, tp: S.tc + S.pl * 0.5 };
  }
  function drawQueryPorts(ctx, t, S, P, GQ) {
    const k = outCubic(prog(t, S.tc - 0.04, 0.12));
    if (k <= 0) return;
    ctx.save();
    ctx.fillStyle = css(P.accent);
    for (const cv of [GQ.ca, GQ.cb]) { ctx.beginPath(); ctx.arc(cv.p3.x, cv.p3.y, 6.5 * k, 0, TAU); ctx.fill(); }
    ctx.restore();
  }
  function drawQueryUnderline(ctx, t, S, P, q) {
    const k = outExpo(prog(t, S.ln - 0.05, 0.18));
    if (k <= 0) return;
    ctx.save();
    ctx.fillStyle = css(P.accent);
    ctx.fillRect(q.x, q.y + 12, q.w * k, 4);
    ctx.restore();
  }

  // 4. lines from each card converge on the entity node; the connection lights
  function drawLines(ctx, t, S, P, G) {
    if (t < S.ln) return;
    // accelerate into contact: a little start velocity, most of the speed arrives at the node
    const x = prog(t, S.ln, S.lnd);
    const p = 0.22 * x + 0.78 * x * x * x;
    const c = t >= S.tc;
    const lit = outCubic(prog(t, S.tc, S.pl * 0.5));                // front running back to the cards
    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const cv of [G.ca, G.cb]) {
      // searching: thin, translucent accent (fully covered once the light has run back out)
      if (lit < 1) {
        ctx.strokeStyle = css(P.accent, 0.45);
        ctx.lineWidth = 2.5;
        strokeRange(ctx, cv, 0, p);
      }
      if (!c) {
        // travelling head — eases in once it has left the port, so the two never read as a double dot
        const hd = at(cv, p);
        const ha = smooth((p * cv.total - 10) / 30);
        ctx.fillStyle = css(P.accent, ha);
        ctx.beginPath(); ctx.arc(hd.x, hd.y, 5.5, 0, TAU); ctx.fill();
      } else {
        // connected: full-strength line runs from the node back out to the card, a bright head on its front
        ctx.strokeStyle = css(P.accent);
        ctx.lineWidth = 4;
        strokeRange(ctx, cv, 1 - lit, 1);
        if (lit < 1) {
          const hd = at(cv, 1 - lit);
          ctx.fillStyle = css(P.accent);
          ctx.beginPath(); ctx.arc(hd.x, hd.y, 7, 0, TAU); ctx.fill();
        }
      }
    }
    ctx.restore();
  }

  // anchors where the lines leave the cards (drawn over the card edge); each answers the light with one ring
  function drawPorts(ctx, t, S, P, G) {
    const k = outCubic(prog(t, S.ln - 0.06, 0.16));
    if (k <= 0) return;
    const ring = prog(t, G.tp, 0.45);
    ctx.save();
    for (const q of [G.pa, G.pb]) {
      if (ring > 0 && ring < 1) {
        ctx.strokeStyle = css(P.accent, 0.55 * (1 - ring));
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(q.x, q.y, 7 + 26 * outCubic(ring), 0, TAU); ctx.stroke();
      }
      ctx.fillStyle = css(P.accent);
      ctx.beginPath(); ctx.arc(q.x, q.y, 6.5 * k, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }

  // the entity node: waits dim while the lines travel, draws in a breath just before contact, then fills
  function drawNode(ctx, t, o, S, P, th, G) {
    if (t < S.ln) return;
    const { nx, ny } = G;
    const R = NODE_R;
    const c = t >= S.tc;
    const appear = outCubic(prog(t, S.ln, S.lnd * 0.45));
    const inhale = c ? 0 : smooth(prog(t, S.tc - Math.min(0.22, S.lnd * 0.4), Math.min(0.22, S.lnd * 0.4)));
    const tau = t - S.tc;
    const pop = c ? 1 + 0.13 * Math.exp(-tau * 8) * Math.sin(tau * 24) : 1 - 0.05 * inhale;
    const fill = c ? clamp(tau / 0.05) : 0;
    const r = R * lerp(0.82, 1, appear) * pop;
    ctx.save();
    ctx.globalAlpha *= appear;
    // one ring on contact
    const ring = prog(t, S.tc, S.pl * 1.1);
    if (c && ring < 1) {
      ctx.strokeStyle = css(P.accent, 0.5 * (1 - ring) * (1 - ring));
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(nx, ny, R + 120 * outCubic(ring), 0, TAU); ctx.stroke();
    }
    // a slow breath while a long version holds
    if (!S.brief && c) {
      const hold = smooth((tau - S.pl) / 0.8);
      if (hold > 0) {
        const b = 0.5 - 0.5 * Math.cos((tau - S.pl) * TAU / 2.8);
        ctx.strokeStyle = css(P.accent, hold * (0.10 + 0.12 * b));
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(nx, ny, R + 13 + 5 * b, 0, TAU); ctx.stroke();
      }
    }
    // body
    ctx.beginPath(); ctx.arc(nx, ny, r, 0, TAU);
    ctx.fillStyle = th.bg; ctx.fill();
    if (fill > 0) { ctx.fillStyle = css(P.accent, fill); ctx.fill(); }
    ctx.lineWidth = 2;
    ctx.strokeStyle = css(mix(mix(P.muted, P.accent, inhale), P.accent, fill));
    ctx.stroke();
    // label (dark ink on the accent fill in every theme)
    const ink = th.name === 'dark' ? P.bg : P.text;
    ctx.font = F.node(); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = css(mix(P.muted, ink, fill));
    ctx.translate(nx, ny + 1); ctx.scale(pop, pop); ctx.fillText(o.entity, 0, 0);
    ctx.restore();
  }

  // caption under the node (long version only)
  function drawCaption(ctx, t, S, P, G) {
    if (S.brief) return;
    const ca = smooth(prog(t, S.tc + S.pl * 0.35, 0.6));
    if (ca <= 0) return;
    ctx.save();
    ctx.font = F.cap(); ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = css(P.muted, ca);
    ctx.fillText('one shared entity', G.nx, G.ny + NODE_R + 46 - (1 - ca) * 6);
    ctx.restore();
  }

  // 5. the answer comes out under the node: word by word, each settles in weight while dropping into place
  // the largest size / narrowest measure that keeps the answer inside the frame (last baseline ≤ 980)
  const ANSWER_FITS = [[60, 1320], [60, 1500], [54, 1500], [54, 1640], [48, 1640], [44, 1680]];
  function fitAnswer(ctx, s, y0, wFinal) {
    let best = null;
    for (const [px, mw] of ANSWER_FITS) {
      const lh = Math.round(px * 1.23);
      const maxLines = Math.max(1, 1 + Math.floor((980 - y0) / lh));
      const lay = centeredLines(ctx, s, mw, V.display(px, wFinal), 960, y0, lh);
      best = { px, lay };
      if (lay.n <= maxLines) break;
    }
    return best;
  }
  function drawAnswer(ctx, t, o, S, P, th, y0) {
    if (t < S.an) return;
    const wFinal = th.name === 'dark' ? 500 : 560;
    const { px, lay } = fitAnswer(ctx, o.answer, y0, wFinal);
    const font = (w) => V.display(px, w);
    const n = lay.words.length;
    const per = S.and / (n + 3);
    ctx.save();
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    if (t >= S.an + (n - 1) * per + per * 4.5) {        // settled: one run per line
      ctx.font = font(wFinal);
      ctx.fillStyle = css(P.accent);
      for (let li = 0; li < lay.n; li++) {
        const ws = lay.words.filter((w) => w.line === li);
        ctx.fillText(ws.map((w) => w.s).join(' '), ws[0].x, ws[0].y);
      }
      ctx.restore();
      return;
    }
    for (const wd of lay.words) {
      const t0 = S.an + wd.i * per;
      const lk = (t - t0) / (per * 4.5);
      if (lk <= 0) continue;
      const k = outExpo(lk);
      ctx.font = font(Math.round(lerp(250, wFinal, k) / 10) * 10);    // quantised: glyph cache hits
      ctx.fillStyle = css(P.accent, smooth(lk * 1.7));
      ctx.fillText(wd.s, wd.x, wd.y - (1 - outQuart(lk)) * 14);
    }
    ctx.restore();
  }

  // ------------------------------------------------------------------ draw
  function opts(o) {
    o = o || {};
    const r = Object.assign({}, DEFAULTS, o);
    r.factA = Object.assign({}, DEFAULTS.factA, o.factA || {});
    r.factB = Object.assign({}, DEFAULTS.factB, o.factB || {});
    r.tiers = Array.isArray(o.tiers) && o.tiers.length >= 2 ? o.tiers : DEFAULTS.tiers;
    r.dur = Math.max(0.6, +r.dur || DEFAULTS.dur);
    r.top = +r.top >= 0 ? +r.top : DEFAULTS.top;
    r.link = o.link === 'query' ? 'query' : 'node';
    r.sizes = Object.assign({ tier: 28, meta: 26, fact: 34 }, o.sizes || {});
    return r;
  }

  function draw(ctx, t, o0) {
    if (t < 0) return;
    const o = opts(o0);
    SZ = o.sizes;
    const th = V.theme(o.theme);
    const P = PAL[th.name] || PAL.dark;
    const S = schedule(o.dur);
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.filter = 'none';
    // never inherit the caller's text/line state
    ctx.letterSpacing = '0px'; ctx.wordSpacing = '0px'; ctx.direction = 'ltr'; ctx.setLineDash([]);
    ctx.lineCap = 'butt'; ctx.lineJoin = 'miter';

    if (o._preview) {  // lab only: the film's headline, to judge the composition
      ctx.save(); ctx.letterSpacing = '-2.4px';
      V.text(ctx, String(o._preview), 120, 170, V.display(120, 600), th.text);
      ctx.restore();
    }

    const L = layout(ctx, o, S);
    // both cards share one width that hugs the longer text — the narrower they are, the further apart they sit
    const tA = cardText(ctx, o.factA), tB = cardText(ctx, o.factB);
    const cw = Math.round(clamp(Math.max(tA.w, tB.w) + CARD_PAD * 2 + 6, CARD_MIN, CARD_W));
    // equal heights so the pair reads as a matched set
    const ch = cardH(Math.max(tA.lines.length, tB.lines.length));
    const A = cardModel(ctx, o.factA, MARGIN, L.cardY, cw, o, tA.lines, ch);
    const B = cardModel(ctx, o.factB, 1920 - MARGIN - cw, L.cardY, cw, o, tB.lines, ch);
    const G = geometry(S, A, B, L);
    const Q = o.link === 'query' ? questionSpan(ctx, o, L) : null;
    const GQ = Q ? queryGeometry(S, A, B, L, Q) : null;
    L.qMid = Math.round(G.cy + 20);
    const ansY = G.ny + NODE_R + (S.brief ? 94 : 130) * Math.min(1, L.k);

    drawQuestion(ctx, t, o, S, L, P);
    drawTiers(ctx, t, o, S, L, P);
    if (GQ) {
      drawCard(ctx, t, o, S, P, th, A, o.factA, -1, S.ca, G);
      drawCard(ctx, t, o, S, P, th, B, o.factB, +1, S.cb, G);
      drawLines(ctx, t, S, P, GQ);
      drawQueryPorts(ctx, t, S, P, GQ);
      drawQueryUnderline(ctx, t, S, P, Q);
    } else {
      drawLines(ctx, t, S, P, G);
      drawCard(ctx, t, o, S, P, th, A, o.factA, -1, S.ca, G);
      drawCard(ctx, t, o, S, P, th, B, o.factB, +1, S.cb, G);
      drawPorts(ctx, t, S, P, G);
      drawNode(ctx, t, o, S, P, th, G);
      drawCaption(ctx, t, S, P, G);
    }
    drawAnswer(ctx, t, o, S, P, th, ansY);

    ctx.restore();
  }

  V.components.memory = { draw, schedule, DEFAULTS };
})();
