// The day: monthly list (setup, next month, emergency swap), the day level, raises, ticks, undo, food
// (normalized base, progressive soft cap) and feeding pets from today's pool.

import { CONFIG, GODDAMN, LEVEL_LABELS } from './config.js';
import { DEEP_WORK_TAGS } from './content.js';
import { computeEffects, petNeed } from './effects.js';
import { payCompletion } from './close.js';
import { addGrowth, fedToday } from './pets.js';
import { patronPetsFor, replaceQuestsForSwap } from './progress.js';
import { fail, requirePet } from './state.js';
import {
  canonicalUnit, capFood, foodAt, isDurationUnit, minutesPerUnit, normalizeTask, normalizeTasks, taskAmount,
} from './tasks.js';
import {
  addDays, dayKey, minuteOfDay, monthOf, nextMonth, phaseAt,
} from './time.js';

// ---- the day record --------------------------------------------------------------------------------------

export function newDayRecord(s, key, now) {
  const lvl = Number.isInteger(s.settings.defaultDayLevel) ? s.settings.defaultDayLevel : CONFIG.tasks.defaultDayLevel;
  return {
    key,
    month: monthOf(key),
    level: Math.min(CONFIG.tasks.dayLevelMax, Math.max(0, lvl)),
    commitLevel: null,
    commitBroken: false,
    raises: {}, // taskId → level (unticked tasks raised above the day level)
    ticks: {}, // taskId → { level, raw, counted, at, min, qty, qtyGiven, raised, goalTag, patronHit }
    raw: 0, // food before the soft cap
    counted: 0, // food after the soft cap
    pool: 0, // unspent food
    fedTotal: 0,
    counters: { eggsLaid: 0, eggsOpened: 0, servingsFed: 0, hatched: 0, levelUps: 0, comebackXp: 0 },
    quests: [],
    targets: {},
    starGiven: false,
    reward: null, // the completion reward, once paid (close.js payCompletion): ticks are final from then on
    openedAt: now,
  };
}

/** The level a task counts at: its tick level once ticked, else max(day level, its raise). */
export function taskLevel(day, taskId) {
  if (!day) return CONFIG.tasks.defaultDayLevel;
  const tick = day.ticks[taskId];
  if (tick) return tick.level;
  return Math.max(day.level, day.raises[taskId] ?? -1);
}

export function goddamnCount(day, tasks) {
  if (!day) return 0;
  return tasks.filter((t) => taskLevel(day, t.id) === GODDAMN).length;
}

/** Levels an unticked task can be raised to: above its level, up to Goddamn, Goddamn only while under the cap. */
export function raiseOptions(day, tasks, taskId) {
  if (!day || day.ticks[taskId]) return [];
  const cur = taskLevel(day, taskId);
  const out = [];
  for (let l = cur + 1; l <= GODDAMN; l += 1) {
    if (l === GODDAMN && goddamnCount(day, tasks) >= CONFIG.tasks.maxGoddamn) continue;
    out.push(l);
  }
  return out;
}

/** The open day, inside the 05:00–22:00 window. Throws otherwise. */
export function requireOpenDay(s, now) {
  if (!s.list) fail('no_list', 'Set up your list first.');
  if (phaseAt(now) !== 'open') fail('window_closed', 'The day window is 05:00–22:00 New York time.');
  if (!s.day || s.day.key !== dayKey(now)) fail('day_not_open', "Today isn't open yet.");
  return s.day;
}

const levelOk = (lv, max) => Number.isInteger(lv) && lv >= 0 && lv <= max;

function parseLevel(level) {
  if (typeof level === 'string') {
    const i = ['chill', 'easy', 'medium', 'hard', 'goddamn'].indexOf(level.toLowerCase());
    return i;
  }
  return level;
}

// ---- list ------------------------------------------------------------------------------------------------

function startDayFor(now) {
  const today = dayKey(now);
  return phaseAt(now) === 'closed' ? addDays(today, 1) : today;
}

