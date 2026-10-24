// Progress that can't be lost, plus quests: Petdex, Keeper road, season track, milestones, receipts,
// daily quests (draw, progress, automatic awards), quest stars and the weekly chest.

import { CONFIG, HARD, MEDIUM, TIERS } from './config.js';
import { KEEPER, MILESTONES, QUESTS, RECEIPT_KINDS, SEASON, SEASON_COSMETICS } from './content.js';
import {
  computeEffects, globalPct, grantCoins, petNeed, petPct, upkeepCost,
} from './effects.js';
import { SPECIES_BY_ID, backpackCount, canHouse, fedToday, meterCap, meterMult, tierCap, xpNext } from './pets.js';
import { rPick } from './rng.js';
import { addOpenEgg } from './state.js';
import {
  baseFood, capFood, chillMinutes, isPhysicalTask, isSleepTask, minutesPerUnit,
} from './tasks.js';
import {
  addDays, clock, isWeekend, mondayOf, monthOf, parseClock,
} from './time.js';
import { hatchNeed } from './eggs-math.js';

// ---- Petdex ----------------------------------------------------------------------------------------------

export function discover(s, species, tier, dayKey, events) {
  const key = `${species}:${tier}`;
  if (s.petdex[key]) return null;
  s.petdex[key] = { firstDay: dayKey };
  const coins = CONFIG.petdex.coinsPerTier * (tier + 1);
  const diamonds = CONFIG.petdex.diamonds[tier] || 0;
  s.inv.coins += coins;
  s.inv.diamonds += diamonds;
  if (tier > s.stats.highestTier) s.stats.highestTier = tier;
  const ev = { type: 'petdex.discovered', species, tier, coins, diamonds };
  events?.push(ev);
  return ev;
}

// ---- Keeper road -----------------------------------------------------------------------------------------

export const keeperXpNext = (K) => CONFIG.keeper.xpBase + CONFIG.keeper.xpPer * K;

export function keeperRewardsFor(K) {
  const k = CONFIG.keeper;
  const r = { coins: k.coinsBase + k.coinsPer * K, diamonds: 0, backpack: 0 };
  if (K % k.bonusEvery === 0) r.coins += k.bonusCoins;
  if (K % k.every === 0) {
    r.diamonds += k.everyDiamonds;
    r.backpack += 1; // backpack cap is derived from the Keeper level (pets.backpackCap)
  }
  const title = KEEPER.titles[String(K)];
  if (title) r.title = title;
  for (const sp of KEEPER.special) {
    if (sp.lv !== K) continue;
    if (sp.cosmetic) r.cosmetic = sp.cosmetic;
    if (sp.species) r.species = sp.species;
    if (sp.auraAddon) r.auraAddon = sp.auraAddon;
  }
  return r;
}

function grantKeeperLevel(s, K, events) {
  const r = keeperRewardsFor(K);
  s.inv.coins += r.coins;
  s.inv.diamonds += r.diamonds;
  if (r.cosmetic && !s.cosmetics.includes(r.cosmetic)) s.cosmetics.push(r.cosmetic);
  if (r.species && !s.unlockedSpecies.includes(r.species)) s.unlockedSpecies.push(r.species);
  if (r.auraAddon && !s.auraAddons.includes(r.auraAddon)) s.auraAddons.push(r.auraAddon);
  events?.push({ type: 'keeper.levelUp', level: K, rewards: r });
}

/** Keeper XP = final task food (after the commitment bonus and soft cap), credited once at close. */
export function addKeeperXp(s, food, events) {
  if (!(food > 0)) return;
  s.keeper.xp += food;
  s.keeper.lifetimeFood += food;
  while (s.keeper.xp >= keeperXpNext(s.keeper.level)) {
    s.keeper.xp -= keeperXpNext(s.keeper.level);
    s.keeper.level += 1;
    grantKeeperLevel(s, s.keeper.level, events);
  }
}

export const keeperStartCoins = () => keeperRewardsFor(1).coins;

