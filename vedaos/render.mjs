// VEDAOS renderer: drives window.seek(t) in headless Chromium.
//
//   node render.mjs --page films/c/index.html                    full film -> out/<name>.mp4 (+ audio if --audio)
//   node render.mjs --page films/c/index.html --still 3.2        one frame -> out/still-<t>.png
//   node render.mjs --page films/c/index.html --times 1,2,3 [--tag x]   sheet -> out/sheet-<tag>.png (+ frames)
//   node render.mjs --page films/c/index.html --contact          one frame per beat -> out/contact-<name>.png
//   node render.mjs --lab orb --opts '{"x":960,...}' --times 0,1,2 --tag idle   component lab sheet -> out/lab/orb-idle.png
//   node render.mjs ... --perf                                   report ms per seek()
// options: --workers 3 --fps 60 --duration 30 --name c --audio audio/c.wav --cols 4 --thumb 480
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { readFileSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf('--' + name);
  if (i < 0) return def;
  const v = args[i + 1];
  return v === undefined || v.startsWith('--') ? true : v;
};
const FPS = Number(opt('fps', 60));
const WORKERS = Number(opt('workers', opt('lab', false) ? 1 : 3));
const LAB = opt('lab', false);
const PAGE = LAB ? 'lab/index.html' : opt('page', 'films/c/index.html');
const NAME = opt('name', LAB ? 'lab-' + LAB : path.basename(path.dirname(PAGE)));
const OUT = path.join(ROOT, 'out', LAB ? 'lab' : '');
mkdirSync(OUT, { recursive: true });
const beatsPath = path.join(ROOT, opt('beats', 'audio/beats.json'));
const beats = existsSync(beatsPath) ? JSON.parse(readFileSync(beatsPath, 'utf8')) : { period: 0.5, phase: 0 };

async function openPages(n) {
  const browser = await chromium.launch({ args: ['--allow-file-access-from-files', '--force-color-profile=srgb'] });
  const pages = [];
  for (let i = 0; i < n; i++) {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.addInitScript((init) => {
      window.BEATS = init.beats;
      if (init.cues) window.CUES = init.cues;
      if (init.env) window.ENVELOPE = init.env;
      if (init.lab) window.LAB = init.lab;
    }, {
      beats: { period: beats.period, phase: beats.phase },
      cues: existsSync(path.join(ROOT, path.dirname(PAGE), 'cues.json')) ? JSON.parse(readFileSync(path.join(ROOT, path.dirname(PAGE), 'cues.json'), 'utf8')) : null,
      env: existsSync(path.join(ROOT, opt('envelope', 'audio/envelope.json'))) ? JSON.parse(readFileSync(path.join(ROOT, opt('envelope', 'audio/envelope.json')), 'utf8')) : null,
      lab: LAB ? { component: LAB, fn: opt('fn', 'draw'), opts: JSON.parse(opt('opts', '{}')), samples: Number(opt('samples', 6)),
        deps: opt('deps', false) ? String(opt('deps')).split(',') : [], duration: Number(opt('duration', 20)) } : null,
    });
    await page.goto(pathToFileURL(path.join(ROOT, PAGE)).href);
    await page.evaluate(() => window.ready);
    const fatal = errors.filter((e) => !/ERR_FILE_NOT_FOUND|Failed to load resource/.test(e));
    if (fatal.length) { console.error('page errors:\n' + fatal.join('\n')); process.exit(1); }
    pages.push(page);
  }
  return { browser, pages };
}
const shoot = async (page, t) => {
  await page.evaluate((tt) => window.seek(tt), t);
  return page.screenshot({ type: 'png', clip: { x: 0, y: 0, width: 1920, height: 1080 } });
};
async function renderTimes(times, onFrame) {
  const { browser, pages } = await openPages(Math.max(1, Math.min(WORKERS, times.length)));
  const results = new Map();
  let next = 0, emitted = 0;
  const flush = async () => {
    while (results.has(emitted)) { const png = results.get(emitted); results.delete(emitted); await onFrame(png, emitted); emitted++; }
  };
  await Promise.all(pages.map(async (page) => {
    while (next < times.length) { const i = next++; results.set(i, await shoot(page, times[i])); await flush(); }
  }));
  await flush();
  await browser.close();
}
function ffmpeg(argv) {
  const p = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...argv], { stdio: ['pipe', 'inherit', 'inherit'] });
  const done = new Promise((res, rej) => p.on('close', (c) => (c ? rej(new Error('ffmpeg exit ' + c)) : res())));
  return { stdin: p.stdin, done };
}
const write = (s, d) => new Promise((res) => (s.write(d) ? res() : s.once('drain', res)));
async function sheet(times, tag) {
  const dir = path.join(OUT, 'frames', `${NAME}-${tag}`);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  await renderTimes(times, async (png, i) => writeFileSync(path.join(dir, `f${String(i).padStart(3, '0')}.png`), png));
  const cols = Number(opt('cols', Math.min(times.length, 4)));
  const rows = Math.ceil(times.length / cols);
  const tw = Number(opt('thumb', times.length === 1 ? 1920 : 480)), th = Math.round(tw * 9 / 16);
  const outFile = path.join(OUT, LAB ? `${LAB}-${tag}.png` : `sheet-${NAME}-${tag}.png`);
  const ff = ffmpeg(['-framerate', '1', '-i', path.join(dir, 'f%03d.png'),
    '-vf', `scale=${tw}:${th},pad=${tw + 6}:${th + 6}:3:3:color=0x808080,tile=${cols}x${rows}`, '-frames:v', '1', outFile]);
  ff.stdin.end();
  await ff.done;
  console.log(path.relative(ROOT, outFile));
}

