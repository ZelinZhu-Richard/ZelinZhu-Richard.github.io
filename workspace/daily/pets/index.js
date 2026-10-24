// Pet art API (ARCHITECTURE.md "Pet art API"). Pure string output; the one DOM helper (play)
// is only called by the browser.
//
// Species modules load with dynamic import so a species that is not built yet (or fails to load)
// falls back to an obviously-marked placeholder instead of breaking the page.

import { makeContext, assemblePet, svgRoot, esc, f, MOODS, LIVE_MOODS, GROUPS, SPECIES_GROUPS, FACE_CLASSES, ANCHOR_KEYS, SIZES } from './rig.js';
import { TIER_NAMES, TIER_KEYS, TIERS, RARITY, SILHOUETTE, tierPalette } from './palette.js';
import { renderGrave, renderAshes } from './states.js';
import { renderEgg, EGG_KINDS, EGG_STATES } from './eggs.js';

/** Species list with display names (CONTENT.md §A.2). */
export const SPECIES = Object.freeze([
  { id: 'dragon', name: 'Drakelet', unlock: { type: 'launch' } },
  { id: 'fox', name: 'Kitsu', unlock: { type: 'launch' } },
  { id: 'slime', name: 'Gumdrop', unlock: { type: 'launch' } },
  { id: 'owl', name: 'Hootling', unlock: { type: 'launch' } },
  { id: 'turtle', name: 'Pebbleback', unlock: { type: 'launch' } },
  { id: 'axolotl', name: 'Ripplegill', unlock: { type: 'launch' } },
  { id: 'hedgehog', name: 'Bramblekin', unlock: { type: 'keeper', level: 25 } },
].map((s) => Object.freeze({ ...s, unlock: Object.freeze(s.unlock) })));

/** How long each triggered class runs (ms). The UI removes the class after this (see play()). */
export const ANIM_MS = Object.freeze({
  'pet--bounce': 700, 'pet--eat': 1200, 'pet--levelup': 1200, 'pet--cheer': 1200,
  'egg--shake': 600, 'egg--crack': 500, 'egg--open': 900,
});

/** Validate a species module against the contract in species/_template.js. Returns a list of problems. */
export function validateSpecies(mod, expectedId) {
  const problems = [];
  if (!mod || typeof mod !== 'object') return ['no default export'];
  if (expectedId && mod.id !== expectedId) problems.push(`id is ${JSON.stringify(mod.id)}, expected ${expectedId}`);
  if (typeof mod.name !== 'string' || !mod.name) problems.push('name missing');
  const known = SPECIES.find((s) => s.id === mod.id);
  if (known && mod.name !== known.name) problems.push(`name ${mod.name} != ${known.name}`);
  const a = mod.anchors;
  if (!a || typeof a !== 'object') problems.push('anchors missing');
  else {
    for (const k of ['headTop', 'brow']) if (!a[k]) problems.push(`anchor ${k} missing`);
    for (const [k, v] of Object.entries(a)) {
      if (k === 'accScale') { if (!(Number(v) > 0)) problems.push('accScale must be > 0'); continue; }
      if (!ANCHOR_KEYS.includes(k)) problems.push(`unknown anchor ${k}`);
      else if (!Array.isArray(v) || v.length !== 2 || !v.every(Number.isFinite)) problems.push(`anchor ${k} must be [x, y]`);
    }
  }
  if (typeof mod.idleClass !== 'string' || !/^pet-idle--[a-z]+$/.test(mod.idleClass)) problems.push('idleClass must be "pet-idle--<id>"');
  if (typeof mod.draw !== 'function') problems.push('draw() missing');
  if (typeof mod.silhouette !== 'function') problems.push('silhouette() missing');
  if (mod.auraCenter && !(Array.isArray(mod.auraCenter) && mod.auraCenter.length === 2)) problems.push('auraCenter must be [x, y]');
  if (mod.sparkles && !(Array.isArray(mod.sparkles) && mod.sparkles.length === 2 && mod.sparkles.every((q) => Array.isArray(q) && q.length === 2 && q.every(Number.isFinite)))) problems.push('sparkles must be [[x, y], [x, y]]');
  return problems;
}

// ---- load species + optional cosmetics ----

const registry = new Map();
const status = {};
const loaded = await Promise.allSettled(SPECIES.map((s) => import(`./species/${s.id}.js`)));
loaded.forEach((r, i) => {
  const id = SPECIES[i].id;
  if (r.status !== 'fulfilled') { status[id] = 'missing'; return; }
  const problems = validateSpecies(r.value.default, id);
  if (problems.length) { status[id] = `invalid: ${problems.join('; ')}`; return; }
  registry.set(id, r.value.default);
  status[id] = 'ready';
});

let COSMETICS = {};
try { COSMETICS = (await import('./cosmetics.js')).COSMETICS || {}; } catch { COSMETICS = {}; }

/** { [speciesId]: 'ready' | 'missing' | 'invalid: …' } — the gallery shows anything not ready as a fallback. */
export function speciesStatus() { return { ...status }; }
export function getSpecies(id) { return registry.get(id) || null; }

const info = (id) => SPECIES.find((s) => s.id === id) || { id: String(id), name: String(id) };