// ---- Season track ----------------------------------------------------------------------------------------

export const seasonActive = (month) => month >= CONFIG.season.firstMonth;

export function seasonFor(s, month) {
  if (s.season.month === month) return s.season;
  return { month, xp: 0, tier: 0 };
}

const tierIdx = (name) => TIERS.indexOf(name);

function grantSeasonTier(s, tier, month, dayKey, events) {
  const row = SEASON.track.find((t) => t.tier === tier) || {};
  const rewards = {};
  if (row.coins) {
    s.inv.coins += row.coins;
    rewards.coins = row.coins;
  }
  if (row.diamonds) {
    s.inv.diamonds += row.diamonds;
    rewards.diamonds = row.diamonds;
  }
  if (row.eggFood) {
    rewards.eggFood = {};
    for (const [name, n] of Object.entries(row.eggFood)) {
      s.inv.eggFood[tierIdx(name)] += n;
      rewards.eggFood[name] = n;
    }
  }
  if (row.openableEgg) {
    const egg = addOpenEgg(s, { tier: tierIdx(row.openableEgg), source: 'season', dayKey });
    rewards.openEgg = { id: egg.id, tier: egg.tier };
  }
  if (row.item === 'sproutCharm') {
    const kind = CONFIG.charms.season; // config decides: 'tier' (spec) or 'sprout' (panel)
    s.inv.charms[kind] += 1;
    rewards.charm = kind;
  }
  if (row.cosmetic === 'seasonCosmetic') {
    const c = SEASON_COSMETICS.find((x) => x.season === month);
    if (c) {
      if (!s.cosmetics.includes(c.id)) s.cosmetics.push(c.id);
      rewards.cosmetic = c.id;
    }
  }
  events?.push({ type: 'season.tierUp', tier, rewards });
}

/** Season XP = final task food this month, credited at close. Resets with the month. */
export function addSeasonXp(s, dayKey, food, events) {
  const month = monthOf(dayKey);
  if (!seasonActive(month)) return;
  if (s.season.month !== month) s.season = { month, xp: 0, tier: 0 };
  s.season.xp += Math.max(0, food);
  const target = Math.min(CONFIG.season.tiers, Math.floor(s.season.xp / CONFIG.season.xpPerTier));
  while (s.season.tier < target) {
    s.season.tier += 1;
    grantSeasonTier(s, s.season.tier, month, dayKey, events);
  }
}

export function nextSeasonReward(tier) {
  return SEASON.track.find((t) => t.tier === tier + 1) || null;
}

// ---- Milestones ------------------------------------------------------------------------------------------

export function checkMilestone(s, days, dayKey, events) {
  const row = MILESTONES.rows.find((m) => m.days === days);
  if (!row || s.badges.some((b) => b.id === row.badgeId)) return;
  s.badges.push({ id: row.badgeId, name: row.badge, days, dayKey });
  s.inv.coins += row.coins;
  s.inv.diamonds += row.diamonds;
  events?.push({ type: 'streak.milestone', days, badge: row.badge, badgeId: row.badgeId, coins: row.coins, diamonds: row.diamonds });
}

// ---- Receipts --------------------------------------------------------------------------------------------

/** Add one tick to an aggregate by the task's receipt kind. */
export function addTickToAggregate(agg, task, tick) {
  agg.ticks += 1;
  if (tick.level >= HARD) agg.hardOrAbove += 1;
  const kind = task.receipt && RECEIPT_KINDS[task.receipt];
  if (!kind) return;
  const qty = Number.isFinite(tick.qty) ? tick.qty : 0;
  const perMin = minutesPerUnit(task.unit);
  switch (kind.agg) {
    case 'sum': agg[kind.field] = (agg[kind.field] || 0) + qty; break;
    case 'count': agg[kind.field] = (agg[kind.field] || 0) + 1; break;
    case 'minutes': agg[kind.field] = (agg[kind.field] || 0) + qty * (perMin || 1); break;
    case 'average-hours': {
      const hours = perMin ? (qty * perMin) / 60 : qty;
      agg.sleepSum += hours;
      agg.sleepN += 1;
      break;
    }
    default: break;
  }
}

