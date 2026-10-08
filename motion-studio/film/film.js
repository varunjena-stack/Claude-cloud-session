// Claude — Motion Design Reel. 15s, 1920x1080.
// Render contract: window.seek(t) paints frame t. Pure function of time — no timers,
// no rAF, no state carried between frames. Randomness is seeded (mulberry32).
'use strict';

const W = 1920, H = 1080, FPS = 60, DUR = 15;
const INK = '#141413', IVORY = '#F0EEE6', CLAY = '#D97757';
const BLUR_SAMPLES = 6, SHUTTER = 0.5; // 180° shutter

// ------------------------------------------------------------------ beat grid
const BEATS = window.BEATS || { period: 0.5, phase: 0 };
const PERIOD = BEATS.period;
const PHASE = Math.abs(BEATS.phase) < 0.5 / FPS ? 0 : BEATS.phase;
const B = (n) => Math.round((PHASE + n * PERIOD) * FPS) / FPS; // beat n, snapped to a frame

// ------------------------------------------------------------------ math
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, k) => a + (b - a) * k;
const prog = (t, a, b) => clamp((t - a) / (b - a));
const TAU = Math.PI * 2;
const E = {
  linear: (x) => x,
  inCubic: (x) => x * x * x,
  outCubic: (x) => 1 - Math.pow(1 - x, 3),
  inOutCubic: (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2),
  outExpo: (x) => (x >= 1 ? 1 : 1 - Math.pow(2, -10 * x)),
  inExpo: (x) => (x <= 0 ? 0 : Math.pow(2, 10 * x - 10)),
  inOutExpo: (x) => x <= 0 ? 0 : x >= 1 ? 1 : x < 0.5 ? Math.pow(2, 20 * x - 10) / 2 : (2 - Math.pow(2, -20 * x + 10)) / 2,
  outBack: (x) => { const c1 = 1.9, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); },
  inBack: (x) => { const c1 = 1.7, c3 = c1 + 1; return c3 * x * x * x - c1 * x * x; },
  outElastic: (x) => x <= 0 ? 0 : x >= 1 ? 1 : Math.pow(2, -10 * x) * Math.sin((x * 10 - 0.75) * (TAU / 3)) + 1,
  outBounce: (x) => {
    const n1 = 7.5625, d1 = 2.75;
    if (x < 1 / d1) return n1 * x * x;
    if (x < 2 / d1) return n1 * (x -= 1.5 / d1) * x + 0.75;
    if (x < 2.5 / d1) return n1 * (x -= 2.25 / d1) * x + 0.9375;
    return n1 * (x -= 2.625 / d1) * x + 0.984375;
  },
};
// damped spring step response, 0 -> 1 (t in seconds since start)
const spring = (t, freq = 3.2, damp = 0.35) => {
  if (t <= 0) return 0;
  const w = TAU * freq;
  return 1 - Math.exp(-damp * w * t) * Math.cos(w * Math.sqrt(1 - damp * damp) * t);
};
// decaying pulse after each beat (for "hits")
const beatPulse = (t, decay = 10) => {
  const k = Math.floor((t - PHASE) / PERIOD);
  const age = t - B(k);
  return age >= 0 ? Math.exp(-age * decay) : 0;
};

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ------------------------------------------------------------------ fonts
// Archivo variable (wght 100-900, wdth 62-125). Canvas can't set wdth directly, so one
// @font-face per width step; Chrome clamps the face's font-stretch onto the wdth axis.
const WDTH_MIN = 62, WDTH_MAX = 125;
(function declareFaces() {
  let css = '';
  for (let w = WDTH_MIN; w <= WDTH_MAX; w++) {
    css += `@font-face{font-family:AW${w};src:url(../fonts/archivo.woff2) format('woff2');font-stretch:${w}%;font-weight:100 900}`;
  }
  css += `@font-face{font-family:Mono;src:url(../fonts/mono-500.woff2);font-weight:500}`;
  css += `@font-face{font-family:Mono;src:url(../fonts/mono-700.woff2);font-weight:700}`;
  document.getElementById('faces').textContent = css;
})();
const disp = (px, wght = 900, wdth = 100) =>
  `${Math.round(clamp(wght, 100, 900))} ${px.toFixed(2)}px AW${Math.round(clamp(wdth, WDTH_MIN, WDTH_MAX))}`;
