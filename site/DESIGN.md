# Site design: paper and ink

The pages outside the phoenix homepage share one look. `public/portfolio.css` defines it. Page and app stylesheets build on its tokens and do not invent new palettes.

## Rules

- Paper, not white: the page is `--paper` (#F4F3EE). Flat blocks use `--paper-2`. Raised surfaces (cards, panels) use `--card` with a 1px border.
- Ink, not black: text is `--ink` (#161514). Secondary text is `--muted`. Never pure #000 or #fff for large areas.
- One accent: burnt orange `--accent` (#B93C0B). Use it for one thing per screen: the current nav item, a key number, a focus ring, a live state. Never for gradients or large fills.
- Hard edges: 1px solid borders (`--line`, or `--ink` for emphasis). Where something must lift, use the hard shadow `--shadow` (4px 4px 0 ink). No blurred shadows, no glow, no `backdrop-filter`, no gradients on surfaces.
- Corners are square or 2px. No pill buttons, except tiny status chips.
- Type: headings in `--font-display` (Neoris grotesk, tight tracking). Reading text in `--font-body` (a book serif). Labels, metadata, numbers, dates, buttons in `--font-mono`. No serif-italic accent word inside a heading.
- Left-aligned. Centre only one short line when it is the whole point of a screen.
- Asymmetric splits (roughly 5/7 or 4/8 columns) instead of equal three-card grids.
- Vary the rhythm: tight spacing inside a group (title + tags), 80px+ between major blocks on desktop.
- Real media: screenshots, the actual film, the camera feed. No abstract blobs, sparkles, or decorative icons.

## Copy

- Say what the thing is and what it does, in plain words. Name the stack where it is known.
- No marketing lines ("crafting experiences", "reality becomes pixels", "made real", "unlock").
- Short sentences. First person where it is Richard talking.
- Be honest about limits ("tracking is experimental", "not measured on real devices").

## Tokens (from portfolio.css)

```
--paper #F4F3EE   --paper-2 #E9E7E0   --card #FBFBF9
--ink #161514     --muted #57544E     --faint #8A867E
--line #D6D3CA    --accent #B93C0B    --accent-soft #F3DDD2
--ok #2F6B3A      --warn #8A5A00      --danger #A4231B
--shadow 4px 4px 0 #161514
--font-display Neoris, "Helvetica Neue", Arial, sans-serif
--font-body "Iowan Old Style", Charter, "Sitka Text", Cambria, Georgia, serif
--font-mono ui-monospace, "SF Mono", Menlo, Consolas, monospace
```

Older names still resolve: `--page` = paper, `--ink`, `--muted`, `--line`, `--accent`.

## Camera and game stages

A camera feed or game canvas may sit on a dark stage (`--stage` #161514) because video reads better there. Everything around it (controls, panels, copy) stays on paper. Overlays on the stage use ink or paper fills with a 1px border, not translucent blur.