/** The first list. Days start counting from today (or tomorrow if it's already past 22:00). */
export function setupList(s, tasks, now, events) {
  if (s.list) fail('list_locked', "This month's list is locked. Set next month's list instead.");
  const clean = normalizeTasks(tasks);
  const start = s.startDay && s.startDay >= startDayFor(now) ? s.startDay : startDayFor(now);
  s.startDay = start;
  s.lastClosed = addDays(start, -1);
  s.list = { month: monthOf(start), tasks: clean, swaps: 0, lockedAt: now };
  events?.push({ type: 'list.locked', month: s.list.month, tasks: clean.length });
}

/** Next month's list; it locks on the 1st. Until then this month's list stays. */
export function setNextList(s, tasks, now, events) {
  if (!s.list) fail('no_list', 'Set up your first list before planning next month.');
  const clean = normalizeTasks(tasks);
  const current = s.list.month > monthOf(dayKey(now)) ? s.list.month : monthOf(dayKey(now));
  s.nextList = { month: nextMonth(current), tasks: clean };
  events?.push({ type: 'list.nextSaved', month: s.nextList.month, tasks: clean.length });
}

/**
 * Quantity → quantity in the same unit (aliases like min/minutes count as one unit; minutes and hours compare in
 * minutes) must keep an equal or higher Chill amount. Other swaps are honour-system and logged.
 */
function swapIsEasier(old, next) {
  if (old.type !== 'quantity' || next.type !== 'quantity') return false;
  if (isDurationUnit(old.unit) && isDurationUnit(next.unit)) {
    return next.chill * minutesPerUnit(next.unit) < old.chill * minutesPerUnit(old.unit) - 1e-9;
  }
  return canonicalUnit(old.unit) === canonicalUnit(next.unit) && next.chill < old.chill;
}

/** One emergency swap a month, logged publicly with a reason. Chill baseline must be equal or harder. */
export function swapTask(s, taskId, def, reason, now, events) {
  if (!s.list) fail('no_list', 'Set up your list first.');
  if (s.list.swaps >= CONFIG.tasks.swapsPerMonth) fail('swap_used', "This month's emergency swap is used.");
  const why = typeof reason === 'string' ? reason.trim() : '';
  if (!why) fail('swap_reason', 'A swap needs a one-line reason.');
  if (why.length > CONFIG.tasks.swapReasonMax) fail('swap_reason', `Keep the reason under ${CONFIG.tasks.swapReasonMax} characters.`);
  const idx = s.list.tasks.findIndex((t) => t.id === taskId);
  if (idx < 0) fail('no_task', 'That task is not on the list.');
  const old = s.list.tasks[idx];
  const today = s.day && s.day.key === dayKey(now) ? s.day : null;
  if (today?.ticks[taskId]) fail('task_ticked', 'That task is already ticked today. Swap it tomorrow.');
  const next = normalizeTask(def);
  if (swapIsEasier(old, next)) {
    fail('swap_easier', `The new Chill baseline (${next.chill} ${next.unit}) must be at least ${old.chill} ${old.unit}.`);
  }
  let id = next.id && next.id !== old.id ? next.id : `${old.id}-swap`;
  while (s.list.tasks.some((t) => t.id === id)) id = `${id}x`;
  next.id = id;
  s.list.tasks = s.list.tasks.map((t, i) => (i === idx ? next : t));
  s.list.swaps += 1;
  s.swapLog.push({ month: s.list.month, dayKey: dayKey(now), fromId: old.id, fromName: old.name, toId: id, toName: next.name, reason: why });
  if (s.swapLog.length > CONFIG.history.swapLog) s.swapLog = s.swapLog.slice(-CONFIG.history.swapLog);
  if (today) {
    delete today.raises[taskId];
    replaceQuestsForSwap(s, taskId);
  }
  events?.push({ type: 'list.swapped', fromId: old.id, toId: id, reason: why });
}

