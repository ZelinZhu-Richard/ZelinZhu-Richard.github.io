// publicSnapshot: the sanitized JSON visitors see (ARCHITECTURE.md "Public snapshot").
// No settings, no real-life rewards or redemption log, no goal links, no private quests, no Deep-work tags.

import { TIER_LABELS } from './config.js';
import {
  viewHeader, viewLadder, viewOdds, viewPetdex, viewPets, viewReceipts, viewToday,
} from './view.js';

export const SNAPSHOT_FORMAT = 'daily-public';
export const SNAPSHOT_VERSION = 1;

export function publicSnapshot(state, now, { preview = false } = {}) {
  const counts = (list) => TIER_LABELS.map((_, t) => list.filter((e) => e.tier === t).length);
  const pets = viewPets(state);
  delete pets.companionId;
  const snap = {
    format: SNAPSHOT_FORMAT,
    version: SNAPSHOT_VERSION,
    kind: preview ? 'preview' : 'published',
    generatedAt: now,
    header: viewHeader(state, now),
    today: viewToday(state, now, { includeGoals: false }),
    pets,
    eggs: {
      openEggs: counts(state.inv.openEggs),
      petEggs: counts(state.inv.petEggs),
      eggFood: state.inv.eggFood.slice(),
    },
    petdex: viewPetdex(state),
    receipts: viewReceipts(state, now, { includeGoals: false }),
    ladder: viewLadder(state),
    odds: viewOdds(),
    swaps: state.swapLog.map(({ month, dayKey, fromName, toName, reason }) => ({ month, dayKey, fromName, toName, reason })),
  };
  if (preview) snap.preview = true;
  return JSON.parse(JSON.stringify(snap));
}
