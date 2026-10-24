# Daily, Now and HQ — build spec

This is the source of truth for every agent building Daily (/daily/), Now (/now/) and HQ (/hq/). It is the owner's original prompt, adjusted to fit this repository. It is not deployed (each feature build copies an explicit allowlist).

**This repo is public** (github.com/ZelinZhu-Richard/ZelinZhu-Richard.github.io, the GitHub Pages user site), so every committed file is published. Private material lives only in gitignored folders:

- `workspace/daily/_private/original-prompt.md` — the owner's unedited prompt, including the private HQ seed. Never quote it in a commit, test, fixture or public file.
- `workspace/hq/_private/hq-seed.json` — the owner's real HQ data, imported by hand on the HQ page. Committed fixtures use fictional placeholders only.

The owner's Monte Carlo simulation, used to tune every number below, is at `workspace/daily/sim/daily_balance_sim.py`. It is a reference only: never run in CI or `npm test`, never imported, never copied to `dist/`.

You are working in the owner's personal website repo. Build Daily: a public page where the owner's daily habits feed virtual pets. Pets level up, lay loot eggs, hatch rarer pets, merge for stars, and can starve and die. Also build a public Now page and a private HQ tracker.

The game is designed to be as compelling as Duolingo and Brawl Stars, in service of real habits. Every mechanic below exists for a reason. Section 14 lists the psychology guardrails; don't remove any of them without asking the owner.

## 0. Owner decisions (2026-10-24) — these override anything below that conflicts

1. **The centre of the game is doing today's tasks and reaching goals.** The task list is the hero of /daily/: it sits at the top, ticking a task is the most satisfying moment in the game (food flies to the pool, pets react, the day's progress ring fills, a perfect day gets a celebration), and pets, eggs and loot are the reward layer on top. When a design choice trades task focus for pet spectacle, task focus wins.
2. **Pets are real 2D animated characters**, not ASCII. Each species is a layered inline SVG character with CSS keyframe animation (idle breathing, blinking, a species-specific idle motion, happy bounce when fed, eating, level-up, hungry droop, starving, a gravestone for dead, an ember/ashes state for Phoenix). Tiers change palette, markings, accessories and aura. They must look like a finished game. See `workspace/daily/CONTENT.md` §A for the art briefs.
3. **Supabase is deferred.** Tonight's build is **local-first**: the same pure engine runs in the browser, state lives in the owner's browser (localStorage) with JSON export/import, and the randomness stream is stored in the state so a refresh can never reroll an outcome. Everything is built behind a `backend` interface so the Supabase version (section 1, "Later") replaces the local backend without touching the engine or UI.
4. **Open content is decided** by a design panel (a Claude game designer and Codex): skills, star abilities, trinket effects, real-life rewards, Keeper road, quests, milestones, season track, species and character art briefs. The result is `workspace/daily/CONTENT.md`, and its numbers live in the engine's content module.
5. **Public vs private pages.** Public pages are reachable by clicking from the main site (in the nav): /daily/ and /now/. Private pages live at an unlisted URL that a visitor must already know: /hq/ is not in the nav, sitemap or robots.txt, carries `noindex, nofollow`, and its data never leaves the owner's browser (later: owner-only Supabase RLS).
6. **No per-phase stops tonight.** The owner pre-approved building every phase in sequence. Each phase still has to pass its gate (below) before the next starts. Commit and push are the last step, done by the main agent only.
7. **Base.** Work happens on branch `daily`, created from `origin/main` (the deployed site), in the worktree `workspace/daily-worktree`. The owner's local `main` checkout has diverged from origin and holds uncommitted work: never touch it.

## How to work

- **Read before writing:** README.md, tools/build.mjs, tools/verify.mjs, tools/serve.mjs, site/pages.mjs, site/content.mjs, public/portfolio.css, .github/workflows/deploy.yml, tests/site.test.mjs. Feature patterns: workspace/domainexp/ (standalone feature page with the site header injected at build time from `pages()`), workspace/video/ (a `pages()` body module rendered through `frame(..., { stylesheet })`), and workspace/gym/ (build.mjs allowlist, vendor integrity manifest, tests/, DESIGN.md, PRODUCT.md, README.md, VALIDATION.md). The design mockups (HTML exports) are the visual target; their `.dc.html` source carries exact sizes, spacing and colours.
- **Phase gate:** `npm test` and `npm run build` pass (the build checks the public/ manifest and runs tools/verify.mjs, exactly what CI runs). Also run `TZ=UTC npm test` (CI runs in UTC). UI phases also get a browser check at 1280 px, ~900 px (where the nav collapses) and 390 px: no horizontal overflow, keyboard focus order, reduced motion on. Record what was and wasn't checked in the feature's VALIDATION.md. QA screenshots go in the feature's gitignored `.qa/`.
- **Every number is a default** and lives in one config module, never inline in logic. If you change a number, re-run the balance script (section 16) and record the before/after table.
- **Git hygiene.** Stage only explicit paths you created or edited; never `git add -A`, `git add .` or `git add workspace/`. Never touch `holdout/` or `workspace/polaris-capstone/`.
- **Parallel builders don't share `dist/`.** Only the main agent runs `npm run build` / `npm run dev`. Feature agents build into their own temp folder with the scratch helper they are given, verify it with `node tools/verify.mjs <dir>`, and serve it with `node tools/serve.mjs <dir> --port <port>`.

## Ground rules

