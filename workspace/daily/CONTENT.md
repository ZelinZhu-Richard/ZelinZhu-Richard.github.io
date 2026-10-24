# Daily: final game-design decisions (panel chair)

**What this is:** the single, final content set for sections A–I of the brief. It merges the Claude designer's and Codex's proposals and both critiques. Every number is a default for the engine's config module. Where the two designers disagreed on a guardrail or a balance point, the stricter option won. Items marked **NEW** are rules or parameters outside the brief's vocabulary. Each one appears only because both designers proposed it or accepted it in critique. Section J lists the decisions that need the owner's OK.

**One sentence to design by:** *Do today's list; watch your little world grow.* Ticking a task is the best moment on the page. Pets, eggs and loot are the reward layer on top of it.

---

## A. Species and characters

### A.1 Shared art system (applies to every species)

**Canvas and sizes**

- SVG `viewBox="0 0 160 160"`. The ground line is y = 148 and the horizontal centre is x = 80. The character fits inside a 120 × 120 box (x 20–140, y 28–148).
- Display sizes:
  - Companion/hero slot: 200 px.
  - Pet card: 128 px.
  - Thumbnail (backpack, Petdex, quests): 72 px.
- At 72 px:
  - Hide every `#markings` path with stroke under 2 px.
  - Replace the animated aura with a static ring: r 66, 3 px, tier body colour.
  - Turn off species idle.

**Proportions:** chibi. Head and body are about 1 : 1 in height. The head overlaps the top of the body by about 15 % and sits 2–4 px forward of the body's centre.

**Line and shading**

- Outline: 4 px `#1a1530`, `stroke-linejoin: round`, `stroke-linecap: round`.
- Flat cel shading:
  1. Base fill (tier `body`).
  2. One shade shape on the lower-right of the head and body (tier `shade`).
  3. One belly or face light shape (tier `belly`).
  4. One white specular dot r 4 at the top-left of the head (`#ffffff`, 90 %).
- Ground shadow: ellipse rx 35, ry 5 at (80, 149), `#000000` at 30 %. Ultra pets float, so their shadow shrinks to rx 26 at 20 %.

**Eyes, cheeks and mouth (default face, used unless a species overrides it)**

- Eyes: ovals 13 × 17 `#1a1530`, centres about 26 px apart at head-centre y + 4. Each eye has two highlights: a white circle r 3 at the top-left and a white circle r 1.2 at the bottom-right. Ultra replaces the large highlight with a white 4-point star 7 px across.
- Blush: ellipses 10 × 6 under the outer corners of the eyes, `#ff7fb6` at 45 %. Mythic uses `#ff5a9e` at 55 % so it reads on a pink body.
- Mouth: a 3 px `#1a1530` stroke, 10 px wide.

**Required SVG groups** (CSS hooks; order is back to front)

```
#shadow #aura-back #tail #wing-back #body #legs #belly #markings #arms #acc-body
#head #ears #face(.eyes-open .eyes-happy .eyes-half .eyes-hollow .mouth-smile .mouth-open .mouth-wavy .mouth-o .tear)
#acc-brow #cosmetic #occlude-front #aura-front #fx
```

- `#occlude-front` holds the parts that sit *in front of* a head cosmetic: horns, ear tips, ear tufts, gill fronds and spine tips. The cosmetic tucks behind them.
- Anchors (in viewBox units) are given per species: `headTop` (cosmetics only), `brow`, `neck`, `chest`, `back`, `hand`, `tailTip`. **Tier accessories never use `headTop`.** That socket belongs to the one equipped cosmetic.

**Moods: when each one shows** (rule from Codex)

| Mood | When it shows |
|---|---|
| `healthy` | Default. |
| `happy` | Fed ≥ 100 today; hearts show all evening. Also a 1.4 s burst on a tick reaction, a level-up or eating. |
| `hungry` | The last processed close cost this pet levels (a Hungry event, underfed, or upkeep not covered). It lasts until the pet is fed ≥ 100 on a later day. |
| `starving` | A Starving event is in force: two consecutive misses. |
| `dead` | The pet died and is not eligible for Phoenix revival. |
| `ashes` | The pet is the one Phoenix revival would bring back (the highest-tier fallen pet), inside the 7-day window. |

Food not yet handed out during an open day **never** triggers distress. A pet does not plead for dinner at 9 AM.

**Default faces per mood** (species may override a part, as listed below)

| Mood | Eyes | Mouth | Body |
|---|---|---|---|
| Healthy | `.eyes-open`, blinking | `.mouth-smile`: a "u" arc 10 px wide, 4 px deep | Breathing |
| Happy | `.eyes-happy`: "^^" arcs, 3 px stroke, 12 px wide | `.mouth-open`: a D shape 12 × 8, filled `#1a1530`, with a tongue ellipse 6 × 3 `#ff7fb6` | Blush at 60 %; 3 hearts (`#ff7fb6`, 8 px) float up 24 px and fade over 1.2 s |
| Hungry | `.eyes-half`: a flat upper lid in the tier `shade` colour covers the top 45 % of each eye; brows are two 8 px strokes tilted 20° up toward the centre | `.mouth-wavy`: a 3-bump wave, 12 px wide | Head translateY +3; ears, fins or gills rotate 15° down; breathing slows to 4.8 s; a grey squiggle `#978daa` at the belly fades in and out every 6 s |
| Starving | `.eyes-hollow`: eyes shrink to 9 × 11 with a 1.5 px highlight; a 10 px under-eye arc in `shade`; a `.tear` drop 4 × 6 `#9fd4ff` slides from the left eye over 2 s, repeating | `.mouth-o`: a small open oval 5 × 6 | `filter: saturate(.35) brightness(.85)`; body scaleY .94 (slumped); a shiver burst of translateX ±1 px for 0.15 s every 3 s |

**Shared animations** (CSS keyframes; all disabled under `prefers-reduced-motion`, which leaves the static mood pose)

| Animation | Spec |
|---|---|
| Breathing | `#body` scaleY 1 → 1.03 and `#head` translateY −1.5 px. 3.6 s ease-in-out, infinite, origin at bottom centre (80, 148). |
| Blink | `.eyes-open` scaleY 1 → 0.1 → 1 over 140 ms. Interval randomised per pet, 4–7 s. |
| Species idle | One flourish every 8–12 s (per species, below). |
| Happy bounce | 2 hops in 0.7 s: translateY −14 px, with squash scaleX 1.1 / scaleY 0.9 on each landing, plus the happy face. |
| Eating (only when he feeds a pet) | A food orb flies in an arc from the Feed button into the mouth over 350 ms. The orb is a soft 4-point star blob 12 px, `#dfccff`, with a white 30 % core. Then the species eating action (≈ 800 ms) and 3 crumbs (2 px dots in the tier `belly` colour). |
| Level-up | Jump −22 px. A ring in the tier body colour bursts out (r 0 → 70, stroke 4 → 0, opacity 1 → 0). "Lv N" pops above the head in 14 px bold `#1a1530` on a white pill. 6 white sparkles rise. 1.2 s. |
| Tick cheer (patron reaction, section I) | The species idle plus one happy bounce. No eating. |

**Dead and ashes**

- **Dead:** a rounded tombstone 64 × 76, centred at (80, 110).
  - Stone `#4a4560`, with a right-side shade `#37334a`.
  - The species silhouette carved 32 px tall in `#2b2740`.
  - The name and "Lv N" engraved in 10 px `#c2bad0`.
  - Two tiny grey flowers at the base: petals `#8a8499`, centre `#c2bad0`.
  - No motion and no X-eyes.
- **Ashes** (only the revival-eligible pet):
  - A shallow ash nest: ellipse 70 × 18 `#3a3548`, with a rim of 5 ash lumps `#4a4560`.
  - A species medallion in the centre: a circle r 14 in `#2b2740` with the silhouette in the tier colour.
  - 5 coals (r 3) glow in the tier body colour, opacity pulsing .4 ↔ 1 over 2.4 s.
  - Every 5 s a translucent smoke wisp shaped like the species (tier colour, 25 %) rises 30 px and fades.
  - A 3-segment ring (r 40, 4 px) around the nest fills one segment per consecutive complete day. The segments use the tier colour; empty ones are `#4a4560`.
  - Copy: "A way back: finish 3 days in a row by {date}." After expiry: "The revival window ended. Your Keeper progress and receipts remain."
  - Other fallen pets show the plain gravestone.

**Tier ladder** (shared palette; species items are listed per species)

Rules (from Codex):

- **Each tier's markings and accessory replace the previous tier's.** They do not pile up.
- **At most one body accessory, plus at most one `brow` item.**
- **The equipped cosmetic always uses `headTop`.**

| Tier | body / shade / belly / accent | Markings | Aura (animated on the focused pet only; static elsewhere) |
|---|---|---|---|
| Ordinary | #c2bad0 / #978daa / #ebe6f2 / #6f6585 | none | none |
| Rare | #9fd4ff / #6aaee6 / #e3f3ff / #2f6fb3 | species marking A | 2 white 4-point sparkles (8 px) by the head, twinkling (opacity 0 → 1 → 0, 1.2 s) every 5 s |
| Super Rare | #7ee0c3 / #4cbc9c / #dcf8ef / #23866a | marking A + B | ground glow: ellipse rx 45, ry 7 at (80, 149), body colour at 35 % |
| Epic | #c9a2ff / #9c72e8 / #f0e6ff / #6a3fc4 | markings glow (`drop-shadow(0 0 4px #c9a2ff)`) | a dotted ring r 64 behind (stroke `#6a3fc4` 2 px, dash 2 6, 50 %) rotating once per 20 s; 2 motes (r 3 `#f0e6ff`) orbiting in 6 s |
| Mythic | #ff9ecf / #e46aa9 / #ffe4f2 / #a83a74 | celestial: 5 white star specks (4-point, 4 px, 70 %) on the body | a radial halo r 70 (`#ff9ecf` 45 % → 0) pulsing scale .95 ↔ 1.05 over 4 s; 4 motes; a sparkle trail on hops |
| Legendary | #ffc98f / #e9a25a / #fff1df / #a8611f; trim #ffe08a (1.5 px inner stroke on the top arcs of head and back) | flame tips on the extremities (3-lobe flames, `#ffb347` → `#ff7a3d`) | 12 sun rays behind (isosceles triangles 10 × 34, `#ffe08a` 35 %) rotating once per 40 s; 6 motes |
| Ultra | #fff3b0 / #e3cf72 / #fffbe8 / #b08f2a | prismatic: an iridescent overlay on `#body` and `#head` (linear gradient #fff3b0 → #ffd3ec → #cfe8ff → #d8ffef → #fff3b0, `mix-blend-mode: soft-light` 40 %), hue drifting over 6 s | rays (alternating `#fff3b0` and `#ffd3ec`) plus a halo; 8 prism motes rising; the pet floats 4 px and bobs; star eye highlights |

**Stars on the art:** stars show as pips beside the rarity label and do not change anatomy. **5★** adds one thing: a thin rim light, a 1.5 px `#ffe08a` inner stroke on the silhouette.

**Performance rule:**

- Only the focused/companion pet runs aura animation and species idle.
- Every other pet breathes and blinks only.
- Off-screen cards pause through an IntersectionObserver.

**Naming:** a hatched pet gets an unused name from its species pool. The owner can rename it (12 characters at most). When the pool runs out, names gain a suffix: "Ember II".

**Patron tasks** (cosmetic only):

- At lock time each task carries one tag: `physical`, `outdoors`, `food`, `study`, `sleep` or `frog`.
- When a tagged task is ticked, every active pet of the matching species plays the tick cheer.
- Axolotls cheer for the task that was left unticked most recently.

### A.2 The species

| Species | Line name | Role | Patron of | Unlock |
|---|---|---|---|---|
| dragon | **Drakelet** | hoard | physical | launch |
| fox | **Kitsu** | luck | outdoors | launch |
| slime | **Gumdrop** | efficiency | food | launch |
| owl | **Hootling** | scholar | study (Read, Deep work) | launch |
| turtle | **Pebbleback** | guardian | sleep | launch |
| axolotl | **Ripplegill** | regenerator | most recently missed task | launch |
| hedgehog | **Bramblekin** | collector | the frog task (section G) | Keeper level 25 |

**Extra species:** exactly one, Bramblekin, at Keeper 25. It joins the hatch pool permanently and grants no pet and no egg.

- Each extra species dilutes same-species merge pairing, and stars are the merge payoff. So three extra species was cut to one.
- No other species unlocks in the first six seasons.

#### Drakelet (dragon)

*"A proud little hoarder who counts coins in its sleep and treats every workout like a dragon fight."*

**Shapes**

- Body: a bean ellipse (cx 80, cy 112, rx 30, ry 28), tilted 4° right.
- Head: an ellipse (cx 80, cy 66, rx 34, ry 30).
- Snout: an ellipse (cx 80, cy 80, rx 18, ry 11) in `belly`, with nostril dots r 1.5 at (74, 77) and (86, 77). A white fang triangle 3 × 4 sits at the right mouth corner (90, 86).
- Horns: two backward-curving horn paths from (62, 44) and (98, 44), each 16 long and 7 wide at the base, in `belly` with `shade` tips. They sit in `#occlude-front`.
- Wings: `#wing-back`, two bat wings at shoulder pivots (56, 96) and (104, 96). Each is 30 × 24 with 3 scallops on the lower edge. Membrane `shade`, bones `accent`.
- Tail: a thick curve from (104, 130) curling up to (132, 104), ending in a spade 12 × 12 in `accent`.
- Belly: 3 horizontal rounded plates (width 30, 34, 30; height 7) at y 104, 114 and 124, in `belly`.
- Feet: ellipses 9 × 6 at (66, 145) and (94, 145). Arms: ovals 7 × 10 at (54, 112) and (106, 112).

**Anchors:** headTop (80, 34) · brow (80, 50) · neck (80, 92) · chest (80, 104) · hand (108, 116) · tailTip (132, 104).

**Idle:** two wing flaps (rotate −18° around the shoulder pivots, 0.25 s each). Then a smoke ring: 3 circles r 4 → 10, stroke `#c2bad0` 2 px, rising 30 px from the snout and fading over 1.4 s.

**Faces**

- Happy: "^^" eyes, open smile showing the fang, wings raised 12°.
- Hungry: half lids, wavy mouth, wings folded (rotate +10°), tail tip drooping 10°. A grey wisp `#978daa` replaces the smoke ring.
- Starving: hollow eyes, tail flat on the ground, horns dulled to `shade`, tear.

**Eating:** two chomps (head scaleY .92, mouth open and shut, 150 ms each), then a hiccup flame. The flame is a teardrop 10 × 16 from the mouth: `#dfccff` at Ordinary, the tier `accent` above that. It fades in 400 ms.

**Tier items**

| Tier | Item |
|---|---|
| Rare | Marking A: 4 spine-ridge triangles (6 × 8) down the back of the body, in `accent`. |
| SR | Ridges plus plate edging (a 1.5 px `accent` line under each belly plate). Holds a gold coin at `hand`: circle r 7 `#ffd34d`, outline `#a8611f`, an embossed 4-point star. |
| Epic | The coin is replaced by a gem amulet at `neck`: a teardrop 10 × 12 in `#c9a2ff` with a white glint, on a 2 px cord in `#6a3fc4`. |
| Mythic | Crescent-moon rings on both horns (`#ffe4f2`, `#a83a74` outline) and 5 white star specks on the wings. No amulet. |
| Legendary | Gold horn caps `#ffe08a`, a flame-tipped tail spade and wing tips, and a forehead gem at `brow` (a diamond 8 × 10 `#ffe08a` with a white glint). |
| Ultra | Translucent wings (the Ultra gradient at 75 %) with 3 star cut-outs, prismatic horn caps, and a prismatic brow gem. |

