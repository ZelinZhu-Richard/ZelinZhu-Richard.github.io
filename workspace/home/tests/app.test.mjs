// The Vue app, checked at source level: zero dependencies, no Nuxt, no browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { listFiles } from '../stamp.mjs';
import { homeContent } from '../content.mjs';
import { PARTS } from '../../stones/parts.mjs';
import { HOME_ASSETS_BASE, HOME_ATTRS, HOME_EVENTS, HOME_GLOBAL, SCENE_EVENTS } from '../contract.mjs';
import { CHAPTER_LAYOUT, SECTION_IDS, buildSchedule, fallbackSchedule, linearSchedule, sectionWindows, storySections, windowCentre, windowOpacity, windowPhase } from '../app/utils/sections.js';
import { normaliseScreen, placeLabels, stoneItems } from '../app/utils/stones.js';
import { parseFlags } from '../app/utils/flags.js';

const HOME = fileURLToPath(new URL('..', import.meta.url));
const ENGINE_SCHEDULE = join(HOME, 'engine/timeline/schedule.js');
const content = homeContent();
const read = file => readFile(join(HOME, file), 'utf8');

/** Every .vue / .js file under app/, as { file, text }. */
async function appSources() {
  const files = (await listFiles(join(HOME, 'app'))).filter(file => /\.(?:m?js|vue)$/.test(file));
  return Promise.all(files.map(async file => ({ file: `app/${file}`, text: await read(`app/${file}`) })));
}

