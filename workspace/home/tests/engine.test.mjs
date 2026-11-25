import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHomeScene } from '../engine/index.js';
import { rngFor, sfc32, hash128 } from '../engine/core/rng.js';
import { createTweener, springAtRest, springStep } from '../engine/core/motion.js';
import { SPRING, actSpans, actsByDistance, completeFinish, mixFinish, ndcToCss, quietAt, stonesChanged, targetU, toothIndex } from '../engine/core/director.js';
import { createTimeline } from '../engine/timeline/evaluate.js';
import { SECTIONS, U_MAX, uToProgress } from '../engine/timeline/schedule.js';
import { ACTS, CHOREOGRAPHY, CONTACT_U, ROOM_INSTRUMENT, TRANSITIONS } from '../engine/choreo/choreography.mjs';
import { ANCHOR_DEFAULTS, instrumentFrame } from '../engine/acts/room/classify.js';
import { SCENE_EVENTS, homeRouteOf } from '../contract.mjs';
import { homeContent } from '../content.mjs';

const HOME = fileURLToPath(new URL('..', import.meta.url));
const METHODS = ['load', 'setProgress', 'setMode', 'setPointer', 'pick', 'focusStone', 'release', 'setSound', 'playHover', 'pause', 'resume', 'stats', 'dispose', 'on'];
const make = (options = {}) => createHomeScene({ canvas: /** @type {any} */ ({}), stones: homeContent().stones, ...options });
const timeline = createTimeline(CHOREOGRAPHY);
const read = (/** @type {string} */ path) => readFile(join(HOME, path), 'utf8');

/** Source text without comments (keeps "https://" inside strings). */
function code(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
}
/** Import specifiers in a module's source. */
function specifiers(source) {
  const found = [];
  for (const m of source.matchAll(/\bimport\s*(?:[\w$*{}\s,]+?\s*from\s*)?["']([^"']+)["']/g)) found.push(m[1]);
  for (const m of source.matchAll(/\bexport\s*(?:\*(?:\s*as\s+[\w$]+)?|\{[^}]*\})\s*from\s*["']([^"']+)["']/g)) found.push(m[1]);
  for (const m of source.matchAll(/\bimport\s*\(\s*["']([^"']+)["']\s*\)/g)) found.push(m[1]);
  return found;
}

// ================================================================ facade ===

test('facade has the full shape', () => {
  const scene = make();
  assert.deepEqual(Object.keys(scene).sort(), [...METHODS].sort());
  for (const name of METHODS) assert.equal(typeof scene[name], 'function', name);
  assert.deepEqual(SCENE_EVENTS, ['ready', 'stone:enter', 'stone:leave', 'stone:click', 'stones:screen', 'beat', 'tier', 'contextlost']);
  for (const event of SCENE_EVENTS) assert.equal(typeof scene.on(event, () => {}), 'function');
  // the console / harness handle is there but not enumerable, and empty before load
  assert.ok(!Object.keys(scene).includes('debug'));
  assert.equal(/** @type {any} */ (scene).debug, null);
});

test('facade validates its inputs', async () => {
  assert.throws(() => createHomeScene(/** @type {any} */ ({})), /canvas is required/);
  assert.throws(() => make({ mode: 'gallery' }), /unknown mode/);
  assert.throws(() => make({ quality: 'ultra' }), /unknown quality/);
  assert.throws(() => make({ assetsBase: '/home-assets' }), /assetsBase/);
  assert.throws(() => make({ debug: 'yes' }), /debug must be an object/);
  const scene = make();
  assert.throws(() => scene.on('click', () => {}), /unknown event/);
  assert.throws(() => scene.setMode('gallery'), /unknown mode/);
  assert.throws(() => scene.focusStone('nope'), /unknown stone/);
  await assert.rejects(scene.release('nope'), /unknown stone/);
});

