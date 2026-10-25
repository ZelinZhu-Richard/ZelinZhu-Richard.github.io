# Daily engine

The rules of Daily in one place: plain ESM `.js`, no DOM, no dependencies, no local-time `Date` getters. The same
files run in the browser (`LocalBackend`), in `node --test`, in `sim/balance.mjs`, and later in Supabase Edge
Functions (Deno). Rules: `../PLAN.md` §2–13. Content: `../CONTENT.md`. Contract: `../ARCHITECTURE.md`.

```js
import { newGame, applyAction, advance, viewToday, publicSnapshot } from './engine/index.js';

let state = newGame({ seed: crypto.getRandomValues(new Uint32Array(4)), now: Date.now(), tasks: DEFAULT_TASKS });
({ state, events } = advance(state, Date.now()));                       // on load, on focus, every minute
({ state, events } = applyAction(state, { type: 'task/tick', taskId: 'read', qty: 31 }, Date.now()));
render(viewToday(state, Date.now()));
```

Every call is `(state, action, now) → { state, events }`. Inputs are never mutated (`structuredClone` at entry).
Randomness is a counter PRNG whose `{ seed, n }` lives in `state.rng`, so the same state + action + now always
gives the same result and a reload can't reroll anything. An illegal action throws `GameError(code, message)`
and nothing changes. `now` is epoch ms; every calendar decision goes through `time.js` (America/New_York via Intl).

## Module map

| Module | What it owns |
|---|---|
| `index.js` | The public API (re-exports). |
| `game.js` | `newGame`, `advance`, `applyAction` and the action dispatcher (settings live here too). |
| `config.js` | Every number (tiers, multipliers, caps, odds, prices, seats, meters, dividends, curves, charm kinds). `setConfig` / `resetConfig` for the balance script only. |
| `content.js` | CONTENT.md B–I tables transcribed (species, skills, stars, trinkets, rewards, Keeper road, quests, milestones, season, cosmetics, engagement copy), plus `DEFAULT_TASKS`, `RECEIPT_KINDS`, `DEEP_WORK_TAGS`. |
| `time.js` | Day keys, 05:00 open / 22:00 close instants (DST-safe), phases, calendar arithmetic on date keys. |
| `rng.js` | Counter-based PRNG (`drawAt(seed, n)`), `streamRng(stream)`, seeded helpers. |
| `state.js` | State shape (`createState`), `SCHEMA_VERSION`, `migrate`, `GameError`, ids, wallet/inventory helpers. |
| `tasks.js` | List validation, normalized base food, tier amounts and text, the soft cap. |
| `effects.js` | The effect vocabulary and every panel cap (see the header comment). |
| `day.js` | List setup / next month / swap, the day level, raises, ticks, undo, feeding from the pool. |
| `close.js` | `payCompletion`: the completion reward at the last tick (commitment bonus, streak, streak eggs, milestones, welcome-back, Phoenix progress, flash sales). `advanceMut`: idempotent close of every finished day (dividends, upkeep, freezes, penalties, death; the reward for a complete day saved before the last-tick rule), list rollover, opening today. |
| `pets.js` | Pet creation and names, XP curve and caps, comeback XP, growth and laying, level loss, dividends, seats, backpack, moods. |
| `eggs-math.js` | Pure odds math: hatch odds (food bonus, 50 % floor, luck, charm), servings, pet-egg chance and splits, item-count distribution. |
| `eggs.js` | Opening eggs (loot), pet eggs (feed, charm, hatch, separate, combine). |
| `collection.js` | Merge, combine, release. |
| `trinkets.js` | Equip/unequip, Beacons, seats (activate/deactivate), rename, cosmetics, XP treats. |
| `shop.js` | Catalogue + `buy`, the Ultra flash sale, real-life rewards (redeem, mark taken, owner edits). |
| `progress.js` | Petdex, Keeper road, season track, milestones, receipts, quests (targets, draw, awards, stars, weekly chest). |
| `view.js` | View models for the UI (`viewHeader`, `viewToday`, `viewMorning`, `viewPets`, `viewEggs`, `hatchOdds`, `viewCollection`, `viewPetdex`, `viewShop`, `viewOdds`, `viewReceipts`, `viewLadder`). |
| `snapshot.js` | `publicSnapshot(state, now, { preview })`. |