**Names:** Ember, Cinder, Toast, Saffron, Flint, Paprika, Sizzle, Kindle, Magma, Wick, Sterling, Nova.

#### Kitsu (fox)

*"Quick, cheeky and lucky. It can't sit still until you've been outside."*

**Shapes**

- Head: an ellipse (cx 80, cy 64, rx 36, ry 32).
- Ears: rounded triangles, base 22 and height 30, at (58, 38) and (102, 38), tilted ±15°. Inner ear `#ffc4dc`. The ear tips sit in `#occlude-front`.
- Cheek ruff: two `belly` wedges flaring out to (44, 80) and (116, 80).
- Muzzle: a rounded triangle 20 × 14 in `belly`. Nose: ellipse 5 × 4 `#1a1530` at (80, 75).
- Body: a sitting pear (cx 80, cy 116, rx 24, ry 26) with a `belly` chest bib.
- Tail: one huge comma shape, about the size of the body (34 wide). It runs from behind the right hip (112, 132), curls up to (130, 86) and wraps over the front of the feet. The last 30 % is `belly`.
- Front paws: ovals 8 × 6 at (70, 145) and (90, 145).

**Anchors:** headTop (80, 34) · brow (80, 52) · neck (80, 96) · chest (80, 108) · tailTip (128, 86).

**Idle:** the tail swishes ±8° around its base over 1.6 s. The left ear twitches (rotate −12°, 120 ms, twice).

**Faces**

- Happy: "^^" eyes and a "w" mouth (two 5 px arcs), with a fast tail wag (±14°, 0.3 s × 3).
- Hungry: airplane ears (each rotated 35° outward), half lids looking down, tail wrapped tight around the feet.
- Starving: ears flat (rotated 70°), muzzle resting on the curled tail, tear, shiver.

**Eating:** the head darts up 8 px and snaps the orb from the air. It lands, the cheek ruff puffs (scale 1.1), and it chews twice.

**Tier items.** The extra tails are translucent spirit tails, drawn in `#aura-back` as copies of the main tail at 40 % opacity in the tier body colour, fanned behind it. They are aura, so the fox keeps one real tail.

| Tier | Item |
|---|---|
| Rare | Marking A: ear tips and socks in `accent`. |
| SR | Marking A + B (a tail band 6 px wide in `accent`). A leaf bandana at `neck`: a triangle 22 × 14 in `#7ccf6b` with 3 leaf prints in `#4f9a45`. |
| Epic | The bandana is replaced by a bell collar at `neck`: a 4 px `accent` band with a bell r 5 `#ffd34d`. 1 spirit tail at −20°. |
| Mythic | A foxfire wisp orbiting r 40 in 6 s: a teardrop 10 × 14, `#ffe4f2` core, `#ff9ecf` edge. 2 spirit tails at ±20°. |
| Legendary | A gold diamond mark at `brow` (8 × 10 `#ffe08a`), and the collar turns gold. 4 spirit tails fanned ±40°. |
| Ultra | 8 spirit tails in a sunburst fan with the Ultra gradient fill, and twin foxfire wisps. |

**Names:** Pip, Kit, Maple, Rusty, Juniper, Clementine, Tango, Ginger, Biscuit, Fennel, Vesper, Scout.

#### Gumdrop (slime)

*"Cheerful, squishy and never wastes a crumb."*

**Shapes**

- Body: a gumdrop dome.
  - Base 96 wide (x 32–128) at y 146, with three soft lobes on the base edge.
  - The top rises to y 56.
  - A soft-serve curl on top: a 1.5-turn spiral 22 × 16 at (86, 50), leaning right.
  - No limbs and no separate head.
- Body fill at 88 % opacity. A lighter inner core: ellipse (cx 80, cy 108, rx 30, ry 24) in `belly`.
- 2–3 bubbles r 3–5 inside, white at 50 %.
- A glossy highlight streak: a white 60 % stroke, 6 px wide, from (52, 76) to (60, 62).
- The face sits on the upper half: eyes at (66, 92) and (94, 92), mouth at (80, 106).

**Anchors:** headTop (80, 46) (the cosmetic sits on the curl) · brow (80, 78) · chest (80, 108) · back (112, 96).

**Idle:** an elastic wobble: scaleX 1.06 / scaleY .94, then back, over 0.8 s. The bubbles rise 20 px and fade.

**Faces**

- Happy: big "^^" eyes and an open mouth, with a jiggle (two quick wobbles).
- Hungry: flattened (scaleY .9, scaleX 1.05), the curl droops 20°.
- Starving: a half-melted puddle (scaleY .7, scaleX 1.15), the curl lies flat, small eyes with a tear, the bubbles stop.

**Eating:** the orb enters the mouth and stays visible inside, sinking to the core over 500 ms. Then it sparkles and dissolves. The surface bulges where it went in (local scale 1.04).

**Tier items**

| Tier | Item |
|---|---|
| Rare | Marking A: 6 sprinkles inside the body (capsules 2 × 6, in `accent`, `#ff7fb6` and `#ffe08a`). |
| SR | Sprinkles plus sugar-crystal facets on the surface (4 white 30 % diamonds 4 × 6). |
| Epic | A faceted crystal core: a hexagon r 12 in `#c9a2ff` inside the core, with a white glint and an Epic glow. |
| Mythic | A galaxy swirl inside: a 2-arm spiral in `#a83a74` with 6 white star specks. |
| Legendary | Gold flecks (8 dots r 1.5 `#ffe08a`) and a golden ring r 14 around the core. |
| Ultra | A prismatic body plus a baby-slime moon in `#aura-front`: a circle r 9 in the Ultra palette with a dot face, orbiting r 56 in 8 s. |

**Names:** Mochi, Bean, Jelly, Gloop, Dumpling, Boba, Wobble, Pudding, Gummy, Tapioca, Squish, Plop.

#### Hootling (owl)

*"Studious and a little smug. It celebrates a finished page like a solved mystery."*

**Shapes**

- One egg silhouette: a head ellipse (cx 80, cy 64, rx 38, ry 32) overlapping a body ellipse (cx 80, cy 114, rx 32, ry 30).
- A heart-shaped facial disc in `belly`, spanning x 50–110 and y 42–90.
- Ear tufts: triangles 10 × 16 at (54, 36) and (106, 36), angled 20° out, in `#occlude-front`.
- The largest eyes of any species: circles r 9 with an iris ring in `accent` and a `#1a1530` pupil r 6.
- Beak: a triangle 8 × 8 `#ffb347` at (80, 82).
- Wings: ovals 14 × 36 at the sides (x 42–56 and 104–118, y 96–132) in `shade`.
- Feet: three-toed, `#ffb347`, at (68, 146) and (92, 146).

**Anchors:** headTop (80, 32) · brow (80, 46) · neck (80, 92) · chest (80, 112) · hand (112, 120).

**Idle:** the head tilts 15° over 0.6 s, holds for 0.8 s, and returns. Every second idle is a one-eye wink instead.

**Faces**

- Happy: arc eyes, wings out 20°, a small hop.
- Hungry: half lids, tufts drooping 25°, body fluffed 6 % wider.
- Starving: ruffled (4 jagged feather tips on the outline), a stray feather (8 × 3 in `shade`) falling, tear.

**Eating:** gulps the orb whole. A bulge (circle r 6 in `shade`) travels down the throat from y 84 to y 110 over 400 ms.

**Tier items.** The glasses evolve from tier to tier.

| Tier | Item |
|---|---|
| Rare | Marking A: 3 belly chevrons (V, 10 wide, 2 px, `accent`). |
| SR | Chevrons plus pale crescent edges on the facial disc (2 px `#ffffff` 60 %). A bookmark-ribbon scarf at `neck` (`accent`, 2 tails 4 × 14). |
| Epic | Round reading glasses: circles r 11 around the eyes, 2 px `accent` frame, bridge 6 px. They replace the scarf. |
| Mythic | Glasses with star rims (`#ffe4f2`) and a constellation on the wings: 5 white dots joined by 1 px white 60 % lines. |
| Legendary | Gold glasses `#ffe08a` and a gold quill at `hand`: a feather 6 × 22 `#fff1df` with a `#ffe08a` shaft. |
| Ultra | A moon monocle on the right eye (r 12, prismatic rim, crescent charm), star-dusted wings, and a moon halo behind the head (crescent r 28, `#fffbe8` 60 %). |

**Names:** Euler, Ada, Gödel, Turing, Boole, Noether, Quill, Sage, Inky, Hoot, Atlas, Minerva.

#### Pebbleback (turtle)

*"Calm, steady and unbothered. Rest is a skill, and it's very good at it."*

**Shapes** (front three-quarter view)

- Head: a circle (cx 80, cy 62, r 30) on top, with skin in `body`.
- Shell: a dome behind and under the head, ellipse (cx 80, cy 112, rx 46, ry 32), in `shade`.
  - 5 hexagonal plates: a centre hex 22 wide at (80, 104) and 4 around it, each outlined 2 px `#1a1530`.
  - A rim band 6 px in `belly`. A plastron in `belly` visible at the front.
- Legs: four stubs (front ovals 12 × 9 at (54, 142) and (106, 142); rear ones half hidden). A little tail at (126, 132).

**Anchors:** headTop (80, 32) · brow (80, 46) · neck (80, 90) · back (112, 84) (top-right of the shell, clear of the head).

**Idle:** pulls the head halfway in (translateY +14, scale .9) over 0.5 s, peeks for 0.4 s, and comes back out. Every 12 s it yawns (mouth O, 0.8 s).

**Faces**

- Happy: "^^" eyes and a smile, stamping the front feet (two alternating 3 px lifts).
- Hungry: head lowered 6 px, half lids, a sigh puff (white 40 % cloud, 10 px).
- Starving: head fully inside the shell, with only teary eyes showing in the dark opening (`#2b2740`).

**Eating:** a slow munch over 1 s: cheeks puff, 2 crumb triangles fall.

**Tier items**

| Tier | Item |
|---|---|
| Rare | Marking A: shell seams in `accent` (the plate outlines become 2 px `accent`). |
| SR | Seams plus a central-plate oval in `belly`. A moss tuft at `back`: 3 bumps 18 × 8 in `#7ccf6b`, with a tiny flower (5 white petals, `#ffd34d` centre). |
| Epic | Gem-facet plates: the centre plate becomes a `#c9a2ff` faceted gem with a white glint and an Epic glow. The moss is removed. |
| Mythic | A bonsai at `back`: a trunk `#8a5a3b` 4 px wide with an S-curve 24 tall, and 3 blossom puffs (r 7–9) in `#ffd3ec` and `#ff9ecf`. |
| Legendary | A gold shell band (6 px `#ffe08a` along the rim). The bonsai gets gold leaves (`#ffe08a`) and a hanging lantern (6 × 9 `#ffb347` with a soft glow). |
| Ultra | A star-tree at `back` (trunk `#b08f2a`, a crown of 4 prismatic puffs) and a planet ring around the shell (ellipse rx 58, ry 12, `#cfe8ff` 60 %, tilted −8°). |

**Names:** Pebble, Mossy, Tortellini, Shelly, Basil, Bramble, Cobble, Dune, Sprout, Kale, Juno, Tank.

#### Ripplegill (axolotl)

*"A gentle optimist that grows back stronger. Bad days happen; it's still smiling."*

**Shapes**

- Head: wide, an ellipse (cx 80, cy 70, rx 44, ry 30).
- Gills: 3 frilly fronds on each side, feather shapes 18 × 8 fanning at −30°, 0° and +30° from (40, 62) and (120, 62).
  - Frond fill `shade`, with a 1.5 px tip edge in `#ff7fb6`.
  - They sit in `#occlude-front`.
- Eyes: small and wide-set, circles r 5 at (58, 70) and (102, 70), each with a 1.5 px highlight.
- Mouth: a wide smile arc from (66, 84) to (94, 84).
- Body: plump, ellipse (cx 80, cy 118, rx 26, ry 22). Four nub legs.
- Tail: a finned crescent behind the right side, x 106–138 and y 100–142, with a `belly` fin edge.

**Anchors:** headTop (80, 40) · brow (80, 56) · neck (80, 98) · chest (80, 112) · tailTip (136, 104).

**Idle:** the gills flutter in a wave, each frond rotating ±10° in turn from front to back with an 80 ms stagger. The body sways ±2° over 3 s, and a bubble (r 3, white 50 %) rises from the mouth.

**Faces**

- Happy: "^^" eyes, a smile 20 % wider, gills fanned out 15°.
- Hungry: gills droop 25°, the mouth becomes `.mouth-o`.
- Starving: grey, limp gills (the fronds desaturated to `#978daa`, hanging 50°), the head resting between the front feet, a pale body.

**Eating:** a suction gulp. A small spiral whirl line (1.5 px white) shows at the mouth, the cheeks puff once and the gills flare.

**Tier items**

| Tier | Item |
|---|---|
| Rare | Marking A: freckles (6 dots r 2 in `accent` on the head and back). |
| SR | Freckles plus a pale belly oval. A flower clip on the right gill (5 white petals, `#ffd34d` centre, 10 px). |
| Epic | Bioluminescent gill tips (circles r 3 in `belly` with the Epic glow). The clip becomes a crystal clip (`#c9a2ff` diamond 8 × 10). |
| Mythic | A translucent star-speckled tail fin (fin at 60 %, 4 white specks) and a bubble halo in the aura (6 bubbles r 4 on a ring of r 52). |
| Legendary | Gold-tipped gills (tips `#ffe08a`) and a pearl on a 2 px `accent` cord at `neck` (r 6 `#fffbe8` with a pink glint `#ffd3ec`). |
| Ultra | Aurora fronds (gradient `#d8ffef` → `#cfe8ff` → `#ffd3ec`) and 3 bubbles orbiting r 50. |

**Names:** Bubbles, Peach, Gil, Wasabi, Coral, Blossom, Mo, Sakura, Ripple, Dot, Noodle, Taffy.

#### Bramblekin (hedgehog, Keeper 25)

*"A meticulous little collector who believes every small effort belongs somewhere."*

**Shapes**

- Spines: a broad scalloped fan around the head and back, 11 blunt scallops, outer radius 52 centred at (80, 84), in `shade`. The top 3 scallops sit in `#occlude-front`. The forehead stays clear for cosmetics.
- Face: a large pale heart-shaped mask (x 50–110, y 50–98) in `belly`.
- Nose: a round button r 5 `#1a1530` at (80, 82). Eyes: beads r 6 at (66, 72) and (94, 72).
- Belly: a small bean (cx 80, cy 120, rx 22, ry 20) in `belly`. Tiny paws held in front at (70, 118) and (90, 118). Feet at (68, 146) and (92, 146).

**Anchors:** headTop (80, 34) · brow (80, 56) · neck (80, 100) · chest (80, 116) · hand (80, 118).

**Idle:** a sniff (the nose wiggles ±2 px three times in 0.4 s). Then a ripple travels across the spine fan: each scallop scales 1.08 in turn with a 50 ms stagger.

**Faces**

- Happy: crescent eyes, paws clasped together.
- Hungry: nose lowered, eyelids soft, paws resting on the belly.
- Starving: settles into a loose half-curl (the spines rotate forward 20° and the face stays visible), tear.

**Eating:** holds the orb in both paws, rotates it once, and takes two neat bites.

**Tier items**

