# Daily — architecture and contracts

Rules: PLAN.md. Content and art: CONTENT.md. This file is the contract between the engine, the pet art and the UI, so they can be built in parallel. If you change a contract, update this file in the same change.

## Folders

| Path | Owner | What |
|---|---|---|
| `engine/` | engine | Pure ESM rules. No DOM, no dependencies, no local-time Date getters. Imported by the browser, `node --test`, and later Deno. |
| `pets/` | art | SVG character renderer + `pets.css`. Pure string output (no DOM needed to render), so it is testable in Node. |
| `app/` | UI | Browser modules: backend, rendering, interactions, animations. |
| `pages/` | UI | HTML templates for `/daily/` and `/daily/eggs/` (`<!-- PORTFOLIO_HEADER -->` placeholder filled by build.mjs). |
| `style.css` | UI | Page styles (tokens, fonts, layout). Imports nothing; `pets.css` is linked separately. |
| `sim/` | engine | `daily_balance_sim.py` (reference only) and `balance.mjs` (hand-run, drives the real engine). |
| `public/snapshot.json` | owner | Optional published public snapshot (written by "Export public snapshot", committed by hand). |
| `tests/` | all | `engine-*.test.mjs`, `pets-*.test.mjs`, `ui-*.test.mjs`. |

`build.mjs` (`buildDaily(output)`) writes `dist/daily/index.html` and `dist/daily/eggs/index.html` from `pages/` with the site header injected, and copies an allowlist: `style.css`, `app/`, `engine/`, `pets/`, and `snapshot.json` (the published one if present, else a preview generated at build time by the engine with a fixed seed and `preview: true`). Never `sim/`, `tests/`, `_private/`, `.qa/`, or the docs.

## Engine API (`engine/index.js` re-exports everything below)

```js
newGame({ seed, now, tasks })            // → state. seed: 4 uint32 (from crypto.getRandomValues) or a number in tests
advance(state, now, opts?)              // → { state, events }. Closes every finished day (22:00 NY) not yet closed, in order, then opens today if inside 05:00–22:00
applyAction(state, action, now, opts?)  // → { state, events }. Calls advance() first. Throws GameError(code, message) on an illegal action; state is never partially changed
publicSnapshot(state, now, { preview }?) // → sanitized JSON for visitors (see below); preview: true → kind 'preview'
// newGame: seed optional (random when omitted); starts with a guaranteed-Ordinary pet egg ready to hatch and Keeper 1. Without tasks, days start counting at list/setup.
// Also exported: viewMorning, petView, viewPetdex, streakEggs, CONFIG/setConfig/resetConfig (balance script only), DEFAULT_TASKS, SPECIES, time.*, content.*. See engine/README.md.
// opts.rng: optional injected rng() → [0,1). Default: a counter-based PRNG built from state.rng {seed, n}; n is advanced and saved in the returned state, so the same state + action always gives the same outcome (no reroll on refresh)
```

Inputs are never mutated (structuredClone at entry). `now` is epoch ms. All calendar logic goes through `engine/time.js` (America/New_York via Intl).

### Actions (`{ type, ...payload }`)

