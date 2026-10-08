// VEDAOS film component: the S96 particle orb, recreated in Canvas 2D.
//
// 5,200 points: ~42% fill the interior biased toward the centre, the rest form a turbulent shell.
// The cloud spins about a tilted axis with perspective (near points bigger/brighter, far points dimmer).
// Dark theme composites additively ('lighter') in warm terracotta/amber with a hot core; light/cream use
// normal blending, deeper terracotta (#bd6a3c), depth-sorted, with an opacity floor so it never washes out.
//
// Pure function of time: every draw derives from (point index, t, options). Static data (points, sprites)
// is built once at load from a seeded RNG. Nothing is mutated during draw.
'use strict';
(function () {
  const V = window.V;
  const TAU = Math.PI * 2;
  const clamp = V.clamp;
  const lerp = V.lerp;

  // ------------------------------------------------------------------ static point cloud
  const N = 5200;
  const N_IN = Math.round(N * 0.42); // interior points: indices [0, N_IN)
  const rnd = V.rng(0x5e96a1);

  const DX = new Float32Array(N), DY = new Float32Array(N), DZ = new Float32Array(N);
  const R0 = new Float32Array(N); // interior: base radius (0..1); shell: thickness offset (-1..1)
  const SZ = new Float32Array(N); // size factor
  const BR = new Float32Array(N); // brightness factor
  const HB = new Float32Array(N); // base heat (sprite index bias) 0..3
  const DL = new Float32Array(N); // ignite delay 0..0.4
  const JS = new Float32Array(N); // jitter seed offset
  const NW = 6;                    // turbulence waves: 3 slow, 3 fast
  const WP = new Float32Array(N * NW); // per-point spatial wave phase  k·dir + phi
  // orbiters (researching drift): a subset of shell points that lift into inclined orbits
  const OI = new Int16Array(N).fill(-1); // index into orbiter tables or -1
  const ORB_LANES = [];
  const ORB_A = [], ORB_R = [], ORB_W = [], ORB_L = [];

  // seeded wave directions / frequencies
  const WAVES = [];
  for (let k = 0; k < NW; k++) {
    const u = rnd() * 2 - 1, a = rnd() * TAU, s = Math.sqrt(1 - u * u);
    const slow = k < 3;
    WAVES.push({
      kx: Math.cos(a) * s, ky: u, kz: Math.sin(a) * s,
      f: slow ? 1.6 + rnd() * 1.1 : 4.2 + rnd() * 2.2,      // spatial frequency (radians per unit)
      w: (slow ? 0.38 + rnd() * 0.3 : 1.7 + rnd() * 1.1) * (rnd() < 0.5 ? -1 : 1), // temporal rad/s
      ph: rnd() * TAU,
    });
  }

  // three inclined orbital lanes for the researching drift
  for (let l = 0; l < 3; l++) {
    // plane basis: normal tilted from the spin axis
    const inc = 0.35 + l * 0.42, az = l * 2.1 + 0.4;
    const nx = Math.sin(inc) * Math.cos(az), ny = Math.cos(inc), nz = Math.sin(inc) * Math.sin(az);
    // u = normalize(cross(n, X)), v = cross(n, u)
    let ux = 0, uy = nz, uz = -ny;
    const ul = Math.hypot(ux, uy, uz) || 1; ux /= ul; uy /= ul; uz /= ul;
    const vx = ny * uz - nz * uy, vy = nz * ux - nx * uz, vz = nx * uy - ny * ux;
    ORB_LANES.push({ ux, uy, uz, vx, vy, vz, w: 0.55 + l * 0.22, r: 1.22 + l * 0.11 });
  }

  for (let i = 0; i < N; i++) {
    // uniform direction
    const u = rnd() * 2 - 1, a = rnd() * TAU, s = Math.sqrt(1 - u * u);
    DX[i] = Math.cos(a) * s; DY[i] = u; DZ[i] = Math.sin(a) * s;
    const interior = i < N_IN;
    if (interior) {
      // biased toward the centre: density ~ 1/r^2-ish
      const q = rnd();
      R0[i] = 0.04 + 0.9 * Math.pow(q, 1.35);
      HB[i] = clamp(3.2 - R0[i] * 3.2 + (rnd() - 0.5) * 0.8, 0, 3);
      SZ[i] = 0.75 + rnd() * 0.5;
      BR[i] = 0.55 + rnd() * 0.45;
      DL[i] = 0.02 + R0[i] * 0.16 + rnd() * 0.05;
    } else {
      R0[i] = (rnd() + rnd() + rnd()) / 1.5 - 1; // -1..1 triangular-ish
      HB[i] = clamp(0.4 + rnd() * 1.2, 0, 3);
      // a few bright "stars" so the rotation reads
      const star = rnd() < 0.05;
      SZ[i] = star ? 1.5 + rnd() * 0.5 : 0.7 + rnd() * 0.55;
      BR[i] = star ? 1.0 : 0.5 + rnd() * 0.45;
      if (star) HB[i] = 2.2;
      DL[i] = 0.16 + rnd() * 0.12 + (R0[i] + 1) * 0.04;
      if (rnd() < 0.075) {
        const lane = (rnd() * 3) | 0, L = ORB_LANES[lane];
        OI[i] = ORB_A.length;
        ORB_A.push(rnd() * TAU);
        ORB_R.push(L.r + (rnd() - 0.5) * 0.14);
        ORB_W.push(L.w * (0.85 + rnd() * 0.3));
        ORB_L.push(lane);
      }
    }
    JS[i] = rnd() * 1000;
    for (let k = 0; k < NW; k++) {
      const W = WAVES[k];
      WP[i * NW + k] = W.f * (DX[i] * W.kx + DY[i] * W.ky + DZ[i] * W.kz) + W.ph;
    }
  }

  // ------------------------------------------------------------------ sprites (built once per theme)
  const SPR = 64;
  const mixRGB = (a, b, k) => [0, 1, 2].map((j) => Math.round(a[j] + (b[j] - a[j]) * k));
  function sprite(rgb, coreRGB, stops) {
    const c = document.createElement('canvas');
    c.width = c.height = SPR;
    const g = c.getContext('2d');
    const h = SPR / 2;
    const grd = g.createRadialGradient(h, h, 0, h, h, h);
    for (const [p, a, k] of stops) grd.addColorStop(p, V.rgba(mixRGB(rgb, coreRGB, k), a));
    g.fillStyle = grd;
    g.fillRect(0, 0, SPR, SPR);
    return c;
  }
  // additive (dark): soft glow with a hot centre
  const STOPS_ADD = [[0, 1, 0.75], [0.1, 0.85, 0.45], [0.24, 0.5, 0.12], [0.42, 0.2, 0], [0.66, 0.06, 0], [1, 0, 0]];
  // normal (light/cream): a denser dot with a soft edge
  const STOPS_NRM = [[0, 1, 0], [0.22, 0.92, 0], [0.42, 0.55, 0], [0.66, 0.16, 0], [1, 0, 0]];

  const KIT = {};
  function buildKit(th) {
    const additive = th.orbBlend === 'lighter';
    const base = th.orbRGB;
    const text = V.hexRGB(th.text);
    let levels;
    if (additive) {
      levels = [
        [base[0], Math.round(base[1] * 0.84), Math.round(base[2] * 0.76)], // deep terracotta
        base,                                                              // terracotta
        mixRGB(base, text, 0.32),                                          // amber-cream
        mixRGB(base, text, 0.72),                                          // hot near-white
      ];
      return {
        additive,
        spr: levels.map((c) => sprite(c, text, STOPS_ADD)),
        rgb: levels, base, hot: mixRGB(base, text, 0.8), text,
      };
    }
    levels = [
      mixRGB(base, text, 0.28),            // deepest (near)
      mixRGB(base, text, 0.1),
      base,                                // #bd6a3c
      mixRGB(base, th.accentRGB, 0.7),     // lighter accent (far)
    ];
    return { additive, spr: levels.map((c) => sprite(c, c, STOPS_NRM)), rgb: levels, base, hot: levels[0], text };
  }
  for (const name of Object.keys(V.THEMES)) KIT[name] = buildKit(V.THEMES[name]);
  const kitFor = (th) => KIT[th.name] || (th.orbBlend === 'lighter' ? KIT.dark : KIT.light);

  // ------------------------------------------------------------------ presets
  // radius   : × base radius            speed  : rotation rad/s           bright : brightness
  // size     : point size ×             turb   : slow surface undulation  ripple : fast surface ripple
  // jitter   : per-point shimmer        shell  : shell thickness          core   : interior radius ×
  // breath   : 0.25 Hz radius breathing pulse : 0.7 Hz steady pulse       drift  : orbital drift 0..1
  // react    : speech-level response    heat   : core heat (dark)         glow   : bloom strength
  const PRESETS = {
    idle:        { radius: 1.00, speed: 0.16, bright: 0.74, size: 1.00, turb: 0.040, ripple: 0.010, jitter: 0.010, shell: 0.075, core: 1.00, breath: 0.018, pulse: 0.000, drift: 0, react: 0, heat: 0.0, glow: 0.80 },
    listening:   { radius: 0.93, speed: 0.30, bright: 0.92, size: 1.05, turb: 0.045, ripple: 0.022, jitter: 0.014, shell: 0.065, core: 0.98, breath: 0.010, pulse: 0.000, drift: 0, react: 0, heat: 0.3, glow: 1.00 },
    thinking:    { radius: 0.76, speed: 0.22, bright: 1.00, size: 0.92, turb: 0.022, ripple: 0.008, jitter: 0.008, shell: 0.050, core: 0.80, breath: 0.000, pulse: 0.050, drift: 0, react: 0, heat: 0.7, glow: 1.00 },
    speaking:    { radius: 0.90, speed: 0.34, bright: 0.90, size: 1.04, turb: 0.040, ripple: 0.020, jitter: 0.012, shell: 0.065, core: 0.96, breath: 0.000, pulse: 0.000, drift: 0, react: 1, heat: 0.3, glow: 1.00 },
    researching: { radius: 1.08, speed: 0.40, bright: 0.90, size: 1.00, turb: 0.120, ripple: 0.050, jitter: 0.020, shell: 0.140, core: 1.02, breath: 0.000, pulse: 0.000, drift: 1, react: 0, heat: 0.2, glow: 0.95 },
    focus:       { radius: 0.70, speed: 0.08, bright: 0.56, size: 0.80, turb: 0.010, ripple: 0.004, jitter: 0.004, shell: 0.028, core: 0.92, breath: 0.012, pulse: 0.000, drift: 0, react: 0, heat: -0.3, glow: 0.55 },
  };
  const STATES = ['idle', 'listening', 'thinking', 'speaking', 'researching', 'focus'];
  const params = (state) => Object.assign({}, PRESETS[state] || PRESETS.idle);
  const mix = (a, b, k) => {
    const out = {};
    for (const key of Object.keys(a)) out[key] = typeof a[key] === 'number' && typeof b[key] === 'number' ? a[key] + (b[key] - a[key]) * k : a[key];
    for (const key of Object.keys(b)) if (!(key in out)) out[key] = b[key];
    return out;
  };

  // Integral of a piecewise-linear speed curve (constant before the first key / after the last).
  const keySpeed = (k) => (typeof k.speed === 'number' ? k.speed : (PRESETS[k.state] || PRESETS.idle).speed);
  function cum(keys, t) {
    const k0 = keys[0], s0 = keySpeed(k0);
    if (t <= k0.t) return (t - k0.t) * s0;
    let acc = 0;
    for (let i = 1; i < keys.length; i++) {
      const a = keys[i - 1], b = keys[i], sa = keySpeed(a), sb = keySpeed(b), d = b.t - a.t;
      if (t <= b.t) { const u = t - a.t, sl = d > 1e-9 ? (sb - sa) / d : 0; return acc + sa * u + 0.5 * sl * u * u; }
      acc += (sa + sb) * 0.5 * d;
    }
    const L = keys[keys.length - 1];
    return acc + (t - L.t) * keySpeed(L);
  }
  const phaseFrom = (keys, t) => (keys && keys.length ? cum(keys, t) - cum(keys, 0) : 0);

  // State timeline: keys [{t, state}] sorted. Each change eases over `dur` seconds (inOutCubic).
  // Returns { params, phase, state, k } — params ready for draw({params, phase}).
  function timeline(keys, t, dur = 0.6) {
    let j = 0;
    while (j + 1 < keys.length && keys[j + 1].t <= t) j++;
    const cur = keys[j], prev = keys[j - 1];
    let p = params(cur.state), k = 1;
    if (prev && t < cur.t + dur) { k = V.E.inOutCubic(clamp((t - cur.t) / dur)); p = mix(params(prev.state), p, k); }
    // speed ramps linearly across each transition window
    const sk = [];
    for (let i = 0; i < keys.length; i++) {
      const s = PRESETS[keys[i].state] || PRESETS.idle;
      if (i > 0) sk.push({ t: keys[i].t, speed: (PRESETS[keys[i - 1].state] || PRESETS.idle).speed });
      sk.push({ t: keys[i].t + (i > 0 ? dur : 0), speed: s.speed });
    }
    return { params: p, phase: phaseFrom(sk, t), state: cur.state, k };
  }

  // Synthetic speech RMS envelope (0..1) — syllable rhythm under phrase-level loudness with pauses.
  function speech(t, seed = 7) {
    const syl = 0.5 + 0.5 * Math.sin(TAU * 4.1 * t + 1.4 * Math.sin(TAU * 0.83 * t + seed));
    const phrase = clamp(0.62 + 0.75 * V.noise1(t * 1.1, seed));
    return clamp(phrase * (0.3 + 0.7 * Math.pow(syl, 1.4)));
  }

  // ------------------------------------------------------------------ gradients
  // Smooth gaussian bloom (no visible cone edge).
  function bloom(ctx, cx, cy, R, rgb, a) {
    if (a <= 0.001 || R <= 1) return;
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
    for (let s = 0; s <= 1.0001; s += 0.1) {
      const f = Math.exp(-5.2 * s * s) * (1 - s * s * s);
      g.addColorStop(Math.min(1, s), V.rgba(rgb, +(a * f).toFixed(4)));
    }
    ctx.fillStyle = g;
    ctx.fillRect(cx - R, cy - R, R * 2, R * 2);
  }
  // Volumetric body: brightness ∝ chord length through a uniform sphere, sqrt(1 - s^2), soft edge.
  function body(ctx, cx, cy, R, rgb, a) {
    if (a <= 0.001 || R <= 1) return;
    const Re = R * 1.12;
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Re);
    for (let s = 0; s <= 1.0001; s += 0.08) {
      const d = (s * Re) / R;
      const f = d < 1 ? Math.sqrt(1 - d * d) : 0;
      const soft = d < 0.86 ? 1 : clamp((1.12 - d) / 0.26);
      g.addColorStop(Math.min(1, s), V.rgba(rgb, +(a * Math.max(f, 0.35 * soft * (d < 1.12 ? 1 : 0)) * soft).toFixed(4)));
    }
    ctx.fillStyle = g;
    ctx.fillRect(cx - Re, cy - Re, Re * 2, Re * 2);
  }
  // Thin luminous ring (ignition shockwave).
  function ring(ctx, cx, cy, R, w, rgb, a) {
    if (a <= 0.002 || R <= 1) return;
    const Ro = R + w * 0.6, Ri = Math.max(0, R - w);
    const g = ctx.createRadialGradient(cx, cy, Ri, cx, cy, Ro);
    g.addColorStop(0, V.rgba(rgb, 0));
    g.addColorStop((R - Ri) / (Ro - Ri) * 0.7, V.rgba(rgb, a * 0.35));
    g.addColorStop((R - Ri) / (Ro - Ri), V.rgba(rgb, a));
    g.addColorStop(1, V.rgba(rgb, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, Ro, 0, TAU);
    ctx.arc(cx, cy, Ri, 0, TAU, true);
    ctx.fill();
  }

  // ignition radial curve: 0 -> 1 with ~30% overshoot and one damped undershoot; exact at both ends
  const igCurve = (q) => (q <= 0 ? 0 : q >= 1 ? 1 : 1 - Math.pow(1 - q, 3) * Math.cos(3 * Math.PI * q));

  // ------------------------------------------------------------------ draw
  const TILT = 0.44, ROLL = -0.3, CAM = 3.4, SIZE_K = 0.044;

  function draw(ctx, t, o) {
    o = o || {};
    if (o.demo === 'states') return drawDemo(ctx, t, o);
    const th = V.theme(o.theme || 'dark');
    const kit = kitFor(th);
    const cx = o.x != null ? o.x : V.W / 2, cy = o.y != null ? o.y : V.H / 2;
    const r = o.r != null ? o.r : 300;
    const P = o.params || PRESETS[o.state] || PRESETS.idle;
    const alpha = o.alpha != null ? clamp(o.alpha) : 1;
    const glowK = o.glow != null ? clamp(o.glow, 0, 2) : 1;
    const ig = o.ignite != null ? clamp(o.ignite) : 1;
    let level = o.level;
    if (level == null) level = P.react > 0 ? speech(t) : 0;
    const L = clamp(level) * (P.react || 0);
    const phase = typeof o.phase === 'number' ? o.phase : t * P.speed;
    if (alpha <= 0 || r <= 0) return;

    // derived state values
    const breath = (P.breath || 0) * Math.sin(TAU * 0.25 * t);
    const pulseW = 0.5 - 0.5 * Math.cos(TAU * 0.7 * t); // 0..1 steady
    const pulse = (P.pulse || 0) * (pulseW - 0.5) * 2;
    const R = r * P.radius * (1 + breath + pulse * 0.6 + 0.10 * L);
    const bright = P.bright * (1 + 0.55 * L + (P.pulse || 0) * 4 * (pulseW - 0.5));
    const size = P.size * (1 + 0.14 * L);
    const turb = P.turb + 0.02 * L, ripple = P.ripple + 0.05 * L, jit = P.jitter;
    const drift = clamp(P.drift || 0);
    const heat = (P.heat || 0) + 0.6 * L;

    // ignition envelope
    const igOn = ig < 1;
    const igHot = igOn ? Math.pow(1 - ig, 1.3) : 0;            // 1 at collapse → 0 formed
    const flash = igOn ? Math.exp(-Math.pow((ig - 0.1) / 0.16, 2)) : 0; // bloom flash peaking early

    ctx.save();
    ctx.globalAlpha *= alpha;
    const A0 = ctx.globalAlpha;
    const add = kit.additive;
    const Rvis = R * (igOn ? Math.max(0.04, igCurve(clamp(ig / 0.75))) : 1);

    // --- bloom behind the orb
    ctx.globalCompositeOperation = add ? 'lighter' : 'source-over';
    const bloomA = (add ? 0.20 : 0.13) * glowK * P.glow * (0.55 + 0.45 * bright) * (1 + 0.9 * L) + glowK * flash * (add ? 0.35 : 0.12);
    bloom(ctx, cx, cy, Math.max(R * 2.1, r * 0.9), kit.base, bloomA);
    // --- volumetric body
    body(ctx, cx, cy, Rvis * 1.0, add ? kit.rgb[1] : kit.base, (add ? 0.16 : 0.10) * bright * (0.4 + 0.6 * clamp(ig * 1.6)));

    // --- rotation setup
    const ct = Math.cos(TILT), st = Math.sin(TILT), cr = Math.cos(ROLL), sr = Math.sin(ROLL);
    const w0 = [], w1 = [];
    for (let k = 0; k < NW; k++) { w0.push(WAVES[k].w * t); }
    const turbN = turb / 1.6, ripN = ripple / 1.6;
    const sprites = kit.spr;
    const baseSize = r * SIZE_K * size;
    const igSwirl = 2.4;

    // per-point outputs (normal blending needs depth order)
    const n = N;
    const PX = add ? null : new Float32Array(n), PY = add ? null : new Float32Array(n);
    const PS = add ? null : new Float32Array(n), PA = add ? null : new Float32Array(n);
    const PK = add ? null : new Uint8Array(n), PB = add ? null : new Uint8Array(n);
    const NB = 24;
    const counts = add ? null : new Uint32Array(NB);

    for (let i = 0; i < n; i++) {
      const interior = i < N_IN;
      let rr = interior ? R0[i] * P.core : 1 + R0[i] * P.shell * 0.5;
      // turbulence: coherent wave field over the sphere + per-point shimmer
      const b = i * NW;
      const slow = Math.sin(WP[b] + w0[0]) + Math.sin(WP[b + 1] + w0[1]) + Math.sin(WP[b + 2] + w0[2]);
      const fast = Math.sin(WP[b + 3] + w0[3]) + Math.sin(WP[b + 4] + w0[4]) + Math.sin(WP[b + 5] + w0[5]);
      const sh = V.noise1(t * 0.9 + JS[i], i & 1023);
      const disp = slow * turbN + fast * ripN + sh * jit;
      rr *= 1 + (interior ? disp * 0.6 : disp);

      let x, y, z;
      let ang = phase;
      if (igOn) {
        const q = clamp((ig - DL[i]) / 0.62);
        const e = igCurve(q);
        rr *= e;
        ang += (1 - e) * igSwirl * (interior ? 1.3 : 1);
      }
      x = DX[i] * rr; y = DY[i] * rr; z = DZ[i] * rr;

      const oi = OI[i];
      if (oi >= 0 && drift > 0.001) {
        const Ln = ORB_LANES[ORB_L[oi]];
        const th2 = ORB_A[oi] + ORB_W[oi] * t;
        const c2 = Math.cos(th2), s2 = Math.sin(th2);
        const orr = ORB_R[oi] * (igOn ? igCurve(clamp((ig - DL[i]) / 0.62)) : 1);
        const ox = (Ln.ux * c2 + Ln.vx * s2) * orr, oy = (Ln.uy * c2 + Ln.vy * s2) * orr, oz = (Ln.uz * c2 + Ln.vz * s2) * orr;
        const dk = drift * drift * (3 - 2 * drift);
        x += (ox - x) * dk; y += (oy - y) * dk; z += (oz - z) * dk;
      }

      // spin about the (pre-tilt) Y axis
      const ca = Math.cos(ang), sa = Math.sin(ang);
      const x1 = x * ca + z * sa, z1 = -x * sa + z * ca;
      // tilt about X, roll about Z
      const y2 = y * ct - z1 * st, z2 = y * st + z1 * ct;
      const x3 = x1 * cr - y2 * sr, y3 = x1 * sr + y2 * cr;
      const pz = CAM / (CAM - z2);
      const sx = cx + x3 * R * pz, sy = cy + y3 * R * pz;
      const dz = clamp((z2 + 1.15) / 2.3); // 0 far .. 1 near

      if (add) {
        let a = BR[i] * bright * (0.28 + 0.72 * dz * dz) * 0.62;
        let hk = HB[i] + heat + dz * 0.6 - 0.3 + igHot * 3;
        hk = hk < 0 ? 0 : hk > 3 ? 3 : hk;
        const s = baseSize * SZ[i] * pz * (1 + igHot * 0.6);
        if (a > 1) a = 1;
        ctx.globalAlpha = A0 * a;
        ctx.drawImage(sprites[hk | 0], sx - s * 0.5, sy - s * 0.5, s, s);
      } else {
        PX[i] = sx; PY[i] = sy;
        PS[i] = baseSize * SZ[i] * pz * 0.82;
        PA[i] = clamp(0.34 + 0.66 * (BR[i] * (0.35 + 0.65 * dz)) * (0.6 + 0.4 * bright));
        let hk = 3 - dz * 2.6 - (interior ? 0.5 : 0) - heat * 0.4 + (1 - BR[i]) * 0.6;
        PK[i] = hk < 0 ? 0 : hk > 3 ? 3 : hk | 0;
        const bk = Math.min(NB - 1, (dz * NB) | 0);
        PB[i] = bk; counts[bk]++;
      }
    }

    if (!add) {
      // counting sort far → near
      const start = new Uint32Array(NB);
      for (let k = 1; k < NB; k++) start[k] = start[k - 1] + counts[k - 1];
      const order = new Uint16Array(n);
      for (let i = 0; i < n; i++) order[start[PB[i]]++] = i;
      for (let j = 0; j < n; j++) {
        const i = order[j], s = PS[i];
        ctx.globalAlpha = A0 * PA[i];
        ctx.drawImage(sprites[PK[i]], PX[i] - s * 0.5, PY[i] - s * 0.5, s, s);
      }
    }

    // --- hot core + ignition flash / shockwave
    ctx.globalCompositeOperation = add ? 'lighter' : 'source-over';
    ctx.globalAlpha = A0;
    if (add) {
      const coreA = 0.10 * bright * (1 + heat * 0.5) + 0.85 * igHot + 0.4 * flash;
      bloom(ctx, cx, cy, Math.max(r * 0.05, R * (igOn ? 0.12 + 0.5 * clamp(ig * 2) : 0.55)), kit.hot, coreA);
    } else {
      const coreA = 0.10 * bright + 0.7 * igHot + 0.25 * flash;
      bloom(ctx, cx, cy, Math.max(r * 0.05, R * (igOn ? 0.12 + 0.45 * clamp(ig * 2) : 0.5)), kit.rgb[0], coreA);
    }
    if (igOn && ig > 0.02) {
      const k = clamp((ig - 0.03) / 0.55);
      ring(ctx, cx, cy, r * (0.15 + 1.55 * V.E.outCubic(k)), r * (0.05 + 0.18 * k), add ? kit.rgb[2] : kit.base, (add ? 0.5 : 0.28) * Math.pow(1 - k, 1.6) * glowK);
    }
    ctx.restore();
  }

  // ------------------------------------------------------------------ demo: cycle all six states
  const DEMO_SLOT = 1.25;
  function drawDemo(ctx, t, o) {
    const keys = [];
    const nSlots = Math.max(1, Math.floor(Math.max(0, t) / DEMO_SLOT) + 1);
    for (let j = 0; j < nSlots; j++) keys.push({ t: j * DEMO_SLOT, state: STATES[j % STATES.length] });
    const tl = timeline(keys, t, 0.55);
    const p = Object.assign({}, o);
    delete p.demo;
    p.params = tl.params; p.phase = tl.phase; p.level = speech(t);
    draw(ctx, t, p);
    if (o.demoLabel === false) return;
    const th = V.theme(o.theme || 'dark');
    const cx = o.x != null ? o.x : V.W / 2, cy = o.y != null ? o.y : V.H / 2, r = o.r != null ? o.r : 300;
    ctx.save();
    ctx.globalAlpha *= (o.alpha != null ? o.alpha : 1) * tl.k;
    ctx.letterSpacing = '4px';
    V.text(ctx, tl.state.toUpperCase(), cx, cy + r * 1.42, V.ui(22, 560), th.muted, 'center', 'middle');
    ctx.letterSpacing = '0px';
    ctx.restore();
  }

  V.components.orb = { PRESETS, STATES, params, mix, phaseFrom, timeline, speech, draw, N, N_IN };
})();