function todoMarker(id) {
  return `<g class="fallback-marker"><rect x="4" y="4" width="152" height="152" rx="12" fill="none" stroke="#ffc98f" stroke-width="3" stroke-dasharray="8 6"/>` +
    `<rect x="28" y="2" width="104" height="20" rx="5" fill="#ffc98f" stroke="#1a1530" stroke-width="2"/>` +
    `<text x="80" y="16.5" text-anchor="middle" font-size="12" font-weight="700" font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" fill="#1a1530">TODO ${esc(id)}</text></g>`;
}

/** Silhouette markup (paths, no fill) for a species, in the 160 viewBox. Fallback: the slime's. */
export function silhouetteOf(species) {
  const sp = registry.get(species) || registry.get('slime');
  try { return sp ? sp.silhouette() : '<ellipse cx="80" cy="104" rx="44" ry="44"/>'; } catch { return '<ellipse cx="80" cy="104" rx="44" ry="44"/>'; }
}

function clampSize(size) {
  const s = Number(size);
  return Number.isFinite(s) && s > 0 ? Math.round(s) : 128;
}

/**
 * renderPet({ species, tier, mood, stars, cosmetic, size, name, level, focus, animate, uid?, ashesDone?, className? }) → svg string.
 * mood 'dead' → gravestone; 'ashes' → ashes nest (ashesDone = consecutive complete days 0–3).
 */
export function renderPet({ species = 'slime', tier = 0, mood = 'healthy', stars = 1, cosmetic = null, size = 128, name = '', level, focus = false, animate = true, uid, ashesDone = 0, className = '' } = {}) {
  const sz = clampSize(size);
  const m = MOODS.includes(mood) ? mood : 'healthy';
  const meta = info(species);
  const t = tierPalette(tier).tier;
  if (m === 'dead') return renderGrave({ species: meta.id, speciesName: meta.name, silhouette: silhouetteOf(meta.id), name, level, tier: t, size: sz, uid, className });
  if (m === 'ashes') return renderAshes({ species: meta.id, speciesName: meta.name, silhouette: silhouetteOf(meta.id), name, tier: t, done: ashesDone, size: sz, uid, animate, className });

  let sp = registry.get(meta.id);
  let fallback = !sp;
  const ctx = makeContext({ species: meta.id, tier: t, mood: m, size: sz, stars, focus, uid, level, name });
  let parts;
  try {
    parts = sp ? sp.draw(ctx) : null;
  } catch (err) {
    if (typeof console !== 'undefined') console.warn(`[pets] ${meta.id}.draw failed`, err);
    parts = null; fallback = true;
  }
  if (!parts) {
    sp = registry.get('slime');
    if (!sp) return svgRoot({ size: sz, classes: ['pet', 'pet--fallback'], label: meta.name, body: `<circle cx="80" cy="100" r="44" fill="${tierPalette(t).body}"/>${todoMarker(meta.id)}` });
    parts = sp.draw(ctx);
  }
  const shown = fallback ? { ...sp, id: meta.id, idleClass: '' } : sp;
  const cos = cosmetic && COSMETICS[cosmetic] && typeof COSMETICS[cosmetic].draw === 'function' ? COSMETICS[cosmetic].draw(ctx) : '';
  const st = Math.max(1, Math.min(5, Math.round(Number(stars) || 1)));
  const label = `${name ? `${name}, ` : ''}${TIER_NAMES[t]} ${meta.name}, ${st} star${st > 1 ? 's' : ''}${level != null ? `, level ${level}` : ''}${m !== 'healthy' ? `, ${m}` : ''}`;
  return assemblePet(ctx, shown, parts, {
    cosmetic: cos, cosmeticId: cos ? cosmetic : '', label, animate, overlay: fallback ? todoMarker(meta.id) : '',
    classes: [fallback && 'pet--fallback', className],
  });
}

/** Petdex silhouette for an unfound cell. */
export function renderSilhouette({ species = 'slime', size = 72, className = '' } = {}) {
  const meta = info(species);
  const sz = clampSize(size);
  const missing = !registry.get(meta.id);
  const body = `<ellipse cx="80" cy="149" rx="30" ry="4" fill="#000" opacity=".25"/>` +
    `<g fill="${SILHOUETTE.fill}" stroke="${SILHOUETTE.edge}" stroke-width="3" stroke-linejoin="round">${silhouetteOf(meta.id)}</g>` +
    (missing ? todoMarker(meta.id) : '');
  return svgRoot({ size: sz, classes: ['pet-silhouette', `pet--${meta.id}`, `pet--s${sz}`, missing && 'pet--fallback', className], label: 'Not discovered yet', body });
}

/**
 * Browser helper: run a triggered animation class once on a rendered <svg> (pet or egg).
 * Restarts it if already running; resolves when done. Under reduced motion (or .pet--still)
 * it resolves at once so sequences never wait on animationend.
 */
export function play(el, cls, ms) {
  if (!el || !el.classList) return Promise.resolve();
  const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce || el.classList.contains('pet--still') || el.classList.contains('egg--still')) return Promise.resolve();
  el.classList.remove(cls);
  void el.getBoundingClientRect();
  el.classList.add(cls);
  const dur = ms ?? ANIM_MS[cls] ?? 1000;
  return new Promise((resolve) => setTimeout(() => { el.classList.remove(cls); resolve(); }, dur));
}

export { renderEgg, EGG_KINDS, EGG_STATES, renderGrave, renderAshes };
export { TIER_NAMES, TIER_KEYS, TIERS, RARITY, tierPalette, MOODS, LIVE_MOODS, GROUPS, SPECIES_GROUPS, FACE_CLASSES, ANCHOR_KEYS, SIZES, f };
