// Bramblekin (hedgehog) species art: CONTENT.md §A.2 "Bramblekin" + the species contract in
// pets/species/_template.js. Pure string checks (no DOM).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  renderPet, renderSilhouette, speciesStatus, validateSpecies, getSpecies, silhouetteOf,
  GROUPS, FACE_CLASSES, LIVE_MOODS, TIERS,
} from '../pets/index.js';
import hedgehog from '../pets/species/hedgehog.js';

const here = dirname(fileURLToPath(import.meta.url));
const SIZES = [200, 128, 72];

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
const count = (svg, s) => svg.split(s).length - 1;
/** Inner markup of the first <g class="g-NAME"> (balanced). */
function group(svg, name) {
  const open = `<g class="g-${name}">`;
  const start = svg.indexOf(open);
  assert.ok(start >= 0, `group ${name} missing`);
  let depth = 0, i = start;
  const re = /<(\/?)g\b[^>]*?(\/?)>/g;
  re.lastIndex = start;
  let m;
  while ((m = re.exec(svg))) {
    if (m[2]) continue;
    depth += m[1] ? -1 : 1;
    if (depth === 0) { i = m.index; break; }
  }
  return svg.slice(start + open.length, i);
}
const r = (o) => renderPet({ species: 'hedgehog', name: 'Thimble', level: 7, ...o });

test('the hedgehog module is loaded, valid and named per CONTENT.md', () => {
  assert.equal(speciesStatus().hedgehog, 'ready');
  assert.deepEqual(validateSpecies(hedgehog, 'hedgehog'), []);
  assert.equal(getSpecies('hedgehog'), hedgehog);
  assert.equal(hedgehog.name, 'Bramblekin');
  assert.equal(hedgehog.idleClass, 'pet-idle--hedgehog');
});

test('anchors match the Bramblekin brief (brow 80,56 · neck 80,100 · chest 80,116 · hand 80,118; headTop on the spine crown 80,35)', () => {
  const a = hedgehog.anchors;
  assert.deepEqual(a.headTop, [80, 35], 'art pass: the hat sits on the spine crown (owner review)');
  assert.deepEqual(a.brow, [80, 56]);
  assert.deepEqual(a.neck, [80, 100]);
  assert.deepEqual(a.chest, [80, 116]);
  assert.deepEqual(a.hand, [80, 118]);
  assert.equal(a.accScale, 1);
  assert.ok(Array.isArray(a.mouth) && a.mouth.every(Number.isFinite));
});