test('facade keeps state and reports it through stats()', async () => {
  const scene = make({ mode: 'contact', quality: 'low', still: true });
  scene.setProgress(2);
  scene.setMode('story');
  scene.focusStone('about');
  scene.setSound(true);
  scene.playHover(3);
  scene.pause();
  await scene.release('daily');
  const stats = scene.stats();
  assert.equal(stats.progress, 1);
  assert.equal(stats.mode, 'story');
  assert.equal(stats.focused, 'about');
  assert.equal(stats.sound, true);
  assert.equal(stats.paused, true);
  assert.equal(stats.tier, 'low');
  assert.equal(stats.stones, 7);
  assert.equal(stats.still, true);
  assert.equal(stats.loaded, false);
  assert.equal(stats.engine, null);
  assert.equal(scene.pick(10, 10), null);
  scene.resume();
  assert.equal(scene.stats().paused, false);
  scene.setProgress(Number.NaN);
  assert.equal(scene.stats().progress, 0);
});

test('dispose is idempotent and silences the scene', async () => {
  const scene = make();
  scene.dispose();
  scene.dispose();
  assert.equal(scene.stats().disposed, true);
  scene.setProgress(0.5);
  assert.equal(scene.stats().progress, 0);
  await assert.rejects(scene.load(), /disposed/);
});

test('routes map to modes', () => {
  assert.equal(homeRouteOf('/'), 'story');
  assert.equal(homeRouteOf('/contacts/'), 'contact');
  assert.equal(homeRouteOf('/contacts'), 'contact');
  assert.equal(homeRouteOf('/contactsx/'), 'story');
});

test('rngFor is deterministic, keyed, and uniform in [0, 1)', () => {
  const a = rngFor(7, 'stone:about');
  const b = rngFor(7, 'stone:about');
  const c = rngFor(7, 'stone:projects');
  const d = rngFor(8, 'stone:about');
  const seqA = Array.from({ length: 8 }, a);
  assert.deepEqual(Array.from({ length: 8 }, b), seqA);
  assert.notDeepEqual(Array.from({ length: 8 }, c), seqA);
  assert.notDeepEqual(Array.from({ length: 8 }, d), seqA);
  const next = rngFor('seed', 'mean');
  let sum = 0;
  for (let i = 0; i < 20000; i++) {
    const x = next();
    assert.ok(x >= 0 && x < 1);
    sum += x;
  }
  assert.ok(Math.abs(sum / 20000 - 0.5) < 0.01);
  assert.deepEqual(hash128('a'), hash128('a'));
  assert.equal(sfc32(1, 2, 3, 4)(), sfc32(1, 2, 3, 4)());
});

// =========================================================== assembly ===

test('the choreography covers u from 0 to 20 with no gaps, in both viewports', () => {
  const us = [];
  for (let i = 0; i <= 20000; i++) us.push((U_MAX * i) / 20000);
  for (const tr of TRANSITIONS) us.push(tr.u[0], tr.u[0] - 1e-9, tr.u[0] + 1e-9, tr.u[1], tr.u[1] - 1e-9);
  for (let s = 0; s <= SECTIONS.length; s++) us.push(s, s - 1e-9, s + 1e-9);
  for (const vp of /** @type {const} */ (['land', 'port'])) {
    for (const u of us.filter(x => x >= 0 && x <= U_MAX)) {
      const f = timeline.evaluate(u, vp);
      assert.ok(f.acts.length === 1 || f.acts.length === 2, `${vp} u ${u}: ${f.acts.length} acts`);
      const sum = f.acts.reduce((s, a) => s + a.weight, 0);
      assert.ok(Math.abs(sum - 1) < 1e-12, `${vp} u ${u}: weights sum to ${sum}`);
      for (const a of f.acts) assert.ok(ACTS.includes(a.id), `${vp} u ${u}: unknown act ${a.id}`);
      // the section's own act is always on screen
      assert.ok(f.acts.some(a => a.id === SECTIONS[f.section].act || (f.transition && f.transition.to === SECTIONS[f.section].act)), `${vp} u ${u}`);
      for (const cam of [f.camera, f.cameraB].filter(Boolean)) {
        assert.ok([...cam.position, ...cam.target, cam.fov, cam.roll].every(Number.isFinite), `${vp} u ${u}: camera not finite`);
        assert.ok(cam.fov > 0.5 && cam.fov < 120, `${vp} u ${u}: fov ${cam.fov}`);
      }
      if (f.acts.length === 2) assert.ok(f.transition && f.cameraB, `${vp} u ${u}: two acts without a transition`);
    }
  }
  // every act is on screen somewhere, in story order
  const firstSeen = ACTS.map(id => us.find(u => timeline.evaluate(u, 'land').acts.some(a => a.id === id)));
  assert.ok(firstSeen.every(Number.isFinite), 'an act is never shown');
  assert.deepEqual([...firstSeen].sort((a, b) => a - b), firstSeen);
});