- **Follow the repo's patterns.** New feature folders: `workspace/daily/`, `workspace/now/`, `workspace/hq/`. Each has build.mjs (named export `buildDaily(output)` / `buildNow(output)` / `buildHq(output)` that copies an explicit runtime allowlist, never docs, tests, sim, _private or .qa), tests/*.test.mjs (node:test + node:assert/strict), README.md, DESIGN.md, PRODUCT.md and VALIDATION.md, and a .gitignore (.qa/, __pycache__/).
- **Wiring** (done by the main agent, not feature agents): tools/build.mjs (import, `await buildX('dist')`, and the sitemap `urls` list for /daily/ and /now/ only); tools/verify.mjs required-outputs list; package.json test globs; the nav array in site/pages.mjs; the phoenix home menu in public/_nuxt/CbdjwYMp.js and the noscript link lists in public/index.html and public/contacts/index.html (Daily and Now only); a PROJECTS entry for Daily appended at the END of site/content.mjs (never inserted before existing entries: the first three use index-based ids); then `npm run manifest`, because the build refuses to start when public/ differs from asset-manifest.json.
- **Nav order:** Work, About, Research, Now, Daily, Video, Flash, Paper Piano, Gym, Domain Expansion, CV, Contact. Check the header at 901, 1024 and 1280 px; if it overflows, raise the collapse breakpoint rather than letting it wrap.
- **No runtime npm dependencies** (the repo has none). No CDN scripts or web fonts. Nothing to vendor tonight; when Supabase lands, vendor one pinned supabase-js build per section 1 "Later".
- **Every HTML file** a feature emits carries a canonical link and og:url on `https://zelinzhu-richard.github.io` (tools/verify.mjs requires the production origin in every HTML file), and every `href="#id"` targets an id present in the static HTML (verify checks anchors). No path-based client routing: GitHub Pages has no SPA fallback, so every route is a real `index.html`.
- **Look:** match public/portfolio.css and the mockups.
  - Tokens (copy from public/portfolio.css, not from Gym, whose --muted and --line differ): --page #111022, --ink #f8f0fc, --muted #c2bad0, --line #ffffff30, --accent #dfccff. Mockup ground #0d0c1c may be used as a panel fill.
  - Fonts: Neoris (regular only, there is no medium weight: show emphasis with size or colour) for body text, Seasons italic for `<em>` display words, both from the local `/_nuxt/` files declared in public/portfolio.css:2-12. Monospace for numbers, chips and eyebrows is the system stack `ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`. The mockups' Manrope / Instrument Serif / Geist Mono are design-tool stand-ins for these.
  - Amber #ffc98f means urgent or warning.
  - Rarity colours, always paired with a text label and never used alone: Ordinary #c2bad0, Rare #9fd4ff, Super Rare #7ee0c3, Epic #c9a2ff, Mythic #ff9ecf, Legendary #ffc98f, Ultra #fff3b0.
  - Difficulty chips: Chill #c2bad0, Easy #9fd4ff, Medium #7ee0c3, Hard #ffc98f, Goddamn #ff9fb2.
  - Pets: animated SVG characters (section 0.2), with face variants for healthy / hungry / starving, a gravestone for dead, and ashes for the Phoenix state. Animations turn off under prefers-reduced-motion.
  - Bordered panels are fine on Daily and HQ (1px var(--line) or a tinted border, 4px radius, no box-shadow), as in the mockups. /now/ uses open ruled rows like the rest of the detail pages.
  - Do not copy the mockups' animated ASCII-shark "ocean" canvas (section 18).
