// advance(): closes every finished day at 22:00 New York (idempotent, keyed by date, catches up over any
// number of days, DST-safe), then opens today inside 05:00–22:00. Day evaluation: PLAN.md §4–5, §13.

import { CONFIG, GODDAMN, HARD } from './config.js';
import {
  commitBonusPts, computeEffects, grantCoins, petNeed, streakEggBonusFor, upkeepCost,
} from './effects.js';
import {
  addGrowth, cumulativeXp, dividendOf, fedToday, loseLevels, normalizeSeats, placePet,
} from './pets.js';
import {
  addKeeperXp, addSeasonXp, checkMilestone, drawQuests, recordReceipts, refreshQuests, seasonActive,
} from './progress.js';
import { questRng, rInt, rShuffle } from './rng.js';
import { expireFlashSale, startFlashSale } from './shop.js';
import { addOpenEgg, addPetEgg, addShards } from './state.js';
import { newDayRecord } from './day.js';
import { capFood } from './tasks.js';
import {
  addDays, closeInstant, dayKey, lastFinishedDay, monthOf, phaseAt,
} from './time.js';

// ---- streak eggs -----------------------------------------------------------------------------------------

/** Openable eggs paid at the close of a complete day with streak `days`: { tier, count, lucky }. */
export function streakEggs(days, rng = null) {
  const st = CONFIG.streak;
  const band = st.bands.find((b) => days >= b.from && days <= b.to) || st.bands[st.bands.length - 1];
  if (st.luckyDays.includes(days)) {
    return { tier: band.tier, count: rng ? rInt(rng, st.luckyMin, st.luckyMax) : null, lucky: true, min: st.luckyMin, max: st.luckyMax };
  }
  const len = band.to - band.from + 1;
  const count = 1 + Math.floor((st.parts * (Math.min(days, band.to) - band.from)) / len);
  return { tier: band.tier, count, lucky: false };
}

// ---- list month rollover ---------------------------------------------------------------------------------

/** On the 1st: next month's list locks; otherwise last month's carries over (with a fresh emergency swap). */
export function rolloverList(s, key, at, events) {
  const month = monthOf(key);
  if (!s.list || s.list.month >= month) return;
  if (s.nextList && s.nextList.month <= month) {
    s.list = { month, tasks: s.nextList.tasks, swaps: 0, lockedAt: at };
    s.nextList = null;
    events?.push({ type: 'list.locked', month, tasks: s.list.tasks.length });
  } else {
    s.list = { ...s.list, month, swaps: 0 };
    events?.push({ type: 'list.carried', month });
  }
}

// ---- death and Phoenix -----------------------------------------------------------------------------------

const heartstoneReady = (s, t) => t.defId === 'heartstone' && (t.usedAt == null || s.completeDays - t.usedAt >= CONFIG.trinkets.heartstoneRechargeDays);

function graveyardPush(s, pets, diedOn) {
  for (const p of pets) s.graveyard.push({ ...p, location: 'dead', diedOn });
  if (s.graveyard.length > CONFIG.history.graveyard) s.graveyard = s.graveyard.slice(-CONFIG.history.graveyard);
}

function loseHalf(rng, list) {
  const n = Math.floor(list.length * CONFIG.penalties.backpackLossRate);
  const order = rShuffle(rng, list.map((_, i) => i));
  const gone = new Set(order.slice(0, n));
  return { kept: list.filter((_, i) => !gone.has(i)), lost: list.filter((_, i) => gone.has(i)) };
}