const mono = (px, wght = 500) => `${wght} ${px}px Mono`;

// ------------------------------------------------------------------ canvas
const main = document.getElementById('c');
const mctx = main.getContext('2d');
const buf = document.createElement('canvas');
buf.width = W; buf.height = H;
const ctx = buf.getContext('2d');

// film grain: 6 seeded tiles, picked by frame index
const GRAIN = [];
(function makeGrain() {
  for (let k = 0; k < 6; k++) {
    const g = document.createElement('canvas');
    g.width = g.height = 256;
    const gx = g.getContext('2d');
    const img = gx.createImageData(256, 256);
    const r = mulberry32(1000 + k);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = r() * 255;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    gx.putImageData(img, 0, 0);
    GRAIN.push(g);
  }
})();

function fill(c, color) { c.fillStyle = color; c.fillRect(0, 0, W, H); }

// lay out a word as individual letters, each with its own width/weight axis.
// returns [{ch, x, w}] at the given px size, plus total width.
function layout(c, text, px, axes) {
  let x = 0;
  const out = [];
  for (let i = 0; i < text.length; i++) {
    const { wght, wdth } = axes(i);
    c.font = disp(px, wght, wdth);
    const w = c.measureText(text[i]).width;
    out.push({ ch: text[i], x, w, font: c.font });
    x += w;
  }
  return { letters: out, width: x };
}

// ================================================================== SCENES
// Each scene: draw(c, t) with absolute time t. Scene windows on the bar grid.

