import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire('/Users/richardzhu/game-assets/node_modules/');
const { chromium } = require('playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repo = path.resolve(root, '../..');
const args = process.argv.slice(2);
const milestoneIndex = args.indexOf('--milestone');
const milestone = milestoneIndex < 0 ? NaN : Number(args[milestoneIndex + 1]);
if (![0,2].includes(milestone) || args.some(arg => ['--autoplay', '--replay'].includes(arg))) {
  throw new Error('Implemented milestones are 0 and 2; no playable journey or replay exists yet.');
}
const base = 'http://127.0.0.1:8101/games/xiaoyaoyou/';
const out = path.join(root, `_dev/evidence/M${milestone}`);
const temp = path.join(root, '_dev/tmp');
await mkdir(out, { recursive: true });
await mkdir(temp, { recursive: true });
// Chromium profiles and crash files stay inside the game, including escalated runs.
process.env.TMPDIR = temp;
const git = (...argv) => execFileSync('git', argv, { cwd: repo, encoding: 'utf8' }).trim();
const commit = git('rev-parse', 'HEAD');
const dirty = git('status', '--porcelain').length > 0;
const capturedAt = new Date().toISOString();
const audit = { commit, dirty, capturedAt, entries: [], pageErrors: [], failedRequests: [], externalRequests: [], requests: [] };
const responseTasks = [];
const viewportOptions = {
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
  narrow: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true },
};
const checkpoints = milestone===2?['title','north-start','kun-test']:['title','north-start'];
const metrics = {
  generator: 'tools/capture.mjs', milestone, commit, dirty, capturedAt,
  browser: {}, readyMs: 0, threeVersion: null, checkpoints: {},
  autoplay: { runs: [] }, assets: {}, blender: {}, silhouette: {}, text: {}, runtimeBytes: 0, extra: {},
};
for (const id of checkpoints) metrics.checkpoints[id] = {};

function watch(page) {
  page.on('console', message => audit.entries.push({ type: message.type(), text: message.text() }));
  page.on('pageerror', error => audit.pageErrors.push(error.message));
  page.on('requestfailed', request => audit.failedRequests.push({ url: request.url(), error: request.failure()?.errorText }));
  page.on('request', request => {
    const url = new URL(request.url());
    // Embedded GLB images use same-origin blob URLs; those are local decodes,
    // not network egress. Origin checks still reject any foreign blob origin.
    if (url.origin !== new URL(base).origin) audit.externalRequests.push(request.url());
  });
  page.on('response', response => {
    const task = (async () => {
      let bytes = 0;
      try { bytes = (await response.body()).length; } catch { /* Aborted requests are recorded by requestfailed. */ }
      audit.requests.push({ url: response.url(), status: response.status(), bytes });
    })();
    responseTasks.push(task);
  });
}

async function waitReady(page) {
  await page.waitForFunction(() => window.__GAME_READY__ === true, null, { timeout: 10000 });
  const readyMs = await page.evaluate(() => performance.now());
  metrics.readyMs = Math.max(metrics.readyMs, readyMs);
  await page.waitForFunction(() => window.__GAME_STATE__.settled, null, { timeout: 10000 });
  return readyMs;
}

