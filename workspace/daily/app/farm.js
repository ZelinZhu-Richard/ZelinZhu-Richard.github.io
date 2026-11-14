// Space farm: the isometric (2.5D) scene that replaces the pet grid on /daily/.
// Pure: layout, projection, crop choice and markup. No DOM; tested in Node.
// The canvas painter (app/farm-canvas.js) draws the island, crops and sky from the same
// constants and the JSON model in data-farm; pets are real SVG buttons laid over the canvas.
import { html, raw } from './html.js';
import { levelColor, levelLabel, num, tierColor, tierName } from './format.js';

// Logical scene frame. The canvas and every overlay use these units, scaled by CSS.
export const FARM = Object.freeze({ size: 8, tileW: 100, tileH: 50, lift: 26, width: 1000, height: 660, originX: 500, originY: 132 });
export const MAX_PLOTS = 12;

const key = (gx, gy) => `${gx},${gy}`;
// The island: an 8×8 grid with clipped corners. The back corner is a raised terrace (decor only).
const TRIMMED = new Set(['0,0', '7,0', '0,7', '7,7', '6,7']);
export const onIsland = (gx, gy) => gx >= 0 && gy >= 0 && gx < FARM.size && gy < FARM.size && !TRIMMED.has(key(gx, gy));
export const isTerrace = (gx, gy) => onIsland(gx, gy) && gx + gy <= 3;
export const elevation = (gx, gy) => (isTerrace(gx, gy) ? 1 : 0);

// Field rows, front first: 8 plots on rows 6 and 5, then row 4 for lists of 9–12 tasks.
export const PLOT_TILES = Object.freeze([[2, 6], [3, 6], [4, 6], [5, 6], [2, 5], [3, 5], [4, 5], [5, 5], [2, 4], [3, 4], [4, 4], [5, 4]]);
const FIELD = new Set(PLOT_TILES.map(([x, y]) => key(x, y)));

// Decor on the terrace (drawn by the canvas; tall things stay behind every pet slot).
export const DECOR = Object.freeze([
  { id: 'dome', gx: 1, gy: 1 },
  { id: 'rocket', gx: 3, gy: 0 },
  { id: 'tank', gx: 0, gy: 3 },
  { id: 'antenna', gx: 2, gy: 1 },
  { id: 'crystals', gx: 0, gy: 2 },
  { id: 'crystals', gx: 1, gy: 0 },
]);

// Screen point of grid corner (gx, gy) at elevation h. Tile centres are (gx + .5, gy + .5).
export function iso(gx, gy, h = 0) {
  return { x: FARM.originX + (gx - gy) * FARM.tileW / 2, y: FARM.originY + (gx + gy) * FARM.tileH / 2 - h * FARM.lift };
}
export const tileCenter = (gx, gy) => iso(gx + 0.5, gy + 0.5, elevation(gx, gy));

// Inverse projection at ground level (h = 0): screen point → tile, or null off the island.
export function tileAt(x, y, h = 0) {
  const a = (x - FARM.originX) / (FARM.tileW / 2);
  const b = (y + h * FARM.lift - FARM.originY) / (FARM.tileH / 2);
  const gx = Math.floor((a + b) / 2);
  const gy = Math.floor((b - a) / 2);
  return onIsland(gx, gy) ? { gx, gy } : null;
}

// A pet overlay is drawn above the canvas, so a crop just in front of a pet would be hidden
// by it. Pet slots keep two rows of depth away from any plot that shares their column.
const clearOfField = (gx, gy) => PLOT_TILES.every(([px, py]) => {
  const dDepth = px + py - (gx + gy);
  const dCol = Math.abs(px - py - (gx - gy));
  return !(dDepth > 0 && dDepth < 2 && dCol <= 1);
});
const NEST = [4.6, 2.6]; // the meadow's middle; nearer slots fill first
export const PET_SLOTS = Object.freeze((() => {
  const out = [];
  for (let gx = 0; gx < FARM.size; gx++) {
    for (let gy = 0; gy < FARM.size; gy++) {
      if (!onIsland(gx, gy) || isTerrace(gx, gy) || FIELD.has(key(gx, gy)) || !clearOfField(gx, gy)) continue;
      out.push([gx, gy]);
    }
  }
  const d = ([x, y]) => Math.hypot(x + 0.5 - NEST[0], y + 0.5 - NEST[1]);
  // Spread: take the nearest slot, then prefer slots not touching one already taken.
  const pool = out.sort((a, b) => d(a) - d(b) || a[0] - b[0]);
  const picked = [];
  const near = (a, b) => Math.abs(a[0] - b[0]) <= 1 && Math.abs(a[1] - b[1]) <= 1;
  for (const s of pool) if (!picked.some(p => near(p, s))) picked.push(s);
  for (const s of pool) if (!picked.includes(s)) picked.push(s);
  return picked;
})());