if (opt('perf', false)) {
  const { browser, pages } = await openPages(1);
  const ms = await pages[0].evaluate(() => {
    const out = [];
    for (let t = 0; t < (window.V && V.duration ? V.duration : 10); t += 0.37) { const a = performance.now(); window.seek(t); out.push(performance.now() - a); }
    out.sort((a, b) => a - b);
    return { median: out[out.length >> 1], p95: out[Math.floor(out.length * 0.95)], max: out[out.length - 1] };
  });
  console.log('seek() ms', JSON.stringify(ms));
  await browser.close();
} else if (opt('still', false) !== false) {
  const t = Number(opt('still'));
  await renderTimes([t], async (png) => writeFileSync(path.join(OUT, `${LAB ? LAB + '-' : 'still-' + NAME + '-'}${t}.png`), png));
  console.log(`still ${t} written`);
} else if (opt('times', false)) {
  await sheet(String(opt('times')).split(',').map(Number), opt('tag', 'x'));
} else if (opt('contact', false)) {
  const dur = Number(opt('duration', 30));
  const times = [];
  for (let n = 0; n * beats.period < dur - 1e-6; n++) times.push(Math.round((n * beats.period + beats.period / 4) * FPS) / FPS);
  process.argv.push('--cols', '8');
  await sheet(times, 'contact');
} else {
  const dur = Number(opt('duration', 30)), from = Number(opt('from', 0)), to = Number(opt('to', dur));
  const n = Math.round((to - from) * FPS);
  const times = Array.from({ length: n }, (_, i) => from + i / FPS);
  const silent = path.join(OUT, `${NAME}-video.mp4`);
  const ff = ffmpeg(['-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'png', '-i', '-',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-pix_fmt', 'yuv420p',
    '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709', '-movflags', '+faststart', silent]);
  const t0 = Date.now();
  await renderTimes(times, async (png, i) => {
    await write(ff.stdin, png);
    if (i % 60 === 0) process.stdout.write(`\rframe ${i}/${n}  ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  });
  ff.stdin.end();
  await ff.done;
  const audio = opt('audio', false);
  const final = path.join(OUT, `${NAME}.mp4`);
  if (audio) {
    const mux = ffmpeg(['-i', silent, '-ss', String(from), '-t', String(to - from), '-i', path.join(ROOT, audio),
      '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '320k', '-shortest', '-movflags', '+faststart', final]);
    mux.stdin.end(); await mux.done; rmSync(silent);
  } else {
    rmSync(final, { force: true });
    (await import('node:fs')).renameSync(silent, final);
  }
  console.log(`\n${path.relative(ROOT, final)}  (${n} frames, ${((Date.now() - t0) / 1000).toFixed(1)}s)`);
}