// ---- S1: the bouncing ball — every single frame (beats 0-4) ---------------
const FLOOR = 900, BALL_R = 80;
const HOPS = [ // impacts at beats 0..3, x positions
  { t: () => B(0), x: 250 }, { t: () => B(1), x: 690 }, { t: () => B(2), x: 1120 }, { t: () => B(3), x: 1540 },
];
const HOP_H = [300, 360, 420];
function ballPos(t) {
  for (let i = 0; i < HOPS.length - 1; i++) {
    const a = HOPS[i].t(), b = HOPS[i + 1].t();
    if (t >= a && t < b) {
      const s = (t - a) / (b - a);
      return { x: lerp(HOPS[i].x, HOPS[i + 1].x, s), y: FLOOR - BALL_R - HOP_H[i] * 4 * s * (1 - s), r: BALL_R };
    }
  }
  if (t < HOPS[0].t()) return { x: HOPS[0].x, y: FLOOR - BALL_R, r: BALL_R };
  // after the last impact: leap at the camera and swallow the frame
  const a = B(3), b = B(4);
  const s = prog(t, a, b);
  const k = E.inCubic(s);
  const x = lerp(1540, 960, E.outCubic(s));
  const y = lerp(FLOOR - BALL_R, 540, E.outCubic(s)) - 260 * Math.sin(Math.PI * s) * (1 - s);
  return { x, y, r: BALL_R * Math.exp(Math.log(1300 / BALL_R) * k) };
}
function lastImpactAge(t) {
  let age = Infinity;
  for (const h of HOPS) { const a = t - h.t(); if (a >= 0) age = Math.min(age, a); }
  return age;
}
function drawBall(c, t, color = CLAY) {
  const p = ballPos(t);
  const q = ballPos(t + 1 / 240);
  const vx = (q.x - p.x) * 240, vy = (q.y - p.y) * 240;
  const speed = Math.hypot(vx, vy);
  const age = lastImpactAge(t);
  const sq = age < 0.4 && t < B(3) + 0.12 ? 0.42 * Math.exp(-age * 13) * Math.cos(age * 30) : 0;
  c.save();
  c.translate(p.x, p.y + p.r * sq * 0.9);
  if (Math.abs(sq) > 0.01) {
    c.scale(1 + sq * 0.85, 1 - sq);
  } else if (p.r < 200) {
    const st = clamp(speed / 2600, 0, 0.38);
    c.rotate(Math.atan2(vy, vx));
    c.scale(1 + st, 1 / (1 + st));
  }
  c.beginPath(); c.arc(0, 0, p.r, 0, TAU); c.fillStyle = color; c.fill();
  c.restore();
  return p;
}
function sceneBounce(c, t) {
  fill(c, INK);
  // floor: draws outward from first impact
  const fl = E.outExpo(prog(t, 0, 0.6));
  c.strokeStyle = 'rgba(240,238,230,0.35)'; c.lineWidth = 3;
  c.beginPath(); c.moveTo(250 - 250 * fl, FLOOR); c.lineTo(250 + 1670 * fl, FLOOR); c.stroke();

  // the words stamp on each landing
  const words = [['EVERY', 0], ['SINGLE', 1], ['FRAME', 2]];
  words.forEach(([w, n], i) => {
    const a = t - B(n) + (n === 0 ? 0.14 : 0); // first word is already landing on frame 0: the hook
    if (a < 0) return;
    const k = E.outExpo(clamp(a / 0.35));
    const px = 250;
    const wd = lerp(125, 74, k), wg = lerp(250, 900, k);
    c.font = disp(px, wg, wd);
    c.fillStyle = IVORY;
    c.textBaseline = 'alphabetic';
    const y = 280 + i * 222;
    const off = (1 - spring(a, 3.5, 0.45)) * 80;
    c.save();
    c.beginPath(); c.rect(0, y - px * 0.78, W, px * 0.82); c.clip();
    c.fillText(w, 110, y + off);
    if (n === 2) { // clay full stop on FRAME
      const fw = c.measureText(w).width;
      const s = spring(a - (B(3) - B(2)), 4, 0.4); // pops on the last bounce
      c.beginPath(); c.arc(110 + fw + 36, y - 22, 26 * s, 0, TAU); c.fillStyle = CLAY; c.fill();
    }
    c.restore();
  });

  // shock rings on each impact
  HOPS.forEach((h) => {
    const a = t - h.t();
    if (a < 0 || a > 0.5) return;
    const k = E.outExpo(a / 0.5);
    c.strokeStyle = `rgba(240,238,230,${0.5 * (1 - k)})`;
    c.lineWidth = 3;
    c.beginPath(); c.ellipse(h.x, FLOOR, 40 + 220 * k, (40 + 220 * k) * 0.18, 0, 0, TAU); c.stroke();
  });

  // contact shadow
  const p = ballPos(t);
  if (p.r < 120) {
    const hgt = clamp((FLOOR - p.y - p.r) / 420);
    c.fillStyle = `rgba(0,0,0,${0.55 * (1 - hgt * 0.7)})`;
    c.beginPath(); c.ellipse(p.x, FLOOR + 6, BALL_R * (1.3 - hgt * 0.6), 10 * (1 - hgt * 0.5), 0, 0, TAU); c.fill();
  }
  drawBall(c, t);

  // frame counter riding the ball
  if (p.r < 110) {
    const f = Math.floor(t * FPS + 1e-6);
    const lx = p.x + 104, ly = p.y - 104;
    c.strokeStyle = 'rgba(240,238,230,0.55)'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(p.x + 60, p.y - 60); c.lineTo(lx, ly); c.lineTo(lx + 40, ly); c.stroke();
    c.font = mono(44, 700); c.fillStyle = IVORY; c.textBaseline = 'middle';
    c.fillText('f.' + String(f).padStart(3, '0'), lx + 50, ly + 1);
  }
}

