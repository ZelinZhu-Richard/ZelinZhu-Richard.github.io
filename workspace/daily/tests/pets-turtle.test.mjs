// Pebbleback (turtle) species art: CONTENT.md §A.2 "Pebbleback (turtle)" + the species contract.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { renderPet, renderSilhouette, speciesStatus, validateSpecies, getSpecies, GROUPS, SPECIES_GROUPS, LIVE_MOODS, FACE_CLASSES, TIERS } from '../pets/index.js';
import { makeContext } from '../pets/rig.js';
import turtle from '../pets/species/turtle.js';

const here = dirname(fileURLToPath(import.meta.url));
const SIZES = [200, 128, 72];

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
const refs = (svg) => [...svg.matchAll(/url\(#([^)]+)\)/g)].map((m) => m[1]);
const groupOrder = (svg) => [...svg.matchAll(/class="g-([a-z-]+)"/g)].map((m) => m[1]);
/** Inner markup of the first <g class="g-NAME"> (balanced). */
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
    if (depth === 0) return svg.slice(svg.indexOf('>', start) + 1, m.index);
  }
  throw new Error(`unbalanced ${name}`);
}
const draw = (tier, mood = 'healthy', size = 200) => turtle.draw(makeContext({ species: 'turtle', tier, mood, size, uid: 'pt' }));
const turtleCss = async () => {
  const css = await readFile(join(here, '..', 'pets', 'pets.css'), 'utf8');
  const a = css.indexOf('/* ===== species: turtle ===== */'), b = css.indexOf('/* ===== end species: turtle ===== */');
  assert.ok(a >= 0 && b > a, 'turtle block');
  return { css, block: css.slice(a, b).replace(/\/\*[\s\S]*?\*\//g, '') };
};

test('turtle module is ready, valid, and named Pebbleback with the brief anchors', () => {
  assert.equal(speciesStatus().turtle, 'ready');
  assert.deepEqual(validateSpecies(turtle, 'turtle'), []);
  assert.equal(getSpecies('turtle'), turtle);
  assert.equal(turtle.name, 'Pebbleback');
  assert.equal(turtle.idleClass, 'pet-idle--turtle');
  const a = turtle.anchors;
  for (const k of ['headTop', 'brow', 'neck', 'back', 'mouth']) {
    assert.ok(a[k][0] >= 20 && a[k][0] <= 140 && a[k][1] >= 28 && a[k][1] <= 148, `${k} inside the character box`);
  }
  // Within a few px of CONTENT.md: headTop (80,32) brow (80,46) neck (80,90) back (112,84).
  const near = (p, q, d = 3) => Math.hypot(p[0] - q[0], p[1] - q[1]) <= d;
  assert.ok(near(a.headTop, [80, 32]) && near(a.brow, [80, 46]) && near(a.neck, [80, 90]) && near(a.back, [112, 84]));
  assert.equal(a.accScale, 0.95);
});

test('every tier × live mood × size renders a sound SVG: groups in order, unique resolved ids, no NaN', () => {
  for (let tier = 0; tier <= 6; tier += 1) {
    for (const mood of LIVE_MOODS) {
      for (const size of SIZES) {
        const where = `turtle/${tier}/${mood}/${size}`;
        const svg = renderPet({ species: 'turtle', tier, mood, size, name: 'Pebble', level: 9, focus: size === 200 });
        assert.ok(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160"'), where);
        assert.match(svg, new RegExp(`width="${size}" height="${size}"`), where);
        assert.ok(!/NaN|undefined|null|Infinity|\[object/.test(svg), `${where}: bad value`);
        assert.ok(!svg.includes('pet--fallback') && !svg.includes('TODO'), `${where}: fallback`);
        assertWellFormed(svg, where);
        const list = ids(svg);
        assert.equal(new Set(list).size, list.length, `${where}: duplicate ids`);
        for (const r of refs(svg)) assert.ok(list.includes(r), `${where}: url(#${r}) has no target`);
        assert.deepEqual(groupOrder(svg), GROUPS, where);
        assert.match(svg, new RegExp(`class="pet pet--turtle pet--tier-${tier} pet--${TIERS[tier].key} pet--mood-${mood} pet--s${size}`), where);
        assert.match(svg, /<g class="pet-idle pet-idle--turtle"/, where);
      }
    }
  }
});

test('draw() returns only allowed groups, ids only via defOnce, and numbers are finite', () => {
  for (let tier = 0; tier <= 6; tier += 1) {
    for (const mood of LIVE_MOODS) {
      for (const size of SIZES) {
        const ctx = makeContext({ species: 'turtle', tier, mood, size, uid: 'pchk' });
        const parts = turtle.draw(ctx);
        for (const k of Object.keys(parts)) assert.ok([...SPECIES_GROUPS, 'fx'].includes(k), `unknown group ${k}`);
        const markup = Object.values(parts).join('') + ctx.defs.join('');
        for (const i of ids(markup)) assert.ok(i.startsWith('pchk-'), `literal id ${i}`);
        assert.ok(!/NaN|undefined|Infinity/.test(markup), `${tier}/${mood}/${size}`);
        for (const v of markup.matchAll(/-?\d*\.\d{3,}/g)) assert.fail(`unrounded number ${v[0]}`);
      }
    }
  }
});

test('ids stay unique when many turtles share one page', () => {
  const page = [];
  for (let i = 0; i < 28; i += 1) page.push(renderPet({ species: 'turtle', tier: i % 7, mood: LIVE_MOODS[i % 4], size: SIZES[i % 3], stars: (i % 5) + 1 }));
  const all = page.flatMap(ids);
  assert.ok(all.length > 150);
  assert.equal(new Set(all).size, all.length);
  const a = renderPet({ species: 'turtle', tier: 5, mood: 'hungry', uid: 'pfix', name: 'Tank' });
  assert.equal(a, renderPet({ species: 'turtle', tier: 5, mood: 'hungry', uid: 'pfix', name: 'Tank' }), 'deterministic');
});

test('anatomy: shell with 5 hex plates, rim band, plastron, opening, four feet and a tail; head in the lip clip', () => {
  const p = draw(0);
  assert.equal((p.body.match(/stroke="#1a1530" stroke-width="2" stroke-linejoin="round"/g) || []).length, 5, '5 plates outlined 2 px #1a1530');
  assert.match(p.body, /stroke="#ebe6f2" stroke-width="12"/, 'rim band in belly');
  assert.match(p.body, /fill="#978daa"/, 'shell in shade');
  assert.match(p.body, /class="turtle-hole"[^>]*fill="#2b2740"/, 'neck opening');
  assert.match(p.body, /fill="#ebe6f2"/, 'plastron in belly');
  assert.equal((p.legs.match(/class="turtle-foot /g) || []).length, 2, 'two front feet');
  assert.match(p.tail, /class="turtle-tail"/);
  assert.match(p.head, /^<g clip-path="url\(#pt-lip\)"><g class="turtle-hd">/);
  assert.match(p.face, /^<g clip-path="url\(#pt-lip\)"><g class="turtle-hd">/);
  assert.equal(p['occlude-front'], '', 'nothing on a turtle sits in front of a hat');
});

test('tier items replace each other (CONTENT.md Pebbleback table, exact hex)', () => {
  const t = Array.from({ length: 7 }, (_, i) => draw(i));
  const all = (x) => Object.values(x).join('');
  // Ordinary: no markings, no accessory.
  assert.equal(t[0].markings, '');
  assert.equal(t[0]['acc-body'], '');
  // Rare: plate outlines become 2 px accent.
  assert.equal((t[1].body.match(/stroke="#2f6fb3" stroke-width="2"/g) || []).length, 5);
  assert.equal(t[1]['acc-body'], '');
  // Super Rare: seams + central belly oval + moss tuft (#7ccf6b) with a 5-petal flower (#ffd34d centre).
  assert.equal((t[2].body.match(/stroke="#23866a" stroke-width="2"/g) || []).length, 5);
  assert.match(t[2].markings, /<ellipse cx="80" cy="111"[^>]*fill="#dcf8ef"/);
  assert.match(t[2]['acc-body'], /class="turtle-moss"[\s\S]*fill="#7ccf6b"/);
  assert.equal((t[2]['acc-body'].match(/r="1.9" fill="#ffffff"/g) || []).length, 5);
  assert.match(t[2]['acc-body'], /fill="#ffd34d"/);
  // Epic: centre plate is a #c9a2ff gem with a glow and white glint; moss removed; seams back to outline.
  assert.match(t[3].markings, /class="turtle-gem" filter="url\(#pt-glow-c9a2ff-2\)"><path d="[^"]+" fill="#c9a2ff"/);
  assert.ok(!all(t[3]).includes('turtle-moss'));
  assert.equal((t[3].body.match(/stroke="#1a1530" stroke-width="2" stroke-linejoin="round"/g) || []).length, 4, 'four plates + the gem');
  // Mythic: bonsai (trunk #8a5a3b 4 px, blossoms #ffd3ec/#ff9ecf) + 5 celestial specks; no gem.
  assert.match(t[4]['acc-body'], /class="turtle-tree"[\s\S]*stroke="#8a5a3b" stroke-width="4"/);
  assert.match(t[4]['acc-body'], /fill="#ffd3ec"/);
  assert.match(t[4]['acc-body'], /fill="#ff9ecf"/);
  assert.equal((t[4].markings.match(/opacity="\.7"/g) || []).length, 5);
  assert.ok(!all(t[4]).includes('turtle-gem'));
  // Legendary: gold rim band, gold-leaf bonsai, #ffb347 lantern, flame tip, head trim; no blossoms or specks.
  assert.match(t[5].body, /stroke="#ffe08a" stroke-width="12"/);
  assert.match(t[5]['acc-body'], /class="turtle-lantern"[\s\S]*fill="#ffb347"/);
  assert.match(t[5]['acc-body'], /fill="#ffe08a"/);
  assert.ok(!t[5]['acc-body'].includes('#ffd3ec'));
  assert.equal(t[5].markings, '');
  assert.match(t[5].tail, /class="flame"/);
  assert.match(t[5].head, /class="trim"/);
  // Ultra: star-tree (trunk #b08f2a), planet ring #cfe8ff split behind/in front, prism overlay on shell + head.
  assert.match(t[6]['acc-body'], /stroke="#b08f2a" stroke-width="4"/);
  assert.match(t[6]['acc-body'], /class="turtle-ring" transform="rotate\(-8 80 116\)"[\s\S]*stroke="#cfe8ff"/);
  assert.match(t[6]['wing-back'], /class="turtle-ring"[\s\S]*stroke="#cfe8ff"/);
  assert.match(t[6].body, /class="prism"/);
  assert.match(t[6].head, /class="prism"/);
  assert.ok(!all(t[6]).includes('#8a5a3b') && !all(t[6]).includes('turtle-lantern'));
  // Tier items never use headTop: nothing is drawn above the head (y < 36) except the Ultra tree star.
  for (let i = 0; i <= 5; i += 1) assert.ok(!/cy="(?:[0-2]?\d|3[0-5])(?:\.\d+)?"/.test(t[i]['acc-body']), `tier ${i} accessory clear of headTop`);
});

test('moods: healthy yawn, happy smile + stamping feet, hungry head −6 px + sigh, starving head inside the shell', () => {
  const h = renderPet({ species: 'turtle', mood: 'healthy' });
  assert.ok(h.includes('class="eyes-open"') && h.includes('class="mouth-smile"') && h.includes('class="turtle-yawn"'));
  assert.match(h, /<g class="face-happy face-react" display="none">/);

  const hp = renderPet({ species: 'turtle', mood: 'happy' });
  assert.ok(hp.includes('class="eyes-happy"') && hp.includes('class="mouth-open"'));
  assert.equal((hp.match(/class="turtle-foot turtle-foot--[lr]"/g) || []).length, 2);

  const hu = draw(2, 'hungry');
  assert.match(hu.head, /<g transform="translate\(0 6\) rotate\(4 /, 'head lowered 6 px');
  assert.match(hu.face, /class="eyes-half"/);
  assert.match(hu.face, /class="mouth-wavy"/);
  assert.match(hu.face, /class="turtle-sigh"[\s\S]*fill="#ffffff" fill-opacity="\.4"/);

  const st = draw(2, 'starving');
  assert.equal(st.head, '', 'no head');
  assert.equal(st.legs, '', 'feet pulled in');
  assert.match(st.body, /class="turtle-hole"[^>]*fill="#2b2740"/);
  assert.match(st.face, /class="eyes-hollow"/);
  assert.match(st.face, /class="tear"[\s\S]*fill="#9fd4ff"/);
  assert.match(st.face, /class="mouth-o"/);
  assert.ok(!st.face.includes('turtle-hd'), 'eyes stay in the opening');
  assert.ok(!st.tail.includes('turtle-tail'), 'tail tucked in');

  const all = LIVE_MOODS.map((mood) => renderPet({ species: 'turtle', mood })).join('');
  for (const c of FACE_CLASSES) assert.ok(all.includes(`class="${c}"`), c);
});

test('eating parts: puffing cheeks, a munching mouth and two crumb triangles (not on thumbnails)', () => {
  const big = renderPet({ species: 'turtle', size: 200 });
  assert.match(big, /class="turtle-cheeks" opacity="0"/);
  assert.equal((big.match(/class="turtle-cheek turtle-cheek--[lr]"/g) || []).length, 2);
  assert.match(big, /class="turtle-munch-mouth"/);
  assert.equal((group(big, 'fx').match(/class="turtle-crumb"/g) || []).length, 2);
  const thumb = renderPet({ species: 'turtle', size: 72 });
  assert.match(thumb, /<g class="g-fx"><\/g>/);
  assert.match(thumb, /pet--thumb/);
  assert.ok(!thumb.includes('pet--focus'));
});

test('dead, ashes and Petdex use the turtle silhouette (shell with plate holes, no fill/stroke)', () => {
  const sil = turtle.silhouette();
  assert.ok(!/\sfill=|\sstroke=/.test(sil));
  assert.match(sil, /^<path fill-rule="evenodd" d="M34 124C/);
  assert.equal((sil.match(/<path/g) || []).length, 7);
  const g = renderPet({ species: 'turtle', mood: 'dead', name: 'Tortellini', level: 12 });
  assertWellFormed(g, 'grave');
  assert.ok(g.includes('class="grave-carving"') && g.includes('fill-rule="evenodd"') && g.includes('>Tortellini</text>'));
  for (let done = 0; done <= 3; done += 1) {
    const a = renderPet({ species: 'turtle', mood: 'ashes', tier: 3, ashesDone: done });
    assertWellFormed(a, 'ashes');
    assert.equal((a.match(/class="ash-seg ash-seg--on"/g) || []).length, done);
    assert.match(a, /class="ash-wisp"[\s\S]*fill-rule="evenodd"/);
  }
  for (const size of [72, 128]) {
    const s = renderSilhouette({ species: 'turtle', size });
    assertWellFormed(s, 'silhouette');
    assert.match(s, /class="pet-silhouette pet--turtle/);
    assert.ok(!s.includes('TODO'));
  }
});

test('pets.css turtle block: defined keyframes, motion scoped to focus or triggers, nothing on thumbnails', async () => {
  const { css, block } = await turtleCss();
  const defined = new Set([...css.matchAll(/@keyframes\s+([\w-]+)/g)].map((m) => m[1]));
  for (const k of ['turtle-idle', 'turtle-peek', 'turtle-yawn', 'turtle-yawn-hide', 'turtle-stamp', 'turtle-sigh', 'turtle-munch', 'turtle-puff', 'turtle-crumb']) {
    assert.ok(block.includes(`@keyframes ${k} `), `keyframes ${k} in the turtle block`);
  }
  for (const m of block.matchAll(/animation:\s*([^;}]+)/g)) {
    for (const part of m[1].split(/,(?![^(]*\))/)) {
      const name = part.trim().split(/\s+/)[0];
      if (name !== 'none') assert.ok(defined.has(name), `keyframes ${name}`);
    }
  }
  // Every animated turtle rule runs only on the focused pet or during a trigger class.
  for (const m of block.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const [, sel, body] = m;
    if (sel.includes('@keyframes') || /^\s*(\d|from|to)/.test(sel.split(',').pop().trim())) continue;
    const anim = body.match(/animation:\s*([^;]+)/);
    if (!anim || anim[1].trim().startsWith('none')) continue;
    for (const s of sel.split(/,(?![^(]*\))/)) assert.ok(/pet--focus|pet--cheer|pet--bounce|pet--eat/.test(s), `unscoped animation: ${s.trim()}`);
  }
  assert.match(block, /\.pet--focus \.pet-idle--turtle \{ animation: turtle-idle var\(--idle-every, 10s\)/);
  assert.match(block, /\.pet--turtle\.pet--eat \.pet-act \{ animation: none; \}/);
  assert.match(block, /\.pet--thumb :is\([^)]*turtle-hd[^)]*\)[^{]*\{ animation: none !important; \}/);
  // Selectors in the block are all turtle-scoped.
  for (const m of block.matchAll(/([^{}]+)\{/g)) {
    const sel = m[1].replace(/\/\*[\s\S]*?\*\//g, '').trim();
    if (sel.startsWith('@keyframes') || /^(\d|from|to)/.test(sel)) continue;
    for (const s of sel.split(/,(?![^(]*\))/)) assert.ok(/turtle/.test(s), `selector not turtle-scoped: ${s.trim()}`);
  }
});
