// Hootling (owl) species: CONTENT.md §A.2 "Hootling (owl)" on the shared rig (§A.1).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { renderPet, renderSilhouette, speciesStatus, validateSpecies, getSpecies, silhouetteOf, TIERS, GROUPS, LIVE_MOODS, FACE_CLASSES } from '../pets/index.js';
import owl from '../pets/species/owl.js';

const here = dirname(fileURLToPath(import.meta.url));
const SIZES = [200, 128, 72];

// ---------- helpers ----------

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
function assertIdsSound(svg, where = '') {
  const list = ids(svg);
  assert.equal(new Set(list).size, list.length, `${where}: duplicate ids`);
  for (const [, r] of svg.matchAll(/url\(#([^)]+)\)/g)) assert.ok(list.includes(r), `${where}: url(#${r}) has no target`);
}
/** Inner markup of the first <g class="CLS…"> (balanced). */
function groupOf(svg, cls) {
  const start = svg.indexOf(`<g class="${cls}"`);
  if (start < 0) return null;
  const re = /<(\/?)g\b[^>]*?(\/?)>/g;
  re.lastIndex = start;
  let depth = 0, m, open = -1;
  while ((m = re.exec(svg))) {
    if (m[2]) continue;
    if (m[1]) { depth -= 1; if (depth === 0) return svg.slice(open, m.index); } else { if (depth === 0) open = re.lastIndex; depth += 1; }
  }
  return null;
}
const pet = (o) => renderPet({ species: 'owl', name: 'Euler', level: 7, ...o });
const has = (svg, cls) => svg.includes(`class="${cls}"`) || svg.includes(`class="${cls} `);

// ---------- contract ----------

test('the owl module is loaded, valid and named Hootling', () => {
  assert.equal(speciesStatus().owl, 'ready');
  assert.deepEqual(validateSpecies(owl, 'owl'), []);
  assert.equal(getSpecies('owl'), owl);
  assert.equal(owl.name, 'Hootling');
  assert.equal(owl.idleClass, 'pet-idle--owl');
});

test('anchors follow CONTENT.md (headTop 80,32 · brow 80,46 · neck 80,92 · chest 80,112 · hand 112,120)', () => {
  const a = owl.anchors;
  assert.deepEqual([a.headTop, a.brow, a.neck, a.chest, a.hand], [[80, 32], [80, 46], [80, 92], [80, 112], [112, 120]]);
  assert.deepEqual(a.mouth, [80, 84], 'eat orb lands on the beak');
  assert.ok(a.accScale > 0);
});

test('every tier × live mood × size renders a sound SVG with every group in order', () => {
  for (let tier = 0; tier <= 6; tier += 1) {
    for (const mood of LIVE_MOODS) {
      for (const size of SIZES) {
        const where = `owl/${tier}/${mood}/${size}`;
        for (const focus of [false, true]) {
          const svg = pet({ tier, mood, size, focus, stars: focus ? 5 : 1 });
          assert.ok(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160"'), where);
          assert.match(svg, new RegExp(`width="${size}" height="${size}"`), where);
          assert.ok(!/NaN|undefined|null|Infinity|\[object/.test(svg), `${where}: bad value in markup`);
          assertWellFormed(svg, where);
          assertIdsSound(svg, where);
          assert.deepEqual([...svg.matchAll(/class="g-([a-z-]+)"/g)].map((m) => m[1]), GROUPS, where);
          assert.match(svg, new RegExp(`class="pet pet--owl pet--tier-${tier} pet--${TIERS[tier].key} pet--mood-${mood} pet--s${size}`), where);
          assert.ok(!svg.includes('pet--fallback') && !svg.includes('TODO'), `${where}: not the fallback`);
          assert.ok(svg.includes('class="pet-idle pet-idle--owl"'), where);
          // The species draws into its own groups.
          for (const gname of ['body', 'legs', 'belly', 'arms', 'head', 'face', 'occlude-front']) assert.ok(groupOf(svg, `g-${gname}`).length > 0, `${where}: g-${gname} empty`);
        }
      }
    }
  }
});

test('ids stay unique across many owls on one page', () => {
  const page = [];
  for (let i = 0; i < 42; i += 1) page.push(pet({ tier: i % 7, mood: LIVE_MOODS[i % 4], size: SIZES[i % 3], focus: i % 2 === 0 }));
  const all = page.flatMap(ids);
  assert.ok(all.length > 100);
  assert.equal(new Set(all).size, all.length);
});

test('same uid gives identical markup (pure, deterministic draw)', () => {
  for (let tier = 0; tier <= 6; tier += 1) assert.equal(pet({ tier, mood: 'happy', uid: 'powl1' }), pet({ tier, mood: 'happy', uid: 'powl1' }));
});

// ---------- anatomy ----------

test('ear tufts sit in g-occlude-front (in front of the cosmetic) and droop with hunger', () => {
  const lean = (mood) => {
    const occ = groupOf(pet({ mood }), 'g-occlude-front');
    assert.ok(occ.includes('owl-tuft--l') && occ.includes('owl-tuft--r'), mood);
    return Number(occ.match(/owl-tuft--l" transform="[^"]*rotate\((-?[\d.]+)\)/)[1]);
  };
  assert.equal(lean('healthy'), -20, '20° out');
  assert.equal(lean('hungry'), -45, 'hungry: 25° further down');
  assert.ok(lean('starving') <= -45);
  assert.ok(lean('happy') > -20, 'happy: perkier');
  const svg = pet({});
  assert.ok(svg.indexOf('class="g-cosmetic"') < svg.indexOf('owl-tuft--l'), 'tufts after the cosmetic socket');
});

test('the face: big round eyes with an accent iris ring, #ffb347 beak, mood parts', () => {
  for (let tier = 0; tier <= 6; tier += 1) {
    const face = groupOf(pet({ tier }), 'g-face');
    assert.ok(face.includes(`r="9" fill="`), 'eye r 9');
    assert.ok(face.includes('r="6" fill="#1a1530"'), 'pupil r 6');
    assert.ok(face.includes('fill="#ffb347"'), 'beak');
    assert.ok(face.includes('owl-eye--l') && face.includes('owl-eye--r'), 'eyes wrapped for the wink');
    assert.match(face, /<g class="owl-wink" opacity="0">/, 'wink arc hidden by default');
  }
  const moods = Object.fromEntries(LIVE_MOODS.map((m) => [m, pet({ mood: m })]));
  assert.ok(has(moods.healthy, 'eyes-open') && has(moods.healthy, 'mouth-smile'));
  assert.ok(has(moods.happy, 'eyes-happy') && has(moods.happy, 'mouth-open'));
  assert.ok(has(moods.hungry, 'eyes-half') && has(moods.hungry, 'mouth-wavy'));
  assert.ok(has(moods.starving, 'eyes-hollow') && has(moods.starving, 'mouth-o') && has(moods.starving, 'tear'));
  const all = Object.values(moods).join('');
  for (const c of FACE_CLASSES) assert.ok(all.includes(`class="${c}"`), c);
  // Ultra star highlights replace the big round highlight.
  assert.match(groupOf(pet({ tier: 6 }), 'eyes-open'), /<path d="M[^"]+Z" fill="#ffffff"\/>/);
});

test('mood poses: happy wings swing out, hungry body fluffs wider, starving ruffles and drops a feather', () => {
  const arms = (mood) => groupOf(pet({ mood }), 'g-arms');
  assert.notEqual(arms('happy'), arms('healthy'));
  const body = (mood) => groupOf(pet({ mood }), 'g-body');
  const minX = (svg) => Math.min(...[...svg.matchAll(/[MC ](\d+(?:\.\d+)?) \d/g)].map((m) => +m[1]));
  assert.ok(minX(body('hungry')) < minX(body('healthy')) - 1.5, 'fluffed ~6 % wider');
  const st = pet({ mood: 'starving' });
  assert.ok(groupOf(st, 'g-fx').includes('owl-feather'), 'stray feather');
  assert.ok(groupOf(st, 'g-head').includes('L-3.6 -5'), 'jagged feather tips on the head');
  assert.ok(!pet({ mood: 'starving', size: 72 }).includes('owl-feather'), 'no fx on thumbnails');
  assert.ok(!pet({ mood: 'healthy' }).includes('owl-feather'));
});

test('eating: a hidden throat bulge (r 6, shade) for the gulp, none on thumbnails', () => {
  const face = groupOf(pet({ tier: 2 }), 'g-face');
  assert.match(face, /<g class="owl-gulp" opacity="0"><circle cx="80" cy="86" r="6" fill="#4cbc9c"\/>/);
  assert.ok(!pet({ size: 72 }).includes('owl-gulp'));
});

// ---------- tier ladder ----------

test('tier items replace each other (one body accessory + one brow item at most)', () => {
  const at = (tier, size = 200) => {
    const svg = pet({ tier, size });
    return {
      svg,
      markings: groupOf(svg, 'g-markings'),
      body: groupOf(svg, 'g-acc-body'),
      brow: groupOf(svg, 'g-acc-brow'),
      arms: groupOf(svg, 'g-arms'),
      head: groupOf(svg, 'g-head'),
      occ: groupOf(svg, 'g-occlude-front'),
      back: groupOf(svg, 'g-aura-back'),
    };
  };
  const t = [0, 1, 2, 3, 4, 5, 6].map((i) => at(i));
  // Ordinary: plain.
  assert.equal(t[0].markings, ''); assert.equal(t[0].body, ''); assert.equal(t[0].brow, '');
  // Rare: 3 belly chevrons in accent, 2 px+.
  assert.equal((t[1].markings.match(/stroke="#2f6fb3"/g) || []).length, 3);
  assert.equal(t[1].body, '');
  // SR: chevrons + pale disc crescents + bookmark scarf in accent.
  assert.equal((t[2].markings.match(/stroke="#23866a"/g) || []).length, 3);
  assert.ok(t[2].body.includes('owl-scarf') && t[2].body.includes('fill="#23866a"'));
  assert.equal((t[2].head.match(/stroke="#ffffff" stroke-width="2" stroke-linecap="round" opacity=".6"/g) || []).length, 2);
  // Epic: glasses replace the scarf and the chevrons; accent frame with the Epic glow.
  assert.equal(t[3].markings, ''); assert.equal(t[3].body, '');
  assert.ok(t[3].brow.includes('owl-glasses') && t[3].brow.includes('stroke="#6a3fc4"') && t[3].brow.includes('-glow-c9a2ff'));
  assert.equal((t[3].brow.match(/r="11.5"/g) || []).length, 4, 'two lenses (outline + frame)');
  // Mythic: star-rim glasses + a constellation on each wing.
  assert.ok(t[4].brow.includes('stroke="#ffe4f2"') && t[4].brow.includes('fill="#ffe4f2"'));
  assert.equal((t[4].arms.match(/owl-constellation/g) || []).length, 2);
  assert.ok(!t[4].brow.includes('#6a3fc4'));
  // Legendary: gold glasses + gold quill at the hand, flame tufts, top-arc trim.
  assert.ok(t[5].brow.includes('stroke="#ffe08a"'));
  assert.ok(t[5].body.includes('owl-quill') && t[5].body.includes('fill="#fff1df"'));
  assert.equal((t[5].occ.match(/class="flame"/g) || []).length, 2);
  assert.ok(t[5].head.includes('class="trim"'));
  // Ultra: monocle (no glasses), star-dusted wings, moon halo behind, prismatic overlay.
  assert.ok(t[6].brow.includes('owl-monocle') && !t[6].brow.includes('owl-glasses'));
  assert.ok(t[6].brow.includes('r="12"'));
  assert.equal((t[6].arms.match(/owl-stardust/g) || []).length, 2);
  assert.ok(t[6].back.includes('owl-moon') && t[6].back.includes('fill="#fffbe8" opacity=".6"'));
  assert.ok(t[6].svg.includes('class="prism"'));
  assert.equal(t[6].body, '');
  // Exactly one body accessory and one brow item at every tier; never on headTop (the cosmetic socket stays empty).
  for (let i = 0; i <= 6; i += 1) {
    assert.ok((t[i].body.match(/class="owl-(scarf|quill)"/g) || []).length <= 1, `tier ${i} body acc`);
    assert.ok((t[i].brow.match(/class="owl-(glasses|monocle)"/g) || []).length <= 1, `tier ${i} brow item`);
    assert.equal(groupOf(t[i].svg, 'g-cosmetic'), '', `tier ${i}: cosmetic socket untouched`);
  }
  // Other tiers' items never leak.
  for (let i = 0; i <= 6; i += 1) {
    assert.equal(t[i].body.includes('owl-scarf'), i === 2, `scarf only at SR (tier ${i})`);
    assert.equal(t[i].body.includes('owl-quill'), i === 5, `quill only at Legendary (tier ${i})`);
    assert.equal(t[i].arms.includes('owl-constellation'), i === 4);
    assert.equal(t[i].back.includes('owl-moon'), i === 6);
  }
});

test('the tier palette drives the colours (exact hex)', () => {
  for (let tier = 0; tier <= 6; tier += 1) {
    const { body, shade, belly } = TIERS[tier];
    const svg = pet({ tier });
    assert.ok(groupOf(svg, 'g-body').includes(`fill="${body}"`), `body ${tier}`);
    assert.ok(groupOf(svg, 'g-body').includes(`fill="${shade}"`), `shade ${tier}`);
    assert.ok(groupOf(svg, 'g-belly').includes(`fill="${belly}"`), `belly ${tier}`);
    assert.ok(groupOf(svg, 'g-head').includes(`fill="${belly}"`), `facial disc ${tier}`);
    assert.ok(groupOf(svg, 'g-arms').includes(`fill="${shade}"`), `wings in shade ${tier}`);
    assert.ok(groupOf(svg, 'g-legs').includes('fill="#ffb347"'), 'feet');
  }
});

test('thumbnails: no marking strokes under 2 px, no thin decoration, static', () => {
  for (let tier = 0; tier <= 6; tier += 1) {
    for (const mood of LIVE_MOODS) {
      const svg = pet({ tier, mood, size: 72, focus: true });
      assert.ok(!svg.includes('pet--focus'));
      const marks = groupOf(svg, 'g-markings');
      for (const [, w] of marks.matchAll(/stroke-width="([\d.]+)"/g)) assert.ok(+w >= 2 || /class="thin"/.test(marks), `tier ${tier}: marking stroke ${w}`);
      for (const [, w] of groupOf(svg, 'g-arms').matchAll(/stroke-width="([\d.]+)"/g)) assert.ok(+w >= 1.5, `tier ${tier}: wing stroke ${w}`);
      assert.ok(!svg.includes('owl-moon') && !svg.includes('owl-gulp'));
    }
  }
});

// ---------- dead, ashes, silhouette ----------

test('silhouette: filled shapes only, used by the grave, the ashes medallion and the Petdex', () => {
  const sil = owl.silhouette();
  assert.ok(sil.length > 100);
  assert.ok(!/\b(fill|stroke)=/.test(sil), 'no fill/stroke attributes');
  assert.ok(!/NaN|undefined/.test(sil));
  assertWellFormed(`<g>${sil}</g>`, 'silhouette');
  assert.equal(silhouetteOf('owl'), sil);
  const grave = renderPet({ species: 'owl', mood: 'dead', name: 'Euler', level: 12 });
  assertWellFormed(grave, 'grave'); assertIdsSound(grave, 'grave');
  assert.ok(grave.includes(sil) && grave.includes('pet--owl') && grave.includes('>Euler</text>'));
  const ashes = renderPet({ species: 'owl', tier: 4, mood: 'ashes', ashesDone: 2 });
  assertWellFormed(ashes, 'ashes'); assertIdsSound(ashes, 'ashes');
  assert.ok(ashes.includes(sil));
  for (const size of [128, 72]) {
    const dex = renderSilhouette({ species: 'owl', size });
    assertWellFormed(dex, 'petdex');
    assert.ok(dex.includes(sil) && !dex.includes('TODO'));
  }
});

// ---------- motion (pets.css owl block) ----------

test('pets.css owl block: idle tilt + wink, eat gulp, owl-prefixed keyframes, nothing outside the block', async () => {
  const css = await readFile(join(here, '..', 'pets', 'pets.css'), 'utf8');
  const start = css.indexOf('/* ===== species: owl ===== */');
  const end = css.indexOf('/* ===== end species: owl ===== */');
  assert.ok(start > 0 && end > start);
  const block = css.slice(start, end);
  const frames = [...block.matchAll(/@keyframes\s+([\w-]+)/g)].map((m) => m[1]);
  assert.ok(frames.length >= 6);
  for (const k of frames) assert.ok(k.startsWith('owl-'), `keyframes ${k} must be owl-prefixed`);
  for (const k of ['owl-tilt', 'owl-wink-eye', 'owl-gulp', 'owl-bulge', 'owl-feather', 'owl-hop']) assert.ok(frames.includes(k), k);
  assert.match(block, /\.pet--focus\.pet--owl \.pet-headrig > g \{ animation: owl-tilt/);
  assert.match(block, /\.pet--owl\.pet--eat \.pet-act \{ animation: owl-gulp/);
  assert.match(block, /\.pet--owl\.pet--cheer \.pet-headrig > g/);
  // Every rule in the block is scoped to the owl.
  const selectors = block.replace(/\/\*[\s\S]*?\*\//g, '').replace(/@keyframes[^{]+\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, '').match(/[^{}]+(?=\{)/g) || [];
  for (const sel of selectors) for (const part of sel.split(/,(?![^(]*\))/)) assert.match(part, /owl/, `unscoped selector: ${part.trim()}`);
  // Outside the block, nothing mentions the owl.
  assert.ok(!(css.slice(0, start) + css.slice(end + 40)).includes('owl-'), 'owl rules live only in the owl block');
});
