// Kitsu (fox) species: contract, every tier × mood × size, tier items, poses and CSS motion.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { renderPet, renderSilhouette, speciesStatus, validateSpecies, getSpecies, GROUPS, SPECIES_GROUPS, LIVE_MOODS, TIERS } from '../pets/index.js';
import { makeContext } from '../pets/rig.js';
import fox from '../pets/species/fox.js';

const here = dirname(fileURLToPath(import.meta.url));

// ---------- helpers ----------

/** Minimal well-formedness check: tags balance, attributes are quoted, no stray brackets. */
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
/** Inner markup of the first <g class="g-NAME"> (balanced). */
function group(svg, name) {
  const open = `<g class="g-${name}">`;
  const start = svg.indexOf(open);
  if (start < 0) return null;
  let depth = 0;
  const re = /<(\/?)g\b[^>]*?(\/?)>/g;
  re.lastIndex = start;
  let m;
  while ((m = re.exec(svg))) {
    if (m[2]) continue;
    depth += m[1] ? -1 : 1;
    if (depth === 0) return svg.slice(start + open.length, m.index);
  }
  return null;
}
const parts = (tier, mood, size = 128) => fox.draw(makeContext({ species: 'fox', tier, mood, size, uid: 'pfx' }));
const numbers = (s) => [...s.matchAll(/-?\d+(?:\.\d+)?/g)].map((m) => Number(m[0]));

// ---------- contract ----------

test('fox module is ready and satisfies the species contract', () => {
  assert.equal(speciesStatus().fox, 'ready');
  assert.deepEqual(validateSpecies(fox, 'fox'), []);
  assert.equal(getSpecies('fox'), fox);
  assert.equal(fox.name, 'Kitsu');
  assert.equal(fox.idleClass, 'pet-idle--fox');
  // CONTENT.md anchors (neck/chest/tailTip/mouth adjusted to where the art actually is).
  assert.deepEqual(fox.anchors.headTop, [80, 34]);
  assert.deepEqual(fox.anchors.brow, [80, 52]);
  assert.equal(fox.anchors.accScale, 0.95);
  for (const [k, v] of Object.entries(fox.anchors)) {
    if (k === 'accScale') continue;
    assert.ok(v[0] >= 20 && v[0] <= 140 && v[1] >= 20 && v[1] <= 148, `anchor ${k} inside the character box`);
  }
});