| Tier | Item |
|---|---|
| Rare | Marking A: pale spine tips (the outer 30 % of each scallop in `belly`). |
| SR | Tips plus a second band across the fan (a 5 px `accent` arc). |
| Epic | A cross-body seed pouch: a strap 3 px `accent`, and a pouch 14 × 12 in `belly` at the right hip. |
| Mythic | Leaf-shaped spine markings (5 leaves in `accent`) and an acorn pin on the pouch (`#8a5a3b` cap, `#ffe4f2` nut). |
| Legendary | Sunburst bands across the fan (alternating `#ffe08a` wedges) and a gold pouch clasp. |
| Ultra | Luminous spine tips forming one continuous prismatic scalloped rim. |

**Names:** Bramble, Thimble, Burr, Pipkin, Hazel, Chestnut, Button, Crumb, Prickle, Pocket, Truffle, Tumble.

### A.3 Launch prologue and cosmetics

- **Launch prologue: 2026-10-25 → 10-31.** Tasks, pets, streaks, Keeper progress, quests and receipts all work. There is no season track: the season card previews November's cosmetic with the copy "First season begins November 1. Your Keeper progress is already growing."
- **Cosmetic rules:**
  - Cosmetics are account-wide and permanent, and they survive death.
  - Each pet can wear at most one at a time, and every pet can wear the same one at once.
  - A cosmetic sits at `headTop`, scaled to the head width (`accScale`), behind `#occlude-front`.

**Season cosmetics** (season tier 30)

| Month | Season | Cosmetic | Art (palette and motion) |
|---|---|---|---|
| 2026-11 | Small Beginnings | **Acorn Cap** | A cap dome 34 × 18 in `#8a5a3b` with a 1 px cross-hatch in `#6b4329`, a cream band `#f3e6c8` 4 px, and a stem 3 × 7 in `#5c3b22`. The stem sways ±6° with the breathing. |
| 2026-12 | A Little Light | **Snowfall Beanie** | A knit beanie in `#3f5fa8` with 3 rib lines in `#2f4c8c`, a white 6-point snowflake 10 px on the front, and a pom r 6 in `#ffffff`. The pom bounces on every hop. |
| 2027-01 | Fresh Pages | **Paper Party Crown** | A zigzag paper crown, 5 points, 34 × 14, `#ffd34d` with a `#e3b23c` fold line and 3 dots in `#ff7fb6`. Every 10 s a tiny firework (6 rays, `#ff7fb6` and `#9fd4ff`, 12 px) pops above it. |
| 2027-02 | Warm Company | **Heart Patch Beret** | A dusty-rose beret `#d98ba0`, 38 × 16, tilted 10°, with a cream heart patch `#fff1df` 9 px and a dashed 1 px stitched border in `#b3667c`. |
| 2027-03 | New Growth | **Blossom Sprig** | A twig `#8a5a3b` 20 long, tucked at the right with 3 blossoms (5 petals `#ffd3ec`, `#ff9ecf` centre). Every 8 s a petal drifts down 40 px. |
| 2027-04 | Rain and Shine | **Rain Bucket Hat** | A yellow bucket hat `#ffd34d` with a `#e3b23c` brim edge, 40 × 16, and a `#9fd4ff` raindrop pin. Every 9 s a drop drips off the brim. |

Reduced motion disables every cosmetic motion.

```json
{
  "art": {
    "viewBox": [0, 0, 160, 160], "groundY": 148, "centerX": 80,
    "displayPx": { "hero": 200, "card": 128, "thumb": 72 },
    "thumbRules": { "hideMarkingStrokeUnderPx": 2, "staticAuraRing": { "r": 66, "width": 3 }, "speciesIdle": false },
    "outline": "#1a1530", "outlineWidth": 4,
    "eye": { "fill": "#1a1530", "size": [13, 17], "highlights": [{ "r": 3, "pos": "topLeft" }, { "r": 1.2, "pos": "bottomRight" }], "ultraStarHighlightPx": 7 },
    "blush": { "color": "#ff7fb6", "opacity": 0.45, "mythicColor": "#ff5a9e", "mythicOpacity": 0.55, "size": [10, 6] },
    "specular": { "r": 4, "color": "#ffffff", "opacity": 0.9 },
    "shadow": { "rx": 35, "ry": 5, "color": "#000000", "opacity": 0.3, "ultra": { "rx": 26, "opacity": 0.2 } },
    "foodOrb": { "color": "#dfccff", "sizePx": 12 },
    "groups": ["shadow", "aura-back", "tail", "wing-back", "body", "legs", "belly", "markings", "arms", "acc-body", "head", "ears", "face", "acc-brow", "cosmetic", "occlude-front", "aura-front", "fx"],
    "faceClasses": ["eyes-open", "eyes-happy", "eyes-half", "eyes-hollow", "mouth-smile", "mouth-open", "mouth-wavy", "mouth-o", "tear"],
    "tierAccessoryRule": "Markings and accessory replace the previous tier's; max one body accessory plus one brow item; tier items never use headTop.",
    "grave": { "size": [64, 76], "stone": "#4a4560", "shade": "#37334a", "carve": "#2b2740", "text": "#c2bad0", "flowerPetal": "#8a8499" },
    "ashes": { "nest": "#3a3548", "rim": "#4a4560", "medallion": "#2b2740", "coals": 5, "emberPulseS": 2.4, "wispEveryS": 5, "progressSegments": 3, "onlyRevivalEligiblePet": true,
      "copy": "A way back: finish 3 days in a row by {date}.", "expiredCopy": "The revival window ended. Your Keeper progress and receipts remain." },
    "performance": { "animateAuraAndIdle": "focusedPetOnly", "othersAnimate": ["breathe", "blink"], "pauseOffscreen": true }
  },
  "moods": {
    "rule": "Hungry and Starving follow processed day-close outcomes only; unallocated food during an open day never triggers distress.",
    "hungryUntil": "fed >= 100 on a later day",
    "faces": {
      "healthy": { "eyes": "eyes-open", "mouth": "mouth-smile" },
      "happy": { "eyes": "eyes-happy", "mouth": "mouth-open", "blushOpacity": 0.6, "hearts": { "count": 3, "color": "#ff7fb6", "risePx": 24, "durS": 1.2 } },
      "hungry": { "eyes": "eyes-half", "lidCoverPct": 45, "mouth": "mouth-wavy", "headDropPx": 3, "appendageDroopDeg": 15, "breatheS": 4.8, "growlColor": "#978daa", "growlEveryS": 6 },
      "starving": { "eyes": "eyes-hollow", "eyeSize": [9, 11], "mouth": "mouth-o", "tear": "#9fd4ff", "filter": "saturate(.35) brightness(.85)", "slumpScaleY": 0.94, "shiverEveryS": 3 }
    }
  },
  "animations": {
    "breatheS": 3.6, "breatheScaleY": 1.03, "blinkMs": 140, "blinkEveryS": [4, 7],
    "speciesIdleEveryS": [8, 12],
    "happyBounce": { "hops": 2, "durS": 0.7, "heightPx": 14, "squash": [1.1, 0.9] },
    "eat": { "orbFlightMs": 350, "actionMs": 800, "crumbs": 3, "trigger": "manualFeedOnly" },
    "levelUp": { "durMs": 1200, "jumpPx": 22, "ringR": 70, "sparkles": 6 },
    "tickCheer": "speciesIdle+happyBounce",
    "reducedMotion": "staticMoodPose"
  },
  "tierLook": [
    { "tier": "ordinary", "body": "#c2bad0", "shade": "#978daa", "belly": "#ebe6f2", "accent": "#6f6585", "markings": "none", "aura": "none" },
    { "tier": "rare", "body": "#9fd4ff", "shade": "#6aaee6", "belly": "#e3f3ff", "accent": "#2f6fb3", "markings": "A", "aura": { "type": "sparkles", "count": 2, "sizePx": 8, "everyS": 5, "twinkleS": 1.2 } },
    { "tier": "superRare", "body": "#7ee0c3", "shade": "#4cbc9c", "belly": "#dcf8ef", "accent": "#23866a", "markings": "A+B", "aura": { "type": "groundGlow", "rx": 45, "ry": 7, "opacity": 0.35 } },
    { "tier": "epic", "body": "#c9a2ff", "shade": "#9c72e8", "belly": "#f0e6ff", "accent": "#6a3fc4", "markings": "glow", "glow": "drop-shadow(0 0 4px #c9a2ff)", "aura": { "type": "dottedRing", "r": 64, "dash": [2, 6], "spinS": 20, "motes": 2, "moteOrbitS": 6 } },
    { "tier": "mythic", "body": "#ff9ecf", "shade": "#e46aa9", "belly": "#ffe4f2", "accent": "#a83a74", "markings": "celestial", "aura": { "type": "pulseHalo", "r": 70, "pulseS": 4, "motes": 4, "hopTrail": true } },
    { "tier": "legendary", "body": "#ffc98f", "shade": "#e9a25a", "belly": "#fff1df", "accent": "#a8611f", "trim": "#ffe08a", "markings": "flameTips", "flame": ["#ffb347", "#ff7a3d"], "aura": { "type": "sunRays", "rays": 12, "rayColor": "#ffe08a", "rayOpacity": 0.35, "spinS": 40, "motes": 6 } },
    { "tier": "ultra", "body": "#fff3b0", "shade": "#e3cf72", "belly": "#fffbe8", "accent": "#b08f2a", "markings": "prismatic", "iridescent": ["#fff3b0", "#ffd3ec", "#cfe8ff", "#d8ffef", "#fff3b0"], "iridescentBlend": "soft-light", "iridescentOpacity": 0.4, "iridescentS": 6, "aura": { "type": "raysHalo", "rayColors": ["#fff3b0", "#ffd3ec"], "motes": 8, "floatPx": 4 }, "starEyes": true }
  ],
  "fiveStarRim": { "color": "#ffe08a", "widthPx": 1.5 },
  "patronTags": ["physical", "outdoors", "food", "study", "sleep", "frog"],
  "species": [
    { "id": "dragon", "line": "Drakelet", "unlock": { "type": "launch" }, "role": "hoard", "patron": "physical",
      "personality": "A proud little hoarder who counts coins in its sleep and treats every workout like a dragon fight.",
      "namePool": ["Ember", "Cinder", "Toast", "Saffron", "Flint", "Paprika", "Sizzle", "Kindle", "Magma", "Wick", "Sterling", "Nova"],
      "anchors": { "headTop": [80, 34], "brow": [80, 50], "neck": [80, 92], "chest": [80, 104], "hand": [108, 116], "tailTip": [132, 104], "accScale": 1.0 },
      "idle": "wingFlap2+smokeRing", "eat": "chomp2+flameHiccup",
      "tierItems": { "rare": "spineRidges", "superRare": "spineRidges+plateEdging+goldCoin@hand", "epic": "gemAmulet@neck", "mythic": "moonHornRings+wingStars", "legendary": "goldHornCaps+flameTips+browGem", "ultra": "prismWings+prismHornCaps+prismBrowGem" } },
    { "id": "fox", "line": "Kitsu", "unlock": { "type": "launch" }, "role": "luck", "patron": "outdoors",
      "personality": "Quick, cheeky and lucky. It can't sit still until you've been outside.",
      "namePool": ["Pip", "Kit", "Maple", "Rusty", "Juniper", "Clementine", "Tango", "Ginger", "Biscuit", "Fennel", "Vesper", "Scout"],
      "anchors": { "headTop": [80, 34], "brow": [80, 52], "neck": [80, 96], "chest": [80, 108], "tailTip": [128, 86], "accScale": 0.95 },
      "idle": "tailSwish+earTwitch", "eat": "snapAir+puffCheeks",
      "spiritTails": { "epic": 1, "mythic": 2, "legendary": 4, "ultra": 8, "layer": "aura-back", "opacity": 0.4 },
      "tierItems": { "rare": "earTips+socks", "superRare": "tailBand+leafBandana@neck", "epic": "bellCollar@neck", "mythic": "foxfireWisp", "legendary": "goldBrowDiamond+goldCollar", "ultra": "twinFoxfire+sunburstSpiritTails" } },
    { "id": "slime", "line": "Gumdrop", "unlock": { "type": "launch" }, "role": "efficiency", "patron": "food",
      "personality": "Cheerful, squishy and never wastes a crumb.",
      "namePool": ["Mochi", "Bean", "Jelly", "Gloop", "Dumpling", "Boba", "Wobble", "Pudding", "Gummy", "Tapioca", "Squish", "Plop"],
      "anchors": { "headTop": [80, 46], "brow": [80, 78], "chest": [80, 108], "back": [112, 96], "accScale": 1.05 },
      "idle": "jellyWobble+bubbles", "eat": "absorbVisible",
      "tierItems": { "rare": "sprinkles", "superRare": "sprinkles+sugarFacets", "epic": "crystalCore", "mythic": "galaxySwirl", "legendary": "goldFlecks+goldCoreRing", "ultra": "prismBody+babySlimeMoon" } },
    { "id": "owl", "line": "Hootling", "unlock": { "type": "launch" }, "role": "scholar", "patron": "study",
      "personality": "Studious and a little smug. It celebrates a finished page like a solved mystery.",
      "namePool": ["Euler", "Ada", "Gödel", "Turing", "Boole", "Noether", "Quill", "Sage", "Inky", "Hoot", "Atlas", "Minerva"],
      "anchors": { "headTop": [80, 32], "brow": [80, 46], "neck": [80, 92], "chest": [80, 112], "hand": [112, 120], "accScale": 1.0 },
      "idle": "headTilt|wink", "eat": "gulpThroatBulge",
      "tierItems": { "rare": "chevrons", "superRare": "chevrons+discCrescents+ribbonScarf@neck", "epic": "readingGlasses", "mythic": "starRimGlasses+constellationWings", "legendary": "goldGlasses+goldQuill@hand", "ultra": "moonMonocle+starWings+moonHalo" } },
    { "id": "turtle", "line": "Pebbleback", "unlock": { "type": "launch" }, "role": "guardian", "patron": "sleep",
      "personality": "Calm, steady and unbothered. Rest is a skill, and it's very good at it.",
      "namePool": ["Pebble", "Mossy", "Tortellini", "Shelly", "Basil", "Bramble", "Cobble", "Dune", "Sprout", "Kale", "Juno", "Tank"],
      "anchors": { "headTop": [80, 32], "brow": [80, 46], "neck": [80, 90], "back": [112, 84], "accScale": 0.95 },
      "idle": "headRetractPeek+yawn", "eat": "slowMunch",
      "tierItems": { "rare": "shellSeams", "superRare": "seams+plateOval+mossFlower@back", "epic": "gemPlates", "mythic": "bonsai@back", "legendary": "goldShellBand+goldBonsai+lantern", "ultra": "starTree@back+planetRing" } },
    { "id": "axolotl", "line": "Ripplegill", "unlock": { "type": "launch" }, "role": "regenerator", "patron": "lastMissed",
      "personality": "A gentle optimist that grows back stronger. Bad days happen; it's still smiling.",
      "namePool": ["Bubbles", "Peach", "Gil", "Wasabi", "Coral", "Blossom", "Mo", "Sakura", "Ripple", "Dot", "Noodle", "Taffy"],
      "anchors": { "headTop": [80, 40], "brow": [80, 56], "neck": [80, 98], "chest": [80, 112], "tailTip": [136, 104], "accScale": 1.1 },
      "idle": "gillWave+sway+bubble", "eat": "suctionGulp",
      "tierItems": { "rare": "freckles", "superRare": "freckles+bellyOval+flowerClip", "epic": "glowGillTips+crystalClip", "mythic": "starFin+bubbleHalo", "legendary": "goldGillTips+pearl@neck", "ultra": "auroraFronds+orbitBubbles" } },
    { "id": "hedgehog", "line": "Bramblekin", "unlock": { "type": "keeper", "level": 25 }, "role": "collector", "patron": "frog",
      "personality": "A meticulous little collector who believes every small effort belongs somewhere.",
      "namePool": ["Bramble", "Thimble", "Burr", "Pipkin", "Hazel", "Chestnut", "Button", "Crumb", "Prickle", "Pocket", "Truffle", "Tumble"],
      "anchors": { "headTop": [80, 34], "brow": [80, 56], "neck": [80, 100], "chest": [80, 116], "hand": [80, 118], "accScale": 1.0 },
      "idle": "sniff+spineRipple", "eat": "pawRotateBite2",
      "tierItems": { "rare": "paleSpineTips", "superRare": "tips+fanBand", "epic": "seedPouch", "mythic": "leafSpines+acornPin", "legendary": "sunburstBands+goldClasp", "ultra": "prismSpineRim" } }
  ],
  "speciesSelection": { "rule": "uniform among unlocked species at hatch", "launchCount": 6, "afterKeeper25": 7, "unlockGrantsPetOrEgg": false },
  "launchPrologue": { "start": "2026-10-25", "end": "2026-10-31", "seasonCardCopy": "First season begins November 1. Your Keeper progress is already growing." },
  "cosmeticRules": { "accountWide": true, "survivesDeath": true, "equipPerPet": 1, "anchor": "headTop", "behind": "occlude-front" },
  "seasonCosmetics": [
    { "season": "2026-11", "seasonName": "Small Beginnings", "id": "acornCap", "name": "Acorn Cap", "colors": ["#8a5a3b", "#6b4329", "#f3e6c8", "#5c3b22"], "motion": "stemSway" },
    { "season": "2026-12", "seasonName": "A Little Light", "id": "snowfallBeanie", "name": "Snowfall Beanie", "colors": ["#3f5fa8", "#2f4c8c", "#ffffff"], "motion": "pomBounce" },
    { "season": "2027-01", "seasonName": "Fresh Pages", "id": "paperPartyCrown", "name": "Paper Party Crown", "colors": ["#ffd34d", "#e3b23c", "#ff7fb6", "#9fd4ff"], "motion": "fireworkPop10s" },
    { "season": "2027-02", "seasonName": "Warm Company", "id": "heartPatchBeret", "name": "Heart Patch Beret", "colors": ["#d98ba0", "#fff1df", "#b3667c"], "motion": "none" },
    { "season": "2027-03", "seasonName": "New Growth", "id": "blossomSprig", "name": "Blossom Sprig", "colors": ["#8a5a3b", "#ffd3ec", "#ff9ecf"], "motion": "petalDrift8s" },
    { "season": "2027-04", "seasonName": "Rain and Shine", "id": "rainBucketHat", "name": "Rain Bucket Hat", "colors": ["#ffd34d", "#e3b23c", "#9fd4ff"], "motion": "brimDrip9s" }
  ]
}
```