// ---- S2: variable type — MOTION (beats 4-8) -------------------------------
function sceneMotion(c, t) {
  const t0 = B(4);
  const u = t - t0;
  const word = 'MOTION';
  const out = E.inOutCubic(prog(t, B(7), B(7) + 0.4)); // panel exit
  c.save();
  c.translate(0, out * H * 1.05);
  fill(c, CLAY);

  const rowAxes = (row) => (i) => {
    const intro = E.outExpo(clamp((u - i * 0.035) / 0.45));
    const wave = Math.sin(TAU * ((u - 0.5) * 2 - i / 6 - row * 0.12));
    const waveAmt = clamp((u - 0.45) / 0.3);
    const wd = lerp(125, 92 + 33 * wave * waveAmt, intro);
    const wg = lerp(120, 900, intro) - 120 * beatPulse(t, 12) * waveAmt;
    return { wght: wg, wdth: wd };
  };
  const target = 1760;
  const rows = [0, -1, 1, -2, 2];
  rows.forEach((row) => {
    const enter = row === 0 ? 1 : E.outExpo(clamp((u - (Math.abs(row) === 1 ? 0.5 : 1.0)) / 0.45));
    if (enter <= 0) return;
    const L = layout(c, word, 100, rowAxes(row));
    const px = Math.min(330, (target / L.width) * 100);
    const lay = layout(c, word, px, rowAxes(row));
    const sx = (W - lay.width) / 2;
    const lineH = px * 0.86;
    const baseY = 540 + px * 0.36 + row * lineH * enter;
    c.textBaseline = 'alphabetic';
    lay.letters.forEach((l, i) => {
      const a = u - i * 0.035;
      const rise = row === 0 ? (1 - spring(a, 2.6, 0.42)) * 420 : 0;
      const fall = E.inCubic(clamp((t - B(7) + 0.1 - i * 0.03) / 0.35)) * 300; // letters drop with stagger
      c.font = l.font;
      if (row === 0) {
        c.fillStyle = INK;
        c.fillText(l.ch, sx + l.x, baseY + rise + fall);
      } else {
        c.strokeStyle = `rgba(20,20,19,${0.85 - Math.abs(row) * 0.22})`;
        c.lineWidth = 3;
        c.strokeText(l.ch, sx + l.x, baseY + fall * (1 + Math.abs(row) * 0.2));
      }
    });
  });
  c.restore();
}

// ---- S3: grid choreography (beats 8-12) -----------------------------------
const COLS = 16, ROWS = 9, CELL = 120;
// clay cells draw a ▶ play glyph in the middle of the grid
const isPlay = (col, row) => {
  const x = col - 6.2, y = row - 4;
  return x >= 0 && x <= 3.6 && Math.abs(y) <= (3.6 - x) * 0.85 + 0.2;
};
function sceneGrid(c, t) {
  const t0 = B(8);
  fill(c, IVORY);
  const zoomS = prog(t, B(11), B(12));
  const z = Math.exp(Math.log(48) * E.inCubic(zoomS));
  const fx = 7 * CELL + CELL / 2, fy = 4 * CELL + CELL / 2; // focus cell (7,4)
  c.save();
  c.translate(W / 2 + (fx - W / 2) * (1 - E.outCubic(zoomS)), H / 2 + (fy - H / 2) * (1 - E.outCubic(zoomS)));
  c.scale(z, z);
  c.translate(-fx, -fy);
  const pulse = beatPulse(t, 9);
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const cx = col * CELL + CELL / 2, cy = row * CELL + CELL / 2;
      const d = Math.hypot(cx - fx, cy - fy) / 1100;
      const pop = spring(t - t0 - d * 0.42, 2.8, 0.38);
      if (pop <= 0.001) continue;
      // second wave: diagonal from bottom-left, rotates and morphs to circles
      const d2 = (col + (ROWS - 1 - row)) / (COLS + ROWS);
      const w2 = E.outBack(clamp((t - B(10) - d2 * 0.45) / 0.4));
      const play = isPlay(col, row);
      const focus = col === 7 && row === 4;
      let s = CELL * (play ? 0.78 : 0.5) * pop * (1 + 0.12 * pulse);
      let rad = lerp(0, 0.5, clamp(w2)) * s;
      if (play) rad = lerp(s * 0.12, s * 0.5, clamp(w2));
      if (focus) { s = lerp(s, CELL * 1.02, E.inOutCubic(zoomS)); rad = lerp(rad, 0, E.inOutCubic(zoomS)); }
      c.save();
      c.translate(cx, cy);
      c.rotate((w2 * Math.PI) / 2 + (1 - pop) * 0.6);
      c.fillStyle = focus && zoomS > 0 ? INK : play ? CLAY : INK;
      c.beginPath();
      c.roundRect(-s / 2, -s / 2, s, s, rad);
      c.fill();
      c.restore();
    }
  }
  c.restore();
}

