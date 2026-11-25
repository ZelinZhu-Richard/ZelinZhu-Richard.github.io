# Site design: night instrument

The inner pages are the same world as the homepage: the engraved brass instrument in a room at night, then out among the stars. They read like a well-set paper trail on a night sky, not like a dashboard. `public/portfolio.css` defines the system; `site/ornament.mjs` draws its one ornament.

## Status: one page first

The system is opt-in while it is judged. A page wears it with `<html data-look="instrument">`, which `frame()` in `site/pages.mjs` writes when it is given `look: 'instrument'`. Today that is `/research/` only. Every other page still wears the older "night and ink" look (the `:root` tokens and unscoped rules in `portfolio.css`, burnt-orange accent, TT Neoris headings) until it is moved over. When every page is moved, the `instrument` tokens become `:root`, the Colophon swatches and the share cards (`npm run og`) are redrawn, and the legacy rules go.

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
```

Contrast is checked by `tests/look.test.mjs` against every background the text can sit on, including the aurora haze: `--ink` and `--muted` at least 7:1, `--faint` and `--accent` at least 4.5:1.

## Colour

- The page is a night sky, not black and not grey: a fixed indigo gradient (`--sky-top` to `--sky-bottom`), a faint aurora haze in the top right, and a sparse static star field. It is one CSS layer (`body::before`), painted once; no images and no script.
- One accent, aurora green. It marks what can be acted on or where you are: link underlines, the focus ring, the current section in the menu, arrows. It is never a fill, a glow or a gradient on text.
- Violet only for drawn lines (the tilted rings) and the text selection. Amber at most once per screen: the sun at the centre of the orrery.
- Surfaces are solid. No glassmorphism, no `backdrop-filter`, no neon glow boxes, no gradient text, no blurred shadows.

## Type

- Display: Ibarra Real Nova Italic (SIL OFL, self-hosted at `/hero-name/`, 15 KB, Latin-1), then the homepage's serif stack in italic. Headings, the wordmark, project and paper titles. Weight 400 only; size and italic carry the hierarchy.
- Reading text: the system book serif (`"Iowan Old Style", Charter, "Sitka Text", Cambria, Georgia`). Nothing downloaded.
- Interface: the system sans (`-apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial`) for the menu, buttons and the footer index.
- Labels and data: the system mono, uppercase and tracked for labels; normal case for dates, BibTeX and numbers.
- The instrument pages do not load TT Neoris (a trial build that must be replaced). Pages still on the old look keep it until they move.

## Ornament: an engraved instrument

- **The graduated scale.** Dividers are hairlines with tick marks: minor ticks every 8px, major every 80px, drawn with CSS gradients (`.tickrule`, and the top of every `.chapter`, the header and the footer). Never a plain heavy border.
- **Dial markings.** Section numerals are small mono readings: the site's seven sections are `01` to `07`, and the sections inside page `03` are `03.1`, `03.2`, and so on, like a paper.
- **The orrery.** One quiet SVG at the top of a page: a graduated ring, an equator, two rings tilted by 23.4° and an amber sun (`orrery()` in `site/ornament.mjs`). Each section gets its own variant. Hidden from assistive technology. Lines are 1px at any size.
- **Plates.** A thing that deserves to be looked at closely (a publication) sits on a plate: a solid card with a fine dot grid, like the notebook on the desk, and registration marks at its corners instead of a box.
- Nothing else is decorative: no icons, no icon fonts, no images that are not the work itself.

## Layout

- Left-aligned on a 12-column feel: a 4-column label rail (numeral, section label, heading) and an 8-column body. Under 900px the rail sits above the body.
- Reading measure at most 68 characters. Body text 19px (17px on phones), line height 1.6.
- Generous between chapters (96px on desktop, 56px on phones), tight inside a group.
- Works from 360px to 1600px wide with no horizontal scroll; long titles and BibTeX wrap.

## Do

- Say what the thing is, plainly. Name the stack.
- Put the hierarchy on the page: a short readout of the sections at the top, each linking down.
- Give every external link `↗` and "(opens in a new tab)"; internal links `→`.
- Keep focus visible (2px aurora ring, 3px offset) and motion short; nothing moves under `prefers-reduced-motion: reduce`.
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
