# Now — design brief

- **Tokens:** only the paper-and-ink tokens from `/portfolio.css` (see `site/DESIGN.md`): `--paper`, `--paper-2`, `--card`, `--ink`, `--muted`, `--line`, `--accent`, `--font-mono`. No page-local palette.
- **Accent:** spent on the next milestone (date, filled marker, static frame) and the caret on the currently line. Nothing else on the page is orange.
- **Type:** Neoris headings with no italic accent word, serif reading text, `--font-mono` for eyebrows, chips, places, dates, the currently line, the course lines, stats and the closing line.
- **Hero:** `.page-intro` with a mono eyebrow, the site h1 and `.lede`, then the currently line (`.now-currently`: 1px ink border, `--card` fill, square corners, mono 14px) ending in a blinking accent caret. The caret is glued to the last item (`.now-currently-last`, nowrap) so it never wraps alone.
- **01 Courses:** the site's `.experience` rows (3fr / 9fr, ruled, stacking at 700px). Square chips (mono 12px, uppercase, 1px ink border): enrolled filled ink; sitting-in and auditing outlined; self-study on `--paper-2`.
- **02 Milestones:** date column (minmax(84px,150px)), 32px ink rail, body. 12px square markers: done filled ink, upcoming outlined, under review (`.now-milestone--review`) dashed on `--paper-2`, next filled accent inside a static 1px accent frame (`.now-pulse`, kept as markup). The rail stops at the last marker. Under 700px the date moves above the title and the rail column narrows to 24px.
- **03 This month (optional):** hidden until a published Daily snapshot for the current month loads; eyebrow names the month ("03 — Daily receipts · October 2026"); four mono stats in ruled cells (4 columns, 2 on phones) and a mono link to /daily/.
- **Closing:** one small mono muted line with the update date; the date never breaks. The site footer keeps the display statement.
- **Motion:** only the caret blink (1.1s steps). Under reduced motion it stops, visible.