// ---- S4: text tunnel (beats 12-16) ---------------------------------------
const RING_TEXT = 'TIMING · SPACING · WEIGHT · ARCS · OVERLAP · ';
const RING_GAP = 520;
function camZ(t) {
  const u = (t - B(12)) / PERIOD; // beats into the scene
  if (u < 0) return 0;
  const k = Math.floor(u), f = u - k;
  if (u < 3) return (k + E.outExpo(f)) * RING_GAP; // a surge on every kick
  return (3 + E.inExpo(Math.min(f + (k - 3), 1)) * 6) * RING_GAP; // final acceleration
}
function sceneTunnel(c, t) {
  fill(c, INK);
  const zc = camZ(t) - RING_GAP * 0.6;
  const f = 820;
  c.save();
  c.translate(W / 2, H / 2);
  c.rotate(Math.sin((t - B(12)) * 1.3) * 0.18);
  for (let n = 14; n >= 1; n--) {
    const zr = n * RING_GAP - zc;
    if (zr <= 40) continue;
    const sc = f / zr;
    const depthA = clamp(1 - zr / (RING_GAP * 9)) * clamp((zr - 40) / 220);
    if (depthA <= 0) continue;
    const R = 560 * sc;
    const isClay = n % 3 === 0;
    const glyphs = 46;
    const spin = (n % 2 ? 1 : -1) * (t - B(12)) * 0.35 + n * 0.4;
    c.fillStyle = isClay ? CLAY : IVORY;
    c.globalAlpha = depthA;
    c.font = disp(78 * sc, isClay ? 900 : 600, isClay ? 75 : 110);
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    for (let g = 0; g < glyphs; g++) {
      const a = spin + (g / glyphs) * TAU;
      c.save();
      c.rotate(a);
      c.translate(0, -R);
      c.fillText(RING_TEXT[g % RING_TEXT.length], 0, 0);
      c.restore();
    }
  }
  c.globalAlpha = 1;
  // the exit: an ivory aperture opening at the vanishing point
  const ex = E.inExpo(prog(t, B(15), B(16)));
  if (ex > 0) {
    c.fillStyle = IVORY;
    c.beginPath(); c.arc(0, 0, 6 + ex * 1200, 0, TAU); c.fill();
  }
  c.restore();
  c.textAlign = 'left';
}

// ---- S5: easing lanes (beats 16-20) --------------------------------------
const LANES = [
  ['linear', E.linear], ['in-out cubic', E.inOutCubic], ['out back', E.outBack],
  ['out elastic', E.outElastic], ['out bounce', E.outBounce],
];
function sceneEasing(c, t) {
  fill(c, IVORY);
  const t0 = B(16);
  const X0 = 660, X1 = 1780, RUN = 0.875;
  const gather = E.inOutExpo(prog(t, B(18), B(19)));
  LANES.forEach(([name, fn], i) => {
    const y = 220 + i * 160;
    const la = t - t0 - i * 0.03;
    // lane hairline draws on, retracts during gather
    const draw = E.outExpo(clamp(la / 0.4)) * (1 - gather);
    c.strokeStyle = 'rgba(20,20,19,0.18)'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(X0, y); c.lineTo(lerp(X0, X1, draw), y); c.stroke();
    // label
    c.globalAlpha = clamp(la / 0.2) * (1 - gather);
    c.font = mono(54, 700); c.fillStyle = INK; c.textBaseline = 'middle';
    c.fillText(name, 100 - 300 * E.inCubic(gather), y + 2);
    c.globalAlpha = 1;
    const p = clamp((t - t0 - 0.125) / RUN);
    const isAccent = i === 3;
    // onion skin: the spacing chart
    const ghostsA = (1 - gather) * clamp((t - t0 - 0.1) / 0.1);
    for (let g = 0; g <= 12; g++) {
      const gp = g / 12;
      if (gp > p) break;
      const gx = lerp(X0, X1, fn(gp));
      c.strokeStyle = isAccent ? `rgba(217,119,87,${0.55 * ghostsA})` : `rgba(20,20,19,${0.32 * ghostsA})`;
      c.lineWidth = 3;
      c.beginPath(); c.arc(gx, y, 26, 0, TAU); c.stroke();
    }
    // the dot itself, then everyone flies to the centre
    let x = lerp(X0, X1, fn(p)), yy = y;
    x = lerp(x, 960, gather); yy = lerp(yy, 540, gather);
    c.fillStyle = isAccent || gather > 0.98 ? CLAY : INK;
    c.beginPath(); c.arc(x, yy, 28, 0, TAU); c.fill();
  });
  // merged dot grows on the last beat
  const m = t - B(19);
  if (m > 0) {
    const k = E.outExpo(clamp(m / 0.45));
    c.strokeStyle = `rgba(217,119,87,${1 - k})`; c.lineWidth = 6;
    c.beginPath(); c.arc(960, 540, 40 + 700 * k, 0, TAU); c.stroke();
    c.fillStyle = CLAY;
    c.beginPath(); c.arc(960, 540, 28 + 190 * spring(m, 2.6, 0.32), 0, TAU); c.fill();
  }
}