export function dayTicks(day) {
  return Object.entries(day?.ticks || {}).map(([taskId, t]) => ({ taskId, ...t })).sort((a, b) => a.at - b.at);
}

/** At close: month + lifetime receipts, goal counts, the private Deep-work tag ledger. */
export function recordReceipts(s, day, tasks, countedFood) {
  const month = monthOf(day.key);
  const m = (s.receipts.months[month] ||= { ticks: 0, pages: 0, outsideMin: 0, workouts: 0, sleepSum: 0, sleepN: 0, deepMin: 0, veg: 0, hardOrAbove: 0, food: 0 });
  const life = s.receipts.lifetime;
  m.food += countedFood;
  life.food += countedFood;
  for (const tick of dayTicks(day)) {
    const task = tasks.find((t) => t.id === tick.taskId);
    if (!task) continue;
    addTickToAggregate(m, task, tick);
    addTickToAggregate(life, task, tick);
    if (task.goal) s.receipts.goals[task.goal] = (s.receipts.goals[task.goal] || 0) + 1;
    if (tick.goalTag && task.receipt === 'deep') {
      const minutes = (Number.isFinite(tick.qty) ? tick.qty : 0) * (minutesPerUnit(task.unit) || 1);
      const led = (s.receipts.deepTags[tick.goalTag] ||= { total: 0, weeks: {} });
      led.total += minutes;
      const wk = mondayOf(day.key);
      led.weeks[wk] = (led.weeks[wk] || 0) + minutes;
    }
  }
}

// ---- Quests: targets -------------------------------------------------------------------------------------

const median = (xs) => {
  const a = xs.slice().sort((x, y) => x - y);
  const n = a.length;
  return n % 2 ? a[(n - 1) / 2] : (a[n / 2 - 1] + a[n / 2]) / 2;
};

/** {frog}, {target}, {physical}, {longest}, {lastMissed}, {pairA}/{pairB}, sleep, deep — computed at draw. */
export function questTargets(s, key, rng) {
  const q = CONFIG.quests;
  const tasks = s.list.tasks;
  const nonSleep = tasks.filter((t) => !isSleepTask(t));
  const out = {};

  const frogFrom = addDays(key, -q.frogDays);
  let best = null;
  for (const t of nonSleep) {
    const mins = s.history.filter((h) => h.key >= frogFrom && h.key < key && h.ticks[t.id]).map((h) => h.ticks[t.id].min);
    if (!mins.length) continue;
    const med = median(mins);
    if (!best || med > best.med) best = { id: t.id, med };
  }
  if (best) out.frog = best.id;

  if (nonSleep.length) {
    const from = addDays(key, -q.targetDays);
    const counts = nonSleep.map((t) => ({ id: t.id, n: s.history.filter((h) => h.key >= from && h.ticks[t.id]?.raised).length }));
    const min = Math.min(...counts.map((c) => c.n));
    out.target = rPick(rng, counts.filter((c) => c.n === min)).id;
  }

  const phys = tasks.find(isPhysicalTask);
  if (phys) out.physical = phys.id;

  let longest = null;
  for (const t of tasks) if (chillMinutes(t) > 0 && (!longest || chillMinutes(t) > chillMinutes(longest))) longest = t;
  if (longest) out.longest = longest.id;

  const missFrom = addDays(key, -q.lastMissDays);
  const lastMiss = s.history.filter((h) => h.key >= missFrom && h.key < key && !h.complete).sort((a, b) => (a.key < b.key ? 1 : -1))[0];
  if (lastMiss) {
    const id = lastMiss.unticked.find((tid) => nonSleep.some((t) => t.id === tid));
    if (id) out.lastMissed = id;
  }

  if (nonSleep.length >= 2) {
    const a = rPick(rng, nonSleep);
    const rest = nonSleep.filter((t) => t.id !== a.id);
    out.pairA = a.id;
    out.pairB = rPick(rng, rest).id;
  }

  const sleep = tasks.find(isSleepTask);
  if (sleep) out.sleep = sleep.id;
  const deep = tasks.find((t) => t.receipt === 'deep');
  if (deep) out.deep = deep.id;
  return out;
}

