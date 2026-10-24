// SPECIES MODULE CONTRACT (copy this file to species/<id>.js; see species/slime.js for a full example).
//
// pets/index.js imports `./species/<id>.js` for every id in SPECIES and validates it with
// validateSpecies(). A module that is missing or invalid renders as the slime with a "TODO <id>"
// marker (and shows as FALLBACK in pets/gallery.html), so build, test, then check the gallery.
//
// ─── What a species exports (default export, plain object) ──────────────────────────────────────
//
//   id          'dragon' | 'fox' | 'slime' | 'owl' | 'turtle' | 'axolotl' | 'hedgehog'  (must match the file name)
//   name        display line name from CONTENT.md §A.2 ('Drakelet', 'Kitsu', 'Gumdrop', 'Hootling',
//               'Pebbleback', 'Ripplegill', 'Bramblekin') — must equal SPECIES[].name in index.js
//   anchors     { headTop, brow, neck?, chest?, back?, hand?, tailTip?, mouth?, accScale }
//               [x, y] in viewBox units (160 × 160, ground y 148, centre x 80) from CONTENT.md §A.2.
//               headTop is ONLY for the equipped cosmetic (the rig places it there, scaled by accScale).
//               `mouth` is a rig extension: where the eat orb lands and crumbs fall (default brow.y + 30).
//   auraCenter  optional [x, y]: centre of the tier aura and the level-up ring (default [80, 92]).
//   sparkles    optional [[x, y], [x, y]]: where the two Rare aura sparkles twinkle (default: aura centre
//               + (−46, −40) and (+47, −22)). Set it when wide head parts (gills, spines) would hide them.
//   idleClass   'pet-idle--<id>'. The rig puts it on the .pet-idle wrapper; your pets.css block animates it.
//   draw(ctx)   → { [group]: markup string } for any of the species groups below. Pure, no DOM.
//   silhouette() → markup of filled-shape elements (<path>/<ellipse>, NO fill/stroke attributes) for
//               the healthy pose in the 160 box. Used by the gravestone carving, the ashes medallion and
//               smoke wisp, and Petdex silhouettes (the caller sets fill).
//
// ─── Groups (back to front) ─────────────────────────────────────────────────────────────────────
//
//   The rig owns:   shadow, cosmetic, fx (hearts, growl squiggle, level-up ring/pill/sparkles, food orb,
//                   crumbs, hop trail) and the shared tier aura (added to aura-back / aura-front for you).
//   You may return: aura-back, tail, wing-back, body, legs, belly, markings, arms, acc-body,
//                   head, ears, face, acc-brow, occlude-front, aura-front, and extra 'fx' markup.
//   Each becomes <g class="g-<name>">…</g> in this order (CONTENT.md §A.1 "Required SVG groups"):
//     g-shadow · g-aura-back · [.pet-float > .pet-act > .pet-mood > .pet-idle >
//       g-tail · g-wing-back · [.pet-breathe: g-body g-legs g-belly g-markings g-arms g-acc-body] ·
//       [.pet-headrig: g-head g-ears g-face g-acc-brow g-cosmetic g-occlude-front]] · g-aura-front · g-fx
//   So: body parts breathe (scaleY from the ground); head parts bob and drop 3 px when hungry.
//   occlude-front holds what sits IN FRONT of a hat (horns, ear tips, tufts, fronds, spine tips).
//
// ─── ctx (read-only, from rig.makeContext) ─────────────────────────────────────────────────────────
//
//   ctx.tier     0–6 (Ordinary … Ultra)          ctx.palette  { body, shade, belly, accent, key, name, trim?, flame?, iridescent? }
//   ctx.mood     'healthy'|'happy'|'hungry'|'starving'   (dead/ashes never reach draw)
//   ctx.size     200 | 128 | 72                  ctx.thumb    true at ≤ 72 px: skip strokes < 2 px in markings
//                                                              (or give them class "thin"; CSS hides them)
//   ctx.focus    focused pet (CSS uses .pet--focus; you rarely need it)
//   ctx.stars    1–5 (5★ rim light is applied by the rig; do nothing)
//   ctx.defOnce(key, (fullId) => '<linearGradient id="${fullId}">…') → fullId
//                EVERY gradient/clipPath/filter id must come from here (ids are unique per render).
//                Never write a literal id="…" yourself.
//
// ─── Rules that are easy to get wrong ──────────────────────────────────────────────────────────────
//
//   • Style: 4 px #1a1530 outline, round joins/caps (rig `ol()`), flat cel shading: base fill, one
//     lower-right shade (rig `cel()` does it with shadeOffset), one belly/face light, white specular
//     dot r 4 at the head's top-left (rig `specular()`). Smooth cubic Béziers, chibi proportions.
//   • Face: call rig `face(ctx, { eyes: [[x,y],[x,y]], mouth: [x,y], eyeSize?, mouthWidth?, parts?, extra? })`.
//     It renders the current mood (.eyes-open/.eyes-happy/.eyes-half/.eyes-hollow, .mouth-smile/-open/-wavy/-o,
//     .tear, blush, brows) plus the hidden happy copy used by triggered animations. Override a single part
//     with parts: { 'mouth-open': (ctx, o) => markup } but keep the class name on the outer <g>.
//   • Mood poses are static geometry in draw() (ears/fins/gills/tail droop by mood as CONTENT.md says).
//     The rig/CSS add: hungry head +3 px and slow breath; starving slump (scaleY .94; set
//     `.pet--<id> { --slump: 1 }` in your CSS block if your geometry already slumps), desaturate filter, shiver, tear.
//   • Tier items (CONTENT.md §A.2 table): each tier REPLACES the previous tier's markings/accessory;
//     at most one body accessory + one brow item; never use headTop. Shared helpers: glow() for the Epic
//     glow, flame() for Legendary flame tips, trim() for the Legendary 1.5 px #ffe08a top-arc trim,
//     prismOverlay() inside a clip for the Ultra iridescence, star4() for specks. Ultra star eye
//     highlights, Ultra float/shadow and every tier aura come from the rig.
//   • Motion lives in pets.css, in YOUR marked block only (/* ===== species: <id> ===== */):
//       .pet--focus .pet-idle--<id> { animation: <id>-idle var(--idle-every) ease-in-out var(--idle-delay) infinite; }
//       .pet--cheer .pet-idle--<id> { animation: <id>-idle 10s ease-in-out 0s 1 both; }
//       @keyframes <id>-idle { 0% {…} … 10%, 100% { transform: none; } }   ← whole flourish inside 0–10 %
//     Animate sub-parts with your own classes (prefix <id>-), only under .pet--focus or a trigger class.
//     Eating: override `.pet--<id>.pet--eat .pet-act` (default = 2 chomps) and/or animate parts during .pet--eat.
//     Use transform-origin in px (view-box units). Never animate under .pet--thumb.
//   • No DOM, no Date, no randomness (the rig randomises timing per pet through CSS variables).
//
// ─── Skeleton ─────────────────────────────────────────────────────────────────────────────────────