// ---- S6: montage, a cut every 8th note (beats 20-24) ---------------------
function sceneMontage(c, t) {
  const idx = clamp(Math.floor((t - B(20)) / (PERIOD / 2)), 0, 7);
  const a = B(20) + idx * PERIOD / 2;
  const v = clamp((t - a) / (PERIOD / 2)); // 0..1 inside the cut
  const rnd = mulberry32(77 + idx);
  switch (idx) {
    case 0: { // clay arc sweep
      fill(c, INK);
      c.lineCap = 'round';
      c.strokeStyle = CLAY; c.lineWidth = 64;
      const sw = E.outExpo(v) * TAU * 0.92;
      c.beginPath(); c.arc(960, 540, 300, -Math.PI / 2 + v * 2, -Math.PI / 2 + v * 2 + sw); c.stroke();
      c.strokeStyle = IVORY; c.lineWidth = 6;
      c.beginPath(); c.arc(960, 540, 400, Math.PI / 2 - v * 3, Math.PI / 2 - v * 3 + E.outCubic(v) * 5); c.stroke();
      c.lineCap = 'butt';
      break;
    }
    case 1: { // slot-machine counter to 60
      fill(c, CLAY);
      const px = 640;
      c.font = disp(px, 900, 68); c.fillStyle = INK; c.textBaseline = 'alphabetic';
      const w = c.measureText('0').width;
      const x0 = 330;
      c.save(); c.beginPath(); c.rect(0, 540 - px * 0.5, W, px * 0.78); c.clip();
      [6, 0].forEach((target, d) => {
        const roll = E.outExpo(clamp(v * 1.15 - d * 0.08)) * (10 + target);
        const base = Math.floor(roll), fr = roll - base;
        for (let k = -1; k <= 1; k++) {
          const digit = ((base + k) % 10 + 10) % 10;
          c.fillText(String(digit), x0 + d * w, 540 + px * 0.27 - (k - fr) * px * 0.8);
        }
      });
      c.restore();
      c.font = mono(72, 700);
      c.fillText('FPS', x0 + 2 * w + 40, 540 + px * 0.27);
      break;
    }
    case 2: { // diagonal stripes through a moving porthole
      fill(c, IVORY);
      c.save();
      c.beginPath(); c.arc(lerp(700, 1220, E.inOutCubic(v)), 540, 420, 0, TAU); c.clip();
      fill(c, INK);
      c.strokeStyle = CLAY; c.lineWidth = 34;
      const off = v * 160;
      for (let k = -30; k < 30; k++) {
        c.beginPath(); c.moveTo(k * 80 + off, -40); c.lineTo(k * 80 + off + 1200, 1120); c.stroke();
      }
      c.restore();
      break;
    }
    case 3: { // halftone ripple
      fill(c, INK);
      c.fillStyle = CLAY;
      const ox = 960 + (rnd() - 0.5) * 400, oy = 540;
      for (let y = 30; y < H; y += 60) {
        for (let x = 30; x < W; x += 60) {
          const d = Math.hypot(x - ox, y - oy);
          const r = 26 * (0.5 + 0.5 * Math.sin(d / 70 - v * 14)) * clamp(1.3 - d / 1300);
          if (r < 1) continue;
          c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
        }
      }
      break;
    }
    case 4: { // star, morphing point count & spin
      fill(c, IVORY);
      c.save(); c.translate(960, 540); c.rotate(E.outExpo(v) * Math.PI * 0.75);
      const pts = 5 + Math.floor(v * 8);
      const r0 = 400, r1 = lerp(150, 330, 0.5 + 0.5 * Math.sin(v * 12));
      c.beginPath();
      for (let k = 0; k < pts * 2; k++) {
        const r = k % 2 ? r1 : r0, ang = (k / (pts * 2)) * TAU;
        c.lineTo(Math.cos(ang) * r, Math.sin(ang) * r);
      }
      c.closePath(); c.fillStyle = INK; c.fill();
      c.restore();
      break;
    }
    case 5: { // TIMING, width axis sweep
      fill(c, CLAY);
      const wd = lerp(62, 125, E.inOutCubic(v));
      const L = layout(c, 'TIMING', 100, () => ({ wght: 900, wdth: wd }));
      const px = Math.min(420, (1700 / L.width) * 100);
      c.font = disp(px, 900, wd); c.fillStyle = INK; c.textBaseline = 'alphabetic';
      c.fillText('TIMING', 110, 540 + px * 0.36);
      break;
    }
    case 6: { // lagged concentric squares
      fill(c, INK);
      c.strokeStyle = IVORY; c.lineWidth = 5;
      for (let k = 0; k < 16; k++) {
        const s = 60 + k * 62;
        const r = E.inOutCubic(clamp(v * 1.7 - k * 0.045)) * Math.PI / 2;
        c.save(); c.translate(960, 540); c.rotate(r);
        if (k === 7) { c.strokeStyle = CLAY; c.lineWidth = 12; }
        c.strokeRect(-s / 2, -s / 2, s, s);
        c.strokeStyle = IVORY; c.lineWidth = 5;
        c.restore();
      }
      break;
    }
    case 7: { // SPACING, tracking opens up
      fill(c, IVORY);
      const word = 'SPACING';
      const px = 300;
      c.font = disp(px, 900, 70); c.fillStyle = INK; c.textBaseline = 'alphabetic';
      const tr = lerp(-0.04, 0.42, E.outExpo(v)) * px;
      const widths = [...word].map((ch) => c.measureText(ch).width);
      const total = widths.reduce((s, w) => s + w, 0) + tr * (word.length - 1);
      let x = (W - total) / 2;
      [...word].forEach((ch, k) => { c.fillText(ch, x, 540 + px * 0.36); x += widths[k] + tr; });
      break;
    }
  }
}