/** Script without comments (keeps "https://" inside strings). For .vue, only <script>. */
function code(text, file) {
  const script = file.endsWith('.vue') ? [...text.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n') : text;
  return script.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
}

/** The <template> of a .vue file. */
const template = text => text.match(/<template>([\s\S]*)<\/template>\s*$/)?.[1] || '';

const exists = path => access(path).then(() => true, () => false);

// ---- schedule and story blocks ----------------------------------------------------------

test('every section of the fallback schedule has a story block', () => {
  const schedule = fallbackSchedule();
  assert.equal(schedule.count, 20);
  assert.deepEqual(schedule.ids, [...SECTION_IDS]);
  const sections = storySections(content, schedule);
  assert.deepEqual(sections.map(section => section.id), [...SECTION_IDS]);
  assert.ok(sections.every(section => section.kind !== 'missing'), 'a section has no block');
  assert.deepEqual(sections.map(section => section.kind), [
    'hero',
    'text', 'text', 'text', 'word', 'word', 'word', 'word', 'text', 'text', 'text', 'text', 'text',
    'card', 'card', 'card', 'card',
    'text',
    'stones', 'coda',
  ]);
  for (const section of sections) {
    assert.ok(section.len >= 100, `${section.id} is shorter than one viewport`);
    if (section.chapter) assert.equal(section.chapter, section.id);
  }
  assert.ok(sections.at(-1).last && sections.slice(0, -1).every(section => !section.last));
  for (const id of ['c13', 'c14', 'c15', 'c16']) assert.match(CHAPTER_LAYOUT[id].align, /^(?:left|right)$/);
});

test('the engine schedule, when it exists, is read and matches the story blocks', async t => {
  if (!(await exists(ENGINE_SCHEDULE))) {
    t.diagnostic('engine/timeline/schedule.js does not exist yet: the app uses the fallback table');
    return;
  }
  const mod = await import(pathToFileURL(ENGINE_SCHEDULE).href);
  const schedule = buildSchedule(mod);
  assert.equal(schedule.source, 'engine', 'app/utils/sections.js cannot read engine/timeline/schedule.js; teach sectionList() its shape');
  assert.equal(schedule.count, 20);
  const sections = storySections(content, schedule);
  assert.ok(sections.every(section => section.kind !== 'missing'), 'a schedule section has no story block');
  for (const u of [0, 0.5, 3.25, 9.9, 18, 19.5, 20]) assert.ok(Math.abs(schedule.progressToU(schedule.uToProgress(u)) - u) < 1e-3, `u=${u}`);
  for (let u = 0; u <= 20; u += 0.173) assert.ok(Math.abs(schedule.progressToU(u / 20) - mod.progressToU(u / 20)) < 1e-9, 'the page and the engine agree on u');
  if (Array.isArray(mod.SECTIONS)) mod.SECTIONS.forEach((section, i) => assert.ok(Math.abs(schedule.lengths[i] - section.vh) < 1e-2, `${section.id} length`));
  if (Array.isArray(mod.BEAT_WINDOWS)) {
    for (const beat of mod.BEAT_WINDOWS) {
      const { u0, in1, out0, u1 } = schedule.windows[beat.section];
      assert.deepEqual({ u0, in1, out0, u1 }, { u0: beat.u0, in1: beat.in1, out0: beat.out0, u1: beat.u1 }, `section ${beat.section} uses the engine's beat window`);
    }
  }
});

test('section windows: text fades in, holds, fades out, and frames never overlap fully', () => {
  const schedule = fallbackSchedule();
  const { windows } = schedule;
  assert.equal(windows.length, 20);
  assert.equal(windowOpacity(windows[0], 0), 1, 'the hero is up at the very top');
  assert.equal(windowOpacity(windows[19], 20), 1, 'the coda stays up at the very end');
  for (let i = 1; i < 19; i++) {
    const win = windows[i];
    assert.ok(i < win.u0 && win.u0 < win.in1 && win.in1 < win.out0 && win.out0 < win.u1 && win.u1 < i + 1, `window ${i} sits inside its section`);
    assert.equal(windowOpacity(win, i), 0);
    assert.equal(windowOpacity(win, (win.in1 + win.out0) / 2), 1);
    assert.ok(windowOpacity(win, (win.u0 + win.in1) / 2) > 0 && windowOpacity(win, (win.u0 + win.in1) / 2) < 1);
    assert.deepEqual(windowPhase(win, win.u0), { enter: 0, leave: 1 });
    assert.deepEqual(windowPhase(win, win.u1), { enter: 1, leave: 0 });
    const centre = windowCentre(win, i);
    assert.equal(windowOpacity(win, centre), 1, `centre of ${i}`);
  }
  for (let u = 0; u <= 20; u += 0.01) {
    const up = windows.filter(win => windowOpacity(win, u) > 0);
    assert.ok(up.length <= 1, `u=${u.toFixed(2)}: ${up.length} frames up at once`);
  }
  const engineLike = sectionWindows([100, 200, 100], [{ section: 1, u0: 1.1, in1: 1.2, out0: 1.8, u1: 1.9 }, { section: 2, u0: Number.NaN, in1: 0, out0: 0, u1: 0 }]);
  assert.deepEqual(engineLike[1], { u0: 1.1, in1: 1.2, out0: 1.8, u1: 1.9 });
  assert.equal(engineLike[2].u1, Number.POSITIVE_INFINITY, 'a bad beat window falls back');
});

test('index.vue renders a block for every kind, and schedule.js reads the engine file', async () => {
  const page = template(await read('app/pages/index.vue'));
  for (const name of ['StoryHero', 'StoryStones', 'StoryCoda', 'StoryBeat']) assert.ok(page.includes(`<${name} `), name);
  for (const kind of ['hero', 'stones', 'coda']) assert.ok(page.includes(`section.kind === '${kind}'`), kind);
  const beat = template(await read('app/components/StoryBeat.vue'));
  for (const kind of ['card', 'word', 'text']) assert.ok(beat.includes(`section.kind === '${kind}'`), kind);
  assert.match(await read('app/utils/schedule.js'), /import\.meta\.glob\('\.\.\/\.\.\/engine\/timeline\/schedule\.js', \{ eager: true \}\)/);
  const section = await read('app/components/StorySection.vue');
  assert.ok(section.includes(':id="section.id"') && section.includes("'--len': section.len") && section.includes(':data-index="section.index"'));
  assert.ok(page.includes(":class=\"{ 'is-staged': storyState.staged }\""), 'index.vue stages the story from storyState');
});

test('schedules map progress to section units both ways', () => {
  const lengths = [100, 300, 100];
  const schedule = linearSchedule(['a', 'b', 'c'], lengths);
  assert.equal(schedule.total, 500);
  assert.equal(schedule.progressToU(0), 0);
  assert.equal(schedule.progressToU(0.2), 1);
  assert.equal(schedule.progressToU(0.5), 1.5);
  assert.equal(schedule.progressToU(1), 3);
  assert.equal(schedule.progressToU(Number.NaN), 0);
  assert.equal(schedule.uToProgress(2.5), 0.9);
  assert.equal(schedule.uToProgress(99), 1);
  const fallback = fallbackSchedule();
  for (let u = 0; u <= 20; u += 0.37) assert.ok(Math.abs(fallback.progressToU(fallback.uToProgress(u)) - u) < 1e-9);

  // An engine module with only progressToU: lengths come from the function.
  const engine = linearSchedule([...SECTION_IDS], SECTION_IDS.map((_, i) => 100 + 10 * (i % 3)), 'engine');
  const derived = buildSchedule({ progressToU: engine.progressToU });
  assert.equal(derived.source, 'engine');
  assert.equal(derived.count, 20);
  derived.lengths.forEach((length, i) => assert.ok(Math.abs(length / derived.total - engine.lengths[i] / engine.total) < 1e-6, `section ${i}`));
  // A section list with vh lengths.
  const listed = buildSchedule({ SECTIONS: SECTION_IDS.map(id => ({ id, vh: 120 })) });
  assert.equal(listed.source, 'engine');
  assert.deepEqual(listed.lengths, SECTION_IDS.map(() => 120));
  // Anything unusable falls back.
  assert.equal(buildSchedule(null).source, 'fallback');
  assert.equal(buildSchedule({ progressToU: () => Number.NaN }).source, 'fallback');
  assert.equal(buildSchedule({ progressToU: () => { throw new Error('x'); } }).source, 'fallback');
});

// ---- stones -----------------------------------------------------------------------------

test('the seven stone links carry the content hrefs, in order', async () => {
  const items = stoneItems(content.stones);
  assert.deepEqual(items.map(item => item.href), PARTS.map(part => part.href));
  assert.deepEqual(items.map(item => item.href), content.stones.map(stone => stone.href));
  assert.deepEqual(items.map(item => item.number), ['01', '02', '03', '04', '05', '06', '07']);
  assert.equal(content.ui.sections, 'Seven sections');
  const source = await read('app/components/StoryStones.vue');
  assert.ok(code(source, 'x.vue').includes('stoneItems(content.stones)'));
  const markup = template(source);
  const nav = markup.match(/<nav class="stones-nav" :aria-label="ui\.sections">([\s\S]*?)<\/nav>/)?.[1];
  assert.ok(nav, 'the stones are a labelled <nav>');
  assert.equal((nav.match(/<a\b/g) || []).length, 1, 'one link per stone, from one v-for');
  assert.ok(nav.includes('v-for="stone in stones"') && nav.includes(':href="stone.href"'));
  assert.ok(!nav.includes('stone-panel'), 'the panel and its Open link sit outside the nav');
  assert.ok(markup.includes('class="cue-link stone-panel-open" :href="panel.href"'));
  for (const file of ['app/components/SiteMenu.vue', 'app/components/SectionsNav.vue']) {
    const text = await read(file);
    assert.ok(code(text, file).includes('stoneItems(content.stones)') && template(text).includes(':href="stone.href"'), file);
  }
});

test('stones:screen payloads are checked and normalised', () => {
  const ids = content.stones.map(stone => stone.id);
  assert.equal(normaliseScreen(undefined, ids), null);
  assert.equal(normaliseScreen({ about: {} }, ids), null);
  assert.deepEqual(normaliseScreen([
    { id: 'about', x: 10, y: 20, radius: 8, visible: true },
    { id: 'blog', x: 30, y: 40, r: 5 },
    { id: 'nope', x: 1, y: 1, radius: 1 },
    { id: 'art', x: Number.NaN, y: 1 },
    { id: 'fun', x: 5, y: 6, radius: -1, visible: false },
  ], ids), [
    { id: 'about', x: 10, y: 20, r: 8, visible: true },
    { id: 'blog', x: 30, y: 40, r: 5, visible: true },
    { id: 'fun', x: 5, y: 6, r: 0, visible: false },
  ]);
});

test('stone labels sit beside their spheres, inside the frame, clear of each other', () => {
  const view = { width: 1440, height: 900, top: 60 };
  const points = content.stones.map((stone, i) => {
    const a = (i / 7) * Math.PI * 2;
    return { id: stone.id, x: 720 + Math.cos(a) * 300, y: 470 + Math.sin(a) * 250, r: 26, visible: stone.id !== 'fun' };
  });
  const sizes = new Map(points.map(point => [point.id, [120, 18]]));
  const boxes = placeLabels(points, sizes, view);
  assert.ok(!boxes.has('fun'), 'hidden stones get no label');
  assert.equal(boxes.size, 6);
  const list = [...boxes.entries()];
  for (const [id, box] of list) {
    assert.ok(box.x >= 14 && box.y >= view.top + 14 && box.x + box.w <= view.width - 14 && box.y + box.h <= view.height - 14, `${id} inside`);
    for (const point of points.filter(p => p.visible)) {
      const cx = Math.max(box.x, Math.min(point.x, box.x + box.w));
      const cy = Math.max(box.y, Math.min(point.y, box.y + box.h));
      assert.ok(Math.hypot(cx - point.x, cy - point.y) >= point.r, `${id} clear of ${point.id}`);
    }
    const own = points.find(p => p.id === id);
    const { x1, y1 } = box.leader;
    assert.ok(Math.abs(Math.hypot(x1 - own.x, y1 - own.y) - (own.r - 2)) < 1e-6, `${id} leader starts at the sphere edge`);
  }
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const [a, b] = [list[i][1], list[j][1]];
      assert.ok(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y, `${list[i][0]} overlaps ${list[j][0]}`);
    }
  }
  // Narrow screens put labels under the sphere first.
  const phone = placeLabels([{ id: 'about', x: 195, y: 400, r: 20, visible: true }], new Map([['about', [90, 16]]]), { width: 390, height: 844 });
  assert.equal(phone.get('about').side, 'b');
});

