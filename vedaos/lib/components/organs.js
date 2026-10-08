// VEDAOS film component: S90 agent-dispatch "organ" dots around the orb (recoloured S96).
//
// Each background mission BUDS from the orb's surface: a thin tendril grows outward, the dot springs into
// being at its tip with overshoot, and the tendril pinches off into it (the bud separates from the body).
// While the mission works the dot breathes in the accent and sends out a slow soft pulse. When it finishes
// it either MERGES (sage wipes out from its centre, a check draws on, it travels home with a short comet
// tail and is absorbed with a ripple running along the orb's rim) or FAILS (muted brick wipes in, a small
// damped shake along the arc, then it shrinks and fades).
// Max 5 dots on the arc (S90 MAX_VISIBLE_ORGANS); extra working missions are counted by a "+N" pill at
// the end of the arc. Dots reflow along the arc with eased motion whenever membership changes.
//
// Purity: draw(ctx, t, o) recomputes everything from o.missions at time t. A sweep over the mission
// list decides which missions get a dot (the cap is applied at bud time, exactly like S90 where an
// overflowing organ is never added to activeOrgans), then the arc layout is evaluated at every
// membership-change time; a dot's angle is the sum of eased deltas between consecutive layouts, so
// overlapping reflows blend smoothly with no state carried between calls.
'use strict';
(function () {
  const V = window.V;
  const TAU = Math.PI * 2;
  const clamp = V.clamp, lerp = V.lerp, E = V.E;
  const MAX_VISIBLE = 5;

  // animation timings in seconds (all multiplied by o.pace)
  const TM = {
    stalk: 0.26,     // tendril grows from the surface
    popAt: 0.17,     // dot springs out at the tendril tip (overlaps the growth)
    pinchAt: 0.3,    // then the tendril pinches off into the dot ...
    pinch: 0.34,     // ... over this long
    pulseIn: 0.42,   // first pulse ring
    tint: 0.15,      // accent -> sage / brick (wipes out from the centre)
    hold: 0.34,      // merge: sage + check hold;  fail: the shake
    travel: 0.52,    // merge: back down the tendril into the orb
    fade: 0.42,      // fail: shrink + fade
    ripple: 0.8,     // merge: ripple along the orb surface
    reflow: 0.62,    // slot changes along the arc
    badge: 0.3,
    roll: 0.32,
  };

  const DEFAULT_ARC = { from: -Math.PI / 2 - 0.95, to: -Math.PI / 2 + 0.95 };

  // lab demo: 7 overlapping missions, both outcomes, cap + "+N" badge
  const DEMO = [
    { at: 0.3, dur: 3.3, outcome: 'merge', label: 'Inbox' },
    { at: 0.62, dur: 2.0, outcome: 'fail', label: 'Calendar' },
    { at: 0.94, dur: 4.2, outcome: 'merge', label: 'Research' },
    { at: 1.26, dur: 3.5, outcome: 'merge', label: 'Notes' },
    { at: 1.58, dur: 4.9, outcome: 'merge', label: 'Brief' },
    { at: 2.0, dur: 2.2, outcome: 'merge', label: 'Files' },
    { at: 2.3, dur: 2.6, outcome: 'fail', label: 'Travel' },
  ];

  // ------------------------------------------------------------------ easing helpers
  const smooth = E.inOutCubic;
  const rgbMix = (a, b, k) => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];
  const rgbStr = (c, a) => `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${a})`;

  // ------------------------------------------------------------------ plan: who gets a dot, when
  function plan(o) {
    const pace = o.pace > 0 ? o.pace : 1;
    const src = Array.isArray(o.missions) ? o.missions : DEMO;
    const promote = !!o.promote;
    const list = src.map((m, i) => {
      const at = +m.at || 0;
      const dur = Math.max(1e-3, +m.dur || 0);
      return {
        i, at, end: at + dur, outcome: m.outcome === 'fail' ? 'fail' : 'merge',
        label: m.label ? String(m.label) : '', visible: false, bud: 0, exit: 0, release: 0, gone: 0,
      };
    });
    const ev = [];
    for (const m of list) { ev.push({ t: m.at, k: 1, m }); ev.push({ t: m.end, k: 0, m }); }
    ev.sort((a, b) => a.t - b.t || a.k - b.k || a.m.i - b.m.i); // completions free a slot before arrivals
    const W = [], Q = [], ov = [{ t: -Infinity, n: 0 }];
    for (const e of ev) {
      const m = e.m;
      if (e.k === 1) {
        if (W.length < MAX_VISIBLE) { W.push(m); m.visible = true; m.bud = m.at; }
        else { Q.push(m); ov.push({ t: e.t, n: Q.length }); }
      } else {
        let j = W.indexOf(m);
        if (j >= 0) {
          W.splice(j, 1);
          if (promote && Q.length) {
            const p = Q.shift();
            p.visible = true; p.bud = e.t + TM.hold * pace; // buds as the leaving dot lets go of its slot
            W.push(p);
            ov.push({ t: e.t, n: Q.length });
          }
        } else if ((j = Q.indexOf(m)) >= 0) {
          Q.splice(j, 1);
          ov.push({ t: e.t, n: Q.length });
        }
      }
    }
    const dots = [];
    for (const m of list) {
      if (!m.visible) continue;
      m.exit = Math.max(m.end, m.bud + (TM.stalk + 0.16) * pace); // a bud always completes before it leaves
      m.release = m.exit + TM.hold * pace;
      m.gone = m.release + (m.outcome === 'merge' ? TM.travel + TM.ripple : TM.fade) * pace;
      dots.push(m);
    }
    dots.sort((a, b) => a.bud - b.bud || a.i - b.i);
    return { list, dots, ov, pace };
  }

  const overflowAt = (ov, t) => { let n = 0; for (const e of ov) { if (e.t <= t) n = e.n; else break; } return n; };

  // arc layouts at every membership-change time
  function layouts(P, arc) {
    const ts = [];
    for (const m of P.dots) ts.push(m.bud, m.release);
    for (let k = 1; k < P.ov.length; k++) {
      const was = P.ov[k - 1].n > 0, is = P.ov[k].n > 0;
      if (was !== is) ts.push(P.ov[k].t);
    }
    ts.sort((a, b) => a - b);
    const uniq = [];
    for (const x of ts) if (!uniq.length || x - uniq[uniq.length - 1] > 1e-6) uniq.push(x);
    const mid = (arc.from + arc.to) / 2, step = (arc.to - arc.from) / MAX_VISIBLE;
    const out = [];
    for (const tau of uniq) {
      const items = P.dots.filter((m) => m.bud <= tau + 1e-9 && tau + 1e-9 < m.release);
      const badge = overflowAt(P.ov, tau + 1e-9) > 0;
      const k = items.length + (badge ? 1 : 0);
      const ang = new Map();
      items.forEach((m, j) => ang.set(m.i, mid + (j - (k - 1) / 2) * step));
      out.push({ t: tau, ang, badge: badge ? mid + (k - 1 - (k - 1) / 2) * step : null });
    }
    return out;
  }

  // eased angle of mission id (or 'badge') at time t: base at its entry layout + eased deltas after it
  function angleAt(L, id, t, D) {
    const get = (l) => (id === 'badge' ? l.badge : l.ang.get(id));
    // latest entry (absent -> present) at or before t
    let start = -1;
    for (let e = 0; e < L.length && L[e].t <= t + 1e-9; e++) {
      const has = get(L[e]) != null, had = e > 0 && get(L[e - 1]) != null;
      if (has && !had) start = e;
    }
    if (start < 0) return null;
    let a = get(L[start]);
    for (let e = start + 1; e < L.length && L[e].t <= t + 1e-9; e++) {
      const cur = get(L[e]), prev = get(L[e - 1]);
      if (cur == null) break; // released: the dot keeps whatever motion was already under way
      a += (cur - prev) * smooth(clamp((t - L[e].t) / D));
    }
    // a transition already started before release keeps easing to completion
    return a;
  }

  // ------------------------------------------------------------------ geometry + state at time t
  function compute(t, o) {
    o = o || {};
    const th = V.theme(o.theme || 'dark');
    const cx = o.cx != null ? o.cx : 600, cy = o.cy != null ? o.cy : 323, r = o.r != null ? o.r : 150;
    const u = r / 150;
    const arc = o.arc && o.arc.from != null && o.arc.to != null ? o.arc : DEFAULT_ARC;
    const R = r * (o.orbit != null ? o.orbit : 1.38);
    const rs = r * (o.surface != null ? o.surface : 1.0);
    const P = plan(o);
    const pace = P.pace;
    const L = layouts(P, arc);
    const D = TM.reflow * pace;
    const ACC = th.accentRGB, OK = V.hexRGB(th.success), BAD = V.hexRGB(th.fail);
    const dotR = 5.2 * u * (o.size > 0 ? o.size : 1);
    const dots = [], ripples = [];

    for (const m of P.dots) {
      if (t < m.bud || t >= m.gone) continue;
      const tb = (t - m.bud) / pace, te = (t - m.exit) / pace;
      const th0 = angleAt(L, m.i, t, D);
      if (th0 == null) continue;
      const seed = m.i * 7.31;
      // gentle organic drift: the dot breathes in and out a little; the path home bows slightly
      const drift = 1.6 * u * V.noise1(t * 0.55 + seed, 11);
      const sway = 5 * u * V.noise1(t * 0.42 + seed, 23);
      const Rd = R + drift;
      const r0 = rs * 0.94;
      const p0 = [cx + Math.cos(th0) * r0, cy + Math.sin(th0) * r0];
      const p2 = [cx + Math.cos(th0) * Rd, cy + Math.sin(th0) * Rd];
      const rm = (r0 + Rd) / 2;
      const p1 = [cx + Math.cos(th0) * rm - Math.sin(th0) * sway, cy + Math.sin(th0) * rm + Math.cos(th0) * sway];

      // budding: the tendril grows out, the dot springs out at its tip, then the tendril pinches off
      // into the dot (the bud separates from the parent body)
      const grow = E.outCubic(clamp(tb / TM.stalk));
      const pinch = E.inOutCubic(clamp((tb - TM.pinchAt) / TM.pinch));
      const popT = tb - TM.popAt;
      let scale = popT > 0 ? V.spring(popT, 2.3, 0.38) : 0;
      const bulb = popT > 0 ? 0 : grow; // a tiny bulb rides the tip before the pop
      const per = 1.75 + 0.22 * (m.i % 3);
      const breathe = 1 + 0.07 * Math.sin(TAU * (tb - TM.pulseIn) / per) * clamp((tb - TM.popAt) / 0.5);
      let col1 = ACC, wipe = 0, alpha = 1, pos = 1, shake = 0, check = 0, tail = 0;
      let label = clamp((tb - 0.32) / 0.28);
      let phase = tb < TM.pinchAt + TM.pinch ? 'bud' : 'work';
      let ringA = te < 0 ? 1 : 1 - clamp(te / 0.12);

      if (te >= 0) {
        const base = popT > 0 ? scale : 1;
        if (m.outcome === 'merge') {
          phase = 'merge';
          col1 = OK;
          wipe = E.outCubic(clamp(te / TM.tint));
          const up = 1 + 0.36 * E.outBack(clamp(te / 0.3));
          check = E.outCubic(clamp((te - 0.07) / 0.24));
          const p = clamp((te - TM.hold) / TM.travel);
          const q = E.inOutCubic(p);
          pos = 1 - q * 1.04;                     // home along a gently bowed path, a hair past the surface
          tail = 0.42 * Math.sin(Math.PI * Math.min(1, p * 1.1)) * (p > 0 ? 1 : 0);
          scale = base * lerp(up, 0.45, E.inCubic(p));
          alpha = 1 - clamp((p - 0.74) / 0.26);
          check *= 1 - clamp(p / 0.3);
          label *= 1 - clamp(p / 0.3);
          const tr = te - TM.hold - TM.travel * 0.86;
          if (tr > 0 && tr < TM.ripple) ripples.push({ angle: th0, k: tr / TM.ripple, col: OK });
        } else {
          phase = 'fail';
          col1 = BAD;
          wipe = E.outCubic(clamp(te / TM.tint));
          shake = 2.8 * u * Math.sin(TAU * 8.5 * te) * Math.exp(-7 * te) * (te < TM.hold ? 1 : 0);
          const q = clamp((te - TM.hold) / TM.fade);
          scale = base * (1 - E.inCubic(q)) * (1 + 0.1 * E.outCubic(clamp(te / 0.12)) * (1 - q));
          alpha = 1 - E.inQuad(q);
          label *= 1 - clamp(q / 0.5);
        }
      } else {
        scale *= breathe;
      }
      let [x, y] = pos >= 1 ? p2 : bzAt(p0, p1, p2, Math.max(0, pos));
      x += -Math.sin(th0) * shake; y += Math.cos(th0) * shake; // the shake runs along the arc
      dots.push({
        i: m.i, label: m.label, outcome: m.outcome, phase, x, y, angle: th0,
        homeX: p2[0], homeY: cy + Math.sin(th0) * R,
        radius: dotR * scale, scale, alpha, col0: ACC, col1, wipe, col: rgbMix(ACC, col1, wipe), check,
        labelA: label, ringA: te < 0.12 ? ringA : 0, tb, per, p0, p1, p2,
        stemA: Math.min(pinch, grow), stemB: grow, bulb, pos, tail,
      });
    }

    // overflow badge
    let badge = null;
    const nNow = overflowAt(P.ov, t);
    // last appearance / disappearance
    let appear = null, vanish = null, lastN = 0;
    for (let k = 1; k < P.ov.length; k++) {
      const e = P.ov[k], prev = P.ov[k - 1];
      if (e.t > t) break;
      if (prev.n === 0 && e.n > 0) { appear = e.t; vanish = null; }
      if (prev.n > 0 && e.n === 0) { vanish = e.t; lastN = prev.n; }
    }
    if (appear != null && (vanish == null || (t - vanish) / pace < TM.badge)) {
      const a = angleAt(L, 'badge', t, D);
      if (a != null) {
        const sIn = V.spring((t - appear) / pace, 2.4, 0.5);
        const kOut = vanish != null ? E.inCubic(clamp((t - vanish) / pace / TM.badge)) : 0;
        // count roll: last change of a non-zero count
        let n = vanish != null ? lastN : nNow, prevN = n, tc = -Infinity;
        for (let k = 1; k < P.ov.length; k++) {
          const e = P.ov[k], prev = P.ov[k - 1];
          if (e.t > t) break;
          if (e.n > 0 && prev.n > 0 && e.n !== prev.n) { tc = e.t; prevN = prev.n; }
        }
        if (o.quirk40) { n = 1; prevN = 1; }
        badge = {
          x: cx + Math.cos(a) * R, y: cy + Math.sin(a) * R, angle: a, n, prevN,
          roll: prevN !== n ? clamp((t - tc) / pace / TM.roll) : 1,
          scale: sIn * (1 - 0.25 * kOut), alpha: clamp(sIn * 1.4) * (1 - kOut),
        };
      }
    }
    return { th, cx, cy, r, rs, R, u, dotR, dots, badge, ripples, pace };
  }

  // ------------------------------------------------------------------ drawing
  function drawCheck(ctx, x, y, s, k, color, lw) {
    if (k <= 0) return;
    const a = [x - s * 0.42, y + s * 0.02], b = [x - s * 0.1, y + s * 0.32], c = [x + s * 0.46, y - s * 0.3];
    const l1 = Math.hypot(b[0] - a[0], b[1] - a[1]), l2 = Math.hypot(c[0] - b[0], c[1] - b[1]);
    const d = k * (l1 + l2);
    ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(a[0], a[1]);
    if (d <= l1) ctx.lineTo(lerp(a[0], b[0], d / l1), lerp(a[1], b[1], d / l1));
    else { ctx.lineTo(b[0], b[1]); const f = (d - l1) / l2; ctx.lineTo(lerp(b[0], c[0], f), lerp(b[1], c[1], f)); }
    ctx.stroke();
  }

  const bzAt = (p0, p1, p2, s) => {
    const a = (1 - s) * (1 - s), b = 2 * (1 - s) * s, c = s * s;
    return [a * p0[0] + b * p1[0] + c * p2[0], a * p0[1] + b * p1[1] + c * p2[1]];
  };
  // filled tapered stem along the quadratic p0-p1-p2 between params a < b; width wa at a -> wb at b,
  // round cap at b
  const STEM_N = 14;
  function stem(ctx, p0, p1, p2, a, b, wa, wb) {
    const SL = new Float64Array((STEM_N + 1) * 2), SR = new Float64Array((STEM_N + 1) * 2);
    for (let k = 0; k <= STEM_N; k++) {
      const q = lerp(a, b, k / STEM_N);
      const pt = bzAt(p0, p1, p2, q);
      let dx = 2 * (1 - q) * (p1[0] - p0[0]) + 2 * q * (p2[0] - p1[0]);
      let dy = 2 * (1 - q) * (p1[1] - p0[1]) + 2 * q * (p2[1] - p1[1]);
      const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
      const hw = lerp(wa, wb, k / STEM_N) / 2;
      SL[k * 2] = pt[0] - dy * hw; SL[k * 2 + 1] = pt[1] + dx * hw;
      SR[k * 2] = pt[0] + dy * hw; SR[k * 2 + 1] = pt[1] - dx * hw;
    }
    const n2 = STEM_N * 2, tip = bzAt(p0, p1, p2, b);
    ctx.beginPath();
    ctx.moveTo(SL[0], SL[1]);
    for (let k = 1; k <= STEM_N; k++) ctx.lineTo(SL[k * 2], SL[k * 2 + 1]);
    ctx.arc(tip[0], tip[1], wb / 2, Math.atan2(SL[n2 + 1] - tip[1], SL[n2] - tip[0]), Math.atan2(SR[n2 + 1] - tip[1], SR[n2] - tip[0]), true);
    for (let k = STEM_N; k >= 0; k--) ctx.lineTo(SR[k * 2], SR[k * 2 + 1]);
    ctx.closePath();
    ctx.fill();
  }

  function drawStandIn(ctx, t, o, S) {
    const th = S.th;
    if (V.components.orb && V.components.orb.draw && o.demoOrb !== 'standin') {
      V.components.orb.draw(ctx, t, { x: S.cx, y: S.cy, r: S.r, theme: o.theme || 'dark', state: o.demoOrbState || 'idle' });
      return;
    }
    ctx.save();
    V.halo(ctx, S.cx, S.cy, S.r * 2.2, th, 1);
    ctx.beginPath(); ctx.arc(S.cx, S.cy, S.r, 0, TAU);
    ctx.fillStyle = V.rgba(th.accentRGB, 0.07); ctx.fill();
    ctx.strokeStyle = V.rgba(th.accentRGB, 0.28); ctx.lineWidth = 1 * S.u; ctx.stroke();
    ctx.restore();
  }

  function draw(ctx, t, o) {
    o = o || {};
    const S = compute(t, o);
    const th = S.th, u = S.u;
    const A = o.alpha != null ? clamp(o.alpha) : 1;
    if (o.demoOrb) drawStandIn(ctx, t, o, S);
    if (!(A > 0) || (!S.dots.length && !S.badge && !S.ripples.length)) return;
    const dark = th.name === 'dark';
    const checkCol = dark ? th.bg : th.text;

    ctx.save();
    // never inherit the caller's text/line state
    ctx.letterSpacing = '0px'; ctx.wordSpacing = '0px'; ctx.direction = 'ltr'; ctx.setLineDash([]);
    ctx.globalAlpha *= A;
    const A0 = ctx.globalAlpha;

    // 1. tendrils (behind everything): a tapered stem that fades in from inside the orb's glow,
    //    then pinches off into the bud; on merge, a short comet tail rides the dot home
    for (const d of S.dots) {
      const p0 = d.p0, p1 = d.p1, p2 = d.p2;
      if (d.stemB - d.stemA > 0.01) {
        const pa = bzAt(p0, p1, p2, d.stemA), pb = bzAt(p0, p1, p2, d.stemB);
        const g = ctx.createLinearGradient(p0[0], p0[1], p2[0], p2[1]);
        const sa = (dark ? 0.7 : 0.8) * d.alpha;
        g.addColorStop(0, rgbStr(d.col, 0));
        g.addColorStop(0.5, rgbStr(d.col, sa * 0.45));
        g.addColorStop(1, rgbStr(d.col, sa));
        ctx.fillStyle = g;
        const w = (q) => lerp(0.5, 2.1, q * q) * u;
        stem(ctx, p0, p1, p2, d.stemA, d.stemB, w(d.stemA), w(d.stemB));
        if (d.bulb > 0) {
          ctx.fillStyle = rgbStr(d.col, 0.95 * d.bulb);
          ctx.beginPath(); ctx.arc(pb[0], pb[1], 2.4 * u * d.bulb, 0, TAU); ctx.fill();
        }
      }
      if (d.tail > 0.01 && d.alpha > 0 && d.radius > 0.1) {
        const a0 = Math.max(0, d.pos), b0 = Math.min(1, d.pos + d.tail);
        if (b0 - a0 > 0.01) {
          const pa = bzAt(p0, p1, p2, a0), pb = bzAt(p0, p1, p2, b0);
          const g = ctx.createLinearGradient(pa[0], pa[1], pb[0], pb[1]);
          g.addColorStop(0, rgbStr(d.col, 0.55 * d.alpha));
          g.addColorStop(1, rgbStr(d.col, 0));
          ctx.fillStyle = g;
          stem(ctx, p0, p1, p2, b0, a0, 0.3 * u, d.radius * 1.5);
        }
      }
    }

    // 2. merge ripples: two wavefronts run along the orb's rim from the absorption point, plus a soft
    //    splash where it entered. On dark the orb is additive light, so the ripple adds light too.
    if (S.ripples.length && dark) ctx.globalCompositeOperation = 'lighter';
    for (const rp of S.ripples) {
      const k = rp.k, e = E.outCubic(k);
      const rad = S.rs * 1.07;
      const spread = 0.1 + 0.66 * e, trail = 0.42;
      const a = (dark ? 0.62 : 0.8) * Math.pow(1 - k, 1.4);
      const f = (x) => clamp(0.5 + x / TAU, 0, 1);
      const inner = Math.max(0, spread - trail);
      const wave = (alpha) => {
        const g = ctx.createConicGradient(rp.angle - Math.PI, S.cx, S.cy);
        g.addColorStop(f(-spread - 0.035), rgbStr(rp.col, 0));
        g.addColorStop(f(-spread), rgbStr(rp.col, alpha));
        g.addColorStop(f(-inner), rgbStr(rp.col, 0));
        g.addColorStop(f(inner), rgbStr(rp.col, 0));
        g.addColorStop(f(spread), rgbStr(rp.col, alpha));
        g.addColorStop(f(spread + 0.035), rgbStr(rp.col, 0));
        return g;
      };
      ctx.lineCap = 'butt';
      ctx.beginPath(); ctx.arc(S.cx, S.cy, rad, rp.angle - spread - 0.05, rp.angle + spread + 0.05);
      ctx.strokeStyle = wave(a * 0.28); ctx.lineWidth = (7 - 3 * k) * u; ctx.stroke();   // soft body
      ctx.strokeStyle = wave(a); ctx.lineWidth = (1.8 - 0.8 * k) * u; ctx.stroke();      // crisp front
      const ix = S.cx + Math.cos(rp.angle) * rad, iy = S.cy + Math.sin(rp.angle) * rad;
      const sr = (8 + 20 * e) * u;
      const sg = ctx.createRadialGradient(ix, iy, 0, ix, iy, sr);
      sg.addColorStop(0, rgbStr(rp.col, (dark ? 0.5 : 0.32) * Math.pow(1 - k, 2.2)));
      sg.addColorStop(1, rgbStr(rp.col, 0));
      ctx.fillStyle = sg;
      ctx.beginPath(); ctx.arc(ix, iy, sr, 0, TAU); ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';

    // 3. breathing pulse (a soft expanding wash with a hairline front) + a faint body halo
    for (const d of S.dots) {
      if (d.radius <= 0.05 || d.alpha <= 0) continue;
      if (d.ringA > 0 && d.tb > TM.pulseIn) {
        // a soft wavefront band (no hard outline) expanding from the dot
        const ph = (((d.tb - TM.pulseIn) / d.per) % 1 + 1) % 1;
        const rr = d.radius * (1.2 + 2.0 * E.outCubic(ph));
        const k = Math.pow(1 - ph, 1.8) * d.ringA * d.alpha;
        const g = ctx.createRadialGradient(d.x, d.y, rr * 0.55, d.x, d.y, rr);
        g.addColorStop(0, rgbStr(d.col, 0));
        g.addColorStop(0.7, rgbStr(d.col, (dark ? 0.32 : 0.28) * k));
        g.addColorStop(1, rgbStr(d.col, 0));
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(d.x, d.y, rr, 0, TAU); ctx.fill();
      }
      const hr = d.radius * 2.6;
      const g = ctx.createRadialGradient(d.x, d.y, d.radius * 0.5, d.x, d.y, hr);
      g.addColorStop(0, rgbStr(d.col, (dark ? 0.2 : 0.1) * d.alpha));
      g.addColorStop(1, rgbStr(d.col, 0));
      ctx.fillStyle = g;
      if (dark) ctx.globalCompositeOperation = 'lighter';
      ctx.beginPath(); ctx.arc(d.x, d.y, hr, 0, TAU); ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
    }

    // 4. the dots
    for (const d of S.dots) {
      if (d.radius <= 0.05 || d.alpha <= 0) continue;
      // outcome colour wipes out from the centre (no muddy accent->sage midpoint)
      if (d.wipe < 1) {
        ctx.fillStyle = rgbStr(d.col0, d.alpha);
        ctx.beginPath(); ctx.arc(d.x, d.y, d.radius, 0, TAU); ctx.fill();
      }
      if (d.wipe > 0) {
        ctx.fillStyle = rgbStr(d.col1, d.alpha);
        ctx.beginPath(); ctx.arc(d.x, d.y, d.radius * (d.wipe < 1 ? d.wipe : 1), 0, TAU); ctx.fill();
      }
      if (d.check > 0) {
        ctx.globalAlpha = A0 * d.alpha;
        drawCheck(ctx, d.x, d.y + 0.2 * u, d.radius * 1.02, d.check, checkCol, 1.45 * u);
        ctx.globalAlpha = A0;
      }
    }

    // 5. label chips under the dots (optional)
    if (o.labels) {
      ctx.font = V.ui(8.6 * u, 560);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (const d of S.dots) {
        if (!d.label || d.labelA <= 0.001) continue;
        const w = ctx.measureText(d.label).width + 12 * u, h = 14 * u;
        const lx = d.homeX, ly = d.homeY + S.dotR * 1.4 + 6 * u + h / 2; // fixed under the dot's home
        const la = d.labelA;
        const rise = (1 - E.outCubic(clamp(la * 1.2))) * 3 * u;
        ctx.globalAlpha = A0 * la;
        V.rr(ctx, lx - w / 2, ly - h / 2 + rise, w, h, h / 2);
        ctx.fillStyle = th.bg; ctx.fill();          // opaque base so the stem passes cleanly behind the tag
        ctx.fillStyle = th.glassHi; ctx.fill();
        ctx.strokeStyle = th.line; ctx.lineWidth = 1 * u * 0.8; ctx.stroke();
        ctx.fillStyle = th.text;
        ctx.globalAlpha = A0 * la * 0.82;
        ctx.fillText(d.label, lx, ly + rise + 0.4 * u);
        ctx.globalAlpha = A0;
      }
    }

    // 6. overflow badge "+N"
    const b = S.badge;
    if (b && b.alpha > 0.001 && b.scale > 0.01) {
      const h = 15 * u;
      ctx.font = V.ui(9.6 * u, 620);
      const tw = Math.max(ctx.measureText('+' + b.n).width, ctx.measureText('+' + b.prevN).width);
      const w = Math.max(h * 1.5, tw + 13 * u);
      ctx.save();
      ctx.translate(b.x, b.y); ctx.scale(b.scale, b.scale);
      ctx.globalAlpha = A0 * b.alpha;
      V.rr(ctx, -w / 2, -h / 2, w, h, h / 2);
      ctx.fillStyle = th.glassHi; ctx.fill();
      ctx.strokeStyle = V.rgba(th.accentRGB, dark ? 0.55 : 0.7); ctx.lineWidth = 1 * u; ctx.stroke();
      ctx.beginPath(); ctx.rect(-w / 2, -h / 2, w, h); ctx.clip();
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = th.text;
      const rk = E.outCubic(b.roll);
      if (b.roll < 1) {
        ctx.globalAlpha = A0 * b.alpha * (1 - rk) * 0.85;
        ctx.fillText('+' + b.prevN, 0, 0.5 * u - rk * 9 * u);
      }
      ctx.globalAlpha = A0 * b.alpha * rk * 0.85;
      ctx.fillText('+' + b.n, 0, 0.5 * u + (1 - rk) * 9 * u);
      ctx.restore();
    }
    ctx.restore();
  }

  // positions(t, o): where everything is (in the caller's units) — for attaching other graphics.
  function positions(t, o) {
    const S = compute(t, o || {});
    return {
      dots: S.dots.map((d) => ({
        i: d.i, label: d.label, outcome: d.outcome, phase: d.phase, x: d.x, y: d.y, angle: d.angle,
        radius: d.radius, alpha: d.alpha, color: rgbStr(d.col, 1),
      })),
      badge: S.badge ? { x: S.badge.x, y: S.badge.y, n: S.badge.n, alpha: S.badge.alpha } : null,
      ripples: S.ripples.map((r) => ({ angle: r.angle, k: r.k, x: S.cx + Math.cos(r.angle) * S.rs, y: S.cy + Math.sin(r.angle) * S.rs })),
    };
  }

  V.components.organs = { draw, positions, MAX_VISIBLE, DEMO, TIMING: TM };
})();
