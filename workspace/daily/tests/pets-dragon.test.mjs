// Drakelet (dragon) species art: CONTENT.md §A.2 "Drakelet (dragon)" + §A.1 shared art system.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { renderPet, renderSilhouette, speciesStatus, validateSpecies, getSpecies, GROUPS, SPECIES_GROUPS, LIVE_MOODS, FACE_CLASSES, TIERS } from '../pets/index.js';
import { makeContext } from '../pets/rig.js';
import dragon from '../pets/species/dragon.js';

const here = dirname(fileURLToPath(import.meta.url));

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
const groupOrder = (svg) => [...svg.matchAll(/class="g-([a-z-]+)"/g)].map((m) => m[1]);
/** Inner markup of the first `<g class="g-NAME">` (balanced). */
function group(svg, name) {
  const start = svg.indexOf(`<g class="g-${name}">`);
  assert.ok(start >= 0, `group ${name}`);
  let depth = 0;
  const re = /<(\/?)g\b[^>]*?(\/?)>/g;
  re.lastIndex = start;
  let m;
  while ((m = re.exec(svg))) {
    if (m[2]) continue;
    depth += m[1] ? -1 : 1;
    if (depth === 0) return svg.slice(start + `<g class="g-${name}">`.length, m.index);
  }
  throw new Error(`unbalanced g-${name}`);
}
const R = (o) => renderPet({ species: 'dragon', name: 'Ember', level: 9, ...o });

test('dragon module is ready, valid and named Drakelet', () => {
  assert.equal(speciesStatus().dragon, 'ready');
  assert.deepEqual(validateSpecies(dragon, 'dragon'), []);
  assert.equal(getSpecies('dragon'), dragon);
  assert.equal(dragon.name, 'Drakelet');
  assert.equal(dragon.idleClass, 'pet-idle--dragon');
});

test('anchors match the brief (headTop, brow, neck, chest, hand) and stay in the 160 box', () => {
  const a = dragon.anchors;
  assert.deepEqual(a.headTop, [80, 34]);
  assert.deepEqual(a.brow, [80, 50]);
  assert.deepEqual(a.neck, [80, 92]);
  assert.deepEqual(a.chest, [80, 104]);
  assert.deepEqual(a.hand, [108, 116]);
  for (const [k, v] of Object.entries(a)) {
    if (k === 'accScale') continue;
    assert.ok(v[0] >= 0 && v[0] <= 160 && v[1] >= 0 && v[1] <= 160, k);
  }
});