## State shape (`state.js`, schema version 1)

Plain JSON. Top-level fields:

- `format: 'daily-save'`, `version`, `createdAt`, `rng: { seed: [4 × uint32], n }`, `seq` (id counter).
- Calendar: `startDay`, `lastClosed` (last processed close; the next close is `lastClosed + 1`), `list: { month, tasks, swaps, lockedAt, edits? }`, `nextList`, `swapLog` (public).
- `day`: the open day (05:00–22:00) — `{ key, month, level, commitLevel, commitBroken, raises, ticks: { taskId: { level, raw, counted, at, min, qty, qtyGiven, raised, goalTag, patronHit, seq } }, raw, counted, pool, fedTotal, counters, quests, targets, starGiven, openedAt, prologue }`. `null` between 22:00 and 05:00.
- `lastDay`: summary of the last close (morning card, after-close view).
- Outcomes: `streak`, `best`, `missRun`, `completeDays`, `welcomePending`, `lastDeath`, `ashes: { pets, petId, deathDay, deadlineDay, done }`, `graveyard`, `flags`.
- `pets[]`: `{ id, species, name, tier, stars, level, xp, comebackOwed, meter, location: 'active'|'backpack', beacon, cosmetic, trinkets: [{ id, defId, usedAt }], fed: { day, amount }, hungrySince, lastLoss, nineLives: 'none'|'charged'|'spent', born, source }`.
- `inv`: `coins, diamonds, shards, freezes, eggFood[7], charms: { tier, sprout }, beacons, treats[], trinkets[], openEggs[] ({ id, tier, source, petId, extraItems, petEggPct, laidOn }), petEggs[] ({ id, tier, fed: [food tiers], charm, guaranteed, source })`.
- `cosmetics`, `cosmetic` (account default), `auraAddons`, `unlockedSpecies`.
- Can't-lose progress: `keeper: { level, xp, lifetimeFood }`, `season: { month, xp, tier }`, `petdex: { 'species:tier': { firstDay } }`, `badges`, `quests: { week: { key, stars, chest }, recent }`, `history` (last 14 closed days, for quest targets), `receipts: { months, lifetime, goals, deepTags }`.
- `shop: { seatsBought, backpackBought, flashSale }`, `rewards`, `redemptions`, `stats`, `settings`.

Bump `SCHEMA_VERSION` and teach `migrate()` the upgrade whenever a field changes meaning.

## Rule choices the specs left open

