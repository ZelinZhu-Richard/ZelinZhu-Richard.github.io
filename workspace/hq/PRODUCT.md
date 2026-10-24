# HQ — product notes

## Purpose

One private page where the owner sees what matters today and this month, every application and deadline in one chronological list, and a place to park loose thoughts and build ideas.

## Users

The owner only, on their own devices. Nobody else should be able to tell what the page holds.

## Constraints

- Public repo: page code is published, data never is. Real data lives in localStorage and the gitignored `_private/hq-seed.json`.
- Unlisted: not in nav, sitemap or robots.txt; `noindex, nofollow`; neutral title "Private"; no og/twitter/description.
- No dependencies, no CDN, no web fonts beyond the site's own `/_nuxt/` files. CSP: `script-src 'self'`, `connect-src 'none'`.
- All calendar logic in America/New_York via Intl; CI runs in UTC.

## Decisions

- **Gate instead of sign-in (tonight).** With no HQ data in the browser, only "Open on this device" and "Import" are visible. The static HTML holds nothing but the gate; app.js builds the command center after opening. Later, Supabase with owner-only RLS replaces this with "Sign in with GitHub".
- **One shape for storage and export.** `hq:v1` stores exactly the export object (`format: "hq-export", version: 1` plus six arrays), which mirrors the planned tables.
- **All-or-nothing import, forgiving about shape.** Every record is validated (types, ids unique, dates real, task → deadline, category exists, slot ranges); the first errors are shown inline and nothing changes. It accepts hand-written files too: the `format`/`version` wrapper may be missing (a wrong one is refused), missing collections are empty, categories/thoughts/ideas may be plain strings, missing ids and positions are generated, and missing or empty optional fields take defaults (`date`/`dateLabel` → null, `kind`/`note` → "", `done`/`approx` → false, `bucket` → later, `createdAt` → now). A deadline's `category` may name a category by id or name and is stored as the id.
- **DOM-safe ids.** Stored ids match `[A-Za-z0-9_-]{1,100}` because they go into element ids, `aria-controls` and label `for`. An imported id with other characters (a space, a dot) is replaced and every reference to it is rewritten, rather than refusing the file.
- **Long thoughts are never cut.** "→ waitlist" keeps text up to 200 characters as the idea title; longer text keeps all of it in the note, with its first line (cut near 80 characters at a word) as the title.
- **Unreadable stored data** is copied to its own key, `hq:v1:unreadable:<ISO time>`, before "Open on this device" or an import replaces it; if the copy cannot be written, nothing is replaced. The gate stays silent about it (privacy); once opened, the page says a copy was kept, and the footer lists each copy with "Download unreadable backup" and "Discard" (confirmed). The older single `hq:v1:unreadable` slot is listed the same way. "Clear this device" removes all `hq:v1*` keys.
- **Periods.** Today's priorities belong to the New York date, except that before 05:00 they still belong to the previous day; the month period follows the same day, so it turns over at 05:00 on the 1st. Old periods are kept; the most recent earlier period's unfinished items are offered as a one-tap carry-over (filling empty slots), which can be dismissed for the current period.
- **Countdowns** use the calendar date (not the 05:00 period). Amber when 0–10 days away and not all done. A deadline with no tasks is never "all done".
- **Priority text** is saved on blur and Enter (Enter moves to the next slot). Saving text does not re-render, so a click on the row's check button right after typing still lands.
- **Optimistic writes with rollback.** Every change is written at once; a failed write (quota, blocked storage) restores the previous state and shows an inline error.
- **Deadline editing** reuses the add form inline ("Rename / edit"), so title, kind, category, date, approx and label can all change. Tasks can be removed individually without a confirm; deleting a deadline (with its tasks) and clearing the device use a `<dialog>` confirm.
- **UI-only state** (filter, carry-over dismissals) lives in `hq:v1:ui`; expanded rows are not persisted.
