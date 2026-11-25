# Site design: night instrument

The inner pages are the same world as the homepage: the engraved brass instrument in a room at night, then out among the stars. They read like a well-set paper trail on a night sky, not like a dashboard. `public/portfolio.css` defines the system; `site/ornament.mjs` draws its ornaments (the orrery, the sky in the margins, the page scale and the margin notes).

## Status: one page first

The system is opt-in while it is judged. A page wears it with `<html data-look="instrument">`, which `frame()` in `site/pages.mjs` writes when it is given `look: 'instrument'`. Today that is `/research/` only. Every other page still wears the older "night and ink" look (the `:root` tokens and unscoped rules in `portfolio.css`, burnt-orange accent, TT Neoris headings) until it is moved over. When every page is moved, the `instrument` tokens become `:root`, the Colophon swatches and the share cards (`npm run og`) are redrawn, and the legacy rules go.

Owner review of `/research/` (November 2026): keep the timeline, the numbered sections, the orrery, the graduated rules and the palette; the italic serif read as too fancy (now one plain sans), and the sides were too plain (now the margins carry the sky, the page scale and drawn notes).

## Tokens (`html[data-look="instrument"]`)

```
                 night (default)   chart paper (+ data-theme="paper")
--sky-top        #0c0b19           -
--sky-bottom     #18153f           -
--paper          #0e0d1f           #f3f1e9     page base
--card           #14132c           #fbfaf6     the publication plate, the menu panel
--inset          #09081a           #eae7dc     code and BibTeX
--ink            #ece9e1           #16142a     text
--muted          #b6b2c8           #48455d     secondary text, ledes
--faint          #938fad           #5d5a72     labels and numerals only
--line           #29264a           #d6d1c2     hairlines, minor ticks
--line-strong    #46426e           #b3ad9c     major ticks, the orrery rings
--accent         #39f0a6           #086b4c     aurora: links, focus, the current section
--violet         #7a4dff           #5a3fd0     quiet secondary: tilted rings, text selection
--amber          #ffb469           #9a5208     the orrery's sun; nothing else

The margins' sky (night only; chart paper does not draw it):
--milkyway       rgb(122 77 255 / .07)        the band's haze, violet
--milkyway-edge  rgb(58 48 168 / .045)        its indigo edge
--milkyway-core  rgb(196 176 255 / .035)      its paler core
--aurora         rgb(64 240 186 / .055)       a ray's low, bright part, cyan-green
--aurora-high    rgb(122 77 255 / .03)        a ray's top
--aurora-glow    rgb(57 220 200 / .02)        the faint glow under the curtain
```

Contrast is checked by `tests/look.test.mjs` against every background the text can sit on, from the darkest (the inset, `#09081a`) to the lightest (the aurora curtain at its strongest over the bottom of the sky, `#1b2548`): the sky's stops, the surfaces, the top aurora haze, and in the margins (where the page scale's labels and the notes' captions sit) the Milky Way, the aurora curtain and the top-right hazes, each at its strongest. `--ink` and `--muted` at least 7:1, `--faint` and `--accent` at least 4.5:1. The margin hazes are set as low as they are because of this: `--muted` is 7.26:1 on the aurora's strongest point and `--faint` 4.83:1. Raise one and the test fails.

## Colour

- The page is a night sky, not black and not grey: a fixed indigo gradient (`--sky-top` to `--sky-bottom`), a faint aurora haze in the top right, and a sparse static star field. It is one CSS layer (`body::before`), painted once; no images and no script.
- On wide screens (1100px and up) the margins have their own sky (`skySides()` in `site/ornament.mjs`): two fixed inline SVG panels with 220 stars each in three sizes, a few with four-point glints, crowded at the window's edge and thinning towards the text; a Milky Way band (violet to indigo haze, read mostly through its own crowd of some 200 small stars, because its haze is held down by the contrast budget) running diagonally down the left; and an aurora curtain (soft vertical cyan-green rays, violet at their tops) rising on the right. A CSS mask fades each panel to nothing over its inner half, so none of it reaches the text column. Gradients only: no filters, no blur, no images, no canvas, nothing moves.
- One accent, aurora green. It marks what can be acted on or where you are: link underlines, the focus ring, the current section in the menu and on the page scale, the scale's cursor, arrows. It is never a fill, a glow or a gradient on text. (The aurora in the sky is weather, not an accent: a haze at a few percent.)
- Violet only for drawn lines (the tilted rings, the one highlighted line in a margin note) and the text selection. Amber at most once per screen: the sun at the centre of the orrery. Nothing in the margins is amber.
- Surfaces are solid. No glassmorphism, no `backdrop-filter`, no neon glow boxes, no gradient text, no blurred shadows, no SVG filters.

