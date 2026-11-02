// Quick looks during art work, on the real GPU. Not evidence: capture.mjs is the only evidence tool.
// Usage: node tools/frames.mjs <prefix> [--size 1440x900] [--clean] <shot> [<shot> ...]
// A shot is a checkpoint id, or t<seconds> for a moment on the real journey.
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire('/Users/richardzhu/game-assets/node_modules/');
const { chromium } = require('playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const prefix = args.shift();
const take = (flag, fallback) => { const i = args.indexOf(flag); return i < 0 ? fallback : args.splice(i, 2)[1]; };
const size = take('--size', '1440x900');
const dsf = Number(take('--dsf', 1));
const clean = args.includes('--clean');
const shots = args.filter(a => !a.startsWith('--'));
const [width, height] = size.split('x').map(Number);
const out = path.join(root, '_dev/tmp/frames');
await mkdir(out, { recursive: true });
process.env.TMPDIR = path.join(root, '_dev/tmp');

const browser = await chromium.launch({ headless: true, args: ['--use-angle=metal', '--ignore-gpu-blocklist', '--enable-gpu-rasterization'] });
try {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: dsf });
  page.on('pageerror', e => console.log('pageerror', e.message));
  page.on('requestfailed', r => console.log('failed', r.url()));
  page.on('console', m => { if (m.type() === 'error' || m.text().includes('THREE.WebGLProgram')) console.log(m.type(), m.text().slice(0, 900)); });
  await page.goto(`http://127.0.0.1:8101/games/xiaoyaoyou/?checkpoint=north-start${clean ? '&clean=1' : ''}`);
  await page.waitForFunction(() => window.__GAME_READY__ === true, null, { timeout: 15000 });
  await page.waitForFunction(() => window.__GAME_STATE__.settled, null, { timeout: 30000 });
  for (const shot of shots) {
    await page.evaluate(id => {
      if (/^t[\d.]+$/.test(id)) window.__GAME_DEBUG__.seek(Number(id.slice(1)));
      else window.__GAME_DEBUG__.jump(id);
    }, shot);
    await page.waitForFunction(() => window.__GAME_STATE__.settled, null, { timeout: 30000 });
    await page.waitForTimeout(240);
    const file = path.join(out, `${prefix}-${shot}.png`);
    await page.screenshot({ path: file });
    const m = await page.evaluate(() => { const r = window.__GAME_DEBUG__.measure(); const s = window.__GAME_STATS__; return { kun: r.kun, span: r.kunSpan, calls: s.drawCalls, tris: s.triangles, pillar: r['ref-pillar-1'] }; });
    console.log(shot, `kun box ${Math.round(m.kun?.widthPx ?? 0)}x${Math.round(m.kun?.heightPx ?? 0)} true ${((m.span?.widthFraction ?? 0) * 100).toFixed(0)}% x ${((m.span?.left ?? 0) * 100).toFixed(0)}-${((m.span?.right ?? 0) * 100).toFixed(0)} y ${((m.span?.top ?? 0) * 100).toFixed(0)}-${((m.span?.bottom ?? 0) * 100).toFixed(0)} inFrame=${m.kun?.inFrame} pillarH=${Math.round(m.pillar?.heightPx ?? 0)}/${m.pillar?.inFrame} calls=${m.calls} tris=${m.tris}`);
  }
} finally {
  await browser.close();
}
