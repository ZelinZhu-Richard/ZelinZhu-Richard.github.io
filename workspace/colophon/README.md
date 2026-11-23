# Colophon

`/colophon/` says how the site is made, credits what is not Richard's, and lists everything on it.
The command palette's no-JavaScript fallback links to its `#everything` section.

| File | What it is |
| --- | --- |
| `page.mjs` | The copy and the page body. `site/pages.mjs` wraps it in the site frame. |
| `style.css` | Only what `public/portfolio.css` does not already give. Every class starts with `colophon-`. |
| `build.mjs` | `buildColophon` copies the stylesheet. `finishColophon` counts the built site and writes the four figures into the page. |
| `tests/colophon.test.mjs` | Structure, links, the figures, and the facts listed below. |

## Editing

- The copy lives in `page.mjs`, in the lists at the top (`FIGURES`, `FACES`, `SWATCHES`, `CREDITS`, `LIMITS`) and in `colophonPage()`.
- "Everything here" is not written by hand. It is `siteIndex()` from `workspace/palette/index.mjs`. Add a page there and it gets a row here.
- The four figures are placeholders in the page (`<span data-stat="pages">`). `finishColophon` must run after every other build step, just before `tools/verify.mjs`, or the counts are wrong.

## Every claim stays checkable

This page makes statements of fact about the site. Keep each one tied to something in the repo, and change the sentence when the fact changes. The test fails when one of these stops being true:

| The page says | Checked against |
| --- | --- |
| No npm dependencies (the zero) | `package.json` |
| The swatch values | the first `:root` block of `public/portfolio.css` |
| The font names, and that none is downloaded | the font tokens in `public/portfolio.css`, `workspace/hero-name/` |
| A push to main tests, builds and deploys | `.github/workflows/deploy.yml` |
| What the checker fails the build on | the error messages in `tools/verify.mjs`, and the call to it in `tools/build.mjs` |
| Daily asks Supabase for my game, and supabase-js handles my sign-in | `workspace/daily/app/cloud-config.js`, `workspace/daily/app/cloud.js` |
| Google Analytics is switched off on the homepage | `public/index.html` |
| GitHub Pages logs IP addresses | Gym's privacy note in `workspace/gym/index.html`, which links GitHub's own page |
| MediaPipe, OpenCV.js, supabase-js and the sharks are vendored | the `vendor/` folders |

These are not tested. Check them by hand when the site changes:

- "MiB, mostly MediaPipe and OpenCV for the camera toys". On 2026-11-23 the three camera toys' `vendor/` folders were about 89 of 135 MiB.
- "Of my pages in the list below, only Daily calls an outside server." Search a new feature for `fetch(` and for outside addresses in `src` and `href` before it is added to the index.
- "The site sets no cookies." No shipped file used the cookie API on 2026-11-23.
- The Borrowed section follows `THIRD_PARTY.md` and `workspace/ascii-sharks/NOTICE.txt`. Update both together.

The page never names an unlisted page. The figures count every built file, but only as totals.

Run the tests with `node --test workspace/colophon/tests/colophon.test.mjs`.
