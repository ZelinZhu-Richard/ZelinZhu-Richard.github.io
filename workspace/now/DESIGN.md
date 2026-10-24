# Now — design brief

- **Tokens:** from `/portfolio.css` (`--page`, `--ink`, `--muted`, `--line`, `--accent`). Page-local: `--now-amber #ffc98f` (next / self-study), `--now-ground #0d0c1c` (dot fill), `--now-chip-ink #15122a` (text on filled chips), `--now-mono` (system monospace stack).
- **Type:** Neoris body and headings, Seasons italic for `<em>` words in the accent colour, system monospace for eyebrows, chips, dates, the "currently" pill, the course lines and the closing line. No web fonts.
- **Hero:** `.page-intro` with a mono eyebrow, the site h1 and `.lede`, then a pill (`.now-currently`, 1px line border, 999px radius, mono 14px) ending in a blinking accent caret. The caret is glued to the last item (`.now-currently-last`, nowrap) so it never wraps alone. The hero eyebrow is the site `.eyebrow` plus `.now-mono`, so it takes the site's 12px/.08em step on phones.
- **01 Courses:** the site's `.experience` rows (1fr / 2fr, ruled, stacking at 700px). Chips (mono 12px, uppercase): enrolled filled accent; sitting-in and auditing outlined; self-study filled amber.
- **02 Milestones:** grid of date column (minmax(84px,150px)), 32px rail, body. Dots 14px: done filled accent, next filled amber with a pulsing ring, upcoming outlined (white 45%), under review (`review: true`, `.now-milestone--review`) outlined in accent. The rail stops at the last dot. Under 700px the date moves above the title and the rail column narrows to 24px.
- **03 This month (optional):** hidden until a published Daily snapshot for the current month loads; eyebrow names the month ("03 — Daily receipts · October 2026"); four mono stats (4 columns, 2 on phones) and a link to /daily/.
- **Closing:** one small mono muted line; the date never breaks. The site footer keeps the display statement.
- **Motion:** caret blink (1.1s steps) and ring pulse (2.4s). Under reduced motion both stop at rest: caret visible, ring static.
- Not copied from the mockup: the ASCII-shark canvas and the display-size "Build. Learn. Repeat." footer.