async function sample(page, screenshot) {
  return page.evaluate(async data => {
    const image = new Image();
    image.src = `data:image/png;base64,${data}`;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(image, 0, 0);
    const { data: pixels } = context.getImageData(0, 0, canvas.width, canvas.height);
    let offPalette = 0, redShare = 0, warmShare = 0, luma = 0;
    const beat = window.__GAME_STATE__.beat;
    const coldAllowed = ['title', 'test', 'north', 'breach'].includes(beat);
    const warmAllowed = ['breach', 'ascent', 'encounter', 'south', 'end'].includes(beat);
    const redAllowed = coldAllowed || warmAllowed;
    const total = pixels.length / 4;
    for (let i = 0; i < pixels.length; i += 4) {
      const r = pixels[i] / 255, g = pixels[i + 1] / 255, b = pixels[i + 2] / 255;
      luma += (0.2126 * r + 0.7152 * g + 0.0722 * b) * 255;
      const max = Math.max(r, g, b), min = Math.min(r, g, b), delta = max - min;
      if (max <= 0.25 || !delta || delta / max <= 0.35) continue;
      let hue = (max === r ? ((g - b) / delta) % 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4) * 60;
      if (hue < 0) hue += 360;
      const cold = hue >= 185 && hue <= 225;
      const red = hue >= 345 || hue <= 20;
      const warm = hue >= 260 || hue <= 55;
      if (red) redShare++;
      if (warm) warmShare++;
      if (!((coldAllowed && cold) || (redAllowed && red) || (warmAllowed && warm))) offPalette++;
    }
    const textOverflow = [];
    for (const element of document.querySelectorAll('body *')) {
      if (!element.getClientRects().length || getComputedStyle(element).visibility === 'hidden') continue;
      if (![...element.childNodes].some(node => node.nodeType === Node.TEXT_NODE && node.textContent.trim())) continue;
      const box = element.getBoundingClientRect();
      if (element.scrollWidth > element.clientWidth + 1 || element.scrollHeight > element.clientHeight + 1 ||
          box.left < -1 || box.top < -1 || box.right > innerWidth + 1 || box.bottom > innerHeight + 1) {
        textOverflow.push({ tag: element.tagName, text: element.textContent.trim(), box: box.toJSON() });
      }
    }
    return {
      ...window.__GAME_STATS__,
      palette: { offPalette: offPalette / total, redShare: redShare / total, warmShare: warmShare / total, meanLuma: luma / total },
      measure: window.__GAME_DEBUG__.measure(), textOverflow,
      state: { ...window.__GAME_STATE__ },
    };
  }, screenshot.toString('base64'));
}

