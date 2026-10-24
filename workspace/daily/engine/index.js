// Daily engine: the public API (ARCHITECTURE.md). Pure ESM, no DOM, no dependencies.

export { newGame, advance, applyAction } from './game.js';
export { publicSnapshot, SNAPSHOT_FORMAT, SNAPSHOT_VERSION } from './snapshot.js';
export {
  viewHeader, viewToday, viewMorning, viewPets, petView, viewEggs, hatchOdds, viewCollection, viewPetdex,
  viewShop, viewOdds, viewReceipts, viewLadder,
} from './view.js';
export { GameError, SCHEMA_VERSION, SAVE_FORMAT, migrate } from './state.js';
export {
  CONFIG, TIERS, TIER_LABELS, LEVELS, LEVEL_LABELS, ULTRA, GODDAMN, HARD, MEDIUM, setConfig, resetConfig, defaultConfig,
} from './config.js';
export * as content from './content.js';
export { DEFAULT_TASKS, SPECIES, DEEP_WORK_TAGS } from './content.js';
export * as time from './time.js';
export { seedFrom, randomSeed, drawAt, streamRng } from './rng.js';
export { streakEggs } from './close.js';
export { amountText, baseFood, capFood, taskAmount, formatAmount } from './tasks.js';
export { flashSalePrice } from './shop.js';
