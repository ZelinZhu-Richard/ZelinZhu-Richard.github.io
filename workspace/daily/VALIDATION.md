# Daily — validation

What was checked, how, and what was not. Each part of the build adds its own section.

## Balance

Measured 2026-10-24 on the engine as it stood in the `daily` worktree. The scripts are hand-run only (never in
`npm test`, never copied to `dist/`):

- `node workspace/daily/sim/montecarlo.mjs` runs at least 100,000 seeded rolls per odds table through the engine's own rule functions. It exits non-zero on a miss.
- `node workspace/daily/sim/balance.mjs` is the owner's Python sim (`sim/daily_balance_sim.py`) ported onto the real engine. Options: `--runs N --days 365|730 --charm tier|sprout --seed S --charm-buy eager|python|never --set path=JSON`.

Both scripts give the same output under `TZ=UTC`, `America/New_York` and `Asia/Tokyo`. All time logic goes through `engine/time.js`.

### Odds tables (montecarlo.mjs, 100k rolls per table, seed 20261025)

**Result: 255 checks, 0 missed.** 220 of the checks are statistical, each with a band of ±4.5σ. The largest deviation was |z| = 3.3. The expected values are written out in the script from PLAN §7–9, independently of `config.js`, so this run also confirms that the config tables match the spec.

| Table | Rolls | Result |
|---|---|---|
| Pet-egg chance by egg tier × source (laid; streak, chest, season, welcome) | 100k per cell, 35 cells | all in band |
| Tier splits: laid same/+1/+2 for every tier (incl. Mythic +2 → Ultra and Legendary +1 → Ultra folds); streak-type 90/10; chest, season and welcome use the streak table | 100k per tier and source | all in band |
| Item count 3 + Bin(9, 0.28) | 3.5M eggs | mean 5.5203 vs 5.52; range 3–12; every count's probability in band; +3 snapshot items shift the mean by exactly 3 |
| Loot weights for Ordinary, Epic and Ultra eggs (charm/trinket become coins below Epic); egg-food tier 70/25/5 with the edge folds; 1–3 servings; coin piles × 0.5–1.5; fixed diamonds; Ultra trinket 10 % | ≥ 200k items per tier | all in band |
| Hatch odds: 95/5 base, food bonus, the 50 % floor (Ordinary egg + 30 Ultra servings; Rare egg + 40 Legendary), folding into Ultra, Ultra eggs, the guaranteed starter | 100k per case | all in band; `hatchOdds()` equals an independent implementation of the spec formula |
| Tier and Sprout charms: P(+1 \| rolled below Ultra) = 20 %, rolled and final distributions, need = ceil(1.5 × base) = 8/9/12/15/18/23/30; Sprout refused on Epic+, charm refused on Ultra, second charm refused | 100k per case | all in band; all rules hold |
| Merge: +1★ always, mutation 5 % (Ordinary 1★, Epic 2★, Legendary 4★), 0 % on Ultra | 100k each | in band |
| Combine pets (different species) and pet eggs: 20 / 10 / 5 / 2.5 / 1.25 / 0.625 %, result one tier up (pet: level 1, 1★, one of the two species) | 100k per tier, each kind | in band |

### How balance.mjs plays

The player is the Python "greedy climber", which is an upper bound on progression speed. Every simulated owner is a real save. Each day:

- At 06:00 New York, `advance()` closes the previous day.
- `applyAction()` then runs every tick, feed, egg, hatch, merge, combine and purchase, at times inside 05:00–22:00.

The game starts on 2026-10-25, the launch prologue, and the first season is November. The six player types and the miss model are the Python ones. The rest of the policy:

- **Raises.** "G" letters are per-task raises to Goddamn.
- **Missed days.** A missed day ticks a random 0 to n−1 tasks.
- **Quests.** The player does what the quest asks: frog first, raises the named task one level, keeps habit pairs adjacent, ticks Sleep with its real hours and tags Deep work. All ticks happen 07:00–09:30, so every timed quest is met. The player completes about 2.2–2.9 of 3 quests a day.
- **Pets.** Up to 3 pets are active: the best by tier, then stars, then level. Each active pet gets 100 food. Backpack upkeep is reserved, and all surplus goes to the top pet.
- **Eggs.**
  - Every openable egg is opened.
  - Pet eggs at Super Rare or above, or at or above max(1, best tier − 1), hatch as soon as the owned food covers the servings. Highest-tier food goes in first.
  - Lower pet eggs are combined in pairs. An odd one left over is separated.