/** Third consecutive miss: active pets die (5★ Nine Lives / Heartstone can save one each), backpack −50 %. */
function death(s, key, rng, ctx) {
  const rate = CONFIG.penalties.backpackLossRate;
  const half = (n) => Math.floor(n * rate);
  const died = [];
  const survived = [];
  for (const pet of s.pets.filter((p) => p.location === 'active')) {
    const heart = pet.trinkets.find((t) => heartstoneReady(s, t));
    let how = null;
    if (heart) {
      heart.usedAt = s.completeDays;
      how = 'heartstone';
    } else if (pet.nineLives === 'charged') {
      pet.nineLives = 'spent';
      how = 'nineLives';
    }
    if (!how) {
      died.push(pet);
      continue;
    }
    const lost = cumulativeXp(pet.level, pet.xp) - cumulativeXp(1, 0);
    pet.level = 1;
    pet.xp = 0;
    pet.comebackOwed += lost;
    pet.fed = { day: key, amount: 0 };
    pet.hungrySince = key;
    pet.lastLoss = { dayKey: key, levels: 0, reason: how };
    survived.push({ petId: pet.id, by: how });
  }
  const diedIds = new Set(died.map((p) => p.id));
  s.pets = s.pets.filter((p) => !diedIds.has(p.id));
  for (const p of died) {
    p.beacon = false; // a Beacon on a fallen pet is lost
    p.location = 'dead';
  }

  // The backpack loses 50 % of everything in it, at random, rounded down.
  const lost = {};
  const bp = loseHalf(rng, s.pets.filter((p) => p.location === 'backpack'));
  const lostPetIds = new Set(bp.lost.map((p) => p.id));
  s.pets = s.pets.filter((p) => !lostPetIds.has(p.id));
  lost.pets = bp.lost.map((p) => p.id);
  for (const key2 of ['petEggs', 'openEggs', 'trinkets', 'treats']) {
    const r = loseHalf(rng, s.inv[key2]);
    s.inv[key2] = r.kept;
    lost[key2] = r.lost.length;
  }
  lost.eggFood = s.inv.eggFood.map((n) => half(n));
  s.inv.eggFood = s.inv.eggFood.map((n) => n - half(n));
  for (const cur of ['coins', 'diamonds', 'shards', 'beacons']) {
    lost[cur] = half(s.inv[cur]);
    s.inv[cur] -= lost[cur];
  }
  lost.charms = { tier: half(s.inv.charms.tier), sprout: half(s.inv.charms.sprout) };
  s.inv.charms.tier -= lost.charms.tier;
  s.inv.charms.sprout -= lost.charms.sprout;

  if (died.length) {
    if (s.ashes) graveyardPush(s, s.ashes.pets, s.ashes.deathDay);
    const best = died.slice().sort((a, b) => b.tier - a.tier || b.stars - a.stars || b.level - a.level)[0];
    s.ashes = { pets: died, petId: best.id, deathDay: key, deadlineDay: addDays(key, CONFIG.phoenix.windowDays), done: 0 };
  }
  s.welcomePending = true;
  s.lastDeath = key;
  s.stats.deaths += 1;
  if (!s.pets.length && !s.inv.petEggs.some((e) => e.guaranteed)) {
    const starter = CONFIG.hatch.servings[0];
    addPetEgg(s, { tier: 0, source: 'starter', guaranteed: true, fed: new Array(starter).fill(0) });
    lost.freshEgg = true;
  }
  ctx.events.push({ type: 'death', petIds: died.map((p) => p.id), survived, lost });
}

function revive(s, key, ctx) {
  const a = s.ashes;
  const pet = a.pets.find((p) => p.id === a.petId);
  const others = a.pets.filter((p) => p.id !== a.petId);
  graveyardPush(s, others, a.deathDay);
  const before = cumulativeXp(pet.level, pet.xp);
  pet.level = Math.max(1, Math.floor(pet.level * CONFIG.phoenix.levelFactor));
  pet.xp = 0;
  pet.comebackOwed += before - cumulativeXp(pet.level, 0);
  pet.fed = { day: null, amount: 0 };
  pet.hungrySince = null;
  pet.lastLoss = { dayKey: key, levels: 0, reason: 'phoenix' };
  s.ashes = null;
  placePet(s, pet);
  ctx.events.push({ type: 'phoenix.revived', petId: pet.id, level: pet.level, location: pet.location });
}

// ---- closing a day ---------------------------------------------------------------------------------------

