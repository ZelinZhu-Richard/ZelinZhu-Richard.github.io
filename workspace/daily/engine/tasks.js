// Task math: list validation, normalized base food, tier amounts and text, the soft cap.

import { CONFIG, LEVELS } from './config.js';
import { PATRON_TAGS, RECEIPT_KINDS } from './content.js';
import { fail } from './state.js';

// Duration units and their aliases. normalizeTask stores the canonical 'minutes' / 'hours'; older saves may still
// hold an alias, so every check goes through canonicalUnit().
const UNIT_ALIASES = {
  minutes: 'minutes', minute: 'minutes', min: 'minutes', mins: 'minutes',
  hours: 'hours', hour: 'hours', h: 'hours', hr: 'hours', hrs: 'hours',
};
const DURATION_MINUTES = { minutes: 1, hours: 60 };
export const canonicalUnit = (unit) => {
  if (typeof unit !== 'string') return unit;
  const u = unit.trim().toLowerCase();
  return UNIT_ALIASES[u] || unit.trim();
};
export const isDurationUnit = (unit) => Object.hasOwn(DURATION_MINUTES, canonicalUnit(unit) ?? '');
export const minutesPerUnit = (unit) => DURATION_MINUTES[canonicalUnit(unit)] || 0;

export const isSleepTask = (t) => t.tag === 'sleep' || t.receipt === 'sleep';
export const isPhysicalTask = (t) => t.physical === true || t.tag === 'physical';

/** base = round(360 / (2 × taskCount)). */
export function baseFood(taskCount) {
  if (!taskCount) return 0;
  return Math.round(CONFIG.tasks.foodPerAllEasyDay / (2 * taskCount));
}

export const foodAt = (taskCount, level) => baseFood(taskCount) * CONFIG.tasks.foodMult[level];

/** Soft daily cap: food above 1,200 counts at 50 %. Floors to whole food. */
export function capFood(raw) {
  const { softCap, softCapRate } = CONFIG.tasks;
  const v = raw <= softCap ? raw : softCap + (raw - softCap) * softCapRate;
  return Math.floor(v);
}

/** The quantity a quantity task asks for at a level: Chill × multiple, rounded up. Physical durations cap at Hard. */
export function taskAmount(task, level) {
  if (task.type !== 'quantity') {
    const q = task.tierQty?.[level];
    return Number.isFinite(q) ? q : null;
  }
  let lv = level;
  if (isPhysicalTask(task) && isDurationUnit(task.unit)) lv = Math.min(lv, CONFIG.tasks.physicalDurationCapLevel);
  return Math.ceil(task.chill * CONFIG.tasks.qtyMult[lv] - 1e-9);
}

export function formatAmount(amount, unit) {
  if (amount == null) return '';
  const u = canonicalUnit(unit);
  if (u === 'minutes') return amount > 60 ? `${(amount / 60).toFixed(1)} h` : `${amount} min`;
  if (u === 'hours') return `${amount} h`;
  return `${amount} ${unit || ''}`.trim();
}

/** The rule shown on a task at a level. */
export function amountText(task, level) {
  const name = LEVELS[level];
  if (task.type === 'quality') return task.tiers?.[name] || task.tiers?.chill || task.chillText || '';
  const base = formatAmount(taskAmount(task, level), task.unit);
  if (isPhysicalTask(task) && level > CONFIG.tasks.physicalDurationCapLevel && task.tiers?.[name]) return `${base} · ${task.tiers[name]}`;
  return base;
}

/** Chill requirement in minutes, for {longest}. 0 when not a duration task. */
export const chillMinutes = (t) => (t.type === 'quantity' && isDurationUnit(t.unit) ? t.chill * minutesPerUnit(t.unit) : 0);

function slug(text) {
  return String(text).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24) || 'task';
}

const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/** Validate and normalize one TaskDef. Throws GameError('bad_task'). */
export function normalizeTask(def, index = 0) {
  if (!def || typeof def !== 'object') fail('bad_task', `Task ${index + 1} is not a task.`);
  const name = str(def.name, CONFIG.tasks.nameMax);
  if (!name) fail('bad_task', `Task ${index + 1} needs a name.`);
  const type = def.type === 'quality' ? 'quality' : def.type === 'quantity' ? 'quantity' : null;
  if (!type) fail('bad_task', `${name}: type must be quantity or quality.`);
  const out = {
    id: def.id ? slug(def.id) : null,
    name,
    type,
    physical: def.physical === true,
    unit: canonicalUnit(str(def.unit, CONFIG.tasks.unitMax)) || (type === 'quantity' ? '' : null),
    goal: str(def.goal, CONFIG.tasks.textMax) || null,
    purpose: str(def.purpose, CONFIG.tasks.textMax) || null,
    tag: PATRON_TAGS.includes(def.tag) ? def.tag : null,
    receipt: Object.hasOwn(RECEIPT_KINDS, def.receipt) ? def.receipt : null,
  };
  if (type === 'quantity') {
    const chill = Number(def.chill);
    if (!(chill > 0) || !Number.isFinite(chill)) fail('bad_task', `${name}: a quantity task needs a Chill amount above 0.`);
    if (!out.unit) fail('bad_task', `${name}: a quantity task needs a unit.`);
    out.chill = chill;
  } else {
    out.chillText = str(def.chillText, CONFIG.tasks.textMax) || null;
    if (!out.chillText && !str(def.tiers?.chill, CONFIG.tasks.textMax)) fail('bad_task', `${name}: a quality task needs a Chill description.`);
  }
  if (def.tiers && typeof def.tiers === 'object') {
    out.tiers = {};
    for (const lv of LEVELS) {
      const t = str(def.tiers[lv], CONFIG.tasks.textMax);
      if (t) out.tiers[lv] = t;
    }
  }
  if (Array.isArray(def.tierQty) && def.tierQty.length === LEVELS.length && def.tierQty.every((q) => Number.isFinite(q) && q >= 0)) {
    out.tierQty = def.tierQty.slice();
  }
  return out;
}

/** Validate a whole list and give every task a unique id. */
export function normalizeTasks(defs) {
  if (!Array.isArray(defs)) fail('bad_list', 'The list must be an array of tasks.');
  const { minTasks, maxTasks } = CONFIG.tasks;
  if (defs.length < minTasks || defs.length > maxTasks) fail('bad_list', `A list has ${minTasks}–${maxTasks} tasks.`);
  const used = new Set();
  return defs.map((d, i) => {
    const t = normalizeTask(d, i);
    let id = t.id || slug(t.name);
    let k = 2;
    while (used.has(id)) id = `${t.id || slug(t.name)}-${k++}`;
    used.add(id);
    t.id = id;
    return t;
  });
}