import { cel, face, specular, ol, f } from '../rig.js';

export default {
  id: 'template', // ← your species id
  name: 'Template', // ← CONTENT.md line name
  anchors: { headTop: [80, 34], brow: [80, 50], neck: [80, 92], chest: [80, 104], mouth: [80, 86], accScale: 1 },
  auraCenter: [80, 92],
  idleClass: 'pet-idle--template',

  draw(ctx) {
    const p = ctx.palette;
    const bodyD = 'M50 140C46 112 58 92 80 92C102 92 114 112 110 140C110 147 50 147 50 140Z';
    const headD = 'M46 66C46 44 62 34 80 34C98 34 114 44 114 66C114 86 98 96 80 96C62 96 46 86 46 66Z';
    return {
      body: cel(ctx, 'body', bodyD, { fill: p.body, shade: p.shade }),
      belly: `<ellipse cx="80" cy="122" rx="16" ry="14" fill="${p.belly}"/>`,
      head: cel(ctx, 'head', headD, { fill: p.body, shade: p.shade }) + specular(60, 48),
      face: face(ctx, { eyes: [[67, 70], [93, 70]], mouth: [80, 84] }),
      markings: ctx.tier >= 1 ? `<path d="M64 120h32" fill="none" stroke="${p.accent}" stroke-width="3" stroke-linecap="round"/>` : '',
    };
  },

  silhouette() {
    return '<path d="M50 140C46 112 58 92 80 92C102 92 114 112 110 140C110 147 50 147 50 140Z"/><ellipse cx="80" cy="65" rx="34" ry="31"/>';
  },
};

// Unused-import guard for linters that copy this file verbatim.
export const _helpers = { ol, f };
