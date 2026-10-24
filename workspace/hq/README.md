# HQ — private command center (/hq/)

The owner's private planning page: priorities (today top 3, month top 5), a deadline timeline with task checklists, a brain dump and a waitlist of things to build. It is unlisted (not in the nav, sitemap or robots.txt) and carries `noindex, nofollow`.

The page code is public; the data is not. Everything is stored in this browser's localStorage under `hq:v1` and never leaves it (the page's CSP sets `connect-src 'none'`). Export JSON to back up or move data between devices.

## Use

- First visit on a device: the page shows only "Open on this device" (starts an empty command center with the default categories) and "Import" (loads an export file).
- The owner's real data is imported by hand from `workspace/hq/_private/hq-seed.json` (gitignored, never committed). Check it first without opening the page: `node -e "import('./workspace/hq/store.js').then(S=>{const r=S.validateImport(require('fs').readFileSync('workspace/hq/_private/hq-seed.json','utf8'));console.log(r.ok||r.errors)})"`.
- If stored data ever fails to load (for example after a format change), "Open on this device" keeps a copy first; the footer then offers "Download unreadable backup" and "Discard".
- `seed.example.json` is the same shape with fictional placeholders; import it to try the page.

## Edit

- Dates, countdowns, sorting, the 05:00 / 1st-of-month resets and carry-over: `helpers.js` (pure, no DOM). Defaults live in its `CONFIG`.
- Data model, import validation, storage and all mutations: `store.js` (pure functions plus wrapped localStorage access).
- UI: `app.js` renders into the empty `#app` in `index.html`; styles in `style.css`.

## Files

| File | Role |
|---|---|
| `index.html` | Head (noindex, canonical, CSP), the gate, the confirm `<dialog>` |
| `app.js` | UI: rendering, events, export/import, clear |
| `store.js` | Data model, validation, storage, mutators |
| `helpers.js` | New York date helpers, countdown/status/sort, period reset |
| `style.css` | Fonts (from `/_nuxt/`), portfolio tokens, layout |
| `build.mjs` | `buildHq(output)` copies the allowlist `HQ_FILES` into `dist/hq/` |
| `seed.example.json` | Fictional example export (also the good test fixture) |
| `tests/` | helpers, store, build (including a real full-site build in `.qa/`) and publication tests |

Run the tests: `node --test workspace/hq/tests/*.test.mjs` (also with `TZ=UTC`).