| type | payload | notes |
|---|---|---|
| `list/setup` | `{ tasks: TaskDef[] }` | first list (this month) when none is locked |
| `list/setNext` | `{ tasks }` | next month's list; locks on the 1st |
| `list/swap` | `{ taskId, task: TaskDef, reason }` | once a month; Chill baseline equal or harder |
| `day/setLevel` | `{ level }` | `chill|easy|medium|hard` (or 0–3); affects unticked tasks only. Lowering clears raises on unticked tasks; raising keeps raises still above it |
| `task/raise` | `{ taskId, level }` | above the day level only; max 2 Goddamn |
| `task/tick` | `{ taskId, qty?, goalTag? }` | inside 05:00–22:00 only; qty = real amount done (defaults to the tier amount); goalTag (Deep work only) = one of `DEEP_WORK_TAGS`, private |
| `task/undo` | `{ taskId }` | strictly within 5 min (refused from tick + 5:00, when quests count the tick); refused if that food was already fed |
| `pet/feed` | `{ petId, amount }` | from today's pool; active pets only (backpack pets take upkeep at 22:00) |
| `pet/activate` / `pet/deactivate` | `{ petId }` | seats. Activate is checked as if the pet were already active: a Super Rare+ pet brings its own seat plus its extras, so it never needs a free one (15-pet cap still holds; else `no_seat`). Deactivate is never refused for a full backpack (it may overflow, like seat overflow) |
| `pet/rename` | `{ petId, name }` | ≤ 12 chars |
| `pet/release` | `{ petId }` | gives egg food |
| `pet/useTreat` | `{ petId, treatId }` | XP treat |
| `pet/equip` / `pet/unequip` | `{ petId, trinketId }` | Epic+ only, 5 slots |
| `pet/beacon` | `{ petId, on }` | needs a Beacon in inventory |
| `pet/cosmetic` | `{ cosmeticId | null, petId? }` | without petId: the account-wide default; with petId: that pet's own (overrides the default) |
| `pet/merge` | `{ aId, bId }` | |
| `pet/combine` | `{ aId, bId }` | |
| `egg/open` | `{ eggId }` | returns items in the `egg.opened` event |
| `petEgg/feed` | `{ petEggId, foodTier }` | one serving; foodTier 0–6 or a tier name |
| `petEgg/charm` | `{ petEggId, charm: 'tier'|'sprout' }` | implemented: any time before hatch, at most one per egg; need × 1.5 rounded up; Sprout only on Ordinary–Super Rare; not on Ultra eggs |
| `petEgg/hatch` | `{ petEggId }` | when servings are complete |
| `petEgg/separate` | `{ petEggId }` | |
| `petEgg/combine` | `{ aId, bId }` | |
| `shop/buy` | `{ itemId }` | |
| `reward/redeem` | `{ rewardId }` | |
| `reward/save` | `{ rewards }` | owner edits the real-life catalogue |
| `reward/markTaken` | `{ redemptionId, taken? }` | marks a logged redemption taken (default true) |
| `settings/save` | `{ settings }` | `reminders: { evening, morning, notify }`, `sound`, `motion: 'system'|'reduced'|'full'`, `companionId`, `defaultDayLevel` (0–3) |

### Events (`{ type, ...data }`, in order; the UI animates from these)

`task.ticked {taskId, level, food, counted, qty}`, `task.undone`, `day.levelChanged {from,to,commitBroken}`, `task.raised`, `pet.fed {petId, amount, excess}`, `pet.xp {petId, xp}`, `pet.levelUp {petId, level}`, `pet.levelDown {petId, levels, reason}`, `egg.laid {eggId, tier, petId}`, `egg.opened {eggId, tier, items:[{kind, tier?, amount?, petEgg?, trinket?}]}` (pet egg item last), `petEgg.fed {petEggId, servings, need, odds}`, `petEgg.hatched {pet, rolledTier, charmUpgraded}`, `pet.merged {petId, stars, mutated}`, `combine.result {success, result?}`, `pet.released`, `shop.bought {itemId}`, `reward.redeemed`, `day.closed {dayKey, outcome:'complete'|'frozen'|'missed', streak, foodTotal, bonus, missRun}`, `streak.eggs {tier, count, lucky}`, `streak.milestone {days, badge, coins, diamonds}`, `perfect.day {dayKey}`, `hunger {state:'hungry'|'starving'}`, `death {petIds, lost}`, `phoenix.progress {done, need, deadline}`, `phoenix.revived {petId}`, `freeze.used`, `quest.completed {questId, coins}`, `quest.star {weekStars}`, `chest.ready`, `keeper.levelUp {level, rewards}`, `season.tierUp {tier, rewards}`, `petdex.discovered {species, tier, coins, diamonds}`, `flashSale.started {until, price}`, `day.opened {dayKey, quests}`.

