import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  SPECIES, ANIM_MS, renderPet, renderEgg, renderSilhouette, speciesStatus, validateSpecies, getSpecies,
  TIERS, TIER_NAMES, RARITY, GROUPS, SPECIES_GROUPS, FACE_CLASSES, MOODS, LIVE_MOODS, EGG_KINDS, EGG_STATES, tierPalette,
} from '../pets/index.js';
import { makeContext } from '../pets/rig.js';
import template from '../pets/species/_template.js';

const here = dirname(fileURLToPath(import.meta.url));
const petsDir = join(here, '..', 'pets');

// ---------- helpers ----------

/** Minimal well-formedness check: tags balance, attributes are quoted, no stray '<'. */
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
const groupOrder = (svg) => [...svg.matchAll(/class="g-([a-z-]+)"/g)].map((m) => m[1]);
const ready = Object.entries(speciesStatus()).filter(([, s]) => s === 'ready').map(([id]) => id);

// ---------- catalogue + palette ----------

test('SPECIES lists the 7 species with CONTENT.md names and unlocks', () => {
  assert.deepEqual(SPECIES.map((s) => [s.id, s.name]), [
    ['dragon', 'Drakelet'], ['fox', 'Kitsu'], ['slime', 'Gumdrop'], ['owl', 'Hootling'],
    ['turtle', 'Pebbleback'], ['axolotl', 'Ripplegill'], ['hedgehog', 'Bramblekin'],
  ]);
  assert.deepEqual(SPECIES.find((s) => s.id === 'hedgehog').unlock, { type: 'keeper', level: 25 });
  assert.ok(SPECIES.filter((s) => s.id !== 'hedgehog').every((s) => s.unlock.type === 'launch'));
});

test('tier ladder hex values match CONTENT.md exactly', () => {
  const want = [
    ['#c2bad0', '#978daa', '#ebe6f2', '#6f6585'], ['#9fd4ff', '#6aaee6', '#e3f3ff', '#2f6fb3'],
    ['#7ee0c3', '#4cbc9c', '#dcf8ef', '#23866a'], ['#c9a2ff', '#9c72e8', '#f0e6ff', '#6a3fc4'],
    ['#ff9ecf', '#e46aa9', '#ffe4f2', '#a83a74'], ['#ffc98f', '#e9a25a', '#fff1df', '#a8611f'],
    ['#fff3b0', '#e3cf72', '#fffbe8', '#b08f2a'],
  ];
  assert.deepEqual(TIERS.map((t) => [t.body, t.shade, t.belly, t.accent]), want);
  assert.deepEqual(TIER_NAMES, ['Ordinary', 'Rare', 'Super Rare', 'Epic', 'Mythic', 'Legendary', 'Ultra']);
  assert.deepEqual(RARITY, ['#c2bad0', '#9fd4ff', '#7ee0c3', '#c9a2ff', '#ff9ecf', '#ffc98f', '#fff3b0']);
  assert.equal(TIERS[5].trim, '#ffe08a');
  assert.deepEqual(TIERS[6].iridescent, ['#fff3b0', '#ffd3ec', '#cfe8ff', '#d8ffef', '#fff3b0']);
  assert.equal(tierPalette(-3).tier, 0);
  assert.equal(tierPalette(99).tier, 6);
});

// ---------- pets ----------

test('the slime reference species is ready and passes the contract', () => {
  assert.equal(speciesStatus().slime, 'ready');
  assert.deepEqual(validateSpecies(getSpecies('slime'), 'slime'), []);
});

