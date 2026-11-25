# Share cards

The image a link to the site shows on LinkedIn, X, iMessage and Slack.

Most pages used to share `/richard.jpg`, a tall portrait (507x800). A link preview is wide, about
1.91:1, so it showed a strip of the photo. Each page now gets a 1200x630 card set in the site's own
type: night paper, one panel, one orange hard shadow.

## How it works

1. `cards.json` holds the copy for each card and the rule for which pages get it.
2. `make_cards.py` draws one PNG per card into `cards/`. The PNGs are committed.
3. `build.mjs` copies them to `dist/og/` and points each page's `og:image` (and `twitter:image`, where
   a page has one) at its card. It also adds the image's width, height, type and alt text.

The build never runs Python. The committed PNGs are what ships, so a change to `cards.json` does
nothing until the script is run again and the new PNGs are committed.

## Which card a page gets

The most specific rule wins:

1. `paths`: the page's own path, for example `/about/`.
2. `prefix`: the longest folder the page sits in, for example `/github/stars/`.
3. `section`: the page's section from `ownerOf()` in `workspace/stones/parts.mjs`. Paper Piano is in
   Fun, so it gets the Fun card.
4. The card named `site`.

Only pages whose `og:image` is the portrait are changed. A page that sets its own image keeps it
(Art and Video show the Neon Rain poster). A page with no `og:image` stays that way. Unlisted pages
are skipped.

## Redraw the cards

```sh
python3 workspace/og/make_cards.py
```

This is local macOS tooling. It needs:

- Python 3 with Pillow.
- TT Neoris from `public/_nuxt/` (headings).
- The system fonts Iowan Old Style (reading text; Charter is the fallback) and Menlo (labels).

If a font is missing the script stops and names it. On one machine the same input gives the same
bytes. A different Pillow or macOS version can shift a few pixels, so commit redrawn PNGs only when
a card was meant to change.

Open every PNG you redraw and look at it before committing.

## Add a card

Add an entry to `cards.json`:

```json
{
  "name": "notes",
  "match": { "paths": ["/notes/"], "prefix": "/notes/" },
  "label": "Notes",
  "title": "Notes",
  "text": "One or two plain sentences that say what the page is.",
  "photo": false
}
```

- `name` is the file name: `cards/notes.png`, served at `/og/notes.png`.
- `match` takes any of `paths`, `prefix` and `section`.
- `label` is drawn in capitals above the title.
- `text` repeats what the page says about itself. Do not write a new claim for the card.
- `photo: true` puts the portrait on the right and leaves less room for the title and text.
- The address in the bottom row is the first of `paths`, or the `prefix` when there are no paths.

Then run the script, look at the PNG, and commit `cards.json` and the PNG together. To remove a card,
delete its entry and its PNG. The tests fail if either one is missing the other.

## What the tests hold in place

- Each card has a 1200x630 PNG, and each PNG has a card.
- The colours in `make_cards.py`, and in the PNGs, are the night tokens in `public/portfolio.css`.
  If a token changes, change the script and redraw.
- A card's text still says what its page says. If a page's copy changes, change the card and redraw.
  The pages checked are listed in the test.

## Limits

- The title is one line. It starts at 128px and steps down to 72px until it fits. Below that it
  wraps onto two lines.
- The text holds three lines. Lines are balanced: they come out near the same length, instead of
  two full lines and one stranded word.
- If the label, title, text or address does not fit, or a font has no glyph for a character, the
  script stops and quotes the copy that failed. No PNG is written until every card fits.
- Use typographic apostrophes and dashes (`’`, `–`) in the copy, as the pages do.
- The bottom row is signed "Richard Zhu", except on cards whose title is already the name.
- Title letters are tracked but not kerned: the script sets text glyph by glyph.
- Sites cache the image for a link. After a card changes, an old preview can keep showing for a while.

## Files

| File | What it is |
| --- | --- |
| `cards.json` | Copy and matching rules, one entry per card. |
| `make_cards.py` | Draws the PNGs. Layout numbers are at the top, in final pixels. |
| `cards/*.png` | The committed cards. The build ships these as they are. |
| `cards.mjs` | `cards()`, `cardFor(path)` and the card size, for the build and tests. |
| `build.mjs` | `withCard(html, path)` rewrites one page's tags. `buildOg(output)` copies the cards and rewrites every page. |
| `tests/og.test.mjs` | Checks the PNGs, the colours, the copy, the matching order and the tag rewrite. |