Also emitted (additive): `task.ticked` carries `levelLabel`, `cheer: [petIds]` (patron pets) and `perfect`; `pet.levelDown` carries `shielded`, `xpLost`; `day.closed` carries `dividends`; `pet.dividend {petId, coins, shards}`, `commit.bonus {amount, petIds}`, `welcome.back {eggId, tier}`, `phoenix.expired {petId}`, `pet.benched {petId}` (seat overflow), `list.locked`, `list.carried`, `list.nextSaved`, `list.swapped`, `petEgg.charmed`, `petEgg.separated`, `pet.equipped`, `pet.unequipped`, `pet.beacon`, `pet.activated`, `pet.deactivated`, `pet.renamed`, `pet.cosmetic`, `pet.treat`, `reward.taken`, `reward.saved`, `settings.saved`.

### View models (`engine/view.js`, pure; the UI renders only from these)

```js
viewHeader(state, now)  → { streak, best, tonight: { tier, count, lucky }, nextStep, freezes, freezeCap, window: { phase: 'before'|'open'|'closed', opensAt, closesAt }, keeper: { level, xp, xpNext }, hunger: 'fed'|'hungry'|'starving'|'dead', ashes: null | { petId, name, species, tier, done, need, deadlineDay } }
viewToday(state, now)   → { dayKey, listMonth, level, commitLevel, bonusAlive, progress: { done, total }, goddamnCount, goddamnMax,
                            tasks: [{ id, name, type, physical, unit, level, levelLabel, amountText, food, ticked, tickedAt, canUndo, raiseTo: [levels], goal, patron }],
                            food: { earned, counted, cap, capRate, bonusPreview, pool, activeNeed, upkeep, leftForGrowth },
                            quests: [{ id, text, coins, progress, target, done }], weekStars, season: { month, tier, xp, xpInTier, xpPerTier, maxTier, nextReward }, prologue: bool }
viewPets(state, now)    → { seats: { base, bought, fromAbilities, total, used }, active: [PetView], backpack: [PetView], backpackCap }   // fromAbilities = active seat-ability pets' own seats + every extra (active or Beacon); total = min(15, base + bought + fromAbilities)
PetView                 = { id, species, speciesName, name, tier, tierName, stars, level, cap, xp, xpNext, comebackOwed, penalty, fedToday, need, meter, meterCap, dividend: { coins, shards }, seatBonus, abilities: [{ kind:'skill'|'star', name, text, active }], trinkets: [{ id, name, tier }], mood, beacon, cosmetic, location }
viewEggs(state)         → { openEggs: [{ id, tier, source, extraItems }], petEggs: [{ id, tier, servings, need, charm, odds: [7 numbers] }], eggFood: [7 counts], charms: { tier, sprout }, treats: [...] }
hatchOdds(eggTier, foodTiers, opts) → [7 probabilities]   // live odds while feeding
viewCollection(state)   → { mergePairs: [{ aId, bId, odds }], combinePairs: [...], eggCombinePairs: [...], petdex: { species: [...], tiers: 7, cells: { 'species:tier': { found, firstDay } } } }
viewShop(state, now)    → { coins, diamonds, shards, tabs: [{ id, label, items: [{ id, name, price, currency, canBuy, reason, owned, max }] }], flashSale, rewards: [...], redemptions: [...] }   // every item (real-life rewards too) also has reasonCode; rewards: owned null, max = maxPerDay or null
viewOdds()              → every public odds table (pet-egg chance by source, tier splits, loot weights, item count, hatch base, charm, merge, combine)
viewReceipts(state, now)→ { month: { pagesRead, hoursOutside, workouts, avgSleepHours, hardOrAbove }, lifetime: { ... }, goals: [{ goal, tasksDone }] }
viewLadder(state)       → { levels: [...], rows: [{ taskId, name, cells: { chill, easy, medium, hard, goddamn } }], foodRow }
viewMorning(state, now) → null | { dayKey, heading, outcome, tasksDone, total, food, bonus, levelUps, streakBefore, streakAfter, eggsWaiting }   // morning card
```

