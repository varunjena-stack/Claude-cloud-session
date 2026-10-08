# VEDAOS film components — the contract

Two films are being built from these components:
- **Film C** (30s, 120 BPM energy montage): "Hey Veda" hook → orb ignites → six orb states → six feature slams
  (TALKS · REMEMBERS · RESEARCHES · MASTERS · DELEGATES · STOPS) → theme flip light/cream/dark → cream end card.
  Feature slams are **~1.5s each**: the camera pushes into the recreated app UI (or a full-frame explainer).
- **Film A** (70s narrative): the same components at slower pace (pillars of 8–10s).

So every component must read instantly at a glance (1.5s) AND hold up when it plays for 9s.

## Rules (non-negotiable)
1. **Pure function of time.** `draw(ctx, t, o)` paints the component at local time `t` (seconds; may be negative
   → draw the "before" state or nothing). No `Math.random`, no `Date`, no `performance.now`, no timers, no rAF,
   no module-level state mutated during draw. Seeded randomness only: `V.rng(seed)` / `V.hash(i,j,k)` / `V.noise1`.
   Precompute static data (particle positions, sprites) once at script load — deterministic.
2. **Register** as `V.components.<name> = { draw(ctx, t, o), ...helpers }` in `lib/components/<name>.js`
   (classic script, no imports/exports; wrap in an IIFE). Do not edit `lib/core.js` or other components; if you
   need a helper, define it inside your file.
3. **Leave ctx as you found it**: `ctx.save()`/`ctx.restore()` around everything; reset `globalCompositeOperation`,
   `globalAlpha`, `filter`, `textAlign`, `textBaseline` if you change them. Draw relative to the current transform —
   the film may have translated/scaled the context (camera moves).
4. **Theme-aware**: `o.theme` is `'dark' | 'cream' | 'light'` (default `'dark'`); get tokens with `V.theme(o.theme)`.
   Colours ONLY from theme tokens (bg, text, muted, faint, line, glass, glassHi, accent, orb, success, fail, shadow).
   **One accent: terracotta `#d8895a`.** Sage `success` and brick `fail` only for their semantic meaning.
5. **Look**: flat backgrounds, no grain, no dot/grid textures (both rejected by the product owner), no glow on UI
   chrome (the orb's own glow/bloom is fine — it is the product's look). Calm, warm, premium, generous spacing.
   Banned: everything-fades-in sameness, generic particle bursts, corner labels, frame borders.
6. **Type**: display face `V.display(px, wght)` (Fraunces variable) for big statements; UI face `V.ui(px, wght)`
   (Inter variable) for all UI text. Nothing else. The bundled fonts have **no arrow/check/▶ glyphs** — use
   `V.icon.check/arrow/sun/sunset/moon` or draw paths. Ellipsis "…", "—", "·", "×", curly quotes are available.
7. **Performance**: `node render.mjs --lab <name> --opts '<json>' --perf` reports ms per `seek()` (= 6 motion-blur
   samples of your draw). Budget: UI components ≤ 45 ms/seek, orb ≤ 90 ms/seek.
8. **Honesty**: only depict what the product really does (spec below). Illustrative explainer graphics are fine;
   don't invent UI screens the product doesn't have and present them as UI.

## Helpers in core (`lib/core.js`)
`V.W/H/FPS`, `V.THEMES`, `V.theme()`, `V.rgba(rgb,a)`, `V.hexRGB`, `V.mixHex`, `V.clamp/lerp/prog`, `V.E.*` easings
(outExpo, inOutCubic, outBack, outElastic, …), `V.spring(t,freq,damp)`, `V.rng(seed)`, `V.hash`, `V.noise1`,
`V.display(px,w)`, `V.ui(px,w)`, `V.text(ctx,s,x,y,font,color,align,base)`, `V.wrap(ctx,s,maxW,font)`,
`V.rr(ctx,x,y,w,h,r)`, `V.glass(ctx,x,y,w,h,r,theme,alpha)`, `V.halo(ctx,cx,cy,r,theme,k)`, `V.icon.*`.

## Lab — look at your work
```
node render.mjs --lab <name> --opts '{"theme":"dark", ...}' --times 0,0.5,1,1.5 --tag demo   # -> out/lab/<name>-demo.png (sheet)
node render.mjs --lab <name> --opts '{...}' --still 1.2                                        # -> out/lab/<name>-1.2.png (full-res)
node render.mjs --lab <name> --opts '{...}' --perf
node render.mjs --lab <name> --deps orb --opts '{...}' --still 1                               # also load another component first
```
Then **Read the PNG and look at it** like a senior motion designer. Iterate until it is genuinely premium.
Use `--workers 1` (the default for lab) — other agents share 4 CPUs.

## Two families
- **UI components** draw in **window units**: the recreated app window is **1180×620**; the film scales it
  (typically ×1.5) and pushes the camera in. Text sizes are app-real (body ≈13.5px, meta ≈11px, headers ≈12px caps
  tracking) — they get scaled up by the camera, so they must be crisp and well-laid-out at native size.
  Members: `shell`, `transcript`, `prajna`, `organs`, and `orb` (scale-free: takes x, y, radius in px).
- **Explainer graphics** draw full-frame in **1920×1080 film space** in the film's own graphic language
  (Fraunces statements + Inter labels, big and legible on a phone: nothing under 26px). Members: `memory`, `research`.

---

## Product facts (from the VEDA working document — the source of truth)