- **Merge, combine, release.** Pets of the same species, tier and stars are merged. Below the best tier, pets beyond the best 3 per tier are combined in different-species pairs. The lowest pet is released when the backpack blocks a hatch.
- **Shop.**
  - Freezes are bought up to the cap.
  - The Epic, Mythic or Legendary pet egg is bought with diamonds as soon as it is affordable and better than anything owned.
  - With `--charm-buy eager`, the default, a shop charm is bought for the egg about to hatch when diamonds allow. Until Epic is reached, 250 diamonds are kept for the Epic egg.
- **Charms.** A tier charm goes on any egg Super Rare or above. A Sprout charm goes on a Rare or Super Rare egg.
- **XP treats** go to the top pet. Trinkets go on the best Epic+ active pet.

**Charm policy override.** `--charm` sets `config.charms.shop` and `config.charms.season` through `setConfig()`. The engine's existing balance-script hook was enough, and no engine file was edited. Under both policies, Epic+ loot still drops full tier charms (3 %).

**Script self-checks.**
- Across every run, the engine refused no action from the policy.
- The coins and diamonds the script tallies from events match the wallet: start + income − spent − lost at death = end. In the 5,000-run Sprout table, 4 runs show a "wallet mismatch" for diamonds. That was a counting bug in the script, which did not count diamond shards lost at death. It was fixed after the run had started and doesn't affect any table.

### Year one, Sprout charms (shop and season tier 20 give Sprout) — 5,000 runs per player type, seed 1

| Player type | Epic (median day) | Mythic (95 % CI) | Legendary | Ultra (95 % CI) | Deaths/yr | P(death) | Eggs/day | Pet eggs/mo | Coins/day | Diamonds/day |
|---|---|---|---|---|---|---|---|---|---|---|
| Chill days | 100 % (d138) | 20.4 % (19.3–21.5) | 0.5 % | 0.0 % (0.0–0.1) | 0.01 | 0.6 % | 1.5 | 2.0 | 292 | 1.87 |
| Easy days | 100 % (d111) | 28.5 % (27.2–29.7) | 1.0 % | 0.1 % (0.0–0.2) | 0.02 | 1.9 % | 1.6 | 2.4 | 382 | 2.32 |
| Medium days | 100 % (d52) | 71.3 % (70.0–72.5) | 13.6 % | 1.4 % (1.1–1.8) | 0.01 | 1.4 % | 1.8 | 2.9 | 540 | 3.34 |
| Medium + Hard weekends | 100 % (d42) | 79.6 % (78.5–80.7) | 17.9 % | 2.0 % (1.6–2.4) | 0.01 | 1.0 % | 1.8 | 3.0 | 565 | 3.50 |
| Hard + 2 Goddamn on weekends | 100 % (d22) | 95.5 % (94.9–96.1) | 39.7 % | 6.7 % (6.0–7.4) | 0.01 | 0.9 % | 1.8 | 3.1 | 671 | 3.87 |
| Inconsistent (Medium, ~10 % misses) | 100 % (d57) | 65.3 % (64.0–66.6) | 10.6 % | 0.8 % (0.6–1.1) | 0.10 | 8.4 % | 1.6 | 2.8 | 482 | 3.00 |

### Year one, tier charms (shop and season tier 20 give full tier charms; the current config default) — 2,000 runs per player type, seed 1

