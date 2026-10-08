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
  const TOP_H = 52, BOTTOM_Y = 594, GUT = 18;
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
  function layout(o) {
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
    const cy = 15.5;
    d = `M2.8 ${cy}H21.2M7.6 ${cy}a4.4 4.4 0 0 1 8.8 0`;
    for (const deg of [-90, -145, -35]) {
      const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
      d += `M${f2(12 + c * 6.6)} ${f2(cy + s * 6.6)}L${f2(12 + c * 8.8)} ${f2(cy + s * 8.8)}`;
    }
    d += `M8.6 ${cy + 3.6}H15.4`;
    ICON.sunset = P(d);
    // moon: true crescent from two circles
    const c1x = 11.2, c1y = 12.6, r1 = 8.4, c2x = 16.6, c2y = 7.6, r2 = 7.2;
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
  function card(ctx, r, th) {
    V.rr(ctx, r.x, r.y, r.w, r.h, CARD_R);
    ctx.fillStyle = th.glass; ctx.fill();
    V.rr(ctx, r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1, CARD_R - 0.5);
    ctx.strokeStyle = th.line; ctx.lineWidth = 1; ctx.stroke();
  }
  function header(ctx, r, label, th) {
    ctx.textBaseline = 'alphabetic';
    tracked(ctx, label, r.x + INSET, r.y + 25, V.ui(11.5, 600), th.muted, 1.25);
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
  const ROW_H = 50, ROW_GAP = 6;
  function drawQueue(ctx, t, items, r, th, A0) {
    const x = r.x + INSET, cw = r.w - INSET * 2;
    const top = r.y + CONTENT_DY, limit = r.y + r.h - 10;
    let y = top, shown = 0, hidden = 0;
    const chipFont = V.ui(9, 650), labelFont = V.ui(13, 500), metaFont = V.ui(11, 500);
    const m = monoCells(ctx, metaFont);
    for (let i = 0; i < items.length; i++) {
      const it = items[i] || {};
      const at = it.at == null ? -1e9 : +it.at;
      const a = V.E.outExpo(prog(t, at, at + 0.6));
      const e = it.out == null ? 0 : V.E.inOutCubic(prog(t, +it.out, +it.out + 0.5));
      const pres = a * (1 - e);
      if (pres <= 0.001) continue;
      const pitch = (ROW_H + ROW_GAP) * pres;
      const ry = y + (1 - a) * 10;
      const fit = clamp((limit - (ry + ROW_H)) / 18 + 1);
      y += pitch;
      if (fit <= 0.001) { if (a > 0.5 && e < 0.5) hidden++; continue; }
      shown++;
      const alpha = smooth(a * 1.4) * (1 - e) * fit;
      ctx.globalAlpha = A0 * alpha;
      const rx = x - e * 14;
      const status = it.status || 'queued';
      const sa = it.statusAt == null ? at : +it.statusAt;
      const sk = prog(t, sa, sa + 0.5);
      // lane chip
      const lane = String(it.lane || 'TASK').toUpperCase();
      const lw = trackedWidth(ctx, lane, chipFont, 0.9);
      V.rr(ctx, rx, ry + 2, lw + 12, 16, 5);
      ctx.fillStyle = th.line; ctx.fill();
      ctx.textBaseline = 'middle';
      tracked(ctx, lane, rx + 6, ry + 10.5, chipFont, th.muted, 0.9);
      ctx.textBaseline = 'alphabetic';
      // label
      ctx.font = labelFont;
      const lab = ellipsize(ctx, String(it.label || ''), cw);
      const dim = status === 'done' || status === 'failed' ? 0.56 + 0.44 * (1 - sk) : status === 'queued' ? 0.62 : 1;
      ctx.globalAlpha = A0 * alpha * dim;
      ctx.fillStyle = th.text; ctx.textAlign = 'left';
      ctx.fillText(lab, rx, ry + 36);
      ctx.globalAlpha = A0 * alpha;
      // status (right of chip line)
      const sx = rx + cw, sy = ry + 14.5;
      const p = clamp(it.progress == null ? (status === 'done' ? 1 : 0) : +it.progress);
      if (status === 'running') {
        if (it.progress != null) {
          const s = Math.round(p * 100) + '%';
          monoText(ctx, s, null, 0, sx, sy, metaFont, th.muted, m, 'right');
        } else {
          ctx.font = metaFont; ctx.fillStyle = th.muted; ctx.textAlign = 'right'; ctx.fillText('Running', sx, sy);
        }
      } else if (status === 'queued') {
        ctx.font = metaFont; ctx.fillStyle = th.muted; ctx.textAlign = 'right';
        ctx.globalAlpha = A0 * alpha * 0.75; ctx.fillText('Queued', sx, sy); ctx.globalAlpha = A0 * alpha;
      } else if (status === 'done') {
        const k = V.E.outCubic(prog(t, sa, sa + 0.4));
        checkOn(ctx, sx - 6, ry + 10, 12, th.success, 1.7, it.statusAt == null ? 1 : k);
      } else if (status === 'failed') {
        const k = V.E.outCubic(prog(t, sa, sa + 0.3));
        crossOn(ctx, sx - 5, ry + 10, 9, th.fail, 1.6, it.statusAt == null ? 1 : k);
      }
      ctx.textAlign = 'left';
      // progress line
      const ly = ry + ROW_H - 6;
      if (status === 'running' || status === 'queued' || (status !== 'queued' && sk < 1)) {
        let trackA = status === 'done' ? 1 - smooth(prog(t, sa + 0.2, sa + 0.8)) : 1;
        if (status === 'done' && it.statusAt == null) trackA = 0;
        if (trackA > 0) {
          ctx.globalAlpha = A0 * alpha * trackA;
          V.rr(ctx, rx, ly, cw, 2, 1); ctx.fillStyle = th.line; ctx.fill();
          if (status === 'running' && it.progress == null) {
            const ph = ((t * 0.55) % 1 + 1) % 1, seg = cw * 0.28;
            const s0 = clamp(lerp(-seg, cw, ph), 0, cw), s1 = clamp(lerp(-seg, cw, ph) + seg, 0, cw);
            if (s1 > s0) { V.rr(ctx, rx + s0, ly, s1 - s0, 2, 1); ctx.fillStyle = th.accent; ctx.fill(); }
          } else if (p > 0 && status !== 'queued') {
            const col = status === 'done' ? th.success : status === 'failed' ? th.fail : th.accent;
            V.rr(ctx, rx, ly, Math.max(2, cw * p), 2, 1); ctx.fillStyle = col; ctx.fill();
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
    ctx.setLineDash([L, L]); ctx.lineDashOffset = L * (1 - k);
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
  function topbar(ctx, t, o, th, A0) {
    const cy = TOP_H / 2;
    const state = o.state || 'idle';
    // left: state dot + wordmark
    stateDot(ctx, 32, cy, state, t, th);
    ctx.textBaseline = 'middle';
    ctx.font = V.ui(15, 620); ctx.fillStyle = th.text; ctx.textAlign = 'left';
    ctx.letterSpacing = '-0.15px';
    ctx.fillText('Veda', 45, cy + 0.5);
    let lx = 45 + ctx.measureText('Veda').width;
    ctx.letterSpacing = '0px';
    if (o.stateLabel) {
      ctx.font = V.ui(12.5, 450); ctx.fillStyle = th.muted;
      ctx.fillText(String(o.stateLabel === true ? state : o.stateLabel).toLowerCase(), lx + 9, cy + 0.5);
    }

    // right cluster, laid out right → left
    let x = W - 32;
    // minimise "—"
    ctx.save();
    ctx.strokeStyle = th.muted; ctx.lineWidth = 1.5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x - 11, cy + 0.5); ctx.lineTo(x, cy + 0.5); ctx.stroke();
    ctx.restore();
    x -= 11 + 24;
    // session timer
    if (o.timer !== false && o.timer !== null) {
      const T = o.timer === undefined ? 14 * 60 + 32 + Math.max(0, t) : +o.timer;
      const s = Math.floor(T), fr = T - s;
      const font = V.ui(12.5, 500);
      const m = monoCells(ctx, font);
      const k = prog(fr, 0.8, 1);
      const w = monoText(ctx, hms(s), hms(s + 1), k, x, cy + 0.5, font, th.muted, m, 'right');
      x -= w + 22;
      // hairline divider
      ctx.fillStyle = th.line; ctx.fillRect(Math.round(x) + 0.5, cy - 8, 1, 16);
      x -= 22;
    }
    // SETTINGS
    const btnFont = V.ui(11, 600), track = 1.1;
    const sw = tracked(ctx, 'SETTINGS', x, cy + 0.5, btnFont, th.muted, track, 'right');
    x -= sw + 22;
    // theme pill
    const pitch = 30, pad = 3, ph = 30;
    const pw = pitch * 3 + pad * 2;
    const px = x - pw, py = cy - ph / 2;
    V.rr(ctx, px, py, pw, ph, ph / 2);
    ctx.fillStyle = th.line; ctx.fill();
    const centres = [0, 1, 2].map((i) => px + pad + pitch * (i + 0.5));
    const paths = [ICON.sun, ICON.sunset, ICON.moon];
    const iconS = 15, iconLW = 1.45;
    for (let i = 0; i < 3; i++) icon(ctx, paths[i], centres[i], cy, iconS, th.muted, iconLW);
    const def = { light: 0, cream: 1, dark: 2 }[th.name] ?? 2;
    const pv = clamp(o.pill == null ? def : +o.pill, 0, 2);
    const i0 = Math.min(1, Math.floor(pv)), f = pv - i0;
    const d = ph - pad * 2;
    const c = lerp(centres[i0], centres[i0 + 1], f);
    const stretch = Math.sin(Math.PI * f) * pitch * 0.42;
    const cl = c - d / 2 - stretch / 2, cr = c + d / 2 + stretch / 2;
    const squash = Math.sin(Math.PI * f) * 1.2;
    ctx.save();
    V.rr(ctx, cl, cy - d / 2 + squash, cr - cl, d - squash * 2, d / 2);
    ctx.fillStyle = th.accent; ctx.fill();
    ctx.clip();
    const on = th.name === 'dark' ? th.text : th.bg;
    for (let i = 0; i < 3; i++) icon(ctx, paths[i], centres[i], cy, iconS, on, iconLW + 0.1);
    ctx.restore();
    x = px - 22;
    // FOCUS MODE ↔ FOCUSED
    const fk = clamp(o.focus === true ? 1 : o.focus === false || o.focus == null ? 0 : +o.focus);
    const wOff = trackedWidth(ctx, 'FOCUS MODE', btnFont, track);
    const wOn = trackedWidth(ctx, 'FOCUSED', btnFont, track);
    if (fk > 0) {
      const tw = lerp(wOff, wOn + 14, fk);
      const bw = tw + 22, bx = x - tw - 11;
      ctx.globalAlpha = A0 * fk;
      V.rr(ctx, bx, cy - 12, bw, 24, 12);
      ctx.fillStyle = V.rgba(th.accentRGB, th.name === 'dark' ? 0.16 : 0.14); ctx.fill();
      ctx.beginPath(); ctx.arc(x - wOn - 7, cy, 2.6, 0, Math.PI * 2); ctx.fillStyle = th.accent; ctx.fill();
      tracked(ctx, 'FOCUSED', x, cy + 0.5, btnFont, th.accent, track, 'right');
      ctx.globalAlpha = A0;
    }
    if (fk < 1) {
      ctx.globalAlpha = A0 * (1 - fk);
      tracked(ctx, 'FOCUS MODE', x, cy + 0.5, btnFont, th.muted, track, 'right');
      ctx.globalAlpha = A0;
    }
    ctx.textBaseline = 'alphabetic';
  }

  // ------------------------------------------------------------------ draw
  function draw(ctx, t, o) {
    o = o || {};
    const th = V.theme(o.theme || 'dark');
    const L = layout(o);
    ctx.save();
    const A0 = ctx.globalAlpha;
    ctx.globalCompositeOperation = 'source-over';
    ctx.filter = 'none';

    // window body + drop shadow (shadow params are device-space: scale with the current transform)
    const m = ctx.getTransform();
    const sc = Math.sqrt(Math.abs(m.a * m.d - m.b * m.c)) || 1;
    if (o.shadow !== false) {
      ctx.save();
      ctx.shadowColor = th.shadow; ctx.shadowBlur = 56 * sc; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 22 * sc;
      V.rr(ctx, 0, 0, W, H, RADIUS); ctx.fillStyle = th.bg; ctx.fill();
      ctx.shadowColor = th.shadow; ctx.shadowBlur = 6 * sc; ctx.shadowOffsetY = 2 * sc;
      ctx.globalAlpha = A0 * 0.6;
      ctx.fill();
      ctx.restore();
    }
    V.rr(ctx, 0, 0, W, H, RADIUS); ctx.fillStyle = th.bg; ctx.fill();

    ctx.save();
    V.rr(ctx, 0, 0, W, H, RADIUS); ctx.clip();
    // centre halo behind the orb
    const hk = o.halo == null ? 1 : +o.halo;
    if (hk > 0) {
      const R = 430, a = th.halo * hk;
      const g = ctx.createRadialGradient(ORB.cx, ORB.cy, 0, ORB.cx, ORB.cy, R);
      g.addColorStop(0, V.rgba(th.accentRGB, a));
      g.addColorStop(0.3, V.rgba(th.accentRGB, a * 0.72));
      g.addColorStop(0.6, V.rgba(th.accentRGB, a * 0.28));
      g.addColorStop(1, V.rgba(th.accentRGB, 0));
      ctx.fillStyle = g;
      ctx.fillRect(ORB.cx - R, ORB.cy - R, R * 2, R * 2);
    }

    topbar(ctx, t, o, th, A0);

    // cards
    card(ctx, L.conversation, th);
    card(ctx, L.log, th);
    card(ctx, L.queue, th);
    card(ctx, L.prajna, th);
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
    ctx.restore(); // clip

    // window hairline
    V.rr(ctx, 0.5, 0.5, W - 1, H - 1, RADIUS - 0.5);
    ctx.strokeStyle = th.line; ctx.lineWidth = 1; ctx.stroke();

    ctx.restore();
  }

  V.components.shell = { W, H, layout, draw };
})();
