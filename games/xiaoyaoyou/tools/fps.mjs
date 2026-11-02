// Frame pacing on the real GPU at journey points. Headless, so a guide only; Richard's own check stands.
// Usage: node tools/fps.mjs [seconds ...]
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire('/Users/richardzhu/game-assets/node_modules/');
const { chromium } = require('playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.env.TMPDIR = path.join(root, '_dev/tmp');
const points = process.argv.slice(2).map(Number);
const browser = await chromium.launch({ headless: true, args: ['--use-angle=metal', '--ignore-gpu-blocklist', '--enable-gpu-rasterization'] });
try {
  for (const [width, height, dsf] of [[1440, 900, 1], [1440, 900, 2]]) {
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: dsf });
    await page.goto('http://127.0.0.1:8101/games/xiaoyaoyou/?checkpoint=north-start');
    await page.waitForFunction(() => window.__GAME_STATE__?.settled, null, { timeout: 30000 });
    for (const seconds of points.length ? points : [2, 40, 90, 112]) {
      await page.evaluate(value => window.__GAME_DEBUG__.seek(value), seconds);
      const result = await page.evaluate(async () => {
        const times = [];
        await new Promise(resolve => { const tick = t => { times.push(t); times.length < 150 ? requestAnimationFrame(tick) : resolve(); }; requestAnimationFrame(tick); });
        const gaps = times.slice(31).map((t, i) => t - times[i + 30]).sort((a, b) => a - b);
        return { mean: gaps.reduce((a, b) => a + b, 0) / gaps.length, p95: gaps[Math.floor(gaps.length * .95)], calls: window.__GAME_STATS__.drawCalls, tris: window.__GAME_STATS__.triangles };
      });
      console.log(`${width}x${height}@${dsf} t=${seconds}: ${(1000 / result.mean).toFixed(1)} fps, p95 ${result.p95.toFixed(1)} ms, ${result.calls} calls, ${result.tris} tris`);
    }
    await page.close();
  }
} finally {
  await browser.close();
}