---

## B. Skills (per species)

**Decision:** skills are **per species**, following the owner's Brawl Stars direction. Each species has one role, so who sits in the active seats is a real choice.

**Shape of the ladder**

- L10 skills are small and economic. Most pets will have one, and none of them is a loss shield.
- Odds-touching skills start at L40, so they need a Super Rare or better pet that has reached level 40.
- Effects that matter for missed days start at L40.

**Rules** (stricter of the two proposals, plus agreed engine caps)

- **Active only.** A Beacon extends **seat abilities only** (spec §6), never skills, stars or trinkets.
- **Skills switch off below their level.** A skill works while the pet's *current* level ≥ its unlock level. Regaining the level restores it, and nothing is re-granted.
- **Global effects from the same skill don't stack.** Two L25 Kitsu both running Errand Runner count once. **NEW**
- **Loss shields:**
  - Shields act only on Hungry and Starving penalty events.
  - Self and team shields together prevent at most **1 level per pet per event**, so Hungry is −2 → −1 at best and Starving is −5 → −4. **NEW cap**
  - The underfed −1 and upkeep −1 are never shielded.
- **Comeback:** bonuses from every source (self, team, trinkets) add at most **+1** to the base 2×, so the most a pet gets is 3×. It applies only while the pet owes lost XP.
- **Luck caps:**
  - A pet's total `petEggChancePct` is capped at **+50**. **NEW cap**
  - The team's total `hatchLuckPts` from all sources is capped at **+3**. **NEW cap**
- **`commitBonusPts`:** total cap +10, as in the vocabulary.
- **`streakEggBonus`:** pays on streak nights whose day count is a multiple of N (7).
- **Pet XP effects** never raise food earned, Keeper XP or season XP.

| Lv | Drakelet (hoard) | Kitsu (luck) | Gumdrop (efficiency) | Hootling (scholar) | Pebbleback (guardian) | Ripplegill (regenerator) | Bramblekin (collector) |
|---|---|---|---|---|---|---|---|
| 10 | Gold Sniffer | Quick Paws | Tiny Appetite | Study Hall | Home Shell | Regrow | Pocket Finds |
| 25 | Treasure Sense | Errand Runner | Soak It Up | Study Group | Long Road | Bubble Nest | Tidy Pouch |
| 40 | Warm Clutch | Lucky Tail | Bounce Back | Second Wind | Shell Up | Soft Landing | Thorough |
| 55 | Hoard Share | Bag of Tricks | Bud Off | Office Hours | Shelter | Spawn Pond | Curator |
| 70 | Dragon's Share | Foxfire | Mega Absorb | Promise Keeper | Old Soul | Neoteny | Collector's Eye |
| 85 | Wyrm Facets | Kitsune Grin | One Big Blob | Clear Sight | Long Road II | Clutch of Plenty | Full Pockets |
| 100 | Sky Sovereign | Nine-Tailed | King Gumdrop | Grand Archivist | World Turtle | Forever Young | Grand Collection |

**Odds impact of the tier-moving skills**