| Player type | Epic (median day) | Mythic (95 % CI) | Legendary | Ultra (95 % CI) | Deaths/yr | P(death) | Eggs/day | Pet eggs/mo | Coins/day | Diamonds/day |
|---|---|---|---|---|---|---|---|---|---|---|
| Chill days | 100 % (d138) | 28.6 % (26.7–30.7) | 0.9 % | 0.0 % (0.0–0.2) | 0.01 | 0.6 % | 1.5 | 2.0 | 293 | 1.88 |
| Easy days | 100 % (d110) | 41.0 % (38.9–43.2) | 2.9 % | 0.1 % (0.1–0.4) | 0.03 | 2.5 % | 1.6 | 2.4 | 388 | 2.35 |
| Medium days | 100 % (d48) | 75.2 % (73.3–77.0) | 16.7 % | 1.5 % (1.1–2.1) | 0.01 | 1.1 % | 1.8 | 2.9 | 549 | 3.37 |
| Medium + Hard weekends | 100 % (d37) | 83.0 % (81.2–84.5) | 21.6 % | 2.2 % (1.6–2.9) | 0.01 | 1.4 % | 1.8 | 3.0 | 574 | 3.53 |
| Hard + 2 Goddamn on weekends | 100 % (d22) | 95.5 % (94.6–96.4) | 40.8 % | 7.0 % (5.9–8.1) | 0.01 | 0.9 % | 1.8 | 3.1 | 677 | 3.89 |
| Inconsistent | 100 % (d52) | 70.7 % (68.6–72.6) | 14.0 % | 1.1 % (0.7–1.6) | 0.10 | 8.8 % | 1.6 | 2.8 | 488 | 3.02 |

### Two years — 1,000 runs per player type, seed 1

The PLAN §16 two-year check:

| Player type | Target Mythic / Legendary / Ultra | Sprout: Mythic / Legendary / Ultra (95 % CI) | Tier: Mythic / Legendary / Ultra (95 % CI) |
|---|---|---|---|
| Medium days | ~60 % / ~13 % / ~1 % | 100 % (median d247) / 36.8 % / 4.7 % (3.6–6.2) | 100 % (d198) / 43.8 % / 6.6 % (5.2–8.3) |
| Medium + Hard weekends | ~75 % / ~18 % / ~1 % | 100 % (d198) / 44.1 % / 7.7 % (6.2–9.5) | 100 % (d162) / 48.6 % / 7.8 % (6.3–9.6) |
| Hard every day | ~97 % / ~57 % / ~10 % | 100 % (d116) / 75.8 % / 24.1 % (21.6–26.8) | 100 % (d103) / 75.2 % / 22.0 % (19.5–24.7) |

In both policies, deaths stay at about 0.01 a year. Year-two income for Medium (Sprout) is 676 coins and 4.1 diamonds a day.

### Against the owner's targets (PLAN §16)

The owner's Python sim reproduces the PLAN §16 table when re-run here at 300 runs: Medium Mythic 32 %, Legendary 2.7 %, Ultra 0.3 %, and so on. The engine numbers are far above it.

| Year one, Mythic | Chill | Easy | Medium | Med + Hard wknd | Hard | Inconsistent |
|---|---|---|---|---|---|---|
| Target (PLAN §16) | ~7 % | ~9 % | ~32 % | ~51 % | ~78 % | ~28 % |
| Panel estimate with Sprout (CONTENT H.2) | | | 35–42 % | 48–55 % | | |
| Engine, Sprout | 20.4 % | 28.5 % | 71.3 % | 79.6 % | 95.5 % | 65.3 % |
| Engine, tier | 28.6 % | 41.0 % | 75.2 % | 83.0 % | 95.5 % | 70.7 % |

Each target, checked:

- **"Mythic in year one is lucky for normal effort."** Missed under both policies. Mythic is the likely outcome from Medium up and close to certain on Hard. On Chill and Easy days it is 3× the target.
- **"Ultra ≤ ~1 % for realistic play, a few percent at most for extreme play."**
  - Sprout: Medium 1.4 %, Med + Hard weekends 2.0 %, Inconsistent 0.8 %. These are borderline; the Medium + Hard weekends confidence interval sits above 1 %.
  - Hard every day: 6.7 % under Sprout and 7.0 % under tier charms. Both are above "a few percent". The panel's estimate was ~3–5 %.
