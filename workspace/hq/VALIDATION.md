# HQ — validation (2026-10-24)

## Review fixes (second pass)

- Import made forgiving but still all-or-nothing (missing wrapper → v1, string categories/thoughts/ideas, `dateLabel:""`/`note:null`/missing `date` → defaults, missing ids/positions generated). Ids outside `[A-Za-z0-9_-]{1,100}` are replaced and references rewritten (chosen over refusing the file, so a hand-written seed with "dl one" still imports). Tests: shape leniency, wrong wrapper still refused, id remap with tasks/categories following, normalized output re-validates unchanged.
- "→ waitlist" never cuts text: over 200 characters, the full text goes to the note. Tested in store and in the browser (463-character thought → 72-character title + full note, thought removed).
- Unreadable data: timestamped backup keys; Open refuses to overwrite when the copy fails; footer "Download unreadable backup" / "Discard". Browser: stored `version:2` data → gate silent → Open → one `hq:v1:unreadable:<time>` key and the footer row; Discard (confirm) removed it. Download was not clicked (unit-tested only).
- Wordmark target: 44px at 1280, 900 and 390. Live region: observed messages are only the change text then empty; the idle text is outside the live region. Timeline button name now ends "due November 1, 8 days, urgent". Counts use visually hidden text.
- Build test now runs the real `tools/build.mjs` in `.qa/` (public/ hard-linked, ~2 s): only `hq/index.html` has noindex across the whole built site; the built sitemap.xml and robots.txt do not mention hq.
- `node --test workspace/hq/tests/*.test.mjs`: 61/61 (local and `TZ=UTC`). `npm test`: 313/313 (local and `TZ=UTC`). Private build + verify: passed (212 files).
- In the in-app browser the pane was hidden, so `<dialog>` close events and `requestAnimationFrame` were deferred until it rendered; the say() timing now uses setTimeout so it does not depend on rendering. Reduced motion was not re-checked (these fixes add no motion).
- Not done here: running `validateImport` on the real `_private/hq-seed.json` (left to the main agent, as custodian; command in README.md).


## Automated

- `node --test workspace/hq/tests/*.test.mjs`: 48 tests, 48 pass (local time zone and `TZ=UTC`).
  - helpers: New York date keys, the 05:00 reset and 1st-of-month turnover with fixed instants across the Nov 1 2026 (EDT→EST) and Mar 14 2027 (EST→EDT) changes; calendar day arithmetic; countdown text and colour (passed / today / tomorrow / N days / ~N days / no date yet, the 10-day amber boundary); status (x/y, ready, done, check, 0/0); dots; sorting; header line; carry-over; a source scan for local-time getters, `new Date('YYYY-…')` and `toLocale*String`.
  - store: the good fixture (`seed.example.json`) validates and round-trips byte-for-byte through `toExport`; 20 bad fixtures are each rejected with a readable message and no partial state; storage empty / ok / invalid / unavailable; quota failure; every mutator.
  - build: `buildHq` into `workspace/hq/.qa/` emits exactly the allowlist; noindex meta, `<title>Private</title>`, canonical, no og/twitter/description, CSP `connect-src 'none'`, no command-center content in the static HTML, every local reference inside the allowlist, no network APIs in the JS, fonts from `/_nuxt/`. `/hq/` is absent from every `pages()` page, the sitemap list, robots.txt and the public home/contact/menu files.
  - publication: `git ls-files` lists nothing under `_private/` and no `hq-seed.json`; `workspace/hq/_private/hq-seed.json` is gitignored (checked by path, never read); `seed.example.json` uses only "Kind X" placeholder names and generic capitalized words.
- Private full-site build with `build-to.mjs` + `tools/verify.mjs`: passed (212 files).
- `npm test` (and `TZ=UTC npm test`): 291 tests, 289 pass. The 2 failures are in `workspace/now/tests/strip.test.mjs` (another feature in progress), not HQ.

## Browser (in-app browser, served build on port 4302)

Checked at 1280×900, 900×1000 and 390×844, with `seed.example.json`-style fictional data injected into localStorage:

- Gate: with no data only "Open on this device" and "Import" are visible; Open starts an empty center with the four default categories; Import of a bad file shows an inline error and stores nothing; Import of a good file opens the center.
- Priorities: typing + Enter saves and moves to the next slot; typing then clicking the row's check saves both (no lost click); `aria-pressed` and the fixed aria-labels; x/3 and x/5 counts; the carry-over suggestion appears for the previous day's unfinished item and disappears when no slots are free.
- Timeline: filters (`aria-pressed`), Expand/Collapse all affecting only filtered rows, countdowns and amber urgency, dot states with pulse ring, statuses, rail ending at the last row, add-deadline validation errors and focus, add task (Enter), inline edit/rename (title, no date, label), delete with the `<dialog>` (Cancel keeps it, Delete removes it and its tasks, focus returns to "+ Add deadline"); ticking the last task shows the burst and announces "All tasks done: …".
- Brain dump: add (Enter), newest first, → task picker (thought removed, task appended), → waitlist (lands in Later), remove.
- Waitlist: add to Later, move both ways with correct aria-labels and counts, remove.
- Footer: Export downloads `hq-export-YYYY-MM-DD.json` from a blob; Import with errors leaves data unchanged; good import asks to Replace; Clear this device asks, removes every `hq:v1*` key and returns to the gate.
- Failed write: with `setItem` forced to throw a QuotaExceededError, a tick rolls back and the inline error shows.
- No horizontal overflow at 1280, 900 and 390; no visible button under 44px tall at 390; keyboard order (skip link → wordmark → priorities in row order) with visible focus outlines; no console errors (CSP included).
- Reduced motion: with `matchMedia` stubbed to report `reduce`, completing a deadline adds no burst and still announces. The CSS `prefers-reduced-motion` block was checked by reading, not by OS-level emulation (the browser tools cannot emulate it).

## Not checked

- Real screen readers (VoiceOver/NVDA); names and live regions were checked through the accessibility tree only.
- Safari and Firefox; only the Chromium-based in-app browser.
- The owner's real `_private/hq-seed.json` (not read, by rule). Import now accepts the common hand-written shapes listed above; anything else shows as an inline import error.
- The live clock rollover at 05:00 in the browser (covered by unit tests only).
- Long priority text is clipped inside its single-line input on phones.
