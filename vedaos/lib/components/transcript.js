// VEDAOS film component: transcript — the S98 rolling Conversation view + the 104px live-log strip.
//
// draw(ctx, t, o)     the conversation, inside the Conversation card (window units). o.rect is the CARD rect
//   (shared layout: shell.layout().conversation = {x:18, y:70, w:320, h:390}); content starts o.contentTop
//   (default 40) below the card top, under shell's "CONVERSATION" header. Pass contentTop: 0 for a bare rect.
//   - user turns appear the instant they are heard (fade + short rise), plain body text, DIMMED to ~50%
//     until the next Veda reply begins, then ease to full strength;
//   - Veda replies stream word by word in --accent: each word is revealed by a soft feathered wipe with a
//     thin caret riding its leading edge; word pacing is weighted by word length + punctuation pauses;
//   - proactive speech (Veda started it herself) streams the same way but muted + fake-oblique behind a
//     thin left rule;
//   - stopAt (kill switch): the turn streaming at stopAt freezes on its current word, gets " —", eases to
//     muted, and a small "Stopped" chip (filled square) opens up under it. stopLabel sets the chip text;
//     stopLabel '' (or false) means no chip at all and no room opened for it;
//   - stopHard: true makes the stop a hard cut: the turn freezes on the EXACT letter reached at stopAt (the
//     current word is not finished; the partial word is cut at a glyph boundary), the caret is gone on the
//     stopAt frame, accent -> muted within 2 frames, and the em dash lands at once, closed up to the frozen
//     letter ("Most failures start at th—");
//   - newest at the bottom; once content overflows, the view scrolls up — the scroll is the sum of every
//     line's critically-damped growth, so it is smooth and a pure function of t; lines leaving the top pass
//     under a soft per-pixel scroll mask (vertical gradient fill, so it works on any background).
// drawLog(ctx, t, o)  the live-log strip: newest at the bottom, 11px Inter with fixed-width digits, the
//   bracketed tag in accent at reduced opacity; a new line arrives slightly brighter and cools to muted.
//
// Pure function of t: no module state is mutated during draw; layout is recomputed per call.
(function () {
  'use strict';
  const V = window.V;
  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const lerp = (a, b, k) => a + (b - a) * k;
  const prog = (t, a, b) => clamp((t - a) / (b - a));
  const smooth = (x) => { x = clamp(x); return x * x * (3 - 2 * x); };
  const outCubic = (x) => 1 - Math.pow(1 - clamp(x), 3);
  const outQuart = (x) => 1 - Math.pow(1 - clamp(x), 4);
  const outExpo = (x) => (x >= 1 ? 1 : 1 - Math.pow(2, -10 * clamp(x)));
  // critically damped settle (zero start velocity, ~0.45 s): layout growth / scroll — no velocity spike, no smear
  const settle = (dt, w = 13) => (dt <= 0 ? 0 : 1 - (1 + w * dt) * Math.exp(-w * dt));

  const WPS = 3.2;          // default speech rate, words / second
  const SKEW = -0.2;        // fake oblique (≈11°) for proactive speech — the bundled Inter has no italic
  const DIM = 0.5;          // user turn strength until the reply begins
  const FEATHER = 7;        // streaming wipe feather (px)

  // ------------------------------------------------------------------ colour (tokens only, parsed once)
  function parseCol(s) {
    if (s[0] === '#') { const c = V.hexRGB(s); return [c[0], c[1], c[2], 1]; }
    const m = s.match(/[\d.]+/g).map(Number);
    return [m[0], m[1], m[2], m.length > 3 ? m[3] : 1];
  }
  const PAL = {};
  for (const k of Object.keys(V.THEMES)) {
    const th = V.THEMES[k];
    PAL[k] = { text: parseCol(th.text), muted: parseCol(th.muted), faint: parseCol(th.faint), line: parseCol(th.line), accent: parseCol(th.accent) };
  }
  const palOf = (th) => PAL[th.name] || PAL.dark;
  const mixCol = (a, b, k) => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k), lerp(a[3], b[3], k)];
  const css = (c, a = 1) => `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${+(c[3] * a).toFixed(4)})`;

  // ------------------------------------------------------------------ speech timing
  const wordsOf = (s) => String(s || '').trim().split(/\s+/).filter(Boolean);
  // Default streaming duration for a line of speech (≈3.2 words/s).
  const speechDur = (text, wps = WPS) => Math.max(0.35, wordsOf(text).length / wps);
  // Per-word reveal windows: weight = letters, plus a breath after punctuation (so it reads spoken, not typed).
  function wordTimes(words, at, dur) {
    const n = words.length, w = new Array(n), p = new Array(n);
    let tot = 0;
    for (let i = 0; i < n; i++) {
      const s = words[i];
      w[i] = Math.max(2, s.replace(/[^\p{L}\p{N}]/gu, '').length) + 1.2;
      p[i] = 0;
      if (i < n - 1) {
        if (/[.!?…]["”’']?$/.test(s)) p[i] = 5;
        else if (/[,;:]["”’']?$/.test(s) || s === '—' || /—$/.test(s)) p[i] = 2.6;
      }
      tot += w[i] + p[i];
    }
    const out = new Array(n);
    let c = 0;
    for (let i = 0; i < n; i++) {
      const s0 = at + (dur * c) / tot, seg = (dur * w[i]) / tot;
      out[i] = { s: s0, wipe: clamp(seg, 0.08, 0.22) };
      c += w[i] + p[i];
    }
    return out;
  }

  // ------------------------------------------------------------------ text layout
  // "Pretty" wrap (minimum raggedness, never more lines than a greedy wrap, no lone last word).
  // Returns lines of { s, x, w, i } (i = word index in the turn). Widths are measured with ctx.font.
  function wrapWords(ctx, words, maxW) {
    const space = ctx.measureText(' ').width;
    const n = words.length, ww = new Array(n);
    for (let i = 0; i < n; i++) ww[i] = ctx.measureText(words[i]).width;
    const LINE = 4 * maxW * maxW;          // per-line cost: dominates, so the line count stays minimal
    const best = new Array(n + 1).fill(Infinity), from = new Array(n + 1).fill(0);
    best[0] = 0;
    for (let j = 1; j <= n; j++) {
      let w = -space;
      for (let i = j - 1; i >= 0; i--) {
        w += ww[i] + space;
        if (w > maxW && i < j - 1) break;
        let c;
        if (j === n) {
          c = j - i === 1 && n > 1 ? 0.3 * maxW * maxW : 0;     // a lone last word is a widow
          if (w < maxW * 0.25 && n > 1) c += 0.05 * maxW * maxW;
        } else {
          const slack = maxW - w;
          c = slack * slack;
        }
        const v = best[i] + LINE + c;
        if (v < best[j]) { best[j] = v; from[j] = i; }
      }
    }
    const cuts = [];
    for (let j = n; j > 0; j = from[j]) cuts.push([from[j], j]);
    cuts.reverse();
    const lines = cuts.map(([i0, i1]) => {
      const line = [];
      let x = 0;
      for (let i = i0; i < i1; i++) { line.push({ s: words[i], x, w: ww[i], i }); x += ww[i] + space; }
      return line;
    });
    return { lines, space };
  }

  // ------------------------------------------------------------------ conversation
  function draw(ctx, t, o) {
    o = o || {};
    const th = V.theme(o.theme || 'dark') || V.THEMES.dark;
    const P = palOf(th);
    const card = o.rect || { x: 0, y: 0, w: 320, h: 390 };
    const ct = o.contentTop != null ? +o.contentTop : 40;     // contract: content starts 40 below the card top
    const R = { x: card.x, y: card.y + ct, w: card.w, h: card.h - ct };
    const size = +o.size || 13.5;
    const LH = +o.lineHeight || Math.round(size * 1.5);
    const padX = o.padX != null ? +o.padX : 14;
    const padTop = o.padTop != null ? +o.padTop : 4;
    const padBottom = o.padBottom != null ? +o.padBottom : 14;
    const gapTight = o.gapTight != null ? +o.gapTight : 6;   // user -> its reply
    const gapLoose = o.gapLoose != null ? +o.gapLoose : 15;  // between exchanges / around proactive
    const wps = +o.wps || WPS;
    const stopAt = o.stopAt != null && isFinite(+o.stopAt) ? +o.stopAt : null;
    const stopLabel = o.stopLabel === false ? '' : o.stopLabel != null ? String(o.stopLabel) : 'Stopped';
    const stopHard = o.stopHard === true;
    const innerW = R.w - padX * 2;
    const viewH = R.h - padTop - padBottom;
    const lightTheme = th.name !== 'dark';
    const veW = lightTheme ? 500 : 460;           // accent on cream/light needs a touch more weight
    const fUser = V.ui(size, lightTheme ? 460 : 440);
    const fVeda = V.ui(size, veW);
    const fPro = V.ui(size, lightTheme ? 450 : 430);
    const baseOff = Math.round(LH / 2 + size * 0.34);  // line-box top -> baseline
    const RULE_IN = 12;                                 // proactive text indent (rule sits at x+1)

    // stable order by time (input untouched)
    const src = Array.isArray(o.turns) ? o.turns : [];
    const turns = src.map((u, k) => ({ u, k })).sort((a, b) => (+a.u.at - +b.u.at) || (a.k - b.k)).map((e) => e.u);

    // first Veda reply after each user turn (dim -> full), honouring the kill switch
    const replyAt = new Array(turns.length).fill(Infinity);
    for (let i = 0; i < turns.length; i++) {
      if (turns[i].who !== 'user') continue;
      for (let j = i + 1; j < turns.length; j++) if (turns[j].who === 'veda') { replyAt[i] = +turns[j].at; break; }
      // a user line heard around the stop (e.g. "Stop.") is acknowledged by the stop itself
      if (stopAt != null && +turns[i].at <= stopAt + 0.25 && replyAt[i] > stopAt) replyAt[i] = Math.max(stopAt, +turns[i].at + 0.15);
    }

    // ---------------- build blocks (only what has started by t)
    const blocks = [];
    let H = 0, prevWho = null;
    ctx.save();
    // never inherit the caller's text/line state (it would change measurement and glyph placement)
    ctx.letterSpacing = '0px'; ctx.wordSpacing = '0px'; ctx.direction = 'ltr'; ctx.setLineDash([]);
    for (let i = 0; i < turns.length; i++) {
      const tu = turns[i];
      const at = +tu.at;
      if (!(t >= at)) break;
      const who = tu.who === 'veda' || tu.who === 'proactive' ? tu.who : 'user';
      const words = wordsOf(tu.text);
      if (!words.length) continue;
      const indent = who === 'proactive' ? RULE_IN : 0;
      ctx.font = who === 'user' ? fUser : who === 'veda' ? fVeda : fPro;
      const { lines, space } = wrapWords(ctx, words, innerW - indent - (who === 'proactive' ? 3 : 0));
      const b = { who, at, lines, space, indent, font: ctx.font, i };
      let hh = 0;
      if (who === 'user') {
        b.e = settle(t - at);
        hh = lines.length * LH * b.e;
        b.firstE = b.e;
      } else {
        const dur = tu.dur != null ? +tu.dur : speechDur(tu.text, wps);
        b.dur = dur; b.end = at + dur;
        b.wt = wordTimes(words, at, dur);
        // kill switch: freeze on the word being spoken when the stop lands
        b.cut = words.length;
        if (stopAt != null && stopAt >= at && stopAt < b.end) {
          let k = 0;
          for (let w = 0; w < words.length; w++) if (b.wt[w].s <= stopAt) k = w;
          b.cut = k + 1; b.stopped = true;
          if (stopHard) {
            // hard cut: keep exactly the glyphs the wipe's half-alpha point had passed at stopAt
            // (a glyph counts once that point is past its advance centre); clip at that glyph boundary
            const wk = b.wt[k], chars = Array.from(words[k]);
            const ue = smooth(prog(stopAt, wk.s, wk.s + wk.wipe));
            const reach = -1 + (ctx.measureText(words[k]).width + FEATHER + 2) * ue - FEATHER / 2;
            let n = 0, pw = 0;
            for (let c = 0; c < chars.length; c++) {
              const nw = ctx.measureText(chars.slice(0, c + 1).join('')).width;
              if ((pw + nw) / 2 > reach) break;
              n = c + 1; pw = nw;
            }
            if (n === 0 && k > 0) b.frozen = { i: k - 1, s: words[k - 1], w: ctx.measureText(words[k - 1]).width };
            else {
              if (n === 0) { n = 1; pw = ctx.measureText(chars[0]).width; }
              b.frozen = { i: k, s: chars.slice(0, n).join(''), w: pw };
            }
            // from the stop frame on, nothing after the frozen glyph exists (before it, the stream runs as usual)
            if (t >= stopAt) b.cut = b.frozen.i + 1;
          }
        }
        b.lineE = [];
        for (let li = 0; li < lines.length; li++) {
          const w0 = lines[li][0].i;
          if (w0 >= b.cut || !(t >= b.wt[w0].s)) break;
          const e = settle(t - b.wt[w0].s);
          b.lineE.push(e);
          hh += LH * e;
        }
        b.firstE = b.lineE.length ? b.lineE[0] : 0;
        if (b.stopped) {
          // the em dash goes after the frozen word; it may need its own line
          ctx.font = b.font;
          const dashW = ctx.measureText('—').width;
          const fi = b.frozen ? b.frozen.i : b.cut - 1;
          let li = 0, wi = 0;
          for (let a = 0; a < lines.length; a++) for (let c = 0; c < lines[a].length; c++) if (lines[a][c].i === fi) { li = a; wi = c; }
          const lw = lines[li][wi];
          if (b.frozen) {
            // hard cut: closed up to the frozen letter (spaced only after punctuation); may borrow a little of
            // the side padding rather than strand the dash alone on the next line
            const gap = /[\p{L}\p{N}'’"”)]$/u.test(b.frozen.s) ? 0 : space;
            const dx = lw.x + b.frozen.w + gap;
            b.dash = dx + dashW <= innerW + Math.max(0, padX - 5) ? { li, x: dx } : { li: li + 1, x: 0 };
          } else if (lw.x + lw.w + space + dashW <= innerW) b.dash = { li, x: lw.x + lw.w + space };
          else b.dash = { li: li + 1, x: 0 };
          b.lastLine = b.dash.li;
          const de = settle(t - stopAt);
          if (b.dash.li >= b.lineE.length) { b.lineE.push(de); hh += LH * de; }
          // room for the chip opens with the dash (none at all without a label)
          b.chipH = stopLabel ? 27 : 0;
          b.chipE = b.chipH ? settle(t - stopAt) : 0;
          hh += b.chipH * b.chipE;
        }
      }
      b.gap = blocks.length ? (prevWho === 'user' && who === 'veda' ? gapTight : gapLoose) : 0;
      b.h = hh;
      H += b.gap * b.firstE + hh;
      blocks.push(b);
      prevWho = who;
    }

    const anchorBottom = o.anchor === 'bottom';
    const scroll = Math.max(0, H - viewH);
    let y = R.y + padTop - scroll + (anchorBottom ? Math.max(0, viewH - H) : 0);

    ctx.beginPath(); ctx.rect(R.x, R.y, R.w, R.h); ctx.clip();
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.globalCompositeOperation = 'source-over'; ctx.filter = 'none';

    // Scroll mask: once the view has scrolled, the top MASK px of the rect fade to transparent per pixel
    // row (a vertical gradient fill on the glyphs, so it is background-independent). At rest it is off.
    const MASK = o.mask != null ? +o.mask : 24;
    const engage = MASK > 0 ? clamp(scroll / 10) : 0;
    const K = {
      t, P, LH, size, baseOff, stopAt, stopLabel, x0: R.x + padX,
      A0: ctx.globalAlpha * (o.alpha != null ? clamp(+o.alpha) : 1),
      yMin: R.y - LH, yMax: R.y + R.h + 2,
      maskAt(yy) { return engage <= 0 ? 1 : 1 - engage * (1 - Math.pow(clamp((yy - R.y) / MASK), 1.6)); },
      // fillStyle for something whose top edge is at absolute y `top`, drawn with its origin at absolute y `oy`
      fill(col, top, oy) {
        if (engage <= 0 || top >= R.y + MASK) return css(col);
        const g = ctx.createLinearGradient(0, R.y - oy, 0, R.y + MASK - oy);
        g.addColorStop(0, css(col, 1 - engage));
        g.addColorStop(0.5, css(col, 1 - engage * 0.67));
        g.addColorStop(1, css(col));
        return g;
      },
    };
    const capTop = baseOff - size * 0.8;   // line-box top -> top of capitals/ascenders

    for (const b of blocks) {
      y += b.gap * b.firstE;
      const top = y;
      if (b.who === 'user') {
        const heard = prog(t, b.at, b.at + 0.26);
        const rise = (1 - outExpo(prog(t, b.at, b.at + 0.5))) * 5;
        const full = smooth(prog(t, replyAt[b.i], replyAt[b.i] + 0.45));
        ctx.globalAlpha = K.A0 * outCubic(heard) * lerp(DIM, 1, full);
        ctx.font = b.font;
        for (let li = 0; li < b.lines.length; li++) {
          const ly = top + li * LH + rise;
          if (ly < K.yMin || ly > K.yMax) continue;
          ctx.fillStyle = K.fill(P.text, ly + capTop, 0);
          for (const w of b.lines[li]) ctx.fillText(w.s, K.x0 + w.x, ly + baseOff);
        }
      } else {
        drawStream(ctx, b, top, K, capTop);
      }
      y += b.h;
    }
    ctx.restore();
  }

  function drawStream(ctx, b, top, K, capTop) {
    const { t, P, LH, size, baseOff, stopAt, stopLabel, x0, A0 } = K;
    const pro = b.who === 'proactive';
    const F = FEATHER;
    const fz = b.stopped && b.frozen && t >= stopAt ? b.frozen : null;   // hard cut in effect
    const muteK = !b.stopped ? 0 : b.frozen ? prog(t, stopAt, stopAt + 0.03) : smooth(prog(t, stopAt, stopAt + 0.4));
    const dashA = !b.stopped ? 0 : b.frozen ? (t >= stopAt ? 1 : 0) : outCubic(prog(t, stopAt + 0.06, stopAt + 0.26));
    const col = pro ? P.muted : mixCol(P.accent, P.muted, muteK);
    const xs = x0 + b.indent;
    ctx.font = b.font;

    // proactive: thin rule, grows with the revealed lines
    if (pro) {
      let hh = 0;
      for (const e of b.lineE) hh += LH * e;
      if (hh > 1) {
        const r0 = top + 3, r1 = top + hh - 3;
        ctx.globalAlpha = A0 * smooth(b.firstE * 1.4);
        ctx.fillStyle = K.fill(P.faint, r0, 0);
        V.rr(ctx, x0 + 0.5, r0, 1.5, Math.max(0, r1 - r0), 0.75);
        ctx.fill();
      }
    }

    let caret = null;
    for (let li = 0; li < b.lineE.length && li < b.lines.length; li++) {
      const ly = top + li * LH;
      const line = b.lines[li];
      if (line[0].i >= b.cut) break;
      if (ly < K.yMin || ly > K.yMax) continue;
      const bl = ly + baseOff;
      const solid = K.fill(col, ly + capTop, bl);
      ctx.save();
      ctx.translate(xs, bl);
      if (pro) ctx.transform(1, 0, SKEW, 1, 0, 0);
      ctx.globalAlpha = A0;
      for (let c = 0; c < line.length; c++) {
        const w = line[c];
        if (w.i >= b.cut) break;
        const wt = b.wt[w.i];
        if (t < wt.s) break;
        if (fz) {
          // hard cut: everything before the frozen glyph solid, the frozen word clipped at its glyph boundary
          ctx.fillStyle = solid;
          ctx.globalAlpha = A0;
          ctx.fillText(w.i === fz.i ? fz.s : w.s, w.x, 0);
          continue;
        }
        let u = prog(t, wt.s, wt.s + wt.wipe);
        if (b.stopped) u = Math.max(u, prog(t, stopAt, stopAt + 0.08));
        const ue = smooth(u);
        if (ue >= 1) {
          ctx.fillStyle = solid;
          ctx.globalAlpha = A0;
        } else {
          // soft feathered wipe, left to right (a word mid-reveal never sits under the scroll mask in practice;
          // if it does, the mask is approximated by the line's mid alpha)
          const head = w.x - 1 + (w.w + F + 2) * ue;
          const g = ctx.createLinearGradient(head - F, 0, head, 0);
          g.addColorStop(0, css(col)); g.addColorStop(1, css(col, 0));
          ctx.fillStyle = g;
          ctx.globalAlpha = A0 * K.maskAt(bl - size * 0.35);
        }
        ctx.fillText(w.s, w.x, 0);
        // caret rides just ahead of the wipe, so nothing visible ever sits to its right
        const sx = c > 0 ? line[c - 1].x + line[c - 1].w + 2 : w.x;
        caret = { x: Math.max(sx, Math.min(w.x + w.w + 2, w.x - 1 + (w.w + F + 2) * ue)), bl };
      }
      if (b.stopped && b.dash && b.dash.li === li && dashA > 0) {
        ctx.globalAlpha = A0 * dashA;
        ctx.fillStyle = solid;
        ctx.fillText('—', b.dash.x, 0);
      }
      ctx.restore();
    }
    // the dash may sit alone on the line after the frozen word
    if (b.stopped && b.dash && dashA > 0 && (b.dash.li >= b.lines.length || b.lines[b.dash.li][0].i >= b.cut)) {
      const ly = top + b.dash.li * LH, bl = ly + baseOff;
      ctx.save();
      ctx.translate(xs, bl);
      ctx.globalAlpha = A0 * dashA;
      ctx.fillStyle = K.fill(col, ly + capTop, bl);
      ctx.fillText('—', b.dash.x, 0);
      ctx.restore();
    }

    // soft caret: thin rounded bar, breathing while she speaks, gone when the stream ends / is stopped
    if (caret) {
      const live = b.stopped ? (b.frozen ? (t >= stopAt ? 0 : 1) : 1 - prog(t, stopAt, stopAt + 0.1)) : 1 - prog(t, b.end + 0.2, b.end + 0.55);
      if (live > 0) {
        const br = 0.62 + 0.38 * (0.5 + 0.5 * Math.cos((t - b.at) * Math.PI * 2 * 1.25));
        ctx.save();
        ctx.translate(xs, caret.bl);
        if (pro) ctx.transform(1, 0, SKEW, 1, 0, 0);
        ctx.globalAlpha = A0 * K.maskAt(caret.bl - size * 0.35) * live * br * (pro ? 0.7 : 0.9);
        ctx.fillStyle = css(pro ? P.muted : P.accent);
        V.rr(ctx, caret.x, -size * 0.8, 1.6, size * 1.0, 0.8);
        ctx.fill();
        ctx.restore();
      }
    }

    // "Stopped" chip under the frozen turn
    if (b.stopped && stopLabel && b.chipE > 0) {
      const cy = top + (Math.max(b.lastLine, 0) + 1) * LH + 4;
      if (cy < K.yMax) {
        const fs = Math.max(9, size * 0.8);
        ctx.font = V.ui(fs, 560);
        const tw = ctx.measureText(stopLabel).width;
        const ch = 20, sq = 6.5, px = 8;
        const cw = px + sq + 6 + tw + px + 1;
        const e = prog(t, stopAt + 0.16, stopAt + 0.46);   // the chip pops in once its room has mostly opened
        const sc = lerp(0.86, 1, V.E.outBack(e));
        ctx.save();
        ctx.translate(x0, cy + ch / 2);
        ctx.scale(sc, sc);
        ctx.globalAlpha = A0 * K.maskAt(cy + ch / 2) * outCubic(e * 1.3);
        V.rr(ctx, 0, -ch / 2, cw, ch, ch / 2);
        ctx.fillStyle = css(P.line); ctx.fill();
        ctx.fillStyle = css(P.text, 0.78);
        V.rr(ctx, px, -sq / 2, sq, sq, 1.4); ctx.fill();
        ctx.fillStyle = css(P.muted);
        ctx.textBaseline = 'middle';
        ctx.fillText(stopLabel, px + sq + 6, 0.5);
        ctx.restore();
      }
    }
  }

  // ------------------------------------------------------------------ live log strip
  // Fixed-width digits: every digit sits centred in a cell as wide as the widest digit.
  function digitCell(ctx) {
    let m = 0;
    for (let d = 0; d < 10; d++) m = Math.max(m, ctx.measureText(String(d)).width);
    return m;
  }
  function runs(s) {
    const out = [];
    let cur = '', dig = null;
    for (const ch of s) {
      const isD = ch >= '0' && ch <= '9';
      if (dig === null || isD !== dig || isD) { if (cur) out.push({ s: cur, d: dig }); cur = ch; dig = isD; }
      else cur += ch;
    }
    if (cur) out.push({ s: cur, d: dig });
    return out;
  }
  function tabWidth(ctx, s, cell) {
    let w = 0;
    for (const r of runs(s)) w += r.d ? cell : ctx.measureText(r.s).width;
    return w;
  }
  function tabFit(ctx, s, cell, maxW) {
    if (tabWidth(ctx, s, cell) <= maxW) return s;
    const chars = Array.from(s);
    let lo = 0, hi = chars.length;
    while (lo < hi) { const m = (lo + hi + 1) >> 1; if (tabWidth(ctx, chars.slice(0, m).join('').trimEnd() + '…', cell) <= maxW) lo = m; else hi = m - 1; }
    return chars.slice(0, lo).join('').trimEnd() + '…';
  }
  function tabText(ctx, s, x, y, cell) {
    for (const r of runs(s)) {
      if (r.d) { ctx.textAlign = 'center'; ctx.fillText(r.s, x + cell / 2, y); x += cell; }
      else { ctx.textAlign = 'left'; ctx.fillText(r.s, x, y); x += ctx.measureText(r.s).width; }
    }
    ctx.textAlign = 'left';
    return x;
  }

  function drawLog(ctx, t, o) {
    o = o || {};
    const th = V.theme(o.theme || 'dark') || V.THEMES.dark;
    const P = palOf(th);
    const R = o.rect || { x: 0, y: 0, w: 320, h: 104 };
    const size = +o.size || 11;
    const padX = o.padX != null ? +o.padX : 14;
    const padY = o.padY != null ? +o.padY : 10;
    const rows = +o.rows || 5;
    const LH = +o.lineHeight || (R.h - padY * 2) / rows;
    const viewH = R.h - padY * 2;
    const innerW = R.w - padX * 2;
    const lightTheme = th.name !== 'dark';
    const fTag = V.ui(size * 0.94, lightTheme ? 620 : 580);
    const fBody = V.ui(size, lightTheme ? 460 : 430);
    const tagA = o.tagAlpha != null ? +o.tagAlpha : lightTheme ? 0.88 : 0.72;

    const src = Array.isArray(o.lines) ? o.lines : [];
    const lines = src.map((u, k) => ({ u, k })).sort((a, b) => (+a.u.at - +b.u.at) || (a.k - b.k)).map((e) => e.u);
    const shown = [];
    let H = 0;
    for (const ln of lines) {
      if (!(t >= +ln.at)) break;
      const e = outQuart(prog(t, +ln.at, +ln.at + 0.3));
      shown.push({ ln, e });
      H += LH * e;
    }
    if (!shown.length) return;
    // only lines that can still be on screen need drawing
    const scroll = Math.max(0, H - viewH);

    ctx.save();
    ctx.letterSpacing = '0px'; ctx.wordSpacing = '0px'; ctx.direction = 'ltr'; ctx.setLineDash([]);
    ctx.beginPath(); ctx.rect(R.x, R.y, R.w, R.h); ctx.clip();
    ctx.globalCompositeOperation = 'source-over'; ctx.filter = 'none';
    ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
    const A0 = ctx.globalAlpha * (o.alpha != null ? clamp(+o.alpha) : 1);
    const baseOff = Math.round(LH / 2 + size * 0.34);
    const band = padY + Math.max(2, baseOff - size * 0.74) + 1;
    ctx.font = fBody; const cellB = digitCell(ctx);
    ctx.font = fTag; const cellT = digitCell(ctx);
    let y = R.y + padY - scroll + (o.anchor === 'bottom' ? Math.max(0, viewH - H) : 0);
    for (const { ln, e } of shown) {
      const ly = y;
      y += LH * e;
      if (ly < R.y - LH || ly > R.y + R.h) continue;
      const age = t - +ln.at;
      const rise = (1 - outExpo(prog(age, 0, 0.45))) * 4;
      const fade = smooth((ly - (R.y + padY - band)) / band);
      const a = A0 * fade * outCubic(prog(age, 0, 0.22));
      if (a <= 0.002) continue;
      const bl = ly + baseOff + rise;
      const text = String(ln.text || '');
      const m = text.match(/^\s*(\[[^\]]{1,24}\])\s*/);
      let x = R.x + padX;
      if (m) {
        ctx.font = fTag;
        ctx.fillStyle = css(P.accent, tagA);
        ctx.globalAlpha = a;
        ctx.letterSpacing = (size * 0.03).toFixed(2) + 'px';
        x = tabText(ctx, m[1], x, bl, cellT) + size * 0.55;
        ctx.letterSpacing = '0px';
      }
      ctx.font = fBody;
      const body = tabFit(ctx, m ? text.slice(m[0].length) : text, cellB, R.x + padX + innerW - x);
      // fresh lines arrive at text strength and cool to muted
      const fresh = 1 - smooth(prog(age, 0.3, 1.3));
      ctx.fillStyle = css(mixCol(P.muted, P.text, fresh * 0.75));
      ctx.globalAlpha = a;
      tabText(ctx, body, x, bl, cellB);
    }
    ctx.restore();
  }

  V.components.transcript = { draw, drawLog, speechDur, wordTimes };
})();
