# Claude — Motion Design Reel (15s)

`out/reel.mp4` — 1920×1080, 60 fps, H.264 yuv420p CRF 16, AAC 320k, −14 LUFS.
`out/contact.png` — one frame per beat (the review sheet).

| Bar | Time | Scene | Craft on show |
|---|---|---|---|
| 1 | 0–2s | **Every single frame.** Bouncing ball with squash & stretch, a frame counter riding it, words stamped on each landing; the ball leaps at the lens and swallows the frame | Squash & stretch, arcs, follow-through |
| 2 | 2–4s | **MOTION** — variable-font width/weight wave across letters and echo rows; panel drops away | Variable type (Archivo `wdth`/`wght`), stagger, overlap |
| 3 | 4–6s | **Grid** — 144 cells ripple in, a ▶ in clay, diagonal morph to circles, zoom-through into one cell | Wave timing, match cut |
| 4 | 6–8s | **Tunnel** — rings of type, a camera surge on every kick, exit aperture | Perspective, rhythm |
| 5 | 8–10s | **Easing lanes** — linear / cubic / back / elastic / bounce with onion-skin spacing charts; dots gather and bloom | Spacing made visible |
| 6 | 10–12s | **Montage** — 8 cuts on 8th notes: arc sweep, 60 FPS counter, stripes, halftone, star, TIMING, squares, SPACING | Cutting on the beat |
| 7 | 12–15s | **Resolve** — mark, wordmark, decoded subline; the ball from frame 0 lands as the full stop | Callback / bookend |

## Pipeline
```
npm i                      # playwright, fonts
npm run score              # audio/score.py -> score.wav (synthesized, -14 LUFS); audio/beats.py -> beats.json (measured grid)
npm run contact            # out/contact.png — one frame per beat
node render.mjs --still 3.25
node render.mjs --times 1.9,3.8,5.9
npm run render             # out/reel.mp4
```
- `film/film.js`: `window.seek(t)` is a pure function of time; 6-sample 180° motion blur, seeded grain (mulberry32), no timers or rAF.
- The beat grid is injected from `audio/beats.json` (120.0 BPM measured); every scene boundary is `B(n)`.
- Sync check: all 28 visual hits land within 6.7 ms of a measured onset (< ½ frame).
- Palette: ink `#141413`, ivory `#F0EEE6`, one accent clay `#D97757`. Faces: Archivo (display), JetBrains Mono (UI).