// ---- source rules -----------------------------------------------------------------------

test('no v-html, innerHTML or document.write anywhere in the app', async () => {
  for (const { file, text } of await appSources()) {
    const markup = file.endsWith('.vue') ? template(text).replace(/<!--[\s\S]*?-->/g, '') : '';
    assert.ok(!/\bv-html\b/.test(markup + code(text, file)), `${file} uses v-html`);
    assert.ok(!/\.innerHTML\b|\.outerHTML\s*=|insertAdjacentHTML|document\.write/.test(code(text, file)), `${file} writes HTML`);
  }
});

test('contract names are imported from contract.mjs, never retyped', async () => {
  const retyped = [
    ...Object.values(HOME_EVENTS),
    ...Object.values(HOME_ATTRS),
    HOME_GLOBAL,
    HOME_ASSETS_BASE,
  ];
  for (const { file, text } of await appSources()) {
    const source = code(text, file);
    for (const name of retyped) {
      assert.ok(!new RegExp(`["'\`]${name.replace(/[/$]/g, '\\$&')}["'\`]`).test(source), `${file} retypes "${name}"`);
    }
    assert.ok(!/setWebgl\(\s*["']/.test(source) && !/webgl\s*[!=]==\s*["'](?:on|off|lost)["']/.test(source), `${file} retypes a data-home-webgl value`);
    for (const m of source.matchAll(/\.on\(\s*["']([^"']+)["']/g)) assert.ok(SCENE_EVENTS.includes(m[1]), `${file} listens to unknown scene event "${m[1]}"`);
    if (file !== 'app/composables/useSound.js') assert.ok(!source.includes('rz:sound'), `${file} retypes the sound storage key`);
  }
  const plugin = await read('app/plugins/home-contract.client.js');
  assert.match(plugin, /import \{[^}]*\bHOME_ATTRS\b[^}]*\bHOME_EVENTS\b[^}]*\bHOME_GLOBAL\b[^}]*\} from '~~\/contract\.mjs'/);
  const canvas = code(await read('app/components/SceneCanvas.client.vue'), 'x.vue');
  assert.ok(canvas.includes('HOME_WEBGL.off') && canvas.includes('HOME_WEBGL.on') && canvas.includes('HOME_WEBGL.lost'));
  assert.match(code(await read('app/composables/useSound.js'), 'x.js'), /export const SOUND_KEY = 'rz:sound';/);
});