**Palette** (S96, verified live): bg dark `#241d19`, cream `#f2ead9`, light `#faf3e8`; accent `#d8895a` identical in
all three themes; deeper terracotta `#bd6a3c` for the orb on light/cream; success sage `#8ba86b`; fail brick `#b4503c`.
Glass: `backdrop-filter: blur(12px)` + low-opacity tinted bg + hairline `--glass-line` border (cream glass computed as
`rgba(233,223,201,0.55)`). A soft centre radial accent halo behind the orb (strength ~0.05–0.09), flat everything else.

**Orb** (S96): Three.js `BufferGeometry` point cloud, **5,200 points**, `PointsMaterial` + generated radial-gradient
sprite. ~42% of points fill the interior biased toward the centre (a pure surface shell read as dust, not an orb).
Glow-dense so it reads as a glowing sphere at rest. Dark theme: `AdditiveBlending` (that's what makes the glow). Light
and cream: `NormalBlending`, deeper terracotta `#bd6a3c`, opacity floor (additive washes out to white on light bgs).
A CSS `#orb-glow` bloom behind it, driven by state brightness + live audio level. Six states, all parameters eased
so state changes glide (radius / speed / brightness / point size / turbulence):
- `idle` — largest radius, slowest motion, lowest brightness
- `listening` — slightly tighter, a bit faster and brighter than idle
- `thinking` — tightest radius, highest density, slow steady pulse
- `speaking` — driven by a real RMS envelope of the voice output (loud lines animate more; fixed reference, not
  normalised per utterance)
- `researching` — widest radius, most surface turbulence, orbital drift
- `focus` — (wake-word lock) calm/dim/compact — define tastefully

**Window & layout** (S96/S98): frameless, transparent, always-on-top panel, **1180×620**. Topbar **52px**, flat (no
metallic band, no hard edge): state dot + "Veda" + FOCUS MODE + theme pill + SETTINGS + session timer + minimise "—".
Theme pill = segmented pill of 3 always-visible icon buttons (sun / sunset / moon); the active one gets a filled
`--accent` circle, inactive ones sit at `--text-muted`. Body = **log · orb · (queue + prajna)** with **18px gutters**.
Left column: the **Conversation** card (rolling transcript) with a **104px** monospace-style live-log strip under it.
Centre: the orb. Right column: **Task Queue** card + **Prajna** card. A thin muted bottom strip survives.
Settings has Humor/Directness sliders (not needed in the film).

**Conversation view** (S98): user turns in plain body text, Veda's replies in `--accent`, proactive speech muted +
italic behind a rule. The user turn appears the INSTANT it's heard, **dimmed until the reply lands**. Capped at 20
exchanges, newest at the bottom. Live log strip: newest-at-bottom, e.g. `[PRAJNA]`/`[CRAWLER]` lines.

**Kill switch**: "Stop" / "Stop Veda" cancels TTS + workflow immediately (verified live).

**Task queue / job board** (S67/S90): list keyed by lane strings (e.g. `PRAJNA`, `MISSION`, `RESEARCH`); tasks are
added / completed / failed.

**Organ dots** (S90, recoloured S96): background agent missions shown as pulsing/budding dots in `--accent` around the
orb on an arc (`organPosition()` arc math), **max 5 visible + an overflow badge**; on success the dot **merges** (sage
`#8ba86b`), on failure it turns muted brick `#b4503c`; reflow when dots leave.

**Prajna (Mastery Mode)** (S40–S74): a Temporal workflow that builds a **12-node curriculum** (foundational →
advanced) for a subject, researches each node, self-tests with competency questions, and scores
`mastery = coverage × depth × saturation × competency`; a node re-runs if its score < **0.85**. Live run verified on
Bitcoin (12 nodes). UI: idle = a **65px card**; a live run grows it to **343px** showing the curriculum + live
**blackboard cards** (`RESEARCH` / `EMBED` / `VERIFY` card types).

**Research Panther** (S38–S44, verified on an 18-minute live run): planning phase (sub-questions per cycle) →
insight-driven cycles with gap-adaptive query generation → parallel URL fetching → a **gap critic** that can trigger
**bonus cycles** → embedding saturation monitor (`Cycle N saturation: 0.XX`) → **final synthesis** with a spoken summary.

**Memory** (S8/S99/S100, verified): tiered retrieval across four tiers — curated memory (MEMORY.md/USER.md),
Mem0 personal memory, ChromaDB vectors, and a Graphiti knowledge graph. The graph tier's point is **cross-domain
neighbourhood expansion**, proven live: two facts sharing only one entity with zero topical overlap (a contract-law
fact and a rock-climbing-meetup fact) were connected through that entity. Memory stays on the user's Mac.

## Shared window layout (window units, all UI components agree on these numbers)
Window 1180×620, corner radius 16. Topbar y 0–52. Bottom strip y 594–620. Gutters 18.
- Left column x 18–338 (w 320): **Conversation** card y 70–460 (h 390); **log strip** y 472–576 (h 104).
- Centre x 356–844 (w 488): orb centre (600, 323), orb radius ≈ 150 (halo behind it).
- Right column x 862–1162 (w 300): **Prajna** card bottom-anchored: y = 576 − prajnaH, h = prajnaH (65 idle → 343
  running); **Task Queue** card y 70 → (prajna.y − 12).
Card headers (drawn by `shell`): 12px Inter caps, letter-spaced, `muted`, 14px inset; content area starts 40px below the
card top. Components that fill a card (`transcript`, `prajna`) receive the card rect and draw their own content inside it
(prajna also draws its own header because it changes with state).
Lab camera to inspect window-unit components: add `"_view":{"x":0,"y":0,"s":1.6}` to `--opts`.
