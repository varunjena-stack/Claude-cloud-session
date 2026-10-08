// VEDAOS — Film C: energy montage. 30s, 1920×1080, 60 fps, 120 BPM.
// Every cue comes from films/c/cues.json (injected as window.CUES) — the score reads the same file.
'use strict';
(function () {
  const { W, H, E, clamp, lerp, prog, spring, TAU } = V;
  const C = window.CUES;
  const S = C.slams, T = C.themes;
  const orb = V.components.orb, shell = V.components.shell, tr = V.components.transcript;
  const prajna = V.components.prajna, missions = V.components.missions;
  const memory = V.components.memory, research = V.components.research;
  const voice = Object.fromEntries(C.voice.map((v) => [v.id, v]));

  // ------------------------------------------------------------------ speech level
  // Real RMS from Veda's Kokoro output when audio/envelope.json exists (fixed reference, like the product);
  // otherwise a seeded syllable-like stand-in inside each Veda line's window.
  const ENV = window.ENVELOPE && window.ENVELOPE.voices && window.ENVELOPE.voices.length ? window.ENVELOPE : null;
  const LINE_DUR = { here: 0.7, talks: 1.4, stops_veda: 2.4 };
  function speechLevel(t) {
    if (ENV) {
      const f = t * 60, i = Math.floor(f), k = f - i, r = ENV.rms;
      return i >= 0 && i + 1 < r.length ? lerp(r[i], r[i + 1], k) : 0;
    }
    let lv = 0;
    for (const v of C.voice) {
      if (v.who !== 'veda') continue;
      let end = v.at + (LINE_DUR[v.id] || 1);
      if (v.id === 'stops_veda') end = Math.min(end, C.stop);
      if (t < v.at || t > end) continue;
      const u = t - v.at;
      const syl = 0.5 + 0.5 * Math.sin(u * TAU * 4.3 + V.noise1(u * 3, 7) * 2);
      const env = clamp(u / 0.05) * clamp((end - t) / 0.08);
      lv = Math.max(lv, env * (0.35 + 0.5 * syl * (0.6 + 0.4 * V.noise1(u * 7, 3))));
    }
    return clamp(lv);
  }

  // ------------------------------------------------------------------ orb state timeline
  const ST = C.states;
  const STATE_KEYS = [
    [-1, 'idle'], [ST.idle, 'idle'], [ST.listening, 'listening'], [ST.thinking, 'thinking'], [ST.speaking, 'speaking'],
    [ST.researching, 'researching'], [ST.focus, 'focus'], [C.pullback, 'idle'],
    [S.talks, 'listening'], [voice.talks.at, 'speaking'], [S.remembers, 'thinking'], [S.masters, 'researching'],
    [S.delegates, 'thinking'], [S.stops, 'listening'], [voice.stops_veda.at, 'speaking'], [C.stop, 'idle'],
    [C.drop, 'listening'], [C.drop + 1.5, 'speaking'], [T.cream, 'thinking'], [T.dark, 'researching'], [C.collapse, 'idle'],
  ];
  const XF = 0.32; // state crossfade seconds
  function orbParams(t) {
    let i = 0;
    while (i + 1 < STATE_KEYS.length && STATE_KEYS[i + 1][0] <= t) i++;
    const cur = orb.params(STATE_KEYS[i][1]);
    if (i === 0) return cur;
    const prev = orb.params(STATE_KEYS[i - 1][1]);
    const k = E.inOutCubic(clamp((t - STATE_KEYS[i][0]) / XF));
    return orb.mix(prev, cur, k);
  }
  // analytic rotation phase across all speed changes (no jumps)
  const PHASE_KEYS = [];
  STATE_KEYS.forEach(([tk, s], i) => {
    const sp = orb.params(s).speed;
    if (i > 0) PHASE_KEYS.push({ t: tk, speed: orb.params(STATE_KEYS[i - 1][1]).speed });
    PHASE_KEYS.push({ t: i === 0 ? -1 : tk + XF, speed: sp });
  });
  const orbPhase = (t) => orb.phaseFrom(PHASE_KEYS, t);
  function drawOrb(ctx, t, o) {
    orb.draw(ctx, t, Object.assign({ params: orbParams(t), phase: orbPhase(t), level: speechLevel(t) }, o));
  }

  // ------------------------------------------------------------------ type
  // Headline: Fraunces, letters rise out of a mask while the weight axis swings 260 -> 600.
  function headline(ctx, t, t0, word, x, y, o = {}) {
    const a = t - t0;
    if (a < 0) return;
    const th = V.theme(o.theme || 'dark');
    const px = o.px || 150;
    const align = o.align || 'left';
    ctx.save();
    ctx.letterSpacing = `${-px * 0.02}px`;
    ctx.textBaseline = 'alphabetic';
    // measure at final weight so the layout doesn't wobble while the weight animates
    ctx.font = V.display(px, 600);
    const widths = [...word].map((ch) => ctx.measureText(ch).width);
    const total = widths.reduce((s, w) => s + w, 0) + ctx.measureText('.').width;
    let cx = align === 'right' ? x - total : align === 'center' ? x - total / 2 : x;
    ctx.beginPath(); ctx.rect(cx - px, y - px * 1.05, total + px * 2, px * 1.35); ctx.clip();
    [...word, '.'].forEach((ch, i) => {
      const li = a - i * 0.022;
      const k = E.outExpo(clamp(li / 0.42));
      const rise = (1 - spring(li, 2.6, 0.55)) * px * 0.9;
      ctx.font = V.display(px, lerp(260, 600, k));
      ctx.fillStyle = ch === '.' ? th.accent : th.text;
      ctx.fillText(ch, cx, y + Math.max(0, rise));
      cx += i < widths.length ? widths[i] : 0;
    });
    ctx.restore();
  }
  // vertical roll between words (state labels)
  function rollWord(ctx, t, words, times, x, y, px, th) {
    let i = 0;
    while (i + 1 < times.length && times[i + 1] <= t) i++;
    const k = E.inOutExpo(clamp((t - times[i]) / 0.3));
    ctx.save();
    ctx.beginPath(); ctx.rect(0, y - px * 1.0, W, px * 1.3); ctx.clip();
    ctx.letterSpacing = `${-px * 0.025}px`;
    const draw = (w, dy, wght) => { ctx.font = V.display(px, wght); ctx.fillStyle = th.text; ctx.textBaseline = 'alphabetic'; ctx.fillText(w, x, y + dy); };
    if (i > 0 && k < 1) draw(words[i - 1], -k * px * 1.2, lerp(560, 300, k));
    draw(words[i], (1 - k) * px * 1.2, lerp(300, 560, k));
    ctx.restore();
  }

  // ------------------------------------------------------------------ camera over the app window
  const L = shell.layout({ prajnaOpen: 0 });
  const FULL = { cx: 590, cy: 310, z: 1.5 };
  const SHOTS = {
    talks: { cx: 338, cy: 262, z: 2.5 },
    masters: { cx: 878, cy: 382, z: 2.55 },
    delegates: { cx: 770, cy: 352, z: 1.2 },
    stops: { cx: 330, cy: 270, z: 2.45 },
  };
  function applyCam(ctx, cam) {
    ctx.translate(W / 2, H / 2);
    ctx.scale(cam.z, cam.z);
    ctx.translate(-cam.cx, -cam.cy);
  }
  const mixCam = (a, b, k) => ({ cx: lerp(a.cx, b.cx, k), cy: lerp(a.cy, b.cy, k), z: Math.exp(lerp(Math.log(a.z), Math.log(b.z), k)) });
  // whip into a shot: start slightly wider and offset, settle with expo
  function whip(t, t0, shot, from) {
    const k = E.outExpo(clamp((t - t0) / 0.42));
    const start = from || { cx: shot.cx + 60, cy: shot.cy + 10, z: shot.z * 0.82 };
    return mixCam(start, shot, k);
  }

  // ------------------------------------------------------------------ app story state (continuous across shots)
  const TURNS = [
    { who: 'user', text: 'What’s on my plate today?', at: S.talks + 0.02 },
    { who: 'veda', text: voice.talks.text, at: voice.talks.at, dur: 1.15 },
    { who: 'user', text: 'Give me the quarterly numbers.', at: S.stops + 0.0 },
    { who: 'veda', text: voice.stops_veda.text, at: voice.stops_veda.at, dur: 2.4 },
    { who: 'user', text: 'Stop.', at: voice.stop.at },
    { who: 'proactive', text: 'Prajna finished Bitcoin — mastery 0.91.', at: C.drop + 1.6, dur: 1.4 },
  ];
  const LOG = [
    { text: '[WAKE] “Hey Veda” · listening', at: 9.0 },
    { text: '[PRAJNA] curriculum · 12 nodes', at: S.masters + 0.1 },
    { text: '[PRAJNA] node 6/12 · re-run (0.79 < 0.85)', at: S.masters + 0.7 },
    { text: '[MISSION] 4 dispatched · corner windows', at: S.delegates + 0.4 },
    { text: '[KILL] stopped by voice', at: C.stop },
    { text: '[PRAJNA] mastery 0.91 · done', at: C.drop + 1.5 },
  ];
  const QUEUE = [
    { lane: 'PRAJNA', label: 'Bitcoin · 12 nodes', status: 'running', progress: 0.42, at: S.masters + 0.05 },
    { lane: 'RESEARCH', label: 'Solid-state batteries', status: 'running', progress: 0.6, at: S.delegates + 0.1 },
    { lane: 'MISSION', label: 'Q4 launch checklist', status: 'running', progress: 0.3, at: S.delegates + 0.22 },
    { lane: 'MISSION', label: 'Fix the export script', status: 'running', progress: 0.2, at: S.delegates + 0.34 },
  ];
  function queueAt(t) {
    return QUEUE.map((q, i) => {
      const done = t > C.drop + 1.0 + i * 0.6 && q.lane !== 'RESEARCH';
      return Object.assign({}, q, {
        status: done ? 'done' : q.status,
        progress: done ? 1 : clamp(q.progress + Math.max(0, t - q.at) * 0.05, 0, 0.95),
      });
    });
  }
  // S115: each background Mission gets its own always-on-top corner window (S109: CODE / PLAN / RESEARCH)
  const MISSIONS = [
    { kind: 'RESEARCH', title: 'Battery failure modes', at: S.delegates + 0.08, dur: 1.25, outcome: 'done' },
    { kind: 'PLAN', title: 'Q4 launch checklist', at: S.delegates + 0.2, dur: 0.75, outcome: 'done' },
    { kind: 'CODE', title: 'Fix the export script', at: S.delegates + 0.32, dur: 0.95, outcome: 'done' },
    { kind: 'RESEARCH', title: 'Notion vs Obsidian sync', at: S.delegates + 0.44, dur: 3, outcome: 'done' },
  ];
  const prajnaOpenAt = (t) => E.inOutCubic(prog(t, S.masters + 0.05, S.masters + 0.45)) * (1 - E.inOutCubic(prog(t, C.drop + 0.6, C.drop + 1.1)));

  // draw the whole app (window units; caller sets the camera)
  function drawApp(ctx, t, theme, o = {}) {
    const open = o.prajnaOpen != null ? o.prajnaOpen : prajnaOpenAt(t);
    const lay = shell.layout({ prajnaOpen: open });
    const p = orbParams(t);
    shell.draw(ctx, t, {
      theme, state: o.state || 'idle', timer: 14 * 60 + 32 + Math.floor(t), pill: o.pill,
      prajnaOpen: open, queue: queueAt(t), focus: false, shadow: o.shadow !== false,
    });
    tr.draw(ctx, t, { rect: lay.conversation, theme, turns: TURNS, stopAt: C.stop });
    tr.drawLog(ctx, t, { rect: lay.log, theme, lines: LOG });
    prajna.draw(ctx, t - S.masters, { rect: lay.prajna, theme, subject: 'Bitcoin', open, dur: 1.45, rerun: 5 });
    if (o.orb !== false) drawOrb(ctx, t, { x: lay.orb.cx, y: lay.orb.cy, r: lay.orb.r, theme });
    return lay;
  }

  // ================================================================== SCENES
  const HERO = { x: 1300, y: 540, r: 280 };

  function sceneHook(ctx, t) { // 0 -> ignite -> states
    const th = V.theme('dark');
    V.fill(ctx, th.bg);
    V.halo(ctx, HERO.x, HERO.y, 900, th, clamp(t / 1.0) * 0.8 + 0.2);
    // "Hey Veda." heard word by word, then pulled into the core at the ignition
    const words = [['Hey', 0.05], ['Veda.', 0.4]];
    const pull = E.inExpo(prog(t, C.ignite - 0.28, C.ignite));
    ctx.save();
    ctx.letterSpacing = '-3px';
    ctx.textBaseline = 'alphabetic';
    let x = 160;
    const px = 190;
    words.forEach(([w, at], i) => {
      ctx.font = V.display(px, 520);
      const ww = ctx.measureText(w + ' ').width;
      const a = t - at;
      if (a >= 0) {
        const k = E.outExpo(clamp(a / 0.35));
        const tx = lerp(x, HERO.x - 40, pull), ty = lerp(600, HERO.y + 40, pull);
        ctx.save();
        ctx.globalAlpha = (1 - pull) * k;
        ctx.translate(tx, ty + (1 - k) * 40);
        ctx.scale(1 - pull * 0.85, 1 - pull * 0.85);
        ctx.font = V.display(px, lerp(300, 520, k));
        ctx.fillStyle = th.text;
        ctx.fillText(w, 0, 0);
        ctx.restore();
      }
      x += ww;
    });
    ctx.restore();
    // listening line: a thin accent trace that follows the spoken words
    const lineA = clamp(t / 0.1) * (1 - pull);
    if (lineA > 0) {
      ctx.save();
      ctx.strokeStyle = V.rgba(th.accentRGB, 0.85 * lineA); ctx.lineWidth = 2.5; ctx.lineCap = 'round';
      ctx.beginPath();
      const x0 = 166, x1 = lerp(166, 1000, E.outCubic(clamp(t / 0.85)));
      for (let xx = x0; xx <= x1; xx += 4) {
        const u = (xx - x0) / 834;
        const amp = 26 * Math.exp(-Math.pow((u * 0.85 - (t - 0.05)) * 3.2, 2)) * (0.5 + 0.5 * V.noise1(xx * 0.05 + t * 8, 2));
        const yy = 690 + Math.sin(xx * 0.09 - t * 22) * amp;
        xx === x0 ? ctx.moveTo(xx, yy) : ctx.lineTo(xx, yy);
      }
      ctx.stroke();
      ctx.restore();
    }
    // the orb: a hot point that blooms on the ignition
    const ig = clamp((t - C.ignite) / 1.0); // linear: the orb's overshoot/bloom/flash are built in
    drawOrb(ctx, t, { x: HERO.x, y: HERO.y, r: HERO.r, theme: 'dark', ignite: ig, glow: t < C.ignite ? 0.6 + pull * 1.2 : 1 + 0.8 * Math.exp(-(t - C.ignite) * 3) });
  }

  const STATE_NAMES = ['Idle', 'Listening', 'Thinking', 'Speaking', 'Researching', 'Focus'];
  const STATE_CAPS = ['Waiting for “Hey Veda”', 'Hears you', 'Works it out', 'Talks back, out loud', 'Goes deep, for minutes', 'Wake word locked'];
  function sceneStates(ctx, t) {
    const th = V.theme('dark');
    V.fill(ctx, th.bg);
    // pull back (8-10s): the hero orb flies into its slot as the window opens around it
    const pb = E.inOutCubic(prog(t, C.pullback, S.talks - 0.15));
    const times = Object.values(ST);
    if (pb < 1) {
      V.halo(ctx, HERO.x, HERO.y, 900, th, 1 - pb);
      // state word + caption
      const fade = 1 - E.inCubic(clamp(pb * 3));
      if (fade > 0) {
        ctx.save(); ctx.globalAlpha = fade;
        rollWord(ctx, t, STATE_NAMES, times, 150, 590, 150, th);
        rollWord(ctx, t, STATE_CAPS, times, 158, 690, 40, { text: th.muted });
        // state index ticks: six short bars, the active one in accent
        const idx = Math.max(0, times.findLastIndex((x) => x <= t));
        for (let k = 0; k < 6; k++) {
          const on = k === idx;
          const grow = on ? E.outExpo(clamp((t - times[k]) / 0.3)) : 0;
          ctx.fillStyle = on ? th.accent : th.faint;
          V.rr(ctx, 160 + k * 46, 400, 34 + grow * 10, 5, 2.5); ctx.fill();
        }
        ctx.restore();
      }
    }
    // the app window materialises around the orb
    if (pb > 0) {
      const camFrom = { cx: L.orb.cx + (960 - HERO.x) / 1.0 / (HERO.r / L.orb.r), cy: L.orb.cy, z: HERO.r / L.orb.r };
      const cam = mixCam(camFrom, FULL, pb);
      ctx.save();
      applyCam(ctx, cam);
      const reveal = E.outCubic(prog(t, C.pullback + 0.35, C.pullback + 1.35));
      const cx = L.orb.cx, cy = L.orb.cy;
      const x0 = lerp(cx - L.orb.r * 1.2, 0, reveal), y0 = lerp(cy - L.orb.r * 1.2, 0, reveal);
      const x1 = lerp(cx + L.orb.r * 1.2, shell.W, reveal), y1 = lerp(cy + L.orb.r * 1.2, shell.H, reveal);
      ctx.save();
      V.rr(ctx, x0, y0, x1 - x0, y1 - y0, lerp(L.orb.r * 1.2, 16, reveal)); ctx.clip();
      ctx.globalAlpha = clamp(reveal * 4);
      drawApp(ctx, t, 'dark', { orb: false, shadow: reveal > 0.98 });
      ctx.restore();
      drawOrb(ctx, t, { x: cx, y: cy, r: L.orb.r, theme: 'dark' });
      ctx.restore();
    } else {
      drawOrb(ctx, t, { x: HERO.x, y: HERO.y, r: HERO.r, theme: 'dark' });
    }
  }

  function sceneTalks(ctx, t) {
    V.fill(ctx, V.theme('dark').bg);
    ctx.save(); applyCam(ctx, whip(t, S.talks, SHOTS.talks, FULL)); drawApp(ctx, t, 'dark'); ctx.restore();
    headline(ctx, t, S.talks + 0.12, 'Talks', 1180, 250, { px: 168 });
  }
  function sceneExplainer(ctx, t, comp, t0, word) {
    const th = V.theme('dark');
    V.fill(ctx, th.bg);
    comp.draw(ctx, t - t0, { theme: 'dark', dur: 1.5, top: 210 });
    headline(ctx, t, t0 + 0.04, word, 120, 170, { px: 120 });
  }
  function sceneMasters(ctx, t) {
    V.fill(ctx, V.theme('dark').bg);
    ctx.save(); applyCam(ctx, whip(t, S.masters, SHOTS.masters)); drawApp(ctx, t, 'dark'); ctx.restore();
    headline(ctx, t, S.masters + 0.1, 'Masters', 120, 1000, { px: 168 });
  }
  function sceneDelegates(ctx, t) {
    V.fill(ctx, V.theme('dark').bg);
    const cam = whip(t, S.delegates, SHOTS.delegates, SHOTS.masters);
    ctx.save(); applyCam(ctx, cam); drawApp(ctx, t, 'dark'); ctx.restore();
    const lay = shell.layout({ prajnaOpen: prajnaOpenAt(t) });
    const from = { x: W / 2 + (lay.orb.cx - cam.cx) * cam.z, y: H / 2 + (lay.orb.cy - cam.cy) * cam.z };
    missions.draw(ctx, t, { theme: 'dark', x: W - 44, y: 44, scale: 1.45, missions: MISSIONS.map((m) => Object.assign({ from }, m)) });
    headline(ctx, t, S.delegates + 0.1, 'Delegates', 120, 1000, { px: 150 });
  }
  function sceneStops(ctx, t) {
    V.fill(ctx, V.theme('dark').bg);
    const settle = t >= C.stop ? Math.exp(-(t - C.stop) * 12) * Math.sin((t - C.stop) * 60) * 4 : 0; // a tiny jolt on the stop
    ctx.save(); ctx.translate(settle, 0); applyCam(ctx, whip(t, S.stops, SHOTS.stops)); drawApp(ctx, t, 'dark'); ctx.restore();
    headline(ctx, t, C.stop, 'Stops', 1180, 250, { px: 168 });
  }

  // theme flips: each new theme wipes in as a circle from the theme pill
  const FLIPS = [['light', T.light, 0], ['cream', T.cream, 1], ['dark', T.dark, 2]];
  function sceneThemes(ctx, t) {
    let i = 0;
    while (i + 1 < FLIPS.length && FLIPS[i + 1][1] <= t) i++;
    const [name, t0, pillIdx] = FLIPS[i];
    const prevName = i === 0 ? 'dark' : FLIPS[i - 1][0];
    const k = E.inOutExpo(clamp((t - t0) / 0.55));
    const pill = (shell.layout({}).pill) || { x: 958, y: 26 };
    const drift = E.inOutCubic(prog(t, C.drop, C.collapse));
    const z = 1.32 * (1 + drift * 0.03);
    const cam = { cx: FULL.cx + drift * 6, cy: (540 - 44) / z, z };
    const pillFrom = i === 0 ? 2 : FLIPS[i - 1][2];
    const pillNow = lerp(pillFrom, pillIdx, E.inOutCubic(clamp((t - t0) / 0.3)));
    const draw = (theme) => {
      V.fill(ctx, V.theme(theme).bg);
      ctx.save(); applyCam(ctx, cam); drawApp(ctx, t, theme, { pill: pillNow, state: 'speaking' }); ctx.restore();
    };
    draw(prevName);
    if (k > 0) {
      ctx.save();
      const sx = W / 2 + (pill.x - cam.cx) * cam.z, sy = H / 2 + (pill.y - cam.cy) * cam.z;
      ctx.beginPath(); ctx.arc(sx, sy, 20 + k * 2300, 0, TAU); ctx.clip();
      draw(name);
      ctx.restore();
    }
    const lab = name[0].toUpperCase() + name.slice(1);
    headline(ctx, t, t0 + 0.08, lab, W / 2 + (0 - cam.cx) * cam.z + 4, 1018, { px: 104, theme: name });
  }

  function sceneCollapse(ctx, t) {
    const th = V.theme('dark');
    const u = prog(t, C.collapse, C.endcard);
    const lay = shell.layout({ prajnaOpen: 0 });
    const z0 = 1.32 * 1.03;
    const z = z0 * Math.exp(Math.log(5) * E.inCubic(u));
    const cam = { cx: lerp(FULL.cx + 6, lay.orb.cx, E.outCubic(u)), cy: lerp(496 / z0, lay.orb.cy, E.outCubic(u)), z };
    V.fill(ctx, th.bg);
    ctx.save(); applyCam(ctx, cam);
    ctx.save(); ctx.globalAlpha = 1 - E.inCubic(clamp(u * 1.6)); drawApp(ctx, t, 'dark', { orb: false }); ctx.restore();
    const ig = 1 - E.inExpo(prog(t, C.collapse + 0.35, C.endcard - 0.04));
    drawOrb(ctx, t, { x: lay.orb.cx, y: lay.orb.cy, r: lay.orb.r, theme: 'dark', ignite: ig, glow: 1 + (1 - ig) * 1.5 });
    ctx.restore();
  }

  function sceneEnd(ctx, t) {
    const th = V.theme('cream');
    V.fill(ctx, th.bg);
    const a = t - C.endcard;
    const ox = 470, oy = 505;
    drawOrb(ctx, t, { x: ox, y: oy, r: 118, theme: 'cream', ignite: 1 - Math.pow(1 - clamp(a / 0.7), 3), params: orb.params('idle'), level: 0 });
    // wordmark: VEDA (heavy) + OS (light), letters rise as the weight axis settles
    const px = 230, bx = 650, by = 590;
    ctx.save();
    ctx.letterSpacing = `${-px * 0.015}px`;
    ctx.textBaseline = 'alphabetic';
    ctx.beginPath(); ctx.rect(0, by - px * 0.9, W, px * 1.02); ctx.clip();
    let x = bx;
    [...'VEDAOS'].forEach((ch, i) => {
      const li = a - 0.08 - i * 0.045;
      const k = E.outExpo(clamp(li / 0.55));
      const isOS = i >= 4;
      const fin = isOS ? 260 : 700;
      ctx.font = V.display(px, fin);
      const w = ctx.measureText(ch).width;
      if (li > 0) {
        ctx.font = V.display(px, lerp(isOS ? 120 : 300, fin, k));
        ctx.fillStyle = isOS ? th.accent : th.text;
        ctx.fillText(ch, x, by + (1 - spring(li, 2.2, 0.6)) * px);
      }
      x += w;
    });
    ctx.restore();
    // tagline + call to action
    const tg = E.outCubic(clamp((a - 0.55) / 0.5));
    if (tg > 0) {
      ctx.save(); ctx.globalAlpha = tg;
      V.text(ctx, 'The assistant that’s yours.', bx + 8, by + 96 + (1 - tg) * 18, V.display(52, 380), th.text);
      ctx.restore();
    }
    const cta = E.outExpo(clamp((t - C.tagline) / 0.5));
    if (cta > 0) {
      ctx.save(); ctx.globalAlpha = clamp(cta * 1.5);
      ctx.letterSpacing = '0.5px';
      ctx.font = V.ui(38, 600);
      const label = 'Coming soon to Mac';
      const lw = ctx.measureText(label).width;
      V.text(ctx, label, bx + 10, by + 196, V.ui(38, 600), th.accent);
      ctx.fillStyle = th.accent;
      ctx.fillRect(bx + 10, by + 216, lw * cta, 3);
      ctx.restore();
    }
  }

  // ================================================================== TIMELINE
  function drawFrame(ctx, t) {
    if (t < ST.idle) sceneHook(ctx, t);
    else if (t < S.talks) sceneStates(ctx, t);
    else if (t < S.remembers) sceneTalks(ctx, t);
    else if (t < S.researches) sceneExplainer(ctx, t, memory, S.remembers, 'Remembers');
    else if (t < S.masters) sceneExplainer(ctx, t, research, S.researches, 'Researches');
    else if (t < S.delegates) sceneMasters(ctx, t);
    else if (t < S.stops) sceneDelegates(ctx, t);
    else if (t < C.drop) sceneStops(ctx, t);
    else if (t < C.collapse) sceneThemes(ctx, t);
    else if (t < C.endcard) sceneCollapse(ctx, t);
    else sceneEnd(ctx, t);
  }
  V.mount(drawFrame, { samples: 6, shutter: 0.5, duration: C.duration });
})();