// ---- Quests: eligibility and draw ------------------------------------------------------------------------


function refsOf(id, targets) {
  switch (id) {
    case 'frog': case 'frogUp': return [targets.frog];
    case 'raiseOne': return [targets.target];
    case 'raiseTwo': return [targets.target, targets.frog];
    case 'moveEarly': return [targets.physical];
    case 'deepFirst': return [targets.longest];
    case 'habitStack': return [targets.pairA, targets.pairB];
    case 'lastMissedFirst': return [targets.lastMissed];
    case 'restRecorded': return [targets.sleep];
    case 'goalTag': return [targets.deep];
    default: return [];
  }
}

function careContext(s, fx) {
  const n = s.list.tasks.length;
  const chillFood = capFood(baseFood(n) * n);
  const held = s.day?.pool || 0;
  const active = s.pets.filter((p) => p.location === 'active');
  const meals = active.reduce((sum, p) => sum + petNeed(fx, p), 0);
  const upkeep = backpackCount(s) * upkeepCost(fx);
  return { chillFood, held, meals, upkeep, surplus: chillFood + held - meals - upkeep, active };
}

function eligible(s, quest, ctx) {
  const { targets, fx, care, dayLevel } = ctx;
  const n = s.list.tasks.length;
  const notHard = dayLevel < HARD;
  const careOk = () => care.surplus >= 0;
  switch (quest.id) {
    case 'wholeList': case 'mediumDay': case 'keepWord': case 'cleanSweep': case 'eveningToYourself': case 'halfBy':
      return true;
    case 'fourBy': return n >= CONFIG.quests.fourByMinTasks;
    case 'momentum': return n >= CONFIG.quests.momentumMinTasks;
    case 'frog': return !!targets.frog;
    case 'frogUp': return !!targets.frog && notHard;
    case 'raiseOne': return !!targets.target && notHard;
    case 'raiseTwo': return !!targets.frog && !!targets.target && targets.target !== targets.frog && notHard;
    case 'moveEarly': return !!targets.physical;
    case 'deepFirst': return !!targets.longest;
    case 'habitStack': return !!targets.pairA && !!targets.pairB;
    case 'lastMissedFirst': return !!targets.lastMissed;
    case 'restRecorded': return !!targets.sleep;
    case 'goalTag': return !!targets.deep;
    case 'feedAll': return careOk() && care.active.length > 0;
    case 'eggDay': return careOk() && care.surplus > 0
      && care.active.some((p) => meterCap(p) - p.meter <= care.surplus * meterMult(fx, p));
    case 'onTheMend': return careOk() && care.surplus > 0 && care.active.some((p) => p.comebackOwed > 0);
    case 'fanFavourite': return careOk() && n >= 2 && s.list.tasks.some((t) => patronPetsFor(s, t, targets).length > 0);
    case 'levelUp': return careOk() && care.surplus > 0
      && care.active.some((p) => p.level < tierCap(p.tier) && xpNext(p.level) - p.xp <= care.surplus * (1 + petPct(fx, p, 'xpPct') / 100));
    case 'noWaste': return careOk();
    case 'crackThree': return careOk() && s.inv.openEggs.length >= CONFIG.quests.crackThreeEggs;
    case 'warmHands': {
      // The eggs must have room for every serving the quest asks for, and the food must be owned (CONTENT.md G).
      const need = CONFIG.quests.warmHandsServings;
      const room = s.inv.petEggs.reduce((sum, e) => sum + Math.max(0, hatchNeed(e) - e.fed.length), 0);
      return careOk() && room >= need && s.inv.eggFood.reduce((a, b) => a + b, 0) >= need;
    }
    case 'hatchDay': {
      const food = s.inv.eggFood.reduce((a, b) => a + b, 0);
      return careOk() && s.inv.petEggs.some((e) => hatchNeed(e) - e.fed.length <= food && canHouse(s, { tier: e.tier, beacon: false }));
    }
    default: return false;
  }
}