// ---- day level, raises, ticks ----------------------------------------------------------------------------

/**
 * Change the day level (Chill–Hard) any time before 22:00. Only unticked tasks change. Lowering takes every
 * unticked task down to the new level (raises are cleared); raising keeps raises that are still above it.
 * Lowering below the morning commitment (the level at the first tick) loses the commitment bonus.
 */
export function setDayLevel(s, level, now, events) {
  const day = requireOpenDay(s, now);
  const lv = parseLevel(level);
  if (!levelOk(lv, CONFIG.tasks.dayLevelMax)) fail('bad_level', 'The day level is Chill, Easy, Medium or Hard.');
  const from = day.level;
  if (lv === from) return;
  if (lv < from) {
    day.raises = {};
  } else {
    for (const [id, r] of Object.entries(day.raises)) if (r <= lv) delete day.raises[id];
  }
  day.level = lv;
  let broke = false;
  // Once every task is ticked the day is finished, so a later change can't break the commitment (PLAN §3).
  const finished = s.list.tasks.every((t) => day.ticks[t.id]);
  if (day.commitLevel != null && lv < day.commitLevel && !day.commitBroken && !finished) {
    day.commitBroken = true;
    broke = true;
  }
  events?.push({ type: 'day.levelChanged', from, to: lv, commitBroken: day.commitBroken, justBroken: broke });
}

/** Raise one unticked task above the day level, up to Goddamn (at most 2 Goddamn tasks a day). Never lower. */
export function raiseTask(s, taskId, level, now, events) {
  const day = requireOpenDay(s, now);
  const task = s.list.tasks.find((t) => t.id === taskId);
  if (!task) fail('no_task', 'That task is not on the list.');
  if (day.ticks[taskId]) fail('task_ticked', "A ticked task's level is locked.");
  const lv = parseLevel(level);
  if (!levelOk(lv, GODDAMN)) fail('bad_level', 'Unknown level.');
  const cur = taskLevel(day, taskId);
  if (lv <= cur) fail('no_lowering', 'Tasks can only be raised above the day level. Lower the whole day instead.');
  if (lv === GODDAMN && goddamnCount(day, s.list.tasks) >= CONFIG.tasks.maxGoddamn) fail('goddamn_cap', `At most ${CONFIG.tasks.maxGoddamn} Goddamn tasks a day.`);
  day.raises[taskId] = lv;
  events?.push({ type: 'task.raised', taskId, from: cur, level: lv });
}

/** Recompute each tick's counted food in tick order (soft cap applied progressively). */
function recount(day) {
  let raw = 0;
  for (const t of Object.values(day.ticks).sort((a, b) => a.at - b.at || a.seq - b.seq)) {
    const before = capFood(raw);
    raw += t.raw;
    t.counted = capFood(raw) - before;
  }
  day.raw = raw;
  day.counted = capFood(raw);
}

