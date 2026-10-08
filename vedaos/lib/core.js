// VEDAOS film engine — shared core. Classic script: everything hangs off window.V.
// Render contract: every draw is a pure function of time. No Date, no Math.random,
// no timers/rAF, no state carried between calls. Seeded randomness only (V.rng).
'use strict';
(function () {
  const V = (window.V = window.V || {});
  V.components = V.components || {};

  V.W = 1920; V.H = 1080; V.FPS = 60;

  // ---------------------------------------------------------------- palette
  // From the product (S96): bg per theme, one accent (#d8895a) across all three,
  // deeper terracotta for the orb on light/cream, sage success, brick fail.
  V.THEMES = {
    dark: {
      name: 'dark', bg: '#241d19', text: '#f2ead9',
      muted: 'rgba(242,234,217,0.56)', faint: 'rgba(242,234,217,0.16)', line: 'rgba(242,234,217,0.10)',
      glass: 'rgba(58,47,40,0.55)', glassHi: 'rgba(72,59,50,0.62)',
      accent: '#d8895a', accentRGB: [216, 137, 90],
      orb: '#d8895a', orbRGB: [224, 150, 104], orbBlend: 'lighter', halo: 0.09,
      success: '#8ba86b', fail: '#b4503c', shadow: 'rgba(0,0,0,0.45)',
    },
    cream: {
      name: 'cream', bg: '#f2ead9', text: '#241d19',
      muted: 'rgba(36,29,25,0.56)', faint: 'rgba(36,29,25,0.14)', line: 'rgba(36,29,25,0.10)',
      glass: 'rgba(233,223,201,0.55)', glassHi: 'rgba(240,231,212,0.75)',
      accent: '#d8895a', accentRGB: [216, 137, 90],
      orb: '#bd6a3c', orbRGB: [189, 106, 60], orbBlend: 'source-over', halo: 0.06,
      success: '#8ba86b', fail: '#b4503c', shadow: 'rgba(60,40,20,0.18)',
    },
    light: {
      name: 'light', bg: '#faf3e8', text: '#241d19',
      muted: 'rgba(36,29,25,0.56)', faint: 'rgba(36,29,25,0.13)', line: 'rgba(36,29,25,0.09)',
      glass: 'rgba(255,252,246,0.62)', glassHi: 'rgba(255,255,255,0.8)',
      accent: '#d8895a', accentRGB: [216, 137, 90],
      orb: '#bd6a3c', orbRGB: [189, 106, 60], orbBlend: 'source-over', halo: 0.05,
      success: '#8ba86b', fail: '#b4503c', shadow: 'rgba(60,40,20,0.14)',
    },
  };
  V.theme = (t) => (typeof t === 'string' ? V.THEMES[t] : t || V.THEMES.dark);
  V.rgba = (rgb, a) => `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${a})`;
  V.hexRGB = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  V.mixHex = (a, b, k) => {
    const A = V.hexRGB(a), B = V.hexRGB(b);
    return `rgb(${A.map((x, i) => Math.round(x + (B[i] - x) * k)).join(',')})`;
  };

  // ---------------------------------------------------------------- math
  V.clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  V.lerp = (a, b, k) => a + (b - a) * k;
  V.prog = (t, a, b) => V.clamp((t - a) / (b - a));
  V.TAU = Math.PI * 2;
  V.E = {
    linear: (x) => x,
    inQuad: (x) => x * x,
    outQuad: (x) => 1 - (1 - x) * (1 - x),
    inCubic: (x) => x * x * x,
    outCubic: (x) => 1 - Math.pow(1 - x, 3),
    inOutCubic: (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2),
    outQuart: (x) => 1 - Math.pow(1 - x, 4),
    inOutQuart: (x) => (x < 0.5 ? 8 * x * x * x * x : 1 - Math.pow(-2 * x + 2, 4) / 2),
    outExpo: (x) => (x >= 1 ? 1 : 1 - Math.pow(2, -10 * x)),
    inExpo: (x) => (x <= 0 ? 0 : Math.pow(2, 10 * x - 10)),
    inOutExpo: (x) => x <= 0 ? 0 : x >= 1 ? 1 : x < 0.5 ? Math.pow(2, 20 * x - 10) / 2 : (2 - Math.pow(2, -20 * x + 10)) / 2,
    outBack: (x) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); },
    inBack: (x) => { const c1 = 1.70158, c3 = c1 + 1; return c3 * x * x * x - c1 * x * x; },
    outElastic: (x) => x <= 0 ? 0 : x >= 1 ? 1 : Math.pow(2, -10 * x) * Math.sin((x * 10 - 0.75) * (V.TAU / 3)) + 1,
  };
  // damped spring step response 0 -> 1, t = seconds since start
  V.spring = (t, freq = 3, damp = 0.4) => {
    if (t <= 0) return 0;
    const w = V.TAU * freq;
    return 1 - Math.exp(-damp * w * t) * Math.cos(w * Math.sqrt(1 - damp * damp) * t);
  };

  // ---------------------------------------------------------------- seeded randomness
  V.rng = function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };
  // stateless hash noise in [0,1)
  V.hash = (i, j = 0, k = 0) => {
    let h = (Math.imul(i | 0, 374761393) + Math.imul(j | 0, 668265263) + Math.imul(k | 0, 2147483647)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  // smooth 1D value noise, seeded
  V.noise1 = (x, seed = 0) => {
    const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f);
    return V.lerp(V.hash(i, seed), V.hash(i + 1, seed), u) * 2 - 1;
  };

  // ---------------------------------------------------------------- beat grid
  // Injected by the renderer from audio/beats.json; defaults to 120 BPM, phase 0.
  V.beats = window.BEATS || { period: 0.5, phase: 0 };
  V.B = (n) => Math.round((V.beats.phase + n * V.beats.period) * V.FPS) / V.FPS;

  // ---------------------------------------------------------------- fonts
  // Display: Fraunces (opsz 9-144, wght 100-900, SOFT, WONK). UI: Inter (opsz 14-32, wght 100-900).
  // Canvas weights are continuous via the numeric weight in ctx.font.
  V.FONT_DISPLAY = 'Fraunces';
  V.FONT_UI = 'InterV';
  V.display = (px, wght = 600) => `${Math.round(V.clamp(wght, 100, 900))} ${(+px).toFixed(2)}px ${V.FONT_DISPLAY}`;
  V.ui = (px, wght = 450) => `${Math.round(V.clamp(wght, 100, 900))} ${(+px).toFixed(2)}px ${V.FONT_UI}`;
  (function declareFaces() {
    const base = (document.currentScript && document.currentScript.src) || location.href;
    const root = new URL('..', base).href; // lib/ -> project root
    const css =
      `@font-face{font-family:${V.FONT_DISPLAY};src:url(${root}fonts/fraunces.woff2) format('woff2');font-weight:100 900}` +
      `@font-face{font-family:${V.FONT_UI};src:url(${root}fonts/inter.woff2) format('woff2');font-weight:100 900}`;
    const st = document.createElement('style');
    st.textContent = css;
    document.head.appendChild(st);
  })();
  V.fontsReady = (async () => {
    await Promise.all([
      document.fonts.load(`400 40px ${V.FONT_DISPLAY}`), document.fonts.load(`800 40px ${V.FONT_DISPLAY}`),
      document.fonts.load(`400 20px ${V.FONT_UI}`), document.fonts.load(`700 20px ${V.FONT_UI}`),
    ]);
    await document.fonts.ready;
  })();

  // ---------------------------------------------------------------- drawing helpers
  V.fill = (ctx, color) => { ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = color; ctx.fillRect(0, 0, V.W, V.H); ctx.restore(); };
  V.rr = (ctx, x, y, w, h, r) => { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); };
  // Glass panel (S96 `.glass`): low-opacity tinted fill + hairline border. Flat — no glow.
  V.glass = (ctx, x, y, w, h, r, th, alpha = 1) => {
    th = V.theme(th);
    ctx.save();
    ctx.globalAlpha *= alpha;
    V.rr(ctx, x, y, w, h, r);
    ctx.fillStyle = th.glass; ctx.fill();
    ctx.strokeStyle = th.line; ctx.lineWidth = 1; ctx.stroke();
    ctx.restore();
  };
  // Soft centre accent halo (S96 #app::before) — a smooth radial wash, not texture.
  V.halo = (ctx, cx, cy, r, th, k = 1) => {
    th = V.theme(th);
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, V.rgba(th.accentRGB, th.halo * k));
    g.addColorStop(1, V.rgba(th.accentRGB, 0));
    ctx.fillStyle = g;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  };
  // Text helpers
  V.text = (ctx, s, x, y, font, color, align = 'left', base = 'alphabetic') => {
    ctx.font = font; ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = base;
    ctx.fillText(s, x, y);
  };
  // Word-wrap; returns [{line, words:[{w, x}]}] measured with the current font.
  V.wrap = (ctx, s, maxW, font) => {
    ctx.font = font;
    const words = s.split(' ');
    const lines = [];
    let cur = [], curW = 0;
    const space = ctx.measureText(' ').width;
    for (const w of words) {
      const ww = ctx.measureText(w).width;
      if (cur.length && curW + space + ww > maxW) { lines.push(cur); cur = []; curW = 0; }
      cur.push({ w, x: cur.length ? curW + space : 0, width: ww });
      curW = cur.length > 1 ? curW + space + ww : ww;
    }
    if (cur.length) lines.push(cur);
    return lines;
  };
  // Icons as paths (the bundled font subsets have no arrows/checks/▶ glyphs).
  V.icon = {
    check(ctx, x, y, s, color, lw = 2) {
      ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath(); ctx.moveTo(x - s * 0.45, y); ctx.lineTo(x - s * 0.12, y + s * 0.32); ctx.lineTo(x + s * 0.5, y - s * 0.35); ctx.stroke(); ctx.restore();
    },
    arrow(ctx, x, y, s, color, lw = 2) {
      ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath(); ctx.moveTo(x - s * 0.5, y); ctx.lineTo(x + s * 0.5, y); ctx.moveTo(x + s * 0.15, y - s * 0.35); ctx.lineTo(x + s * 0.5, y); ctx.lineTo(x + s * 0.15, y + s * 0.35); ctx.stroke(); ctx.restore();
    },
    sun(ctx, x, y, s, color, lw = 1.6) {
      ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(x, y, s * 0.22, 0, V.TAU); ctx.stroke();
      for (let i = 0; i < 8; i++) { const a = (i / 8) * V.TAU; ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * s * 0.36, y + Math.sin(a) * s * 0.36); ctx.lineTo(x + Math.cos(a) * s * 0.48, y + Math.sin(a) * s * 0.48); ctx.stroke(); }
      ctx.restore();
    },
    sunset(ctx, x, y, s, color, lw = 1.6) {
      ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(x, y + s * 0.12, s * 0.24, Math.PI, 0); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x - s * 0.5, y + s * 0.12); ctx.lineTo(x + s * 0.5, y + s * 0.12); ctx.stroke();
      for (const a of [-2.4, -1.57, -0.74]) { ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * s * 0.36, y + s * 0.12 + Math.sin(a) * s * 0.36); ctx.lineTo(x + Math.cos(a) * s * 0.48, y + s * 0.12 + Math.sin(a) * s * 0.48); ctx.stroke(); }
      ctx.restore();
    },
    moon(ctx, x, y, s, color, lw = 1.6) {
      ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.lineJoin = 'round';
      ctx.beginPath(); ctx.arc(x, y, s * 0.36, 0.9, V.TAU - 0.9 + 2 * 0.0, false);
      ctx.arc(x + s * 0.2, y - s * 0.12, s * 0.28, V.TAU - 1.2, 1.55, true);
      ctx.stroke(); ctx.restore();
    },
  };

  // ---------------------------------------------------------------- motion blur + seek
  // A film registers drawFrame(ctx, t). V.mount wires window.seek(t) with an N-sample 180° shutter.
  V.mount = function (drawFrame, { samples = 6, shutter = 0.5, duration = 30 } = {}) {
    const main = document.getElementById('c');
    const mctx = main.getContext('2d');
    const buf = document.createElement('canvas');
    buf.width = V.W; buf.height = V.H;
    const ctx = buf.getContext('2d');
    V.duration = duration;
    window.seek = function (t) {
      t = V.clamp(t, 0, duration - 1e-6);
      for (let i = 0; i < samples; i++) {
        const ts = t + (i / samples) * (shutter / V.FPS);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.filter = 'none';
        drawFrame(ctx, ts);
        mctx.globalAlpha = 1 / (i + 1);
        mctx.drawImage(buf, 0, 0);
      }
      mctx.globalAlpha = 1;
      return Math.round(t * V.FPS);
    };
    const r = V.fontsReady.then(() => { window.seek(0); return true; });
    if (!V.deferReady) window.ready = r;
    return r;
  };
})();