- **Accessibility:** real `<button>`s with aria-pressed/aria-expanded, 44px touch targets, text contrast ≥ 4.5:1, aria-live for loot reveals, and native `<dialog>` + `showModal()` confirms before anything destructive. There are no shared helpers to import; copy the patterns (Gym's focus-visible outline and skip link). Under the global reduced-motion rule, `animationend` never fires, so any sequence (egg reveal, celebrations) checks `matchMedia('(prefers-reduced-motion: reduce)')` and shows results at once instead of waiting on animation events.
- **CSP:** if a page carries a CSP meta (Gym does), keep `script-src 'self'`; drop Gym-only directives; when Supabase lands, add the exact project origin to connect-src.
- **Time zones:** the game and HQ run on America/New_York, but CI and (later) Edge Functions run in UTC. Never use local-time Date getters/setters or `new Date('YYYY-MM-DD')` in game, HQ or /now/ logic. Use the engine's time helper (Intl.DateTimeFormat with timeZone 'America/New_York') everywhere; format date-only strings by splitting them.
- **Security:** no secrets in client code or in the repo. Tonight nothing needs a key. Later (Supabase): the anon key is public by design and RLS does the protecting; the Anthropic API key and the email key live only as Edge Function secrets; the service-role key never appears in the repo; extend tools/verify.mjs to flag `sb_secret_…`, `sk-ant-…` and service_role JWTs. tools/verify.mjs fails the build on any literal `http(s)://localhost:PORT` or `127.0.0.1:PORT` in dist, so local URLs are built at runtime from `location` only when `location.hostname` is local.
- **Randomness and state changes.** Tonight: all randomness comes from a counter-based PRNG whose seed and counter are part of the saved state, so refreshing can't reroll anything. Later: all randomness and every state change happen server-side, and the browser only displays state and calls actions.
- **No real money, ever.** No payments, no purchasable currency. Coins and diamonds are earned only.

## 1. Architecture

### Now (tonight): local-first

- **One pure game engine** in `workspace/daily/engine/`: plain ESM `.js` modules, no dependencies, no DOM, of the form `(state, action, rng, now) → { state, events }`. The same files are imported by the browser, by `node --test`, and later by Supabase Edge Functions (Deno), so the rules exist in exactly one place. Modules: `config.js` (every number), `content.js` (CONTENT.md tables), `time.js` (America/New_York helpers: day key, 05:00–22:00 window, 22:00 close as an instant, DST-safe), `rng.js` (counter-based PRNG from `{seed, n}`; seeded in tests; seed from `crypto.getRandomValues` at new game), and the rules split by area (tasks/day, pets, eggs, hatchery, merge/combine, trinkets, shop, quests/keeper/season/petdex, receipts, public snapshot).
- **advance(state, rng, now)** closes every finished day whose 22:00 has passed and isn't processed yet (idempotent, keyed by date, catches up after days away, DST-safe), then opens today. The app calls it on load, on focus, and every minute.
- **Backend interface** in the UI: `load()`, `act(action)`, `exportJson()`, `importJson()`. Tonight's `LocalBackend` runs the engine in the browser and saves to localStorage. Later's `SupabaseBackend` calls the `game-action` Edge Function and reads the public view.
- **Owner vs visitor.** If this browser holds a save, /daily/ opens in owner mode. Otherwise it shows the read-only public view: the latest published snapshot (`workspace/daily/public/snapshot.json`, copied to `/daily/snapshot.json` by the build, written by the owner's "Export public snapshot" button and committed by hand) or, if none exists yet, a clearly labelled preview generated at build time by the real engine with a fixed seed. A small "Owner view" link starts or opens the game on this device.
- **Monthly list setup** happens in-app before the first day (defaults from the mockup: Sleep, Touch grass, Read, Eat vegetables, Work out, Deep work). Tier text for quality and physical tasks is written by hand in setup tonight (defaults provided); `generate-variants` (Claude) arrives with Supabase.

### Later: Supabase (deferred by the owner; keep the design ready)

- Auth: GitHub OAuth, with an allowlist containing only the owner's user id.
- Postgres tables: `game_state` (one row, full state as JSONB), `game_events` (append-only log of every action with inputs, RNG outcomes and result), `task_lists` (monthly locked lists), `game_config` (tunables, mirrored by the client config module). HQ tables are in section 21.
- RLS: the public can read a sanitized view (pets, streak, today's list and statuses, receipts, odds tables). Only Edge Functions write.
- Edge Functions: `game-action` (owner only), `day-close` (cron), `generate-variants` (owner only; model id lives in config), `remind` (cron), `cheer` (public, rate-limited; optional). Browser-called functions answer CORS preflights from one `_shared` helper allowing `https://zelinzhu-richard.github.io`.
- pg_cron (with pg_net; function URL and auth secret in Vault, never in a committed migration) calls `day-close` hourly and `remind` at the reminder times. Timezone America/New_York.
- Location: `workspace/daily/supabase/` (run the CLI with `--workdir workspace/daily`); it imports the engine from `workspace/daily/engine/`. Gitignore `supabase/.temp`, `supabase/.branches` and the real seed. Tests that need a running Supabase live outside the `npm test` glob (a separate `test:db` script). Supabase deploys by hand from `workspace/daily/SETUP.md`; never from GitHub Actions.
- supabase-js: vendor one pinned UMD build with `SUPABASE-LICENSE.txt` and a sha256 `vendor/manifest.json` checked by `buildDaily`, like workspace/gym/vendor/. Its bundled `http://localhost:9999` literal trips tools/verify.mjs, so this needs a narrow, owner-approved exemption.

## 2. Days and time

- A day's window is 05:00–22:00 America/New_York. Ticks only count inside the window (tonight: device clock, honour system; later: server time).
- At 22:00 the day closes and is evaluated (section 4).
- Sleep is a daily task about the previous night. It is ticked inside the window, on the honour system.
- A tick can be undone within 5 minutes. After that it's final.

## 3. Daily tasks

Monthly lock. Before a month starts, the owner sets up the task list. It's locked for the calendar month. If no new list is locked, last month's carries over. Each task has:

- a name;
- a type, quantity or quality;
- a physical flag;
- for quantity tasks, a Chill baseline (amount + unit);
- for quality tasks, a Chill description;
- optionally, the long-term goal it serves (shown on the task and in Receipts).

One emergency swap per month. Replace one task with another whose Chill baseline is equal or harder. It's logged publicly with a one-line reason, for injuries and real changes in life.

Difficulty tiers. Quantity is a multiple of Chill:

| Tier | Quantity × Chill | Pet food × base |
|---|---|---|
| Chill | 1 | 1 |
| Easy | 1.5 | 2 |
| Medium | 3 | 4 |
| Hard | 5 | 12 |
| Goddamn | 20 | 50 |

Round quantities up to whole units (15 × 1.5 = 23 pages). Show minutes over 60 as hours to one decimal.

Base food is normalized to the list size: base = round(360 / (2 × taskCount)). An all-Easy day always makes about 360 food: three pets fed, plus 60 spare. A 6-task list gives base 30 (Chill 30 · Easy 60 · Medium 120 · Hard 360 · Goddamn 1,500). This keeps balance whatever the list size, and means padding the list with trivial tasks earns nothing extra.

Daily difficulty is set for the whole day, not per task.

- Day level. Each day has one level, Chill / Easy / Medium / Hard (default Easy), and it applies to every task. Goddamn is never a day level: a whole Goddamn day would take more than 24 hours.
- Raise single tasks. Any unticked task can be raised above the day level, up to Goddamn. At most 2 Goddamn tasks per day.
- No lowering single tasks. A task can never go below the day level. The only way down is lowering the whole day. This stops cherry-picking.
- Changing the day level. The owner can raise or lower it any time before 22:00. A change only affects unticked tasks; ticked tasks keep the level and food they were ticked at. On a bad evening, lowering the whole day to Chill still saves the streak; it just earns less.
- Commitment bonus. The day level when the first task is ticked is the commitment. If the day is finished without ever lowering below it, it earns +20% of the day's food at close. Raising is always fine. **Resolution:** the bonus is computed at close, passes through the soft cap, counts toward Keeper and Season XP, and goes straight into active pets' XP and egg meters (split evenly), because unspent pool food expires at close.
- Soft daily cap. A day's pet food above 1,200 (bonus included) counts at 50%, applied as food is earned. For a 6-task list: Easy day 360 → 432 with the bonus; Medium 720 → 864; Hard 2,160 → 2,592, capped to 1,896.
- A task's level locks when it's ticked.

Quality and physical tasks have hand-written tier text for all five tiers (tonight: owner edits defaults in setup; later: `generate-variants` drafts them and the owner reviews before locking).

- Physical tasks scale intensity or structure above Hard, not duration. Duration is capped at the Hard duration, so there are no 5-hour workouts.
- Sleep tiers only ever add sleep or an earlier bedtime.

Completing a task adds its food to today's pet food pool. Pet food comes only from tasks.

Ticking also records the real quantity done at that tier (pages, minutes, hours slept, etc.) for Receipts (section 13).

## 4. Day outcome, streak, penalties

Complete day = every task ticked inside the window. Each task counts at the level it was ticked at, which is always at least the day level at that moment.

Streak +1 per complete day.

Incomplete day:

- If a streak freeze is held, one is used automatically. The streak holds (doesn't grow), there's no penalty, and the miss doesn't count toward the consecutive-miss count. Freezes come only from the shop. At most 3 can be held.
- Otherwise, with m consecutive incomplete days:
  - m = 1, Hungry: streak → 0, every pet −2 levels.
  - m = 2, Starving: every pet −5 more levels. Penalties stack.
  - m = 3, Dead: every active pet dies. The backpack randomly loses 50% of everything in it: pets, pet eggs, openable eggs, egg food, coins, diamonds, boosters and trinkets (round down). The miss count then resets.
- The level floor is 1.
- If no pets are left at all, the owner gets a fresh Ordinary starter pet egg.
- Days before the game started don't count. A first day that starts after 05:00 is a normal day.

Comeback XP. After any level loss, that pet earns 2× XP until it has regained the XP it lost. Track it per pet.

Phoenix revival.

- Pets that die leave Ashes for 7 days.
- Completing 3 days in a row inside that window brings back the highest-tier fallen pet, keeping its tier, stars and trinkets, at half its level (rounded down, min 1). The others are gone for good.
- A miss inside the window resets the 3-day count, but not the 7-day window.

Welcome back. The first complete day after a death also pays one Rare openable egg (streak-type odds).

## 5. Streak bonus

Openable eggs, paid at the close of each complete day:

- Tier by streak band: days 1–9 Ordinary, 10–99 Rare, 100–999 Super Rare, 1000+ Epic.
- Count by thirds of the band: 1 egg in the first third, 2 in the middle third, 3 in the last third.
  - Days 1–3 → 1, days 4–6 → 2, days 7–9 → 3.
  - Days 10–39 → 1, 40–69 → 2, 70–99 → 3.
  - Days 100–399 → 1, 400–699 → 2, 700–999 → 3.
- Lucky days (day 10, 100 and 1000) pay 5–10 eggs of the new band's tier instead (uniform).
- Milestones at 7, 30, 50, 100, 200, 365, 500 and 1000 days: a badge and coins, plus diamonds from 100 days up, with a celebration moment (amounts in CONTENT.md §H).

## 6. Pets

Fields: species, name, tier (Ordinary → Rare → Super Rare → Epic → Mythic → Legendary → Ultra), stars 1–5, level, xp, comeback-XP owed, egg meter, trinkets (≤5, Epic+ only), location active/backpack, beacon flag, cosmetic.

Species: 6 at launch (dragon, fox, slime, owl, turtle, axolotl). More unlock via the Keeper road and seasons (CONTENT.md §A, §F). A hatched pet's species is random among unlocked species.

Feeding. The owner hands out the pet food pool.

- Food beyond 100 that a pet gets today goes immediately into its XP and its egg meter, 1:1, so the bars move as it is fed.
- When the day closes:
  - Active pet fed < 100: −1 level.
  - Active pet fed ≥ 100: it's fine and pays its dividend.
- Backpack pets cost 10 each per day, taken automatically from the unspent pool before it expires. A pet that can't be covered loses 1 level.
- Unspent pet food does not carry over.

Dividends (pets produce income).

- Coins: Ordinary 5, Rare 10, Super Rare 20, Epic 40, Mythic 80, Legendary 160, Ultra 320, × (1 + 1% per level).
- Epic+ also pay diamond shards (10 shards = 1 diamond): Epic 2, Mythic 5, Legendary 10, Ultra 30.

Levels:

- Start at 1. Cap by tier: Ordinary 20, Rare 30, Super Rare 40, Epic 55, Mythic 70, Legendary 85, Ultra 100.
- XP to the next level is 50 × L + 50.
- Every level: +0.1% egg-meter speed and +1% dividends.
- Every 10 levels: +1 item in the eggs that pet lays (max +5).
- Skills unlock at levels 10, 25, 40, 55, 70, 85 and 100, up to the tier cap (CONTENT.md §B).
- Pacing check: on Medium days, a pet that gets all the surplus reaches Lv 30 in about 6 weeks. A Hungry day costs about 2–6 days of progress (with comeback XP); Starving costs about 1–3 weeks.

Egg meter capacity by tier (×3 per tier): 200 / 600 / 1,800 / 5,400 / 16,200 / 48,600 / 145,800. When it fills, the pet lays an openable egg of its tier, and any overflow carries into the next meter.

Stars. Each star level grants one ability (CONTENT.md §C).

Seats (active slots):

- Base: 3.
- Bought: extra seats for 150 / 400 / 1,000 diamonds (max 3 bought).
- Seat abilities: an active pet brings its own seat plus extra seats: Super Rare +1, Epic +2, Mythic +3, Legendary +6, Ultra +12.
- Abilities only work while the pet is active, unless it wears a Beacon (a booster). A Beacon makes its ability work from the backpack.
- Abilities stack. Total active pets are capped at 15.
- If seats drop (death, move or Beacon removed), the lowest-tier active pets move to the backpack.

Backpack: 12 to start. +1 every 5 Keeper levels, and +2 for 1,000 / 2,000 / 4,000 coins.

- When it's full, pets can't be hatched or bought until there's room (release, merge or combine).
- Releasing a pet gives 2× its separate-yield in egg food of its tier.

## 7. Openable eggs (loot)

Sources: pets' egg meters; the streak bonus; the weekly quest chest; season track rewards; the welcome-back egg. An egg's tier = the tier of whatever produced it.

Item count: 3 + Binomial(9, 0.28), so 3–12 items averaging about 5.5, plus 1 per 10 levels of the pet that laid it (max +5).

The pet-egg roll happens ONCE per egg and depends on where the egg came from:

| Egg tier | Laid by a pet | Streak / chest / season |
|---|---|---|
| Ordinary | 35% | 10% |
| Rare | 25% | 5% |
| Super Rare | 12% | 2% |
| Epic | 5% | 1% |
| Mythic | 3.5% | 1% |
| Legendary | 3% | 1% |
| Ultra | 3% | 1% |

Pet-egg tier when the roll hits:

| Egg tier | Laid by a pet: same / +1 / +2 |
|---|---|
| Ordinary | 82.5 / 12.5 / 5 |
| Rare | 82.5 / 12.5 / 5 |
| Super Rare | 88 / 10 / 2 |
| Epic | 92 / 7 / 1 |
| Mythic | 94 / 5 / 1 (Ultra) |
| Legendary | 75 / 25 (Ultra) / — |
| Ultra | 100 |

Streak, chest and season eggs are always 90 same / 10 +1, never +2.

Ultra eggs also have a 10% chance of an Ultra (overpowered) trinket.

Every other item is loot (weighted):

| Item | Weight | Amount |
|---|---|---|
| Coins | 40% | Ordinary 10 · Rare 20 · Super Rare 35 · Epic 60 · Mythic 100 · Legendary 160 · Ultra 250, × 0.5–1.5 |
| Egg food | 35% | 1–3 servings: the egg's tier 70%, one lower 25%, one higher 5% |
| XP treat | 12% | +100 × (tier + 1) XP to a pet of the owner's choice |
| Diamonds | 8% | Ordinary 1 · Rare 1 · Super Rare 2 · Epic 3 · Mythic 5 · Legendary 8 · Ultra 12 |
| Tier charm | 3% | Epic+ eggs only; otherwise coins |
| Regular trinket | 2% | Epic+ eggs only, trinket tier ≤ egg tier; otherwise coins |

Opening resolves in the engine and returns the contents for the reveal animation (section 13).

## 8. Pet eggs and hatching

- Servings to hatch, by tier: 5 / 6 / 8 / 10 / 12 / 15 / 20.
- One serving = one egg-food item of any tier, fed one at a time.
- Servings can't be taken back.
- Base odds: 95% the egg's own tier, 5% one tier higher.
- Better food raises the odds, per serving. Food k tiers above the egg adds 1% / 2^(j−1) to tier egg+j, for every j from 1 to k. Examples on an Ordinary egg: Rare food +1% Rare; Super Rare food +1% Rare, +0.5% Super Rare; Epic food +1% Rare, +0.5% Super Rare, +0.25% Epic.
- These bonuses come out of the own-tier share. The own-tier share never drops below 50%. Anything above Ultra folds into Ultra. Same-tier or lower food just fills. Show the live odds while feeding.
- Tier charm. At most one per egg. After the main roll, a 20% chance of +1 tier. The egg needs 50% more servings.
- Separate: break a pet egg into egg food of its tier: 3 / 4 / 5 / 6 / 8 / 10 / 12 servings.
- A hatched pet starts at level 1 and 1★ with a random species and a name from the species' name pool. It goes into a free seat, or the backpack if none is free.
- Starting state: one guaranteed-Ordinary pet egg that is ready to hatch.

## 9. Merge and combine (pets, and pet eggs for combine)

Every destructive action needs a confirm dialog, with the odds shown.

Merge: two pets with the same species, tier and star level.

- Result: a guaranteed +1★ (max 5).
- 5% mutation chance of also going +1 tier, keeping the stars.
- The result keeps the higher level. Trinkets from the consumed pet go back to the inventory.
- Mutations only ever happen in a merge.

Combine: two pets of the same tier but different species, or two pet eggs of the same tier.

- Success chance by tier: Ordinary 20%, Rare 10%, Super Rare 5%, Epic 2.5%, Mythic 1.25%, Legendary 0.625%.
- On success: one result of the next tier. A pet takes a random species from the two and starts at level 1 and 1★; an egg becomes a next-tier egg.
- On failure, both are destroyed. Ultra can't combine.

## 10. Trinkets

- Only Epic+ pets can equip them, with 5 slots each.
- Tiers: Epic, Mythic and Legendary trinkets are regular. Ultra trinkets are wildly overpowered (but never remove the stakes of missing days or reward less sleep).
- Effects: a config table (CONTENT.md §D), using the engine's effect vocabulary (egg-meter speed, extra loot items, hatch luck, XP gain, dividend boost, level-loss protection, and the rest of the vocabulary in CONTENT.md).
- Sources: Epic+ openable eggs (section 7) and the shop. Regular trinkets cost Epic 150 · Mythic 500 · Legendary 1,500 diamonds.
- Ultra trinkets are never in the shop normally.
  - Triggers: streak 100, 365 or 1000; a "Goddamn day" (2 Goddamn tasks and every other task at Hard or above); or hatching the first-ever pet of a new highest tier.
  - Window: a 24-hour flash sale at a 30% discount.
  - Price floor: never below 10× the Legendary trinket price (15,000 diamonds), even after the discount.

## 11. Currencies

- Pet food (the daily pool, from tasks only).
- Egg food (tiered items).
- Coins (gold is merged into coins).
- Diamonds, plus diamond shards (10 = 1).
- Boosters: tier charm, Beacon.
- Streak freezes (hold ≤3).
- Trinkets, pet eggs, openable eggs.

## 12. Shop (all purchases are engine transactions; prices in config)

| Tab | Items |
|---|---|
| Items | Streak freeze 600 coins (hold max 3) · extra seat 150 / 400 / 1,000 diamonds · backpack +2 for 1,000 / 2,000 / 4,000 coins |
| Pets (guaranteed) | Epic 400 · Mythic 3,000 · Legendary 15,000 diamonds |
| Eggs | Epic pet egg 250 · Mythic pet egg 2,000 · Legendary pet egg 10,000 diamonds. The Epic egg is the bad-luck safety net: about 5–6 months of saving for a consistent player. |
| Boosters | Tier charm 60 diamonds · Beacon 300 diamonds · Rare egg food ×10 for 400 coins · Super Rare egg food ×5 for 30 diamonds |
| Trinkets | Regular trinkets; the Ultra flash sale when active |
| Real life | Rewards from CONTENT.md §E (name + coin price, editable by the owner), with a redemption log. Guidance in the UI: about 200 coins ≈ one good day. |

## 13. Engagement layer

Daily quests.

- 3 a day from the pool in CONTENT.md §G. Each pays 30–60 coins.
- All 3 done = 1 quest star. 5 stars in a Monday–Sunday week opens the weekly chest: one Rare openable egg (streak-type odds) + 3 diamonds.
- Quests never ask the owner to change the locked list or sleep less.

Keeper road (permanent; never lost, even on death).

- Keeper XP = lifetime pet food earned. XP to the next level is 1000 + 250 × K.
- Every level: coins. Every 5 levels: 10 diamonds + 1 backpack space. Some levels unlock new species and cosmetics (CONTENT.md §F).

Season track (free, monthly, resets with the list lock).

- Season XP = pet food earned this month. 30 tiers × 750 XP.
- Reaching tier 30 takes Medium days; Easy days reach about tier 17.
- Rewards: coins, egg food, streak-type openable eggs (tiers 5/10/15/25), a tier charm at tier 20, 5 diamonds at tiers 10/20/30, and a season-only cosmetic at tier 30 (CONTENT.md §H). No paid track.

Petdex (collection book): species × tier grid with silhouettes for unfound cells. The first discovery of a cell pays 100 × (tier + 1) coins, plus diamonds at Epic+ (5 / 10 / 20 / 50).

Receipts (public): real-world totals, monthly and lifetime. Pages read, hours outside, workouts, average sleep, and tasks at Hard or above, plus progress toward the goals tasks are linked to.

Task-first loop (CONTENT.md §I): the must-have behaviours that make ticking a task the best moment of the day.

Reminders (opt-in). Tonight: an in-page banner (and, if the owner allows it, a browser notification while the page is open) at 19:00 and 21:15 when the day isn't complete, naming the pet and the tasks left; nothing after 21:30; optional 07:30 morning summary. Later: email via an Edge Function secret and/or Web Push via a service worker at /daily/sw.js.

Celebrations:

- Egg reveal: the egg shakes, cracks, then items come out one by one, with the pet egg last and a rarity-colour burst.
- Tier-ups, first discoveries, perfect days and streak milestones get a full moment.
- Sounds off by default. Everything respects reduced motion.

Cheers (optional, Supabase phase): visitors can tap Cheer once per day (rate-limited by a hashed IP + date in an Edge Function). The pets react and a counter shows. No currency effect.

## 14. Psychology guardrails (keep these unless the owner says otherwise)

- Recovery after loss (Phoenix, comeback XP, the welcome-back egg). The moment of catastrophe is when people quit forever. Loss must sting, but there's always an earned way back.
- Progress that can't be lost (Keeper road, Petdex, Receipts). These balance the real losses.
- Freeze cap of 3. Unlimited banked freezes would remove all stakes.
- Sleep is protected. It's a task, the day closes at 22:00, reminders stop at 21:30, and sleep tiers never reward less sleep.
- No injury, no self-deception. Physical tasks are capped above Hard, there are at most 2 Goddamn tasks a day, and the soft daily food cap removes the reward for burnout days.
- No cherry-picking. Difficulty is set for the whole day. Single tasks can only go up, never below the day level.
- The odds are public. No real money.
- Real-life rewards add to life; they never gate sleep, meals or friends.
- Receipts keep attention on the real activity. This guards against extra rewards crowding out the enjoyment of reading for its own sake (the overjustification effect).
- Commitment devices: the monthly lock with one logged emergency swap, and the daily commitment bonus.

## 15. Screens

Two real pages, matching the two mockups, both with the site header injected at build time (like workspace/domainexp/build.mjs) plus a Daily sub-nav ("Pets & tasks" · "Eggs, collection & shop"):

**/daily/ — Pets & tasks** (mockup "Daily — pets & tasks")

1. Hero + header stats: streak (with tonight's bonus and the next step), freezes x/3, a day-window countdown, and Keeper level.
2. Hunger ladder: Fed / Hungry / Starving / Dead, with the current state highlighted, plus the Phoenix panel during Ashes.
3. Today's list (the hero of the page):
   - At the top: a day-level picker (Chill / Easy / Medium / Hard, default Easy), showing the commitment level and whether the +20% bonus is still alive, and the day's progress ring.
   - Per task: the quantity or rule at its level, a small "raise" control (above the day level only, up to Goddamn, max 2 Goddamn), food, the goal it serves, and a big tick.
   - A food-math box, including the soft cap.
   - Daily quests and the season track.
4. Active pets: each card shows the animated pet, name, rarity, stars, level/cap with any penalty and comeback-XP badge, food-today bar, egg meter, dividend line, seat ability, trinkets, and Feed buttons. Seat count shown as "3 base + N from abilities".
5. Receipts.
6. Difficulty ladder.
7. Backpack.

**/daily/eggs/ — Eggs, collection & shop** (mockup "Daily — eggs, collection & shop")

8. Eggs: openable eggs with the reveal; hatchery (servings meter, food picker by tier, live odds, charm, hatch); pet egg bag (incubate, separate, combine pairs).
9. Collection: merge/combine with the odds shown before confirming, plus the Petdex.
10. Shop (including Real life rewards and the redemption log).
11. Odds tables, public.

Visitors see everything read-only (section 1 "Owner vs visitor"), with a small "Owner view" link. Owner mode also has Settings: list setup / next month's list, emergency swap, reminders, export/import save, export public snapshot.

## 16. Tests and balance (node --test)

Conventions: node:test + node:assert/strict in `workspace/daily/tests/*.test.mjs`, added to package.json's test script. Keep `npm test` hermetic and fast (the whole suite runs in about a second today): seeded Monte Carlo tests sized to stay quick; no snapshot files; no network; no Supabase. Run under both `TZ=UTC` and `TZ=America/New_York`.

Engine unit tests for every rule in sections 2–13, especially:

- penalty stacking, comeback XP and the level floor;
- death, the 50% backpack loss and the Phoenix window;
- freeze cap and auto-use;
- streak-band egg counts and lucky days;
- normalized food;
- day level, per-task raises only, no per-task lowering, and the 2-Goddamn cap;
- mid-day level changes affecting only unticked tasks;
- the commitment bonus (kept on raise, lost on lowering);
- the 1,200 soft cap;
- seat abilities with and without a Beacon, and seat overflow;
- backpack cap and upkeep;
- pet food not carrying over;
- the 05:00–22:00 window and 22:00 close across a DST change; undo within 5 minutes;
- no reroll: the same state + action always gives the same outcome.

Monte Carlo tests (seeded, tolerance bands; ≥100k rolls for the full check in the balance script, a smaller seeded sample in `npm test`) that check every odds table: pet-egg roll by source, tier splits, the item-count distribution (mean ≈ 5.5, range 3–12), hatch odds with food bonuses and the 50% floor, the charm, the merge mutation at 5%, and combine rates.

Day-close idempotency: running it twice changes nothing. A 3-day absence catches up correctly.

Balance: port `workspace/daily/sim/daily_balance_sim.py` into `workspace/daily/sim/balance.mjs`, a hand-run script (`node workspace/daily/sim/balance.mjs [runs]`, never in `npm test`) that drives the real engine. The owner's Python results (400–500 runs per player type, one year) are:

| Player type (day levels) | Epic | Mythic | Legendary | Ultra | Deaths/yr |
|---|---|---|---|---|---|
| Chill days, very consistent | 100% (~day 176, via saving) | ~7% | ~0% | 0% | ~0.02 |
| Easy days (default), consistent | 100% (~day 167) | ~9% | ~0% | 0% | ~0.05 |
| Medium days | 100% (~day 93) | ~32% | ~3% | ~0.3% | ~0.03 |
| Medium weekdays + Hard weekends | 100% (~day 57) | ~51% | ~10% | ~1% | ~0.02 |
| Hard every day + 2 Goddamn raises on weekends (~7.5 h of tasks a day) | 100% (~day 27) | ~78% | ~24% | ~3% | ~0.03 |
| Inconsistent: Medium days, misses ~10% | 100% (~day 93) | ~28% | ~3% | 0% | ~0.4 (26% chance a year) |

Two-year check:

- Medium days: Mythic ~60%, Legendary ~13%, Ultra ~1%.
- Medium + Hard weekends: Mythic ~75%, Legendary ~18%, Ultra ~1%.
- Hard every day: Mythic ~97%, Legendary ~57%, Ultra ~10%.

Targets:

- Mythic in year one is lucky for normal effort and earned by the hardest workers.
- Ultra in year one is ≤ ~1% for realistic play, and only a few percent even for extreme play.
- Lower day levels never out-climb higher ones.
- Consistent players almost never die; inconsistent ones face it (~25–30% a year).

If the engine's results drift outside these bands, report which dial to turn. Don't quietly change rules. Record the table in workspace/daily/VALIDATION.md.

## 17. Phases (tonight's order)

1. Plan, repo-fit audit and design panel (done: this file and CONTENT.md).
2. Wiring scaffold by the main agent (stubs for daily/now/hq wired into build, verify, tests, nav, home menu, manifest).
3. Engine + tests + balance script. Animated pet characters (in parallel). /now/ and /hq/ (in parallel).
4. /daily/ UI: sections 15.1–15.7, local backend, visitor mode.
5. /daily/eggs/: sections 15.8–15.11, including the reveal animation.
6. Engagement layer: daily quests, weekly chest, Keeper road, season track, in-page reminders, celebrations.
7. Integration, browser QA, adversarial review, fixes.
8. Commit and push to main (main agent, last step).
9. Later, when the owner asks: Supabase (section 1 "Later"), with `workspace/daily/SETUP.md` listing the steps the owner does: create the project; enable GitHub OAuth (redirect URLs `https://zelinzhu-richard.github.io/daily/` and `/hq/`, plus `http://127.0.0.1:5173/...` for `npm run dev`); put the owner's user id in the allowlist; set the secrets (Anthropic, email); paste the project URL + anon key into config. Then visitor Cheers.

## 18. Not in scope

The animated ASCII-shark background (github.com/stackedlol/ascii-sharks) has no license, and the mockups contain a version of it (the "ocean" canvas). Don't copy it into the repo unless the owner says the author has granted permission.

## 19. Open items

- Skills, star abilities, trinket effects, real-life rewards, Keeper-road rewards, species and art: decided in CONTENT.md. The owner can revise them; numbers live in `workspace/daily/engine/content.js`.
- HQ open questions (carry-over default, seed dates): see `workspace/daily/_private/original-prompt.md` §19 (private). Default implemented: today's top 3 clears at 05:00 with a one-tap carry-over.

# Part B — the Now page and the HQ page

Both pages use the site's existing look: public/portfolio.css tokens and fonts, the site header and footer. Mockups: "Public · Learning in public" and "Private · Command center". Match their layout, type scale and colours (with the font substitutions in Ground rules).

## 20. /now/ — public "learning in public" page

Purpose: a public, honest log of what the owner is studying, what they've shipped and what's next. It's static, rebuilt from a data file, and needs no backend.

Routing and build:

- A real HTML page at /now/, built like the Video page: `workspace/now/page.mjs` exports `nowPage(data)` (the `<main>` body), rendered as a `pages()` entry in site/pages.mjs through `frame('/now/', 'Now', '<description>', nowPage(NOW), { stylesheet: '/now/style.css' })`. `workspace/now/build.mjs` (`buildNow(output)`) copies `style.css` (and the optional strip script) into `dist/now/`. Nav entry "Now" between Research and Daily. `/now/` goes in the sitemap urls and `now/index.html` in the verify required-outputs list.
- Its data lives in `workspace/now/now.mjs`, so updating the page means editing one file:

  ```js
  export const NOW = {
    updated: '2026-10-24',
    currently: ['MATH 347', 'ILO prep', 'qbench preprint'],
    term: { label: 'Fall', emphasis: '2026' },
    courses: [ /* see seed data */ ],
    milestones: [ /* see seed data */ ],
  };
  ```

- Validate the data at build time: required fields, status and state from the allowed sets, and dates. Each milestone has a `label` (free text for the date column: 'Sep 2026', 'Dec 9–13', 'Spring 2027') and an optional `date` (strict `YYYY-MM` or `YYYY-MM-DD`, checked with a regex, never Date.parse) used for ordering. A `next` milestone shows NEXT from its state, not its label. Bracketed placeholders like '[Date] 2027' are allowed and render as-is. Fail the build with a clear message rather than rendering a broken page.

Layout, top to bottom:

- Hero.
  - Eyebrow: NOW · UPDATED OCT 24, 2026, from `updated` (formatted by splitting the string, not through Date).
  - h1: "Learning, in public.", with the emphasis in Seasons italic, accent colour.
  - Lede: "A running log of what I'm studying, what I've shipped, and what's next. I update it as things move — wins and misses both."
  - A pill-shaped "currently →" line in monospace: currently → MATH 347 · ILO prep · qbench preprint, ending in a blinking caret. The resting (non-animated) state shows the caret.
- Section 01, coursework & study.
  - Heading "Fall 2026", from term, with the eyebrow 01 — Coursework & study right-aligned.
  - A list using the site's `.experience` two-column rows (public/portfolio.css): left column narrow, right column wide. They stack on phones.
  - Left column: a status chip plus the institution. Chip styles by status: enrolled — filled accent; sitting-in and auditing — outlined; self-study — filled amber #ffc98f, may carry a suffix like "· 8 h/wk".
  - Right column: the course title as an h3, a one-line note in muted text, then a monospace row of labelled lines. They default to now → and next →; the labels can be customised (for example mock score →).
- Section 02, milestones.
  - Heading "Shipped, and next", eyebrow 02 — Milestones.
  - A vertical timeline: a monospace date column, a thin rail with dots, and a title plus one line of detail.
  - Dot states: done — filled accent; next — filled amber with a soft pulsing ring (static under reduced motion), its date shows as NEXT in amber; upcoming — outline only.
  - The rail stops at the last item.
- Optional "This month" strip: 3–4 numbers from Daily's public Receipts (`/daily/snapshot.json`: pages read, hours outside, workouts, average sleep), linking to /daily/. Read-only, loaded by a small script, hidden if the data can't load.
- Closing line inside `<main>`, small and muted (not display size, because the footer's "The future is waiting to be built." is the closing statement): "Build. Learn. Repeat. · Last updated {date}".

Seed data: use it as-is. Bracketed items are placeholders the owner will fill in.

| Course | Status | Where | Note | Lines |
|---|---|---|---|---|
| MATH 347 — Linear Algebra for Applications | enrolled | UNC Chapel Hill | My one official UNC course this fall. | now → [current topic] · next → [next topic] |
| MATH 233 — Calculus of Functions of Several Variables | sitting-in | UNC Chapel Hill | Same professor as 347. I practice from the textbook instead of the assigned problem sets. | now / next placeholders |
| ECON 575 — Time Series Forecasting | auditing | UNC Chapel Hill | Forecasting runs through most of what I build, so this one is for the toolkit. | now / next placeholders |
| STOR 305 | sitting-in | UNC Chapel Hill | [One line on what you're getting out of it] | now / next placeholders |
| International Logic Olympiad 2027 | self-study · 8 h/wk | Senior division | Formal logic from zero, aiming to win. I built my own curriculum, problem bank and mock exams for it. | now → [current unit] · mock score → [latest] |

| Date | State | Title | Detail |
|---|---|---|---|
| Sep 2026 | done | SENTINEL accepted at IEEE ICAIRC | First author. Sequential diagnosis and mitigation of false convergence in physics-informed learning. |
| Oct 2026 | done | qbench accepted to the Agenthon workshop, NeurIPS 2026 | A hidden-ground-truth benchmark for agentic quant research. |
| Oct 2026 | upcoming (under review) | Lightning-talk abstract → Stanford AIMI AI+HEALTH | Built on our Delphi-2M paper presentation from UNC PRIMES. Under review. |
| NEXT | next | qbench preprint on arXiv | [Target date] |
| Dec 9–13 | upcoming | Agenthon at NeurIPS — Atlanta | Verifiable AI for quantitative finance. |
| Spring 2027 | upcoming | One more UNC class, maybe two at NC State | [Which ones] |
| [Date] 2027 | upcoming | International Logic Olympiad — Senior | The goal is to win it. |

Tests: data validation (good and bad fixtures); a structure test, not a snapshot, rendering `pages().get('now/index.html')` and asserting targeted strings like tests/site.test.mjs does (term heading, one row per course, the chip class per status, one timeline item per milestone, exactly one `next` item, the updated date); `now/index.html` in the verify list.

## 21. /hq/ — private command center

Purpose: the owner's private planning page for applications, deadlines, priorities, thoughts and ideas to build later. The page code lives in the public repo, but the data never does.

Privacy (non-negotiable):

- Tonight (local-first): all data lives in the owner's browser (localStorage), with JSON export and import. Nothing is sent anywhere. The owner's real data is imported once from `workspace/hq/_private/hq-seed.json` (gitignored). Later: Supabase tables with owner-only RLS for select, insert, update and delete; the anon role can read nothing.
- The page sets `<meta name="robots" content="noindex, nofollow">`, a neutral `<title>` ("Private") and no og/twitter tags. It's not in the nav and not in any sitemap. Don't add it to robots.txt, since that would advertise the path. tools/verify.mjs currently rejects "noindex" on every page: add one named exemption for exactly `hq/index.html` (which must contain the noindex meta), and keep the check strict for every other page. The page still carries the production origin (canonical link) that verify requires.
- When this browser holds no HQ data, the page shows only a centered button ("Open on this device") and an "Import" option: no data, and no hint of what it holds. Later, with Supabase: a centered "Sign in with GitHub" button; signed in as the owner it loads everything; anyone else sees "Not authorised".
- Committed fixtures and `seed.example.json` use fictional placeholders only. The real seed is never committed.

Location: `workspace/hq/` (build.mjs → `buildHq(output)` writes `dist/hq/index.html` plus its allowlisted runtime files; app.js, store.js, helpers, style.css, tests/). It does not use `frame()` or `pages()`. Its header is its own: the site wordmark plus a small lock badge "PRIVATE · NOT IN NAV" in monospace.

Data model (local store mirrors the later tables, so migration is a straight copy):

- priorities: id, scope ('today'|'month'), period ('2026-10-24' | '2026-10'), slot (1–5), text, done.
- deadlines: id, title, kind, category, date (nullable, 'YYYY-MM-DD'), approx (bool), dateLabel (nullable override, e.g. 'EARLY NOV'), sortOrder.
- tasks: id, deadlineId, text, done, position.
- thoughts: id, text, createdAt.
- ideas: id, title, note, bucket ('next'|'later'), position.
- categories: the user-editable list. Defaults: College, Fellowships, Jobs, Research.

Layout, top to bottom:

- Header: the site wordmark plus the lock badge.
- Title block: h1 "Command center", with a monospace line above it: SAT, OCT 24, 2026 · 14 OPEN TASKS (today in America/New_York, and the count of unticked deadline tasks).
- Priorities: two panels side by side that wrap on phones.
  - "Today top 3" has an amber border, with today's short date and "x/3 done" on the right.
  - "{Month} top 5" has an accent border, with "x/5 done". The month name comes from the date.
  - Each row: the big serif number 01–05 is the visible `<label>` for an inline text input; a check button (44 px target, aria-pressed, label "Mark done: today priority 1"); the input itself (transparent, full width, placeholder "Add a priority"), saved on blur and on Enter; a done row turns muted with a strikethrough.
  - Reset: today's slots clear at 05:00 local, and month slots on the 1st. Unfinished items from the previous period show as a one-tap "carry over" suggestion.
- Timeline: one chronological list of every deadline, past and future.
  - Heading row: "Timeline", an "Expand all / Collapse all" text button, and category filter chips (All + categories, aria-pressed). Expand all only affects visible rows.
  - Each row is a three-column grid: date column | rail with a dot | card.
  - Date column: the date label in monospace (NOV 1, or dateLabel, or TBD / ROLLING), then a countdown below it: 8 days, tomorrow, today or passed; no date yet when there's no date; a ~ prefix when approx; amber when 10 days or fewer away and not all done.
  - Dot: filled accent when every task is done; filled amber with a pulse ring when urgent; outline otherwise.
  - Card, collapsed (one line, at least 58 px tall): title, kind in muted text, category chip, status, and a chevron that rotates when open. The whole header is a `<button>` with aria-expanded and aria-controls.
  - Status: x/y, ready (all done, future), done (all done, past), or check (past and not done, amber).
  - Past rows that are all done have a fainter border and muted title.
  - Card, expanded: a progress bar with its percentage, then the checklist. Each task is a full-width 44 px button with a checkbox look, strikethrough when done.
  - Sorting: dated items ascending, with undated ones last, ordered by sortOrder.
  - Editing: a "+ Add deadline" button opens an inline form (title, kind, category, date or "no date", approx toggle, optional date label). Expanded cards get "+ Add task", inline rename and a delete with a confirm.
- Brain dump (beside the timeline on desktop, below it on phones): "Brain dump", subtitle "Unsorted thoughts. Turn them into timeline tasks later."; a labelled input "New thought" plus an Add button (Enter submits); a list, newest first, each item with a remove button (aria-label="Remove thought") and two small actions: "→ task" (pick a deadline to append it to) and "→ waitlist" (adds it to Later). Both remove the thought.
- Waitlist: "Waitlist", subtitle THINGS TO BUILD NEXT — OR LATER. A "New idea" input; adding sends it to Later. Two columns, Next up (accent underline) and Later (muted), each with a count. Idea cards show a title, an optional note, a move button (Next → / ← Later) and a remove button. Next-up cards are slightly brighter.
- Footer tools (small, muted): Export JSON, Import JSON, and a "Clear this device" with a confirm.

Seed data: private. See `workspace/hq/_private/hq-seed.json` (gitignored). `workspace/hq/seed.example.json` holds the same shape with fictional placeholders (e.g. "College A — Early Decision — 2026-11-01").

Behaviour details:

- All dates and countdowns use America/New_York.
- Optimistic UI for ticks and edits; with local storage, a failed write (quota) rolls back with a small inline error.
- The page works on a phone at 390 px: panels stack, chips wrap, the timeline grid keeps its date column narrow.
- Celebrations stay small (this is a work tool): ticking the last task of a deadline gives a brief check animation, off under reduced motion.

Tests:

- Pure helpers for countdown text and colour, sorting, status, and the period-reset logic, with fixed dates across a DST change.
- A publication test: `git ls-files` lists nothing under any `_private/` folder and no real seed file; seed.example.json contains only placeholder names.
- A build test: `hq/index.html` has the noindex meta, is the only page with it, is not in the nav, sitemap or robots.txt.
- Later: an RLS test against local Supabase (outside `npm test`), confirming the anon role and a second user can't read or write any hq_* table.