function closeDay(s, key, rng, events) {
  const closeAt = closeInstant(key);
  rolloverList(s, key, closeAt, events);
  const day = s.day && s.day.key === key ? s.day : newDayRecord(s, key, closeAt);
  const tasks = s.list.tasks;
  const complete = tasks.length > 0 && tasks.every((t) => day.ticks[t.id]);
  const fx = computeEffects(s);
  const ctx = { fx, events, dayKey: key, counters: day.counters, rng, now: closeAt };
  const streakBefore = s.streak;

  // 1. Commitment bonus: +20 % (+commitBonusPts, ≤ +10) of the day's food, through the soft cap.
  let bonus = 0;
  if (complete && day.commitLevel != null && !day.commitBroken) {
    const rate = CONFIG.tasks.commitBonus + commitBonusPts(fx) / 100;
    bonus = capFood(day.raw * (1 + rate)) - capFood(day.raw);
  }
  const foodTotal = day.counted + bonus;

  // Will tonight take a Hungry/Starving/death penalty? (config: whether underfed/upkeep losses stack with it)
  // A frozen night has "no penalty" (PLAN §4): by default it skips the underfed/upkeep losses too.
  const penaltyNight = !complete && s.inv.freezes === 0;
  const frozenNight = !complete && s.inv.freezes > 0;
  const smallLosses = (!penaltyNight || CONFIG.penalties.underfedStacksWithHunger)
    && !(frozenNight && CONFIG.penalties.freezeSkipsFeedingLosses);

  // 2. Upkeep: each backpack pet costs 10 from the unspent pool (highest tier covered first), else −1 level.
  const cost = upkeepCost(fx);
  let pool = day.pool;
  let upkeepCovered = true;
  const backpack = s.pets.filter((p) => p.location === 'backpack').sort((a, b) => b.tier - a.tier || b.level - a.level);
  for (const pet of backpack) {
    if (cost <= 0) break;
    if (pool >= cost) pool -= cost;
    else {
      upkeepCovered = false;
      if (smallLosses) loseLevels(s, pet, CONFIG.penalties.upkeepLevels, 'upkeep', ctx);
    }
  }
  const leftover = pool; // unspent food does not carry over

  // 3. Active pets: fed ≥ need pays the dividend; < need loses 1 level (never shielded).
  const active = s.pets.filter((p) => p.location === 'active');
  let divCoins = 0;
  let divShards = 0;
  for (const pet of active) {
    if (fedToday(pet, key) >= petNeed(fx, pet)) {
      const d = dividendOf(fx, pet);
      const coins = grantCoins(s, d.coins, 'dividend', fx);
      addShards(s, d.shards);
      divCoins += coins;
      divShards += d.shards;
      events.push({ type: 'pet.dividend', petId: pet.id, coins, shards: d.shards });
    } else if (smallLosses) {
      loseLevels(s, pet, CONFIG.penalties.underfedLevels, 'underfed', ctx);
    }
  }

  // 4. The bonus goes straight into active pets' XP and egg meters, split evenly.
  if (bonus > 0 && active.length) {
    const share = Math.floor(bonus / active.length);
    active.forEach((pet, i) => addGrowth(s, pet, share + (i === 0 ? bonus - share * active.length : 0), ctx));
  }
  if (bonus > 0) events.push({ type: 'commit.bonus', amount: bonus, petIds: active.map((p) => p.id) });

  // 5. Final quest pass (every tick counts now; noWaste needs the leftover).
  refreshQuests(s, day, closeAt, events, { closing: true, upkeepCovered, leftover });

  // 6. Outcome.
  let outcome;
  if (complete) {
    outcome = 'complete';
    s.streak += 1;
    s.best = Math.max(s.best, s.streak);
    s.missRun = 0;
    s.completeDays += 1;
  } else if (s.inv.freezes > 0) {
    outcome = 'frozen';
    s.inv.freezes -= 1;
  } else {
    outcome = 'missed';
    s.streak = 0;
    s.missRun += 1;
  }
  events.push({ type: 'day.closed', dayKey: key, outcome, streak: s.streak, foodTotal, bonus, missRun: s.missRun, dividends: { coins: divCoins, shards: divShards } });

  if (outcome === 'complete') {
    events.push({ type: 'perfect.day', dayKey: key });
    const fx2 = computeEffects(s);
    const se = streakEggs(s.streak, rng);
    const extra = streakEggBonusFor(fx2, s.streak);
    const count = se.count + extra;
    for (let i = 0; i < count; i += 1) addOpenEgg(s, { tier: se.tier, source: 'streak', dayKey: key });
    events.push({ type: 'streak.eggs', tier: se.tier, count, lucky: se.lucky, bonus: extra });
    checkMilestone(s, s.streak, key, events);
    if (s.welcomePending) {
      s.welcomePending = false;
      const egg = addOpenEgg(s, { tier: CONFIG.welcomeBackTier, source: 'welcome', dayKey: key });
      events.push({ type: 'welcome.back', eggId: egg.id, tier: egg.tier });
    }
    if (s.ashes && key > s.ashes.deathDay && key <= s.ashes.deadlineDay) {
      s.ashes.done += 1;
      events.push({ type: 'phoenix.progress', done: s.ashes.done, need: CONFIG.phoenix.daysNeeded, deadline: s.ashes.deadlineDay });
      if (s.ashes.done >= CONFIG.phoenix.daysNeeded) revive(s, key, ctx);
    }
    if (CONFIG.trinkets.flashStreaks.includes(s.streak)) startFlashSale(s, closeAt, `streak:${s.streak}`, events);
    const gd = tasks.filter((t) => day.ticks[t.id].level === GODDAMN).length;
    if (gd === CONFIG.tasks.maxGoddamn && tasks.every((t) => day.ticks[t.id].level >= HARD)) startFlashSale(s, closeAt, 'goddamnDay', events);
  } else if (outcome === 'frozen') {
    events.push({ type: 'freeze.used', left: s.inv.freezes });
  } else {
    if (s.ashes && key > s.ashes.deathDay && key <= s.ashes.deadlineDay && s.ashes.done > 0) {
      s.ashes.done = 0; // a miss resets the 3-day count, not the 7-day window
      events.push({ type: 'phoenix.progress', done: 0, need: CONFIG.phoenix.daysNeeded, deadline: s.ashes.deadlineDay });
    }
    const p = CONFIG.penalties;
    if (s.missRun >= p.deathAtMiss) {
      death(s, key, rng, ctx);
      s.missRun = 0;
    } else {
      const state = s.missRun === 1 ? 'hungry' : 'starving';
      events.push({ type: 'hunger', state });
      const levels = s.missRun === 1 ? p.hungryLevels : p.starvingLevels;
      const fx3 = computeEffects(s);
      for (const pet of s.pets.slice()) loseLevels(s, pet, levels, state, { ...ctx, fx: fx3 }, { shieldable: true });
    }
  }

  // 7. Keeper and season XP: final task food, once.
  addKeeperXp(s, foodTotal, events);
  addSeasonXp(s, key, foodTotal, events);
  s.stats.foodEarned += foodTotal;

  // 8. Receipts and the rolling history (quest targets).
  recordReceipts(s, day, tasks, foodTotal);
  const ticks = {};
  for (const t of tasks) if (day.ticks[t.id]) ticks[t.id] = { min: day.ticks[t.id].min, level: day.ticks[t.id].level, raised: day.ticks[t.id].raised };
  s.history.push({ key, complete, frozen: outcome === 'frozen', ticks, unticked: tasks.filter((t) => !day.ticks[t.id]).map((t) => t.id) });
  const keepFrom = addDays(key, -CONFIG.quests.historyDays);
  s.history = s.history.filter((h) => h.key > keepFrom);

  // 9. Ashes window.
  if (s.ashes && key >= s.ashes.deadlineDay) {
    graveyardPush(s, s.ashes.pets, s.ashes.deathDay);
    events.push({ type: 'phoenix.expired', petId: s.ashes.petId });
    s.ashes = null;
  }

  normalizeSeats(s, events);
  s.flags.lastOutcome = outcome;
  s.lastDay = {
    key,
    outcome,
    level: day.level,
    commitLevel: day.commitLevel,
    commitBroken: day.commitBroken,
    ticks: day.ticks,
    done: Object.keys(day.ticks).length,
    total: tasks.length,
    raw: day.raw,
    counted: day.counted,
    bonus,
    foodTotal,
    leftover,
    levelUps: day.counters.levelUps,
    eggsLaid: day.counters.eggsLaid,
    streakBefore,
    streakAfter: s.streak,
    quests: day.quests.map((q) => ({
      id: q.id, text: q.text, coins: q.coins, done: q.done, paid: q.paid, private: !!q.private, timed: !!q.timed, slot: q.slot, cat: q.cat, voided: !!q.voided,
    })),
    counters: { ...day.counters },
    starGiven: day.starGiven,
  };
  s.lastClosed = key;
  if (s.day && s.day.key === key) s.day = null;
}