Seat reading (engine fix, 2026-10-24): PLAN §6 "an active pet brings its own seat plus extra seats: Super Rare +1 …" is read literally — an active Super Rare+ pet adds its own seat **and** `abilityBonus` extra seats (SR +1, Epic +2, Mythic +3, Legendary +6, Ultra +12); with a Beacon in the backpack it adds the extras only. Hatched/bought/combined/revived pets take a seat by the same rule. `viewPets.seats` also carries `ownSeats`, `max` and `uncapped`. Quests: the 05:00 draw uses its own stream keyed by save seed + date (never `state.rng.n`); after close, `viewToday.quests` keeps `private`, `timed`, `slot`, `cat`; an emergency-swap replacement may carry `replaced` (old id, payout kept) or `voided` (counts as done for the star). The reward guidance copy ("about 300 coins") is owner-pending (CONTENT.md J; PLAN §12 says 200).

The engine's view models are supersets of the shapes above (extra fields: e.g. `viewHeader.badges/nextMilestone/window.nextOpensAt`, `viewToday.open/closed`, task `amount/qty/purpose/raised`, `food.base/projected/bonusRate`, `season.active/cosmetic/copy`, `viewPets.fallen` (dead/ashes PetViews) and `upkeepEach`, PetView `nineLives` and ability `unlockLevel/unlocked`, `viewEggs.beacons/trinkets/hatchLuckPts`, pet-egg `ready/canCharm/canSprout`, `viewReceipts.deepTags` (private)). `viewReceipts` month also has `key`, `tasksDone`, `deepWorkHours`, `vegServings`, `food`.

### Public snapshot (`publicSnapshot`)

`{ format: 'daily-public', version: 1, kind: 'published' | 'preview', generatedAt, header: viewHeader, today: viewToday (no goals), pets: viewPets, eggs: { counts by tier }, petdex, receipts: viewReceipts (no goals, and receipts.month.key = 'YYYY-MM'), ladder: viewLadder, odds: viewOdds() }`. No settings, no real-life rewards log, no goal links. The build always writes `/daily/snapshot.json`: the owner's published one (`kind: 'published'`) if present, else the seeded build-time preview (`kind: 'preview'`). /now/'s "This month" strip reads `kind`, `receipts.month.key` and `receipts.month.{pagesRead, hoursOutside, workouts, avgSleepHours}`, and shows only published snapshots for the current month.

## Pet art API (`pets/index.js`)

```js
renderPet({ species, tier, mood, stars, cosmetic, size, name, level, focus, animate }) → '<svg …>…</svg>' string
// species: 'dragon'|'fox'|'slime'|'owl'|'turtle'|'axolotl'|'hedgehog'; tier 0–6; mood 'healthy'|'happy'|'hungry'|'starving'|'dead'|'ashes'
// size: 200 | 128 | 72 (72 = thumbnail rules from CONTENT.md A.1); focus: only the focused pet runs aura + species idle
renderEgg({ kind: 'open'|'pet', tier, state: 'idle'|'shake'|'crack'|'open', size }) → svg string
renderSilhouette({ species, size }) → svg string (Petdex unfound cells)
SPECIES → [{ id, name, unlock }]   // display names from CONTENT.md
```

`pets/pets.css` holds every keyframe and the mood/tier classes; triggered animations are classes the UI adds to the `<svg>` root for one run: `pet--bounce`, `pet--eat`, `pet--levelup`, `pet--cheer`, `egg--shake`, `egg--crack`. All motion is off under `prefers-reduced-motion`.

Details (rig, 2026-10-24):