test('three is never imported by the app; the engine only lazily, from SceneCanvas', async () => {
  for (const { file, text } of await appSources()) {
    const source = code(text, file);
    assert.ok(!/from\s+["']three(?:\/[^"']*)?["']|import\(\s*["']three/.test(source), `${file} imports three`);
    const engine = [...source.matchAll(/(import\s*\(\s*|from\s+)["']([^"']*engine\/(?!timeline\/schedule)[^"']*)["']/g)];
    if (file === 'app/components/SceneCanvas.client.vue') {
      assert.deepEqual(engine.map(m => [m[1].startsWith('import'), m[2]]), [[true, '~~/engine/index.js']]);
    } else {
      assert.deepEqual(engine.filter(m => !m[1].startsWith('import')).map(m => m[2]).filter(s => !s.endsWith('engine/index.js')), [], `${file} imports the engine`);
      assert.ok(!engine.some(m => m[1].startsWith('import')), `${file} loads the engine`);
    }
    assert.ok(!/from\s+["']gsap/.test(source), `${file} imports gsap statically; load it inside onMounted`);
  }
});

test('no analytics or tracking in the app, its modules or its config', async () => {
  const bad = /gtag|googletagmanager|google-analytics|analytics\.js|plausible|umami|mixpanel|segment\.(?:io|com)|hotjar|posthog|amplitude|clarity\.ms|fbq\(|sendBeacon|navigator\.sendBeacon|matomo/i;
  const files = [
    ...(await appSources()),
    ...await Promise.all((await listFiles(join(HOME, 'modules'))).map(async file => ({ file: `modules/${file}`, text: await read(`modules/${file}`) }))),
    { file: 'nuxt.config.js', text: await read('nuxt.config.js') },
    { file: 'content.mjs', text: await read('content.mjs') },
  ];
  for (const { file, text } of files) assert.ok(!bad.test(code(text, file)), `${relative(HOME, join(HOME, file))} mentions analytics`);
  assert.ok(!bad.test(await read('app/assets/css/home.css')));
});

test('without JavaScript nothing in the story is hidden', async () => {
  const css = (await read('app/assets/css/home.css')).replace(/\/\*[\s\S]*?\*\//g, '');
  // Story text: the hero, beats, coda, contact block, the stones and their list.
  const text = /\.(?:hero|beat|coda|contact|stones?|story|sections)(?:-[\w-]+)?(?![\w-])/;
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const [selector, body] = [m[1].trim(), m[2]];
    if (!/opacity:\s*0(?:[;\s]|$)|visibility:\s*hidden|display:\s*none/.test(body)) continue;
    for (const part of selector.split(',').map(s => s.trim())) {
      // The element the rule applies to is the last compound of the selector.
      const subject = part.split(/[\s>+~]+/).pop() || '';
      if (!text.test(subject) || /\.stone-hit(?![\w-])/.test(subject)) continue;
      assert.ok(/data-hidden|is-placed|is-staged|-enter-from|-leave-to|data-home-js\]|is-covered/.test(part), `"${part}" hides story text without a JS-only hook`);
    }
  }
  const motion = code(await read('app/composables/useStoryMotion.js'), 'x.js');
  assert.ok(motion.includes('onMounted('), 'staging and text animation start after mount');
  assert.equal((motion.match(/storyState\.staged = true/g) || []).length, 1, 'one place stages the story');
  assert.ok(/if \(webgl !== HOME_WEBGL\.off\) await stage\(root\)/.test(motion), 'no WebGL, no staging: the plain page stays');
  assert.ok(/function render\(u\) \{\s*if \(!storyState\.staged\) return;/.test(motion), 'frames are only touched once staged');
  assert.ok(/reduced\s*=\s*flags\.nomotion\s*\|\|\s*window\.matchMedia\('\(prefers-reduced-motion: reduce\)'\)\.matches/.test(motion));
  assert.ok(/if \(storyState\.staged && !reduced\) split\(SplitText\)/.test(motion), 'reduced motion skips SplitText');
  assert.ok(motion.includes("start: 'top top'") && motion.includes("end: 'bottom bottom'"), 'progress spans the story, as the engine schedule expects');
  assert.ok(!/ScrollSmoother/.test(motion), 'native scroll');
});

test('URL flags', () => {
  assert.deepEqual(parseFlags(''), { at: null, nomotion: false, nowebgl: false, still: false, quality: 'auto' });
  assert.deepEqual(parseFlags('?at=18.5&nomotion=1&webgl=0&still&quality=low'), { at: 18.5, nomotion: true, nowebgl: true, still: true, quality: 'low' });
  assert.equal(parseFlags('?at=').at, null);
  assert.equal(parseFlags('?at=abc').at, null);
  assert.equal(parseFlags('?at=0').at, 0);
  assert.equal(parseFlags('?nomotion=0').nomotion, false);
  assert.equal(parseFlags('?webgl=1').nowebgl, false);
  assert.equal(parseFlags('?quality=ultra').quality, 'auto');
});

test('ui words exist for every label the app shows', async () => {
  for (const key of ['skip', 'scroll', 'menu', 'sound', 'open', 'close', 'contact', 'sections', 'siteMenu', 'loading', 'opening']) {
    assert.equal(typeof content.ui[key], 'string', key);
    assert.ok(content.ui[key].trim(), key);
  }
  for (const { file, text } of await appSources()) {
    for (const m of code(text, file).matchAll(/\bui\.(\w+)/g)) assert.ok(m[1] in content.ui, `${file} uses ui.${m[1]}`);
    if (file.endsWith('.vue')) for (const m of template(text).matchAll(/\bui\.(\w+)/g)) assert.ok(m[1] in content.ui, `${file} uses ui.${m[1]}`);
  }
});