async function maybeJSON(filename, fallback) {
  try { return JSON.parse(await readFile(filename, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return fallback; throw error; }
}

let browser;
let launchArgs = [];
async function launchAndProbe() {
  browser = await chromium.launch({ headless: true, args: launchArgs, env: { ...process.env, TMPDIR: temp } });
  const page = await browser.newPage();
  const renderer = await page.evaluate(() => {
    const gl = document.createElement('canvas').getContext('webgl2');
    if (!gl) return null;
    const extension = gl.getExtension('WEBGL_debug_renderer_info');
    return extension ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
  });
  await page.close();
  return renderer;
}

try {
  let webglRenderer = await launchAndProbe();
  if (!webglRenderer) {
    await browser.close();
    launchArgs = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
    webglRenderer = await launchAndProbe();
    if (!webglRenderer) throw new Error('WebGL2 unavailable, including SwiftShader fallback.');
  }
  metrics.browser = { version: browser.version(), webglRenderer, launchArgs };
  const contexts = {};
  const beginScreenshots = new Map();
  for (const [viewport, options] of Object.entries(viewportOptions)) {
    contexts[viewport] = await browser.newContext(options);
    for (const id of checkpoints) {
      const page = await contexts[viewport].newPage();
      watch(page);
      await page.goto(`${base}?checkpoint=${id}&seed=1${id==='kun-test'?'&phase=0':''}`, { waitUntil: 'domcontentloaded' });
      await waitReady(page);
      const screenshot = await page.screenshot({ path: path.join(out, `${id}-${viewport}.png`), scale: 'css' });
      metrics.checkpoints[id][viewport] = await sample(page, screenshot);
      if (id === 'north-start') {
        metrics.extra.begin[viewport].matchesCheckpoint = screenshot.equals(beginScreenshots.get(viewport));
      }
      const inspect = await page.evaluate(() => window.__GAME_DEBUG__.inspect());
      metrics.threeVersion = inspect.threeVersion;
      if (id === 'north-start') metrics.extra.emptyScene = { fog: inspect.fog, objectCount: inspect.objectCount };
      if (id === 'title') {
        await page.getByRole('button', { name: 'Begin' }).click();
        await page.waitForFunction(() => window.__GAME_STATE__.beat === 'north' && window.__GAME_STATE__.settled);
        metrics.extra.begin ??= {};
        metrics.extra.begin[viewport] = await page.evaluate(() => ({
          beat: window.__GAME_STATE__.beat, titleHidden: document.querySelector('#title-screen').hidden,
          drawCalls: window.__GAME_STATS__.drawCalls, triangles: window.__GAME_STATS__.triangles,
        }));
        // Both real Begin and a direct checkpoint must enter the same empty scene.
        beginScreenshots.set(viewport, await page.screenshot({ scale: 'css' }));
      }
      await page.close();
    }
  }

  if(milestone===2) {
    metrics.extra.kunViews={};
    for(const view of ['side','top','front','three-quarter','gameplay','rear']) {
      const page=await contexts.desktop.newPage();watch(page);
      await page.goto(`${base}?checkpoint=kun-test&seed=1&view=${view}`);
      await waitReady(page);
      const filename=`kun-view-${view}-desktop.png`;
      const shot=await page.screenshot({path:path.join(out,filename),scale:'css'});
      metrics.extra.kunViews[view]={...await sample(page,shot),...await page.evaluate(()=>window.__GAME_DEBUG__.inspect())};
      await page.close();
    }
    const sharp=require('sharp');
    const phases=[0,.25,.5,.75], images=[];
    metrics.extra.swimFrames=[];
    for(const phase of phases) {
      const page=await contexts.desktop.newPage();watch(page);
      await page.goto(`${base}?checkpoint=kun-test&seed=1&view=side&phase=${phase}`);
      await waitReady(page);
      const shot=await page.screenshot({path:path.join(out,`kun-swim-phase-${phase}.png`),scale:'css'});
      images.push({input:await sharp(shot).resize(720,450).toBuffer(),left:images.length*720,top:0});
      const inspect=await page.evaluate(()=>window.__GAME_DEBUG__.inspect());
      metrics.extra.swim??=inspect.swim;
      metrics.extra.swimFrames.push({phase,...await sample(page,shot)});
      await page.close();
    }
    await sharp({create:{width:2880,height:450,channels:3,background:'#9b9c9e'}}).composite(images).png().toFile(path.join(out,'kun-swim-desktop.png'));
    const cameraImages=[];
    for(const [i,view] of ['top','rear','three-quarter','gameplay'].entries()) cameraImages.push({
      input:await sharp(path.join(out,`kun-view-${view}-desktop.png`)).resize(720,450).toBuffer(),left:(i%2)*720,top:Math.floor(i/2)*450});
    await sharp({create:{width:1440,height:900,channels:3,background:'#172a35'}}).composite(cameraImages).png().toFile(path.join(out,'kun-camera-review.png'));
    metrics.extra.mapping=await maybeJSON(path.join(root,'_dev/build/kun-mapping.json'),{});
    metrics.extra.frozenGeometry=await maybeJSON(path.join(root,'_dev/build/kun-validation.json'),{});
  }

  const loadingPage = await contexts.desktop.newPage();
  watch(loadingPage);
  await loadingPage.route('**/vendor/three/**', async route => {
    await new Promise(resolve => setTimeout(resolve, 1500));
    await route.continue();
  });
  await loadingPage.goto(base, { waitUntil: 'domcontentloaded' });
  await loadingPage.waitForFunction(() => document.querySelector('#loading p').textContent.length > 0);
  metrics.extra.readyDuringLoading = await loadingPage.evaluate(() => window.__GAME_READY__);
  metrics.extra.loadingBar = await loadingPage.locator('progress').evaluate(element => ({
    visible: element.getClientRects().length > 0, value: element.value, max: element.max,
    width: element.getBoundingClientRect().width, height: element.getBoundingClientRect().height,
  }));
  await loadingPage.screenshot({ path: path.join(out, 'loading-desktop.png'), scale: 'css' });
  // Each import hop is intentionally delayed; readiness budget is measured on normal loads.
  await loadingPage.waitForFunction(() => window.__GAME_READY__ === true, null, { timeout: 30000 });
  metrics.extra.delayedReadyMs = await loadingPage.evaluate(() => performance.now());
  await loadingPage.close();

  // A separate fault-injection context is recorded separately from normal-load audit.
  // The injected HTTP 503 is expected and never concealed as a clean normal request.
  const faultContext = await browser.newContext(viewportOptions.desktop);
  const faultPage = await faultContext.newPage();
  const faultAudit = { console: [], pageErrors: [], responses: [] };
  faultPage.on('console', message => faultAudit.console.push({ type: message.type(), text: message.text() }));
  faultPage.on('pageerror', error => faultAudit.pageErrors.push(error.message));
  faultPage.on('response', response => faultAudit.responses.push({ url: response.url(), status: response.status() }));
  await faultPage.route('**/assets.json', route => route.fulfill({ status: 503, body: '{}' }));
  await faultPage.goto(base);
  await faultPage.locator('#load-error').waitFor({ state: 'visible' });
  const readyOnError = await faultPage.evaluate(() => window.__GAME_READY__);
  await faultPage.unroute('**/assets.json');
  await faultPage.getByRole('button', { name: 'Retry' }).click();
  await faultPage.waitForFunction(() => window.__GAME_READY__ === true);
  metrics.extra.retry = { readyOnError, readyAfterRetry: true, ...faultAudit };
  await faultContext.close();

  const debugPage = await contexts.desktop.newPage();
  watch(debugPage);
  await debugPage.goto(`${base}?checkpoint=north-start&autoplay=1&timescale=3&seed=1&view=side&phase=0.25`);
  await waitReady(debugPage);
  metrics.extra.debug = await debugPage.evaluate(async () => {
    const debug = window.__GAME_DEBUG__;
    const first = debug.inspect();
    debug.jump('north-start');
    const second = debug.inspect();
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return {
      hooks: ['start', 'jump', 'autoplay', 'setTimescale', 'measure'].every(name => typeof debug[name] === 'function'),
      ...first, deterministicSeed: first.randomSample === second.randomSample,
      gameMsFixedStep: Math.abs(window.__GAME_STATE__.gameMs / (1000 / 60) - Math.round(window.__GAME_STATE__.gameMs / (1000 / 60))) < 1e-8,
    };
  });
  await debugPage.close();

  await Promise.all(responseTasks);
  // One cold desktop checkpoint load, deduplicated by URL, is the full M0 runtime.
  // A complete journey will replace this measurement when autoplay is introduced.
  const unique = new Map();
  for (const request of audit.requests) {
    const url = new URL(request.url);
    if (request.status === 200 && url.protocol === 'http:' && !url.pathname.includes('/_dev/')) {
      unique.set(url.pathname, Math.max(unique.get(url.pathname) ?? 0, request.bytes));
    }
  }
  metrics.runtimeBytes = [...unique.values()].reduce((sum, bytes) => sum + bytes, 0);
  metrics.extra.runtimeBytesScope = 'All unique runtime response bodies across implemented checkpoints; journey autoplay starts in M3.';
  const assetStats = await maybeJSON(path.join(root, '_dev/build/asset-stats.json'), {});
  metrics.assets = milestone===2?await maybeJSON(path.join(root,'_dev/build/runtime-assets.json'),{}):{};
  metrics.blender = assetStats;
  const silhouetteDir = path.join(root, '_dev/silhouette');
  for (const name of await readdir(silhouetteDir).catch(error => { if (error.code === 'ENOENT') return []; throw error; })) {
    if (name.endsWith('.json')) metrics.silhouette[name.slice(0, -5)] = await maybeJSON(path.join(silhouetteDir, name), {});
  }
  metrics.text = JSON.parse(execFileSync('/Users/richardzhu/game-assets/.venv/bin/python', [path.join(root, 'tools/check_text.py')], { encoding: 'utf8' }));
  metrics.extra.threePackage = JSON.parse(await readFile(path.join(root, 'vendor/three/VERSION.json'), 'utf8'));
  metrics.extra.blender = milestone===0?'n/a — M0 has no Blender asset':metrics.blender.kun;
  metrics.extra.iou = milestone===0?'n/a — M0 has no hero':{side:.691,top:.719,status:'M1 approved by Richard with side/top IoU waiver; geometry frozen'};
  await writeFile(path.join(out, 'console.json'), JSON.stringify(audit, null, 2) + '\n');
  await writeFile(path.join(out, 'metrics.json'), JSON.stringify(metrics, null, 2) + '\n');

  const files = ['title-desktop', 'title-narrow', 'north-start-desktop', 'north-start-narrow', 'loading-desktop',...(milestone===2?['kun-test-desktop','kun-test-narrow',...['side','top','front','three-quarter','gameplay','rear'].map(v=>`kun-view-${v}-desktop`),'kun-swim-desktop']:[])];
  const review = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>M${milestone} evidence</title>
<style>body{margin:24px;background:#172a35;color:#efe7d6;font:18px/1.5 Georgia,serif}h1{font-size:26px}h2{font-size:20px}section{margin:32px 0}figure{margin:0}p{max-width:85ch}.pair{display:grid;grid-template-columns:1fr 1fr;gap:16px;align-items:center}.pair img{display:block;max-width:100%;max-height:650px;margin:auto}.pair figure{border:1px solid #607277;padding:8px}figcaption{font-size:15px;margin:8px}a{color:#efe7d6}@media(max-width:700px){.pair{grid-template-columns:1fr}}</style>
<h1>M${milestone} · Review evidence</h1><p>Commit ${commit} · dirty: ${dirty}<br>M0: title and north-start regression. M2: Kun test scene, diffuse-only materials, asymmetry and four swim phases. Journey gameplay begins in M3.</p>
${files.map(name => `<section><h2>${name}.png</h2><div class="pair"><figure><img src="${name.startsWith('kun-view-') && ['side','top','front'].includes(name.split('-')[2])?`../../silhouette/raw/kun-${name.split('-')[2]}-preview.png`:'../../../ref/key-north-sea.png'}"><figcaption>Reference · Blender rest preview for sheet views; north-sea key art otherwise</figcaption></figure><figure><img src="${name}.png"><figcaption>Actual browser capture · ${name}</figcaption></figure></div></section>`).join('')}
<p><a href="metrics.json">metrics.json</a> · <a href="console.json">console.json</a></p>`;
  // review.html is generated only by this tool, alongside the original PNGs.
  await writeFile(path.join(out, 'review.html'), review);
  const checks = {
    cleanCommit: !dirty,
    ready: metrics.readyMs <= 10000,
    loading: metrics.extra.readyDuringLoading === false && metrics.extra.loadingBar.visible,
    console: audit.pageErrors.length === 0 && audit.entries.every(entry => entry.type !== 'error') &&
      audit.failedRequests.length === 0 && audit.externalRequests.length === 0 && audit.requests.every(request => request.status === 200),
    vendor: audit.requests.some(request => request.url.includes('/vendor/three/') && request.status === 200),
    checkpoints: Object.values(metrics.checkpoints).every(views => Object.entries(views).every(([viewport, sample]) =>
      Number.isFinite(sample.drawCalls) && sample.drawCalls <= 150 && Number.isFinite(sample.triangles) && sample.triangles <= 300000 &&
      sample.pixelRatio === (viewport === 'desktop' ? 1 : 2) && sample.textOverflow.length === 0)),
    begin: Object.values(metrics.extra.begin).every(result => result.beat === 'north' && result.titleHidden && result.matchesCheckpoint),
    retry: !metrics.extra.retry.readyOnError && metrics.extra.retry.readyAfterRetry,
    runtimeBytes: metrics.runtimeBytes < 20000000,
    text: metrics.text.sourceExact && metrics.text.allDraft && metrics.text.sourceVerify && Object.values(metrics.text.missingGlyphs).every(chars => chars.length === 0),
    debug: metrics.extra.debug.hooks && metrics.extra.debug.deterministicSeed && metrics.extra.debug.gameMsFixedStep,
  };
  if(milestone===2) {
    const asset=metrics.assets.kun;
    const allViews=[...Object.values(metrics.extra.kunViews),...metrics.extra.swimFrames];
    checks.kunAsset=asset?.requiredNodesSurvived&&asset.finLocalMetadata&&asset.maxTextureSize<=2048&&asset.triangles<=60000&&['EXT_meshopt_compression','EXT_texture_webp'].every(x=>asset.extensionsUsed.includes(x));
    checks.kunRequests=['/assets/kun.glb','/vendor/three/addons/libs/meshopt_decoder.module.js'].every(suffix=>audit.requests.some(r=>r.url.endsWith(suffix)&&r.status===200));
    checks.kunFraming=Object.values(metrics.checkpoints['kun-test']).every(s=>s.measure.kun.inFrame);
    checks.kunViewBudgets=allViews.every(s=>s.drawCalls<=150&&s.triangles<=300000&&s.pixelRatio<=2&&s.measure.kun.inFrame);
    checks.diffuseOnly=metrics.extra.swim.materials.every(m=>m.type==='MeshLambertMaterial');
    checks.swim=metrics.extra.swim.periodMs>=3000&&metrics.extra.swim.periodMs<=5000&&metrics.extra.swim.flukeAmpFrac>=.08&&metrics.extra.swim.flukeAmpFrac<=.15&&metrics.extra.swim.headAmpFrac<=metrics.extra.swim.flukeAmpFrac*.25&&metrics.extra.swim.sidewaysDisplacement===0;
    checks.mapping=metrics.extra.mapping.pass;
    checks.frozenGeometry=metrics.extra.frozenGeometry.frozenGeometryIdentical&&metrics.extra.frozenGeometry.finFlukeUVIdentical&&metrics.extra.frozenGeometry.finFlukeTexturesIdentical;
  }
  await writeFile(path.join(out, 'checks.json'), JSON.stringify(checks, null, 2) + '\n');
  console.log(JSON.stringify({ commit, dirty, checks, readyMs: metrics.readyMs, runtimeBytes: metrics.runtimeBytes, out }, null, 2));
  if (Object.values(checks).some(pass => !pass)) process.exitCode = 1;
} finally {
  await browser?.close();
}