/** Active pets that cheer for a task (patron tags; axolotl = last missed task; hedgehog = today's frog). */
export function patronPetsFor(s, task, targets) {
  return s.pets.filter((p) => {
    if (p.location !== 'active') return false;
    const patron = SPECIES_BY_ID[p.species]?.patron;
    if (patron === 'lastMissed') return !!targets?.lastMissed && targets.lastMissed === task.id;
    if (patron === 'frog') return !!targets?.frog && targets.frog === task.id;
    if (patron === 'physical') return task.tag === 'physical' || task.physical === true;
    return task.tag === patron;
  }).map((p) => p.id);
}

function questDeadline(quest, key) {
  if (!quest.deadline) return null;
  if (typeof quest.deadline === 'string') return parseClock(quest.deadline);
  return parseClock(isWeekend(key) ? quest.deadline.weekend : quest.deadline.weekday);
}

function fillText(text, targets, tasks, deadline) {
  const name = (id) => tasks.find((t) => t.id === id)?.name || '';
  return text.replace(/\{(\w+)\}/g, (m, k) => {
    if (k === 'deadline') return deadline == null ? m : clock(deadline);
    if (targets[k]) return name(targets[k]);
    return m;
  });
}

function makeQuest(s, def, slot, key, targets) {
  const deadline = questDeadline(def, key);
  return {
    id: def.id,
    slot,
    cat: def.cat,
    timed: !!def.timed,
    coins: def.coins,
    text: fillText(def.text, targets, s.list.tasks, deadline),
    refs: refsOf(def.id, targets).filter(Boolean),
    deadline,
    private: !!def.private,
    done: false,
    doneAt: null,
    paid: 0,
  };
}

/** Draw today's 3 quests with the seeded rng. Stored on the day; no rerolls. */
export function drawQuests(s, key, rng, { dayLevel }) {
  const fx = computeEffects(s);
  const targets = questTargets(s, key, rng);
  const ctx = { targets, fx, care: careContext(s, fx), dayLevel };
  const cfg = CONFIG.quests;
  const from = addDays(key, -cfg.noRepeatDays);
  const recent = new Set(s.quests.recent.filter((r) => r.dayKey >= from && r.dayKey < key).flatMap((r) => r.ids));
  const chosen = [];
  const exclusiveWith = (id) => QUESTS.exclusive.filter((pair) => pair.includes(id)).flat().filter((x) => x !== id);
  QUESTS.slots.forEach((cats, slotIdx) => {
    // The slot's categories first, then any task/progress quest; the 3-day no-repeat rule is relaxed only
    // when nothing fresh is eligible anywhere in that order.
    const order = [...cats, ...['task', 'progress'].filter((c) => !cats.includes(c))];
    for (const relaxed of [false, true]) {
      for (const cat of order) {
        const timedUsed = chosen.filter((q) => q.timed).length;
        const cands = QUESTS.pool.filter((q) => q.cat === cat
          && (relaxed || !recent.has(q.id))
          && !chosen.some((c) => c.id === q.id)
          && !chosen.some((c) => exclusiveWith(c.id).includes(q.id))
          && !(q.timed && timedUsed >= cfg.maxTimed)
          && eligible(s, q, ctx));
        if (!cands.length) continue;
        chosen.push(makeQuest(s, rPick(rng, cands), slotIdx + 1, key, targets));
        return;
      }
    }
  });
  s.quests.recent = [...s.quests.recent.filter((r) => r.dayKey >= addDays(key, -cfg.historyDays)), { dayKey: key, ids: chosen.map((q) => q.id) }];
  return { quests: chosen, targets };
}