test('every tier × live mood × size renders a sound SVG: groups in order, unique resolving ids, no NaN', () => {
  for (let tier = 0; tier <= 6; tier += 1) {
    for (const mood of LIVE_MOODS) {
      for (const size of SIZES) {
        const where = `hedgehog/${tier}/${mood}/${size}`;
        const svg = r({ tier, mood, size, focus: size === 200, stars: (tier % 5) + 1 });
        assert.ok(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160"'), where);
        assert.match(svg, new RegExp(`width="${size}" height="${size}"`), where);
        assert.ok(!/NaN|undefined|null|\[object|Infinity/.test(svg), `${where}: bad value in markup`);
        assertWellFormed(svg, where);
        const list = ids(svg);
        assert.equal(new Set(list).size, list.length, `${where}: duplicate ids`);
        for (const ref of refs(svg)) assert.ok(list.includes(ref), `${where}: url(#${ref}) has no target`);
        assert.deepEqual([...svg.matchAll(/class="g-([a-z-]+)"/g)].map((m) => m[1]), GROUPS, where);
        assert.match(svg, new RegExp(`class="pet pet--hedgehog pet--tier-${tier} pet--${TIERS[tier].key} pet--mood-${mood} pet--s${size}`), where);
        assert.ok(!svg.includes('pet--fallback') && !svg.includes('fallback-marker'), `${where}: fallback used`);
        assert.ok(svg.includes('class="pet-idle pet-idle--hedgehog"'), `${where}: idle class`);
        // 13 spines (fill + contour wrappers) plus the 2 copies (±46°) in occlude-front.
        assert.equal(count(svg, 'class="hh-sp"'), 30, `${where}: spine count`);
        assert.ok(svg.includes('class="hh-nose"'), `${where}: nose`);
        assert.equal(count(svg, 'class="hh-arm '), 2, `${where}: two arms`);
        assert.ok(svg.includes('class="hh-held"'), `${where}: held food for eating`);
      }
    }
  }
});

test('ids are unique across many hedgehogs on one page', () => {
  const page = [];
  for (let i = 0; i < 28; i += 1) page.push(r({ tier: i % 7, mood: LIVE_MOODS[i % 4], size: SIZES[i % 3] }));
  const all = page.flatMap(ids);
  assert.ok(all.length > 200);
  assert.equal(new Set(all).size, all.length);
});

test('same uid → identical markup', () => {
  assert.equal(r({ tier: 4, mood: 'happy', uid: 'phh1' }), r({ tier: 4, mood: 'happy', uid: 'phh1' }));
});

test('faces: every mood draws its face parts; nose and bead eyes at the brief positions', () => {
  const has = (svg, c) => svg.includes(`class="${c}"`);
  const h = r({ mood: 'healthy' }), hp = r({ mood: 'happy' }), hu = r({ mood: 'hungry' }), st = r({ mood: 'starving' });
  assert.ok(has(h, 'eyes-open') && has(h, 'mouth-smile') && h.includes('face-react'));
  assert.ok(has(hp, 'eyes-happy') && has(hp, 'mouth-open'));
  assert.ok(has(hu, 'eyes-half') && has(hu, 'mouth-wavy') && hu.includes('class="fx-growl"'));
  assert.ok(has(st, 'eyes-hollow') && has(st, 'mouth-o') && has(st, 'tear'));
  assert.match(st, /class="pet-mood" filter="url\(#[^)]+-starve\)"/);
  for (const c of FACE_CLASSES) assert.ok([h, hp, hu, st].join('').includes(`class="${c}"`), c);
  assert.match(group(h, 'face'), /<ellipse cx="66" cy="72" rx="6" ry="6.75"/);
  assert.match(group(h, 'face'), /<ellipse cx="94" cy="72" rx="6" ry="6.75"/);
  assert.match(group(h, 'face'), /class="hh-nose"><ellipse cx="80" cy="82"/);
  assert.match(group(hu, 'face'), /class="hh-nose"><ellipse cx="80" cy="84"/, 'hungry: nose lowered');
  assert.match(r({ tier: 6 }), /class="eyes-open"><ellipse[^>]*\/><ellipse[^>]*\/><path d="M/, 'Ultra star highlight');
});

test('mood poses: paws touch in front (happy: overlap), hungry ears droop, starving spines bend forward', () => {
  const paws = (svg) => [...group(svg, 'arms').matchAll(/<g transform="translate\(([\d.]+) ([\d.]+)\) rotate/g)].map((m) => [+m[1], +m[2]]).sort((a, b) => a[0] - b[0]);
  const ears = (svg) => [...group(svg, 'head').matchAll(/class="hh-ear" transform="translate\([\d.]+ [\d.]+\) rotate\((-?[\d.]+)\)/g)].map((m) => +m[1]);
  const gap = (svg) => { const [[a], [b]] = paws(svg); return b - a; };
  assert.equal(paws(r({})).length, 2);
  assert.deepEqual(paws(r({})), [[71.5, 117], [88.5, 117]], 'paws (8.5 wide radius) meet at x 80');
  assert.ok(gap(r({ mood: 'happy' })) < 17, 'happy paws overlap at the middle');
  assert.ok(paws(r({ mood: 'hungry' }))[0][1] > 118, 'hungry paws rest lower on the belly');
  // Arms are short stubs now, not long diagonals across the belly.
  for (const [, x0, y0, x1, y1] of group(r({}), 'arms').matchAll(/<path d="M([\d.]+) ([\d.]+)L([\d.]+) ([\d.]+)" fill="none" stroke="#1a1530"/g)) {
    assert.ok(Math.hypot(x1 - x0, y1 - y0) < 12, 'arm stub length');
  }
  const [hl, hr] = ears(r({})), [ul, ur] = ears(r({ mood: 'hungry' }));
  assert.ok(Math.abs(ul) - Math.abs(hl) >= 15 && Math.abs(ur) - Math.abs(hr) >= 15, 'ears droop ≥ 15° when hungry');
  // Starving: no forehead fringe (it read as a wig); the spines themselves bend forward instead.
  for (const mood of LIVE_MOODS) assert.ok(!r({ mood }).includes('hh-fringe'), mood);
  assert.notEqual(group(r({ mood: 'starving' }), 'tail'), group(r({}), 'tail'));
});

test('occlude-front holds only the ±46° spines, clipped outside the head; hats sit on the crown', () => {
  const occ = group(r({}), 'occlude-front');
  assert.match(occ, /^<g clip-path="url\(#[^)]+-crown\)">/);
  const idx = [...occ.matchAll(/class="hh-sp" style="--i:(\d+)/g)].map((m) => +m[1]);
  assert.deepEqual([...new Set(idx)].sort(), [4, 8]);
  assert.equal(group(r({}), 'cosmetic'), '', 'no cosmetic by default; tier items never use headTop');
  assert.match(group(r({ cosmetic: 'heartPatchBeret' }), 'cosmetic'), /^<g transform="translate\(80 35\)/);
  // Spines ripple from their own origin, indexed left → right 0–12.
  const all = [...r({}).matchAll(/class="hh-sp" style="--i:(\d+);transform-origin:[\d.]+px [\d.]+px"/g)].map((m) => +m[1]);
  assert.deepEqual([...new Set(all)].sort((a, b) => a - b), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
});

test('tier items follow the brief and replace each other (exact hex)', () => {
  const t = (tier) => r({ tier, size: 128 });
  const tips = (svg) => svg.includes('-tips)');
  const band = (svg) => svg.includes('-band)');
  const pouch = (svg) => svg.includes('class="hh-pouch"');
  // Ordinary: plain.
  assert.ok(!tips(t(0)) && !band(t(0)) && !pouch(t(0)));
  // Rare: pale spine tips in belly.
  assert.ok(tips(t(1)) && !band(t(1)) && t(1).includes(`fill="${TIERS[1].belly}"`));
  // SR: tips + an accent band across the fan.
  assert.ok(tips(t(2)) && band(t(2)) && t(2).includes(`fill="${TIERS[2].accent}"`));
  // Epic: the seed pouch (belly, 3 px accent strap) with the Epic glow; tips/band replaced.
  const e = t(3);
  assert.ok(pouch(e) && !tips(e) && !band(e));
  assert.match(group(e, 'markings'), new RegExp(`stroke="${TIERS[3].accent}" stroke-width="3"`));
  assert.match(group(e, 'acc-body'), new RegExp(`fill="${TIERS[3].belly}"`));
  assert.match(e, /flood-color="#c9a2ff"/);
  // Mythic: leaf spine markings in accent + an acorn pin (#8a5a3b cap, #ffe4f2 nut) on the pouch.
  const my = t(4);
  assert.ok(pouch(my) && my.includes('fill="#8a5a3b"') && my.includes('fill="#ffe4f2"'));
  assert.ok(count(group(my, 'head'), `fill="${TIERS[4].accent}"/>`) >= 3, 'leaf markings');
  // Legendary: alternating #ffe08a sunburst wedges, a gold clasp, the 1.5 px trim.
  const lg = t(5);
  assert.ok(pouch(lg) && count(lg, 'fill="#ffe08a" opacity=".95"') === 7 + 2, 'seven alternating wedges (+2 in the occlude copies)');
  assert.match(group(lg, 'acc-body'), /fill="#ffe08a"/);
  assert.match(lg, /class="trim"[^>]*stroke="#ffe08a" stroke-width="1.5"/);
  assert.ok(!my.includes('opacity=".95"') && !lg.includes('#8a5a3b'), 'markings replace, not pile up');
  // Ultra: one continuous prismatic rim + the shared iridescent overlay; no pouch.
  const u = t(6);
  assert.ok(!pouch(u) && u.includes('-rim)') && u.includes('-rim-grad)'));
  for (const c of TIERS[6].iridescent) assert.ok(u.includes(`stop-color="${c}"`), c);
  assert.match(u, /class="prism"/);
  // Body/shade colours come straight from the tier ladder.
  for (let tier = 0; tier <= 6; tier += 1) {
    const svg = t(tier);
    assert.ok(svg.includes(`fill="${TIERS[tier].body}"`) && svg.includes(`fill="${TIERS[tier].shade}"`), `tier ${tier} palette`);
  }
});

test('thumbnails (72 px) drop the thin details and keep a clear silhouette', () => {
  const thumb = r({ tier: 4, size: 72 });
  const big = r({ tier: 4, size: 200 });
  assert.match(thumb, /pet--thumb/);
  assert.ok(!thumb.includes('pet--focus'));
  assert.ok(thumb.includes('class="aura-ring-static"'));
  const crease = 'stroke-width="1.5" stroke-linecap="round" opacity=".85"';
  assert.ok(!thumb.includes(crease) && big.includes(crease), 'spine creases (1.5 px) left out at 72');
  assert.ok(!thumb.includes('r="1.1"') && big.includes('r="1.1"'), 'toe beans hidden at 72');
});

test('silhouette: plain filled shapes for the gravestone, ashes and Petdex', () => {
  const sil = hedgehog.silhouette();
  assert.equal(silhouetteOf('hedgehog'), sil);
  assert.ok(!/fill=|stroke=/.test(sil), 'no fill/stroke attributes');
  assert.ok(!/NaN|undefined/.test(sil));
  const tags = [...sil.matchAll(/<([a-z]+)\b/g)].map((m) => m[1]);
  assert.ok(tags.every((t) => t === 'path' || t === 'ellipse'), tags.join());
  assert.ok(tags.length >= 15);
  for (const svg of [renderSilhouette({ species: 'hedgehog', size: 72 }), r({ mood: 'dead', level: 9 }), r({ mood: 'ashes', tier: 4, ashesDone: 2 })]) {
    assertWellFormed(svg, 'state');
    assert.ok(!svg.includes('fallback'), 'no fallback');
    assert.ok(svg.includes(sil.slice(0, 40)), 'uses the hedgehog silhouette');
  }
});

test('pets.css: the hedgehog block holds the idle sniff + spine ripple, cheer and eating, all prefixed', async () => {
  const css = await readFile(join(here, '..', 'pets', 'pets.css'), 'utf8');
  const start = css.indexOf('/* ===== species: hedgehog ===== */');
  const end = css.indexOf('/* ===== end species: hedgehog ===== */');
  assert.ok(start >= 0 && end > start);
  const block = css.slice(start, end);
  for (const k of ['hedgehog-idle', 'hedgehog-sniff', 'hedgehog-ripple', 'hedgehog-eat-arm', 'hedgehog-held', 'hedgehog-orb', 'hedgehog-eat-head']) {
    assert.match(block, new RegExp(`@keyframes ${k} \\{`), k);
  }
  assert.match(block, /\.pet--focus \.pet-idle--hedgehog \{ animation: hedgehog-idle var\(--idle-every/);
  assert.match(block, /\.pet--hedgehog\.pet--cheer \.pet-idle--hedgehog \{ animation: hedgehog-idle 10s/);
  assert.match(block, /\.pet--hedgehog\.pet--eat \.pet-act \{/);
  assert.match(block, /calc\([^)]*var\(--i\) \* 50ms\)/, '50 ms stagger');
  // Every class in the block is the rig's or prefixed with hh-/hedgehog.
  const classes = [...block.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/\.([a-z][\w-]*)/g)].map((m) => m[1]);
  const shared = new Set(['pet', 'pet--focus', 'pet--cheer', 'pet--eat', 'pet--thumb', 'pet--hedgehog', 'pet-idle--hedgehog', 'pet-act', 'pet-headrig']);
  for (const c of classes) assert.ok(shared.has(c) || c.startsWith('hh-'), `unprefixed class .${c}`);
  // The idle (wrapper) motion never runs on thumbnails, and nothing animates outside focus/triggers.
  assert.match(block, /\.pet--thumb \.hh-nose, \.pet--thumb \.hh-sp/);
  for (const rule of block.replace(/\/\*[\s\S]*?\*\//g, '').split('}').filter((x) => /animation:\s*hedgehog/.test(x) && !x.includes('@keyframes'))) {
    assert.ok(/pet--focus|pet--cheer|pet--eat/.test(rule), `animation outside focus/trigger: ${rule.trim().slice(0, 80)}`);
  }
});
