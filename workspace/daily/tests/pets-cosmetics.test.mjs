// Cosmetics (pets/cosmetics.js) and the cosmetics block of pets/pets.css.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { COSMETICS, COSMETIC_IDS, HEAD_FIT, MOOD_POSE, headFit, renderCosmetic } from '../pets/cosmetics.js';
import { SPECIES, renderPet, renderSilhouette, speciesStatus, getSpecies, LIVE_MOODS } from '../pets/index.js';
import { makeContext } from '../pets/rig.js';
import { SEASON_COSMETICS, KEEPER } from '../engine/content.js';

const here = dirname(fileURLToPath(import.meta.url));
const petsDir = join(here, '..', 'pets');
const ready = Object.entries(speciesStatus()).filter(([, s]) => s === 'ready').map(([id]) => id);

// ---------- helpers (same checks as pets-rig.test.mjs) ----------

function assertWellFormed(svg, where = '') {
  const stack = [];
  const re = /<(\/?)([a-zA-Z][\w:-]*)((?:\s+[\w:-]+="[^"]*")*)\s*(\/?)>/g;
  let last = 0, m;
  while ((m = re.exec(svg))) {
    const between = svg.slice(last, m.index);
    assert.ok(!between.includes('<') && !between.includes('>'), `${where}: stray bracket near ${between.slice(0, 60)}`);
    last = re.lastIndex;
    const [, close, name, , self] = m;
    if (self) continue;
    if (close) assert.equal(stack.pop(), name, `${where}: mismatched </${name}>`);
    else stack.push(name);
  }
  assert.ok(!svg.slice(last).includes('<'), `${where}: trailing markup`);
  assert.deepEqual(stack, [], `${where}: unclosed ${stack.join(',')}`);
}
const ids = (svg) => [...svg.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
const refs = (svg) => [...svg.matchAll(/url\(#([^)]+)\)/g)].map((m) => m[1]);
function assertIdsSound(svg, where = '') {
  const list = ids(svg);
  assert.equal(new Set(list).size, list.length, `${where}: duplicate ids`);
  for (const r of refs(svg)) assert.ok(list.includes(r), `${where}: url(#${r}) has no target`);
}
/** The markup inside g-cosmetic. */
function cosmeticOf(svg) {
  const start = svg.indexOf('<g class="g-cosmetic">');
  const end = svg.indexOf('<g class="g-occlude-front">');
  assert.ok(start >= 0 && end > start, 'g-cosmetic sits before g-occlude-front');
  return svg.slice(start, end);
}
const draw = (id, opts = {}) => {
  const ctx = makeContext({ species: 'dragon', tier: 2, mood: 'healthy', size: 128, uid: 'qq', ...opts });
  return { markup: COSMETICS[id].draw(ctx), ctx };
};

// ---------- catalogue ----------

test('COSMETICS holds the six season hats and the nine Keeper-road cosmetics, matching the engine content', () => {
  const season = SEASON_COSMETICS.map((c) => c.id);
  const road = KEEPER.special.filter((s) => s.cosmetic).map((s) => s.cosmetic);
  assert.equal(season.length, 6);
  assert.equal(road.length, 9);
  assert.deepEqual(COSMETIC_IDS, [...season, ...road], 'reward order: seasons by month, then Keeper levels');
  for (const c of SEASON_COSMETICS) {
    const item = COSMETICS[c.id];
    assert.equal(item.name, c.name, c.id);
    assert.equal(item.source, 'season');
    assert.equal(item.season, c.season);
    assert.equal(item.motion, c.motion);
  }
  const names = { seedling: 'Seedling', keepersCap: "Keeper's Cap", studyHeadphones: 'Study Headphones', littleLantern: 'Little Lantern', fieldPencil: 'Field Pencil', graduationCap: 'Graduation Cap', mossBeret: 'Moss Beret', orbitClub: 'Orbit Club', keepersLaurel: "Keeper's Laurel" };
  for (const s of KEEPER.special.filter((x) => x.cosmetic)) {
    const item = COSMETICS[s.cosmetic];
    assert.equal(item.source, 'keeper');
    assert.equal(item.level, s.lv, s.cosmetic);
    assert.equal(item.name, names[s.cosmetic]);
    const spec = KEEPER.roadCosmetics[s.cosmetic];
    if (spec.motion) assert.equal(item.motion, spec.motion, s.cosmetic);
  }
  for (const item of Object.values(COSMETICS)) {
    assert.ok(Object.isFrozen(item));
    assert.equal(typeof item.draw, 'function');
  }
});

test('every cosmetic uses the exact palette from CONTENT.md', () => {
  const want = Object.fromEntries([
    ...SEASON_COSMETICS.map((c) => [c.id, c.colors]),
    ...Object.entries(KEEPER.roadCosmetics).filter(([, v]) => v.colors).map(([id, v]) => [id, v.colors]),
  ]);
  for (const id of COSMETIC_IDS) {
    const { markup, ctx } = draw(id, { size: 200 });
    const all = (markup + ctx.defs.join('')).toLowerCase();
    for (const hex of want[id]) assert.ok(all.includes(hex.toLowerCase()), `${id} uses ${hex}`);
  }
});

// ---------- rendering on pets ----------

test('each cosmetic renders soundly on every ready species, live mood and size, inside g-cosmetic at headTop', () => {
  assert.ok(ready.length >= 3, 'slime and at least two other species are ready');
  for (const species of ready) {
    const sp = getSpecies(species);
    const [hx, hy] = sp.anchors.headTop;
    const acc = sp.anchors.accScale || 1;
    for (const id of COSMETIC_IDS) {
      for (const mood of LIVE_MOODS) {
        for (const size of [200, 128, 72]) {
          const where = `${species}/${id}/${mood}/${size}`;
          const svg = renderPet({ species, tier: (size + mood.length) % 7, mood, cosmetic: id, size, focus: size === 200 });
          assertWellFormed(svg, where);
          assertIdsSound(svg, where);
          assert.ok(!/NaN|undefined|Infinity|\[object/.test(svg), `${where}: bad value`);
          const cos = cosmeticOf(svg);
          assert.ok(cos.includes(`<g transform="translate(${hx} ${hy}) scale(${acc})" data-cosmetic="${id}"><g class="cos cos--${id}">`), `${where}: placed at headTop`);
        }
      }
    }
  }
  // No cosmetic (or an unknown one) leaves g-cosmetic empty.
  assert.match(renderPet({ species: 'slime' }), /<g class="g-cosmetic"><\/g>/);
  assert.match(renderPet({ species: 'slime', cosmetic: 'nope' }), /<g class="g-cosmetic"><\/g>/);
});

test('every def id comes from ctx.defOnce (namespaced by the render uid); same uid gives the same markup', () => {
  for (const id of COSMETIC_IDS) {
    for (const species of [...ready, 'unknown-species']) {
      const ctx = makeContext({ species, tier: 3, size: 128, uid: 'qq' });
      const markup = COSMETICS[id].draw(ctx);
      for (const i of [...ids(markup), ...ctx.defs.flatMap(ids)]) assert.match(i, /^qq-(clip-)?cos-/, `${id}/${species}: id ${i}`);
      for (const r of refs(markup)) assert.match(r, /^qq-(clip-)?cos-/, `${id}: ref ${r}`);
      const again = COSMETICS[id].draw(makeContext({ species, tier: 3, size: 128, uid: 'qq' }));
      assert.equal(markup, again, `${id}/${species}: deterministic`);
    }
  }
});

test('hats are fitted to each head but keep the 4 px outline; wraps follow the head ellipse', () => {
  for (const s of SPECIES) assert.ok(HEAD_FIT[s.id], `HEAD_FIT.${s.id}`);
  for (const fit of Object.values(HEAD_FIT)) {
    assert.ok(fit.rx > 20 && fit.ry > 20 && fit.cy > 20, 'head ellipse is plausible');
    assert.ok(fit.hat >= 1 && fit.hat <= 1.4, 'hat scale stays modest');
    assert.ok(fit.cupA > 30 && fit.cupA <= 100 && fit.sideA > 30 && fit.sideA < 80 && fit.pencilA > 5 && fit.pencilA < 30);
  }
  assert.equal(headFit('nope'), HEAD_FIT.default);
  const hats = ['acornCap', 'snowfallBeanie', 'paperPartyCrown', 'heartPatchBeret', 'blossomSprig', 'rainBucketHat', 'seedling', 'keepersCap', 'graduationCap', 'mossBeret', 'orbitClub'];
  for (const species of Object.keys(HEAD_FIT)) {
    for (const id of hats) {
      const { markup } = draw(id, { species });
      const scale = Number(markup.match(/^<g class="cos cos--\w+"><g transform="scale\(([\d.]+)\)">/)?.[1]);
      assert.equal(scale, headFit(species).hat, `${id} on ${species} scaled by the fit`);
      const widths = [...markup.matchAll(/fill="none" stroke="#1a1530" stroke-width="([\d.]+)" stroke-linejoin="round"/g)].map((m) => Number(m[1]) * scale);
      if (['blossomSprig', 'seedling'].includes(id)) continue; // small parts only: a twig and a sprout
      assert.ok(widths.some((w) => Math.abs(w - 4) < 0.06), `${id} on ${species}: a 4 px silhouette outline (${widths.join(', ')})`);
    }
    for (const id of ['studyHeadphones', 'littleLantern', 'fieldPencil', 'keepersLaurel']) {
      const { markup } = draw(id, { species });
      assert.match(markup, new RegExp(`^<g class="cos cos--${id}"><path`), `${id}: no hat scale on wraps`);
    }
  }
  // Wider heads get wider headphones.
  const cupX = (species) => Number(draw('studyHeadphones', { species }).markup.match(/<g transform="translate\((-?[\d.]+) /)[1]);
  assert.ok(Math.abs(cupX('fox')) > Math.abs(cupX('turtle')));
});

test('drawing one cosmetic never leaks its stroke scale into the next', () => {
  const fresh = draw('keepersLaurel').markup;
  draw('snowfallBeanie', { species: 'axolotl' });
  assert.equal(draw('keepersLaurel').markup, fresh);
  const beanie = draw('snowfallBeanie').markup;
  draw('littleLantern', { species: 'owl' });
  assert.equal(draw('snowfallBeanie').markup, beanie);
});

test('the slime\'s squashed moods carry the cosmetic with the body unless the species moves headTop itself', () => {
  for (const mood of ['hungry', 'starving']) {
    const [dx, dy, r] = MOOD_POSE.slime[mood].hat;
    const hat = draw('acornCap', { species: 'slime', mood }).markup;
    assert.ok(hat.includes(`<g transform="translate(${dx} ${dy}) rotate(${r}) scale(${headFit('slime').hat})">`), mood);
    const [sx, sy, wy] = MOOD_POSE.slime[mood].wrap;
    assert.ok(draw('studyHeadphones', { species: 'slime', mood }).markup.includes(`<g transform="matrix(${sx} 0 0 ${sy} 0 ${wy})">`), mood);
  }
  const plain = (markup) => /^<g class="cos cos--acornCap"><g transform="scale\([\d.]+\)">/.test(markup);
  assert.ok(plain(draw('acornCap', { species: 'slime', mood: 'healthy' }).markup));
  assert.ok(plain(draw('acornCap', { species: 'dragon', mood: 'starving' }).markup), 'the rig CSS handles other species');
  const moved = COSMETICS.acornCap.draw(makeContext({ species: 'slime', mood: 'starving', uid: 'qq', anchors: { headTop: [86, 78] } }));
  assert.ok(plain(moved), 'a species that sets ctx.anchors.headTop gets no extra pose');
  // The starving slime in the real renderer: the hat moves down onto the slumped body.
  assert.match(renderPet({ species: 'slime', mood: 'starving', cosmetic: 'acornCap' }), /data-cosmetic="acornCap"><g class="cos cos--acornCap"><g transform="translate\(5\.1 31\)/);
});

test('thumbnails leave out thin details and fx parts; larger sizes keep them', () => {
  for (const id of COSMETIC_IDS) {
    const thumb = draw(id, { size: 72 }).markup;
    assert.ok(!thumb.includes('cos-thin'), `${id}: no thin strokes at 72 px`);
    assert.ok(!thumb.includes('cos-fx'), `${id}: no fx at 72 px`);
    for (const m of thumb.matchAll(/stroke-width="([\d.]+)"/g)) assert.ok(Number(m[1]) >= 0.8, `${id}: stroke ${m[1]} at 72 px`);
  }
  for (const id of ['paperPartyCrown', 'blossomSprig', 'rainBucketHat']) assert.match(draw(id, { size: 128 }).markup, /class="cos-fx /, id);
  assert.match(draw('acornCap', { size: 128 }).markup, /class="cos-thin"/);
});

test('each motion in the brief has its animated part', () => {
  const part = { stemSway: 'cos-sway', leafSway: 'cos-sway', pomBounce: 'cos-pom', fireworkPop10s: 'cos-firework', petalDrift8s: 'cos-petal', brimDrip9s: 'cos-drip', tasselSwing: 'cos-tassel', glowFlicker: 'cos-glow', satelliteOrbit: 'cos-orbit' };
  const animated = Object.values(part);
  for (const id of COSMETIC_IDS) {
    const { motion } = COSMETICS[id];
    const markup = draw(id, { size: 200 }).markup;
    if (motion === 'none') {
      for (const c of animated) assert.ok(!markup.includes(`"${c}`) && !markup.includes(` ${c}"`), `${id} is static but has ${c}`);
    } else {
      assert.ok(part[motion], `${id}: known motion ${motion}`);
      assert.match(markup, new RegExp(`class="(?:cos-fx )?${part[motion]}[" ]`), `${id}: ${part[motion]}`);
    }
  }
  // Pivots: every animated part names its transform-origin in local units.
  for (const id of COSMETIC_IDS) {
    const markup = draw(id, { size: 200 }).markup;
    for (const m of markup.matchAll(/class="(?:cos-fx )?(cos-(?:sway|pom|firework|petal|drip|tassel|glow|orbit))(?: [^"]*)?"( style="[^"]*")?/g)) {
      assert.match(m[2] || '', /transform-origin:-?[\d.]+px -?[\d.]+px/, `${id}: ${m[1]} pivot`);
    }
  }
});

// ---------- standalone icon ----------

test('renderCosmetic draws a standalone icon for every cosmetic and a "?" for unknown ids', () => {
  for (const id of COSMETIC_IDS) {
    for (const size of [72, 128]) {
      const svg = renderCosmetic({ id, size, uid: `ic${size}` });
      assertWellFormed(svg, id);
      assertIdsSound(svg, id);
      assert.ok(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160"'), id);
      assert.match(svg, new RegExp(`class="pet-cosmetic cosmetic--${id} pet--s${size} pet--still"`));
      assert.ok(svg.includes(`aria-label="${COSMETICS[id].name.replace("'", '&#39;')}"`), `${id}: label`);
      assert.match(svg, /class="cos-stand"/);
    }
  }
  assert.match(renderCosmetic({ id: 'acornCap', animate: true }), /pet--focus cosmetic--live/);
  assert.ok(!renderCosmetic({ id: 'acornCap', stand: false }).includes('cos-stand'));
  const unknown = renderCosmetic({ id: 'toString' });
  assertWellFormed(unknown, 'unknown');
  assert.match(unknown, /cosmetic--unknown/);
  assert.match(unknown, />\?<\/text>/);
});

// ---------- CSS ----------

test('pets.css cosmetics block: keyframes defined, idle motion focus-only, triggers, thumbnails, reduced motion, silhouette', async () => {
  const css = await readFile(join(petsDir, 'pets.css'), 'utf8');
  const block = css.match(/\/\* ===== cosmetics ===== \*\/([\s\S]*?)\/\* ===== end cosmetics ===== \*\//);
  assert.ok(block, 'cosmetics block markers');
  const b = block[1];
  const defined = new Set([...b.matchAll(/@keyframes\s+([\w-]+)/g)].map((m) => m[1]));
  for (const k of defined) assert.ok(k.startsWith('cos-'), `keyframes ${k} are prefixed cos-`);
  for (const m of b.matchAll(/animation(?:-name)?\s*:\s*([\w-]+)/g)) if (m[1] !== 'none') assert.ok(defined.has(m[1]), `keyframes ${m[1]} defined`);
  // Every animated class the module emits has a rule; idle motions only under .pet--focus.
  for (const c of ['cos-sway', 'cos-pom', 'cos-tassel', 'cos-firework', 'cos-firework-trail', 'cos-petal', 'cos-drip', 'cos-glow', 'cos-orbit']) {
    assert.ok(b.includes(`.${c} {`) || b.includes(`.${c},`), `rule for .${c}`);
  }
  for (const m of b.matchAll(/([^{}]+)\{[^{}]*animation:\s*cos-(sway|firework|petal|drip|glow|orbit)[^}]*\}/g)) {
    assert.match(m[1], /pet--focus/, `idle cosmetic motion must be focus-only: ${m[1].trim()}`);
  }
  for (const m of b.matchAll(/([^{}]+)\{[^{}]*animation:\s*cos-(hop|jump|pom|tassel)[^}]*\}/g)) {
    assert.match(m[1], /pet--(bounce|cheer|levelup)/, `hop motion on trigger classes: ${m[1].trim()}`);
  }
  assert.match(b, /\.g-cosmetic \.cos-fx, \.pet-cosmetic \.cos-fx \{ opacity: 0; \}/);
  assert.match(b, /\.pet--thumb \.g-cosmetic, \.pet--thumb \.g-cosmetic \* \{ animation: none !important; \}/);
  assert.match(b, /@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.pet-cosmetic, \.pet-cosmetic \* \{ animation: none !important;/);
  // The shared reduced-motion and still rules (outside this block) cover .pet *.
  assert.match(css, /\.pet--still, \.pet--still \*/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.pet, \.pet \*/);
  // Petdex silhouette: tinted by the cell's --tier, union rim (no per-part stroke), "?" badge.
  assert.match(b, /\.pet-silhouette \{[^}]*--sil-tint: var\(--tier, #dfccff\)/);
  assert.match(b, /\.pet-silhouette > g:not\(\.fallback-marker\) \{ fill: #[0-9a-f]{6}; stroke: none; \}/);
  assert.match(b, /data:image\/svg\+xml,/);
  assert.match(b, /\.pet-silhouette:hover/);
  assert.ok(!/https?:\/\/(?!www\.w3\.org\/2000\/svg)/.test(b), 'no external URLs');
});

test('the Petdex silhouette markup the CSS styles is what renderSilhouette emits', () => {
  for (const species of SPECIES.map((s) => s.id)) {
    const s = renderSilhouette({ species, size: 72 });
    assert.match(s, /^<svg [^>]*class="pet-silhouette pet--/);
    assert.match(s, /<ellipse [^>]*\/><g fill="#2b2740"/, `${species}: shadow then the silhouette group`);
  }
});