// ---- S7: resolve — the mark and the name (beats 24-30) --------------------
const MARK = { x: 520, y: 520, R: 190, rays: 12 };
function drawMark(c, t, t0) {
  c.save();
  c.translate(MARK.x, MARK.y);
  const tick = spring(t - B(29), 3, 0.45) * (TAU / 24); // final beat: the mark clicks a notch
  c.rotate((1 - spring(t - t0, 1.6, 0.5)) * -1.4 + Math.sin((t - t0) * 0.8) * 0.02 + tick);
  for (let i = 0; i < MARK.rays; i++) {
    const g = spring(t - t0 - 0.06 - (i % 6) * 0.025, 2.4, 0.42);
    if (g <= 0) continue;
    const len = MARK.R * (i % 2 ? 0.8 : 1) * g;
    const ang = (i / MARK.rays) * TAU;
    c.save(); c.rotate(ang);
    c.beginPath();
    c.moveTo(-15, -6);
    c.quadraticCurveTo(-11, -len * 0.6, -6, -len);
    c.arc(0, -len, 6, Math.PI, 0);
    c.quadraticCurveTo(11, -len * 0.6, 15, -6);
    c.closePath();
    c.fillStyle = CLAY; c.fill();
    c.restore();
  }
  c.restore();
}
function sceneResolve(c, t) {
  const t0 = B(24);
  fill(c, INK);
  const push = 1 + 0.025 * E.outCubic(prog(t, t0, DUR));
  c.save();
  c.translate(W / 2, H / 2); c.scale(push, push); c.translate(-W / 2, -H / 2);
  // shockwave
  const sw = prog(t, t0, t0 + 0.9);
  if (sw < 1) {
    c.strokeStyle = `rgba(240,238,230,${0.6 * (1 - sw)})`; c.lineWidth = 4 * (1 - sw) + 1;
    c.beginPath(); c.arc(MARK.x, MARK.y, 60 + E.outExpo(sw) * 1300, 0, TAU); c.stroke();
  }
  drawMark(c, t, t0);

  // wordmark
  const word = 'Claude';
  const px = 300, bx = 800, by = 620;
  const lay = layout(c, word, px, (i) => {
    const k = E.outExpo(clamp((t - B(25) - i * 0.05) / 0.6));
    return { wght: lerp(100, 620, k), wdth: lerp(125, 86, k) };
  });
  c.save();
  c.beginPath(); c.rect(0, by - px * 0.85, W, px * 1.0); c.clip();
  c.textBaseline = 'alphabetic'; c.fillStyle = IVORY;
  lay.letters.forEach((l, i) => {
    const a = t - B(25) - i * 0.05;
    if (a < 0) return;
    c.font = l.font;
    c.fillText(l.ch, bx + l.x, by + (1 - spring(a, 2.6, 0.5)) * 300);
  });
  c.restore();

  // subline decodes from seeded noise
  const sub = 'MOTION DESIGN  /  SHOWREEL 2026';
  const glyphs = 'ABCDEFGHJKLMNPRSTUVWXYZ0123456789/#*+';
  c.font = mono(50, 500); c.textBaseline = 'alphabetic';
  let sx = bx + 10;
  const cw = c.measureText('M').width;
  for (let i = 0; i < sub.length; i++) {
    const lock = B(26) + i * 0.018;
    const on = B(26) - 0.1 + i * 0.008;
    if (t < on) break;
    let ch = sub[i];
    if (t < lock && ch !== ' ') {
      const r = mulberry32(i * 131 + Math.floor(t * 30));
      ch = glyphs[Math.floor(r() * glyphs.length)];
      c.fillStyle = CLAY;
    } else c.fillStyle = 'rgba(240,238,230,0.72)';
    c.fillText(ch, sx + i * cw, by + 116);
  }

  // callback: the ball from frame 0 lands as the full stop
  const endX = bx + lay.width + 34, endY = by - 30;
  const la = B(28), lb = la - 0.55;
  if (t > lb) {
    let x, y, sq = 0;
    if (t < la) {
      const s = (t - lb) / (la - lb);
      x = lerp(1960, endX, s);
      y = lerp(150, endY, s * s) - 260 * Math.sin(Math.PI * s) * (1 - s);
    } else {
      const a = t - la;
      x = endX; y = endY;
      sq = 0.45 * Math.exp(-a * 11) * Math.cos(a * 30);
    }
    c.save(); c.translate(x, y + 30 * sq);
    c.scale(1 + sq * 0.8, 1 - sq);
    c.beginPath(); c.arc(0, 0, 30, 0, TAU); c.fillStyle = CLAY; c.fill();
    c.restore();
  }
  c.restore();
}