// ---- opening a day ---------------------------------------------------------------------------------------

/**
 * Open a day. Quests are drawn from their own stream keyed by the save's seed and the date (CONTENT.md G: seeded
 * by account and date, no rerolls), so nothing done between 22:00 and 05:00 can steer the draw and s.rng.n is
 * untouched by it. (Eligibility still reads the state at 05:00, as CONTENT.md G asks.)
 */
function openDay(s, key, now, rng, events) {
  rolloverList(s, key, now, events);
  const month = monthOf(key);
  if (seasonActive(month) && s.season.month !== month) s.season = { month, xp: 0, tier: 0 };
  const day = newDayRecord(s, key, now);
  s.day = day;
  const { quests, targets } = drawQuests(s, key, questRng(s.rng.seed, key), { dayLevel: day.level });
  day.quests = quests;
  day.targets = targets;
  day.prologue = !seasonActive(month);
  events.push({ type: 'day.opened', dayKey: key, quests: quests.map((q) => ({ id: q.id, text: q.text, coins: q.coins })) });
}

/** Mutating advance: close finished days in order, expire the flash sale, open today, refresh quests. */
export function advanceMut(s, now, rng, events) {
  if (s.list && s.startDay) {
    const last = lastFinishedDay(now);
    for (let d = addDays(s.lastClosed, 1); d <= last; d = addDays(d, 1)) closeDay(s, d, rng, events);
    const today = dayKey(now);
    if (phaseAt(now) === 'open' && today > s.lastClosed && (!s.day || s.day.key !== today)) openDay(s, today, now, rng, events);
    if (s.day) refreshQuests(s, s.day, now, events);
  }
  expireFlashSale(s, now);
}