/**
 * Emergency swap: a quest naming the removed task becomes an eligible quest of equal coins (deterministic).
 * When no equal-coin quest is eligible, the nearest-coin eligible quest takes its place at the original payout;
 * when none at all fits, the quest is voided and counts as done for the day's quest star, so a permitted swap
 * never costs the owner coins or the star.
 */
export function replaceQuestsForSwap(s, removedId) {
  const day = s.day;
  if (!day) return;
  const fx = computeEffects(s);
  const ctx = { targets: day.targets, fx, care: careContext(s, fx), dayLevel: day.level };
  // The swapped-in task takes over no targets; recompute names for the remaining ones.
  for (const k of Object.keys(day.targets)) if (day.targets[k] === removedId) delete day.targets[k];
  day.quests = day.quests.map((q) => {
    if (q.done || !q.refs.includes(removedId)) return q;
    const exclusiveWith = (id) => QUESTS.exclusive.filter((pair) => pair.includes(id)).flat().filter((x) => x !== id);
    const others = day.quests.filter((o) => o !== q);
    const timedUsed = others.filter((o) => o.timed).length;
    const fits = QUESTS.pool.filter((d) => d.id !== q.id
      && !others.some((o) => o.id === d.id || exclusiveWith(o.id).includes(d.id))
      && !(d.timed && timedUsed >= CONFIG.quests.maxTimed)
      && eligible(s, d, ctx));
    const same = fits.find((d) => d.coins === q.coins);
    if (same) return makeQuest(s, same, q.slot, day.key, day.targets);
    // Nearest coins first (ties: pool order); the replacement keeps the original payout.
    const near = fits.slice().sort((a, b) => Math.abs(a.coins - q.coins) - Math.abs(b.coins - q.coins))[0];
    if (near) return { ...makeQuest(s, near, q.slot, day.key, day.targets), coins: q.coins, replaced: q.id };
    return { ...q, refs: [], text: q.text, voided: true };
  });
}

// ---- Quests: progress and awards -------------------------------------------------------------------------

function questDone(s, q, day, ctx) {
  const tasks = s.list.tasks;
  const final = ctx.final;
  const n = tasks.length;
  const complete = tasks.every((t) => final.some((f) => f.taskId === t.id));
  const tick = (id) => final.find((f) => f.taskId === id);
  const nonSleepFirst = () => final.find((f) => !isSleepTask(tasks.find((t) => t.id === f.taskId) || {}));
  const byDeadline = (f) => q.deadline == null || f.min <= q.deadline;
  const twoTicks = final.length >= CONFIG.quests.minCareTicks;
  const c = day.counters;
  const active = s.pets.filter((p) => p.location === 'active');
  const allFed = active.length > 0 && active.every((p) => fedToday(p, day.key) >= petNeed(ctx.fx, p));
  const tg = day.targets;
  switch (q.id) {
    case 'wholeList': return complete;
    case 'mediumDay': return complete && final.every((f) => f.level >= MEDIUM);
    case 'keepWord': return complete && day.commitLevel != null && !day.commitBroken;
    case 'cleanSweep': case 'eveningToYourself': return complete && final.every(byDeadline);
    case 'halfBy': return final.filter(byDeadline).length >= Math.ceil(n * CONFIG.quests.halfByShare);
    case 'fourBy': return final.filter(byDeadline).length >= CONFIG.quests.fourByTicks;
    case 'momentum': {
      const w = CONFIG.quests.momentumWindowMin * 60_000;
      const k = CONFIG.quests.momentumTicks - 1;
      for (let i = 0; i + k < final.length; i += 1) if (final[i + k].at - final[i].at <= w) return true;
      return false;
    }
    case 'frog': { const f = tick(tg.frog); return !!f && nonSleepFirst()?.taskId === tg.frog; }
    case 'frogUp': return !!tick(tg.frog)?.raised;
    case 'raiseOne': return !!tick(tg.target)?.raised;
    case 'raiseTwo': return !!tick(tg.target)?.raised && !!tick(tg.frog)?.raised;
    case 'moveEarly': { const f = tick(tg.physical); return !!f && byDeadline(f); }
    case 'deepFirst': { const f = tick(tg.longest); return !!f && byDeadline(f); }
    case 'habitStack': {
      const a = tick(tg.pairA);
      const b = tick(tg.pairB);
      return !!a && !!b && b.at >= a.at && b.at - a.at <= CONFIG.quests.habitWindowMin * 60_000;
    }
    case 'lastMissedFirst': { const f = tick(tg.lastMissed); return !!f && nonSleepFirst()?.taskId === tg.lastMissed; }
    case 'restRecorded': return !!tick(tg.sleep)?.qtyGiven;
    case 'goalTag': return !!tick(tg.deep)?.goalTag;
    case 'feedAll': return twoTicks && allFed;
    case 'eggDay': return twoTicks && c.eggsLaid > 0;
    case 'onTheMend': return twoTicks && c.comebackXp > 0;
    case 'fanFavourite': return twoTicks && final.some((f) => f.patronHit);
    case 'levelUp': return twoTicks && c.levelUps > 0;
    case 'noWaste': return !!ctx.closing && complete && allFed && ctx.upkeepCovered && ctx.leftover < CONFIG.quests.noWasteMax;
    case 'crackThree': return twoTicks && c.eggsOpened >= CONFIG.quests.crackThreeEggs;
    case 'warmHands': return twoTicks && c.servingsFed >= CONFIG.quests.warmHandsServings;
    case 'hatchDay': return twoTicks && c.hatched > 0;
    default: return false;
  }
}

