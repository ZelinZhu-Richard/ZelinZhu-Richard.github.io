# Now — product notes

- **Purpose:** an honest, public log of current study, shipped work and next steps, wins and misses both.
- **Users:** visitors to the portfolio (recruiters, collaborators, friends) and the owner, who updates it by editing one file.
- **Constraints:** static GitHub Pages output; no backend, npm dependencies, CDN scripts or web fonts; every HTML file carries the production canonical; dates never parsed with `Date` (CI runs in UTC).
- **Decisions:**
  - Data lives in `now.mjs` and is validated at build time; a bad file fails the build instead of rendering a broken page.
  - Course lines default to "now →" / "next →"; `labels` renames either (the ILO row uses "mock score").
  - A milestone's `label` is free text; the optional strict `date` gives `<time datetime>` and must be in chronological order. Display order is the array order.
  - At most one `next` milestone. It shows NEXT from its state, whatever its label says.
  - Unknown fields are rejected so typos surface at build time.
  - The "This month" strip is progressive and honest: it only appears for a snapshot marked `kind: 'published'` whose `receipts.month.key` is the current America/New_York month and that has all four numbers. Daily's seeded build-time preview and last month's numbers never show as "this month".
  - `review: true` marks an upcoming milestone that is under review (own dot style, announced as "Under review").
  - Screen readers: the course status chip is `aria-hidden` and repeated, visually hidden, inside the course h3; the next milestone's "Next" date column is `aria-hidden` because the h3 says "Next up".