- Extra `renderPet` options: `uid` (id prefix; default a fresh one per call), `ashesDone` (0–3, consecutive complete days for the ashes ring), `className`. `renderEgg` also takes `uid`, `animate` (default true → `.egg--live` idle wiggle/shine/inner life), `focus` (default `size >= 200`, the reveal stage → `.egg--focus`: only a focused egg animates its tier aura, the same performance rule as pets; pass `focus: true` for a selected egg at a smaller size), `label`, `className`. `renderSilhouette` takes `className`.
- Also exported: `ANIM_MS` (duration per trigger class), `play(svgEl, cls, ms?) → Promise` (restarts a trigger class, removes it after `ANIM_MS`, resolves at once under reduced motion or `.pet--still`), `speciesStatus()`, `validateSpecies(mod, id)`, `getSpecies(id)`, `silhouetteOf(id)`, `renderGrave`, `renderAshes`, `EGG_KINDS`, `EGG_STATES`, palette (`TIERS`, `TIER_NAMES`, `TIER_KEYS`, `RARITY`, `tierPalette`) and rig constants (`MOODS`, `LIVE_MOODS`, `GROUPS`, `SPECIES_GROUPS`, `FACE_CLASSES`, `ANCHOR_KEYS`, `SIZES`).
- The required SVG groups of CONTENT.md §A.1 are `<g class="g-NAME">` (classes, not ids: many pets share a page). Every gradient/clip/filter id is prefixed with the render's `uid`. Layer map: top of `pets/rig.js`.
- Root classes: `pet pet--<species> pet--tier-<n> pet--<tierKey> pet--mood-<mood> pet--s<size>` plus `pet--thumb` (≤ 72 px), `pet--focus` (only the focused pet runs aura + species idle; never on thumbs), `pet--5star`, `pet--rim` (art pass 2026-10-24: the pet carries the rim-light filter, 5★ gold or Ultra prism, only above 72 px; a rim-lit pet breathes only while focused because breathing would re-run the filter every frame), `pet--still` (`animate: false`), `pet--fallback`, `pet--grave`, `pet--ashes`. The UI adds `pet--paused` / `egg--paused` to off-screen cards (IntersectionObserver). Eggs: `egg--live`, `egg--focus`, `egg--still`, `egg--thumb`.
- Eggs: root `egg egg--kind-<open|pet> egg--tier-<n> egg--<tierKey> egg--state-<state>`; the `open` state plays its pop/burst once on insertion. Reveal flow: idle → `play(el,'egg--shake')` → re-render `state:'crack'` + `play(el,'egg--crack')` → re-render `state:'open'`.
- Species modules: `pets/species/<id>.js`, contract in `pets/species/_template.js` (`slime.js` is the reference). Optional module field `sparkles: [[x, y], [x, y]]` places the two Rare aura sparkles (axolotl and hedgehog use it to keep them off gills and spines). `index.js` loads them with dynamic `import()` and validates them; a missing/invalid one renders the slime with a "TODO <id>" marker. Anchors gain `mouth` (where the eat orb lands). Per-species keyframes go only in that species' marked block of `pets.css`.
- Cosmetics: `index.js` optionally imports `pets/cosmetics.js` exporting `COSMETICS = { [id]: { name, draw(ctx) → markup } }`, drawn with (0,0) at the head-top socket for a ~68-unit-wide head; the rig translates it to `anchors.headTop` and scales by `accScale`, behind `g-occlude-front`. Until that file exists, cosmetics render nothing.
  - `pets/cosmetics.js` (cosmetics, 2026-10-24) holds all 15: the 6 season hats (`acornCap`, `snowfallBeanie`, `paperPartyCrown`, `heartPatchBeret`, `blossomSprig`, `rainBucketHat`) and the 9 Keeper-road ones (`seedling`, `keepersCap`, `studyHeadphones`, `littleLantern`, `fieldPencil`, `graduationCap`, `mossBeret`, `orbitClub`, `keepersLaurel`), keyed by the engine ids. Each entry is `{ id, name, source: 'season'|'keeper', season?: 'YYYY-MM', level?, motion, draw }`. Unknown ids render nothing. Comet Trail (Keeper 55) is an aura add-on, not a head-top cosmetic, and is not drawn here (`renderPet` has no aura add-on input yet).
  - Also exported: `COSMETIC_IDS` (reward order), `HEAD_FIT` / `headFit(species)` (each head as an ellipse in the cosmetic's local frame, plus the hat scale and the angles where side pieces show between horns, ears and fronds; hats are scaled to the real head with strokes kept at 4 px), `MOOD_POSE`, and `renderCosmetic({ id, size, uid?, animate?, stand?, className? })` → a standalone 160-box icon (the cosmetic on a dim mannequin head) for the season card preview, Keeper road and shop. The UI may import these straight from `pets/cosmetics.js`.
  - Species whose head moves by mood in geometry (not via the rig's CSS head drop/slump) should set `ctx.anchors.headTop` in `draw()`; the rig already merges `ctx.anchors` over the module's anchors. Until a species does, `MOOD_POSE` carries the cosmetic for it (today: the slime's hungry/starving squash); it is skipped as soon as `ctx.anchors.headTop` is set.
  - Motion and the Petdex silhouette treatment live in the `/* ===== cosmetics ===== */` block of `pets.css` (classes prefixed `cos-`; idle motion on `.pet--focus` only, hop follow-through on the trigger classes, nothing on thumbs or under reduced motion). `.pet-silhouette` is styled there too: a deep indigo union silhouette with a rim and spotlight tinted by `--tier` (the Petdex cell already sets it), plus a small "?" badge; `renderSilhouette` markup is unchanged.
- `pets/gallery.html` is a dev-only page (every species × tier × mood, eggs, states, silhouettes, trigger buttons). `build.mjs` must not copy it to `dist/` (exclude it from the `pets/` copy).

## UI backend (`app/backend.js`)

```js
createBackend() → LocalBackend | PublicBackend
LocalBackend  { mode:'owner', load(), act(action) → { state, events }, now(), exportJson(), importJson(text), exportSnapshot() }  // localStorage key 'daily:v1', try/catch everywhere
PublicBackend { mode:'visitor', load() → snapshot }   // fetch('/daily/snapshot.json')
```

Owner mode if localStorage holds a save; otherwise visitor mode with an "Owner view" link that runs list setup and creates the save on this device.

UI details (UI build, 2026-10-24; additive to the contract above):

- Both backends: `load()` and `refresh()` return `{ state, events }` (refresh = `advance()`; the page calls it every minute and on `visibilitychange`), `views()` returns every view model at once: `{ header, today, pets, eggs, collection, shop, odds, receipts, ladder, settings, list, morning, generatedAt, preview }`. `LocalBackend` also has `create(tasks)` (newGame with a `crypto.getRandomValues` seed, used by "Owner view"), `forget()`, `hatchOdds(...)`, and maps `list` to `{ month, tasks, next: nextList.tasks, swapUsed }`. A failed localStorage write throws `code: 'save-failed'` and keeps the previous state. `PublicBackend.views()` maps the snapshot (`eggs: { counts }`, `collection: { petdex }`, `shop: null`, `preview: kind === 'preview'`).
- `app/normalize.js` is the one adapter between the engine's richer view models and the render modules: numeric levels → names (`today.level/commitLevel`, task `level/raiseTo`, ladder levels, `task.ticked`/`day.levelChanged` events), `nextStep.streak` → `day`, `season.nextReward`/`cosmetic` objects → text, Petdex species objects → ids + names, `odds.petEggSplit` → `tierSplit`, loot weights in % → fractions, `odds.hatch.base` → `{ own, up, floor, bonus }`, `viewMorning` → the morning card. Renderers stay pure (`app/render-*.js`, string in/out, tested in Node).
- The UI reads `settings.companionId` (falls back to `viewPets.companionId`), writes `settings/save { companionId, reminders, sound, motion: 'system'|'reduced' }`, patron cheers from `task.ticked.cheer`, and sends `task/tick { goalTag }` for Deep work. TaskDefs written by list setup follow `engine/tasks.js normalizeTask` (`chill`, `chillText`, `tiers` keyed by level, hidden `tag/receipt/purpose` carried through); the editor starts from `engine DEFAULT_TASKS`.
- Dev only: on local hosts `?fixtures=owner|visitor` loads `app/fixtures/` (hand-written view models + a small simulating backend). The build never copies `app/fixtures/`, so this is inert in production.
- Build: `buildDaily` also injects the site footer (`<!-- PORTFOLIO_FOOTER -->`), refuses a page without canonical + og:url, and excludes `.html` under `engine/`/`pets/` (e.g. `pets/gallery.html`) besides docs, tests, sim, `_private`, `.qa`, fixtures and dotfiles. With no `public/snapshot.json`, the preview is played by the real engine (`enginePreview()`: seed 20261024, nine scripted November days, the last one 4/6 done, `publicSnapshot(…, { preview: true })`); the fixture preview is only a fallback if the engine throws.