// Crops: one plot per task. Kind from the task's id, tag or name; unknown tasks get a stable pick.
export const CROPS = Object.freeze({
  comet: { name: 'Comet corn', hue: '#ff9f6b' },
  moonbulb: { name: 'Moonbulb', hue: '#b9c4ff' },
  starfruit: { name: 'Starfruit', hue: '#ffe07a' },
  nebula: { name: 'Nebula fern', hue: '#d69bff' },
  skybloom: { name: 'Sky bloom', hue: '#8fe3ff' },
  quartz: { name: 'Quartz sprout', hue: '#9ff5d0' },
});
const CROP_RULES = [
  [/workout|work out|gym|run|lift|sport|exercise|physical/, 'comet'],
  [/sleep|rest|nap|bed/, 'moonbulb'],
  [/veg|eat|food|meal|cook|water/, 'starfruit'],
  [/read|book|page|write|journal/, 'nebula'],
  [/grass|outside|outdoor|walk|sun|hike/, 'skybloom'],
  [/deep|work|study|code|focus|learn|research/, 'quartz'],
];
const hash = s => [...String(s)].reduce((h, ch) => (Math.imul(h, 31) + ch.charCodeAt(0)) >>> 0, 7);
export function cropFor(task) {
  const text = `${task?.id || ''} ${task?.tag || ''} ${task?.name || ''}`.toLowerCase();
  for (const [re, kind] of CROP_RULES) if (re.test(text)) return kind;
  if (task?.physical) return 'comet';
  const kinds = Object.keys(CROPS);
  return kinds[hash(task?.id || task?.name || '') % kinds.length];
}

const pct = (v, total) => `${Math.round((v / total) * 10000) / 100}%`;

// Everything the markup and the canvas need, from the engine's view models.
export function farmModel(today, pets, header, { selectedId } = {}) {
  const tasks = (today?.tasks || []).slice(0, MAX_PLOTS);
  const plots = tasks.map((t, i) => {
    const [gx, gy] = PLOT_TILES[i];
    const crop = cropFor(t);
    return { taskId: t.id, name: t.name, crop, cropName: CROPS[crop].name, grown: Boolean(t.ticked), level: t.level, color: t.ticked ? levelColor(t.level) : CROPS[crop].hue, gx, gy };
  });
  const active = (pets?.active || []).slice(0, PET_SLOTS.length);
  const selected = active.find(p => p.id === selectedId) || active.find(p => p.mood !== 'dead') || active[0] || null;
  const crew = active.map((p, i) => {
    const [gx, gy] = PET_SLOTS[i];
    const c = tileCenter(gx, gy);
    return { id: p.id, gx, gy, x: c.x, y: c.y, z: (gx + gy) * 10 + 10, pet: p, selected: p.id === selected?.id };
  });
  const done = plots.filter(p => p.grown).length;
  const food = today?.food || {};
  return {
    plots, crew, selected,
    extraTasks: Math.max(0, (today?.tasks?.length || 0) - MAX_PLOTS),
    extraPets: Math.max(0, (pets?.active?.length || 0) - active.length),
    stats: {
      grown: done, total: plots.length, perfect: plots.length > 0 && done === plots.length,
      pool: food.pool || 0, need: food.activeNeed || 0,
      streak: header?.streak || 0, hunger: header?.hunger || 'fed',
    },
  };
}