- **Day boundaries.** A day opens at 05:00 (quests are drawn then, from a side stream keyed by the save's seed and the date — `rng.questRng` — so nothing done between 22:00 and 05:00 can change the draw and `state.rng.n` is untouched; eligibility still reads the state at 05:00) and closes at 22:00. A game started after 22:00 counts from the next day. Catch-up after an absence closes every missed day in order, so a long absence can mean repeated deaths; only one fresh starter egg is ever waiting.
- **Lowering the day** clears raises on unticked tasks (they take the new level); raising keeps raises still above it. A ticked Goddamn task still counts toward the 2-Goddamn cap. Undoing every tick clears the commitment. Once every task is ticked the day is finished, so lowering the level afterwards no longer breaks the commitment bonus.
- **Undo window** is `[tick, tick + 5:00)`: at exactly +5:00 the tick is final (quests count it) and undo is refused. Once the last tick pays the completion reward (`day.reward`), every tick of the day is final (`day_final`).
- **Underfed / upkeep losses stack** with Hungry/Starving on a missed day, as PLAN §4 and §6 read literally (an unfed active pet loses 1 + 2 levels on the first miss). `config.penalties.underfedStacksWithHunger = false` turns that off.
- **A frozen day has no penalty** (PLAN §4 "there's no penalty"): no Hungry/Starving and, by default, no underfed −1 or upkeep −1 either. Fed pets still pay dividends. `config.penalties.freezeSkipsFeedingLosses = false` restores the feeding losses on frozen nights. *Owner to confirm.*
- **Upkeep** covers the highest-tier backpack pets first. Feeding is for active pets only.
- **Phoenix:** a frozen day neither counts toward nor resets the 3-day run. A new death replaces any running Ashes.
- **Charms** can be applied any time before hatching (at most one); the egg then needs 50 % more servings, rounded up. Which kind the shop and season tier 20 give is `config.charms` (default `{ shop: 'tier', season: 'tier' }`; Epic+ loot always gives a tier charm).
- **Flash sale** triggers: streak 100/365/1000, a Goddamn day (complete, 2 Goddamn, the rest Hard+), or hatching a new highest tier (not the starter). One sale at a time; 24 h from the trigger (close instant for close triggers).
- **Effect dedupe**: the same global *or team* effect from the same skill or trinket counts once. Team effects reach active pets only.
- **coinPct** (Dragon's Share, Keeper's Crown …) multiplies dividend, egg-loot and quest coins; fixed rewards (Keeper, season, milestones, Petdex) are paid as written.
- **Seats ("brings its own seat plus extra seats", PLAN §6).** An active Super Rare+ pet adds its own seat plus `config.seats.abilityBonus` extra (SR +1, Epic +2, Mythic +3, Legendary +6, Ultra +12); a Beaconed backpack pet adds only the extras. So a seat-ability pet never needs a free seat: `pet/activate`, and the placement of a hatched, bought, combined or revived pet, check seats as if the pet were already active (`canSeat`), within the 15-pet cap. `seatInfo.fromAbilities` includes the own seats (`ownSeats` of them).
- **Seat overflow** may push the backpack over its cap (nothing is destroyed), and so may `pet/deactivate`, which is never refused for a full backpack; only hatching and buying pets respect the cap (a hatch checks with the egg's tier, the lowest it can hatch, so a Super Rare+ egg can always take its own seat).
- **Emergency swap**: quantity → quantity in the same unit must keep an equal or higher Chill amount. Unit aliases are one unit (`min`/`mins`/`minute` → `minutes`, `h`/`hr`/`hour` → `hours`; `normalizeTask` stores the canonical name) and minutes vs hours compare in minutes. Other swaps are honour-system and logged. A task ticked today can't be swapped. A quest naming the swapped task becomes an eligible quest of equal coins; failing that, the nearest-coin eligible quest at the original payout (`replaced: oldId`); failing that it is voided and counts as done for the quest star.
- **Real-life reward guidance copy** is the design panel's "About 300 coins ≈ one good day" (CONTENT.md E/J), not PLAN §12's "about 200". CONTENT.md J marks this as needing the owner's OK; it is **owner-pending**, like `config.charms`. The balance script measures ~400 coins per complete Easy day (~300 in the first month).

## Adding a task kind

1. Add a row to `RECEIPT_KINDS` in `content.js`: `{ label, field, agg }` where `agg` is `sum`, `count`, `minutes` (converted with the task's unit) or `average-hours`.
2. If the field is new, add it to `emptyAggregate()` in `state.js` and to `receiptOut()` in `view.js`.
3. Give tasks `receipt: '<kind>'` (and a patron `tag` if a species should cheer for it). Quests that need the kind (like `goalTag` for `deep`) look it up in `progress.js` `questTargets`.

## Supabase later

The engine never touches storage, the network or the clock: the caller passes `state` and `now`. The
`game-action` Edge Function will load the `game_state` row, call `applyAction(state, action, Date.now())`
(randomness stays in `state.rng`, now server-held), append `{ action, events, rng before/after }` to
`game_events`, and save the new state; `day-close` (pg_cron, hourly) calls `advance(state, Date.now())`, which is
idempotent. The public view is `publicSnapshot(state, now)`. Deno imports these files unchanged
(`import { applyAction } from '../../engine/index.js'`); `config.js` mirrors the `game_config` table.

## Tests

`node --test workspace/daily/tests/engine-*.test.mjs` (also run with `TZ=UTC`). Monte Carlo checks there are
seeded and small; the ≥ 100k-roll checks and the year-long balance table belong in `sim/balance.mjs`.
