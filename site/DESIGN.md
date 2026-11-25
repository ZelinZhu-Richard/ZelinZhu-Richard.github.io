# Site design: night and ink

The pages outside the homepage share one look. `public/portfolio.css` defines it. Page and app stylesheets build on its tokens and do not invent new palettes. The homepage and Contact page have their own stylesheet, `workspace/home/app/assets/css/home.css`, which uses the same night, ink, muted, line and accent colours.

Night is the default, so the pages read as a continuation of the homepage. A page can opt back into paper with `data-theme="paper"` on `<html>` (Domain Expansion does, because its camera stage is light). Every rule below is written against the tokens, so it holds in both themes.

## Rules

- The page is `--paper`. Flat blocks use `--paper-2`. Raised surfaces (cards, panels) use `--card` with a 1px border. Never pure #000 or #fff for large areas.
- Text is `--ink`. Secondary text is `--muted`. `--faint` is for small labels and numerals only; it still meets 4.5:1 on `--paper`, `--card` and `--paper-2`.
- One accent: burnt orange `--accent`. Use it for one thing per screen: a key number, a focus ring, a live state, the shadow of the one panel that is open. Never for gradients or large fills.
- Hard edges: 1px solid borders (`--line` for dividers, `--ink` for emphasis). Where something must lift, use the hard shadow `--shadow`. No blurred shadows, no glow, no `backdrop-filter`, no gradients on surfaces.
- Dividers are `--line`. A link underline is never `--line` (it is 1.4:1 on night): use `--faint` or stronger.
- Corners are square or 2px. No pill buttons, except tiny status chips.
- Type: headings in `--font-display` (Neoris grotesk, tight tracking). Reading text in `--font-body` (a book serif). Labels, metadata, numbers, dates, buttons in `--font-mono`. No serif-italic accent word inside a heading.
- Links: a link inside running text is underlined. `↗` marks a link that leaves the site and opens a new tab; `→` marks one that stays.
- Left-aligned. Centre only one short line when it is the whole point of a screen.
- Asymmetric splits (roughly 5/7 or 4/8 columns) instead of equal three-card grids.
- Vary the rhythm: tight spacing inside a group (title + tags), 80px+ between major blocks on desktop.
- Real media: screenshots, the actual film, the camera feed. No abstract blobs, sparkles, or decorative icons.
- Motion is short (about 120–200ms) and stops under `prefers-reduced-motion: reduce`.

Known exception: the tag bubbles on About and Research (`workspace/tag-bubbles/`) use gradients and round shapes on purpose. They are a toy, not a surface.

## Copy

- Say what the thing is and what it does, in plain words. Name the stack where it is known.
- No marketing lines ("crafting experiences", "reality becomes pixels", "made real", "unlock").
- Short sentences. First person where it is Richard talking.
- Be honest about limits ("tracking is experimental", "not measured on real devices").

## Tokens (from portfolio.css)

```
                night (default)   paper (data-theme="paper")
--paper         #100f15           #f4f3ee
--paper-2       #1a1920           #e9e7e0
--card          #16151c           #fbfbf9
--ink           #ece9e1           #161514
--muted         #a8a398           #57544e
--faint         #8a867e           #696660
--line          #2d2b34           #d6d3ca
--accent        #e8743b           #b93c0b
--accent-soft   #3a2418           #f3ddd2
--ok            #7fc48c           #2f6b3a
--warn          #e0ad5c           #8a5a00
--danger        #ef7b6f           #a4231b
--stage         #08070b           #161514
--on-stage      #ece9e1           #f4f3ee
--shadow        4px 4px 0 #3a3843 4px 4px 0 var(--ink)

--font-display  Neoris, "Helvetica Neue", Arial, sans-serif
--font-body     "Iowan Old Style", Charter, "Sitka Text", Cambria, Georgia, serif
--font-mono     ui-monospace, "SF Mono", Menlo, Consolas, monospace
```

Older names still resolve: `--page` = paper, `--ink`, `--muted`, `--line`, `--accent`.

## Camera and game stages

A camera feed or game canvas may sit on a dark stage (`--stage`) because video reads better there. Everything around it (controls, panels, copy) stays on the page colour. Overlays on the stage use ink or paper fills with a 1px border, not translucent blur.
