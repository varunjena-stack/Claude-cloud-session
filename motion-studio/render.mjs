// Frame-accurate renderer: drives window.seek(t) in headless Chromium, pipes PNG frames to ffmpeg.
//
//   node render.mjs                       full film -> out/reel.mp4 (H.264 yuv420p CRF 16 + score)
//   node render.mjs --contact             one frame per beat -> out/contact.png
//   node render.mjs --still 3.25          single frame -> out/still-3.25.png
//   options: --workers 4  --fps 60  --from 0 --to 15
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { readFileSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(ROOT, 'out');
mkdirSync(OUT, { recursive: true });

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf('--' + name);
  return i < 0 ? def : args[i + 1] === undefined || args[i + 1].startsWith('--') ? true : args[i + 1];
};
const FPS = Number(opt('fps', 60));
const WORKERS = Number(opt('workers', 4));
const FROM = Number(opt('from', 0));
const TO = Number(opt('to', 15));
const beats = JSON.parse(readFileSync(path.join(ROOT, 'audio/beats.json'), 'utf8'));

async function openPages(n) {
  const browser = await chromium.launch({ args: ['--allow-file-access-from-files', '--force-color-profile=srgb'] });
  const pages = [];
  for (let i = 0; i < n; i++) {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
    page.on('pageerror', (e) => { console.error('page error:', e.message); process.exit(1); });
    await page.addInitScript((b) => { window.BEATS = b; }, { period: beats.period, phase: beats.phase });
    await page.goto(pathToFileURL(path.join(ROOT, 'film/index.html')).href);
    await page.evaluate(() => window.ready);
    pages.push(page);
  }
  return { browser, pages };
}

const shoot = async (page, t) => {
  await page.evaluate((tt) => window.seek(tt), t);
  return page.screenshot({ type: 'png', clip: { x: 0, y: 0, width: 1920, height: 1080 } });
};

async function renderTimes(times, onFrame) {
  const { browser, pages } = await openPages(Math.min(WORKERS, times.length));
  const results = new Map();
  let next = 0, emitted = 0;
  const flush = async () => {
    while (results.has(emitted)) {
      const png = results.get(emitted);
      results.delete(emitted);
      await onFrame(png, emitted);
      emitted++;
    }
  };
  await Promise.all(pages.map(async (page) => {
    while (next < times.length) {
      const i = next++;
      results.set(i, await shoot(page, times[i]));
      await flush();
    }
  }));
  await flush();
  await browser.close();
}

function ffmpeg(argv) {
  const p = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...argv], { stdio: ['pipe', 'inherit', 'inherit'] });
  const done = new Promise((res, rej) => p.on('close', (c) => (c ? rej(new Error('ffmpeg ' + c)) : res())));
  return { stdin: p.stdin, done };
}
const write = (stream, data) => new Promise((res) => (stream.write(data) ? res() : stream.once('drain', res)));

if (opt('still', false) !== false) {
  const t = Number(opt('still'));
  await renderTimes([t], async (png) => writeFileSync(path.join(OUT, `still-${t}.png`), png));
  console.log(`out/still-${t}.png`);
} else if (opt('times', false)) {
  const times = String(opt('times')).split(',').map(Number);
  const dir = path.join(OUT, 'contact');
  mkdirSync(dir, { recursive: true });
  await renderTimes(times, async (png, i) => writeFileSync(path.join(dir, `x${String(i).padStart(2, '0')}.png`), png));
  const ff = ffmpeg(['-framerate', '1', '-i', path.join(dir, 'x%02d.png'),
    '-vf', `scale=480:270,pad=488:278:4:4:color=0x777777,tile=${Math.min(times.length, 6)}x${Math.ceil(times.length / 6)}`,
    '-frames:v', '1', path.join(OUT, 'times.png')]);
  ff.stdin.end();
  await ff.done;
  console.log('out/times.png');
} else if (opt('contact', false)) {
  // one frame per beat, sampled 1/8 beat after the hit (where the motion reads)
  const dir = path.join(OUT, 'contact');
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const times = [];
  for (let n = 0; n < 30; n++) times.push(Math.round((n * beats.period + beats.period / 4) * FPS) / FPS);
  await renderTimes(times, async (png, i) => writeFileSync(path.join(dir, `b${String(i).padStart(2, '0')}.png`), png));
  const ff = ffmpeg(['-framerate', '1', '-i', path.join(dir, 'b%02d.png'),
    '-vf', 'scale=480:270,pad=488:278:4:4:color=0x777777,tile=6x5', '-frames:v', '1', path.join(OUT, 'contact.png')]);
  ff.stdin.end();
  await ff.done;
  console.log('out/contact.png');
} else {
  const n = Math.round((TO - FROM) * FPS);
  const times = Array.from({ length: n }, (_, i) => FROM + i / FPS);
  const silent = path.join(OUT, 'reel-video.mp4');
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
  const mux = ffmpeg(['-i', silent, '-ss', String(FROM), '-t', String(TO - FROM), '-i', path.join(ROOT, 'audio/score.wav'),
    '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '320k', '-shortest', '-movflags', '+faststart',
    path.join(OUT, 'reel.mp4')]);
  mux.stdin.end();
  await mux.done;
  rmSync(silent);
  console.log(`\nout/reel.mp4  (${n} frames in ${((Date.now() - t0) / 1000).toFixed(1)}s)`);
}