test('every tier × live mood × size renders a sound SVG with unique ids and all groups in order', () => {
  const seen = new Set();
  for (let tier = 0; tier <= 6; tier += 1) {
    for (const mood of LIVE_MOODS) {
      for (const size of [200, 128, 72]) {
        for (const stars of [1, 5]) {
          const where = `fox/${tier}/${mood}/${size}/${stars}★`;
          const svg = renderPet({ species: 'fox', tier, mood, size, stars, name: 'Pip', level: 9, focus: size === 200 });
          assert.ok(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160"'), where);
          assert.ok(!/NaN|undefined|null|Infinity|\[object/.test(svg), `${where}: bad value in markup`);
          assert.ok(!svg.includes('pet--fallback') && !svg.includes('TODO'), `${where}: fell back`);
          assertWellFormed(svg, where);
          const list = ids(svg);
          assert.equal(new Set(list).size, list.length, `${where}: duplicate ids`);
          for (const r of refs(svg)) assert.ok(list.includes(r), `${where}: url(#${r}) has no target`);
          for (const i of list) { assert.ok(!seen.has(i), `${where}: id ${i} reused across renders`); seen.add(i); }
          assert.deepEqual(groupOrder(svg), GROUPS, where);
          assert.match(svg, new RegExp(`class="pet pet--fox pet--tier-${tier} pet--${TIERS[tier].key} pet--mood-${mood} pet--s${size}`), where);
          for (const w of ['pet-float', 'pet-act', 'pet-mood', 'pet-idle pet-idle--fox', 'pet-breathe', 'pet-headrig']) assert.ok(svg.includes(`class="${w}`), `${where}: ${w}`);
          // Every coordinate stays sane (nothing flung far outside the 160 box).
          const geometry = [...svg.matchAll(/\s(?:d|transform|cx|cy|r|rx|ry|x|y|width|height)="([^"]*)"/g)].map((g) => g[1]).join(' ');
          for (const n of numbers(geometry)) assert.ok(Math.abs(n) <= 640, `${where}: suspicious number ${n}`);
        }
      }
    }
  }
});

test('draw() returns only allowed groups, ids only via ctx.defOnce, and core parts for every mood', () => {
  for (let tier = 0; tier <= 6; tier += 1) {
    for (const mood of LIVE_MOODS) {
      for (const size of [128, 72]) {
        const ctx = makeContext({ species: 'fox', tier, mood, size, uid: 'pfox' });
        const out = fox.draw(ctx);
        for (const k of Object.keys(out)) assert.ok([...SPECIES_GROUPS, 'fx'].includes(k), `unknown group ${k}`);
        for (const k of ['body', 'legs', 'head', 'face', 'occlude-front']) assert.ok(out[k], `${tier}/${mood}: ${k} empty`);
        const markup = Object.values(out).join('') + ctx.defs.join('');
        for (const i of ids(markup)) assert.ok(i.startsWith('pfox-'), `literal id ${i}`);
        assert.ok(!/NaN|undefined/.test(markup), `${tier}/${mood}/${size}: bad value`);
        // The face renders the mood plus (except happy) the hidden happy copy.
        const faceCls = { healthy: 'eyes-open', happy: 'eyes-happy', hungry: 'eyes-half', starving: 'eyes-hollow' }[mood];
        assert.ok(out.face.includes(`class="${faceCls}"`), `${mood} face`);
      }
    }
  }
});

// ---------- poses ----------

test('mood poses: tail up (healthy/happy), wrapped (hungry), curled (starving); ears tilt by mood', () => {
  const earAngle = (p) => Number(p.head.match(/rotate\((-?[\d.]+) 0 12\)/)[1]);
  const h = parts(0, 'healthy'), hp = parts(0, 'happy'), hu = parts(0, 'hungry'), st = parts(0, 'starving');
  assert.ok(h.tail.includes('class="fox-tail"') && !h.arms, 'healthy: plume tail behind, nothing in front');
  assert.ok(hp.tail.includes('class="fox-tail"') && hp.tail.includes('rotate(-7 '), 'happy: tail lifted');
  assert.ok(!hu.tail.includes('fox-tail') && hu.arms.includes('clip-tail-wrap'), 'hungry: tail wrapped round the feet, in front');
  assert.ok(!st.tail.includes('fox-tail') && st.arms.includes('clip-tail-curl'), 'starving: tail curled high in front');
  // Left ear: base tilt -15°… -16° outward; hungry +35° (airplane), starving +70° (flat).
  assert.equal(earAngle(h), -16);
  assert.ok(earAngle(hp) > earAngle(h), 'happy ears perk up');
  assert.equal(earAngle(hu), -16 - 35);
  assert.equal(earAngle(st), -16 - 70);
  // Ear tips are repeated in front of a cosmetic, with the same tilt.
  for (const p of [h, hu, st]) {
    assert.equal((p['occlude-front'].match(/class="fox-ear fox-ear--/g) || []).length, 2);
    assert.equal(Number(p['occlude-front'].match(/rotate\((-?[\d.]+) 0 12\)/)[1]), earAngle(p));
  }
  // Starving lowers the head through CSS so a cosmetic follows it.
  return readFile(join(here, '..', 'pets', 'pets.css'), 'utf8').then((css) => assert.match(css, /\.pet--fox\.pet--mood-starving \{ --head-y: \d+px; \}/));
});

test('face: fox nose, "u" smile when healthy and "w" mouth with a tongue when happy', () => {
  const h = parts(0, 'healthy').face, hp = parts(0, 'happy').face;
  assert.match(h, /<g class="mouth-smile">/);
  assert.match(hp, /<g class="mouth-open">.*fill="#ff7fb6"/);
  assert.match(h, /<g class="face-happy face-react" display="none">.*class="mouth-open"/, 'hidden happy copy for triggers');
  for (const p of [h, hp]) assert.match(p, /^<path d="M76\.2 73\.4C/, 'nose first');
  assert.match(parts(0, 'starving').face, /class="tear"/);
});

// ---------- tier items (CONTENT.md §A.2 Kitsu) ----------

test('tier ladder: each tier replaces the previous markings/accessory with its own', () => {
  const T = Array.from({ length: 7 }, (_, t) => parts(t, 'healthy', 200));
  const all = (p) => Object.values(p).join('');
  const accent = (t) => TIERS[t].accent;
  // Ordinary: no markings, no accessories, no spirit tails.
  assert.ok(!all(T[0]).includes(accent(0)), 'Ordinary has no accent markings');
  assert.equal(T[0]['acc-body'], '');
  assert.equal(T[0]['acc-brow'], '');
  // Rare: ear tips + socks in accent.
  assert.ok(T[1].head.includes(`fill="${accent(1)}"`), 'Rare ear tips');
  assert.ok(T[1].legs.includes(`fill="${accent(1)}"`), 'Rare socks');
  assert.equal(T[1]['acc-body'], '');
  // Super Rare: + tail band, leaf bandana (#7ccf6b with #4f9a45 prints).
  assert.ok(T[2].tail.includes(`fill="${accent(2)}"`), 'SR tail band');
  assert.match(T[2]['acc-body'], /class="fox-bandana".*fill="#7ccf6b".*fill="#4f9a45"/);
  // Epic: the bandana is replaced by the bell collar; markings glow; 1 spirit tail.
  assert.ok(!T[3]['acc-body'].includes('fox-bandana'));
  assert.match(T[3]['acc-body'], new RegExp(`class="fox-collar".*stroke="${accent(3)}" stroke-width="4".*fill="#ffd34d"`));
  assert.match(T[3].head, /filter="url\(#pfx-glow-c9a2ff/);
  assert.equal((T[3].tail.match(/class="fox-spirit"/g) || []).length, 1);
  // Mythic: celestial specks replace the ear tips/socks; 2 spirit tails; a foxfire wisp.
  assert.ok(!T[4].legs.includes(`fill="${accent(4)}"`), 'Mythic drops the socks');
  const specks = (all(T[4]).match(/opacity="\.7"/g) || []).length;
  assert.equal(specks, 5, '5 celestial specks');
  assert.equal((T[4].tail.match(/class="fox-spirit"/g) || []).length, 2);
  assert.equal((T[4]['aura-front'].match(/class="aura-orbit fox-wisp"/g) || []).length, 1);
  // Legendary: gold brow diamond, gold collar, flame tips, trim, 4 spirit tails.
  assert.match(T[5]['acc-brow'], /fill="#ffe08a"/);
  assert.match(T[5]['acc-body'], /stroke="#ffe08a" stroke-width="4"/);
  assert.ok((all(T[5]).match(/class="flame"/g) || []).length >= 3, 'flame tips on ears and tail');
  assert.match(all(T[5]), /class="trim"/);
  assert.equal((T[5].tail.match(/class="fox-spirit"/g) || []).length, 4);
  assert.equal(T[5]['aura-front'], '', 'no wisp at Legendary');
  // Ultra: 8 sunburst spirit tails with the Ultra gradient, twin wisps, prismatic overlay.
  assert.equal((T[6].tail.match(/class="fox-spirit"/g) || []).length, 8);
  assert.equal((T[6]['aura-front'].match(/class="aura-orbit fox-wisp"/g) || []).length, 2);
  assert.match(all(T[6]), /class="prism"/);
  // At most one body accessory and one brow item; never at headTop (the cosmetic socket).
  for (const p of T) {
    assert.ok((p['acc-body'].match(/class="fox-(collar|bandana)"/g) || []).length <= 1);
    assert.ok(!p['acc-brow'] || /M80 47C/.test(p['acc-brow']), 'brow item at the brow anchor');
  }
});

test('spirit tails are aura: translucent, behind the real tail, and present in every mood', () => {
  for (const mood of LIVE_MOODS) {
    const p = parts(5, mood, 200);
    assert.match(p.tail, /^<g class="fox-spirits" opacity="\.75" filter=/, `${mood}: spirits drawn first (behind), glowing at 200 px`);
  }
  // Like the aura, they stay off thumbnails (the static ring stands in); the glow filter needs ≥ 128 px.
  assert.ok(!parts(6, 'healthy', 72).tail.includes('fox-spirits'), 'no spirit tails on thumbnails');
  assert.match(parts(6, 'healthy', 128).tail, /^<g class="fox-spirits" opacity="\.75" filter=/);
  // Plumes stay inside the 160 box: 4 (Legendary) and 8 (Ultra) smaller plumes fanned round (80, 114).
  assert.equal((parts(5, 'healthy', 200).tail.match(/class="fox-spirit"/g) || []).length, 4);
  assert.equal((parts(6, 'healthy', 200).tail.match(/class="fox-spirit"/g) || []).length, 8);
  assert.match(parts(6, 'healthy', 200).tail, /translate\(80 114\) rotate\(-96\)/);
  const ctx = makeContext({ species: 'fox', tier: 6, mood: 'healthy', size: 128, uid: 'pu' });
  fox.draw(ctx);
  assert.ok(ctx.defs.some((d) => d.includes('pu-spirit-grad') && d.includes('#ffd3ec')), 'Ultra gradient fill');
});

test('thumbnails: thin markings are tagged, no wisps, static ring', () => {
  const svg = renderPet({ species: 'fox', tier: 4, size: 72, focus: true });
  assert.match(svg, /pet--thumb/);
  assert.ok(!svg.includes('pet--focus'));
  assert.ok(!svg.includes('fox-wisp'), 'no orbiting wisp on thumbnails');
  assert.match(svg, /aura-ring-static/);
  // Hairline details (strokes under 2 px, class "thin") are left out entirely at 72 px.
  for (let tier = 0; tier <= 6; tier += 1) {
    for (const mood of LIVE_MOODS) {
      assert.ok(!Object.values(parts(tier, mood, 72)).join('').includes('class="thin"'), `${tier}/${mood}: thin detail at 72 px`);
      assert.ok(Object.values(parts(tier, mood, 128)).join('').includes('class="thin"'), `${tier}/${mood}: details at 128 px`);
    }
  }
});

test('dead, ashes and Petdex use the fox silhouette', () => {
  const sil = fox.silhouette();
  assert.ok((sil.match(/<path d="M/g) || []).length >= 4, 'tail, body, ears, head');
  assert.ok(!/\sfill=|\sstroke=|NaN/.test(sil));
  const grave = renderPet({ species: 'fox', mood: 'dead', name: 'Pip', level: 12, size: 128 });
  assertWellFormed(grave, 'grave');
  assert.ok(grave.includes(sil), 'grave carving uses the fox silhouette');
  const ashes = renderPet({ species: 'fox', tier: 4, mood: 'ashes', ashesDone: 2, size: 200 });
  assertWellFormed(ashes, 'ashes');
  assert.ok(ashes.includes(sil), 'ashes medallion and wisp use the fox silhouette');
  for (const size of [72, 128]) {
    const s = renderSilhouette({ species: 'fox', size });
    assertWellFormed(s, 'silhouette');
    assert.ok(s.includes(sil) && !s.includes('TODO'));
  }
});

test('same uid gives identical markup (deterministic)', () => {
  const a = renderPet({ species: 'fox', tier: 6, mood: 'happy', uid: 'pfixfox', name: 'Pip' });
  const b = renderPet({ species: 'fox', tier: 6, mood: 'happy', uid: 'pfixfox', name: 'Pip' });
  assert.equal(a, b);
});

// ---------- CSS block ----------

test('pets.css fox block: idle, wag, eat and cheer motion, scoped to focus or triggers', async () => {
  const css = await readFile(join(here, '..', 'pets', 'pets.css'), 'utf8');
  const start = css.indexOf('/* ===== species: fox ===== */');
  const end = css.indexOf('/* ===== end species: fox ===== */');
  assert.ok(start >= 0 && end > start);
  const block = css.slice(start, end);
  const defined = new Set([...block.matchAll(/@keyframes\s+([\w-]+)/g)].map((m) => m[1]));
  for (const k of ['fox-idle', 'fox-swish', 'fox-twitch', 'fox-wag', 'fox-snap', 'fox-puff']) assert.ok(defined.has(k), k);
  for (const k of defined) assert.ok(k.startsWith('fox-'), `keyframes ${k} must be prefixed`);
  // Every animation rule in the block is scoped to the focused pet or a trigger class (never always-on).
  for (const m of block.matchAll(/([^{}]+)\{[^{}]*\banimation:\s*(?![\s]|none)[^}]*\}/g)) {
    const sel = m[1].trim();
    if (sel.startsWith('@keyframes') || /^\d|^from|^to/.test(sel)) continue;
    assert.ok(/pet--focus|pet--eat|pet--cheer|pet--bounce/.test(sel), `unscoped animation: ${sel}`);
  }
  assert.match(block, /\.pet--focus \.pet-idle--fox \{ animation: fox-idle var\(--idle-every/);
  assert.match(block, /\.pet--fox\.pet--eat \.pet-headrig \{ animation: fox-snap 1\.2s/);
  assert.match(block, /\.pet--thumb [^{]*\.fox-tail[^{]*\{ animation: none !important; \}/);
  // The fox block only touches fox classes.
  for (const m of block.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/\.([a-z][\w-]*)/g)) {
    const c = m[1];
    assert.ok(c.startsWith('fox-') || c.startsWith('pet') || ['pet-act', 'pet-headrig'].includes(c), `foreign class .${c}`);
  }
});
