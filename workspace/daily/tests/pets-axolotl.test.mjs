import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { renderPet, renderSilhouette, speciesStatus, validateSpecies, getSpecies, GROUPS, MOODS, TIERS } from '../pets/index.js';
import axolotl from '../pets/species/axolotl.js';

const here = dirname(fileURLToPath(import.meta.url));
const SIZES = [200, 128, 72];
const LIVE = ['healthy', 'happy', 'hungry', 'starving'];

function assertWellFormed(svg, where) {
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
function assertIdsSound(svg, where) {
  const list = ids(svg);
  assert.equal(new Set(list).size, list.length, `${where}: duplicate ids`);
  for (const [, r] of svg.matchAll(/url\(#([^)]+)\)/g)) assert.ok(list.includes(r), `${where}: url(#${r}) has no target`);
}
/** Inner markup of the first <g class="g-NAME"> group (balanced). */
function group(svg, name) {
  const open = `<g class="g-${name}">`;
  const start = svg.indexOf(open);
  assert.ok(start >= 0, `g-${name} missing`);
  let depth = 0;
  const re = /<(\/?)g\b[^>]*?(\/?)>/g;
  re.lastIndex = start;
  let m;
  while ((m = re.exec(svg))) {
    if (m[2]) continue;
    depth += m[1] ? -1 : 1;
    if (depth === 0) return svg.slice(start + open.length, m.index);
  }
  throw new Error(`g-${name} not closed`);
}
const r = (o) => renderPet({ species: 'axolotl', name: 'Gil', level: 7, ...o });

test('axolotl module passes the species contract and loads as ready', () => {
  assert.deepEqual(validateSpecies(axolotl, 'axolotl'), []);
  assert.equal(speciesStatus().axolotl, 'ready');
  assert.equal(getSpecies('axolotl'), axolotl);
  assert.equal(axolotl.name, 'Ripplegill');
  assert.equal(axolotl.idleClass, 'pet-idle--axolotl');
  // CONTENT.md §A.2 anchors.
  const a = axolotl.anchors;
  assert.deepEqual([a.headTop, a.brow, a.neck, a.chest, a.tailTip], [[80, 40], [80, 56], [80, 98], [80, 112], [136, 104]]);
  assert.ok(Array.isArray(a.mouth) && a.mouth.every(Number.isFinite));
});

test('every tier × mood × size renders a sound SVG: well-formed, unique ids, all groups in order, no NaN', () => {
  let n = 0;
  for (let tier = 0; tier <= 6; tier += 1) {
    for (const mood of MOODS) {
      for (const size of SIZES) {
        for (const stars of [1, 5]) {
          const where = `axolotl/${tier}/${mood}/${size}/${stars}★`;
          const svg = r({ tier, mood, size, stars, focus: size === 200, ashesDone: tier % 4 });
          assert.ok(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160"'), where);
          assert.match(svg, new RegExp(`width="${size}" height="${size}"`), where);
          assert.ok(!/NaN|undefined|null|\[object|Infinity/.test(svg), `${where}: bad value in markup`);
          assertWellFormed(svg, where);
          assertIdsSound(svg, where);
          assert.ok(!svg.includes('pet--fallback') && !svg.includes('TODO'), `${where}: fallback used`);
          if (mood === 'dead') { assert.match(svg, /pet--grave/, where); assert.match(svg, /class="grave-carving"/, where); }
          else if (mood === 'ashes') { assert.match(svg, /pet--ashes/, where); }
          else {
            assert.deepEqual([...svg.matchAll(/class="g-([a-z-]+)"/g)].map((m) => m[1]), GROUPS, where);
            assert.match(svg, new RegExp(`class="pet pet--axolotl pet--tier-${tier} pet--${TIERS[tier].key} pet--mood-${mood} pet--s${size}`), where);
            assert.match(svg, /class="pet-idle pet-idle--axolotl"/, where);
          }
          n += 1;
        }
      }
    }
  }
  assert.equal(n, 7 * 6 * 3 * 2);
});

test('ids stay unique when many axolotls share a page; same uid → identical markup', () => {
  const page = [];
  for (let i = 0; i < 28; i += 1) page.push(r({ tier: i % 7, mood: LIVE[i % 4], size: SIZES[i % 3], stars: (i % 5) + 1 }));
  const all = page.flatMap(ids);
  assert.ok(all.length > 50);
  assert.equal(new Set(all).size, all.length);
  assert.equal(r({ tier: 6, mood: 'happy', uid: 'pax1' }), r({ tier: 6, mood: 'happy', uid: 'pax1' }));
});

test('gills: 3 fronds a side in g-occlude-front, posed per mood; head parts stay in the head rig', () => {
  const frondAngles = (svg) => [...group(svg, 'occlude-front').matchAll(/<g transform="translate\(([\d.]+) [\d.]+\) rotate\((-?[\d.]+)\)"><g class="axolotl-frond" style="--i:(\d);--dir:(-?1)">/g)]
    .map(([, x, a, i, dir]) => ({ x: +x, a: +a, i: +i, dir: +dir }));
  const healthy = frondAngles(r({ mood: 'healthy' }));
  assert.equal(healthy.length, 6);
  assert.equal(healthy.filter((fr) => fr.dir === -1 && fr.x < 80).length, 3, 'left fronds on the left');
  assert.equal(healthy.filter((fr) => fr.dir === 1 && fr.x > 80).length, 3, 'right fronds on the right');
  // Right side fans at −30°, 0°, +30°.
  assert.deepEqual(healthy.filter((fr) => fr.dir === 1).map((fr) => fr.a).sort((a, b) => a - b), [-30, 0, 30]);
  const right = (mood) => frondAngles(r({ mood })).filter((fr) => fr.dir === 1);
  const mid = (mood) => right(mood).find((fr) => fr.i === 1).a;
  assert.equal(mid('hungry'), 25, 'hungry: gills droop 25°');
  assert.equal(mid('starving'), 50, 'starving: gills hang 50°');
  const spread = (mood) => { const a = right(mood).map((fr) => fr.a); return Math.max(...a) - Math.min(...a); };
  assert.equal(spread('happy') - spread('healthy'), 30, 'happy: the fan opens 15° each way');
  // Starving fronds are desaturated to #978daa.
  assert.match(group(r({ mood: 'starving', tier: 3 }), 'occlude-front'), /fill="#978daa"/);
  assert.ok(!group(r({ mood: 'healthy', tier: 3 }), 'occlude-front').includes('fill="#978daa"'));
  // Pink tip edge (1.5 px visible band) at full size; a solid pink cap at 72 px.
  assert.match(group(r({ size: 200 }), 'occlude-front'), /stroke="#ff7fb6" stroke-width="6"/);
  assert.match(group(r({ size: 72 }), 'occlude-front'), /fill="#ff7fb6"/);
});

test('faces: small wide-set eyes, wide smile, mood overrides (hungry → mouth-o)', () => {
  const healthy = group(r({ mood: 'healthy' }), 'face');
  assert.match(healthy, /class="eyes-open"/);
  assert.match(healthy, /class="mouth-smile"><path d="M66\.5 82\.6Q80 93\.4 93\.5 82\.6"/);
  assert.match(healthy, /<ellipse cx="58" cy="70"[^>]*\/>.*<ellipse cx="102" cy="70"/);
  const happy = group(r({ mood: 'happy' }), 'face');
  assert.match(happy, /class="eyes-happy"/);
  const openW = (() => { const m = happy.match(/class="mouth-open"><path d="M([\d.]+) [\d.]+Q80 [\d.]+ ([\d.]+)/); return +m[2] - +m[1]; })();
  assert.ok(openW >= 28 * 1.18 && openW <= 28 * 1.25, `happy smile ~20 % wider (${openW})`);
  const hungry = group(r({ mood: 'hungry' }), 'face');
  assert.match(hungry, /class="face-mood face-hungry"><g class="blush"[^>]*>.*class="eyes-half".*class="mouth-o"/);
  assert.ok(!hungry.includes('mouth-wavy'));
  const starving = group(r({ mood: 'starving' }), 'face');
  for (const c of ['eyes-hollow', 'mouth-o', 'tear']) assert.ok(starving.includes(`class="${c}"`), c);
  // Hidden happy copy for triggered animations on every non-happy mood.
  for (const mood of ['healthy', 'hungry', 'starving']) assert.match(group(r({ mood }), 'face'), /class="face-happy face-react" display="none"/);
  // Eating whirl, cheek puff and idle bubble (not on thumbnails).
  assert.match(healthy, /class="axolotl-whirl"[^>]*><path[^>]*stroke="#ffffff" stroke-width="1\.5"/);
  assert.match(healthy, /class="axolotl-puff"/);
  assert.match(healthy, /class="axolotl-bubble"/);
  assert.ok(!group(r({ size: 72 }), 'face').includes('axolotl-'));
});

test('starving: pale body, feet tucked under the chin', () => {
  const s = r({ mood: 'starving', tier: 0 });
  assert.equal(group(s, 'legs'), '');
  assert.ok(group(s, 'arms').length > 0);
  assert.ok(!group(s, 'body').includes('fill="#c2bad0"'), 'body is paler than the tier body colour');
  const h = r({ mood: 'healthy', tier: 0 });
  assert.equal(group(h, 'arms'), '');
  assert.match(group(h, 'body'), /fill="#c2bad0"/);
});

test('tier items replace each other (CONTENT.md Ripplegill tier table)', () => {
  const at = (tier, size = 200) => r({ tier, size });
  const freckles = (svg, accent) => (svg.match(new RegExp(`<circle cx="[\\d.]+" cy="[\\d.]+" r="2" fill="${accent}"/>`, 'g')) || []).length;
  // Ordinary: no markings or accessories.
  const o = at(0);
  assert.equal(group(o, 'markings'), '');
  assert.equal(group(o, 'acc-body'), '');
  assert.ok(!o.includes('axolotl-clip'));
  // Rare: 6 accent freckles on head and back.
  assert.equal(freckles(at(1), TIERS[1].accent), 6);
  assert.ok(!at(1).includes('axolotl-clip'));
  // SR: freckles + pale belly oval + flower clip (5 white petals, #ffd34d centre) on the right gill.
  const sr = at(2);
  assert.equal(freckles(sr, TIERS[2].accent), 6);
  assert.match(group(sr, 'markings'), new RegExp(`<ellipse cx="80" cy="122" rx="[\\d.]+" ry="[\\d.]+" fill="${TIERS[2].belly}"/>`));
  const clip = group(sr, 'occlude-front').match(/<g class="axolotl-clip">(.*?)<\/g>$/)[1];
  assert.equal((clip.match(/fill="#ffffff"/g) || []).length, 5);
  assert.match(clip, /fill="#ffd34d"/);
  // Epic: glowing gill tips (belly) + crystal clip; no freckles, no flower, no belly oval.
  const ep = at(3);
  assert.equal(freckles(ep, TIERS[3].accent), 0);
  assert.ok(!ep.includes('#ffd34d'));
  assert.equal(group(ep, 'markings'), '');
  assert.equal((group(ep, 'occlude-front').match(new RegExp(`r="3" fill="${TIERS[3].belly}"`, 'g')) || []).length, 6);
  assert.match(group(ep, 'occlude-front'), /class="axolotl-clip" filter="url\(#[^)]+\)"><path d="[^"]+" fill="#c9a2ff"/);
  // Mythic: translucent star-speckled tail fin + bubble halo of 6 (not on thumbnails).
  const my = at(4);
  assert.match(group(my, 'tail'), new RegExp(`stroke="${TIERS[4].belly}" stroke-width="13" stroke-linecap="round" opacity=".6"`));
  assert.equal((group(my, 'aura-back').match(/<circle [^>]*r="4" fill="#ffffff" fill-opacity/g) || []).length, 6);
  assert.ok(!group(at(4, 72), 'aura-back').includes('axolotl-halo'));
  assert.ok(!ep.includes('axolotl-halo'));
  // Legendary: gold-tipped gills, pearl on an accent cord at the neck, flame tip, trim.
  const lg = at(5);
  assert.match(group(lg, 'occlude-front'), /fill="#ffe08a"/);
  assert.match(group(lg, 'acc-body'), new RegExp(`stroke="${TIERS[5].accent}" stroke-width="2"`));
  assert.match(group(lg, 'acc-body'), /<circle cx="80" cy="108" r="6" fill="#fffbe8"/);
  assert.match(group(lg, 'acc-body'), /fill="#ffd3ec"/);
  assert.match(lg, /class="flame"/);
  assert.match(lg, /class="trim"/);
  assert.ok(!lg.includes('axolotl-clip'));
  // Ultra: aurora fronds + 3 orbiting bubbles + prism overlay; no pearl.
  const ul = at(6);
  assert.match(ul, /<linearGradient id="[^"]+-aurora"[^>]*><stop offset="0" stop-color="#d8ffef"\/><stop offset=".5" stop-color="#cfe8ff"\/><stop offset="1" stop-color="#ffd3ec"\/>/);
  assert.equal((group(ul, 'aura-front').match(/class="aura-orbit axolotl-orbit"/g) || []).length, 3);
  assert.match(ul, /class="prism"/);
  assert.equal(group(ul, 'acc-body'), '');
  // Tier accessories never use the head-top socket (the cosmetic group stays empty without a cosmetic).
  for (let t = 0; t <= 6; t += 1) assert.equal(group(at(t), 'cosmetic'), '');
});

test('72 px thumbnails: no thin (< 2 px) marking strokes left visible, no species extras', () => {
  for (let tier = 0; tier <= 6; tier += 1) {
    for (const mood of LIVE) {
      const svg = r({ tier, mood, size: 72, focus: true });
      assert.ok(!svg.includes('pet--focus'));
      const marks = group(svg, 'markings');
      for (const [tag] of marks.matchAll(/<[^>]*stroke-width="([\d.]+)"[^>]*>/g)) {
        const w = +tag.match(/stroke-width="([\d.]+)"/)[1];
        if (w < 2) assert.match(tag, /class="thin"/, `${tier}/${mood}: thin marking stroke without .thin`);
      }
      assert.ok(!svg.includes('axolotl-orbit') && !svg.includes('axolotl-halo') && !svg.includes('axolotl-whirl'));
    }
  }
});

test('silhouette: filled shapes only, used by grave, ashes and Petdex', () => {
  const sil = axolotl.silhouette();
  assert.ok(sil.length > 100);
  assert.ok(!/fill=|stroke=/.test(sil), 'no fill/stroke attributes');
  assert.ok(!/NaN|undefined/.test(sil));
  assert.equal((sil.match(/<path /g) || []).length, 6 + 6 + 1);
  const pet = renderSilhouette({ species: 'axolotl', size: 72 });
  assertWellFormed(pet, 'silhouette');
  assert.ok(pet.includes(sil) && !pet.includes('pet--fallback'));
  assert.ok(r({ mood: 'dead' }).includes(sil));
  assert.ok(r({ mood: 'ashes', tier: 4 }).includes(sil));
});

test('pets.css: the axolotl block holds the idle, cheer and eating motion, prefixed and scoped', async () => {
  const css = await readFile(join(here, '..', 'pets', 'pets.css'), 'utf8');
  const start = css.indexOf('/* ===== species: axolotl ===== */');
  const end = css.indexOf('/* ===== end species: axolotl ===== */');
  assert.ok(start > 0 && end > start);
  const block = css.slice(start, end);
  for (const k of ['axolotl-idle', 'axolotl-flutter', 'axolotl-bubble', 'axolotl-gulp', 'axolotl-whirl', 'axolotl-puff', 'axolotl-flare']) {
    assert.match(block, new RegExp(`@keyframes ${k} \\{`), k);
  }
  assert.match(block, /\.pet--focus \.pet-idle--axolotl \{ animation: axolotl-idle var\(--idle-every/);
  assert.match(block, /\.pet--axolotl\.pet--cheer \.pet-idle--axolotl/);
  assert.match(block, /\.pet--axolotl\.pet--eat \.pet-act/);
  // Every keyframe name and every class introduced here is prefixed with the species id.
  for (const [, name] of block.matchAll(/@keyframes ([\w-]+)/g)) assert.ok(name.startsWith('axolotl-'), name);
  for (const [, cls] of block.matchAll(/\.((?:pet-idle--)?[a-z][\w-]*)/g)) {
    assert.ok(cls.startsWith('axolotl') || cls.startsWith('pet'), `unprefixed class .${cls}`);
  }
  // Continuous motion only under .pet--focus; one-shots only under trigger classes.
  for (const line of block.split('\n').filter((l) => /animation:\s*axolotl-/.test(l))) {
    assert.match(line, /\.pet--focus|\.pet--cheer|\.pet--eat/, line);
  }
});
