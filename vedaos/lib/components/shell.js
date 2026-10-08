// VEDAOS film component: shell — the recreated app window (S96/S98 layout), drawn in window units 1180×620.
// The caller places/scales it (camera). Draws the chrome only: window body + centre halo, flat topbar
// (state dot, "Veda", FOCUS MODE, theme pill, SETTINGS, session timer, minimise), the Conversation /
// Task Queue / Prajna glass cards (+ caps headers, + the queue's job-board rows), the log-strip glass and
// the thin bottom strip. It never draws the orb, transcript, log lines or prajna contents.
// Pure function of t. No module state is mutated during draw.
(function () {
  'use strict';
  const V = window.V;
  const W = 1180, H = 620, RADIUS = 16;
  const TOP_H = 52, BOTTOM_Y = 594;
  const COL_L = { x: 18, w: 320 }, COL_R = { x: 862, w: 300 };
  const CARD_TOP = 70, CARD_BOTTOM = 576, CARD_R = 14;
  const PRAJNA_MIN = 65, PRAJNA_MAX = 343;
  const ORB = { cx: 600, cy: 323, r: 150 };
  const INSET = 14;          // header / content inset inside cards
  const CONTENT_DY = 40;     // content starts 40 below card top

  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const lerp = (a, b, k) => a + (b - a) * k;
  const prog = (t, a, b) => clamp((t - a) / (b - a));
  const smooth = (x) => { x = clamp(x); return x * x * (3 - 2 * x); };

  // ------------------------------------------------------------------ layout
  // layout(o): the shared window layout (+ `pill`, the topbar theme pill: centre x/y, w, h and the three
  // button centres — text-measured, so it needs the fonts loaded; o.timer false/null moves it right).
  function layout(o) {
    const L = frame(o);
    L.pill = pillLayout(o || {});
    return L;
  }
  function frame(o) {
    o = o || {};
    const po = clamp(+o.prajnaOpen || 0);
    const ph = lerp(PRAJNA_MIN, PRAJNA_MAX, po);
    const py = CARD_BOTTOM - ph;
    return {
      window: { x: 0, y: 0, w: W, h: H, r: RADIUS },
      topbar: { x: 0, y: 0, w: W, h: TOP_H },
      conversation: { x: COL_L.x, y: CARD_TOP, w: COL_L.w, h: 390 },
      log: { x: COL_L.x, y: 472, w: COL_L.w, h: 104 },
      centre: { x: 356, y: CARD_TOP, w: 488, h: CARD_BOTTOM - CARD_TOP },
      orb: { cx: ORB.cx, cy: ORB.cy, r: ORB.r },
      queue: { x: COL_R.x, y: CARD_TOP, w: COL_R.w, h: py - 12 - CARD_TOP },
      prajna: { x: COL_R.x, y: py, w: COL_R.w, h: ph },
      bottom: { x: 0, y: BOTTOM_Y, w: W, h: H - BOTTOM_Y },
    };
  }

  // ------------------------------------------------------------------ icons (24-unit grid, stroked)
  const P = (d) => new Path2D(d);
  const f2 = (x) => (+x).toFixed(2);
  const ICON = {};
  (function buildIcons() {
    // sun: disc + 8 short rays
    let d = 'M16 12a4 4 0 1 1 -8 0a4 4 0 1 1 8 0';
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
      d += `M${f2(12 + c * 7)} ${f2(12 + s * 7)}L${f2(12 + c * 9.2)} ${f2(12 + s * 9.2)}`;
    }
    ICON.sun = P(d);
    // sunset: half sun on a horizon, three rays, a short reflection line below
    const cy = 16.6;
    d = `M2.4 ${cy}H21.6M6.6 ${cy}a5.4 5.4 0 0 1 10.8 0`;
    for (const deg of [-90, -145, -35]) {
      const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
      d += `M${f2(12 + c * 8.1)} ${f2(cy + s * 8.1)}L${f2(12 + c * 10.3)} ${f2(cy + s * 10.3)}`;
    }
    ICON.sunset = P(d);
    // moon: true crescent from two circles
    const c1x = 11.4, c1y = 12.6, r1 = 8.0, c2x = 16.6, c2y = 7.8, r2 = 6.9;
    const dx = c2x - c1x, dy = c2y - c1y, dd = Math.hypot(dx, dy), th = Math.atan2(dy, dx);
    const a = (r1 * r1 - r2 * r2 + dd * dd) / (2 * dd);
    const phi = Math.acos(clamp(a / r1, -1, 1)), psi = Math.acos(clamp((dd - a) / r2, -1, 1));
    const m = new Path2D();
    m.arc(c1x, c1y, r1, th + phi, th + Math.PI * 2 - phi, false);
    m.arc(c2x, c2y, r2, th + Math.PI + psi, th + Math.PI - psi, true);
    m.closePath();
    ICON.moon = m;
  })();
  function icon(ctx, path, cx, cy, size, color, lw) {
    const k = size / 24;
    ctx.save();
    ctx.translate(cx - size / 2, cy - size / 2);
    ctx.scale(k, k);
    ctx.strokeStyle = color; ctx.lineWidth = lw / k; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.stroke(path);
    ctx.restore();
  }

  // ------------------------------------------------------------------ text helpers
  // Tracked (letter-spaced) text; returns visual width (no trailing spacing).
  function tracked(ctx, s, x, y, font, color, track, align = 'left') {
    ctx.font = font;
    ctx.letterSpacing = track + 'px';
    const w = ctx.measureText(s).width - track;
    const x0 = align === 'right' ? x - w : align === 'center' ? x - w / 2 : x;
    ctx.textAlign = 'left';
    ctx.fillStyle = color;
    ctx.fillText(s, x0, y);
    ctx.letterSpacing = '0px';
    return w;
  }
  function trackedWidth(ctx, s, font, track) {
    ctx.font = font; ctx.letterSpacing = track + 'px';
    const w = ctx.measureText(s).width - track;
    ctx.letterSpacing = '0px';
    return w;
  }
  // Fixed-cell digits (canvas has no font-variant-numeric): every digit centred in a max-digit-width cell.
  function monoCells(ctx, font) {
    ctx.font = font;
    let dw = 0;
    for (let i = 0; i < 10; i++) dw = Math.max(dw, ctx.measureText(String(i)).width);
    return { dw: Math.ceil(dw * 10) / 10, cw: ctx.measureText(':').width + 1.6, pw: ctx.measureText('%').width };
  }
  const cellW = (ch, m) => (ch >= '0' && ch <= '9' ? m.dw : ch === ':' ? m.cw : m.pw);
  function monoWidth(s, m) { let w = 0; for (const ch of s) w += cellW(ch, m); return w; }
  // Draws `a` morphing into `b` (same length) by k (0..1): changed cells drift up and cross-fade.
  function monoText(ctx, a, b, k, x, y, font, color, m, align = 'left') {
    const w = monoWidth(a, m);
    let cx = align === 'right' ? x - w : align === 'center' ? x - w / 2 : x;
    ctx.font = font; ctx.fillStyle = color; ctx.textAlign = 'center';
    const A0 = ctx.globalAlpha;
    for (let i = 0; i < a.length; i++) {
      const cw = cellW(a[i], m), mid = cx + cw / 2;
      if (b && b[i] !== a[i] && k > 0) {
        const e = V.E.inOutCubic(k);
        ctx.globalAlpha = A0 * (1 - e); ctx.fillText(a[i], mid, y - 5 * e);
        ctx.globalAlpha = A0 * e; ctx.fillText(b[i], mid, y + 5 * (1 - e));
        ctx.globalAlpha = A0;
      } else ctx.fillText(a[i], mid, y);
      cx += cw;
    }
    return w;
  }
  function ellipsize(ctx, s, maxW) {
    if (ctx.measureText(s).width <= maxW) return s;
    let lo = 0, hi = s.length;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (ctx.measureText(s.slice(0, mid).trimEnd() + '…').width <= maxW) lo = mid; else hi = mid - 1; }
    return s.slice(0, lo).trimEnd() + '…';
  }
  const hms = (s) => {
    s = Math.max(0, Math.floor(s));
    const h = Math.floor(s / 3600) % 100, mm = Math.floor(s / 60) % 60, ss = s % 60;
    return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
  };

  // ------------------------------------------------------------------ pieces
  // Large rrect strokes rasterise slowly (whole-bbox path scan), so hairlines are drawn as four 1-unit
  // rects plus four tiny corner arcs, in a colour pre-composited over what lies beneath (opaque).
  const over = (c, under) => [0, 1, 2].map((i) => under[i] + (c[i] - under[i]) * c[3]);
  const rgbStr = (c) => `rgb(${c[0].toFixed(2)},${c[1].toFixed(2)},${c[2].toFixed(2)})`;
  function ring(ctx, x, y, w, h, r, color) {
    ctx.fillStyle = color;
    ctx.fillRect(x + r, y, w - 2 * r, 1);
    ctx.fillRect(x + r, y + h - 1, w - 2 * r, 1);
    ctx.fillRect(x, y + r, 1, h - 2 * r);
    ctx.fillRect(x + w - 1, y + r, 1, h - 2 * r);
    ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.lineCap = 'butt';
    const q = Math.PI / 2, rr = r - 0.5;
    ctx.beginPath(); ctx.arc(x + r, y + r, rr, 2 * q, 3 * q); ctx.stroke();
    ctx.beginPath(); ctx.arc(x + w - r, y + r, rr, 3 * q, 4 * q); ctx.stroke();
    ctx.beginPath(); ctx.arc(x + w - r, y + h - r, rr, 0, q); ctx.stroke();
    ctx.beginPath(); ctx.arc(x + r, y + h - r, rr, q, 2 * q); ctx.stroke();
  }
  // Card = hairline-coloured rrect + glass rrect inset by 1 (two fast opaque rrect fills; cheaper than
  // stroking a large rrect, which rasterises its whole bounding box).
  function card(ctx, r, cols) {
    if (cols.translucent) {
      V.rr(ctx, r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1, CARD_R - 0.5);
      ctx.fillStyle = cols.glass; ctx.fill();
      ctx.strokeStyle = cols.glassLine; ctx.lineWidth = 1; ctx.stroke();
      return;
    }
    V.rr(ctx, r.x, r.y, r.w, r.h, CARD_R); ctx.fillStyle = cols.glassLine; ctx.fill();
    V.rr(ctx, r.x + 1, r.y + 1, r.w - 2, r.h - 2, CARD_R - 1); ctx.fillStyle = cols.glass; ctx.fill();
  }
  function header(ctx, r, label, th) {
    ctx.textBaseline = 'alphabetic';
    tracked(ctx, label, r.x + INSET, r.y + 25, V.ui(12, 600), th.muted, 1.2);
  }

  // State dot: colour + motion per orb state.
  const STATE = {
    idle: { a: 0.55, ring: 0, period: 4.2, breathe: 0.06 },
    listening: { a: 1, ring: 1, period: 1.6, breathe: 0 },
    thinking: { a: 1, ring: 0, period: 1.3, breathe: 0.18 },
    speaking: { a: 1, ring: 1, period: 0.9, breathe: 0.08 },
    researching: { a: 1, ring: 2, period: 2.0, breathe: 0 },
    focus: { a: 1, ring: 0, period: 5, breathe: 0, muted: true },
  };
  function stateDot(ctx, x, y, state, t, th) {
    const S = STATE[state] || STATE.idle;
    const A0 = ctx.globalAlpha;
    const col = S.muted ? th.muted : th.accent;
    if (S.ring) {
      for (let j = 0; j < S.ring; j++) {
        const ph = (((t / S.period) + j / S.ring) % 1 + 1) % 1;
        const e = V.E.outCubic(ph);
        ctx.globalAlpha = A0 * 0.55 * (1 - ph) * (1 - ph);
        ctx.beginPath(); ctx.arc(x, y, 4.2 + 7.5 * e, 0, Math.PI * 2);
        ctx.strokeStyle = th.accent; ctx.lineWidth = 1.1; ctx.stroke();
      }
    }
    const br = 1 + S.breathe * Math.sin((t / S.period) * Math.PI * 2);
    ctx.globalAlpha = A0 * S.a;
    ctx.beginPath(); ctx.arc(x, y, 4.2 * br, 0, Math.PI * 2);
    ctx.fillStyle = col; ctx.fill();
    ctx.globalAlpha = A0;
  }

  const DEFAULT_STATUS = {
    idle: 'Listening for “Hey Veda”',
    listening: 'Listening…',
    thinking: 'Thinking…',
    speaking: 'Speaking — say “Stop” to interrupt',
    researching: 'Researching in the background',
    focus: 'Focus mode — wake word paused',
  };

  // ------------------------------------------------------------------ job board rows
  const ROW_H = 46, ROW_GAP = 14;
  // What a row shows at time t. A done/failed item with a future `statusAt` still reads as running
  // (a done item's line ramps from `progress` to 100% between `at` and `statusAt`).
  function rowState(it, t, at) {
    let status = it.status || 'queued';
    const sa = it.statusAt == null ? null : +it.statusAt;
    let p = it.progress == null ? null : clamp(+it.progress);
    let k = 1;
    if ((status === 'done' || status === 'failed') && sa != null) {
      if (t < sa) {
        if (status === 'done') {
          const p0 = p == null || p >= 1 ? 0.18 : p;
          p = lerp(p0, 1, V.E.inOutCubic(prog(t, Math.min(at, sa - 0.5), sa)));
        } else if (p == null) p = 0.4;
        status = 'running';
      } else k = prog(t, sa, sa + 0.9);
    }
    return { status, p, k };
  }
  function drawQueue(ctx, t, items, r, th, A0) {
    const x = r.x + INSET, cw = r.w - INSET * 2;
    const top = r.y + CONTENT_DY, limit = r.y + r.h - 12;
    let y = top, shown = 0, hidden = 0;
    const chipFont = V.ui(9, 650), labelFont = V.ui(13, 500), metaFont = V.ui(11, 500);
    const m = monoCells(ctx, metaFont);
    for (let i = 0; i < items.length; i++) {
      const it = items[i] || {};
      const at = it.at == null ? -1e9 : +it.at;
      const a = V.E.outExpo(prog(t, at, at + 0.6));
      // exit: fade + drift first, then the slot collapses (rows below never overlap a visible row)
      const e = it.out == null ? 0 : V.E.outCubic(prog(t, +it.out, +it.out + 0.28));
      const col = it.out == null ? 0 : V.E.inOutCubic(prog(t, +it.out + 0.18, +it.out + 0.6));
      const pres = a * (1 - col);
      if (pres <= 0.001) continue;
      const ry = y + (1 - a) * 10;
      const fit = clamp((limit - (ry + ROW_H)) / 6 + 1);
      y += (ROW_H + ROW_GAP) * pres;
      if (e >= 0.999) continue;
      if (fit <= 0.001) { if (a > 0.5 && e < 0.5) hidden++; continue; }
      shown++;
      const alpha = smooth(a * 1.4) * (1 - e) * fit;
      const rx = x - e * 14;
      const { status, p, k } = rowState(it, t, at);
      ctx.globalAlpha = A0 * alpha;
      // lane chip
      const lane = String(it.lane || 'TASK').toUpperCase();
      const lw = trackedWidth(ctx, lane, chipFont, 0.9);
      V.rr(ctx, rx, ry, lw + 12, 16, 5);
      ctx.fillStyle = th.line; ctx.fill();
      ctx.textBaseline = 'middle';
      tracked(ctx, lane, rx + 6, ry + 8.5, chipFont, th.muted, 0.9);
      ctx.textBaseline = 'alphabetic';
      // label
      ctx.font = labelFont;
      const lab = ellipsize(ctx, String(it.label || ''), cw);
      const settled = smooth(k / 0.6);
      const dim = status === 'done' || status === 'failed' ? lerp(1, 0.56, settled) : status === 'queued' ? 0.62 : 1;
      ctx.globalAlpha = A0 * alpha * dim;
      ctx.fillStyle = th.text; ctx.textAlign = 'left';
      ctx.fillText(lab, rx, ry + 35);
      ctx.globalAlpha = A0 * alpha;
      // status, right-aligned on the chip line
      const sx = rx + cw, sy = ry + 12.5;
      if (status === 'running') {
        if (p != null) monoText(ctx, Math.round(p * 100) + '%', null, 0, sx, sy, metaFont, th.muted, m, 'right');
        else { ctx.font = metaFont; ctx.fillStyle = th.muted; ctx.textAlign = 'right'; ctx.fillText('Running', sx, sy); }
      } else if (status === 'queued') {
        ctx.font = metaFont; ctx.fillStyle = th.muted; ctx.textAlign = 'right';
        ctx.globalAlpha = A0 * alpha * 0.75; ctx.fillText('Queued', sx, sy); ctx.globalAlpha = A0 * alpha;
      } else if (status === 'done') {
        checkOn(ctx, sx - 6, ry + 8, 12, th.success, 1.7, V.E.outCubic(clamp(k / 0.45)));
      } else if (status === 'failed') {
        crossOn(ctx, sx - 4.5, ry + 8, 8, th.fail, 1.6, V.E.outCubic(clamp(k / 0.35)));
      }
      ctx.textAlign = 'left';
      // progress line: track + fill
      const ly = ry + ROW_H - 2;
      const lineA = status === 'done' ? 1 - smooth((k - 0.25) / 0.6) : 1;
      if (lineA > 0.002) {
        ctx.globalAlpha = A0 * alpha * lineA;
        ctx.fillStyle = th.line; ctx.fillRect(rx, ly, cw, 2);
        if (status === 'running' && p == null) {
          const ph = ((t * 0.55) % 1 + 1) % 1, seg = cw * 0.28;
          const s0 = clamp(lerp(-seg, cw, ph), 0, cw), s1 = clamp(lerp(-seg, cw, ph) + seg, 0, cw);
          if (s1 > s0) { ctx.fillStyle = th.accent; ctx.fillRect(rx + s0, ly, s1 - s0, 2); }
        } else if (status !== 'queued') {
          const pf = status === 'done' ? 1 : p == null ? 0 : p;
          if (pf > 0) {
            if (status === 'failed') ctx.globalAlpha = A0 * alpha * lerp(1, 0.7, settled);
            const col = status === 'done' ? th.success : status === 'failed' ? th.fail : th.accent;
            ctx.fillStyle = col; ctx.fillRect(rx, ly, Math.max(2, cw * pf), 2);
          }
        }
      }
    }
    ctx.globalAlpha = A0;
    if (!shown && !hidden) {
      ctx.font = V.ui(12, 450); ctx.fillStyle = th.muted; ctx.textAlign = 'left';
      ctx.globalAlpha = A0 * 0.8;
      ctx.fillText('No tasks running', x, top + 14);
      ctx.globalAlpha = A0;
    } else if (hidden) {
      ctx.font = V.ui(11, 500); ctx.fillStyle = th.muted; ctx.textAlign = 'right';
      ctx.fillText(`+${hidden} more`, r.x + r.w - INSET, r.y + 25);
      ctx.textAlign = 'left';
    }
  }
  function checkOn(ctx, cx, cy, s, color, lw, k) {
    if (k <= 0) return;
    const pts = [[-0.42, 0.02], [-0.12, 0.32], [0.46, -0.32]];
    const L1 = Math.hypot(0.30, 0.30) * s, L2 = Math.hypot(0.58, 0.64) * s, L = L1 + L2;
    ctx.save();
    ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    if (k < 1) { ctx.setLineDash([L, L]); ctx.lineDashOffset = L * (1 - k); }
    ctx.beginPath();
    ctx.moveTo(cx + pts[0][0] * s, cy + pts[0][1] * s);
    ctx.lineTo(cx + pts[1][0] * s, cy + pts[1][1] * s);
    ctx.lineTo(cx + pts[2][0] * s, cy + pts[2][1] * s);
    ctx.stroke();
    ctx.restore();
  }
  function crossOn(ctx, cx, cy, s, color, lw, k) {
    if (k <= 0) return;
    const h = s / 2;
    ctx.save();
    ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.lineCap = 'round';
    const k1 = clamp(k * 2), k2 = clamp(k * 2 - 1);
    ctx.beginPath(); ctx.moveTo(cx - h, cy - h); ctx.lineTo(cx - h + 2 * h * k1, cy - h + 2 * h * k1);
    if (k2 > 0) { ctx.moveTo(cx + h, cy - h); ctx.lineTo(cx + h - 2 * h * k2, cy - h + 2 * h * k2); }
    ctx.stroke();
    ctx.restore();
  }

  // ------------------------------------------------------------------ topbar
  const PILL = { pitch: 30, pad: 3, h: 30, w: 30 * 3 + 3 * 2 };
  const BTN_FONT = () => V.ui(11, 600), BTN_TRACK = 1.1;
  // Right cluster x positions, right → left: minimise, timer (+ divider), SETTINGS, theme pill. Timer digits sit
  // in fixed cells, so its width never changes with the value. Used by topbar (draw ctx) and layout().pill.
  function rightCluster(ctx, o) {
    let x = W - 32;
    const out = { minR: x, timer: o.timer !== false && o.timer !== null };
    x -= 11 + 24;
    if (out.timer) {
      out.timerFont = V.ui(12.5, 500);
      out.timerCells = monoCells(ctx, out.timerFont);
      out.timerR = x;
      x -= monoWidth('00:00:00', out.timerCells) + 22;
      out.divX = x;
      x -= 22;
    }
    out.settingsR = x;
    x -= trackedWidth(ctx, 'SETTINGS', BTN_FONT(), BTN_TRACK) + 22;
    out.pillX = x - PILL.w;
    return out;
  }
  // measuring context for layout().pill only (static, created at load; draw never touches it)
  const MEASURE = document.createElement('canvas').getContext('2d');
  function pillLayout(o) {
    const RC = rightCluster(MEASURE, o), y = TOP_H / 2;
    return {
      x: RC.pillX + PILL.w / 2, y, w: PILL.w, h: PILL.h,
      buttons: [0, 1, 2].map((i) => ({ x: RC.pillX + PILL.pad + PILL.pitch * (i + 0.5), y })),
    };
  }
  function topbar(ctx, t, o, th, A0) {
    const cy = TOP_H / 2;
    const state = o.state || 'idle';
    // left: state dot + wordmark
    stateDot(ctx, 32, cy, state, t, th);
    ctx.textBaseline = 'middle';
    ctx.font = V.ui(15, 600); ctx.fillStyle = th.text; ctx.textAlign = 'left';
    ctx.letterSpacing = '-0.15px';
    ctx.fillText('Veda', 45, cy + 0.5);
    let lx = 45 + ctx.measureText('Veda').width;
    ctx.letterSpacing = '0px';
    if (o.stateLabel) {
      ctx.font = V.ui(12.5, 450); ctx.fillStyle = th.muted;
      ctx.fillText(String(o.stateLabel === true ? state : o.stateLabel).toLowerCase(), lx + 9, cy + 0.5);
    }

    // right cluster, laid out right → left (positions shared with layout().pill via rightCluster)
    const RC = rightCluster(ctx, o);
    let x = RC.minR;
    // minimise "—"
    ctx.save();
    ctx.strokeStyle = th.muted; ctx.lineWidth = 1.5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x - 11, cy + 0.5); ctx.lineTo(x, cy + 0.5); ctx.stroke();
    ctx.restore();
    // session timer
    if (RC.timer) {
      const T = o.timer === undefined ? 14 * 60 + 32 + Math.max(0, t) : +o.timer;
      const s = Math.floor(T), fr = T - s;
      const k = prog(fr, 0.8, 1);
      monoText(ctx, hms(s), hms(s + 1), k, RC.timerR, cy + 0.5, RC.timerFont, th.muted, RC.timerCells, 'right');
      // hairline divider
      ctx.fillStyle = th.line; ctx.fillRect(Math.round(RC.divX) + 0.5, cy - 8, 1, 16);
    }
    // SETTINGS
    const btnFont = BTN_FONT(), track = BTN_TRACK;
    tracked(ctx, 'SETTINGS', RC.settingsR, cy + 0.5, btnFont, th.muted, track, 'right');
    // theme pill
    const { pitch, pad, h: ph, w: pw } = PILL;
    const px = RC.pillX, py = cy - ph / 2;
    V.rr(ctx, px, py, pw, ph, ph / 2);
    ctx.fillStyle = th.line; ctx.fill();
    const centres = [0, 1, 2].map((i) => px + pad + pitch * (i + 0.5));
    const paths = [ICON.sun, ICON.sunset, ICON.moon];
    const iconS = 15, iconLW = 1.45;
    const def = { light: 0, cream: 1, dark: 2 }[th.name] ?? 2;
    const pv = clamp(o.pill == null ? def : +o.pill, 0, 2);
    const i0 = Math.min(1, Math.floor(pv)), f = pv - i0;
    const d = ph - pad * 2;
    const c = lerp(centres[i0], centres[i0 + 1], f);
    const stretch = Math.sin(Math.PI * f) * pitch * 0.42;
    const cl = c - d / 2 - stretch / 2, cr = c + d / 2 + stretch / 2;
    const squash = Math.sin(Math.PI * f) * 1.2;
    const on = th.name === 'dark' ? th.text : th.bg;
    const settled = Math.abs(pv - Math.round(pv)) < 1e-3 ? Math.round(pv) : -1;
    for (let i = 0; i < 3; i++) if (i !== settled) icon(ctx, paths[i], centres[i], cy, iconS, th.muted, iconLW);
    V.rr(ctx, cl, cy - d / 2 + squash, cr - cl, d - squash * 2, d / 2);
    ctx.fillStyle = th.accent; ctx.fill();
    if (settled >= 0) icon(ctx, paths[settled], centres[settled], cy, iconS, on, iconLW + 0.1);
    else {
      // mid-slide: icons take the on-accent colour exactly where the capsule covers them
      ctx.save();
      ctx.clip();
      for (let i = 0; i < 3; i++) if (centres[i] + iconS / 2 > cl && centres[i] - iconS / 2 < cr) icon(ctx, paths[i], centres[i], cy, iconS, on, iconLW + 0.1);
      ctx.restore();
    }
    x = px - 22;
    // FOCUS MODE ↔ FOCUSED
    const fk = clamp(o.focus === true ? 1 : o.focus === false || o.focus == null ? 0 : +o.focus);
    const wOff = trackedWidth(ctx, 'FOCUS MODE', btnFont, track);
    const wOn = trackedWidth(ctx, 'FOCUSED', btnFont, track);
    // sequential, not a cross-dissolve: the old label lifts away, the capsule settles, then FOCUSED lands
    const offA = 1 - smooth(fk / 0.45), capK = V.E.outCubic(clamp((fk - 0.15) / 0.55)), onA = smooth((fk - 0.4) / 0.6);
    const padL = 22, padR = 12, capW = wOn + padL + padR;
    if (capK > 0) {
      const cw = lerp(capW - 14, capW, capK);
      ctx.globalAlpha = A0 * capK;
      V.rr(ctx, x - cw, cy - 12, cw, 24, 12);
      ctx.fillStyle = V.rgba(th.accentRGB, th.name === 'dark' ? 0.16 : 0.14); ctx.fill();
    }
    if (onA > 0) {
      const dy = 3 * (1 - onA);
      ctx.globalAlpha = A0 * onA;
      ctx.beginPath(); ctx.arc(x - padR - wOn - 9, cy + dy, 2.6, 0, Math.PI * 2); ctx.fillStyle = th.accent; ctx.fill();
      tracked(ctx, 'FOCUSED', x - padR, cy + 0.5 + dy, btnFont, th.accent, track, 'right');
    }
    if (offA > 0) {
      ctx.globalAlpha = A0 * offA;
      tracked(ctx, 'FOCUS MODE', x, cy + 0.5 - 3 * (1 - offA), btnFont, th.muted, track, 'right');
    }
    ctx.globalAlpha = A0;
    ctx.textBaseline = 'alphabetic';
  }

  // ------------------------------------------------------------------ window shadow + halo geometry
  // Gaussian-blurred, vertically offset rounded rect, approximated without canvas shadowBlur
  // (shadowBlur on a 1180×620 shape costs >20 ms per draw in software raster).
  const SH = { sigma: 17, dy: 12, D: 46, step: 6 };
  function erfc(x) {
    const z = Math.abs(x), k = 1 / (1 + 0.3275911 * z);
    const y = k * (0.254829592 + k * (-0.284496736 + k * (1.421413741 + k * (-1.453152027 + k * 1.061405429)))) * Math.exp(-z * z);
    return x >= 0 ? y : 2 - y;
  }
  const shProfile = (d) => 0.5 * erfc(d / (SH.sigma * Math.SQRT2));
  function parseRGBA(s) {
    const m = /rgba?\(([^)]+)\)/.exec(s || '');
    if (!m) return [0, 0, 0, 0.3];
    const p = m[1].split(',').map(Number);
    return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1];
  }
  // `u` is the sub-frame phase (see draw): stepping offsets cycle through it, so the 6 motion-blur
  // samples of one frame average the steps into a continuous ramp.
  function windowShadow(ctx, th, u) {
    const [r, g, b, A] = parseRGBA(th.shadow);
    const base = `rgba(${r},${g},${b},`;
    const { dy, D, step } = SH, R = RADIUS;
    const sty = (d) => { ctx.fillStyle = base + (A * shProfile(d)).toFixed(4) + ')'; };
    const sp = CORNER_SPRITES[th.name];
    const useSprite = sp && parseRGBA(V.THEMES[th.name].shadow).join() === [r, g, b, A].join();
    sty(-R / 2);
    ctx.fillRect(0, H - R, R, dy);                                          // bottom corner cut-outs
    ctx.fillRect(W - R, H - R, R, dy);
    {
      const j = u * step;
      sty(-dy + j / 2);
      ctx.fillRect(R, H, W - 2 * R, j);
      sty(j / 2);
      ctx.fillRect(W, dy + R, j, H - 2 * R);
      ctx.fillRect(-j, dy + R, j, H - 2 * R);
      for (let d = -dy + j; d < D; d += step) {
        const a = A * shProfile(d + step / 2);
        if (a < 0.003) break;
        ctx.fillStyle = base + a.toFixed(4) + ')';
        ctx.fillRect(R, H + dy + d, W - 2 * R, step);                        // bottom
        if (d + step > dy) {                                                  // top (only above the window)
          const y1 = Math.min(0, dy - d);
          ctx.fillRect(R, dy - d - step, W - 2 * R, y1 - (dy - d - step));
        }
        if (d >= 0) {
          ctx.fillRect(W + d, dy + R, step, H - 2 * R);                       // right
          ctx.fillRect(-d - step, dy + R, step, H - 2 * R);                   // left
        }
      }
    }
    // corners: quadrants of a pre-rendered radial sprite (a gradient built per draw is slow to set up)
    const RR = R + D;
    const quads = [[R, dy + R, 0, 0], [W - R, dy + R, 1, 0], [W - R, H + dy - R, 1, 1], [R, H + dy - R, 0, 1]];
    if (useSprite) {
      const k = CORNER_DPU;
      for (const [cx, cy, qx, qy] of quads) {
        ctx.drawImage(sp, qx * RR * k, qy * RR * k, RR * k, RR * k, cx - (1 - qx) * RR, cy - (1 - qy) * RR, RR, RR);
      }
    } else {
      for (const [cx, cy, qx, qy] of quads) {
        const gr = ctx.createRadialGradient(cx, cy, 0, cx, cy, RR);
        for (let i = 0; i <= 16; i++) gr.addColorStop(i / 16, base + (i === 16 ? 0 : A * shProfile((i / 16) * RR - R)).toFixed(4) + ')');
        ctx.fillStyle = gr;
        ctx.fillRect(cx - (1 - qx) * RR, cy - (1 - qy) * RR, RR, RR);
      }
    }
  }
  // Corner sprites per built-in theme, rendered once at load (deterministic).
  const CORNER_DPU = 3;
  const CORNER_SPRITES = (function () {
    const out = {};
    const RR = RADIUS + SH.D, n = Math.ceil(RR * 2 * CORNER_DPU);
    for (const name of Object.keys(V.THEMES)) {
      const [r, g, b, A] = parseRGBA(V.THEMES[name].shadow);
      const cv = document.createElement('canvas');
      cv.width = cv.height = n;
      const c = cv.getContext('2d');
      const gr = c.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
      for (let i = 0; i <= 48; i++) {
        const a = i === 48 ? 0 : A * shProfile((i / 48) * RR - RADIUS);
        gr.addColorStop(i / 48, `rgba(${r},${g},${b},${a.toFixed(5)})`);
      }
      c.fillStyle = gr;
      c.fillRect(0, 0, n, n);
      out[name] = cv;
    }
    return out;
  })();
  // Halo = K nested ellipses, pre-mixed bg→accent and drawn opaque (several times cheaper than alpha
  // blends or a radial gradient in software raster). Thresholds slide with `u`, so the motion-blur
  // samples blend the K levels into a smooth gaussian falloff.
  const HALO_R = 320, HALO_K = 4, HALO_T0 = 0.06; // widest level ends at the card edges (x 338 / 862)
  function halo(ctx, th, k, u, fading) {
    const bg = V.hexRGB(th.bg), ac = th.accentRGB;
    // while the caller fades the window (globalAlpha < 1) opaque nested layers would compound into a
    // visible bullseye, so fall back to thin alpha layers (slower, only during fades)
    if (fading) ctx.fillStyle = V.rgba(ac, +((th.halo * k) / HALO_K).toFixed(5));
    for (let i = 0; i < HALO_K; i++) {
      const tau = HALO_T0 + ((i + 1 - u) / HALO_K) * (1 - HALO_T0);
      const x = Math.sqrt(Math.max(0, -Math.log(tau) / 4.2));
      if (x <= 0.001) continue;
      const a = Math.min(1, (th.halo * k * (i + 1)) / HALO_K);
      if (!fading) ctx.fillStyle = `rgb(${(bg[0] + (ac[0] - bg[0]) * a).toFixed(2)},${(bg[1] + (ac[1] - bg[1]) * a).toFixed(2)},${(bg[2] + (ac[2] - bg[2]) * a).toFixed(2)})`;
      const rx = HALO_R * x, ry = rx * 0.8;
      ctx.beginPath();
      ctx.roundRect(ORB.cx - rx, ORB.cy - ry, rx * 2, ry * 2, [{ x: rx, y: ry }]);
      ctx.fill();
    }
  }

  // Opaque window body, painted only where the (opaque) cards will not cover it: two rounded bands +
  // rects + the 14-unit corner squares of each card. Pieces overlap by 1 unit, so no seams.
  function body(ctx, th, L) {
    ctx.fillStyle = th.bg;
    V.rr(ctx, 0, 0, W, CARD_TOP + 1, [RADIUS, RADIUS, 0, 0]); ctx.fill();
    V.rr(ctx, 0, CARD_BOTTOM - 1, W, H - CARD_BOTTOM + 1, [0, 0, RADIUS, RADIUS]); ctx.fill();
    ctx.fillRect(0, CARD_TOP, COL_L.x + 1, CARD_BOTTOM - CARD_TOP);
    ctx.fillRect(COL_R.x + COL_R.w - 1, CARD_TOP, W - (COL_R.x + COL_R.w) + 1, CARD_BOTTOM - CARD_TOP);
    ctx.fillRect(COL_L.x + COL_L.w - 1, CARD_TOP, COL_R.x - (COL_L.x + COL_L.w) + 2, CARD_BOTTOM - CARD_TOP);
    const c = L.conversation, g = L.log, q = L.queue, p = L.prajna;
    ctx.fillRect(c.x, c.y + c.h - 1, c.w, g.y - (c.y + c.h) + 2);
    ctx.fillRect(q.x, q.y + q.h - 1, q.w, p.y - (q.y + q.h) + 2);
    const k = CARD_R;
    for (const r of [c, g, q, p]) {
      ctx.fillRect(r.x, r.y, k, k); ctx.fillRect(r.x + r.w - k, r.y, k, k);
      ctx.fillRect(r.x, r.y + r.h - k, k, k); ctx.fillRect(r.x + r.w - k, r.y + r.h - k, k, k);
    }
  }

  // ------------------------------------------------------------------ draw
  function draw(ctx, t, o) {
    o = o || {};
    const th = V.theme(o.theme || 'dark');
    const L = frame(o);
    ctx.save();
    const A0 = ctx.globalAlpha;
    const fading = A0 < 0.999;
    ctx.globalCompositeOperation = 'source-over';
    ctx.filter = 'none';
    // never inherit the caller's text/line state
    ctx.letterSpacing = '0px'; ctx.wordSpacing = '0px'; ctx.direction = 'ltr'; ctx.setLineDash([]);
    ctx.lineCap = 'butt'; ctx.lineJoin = 'miter'; ctx.imageSmoothingEnabled = true; // corner shadow sprites are scaled

    // Sub-frame phase: V.mount's 6 motion-blur samples sit 1/720 s apart → 6 evenly spaced phases.
    // Stepped gradients (shadow bands, halo levels) slide with it, so each frame averages to smooth.
    const u = (((t * 120) % 1) + 1) % 1;
    // window drop shadow, then the flat body
    if (o.shadow !== false) windowShadow(ctx, th, u);
    if (fading) { V.rr(ctx, 0, 0, W, H, RADIUS); ctx.fillStyle = th.bg; ctx.fill(); } else body(ctx, th, L);

    // centre halo behind the orb (S96 #app::before), kept inside the window
    const hk = o.halo == null ? 1 : +o.halo;
    if (hk > 0) halo(ctx, th, hk, u, fading);

    topbar(ctx, t, o, th, A0);

    // cards
    // glass pre-composited over the flat body → opaque fills (fast); real translucency while fading
    const bgC = V.hexRGB(th.bg), glassC = over(parseRGBA(th.glass), bgC);
    const cols = fading ? { glass: th.glass, glassLine: th.line, translucent: true }
      : { glass: rgbStr(glassC), glassLine: rgbStr(over(parseRGBA(th.line), glassC)) };
    card(ctx, L.conversation, cols);
    card(ctx, L.log, cols);
    card(ctx, L.queue, cols);
    card(ctx, L.prajna, cols);
    if (o.headers !== false) {
      header(ctx, L.conversation, 'CONVERSATION', th);
      header(ctx, L.queue, 'TASK QUEUE', th);
    }
    drawQueue(ctx, t, Array.isArray(o.queue) ? o.queue : [], L.queue, th, A0);

    // bottom strip
    const by = BOTTOM_Y + 15;
    ctx.font = V.ui(11, 450); ctx.fillStyle = th.muted; ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    const left = o.status != null ? String(o.status) : DEFAULT_STATUS[o.state || 'idle'] || DEFAULT_STATUS.idle;
    ctx.fillText(left, COL_L.x + INSET, by);
    ctx.textAlign = 'right';
    ctx.fillText(o.statusRight != null ? String(o.statusRight) : 'Memory stays on this Mac', COL_R.x + COL_R.w - INSET, by);

    // window hairline
    ring(ctx, 0, 0, W, H, RADIUS, fading ? th.line : rgbStr(over(parseRGBA(th.line), bgC)));

    ctx.restore();
  }

  V.components.shell = { W, H, layout, draw };
})();