- **Legendary.**
  - Medium is 13.6 % against a target of ~3 %.
  - Hard is 39.7 % against ~24 %.
- **Two years.** Missed: Mythic is 100 % for Medium, Med + Hard weekends and Hard (targets ~60 / ~75 / ~97 %). Ultra is 4.7 / 7.7 / 24.1 % against ~1 / ~1 / ~10 %.
- **"Lower day levels never out-climb higher ones."** Holds on Mythic and Legendary: Chill < Easy < Medium < Med + Hard weekends < Hard. Inconsistent stays below Medium.
- **"Consistent players almost never die."** Holds: 0.01 deaths a year, P(death) 0.6–1.9 %.
- **"Inconsistent players face it (~25–30 % a year)."** Missed: 0.10 deaths a year, P(death) 8.4 %.
  - In the Python sim, almost every death happens in the first month, before freezes are affordable. In 400 runs, 93 of 128 deaths came in days 1–30.
  - The engine pays about 480 coins a day from the start. With quests, Keeper, Petdex and season coins, a 600-coin freeze costs about 1.2 days of income.
  - So three freezes are almost always held and refilled each morning. The inconsistent player buys about 63 freezes a year.
- **"Everyone consistent can save diamonds for an Epic egg within a year."** Holds: Epic is 100 % for every type. Chill reaches it on day 138 and Easy on day 111, against the Python sim's days 176 and 167.

### Why the engine is richer than the Python sim

These are measured, not guessed. The engine follows the spec. The Python sim left out or shrank these systems:

1. **Full tier charms from Epic+ loot (3 % weight).** The Python sim scales this by 0.3 / 0.5 / 0.7 / 1.0 for Epic / Mythic / Legendary / Ultra eggs.
   - Laid eggs also carry about 10 items instead of 5.5, because PLAN §6 adds +1 item per 10 levels and star abilities add more.
   - Result: a Medium player gets about 10.6 tier charms a year from loot, against about 1 in Python.
   - "Epic pet egg (laid Epic egg) + charm" is the most common way to first reach Mythic from Medium up: 18 % of Medium runs, 32 % of Hard runs.
