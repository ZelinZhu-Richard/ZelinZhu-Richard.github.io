// How the gameplay camera sits relative to Kun across the real journey.
// Usage: node tools/view_angle.mjs [--size 1440x900] [--step 2]
// offTail: 0 is looking straight up the tail, 90 is broadside, 180 is head-on.
// below: degrees the camera sits under Kun. Posed shots are left out, because this is about play.
import { createRequire } from 'node:module';

const require = createRequire('/Users/richardzhu/game-assets/node_modules/');
const { chromium } = require('playwright');
const args = process.argv.slice(2);
const take = (flag, fallback) => { const i = args.indexOf(flag); return i < 0 ? fallback : args.splice(i, 2)[1]; };
const sizes = take('--size', '1440x900,390x844').split(',');
const step = Number(take('--step', 2));
const browser = await chromium.launch({ headless: true, args: ['--use-angle=metal', '--ignore-gpu-blocklist', '--enable-gpu-rasterization'] });
try {
  for (const size of sizes) {
    const [width, height] = size.split('x').map(Number);
    const page = await browser.newPage({ viewport: { width, height } });
    await page.goto('http://127.0.0.1:8101/games/xiaoyaoyou/?checkpoint=north-start');
    await page.waitForFunction(() => window.__GAME_READY__ === true, null, { timeout: 15000 });
    const rows = await page.evaluate(async step => {
      const d = window.__GAME_DEBUG__, out = [];
      d.holdAt(0);
      for (let t = 8; t < 112; t += step) {
        d.seek(t);
        // The three.js camera is posed when a frame renders, so wait for one.
        await new Promise(requestAnimationFrame);
        await new Promise(requestAnimationFrame);
        const j = d.journey(), [cx, cy, cz] = d.inspect().camera.position, [x, y, z] = j.position;
        out.push({ t, yaw: j.yaw, dx: cx - x, dy: cy - y, dz: cz - z, phase: j.phase, scale: j.scale, mote: d.measure().mote, blocked: d.measure().blocked });
      }
      return out;
    }, step);
    const angles = [], motes = [], blocked = [];
    for (const r of rows) {
      if (r.phase !== 'play') continue;
      const length = Math.hypot(r.dx, r.dy, r.dz);
      const along = (r.dx * Math.sin(r.yaw) + r.dz * Math.cos(r.yaw)) / Math.hypot(r.dx, r.dz);
      if (r.mote) motes.push(r.mote);
      if (r.blocked) blocked.push(r.t);
      angles.push({ off: 180 - Math.acos(Math.max(-1, Math.min(1, along))) * 180 / Math.PI, below: Math.asin(-r.dy / length) * 180 / Math.PI });
    }
    const sorted = key => angles.map(a => a[key]).sort((a, b) => a - b);
    const pick = (list, q) => list[Math.floor((list.length - 1) * q)];
    const off = sorted('off'), below = sorted('below');
    console.log(size, `samples ${angles.length}  offTail p10 ${pick(off, .1).toFixed(0)} p50 ${pick(off, .5).toFixed(0)} p90 ${pick(off, .9).toFixed(0)}  below p10 ${pick(below, .1).toFixed(1)} p50 ${pick(below, .5).toFixed(1)} p90 ${pick(below, .9).toFixed(1)}  share over 45: ${(off.filter(v => v > 45).length / off.length * 100).toFixed(0)}%  over 60: ${(off.filter(v => v > 60).length / off.length * 100).toFixed(0)}%`);
    console.log(`  stone in front of Kun: ${blocked.length} of ${angles.length} samples (${(blocked.length / angles.length * 100).toFixed(0)}%) at t ${blocked.join(' ')}`);
    const seen = motes.filter(m => m.inFrame);
    console.log(`  mote active in ${motes.length} samples, in frame in ${seen.length} (${(seen.length / Math.max(1, motes.length) * 100).toFixed(0)}%), first seen at ${seen.length ? Math.max(...seen.map(m => m.distance)).toFixed(1) : '-'} body lengths; ${motes.filter(m => m.distance < 6).length} samples within 6 lengths, ${motes.filter(m => m.distance < 6 && m.inFrame).length} of those in frame`);
    await page.close();
  }
} finally {
  await browser.close();
}
