# HQ — design brief

Target: the "Private · Command center" mockup, with the site's fonts and tokens. The mockup's animated ASCII-shark canvas is not used.

## Tokens

From `public/portfolio.css`: `--page #111022`, `--ink #f8f0fc`, `--muted #c2bad0`, `--line #ffffff30`, `--accent #dfccff`. Added: `--ground #0d0c1c` (panel fill, dot fill), `--amber #ffc98f` (urgent, today panel), `--faint #9a93ad` (done text), `--on-accent #15122a`.

## Type

- Neoris (regular only) for body text; emphasis is size or colour, never weight.
- Seasons italic for `<em>` display words and the wordmark.
- Priority numbers 01–05 use `SeasonsNumerals`: the same Seasons file restricted by `unicode-range` to every digit except 4, because the trial font draws a placeholder glyph for "4" (and "-"). The 4 falls back to Georgia italic.
- System monospace (`ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`) for eyebrows, dates, countdowns, chips and counts.

## Components

- Header: wordmark (link to /, 44px tall target) and the lock badge "PRIVATE · NOT IN NAV". No site nav.
- Title block: mono date line ("SAT, OCT 24, 2026 · 14 OPEN TASKS"), h1 "Command *center*", a save status line and an inline amber error. The idle text "Saved on this device" is a plain span; change messages go into a separate `role=status` span that is emptied (not re-announced) after 4 s.
- Priority panels: 1px tinted border (amber for today, accent for month), 4px radius, ground fill. Rows: serif number as the `<label>`, 44px check button (`aria-pressed`, fixed label "Mark done: today priority 1"), transparent input. Carry-over suggestion under the list.
- Timeline: grid `minmax(78px,120px) 28px 1fr` (phones: `64px 20px 1fr`). Date label + countdown, rail with dot (outline / amber + pulse ring / accent), card with a header `<button>` (aria-expanded, aria-controls) holding title, kind, category chip, status and chevron, plus a visually hidden "due November 1, 8 days, urgent" so the button's name carries the date column. Expanded: progress bar, task buttons, "+ Add task", "Rename / edit", "Delete" (native `<dialog>` confirm).
- Brain dump panel and waitlist columns as in the mockup; move pills and 44px remove buttons.
- Footer tools: Export JSON, Import JSON, Clear this device, Categories editor; when unreadable backups exist, an amber-bordered row per backup with "Download unreadable backup" and "Discard".
- Waitlist column counts are a number plus visually hidden " ideas" (no aria-label on a span).

## Motion

- Urgent dot pulse ring (2.4s), chevron rotation, progress width, and a 0.9s check "burst" on the dot when the last task of a deadline is ticked.
- Under `prefers-reduced-motion: reduce` all animation and transitions are off, the pulse ring is static and the burst is not rendered (app.js also checks `matchMedia` before adding it). The aria-live status still announces "All tasks done: …".
