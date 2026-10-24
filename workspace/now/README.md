# Now

The public "learning in public" page at `/now/`: what Richard is studying, what he has shipped, and what is next. It is static and rebuilt from one data file. No backend.

## Edit

1. Change `now.mjs` (the `NOW` object). Field rules are in the comment at the top of the file.
2. Run `npm test`. A bad entry (unknown status, impossible date, typo in a field name, two `next` milestones, out-of-order dates) fails the build with a message that names the field.
3. Bracketed text such as `[current topic]` is a placeholder and renders as written.

The `updated` date drives the hero eyebrow and the closing line. It is formatted by splitting the string, never through `Date`.

## Files

- `now.mjs` — the data.
- `validate.mjs` — `validateNow(data)` / `nowErrors(data)`, the build-time checks.
- `page.mjs` — `nowPage(data)`, the `<main>` body. `site/pages.mjs` renders it through `frame('/now/', ...)`.
- `style.css` — page styles (`now-` prefix), copied to `dist/now/style.css`.
- `strip.js` — optional "This month" strip. Reads `/daily/snapshot.json` and shows it only when it looks like `{ kind: 'published', receipts: { month: { key: 'YYYY-MM', pagesRead, hoursOutside, workouts, avgSleepHours } } }` and `key` is the current America/New_York month. It stays hidden for a preview snapshot, a stale month, a missing or bad field, a 404 or a network error. `show(strip, fetchImpl, now)` is exported for tests.
- `build.mjs` — `buildNow(output)` copies the allowlist (`style.css`, `strip.js`) to `<output>/now/`.
- `tests/` — validation, page structure, strip and build tests (`node --test workspace/now/tests/*.test.mjs`).
