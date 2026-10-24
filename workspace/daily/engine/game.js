// The public entry points: newGame, advance, applyAction. Pure: inputs are never mutated (structuredClone at
// entry), randomness comes from the counter PRNG stored in the state (or opts.rng), and an illegal action throws
// GameError(code, message) with nothing changed.

import { CONFIG, TIERS } from './config.js';
import { advanceMut } from './close.js';
import {
  combinePets, mergePets, releasePet,
} from './collection.js';
import { feedPet, raiseTask, setDayLevel, setNextList, setupList, swapTask, tickTask, undoTick } from './day.js';
import {
  charmPetEgg, combinePetEggs, feedPetEgg, hatchPetEgg, openEgg, separatePetEgg,
} from './eggs.js';
import { normalizeSeats } from './pets.js';
import { keeperStartCoins, refreshQuests } from './progress.js';
import { randomSeed, streamRng } from './rng.js';
import { buy, markRewardTaken, redeemReward, saveRewards } from './shop.js';
import {
  GameError, addPetEgg, createState, fail, migrate,
} from './state.js';
import { dayKey } from './time.js';
import {
  activatePet, deactivatePet, equipTrinket, renamePet, setBeacon, setCosmetic, unequipTrinket, useTreat,
} from './trinkets.js';

function checkNow(now) {
  if (!Number.isFinite(now)) throw new GameError('bad_now', 'now must be epoch milliseconds.');
}

/**
 * A new save. seed: 4 uint32 (crypto.getRandomValues) or a number in tests; omitted → random.
 * Starts with one guaranteed-Ordinary pet egg that is ready to hatch and Keeper level 1 (its coins paid).
 * With tasks, the list locks now and days count from today (tomorrow after 22:00).
 */
export function newGame({ seed, now, tasks } = {}) {
  checkNow(now);
  const s = createState({ seed: seed ?? randomSeed(), now });
  addPetEgg(s, { tier: 0, source: 'starter', guaranteed: true, fed: new Array(CONFIG.hatch.servings[0]).fill(0) });
  s.inv.coins += keeperStartCoins();
  if (tasks?.length) {
    setupList(s, tasks, now, []);
    advanceMut(s, now, streamRng(s.rng), []);
  }
  return s;
}

/** Close every finished day (22:00 NY) not yet closed, then open today. → { state, events } */
export function advance(state, now, opts = {}) {
  checkNow(now);
  const s = migrate(structuredClone(state));
  const rng = opts.rng || streamRng(s.rng);
  const events = [];
  advanceMut(s, now, rng, events);
  return { state: s, events };
}

const foodTierOf = (v) => (typeof v === 'string' ? TIERS.indexOf(v) : v);

const SETTINGS_MOTION = ['system', 'reduced', 'full'];

function saveSettings(s, settings, events) {
  if (!settings || typeof settings !== 'object') fail('bad_settings', 'Settings must be an object.');
  const out = structuredClone(s.settings);
  if (settings.reminders && typeof settings.reminders === 'object') {
    for (const k of ['evening', 'morning', 'notify']) if (typeof settings.reminders[k] === 'boolean') out.reminders[k] = settings.reminders[k];
  }
  if (typeof settings.sound === 'boolean') out.sound = settings.sound;
  if (SETTINGS_MOTION.includes(settings.motion)) out.motion = settings.motion;
  if (settings.companionId === null || s.pets.some((p) => p.id === settings.companionId)) out.companionId = settings.companionId ?? null;
  if (Number.isInteger(settings.defaultDayLevel) && settings.defaultDayLevel >= 0 && settings.defaultDayLevel <= CONFIG.tasks.dayLevelMax) out.defaultDayLevel = settings.defaultDayLevel;
  s.settings = out;
  events.push({ type: 'settings.saved' });
}

function dispatch(s, a, now, rng, events) {
  const ctx = { events, rng, now, dayKey: s.day?.key ?? dayKey(now), counters: s.day?.counters ?? null, fx: null };
  switch (a.type) {
    case 'list/setup':
      setupList(s, a.tasks, now, events);
      advanceMut(s, now, rng, events);
      return;
    case 'list/setNext': return setNextList(s, a.tasks, now, events);
    case 'list/swap': return swapTask(s, a.taskId, a.task, a.reason, now, events);
    case 'day/setLevel': return setDayLevel(s, a.level, now, events);
    case 'task/raise': return raiseTask(s, a.taskId, a.level, now, events);
    case 'task/tick': return tickTask(s, a.taskId, { qty: a.qty, goalTag: a.goalTag }, now, events, rng);
    case 'task/undo': return undoTick(s, a.taskId, now, events);
    case 'pet/feed': return feedPet(s, a.petId, a.amount, now, ctx);
    case 'pet/activate': return activatePet(s, a.petId, ctx);
    case 'pet/deactivate': return deactivatePet(s, a.petId, ctx);
    case 'pet/rename': return renamePet(s, a.petId, a.name, ctx);
    case 'pet/release': return releasePet(s, a.petId, ctx);
    case 'pet/useTreat': return useTreat(s, a.petId, a.treatId, ctx);
    case 'pet/equip': return equipTrinket(s, a.petId, a.trinketId, ctx);
    case 'pet/unequip': return unequipTrinket(s, a.petId, a.trinketId, ctx);
    case 'pet/beacon': return setBeacon(s, a.petId, a.on, ctx);
    case 'pet/cosmetic': return setCosmetic(s, a.petId ?? null, a.cosmeticId ?? null, ctx);
    case 'pet/merge': return void mergePets(s, a.aId, a.bId, rng, ctx);
    case 'pet/combine': return void combinePets(s, a.aId, a.bId, rng, ctx);
    case 'egg/open': return void openEgg(s, a.eggId, rng, ctx);
    case 'petEgg/feed': return void feedPetEgg(s, a.petEggId, foodTierOf(a.foodTier), ctx);
    case 'petEgg/charm': return void charmPetEgg(s, a.petEggId, a.charm, ctx);
    case 'petEgg/hatch': return void hatchPetEgg(s, a.petEggId, rng, ctx);
    case 'petEgg/separate': return separatePetEgg(s, a.petEggId, ctx);
    case 'petEgg/combine': return void combinePetEggs(s, a.aId, a.bId, rng, ctx);
    case 'shop/buy': return void buy(s, a.itemId, rng, ctx, now);
    case 'reward/redeem': return redeemReward(s, a.rewardId, now, ctx);
    case 'reward/save': return saveRewards(s, a.rewards, ctx);
    case 'reward/markTaken': return markRewardTaken(s, a.redemptionId, a.taken, ctx);
    case 'settings/save': return saveSettings(s, a.settings, events);
    default: return fail('unknown_action', `Unknown action: ${a.type}`);
  }
}

/**
 * Apply one owner action at `now` (advance() runs first). → { state, events }.
 * Throws GameError on an illegal action; the input state is never touched.
 */
export function applyAction(state, action, now, opts = {}) {
  checkNow(now);
  if (!action || typeof action.type !== 'string') throw new GameError('bad_action', 'An action needs a type.');
  const s = migrate(structuredClone(state));
  const rng = opts.rng || streamRng(s.rng);
  const events = [];
  advanceMut(s, now, rng, events);
  dispatch(s, action, now, rng, events);
  normalizeSeats(s, events);
  if (s.day) refreshQuests(s, s.day, now, events);
  return { state: s, events };
}

export { GameError };