## Type

One plain voice. The owner found the italic serif too fancy, so the instrument pages set everything in the system grotesque, upright, and let size and weight carry the hierarchy. Nothing is downloaded.

- Headings and UI (`--font-display`): `-apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`. Semibold (600), tracked slightly tighter as it grows, sentence case. The wordmark, headings, the readout's values (500), paper and project titles, the footer line.
- Reading text (`--font-body`, `--font-ui`): the same system sans (`"SF Pro Text"` where it is installed). 18px (17px on phones), line height 1.6, at most about 65 characters a line (`max-width:34em`).
- Labels and data: the system mono, uppercase and tracked for labels; normal case for dates, BibTeX, numbers and the margin notes' captions.
- Italic only for genuine emphasis (`<em>`) and, where a sentence names one, a publication's title. Never as decoration.
- The instrument pages load no font file: not TT Neoris (a trial build that must be replaced) and not Ibarra Real Nova (the homepage's name face, which still ships at `/hero-name/` for the homepage and the Colophon). Pages still on the old look keep TT Neoris until they move.

The scale, as rendered at 360px / 1440px / 1920px wide. `tests/look.test.mjs` resolves it from the CSS at seven widths and keeps each step clearly apart (title ≥ 1.6× section, section ≥ 1.25× entry, entry ≥ 1.15× body, body ≥ 1.35× label).

```
title (h1)            56 / 89 / 104px    600, tracking -0.042em, line height 0.98
section heading (h2)  28 / 35 / 40px     600, -0.024em, 1.12
paper title           22 / 28 / 29px     600, -0.018em, 1.2
entry heading (h3)    21 / 23.5 / 24px   600, -0.014em, 1.25
lede                  19 / 21.5 / 22px   400, muted, 1.5
readout value         18 / 20 / 21px     500, -0.012em
body                  17 / 18 / 18px     400, 1.6
UI (menu, links)      15px               400 to 500
label (mono, caps)    11.5 to 12px       tracked 0.12 to 0.14em
caption (mono)        11px               the margin notes, --faint
```

## Ornament: an engraved instrument

- **The graduated scale.** Dividers are hairlines with tick marks: minor ticks every 8px, major every 80px, drawn with CSS gradients (`.tickrule`, and the top of every `.chapter`, the header and the footer). Never a plain heavy border.
- **Dial markings.** Section numerals are small mono readings: the site's seven sections are `01` to `07`, and the sections inside page `03` are `03.1`, `03.2`, and so on, like a paper.
- **The orrery.** One quiet SVG at the top of a page: a graduated ring, an equator, two rings tilted by 23.4° and an amber sun (`orrery()` in `site/ornament.mjs`). Each section gets its own variant. Hidden from assistive technology. Lines are 1px at any size.
- **Plates.** A thing that deserves to be looked at closely (a publication) sits on a plate: a solid card with a fine dot grid, like the notebook on the desk, and registration marks at its corners instead of a box.
- **The page scale** (left margin, `pageScale()`). A vertical graduated scale for the whole page, held in view as you scroll: numerals 0 to 100, ticks every 8px (longer every 40 and 80), and each section's number (`03.1` to `03.4`, with its name from 1440px) at the point of the scroll where that section starts. Each mark is a link to its section, in a `<nav aria-label="Page scale">`, keyboard reachable with the usual focus ring. `public/portfolio.js` places the marks, marks the current section (`aria-current="location"`, aurora tick and number) and shows a small aurora cursor that reads the scroll; the cursor runs on a CSS scroll timeline where the browser has one. Without JavaScript the marks sit evenly spaced and there is no cursor.
- **Margin notes** (right margin, `marginNote()` and the note figures). One small engraved figure per section, beside it, with a mono caption in `--faint`, like a lab notebook's margin: a 3×3 filter on an image grid (Experience), estimates against a hidden ground truth (Publication), the projects on a year axis (methods), the tools as orbits (Tools). Numbers in captions come from `site/content.mjs`. Hairlines in `--line-strong` and `--line`, one violet line, ink dots; no text inside the drawing except the year axis, which is HTML. Another page draws its own from the same helpers.
- Everything in the margins is `aria-hidden` (except the page scale's links), ignores the pointer, and is `display:none` under 1100px (the notes under 1280px), so phones and tablets get the single column.
- Nothing else is decorative: no icons, no icon fonts, no images that are not the work itself.

## Layout

- Left-aligned on a 12-column feel: a 4-column label rail (numeral, section label, heading) and an 8-column body. Under 900px the rail sits above the body.
- From 1100px the page sits in a frame. The header and footer span it; inside, a centred text column (at most 1240px) with a margin on each side: `--m` wide (88px at 1100, 150 at 1280, 170 at 1440, 225 at 1920, at most 320), `--G` from the text, `--g` from the window's edge. Past a 1240px column the margins stop growing at 320px and the sky takes the rest, so a very wide window is a wide sky with the page in it, not a strip beside empty space.
- Reading measure about 65 characters. Body text 18px (17px on phones), line height 1.6.
- Generous between chapters (104px on desktop, 64px on phones), tight inside a group.
- Works from 360px to 2560px wide with no horizontal scroll; long titles and BibTeX wrap.

## Do

- Say what the thing is, plainly. Name the stack.
- Put the hierarchy on the page: a short readout of the sections at the top, each linking down.
- Give every external link `↗` and "(opens in a new tab)"; internal links `→`.
- Keep focus visible (2px aurora ring, 3px offset) and motion short; nothing moves under `prefers-reduced-motion: reduce` (the page scale's cursor then just follows the scroll position, set by script).
- Make it read without JavaScript and in print (ink on white, external addresses printed after their links).

## Do not

- No sci-fi dashboard: no panels of fake readings, no glowing borders, no scanlines.
- No emoji, no gradient text, no pill buttons, no centred paragraphs.
- No invented facts: numbers, dates, co-authors and venues come from `site/content.mjs` only.
- No ASCII sharks on an instrument page: `frame()` sets `data-ambient-background="off"`, the shark runtime's own opt-out, so the canvas the build adds (and `tools/verify.mjs` requires) stays empty and hidden.

## Copy

- Say what the thing is and what it does, in plain words. Name the stack where it is known.
- No marketing lines ("crafting experiences", "reality becomes pixels", "made real", "unlock").
- Short sentences. First person where it is Richard talking.
- Be honest about limits ("tracking is experimental", "not measured on real devices").
- Research is machine learning, statistics and AI evaluation. The UNC PRIMES work is deep learning on brain imaging data: machine learning on images, not neuroscience.

## Camera and game stages

A camera feed or game canvas may sit on a dark stage (`--stage`) because video reads better there. Everything around it stays on the page colour. Overlays on the stage use solid fills with a 1px border, not translucent blur.

## Legacy: night and ink (pages not yet moved)

The `:root` tokens below still drive every page without `data-look`. The Colophon swatches and the share cards are drawn from them, and their tests compare the values, so change them only as part of the rollout.

```
--paper #100f15  --paper-2 #1a1920  --card #16151c  --ink #ece9e1  --muted #a8a398  --faint #8a867e
--line #2d2b34   --accent #e8743b   --stage #08070b  --font-display Neoris (TT Neoris trial)
```

Known exception on the old look: the tag bubbles on About (`workspace/tag-bubbles/`) use gradients and round shapes on purpose. They are a toy, not a surface. Research no longer shows them.