test('every act the choreography names has a module, and the stage creates each one', async () => {
  const stage = code(await read('engine/stage.js'));
  const factories = stage.match(/FACTORIES\s*=\s*Object\.freeze\(\{([^}]*)\}\)/);
  assert.ok(factories, 'stage.js lists its act factories');
  const listed = Object.fromEntries(factories[1].split(',').map(s => s.trim()).filter(Boolean).map(s => s.split(':').map(x => x.trim())));
  assert.deepEqual(Object.keys(listed).sort(), [...ACTS].sort());
  for (const id of ACTS) {
    const name = `create${id[0].toUpperCase()}${id.slice(1)}Act`;
    const file = join(HOME, 'engine/acts', `${id}.js`);
    assert.ok((await stat(file)).isFile(), `engine/acts/${id}.js`);
    const src = code(await readFile(file, 'utf8'));
    assert.match(src, new RegExp(`export function ${name}\\(`), `${id}.js exports ${name}`);
    assert.match(src, new RegExp(`id:\\s*'${id}'`), `${id}.js reports id '${id}'`);
    for (const method of ['load', 'setTier', 'resize', 'render', 'pick', 'stonesScreen', 'dispose']) {
      assert.match(src, new RegExp(`\\b${method}\\b`), `${id}.js has ${method}`);
    }
    assert.equal(listed[id], name, `stage.js creates ${id} with ${name}`);
    assert.match(stage, new RegExp(`import \\{[^}]*\\b${name}\\b[^}]*\\} from '\\./acts/${id}\\.js'`), `stage.js imports ${name}`);
  }
});

