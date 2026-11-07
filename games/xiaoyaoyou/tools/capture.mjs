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
const wantAutoplay = args.includes('--autoplay');
const wantReplay = args.includes('--replay');
if (![0,2,3,4,5].includes(milestone)) throw new Error('Implemented milestones are 0, 2, 3, 4 and 5.');
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
// Every capture re-runs all earlier checkpoints. north-play is the real gameplay camera.
const checkpoints = milestone>=5?['title','north-start','kun-test','north-play','north-full','end-card','north-text']:
  milestone>=3?['title','north-start','kun-test','north-play','north-full','end-card']:
  milestone===2?['title','north-start','kun-test']:['title','north-start'];
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
  await page.waitForFunction(() => window.__GAME_STATE__.settled, null, { timeout: 30000 });
  return readyMs;
}

async function holdAtBeginMoment(page) {
  // Inside the opening hold, after the first source line has started; its fade runs on the clock.
  await page.evaluate(() => window.__GAME_DEBUG__.holdAt(2300));
  await page.waitForFunction(() => window.__GAME_STATE__.gameMs >= 2300, null, { timeout: 15000 });
  await page.evaluate(() => Promise.all(document.getAnimations().map(a => a.finished)));
  await page.waitForTimeout(200);
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
// The real GPU when headless Chromium can reach it; SwiftShader remains the PLAN fallback.
let launchArgs = ['--use-angle=metal', '--ignore-gpu-blocklist'];
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
  if (!webglRenderer || /swiftshader/i.test(webglRenderer)) {
    await browser.close();
    launchArgs = [];
    webglRenderer = await launchAndProbe();
  }
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
      // A checkpoint is judged at rest: CSS fades finish before the shutter.
      await page.evaluate(() => Promise.all(document.getAnimations().map(a => a.finished)));
      if (id === 'north-text') await page.waitForTimeout(1100);
      if (id === 'north-start') await holdAtBeginMoment(page);
      const screenshot = await page.screenshot({ path: path.join(out, `${id}-${viewport}.png`), scale: 'css' });
      metrics.checkpoints[id][viewport] = await sample(page, screenshot);
      if (id === 'north-start') {
        // A real Begin and a direct checkpoint are compared at one exact simulation step.
        const sharp = require('sharp');
        const [a, b] = await Promise.all([screenshot, beginScreenshots.get(viewport)].map(image => sharp(image).removeAlpha().raw().toBuffer()));
        let difference = 0;
        for (let i = 0; i < a.length; i++) difference += Math.abs(a[i] - b[i]);
        metrics.extra.begin[viewport].meanPixelDifference = difference / a.length;
        metrics.extra.begin[viewport].matchesCheckpoint = difference / a.length < 3;
      }
      const inspect = await page.evaluate(() => window.__GAME_DEBUG__.inspect());
      metrics.threeVersion = inspect.threeVersion;
      if (id === 'north-start') metrics.extra.emptyScene = { fog: inspect.fog, objectCount: inspect.objectCount };
      if (id === 'title') {
        await page.getByRole('button', { name: 'Begin' }).click();
        await page.waitForFunction(() => window.__GAME_STATE__.beat === 'north' && window.__GAME_STATE__.settled && document.querySelector('#title-screen').hidden);
        metrics.extra.begin ??= {};
        metrics.extra.begin[viewport] = await page.evaluate(() => ({
          beat: window.__GAME_STATE__.beat, titleHidden: document.querySelector('#title-screen').hidden,
          drawCalls: window.__GAME_STATS__.drawCalls, triangles: window.__GAME_STATS__.triangles,
        }));
        // Both real Begin and a direct checkpoint must enter the same scene.
        await holdAtBeginMoment(page);
        beginScreenshots.set(viewport, await page.screenshot({ scale: 'css' }));
      }
      await page.close();
    }
  }

  if(milestone>=2) {
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

  if(milestone>=3) {
    const desktop=metrics.checkpoints['north-start'].desktop.measure, full=metrics.checkpoints['north-full'].desktop.measure;
    const narrowStart=metrics.checkpoints['north-start'].narrow.measure, narrowFull=metrics.checkpoints['north-full'].narrow.measure;
    metrics.extra.scale={
      desktop:{kunHeightChange:full.kun.heightPx/desktop.kun.heightPx-1,pillarRatio:full['ref-pillar-1'].heightPx/desktop['ref-pillar-1'].heightPx,
        pillarInFrame:[desktop['ref-pillar-1'].inFrame,full['ref-pillar-1'].inFrame]},
      narrow:{kunHeightChange:narrowFull.kun.heightPx/narrowStart.kun.heightPx-1,pillarRatio:narrowFull['ref-pillar-1'].heightPx/narrowStart['ref-pillar-1'].heightPx,
        pillarInFrame:[narrowStart['ref-pillar-1'].inFrame,narrowFull['ref-pillar-1'].inFrame]},
    };
    // Kun stays in frame across the real journey, not only at the posed checkpoints.
    metrics.extra.framing={};
    for(const [viewport,context] of Object.entries(contexts)) {
      const page=await context.newPage();watch(page);
      await page.goto(`${base}?seed=1`);
      await page.waitForFunction(()=>window.__GAME_READY__===true,null,{timeout:10000});
      metrics.extra.framing[viewport]=[];
      for(const seconds of [1,5,8,13,20,30,45,60,75,90,100,106,110]) {
        await page.evaluate(value=>window.__GAME_DEBUG__.seek(value),seconds);
        await page.waitForFunction(()=>window.__GAME_STATS__.frame>0);
        await page.waitForTimeout(150);
        const {kun,kunSpan}=await page.evaluate(()=>window.__GAME_DEBUG__.measure());
        // Judged on the model's real vertices, with room for the swim wave. The projected box is
        // kept for reference: with fins this long its corners sit well outside the fish.
        const inFrame=kunSpan.left>=0&&kunSpan.right<=1&&kunSpan.top>=.02&&kunSpan.bottom<=.98;
        metrics.extra.framing[viewport].push({seconds,inFrame,boxInFrame:kun.inFrame,span:kunSpan,widthPx:kun.widthPx,heightPx:kun.heightPx,centerX:kun.centerX,centerY:kun.centerY});
      }
      await page.close();
    }
    // Real input events; speeds come from the simulation and time from gameMs.
    const until=(page,ms)=>page.evaluate(async wait=>{const end=window.__GAME_STATE__.gameMs+wait;
      while(window.__GAME_STATE__.gameMs<end) await new Promise(requestAnimationFrame);return window.__GAME_DEBUG__.journey();},ms);
    async function inputTest(context,driver) {
      const page=await context.newPage();watch(page);
      await page.goto(`${base}?checkpoint=north-play&seed=1`);
      await waitReady(page);
      await driver.prepare?.(page);
      const idle=await until(page,3000);
      await driver.down(page);
      const held=await until(page,1000);
      const full=await until(page,1500);
      await driver.up(page);
      const after=await until(page,2000);
      const result={idleSpeed:idle.speed,heldAfter1s:held.speed,heldSpeed:full.speed,afterRelease2s:after.speed,
        holdRatio:held.speed/idle.speed,releaseRatio:after.speed/full.speed};
      const scroll=[await page.evaluate(()=>scrollY)];
      await driver.down(page);
      await until(page,200);
      scroll.push(await page.evaluate(()=>scrollY));
      await driver.up(page);
      result.touchHold=true;
      result.scrollY=Math.max(...scroll);
      const start=await page.evaluate(()=>window.__GAME_DEBUG__.journey());
      await driver.edge(page);
      const turned=await until(page,1000);
      result.headingDegrees=Math.abs(turned.heading-start.heading)*180/Math.PI;
      await driver.up(page);
      for(const type of ['pointerleave','pointercancel','blur']) {
        await driver.down(page);
        await until(page,100);
        const before=(await page.evaluate(()=>window.__GAME_DEBUG__.journey())).hold;
        await page.evaluate(name=>{
          if(name==='blur') window.dispatchEvent(new Event('blur'));
          else document.querySelector('#world').dispatchEvent(new PointerEvent(name,{bubbles:true}));
        },type);
        await until(page,100);
        const released=!(await page.evaluate(()=>window.__GAME_DEBUG__.journey())).hold;
        result[`${type}Releases`]=before&&released;
        await driver.up(page);
      }
      result.leaveReleases=result.pointerleaveReleases&&result.pointercancelReleases&&result.blurReleases;
      await page.close();
      return result;
    }
    metrics.extra.inputTest={
      desktop:await inputTest(contexts.desktop,{
        prepare:page=>page.mouse.move(720,450),
        down:page=>page.mouse.down(),up:page=>page.mouse.up(),
        edge:page=>page.mouse.move(1439,450)}),
    };
    const touchPage={};
    metrics.extra.inputTest.narrow=await inputTest(contexts.narrow,{
      prepare:async page=>{touchPage.cdp=await contexts.narrow.newCDPSession(page);},
      down:page=>touchPage.cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:195,y:422}]}),
      up:page=>touchPage.cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]}),
      edge:page=>touchPage.cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:389,y:422}]}),
    });
    metrics.extra.inputTest.narrow.touchHold=metrics.extra.inputTest.narrow.holdRatio>=3;
  }

  if(wantAutoplay) {
    const page=await contexts.desktop.newPage();watch(page);
    const startedAt=Date.now();
    await page.goto(`${base}?autoplay=1&timescale=12&seed=1`,{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>window.__GAME_READY__===true,null,{timeout:10000});
    await page.waitForFunction(()=>window.__GAME_STATE__.beat==='end',null,{timeout:120000});
    const fingerprints=[];
    const atEnd=await page.evaluate(()=>({runs:window.__GAME_DEBUG__.runs(),state:{...window.__GAME_STATE__}}));
    fingerprints.push(atEnd.state);
    if(wantReplay) {
      await page.getByRole('button',{name:'Replay'}).click();
      await page.waitForFunction(()=>window.__GAME_STATE__.beat==='north');
      metrics.extra.replayStart=await page.evaluate(()=>({...window.__GAME_STATE__}));
      await page.waitForFunction(()=>window.__GAME_STATE__.beat==='end',null,{timeout:120000});
    }
    metrics.autoplay.runs=await page.evaluate(()=>window.__GAME_DEBUG__.runs());
    metrics.extra.growth=metrics.autoplay.runs[0]?.growth;
    metrics.extra.autoplayWallMs=Date.now()-startedAt;
    await page.close();
  }

  if(milestone>=4) {
    // A 400 x 400 crop around the projected Kun, on the real journey.
    const page=await contexts.desktop.newPage();watch(page);
    await page.goto(`${base}?checkpoint=north-start&seed=1`);
    await waitReady(page);
    const box=await page.evaluate(()=>window.__GAME_DEBUG__.kunScreenBox());
    const clip={x:Math.round(Math.max(0,Math.min(1040,box.x-200))),y:Math.round(Math.max(0,Math.min(500,box.y-200))),width:400,height:400};
    await page.screenshot({path:path.join(out,'kun-closeup-desktop.png'),clip,scale:'css'});
    metrics.extra.kunCloseup={clip,center:box};
    await page.close();
  }

  if(milestone>=5) {
    const page=await contexts.desktop.newPage();watch(page);
    await page.goto(`${base}?checkpoint=north-text&seed=1`);
    await waitReady(page);
    const readLine=()=>page.evaluate(()=>{const element=document.querySelector('#line-en');return {on:window.__GAME_STATE__.translationOn,visible:!!element&&element.getClientRects().length>0&&getComputedStyle(element).opacity!=='0'};});
    const initial=await readLine();
    await page.keyboard.press('t');
    await page.waitForTimeout(700);
    const keyed=await readLine();
    await page.screenshot({path:path.join(out,'north-text-off-desktop.png'),scale:'css'});
    await page.keyboard.press('t');
    await page.waitForTimeout(100);
    await page.locator('#toggle-translation').click();
    await page.waitForTimeout(700);
    const clicked=await readLine();
    metrics.extra.toggle={key:initial.visible&&!keyed.visible,button:!clicked.visible};
    await page.close();
    metrics.extra.licenses=[];
    for(const file of ['fonts/OFL-LXGWWenKai.txt','fonts/OFL-EBGaramond.txt','vendor/three/LICENSE']) {
      await readFile(path.join(root,file)).then(()=>metrics.extra.licenses.push(file));
    }
    const subset=await readFile(path.join(root,'fonts/wenkai.woff2'));
    metrics.extra.wenkaiBytes=subset.length;
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
  metrics.extra.runtimeBytesScope = 'All unique runtime response bodies across every checkpoint and the full autoplay.';
  const assetStats = await maybeJSON(path.join(root, '_dev/build/asset-stats.json'), {});
  metrics.assets = milestone>=2?await maybeJSON(path.join(root,'_dev/build/runtime-assets.json'),{}):{};
  metrics.blender = assetStats;
  const silhouetteDir = path.join(root, '_dev/silhouette');
  for (const name of await readdir(silhouetteDir).catch(error => { if (error.code === 'ENOENT') return []; throw error; })) {
    if (name.endsWith('.json')) metrics.silhouette[name.slice(0, -5)] = await maybeJSON(path.join(silhouetteDir, name), {});
  }
  metrics.text = JSON.parse(execFileSync('/Users/richardzhu/game-assets/.venv/bin/python', [path.join(root, 'tools/check_text.py')], { encoding: 'utf8' }));
  metrics.extra.threePackage = JSON.parse(await readFile(path.join(root, 'vendor/three/VERSION.json'), 'utf8'));
  metrics.extra.blender = milestone===0?'n/a — M0 has no Blender asset':metrics.blender.kun;
  metrics.extra.iou = milestone===0?'n/a — M0 has no hero':{
    views:metrics.silhouette.kun?.views,m1Waiver:{side:.691,top:.719,commit:'2260733'},
    status:'Richard waived only the M1 numbers. Fin tuning authorized for tonight lowers both; those numbers are unwaived misses for Richard.'};
  await writeFile(path.join(out, 'console.json'), JSON.stringify(audit, null, 2) + '\n');
  await writeFile(path.join(out, 'metrics.json'), JSON.stringify(metrics, null, 2) + '\n');

  const files = [...checkpoints.flatMap(id=>[`${id}-desktop`,`${id}-narrow`]),'loading-desktop',...(milestone>=2?[...['side','top','front','three-quarter','gameplay','rear'].map(v=>`kun-view-${v}-desktop`),'kun-swim-desktop']:[]),...(milestone>=4?['kun-closeup-desktop']:[]),...(milestone>=5?['north-text-off-desktop']:[])];
  const review = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>M${milestone} evidence</title>
<style>body{margin:24px;background:#172a35;color:#efe7d6;font:18px/1.5 Georgia,serif}h1{font-size:26px}h2{font-size:20px}section{margin:32px 0}figure{margin:0}p{max-width:85ch}.pair{display:grid;grid-template-columns:1fr 1fr;gap:16px;align-items:center}.pair img{display:block;max-width:100%;max-height:650px;margin:auto}.pair figure{border:1px solid #607277;padding:8px}figcaption{font-size:15px;margin:8px}a{color:#efe7d6}@media(max-width:700px){.pair{grid-template-columns:1fr}}</style>
<h1>M${milestone} · Review evidence</h1><p>Commit ${commit} · dirty: ${dirty}<br>Every earlier checkpoint is re-captured. north-play is the real gameplay camera after the opening shot.</p>
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
  if(milestone>=2) {
    const asset=metrics.assets.kun;
    const allViews=[...Object.values(metrics.extra.kunViews),...metrics.extra.swimFrames];
    checks.kunAsset=asset?.requiredNodesSurvived&&asset.finLocalMetadata&&asset.maxTextureSize<=2048&&asset.triangles<=60000&&['EXT_meshopt_compression','EXT_texture_webp'].every(x=>asset.extensionsUsed.includes(x));
    checks.kunRequests=['/assets/kun.glb','/vendor/three/addons/libs/meshopt_decoder.module.js'].every(suffix=>audit.requests.some(r=>r.url.endsWith(suffix)&&r.status===200));
    checks.kunFraming=Object.values(metrics.checkpoints['kun-test']).every(s=>s.measure.kun.inFrame);
    checks.kunViewBudgets=allViews.every(s=>s.drawCalls<=150&&s.triangles<=300000&&s.pixelRatio<=2&&s.measure.kun.inFrame);
    checks.diffuseOnly=metrics.extra.swim.materials.every(m=>m.type==='MeshLambertMaterial');
    checks.swim=metrics.extra.swim.periodMs>=3000&&metrics.extra.swim.periodMs<=5000&&metrics.extra.swim.flukeAmpFrac>=.08&&metrics.extra.swim.flukeAmpFrac<=.15&&metrics.extra.swim.headAmpFrac<=metrics.extra.swim.flukeAmpFrac*.25&&metrics.extra.swim.sidewaysDisplacement===0;
    checks.mapping=metrics.extra.mapping.pass;
    const frozen=metrics.extra.frozenGeometry;
    const materialOnly=frozen.materialOnlyValidation, finPass=frozen.finConstantPass;
    checks.frozenGeometry=frozen.frozenGeometryIdentical&&frozen.finFlukeUVIdentical&&
      (finPass ? finPass.allUVIdentical&&finPass.swimShaderIdentical&&finPass.changedMeshes.every(name=>name.startsWith('kun_fin_')) :
       materialOnly ? materialOnly.allExportGeometryIdentical&&materialOnly.allUVIdentical&&materialOnly.swimShaderIdentical : frozen.finFlukeTexturesIdentical);
    checks.silhouetteFresh=metrics.silhouette.kun?.commit===commit&&metrics.silhouette.kun?.dirty===false;
  }
  const growth=metrics.extra.growth??[];
  const firstRun=metrics.autoplay.runs[0];
  if(milestone>=3) {
    checks.seaAsset=!!metrics.assets.sea&&metrics.assets.sea.requiredNodesSurvived&&metrics.assets.sea.extensionsUsed.includes('EXT_meshopt_compression');
    checks.growth=growth.length===7&&growth.every((v,i)=>i===0||v>growth[i-1])&&growth[6]>=10;
    checks.pacing=firstRun?.reachedEnd===true&&firstRun.totalGameMs>=90000&&firstRun.totalGameMs<=150000;
    checks.playFraming=Object.values(metrics.extra.framing).every(rows=>rows.every(row=>row.inFrame));
    checks.scaleReads=Object.values(metrics.extra.scale).every(v=>Math.abs(v.kunHeightChange)<=.35&&v.pillarRatio<=.25&&v.pillarInFrame.every(Boolean));
    checks.inputDesktop=(i=>i.holdRatio>=3&&i.releaseRatio<=.5&&i.headingDegrees>=20&&i.leaveReleases&&i.scrollY===0)(metrics.extra.inputTest.desktop);
    checks.inputNarrow=(i=>i.holdRatio>=3&&i.releaseRatio<=.5&&i.headingDegrees>=20&&i.leaveReleases&&i.touchHold&&i.scrollY===0)(metrics.extra.inputTest.narrow);
  }
  if(milestone>=4) {
    for(const id of ['north-start','north-full']) for(const view of ['desktop','narrow']) {
      const palette=metrics.checkpoints[id][view].palette;
      checks[`palette-${id}-${view}`]=palette.offPalette<=.01&&palette.redShare<=.03&&palette.meanLuma>=35&&palette.meanLuma<=110;
    }
  }
  if(milestone>=5) {
    checks.toggle=metrics.extra.toggle.key&&metrics.extra.toggle.button;
    checks.fontBudget=metrics.extra.wenkaiBytes<=400000;
    checks.licenses=metrics.extra.licenses.length===3;
    checks.replay=metrics.autoplay.runs.length===2&&metrics.autoplay.runs.every(r=>r.reachedEnd)&&metrics.extra.replayStart.motes===0&&metrics.extra.replayStart.kunScale===1;
  }
  await writeFile(path.join(out, 'checks.json'), JSON.stringify(checks, null, 2) + '\n');
  console.log(JSON.stringify({ commit, dirty, checks, readyMs: metrics.readyMs, runtimeBytes: metrics.runtimeBytes, out }, null, 2));
  if (Object.values(checks).some(pass => !pass)) process.exitCode = 1;
} finally {
  await browser?.close();
}