test('every ready species renders every tier × live mood × size as a sound SVG with all groups in order', () => {
  assert.ok(ready.includes('slime'));
  for (const species of ready) {
    for (let tier = 0; tier <= 6; tier += 1) {
      for (const mood of LIVE_MOODS) {
        for (const size of [200, 128, 72]) {
          const where = `${species}/${tier}/${mood}/${size}`;
          const svg = renderPet({ species, tier, mood, size, name: 'Mochi', level: 7, focus: size === 200 });
          assert.ok(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160"'), where);
          assert.match(svg, new RegExp(`width="${size}" height="${size}"`), where);
          assert.ok(!/NaN|undefined|null|\[object/.test(svg), `${where}: bad value in markup`);
          assertWellFormed(svg, where);
          assertIdsSound(svg, where);
          assert.deepEqual(groupOrder(svg), GROUPS, where);
          assert.match(svg, new RegExp(`class="pet pet--${species} pet--tier-${tier} pet--${TIERS[tier].key} pet--mood-${mood} pet--s${size}`), where);
          for (const w of ['pet-float', 'pet-act', 'pet-mood', 'pet-idle', 'pet-breathe', 'pet-headrig']) assert.ok(svg.includes(`class="${w}`), `${where}: ${w}`);
        }
      }
    }
  }
});

test('faces: the current mood face plus a hidden happy copy for triggered animations', () => {
  const pick = (svg, cls) => svg.includes(`class="${cls}"`);
  const h = renderPet({ mood: 'healthy' });
  assert.ok(pick(h, 'eyes-open') && pick(h, 'mouth-smile'));
  assert.match(h, /<g class="face-mood face-healthy">/);
  assert.match(h, /<g class="face-happy face-react" display="none">/);
  const hp = renderPet({ mood: 'happy' });
  assert.ok(pick(hp, 'eyes-happy') && pick(hp, 'mouth-open'));
  assert.ok(!hp.includes('face-react'), 'happy needs no hidden copy');
  const hu = renderPet({ mood: 'hungry' });
  assert.ok(pick(hu, 'eyes-half') && pick(hu, 'mouth-wavy') && hu.includes('class="fx-growl"'));
  const st = renderPet({ mood: 'starving' });
  assert.ok(pick(st, 'eyes-hollow') && pick(st, 'mouth-o') && pick(st, 'tear'));
  assert.match(st, /class="pet-mood" filter="url\(#[^)]+-starve\)"/);
  const all = [h, hp, hu, st].join('');
  for (const c of FACE_CLASSES) assert.ok(all.includes(`class="${c}"`), c);
  assert.match(renderPet({ tier: 6 }), /class="eyes-open"><ellipse[^>]*\/><ellipse[^>]*\/><path d="M/, 'Ultra star highlight');
});

test('thumbnails: 72 px never focus, static ring aura (tier ≥ 1), no fx', () => {
  const t = renderPet({ tier: 3, size: 72, focus: true });
  assert.match(t, /pet--thumb/);
  assert.ok(!t.includes('pet--focus'));
  assert.match(t, /class="aura-ring-static" cx="80" cy="\d+" r="66" fill="none" stroke="#c9a2ff" stroke-width="3"/);
  assert.match(t, /<g class="g-fx"><\/g>/);
  assert.ok(!renderPet({ tier: 0, size: 72 }).includes('aura-ring-static'));
});

test('tier aura ladder: each tier draws its own aura', () => {
  const r = (tier) => renderPet({ tier, focus: true });
  assert.ok(!r(0).includes('class="aura-'));
  assert.equal((r(1).match(/class="aura-twinkle"/g) || []).length, 2);
  assert.match(r(2), /class="aura-glow" cx="80" cy="149" rx="45" ry="7"/);
  assert.match(r(3), /r="64" fill="none" stroke="#6a3fc4" stroke-width="2" stroke-dasharray="2 6"/);
  assert.equal((r(3).match(/class="aura-orbit"/g) || []).length, 2);
  assert.match(r(4), /class="aura-pulse"[^>]*><circle cx="\d+" cy="\d+" r="70"/);
  assert.equal((r(4).match(/class="aura-orbit"/g) || []).length, 4);
  assert.equal((r(5).match(/class="aura-orbit"/g) || []).length, 6);
  assert.equal((r(5).match(/<path d="M[^"]+Z" fill="url\(#[^)]+-ray-0\)"\/>/g) || []).length, 12);
  assert.equal((r(6).match(/class="aura-rise"/g) || []).length, 8);
  assert.match(r(6), /class="pet-float" transform="translate\(0 -4\)"/);
  assert.match(r(6), /class="pet-shadow" cx="80" cy="149" rx="26" ry="5" fill="#000000" opacity="0.2"/);
  assert.match(r(0), /class="pet-shadow" cx="80" cy="149" rx="35" ry="5" fill="#000000" opacity="0.3"/);
});

test('ids are unique per rendered instance, so many pets can share a page', () => {
  const page = [];
  for (let i = 0; i < 40; i += 1) page.push(renderPet({ tier: i % 7, mood: LIVE_MOODS[i % 4], stars: (i % 5) + 1 }), renderEgg({ kind: EGG_KINDS[i % 2], tier: i % 7, state: EGG_STATES[i % 4] }));
  const all = page.flatMap(ids);
  assert.ok(all.length > 100);
  assert.equal(new Set(all).size, all.length);
  // Every id is namespaced by the render's uid prefix.
  for (const svg of page) {
    const list = ids(svg);
    if (!list.length) continue;
    const prefix = list[0].split('-')[0];
    assert.ok(list.every((id) => id.startsWith(`${prefix}-`)), 'one prefix per render');
  }
});

test('same uid → identical markup (deterministic); per-pet timing varies', () => {
  const a = renderPet({ species: 'slime', tier: 4, mood: 'happy', uid: 'pfixed1', name: 'Bean' });
  const b = renderPet({ species: 'slime', tier: 4, mood: 'happy', uid: 'pfixed1', name: 'Bean' });
  assert.equal(a, b);
  const blink = (s) => s.match(/--blink-every:([\d.]+)s/)[1];
  const values = new Set(Array.from({ length: 12 }, (_, i) => blink(renderPet({ uid: `pq${i}` }))));
  assert.ok(values.size > 6, 'blink interval randomised per pet');
  for (const v of values) assert.ok(+v >= 4 && +v <= 7, `blink every ${v}s within 4–7 s`);
  const idle = +a.match(/--idle-every:([\d.]+)s/)[1];
  assert.ok(idle >= 8 && idle <= 12, 'idle flourish every 8–12 s');
});

test('5 stars adds the rim-light filter; focus/still flags reach the root class', () => {
  const s5 = renderPet({ stars: 5 });
  assert.match(s5, /pet--5star/);
  assert.match(s5, /<g class="pet-idle pet-idle--slime" filter="url\(#[^)]+-rim\)">/);
  assert.match(s5, /flood-color="#ffe08a"/);
  assert.ok(!renderPet({ stars: 4 }).includes('-rim)'));
  assert.match(renderPet({ focus: true }), /pet--focus/);
  assert.match(renderPet({ animate: false }), /pet--still/);
});

test('names are escaped and labels describe the pet', () => {
  const svg = renderPet({ name: '<b>"Mo"&', level: 3, tier: 2, stars: 2, mood: 'hungry' });
  assert.ok(!svg.includes('<b>'));
  assert.match(svg, /aria-label="&lt;b&gt;&quot;Mo&quot;&amp;, Super Rare Gumdrop, 2 stars, level 3, hungry"/);
  const grave = renderPet({ mood: 'dead', name: '<i>', level: 9 });
  assert.ok(grave.includes('&lt;i&gt;') && !grave.includes('<i>'));
});

test('dead renders the gravestone; ashes renders the nest with a 3-segment progress ring', () => {
  const g = renderPet({ species: 'slime', mood: 'dead', name: 'Mochi', level: 14, size: 128 });
  assertWellFormed(g, 'grave'); assertIdsSound(g, 'grave');
  assert.match(g, /pet--grave/);
  assert.match(g, />Mochi<\/text>/);
  assert.match(g, />Lv 14<\/text>/);
  assert.match(g, /fill="#4a4560"/);
  assert.match(g, /class="grave-carving"/);
  assert.ok(!g.includes('eyes-'), 'no face on a gravestone');
  for (let done = 0; done <= 3; done += 1) {
    const a = renderPet({ species: 'slime', mood: 'ashes', tier: 4, ashesDone: done });
    assertWellFormed(a, 'ashes'); assertIdsSound(a, 'ashes');
    assert.equal((a.match(/class="ash-seg/g) || []).length, 3);
    assert.equal((a.match(/class="ash-seg ash-seg--on"/g) || []).length, done);
    assert.equal((a.match(/class="ash-coal"/g) || []).length, 5);
    assert.match(a, /class="ash-wisp"/);
  }
});

test('missing species fall back to the slime with an obvious TODO marker', () => {
  const missing = SPECIES.map((s) => s.id).filter((id) => speciesStatus()[id] !== 'ready');
  for (const id of missing) {
    const svg = renderPet({ species: id, tier: 2 });
    assert.match(svg, /pet--fallback/);
    assert.match(svg, new RegExp(`TODO ${id}`));
    assertWellFormed(svg, id);
    assert.deepEqual(groupOrder(svg), GROUPS, id);
    assert.match(renderSilhouette({ species: id }), /TODO/);
  }
  assert.ok(!renderPet({ species: 'slime' }).includes('TODO'));
});

test('every species module on disk satisfies the contract and draws only allowed groups', async () => {
  const files = (await readdir(join(petsDir, 'species'))).filter((f) => f.endsWith('.js') && !f.startsWith('_'));
  assert.ok(files.includes('slime.js'));
  for (const file of files) {
    const id = file.replace(/\.js$/, '');
    const mod = (await import(`../pets/species/${file}`)).default;
    assert.deepEqual(validateSpecies(mod, id), [], id);
    for (let tier = 0; tier <= 6; tier += 1) {
      for (const mood of LIVE_MOODS) {
        for (const size of [128, 72]) {
          const ctx = makeContext({ species: id, tier, mood, size, uid: 'pcheck' });
          const parts = mod.draw(ctx);
          for (const k of Object.keys(parts)) assert.ok([...SPECIES_GROUPS, 'fx'].includes(k), `${id}: unknown group ${k}`);
          const markup = Object.values(parts).join('');
          for (const i of ids(markup)) assert.ok(i.startsWith('pcheck-'), `${id}: literal id ${i} (use ctx.defOnce)`);
          for (const d of ctx.defs) for (const i of ids(d)) assert.ok(i.startsWith('pcheck-'), `${id}: def id ${i}`);
          assert.ok(!/NaN|undefined/.test(markup), `${id}/${tier}/${mood}: bad value`);
        }
      }
    }
    const sil = mod.silhouette();
    assert.ok(/<(path|ellipse|circle|rect|polygon)\b/.test(sil), `${id}: silhouette has shapes`);
    assert.ok(!/\sfill=|\sstroke=/.test(sil), `${id}: silhouette must not set fill/stroke`);
  }
});

test('the template module is a valid, drawable species skeleton', () => {
  assert.deepEqual(validateSpecies(template, 'template').filter((p) => !p.startsWith('name ')), []);
  const ctx = makeContext({ species: 'template', tier: 3, mood: 'hungry', size: 128 });
  const parts = template.draw(ctx);
  assert.ok(parts.body && parts.face.includes('eyes-half'));
});

test('silhouettes render for Petdex cells', () => {
  for (const size of [72, 128]) {
    const s = renderSilhouette({ species: 'slime', size });
    assertWellFormed(s, 'silhouette');
    assert.match(s, /class="pet-silhouette pet--slime/);
    assert.match(s, /fill="#2b2740"/);
    assert.match(s, /aria-label="Not discovered yet"/);
  }
});

// ---------- eggs ----------

test('eggs: both kinds × 7 tiers × 4 states render soundly', () => {
  for (const kind of EGG_KINDS) {
    for (let tier = 0; tier <= 6; tier += 1) {
      for (const state of EGG_STATES) {
        for (const size of [200, 128, 72]) {
          const where = `egg ${kind}/${tier}/${state}/${size}`;
          const svg = renderEgg({ kind, tier, state, size });
          assertWellFormed(svg, where);
          assertIdsSound(svg, where);
          assert.ok(!/NaN|undefined/.test(svg), where);
          assert.match(svg, new RegExp(`class="egg egg--kind-${kind} egg--tier-${tier} egg--${TIERS[tier].key} egg--state-${state} egg--s${size}`), where);
          assert.match(svg, /class="egg-wobble"/, where);
          if (state === 'open') assert.ok(svg.includes('class="egg-cap"') && svg.includes('class="egg-bottom"') && svg.includes('class="egg-rays"'), where);
          else assert.ok(svg.includes('class="egg-cracks"'), where);
          if (state === 'crack') assert.match(svg, /<g class="egg-cracks">/, where);
          if (state === 'idle' || state === 'shake') assert.match(svg, /<g class="egg-cracks" display="none">/, where);
        }
      }
    }
  }
  assert.match(renderEgg({ kind: 'open', tier: 0 }), /class="egg-medal"/);
  assert.match(renderEgg({ kind: 'pet', tier: 0 }), /class="egg-paw"/);
  assert.match(renderEgg({ tier: 2, size: 72 }), /egg--thumb/);
  assert.match(renderEgg({ tier: 2, size: 72 }), /aura-ring-static/);
  assert.match(renderEgg({ tier: 3 }), /egg--live/);
  assert.match(renderEgg({ tier: 3, animate: false }), /egg--still/);
  assert.match(renderEgg({ kind: 'pet', tier: 5, state: 'open' }), /aria-label="Legendary pet egg, opened"/);
  // Unknown input is clamped, never thrown.
  assert.match(renderEgg({ kind: 'x', tier: 42, state: 'y' }), /egg--kind-open egg--tier-6 egg--ultra egg--state-idle/);
});

// ---------- CSS ----------

test('pets.css defines every referenced keyframe, every trigger class, species blocks and reduced motion', async () => {
  const css = await readFile(join(petsDir, 'pets.css'), 'utf8');
  const defined = new Set([...css.matchAll(/@keyframes\s+([\w-]+)/g)].map((m) => m[1]));
  const used = new Set();
  for (const m of css.matchAll(/animation(?:-name)?\s*:\s*([^;}]+)/g)) {
    for (const part of m[1].split(',')) {
      const name = part.trim().split(/\s+/).find((w) => /^[a-z][\w-]*$/i.test(w) && !['none', 'both', 'forwards', 'backwards', 'infinite', 'linear', 'ease', 'ease-in', 'ease-out', 'ease-in-out', 'alternate', 'reverse', 'paused', 'running', 'normal'].includes(w) && !w.startsWith('var'));
      if (name) used.add(name);
    }
  }
  for (const n of used) assert.ok(defined.has(n), `keyframes ${n} not defined`);
  for (const cls of Object.keys(ANIM_MS).filter((c) => c !== 'egg--open')) assert.ok(css.includes(`.${cls}`), `missing trigger .${cls}`);
  for (const s of SPECIES) {
    assert.ok(css.includes(`/* ===== species: ${s.id} ===== */`), `block start ${s.id}`);
    assert.ok(css.includes(`/* ===== end species: ${s.id} ===== */`), `block end ${s.id}`);
  }
  const rm = css.match(/@media \(prefers-reduced-motion: reduce\)\s*\{([\s\S]*?)\n\}/);
  assert.ok(rm, 'reduced-motion block');
  assert.match(rm[1], /animation: none !important/);
  for (const k of ['pet-breathe', 'pet-blink', 'pet-hop', 'pet-jump', 'orb-fly', 'lv-ring', 'shiver', 'tear-slide', 'growl', 'heart-loop', 'egg-shake', 'egg-crack-draw', 'egg-cap-pop', 'aura-spin', 'aura-orbit', 'aura-pulse', 'aura-twinkle', 'aura-rise', 'ultra-float', 'prism-drift', 'coal-pulse', 'ash-wisp']) {
    assert.ok(defined.has(k), `shared keyframes ${k}`);
  }
  // Focus rule: aura + species idle animate only inside .pet--focus (or a live egg / a trigger).
  for (const m of css.matchAll(/([^{}]+)\{[^{}]*animation:\s*(aura-[\w-]+|slime-idle)[^}]*\}/g)) {
    const sel = m[1].trim();
    assert.ok(/pet--focus|egg--focus|pet--cheer/.test(sel), `unscoped idle/aura animation: ${sel}`);
  }
  // Thumbnail rules.
  assert.match(css, /\.pet--thumb \.g-markings \.thin \{ display: none; \}/);
  assert.match(css, /\.pet--thumb \.pet-idle \{ animation: none !important; \}/);
});

test('ANIM_MS durations match the spec', () => {
  assert.equal(ANIM_MS['pet--bounce'], 700);
  assert.equal(ANIM_MS['pet--levelup'], 1200);
  assert.ok(ANIM_MS['pet--eat'] >= 350 + 800);
  assert.ok(MOODS.includes('ashes') && MOODS.includes('dead'));
});

// ---------- art pass (2026-10-24): rim, aura light, prism, fx placement, thumbnails ----------

test('rim light sits just inside the 4 px outline (round inset), never on thumbnails; rim-lit pets only breathe when focused', async () => {
  const s5 = renderPet({ stars: 5, size: 200, uid: 'r5' });
  const filter = s5.match(/<filter id="r5-rim"[^>]*>.*?<\/filter>/)[0];
  assert.match(filter, /x="-5%" y="-5%" width="110%" height="110%"/);
  // Round-kernel erosion: blur the alpha, then threshold at Φ(4/σ) and Φ(5.5/σ) (σ = 3).
  assert.match(filter, /<feGaussianBlur in="SourceAlpha" stdDeviation="3" result="bl"\/>/);
  const intercepts = [...filter.matchAll(/slope="60" intercept="(-?[\d.]+)"/g)].map((m) => -Number(m[1]) / 60);
  assert.equal(intercepts.length, 2);
  assert.ok(Math.abs(intercepts[0] - 0.9088) < 0.002 && Math.abs(intercepts[1] - 0.9666) < 0.002, intercepts.join());
  assert.ok(!filter.includes('feMorphology'), 'no square-kernel erosion');
  assert.match(filter, /flood-color="#ffe08a"/);
  assert.match(s5, /pet--5star pet--rim/);
  const thumb = renderPet({ stars: 5, size: 72 });
  assert.ok(thumb.includes('pet--5star') && !thumb.includes('-rim)') && !thumb.includes('pet--rim'), 'no rim filter at 72 px');
  // Ultra gets a 2 px iridescent rim (5★ gold wins on an Ultra).
  const u = renderPet({ tier: 6, size: 128, uid: 'ru' });
  assert.match(u, /class="pet-idle pet-idle--slime" filter="url\(#ru-rim-prism\)"/);
  assert.match(u, /stdDeviation="9 0" result="fill"/);
  assert.match(renderPet({ tier: 6, stars: 5, size: 128, uid: 'rg' }), /filter="url\(#rg-rim\)"/);
  const css = await readFile(join(petsDir, 'pets.css'), 'utf8');
  assert.match(css, /\.pet--rim:not\(\.pet--focus\) \.pet-breathe, \.pet--rim:not\(\.pet--focus\) \.pet-headrig \{ animation: none; \}/);
});

test('aura light: motes are soft glows round a white core; sun rays are light, alternating long/short, over a warm glow', () => {
  const ep = renderPet({ tier: 3, size: 200, uid: 'm3' });
  assert.match(ep, /<radialGradient id="m3-mote-glow"><stop offset="0" stop-color="#f0e6ff" stop-opacity=".85"\/><stop offset=".45" stop-color="#c9a2ff" stop-opacity=".45"\/>/);
  assert.match(ep, /r="7.8" fill="url\(#m3-mote-glow\)"\/><circle [^>]*r="3" fill="#ffffff"\/>/);
  assert.ok(!/opacity="\.25"\/><circle/.test(ep), 'no flat brown halo discs');
  const lg = renderPet({ tier: 5, size: 200, uid: 'm5' });
  assert.match(lg, /<radialGradient id="m5-ray-0" gradientUnits="userSpaceOnUse" cx="80" cy="92" r="70"><stop offset="0" stop-color="#fff1c2"/);
  assert.match(lg, /class="aura-warm" cx="80" cy="92" r="58" fill="url\(#m5-warm-glow\)"/);
  const rays = [...lg.matchAll(/<path d="M([^"]+)Z" fill="url\(#m5-ray-0\)"\/>/g)].map((m) => {
    const n = m[1].split(/[ML ]+/).filter(Boolean).map(Number);
    return Math.round(Math.hypot(n[4] - 80, n[5] - 92)); // tip distance from the aura centre
  });
  assert.deepEqual(rays, Array.from({ length: 12 }, (_, i) => (i % 2 ? 56 : 70)));
});

test('Ultra prism: hard-light overlay plus one sheen stripe that sweeps the focused pet', async () => {
  const u = renderPet({ species: 'fox', tier: 6, size: 200, focus: true });
  assert.match(u, /class="prism" opacity="0.4" style="mix-blend-mode:hard-light"/);
  assert.match(u, /class="prism-sheen"/);
  assert.ok((u.match(/class="prism"/g) || []).length <= 3, 'one blend group per main part (body, head, tail) only');
  const css = await readFile(join(petsDir, 'pets.css'), 'utf8');
  assert.match(css, /\.pet--focus\.pet--tier-6 \.prism-sheen \{ animation: prism-sheen 4\.5s/);
});

test('fx: hearts float beside the head (10.5 wide); the hungry rumble sits centred on the belly with a pale underlay', () => {
  const hp = renderPet({ species: 'dragon', mood: 'happy', size: 200 });
  const hearts = [...hp.matchAll(/class="fx-heart" style="--d:[\d.]+s;--i:\d"><path d="M([\d.]+) ([\d.]+)C/g)].map((m) => [+m[1], +m[2]]);
  assert.equal(hearts.length, 3);
  // headTop (80, 34): (36, 54 + 4.46), (124, 46 + 4.46), (114, 30 + 4.46) — bottom points of 10.5-wide hearts.
  assert.deepEqual(hearts.map(([x, y]) => [x, Math.round(y)]), [[36, 58], [124, 50], [114, 34]]);
  const hu = renderPet({ species: 'owl', mood: 'hungry', size: 200 });
  const growl = hu.match(/<g class="fx-growl">(.*?)<\/g>/)[1];
  assert.match(growl, /^<path d="M71 124q3 -4 6 0t6 0t6 0" fill="none" stroke="#ffffff" stroke-width="5.5" stroke-linecap="round" opacity=".35"\/><path d="M71 124q3 -4 6 0t6 0t6 0" fill="none" stroke="#978daa" stroke-width="2.5"/);
});

test('eating: a bigger glowing orb with a 3-dot trail that follows its arc', async () => {
  const svg = renderPet({ size: 200, uid: 'eo' });
  assert.equal((svg.match(/class="fx-orb fx-orb-trail" style="--i:\d"/g) || []).length, 3);
  assert.match(svg, /<g class="fx-orb"><circle r="9" fill="url\(#eo-orb-glow\)"\/><path d="M0 -9Q/);
  const css = await readFile(join(petsDir, 'pets.css'), 'utf8');
  assert.match(css, /\.pet--eat \.fx-orb-trail \{ animation-delay: calc\(var\(--i, 1\) \* 28ms\); \}/);
});

test('Rare sparkles: species can move them clear of wide heads; 9 px with a soft outline', () => {
  const ax = renderPet({ species: 'axolotl', tier: 1, size: 200 });
  const pts = [...ax.matchAll(/class="aura-twinkle" style="--d:[\d.]+s"><path d="M([\d.]+) ([\d.]+)Q/g)].map((m) => [+m[1], +m[2] + 4.5]);
  assert.deepEqual(pts, [[24, 38], [138, 90]]);
  assert.match(ax, /class="aura-twinkle"[^>]*><path [^>]*stroke="#1a1530" stroke-width="1" stroke-opacity=".5"/);
  const sl = renderPet({ species: 'slime', tier: 1, size: 200 });
  assert.deepEqual([...sl.matchAll(/class="aura-twinkle" style="--d:[\d.]+s"><path d="M([\d.]+) ([\d.]+)Q/g)].map((m) => [+m[1], +m[2] + 4.5]), [[34, 52], [127, 70]]);
  assert.ok(validateSpecies({ ...getSpecies('slime'), sparkles: [[1, 2]] }, 'slime').includes('sparkles must be [[x, y], [x, y]]'));
});

test('thumbnails: hungry reads at 72 px (bold brows and lid, no catchlight); no hidden happy copy', () => {
  const t = renderPet({ mood: 'hungry', size: 72 });
  const half = t.match(/<g class="eyes-half">(.*?)<\/g>/)[1];
  assert.equal((half.match(/stroke-width="4"/g) || []).length, 2, 'two 4-unit brows');
  assert.equal((half.match(/stroke-width="3.5"/g) || []).length, 2, 'lid lines 3.5');
  assert.ok(!half.includes('r="1.4" fill="#ffffff"'), 'no catchlight');
  assert.match(t, /class="mouth-wavy"><path [^>]*stroke-width="3.2"/);
  assert.ok(!t.includes('face-react'));
  assert.ok(renderPet({ mood: 'hungry', size: 200 }).includes('face-react'));
});

test('eggs: aura animation only on the focused egg (default: the 200 px reveal stage)', () => {
  assert.match(renderEgg({ tier: 4, size: 200 }), /egg--live egg--focus/);
  assert.ok(!renderEgg({ tier: 4, size: 128 }).includes('egg--focus'));
  assert.match(renderEgg({ tier: 4, size: 128, focus: true }), /egg--focus/);
  assert.ok(!renderEgg({ tier: 4, size: 200, animate: false }).includes('egg--focus'));
  assert.match(renderEgg({ state: 'open' }), /class="egg-cap" style="transform-origin:80px 88px" transform="translate\(-14 -20\) rotate\(-24\)"/);
  assert.match(renderEgg({ state: 'crack', uid: 'ec' }), /<g class="egg-cracks"><g clip-path="url\(#ec-clip-shell\)">/);
});

test('ashes: the progress arch fills left → right over the nest; gravestone thumbnails drop the text', () => {
  const a = renderPet({ species: 'fox', mood: 'ashes', tier: 2, ashesDone: 2, size: 200 });
  const segs = [...a.matchAll(/class="ash-seg( ash-seg--on)?" d="M([\d.]+) ([\d.]+)A42 42/g)].map((m) => [Boolean(m[1]), +m[2], +m[3]]);
  assert.equal(segs.length, 3);
  assert.deepEqual(segs.map((s) => s[0]), [true, true, false], 'left two lit');
  assert.ok(segs.every(([, , y]) => y < 130), 'every segment starts above the nest');
  assert.ok(segs[0][1] < segs[1][1] && segs[1][1] < segs[2][1], 'left to right');
  assert.match(a, /class="ash-glow" cx="80" cy="136" rx="34" ry="12"/);
  assert.match(a, /<circle cx="80" cy="104" r="18" fill="#2b2740"/);
  const g72 = renderPet({ mood: 'dead', name: 'Mochi', level: 4, size: 72 });
  assert.ok(!g72.includes('<text'), 'no engraved text at 72 px');
  assert.match(g72, /M44 148L44 96C44 77 60 64 80 64/);
  assert.match(renderPet({ mood: 'dead', size: 128 }), /class="grave-highlight"[^>]*stroke="#5c5675" stroke-width="2"/);
});