// The JSON the canvas reads (only what it draws; names stay in the DOM and aria-label).
export function canvasData(model) {
  const s = model.stats;
  return {
    plots: model.plots.map(p => ({ id: p.taskId, gx: p.gx, gy: p.gy, crop: p.crop, grown: p.grown, color: p.color, name: p.name, cropName: p.cropName, level: p.grown ? levelLabel(p.level) : '' })),
    crew: model.crew.map(c => ({ gx: c.gx, gy: c.gy, sel: c.selected })),
    grown: s.grown, total: s.total, perfect: s.perfect, hunger: s.hunger, streak: s.streak,
    fuel: s.need > 0 ? Math.min(1, s.pool / s.need) : s.pool > 0 ? 1 : 0,
  };
}

export function farmLabel(model) {
  const s = model.stats;
  const crops = model.plots.length
    ? `${s.grown} of ${s.total} crops grown: ${model.plots.map(p => `${p.cropName} for ${p.name}${p.grown ? ` (grown, ${levelLabel(p.level)})` : ' (sprout)'}`).join('; ')}.`
    : 'No crops planted yet.';
  const crew = model.crew.length ? `${model.crew.length} pet${model.crew.length === 1 ? '' : 's'} aboard.` : 'No pets aboard.';
  return `Space farm on a floating asteroid. ${crops} ${crew}`;
}

const HUNGER_TEXT = { fed: 'Crops healthy', hungry: 'Crops drooping', starving: 'Crops wilting', dead: 'Field in ashes' };

export function renderFarm(model, ctx) {
  const s = model.stats;
  const data = JSON.stringify(canvasData(model));
  return html`<div class="farm" data-farm="${data}">
<div class="farm-stage">
<canvas class="farm-canvas" width="${FARM.width}" height="${FARM.height}" role="img" aria-label="${farmLabel(model)}"></canvas>
<div class="farm-hud" aria-hidden="true"><span class="farm-chip"><b>${s.grown}/${s.total}</b> crops</span><span class="farm-chip"><b>${num(s.pool)}</b> stardust</span><span class="farm-chip"><b>${s.streak}</b> day streak</span><span class="farm-chip farm-chip--${s.hunger}">${HUNGER_TEXT[s.hunger] || HUNGER_TEXT.fed}</span></div>
${model.crew.length ? html`<ul class="farm-crew" aria-label="Pets on the farm">${model.crew.map((c, i) => html`<li class="farm-spot${c.selected ? ' is-selected' : ''}" style="left:${pct(c.x, FARM.width)};top:${pct(c.y, FARM.height)};z-index:${c.z};--float-delay:${-(i * 0.7).toFixed(1)}s">
<button type="button" class="farm-pet" data-action="farm-select" data-pet="${c.id}" aria-pressed="${c.selected}" aria-label="${c.pet.name}, ${tierName(c.pet.tier)} ${c.pet.speciesName || c.pet.species}, ${c.pet.mood === 'dead' ? 'gravestone' : `level ${c.pet.level}`}. Show details" style="--tier:${tierColor(c.pet.tier)}">${raw(ctx.art.renderPet({ species: c.pet.species, tier: c.pet.tier, mood: c.pet.mood, stars: c.pet.stars, cosmetic: c.pet.cosmetic, size: 128, name: c.pet.name, level: c.pet.level, focus: c.selected, animate: !ctx.reduced }))}</button>
<span class="farm-tag" aria-hidden="true">${c.pet.name}</span></li>`)}</ul>` : html`<p class="farm-empty">No pets aboard.${ctx.owner ? ' Hatch a pet egg or bring one in from the backpack.' : ''}</p>`}
<p class="farm-tip" role="tooltip" hidden></p>
</div>
${model.extraTasks || model.extraPets ? html`<p class="mono-label farm-note">${model.extraTasks ? `+${model.extraTasks} more task${model.extraTasks === 1 ? '' : 's'} not planted (12 plots). ` : ''}${model.extraPets ? `+${model.extraPets} more pets in orbit.` : ''}</p>` : ''}
</div>`;
}
