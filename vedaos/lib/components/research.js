// VEDAOS film component: research — the "RESEARCHES" explainer (Research Panther). Full-frame, 1920×1080 film space.
//
// The real pipeline (S38–S44, verified on an 18-minute live run), told as one growing diagram that reads
// left → right, process → result:
//   1. the question sets in, top-left, in Fraunces;
//   2. PLANNING — a trunk drops from the question and the sub-questions peel off it one by one (cycle 1);
//   3. FETCHING — every sub-question's query line converges on one hub, which fans out to all the source
//      domains AT ONCE: six rays draw together and six progress rings fill side by side (parallel URL fetching);
//   4. a saturation readout per cycle ("Cycle 2 · saturation 0.68") on a meter with the 0.85 threshold marked;
//   5. the GAP CRITIC flags what is missing — a dashed brick branch: "Gap: no data above 60 °C";
//   6. a BONUS CYCLE rewrites that gap into a new branch (accent) and fetches again; saturation crosses 0.85;
//   7. SYNTHESIS — the sources are drawn back into the hub and the synthesis card opens out of it.
//
// draw(ctx, t, o) — t in seconds (t < 0 draws nothing; t past the end holds the final frame).
// Choreography scales with o.dur: ~1.6 s is the montage slam (essentials, every beat compressed, the card
// resolved by ~0.75·dur so it can be read); 9 s is the narrative pillar (unhurried, the gap critic's words
// readable, ~1.4 s breathing hold on the synthesis). Anything between blends; longer stretches gently.
// The final frame is the same composition at every duration.
//
// Options (all optional):
//   theme       'dark' | 'cream' | 'light'                      default 'dark'
//   dur         number, seconds the whole story takes            default 1.6
//   top         px kept clear at the top for the film headline   default 200
//   question    string                                           default 'Why do solid-state batteries fail?'
//   subs        string[] sub-questions planned in cycle 1        default 4 battery sub-questions
//   sources     string[] domain chips fetched in parallel        default 6 domains
//   gap         string — what the gap critic flags ('' = none)   default 'Gap: no data above 60 °C'
//   bonus       string — the branch the bonus cycle adds         default 'Thermal runaway above 60 °C'
//   saturation  number[] one value per cycle; with gap+bonus the LAST cycle is the bonus cycle
//                                                                default [0.41, 0.68, 0.89]
//   threshold   number — saturation that ends the research       default 0.85
//   synthesis   { title, text }                                  default 'Synthesis · 3 cycles · 23 sources', …
//   _preview    lab only: draws a stand-in headline at the film's spot to judge the composition
//
// Pure function of t: no randomness, no clock, no module state mutated during draw.
(function () {
  'use strict';
  const V = window.V;
  const TAU = Math.PI * 2;
  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const lerp = (a, b, k) => a + (b - a) * k;
  const prog = (t, a, d) => (d <= 0 ? (t >= a ? 1 : 0) : clamp((t - a) / d));
  const smooth = (x) => { x = clamp(x); return x * x * (3 - 2 * x); };
  const outCubic = (x) => 1 - Math.pow(1 - clamp(x), 3);
  const outQuart = (x) => 1 - Math.pow(1 - clamp(x), 4);
  const outExpo = (x) => { x = clamp(x); return x >= 1 ? 1 : 1 - Math.pow(2, -10 * x); };
  const inOutCubic = (x) => { x = clamp(x); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
  const outBack = (x) => { x = clamp(x); const c1 = 1.5, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };

  // ------------------------------------------------------------------ colour (theme tokens only, parsed once at load)
  function parseCol(s) {
    if (s[0] === '#') { const c = V.hexRGB(s); return [c[0], c[1], c[2], 1]; }
    const m = s.match(/[\d.]+/g).map(Number);
    return [m[0], m[1], m[2], m.length > 3 ? m[3] : 1];
  }
  const KEYS = ['bg', 'text', 'muted', 'faint', 'line', 'glass', 'glassHi', 'accent', 'fail', 'success', 'shadow'];
  const PAL = {};
  for (const name of Object.keys(V.THEMES)) {
    PAL[name] = {};
    for (const key of KEYS) PAL[name][key] = parseCol(V.THEMES[name][key]);
  }
  const mix = (a, b, k) => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k), lerp(a[3], b[3], k)];
  // opaque blend of bg → text: lines that cross or overlap never double up
  const ink = (P, k) => mix(P.bg, [P.text[0], P.text[1], P.text[2], 1], k);
  const css = (c, a = 1) => `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${+(c[3] * a).toFixed(4)})`;

  // ------------------------------------------------------------------ defaults
  const DEFAULTS = {
    theme: 'dark',
    dur: 1.6,
    top: 200,
    question: 'Why do solid-state batteries fail?',
    subs: ['Dendrite growth at the interface', 'Contact loss during cycling', 'Defects at manufacturing scale', 'Sensitivity to temperature'],
    sources: ['nature.com', 'arxiv.org', 'sciencedirect.com', 'ieee.org', 'acs.org', 'mit.edu'],
    gap: 'Gap: no data above 60 °C',
    bonus: 'Thermal runaway above 60 °C',
    saturation: [0.41, 0.68, 0.89],
    threshold: 0.85,
    synthesis: {
      title: 'Synthesis · 3 cycles · 23 sources',
      text: 'Most failures start at the lithium–electrolyte interface — dendrites and contact loss, made worse by heat.',
    },
  };

  // ------------------------------------------------------------------ choreography
  // Event times (s), authored for the 1.6 s slam and for the 9 s pillar; other durations blend the two as
  // fractions of dur, longer than 9 s stretches gently and spends the rest holding.
  //   q   question sets in        tr  trunk drops, sub-questions peel off (planning)
  //   f1  first fetch cycle       f2  last regular cycle        fd  one cycle's length
  //   gp  gap critic flags        bn  bonus label rewrites the gap            f3  bonus cycle
  //   sy  synthesis (sources drawn into the hub, card opens out of it)
  const SHORT = { q: 0.0, qd: 0.08, tr: 0.0, trd: 0.26, f1: 0.22, f2: 0.40, fd: 0.16, gp: 0.55, gpd: 0.07,
    bn: 0.62, bnd: 0.07, f3: 0.66, sy: 0.8, syd: 0.4 };
  const LONG = { q: 0.15, qd: 0.55, tr: 0.55, trd: 1.0, f1: 1.75, f2: 2.8, fd: 0.9, gp: 3.95, gpd: 0.45,
    bn: 5.4, bnd: 0.4, f3: 5.95, sy: 6.9, syd: 1.0 };
  function schedule(D, nCycles, hasBonus) {
    const S = {};
    if (D <= 1.6) {
      for (const k in SHORT) S[k] = (SHORT[k] / 1.6) * D;
    } else if (D <= 9) {
      const k = smooth((D - 1.6) / (9 - 1.6));
      for (const key in SHORT) S[key] = lerp(SHORT[key] / 1.6, LONG[key] / 9, k) * D;
    } else {
      const s = 1 + 0.5 * (D / 9 - 1);
      for (const k in LONG) S[k] = LONG[k] * s;
    }
    S.ms = clamp(D / 9, 0.18, 1);           // micro-durations (pops, wipes) scale with the piece
    S.brief = D < 3;                          // essentials only: no breathing hold
    S.gapText = S.bn - S.gp >= 0.3;           // the gap critic's words only when there is time to read them
    // cycle start times: regular cycles spread over [f1, f2] (or [f1, f3] with no bonus), bonus cycle at f3
    const nC = Math.max(1, nCycles | 0);
    const nReg = hasBonus ? nC - 1 : nC;
    const b = hasBonus ? S.f2 : S.f3;
    S.cyc = [];
    for (let i = 0; i < nReg; i++) S.cyc.push(nReg === 1 ? S.f1 : lerp(S.f1, b, i / (nReg - 1)));
    if (hasBonus) S.cyc.push(S.f3);
    const spacing = nReg > 1 ? (b - S.f1) / (nReg - 1) : S.fd * 2;
    S.cd = Math.min(S.fd, spacing * 0.92);   // one cycle's length (squeezed when many regular cycles)
    S.end = S.sy + S.syd;
    S.D = D;
    return S;
  }
  // phases inside one fetch cycle, as [start, length] fractions of S.cd
  const PH = { cv: [0, 0.36], ry: [0.30, 0.26], ch: [0.48, 0.52], tk: [0.86, 0.36] };

  // ------------------------------------------------------------------ type
  const F = {
    q: (w = 460) => V.display(58, w),
    sub: (w = 500) => V.ui(32, w),
    chip: () => V.ui(26, 500),
    pill: () => V.ui(26, 600),
    ro: (w) => V.ui(30, w),
    tick: () => V.ui(26, 500),
    title: () => V.ui(26, 550),
    syn: (w, px = 48) => V.display(px, w),
  };

  // balanced wrap (greedy at the narrowest width that keeps the greedy line count); returns [[{w,x,width}]]
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
    const raw = String(s || '').trim().split(/\s+/).filter(Boolean);
    const toks = [];
    for (const w of raw) {            // an em/en dash stays at the end of its line, never starts one
      const prev = toks[toks.length - 1];
      if (prev && /^[—–]$/.test(w)) toks[toks.length - 1] = prev + ' ' + w; else toks.push(w);
    }
    if (!toks.length) return [];
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

  // ------------------------------------------------------------------ geometry helpers
  // Paths carry an arc-length table (partial strokes travel at even speed) and a native form used when the
  // whole path is drawn. add() appends to the current path so lines of one style batch into one stroke.
  function poly(pts, full) {
    const len = [0];
    for (let i = 1; i < pts.length; i++) len.push(len[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
    return { pts, len, total: len[len.length - 1] || 1e-6, full };
  }
  function bez(p0, c1, c2, p3, N = 28) {
    const pts = [];
    for (let i = 0; i <= N; i++) {
      const u = i / N, v = 1 - u;
      pts.push({
        x: v * v * v * p0.x + 3 * v * v * u * c1.x + 3 * v * u * u * c2.x + u * u * u * p3.x,
        y: v * v * v * p0.y + 3 * v * v * u * c1.y + 3 * v * u * u * c2.y + u * u * u * p3.y,
      });
    }
    return poly(pts, (ctx) => { ctx.moveTo(p0.x, p0.y); ctx.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, p3.x, p3.y); });
  }
  function at(pl, f) {
    const L = clamp(f) * pl.total, n = pl.pts.length - 1;
    let i = 1;
    while (i < n && pl.len[i] < L) i++;
    const a = pl.pts[i - 1], b = pl.pts[i], seg = pl.len[i] - pl.len[i - 1] || 1;
    const k = clamp((L - pl.len[i - 1]) / seg);
    return { x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k), i };
  }
  function add(ctx, pl, f0, f1) {
    f0 = clamp(f0); f1 = clamp(f1);
    if (f1 - f0 <= 1e-4) return;
    if (f0 <= 0 && f1 >= 1 && pl.full) { pl.full(ctx); return; }
    const A = at(pl, f0), B = at(pl, f1);
    ctx.moveTo(A.x, A.y);
    for (let i = A.i; i < B.i; i++) ctx.lineTo(pl.pts[i].x, pl.pts[i].y);
    ctx.lineTo(B.x, B.y);
  }
  function strokePart(ctx, pl, f0, f1) {
    if (clamp(f1) - clamp(f0) <= 1e-4) return;
    ctx.beginPath(); add(ctx, pl, f0, f1); ctx.stroke();
  }
  // trunk elbow into a row: down the trunk, a rounded quarter turn, then straight to the row's dot
  function elbow(tx, y0, y, r, x1) {
    const pts = [{ x: tx, y: y0 }];
    const yb = y - r;
    if (yb > y0) pts.push({ x: tx, y: yb });
    for (let i = 1; i <= 8; i++) {
      const a = (i / 8) * (Math.PI / 2);
      pts.push({ x: tx + r - r * Math.cos(a), y: yb + r * Math.sin(a) });
    }
    pts.push({ x: x1, y });
    return poly(pts, (ctx) => { ctx.moveTo(tx, y0); ctx.arcTo(tx, y, tx + r, y, r); ctx.lineTo(x1, y); });
  }

  // ------------------------------------------------------------------ layout (film space, recomputed per call)
  const X0 = 120, XR = 1800;
  const DOT_R = 8, ELBOW_R = 22;
  const CHIP_H = 56, CHIP_PAD = 22, CHIP_DOT = 30;
  function layout(ctx, o) {
    const L = {};
    const avail = 1080 - o.top - 70;
    const k = clamp(avail / 810, 0.72, 1.1);
    L.k = k;

    // question (one line if it fits; balanced wrap otherwise)
    L.qLines = wrapBalanced(ctx, '“' + o.question + '”', 1180, F.q());
    L.qLH = 70;
    L.qY = o.top + 100 * k;
    const qLast = L.qY + (L.qLines.length - 1) * L.qLH;

    // tree
    L.tx = X0 + 14;                                 // trunk x, under the opening quote
    L.rootY = qLast + 36 * k;
    L.sx = L.tx + 78;                               // sub-question dots
    L.lx = L.sx + DOT_R + 22;                       // labels
    const nSubs = o.subs.length;
    L.nRows = nSubs + (o.hasBonus ? 1 : 0);
    const rs = 92 * k * Math.min(1, 4 / Math.max(1, L.nRows - 1));
    const row0 = qLast + 124 * k;
    L.rowY = [];
    for (let i = 0; i < L.nRows; i++) L.rowY.push(row0 + i * rs);
    L.cy = (L.rowY[0] + L.rowY[L.nRows - 1]) / 2;
    L.elbows = L.rowY.map((y, i) => elbow(L.tx, i < nSubs ? y - ELBOW_R : L.rowY[i - 1] - ELBOW_R, y, ELBOW_R, L.sx - DOT_R - 7));

    // row label extents (bonus row: label + "bonus" pill; the gap label may be wider than the bonus label)
    ctx.font = F.sub();
    L.labW = o.subs.map((s) => ctx.measureText(s).width);
    L.ends = L.labW.map((w) => L.lx + w);
    if (o.hasBonus) {
      L.bonusW = ctx.measureText(o.bonus).width;
      ctx.font = F.sub(550);
      L.gapW = ctx.measureText(o.gap).width;
      ctx.font = F.pill();
      L.pillW = ctx.measureText('bonus').width + 32;
      L.ends.push(L.lx + Math.max(L.gapW, L.bonusW + 18 + L.pillW));
    }
    const maxEnd = Math.max(...L.ends);

    // hub + source fan (chips on an arc around the hub, so every ray is about the same length)
    L.px = clamp(maxEnd + 130, 820, 1080);
    ctx.font = F.chip();
    const n = o.sources.length;
    // spacing: roomy for ≤ 6 chips; tighter for more, never closer than a chip and a gap; the fan stays
    // between the question and the readout
    const fanRoom = Math.max(0, (1080 - 190) - (qLast + 40) - CHIP_H);
    const cs = Math.max(CHIP_H + 8, Math.min(78 * k * Math.min(1, 5 / Math.max(1, n - 1)), fanRoom / Math.max(1, n - 1)));
    L.cy = clamp(L.cy, qLast + 40 + CHIP_H / 2 + cs * (n - 1) / 2, Math.max(qLast + 40, 1080 - 190 - CHIP_H / 2 - cs * (n - 1) / 2));
    const R = 420;
    L.chips = o.sources.map((s, j) => {
      const d = (j - (n - 1) / 2) * cs;
      const ax = L.px + Math.sqrt(Math.max(0, R * R - d * d)) - 120;
      return { s, x: ax, y: L.cy + d, w: CHIP_PAD + CHIP_DOT + ctx.measureText(s).width + CHIP_PAD };
    });
    L.rays = L.chips.map((c) => {
      const dx = c.x - 12 - L.px, dy = c.y - L.cy, d = Math.hypot(dx, dy) || 1;
      return poly([{ x: L.px + (dx / d) * 17, y: L.cy + (dy / d) * 17 }, { x: c.x - 12, y: c.y }]);
    });
    // query lines: each row's end converges on the hub
    L.cv = L.ends.map((ex, i) => {
      const p0 = { x: ex + 26, y: L.rowY[i] }, p3 = { x: L.px - 16, y: L.cy };
      const h = (p3.x - p0.x) * 0.55;
      return bez(p0, { x: p0.x + h, y: p0.y }, { x: p3.x - h * 0.9, y: p3.y }, p3);
    });

    // synthesis card, opening out of the hub
    L.cardX = L.px + 58;
    L.cardW = XR - L.cardX;
    L.cardPad = 44;
    L.synLines = wrapBalanced(ctx, o.synthesis.text, L.cardW - L.cardPad * 2, F.syn(500, o.synPx));
    L.synLH = Math.round(62 * o.synPx / 48);
    L.cardH = L.cardPad + 26 + 30 + L.synLines.length * L.synLH - Math.round(14 * o.synPx / 48) + L.cardPad;

    // saturation readout + meter, under the right half
    L.roX = L.cardX;
    L.roY = Math.min(1080 - 104, Math.max(L.cy + L.cardH / 2, L.chips[n - 1].y + CHIP_H / 2) + 86 * k);
    L.mY = L.roY + 30;
    L.mX0 = L.roX; L.mX1 = XR;
    return L;
  }

  // Layout is pure text measurement, recomputed on every draw (≈0.1–0.4 ms): no module-level cache, so no
  // module state is written during draw (contract rule 1).

  // ------------------------------------------------------------------ cycle state helpers
  function cycleAt(S, t) {
    let c = -1;
    for (let i = 0; i < S.cyc.length; i++) if (t >= S.cyc[i]) c = i;
    return c;
  }
  function satAt(S, o, t) {
    let v = 0;
    for (let i = 0; i < S.cyc.length; i++) {
      const t0 = S.cyc[i] + PH.tk[0] * S.cd, d = PH.tk[1] * S.cd;
      if (t < t0) break;
      v = lerp(i ? o.saturation[i - 1] : 0, o.saturation[i], outCubic(prog(t, t0, d)));
    }
    return v;
  }
  // the moment the readout passes the threshold (or null)
  function crossTime(S, o) {
    if (o.threshold == null) return null;
    for (let i = 0; i < S.cyc.length; i++) {
      const a = i ? o.saturation[i - 1] : 0, b = o.saturation[i];
      if (b >= o.threshold && a < o.threshold) {
        const q = (o.threshold - a) / Math.max(1e-6, b - a);          // outCubic⁻¹
        return S.cyc[i] + PH.tk[0] * S.cd + PH.tk[1] * S.cd * (1 - Math.cbrt(1 - q));
      }
    }
    return null;
  }

  // ------------------------------------------------------------------ 1. question
  function drawQuestion(ctx, t, o, S, L, P) {
    if (t < S.q) return;
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    if (t >= S.q + S.qd + 0.3 * S.ms + 0.05) {                    // settled: one run per line
      ctx.font = F.q(); ctx.fillStyle = css(P.text);
      L.qLines.forEach((ln, li) => ctx.fillText(ln.map((w) => w.w).join(' '), X0, L.qY + li * L.qLH));
      return;
    }
    // words land one after another, settling in weight as they drop into place
    let idx = 0;
    const total = L.qLines.reduce((a, l) => a + l.length, 0);
    L.qLines.forEach((ln, li) => {
      const y = L.qY + li * L.qLH;
      for (const wd of ln) {
        const t0 = S.q + (idx++ / total) * S.qd;
        const lk = (t - t0) / Math.max(0.05, S.qd * 0.4);
        if (lk <= 0) continue;
        // quantised in 40-steps DOWN from the settled weight, so the last step is exactly 460 (no pop when
        // the settled single run takes over)
        ctx.font = F.q(460 - Math.round((1 - outExpo(lk)) * 160 / 40) * 40);
        ctx.fillStyle = css(P.text, smooth(lk * 1.8));
        ctx.fillText(wd.w, X0 + wd.x, y - (1 - outQuart(lk)) * 10);
      }
    });
  }

  // ------------------------------------------------------------------ 2. tree: root, trunk, branches, labels
  function drawTree(ctx, t, o, S, L, P) {
    if (t < S.tr) return;
    const nSubs = o.subs.length;
    const brD = clamp(S.trd * 0.35, 0.07, 0.42);        // one branch's draw
    const lastY = L.rowY[nSubs - 1];
    const trunkLen = lastY - L.rootY;
    const trunkD = Math.max(0.05, S.trd - brD);
    const tReach = (i) => S.tr + trunkD * clamp((L.rowY[i] - ELBOW_R - L.rootY) / trunkLen);

    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const lineCol = css(ink(P, 0.5));

    // root
    const rk = outBack(prog(t, S.tr, 0.32 * S.ms + 0.04));
    ctx.fillStyle = css(P.accent);
    ctx.beginPath(); ctx.arc(L.tx, L.rootY, 7 * rk, 0, TAU); ctx.fill();

    // trunk + regular branches: one path, one stroke
    const ty = lerp(L.rootY, lastY - ELBOW_R, outCubic(prog(t, S.tr, trunkD)));
    ctx.strokeStyle = lineCol; ctx.lineWidth = 2.5;
    ctx.beginPath();
    if (ty > L.rootY + 9) { ctx.moveTo(L.tx, L.rootY + 9); ctx.lineTo(L.tx, ty); }
    for (let i = 0; i < nSubs; i++) add(ctx, L.elbows[i], 0, outCubic(prog(t, tReach(i), brD)));
    ctx.stroke();

    // dots: a ring pops as each branch arrives; all fill together when cycle 1's queries leave
    const fetched = S.cyc.length ? prog(t, S.cyc[0] + PH.cv[0] * S.cd, 0.12 * S.ms + 0.02) : 0;
    const popD = 0.28 * S.ms + 0.03;
    const allIn = t >= tReach(nSubs - 1) + brD * 0.7 + popD;
    if (allIn && fetched >= 1) {
      ctx.fillStyle = css(P.accent);
      ctx.beginPath();
      for (let i = 0; i < nSubs; i++) { ctx.moveTo(L.sx + DOT_R + 1.25, L.rowY[i]); ctx.arc(L.sx, L.rowY[i], DOT_R + 1.25, 0, TAU); }
      ctx.fill();
    } else {
      for (let i = 0; i < nSubs; i++) {
        const dk = outBack(prog(t, tReach(i) + brD * 0.7, popD));
        if (dk > 0) drawDot(ctx, L.sx, L.rowY[i], dk, fetched, P, P.accent);
      }
    }

    // labels wipe in behind their branches
    ctx.font = F.sub(); ctx.textBaseline = 'middle'; ctx.textAlign = 'left'; ctx.fillStyle = css(P.text);
    const wipeD = 0.5 * S.ms + 0.03;
    for (let i = 0; i < nSubs; i++) {
      const lw = outCubic(prog(t, tReach(i) + brD * 0.55, wipeD));
      if (lw >= 1) ctx.fillText(o.subs[i], L.lx, L.rowY[i] + 1);
      else if (lw > 0) wipeText(ctx, o.subs[i], L.lx, L.rowY[i] + 1, L.labW[i], lw);
    }

    if (o.hasBonus) drawGapRow(ctx, t, o, S, L, P);
  }

  function drawDot(ctx, x, y, k, fill, P, col, ring = 0.35) {
    const r = DOT_R * k;
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU);
    ctx.fillStyle = css(P.bg); ctx.fill();
    if (fill > 0) { ctx.fillStyle = css(col, fill); ctx.fill(); }
    ctx.lineWidth = 2.5 * k; ctx.strokeStyle = css(mix(P.muted, col, Math.max(fill, ring)));
    ctx.stroke();
  }
  // text revealed left → right by a clip, sliding the last few px into place (font/colour already set)
  function wipeText(ctx, s, x, y, w, k) {
    ctx.save();
    ctx.beginPath(); ctx.rect(x - 4, y - 40, (w + 8) * k + 1, 80); ctx.clip();
    ctx.fillText(s, x - (1 - k) * 16, y);
    ctx.restore();
  }

  // the gap critic's row, then the bonus cycle's rewrite of it
  function drawGapRow(ctx, t, o, S, L, P) {
    if (t < S.gp) return;
    const i = o.subs.length;
    const y = L.rowY[i];
    const pl = L.elbows[i];
    const g = outCubic(prog(t, S.gp, S.gpd * 0.6));
    const b = inOutCubic(prog(t, S.bn, S.bnd * 0.8));            // solid accent overdraw
    ctx.lineWidth = 2.5;
    if (b < 1) {
      ctx.setLineDash([9, 10]);
      ctx.strokeStyle = css(P.fail);
      strokePart(ctx, pl, b, g);
      ctx.setLineDash([]);
    }
    if (b > 0) { ctx.strokeStyle = css(P.accent); strokePart(ctx, pl, 0, b); }
    // dot: brick ring (empty) → accent, filled once the bonus cycle's queries leave
    const dk = outBack(prog(t, S.gp + S.gpd * 0.45, 0.26 * S.ms + 0.03));
    const fill = prog(t, S.cyc[S.cyc.length - 1] + PH.cv[0] * S.cd, 0.12 * S.ms + 0.02);
    if (dk > 0) drawDot(ctx, L.sx, y, dk, fill, P, b > 0.5 ? P.accent : P.fail, 1);
    // label: the gap (brick) wipes in; the bonus label then rewrites it behind an accent caret
    const lw = outCubic(prog(t, S.gp + S.gpd * 0.45, 0.45 * S.ms + 0.03));
    const rwD = 0.4 * S.ms + 0.04, rw0 = S.bn + S.bnd * 0.3;
    const rw = inOutCubic(prog(t, rw0, rwD));
    const outD = 0.16 * S.ms + 0.02;
    const gapOut = smooth(prog(t, rw0 - outD, outD));                  // the gap clears, then the caret types
    ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    const span = L.bonusW + 24;
    const edge = L.lx - 6 + span * rw;
    if (lw > 0 && gapOut < 1 && S.gapText) {
      ctx.save();
      ctx.beginPath(); ctx.rect(L.lx - 6, y - 40, (L.gapW + 10) * lw + 10, 80); ctx.clip();
      ctx.font = F.sub(550); ctx.fillStyle = css(P.fail, 1 - gapOut);
      ctx.fillText(o.gap, L.lx - (1 - lw) * 16 - gapOut * 10, y + 1);
      ctx.restore();
    }
    ctx.font = F.sub(); ctx.fillStyle = css(P.text);
    if (rw >= 1) ctx.fillText(o.bonus, L.lx, y + 1);
    else if (rw > 0) {
      ctx.save();
      ctx.beginPath(); ctx.rect(L.lx - 6, y - 40, edge - (L.lx - 6), 80); ctx.clip();
      ctx.fillText(o.bonus, L.lx, y + 1);
      ctx.restore();
      ctx.fillStyle = css(P.accent); ctx.fillRect(edge - 1.5, y - 22, 3, 44);
    }
    // "bonus" pill pops (from its centre) as the rewrite lands
    const pt = prog(t, S.bn + S.bnd * 0.3 + rwD * 0.8, 0.3 * S.ms + 0.03);
    if (pt > 0) {
      const pk = lerp(0.6, 1, outBack(pt)), ph = 40, pw = L.pillW;
      ctx.save();
      ctx.globalAlpha *= smooth(pt * 2.2);
      ctx.translate(L.lx + L.bonusW + 18 + pw / 2, y); if (pk !== 1) ctx.scale(pk, pk);
      V.rr(ctx, -pw / 2, -ph / 2, pw, ph, ph / 2);
      ctx.fillStyle = css(P.accent, 0.12); ctx.fill();
      ctx.lineWidth = 1.5; ctx.strokeStyle = css(P.accent, 0.8); ctx.stroke();
      ctx.font = F.pill(); ctx.fillStyle = css(P.accent); ctx.textAlign = 'center';
      ctx.fillText('bonus', 0, 1);
      ctx.restore();
    }
  }

  // ------------------------------------------------------------------ 3. fetch: query lines → hub → rays → chips
  function drawFetch(ctx, t, o, S, L, P, th) {
    if (!S.cyc.length || t < S.cyc[0]) return;
    const nC = S.cyc.length;
    const absorb = prog(t, S.sy, S.syd * 0.3);             // synthesis: sources drawn back into the hub
    const ab = inOutCubic(absorb);
    const lineCol = css(ink(P, 0.32));
    const cvD = PH.cv[1] * S.cd, ryD = PH.ry[1] * S.cd;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';

    // query lines: one per row (the bonus row's line first draws in the bonus cycle), batched
    const c0 = (i) => (o.hasBonus && i === o.subs.length ? nC - 1 : 0);
    ctx.lineWidth = 2; ctx.strokeStyle = lineCol;
    ctx.beginPath();
    for (let i = 0; i < L.cv.length; i++) if (t >= S.cyc[c0(i)]) add(ctx, L.cv[i], 0, outCubic(prog(t, S.cyc[c0(i)], cvD)));
    // rays: draw out from the hub in cycle 1, retract into it at synthesis
    const r0 = S.cyc[0] + PH.ry[0] * S.cd;
    const rd = outCubic(prog(t, r0, ryD)) * (1 - ab);
    if (rd > 0) for (const ray of L.rays) add(ctx, ray, 0, rd);
    ctx.stroke();

    // each cycle: a bright comet runs along every query line, then every ray, all at once
    ctx.strokeStyle = css(P.accent); ctx.lineWidth = 3;
    ctx.beginPath();
    let any = false;
    for (let c = 0; c < nC; c++) {
      const p = prog(t, S.cyc[c], cvD);
      if (p > 0 && p < 1) {
        const f = outCubic(p) * 1.25;
        for (let i = 0; i < L.cv.length; i++) if (c >= c0(i)) { add(ctx, L.cv[i], f - 0.3, f); any = true; }
      }
      const q = prog(t, S.cyc[c] + PH.ry[0] * S.cd, ryD);
      if (q > 0 && q < 1) {
        const f = outCubic(q) * 1.3;
        for (const ray of L.rays) { add(ctx, ray, f - 0.35, Math.min(f, 1 - ab)); any = true; }
      }
    }
    if (any) ctx.stroke();

    if (absorb < 1) drawChips(ctx, t, S, L, P, th, ab, r0 + ryD * 0.7);

    // hub (over the line ends): pops when the first queries arrive, one ring per cycle,
    // swells as it takes the sources in, breathes slowly while a long version holds
    const hubIn = outBack(prog(t, S.cyc[0] + cvD * 0.85, 0.3 * S.ms + 0.03));
    let pulse = 0;
    for (let c = 0; c < nC; c++) {
      const u = t - (S.cyc[c] + cvD * 0.9);
      if (u > 0) pulse = Math.max(pulse, Math.exp(-u * 6 / Math.max(0.4, S.ms)));
    }
    const gulp = Math.sin(Math.PI * smooth(prog(t, S.sy + S.syd * 0.12, S.syd * 0.3)));
    if (pulse > 0.01) {
      ctx.strokeStyle = css(P.accent, 0.5 * pulse);
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(L.px, L.cy, 12 + (1 - pulse) * 30, 0, TAU); ctx.stroke();
    }
    if (!S.brief && t > S.end) {
      const hold = smooth((t - S.end) / 0.8);
      const b = 0.5 - 0.5 * Math.cos((t - S.end) * TAU / 3);
      ctx.strokeStyle = css(P.accent, hold * (0.14 + 0.14 * b));
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(L.px, L.cy, 20 + 4 * b, 0, TAU); ctx.stroke();
    }
    ctx.fillStyle = css(P.accent);
    ctx.beginPath(); ctx.arc(L.px, L.cy, 11 * hubIn * (1 + 0.35 * gulp), 0, TAU); ctx.fill();
  }

  // the source chips: all six fetch at once, each progress ring at its own speed
  function drawChips(ctx, t, S, L, P, th, ab, tIn) {
    const ck = outCubic(prog(t, tIn, 0.3 * S.ms + 0.03));
    if (ck <= 0) return;
    const nC = S.cyc.length;
    const sc = lerp(1, 0.35, ab) * lerp(0.9, 1, ck);
    const alpha = smooth(ck * 1.6) * (1 - smooth(ab * 1.25));
    if (alpha <= 0.002) return;
    const push = (1 - ck) * 26;                                   // pushed out along its ray as it lands
    const still = sc === 1 && alpha === 1 && push === 0;
    const accentLine = css(mix(P.line, [P.accent[0], P.accent[1], P.accent[2], 0.75], 1));
    const st = L.chips.map((c, j) => {
      let ring = -1, done = 0;
      for (let k = 0; k < nC; k++) {
        const a = S.cyc[k] + PH.ch[0] * S.cd;
        if (t < a) break;
        const p = prog(t, a, PH.ch[1] * S.cd * (0.62 + 0.38 * V.hash(j, k, 7)));
        if (p < 1) ring = p; else { done = 1; ring = -1; }
      }
      return { ring, done };
    });
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.font = F.chip(); ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    if (still) {
      // batched: glass, borders by state, dots, text
      ctx.beginPath();
      for (const c of L.chips) { ctx.roundRect(c.x, c.y - CHIP_H / 2, c.w, CHIP_H, CHIP_H / 2); }
      ctx.fillStyle = th.glass; ctx.fill();
      ctx.lineWidth = 1.5;
      for (const active of [0, 1]) {
        ctx.beginPath();
        let n = 0;
        L.chips.forEach((c, j) => { if ((st[j].ring >= 0) === !!active) { ctx.roundRect(c.x, c.y - CHIP_H / 2, c.w, CHIP_H, CHIP_H / 2); n++; } });
        if (n) { ctx.strokeStyle = active ? accentLine : css(P.line); ctx.stroke(); }
      }
      L.chips.forEach((c, j) => chipStatus(ctx, c.x + CHIP_PAD + 8, c.y, st[j], P));
      L.chips.forEach((c, j) => {
        ctx.fillStyle = css(st[j].done || st[j].ring >= 0 ? P.text : P.muted);
        ctx.fillText(c.s, c.x + CHIP_PAD + CHIP_DOT, c.y + 1);
      });
    } else {
      L.chips.forEach((c, j) => {
        ctx.save();
        const dx = c.x - L.px, dy = c.y - L.cy, d = Math.hypot(dx, dy) || 1;
        ctx.translate(lerp(c.x, L.px, ab) - (dx / d) * push, lerp(c.y, L.cy, ab) - (dy / d) * push); ctx.scale(sc, sc);
        V.rr(ctx, 0, -CHIP_H / 2, c.w, CHIP_H, CHIP_H / 2);
        ctx.fillStyle = th.glass; ctx.fill();
        ctx.lineWidth = 1.5; ctx.strokeStyle = st[j].ring >= 0 ? accentLine : css(P.line); ctx.stroke();
        chipStatus(ctx, CHIP_PAD + 8, 0, st[j], P);
        ctx.fillStyle = css(st[j].done || st[j].ring >= 0 ? P.text : P.muted);
        ctx.fillText(c.s, CHIP_PAD + CHIP_DOT, 1);
        ctx.restore();
      });
    }
    ctx.restore();
  }
  // status mark: progress ring while fetching, a solid dot once fetched, an empty ring before
  function chipStatus(ctx, x, y, s, P) {
    if (s.ring >= 0) {
      ctx.lineWidth = 2.5; ctx.strokeStyle = css(P.faint);
      ctx.beginPath(); ctx.arc(x, y, 8, 0, TAU); ctx.stroke();
      ctx.strokeStyle = css(P.accent); ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(x, y, 8, -Math.PI / 2, -Math.PI / 2 + TAU * Math.max(0.02, s.ring)); ctx.stroke();
    } else if (s.done) {
      ctx.fillStyle = css(P.accent);
      ctx.beginPath(); ctx.arc(x, y, 6, 0, TAU); ctx.fill();
    } else {
      ctx.lineWidth = 2.5; ctx.strokeStyle = css(P.faint);
      ctx.beginPath(); ctx.arc(x, y, 8, 0, TAU); ctx.stroke();
    }
  }

  // ------------------------------------------------------------------ 4. saturation readout + meter
  function drawReadout(ctx, t, o, S, L, P) {
    if (!S.cyc.length || t < S.cyc[0]) return;
    const appear = outCubic(prog(t, S.cyc[0], 0.4 * S.ms + 0.03));
    const ci = cycleAt(S, t);
    const v = satAt(S, o, t);
    const thr = o.threshold;
    const tc = crossTime(S, o);
    const crossed = tc == null ? 0 : smooth(prog(t, tc, 0.12 * S.ms + 0.02));
    ctx.save();
    ctx.globalAlpha *= appear;
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    // "Cycle N · saturation 0.XX" — the number in fixed digit slots so it never jitters while it counts
    let x = L.roX;
    const y = L.roY;
    // "Cycle N": the number rolls up when a new cycle starts
    ctx.font = F.ro(600); ctx.fillStyle = css(P.text);
    ctx.fillText('Cycle ', x, y);
    x += ctx.measureText('Cycle ').width;
    const num = String(ci + 1), nw = ctx.measureText(num).width;
    const rk = ci > 0 ? outCubic(prog(t, S.cyc[ci], 0.3 * S.ms + 0.03)) : 1;
    if (rk >= 1) ctx.fillText(num, x, y);
    else {
      ctx.save();
      ctx.beginPath(); ctx.rect(x - 4, y - 34, Math.max(nw, ctx.measureText(String(ci)).width) + 8, 44); ctx.clip();
      ctx.fillStyle = css(P.text, 1 - rk); ctx.fillText(String(ci), x, y - rk * 30);
      ctx.fillStyle = css(P.text, rk); ctx.fillText(num, x, y + (1 - rk) * 30);
      ctx.restore();
    }
    x += nw;
    ctx.font = F.ro(450); ctx.fillStyle = css(P.muted);
    const mid = ' · saturation ';
    ctx.fillText(mid, x, y);
    x += ctx.measureText(mid).width;
    ctx.font = F.ro(650);
    const dw = ctx.measureText('0').width, pw = ctx.measureText('.').width;
    ctx.fillStyle = css(P.accent); ctx.textAlign = 'center';
    for (const ch of v.toFixed(2)) {
      const w = ch === '.' ? pw : dw;
      ctx.fillText(ch, x + w / 2, y);
      x += w;
    }

    // meter: faint track, accent fill, the threshold marked (and answered with one ring when crossed)
    const x0 = L.mX0, my = L.mY, w = L.mX1 - x0;
    const grow = outCubic(prog(t, S.cyc[0], 0.5 * S.ms + 0.04));
    ctx.fillStyle = css(P.faint);
    ctx.beginPath(); ctx.roundRect(x0, my - 3, w * grow, 6, 3); ctx.fill();
    if (v > 0) {
      // the fill, cut into one segment per cycle so each cycle's contribution stays visible
      ctx.fillStyle = css(P.accent);
      ctx.beginPath(); ctx.roundRect(x0, my - 3, Math.max(6, w * v), 6, 3); ctx.fill();
      ctx.fillStyle = css(P.bg);
      for (let i = 0; i < ci && i < o.saturation.length; i++) {
        const sv = o.saturation[i];
        if (v > sv + 0.008) ctx.fillRect(x0 + w * sv - 1.5, my - 4, 3, 8);
      }
    }
    if (thr == null) { ctx.restore(); return; }
    const tx = x0 + w * thr;
    if (tc != null && t > tc) {
      const r = prog(t, tc, 0.7 * S.ms + 0.1);
      if (r < 1) {
        ctx.strokeStyle = css(P.accent, 0.6 * (1 - r) * (1 - r)); ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(tx, my, 8 + 40 * outCubic(r), 0, TAU); ctx.stroke();
      }
    }
    ctx.fillStyle = css(mix(P.muted, P.accent, crossed));
    ctx.fillRect(tx - 1.25, my - 15, 2.5, 30);
    ctx.font = F.tick();
    ctx.fillText(thr.toFixed(2), tx, my + 50);
    ctx.restore();
  }

  // ------------------------------------------------------------------ 5. synthesis card
  function drawCard(ctx, t, o, S, L, P, th) {
    const t0 = S.sy + S.syd * 0.22;
    if (t < t0) return;
    const line = outExpo(prog(t, t0, S.syd * 0.2));                // a hairline shoots out of the hub…
    const open = outExpo(prog(t, t0 + S.syd * 0.14, S.syd * 0.3)); // …and the card opens around it
    const x0 = L.cardX, w = L.cardW, cy = L.cy, H = L.cardH;
    ctx.strokeStyle = css(P.accent); ctx.lineWidth = 2.5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(L.px + 12, cy); ctx.lineTo(lerp(L.px + 12, x0, Math.min(1, line * 1.6)), cy);
    if (open < 0.02) { ctx.moveTo(x0, cy); ctx.lineTo(x0 + w * line, cy); }
    ctx.stroke();
    if (open < 0.02) return;
    const h = Math.max(3, H * open), rad = Math.min(24, h / 2);
    ctx.beginPath(); ctx.roundRect(x0, cy - h / 2, w, h, rad);
    ctx.fillStyle = th.glass; ctx.fill();
    ctx.lineWidth = 1.5; ctx.strokeStyle = css(P.accent, lerp(1, 0.55, open)); ctx.stroke();
    const clip = open < 0.999;
    if (clip) { ctx.save(); ctx.clip(); }
    const y0 = cy - H / 2;
    const ts = t0 + S.syd * 0.36, td = S.syd * 0.42;             // the text lands over [ts, ts + td]
    // title, led by a small voice glyph: the synthesis is spoken aloud (spoken_summary), so its bars move
    // while Veda speaks and settle when she's done
    const tk = outCubic(prog(t, t0 + S.syd * 0.3, S.syd * 0.25));
    const ty = y0 + L.cardPad + 22 - (1 - tk) * 8;
    const quietD = 0.3 * S.ms + 0.05;                               // done speaking (settled) before dur
    const live = clamp((t - ts) / 0.08) * (1 - smooth(prog(t, Math.min(ts + td + 1.1 * S.ms, S.D - quietD - 0.02), quietD)));
    ctx.fillStyle = css(P.accent, tk);
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const env = [0.45, 0.8, 1, 0.75, 0.5][i];
      const nz = 0.5 + 0.5 * Math.sin(t * 17 + i * 1.9 + V.noise1(t * 4.5 + i, 23) * 2.4);
      const h = lerp([8, 14, 20, 13, 8][i], 6 + 22 * env * (0.3 + 0.7 * nz), live);
      ctx.roundRect(x0 + L.cardPad + i * 8, ty - 9 - h / 2, 4.5, h, 2.25);
    }
    ctx.fill();
    ctx.font = F.title(); ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = css(P.muted, tk);
    ctx.fillText(o.synthesis.title, x0 + L.cardPad + 54, ty);
    // text: words land one by one, settling in weight
    const wFinal = th.name === 'dark' ? 480 : 540;
    const lineY = (li) => y0 + L.cardPad + 26 + 30 + Math.round(41 * o.synPx / 48) + li * L.synLH;
    const n = L.synLines.reduce((a, l) => a + l.length, 0);
    const per = td / (n + 3);
    ctx.fillStyle = css(P.accent);
    if (t >= ts + (n - 1) * per + per * 4.5) {
      ctx.font = F.syn(wFinal, o.synPx);
      L.synLines.forEach((ln, li) => ctx.fillText(ln.map((wd) => wd.w).join(' '), x0 + L.cardPad, lineY(li)));
    } else {
      let i = 0;
      L.synLines.forEach((ln, li) => ln.forEach((wd) => {
        const lk = (t - (ts + i++ * per)) / (per * 4.5);
        if (lk <= 0) return;
        ctx.font = F.syn(wFinal - Math.round((1 - outExpo(lk)) * (wFinal - 280) / 40) * 40, o.synPx); // ends exactly on wFinal
        ctx.fillStyle = css(P.accent, smooth(lk * 1.7));
        ctx.fillText(wd.w, x0 + L.cardPad + wd.x, lineY(li) - (1 - outQuart(lk)) * 12);
      }));
    }
    if (clip) ctx.restore();
  }

  // ------------------------------------------------------------------ draw
  function opts(o) {
    o = o || {};
    const r = Object.assign({}, DEFAULTS, o);
    r.subs = Array.isArray(o.subs) && o.subs.length ? o.subs.map(String) : DEFAULTS.subs;
    r.sources = Array.isArray(o.sources) && o.sources.length ? o.sources.map(String) : DEFAULTS.sources;
    r.saturation = Array.isArray(o.saturation) && o.saturation.length ? o.saturation.map((v) => clamp(+v || 0)) : DEFAULTS.saturation;
    r.synthesis = Object.assign({}, DEFAULTS.synthesis, o.synthesis || {});
    r.dur = Math.max(0.6, +r.dur || DEFAULTS.dur);
    r.synPx = (o.sizes && +o.sizes.syn) || 48; // synthesis text size (film passes 60 for phone legibility)
    r.top = +r.top >= 0 ? +r.top : DEFAULTS.top;
    // null = no threshold mark: Research Panther has a saturation monitor, not a stopping threshold
    r.threshold = o.threshold === null ? null : clamp(+r.threshold || DEFAULTS.threshold);
    r.gap = r.gap ? String(r.gap) : '';
    r.bonus = r.bonus ? String(r.bonus) : '';
    r.hasBonus = !!(r.gap && r.bonus && r.saturation.length >= 2);
    return r;
  }

  function draw(ctx, t, o0) {
    if (t < 0) return;
    const o = opts(o0);
    const th = V.theme(o.theme);
    const P = PAL[th.name] || PAL.dark;
    const S = schedule(o.dur, o.saturation.length, o.hasBonus);
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.filter = 'none';
    ctx.setLineDash([]);
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
    if ('wordSpacing' in ctx) ctx.wordSpacing = '0px';
    ctx.direction = 'ltr';

    if (o._preview) {  // lab only: the film's headline, to judge the composition
      ctx.save(); if ('letterSpacing' in ctx) ctx.letterSpacing = '-2.4px';
      V.text(ctx, String(o._preview), 120, 170, V.display(120, 600), th.text);
      ctx.restore();
    }

    const L = layout(ctx, o);
    drawQuestion(ctx, t, o, S, L, P);
    drawFetch(ctx, t, o, S, L, P, th);
    drawTree(ctx, t, o, S, L, P);
    drawReadout(ctx, t, o, S, L, P);
    drawCard(ctx, t, o, S, L, P, th);
    ctx.restore();
  }

  V.components.research = { draw, schedule, DEFAULTS };
})();