// ================================================================== TIMELINE
function drawFrame(c, t) {
  c.save();
  if (t < B(4)) {
    sceneBounce(c, t);
  } else if (t < B(8)) {
    sceneGrid(c, t);           // waiting underneath the clay panel
    sceneMotion(c, t);
  } else if (t < B(12)) sceneGrid(c, t);
  else if (t < B(16)) sceneTunnel(c, t);
  else if (t < B(20)) sceneEasing(c, t);
  else if (t < B(24)) sceneMontage(c, t);
  else sceneResolve(c, t);
  c.restore();
}

window.seek = function seek(t) {
  t = clamp(t, 0, DUR - 1e-6);
  const frame = Math.round(t * FPS);
  for (let i = 0; i < BLUR_SAMPLES; i++) {
    const ts = t + (i / BLUR_SAMPLES) * (SHUTTER / FPS);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    drawFrame(ctx, ts);
    mctx.globalAlpha = 1 / (i + 1);
    mctx.drawImage(buf, 0, 0);
  }
  // grain
  mctx.globalAlpha = 0.045;
  mctx.globalCompositeOperation = 'overlay';
  const g = GRAIN[frame % GRAIN.length];
  mctx.fillStyle = mctx.createPattern(g, 'repeat');
  mctx.fillRect(0, 0, W, H);
  mctx.globalCompositeOperation = 'source-over';
  mctx.globalAlpha = 1;
  return frame;
};

window.ready = (async () => {
  const loads = [];
  for (let w = WDTH_MIN; w <= WDTH_MAX; w++) loads.push(document.fonts.load(`900 100px AW${w}`));
  loads.push(document.fonts.load('500 40px Mono'), document.fonts.load('700 40px Mono'));
  await Promise.all(loads);
  await document.fonts.ready;
  window.seek(0);
  return true;
})();
