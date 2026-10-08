// Integration lab driver: renders lab/all.html (every component on one page) and runs its ctx probes.
//   node lab/all.mjs [--themes dark,cream] [--times 4.96] [--scene app|memory|research] [--open 1] [--marks]
//                    [--probe] [--cost] [--tag x]
// Stills -> out/lab/all-<scene>-<theme>-<t>[-tag].png. --probe prints state/clip leaks, inherited-state dependence
// and a seek-history check; --cost prints per-component ms per draw inside the composed frame.
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf('--' + n); if (i < 0) return d; const v = args[i + 1]; return v === undefined || v.startsWith('--') ? true : v; };
const themes = String(opt('themes', 'dark,cream')).split(',');
const times = String(opt('times', '4.96')).split(',').map(Number);
const scene = opt('scene', 'app');
const tag = opt('tag', '');
const OUT = path.join(ROOT, 'out', 'lab');
mkdirSync(OUT, { recursive: true });
const beatsPath = path.join(ROOT, 'audio/beats.json');
const beats = existsSync(beatsPath) ? JSON.parse(readFileSync(beatsPath, 'utf8')) : { period: 0.5, phase: 0 };

const browser = await chromium.launch({ args: ['--allow-file-access-from-files', '--force-color-profile=srgb'] });
let failed = false;
for (const theme of themes) {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.addInitScript((b) => { window.BEATS = b; }, { period: beats.period, phase: beats.phase });
  const q = new URLSearchParams({ theme, scene, open: String(opt('open', 1)), marks: opt('marks', false) ? '1' : '0' });
  await page.goto(pathToFileURL(path.join(ROOT, 'lab/all.html')).href + '?' + q);
  await page.evaluate(() => window.ready);
  for (const t of times) {
    await page.evaluate((tt) => window.seek(tt), t);
    const png = await page.screenshot({ type: 'png', clip: { x: 0, y: 0, width: 1920, height: 1080 } });
    const file = path.join(OUT, `all-${scene}-${theme}-${t}${tag ? '-' + tag : ''}.png`);
    writeFileSync(file, png);
    console.log(path.relative(ROOT, file));
    if (opt('probe', false)) {
      const leaks = await page.evaluate((tt) => window.probeLeaks(tt), t);
      for (const r of leaks) {
        const bad = r.diff.length || r.clipped || r.err;
        if (bad) failed = true;
        console.log(`  leak ${bad ? 'FAIL' : 'ok  '} ${r.name}${r.diff.length ? '  ' + r.diff.join(' | ') : ''}${r.clipped ? '  clip-leak points=' + r.clipped : ''}${r.err ? '  ERROR ' + r.err : ''}`);
      }
      const dirty = await page.evaluate((tt) => window.probeDirty(tt), t);
      for (const r of dirty) {
        if (r.deps.length) failed = true;
        console.log(`  inherit ${r.deps.length ? 'FAIL' : 'ok  '} ${r.name}${r.deps.map((d) => `\n      ${d.prop}: ${d.pixels}px (max Δ${d.maxDelta}) bbox ${d.bbox}`).join('')}`);
      }
      // seek-history independence: t directly vs t after seeking elsewhere
      const h1 = await page.evaluate((tt) => { window.seek(tt); return window.frameHash(); }, t);
      const h2 = await page.evaluate((tt) => { window.seek(tt + 3.3); window.seek(0.4); window.seek(tt); return window.frameHash(); }, t);
      if (h1 !== h2) failed = true;
      console.log(`  history ${h1 === h2 ? 'ok  ' : 'FAIL'} ${h1} ${h2}`);
    }
    if (opt('cost', false)) console.log('  cost ms/draw', JSON.stringify(await page.evaluate((tt) => window.probeCost(tt), t)));
  }
  if (errors.length) { failed = true; console.error('page errors:\n' + errors.join('\n')); }
  await page.close();
}
await browser.close();
process.exit(failed ? 1 : 0);