| Skill | Effect | Odds impact |
|---|---|---|
| Lucky Tail (Kitsu L40) | +10 % relative pet-egg chance, self | SR fox 12 % → 13.2 %; Epic fox 5 % → 5.5 %. About +1 pt year-one Mythic for a Medium player who makes the fox the top pet, and only after about 75 days of feeding. |
| Lucky Tail + Kitsune Grin (L85) | +25 % combined | Mythic fox 3.5 % → 4.4 %; Legendary fox 3 % → 3.75 % (Codex's correction). L85 needs a Legendary pet, so about 0 in year one. |
| Forever Young (Ripplegill L100) | +20 % relative | Ultra pets only (the L100 cap), so it changes Ultra → Ultra merges, not the climb. |
| Foxfire (L70), Clear Sight (L85), Nine-Tailed (L100) | +1 hatch-luck pt each, team (team cap +3) | They need a Mythic pet at L70 or higher: about 128 k XP, which is about 230 Medium days of all the surplus. So about 0 in year one. In year 2, a Mythic hatch's Legendary chance goes 5 % → 6–8 %. |
| `nextPetEggTierUp` | | **Not used anywhere in the final content.** |

```json
{
  "skillLevels": [10, 25, 40, 55, 70, 85, 100],
  "rules": {
    "model": "perSpecies", "cumulative": true, "activeOnly": true, "beaconExtends": "seatAbilityOnly",
    "deactivateBelowUnlockLevel": true, "regrantOnRegain": false,
    "globalSameSkillStacks": false,
    "shield": { "appliesTo": ["hungry", "starving"], "maxLevelsPreventedPerPetPerEvent": 1, "neverShields": ["underfed", "upkeep"] },
    "comeback": { "base": 2, "maxBonus": 1, "max": 3, "onlyWhileOwed": true },
    "caps": { "perPetPctPerType": 100, "petEggChancePctPerPet": 50, "teamHatchLuckPts": 3, "commitBonusPts": 10, "extraLootItemsTotal": 8 },
    "streakEggBonusRule": "pays on streak nights where streakDay % N == 0",
    "petXpNeverAffects": ["foodEarned", "keeperXp", "seasonXp"],
    "NEW": ["globalSameSkillStacks", "shield.maxLevelsPreventedPerPetPerEvent", "caps.petEggChancePctPerPet", "caps.teamHatchLuckPts"]
  },
  "skills": {
    "dragon": [
      { "lv": 10, "id": "goldSniffer", "name": "Gold Sniffer", "desc": "Pays 10% more dividend coins.", "effects": [{ "type": "dividendPct", "value": 10, "scope": "self" }] },
      { "lv": 25, "id": "treasureSense", "name": "Treasure Sense", "desc": "Coin piles in every egg come out 8% bigger.", "effects": [{ "type": "lootCoinPct", "value": 8, "scope": "global" }] },
      { "lv": 40, "id": "warmClutch", "name": "Warm Clutch", "desc": "Sits on its egg meter like a nest: +10% fill.", "effects": [{ "type": "eggMeterPct", "value": 10, "scope": "self" }] },
      { "lv": 55, "id": "hoardShare", "name": "Hoard Share", "desc": "Shares the hoard: every active pet pays 15% more dividends.", "effects": [{ "type": "dividendPct", "value": 15, "scope": "team" }] },
      { "lv": 70, "id": "dragonsShare", "name": "Dragon's Share", "desc": "Every coin you earn gets 5% extra shine.", "effects": [{ "type": "coinPct", "value": 5, "scope": "global" }] },
      { "lv": 85, "id": "wyrmFacets", "name": "Wyrm Facets", "desc": "Polishes 50% more diamond shards for the team.", "effects": [{ "type": "shardPct", "value": 50, "scope": "team" }] },
      { "lv": 100, "id": "skySovereign", "name": "Sky Sovereign", "desc": "The hoard of hoards.", "effects": [{ "type": "coinPct", "value": 10, "scope": "global" }, { "type": "dividendPct", "value": 25, "scope": "team" }] }
    ],
    "fox": [
      { "lv": 10, "id": "quickPaws", "name": "Quick Paws", "desc": "Slips one more item into every egg it lays.", "effects": [{ "type": "extraLootItems", "value": 1, "scope": "self" }] },
      { "lv": 25, "id": "errandRunner", "name": "Errand Runner", "desc": "Quests pay 10% more.", "effects": [{ "type": "questCoinPct", "value": 10, "scope": "global" }] },
      { "lv": 40, "id": "luckyTail", "name": "Lucky Tail", "desc": "Its eggs hide pet eggs a bit more often (+10% relative).", "effects": [{ "type": "petEggChancePct", "value": 10, "scope": "self" }] },
      { "lv": 55, "id": "bagOfTricks", "name": "Bag of Tricks", "desc": "Another item, from who knows where.", "effects": [{ "type": "extraLootItems", "value": 1, "scope": "self" }] },
      { "lv": 70, "id": "foxfire", "name": "Foxfire", "desc": "Its glow warms every hatching egg (+1 pt).", "effects": [{ "type": "hatchLuckPts", "value": 1, "scope": "team" }] },
      { "lv": 85, "id": "kitsuneGrin", "name": "Kitsune Grin", "desc": "Luck that's almost suspicious (+15% relative).", "effects": [{ "type": "petEggChancePct", "value": 15, "scope": "self" }] },
      { "lv": 100, "id": "nineTailed", "name": "Nine-Tailed", "desc": "Nine tails, nine pockets.", "effects": [{ "type": "extraLootItems", "value": 2, "scope": "self" }, { "type": "hatchLuckPts", "value": 1, "scope": "team" }] }
    ],
    "slime": [
      { "lv": 10, "id": "tinyAppetite", "name": "Tiny Appetite", "desc": "Counts as fed at 90. Growth still starts after 100.", "effects": [{ "type": "foodNeedReduce", "value": 10, "scope": "self" }] },
      { "lv": 25, "id": "soakItUp", "name": "Soak It Up", "desc": "Backpack pets cost 2 less food to keep.", "effects": [{ "type": "upkeepReduce", "value": 2, "scope": "global" }] },
      { "lv": 40, "id": "bounceBack", "name": "Bounce Back", "desc": "Squishes back after a bad day: comeback +0.5.", "effects": [{ "type": "comebackMult", "value": 0.5, "scope": "self" }] },
      { "lv": 55, "id": "budOff", "name": "Bud Off", "desc": "Little blobs bud off into eggs: +15% egg meter.", "effects": [{ "type": "eggMeterPct", "value": 15, "scope": "self" }] },
      { "lv": 70, "id": "megaAbsorb", "name": "Mega Absorb", "desc": "Counts as fed at 70. Nothing wasted.", "effects": [{ "type": "foodNeedReduce", "value": 20, "scope": "self" }] },
      { "lv": 85, "id": "oneBigBlob", "name": "One Big Blob", "desc": "The backpack becomes one comfy puddle: upkeep −3 more.", "effects": [{ "type": "upkeepReduce", "value": 3, "scope": "global" }] },
      { "lv": 100, "id": "kingGumdrop", "name": "King Gumdrop", "desc": "Royalty, in jelly form.", "effects": [{ "type": "eggMeterPct", "value": 25, "scope": "self" }, { "type": "extraLootItems", "value": 1, "scope": "self" }] }
    ],
    "owl": [
      { "lv": 10, "id": "studyHall", "name": "Study Hall", "desc": "Learns 10% faster than the others.", "effects": [{ "type": "xpPct", "value": 10, "scope": "self" }] },
      { "lv": 25, "id": "studyGroup", "name": "Study Group", "desc": "Everyone learns 5% faster around it.", "effects": [{ "type": "xpPct", "value": 5, "scope": "team" }] },
      { "lv": 40, "id": "secondWind", "name": "Second Wind", "desc": "Helps the team win back lost levels: comeback +0.5.", "effects": [{ "type": "comebackMult", "value": 0.5, "scope": "team" }] },
      { "lv": 55, "id": "officeHours", "name": "Office Hours", "desc": "Quests pay 15% more when someone's checking your work.", "effects": [{ "type": "questCoinPct", "value": 15, "scope": "global" }] },
      { "lv": 70, "id": "promiseKeeper", "name": "Promise Keeper", "desc": "Keep your morning commitment and it pays 3 pts more.", "effects": [{ "type": "commitBonusPts", "value": 3, "scope": "global" }] },
      { "lv": 85, "id": "clearSight", "name": "Clear Sight", "desc": "Sees the rarer chick inside the shell (+1 pt).", "effects": [{ "type": "hatchLuckPts", "value": 1, "scope": "team" }] },
      { "lv": 100, "id": "grandArchivist", "name": "Grand Archivist", "desc": "Every page you read, remembered.", "effects": [{ "type": "xpPct", "value": 20, "scope": "team" }, { "type": "commitBonusPts", "value": 2, "scope": "global" }] }
    ],
    "turtle": [
      { "lv": 10, "id": "homeShell", "name": "Home Shell", "desc": "Backpack friends cost 1 less food to keep.", "effects": [{ "type": "upkeepReduce", "value": 1, "scope": "global" }] },
      { "lv": 25, "id": "longRoad", "name": "Long Road", "desc": "Every 7th streak night, one extra egg.", "effects": [{ "type": "streakEggBonus", "value": 1, "scope": "global", "everyN": 7 }] },
      { "lv": 40, "id": "shellUp", "name": "Shell Up", "desc": "Loses one less level on a Hungry or Starving night.", "effects": [{ "type": "levelLossShield", "value": 1, "scope": "self" }] },
      { "lv": 55, "id": "shelter", "name": "Shelter", "desc": "Shields every active pet a little (max 1 level per pet).", "effects": [{ "type": "levelLossShield", "value": 1, "scope": "team" }] },
      { "lv": 70, "id": "oldSoul", "name": "Old Soul", "desc": "Recovery is just patience: team comeback +0.5.", "effects": [{ "type": "comebackMult", "value": 0.5, "scope": "team" }] },
      { "lv": 85, "id": "longRoad2", "name": "Long Road II", "desc": "Weekly streak nights get one more egg.", "effects": [{ "type": "streakEggBonus", "value": 1, "scope": "global", "everyN": 7 }] },
      { "lv": 100, "id": "worldTurtle", "name": "World Turtle", "desc": "Carries everyone, steadily.", "effects": [{ "type": "dividendPct", "value": 20, "scope": "team" }, { "type": "upkeepReduce", "value": 2, "scope": "global" }] }
    ],
    "axolotl": [
      { "lv": 10, "id": "regrow", "name": "Regrow", "desc": "Gets lost levels back faster: comeback +0.5.", "effects": [{ "type": "comebackMult", "value": 0.5, "scope": "self" }] },
      { "lv": 25, "id": "bubbleNest", "name": "Bubble Nest", "desc": "Everyone's egg meter fills 5% quicker.", "effects": [{ "type": "eggMeterPct", "value": 5, "scope": "team" }] },
      { "lv": 40, "id": "softLanding", "name": "Soft Landing", "desc": "Loses one less level on a Hungry or Starving night.", "effects": [{ "type": "levelLossShield", "value": 1, "scope": "self" }] },
      { "lv": 55, "id": "spawnPond", "name": "Spawn Pond", "desc": "Its eggs hold one more item.", "effects": [{ "type": "extraLootItems", "value": 1, "scope": "self" }] },
      { "lv": 70, "id": "neoteny", "name": "Neoteny", "desc": "The whole team bounces back like kids: comeback +0.5.", "effects": [{ "type": "comebackMult", "value": 0.5, "scope": "team" }] },
      { "lv": 85, "id": "clutchOfPlenty", "name": "Clutch of Plenty", "desc": "Team egg meters fill 10% quicker.", "effects": [{ "type": "eggMeterPct", "value": 10, "scope": "team" }] },
      { "lv": 100, "id": "foreverYoung", "name": "Forever Young", "desc": "Never stops growing: +20% XP and its eggs hide pet eggs 20% more often.", "effects": [{ "type": "xpPct", "value": 20, "scope": "self" }, { "type": "petEggChancePct", "value": 20, "scope": "self" }] }
    ],
    "hedgehog": [
      { "lv": 10, "id": "pocketFinds", "name": "Pocket Finds", "desc": "Coin piles in eggs come out 5% bigger.", "effects": [{ "type": "lootCoinPct", "value": 5, "scope": "global" }] },
      { "lv": 25, "id": "tidyPouch", "name": "Tidy Pouch", "desc": "One more item in every egg it lays.", "effects": [{ "type": "extraLootItems", "value": 1, "scope": "self" }] },
      { "lv": 40, "id": "thorough", "name": "Thorough", "desc": "+10% egg meter.", "effects": [{ "type": "eggMeterPct", "value": 10, "scope": "self" }] },
      { "lv": 55, "id": "curator", "name": "Curator", "desc": "Quests pay 10% more.", "effects": [{ "type": "questCoinPct", "value": 10, "scope": "global" }] },
      { "lv": 70, "id": "collectorsEye", "name": "Collector's Eye", "desc": "Team diamond shards +30%.", "effects": [{ "type": "shardPct", "value": 30, "scope": "team" }] },
      { "lv": 85, "id": "fullPockets", "name": "Full Pockets", "desc": "Two more items in every egg it lays.", "effects": [{ "type": "extraLootItems", "value": 2, "scope": "self" }] },
      { "lv": 100, "id": "grandCollection", "name": "Grand Collection", "desc": "Everything finds its place.", "effects": [{ "type": "coinPct", "value": 10, "scope": "global" }, { "type": "eggMeterPct", "value": 15, "scope": "team" }] }
    ]
  }
}
```

---

## C. Star abilities (shared by every species)

**Decision:** skills carry the species identity. Stars are the **universal merge payoff**: the same for every species and cumulative. Copies needed follow the mockup: 2 / 4 / 8 / 16.

**Placeholders replaced**

- "Loot rolls twice" (about +5.5 items) became **+2 items**.
- **The 4★ "+1 tier on the next pet egg" is dropped.** Codex showed that on a Rare 4★ each charge moves an egg's Mythic chance from about 0.25 % to about 5.4 %, and the recharge would repeat that. That is too large to sit beside a 32 % Medium-year Mythic reference. It is replaced by a strong economic star.
- 5★ uses Codex's one-charge-per-lineage rule. That is stricter than a 30-day recharge.

| Star | Name | Effect | Odds impact |
|---|---|---|---|
| 2★ | **Twin Spark** | Egg meter +10 %, XP +10 % (self) | Meter throughput only. About +1 pt Medium Mythic at most (inside noise). |
| 3★ | **Second Helping** | +2 items in every egg it lays (self) | None. Extra items never add a pet-egg or Ultra-trinket roll. |
| 4★ | **Golden Touch** | Dividends +25 %, shards +25 %, +1 item (self) | None. |
| 5★ | **Nine Lives** | Survives one death (self) | None. See the rules below. |

**Nine Lives rules**

- **One charge per pet lineage, ever.** The charge is granted the first time the pet reaches 5★.
- Charge history survives moving, Phoenix revival and any merge or combine descendant. Nothing refills a spent charge.
- On use, the pet survives **at level 1**, with 0 food today. It keeps its species, tier, stars and trinkets, and owes comeback XP.
- It does **not** prevent a streak reset, other pets dying, the 50 % backpack loss, miss-count processing or future underfeeding penalties.

**Visual:** 5★ adds the gold rim light (section A).

```json
{
  "starModel": "shared", "cumulative": true, "activeOnly": true,
  "starAbilities": [
    { "stars": 2, "id": "twinSpark", "name": "Twin Spark", "desc": "Egg meter and XP both 10% faster.", "copies": 2, "effects": [{ "type": "eggMeterPct", "value": 10, "scope": "self" }, { "type": "xpPct", "value": 10, "scope": "self" }] },
    { "stars": 3, "id": "secondHelping", "name": "Second Helping", "desc": "+2 items in every egg it lays.", "copies": 4, "effects": [{ "type": "extraLootItems", "value": 2, "scope": "self" }] },
    { "stars": 4, "id": "goldenTouch", "name": "Golden Touch", "desc": "+25% dividends and shards, +1 item per egg.", "copies": 8, "effects": [{ "type": "dividendPct", "value": 25, "scope": "self" }, { "type": "shardPct", "value": 25, "scope": "self" }, { "type": "extraLootItems", "value": 1, "scope": "self" }] },
    { "stars": 5, "id": "nineLives", "name": "Nine Lives", "desc": "Survives one death, once per lineage.", "copies": 16, "visual": "goldRimLight",
      "effects": [{ "type": "deathSave", "value": 1, "scope": "self", "recharge": "never; one charge per lineage, granted on first reaching 5 stars" }],
      "survival": { "level": 1, "foodToday": 0, "keeps": ["species", "tier", "stars", "trinkets"], "owesComebackXp": true },
      "doesNotPrevent": ["streakReset", "otherPetsDying", "backpackLoss", "missCountProcessing", "futureUnderfeedPenalties"],
      "inheritance": "Spent-charge history persists through moving, Phoenix revival and any merge/combine descendant." }
  ],
  "extraLootRule": "Extra items use normal non-pet loot rolls; they never add a pet-egg roll or an Ultra-trinket roll.",
  "tierMovingEffects": []
}
```

---

## D. Trinkets

**Rules:** Claude's catalogue for build variety, with Codex's guardrails.

- **Who can wear them:** Epic+ pets only, 5 slots. Effects need an **active wearer**, and a Beacon does not extend them.
- **Stacking:**
  - No duplicate trinket on one pet.
  - At most **one `luck`-tagged trinket per pet**. All the caps from section B apply (shield 1 per event, comeback +1, pet-egg chance +50 per pet, team hatch luck +3).
- **Food reduction:** `foodNeedReduce` lowers only the fed/dividend threshold (minimum 70). XP and egg-meter input still come only from food beyond 100.
- **Snapshots:** item count and meter effects are fixed **when an egg is laid**. Equipping or swapping later never changes eggs already laid or credits past food.
- **Drops:** a regular-trinket loot result picks a tier uniformly among eligible tiers at or below the egg tier, then uniformly within that tier. An Ultra egg's 10 % special roll gives one uniformly chosen Ultra trinket.
- **Prices (spec):** Epic 150 · Mythic 500 · Legendary 1,500 💎.
- **Ultra flash sale:**
  - Base 22,000 💎, 30 % off, so 15,400 💎. That is above the 15,000 floor.
  - A 24-hour window, with all five Ultra trinkets on offer.
  - Shown **inside the shop only**: no countdown overlay and no announcement on the finish banner.
  - In practice Ultra trinkets will come only from Ultra eggs. 15,400 💎 is many years of diamonds.

**Odds impact**

| Trinket | Effect | Odds impact |
|---|---|---|
| Lucky Pebble (Epic, 150 💎) | +8 % relative | Epic eggs 5 % → 5.4 % pet egg. About +1 pt year-one Mythic for a Medium player who puts it on the top Epic pet; the realistic case was inside sim noise. |
| Fourfold Clover (Mythic) | +15 % relative | Mythic eggs 3.5 % → 4.0 %. About +0.3 pt Legendary a year. |
| Dragon-glass Prism (Legendary) | +1 pt team hatch luck | Needs a 1,500 💎 Legendary trinket, so about 0 in year one. In year 2, Mythic → Legendary on hatch goes 5 % → 6 %. |
| Star Map (Ultra) | +2 pt team hatch luck, +25 % relative self | Bounded by the caps. Only from Ultra eggs. |

**Guardrail check:**

- No trinket grants freezes, changes the day level, touches the 22:00 close or the Goddamn cap, or involves sleep.
- Heartstone still lets the pet lose its levels and the streak reset. Its charge lives **on the item**, so moving it to another pet does not refresh it.

| Tier | Trinket | Flavour | Effect |
|---|---|---|---|
| Epic | Copper Bell | "Rings when breakfast is ready." | eggMeterPct +8 self |
| Epic | Dog-eared Bookmark | "It remembers where you left off." | xpPct +10 self |
| Epic | Lucky Pebble [luck] | "Smooth from a thousand thumb-rubs." | petEggChancePct +8 self |
| Epic | Coin Purse | "Jingles when it's fed." | dividendPct +15 self |
| Epic | Moss Cloak | "Soft landing." | levelLossShield 1 self |
| Epic | Stitched Patch | "Mended things have more stories." | comebackMult +0.25 self |
| Mythic | Moonstone Egg-cup | "Eggs come quicker under moonlight." | eggMeterPct +15 self |
| Mythic | Fourfold Clover [luck] | "Four leaves. Count them." | petEggChancePct +15 self |
| Mythic | Folding Atlas | "The next page is always somewhere new." | xpPct +20 self |
| Mythic | Treasure Map | "X marks one more item." | extraLootItems +1 self |
| Mythic | Quest Ribbon | "Pinned on for good work." | questCoinPct +15 global |
| Mythic | Return Compass | "Its favourite direction is back." | comebackMult +0.5 self |
| Legendary | Sunforged Crown | "Heavy is the head that pays dividends." | dividendPct +40, shardPct +40 self |
| Legendary | Dragon-glass Prism [luck] | "Bends the odds a little toward rare." | hatchLuckPts +1 team |
| Legendary | Horn of Plenty | "Overflowing." | extraLootItems +2 self |
| Legendary | Aegis Shell | "Guards everyone a little." | levelLossShield 1 team |
| Legendary | Meteor Shard | "Fell from the sky, still warm." | eggMeterPct +25 self |
| Legendary | Oath Ring | "Keep the promise you made this morning." | commitBonusPts +3 global |
| Ultra | Keeper's Crown | "Everything you earn, shinier." | coinPct +25 global, questCoinPct +50 global |
| Ultra | The Long Sun | "A day that never stops giving." | eggMeterPct +50 team |
| Ultra | Heartstone | "It beats for you." | deathSave 1 self (on the item; recharges 30 complete days after use), comebackMult +1 self |
| Ultra | Dawn Oath | "Commit at sunrise; the world pays out." | commitBonusPts +10 global (reaches the cap), streakEggBonus +2 every 7th night |
| Ultra | Star Map [luck] | "Charts where the rare ones hatch." | hatchLuckPts +2 team, petEggChancePct +25 self |

```json
{
  "trinketRules": {
    "minimumPetTier": "epic", "slotsPerPet": 5, "activeWearerOnly": true, "beaconExtends": false,
    "noDuplicatePerPet": true, "maxLuckTaggedPerPet": 1,
    "foodNeedMin": 70, "foodReductionRule": "Lowers only the fed/dividend threshold; XP and egg meter still come only from food beyond 100.",
    "eggSnapshotRule": "Item-count and meter effects are fixed when an egg is laid.",
    "equipSwapRule": "Equipping never retroactively credits food, XP, dividends or laid eggs.",
    "extraLootRule": "Extra items never add a pet-egg or Ultra-trinket roll.",
    "dropSelection": "Uniform over eligible tiers <= egg tier, then uniform within the tier; Ultra eggs' 10% roll picks a uniform Ultra trinket.",
    "NEW": ["noDuplicatePerPet", "maxLuckTaggedPerPet"]
  },
  "prices": { "epic": 150, "mythic": 500, "legendary": 1500 },
  "ultraSale": { "normalAvailability": false, "basePrice": 22000, "discountPct": 30, "salePrice": 15400, "floor": 15000, "windowHours": 24, "offers": "all", "surface": "shopOnly", "copy": "A remarkable find. Available until {dateTime}." },
  "trinkets": [
    { "id": "copperBell", "tier": "epic", "name": "Copper Bell", "flavour": "Rings when breakfast is ready.", "effects": [{ "type": "eggMeterPct", "value": 8, "scope": "self" }] },
    { "id": "dogEaredBookmark", "tier": "epic", "name": "Dog-eared Bookmark", "flavour": "It remembers where you left off.", "effects": [{ "type": "xpPct", "value": 10, "scope": "self" }] },
    { "id": "luckyPebble", "tier": "epic", "name": "Lucky Pebble", "tags": ["luck"], "flavour": "Smooth from a thousand thumb-rubs.", "effects": [{ "type": "petEggChancePct", "value": 8, "scope": "self" }] },
    { "id": "coinPurse", "tier": "epic", "name": "Coin Purse", "flavour": "Jingles when it's fed.", "effects": [{ "type": "dividendPct", "value": 15, "scope": "self" }] },
    { "id": "mossCloak", "tier": "epic", "name": "Moss Cloak", "flavour": "Soft landing.", "effects": [{ "type": "levelLossShield", "value": 1, "scope": "self" }] },
    { "id": "stitchedPatch", "tier": "epic", "name": "Stitched Patch", "flavour": "Mended things have more stories.", "effects": [{ "type": "comebackMult", "value": 0.25, "scope": "self" }] },
    { "id": "moonstoneEggcup", "tier": "mythic", "name": "Moonstone Egg-cup", "flavour": "Eggs come quicker under moonlight.", "effects": [{ "type": "eggMeterPct", "value": 15, "scope": "self" }] },
    { "id": "fourfoldClover", "tier": "mythic", "name": "Fourfold Clover", "tags": ["luck"], "flavour": "Four leaves. Count them.", "effects": [{ "type": "petEggChancePct", "value": 15, "scope": "self" }] },
    { "id": "foldingAtlas", "tier": "mythic", "name": "Folding Atlas", "flavour": "The next page is always somewhere new.", "effects": [{ "type": "xpPct", "value": 20, "scope": "self" }] },
    { "id": "treasureMap", "tier": "mythic", "name": "Treasure Map", "flavour": "X marks one more item.", "effects": [{ "type": "extraLootItems", "value": 1, "scope": "self" }] },
    { "id": "questRibbon", "tier": "mythic", "name": "Quest Ribbon", "flavour": "Pinned on for good work.", "effects": [{ "type": "questCoinPct", "value": 15, "scope": "global" }] },
    { "id": "returnCompass", "tier": "mythic", "name": "Return Compass", "flavour": "Its favourite direction is back.", "effects": [{ "type": "comebackMult", "value": 0.5, "scope": "self" }] },
    { "id": "sunforgedCrown", "tier": "legendary", "name": "Sunforged Crown", "flavour": "Heavy is the head that pays dividends.", "effects": [{ "type": "dividendPct", "value": 40, "scope": "self" }, { "type": "shardPct", "value": 40, "scope": "self" }] },
    { "id": "dragonglassPrism", "tier": "legendary", "name": "Dragon-glass Prism", "tags": ["luck"], "flavour": "Bends the odds a little toward rare.", "effects": [{ "type": "hatchLuckPts", "value": 1, "scope": "team" }] },
    { "id": "hornOfPlenty", "tier": "legendary", "name": "Horn of Plenty", "flavour": "Overflowing.", "effects": [{ "type": "extraLootItems", "value": 2, "scope": "self" }] },
    { "id": "aegisShell", "tier": "legendary", "name": "Aegis Shell", "flavour": "Guards everyone a little.", "effects": [{ "type": "levelLossShield", "value": 1, "scope": "team" }] },
    { "id": "meteorShard", "tier": "legendary", "name": "Meteor Shard", "flavour": "Fell from the sky, still warm.", "effects": [{ "type": "eggMeterPct", "value": 25, "scope": "self" }] },
    { "id": "oathRing", "tier": "legendary", "name": "Oath Ring", "flavour": "Keep the promise you made this morning.", "effects": [{ "type": "commitBonusPts", "value": 3, "scope": "global" }] },
    { "id": "keepersCrown", "tier": "ultra", "name": "Keeper's Crown", "flavour": "Everything you earn, shinier.", "effects": [{ "type": "coinPct", "value": 25, "scope": "global" }, { "type": "questCoinPct", "value": 50, "scope": "global" }] },
    { "id": "theLongSun", "tier": "ultra", "name": "The Long Sun", "flavour": "A day that never stops giving.", "effects": [{ "type": "eggMeterPct", "value": 50, "scope": "team" }] },
    { "id": "heartstone", "tier": "ultra", "name": "Heartstone", "flavour": "It beats for you.", "effects": [{ "type": "deathSave", "value": 1, "scope": "self", "recharge": "30 complete days after use; charge state stored on the trinket, not the pet" }, { "type": "comebackMult", "value": 1, "scope": "self" }] },
    { "id": "dawnOath", "tier": "ultra", "name": "Dawn Oath", "flavour": "Commit at sunrise; the world pays out.", "effects": [{ "type": "commitBonusPts", "value": 10, "scope": "global" }, { "type": "streakEggBonus", "value": 2, "scope": "global", "everyN": 7 }] },
    { "id": "starMap", "tier": "ultra", "name": "Star Map", "tags": ["luck"], "flavour": "Charts where the rare ones hatch.", "effects": [{ "type": "hatchLuckPts", "value": 2, "scope": "team" }, { "type": "petEggChancePct", "value": 25, "scope": "self" }] }
  ]
}
```

---

## E. Real-life rewards

**Pricing basis: about 300 coins ≈ one good day.**

The spec's "200" left out quests, the Keeper road, the season track and milestones. Once they are counted, an all-quests Easy day earns about 295 coins and a Medium day about 360:

| Source | Medium coins/day | Easy coins/day |
|---|---|---|
| Dividends + egg loot (sim) | ≈ 175 | ≈ 145 |
| Quests (3 × ≈ 40 × ≈ 0.85 done) | ≈ 100 | ≈ 100 |
| Season track (1,440 a month at tier 30; ≈ 490 at tier 17) | ≈ 48 | ≈ 16 |
| Milestones (9,800 in year one ÷ 365) | ≈ 27 | ≈ 27 |
| Keeper road | ≈ 13 | ≈ 7 |
| **Total** | **≈ 360** | **≈ 295** |

**This changes the spec's UI copy, so the owner must OK it (section J).** The new copy is: *"About 300 coins ≈ one good day. Rewards add to life; they never gate sleep, meals or friends."*

**Rules**

- Rewards are optional extras. Ordinary rest, meals, friends and leisure are never things to be earned, so no reward is called "guilt-free" and there is no "slow morning" reward.
- Any screen-time reward ends by **21:30**. The gaming hour can be redeemed **at most once a day**.
- A redemption never expires and can be scheduled for any convenient day. It is logged, then marked "taken" when he takes it.
- The purchase itself comes out of his normal real-life budget.
- Redemption copy: "Redeemed. Enjoy it when it fits your day."

| Size | Reward | Coins | ≈ days |
|---|---|---|---|
| S | Dessert run | 450 | 1.5 |
| S | Boba or a good café drink | 600 | 2 |
| S | An hour of games, on purpose (ends by 21:30, 1/day) | 600 | 2 |
| S | A really nice pen | 750 | 2.5 |
| S | Movie or two episodes (ends by 21:30) | 900 | 3 |
| M | Favourite takeout lunch | 1,200 | 4 |
| M | One bookshop pick, fiction welcome | 1,800 | 6 |
| M | Weekend gaming afternoon, 3 h (ends by 21:30) | 2,400 | 8 |
| M | A model-kit afternoon | 2,700 | 9 |
| L | A new indie game (≤ $20) | 3,600 | 12 |
| L | A museum morning | 4,500 | 15 |
| L | A big LEGO build (≤ $60) | 7,500 | 25 |
| L | A day trip somewhere new | 9,000 | 30 |
| L | Concert or game ticket | 12,000 | 40 |

```json
{
  "realLife": {
    "coinsPerGoodDay": 300,
    "guidanceCopy": "About 300 coins ≈ one good day. Rewards add to life; they never gate sleep, meals or friends.",
    "redemptionCopy": "Redeemed. Enjoy it when it fits your day.",
    "rules": { "screenRewardsEndBy": "21:30", "expire": false, "sameDayUseRequired": false, "log": true, "markTaken": true, "gatesBasicNeedsOrRelationships": false, "cashRule": "Purchases use the owner's normal real-life budget." },
    "rewards": [
      { "id": "dessertRun", "name": "Dessert run", "size": "S", "coins": 450 },
      { "id": "cafeDrink", "name": "Boba or a good café drink", "size": "S", "coins": 600 },
      { "id": "gamingHour", "name": "An hour of games, on purpose", "size": "S", "coins": 600, "maxPerDay": 1, "endsBy": "21:30" },
      { "id": "nicePen", "name": "A really nice pen", "size": "S", "coins": 750 },
      { "id": "movieNight", "name": "Movie or two episodes", "size": "S", "coins": 900, "endsBy": "21:30" },
      { "id": "takeoutLunch", "name": "Favourite takeout lunch", "size": "M", "coins": 1200 },
      { "id": "bookshopPick", "name": "One bookshop pick, fiction welcome", "size": "M", "coins": 1800 },
      { "id": "gamingAfternoon", "name": "Weekend gaming afternoon, 3 h", "size": "M", "coins": 2400, "endsBy": "21:30", "weekendOnly": true },
      { "id": "modelKit", "name": "A model-kit afternoon", "size": "M", "coins": 2700 },
      { "id": "indieGame", "name": "A new indie game (≤ $20)", "size": "L", "coins": 3600 },
      { "id": "museumMorning", "name": "A museum morning", "size": "L", "coins": 4500 },
      { "id": "bigLego", "name": "A big LEGO build (≤ $60)", "size": "L", "coins": 7500 },
      { "id": "dayTrip", "name": "A day trip somewhere new", "size": "L", "coins": 9000 },
      { "id": "ticket", "name": "Concert or game ticket", "size": "L", "coins": 12000 }
    ]
  }
}
```

---

## F. Keeper road (levels 1–60)

**Rewards**

- Coins on reaching level K: **20 + 5·K** (Codex's leaner curve), plus **+250 at every multiple of 10** for a milestone spike.
- Level 1 pays its 25 coins immediately.
- Every 5 levels: **10 💎 + 1 backpack space** (spec).
- Totals through level 60: **11,850 coins, 120 💎, +12 backpack spaces** (24 before shop upgrades).
- Keeper XP is final task food: after the commitment bonus and soft cap, counted once. Feeding, treats and pet XP effects never add Keeper XP.

**First unlocks come early** (Claude): a cosmetic at L3, after about 3 Medium days or about 6 Easy days.

**Pace** (cumulative XP; Medium ≈ 864 food a day, Easy ≈ 432)

| Level | XP | Medium | Easy |
|---|---|---|---|
| L3 | 2,750 | 3 d | 6 d |
| L5 | 6,500 | 8 d | 15 d |
| L10 | 20,250 | 23 d | 47 d |
| L25 | 99,000 | 115 d | 229 d |
| L40 | 234,000 | 271 d | 542 d |
| L60 | 501,500 | 580 d | about 3.2 yr |

**Titles:** 1 Apprentice Keeper · 10 Keeper · 20 Senior Keeper · 30 Warden · 40 Grand Warden · 50 Elder Keeper · 60 Head Keeper.

**Special levels**

| Lv | Reward |
|---|---|
| 3 | Cosmetic **Seedling** |
| 5 | Standard 💎 and space, plus cosmetic **Keeper's Cap** |
| 10 | Title "Keeper", +250 coins |
| 15 | Cosmetic **Study Headphones** |
| 20 | Title "Senior Keeper", +250, cosmetic **Little Lantern** |
| 25 | **New species: Bramblekin (hedgehog)** |
| 30 | Title "Warden", +250, cosmetic **Field Pencil** |
| 40 | Title "Grand Warden", +250, cosmetic **Graduation Cap** |
| 45 | Cosmetic **Moss Beret** |
| 50 | Title "Elder Keeper", +250, cosmetic **Orbit Club** |
| 55 | Aura add-on **Comet Trail**: on the focused pet's hops, 5 trailing dots (r 3 → 1) in the tier colour, fading over 0.5 s |
| 60 | Title "Head Keeper", +250, cosmetic **Keeper's Laurel** |

**Road cosmetics** (all at `headTop`, behind `#occlude-front`)

| Cosmetic | Art |
|---|---|
| Seedling | A stem 2 × 10 `#4f9a45` with two leaves 8 × 5 `#7ccf6b`; the leaves sway ±5° with breathing. |
| Keeper's Cap | A soft cap 34 × 14 in oat `#e8dcc4`, a short plum brim `#6b3f7a` 18 × 4 to the front-right, and one square patch 6 × 6 `#c9a2ff` with a dashed stitch. |
| Study Headphones | A band 3 px `#2b2740` over the head, with ear cups 12 × 14 `#6f6585` and `#9fd4ff` cushions at the head sides (drawn over the ears). |
| Little Lantern | A narrow plum headband `#6b3f7a` 3 px, with a round amber lantern charm 7 × 9 `#ffb347` (glow `#ffe08a` 40 %) above the right temple. |
| Field Pencil | A cream headband `#f3e6c8` 4 px, with a short yellow pencil 18 × 4 `#ffd34d` tucked in diagonally (pink eraser `#ff9ecf`, `#e3cf72` wood tip). |
| Graduation Cap | A mortarboard 36 × 8 `#1f1b2e` on a 22 × 8 cap, with a tassel `#ffe08a` that swings ±10° on hops. |
| Moss Beret | A broad sage beret `#9bb58a`, 38 × 15, tilted 12°, with a tiny embroidered fern (`#4f9a45`, 8 px). |
| Orbit Club | A pale lavender beret `#dfccff` with a silver ring pin (r 4 ring, 1.5 px `#cfd3e0`, around a dot `#9fd4ff`). |
| Keeper's Laurel | A low open wreath of 8 broad cream leaves `#f3e6c8` with `#e3cf72` veins, and a plum ribbon `#6b3f7a` at the back. |

Level-up copy: "Keeper {level}. This progress stays."

```json
{
  "keeper": {
    "startLevel": 1, "grantStartLevelReward": true,
    "xpToNext": "1000 + 250 * K", "xpSource": "final task food after commitment bonus and soft cap, credited once",
    "coinsOnReach": "20 + 5 * K", "bonusCoinsEvery10": 250,
    "every5": { "diamonds": 10, "backpack": 1 },
    "titles": { "1": "Apprentice Keeper", "10": "Keeper", "20": "Senior Keeper", "30": "Warden", "40": "Grand Warden", "50": "Elder Keeper", "60": "Head Keeper" },
    "special": [
      { "lv": 3, "cosmetic": "seedling" },
      { "lv": 5, "cosmetic": "keepersCap" },
      { "lv": 15, "cosmetic": "studyHeadphones" },
      { "lv": 20, "cosmetic": "littleLantern" },
      { "lv": 25, "species": "hedgehog" },
      { "lv": 30, "cosmetic": "fieldPencil" },
      { "lv": 40, "cosmetic": "graduationCap" },
      { "lv": 45, "cosmetic": "mossBeret" },
      { "lv": 50, "cosmetic": "orbitClub" },
      { "lv": 55, "auraAddon": "cometTrail" },
      { "lv": 60, "cosmetic": "keepersLaurel" }
    ],
    "roadCosmetics": {
      "seedling": { "colors": ["#4f9a45", "#7ccf6b"], "motion": "leafSway" },
      "keepersCap": { "colors": ["#e8dcc4", "#6b3f7a", "#c9a2ff"] },
      "studyHeadphones": { "colors": ["#2b2740", "#6f6585", "#9fd4ff"] },
      "littleLantern": { "colors": ["#6b3f7a", "#ffb347", "#ffe08a"] },
      "fieldPencil": { "colors": ["#f3e6c8", "#ffd34d", "#ff9ecf", "#e3cf72"] },
      "graduationCap": { "colors": ["#1f1b2e", "#ffe08a"], "motion": "tasselSwing" },
      "mossBeret": { "colors": ["#9bb58a", "#4f9a45"] },
      "orbitClub": { "colors": ["#dfccff", "#cfd3e0", "#9fd4ff"] },
      "keepersLaurel": { "colors": ["#f3e6c8", "#e3cf72", "#6b3f7a"] },
      "cometTrail": { "type": "auraAddon", "dots": 5, "fadeS": 0.5 }
    },
    "totalsThrough60": { "coins": 11850, "diamonds": 120, "backpackSpaces": 12, "speciesUnlocks": 1, "cosmetics": 9 },
    "beyond60": "Coin formula and every-5 rewards continue; no further unlocks.",
    "levelUpCopy": "Keeper {level}. This progress stays."
  }
}
```

---

## G. Daily quest pool (27 quests)

**Purpose:** quests reward doing real tasks well: on time, in order, the avoided task first, honestly committed. They never ask him to change the list, never ask for a Goddamn task, never ask for less sleep, and never reward whichever single task is easiest to inflate.

**Draw** (server-side at 05:00 America/New_York, seeded by account and date, stored; no rerolls)

- **Slot 1, progress:** the shape of the whole day.
- **Slot 2, task:** a specific task or order.
- **Slot 3, care:** pets and eggs, and every care quest also requires ≥ 2 ticked tasks. If no care quest is eligible, slot 3 falls back to another task quest.
- So **every day has at least two task-centred quests.**

**Variety**

- **At most 1 timed quest a day.** Timed quests are cleanSweep, eveningToYourself, halfBy, fourBy, momentum, moveEarly, deepFirst and habitStack.
- No quest repeats within 3 days. Relax this only if too few are eligible.
- Reject identical completion predicates. Exclusive pairs: raiseOne/raiseTwo, frog/frogUp.

**School-aware deadlines:** weekday deadlines are never before 17:00, and no deadline is ever after 20:00.

**Targets** (computed at draw, never from hardcoded task IDs)

- `{frog}`: the non-Sleep task with the latest median tick time over the last 7 days. Shown as a scheduling hint, not as proof of avoidance.
- `{target}`: the non-Sleep task raised least often in the last 14 days. This is the anti-cherry-pick raise.
- `{physical}`, `{outdoors}`, `{longest}` (the minutes task with the largest requirement), `{lastMissed}`, `{pairA}` / `{pairB}`: from task tags.
- A quest is drawn only if the tasks it names exist.

**Eligibility**

- A care quest is drawn only if Chill-level food from today's list, plus food already held, can cover the objective, every active meal and backpack upkeep. The expected commitment bonus is not counted.
- Egg quests need the eggs and food to be owned at draw time.
- Sleep quests only record last night's actual sleep. The raise UI never suggests raising Sleep after an unmet night.

**Completion**

- A tick counts only once it survives the 5-minute undo window.
- Each quest is awarded once per date, automatically, with no claim button. Quests pay coins only, never food.
- If the emergency swap removes a named task, that quest is deterministically replaced by an eligible quest of equal coins.

**Expected value:** about 40 coins per quest. **Weekly chest (spec):** all 3 done = 1 quest star; 5 stars in a Monday–Sunday week = 1 Rare openable egg (streak-type odds) + 3 💎.

| id | Slot | Quest | Coins |
|---|---|---|---|
| wholeList | progress | **The whole list:** finish today's list. | 30 |
| mediumDay | progress | **Medium or more:** finish the list with the day level at Medium or higher. | 50 |
| keepWord | progress | **Keep your word:** finish the list without lowering below your morning commitment. | 40 |
| cleanSweep | progress · timed | **Clean sweep:** finish the list by 18:00. | 50 |
| eveningToYourself | progress · timed | **An evening to yourself:** finish the list by 20:00. | 40 |
| halfBy | progress · timed | **Halfway by five:** finish half the list (rounded up) by 17:00 (weekends 13:00). | 35 |
| fourBy | progress · timed | **Four by six:** tick 4 tasks by 18:00 (weekends 16:00). Needs ≥ 5 tasks. | 40 |
| momentum | progress · timed | **Momentum:** tick 3 tasks within 2 hours. | 40 |
| frog | task | **Eat the frog:** tick {frog} before any other task except Sleep. | 45 |
| frogUp | task | **Frog, raised:** raise {frog} one level above the day level and finish it. | 55 |
| raiseOne | task | **Go one up:** raise {target} one level above the day level and finish it. | 45 |
| raiseTwo | task | **Double up:** raise {target} and {frog} one level each and finish both. | 60 |
| moveEarly | task · timed | **Move first:** tick {physical} by 18:00 (weekends 14:00). | 35 |
| deepFirst | task · timed | **Deep before shallow:** finish {longest} by 19:00 (weekends 15:00). | 40 |
| habitStack | task · timed | **Habit stack:** tick {pairB} within 60 minutes after {pairA}. | 40 |
| lastMissedFirst | task | **Mend the gap:** finish {lastMissed}, the task left unticked on your last incomplete day, before any other task except Sleep. Eligible only within 14 days of a miss. | 40 |
| restRecorded | task | **Rest, recorded:** tick Sleep with last night's actual hours. | 30 |
| goalTag | task | **Receipt with a reason:** tag today's Deep work to one of your goals (private). | 30 |
| feedAll | care | **Everyone at the table:** tick 2 tasks and feed every active pet to 100. | 35 |
| eggDay | care | **Egg day:** tick 2 tasks and make any pet lay an egg. | 45 |
| onTheMend | care | **On the mend:** tick 2 tasks and earn comeback XP on any pet. | 35 |
| fanFavourite | care | **Fan favourite:** tick a task while its patron pet is active, plus 1 more task. | 30 |
| levelUp | care | **Level up:** tick 2 tasks and level up any pet today. | 40 |
| noWaste | care | **Nothing wasted:** finish the list, cover every meal and backpack upkeep, and end with < 30 food unspent. | 35 |
| crackThree | care | **Work, then wonder:** tick 2 tasks and open 3 eggs you already own. | 30 |
| warmHands | care | **Warm hands:** tick 2 tasks and feed 3 servings to the incubator. | 30 |
| hatchDay | care | **Hatch day:** tick 2 tasks and hatch a pet egg. | 50 |

```json
{
  "quests": {
    "perDay": 3, "drawTimeLocal": "05:00", "timezone": "America/New_York", "rng": "seeded(account, date), persisted", "rerolls": 0,
    "slots": [["progress"], ["task"], ["care", "task"]],
    "maxTimedPerDay": 1, "noRepeatDays": 3, "relaxCooldownIfStarved": true,
    "exclusive": [["raiseOne", "raiseTwo"], ["frog", "frogUp"]],
    "deadlines": { "weekdayEarliest": "17:00", "latest": "20:00" },
    "targets": {
      "frog": "non-Sleep task with the latest median tick time over the last 7 days",
      "target": "non-Sleep task raised least often in the last 14 days",
      "longest": "minutes task with the largest requirement",
      "lastMissed": "task unticked on the most recent incomplete day within 14 days",
      "pair": "two distinct non-Sleep tasks, seeded"
    },
    "eligibility": {
      "care": "Chill-level food from today's list + food held >= objective + all active meals + backpack upkeep; exclude expected commitment bonus",
      "eggs": "required eggs/food owned at draw time",
      "namedTasks": "all referenced tasks exist in the locked list"
    },
    "completion": { "tickMustSurviveUndoMin": 5, "awardsPerQuestPerDate": 1, "delivery": "automatic", "grantsFood": false },
    "emergencySwap": "replace an affected quest with an eligible quest of equal coins",
    "forbidden": ["changingTheLockedList", "goddamnTasks", "lessSleep", "purchases", "specificHatchTier", "mergeOutcomes", "streakLength"],
    "pool": [
      { "id": "wholeList", "cat": "progress", "text": "The whole list: finish today's list.", "coins": 30 },
      { "id": "mediumDay", "cat": "progress", "text": "Medium or more: finish the list with the day level at Medium or higher.", "coins": 50 },
      { "id": "keepWord", "cat": "progress", "text": "Keep your word: finish the list without lowering below your morning commitment.", "coins": 40 },
      { "id": "cleanSweep", "cat": "progress", "timed": true, "text": "Clean sweep: finish the list by 18:00.", "deadline": "18:00", "coins": 50 },
      { "id": "eveningToYourself", "cat": "progress", "timed": true, "text": "An evening to yourself: finish the list by 20:00.", "deadline": "20:00", "coins": 40 },
      { "id": "halfBy", "cat": "progress", "timed": true, "text": "Halfway by five: finish half the list (rounded up) by {deadline}.", "deadline": { "weekday": "17:00", "weekend": "13:00" }, "coins": 35 },
      { "id": "fourBy", "cat": "progress", "timed": true, "text": "Four by {deadline}: tick 4 tasks.", "deadline": { "weekday": "18:00", "weekend": "16:00" }, "elig": "taskCount >= 5", "coins": 40 },
      { "id": "momentum", "cat": "progress", "timed": true, "text": "Momentum: tick 3 tasks within 2 hours.", "windowMin": 120, "coins": 40 },
      { "id": "frog", "cat": "task", "text": "Eat the frog: tick {frog} before any other task except Sleep.", "elig": "frogDefined", "coins": 45 },
      { "id": "frogUp", "cat": "task", "text": "Frog, raised: raise {frog} one level above the day level and finish it.", "elig": "frogDefined && dayLevel != hard", "coins": 55 },
      { "id": "raiseOne", "cat": "task", "text": "Go one up: raise {target} one level above the day level and finish it.", "elig": "dayLevel != hard", "coins": 45 },
      { "id": "raiseTwo", "cat": "task", "text": "Double up: raise {target} and {frog} one level each and finish both.", "elig": "frogDefined && target != frog && dayLevel != hard", "coins": 60 },
      { "id": "moveEarly", "cat": "task", "timed": true, "text": "Move first: tick {physical} by {deadline}.", "deadline": { "weekday": "18:00", "weekend": "14:00" }, "elig": "hasPhysicalTask", "coins": 35 },
      { "id": "deepFirst", "cat": "task", "timed": true, "text": "Deep before shallow: finish {longest} by {deadline}.", "deadline": { "weekday": "19:00", "weekend": "15:00" }, "elig": "hasMinutesTask", "coins": 40 },
      { "id": "habitStack", "cat": "task", "timed": true, "text": "Habit stack: tick {pairB} within 60 minutes after {pairA}.", "windowMin": 60, "coins": 40 },
      { "id": "lastMissedFirst", "cat": "task", "text": "Mend the gap: finish {lastMissed} before any other task except Sleep.", "elig": "missWithin14Days", "coins": 40 },
      { "id": "restRecorded", "cat": "task", "text": "Rest, recorded: tick Sleep with last night's actual hours.", "elig": "hasSleepTask", "coins": 30 },
      { "id": "goalTag", "cat": "task", "text": "Receipt with a reason: tag today's Deep work to one of your goals.", "elig": "hasDeepWorkTask", "private": true, "coins": 30 },
      { "id": "feedAll", "cat": "care", "text": "Everyone at the table: tick 2 tasks and feed every active pet to 100.", "minTicks": 2, "coins": 35 },
      { "id": "eggDay", "cat": "care", "text": "Egg day: tick 2 tasks and make any pet lay an egg.", "minTicks": 2, "elig": "someMeterFillableWithChillSurplus", "coins": 45 },
      { "id": "onTheMend", "cat": "care", "text": "On the mend: tick 2 tasks and earn comeback XP on any pet.", "minTicks": 2, "elig": "comebackOwed", "coins": 35 },
      { "id": "fanFavourite", "cat": "care", "text": "Fan favourite: tick a task while its patron pet is active, plus 1 more task.", "minTicks": 2, "elig": "activePatronMatch", "coins": 30 },
      { "id": "levelUp", "cat": "care", "text": "Level up: tick 2 tasks and level up any pet today.", "minTicks": 2, "elig": "levelUpReachableWithChillSurplus", "coins": 40 },
      { "id": "noWaste", "cat": "care", "text": "Nothing wasted: finish the list, cover every meal and backpack upkeep, and end with under 30 food unspent.", "requiresCompleteDay": true, "coins": 35 },
      { "id": "crackThree", "cat": "care", "text": "Work, then wonder: tick 2 tasks and open 3 eggs you already own.", "minTicks": 2, "elig": "openableEggsOwned >= 3", "coins": 30 },
      { "id": "warmHands", "cat": "care", "text": "Warm hands: tick 2 tasks and feed 3 servings to the incubator.", "minTicks": 2, "elig": "incubatingEgg && eggFoodOwned >= 3", "coins": 30 },
      { "id": "hatchDay", "cat": "care", "text": "Hatch day: tick 2 tasks and hatch a pet egg.", "minTicks": 2, "elig": "canCompleteHatchWithOwnedFood", "coins": 50 }
    ],
    "weeklyChest": { "starPerAllThreeDone": 1, "starsRequired": 5, "week": "Mon 05:00 – next Mon 04:59:59", "reward": { "openableEgg": { "tier": "rare", "count": 1, "odds": "streak" }, "diamonds": 3 }, "copy": "Five good quest days. Your weekly chest is ready." }
  }
}
```

---

## H. Milestones and the season track

### H.1 Milestones

- Each milestone pays **once per account**. Badges stay after a streak breaks, and rebuilding a streak never pays again.
- Freezes hold a streak without advancing it.
- Size: between the two proposals. They are large enough to celebrate. Year-one income is 9,800 coins and 140 💎. Coins fund at most a few freezes, and the cap of 3 still holds.
- Celebration copy: "{days} days. Look what you kept showing up for."

| Days | Badge | Coins | 💎 |
|---|---|---|---|
| 7 | First Footprints | 300 | 0 |
| 30 | Moon Cycle | 600 | 0 |
| 50 | Staying Power | 900 | 0 |
| 100 | Centurion | 1,500 | 20 |
| 200 | Deep Roots | 2,500 | 40 |
| 365 | One Full Orbit | 4,000 | 80 |
| 500 | The Long Game | 5,000 | 100 |
| 1000 | Thousand-Day Keeper | 10,000 | 250 |

### H.2 Season track

**Basics**

- 30 tiers × 750 XP (22,500 XP). The first season is **November 2026**; there is no season during the 2026-10-25 → 10-31 prologue.
- Season XP is final task food this month, after the commitment bonus and soft cap. Pet XP effects never apply.
- Rewards arrive automatically and stay owned. Unreached tiers expire at month end, after the last day closes.
- Medium (≈ 864 food a day) finishes in about 26 days. Easy (≈ 432) reaches about tier 17.
- Season eggs all use streak-type odds (90 % same tier / 10 % +1).

**The balance decision: the tier-20 charm.** Both designers' sims found that an unrestricted tier charm every month raises Medium-day Mythic in year one from **about 32 % to about 58–62 %**. Medium + Hard weekends breaks the ~1 % Ultra target. Claude's later finding: the 60 💎 shop charm alone, bought early, does the same (Medium about 61 %). So the fix covers both sources:

- **NEW item: Sprout charm.** It works exactly like a tier charm (at most one per egg, 20 % chance of +1 after the main roll, +50 % servings), but **only on Ordinary, Rare and Super Rare pet eggs**.
  - Season tier 20 pays a Sprout charm.
  - **The shop's 60 💎 tier charm becomes a Sprout charm.**
  - Full tier charms (any tier) come **only** from Epic+ egg loot (the 3 % weight), as the baseline sim already models.
- The season eggs at tiers 5, 10, 15 and 25 are all **Rare**. Super Rare at tier 25 was the next dial, so the stricter option was taken.

**Estimate:**

- Claude's runs with a season Sprout charm (Ordinary/Rare only) gave Medium Mythic 39 % ± 4 and 41 % with realistic A–D content. Ultra was 0.2–0.8 %; with 500 runs the 95 % interval is about 0.3–2 %.
- Restricting the shop charm removes the 61 % early-buying case. Using Rare instead of Super Rare at tier 25 trims a little more.
- **Expected: Medium Mythic about 35–42 %, Medium + Hard weekends about 48–55 %, Ultra ≤ about 1 % at Medium.** This must be re-validated on the engine port with ≥ 5,000 runs (section J).

**Rewards per month:** 1,440 coins, 15 💎, 4 Rare eggs, 1 Sprout charm, 1 cosmetic, 6 Ordinary + 7 Rare + 8 Super Rare + 1 Epic egg food.

| Tier | Reward | Tier | Reward | Tier | Reward |
|---|---|---|---|---|---|
| 1 | 40 coins | 11 | 80 coins | 21 | 120 coins |
| 2 | 2 Ordinary egg food | 12 | 2 Rare egg food | 22 | 1 Super Rare egg food |
| 3 | 50 coins | 13 | 90 coins | 23 | 130 coins |
| 4 | 1 Rare egg food | 14 | 1 Super Rare egg food | 24 | 2 Super Rare egg food |
| 5 | Rare egg | 15 | Rare egg | 25 | Rare egg |
| 6 | 60 coins | 16 | 100 coins | 26 | 140 coins |
| 7 | 2 Rare egg food | 17 | 2 Rare egg food | 27 | 2 Super Rare egg food |
| 8 | 70 coins | 18 | 110 coins | 28 | 150 coins |
| 9 | 4 Ordinary egg food | 19 | 2 Super Rare egg food | 29 | 1 Epic egg food |
| 10 | Rare egg + 5 💎 | 20 | **Sprout charm + 5 💎** | 30 | **Season cosmetic + 5 💎 + 300 coins** |

```json
{
  "milestones": {
    "measure": "current complete-day streak; frozen days hold without advancing",
    "payout": "oncePerAccount", "badgesPersistAfterLoss": true,
    "celebrationCopy": "{days} days. Look what you kept showing up for.",
    "rows": [
      { "days": 7, "badgeId": "firstFootprints", "badge": "First Footprints", "coins": 300, "diamonds": 0 },
      { "days": 30, "badgeId": "moonCycle", "badge": "Moon Cycle", "coins": 600, "diamonds": 0 },
      { "days": 50, "badgeId": "stayingPower", "badge": "Staying Power", "coins": 900, "diamonds": 0 },
      { "days": 100, "badgeId": "centurion", "badge": "Centurion", "coins": 1500, "diamonds": 20 },
      { "days": 200, "badgeId": "deepRoots", "badge": "Deep Roots", "coins": 2500, "diamonds": 40 },
      { "days": 365, "badgeId": "oneFullOrbit", "badge": "One Full Orbit", "coins": 4000, "diamonds": 80 },
      { "days": 500, "badgeId": "theLongGame", "badge": "The Long Game", "coins": 5000, "diamonds": 100 },
      { "days": 1000, "badgeId": "thousandDayKeeper", "badge": "Thousand-Day Keeper", "coins": 10000, "diamonds": 250 }
    ]
  },
  "charms": {
    "sproutCharm": { "NEW": true, "as": "tierCharm", "allowedPetEggTiers": ["ordinary", "rare", "superRare"], "sources": ["seasonTier20", "shop"], "shopPriceDiamonds": 60 },
    "tierCharm": { "allowedPetEggTiers": "all", "sources": ["epicPlusEggLoot"], "shop": false }
  },
  "season": {
    "firstMonth": "2026-11", "tiers": 30, "xpPerTier": 750, "totalXp": 22500,
    "xpSource": "final task food this local month after commitment bonus and soft cap", "petXpEffectsApply": false,
    "paidTrack": false, "delivery": "automatic", "monthBoundary": "close the final day, award tiers, then reset", "unreachedTiers": "expire",
    "eggOdds": "streak",
    "track": [
      { "tier": 1, "coins": 40 }, { "tier": 2, "eggFood": { "ordinary": 2 } }, { "tier": 3, "coins": 50 },
      { "tier": 4, "eggFood": { "rare": 1 } }, { "tier": 5, "openableEgg": "rare" }, { "tier": 6, "coins": 60 },
      { "tier": 7, "eggFood": { "rare": 2 } }, { "tier": 8, "coins": 70 }, { "tier": 9, "eggFood": { "ordinary": 4 } },
      { "tier": 10, "openableEgg": "rare", "diamonds": 5 }, { "tier": 11, "coins": 80 }, { "tier": 12, "eggFood": { "rare": 2 } },
      { "tier": 13, "coins": 90 }, { "tier": 14, "eggFood": { "superRare": 1 } }, { "tier": 15, "openableEgg": "rare" },
      { "tier": 16, "coins": 100 }, { "tier": 17, "eggFood": { "rare": 2 } }, { "tier": 18, "coins": 110 },
      { "tier": 19, "eggFood": { "superRare": 2 } }, { "tier": 20, "item": "sproutCharm", "diamonds": 5 }, { "tier": 21, "coins": 120 },
      { "tier": 22, "eggFood": { "superRare": 1 } }, { "tier": 23, "coins": 130 }, { "tier": 24, "eggFood": { "superRare": 2 } },
      { "tier": 25, "openableEgg": "rare" }, { "tier": 26, "coins": 140 }, { "tier": 27, "eggFood": { "superRare": 2 } },
      { "tier": 28, "coins": 150 }, { "tier": 29, "eggFood": { "epic": 1 } }, { "tier": 30, "cosmetic": "seasonCosmetic", "diamonds": 5, "coins": 300 }
    ],
    "totals": { "coins": 1440, "diamonds": 15, "rareEggs": 4, "sproutCharms": 1, "cosmetics": 1, "eggFood": { "ordinary": 6, "rare": 7, "superRare": 8, "epic": 1 } },
    "completeCopy": "Season complete. Your little world grew with you."
  },
  "balanceEstimateYearOne": {
    "status": "estimate; re-validate on the engine port with >= 5000 runs per player type",
    "mediumMythicPct": [35, 42], "mediumHardWeekendsMythicPct": [48, 55], "mediumUltraPct": "<= ~1", "hardEveryDayUltraPct": "~3-5",
    "nextDialIfHigh": "move the season Sprout charm from tier 20 to tier 25 and the tier-15 egg to tier 18"
  }
}
```

---

## I. Task-first engagement loop

Eight behaviours make ticking a task the best moment on the page. **None grants coins, diamonds, food, Keeper XP or season XP.**

1. **Today owns the screen; ring and flame.** *Must-have.*
   - The first viewport holds:
     - A compact factual pet-status line.
     - The **today ring**: one equal segment per task, each filled in the colour of the level it was ticked at.
     - The **streak flame** inside the ring.
     - The day-level picker, then the list.
   - Heading: "A little progress, every day."
   - When the last segment closes, the flame lights with "Done · +1 earned": the reward is paid at the last tick.
   - From 19:00 on an unfinished day, the flame flickers amber with "2 left · 2h 14m". Nothing changes after 21:30.
   - Touch targets are ≥ 44 px; the tick is 56 px.
2. **Receipt, then reward.** *Must-have.*
   - On a server-confirmed tick, the real action shows first ("Read · 23 pages").
   - Then food orbs fly in an arc from the row into the pool counter, which rolls up ("+120 food"). Orbs scale with the food earned: Chill 3 · Easy 4 · Medium 6 · Hard 9 · Goddamn 14.
   - The check pops (scale 1 → 1.25 → 1) and the row flashes the colour of its level chip.
   - The 5-minute undo shows as a shrinking ring on the tick. An optional 10 ms vibration. Sound is off by default.
   - Under reduced motion, the receipt and pool update instantly.
3. **A companion notices.** *Must-have.*
   - One owner-chosen companion (200 px) sits beside the pool.
   - On a confirmed tick it plays the tick cheer, and every active **patron** pet for that task cheers too. They do not eat: feeding stays manual.
   - Distress comes only from processed misses (section A). There are no pre-tick hunger bubbles.
4. **Raise preview.** *Must-have.*
   - The Raise control shows only higher eligible levels. Before he confirms, it shows:
     - the requirement change ("Read: 45 → 75 pages");
     - the food change and the projected daily total, with the soft-cap line;
     - a pet outcome computed client-side, for display only ("→ Ember reaches Lv 15 if fed tonight").
   - It never preselects a raise and never suggests raising Sleep after a short night.
5. **Dinner, then growth.** *Must-have.*
   - Two buttons: **Feed to dinner** and **Feed surplus**, each with an exact preview ("{meal} to dinner · {growth} growth food → +{xp} XP · +{meter} egg meter").
   - Backpack upkeep shows as reserved until he chooses to spend it. Nothing is redistributed silently.
6. **A real finish.** *Must-have.*
   - The last tick closes the ring and opens one inline recap. The celebration is **the same at Chill as at Hard**. The full list is the win; per-tick orbs already reward effort.
   - Heading: "Today's list: complete."
   - Real receipts: "Today added 23 pages, 40 minutes outside and 95 minutes of focused work."
   - What was just earned: the new streak, the streak eggs (count and tier, with a link to open them) and the commitment bonus, then quest stars.
   - Then the **Feed dinner** button.
   - Then "You're done for today. Enjoy your evening."
   - A Goddamn day changes nothing here; the Ultra sale appears only in the shop.
7. **Morning receipt and unboxing.** *Must-have.*
   - The first visit after 05:00 shows one dismissible card:
     - "Yesterday counted." (or "A new day is open.")
     - Tasks done, food earned, levels gained, how the streak moved.
   - Last night's eggs wait as a stack with a Brawl Stars-style one-by-one reveal. It is **one tap away and never blocks the list**.
   - Today's 3 quests flip over inline in the quest panel.
   - The day-level picker shows "Commit to {level}" before the first tick.
   - Opening the card grants nothing; the completion reward was delivered at the last tick, the rest at close.
8. **Goals beside the tasks.** Purpose lines are *must-have*; the ledger can follow.
   - Each task carries a quiet purpose line:
     - Sleep: "Protect tomorrow's focus."
     - Touch grass: "Make room to think."
     - Read: "Build range."
     - Eat vegetables: "Take care of the engine."
     - Work out: "Build strength steadily."
     - Deep work: "Move one important thing forward."
   - Deep work can be tagged ILO / Coursework / ML research / College applications / Other.
   - A **private** goal ledger counts tagged time ("ILO · 3.5 h this week"). It never invents a percentage toward a win or an admission, and it is never public unless he publishes it.

```json
{
  "engagement": {
    "additionalEconomy": { "coins": 0, "diamonds": 0, "petFood": 0, "keeperXp": 0, "seasonXp": 0 },
    "behaviours": [
      { "id": "todayRingFlame", "mustHave": true, "firstViewport": ["petStatusLine", "todayRing", "streakFlame", "dayPicker", "list"], "heading": "A little progress, every day.", "ringSegment": "equal per task, filled in ticked-level colour", "litCopy": "Done · +1 earned", "atRiskFrom": "19:00", "atRiskCopy": "{left} left · {timeLeft}", "noChangesAfter": "21:30", "touchTargetPx": 44, "tickTargetPx": 56 },
      { "id": "receiptThenReward", "mustHave": true, "receiptFirst": true, "receiptExample": "Read · 23 pages", "rewardExample": "+120 food", "orbsByLevel": { "chill": 3, "easy": 4, "medium": 6, "hard": 9, "goddamn": 14 }, "animationMs": 650, "undoRingMin": 5, "vibrateMs": 10, "soundDefault": false, "reducedMotion": "instant", "failureCopy": "That tick didn't save. Try again." },
      { "id": "companionNotices", "mustHave": true, "companionPx": 200, "reaction": "tickCheer", "patronCheer": true, "eatsOnTick": false, "preTickHungerBubbles": false, "queueLimit": 1 },
      { "id": "raisePreview", "mustHave": true, "shows": ["requirementChange", "foodChange", "projectedDailyTotal", "softCapLine", "petOutcome"], "clientSideOnly": true, "preselect": false, "suggestSleepRaiseAfterShortNight": false },
      { "id": "dinnerThenGrowth", "mustHave": true, "buttons": ["Feed to dinner", "Feed surplus"], "previewCopy": "{meal} to dinner · {growth} growth food → +{xp} XP · +{meter} egg meter", "upkeepReservedVisible": true, "silentRedistribution": false },
      { "id": "realFinish", "mustHave": true, "sameCelebrationAllLevels": true, "durationMs": 900, "heading": "Today's list: complete.", "receiptCopy": "Today added {pages} pages, {outsideMinutes} minutes outside and {deepMinutes} minutes of focused work.", "preview": ["streakEggs", "commitmentBonus", "questStars"], "cta": "Feed dinner", "finishedCopy": "You're done for today. Enjoy your evening.", "ultraSaleAnnounced": false },
      { "id": "morningReceipt", "mustHave": true, "showsAfter": "05:00", "headings": { "complete": "Yesterday counted.", "incomplete": "A new day is open." }, "eggUnbox": "oneByOne", "blocksList": false, "questCardFlip": true, "commitButton": "Commit to {level}", "grantsOnOpen": false },
      { "id": "goalsBesideTasks", "mustHave": true, "ledgerMustHave": false,
        "purposeLines": { "sleep": "Protect tomorrow's focus.", "outdoors": "Make room to think.", "read": "Build range.", "veg": "Take care of the engine.", "workout": "Build strength steadily.", "deep": "Move one important thing forward." },
        "deepWorkTags": ["ILO", "Coursework", "ML research", "College applications", "Other"],
        "ledgerCopy": "{goal} · {hours} h this week", "inventPercentages": false, "public": false }
    ]
  }
}
```

---

## J. Panel notes

**The most important decisions, and where each came from**

1. **Per-species skills, shared stars** (Claude; Codex conceded in critique). The species decides what a pet *does*; stars are the same merge payoff for everyone.
2. **No `nextPetEggTierUp` anywhere** (Codex's numbers, stricter option). The 4★ placeholder became Golden Touch, an economic star.
3. **5★ Nine Lives: one charge per lineage, survives at level 1** (Codex). Heartstone's charge lives on the trinket (Claude's critique of its own design).
4. **Missed days still sting** (both critiques). Shields start at L40 and prevent at most 1 level per pet per event. Comeback is capped at 3×. Skills switch off below their unlock level (Codex).
5. **Tier charms restricted** (Claude's sim, which Codex confirmed independently). The season charm and the shop charm become a **Sprout charm**, usable on Ordinary–Super Rare eggs only. All season eggs are Rare.
6. **Launch prologue Oct 25–31; first season November** (Codex).
7. **The task-first screen** (Codex's layout plus Claude's ring, flame and unboxing):
   - receipt-then-reward ticks;
   - no pre-tick hunger nagging;
   - no eating on ticks;
   - the same finish celebration at every level;
   - the unboxing never blocks the list.
8. **Quests target behaviour, not inflation.** Claude contributed the frog task. Codex contributed the safety rules: undo window, care eligibility, 1 timed quest a day, no Goddamn quest. Raise quests target the *least-raised* task, so they fight cherry-picking.
9. **Art system** (Claude's geometry, hex and SVG groups, with Codex's rules): tier items replace rather than pile up; the `headTop` socket is reserved for one account-wide cosmetic; display sizes are defined; only the focused pet animates its aura. One extra species: Bramblekin at Keeper 25 (Codex).
10. **Goal links stay private by default** (Codex). /daily/ is public.

**Left open for the owner (needs an OK before build)**

- **Spec changes for balance:**
  - The Sprout charm replaces the season tier-20 tier charm *and* the shop's 60 💎 tier charm (spec §8, §12, §13).
  - If the owner wants full charms in the shop, the alternative is a shop price of about 400 💎.
- **The UI copy changes from "200" to "about 300 coins ≈ one good day"** (spec §12), and rewards are priced on 300.
- **The 4★ tier-up placeholder is dropped.** If the owner wants it back, the safest form is `nextPetEggTierUp` with `maxTier: "epic"` and a 60-day recharge (estimated at about +1 pt Mythic). It is not in this design.
- **New engine rules:**
  - shield cap of 1 level per pet per event;
  - pet-egg chance cap +50 per pet;
  - team hatch-luck cap +3;
  - global effects from the same skill don't stack;
  - no duplicate trinkets on one pet;
  - at most one luck trinket per pet.
- **Balance is not certified.** The figures in H are estimates from runs of a simulator that left out several systems, with ±4–5 pt noise at 300–500 runs. Port the sim to the engine with the full content (season, chest, milestones, Keeper road, shop charm policy, skills, stars, trinkets) and run ≥ 5,000 runs per player type before launch numbers are final. If Medium Mythic comes out above about 42 %, turn the dial in H.
- **Bramblekin's patron is the frog task.** If the owner would prefer it to be the patron of Deep work, move `focus` from the owl to the hedgehog.
