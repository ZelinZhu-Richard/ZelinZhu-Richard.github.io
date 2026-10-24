# Now — validation (2026-10-24, after review fixes)

## Checked

- `node --test workspace/now/tests/*.test.mjs`: 44 tests pass, also with `TZ=UTC` and `TZ=America/New_York`. Full `npm test`: 300 pass (also with `TZ=UTC`).
- Tests now cover the strip's DOM path through the exported `show(strip, fetchImpl, now)` with a fake strip: success, 404, rejected fetch, invalid JSON, bad numbers, preview snapshot, last month's snapshot, missing `[data-now-stats]`. Values are set through `textContent`.
- Validator: day-precision order can no longer be reset by a month-only date in between (2026-10-20, 2026-10, 2026-10-05 now fails); `review` must be a boolean and only on upcoming items.
- Full site built into a private folder with the scratch build helper; `tools/verify.mjs` passed.
- Browser (own tab, served with `tools/serve.mjs`):
  - 390px: caret sits on the same line as "qbench preprint"; hero eyebrow is 12px / .08em; closing date stays on one line; the under-review dot is accent-outlined, other upcoming dots white 45%; no horizontal overflow.
  - 1280px: no horizontal overflow, caret inline after the last item.
  - 900px: `<main>` content fits (0 overflowing elements). The page is still 1127px wide because of the shared header (see below). With the proposed header query injected in the page, the width drops to 900 and the menu button shows.
  - Strip with a test snapshot placed only in the private build: `kind: 'preview'` stays hidden; `kind: 'published'`, key 2026-10 shows four stats and "October 2026", no overflow at 390px.
  - Reduced motion (headless Chrome, `--force-prefers-reduced-motion`): caret visible, ring static. Screenshot `.qa/now-390-reduced-motion-fix.png` (headless renders a little wider than 390px).

## Not checked

- Real screen reader pass (markup only: hidden status in each course h3, chip `aria-hidden`, single "Next up").
- The real Daily snapshot: Daily has no snapshot writer yet. The strip expects `{ kind: 'published' | 'preview', receipts: { month: { key: 'YYYY-MM', pagesRead, hoursOutside, workouts, avgSleepHours } } }`.

## Known issues

- Until Daily writes `/daily/snapshot.json`, every /now/ visit logs one 404 for it in the console. The strip stays hidden; nothing else breaks. It goes away once the Daily build always writes the file (marked `preview` when it is the build-time preview).
- Shared site header (public/portfolio.css, outside this folder): between 701px and 900px the nav does not collapse, so every frame() page, /now/ included, is 1127px wide at 900px. Fix requested from the main agent.
