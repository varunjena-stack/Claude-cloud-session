// Mission corner windows (S115): one detached, always-on-top window per background Mission, stacked in
// the screen corner. Replaces the S90 organ dots (live-verified 2026-08-24).
// Honest states only: 'running' shows real elapsed time (S114 removed fake ETAs; no percentages),
// 'queued' waits for the shared slot (D2's FIFO policy), 'done'/'failed' only when the film says so.
// Pure function of t. Draws in the current transform; sizes are window units × o.scale.
'use strict';
(function () {
  const { E, clamp, lerp, spring, TAU } = V;
  const WIN_W = 300, WIN_H = 74, GAP = 12, R = 12;

  function fmt(sec) {
    sec = Math.max(0, Math.floor(sec));
    return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
  }

  // missions: [{ kind:'RESEARCH'|'PLAN'|'CODE', title, at (window appears), state:'running'|'queued',
  //              elapsed (s already elapsed when it appears, default 0), doneAt?, outcome?:'done'|'failed',
  //              note? (queued text, default 'Queued · waiting for a free slot'), from:{x,y} }]
  // o: { theme, x (right edge of the stack), y (top), scale = 1.5, missions, exit (s, optional) }
  function draw(ctx, t, o) {
    const th = V.theme(o.theme || 'dark');
    const sc = o.scale || 1.5;
    const ms = o.missions || [];
    ctx.save();
    ctx.letterSpacing = '0px';
    ctx.setLineDash([]);
    ms.forEach((m, i) => {
      const a = t - m.at;
      if (a < 0) return;
      const done = m.doneAt != null && t >= m.doneAt;
      const failed = done && m.outcome === 'failed';
      const queued = !done && m.state === 'queued';
      // fly from its origin (the orb) to the corner slot, scale up as it lands
      const k = E.outExpo(clamp(a / 0.5));
      const slotX = o.x - WIN_W * sc, slotY = o.y + i * (WIN_H + GAP) * sc;
      const from = m.from || { x: slotX, y: slotY };
      const s = lerp(0.25, 1, spring(a, 2.4, 0.62));
      const x = lerp(from.x - WIN_W * sc * 0.125, slotX, k), y = lerp(from.y - WIN_H * sc * 0.125, slotY, k);
      const exitK = o.exit != null ? E.inOutCubic(clamp((t - o.exit - i * 0.05) / 0.45)) : 0;
      ctx.save();
      ctx.translate(x + exitK * (WIN_W * sc + 80), y);
      ctx.scale(sc * s, sc * s);
      ctx.globalAlpha *= clamp(a / 0.12) * (1 - exitK);
      // window: shadow, body, hairline
      ctx.save();
      ctx.shadowColor = th.shadow; ctx.shadowBlur = 22; ctx.shadowOffsetY = 8;
      V.rr(ctx, 0, 0, WIN_W, WIN_H, R); ctx.fillStyle = th.bg; ctx.fill();
      ctx.restore();
      V.rr(ctx, 0, 0, WIN_W, WIN_H, R); ctx.fillStyle = th.glass; ctx.fill();
      ctx.strokeStyle = th.line; ctx.lineWidth = 1; ctx.stroke();
      // status mark
      const cx = 24, cy = 26;
      if (queued) {
        ctx.strokeStyle = th.muted; ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.arc(cx, cy, 5, 0, TAU); ctx.stroke();
      } else if (!done) {
        const br = 0.5 + 0.5 * Math.sin((t - m.at) * TAU * 1.1);
        ctx.fillStyle = V.rgba(th.accentRGB, 0.18 + 0.14 * br);
        ctx.beginPath(); ctx.arc(cx, cy, 8 + 2 * br, 0, TAU); ctx.fill();
        ctx.fillStyle = th.accent; ctx.beginPath(); ctx.arc(cx, cy, 4.2, 0, TAU); ctx.fill();
      } else {
        const p = E.outBack(clamp((t - m.doneAt) / 0.3));
        ctx.fillStyle = failed ? th.fail : th.success;
        ctx.beginPath(); ctx.arc(cx, cy, 8.5 * p, 0, TAU); ctx.fill();
        if (!failed) V.icon.check(ctx, cx, cy, 9 * p, th.bg, 1.8);
        else { ctx.strokeStyle = th.bg; ctx.lineWidth = 1.8; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(cx - 3 * p, cy - 3 * p); ctx.lineTo(cx + 3 * p, cy + 3 * p); ctx.moveTo(cx + 3 * p, cy - 3 * p); ctx.lineTo(cx - 3 * p, cy + 3 * p); ctx.stroke(); }
      }
      // kind chip + title
      ctx.font = V.ui(9.5, 650); ctx.letterSpacing = '0.9px';
      const kw = ctx.measureText(m.kind).width;
      V.rr(ctx, 44, 16, kw + 14, 18, 9); ctx.fillStyle = V.rgba(th.accentRGB, queued ? 0.08 : 0.14); ctx.fill();
      V.text(ctx, m.kind, 51, 28.5, V.ui(9.5, 650), queued ? th.muted : th.accent);
      ctx.letterSpacing = '0px';
      ctx.save();
      ctx.beginPath(); ctx.rect(44 + kw + 22, 8, WIN_W - (44 + kw + 22) - 12, 30); ctx.clip();
      V.text(ctx, m.title, 44 + kw + 22, 30, V.ui(13.5, 560), queued ? th.muted : th.text);
      ctx.restore();
      // status line: real elapsed time while running; plain words otherwise
      const el = (m.elapsed || 0) + (done ? m.doneAt - m.at : a);
      const label = queued ? (m.note || 'Queued · waiting for a free slot')
        : !done ? `Working · ${fmt(el)}` : failed ? 'Stopped · needs you' : `Done · ${fmt(el)}`;
      V.text(ctx, label, 44, 56, V.ui(11.5, 480), done && !failed ? th.success : failed ? th.fail : th.muted);
      // a hairline that breathes while the mission runs (activity, not a fake percentage)
      if (!done && !queued) {
        const u = ((t - m.at) * 0.9) % 1;
        const g = ctx.createLinearGradient(44, 0, WIN_W - 16, 0);
        g.addColorStop(clamp(u - 0.25), V.rgba(th.accentRGB, 0));
        g.addColorStop(u, V.rgba(th.accentRGB, 0.75));
        g.addColorStop(clamp(u + 0.25), V.rgba(th.accentRGB, 0));
        ctx.fillStyle = g; ctx.fillRect(44, 64, WIN_W - 60, 1.5);
      }
      ctx.restore();
    });
    ctx.restore();
  }

  V.components.missions = { draw, WIN_W, WIN_H, GAP };
})();