2. **More openable eggs.** The weekly chest gives about 49 Rare eggs a year and the season about 48. Season egg food adds 96 Super Rare and 12 Epic servings a year.
3. **About 2× the diamonds** (1.9–3.9 a day against Python's 1.4–2.3). The Epic shop egg comes about 40 days sooner. Sprout charms are affordable on Chill and Easy too.
4. **Sprout charms on Super Rare eggs.**
   - "Super Rare pet egg (streak SR egg) rolled +1 + charm" is the top Mythic route on Chill (8.7 %) and Easy (9.6 %).
   - A Sprout charm still turns an Epic roll into Mythic. That is the spec as written ("works exactly like a tier charm… on Ordinary–Super Rare").

Ablations on Medium days with Sprout (150 runs each, 95 % CI about ±7 points). Removing each system alone:

| Removed | Medium Mythic |
|---|---|
| Nothing (baseline) | 74 % |
| Season | 72 % |
| Weekly chest | 75 % |
| Level-based loot items | 69 % |
| Every skill, star and trinket effect cap set to 0 | 70 % |
| Shop charm buying | 70 % |
| Every charm (`hatch.charmChance` = 0) | 45 % |

No single content system explains the gap alone. The charm channel is the largest part of it, and it is mostly charms from loot.

### Single-dial sweep (Sprout, 150 runs per player type, ±7 points)

Each row turns one config dial for this run only; the engine was not changed.

| Dial | Chill | Easy | Medium | M + H wknd | Hard | Inconsistent | Medium Ultra | Hard Ultra |
|---|---|---|---|---|---|---|---|---|
| None (Sprout, 5,000-run table above) | 20.4 | 28.5 | 71.3 | 79.6 | 95.5 | 65.3 | 1.4 | 6.7 |
| **Epic+ loot charm weight 3 → 0** (`eggs.loot` charm) | 16.0 | 23.3 | **50.7** | 64.0 | 86.0 | 44.0 | 0.0 | 2.7 |
| Epic+ egg meters × 2 (`pets.meterCap` 5,400 → 10,800 …) | 22.7 | 24.0 | 58.7 | 59.3 | 89.3 | 55.3 | 0.7 | 2.0 |
| Charm chance 20 % → 10 % (`hatch.charmChance`) | 15.3 | 22.0 | 60.0 | 66.7 | 88.0 | 50.0 | 0.7 | 5.3 |
| Sprout only on Ordinary–Rare (`hatch.sproutMaxTier` 2 → 1) | 14.0 | 20.0 | 67.3 | 75.3 | 95.3 | 64.7 | 0.7 | 4.7 |
| Streak-type pet-egg chance halved (`eggs.petEggChance.other`) | 12.7 | 18.7 | 69.3 | 76.7 | 98.0 | 60.7 | 0.0 | 6.7 |
| Shop charms bought only after Mythic, keeping 400 diamonds (policy, as the Python sim) | 14.0 | 22.0 | 70.0 | 76.7 | 94.7 | 66.0 | 2.0 | 8.0 |
| Two dials: loot charm 0 **and** Epic+ meters × 2 | 12.7 | 20.0 | 44.7 | 48.0 | 63.3 | 36.7 | 0.0 | 1.3 |

Separate target, separate dial: deaths. Raising the **freeze price from 600 to 1,500 coins** (`freezes.price`, 200 runs) gives these results:

- Inconsistent: 0.42 deaths a year, P(death) 29.5 %. The target is ~25–30 %.
- Medium stays at 3 %.
- Mythic doesn't move: Inconsistent 66.5 %, Medium 71.0 %.

### Recommendation

1. **Charm policy: Sprout.** The panel's design (CONTENT H.2) is better than the current config default `{ shop: 'tier', season: 'tier' }`.
   - Sprout lowers Chill by about 8 points, Easy by 12, Inconsistent by 5, Medium by 4 and Med + Hard weekends by 3. Hard doesn't change.
   - Sprout does **not** keep the targets on its own. Neither policy does.
   - Set `config.charms` to `{ shop: 'sprout', season: 'sprout' }`. It is an owner decision recorded in CONTENT J and is not changed here.
2. **If one dial is turned: the Epic+ loot tier-charm weight**, `eggs.loot` charm 3 → 0. Full tier charms then exist only if the owner restores them somewhere.
   - It is the largest single lever found. It goes to the root cause: about 10× the Python sim's tier-charm supply.
   - It takes Medium Ultra to about 0 % and Hard Ultra to about 3 %, inside "a few percent".
   - It still leaves Mythic at about 51 % Medium, 64 % Med + Hard weekends and 16–23 % Chill/Easy. That is above every PLAN §16 band.
   - A partial version, weight 3 → 1, gave 63 % Medium in an earlier run.
3. **The PLAN §16 bands cannot be met with one dial.**
   - The engine's full content (chest, season, quests, Keeper, Petdex, level and star loot items, skills) roughly doubles the economy the Python bands were tuned on.
   - The closest two-dial result: loot charm 0 plus Epic+ meters × 2 gives Medium 45 % and Med + Hard weekends 48 %, which is the panel's revised band. But Hard drops to 63 %, below its ~78 % target, and Chill/Easy stay at 13–20 %.
   - The owner should choose: re-base the targets on the engine's numbers, or approve a second dial. Re-run this script after any change. No engine number was changed here.
4. **Deaths: freeze price 600 → 1,500 coins**, if the owner wants inconsistent players to face death at ~25–30 % a year.
   - At 600, cheap freezes make death rare: 8 % a year.
   - This needs the owner's OK: PLAN §12 prices the freeze at 600.

### Coins per complete day (the shop's "about N coins ≈ one good day")

Measured on the Easy-day player (Sprout, 5,000 runs): **401 coins per complete day** over year one, or 382 per calendar day. Per complete day, the sources are:

| Source | Coins |
|---|---|
| Quests | 120 |
| Egg loot | 115 |
| Dividends | 107 |
| Season | 20 |
| Milestones | 17 |
| Keeper | 12 |
| Petdex | 10 |

By 30-day block it starts at **303** in days 1–30, rises to 370–380 in months 2–3, then 380–465 for the rest of the year. Chill days are about 300; Medium days about 570.

This player does about 2.7 of 3 quests a day, against the panel's 0.85 × 3. Even so, the current copy "About 300 coins ≈ one good day" (CONTENT E) is right for the first month and about 25 % low after that. "About 400 coins" fits an Easy year. The copy and the reward prices are the owner's call.

### Dial applied: Epic+ loot tier-charm weight 3 → 0 (owner's choice, 2026-10-24)

`config.eggs.loot` charm weight is now 0, so Epic+ eggs no longer drop full tier charms. The other loot rows share the whole table (coins 40/97, egg food 35/97, XP treat 12/97, diamonds 8/97, trinket 2/97 on Epic+ eggs). Tier charms remain in the code for any future source; the shop and season tier 20 still give Sprout charms. The public odds list on /daily/eggs/ shows the renormalized shares and hides zero-weight rows.

Both columns were run on the same engine (after the seat and freeze fixes), Sprout charms, `--charm-buy eager`, 1,000 runs per player type, seed 1, each pinned with `--set eggs.loot=…`. Year one; Mythic 95 % CI ≈ ±3 points.

| Player type | Target Mythic | Mythic before → after | Legendary before → after (target) | Ultra before → after (target) | P(death) | Coins/day |
|---|---|---|---|---|---|---|
| Chill days | ~7 % | 23.0 % → 19.4 % | 0.3 % → 0.3 % (~0) | 0.0 % → 0.0 % (0) | 0.6 % | 292 → 289 |
| Easy days | ~9 % | 26.5 % → 27.8 % | 0.8 % → 0.6 % (~0) | 0.1 % → 0.0 % (0) | 2.8 % | 382 → 380 |
| Medium days | ~32 % | 75.0 % → **57.3 %** | 12.9 % → 6.3 % (~3) | 1.0 % → 0.6 % (~0.3) | 1.2 % | 541 → 530 |
| Medium + Hard weekends | ~51 % | 80.1 % → **63.9 %** | 18.4 % → 7.6 % (~10) | 2.2 % → 0.9 % (~1) | 1.1 % | 568 → 550 |
| Hard + 2 Goddamn weekends | ~78 % | 95.0 % → **85.7 %** | 40.7 % → 21.3 % (~24) | 7.8 % → 2.5 % (~3) | 1.0 % | 676 → 644 |
| Inconsistent | ~28 % | 66.6 % → **47.2 %** | 11.3 % → 4.4 % (~3) | 0.8 % → 0.3 % (0) | 8.5 % (target 25–30 %) | 487 → 476 |

Odds check after the change: `montecarlo.mjs` 255 checks, 0 missed (charm share 0.000 % on Ordinary, Epic and Ultra eggs).

What it fixed and what it didn't:

- **Legendary and Ultra are now on target** for Medium + Hard weekends and Hard, and close for Medium (Ultra 0.6 % vs ~0.3 %). This was the dial's main effect.
- **Mythic is still high** for every player type: Medium 57 % against ~32 %, Inconsistent 47 % against ~28 %.
- **Chill and Easy don't move** (19–28 % against 7–9 %). Their main route to Mythic is a Sprout charm on a Super Rare egg that rolls +1, plus streak Super Rare eggs, not loot charms.
- **Deaths are unchanged.** Inconsistent players still die far less than intended (8.5 % a year against 25–30 %); the freeze price is the dial for that (600 → 1,500 measured ≈ 29.5 % in the 150-run sweep).

### Not checked

- The balance player is a greedy upper bound. A real owner who opens eggs later, skips quests or keeps diamonds will climb more slowly.
- Beacons, extra seats, backpack upgrades, the guaranteed shop pets, the Ultra flash sale and real-life redemptions are never bought. Coins pile up beyond freezes.
- Only the 6 default tasks were simulated.
- The 2-year runs use 1,000 runs per player type, not 5,000.