export function tickTask(s, taskId, opts, now, events, rng) {
  const day = requireOpenDay(s, now);
  const task = s.list.tasks.find((t) => t.id === taskId);
  if (!task) fail('no_task', 'That task is not on the list.');
  if (day.ticks[taskId]) fail('task_ticked', 'Already ticked.');
  const level = taskLevel(day, taskId);
  let qty = taskAmount(task, level);
  let qtyGiven = false;
  if (opts.qty != null) {
    const q = Number(opts.qty);
    if (!Number.isFinite(q) || q < 0 || q > CONFIG.tasks.qtyMax) fail('bad_qty', 'Enter the real amount you did.');
    qty = q;
    qtyGiven = true;
  }
  let goalTag = null;
  if (opts.goalTag != null) {
    if (task.receipt !== 'deep' || !DEEP_WORK_TAGS.includes(opts.goalTag)) fail('bad_goal_tag', 'Pick one of the Deep work goals.');
    goalTag = opts.goalTag;
  }
  const raw = foodAt(s.list.tasks.length, level);
  if (day.commitLevel == null) day.commitLevel = day.level;
  const cheer = patronPetsFor(s, task, day.targets);
  const before = day.counted;
  day.ticks[taskId] = {
    level,
    raw,
    counted: 0,
    at: now,
    seq: Object.keys(day.ticks).length,
    min: minuteOfDay(now),
    qty,
    qtyGiven,
    raised: level > day.level,
    goalTag,
    patronHit: cheer.length > 0,
  };
  delete day.raises[taskId];
  recount(day);
  const counted = day.counted - before;
  day.pool += counted;
  const perfect = s.list.tasks.every((t) => day.ticks[t.id]);
  events?.push({ type: 'task.ticked', taskId, level, levelLabel: LEVEL_LABELS[level], food: raw, counted, qty, cheer, perfect });
  // The last tick pays the completion reward right away.
  if (perfect) payCompletion(s, day, now, rng, events ?? []);
}

/** Undo within 5 minutes (strictly before tick + 5:00). Refused if that food was already handed out, or once the
 * completion reward is paid. */
export function undoTick(s, taskId, now, events) {
  const day = requireOpenDay(s, now);
  const tick = day.ticks[taskId];
  if (!tick) fail('not_ticked', 'That task is not ticked.');
  if (day.reward) fail('day_final', "Today's reward is paid, so today's ticks are final.");
  // Exclusive at +5:00: from that instant the tick is final and quests may already have paid for it.
  if (now - tick.at >= CONFIG.time.undoMinutes * 60_000) fail('undo_expired', `Ticks can be undone for ${CONFIG.time.undoMinutes} minutes.`);
  const newCounted = capFood(day.raw - tick.raw);
  const delta = day.counted - newCounted;
  if (day.pool < delta) fail('food_spent', 'That food was already fed to a pet, so the tick is final.');
  delete day.ticks[taskId];
  recount(day);
  day.pool -= delta;
  if (!Object.keys(day.ticks).length) {
    day.commitLevel = null;
    day.commitBroken = false;
  }
  events?.push({ type: 'task.undone', taskId, food: delta });
}

// ---- feeding ---------------------------------------------------------------------------------------------

function findPetActive(s, petId) {
  const pet = requirePet(s, petId);
  if (pet.location !== 'active') fail('not_active', 'Only pets in a seat eat from the pool; backpack pets take upkeep at 22:00.');
  return pet;
}

/**
 * Hand food from today's pool to an active pet. Food beyond 100 today goes straight into its XP and egg meter,
 * 1:1 (foodNeedReduce only lowers the fed threshold). Any time while the day is open.
 */
export function feedPet(s, petId, amount, now, ctx) {
  if (!s.day || s.day.key !== dayKey(now)) fail('day_not_open', "Today isn't open yet.");
  const day = s.day;
  const pet = findPetActive(s, petId);
  const n = Number(amount);
  if (!Number.isInteger(n) || n <= 0) fail('bad_amount', 'Feed a whole amount of food above 0.');
  if (n > day.pool) fail('not_enough_food', `Only ${day.pool} food is left in today's pool.`);
  const fx = ctx.fx || computeEffects(s);
  const before = fedToday(pet, day.key);
  const after = before + n;
  const line = CONFIG.pets.need;
  const growth = Math.max(0, after - line) - Math.max(0, before - line);
  pet.fed = { day: day.key, amount: after };
  day.pool -= n;
  day.fedTotal += n;
  if (after >= petNeed(fx, pet) && pet.hungrySince && pet.hungrySince < day.key) pet.hungrySince = null;
  ctx.events.push({ type: 'pet.fed', petId, amount: n, excess: growth, fedToday: after });
  addGrowth(s, pet, growth, { ...ctx, fx, dayKey: day.key, counters: day.counters });
}