test('every tier × live mood × size renders a sound SVG: groups in order, unique ids, no NaN', () => {
  let n = 0;
  for (let tier = 0; tier <= 6; tier += 1) {
    for (const mood of LIVE_MOODS) {
      for (const size of [200, 128, 72]) {
        for (const stars of [1, 5]) {
          const where = `dragon/${tier}/${mood}/${size}/${stars}★`;
          const svg = R({ tier, mood, size, stars, focus: size === 200 });
          assert.ok(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160"'), where);
          assert.match(svg, new RegExp(`width="${size}" height="${size}"`), where);
          assert.ok(!/NaN|undefined|null|Infinity|\[object/.test(svg), `${where}: bad value`);
          assert.ok(!svg.includes('pet--fallback') && !svg.includes('TODO'), `${where}: fallback`);
          assertWellFormed(svg, where);
          const list = ids(svg);
          assert.equal(new Set(list).size, list.length, `${where}: duplicate ids`);
          for (const r of refs(svg)) assert.ok(list.includes(r), `${where}: url(#${r}) has no target`);
          assert.deepEqual(groupOrder(svg), GROUPS, where);
          assert.match(svg, new RegExp(`class="pet pet--dragon pet--tier-${tier} pet--${TIERS[tier].key} pet--mood-${mood} pet--s${size}`), where);
          for (const g of ['tail', 'wing-back', 'body', 'legs', 'belly', 'arms', 'head', 'face', 'occlude-front']) {
            assert.ok(group(svg, g).length > 0, `${where}: g-${g} is empty`);
          }
          n += 1;
        }
      }
    }
  }
  assert.equal(n, 7 * 4 * 3 * 2);
});

test('draw() returns only allowed groups, ids only via defOnce, and is deterministic', () => {
  for (let tier = 0; tier <= 6; tier += 1) {
    for (const mood of LIVE_MOODS) {
      for (const size of [200, 72]) {
        const ctx = makeContext({ species: 'dragon', tier, mood, size, uid: 'pdrg' });
        const parts = dragon.draw(ctx);
        for (const k of Object.keys(parts)) assert.ok([...SPECIES_GROUPS, 'fx'].includes(k), `unknown group ${k}`);
        for (const v of Object.values(parts)) assert.equal(typeof v, 'string');
        const markup = Object.values(parts).join('') + ctx.defs.join('');
        for (const i of ids(markup)) assert.ok(i.startsWith('pdrg-'), `literal id ${i}`);
        const again = dragon.draw(makeContext({ species: 'dragon', tier, mood, size, uid: 'pdrg' }));
        assert.deepEqual(again, parts, `${tier}/${mood}: deterministic`);
      }
    }
  }
  const a = R({ tier: 4, mood: 'happy', uid: 'pfix' }), b = R({ tier: 4, mood: 'happy', uid: 'pfix' });
  assert.equal(a, b);
});

test('many dragons share a page without id collisions', () => {
  const page = Array.from({ length: 28 }, (_, i) => R({ tier: i % 7, mood: LIVE_MOODS[i % 4], size: [200, 128, 72][i % 3] }));
  const all = page.flatMap(ids);
  assert.ok(all.length > 50);
  assert.equal(new Set(all).size, all.length);
});

test('faces: each mood shows its face classes; the fang shows on smile, open and wavy mouths', () => {
  const all = LIVE_MOODS.map((mood) => R({ mood })).join('');
  for (const c of FACE_CLASSES) assert.ok(all.includes(`class="${c}"`), c);
  const face = (mood) => group(R({ mood }), 'face');
  assert.match(face('healthy'), /class="eyes-open"[\s\S]*class="mouth-smile"><path class="dragon-fang"/);
  assert.match(face('happy'), /class="eyes-happy"[\s\S]*class="mouth-open">[\s\S]*class="dragon-fang"/);
  assert.ok(!face('happy').includes('face-react'));
  assert.match(face('hungry'), /class="eyes-half"[\s\S]*class="mouth-wavy"><path class="dragon-fang"/);
  assert.match(face('starving'), /class="eyes-hollow"[\s\S]*class="mouth-o"[\s\S]*class="tear"/);
  // Healthy/hungry/starving carry a hidden happy copy for the triggered animations.
  for (const mood of ['healthy', 'hungry', 'starving']) assert.match(face(mood), /<g class="face-happy face-react" display="none">/);
  // Ultra star eye highlights come from the rig.
  assert.match(group(R({ tier: 6 }), 'face'), /class="eyes-open"><ellipse[^>]*\/><ellipse[^>]*\/><path d="M/);
});

test('mood poses: wings raised when happy, folded when hungry; tail drooped when hungry, flat when starving; horns dulled when starving', () => {
  const wingRot = (svg) => [...group(svg, 'wing-back').matchAll(/<g transform="rotate\(([-\d.]+) /g)].map((m) => +m[1]);
  assert.deepEqual(wingRot(R({ mood: 'healthy' })), [0, 0]);
  assert.deepEqual(wingRot(R({ mood: 'happy' })), [12, -12]);
  assert.deepEqual(wingRot(R({ mood: 'hungry' })), [-10, 10]);
  const [l, r] = wingRot(R({ mood: 'starving' }));
  assert.ok(l < -10 && r > 10, 'starving wings hang lower than hungry');
  const spadeY = (svg) => +group(svg, 'tail').match(/translate\(([\d.]+) ([\d.]+)\) rotate/)[2];
  assert.ok(spadeY(R({ mood: 'happy' })) < spadeY(R({ mood: 'healthy' })), 'happy tail perkier');
  assert.ok(spadeY(R({ mood: 'hungry' })) > spadeY(R({ mood: 'healthy' })), 'hungry tail tip droops');
  assert.ok(spadeY(R({ mood: 'starving' })) > 140, 'starving tail lies on the ground');
  // Horns: belly colour normally, shade when starving.
  const horn0 = (svg) => group(svg, 'occlude-front').match(/<path d="M[^"]+" fill="(#[0-9a-f]{6})"/)[1];
  assert.equal(horn0(R({ tier: 2, mood: 'healthy' })), TIERS[2].belly);
  assert.equal(horn0(R({ tier: 2, mood: 'starving' })), TIERS[2].shade);
});

test('idle/eat hooks: wings, tail, smoke rings (wisp when hungry), hiccup flame colour', () => {
  const svg = R({ size: 200, focus: true });
  assert.match(svg, /class="pet-idle pet-idle--dragon"/);
  assert.equal((svg.match(/class="dragon-wing dragon-wing--[lr]"/g) || []).length, 2);
  assert.match(svg, /class="dragon-wing dragon-wing--l" style="--dir:1;transform-origin:56px 96px"/);
  assert.match(svg, /class="dragon-wing dragon-wing--r" style="--dir:-1;transform-origin:104px 96px"/);
  assert.match(svg, /class="dragon-tail"/);
  assert.equal((svg.match(/class="dragon-ring"/g) || []).length, 3);
  assert.match(svg, /stroke="#c2bad0"/);
  const hungry = R({ mood: 'hungry' });
  assert.ok(!hungry.includes('class="dragon-ring"') && hungry.includes('class="dragon-wisp"'));
  assert.match(group(hungry, 'fx'), /stroke="#978daa"/);
  assert.ok(!R({ mood: 'starving' }).includes('dragon-ring'));
  const hic = (tier) => group(R({ tier }), 'fx').match(/class="dragon-hiccup"[\s\S]*?<path d="[^"]+" fill="(#[0-9a-f]{6})"/)[1];
  assert.equal(hic(0), '#dfccff');
  for (let t = 1; t <= 6; t += 1) assert.equal(hic(t), TIERS[t].accent);
  // Thumbnails: no fx markup from the species.
  assert.ok(!R({ size: 72 }).includes('dragon-ring'));
  assert.ok(!R({ size: 72 }).includes('dragon-hiccup'));
});

test('tier items replace each other (CONTENT.md tier table)', () => {
  const g = (tier, name, mood = 'healthy') => group(R({ tier, mood }), name);
  // Ordinary: no markings or accessories.
  assert.equal(g(0, 'markings'), '');
  assert.equal(g(0, 'acc-body'), '');
  assert.equal(g(0, 'acc-brow'), '');
  // Rare: 4 accent spine ridges; nothing else.
  const spines = (tier) => (g(tier, 'tail').match(new RegExp(`fill="${TIERS[tier].accent}" stroke="#1a1530" stroke-width="2.8"`, 'g')) || []).length;
  assert.equal(spines(1), 4);
  assert.equal(g(1, 'acc-body'), '');
  // SR: ridges + plate edging (thin accent lines) + coin at the hand.
  assert.equal(spines(2), 4);
  assert.equal((g(2, 'markings').match(/class="thin"[^>]*stroke="#23866a" stroke-width="1.5"/g) || []).length, 3);
  assert.match(g(2, 'acc-body'), /class="dragon-coin"><circle cx="108" cy="117" r="7" fill="#ffd34d"/);
  assert.match(g(2, 'acc-body'), /stroke="#a8611f"/);
  // Epic: coin replaced by the gem amulet; ridges and edging glow.
  assert.ok(!g(3, 'acc-body').includes('dragon-coin'));
  assert.match(g(3, 'acc-body'), /class="dragon-amulet"/);
  assert.match(g(3, 'acc-body'), /fill="#c9a2ff"/);
  assert.match(g(3, 'acc-body'), /stroke="#6a3fc4" stroke-width="2"/);
  assert.match(g(3, 'tail'), /class="dragon-ridge" filter="url\(#[^)]+-glow-c9a2ff-2\)"/);
  assert.match(g(3, 'markings'), /filter="url\(#[^)]+-glow-c9a2ff-2\)"/);
  // Mythic: no amulet, no ridges; crescent rings on both horns; 5 white star specks on the wings.
  assert.equal(g(4, 'acc-body'), '');
  assert.equal(spines(4), 0);
  assert.equal((g(4, 'occlude-front').match(/fill="#ffe4f2" stroke="#a83a74"/g) || []).length, 4, '2 rings + 2 moons');
  assert.equal((g(4, 'wing-back').match(/fill="#ffffff" opacity=".75"/g) || []).length, 5);
  // Legendary: gold horn caps, flame-tipped spade and wing tips, forehead gem at the brow, trim.
  assert.equal((g(5, 'occlude-front').match(/fill="#ffe08a"/g) || []).length, 2);
  assert.equal((g(5, 'wing-back').match(/class="flame"/g) || []).length, 2);
  assert.equal((g(5, 'tail').match(/class="flame"/g) || []).length, 1);
  assert.match(g(5, 'acc-brow'), /class="dragon-brow-gem"><path d="M80 45L84 50L80 55L76 50Z" fill="#ffe08a"/);
  assert.match(g(5, 'head') + g(5, 'markings'), /class="trim"/);
  assert.equal(g(5, 'acc-body'), '');
  // Ultra: pale membranes under the prism overlay (not see-through: the page showed through grey) with
  // 3 glowing star cut-outs, prismatic horn caps and brow gem, iridescent overlay.
  const w6 = g(6, 'wing-back');
  assert.equal((w6.match(/class="prism"/g) || []).length, 2);
  assert.equal((w6.match(/fill="#fff3b0" fill-opacity=".35"/g) || []).length, 2);
  assert.ok(!g(6, 'wing-back').includes('class="flame"'));
  assert.match(g(6, 'occlude-front'), /fill="url\(#[^)]+-prism-fill\)"/);
  assert.match(g(6, 'acc-brow'), /fill="url\(#[^)]+-prism-fill\)"/);
  assert.match(g(6, 'body'), /class="prism"/);
  assert.match(g(6, 'head'), /class="prism"/);
  // At most one body accessory and one brow item at every tier; tier items never use headTop.
  for (let t = 0; t <= 6; t += 1) {
    const acc = g(t, 'acc-body');
    assert.ok((acc.match(/class="dragon-(coin|amulet)"/g) || []).length <= 1, `tier ${t}: one body accessory`);
    assert.ok((g(t, 'acc-brow').match(/class="dragon-brow-gem"/g) || []).length <= 1);
    assert.equal(group(R({ tier: t }), 'cosmetic'), '');
  }
});

test('72 px thumbnails drop strokes under 2 px from markings (via .thin) and the Legendary trim', () => {
  for (let tier = 0; tier <= 6; tier += 1) {
    const m = group(R({ tier, size: 72 }), 'markings');
    for (const s of m.matchAll(/<path([^>]*)stroke-width="([\d.]+)"/g)) {
      if (+s[2] < 2) assert.match(s[1], /class="thin"/, `tier ${tier}: thin stroke without .thin`);
    }
    assert.ok(!R({ tier, size: 72 }).includes('class="trim"'), `tier ${tier}: trim at 72`);
  }
});

test('silhouette: filled shapes only, no fill/stroke, drives grave, ashes and Petdex', () => {
  const sil = dragon.silhouette();
  assert.ok((sil.match(/<path\b/g) || []).length >= 7);
  assert.ok(!/\sfill=|\sstroke=/.test(sil));
  assert.ok(!/NaN|undefined/.test(sil));
  const grave = R({ mood: 'dead', size: 128 });
  assertWellFormed(grave, 'grave');
  assert.match(grave, /class="grave-carving"/);
  assert.ok(grave.includes(sil));
  assert.match(grave, />Ember<\/text>/);
  for (let done = 0; done <= 3; done += 1) {
    const ash = R({ mood: 'ashes', tier: 5, ashesDone: done });
    assertWellFormed(ash, 'ashes');
    assert.ok(ash.includes(sil));
    assert.equal((ash.match(/class="ash-seg ash-seg--on"/g) || []).length, done);
  }
  for (const size of [72, 128]) {
    const s = renderSilhouette({ species: 'dragon', size });
    assertWellFormed(s, 'silhouette');
    assert.ok(s.includes(sil) && !s.includes('TODO'));
  }
});

test('pets.css dragon block: idle on focus only, eat/cheer overrides, every keyframe defined, prefixed', async () => {
  const css = await readFile(join(here, '..', 'pets', 'pets.css'), 'utf8');
  const start = css.indexOf('/* ===== species: dragon ===== */');
  const end = css.indexOf('/* ===== end species: dragon ===== */');
  assert.ok(start >= 0 && end > start);
  const block = css.slice(start, end);
  const defined = new Set([...css.matchAll(/@keyframes\s+([\w-]+)/g)].map((m) => m[1]));
  for (const k of [...block.matchAll(/@keyframes\s+([\w-]+)/g)].map((m) => m[1])) assert.ok(k.startsWith('dragon-'), `keyframes ${k} not prefixed`);
  for (const m of block.matchAll(/animation:\s*([\w-]+)/g)) if (m[1] !== 'none') assert.ok(defined.has(m[1]), `keyframes ${m[1]} missing`);
  // Every looping animation is scoped to the focused pet; one-shots to a trigger class.
  for (const m of block.matchAll(/([^{}]+)\{[^{}]*animation:\s*([\w-]+)[^}]*\}/g)) {
    const sel = m[1].trim(), name = m[2];
    if (name === 'none') continue;
    assert.ok(/pet--focus|pet--eat|pet--cheer/.test(sel), `unscoped animation ${name}: ${sel}`);
    assert.ok(!/pet--thumb/.test(sel));
  }
  assert.match(block, /\.pet--focus \.pet-idle--dragon \{ animation: dragon-idle var\(--idle-every/);
  assert.match(block, /\.pet--dragon\.pet--eat \.pet-act/);
  assert.match(block, /\.pet--dragon\.pet--cheer \.pet-idle--dragon/);
  assert.match(block, /dragon-chomp/);
  assert.match(block, /dragon-hiccup/);
});
