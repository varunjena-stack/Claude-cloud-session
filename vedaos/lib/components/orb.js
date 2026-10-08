// VEDAOS film component: the S96 particle orb, recreated in Canvas 2D (no WebGL).
//
// 5,200 points: ~42% fill the interior biased toward the centre, the rest form a turbulent shell.
// The cloud spins about a tilted axis with perspective (near points bigger/brighter, far points dimmer).
//
// Rendering. Each point is splatted as a radial-gradient sprite kernel into a float energy buffer (one
// canvas call per point would be ~4 µs each — far over budget), together with three radial fields:
// the volumetric body, the hot core and the inner part of the bloom. The buffer is mapped through a
// per-theme colour LUT built once at load, and blitted once with the current transform:
//  - dark  : AdditiveBlending — emitted colour = terracotta × energy, soft-clipped per channel
//            (terracotta → amber → hot near-white core); composited with 'lighter'.
//  - light/cream : NormalBlending of one colour is order-independent, 1 − Π(1 − aᵢ) = 1 − e^(−Σaᵢ),
//            so energy is optical density → opacity in deeper terracotta #bd6a3c, with a per-point
//            opacity floor so it never washes out.
// The outer bloom (outside the buffer rect) is a pre-rendered radial sprite drawn in device-aligned
// bands that meet the buffer exactly, so the bloom is seamless.
//
// Purity. All per-point data is static and seeded at load. Scratch memory (float buffer, ImageData,
// blit canvas) is write-before-read: every region a draw reads was fully written earlier in that same
// draw, so nothing carries between calls; it is reused only to avoid multi-MB allocations per sample.
'use strict';
(function () {
  const V = window.V;
  const TAU = Math.PI * 2;
  const clamp = V.clamp;

  // ------------------------------------------------------------------ static point cloud
  const N = 5200;
  const N_IN = Math.round(N * 0.42); // interior points: indices [0, N_IN)
  const rnd = V.rng(0x5e96a1);

  const DX = new Float32Array(N), DY = new Float32Array(N), DZ = new Float32Array(N);
  const R0 = new Float32Array(N); // interior: base radius (0..1); shell: thickness offset (-1..1)
  const SZ = new Float32Array(N); // size factor
  const BR = new Float32Array(N); // brightness factor
  const DL = new Float32Array(N); // ignite delay
  const JS = new Float32Array(N); // shimmer phase
  const JW = new Float32Array(N); // shimmer rate (rad/s)
  const NW = 6;                    // turbulence waves: 3 slow (undulation), 3 fast (ripple)
  const WS = new Float32Array(N * NW), WC = new Float32Array(N * NW); // sin/cos of per-point wave phase k·dir + φ
  const OI = new Int16Array(N).fill(-1); // orbiter slot (researching drift) or -1
  // orbiters: lane, speed class (2 per lane), radius and static sin/cos of the start angle
  const LANES = [], ORB_R = [], ORB_L = [], ORB_C = [], ORB_CA = [], ORB_SA = [];

  const WAVES = [];
  for (let k = 0; k < NW; k++) {
    const u = rnd() * 2 - 1, a = rnd() * TAU, s = Math.sqrt(1 - u * u);
    const slow = k < 3;
    WAVES.push({
      kx: Math.cos(a) * s, ky: u, kz: Math.sin(a) * s,
      f: slow ? 1.6 + rnd() * 1.1 : 4.4 + rnd() * 2.4,
      w: (slow ? 0.42 + rnd() * 0.3 : 1.8 + rnd() * 1.2) * (k % 2 ? -1 : 1),
      ph: rnd() * TAU,
    });
  }
  // three inclined orbital lanes for the researching drift
  for (let l = 0; l < 3; l++) {
    const inc = 0.42 + l * 0.38, az = l * 2.1 + 0.4;
    const nx = Math.sin(inc) * Math.cos(az), ny = Math.cos(inc), nz = Math.sin(inc) * Math.sin(az);
    let ux = 0, uy = nz, uz = -ny;
    const ul = Math.hypot(ux, uy, uz) || 1; ux /= ul; uy /= ul; uz /= ul;
    const vx = ny * uz - nz * uy, vy = nz * ux - nx * uz, vz = nx * uy - ny * ux;
    LANES.push({ ux, uy, uz, vx, vy, vz, w: 0.5 + l * 0.2, r: 1.17 + l * 0.07 });
  }
  for (let i = 0; i < N; i++) {
    const u = rnd() * 2 - 1, a = rnd() * TAU, s = Math.sqrt(1 - u * u);
    DX[i] = Math.cos(a) * s; DY[i] = u; DZ[i] = Math.sin(a) * s;
    if (i < N_IN) {
      const q = rnd();
      R0[i] = 0.05 + 0.9 * Math.pow(q, 1.3); // biased toward the centre
      SZ[i] = 0.7 + rnd() * 0.5;
      BR[i] = 0.5 + rnd() * 0.5;
      DL[i] = 0.02 + R0[i] * 0.14 + rnd() * 0.05;
    } else {
      R0[i] = (rnd() + rnd() + rnd()) / 1.5 - 1;
      const star = rnd() < 0.045; // a few bright points so the rotation reads
      SZ[i] = star ? 1.3 + rnd() * 0.35 : 0.7 + rnd() * 0.55;
      BR[i] = star ? 1.0 : 0.45 + rnd() * 0.45;
      DL[i] = 0.14 + rnd() * 0.1 + (R0[i] + 1) * 0.04;
      if (rnd() < 0.08) {
        const lane = (rnd() * 3) | 0;
        const a0 = rnd() * TAU;
        OI[i] = ORB_R.length;
        ORB_R.push(LANES[lane].r + (rnd() - 0.5) * 0.04);
        ORB_L.push(lane);
        ORB_C.push(lane * 2 + (rnd() < 0.5 ? 0 : 1));
        ORB_CA.push(Math.cos(a0)); ORB_SA.push(Math.sin(a0));
      }
    }
    JS[i] = rnd() * TAU;
    JW[i] = (0.9 + rnd() * 1.6) * (rnd() < 0.5 ? -1 : 1);
    for (let k = 0; k < NW; k++) {
      const W = WAVES[k];
      const ph = W.f * (DX[i] * W.kx + DY[i] * W.ky + DZ[i] * W.kz) + W.ph;
      WS[i * NW + k] = Math.sin(ph); WC[i * NW + k] = Math.cos(ph);
    }
  }

  // ------------------------------------------------------------------ profiles, LUTs, sprites
  const KN = 512;
  // point sprite: hot centre over a soft halo, indexed by d² ∈ [0,1] of the sprite radius, 0 at the rim
  const KER = new Float32Array(KN + 2);
  // body: volumetric emission — bright centre falling off like a chord through a soft-edged sphere, no hard limb
  const BODY = new Float32Array(KN + 2);
  // core: the luminous heart
  const CORE = new Float32Array(KN + 2);
  for (let j = 0; j <= KN; j++) {
    const u = j / KN;
    KER[j] = (0.42 * Math.exp(-8.5 * u) + 0.58 * Math.exp(-2.1 * u)) * Math.pow(1 - u, 1.6);
    BODY[j] = Math.pow(1 - u, 0.9);
    CORE[j] = Math.exp(-4.2 * u) * (1 - u) * (1 - u);
  }
  // bloom: smooth gaussian-like falloff over s = d / bloomR ∈ [0,1]
  const BLOOM_K = 3.1;
  const bloomProfile = (s) => Math.exp(-BLOOM_K * s * s) * (1 - s * s * s);

  const mixRGB = (a, b, k) => [0, 1, 2].map((j) => a[j] + (b[j] - a[j]) * k);
  const LN = 4096, EMAX = 8; // LUT covers accumulated energy 0..EMAX
  const pack = (r, g, b, a) => (Math.round(a) << 24) | (Math.round(b) << 16) | (Math.round(g) << 8) | Math.round(r);
  const smooth = (a, b, x) => { const k = clamp((x - a) / (b - a)); return k * k * (3 - 2 * k); };
  // soft clip: linear to 0.78, then a smooth shoulder into 1 (filmic roll-off for additive light)
  const soft = (x) => (x < 0.78 ? x : 0.78 + 0.22 * (1 - Math.exp(-(x - 0.78) / 0.22)));
  function ramp(stops, e) {
    if (e <= stops[0][0]) return stops[0][1];
    for (let j = 1; j < stops.length; j++) {
      if (e <= stops[j][0]) {
        const a = stops[j - 1], b = stops[j], k = (e - a[0]) / (b[0] - a[0]);
        return mixRGB(a[1], b[1], k * k * (3 - 2 * k));
      }
    }
    return stops[stops.length - 1][1];
  }
  function radialSprite(rgb, profile, S) {
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const g = c.getContext('2d'), h = S / 2;
    const grd = g.createRadialGradient(h, h, 0, h, h, h);
    for (let j = 0; j <= 48; j++) grd.addColorStop(j / 48, V.rgba(rgb.map(Math.round), +profile(j / 48).toFixed(5)));
    g.fillStyle = grd;
    g.fillRect(0, 0, S, S);
    return c;
  }
  function buildKit(th) {
    const additive = th.orbBlend === 'lighter';
    const base = th.orbRGB, text = V.hexRGB(th.text), acc = th.accentRGB;
    const lut = new Int32Array(LN); // Int32 (not Uint32) keeps alpha-255 pixels on V8's fast int path
    let thin;
    if (additive) {
      // emitted colour = base × energy (linear at the low end, so the in-buffer bloom matches the canvas
      // bloom exactly), soft-clipped per channel, drifting to the warm cream text tone at the very top.
      thin = base;
      for (let j = 1; j < LN; j++) {
        const e = (j / (LN - 1)) * EMAX;
        const c = [0, 1, 2].map((k) => 255 * soft((base[k] / 255) * e));
        const w = smooth(1.8, 6, e) * 0.55;
        lut[j] = pack(c[0] + (text[0] - c[0]) * w, c[1] + (text[1] - c[1]) * w, c[2] + (text[2] - c[2]) * w, 255);
      }
    } else {
      // density → opacity; thin = lighter accent-terracotta, dense = deep terracotta
      thin = mixRGB(base, acc, 0.45);
      const stops = [[0, thin], [0.5, mixRGB(base, acc, 0.15)], [1.2, base], [2.8, mixRGB(base, text, 0.2)], [EMAX, mixRGB(base, text, 0.32)]];
      for (let j = 1; j < LN; j++) {
        const e = (j / (LN - 1)) * EMAX, c = ramp(stops, e);
        lut[j] = pack(c[0], c[1], c[2], 255 * (1 - Math.exp(-1.2 * e)));
      }
    }
    const hot = additive ? mixRGB(base, text, 0.7) : mixRGB(base, text, 0.12);
    return {
      additive, lut, base,
      // energy per unit of canvas bloom alpha (dark: linear LUT; light: 1 − e^(−1.2E) ≈ 1.2E)
      bloomGain: additive ? 1 : 1 / 1.2,
      bloom: radialSprite(thin, bloomProfile, 512),
      flash: radialSprite(hot, (s) => Math.exp(-6.5 * s * s) * (1 - s * s * s), 256),
      ringRGB: (additive ? mixRGB(base, text, 0.45) : base).map(Math.round),
    };
  }
  const KIT = {};
  for (const name of Object.keys(V.THEMES)) KIT[name] = buildKit(V.THEMES[name]);
  const kitFor = (th) => KIT[th.name] || (th.orbBlend === 'lighter' ? KIT.dark : KIT.light);

  // write-before-read scratch (see header)
  const SCR_MAX = 1400;
  const SCR = document.createElement('canvas');
  SCR.width = SCR_MAX; SCR.height = SCR_MAX;
  const SCTX = SCR.getContext('2d');
  const IMG = new ImageData(SCR_MAX, SCR_MAX);
  const OUT = new Int32Array(IMG.data.buffer);
  const ACC = new Float32Array(SCR_MAX * SCR_MAX);
  const NS = N * 2; // splat capacity: points + researching orbit trails
  const PX = new Float32Array(NS), PY = new Float32Array(NS), PR = new Float32Array(NS), PE = new Float32Array(NS);
  const FTN = 2048; // radial field table (body + core + inner bloom) over d² ∈ [0, Rf²]
  const FT = new Float32Array(FTN + 2);

  // ------------------------------------------------------------------ presets
  // radius : × base radius        speed  : rotation rad/s         bright : brightness
  // size   : point size ×         turb   : slow undulation         ripple : fast surface ripple
  // jitter : per-point shimmer    shell  : shell thickness         core   : interior radius × (lower = denser)
  // breath : 0.25 Hz breathing    pulse  : 0.7 Hz steady pulse     drift  : orbital drift 0..1
  // react  : speech-level gain    heat   : core heat (exposure)    glow   : bloom strength
  const PRESETS = {
    idle:        { radius: 1.00, speed: 0.16, bright: 0.72, size: 1.00, turb: 0.040, ripple: 0.010, jitter: 0.010, shell: 0.075, core: 1.00, breath: 0.018, pulse: 0.000, drift: 0, react: 0, heat: 0.00, glow: 0.80 },
    listening:   { radius: 0.92, speed: 0.30, bright: 0.90, size: 1.04, turb: 0.045, ripple: 0.022, jitter: 0.014, shell: 0.065, core: 0.97, breath: 0.010, pulse: 0.000, drift: 0, react: 0, heat: 0.20, glow: 1.00 },
    thinking:    { radius: 0.76, speed: 0.22, bright: 1.00, size: 0.92, turb: 0.022, ripple: 0.008, jitter: 0.008, shell: 0.050, core: 0.80, breath: 0.000, pulse: 0.055, drift: 0, react: 0, heat: 0.55, glow: 1.00 },
    speaking:    { radius: 0.88, speed: 0.34, bright: 0.88, size: 1.03, turb: 0.040, ripple: 0.020, jitter: 0.012, shell: 0.065, core: 0.95, breath: 0.000, pulse: 0.000, drift: 0, react: 1, heat: 0.20, glow: 1.00 },
    researching: { radius: 1.08, speed: 0.40, bright: 0.88, size: 1.00, turb: 0.105, ripple: 0.045, jitter: 0.020, shell: 0.130, core: 1.02, breath: 0.000, pulse: 0.000, drift: 1, react: 0, heat: 0.10, glow: 0.95 },
    focus:       { radius: 0.70, speed: 0.08, bright: 0.55, size: 0.80, turb: 0.010, ripple: 0.004, jitter: 0.004, shell: 0.028, core: 0.92, breath: 0.012, pulse: 0.000, drift: 0, react: 0, heat: -0.30, glow: 0.55 },
  };
  const STATES = ['idle', 'listening', 'thinking', 'speaking', 'researching', 'focus'];
  const params = (state) => Object.assign({}, PRESETS[state] || PRESETS.idle);
  const mix = (a, b, k) => {
    const out = {};
    for (const key of Object.keys(a)) out[key] = typeof a[key] === 'number' && typeof b[key] === 'number' ? a[key] + (b[key] - a[key]) * k : a[key];
    for (const key of Object.keys(b)) if (!(key in out)) out[key] = b[key];
    return out;
  };

  // ∫ speed dτ from 0 to t for a piecewise-linear speed curve (held constant outside the keys).
  const keySpeed = (k) => (typeof k.speed === 'number' ? k.speed : (PRESETS[k.state] || PRESETS.idle).speed);
  function cum(keys, t) {
    const k0 = keys[0];
    if (t <= k0.t) return (t - k0.t) * keySpeed(k0);
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

  // State timeline helper: keys [{t, state}] sorted by t. Each change eases over `dur` s (inOutCubic);
  // speed ramps linearly over the same window so the phase never jumps.
  // Returns { params, phase, state, from, k } — pass params + phase straight to draw().
  function timeline(keys, t, dur = 0.6) {
    let j = 0;
    while (j + 1 < keys.length && keys[j + 1].t <= t) j++;
    const cur = keys[j], prev = keys[j - 1];
    let p = params(cur.state), k = 1;
    if (prev && t < cur.t + dur) { k = V.E.inOutCubic(clamp((t - cur.t) / dur)); p = mix(params(prev.state), p, k); }
    const sk = [];
    for (let i = 0; i < keys.length; i++) {
      if (i > 0) sk.push({ t: keys[i].t, speed: keySpeed(keys[i - 1]) });
      sk.push({ t: keys[i].t + (i > 0 ? dur : 0), speed: keySpeed(keys[i]) });
    }
    return { params: p, phase: phaseFrom(sk, t), state: cur.state, from: prev ? prev.state : cur.state, k };
  }

  // Synthetic speech RMS envelope (0..1): syllable rhythm under phrase loudness with short pauses.
  function speech(t, seed = 7) {
    const syl = 0.5 + 0.5 * Math.sin(TAU * 4.1 * t + 1.4 * Math.sin(TAU * 0.83 * t + seed));
    const phrase = clamp(0.62 + 0.75 * V.noise1(t * 1.1, seed));
    return clamp(phrase * (0.3 + 0.7 * Math.pow(syl, 1.4)));
  }

  // ------------------------------------------------------------------ canvas layers
  // Thin luminous ring (ignition shockwave) — only while igniting.
  function ring(ctx, cx, cy, R, w, rgb, a) {
    if (!(a > 0.002) || R <= 1) return;
    const Ro = R + w * 0.5, Ri = Math.max(0, R - w);
    const g = ctx.createRadialGradient(cx, cy, Ri, cx, cy, Ro);
    const pk = (R - Ri) / (Ro - Ri);
    g.addColorStop(0, V.rgba(rgb, 0));
    g.addColorStop(pk * 0.6, V.rgba(rgb, a * 0.25));
    g.addColorStop(pk, V.rgba(rgb, a));
    g.addColorStop(1, V.rgba(rgb, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, Ro, 0, TAU);
    ctx.arc(cx, cy, Ri, 0, TAU, true);
    ctx.fill();
  }
  // ignition radial curve: 0 → 1 with ~30% overshoot and one damped undershoot; exact at both ends
  const igCurve = (q) => (q <= 0 ? 0 : q >= 1 ? 1 : 1 - Math.pow(1 - q, 3) * Math.cos(3 * Math.PI * q));

  // ------------------------------------------------------------------ draw
  const TRC = [1, Math.cos(0.1), Math.cos(0.2)], TRS = [0, Math.sin(0.1), Math.sin(0.2)]; // orbit trail offsets
  const TILT = 0.44, ROLL = -0.3, CAM = 3.4, SIZE_K = 0.016, MAX_EXT = 540, BLOOM_R = 1.42;
  const CT = Math.cos(TILT), ST = Math.sin(TILT), CR = Math.cos(ROLL), SR = Math.sin(ROLL);

  function draw(ctx, t, o) {
    o = o || {};
    if (o.demo === 'states') return drawDemo(ctx, t, o);
    if (o.demo === 'ignite') {
      // lab helper: the "Hey Veda" ignition as a film would drive it — ignite ramps linearly 0 → 1 over
      // 1.2 s starting at t = 0.25 (overshoot and settle are built into the formation itself)
      const p = Object.assign({}, o, { ignite: clamp((t - 0.25) / 1.2) });
      delete p.demo;
      return draw(ctx, t, p);
    }
    const th = V.theme(o.theme || 'dark');
    const kit = kitFor(th);
    const add = kit.additive;
    const cx = o.x != null ? o.x : V.W / 2, cy = o.y != null ? o.y : V.H / 2;
    const r = o.r != null ? o.r : 300;
    const P = o.params || PRESETS[o.state] || PRESETS.idle;
    const alpha = o.alpha != null ? clamp(o.alpha) : 1;
    const glowK = o.glow != null ? clamp(o.glow, 0, 2) : 1;
    const ig = o.ignite != null ? clamp(o.ignite) : 1;
    let level = o.level;
    if (level == null) level = (P.react || 0) > 0 ? speech(t) : 0;
    const L = clamp(level) * (P.react || 0);
    const phase = typeof o.phase === 'number' ? o.phase : t * P.speed;
    if (!(alpha > 0) || !(r > 0)) return;

    // state-derived values
    const breath = (P.breath || 0) * Math.sin(TAU * 0.25 * t);
    const pw = 0.5 - 0.5 * Math.cos(TAU * 0.7 * t);       // 0..1 steady pulse wave
    const pulse = (P.pulse || 0) * (pw * 2 - 1);
    const R = r * P.radius * (1 + breath + pulse * 0.5 + 0.13 * L);
    const bright = P.bright * (1 + 0.5 * L) * (1 + pulse * 3.2);
    const heat = (P.heat || 0) + 0.3 * L;
    const d0 = clamp(P.drift || 0);

    // ignition envelope
    const igOn = ig < 1;
    const igHot = igOn ? Math.pow(1 - ig, 1.4) : 0;
    const flash = igOn ? Math.exp(-Math.pow((ig - 0.12) / 0.15, 2)) : 0;
    const igForm = igOn ? igCurve(clamp(ig / 0.8)) : 1;

    ctx.save();
    ctx.globalAlpha *= alpha;
    const A0 = ctx.globalAlpha;

    // 1+2. bloom (state brightness + live speech level), particles, body, hot core
    particles(ctx, t, cx, cy, R, r, P, kit, {
      A0, bright, heat, phase, ig, igOn, igHot, igForm, flash,
      size: P.size * (1 + 0.14 * L),
      turb: P.turb + 0.02 * L, ripple: P.ripple + 0.05 * L, jit: P.jitter,
      driftK: d0 * d0 * (3 - 2 * d0),
      bloomA: (add ? 0.26 : 0.2) * glowK * P.glow * (0.45 + 0.55 * bright) * (1 + 0.9 * L),
      bloomR: Math.max(R * BLOOM_R, r * 0.6) * (0.45 + 0.55 * igForm),
    });

    // 3. ignition: a tight white-hot flash at the seed, and a soft pressure ring riding the particle front
    if (igOn) {
      ctx.globalCompositeOperation = add ? 'lighter' : 'source-over';
      const fa = glowK * (flash * (add ? 0.55 : 0.28) + igHot * (add ? 0.45 : 0.22));
      const fR = r * (0.1 + 0.42 * flash + 0.12 * ig);
      if (fa > 0.002) { ctx.globalAlpha = A0 * Math.min(1, fa); ctx.drawImage(kit.flash, cx - fR, cy - fR, fR * 2, fR * 2); }
      if (ig > 0.18) {
        // rides the shell front (same overshoot curve as the mean shell point) and fades as it settles
        const k = clamp((ig - 0.18) / 0.62);
        ctx.globalAlpha = A0;
        ring(ctx, cx, cy, R * 1.04 * igCurve(k), r * (0.05 + 0.08 * k), kit.ringRGB,
          (add ? 0.28 : 0.15) * Math.pow(1 - k, 2) * clamp(k * 5) * Math.min(1, glowK));
      }
    }
    ctx.restore();
  }

  // splat every queued point's radial sprite (exact circle spans; q advanced incrementally along the row)
  function splatAll(acc, bw, bh, n, x0, y0) {
    for (let i = 0; i < n; i++) {
      const px = PX[i] - x0, py = PY[i] - y0, rad = PR[i], en = PE[i], r2 = rad * rad;
      const inv = KN / r2, inv2 = 2 * inv;
      let ya = Math.ceil(py - rad), yb = Math.floor(py + rad);
      if (ya < 0) ya = 0;
      if (yb > bh - 1) yb = bh - 1;
      for (let yy = ya; yy <= yb; yy++) {
        const dy = yy - py, dy2 = dy * dy, rem = r2 - dy2;
        if (rem <= 0) continue;
        const span = Math.sqrt(rem);
        let xa = Math.ceil(px - span), xb = Math.floor(px + span);
        if (xa < 0) xa = 0;
        if (xb > bw - 1) xb = bw - 1;
        let o = yy * bw + xa;
        const dx = xa - px;
        let q = (dx * dx + dy2) * inv, dq = (2 * dx + 1) * inv;
        for (let xx = xa; xx <= xb; xx++, o++) {
          acc[o] += en * KER[q | 0]; // q ≤ KN on the span (KER has zero guard cells past KN)
          q += dq; dq += inv2;
        }
      }
    }
  }

  // tone-map the energy buffer through the theme LUT, adding the radial field table FT (in LUT index
  // units, over d² ∈ [0, Rf²]) inside its disc. OUT rows have stride SCR_MAX; every pixel is written.
  function toneMap(acc, bw, bh, lut, ccx, ccy, Rf) {
    const toIdx = (LN - 1) / EMAX, last = LN - 1;
    const Rf2 = Rf * Rf, inv = FTN / Rf2, inv2 = 2 * inv;
    for (let yy = 0; yy < bh; yy++) {
      const dy = yy - ccy, dy2 = dy * dy;
      let ea = bw, eb = bw;
      if (dy2 < Rf2) {
        const span = Math.sqrt(Rf2 - dy2);
        ea = Math.max(0, Math.ceil(ccx - span)); eb = Math.min(bw, Math.floor(ccx + span) + 1);
        if (eb < ea) eb = ea;
      }
      const p0 = yy * bw, q0 = yy * SCR_MAX;
      for (let xx = 0; xx < ea; xx++) {
        const j = (acc[p0 + xx] * toIdx) | 0;
        OUT[q0 + xx] = lut[j < last ? j : last];
      }
      if (ea < eb) {
        const dx = ea - ccx;
        let q = (dx * dx + dy2) * inv, dq = (2 * dx + 1) * inv;
        for (let xx = ea; xx < eb; xx++) {
          const j = (acc[p0 + xx] * toIdx + FT[q < FTN ? q | 0 : FTN]) | 0;
          OUT[q0 + xx] = lut[j < last ? j : last];
          q += dq; dq += inv2;
        }
      }
      for (let xx = eb; xx < bw; xx++) {
        const j = (acc[p0 + xx] * toIdx) | 0;
        OUT[q0 + xx] = lut[j < last ? j : last];
      }
    }
  }

  // draw a sub-rect [dx0,dx1)×[dy0,dy1) of a sprite that spans the square [sx0, sx0 + size)²
  function spriteBand(ctx, spr, sx0, sy0, size, dx0, dy0, dx1, dy1) {
    if (dx1 - dx0 < 0.5 || dy1 - dy0 < 0.5) return;
    const k = spr.width / size;
    ctx.drawImage(spr, (dx0 - sx0) * k, (dy0 - sy0) * k, (dx1 - dx0) * k, (dy1 - dy0) * k, dx0, dy0, dx1 - dx0, dy1 - dy0);
  }

  function particles(ctx, t, cx, cy, R, r, P, kit, S) {
    const add = kit.additive;
    const m = ctx.getTransform();
    const ds = Math.sqrt(Math.abs(m.a * m.d - m.b * m.c)) || 1;
    const axisAligned = Math.abs(m.b) < 1e-6 && Math.abs(m.c) < 1e-6;
    // buffer pixels per local unit: device resolution, capped so the buffer stays bounded under zooms.
    // Only the part of the cloud that lands on the canvas is rendered (camera push-ins put much of it off
    // screen), and the cap applies to that visible part, so a pushed-in orb stays pixel-aligned and crisp.
    let bs = ds;
    const ext = R * (1.15 + 0.3 * S.driftK);
    const cv = ctx.canvas, cull = axisAligned && m.a > 0 && m.d > 0 && cv && cv.width > 0;
    let visW = 2 * ext, visH = 2 * ext, Lx0 = 0, Lx1 = 0, Ly0 = 0, Ly1 = 0;
    if (cull) { // canvas bounds in local units, intersected with the cloud's box
      Lx0 = -m.e / m.a; Lx1 = (cv.width - m.e) / m.a; Ly0 = -m.f / m.d; Ly1 = (cv.height - m.f) / m.d;
      visW = Math.max(0, Math.min(cx + ext, Lx1) - Math.max(cx - ext, Lx0));
      visH = Math.max(0, Math.min(cy + ext, Ly1) - Math.max(cy - ext, Ly0));
    }
    const half = Math.max(visW, visH) / 2; // = ext when the whole cloud is on screen
    if (half * bs > MAX_EXT) bs = MAX_EXT / half;
    const pixelAligned = axisAligned && bs === ds && m.a > 0 && m.d > 0;
    // keep the device sub-pixel phase when pixel-aligned so points stay crisp
    let devX = 0, devY = 0, fx = 0, fy = 0;
    if (pixelAligned) {
      devX = m.a * cx + m.e; devY = m.d * cy + m.f;
      fx = devX - Math.floor(devX); fy = devY - Math.floor(devY);
    }

    // sin(φᵢ + ωt) = sin φᵢ·cos ωt + cos φᵢ·sin ωt — per-point sin/cos are static, only ωt is per draw
    const c0 = Math.cos(WAVES[0].w * t), s0 = Math.sin(WAVES[0].w * t), c1 = Math.cos(WAVES[1].w * t), s1 = Math.sin(WAVES[1].w * t);
    const c2w = Math.cos(WAVES[2].w * t), s2w = Math.sin(WAVES[2].w * t), c3 = Math.cos(WAVES[3].w * t), s3 = Math.sin(WAVES[3].w * t);
    const c4 = Math.cos(WAVES[4].w * t), s4 = Math.sin(WAVES[4].w * t), c5 = Math.cos(WAVES[5].w * t), s5 = Math.sin(WAVES[5].w * t);
    const turbN = S.turb / 1.7, ripN = S.ripple / 1.7, jit = S.jit;
    const RB = R * bs;
    const baseRad = r * bs * SIZE_K * S.size;
    const eK = add ? 1.75 * S.bright * (1 + 0.15 * S.heat) : 0.95 * (0.6 + 0.4 * S.bright);
    const igOn = S.igOn, ig = S.ig, driftK = S.driftK;
    const trails = driftK > 0.02;
    const OCW = new Float64Array(6), OSW = new Float64Array(6);
    for (let c = 0; c < 6; c++) { const wv = LANES[c >> 1].w * (c & 1 ? 1.12 : 0.9) * t; OCW[c] = Math.cos(wv); OSW[c] = Math.sin(wv); }

    const bodyR = RB * (1.12 + 1.2 * S.turb) * Math.max(0.03, S.igForm);
    const coreR = igOn ? r * bs * (0.07 + 0.5 * S.igForm * clamp(ig * 1.6)) : RB * 0.62;
    const fieldR = Math.max(bodyR, coreR) + 1;
    let minX = fx - fieldR, minY = fy - fieldR, maxX = fx + fieldR, maxY = fy + fieldR;
    let n = 0; // splat count (points + orbit trails)

    // object → view rotation (spin about the pre-tilt Y axis, tilt about X, roll about Z)
    let m00, m01, m02, m10, m11, m12, m20, m21, m22;
    const setRot = (ang) => {
      const ca = Math.cos(ang), sa = Math.sin(ang);
      m00 = CR * ca - SR * ST * sa; m01 = -SR * CT; m02 = CR * sa + SR * ST * ca;
      m10 = SR * ca + CR * ST * sa; m11 = CR * CT; m12 = SR * sa - CR * ST * ca;
      m20 = -CT * sa; m21 = ST; m22 = CT * ca;
    };
    setRot(S.phase);

    // project one object-space point and queue its splat
    const emit = (x, y, z, sz, br, interior, eMul) => {
      const z2 = m20 * x + m21 * y + m22 * z;
      const pz = CAM / (CAM - z2);
      const dz = clamp((z2 + 1.1) / 2.2); // 0 far .. 1 near
      const px = (m00 * x + m01 * y + m02 * z) * RB * pz + fx;
      const py = (m10 * x + m11 * y + m12 * z) * RB * pz + fy;
      // near points bigger and brighter, far points smaller and dimmer
      let rad = baseRad * sz * pz * (0.7 + 0.55 * dz);
      if (rad < 1.4) rad = 1.4;
      const en = add
        ? eK * br * eMul * (0.08 + 0.92 * dz * dz * (interior ? 0.8 : 1))
        : eK * eMul * (0.32 + 0.68 * br * (0.2 + 0.8 * dz * dz)); // light: opacity floor
      PX[n] = px; PY[n] = py; PR[n] = rad; PE[n] = en; n++;
      if (px - rad < minX) minX = px - rad;
      if (px + rad > maxX) maxX = px + rad;
      if (py - rad < minY) minY = py - rad;
      if (py + rad > maxY) maxY = py + rad;
    };

    for (let i = 0; i < N; i++) {
      const interior = i < N_IN;
      let rr = interior ? R0[i] * P.core : 1 + R0[i] * P.shell * 0.5;
      const b = i * NW;
      const slow = WS[b] * c0 + WC[b] * s0 + WS[b + 1] * c1 + WC[b + 1] * s1 + WS[b + 2] * c2w + WC[b + 2] * s2w;
      const fast = WS[b + 3] * c3 + WC[b + 3] * s3 + WS[b + 4] * c4 + WC[b + 4] * s4 + WS[b + 5] * c5 + WC[b + 5] * s5;
      const disp = slow * turbN + fast * ripN + Math.sin(JS[i] + JW[i] * t) * jit;
      rr *= 1 + (interior ? disp * 0.55 : disp);

      let e = 1;
      if (igOn) {
        // ignition: each point blooms out from the hot centre with overshoot, spiralling into place
        e = igCurve(clamp((ig - DL[i]) / 0.62));
        rr *= e;
        setRot(S.phase + (1 - e) * (interior ? 3.0 : 2.3));
      }
      const x = DX[i] * rr, y = DY[i] * rr, z = DZ[i] * rr;

      const oi = OI[i];
      if (oi >= 0 && driftK > 0.001) {
        // researching: lift into an inclined orbital lane, with a short comet trail
        const Ln = LANES[ORB_L[oi]], orr = ORB_R[oi] * e, sc = ORB_C[oi];
        // angle a0 + ωt by angle addition (static sin/cos a0, per-draw sin/cos ωt per speed class)
        const ca = ORB_CA[oi] * OCW[sc] - ORB_SA[oi] * OSW[sc], sa = ORB_SA[oi] * OCW[sc] + ORB_CA[oi] * OSW[sc];
        for (let k = trails ? 2 : 0; k >= 0; k--) {
          const c2 = ca * TRC[k] + sa * TRS[k], s2 = sa * TRC[k] - ca * TRS[k]; // angle − k·0.1 (trail)
          const ox = (Ln.ux * c2 + Ln.vx * s2) * orr, oy = (Ln.uy * c2 + Ln.vy * s2) * orr, oz = (Ln.uz * c2 + Ln.vz * s2) * orr;
          const fall = k === 0 ? 1 : driftK * (0.5 - k * 0.17);
          emit(x + (ox - x) * driftK, y + (oy - y) * driftK, z + (oz - z) * driftK,
            SZ[i] * (1 - 0.3 * driftK) * (1 - k * 0.15), BR[i], false, fall * (1 - 0.15 * driftK));
        }
        continue;
      }
      emit(x, y, z, SZ[i], BR[i], interior, 1);
    }

    // clip the buffer to the canvas (+2 px so the blit's edge sampling never reaches outside it)
    if (cull) {
      if (pixelAligned) { // buffer px b ↔ device floor(dev) + b
        const ox = Math.floor(devX), oy = Math.floor(devY);
        minX = Math.max(minX, -ox - 2); maxX = Math.min(maxX, cv.width - ox + 2);
        minY = Math.max(minY, -oy - 2); maxY = Math.min(maxY, cv.height - oy + 2);
      } else { // buffer px b ↔ local c + b / bs
        minX = Math.max(minX, (Lx0 - cx) * bs - 2); maxX = Math.min(maxX, (Lx1 - cx) * bs + 2);
        minY = Math.max(minY, (Ly0 - cy) * bs - 2); maxY = Math.min(maxY, (Ly1 - cy) * bs + 2);
      }
    }
    // buffer rect (integer, buffer px relative to the centre); empty only when culled off screen
    const x0 = Math.floor(minX) - 1, y0 = Math.floor(minY) - 1;
    const bw = Math.min(SCR_MAX, Math.ceil(maxX) + 2 - x0), bh = Math.min(SCR_MAX, Math.ceil(maxY) + 2 - y0);
    const none = bw < 2 || bh < 2;

    // --- bloom. Pixel-aligned: canvas sprite only in the bands outside the buffer rect; the part inside
    // is added to the buffer (identical response at the seam). Otherwise: whole sprite behind the buffer.
    const bloomA = S.bloomA, bloomR = S.bloomR;
    let bloomIn = 0;
    if (bloomA > 0.002 && bloomR > 1) {
      // behind everything and never overlapping the buffer, so plain source-over even on dark (vs additive
      // the difference is background × alpha ≈ 1 level at the seam) — 'lighter' costs ~2.5× here
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = S.A0 * Math.min(1, bloomA);
      // a smooth low-alpha field: nearest sampling of a 512px sprite is visually identical, ~2.5× cheaper
      ctx.imageSmoothingEnabled = false;
      if (pixelAligned) {
        const D = bloomR * ds, bx0 = devX - D, by0 = devY - D, bx1 = devX + D, by1 = devY + D;
        const X0 = Math.floor(devX) + x0, Y0 = Math.floor(devY) + y0, X1 = X0 + bw, Y1 = Y0 + bh;
        const ix0 = Math.max(bx0, X0), ix1 = Math.min(bx1, X1), iy0 = Math.max(by0, Y0), iy1 = Math.min(by1, Y1);
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        if (none || ix1 <= ix0 || iy1 <= iy0) {
          spriteBand(ctx, kit.bloom, bx0, by0, 2 * D, bx0, by0, bx1, by1);
        } else {
          spriteBand(ctx, kit.bloom, bx0, by0, 2 * D, bx0, by0, bx1, iy0);  // top
          spriteBand(ctx, kit.bloom, bx0, by0, 2 * D, bx0, iy1, bx1, by1);  // bottom
          spriteBand(ctx, kit.bloom, bx0, by0, 2 * D, bx0, iy0, ix0, iy1);  // left
          spriteBand(ctx, kit.bloom, bx0, by0, 2 * D, ix1, iy0, bx1, iy1);  // right
          bloomIn = Math.min(1, bloomA) * kit.bloomGain;
        }
        ctx.restore();
      } else {
        ctx.drawImage(kit.bloom, cx - bloomR, cy - bloomR, bloomR * 2, bloomR * 2);
      }
      ctx.imageSmoothingEnabled = true;
      ctx.globalAlpha = S.A0;
    }
    if (none) return; // the particle buffer is entirely off screen (only its bloom reaches the canvas)

    // --- radial field table: volumetric body + hot core (+ inner bloom), in LUT index units
    const ccx = fx - x0, ccy = fy - y0;
    const igHot = S.igHot;
    const bodyE = (add ? 0.5 : 0.62) * (add ? S.bright : 0.55 + 0.45 * S.bright) * (igOn ? smooth(0.22, 0.85, ig) : 1);
    const coreE = (add ? (0.85 + 0.5 * S.heat) * S.bright : (0.8 + 0.3 * S.heat) * S.bright) + igHot * (add ? 7 : 3) + S.flash * (add ? 2 : 0.8);
    const bloomRB = bloomR * bs;
    const Rf = Math.max(bodyR, coreR, bloomIn > 0 ? bloomRB : 0);
    {
      const toIdx = (LN - 1) / EMAX, Rf2 = Rf * Rf;
      const kb = KN * Rf2 / (bodyR * bodyR), kc = KN * Rf2 / (coreR * coreR), kl = 1 / (bloomRB * bloomRB);
      for (let j = 0; j <= FTN; j++) {
        const u = j / FTN, d2 = u * Rf2;
        const qb = u * kb, qc = u * kc;
        let v = 0;
        if (qb < KN) v += bodyE * BODY[qb | 0];
        if (qc < KN) v += coreE * CORE[qc | 0];
        if (bloomIn > 0) { const s2 = d2 * kl; if (s2 < 1) v += bloomIn * bloomProfile(Math.sqrt(s2)); }
        FT[j] = v * toIdx;
      }
      FT[FTN] = 0;
      FT[FTN + 1] = 0;
    }

    const acc = ACC;
    acc.fill(0, 0, bw * bh);
    splatAll(acc, bw, bh, n, x0, y0);
    toneMap(acc, bw, bh, kit.lut, ccx, ccy, Rf);
    SCTX.putImageData(IMG, 0, 0, 0, 0, bw, bh);

    ctx.globalCompositeOperation = add ? 'lighter' : 'source-over';
    if (pixelAligned) {
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(SCR, 0, 0, bw, bh, Math.floor(devX) + x0, Math.floor(devY) + y0, bw, bh);
      ctx.restore();
    } else {
      ctx.drawImage(SCR, 0, 0, bw, bh, cx + x0 / bs, cy + y0 / bs, bw / bs, bh / bs);
    }
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
    p.params = tl.params; p.phase = tl.phase;
    if (p.level == null) p.level = speech(t);
    draw(ctx, t, p);
    if (o.demoLabel === false) return;
    const th = V.theme(o.theme || 'dark');
    const cx = o.x != null ? o.x : V.W / 2, cy = o.y != null ? o.y : V.H / 2, r = o.r != null ? o.r : 300;
    ctx.save();
    ctx.globalAlpha *= (o.alpha != null ? o.alpha : 1) * tl.k;
    ctx.letterSpacing = '5px';
    V.text(ctx, tl.state.toUpperCase(), cx, cy + r * 1.45, V.ui(22, 560), th.muted, 'center', 'middle');
    ctx.restore();
  }

  V.components.orb = { PRESETS, STATES, params, mix, phaseFrom, timeline, speech, draw, N, N_IN };
})();