/**
 * Award finished quests on a day record (automatic, once per date, coins only). A tick counts once it has
 * survived the undo window, or at close. All 3 done = 1 quest star; 5 stars in a Mon–Sun week = the chest.
 */
export function refreshQuests(s, day, now, events, { closing = false, upkeepCovered = true, leftover = 0 } = {}) {
  if (!day || !day.quests?.length || !s.list) return;
  const fx = computeEffects(s);
  const undoMs = CONFIG.time.undoMinutes * 60_000;
  const final = dayTicks(day).filter((t) => closing || t.at + undoMs <= now);
  const ctx = { final, fx, closing, upkeepCovered, leftover };
  for (const q of day.quests) {
    if (q.done || q.voided) continue;
    if (!questDone(s, q, day, ctx)) continue;
    q.done = true;
    q.doneAt = closing ? null : now;
    const base = Math.round(q.coins * (1 + globalPct(fx, 'questCoinPct') / 100));
    q.paid = grantCoins(s, base, 'quest', fx);
    events?.push({ type: 'quest.completed', questId: q.id, coins: q.paid });
  }
  // A quest voided by an emergency swap counts as done for the star.
  if (!day.starGiven && day.quests.length >= CONFIG.quests.perDay && day.quests.every((q) => q.done || q.voided)
    && day.quests.some((q) => q.done)) {
    day.starGiven = true;
    const wk = mondayOf(day.key);
    if (s.quests.week.key !== wk) s.quests.week = { key: wk, stars: 0, chest: false };
    s.quests.week.stars += 1;
    events?.push({ type: 'quest.star', weekStars: s.quests.week.stars });
    if (s.quests.week.stars >= CONFIG.quests.weekStars && !s.quests.week.chest) {
      s.quests.week.chest = true;
      const egg = addOpenEgg(s, { tier: CONFIG.quests.chestTier, source: 'chest', dayKey: day.key });
      s.inv.diamonds += CONFIG.quests.chestDiamonds;
      events?.push({ type: 'chest.ready', eggId: egg.id, tier: egg.tier, diamonds: CONFIG.quests.chestDiamonds });
    }
  }
}

export function weekStars(s, key) {
  return s.quests.week.key === mondayOf(key) ? s.quests.week.stars : 0;
}
