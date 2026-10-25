# Richard Zhu’s personal website

Production: **https://zelinzhu-richard.github.io/**

Requires Node.js 22 or newer and npm. No environment variables or API keys are required.

```bash
npm ci
npm run dev       # build and serve at http://127.0.0.1:5173
npm test
npm run build     # clean production output: dist/
npm run preview   # serve dist/ at http://127.0.0.1:4173
```

Edit personal information in `site/content.mjs`, the phoenix narrative in `site/story.mjs`, the Now page in `workspace/now/now.mjs`, and detail-page templates in `site/pages.mjs`. Daily (`/daily/`, a habit pet game) and HQ (`/hq/`, a private, unlisted planner) run in the browser and keep their data in that browser's local storage until a Supabase project is configured (`workspace/daily/SETUP.md`); see `workspace/daily/PLAN.md` and `workspace/hq/README.md`. `npm run test:db` checks the Supabase side against a local stack (Docker and the Supabase CLI; not part of `npm test` or CI). Restart development after edits. `public/` contains the adapted Nuxt/Vue phoenix runtime and its local assets; it is a captured frontend, not the agency’s original Nuxt source project. See [THIRD_PARTY.md](THIRD_PARTY.md) for provenance. After intentional changes to `public/`, run `npm run manifest` to update its integrity inventory.

GitHub Actions builds on pushes to `main`, verifies the site, uploads **dist/**, and deploys through GitHub Pages. All paths use `/` for this GitHub user site. Detail pages have real HTML files and work on direct navigation and refresh; unknown paths return 404. No SPA fallback is required; Daily and HQ optionally use Supabase (deployed by hand, never from Actions).

The GitHub stars library lives at `/github/stars/`. It groups the public repositories starred by `ZelinZhu-Richard` into seven project types, then nested piles drawn from 12 purpose categories, with search, purpose and language filters, and sorting. The page ships all 708 repositories in complete static HTML and a saved snapshot, so visitors do not need GitHub authentication or a live API request. Private or inaccessible repositories cannot appear in the public collection.

Refresh the collection with `npm run stars:sync`, review the resulting `workspace/github-stars/data/stars.json` diff, then run `npm test` and `npm run build`. Reviewed classifications live in `workspace/github-stars/data/classifications.json`; new repositories receive an initial metadata-based classification that can be refined there. The sync follows all GitHub pagination and preserves the last valid snapshot if fetching fails. It runs manually; deployment does not fetch GitHub data.
