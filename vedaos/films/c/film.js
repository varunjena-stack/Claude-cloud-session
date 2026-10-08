// VEDAOS — Film C: energy montage. 30s, 1920×1080, 60 fps, 120 BPM.
// Every cue comes from films/c/cues.json (injected as window.CUES) — the score reads the same file.
// Honesty rules (owner-locked): only verified behaviour on screen. Notes inline where a beat was re-cut for it.
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
  // Real RMS from Veda's voice output when audio/envelope.json has stems (fixed reference, like the product);
  // otherwise a seeded syllable-like stand-in inside each Veda line's window.
  const ENV = window.ENVELOPE && window.ENVELOPE.voices && window.ENVELOPE.voices.length ? window.ENVELOPE : null;
  const LINE_DUR = { here: 0.7, talks: 1.1, stops_veda: 2.6 };
  function speechLevel(t) {
    if (t >= C.stop && t < C.drop) return 0;
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
    [ST.researching, 'researching'], [ST.focus, 'focus'], [C.pullback, 'idle'], [C.category + 0.4, 'listening'],
    [voice.talks.at, 'speaking'], [S.remembers, 'thinking'], [S.masters, 'researching'],
    [S.delegates, 'thinking'], [S.stops, 'listening'], [voice.stops_veda.at, 'speaking'], [C.stop, 'idle'],
    [C.drop, 'listening'], [T.cream, 'speaking'], [T.dark, 'thinking'], [C.collapse, 'idle'],
  ];
  const XF = 0.28; // state crossfade (outCubic: the change starts ON the cue)
  function stateAt(t) {
    let i = 0;
    while (i + 1 < STATE_KEYS.length && STATE_KEYS[i + 1][0] <= t) i++;
    return i;
  }
  // the kill: on "Stop" Veda goes dark on the same frame and holds still until the drop
  const KILLED = (() => { const p = orb.params('idle'); p.radius *= 0.72; p.bright *= 0.3; p.glow *= 0.25; p.speed = 0; p.turb *= 0.3; return p; })();
  function orbParams(t) {
    if (t >= C.stop && t < C.drop) return KILLED;
    const i = stateAt(t);
    const cur = orb.params(STATE_KEYS[i][1]);
    if (i === 0) return cur;
    const prev = STATE_KEYS[i][0] === C.drop ? KILLED : orb.params(STATE_KEYS[i - 1][1]);
    return orb.mix(prev, cur, E.outCubic(clamp((t - STATE_KEYS[i][0]) / XF)));
  }
  // analytic rotation phase across all speed changes (no jumps); frozen during the kill
  const PHASE_KEYS = [];
  STATE_KEYS.forEach(([tk, s], i) => {
    const sp = s === 'idle' && tk === C.stop ? 0 : orb.params(s).speed;
    if (i > 0) PHASE_KEYS.push({ t: tk, speed: tk === C.stop ? 0 : PHASE_KEYS[PHASE_KEYS.length - 1].speed });
    PHASE_KEYS.push({ t: i === 0 ? -1 : tk + (tk === C.stop ? 0.001 : XF), speed: sp });
  });
  const orbPhase = (t) => orb.phaseFrom(PHASE_KEYS, t);
  function drawOrb(ctx, t, o) {
    orb.draw(ctx, t, Object.assign({ params: orbParams(t), phase: orbPhase(t), level: speechLevel(t) }, o));
  }

  // ------------------------------------------------------------------ type
  // Headline: Fraunces, letters rise out of a mask while the weight axis swings 260 -> 600.
  // Pass t0 slightly BEFORE the beat so the letters are mid-rise (max velocity) on the hit.
  function headline(ctx, t, t0, word, x, y, o = {}) {
    const a = t - t0;
    if (a < 0) return;
    const th = V.theme(o.theme || 'dark');
    const px = o.px || 150;
    const stop = o.stop === false ? '' : '.';
    ctx.save();
    ctx.letterSpacing = `${-px * 0.02}px`;
    ctx.textBaseline = 'alphabetic';
    ctx.font = V.display(px, 600);
    const chars = [...word, ...(stop ? [stop] : [])];
    const widths = chars.map((ch) => ctx.measureText(ch).width);
    const total = widths.reduce((s, w) => s + w, 0);
    let cx = o.align === 'right' ? x - total : x;
    const exit = o.exit != null ? E.inExpo(clamp((t - o.exit) / 0.22)) : 0;
    ctx.beginPath(); ctx.rect(cx - px, y - px * 1.05, total + px * 2, px * 1.35); ctx.clip();
    chars.forEach((ch, i) => {
      const li = a - i * (o.stagger || 0.022);
      if (li < 0) { cx += widths[i]; return; }
      const k = E.outExpo(clamp(li / 0.42));
      const rise = (1 - spring(li, 2.6, 0.55)) * px * 0.9;
      ctx.font = V.display(px, lerp(260, 600, k));
      ctx.fillStyle = ch === '.' && i === chars.length - 1 && stop ? th.accent : (o.color || th.text);
      ctx.fillText(ch, cx, y + Math.max(0, rise) + exit * px * 1.2);
      cx += widths[i];
    });
    ctx.restore();
  }
  // quoted request line (the same voice-quote style the explainers use)
  function quote(ctx, t, t0, text, x, y, px, th, color) {
    const a = t - t0;
    if (a < 0) return;
    const k = E.outExpo(clamp(a / 0.35));
    ctx.save();
    ctx.beginPath(); ctx.rect(0, y - px * 1.1, W, px * 1.45); ctx.clip();
    V.text(ctx, `“${text}”`, x, y + (1 - k) * px * 0.9, V.display(px, lerp(300, 460, k)), color || th.text);
    ctx.restore();
  }
  // vertical roll between lines, centred on the beat (the swap's peak velocity lands on the cue)
  const ROLL = 0.3, LEAD = 0.15;
  function rollWord(ctx, t, words, times, x, y, px, color, font) {
    let i = 0;
    while (i + 1 < times.length && times[i + 1] - LEAD <= t) i++;
    const k = E.inOutExpo(clamp((t - times[i] + LEAD) / ROLL));
    ctx.save();
    ctx.beginPath(); ctx.rect(0, y - px * 1.0, W, px * 1.32); ctx.clip();
    ctx.letterSpacing = font ? '2px' : `${-px * 0.025}px`;
    ctx.textBaseline = 'alphabetic';
    const draw = (w, dy, wk) => { ctx.font = font ? font(wk) : V.display(px, lerp(300, 560, wk)); ctx.fillStyle = color; ctx.fillText(w, x, y + dy); };
    if (i > 0 && k < 1) draw(words[i - 1], -k * px * 1.25, 1 - k);
    draw(words[i], (1 - k) * px * 1.25, k);
    ctx.restore();
  }

  // ------------------------------------------------------------------ camera over the app window
  const L = shell.layout({ prajnaOpen: 0 });
  const WIDE = { cx: 590, cy: 377, z: 1.3 }; // window top at y≈50, leaves a type band under it
  const SHOTS = {
    talks: { cx: 300, cy: 190, z: 3.4 },
    masters: { cx: 900, cy: 405, z: 3.0 },
    delegates: { cx: 760, cy: 360, z: 1.6 },
    stops: { cx: 300, cy: 205, z: 3.2 },
  };
  function applyCam(ctx, cam) {
    ctx.translate(W / 2, H / 2);
    ctx.scale(cam.z, cam.z);
    ctx.translate(-cam.cx, -cam.cy);
  }
  const toScreen = (cam, x, y) => ({ x: W / 2 + (x - cam.cx) * cam.z, y: H / 2 + (y - cam.cy) * cam.z });
  const mixCam = (a, b, k) => ({ cx: lerp(a.cx, b.cx, k), cy: lerp(a.cy, b.cy, k), z: Math.exp(lerp(Math.log(a.z), Math.log(b.z), k)) });
  // whip: outExpo from the previous framing — full velocity on the beat, settles in ~0.4s
  function whip(t, t0, shot, from) {
    const k = E.outExpo(clamp((t - t0) / 0.42));
    return mixCam(from || { cx: shot.cx + 60, cy: shot.cy + 10, z: shot.z * 0.82 }, shot, k);
  }
  const punch = (t, t0, amt = 0.035) => (t < t0 ? 1 : 1 + amt * Math.exp(-(t - t0) * 9) * Math.cos((t - t0) * 18));

  // ------------------------------------------------------------------ app story state (continuous across shots)
  // TALKS: a plain LLM answer (verified) — not a calendar briefing (Google OAuth is currently failing).
  // STOPS: interrupts the research spoken summary (S39 spoken_summary, verified) with the kill switch (verified).
  const TURNS = [
    { who: 'user', text: 'Proof of work, in five words?', at: C.category + 0.5 },
    { who: 'veda', text: voice.talks.text, at: voice.talks.at, dur: 0.95 },
    { who: 'user', text: 'What did the battery research find?', at: S.stops - 0.05 },
    { who: 'veda', text: voice.stops_veda.text, at: voice.stops_veda.at, dur: 2.6 },
    { who: 'user', text: 'Stop.', at: voice.stop.at },
    { who: 'proactive', text: 'Prajna finished Bitcoin — mastery 0.91.', at: T.cream + 0.1, dur: 1.2 },
  ];
  // documented log formats only ([ORCHESTRATOR] Cycle N saturation, [PRAJNA] stream)
  const LOG = [
    { text: '[ORCHESTRATOR] Cycle 3 saturation: 0.89', at: C.category + 0.3 },
    { text: '[PRAJNA] curriculum · 12 nodes', at: S.masters + 0.1 },
    { text: '[PRAJNA] node 6/12 · mastery 0.88', at: S.masters + 0.75 },
    { text: '[PRAJNA] node 9/12', at: S.delegates + 0.3 },
    { text: '[PRAJNA] mastery 0.91 · done', at: T.cream },
  ];
  // D2 FIFO: research / Prajna / plan share ONE slot — while Prajna runs, the others visibly queue.
  // The clock jumps ~an hour at the drop (Prajna runs take about an hour), so completions after it are honest.
  function queueAt(t) {
    const prajnaDone = t >= T.cream, planDone = t >= T.dark + 0.5, codeDone = t >= T.dark;
    const q = [];
    if (t >= S.masters) q.push({ lane: 'PRAJNA', label: 'Bitcoin · 12 nodes', status: prajnaDone ? 'done' : 'running', progress: prajnaDone ? 1 : null, at: S.masters + 0.05 });
    if (t >= S.delegates) {
      q.push({ lane: 'MISSION', label: 'Fix the export script', status: codeDone ? 'done' : 'running', progress: codeDone ? 1 : null, at: S.delegates + 0.12 });
      q.push({ lane: 'MISSION', label: 'Q4 launch checklist', status: planDone ? 'done' : prajnaDone ? 'running' : 'queued', progress: planDone ? 1 : null, at: S.delegates + 0.3 });
      q.push({ lane: 'RESEARCH', label: 'Compare note-sync options', status: t >= T.dark + 1.0 ? 'running' : 'queued', progress: null, at: S.delegates + 0.45 });
    }
    return q;
  }
  const MISSIONS = [ // S115 corner window for the mission that is actually running (CODE doesn't take the shared slot)
    { kind: 'CODE', title: 'Fix the export script', at: S.delegates + 0.1, state: 'running', elapsed: 4 },
  ];
  // Prajna: opens on the Masters whip, holds mid-run (no re-run: that path is not runtime-verified), completes after the drop
  const prajnaOpenAt = (t) => E.outExpo(prog(t, S.masters - 0.08, S.masters + 0.25)) * (1 - E.inOutCubic(prog(t, S.delegates - 0.05, S.delegates + 0.3)));
  function prajnaTime(t) {
    const a = t - S.masters + 0.1;
    if (t >= T.cream) return 10; // done (proactive announcement lands here)
    return a < 0.95 ? a : 0.95 + (a - 0.95) * 0.03;
  }
  const timerAt = (t) => (t < C.drop ? 872 + Math.floor(t) : 4720 + Math.floor(t - C.drop));

  // draw the whole app (window units; caller sets the camera)
  function drawApp(ctx, t, theme, o = {}) {
    const open = o.prajnaOpen != null ? o.prajnaOpen : prajnaOpenAt(t);
    const lay = shell.layout({ prajnaOpen: open });
    shell.draw(ctx, t, {
      theme, state: STATE_KEYS[stateAt(t)][1], timer: timerAt(t), pill: o.pill,
      prajnaOpen: open, queue: queueAt(t), focus: false, shadow: o.shadow !== false, status: '', statusRight: '',
    });
    tr.draw(ctx, t, { rect: lay.conversation, theme, turns: TURNS, stopAt: C.stop });
    tr.drawLog(ctx, t, { rect: lay.log, theme, lines: LOG });
    prajna.draw(ctx, prajnaTime(t), { rect: lay.prajna, theme, subject: 'Bitcoin', open, dur: 1.45, rerun: -1 });
    if (o.orb !== false) drawOrb(ctx, t, { x: lay.orb.cx, y: lay.orb.cy, r: lay.orb.r, theme });
    return lay;
  }

  // ================================================================== SCENES
  const HERO = { x: 1300, y: 540, r: 280 };

  // listening trace: a thin accent line that follows a spoken phrase (hook and the "Stop." bookend)
  function trace(ctx, t, t0, x0, len, y, alpha, th, dead) {
    if (alpha <= 0) return;
    ctx.save();
    ctx.strokeStyle = V.rgba(th.accentRGB, 0.85 * alpha); ctx.lineWidth = 2.5; ctx.lineCap = 'round';
    ctx.beginPath();
    const x1 = x0 + len * E.outCubic(clamp((t - t0 + 0.1) / 0.75));
    for (let xx = x0; xx <= x1; xx += 4) {
      const u = (xx - x0) / len;
      const amp = dead ? 0 : 26 * Math.exp(-Math.pow((u * 0.85 - (t - t0)) * 3.2, 2)) * (0.5 + 0.5 * V.noise1(xx * 0.05 + t * 8, 2));
      const yy = y + Math.sin(xx * 0.09 - t * 22) * amp;
      xx === x0 ? ctx.moveTo(xx, yy) : ctx.lineTo(xx, yy);
    }
    ctx.stroke();
    ctx.restore();
  }

  function sceneHook(ctx, t) { // 0 -> ignite -> states
    const th = V.theme('dark');
    V.fill(ctx, th.bg);
    V.halo(ctx, HERO.x, HERO.y, 900, th, clamp(t / 1.0) * 0.8 + 0.2);
    // "Hey Veda." heard word by word ("Hey" is already rising on frame 0), then swallowed by the core
    const words = [['Hey', -0.15], ['Veda.', 0.4]];
    const pull = E.inCubic(prog(t, 0.72, 0.97));
    ctx.save();
    ctx.letterSpacing = '-3px';
    ctx.textBaseline = 'alphabetic';
    const px = 190;
    let x = 160;
    words.forEach(([w, at]) => {
      ctx.font = V.display(px, 520);
      const ww = ctx.measureText(w).width, adv = ctx.measureText(w + ' ').width;
      const a = t - at;
      if (a >= 0) {
        const k = E.outExpo(clamp(a / 0.35));
        const cx0 = x + ww / 2, cy0 = 600 - px * 0.32;
        const tx = lerp(cx0, HERO.x, pull), ty = lerp(cy0, HERO.y, pull);
        const squash = 1 - 0.8 * E.inCubic(prog(t, 0.9, 0.97));
        ctx.save();
        ctx.globalAlpha = clamp(k * 3) * (1 - clamp((pull - 0.8) / 0.2));
        ctx.translate(tx, ty + (1 - k) * 40);
        ctx.scale(1 - pull * 0.9, (1 - pull * 0.9) * squash);
        ctx.font = V.display(px, lerp(300, 520, k));
        ctx.fillStyle = th.text;
        ctx.fillText(w, -ww / 2, px * 0.32);
        ctx.restore();
      }
      x += adv;
    });
    ctx.restore();
    trace(ctx, t, 0.05, 166, 834, 690, clamp((t + 0.2) / 0.2) * (1 - pull), th, false);
    // hot point: builds tension, anticipates (shrinks + brightens), then the ignition flashes on the beat
    const ig = clamp((t - C.ignite + 0.1) / 1.0); // linear: the orb's overshoot/bloom/flash are built in
    const ant = prog(t, 0.85, 0.98);
    const glow = t < C.ignite - 0.1 ? 0.6 + 0.7 * E.inCubic(clamp(t / 0.9)) + pull * 0.8 : 1 + 0.8 * Math.exp(-Math.max(0, t - C.ignite) * 3);
    drawOrb(ctx, t, { x: HERO.x, y: HERO.y, r: HERO.r * (1 - 0.4 * ant * (1 - ig)), theme: 'dark', ignite: ig, glow });
  }

  // states: the benefit leads (big), the product's own state name labels it (small caps)
  const BENEFITS = ['Waits for you.', 'Hears you.', 'Thinks it through.', 'Talks back.', 'Goes deep.', 'Goes quiet.'];
  const STATE_LABELS = ['IDLE', 'LISTENING', 'THINKING', 'SPEAKING', 'RESEARCHING', 'FOCUS · WAKE WORD PAUSED'];
  const STATE_R = { idle: 1, listening: 1, thinking: 0.86, speaking: 1.04, researching: 1.12, focus: 0.84 };
  function heroScale(t) { // continuous dolly + a punch on every state cue
    const times = Object.values(ST);
    let pk = 1;
    for (const c of times) if (t >= c) pk = punch(t, c, 0.045);
    return (1 + 0.1 * E.inOutCubic(prog(t, ST.idle, C.pullback))) * pk;
  }
  function heroR(t) {
    const i = stateAt(t);
    const cur = STATE_R[STATE_KEYS[i][1]] || 1, prev = i > 0 ? STATE_R[STATE_KEYS[i - 1][1]] || 1 : 1;
    return HERO.r * lerp(prev, cur, E.outCubic(clamp((t - STATE_KEYS[i][0]) / XF)));
  }
  function sceneStates(ctx, t) {
    const th = V.theme('dark');
    V.fill(ctx, th.bg);
    const times = Object.values(ST);
    const pb = E.inOutCubic(prog(t, C.pullback, C.pullback + 1.35));
    // 1) benefit lines + state labels; exit by rolling DOWN out of their masks at the pull-back (no fades)
    if (t < C.pullback + 0.3) {
      const ex = E.inExpo(prog(t, C.pullback, C.pullback + 0.25));
      ctx.save();
      ctx.translate(0, ex * 240);
      ctx.beginPath(); ctx.rect(0, 0, W, 780); ctx.clip();
      const sc = heroScale(t);
      ctx.translate(150, 600); ctx.scale(Math.sqrt(sc), Math.sqrt(sc)); ctx.translate(-150, -600);
      rollWord(ctx, t, BENEFITS, times, 150, 600, 132, th.text);
      rollWord(ctx, t, STATE_LABELS, times, 156, 690, 30, th.muted, (k) => V.ui(30, lerp(500, 650, k)));
      const idx = Math.max(0, times.findLastIndex((x) => x - LEAD <= t));
      for (let k = 0; k < 6; k++) {
        const on = k === idx;
        const grow = on ? E.outExpo(clamp((t - times[k] + LEAD) / 0.3)) : 0;
        ctx.fillStyle = on ? th.accent : th.faint;
        V.rr(ctx, 160 + k * 46, 410, 34 + grow * 10, 5, 2.5); ctx.fill();
      }
      ctx.restore();
    }
    if (pb <= 0) {
      V.halo(ctx, HERO.x, HERO.y, 900, th, 1);
      const sc = heroScale(t);
      drawOrb(ctx, t, { x: HERO.x, y: HERO.y, r: heroR(t) * sc, theme: 'dark' });
      return;
    }
    // 2) pull back: the hero orb flies into its slot; the window assembles around it with springs
    const scEnd = heroScale(C.pullback);
    const z0 = (HERO.r * scEnd) / L.orb.r;
    const camFrom = { cx: L.orb.cx - (HERO.x - W / 2) / z0, cy: L.orb.cy - (HERO.y - H / 2) / z0, z: z0 };
    const windUp = E.inCubic(prog(t, C.category + 0.5, C.category + 1.0)) * 0.025;
    const cam = mixCam(camFrom, WIDE, pb);
    cam.z *= 1 - windUp;
    ctx.save();
    applyCam(ctx, cam);
    assembleApp(ctx, t, C.pullback + 0.25);
    drawOrb(ctx, t, { x: L.orb.cx, y: L.orb.cy, r: L.orb.r, theme: 'dark' });
    ctx.restore();
    // 3) the category line, so a first-time viewer knows what this is
    headline(ctx, t, C.category - 0.08, 'A voice assistant for your Mac', 182, 1002, { px: 96, stagger: 0.012, exit: S.talks - 0.12 });
  }
  // window body opens from the orb, then topbar / left column / right column spring in, staggered
  function assembleApp(ctx, t, t0) {
    const th = V.theme('dark');
    const body = spring(t - t0, 1.8, 0.75);
    const cx = L.orb.cx, cy = L.orb.cy, r0 = L.orb.r * 1.15;
    const bx0 = lerp(cx - r0, 0, body), by0 = lerp(cy - r0, 0, body), bx1 = lerp(cx + r0, shell.W, body), by1 = lerp(cy + r0, shell.H, body);
    const rad = lerp(r0, 16, clamp(body));
    // body + shadow
    ctx.save();
    ctx.shadowColor = th.shadow; ctx.shadowBlur = 40; ctx.shadowOffsetY = 18;
    V.rr(ctx, bx0, by0, bx1 - bx0, by1 - by0, rad); ctx.fillStyle = th.bg; ctx.fill();
    ctx.restore();
    const regions = [ // [clip rect, offset vector, start]
      [[0, 0, shell.W, 60], [0, -50], t0 + 0.18],
      [[0, 60, 347, 560], [-90, 0], t0 + 0.28],
      [[853, 60, 327, 560], [90, 0], t0 + 0.36],
      [[347, 60, 506, 560], [0, 0], t0 + 0.2],
    ];
    ctx.save();
    V.rr(ctx, bx0, by0, bx1 - bx0, by1 - by0, rad); ctx.clip();
    for (const [rc, off, ts] of regions) {
      const k = spring(t - ts, 2.4, 0.62);
      if (t < ts) continue;
      ctx.save();
      ctx.beginPath(); ctx.rect(rc[0], rc[1], rc[2], rc[3]); ctx.clip();
      ctx.translate(off[0] * (1 - k), off[1] * (1 - k));
      drawApp(ctx, t, 'dark', { orb: false, shadow: false });
      ctx.restore();
    }
    ctx.restore();
  }

  function sceneTalks(ctx, t) {
    V.fill(ctx, V.theme('dark').bg);
    const from = Object.assign({}, WIDE, { z: WIDE.z * 0.975 });
    ctx.save(); applyCam(ctx, whip(t, S.talks, SHOTS.talks, from)); drawApp(ctx, t, 'dark'); ctx.restore();
    headline(ctx, t, S.talks - 0.06, 'Talks', 1200, 250, { px: 168 });
  }
  // explainers: pre-rolled so the beat frame already holds the question, with a scale settle for impact
  const MEMORY_OPTS = { // plain tiered retrieval through a shared word — the graph tier is off by default since S104
    tiers: ['Curated', 'Personal', 'Vectors'], entity: 'Saturday',
    question: 'Anything I should know before Saturday?',
    factA: { text: 'Maya wants clause 7 settled by Saturday', meta: '3 weeks ago · work', icon: 'doc' },
    factB: { text: 'Climbing meetup Saturday, 9 am — Maya’s coming', meta: 'last week · personal', icon: 'peak' },
    answer: 'See Maya Saturday — settle clause 7.',
  };
  const RESEARCH_OPTS = { // saturation monitor only (no stopping threshold); a short payoff that reads in time
    threshold: null,
    synthesis: { title: 'Synthesis · 3 cycles', text: 'Most failures start at the interface.' },
  };
  function sceneExplainer(ctx, t, comp, t0, word, opts) {
    const th = V.theme('dark');
    V.fill(ctx, th.bg);
    const s = 1 + 0.06 * (1 - E.outExpo(clamp((t - t0) / 0.35)));
    ctx.save();
    ctx.translate(W / 2, H / 2 + 60); ctx.scale(s, s); ctx.translate(-W / 2, -H / 2 - 60);
    comp.draw(ctx, t - t0 + 0.3, Object.assign({ theme: 'dark', dur: 1.5, top: 210 }, opts));
    ctx.restore();
    headline(ctx, t, t0 - 0.1, word, 120, 170, { px: 120 });
  }
  function sceneMasters(ctx, t) {
    const th = V.theme('dark');
    V.fill(ctx, th.bg);
    ctx.save(); applyCam(ctx, whip(t, S.masters, SHOTS.masters)); drawApp(ctx, t, 'dark'); ctx.restore();
    quote(ctx, t, S.masters + 0.02, 'Prajna, teach me Bitcoin.', 124, 856, 58, th);
    headline(ctx, t, S.masters + 0.05, 'Masters', 120, 1010, { px: 168 });
  }
  function sceneDelegates(ctx, t) {
    const th = V.theme('dark');
    V.fill(ctx, th.bg);
    const cam = whip(t, S.delegates, SHOTS.delegates, SHOTS.masters);
    ctx.save(); applyCam(ctx, cam); drawApp(ctx, t, 'dark'); ctx.restore();
    const from = toScreen(cam, L.orb.cx, L.orb.cy);
    missions.draw(ctx, t, { theme: 'dark', x: W - 48, y: 48, scale: 2.5, missions: MISSIONS.map((m) => Object.assign({ from }, m)) });
    quote(ctx, t, S.delegates + 0.02, 'Fix the export script while I work.', 124, 856, 58, th);
    headline(ctx, t, S.delegates + 0.05, 'Delegates', 120, 1010, { px: 168 });
  }
  function sceneStops(ctx, t) {
    const th = V.theme('dark');
    V.fill(ctx, th.bg);
    const cam = whip(t, S.stops, SHOTS.stops);
    cam.z *= punch(t, C.stop, 0.035);
    ctx.save(); applyCam(ctx, cam); drawApp(ctx, t, 'dark'); ctx.restore();
    // the bookend to the hook: the user's "Stop." at full size, its trace dies on the kill
    const a = t - voice.stop.at;
    if (a >= -0.05) {
      ctx.save();
      const k = E.outExpo(clamp((a + 0.05) / 0.3));
      ctx.letterSpacing = '-3px';
      ctx.beginPath(); ctx.rect(1080, 300, 840, 330); ctx.clip();
      V.text(ctx, 'Stop.', 1180, 560 + (1 - k) * 160, V.display(190, lerp(300, 560, k)), th.text);
      ctx.restore();
      trace(ctx, t, voice.stop.at, 1186, 560, 640, clamp((a + 0.05) / 0.1), th, t >= C.stop);
    }
    if (t >= C.stop) {
      const k = E.outExpo(clamp((t - C.stop) / 0.3));
      ctx.save(); ctx.globalAlpha = clamp(k * 2);
      V.text(ctx, 'Mid-word. Instantly.', 1186, 720 + (1 - k) * 24, V.ui(44, 560), th.muted);
      ctx.restore();
    }
  }

  // theme flips: each new theme bursts from the theme pill ON the beat; its line rides inside the wipe
  const FLIPS = [['light', T.light, 0, 'Your memory stays here'], ['cream', T.cream, 1, 'On your Mac'], ['dark', T.dark, 2, 'Yours to keep']];
  function sceneThemes(ctx, t) {
    let i = 0;
    while (i + 1 < FLIPS.length && FLIPS[i + 1][1] <= t) i++;
    const [name, t0, pillIdx, line] = FLIPS[i];
    const prev = i === 0 ? null : FLIPS[i - 1];
    const k = E.outExpo(clamp((t - t0) / 0.5));
    const pill = shell.layout({}).pill;
    // the drop is a move: spring out of the Stops close-up into the wide, then drift with a punch on each downbeat
    const out = spring(t - C.drop, 1.6, 0.7);
    let cam = mixCam(SHOTS.stops, WIDE, clamp(out, 0, 1.08));
    const drift = E.inOutCubic(prog(t, C.drop + 0.6, C.collapse));
    cam = { cx: cam.cx + drift * 8, cy: cam.cy, z: cam.z * (1 + drift * 0.035) };
    let pk = 1;
    for (const d of [20, 22, 24]) if (t >= d) pk = punch(t, d, 0.012);
    cam.z *= pk;
    const pillFrom = i === 0 ? 2 : prev[2];
    const pillNow = lerp(pillFrom, pillIdx, E.outCubic(clamp((t - t0 + 0.05) / 0.25)));
    const band = (theme, text, t1) => headline(ctx, t, t1, text, toScreen(cam, 0, 0).x + 4, 1012, { px: 116, theme, stagger: 0.016 });
    const draw = (theme, text, tLine) => {
      V.fill(ctx, V.theme(theme).bg);
      ctx.save(); applyCam(ctx, cam); drawApp(ctx, t, theme, { pill: pillNow }); ctx.restore();
      if (text) band(theme, text, tLine);
    };
    if (i === 0) draw('dark', null, 0);
    else draw(prev[0], prev[3], prev[1] + 0.12);
    // feathered wipe edge: clip the new theme to the circle
    const sp = toScreen(cam, pill.x, pill.y);
    ctx.save();
    ctx.beginPath(); ctx.arc(sp.x, sp.y, 20 + k * 2300, 0, TAU); ctx.clip();
    draw(name, line, t0 + 0.12);
    ctx.restore();
  }

  function sceneCollapse(ctx, t) {
    const th = V.theme('dark');
    const u = E.inOutCubic(prog(t, C.collapse, C.endcard - 0.05));
    const lay = shell.layout({ prajnaOpen: 0 });
    // dive: aim so the orb's core lands exactly where the end card's orb is born (470, 505)
    const START = { cx: WIDE.cx + 8, cy: WIDE.cy, z: WIDE.z * 1.035 };
    const zEnd = 3.2;
    const END = { cx: lay.orb.cx - (470 - W / 2) / zEnd, cy: lay.orb.cy - (505 - H / 2) / zEnd, z: zEnd };
    const cam = mixCam(START, END, u);
    V.fill(ctx, th.bg);
    ctx.save(); applyCam(ctx, cam);
    if (t < C.collapse + 0.5) drawApp(ctx, t, 'dark', { orb: false }); // chrome cuts out on the 25.5 beat
    const ig = 1 - E.inCubic(prog(t, C.collapse + 0.45, C.endcard - 0.02));
    drawOrb(ctx, t, { x: lay.orb.cx, y: lay.orb.cy, r: lay.orb.r, theme: 'dark', ignite: ig, glow: 1 + (1 - ig) * 1.5 });
    ctx.restore();
  }

  function sceneEnd(ctx, t) {
    const th = V.theme('cream');
    V.fill(ctx, th.bg);
    const a = t - C.endcard;
    const ox = 470, oy = 505;
    drawOrb(ctx, t, { x: ox, y: oy, r: 118, theme: 'cream', ignite: clamp(a / 0.9), params: orb.params('idle'), level: 0 });
    // wordmark: VEDA (heavy) + OS (light), letters rise as the weight axis settles
    const px = 230, bx = 650, by = 590;
    ctx.save();
    ctx.letterSpacing = `${-px * 0.015}px`;
    ctx.textBaseline = 'alphabetic';
    ctx.beginPath(); ctx.rect(0, by - px * 0.9, W, px * 1.02); ctx.clip();
    let x = bx;
    [...'VEDAOS'].forEach((ch, i) => {
      const li = a - 0.04 - i * 0.045;
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
    // tagline: per-word mask rise, like every other line in the film
    ctx.save();
    ctx.beginPath(); ctx.rect(0, by + 40, W, 100); ctx.clip();
    ctx.font = V.display(60, 420);
    let tx = bx + 8;
    'The assistant that’s yours.'.split(' ').forEach((w, i) => {
      const li = a - 0.5 - i * 0.05;
      const ww = ctx.measureText(w + ' ').width;
      if (li > 0) {
        const k = E.outExpo(clamp(li / 0.45));
        V.text(ctx, w, tx, by + 108 + (1 - k) * 70, V.display(60, lerp(300, 420, k)), th.text);
      }
      tx += ww;
    });
    ctx.restore();
    // call to action: high-contrast text, the accent kept for the underline that draws on the beat
    const cta = E.outExpo(clamp((t - C.tagline + 0.08) / 0.45));
    if (cta > 0) {
      ctx.save();
      ctx.beginPath(); ctx.rect(0, by + 150, W, 110); ctx.clip();
      ctx.letterSpacing = '0.5px';
      ctx.font = V.ui(54, 600);
      const label = 'Coming soon to Mac';
      const lw = ctx.measureText(label).width;
      V.text(ctx, label, bx + 10, by + 214 + (1 - cta) * 60, V.ui(54, 600), th.text);
      ctx.fillStyle = th.accent;
      ctx.fillRect(bx + 10, by + 236, lw * E.outExpo(clamp((t - C.tagline) / 0.6)), 4);
      ctx.restore();
    }
  }

  // ================================================================== TIMELINE
  function drawFrame(ctx, t) {
    if (t < ST.idle) sceneHook(ctx, t);
    else if (t < S.talks) sceneStates(ctx, t);
    else if (t < S.remembers) sceneTalks(ctx, t);
    else if (t < S.researches) sceneExplainer(ctx, t, memory, S.remembers, 'Remembers', MEMORY_OPTS);
    else if (t < S.masters) sceneExplainer(ctx, t, research, S.researches, 'Researches', RESEARCH_OPTS);
    else if (t < S.delegates) sceneMasters(ctx, t);
    else if (t < S.stops) sceneDelegates(ctx, t);
    else if (t < C.drop) sceneStops(ctx, t);
    else if (t < C.collapse) sceneThemes(ctx, t);
    else if (t < C.endcard) sceneCollapse(ctx, t);
    else sceneEnd(ctx, t);
  }
  // more motion-blur sub-frames right after whips, wipes and the ignition, where 6 samples step into copies
  const FAST = [C.ignite, S.talks, S.remembers, S.researches, S.masters, S.delegates, S.stops, C.stop, C.drop, T.cream, T.dark];
  const samples = (t) => (FAST.some((c) => t >= c - 0.02 && t < c + 0.1) ? 24 : 6);
  V.mount(drawFrame, { samples, shutter: 0.5, duration: C.duration });
})();