/** Param names a module reads from frame.params (through the names it binds them to). */
function paramReads(source) {
  const text = code(source).replace(/`(?:\\[\s\S]|[^`\\])*`/g, '``'); // GLSL out
  const names = new Set();
  for (const m of text.matchAll(/(?:const|let|var)\s+(\w+)\s*=\s*\(?\s*(?:frame\s*&&\s*)?frame\.params\b/g)) names.add(m[1]);
  for (const m of source.matchAll(/@param\s+\{[^}]*\}\s+(\w+)\s+frame\.params/g)) names.add(m[1]);
  const reads = new Set();
  for (const n of names) for (const m of text.matchAll(new RegExp(`(?<![\\w.])${n}\\.([a-zA-Z_]\\w*)`, 'g'))) reads.add(m[1]);
  for (const m of text.matchAll(/\b(?:frame|F)\.params\.([a-zA-Z_]\w*)/g)) reads.add(m[1]);
  for (const m of text.matchAll(/\(frame\.params \|\| \{\}\)\.([a-zA-Z_]\w*)/g)) reads.add(m[1]);
  return reads;
}

test('every param the acts and the stage read exists in the choreography', async () => {
  const files = ['engine/stage.js', ...ACTS.map(id => `engine/acts/${id}.js`), ...(await readdir(join(HOME, 'engine/acts/room'))).map(f => `engine/acts/room/${f}`)];
  const all = new Set();
  for (const file of files) {
    const reads = paramReads(await read(file));
    for (const name of reads) {
      assert.ok(timeline.params.includes(name), `${file} reads params.${name}, which the choreography does not declare`);
      all.add(name);
    }
  }
  // the scan sees what each act is known to read
  for (const name of ['draw', 'lift', 'train', 'crank', 'build', 'lights', 'screens', 'aurora', 'galaxy', 'brass', 'arms', 'stones', 'contact']) {
    assert.ok(all.has(name), `nothing reads params.${name}`);
  }
});

/** Follows relative imports from `entry`; returns every bare specifier reached, with its chain. */
async function bareImports(entry) {
  const bad = [];
  const seen = new Set();
  const visit = async (file, chain) => {
    if (seen.has(file)) return;
    seen.add(file);
    for (const spec of specifiers(code(await readFile(file, 'utf8')))) {
      if (spec.startsWith('node:')) continue;
      if (!spec.startsWith('./') && !spec.startsWith('../')) {
        bad.push([...chain, spec].join(' -> '));
        continue;
      }
      await visit(resolve(dirname(file), spec), [...chain, spec]);
    }
  };
  await visit(join(HOME, entry), [entry]);
  return bad;
}

/** Engine modules that must run in plain node (no three, no packages), transitively. */
async function pureModules() {
  const list = [];
  for (const dir of ['engine/timeline', 'engine/choreo', 'engine/core', 'engine/audio', 'engine/quality', 'engine/instrument', 'engine/acts/shared', 'engine/debug']) {
    for (const f of await readdir(join(HOME, dir))) if (/\.m?js$/.test(f)) list.push(`${dir}/${f}`);
  }
  // the three acts that take THREE from their context, and the room's pure half
  list.push('engine/acts/plate.js', 'engine/acts/gears.js', 'engine/acts/space.js', 'engine/acts/room/classify.js');
  return list;
}

test('pure engine modules import no bare specifiers, transitively', async () => {
  const list = await pureModules();
  assert.ok(list.length > 30, `${list.length} modules`);
  for (const file of list) assert.deepEqual(await bareImports(file), [], file);
  // and the facade's static graph stays package-free too
  const facade = code(await read('engine/index.js'));
  assert.ok(!specifiers(facade).some(s => !s.startsWith('.') && !s.startsWith('node:')), 'engine/index.js has a bare import');
});

test('the room act and the choreography stand the instrument in the same place', async () => {
  const at = instrumentFrame(ANCHOR_DEFAULTS.instrument);
  for (let i = 0; i < 3; i++) assert.ok(Math.abs(ROOM_INSTRUMENT.position[i] - at.position[i]) < 1e-9, `position[${i}]`);
  assert.ok(Math.abs(ROOM_INSTRUMENT.yaw - at.yaw) < 1e-9, 'yaw');
  assert.ok(Math.abs(ROOM_INSTRUMENT.scale - at.scale) < 1e-12, 'scale');
  // and the shipped manifest still says what the defaults say
  const manifest = JSON.parse(await read('public/home-assets/room/manifest.json'));
  const a = manifest.anchors.Anchor_Instrument;
  assert.deepEqual(a.position, [...ANCHOR_DEFAULTS.instrument.position]);
  assert.equal(a.height, ANCHOR_DEFAULTS.instrument.height);
  assert.equal(a.yaw, ANCHOR_DEFAULTS.instrument.yaw);
});

// ============================================================ director ===

test('the u spring: exact, no overshoot from rest, at rest on the target', () => {
  const s = { x: 0, v: 0 };
  let prev = 0;
  for (let i = 0; i < 120; i++) {
    springStep(s, 1, 1 / 60, SPRING.omega);
    assert.ok(s.x >= prev - 1e-12 && s.x <= 1 + 1e-12, `step ${i}: ${s.x}`);
    prev = s.x;
  }
  assert.ok(springAtRest(s, 1, SPRING.rest), `settled at ${s.x}`);
  // one big step equals many small ones (closed form)
  const a = { x: 0, v: 0 };
  const b = { x: 0, v: 0 };
  springStep(a, 1, 0.3, SPRING.omega);
  for (let i = 0; i < 300; i++) springStep(b, 1, 0.001, SPRING.omega);
  assert.ok(Math.abs(a.x - b.x) < 1e-9 && Math.abs(a.v - b.v) < 1e-7);
  // junk dt changes nothing
  springStep(a, 5, Number.NaN, SPRING.omega);
  assert.ok(Math.abs(a.x - b.x) < 1e-9);
});

test('director: target u, act spans, quiet zones, finish mixing, teeth, stone reports', () => {
  assert.equal(targetU('contact', 0), CONTACT_U);
  assert.equal(targetU('story', uToProgress(7.25)), 7.25);
  // acts at distance 0 are exactly the ones the timeline puts on screen
  const spans = actSpans();
  assert.deepEqual(Object.keys(spans).sort(), [...ACTS].sort());
  for (let i = 0; i <= 2000; i++) {
    const u = (U_MAX * i) / 2000;
    const on = timeline.evaluate(u, 'land').acts.map(a => a.id).sort();
    const near = actsByDistance(u).filter(a => a.dist === 0).map(a => a.id).sort();
    assert.deepEqual(near, on, `u ${u}`);
  }
  assert.deepEqual(ndcToCss([-1, -1, 1, 1], 1440, 900), [0, 0, 1440, 900]);
  assert.deepEqual(ndcToCss([0, 0, 1, 1], 100, 100), [50, 0, 100, 50]);
  const q = quietAt(5.5, 4, 'land');
  assert.ok(q && q.k === 1 && q.ndc.length === 4);
  assert.equal(quietAt(0.5, -1, 'land'), null);
  assert.ok(quietAt(19.8, -1, 'port', { land: [0, 0, 1, 1], port: [-1, 0, 1, 1] })?.k === 1);
  // the finish blends continuously and lands on each act's own wishes
  const room = { glow: { strength: 1, threshold: 0.9 }, rolloff: { knee: 0.72 }, veil: [0.003, 0.002, 0.006], vignette: 0.24 };
  const space = { glow: { threshold: 0.7 }, vignette: 0.2 };
  assert.deepEqual(mixFinish(room, space, 0), completeFinish(room));
  assert.deepEqual(mixFinish(room, space, 1), completeFinish(space));
  const half = mixFinish(room, space, 0.5);
  assert.ok(Math.abs(half.glow.threshold - 0.8) < 1e-12 && Math.abs(half.rolloff.knee - 0.86) < 1e-12);
  assert.equal(completeFinish(null).rolloff.knee, 1);
  // one tooth per twelfth of a crank turn
  assert.equal(toothIndex(0), 0);
  assert.equal(toothIndex((2 * Math.PI) / 12 + 1e-9), 1);
  assert.equal(toothIndex(-1e-9), -1);
  const s = [{ id: 'about', x: 1, y: 2, radius: 3, visible: true }];
  assert.equal(stonesChanged(null, s), true);
  assert.equal(stonesChanged(s, [{ ...s[0], x: 1.1 }]), false);
  assert.equal(stonesChanged(s, [{ ...s[0], x: 1.5 }]), true);
  assert.equal(stonesChanged(s, [{ ...s[0], visible: false }]), true);
});

test('the tweener drives the instrument hover the way gsap would', () => {
  const tw = createTweener();
  const w = { w: 0 };
  let updates = 0;
  let done = 0;
  tw.to(w, { w: 1, duration: 0.5, ease: 'power2.inOut', onUpdate: () => updates++, onComplete: () => done++ });
  assert.equal(tw.active, true);
  tw.update(0.25);
  assert.ok(Math.abs(w.w - 0.5) < 1e-12, `${w.w}`);
  tw.killTweensOf(w);
  tw.update(0.5);
  assert.ok(Math.abs(w.w - 0.5) < 1e-12 && done === 0 && !tw.active);
  tw.to(w, { w: 0, duration: 0.4 });
  tw.update(1);
  assert.equal(w.w, 0);
  assert.equal(tw.active, false);
  tw.to(w, { w: 1, duration: 0 });
  assert.equal(w.w, 1);
  tw.to(w, { w: 0, duration: 2 });
  tw.finish();
  assert.equal(w.w, 0);
  assert.ok(updates >= 1);
});

// ============================================================= harness ===

test('the engine harness runs the real facade from static files', async () => {
  const html = await read('sketches/engine/index.html');
  const map = JSON.parse(html.match(/<script type="importmap">([\s\S]*?)<\/script>/)[1]);
  assert.deepEqual(map.imports, { three: '/node_modules/three/build/three.module.js', 'three/addons/': '/node_modules/three/examples/jsm/' });
  const main = await read('sketches/engine/main.js');
  assert.match(main, /from '\/engine\/index\.js'/);
  assert.match(main, /assetsBase: '\/public\/home-assets\/'/);
  assert.match(main, /__SKETCH_READY__/);
  assert.ok((await stat(join(HOME, 'public/home-assets/room/manifest.json'))).isFile());
  // nothing the harness imports by path is missing
  for (const spec of specifiers(code(main)).filter(s => s.startsWith('/'))) {
    assert.ok((await stat(join(HOME, spec))).isFile(), spec);
  }
  // and the engine's own debug overlay stays out of the app's graph
  for (const file of ['engine/index.js', 'engine/stage.js']) assert.ok(!specifiers(code(await read(file))).some(s => s.includes('debug/')), file);
  assert.equal(relative(HOME, join(HOME, 'sketches/engine')).startsWith('..'), false);
});
