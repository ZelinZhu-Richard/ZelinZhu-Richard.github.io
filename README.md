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

The site has seven sections, set in `workspace/stones/parts.mjs`: About, Projects, Research, Art (`/art/`: Neon Rain and the living portrait), Fun (`/fun/`: the camera toys and Flash), Blog (`/blog/`) and Daily. Edit personal information in `site/content.mjs`, the homepage’s words in `workspace/home/content.mjs`, blog posts in `workspace/blog/posts.mjs` (see [workspace/blog/README.md](workspace/blog/README.md)), and detail-page templates in `site/pages.mjs`. The old Now page source stays in `workspace/now/` but is no longer built or published. Daily (`/daily/`, a habit pet game) and HQ (`/hq/`, a private, unlisted planner) run in the browser and keep their data in that browser's local storage until a Supabase project is configured (`workspace/daily/SETUP.md`); see `workspace/daily/PLAN.md` and `workspace/hq/README.md`. `npm run test:db` checks the Supabase side against a local stack (Docker and the Supabase CLI; not part of `npm test` or CI). Restart development after edits.

The homepage (`/`) and the Contact page (`/contacts/`) are a Nuxt app with a Three.js scene, in `workspace/home/` (see [workspace/home/README.md](workspace/home/README.md)). Nuxt runs only there: build it ahead of time with `npm run home` in `workspace/home/` and commit the regenerated `workspace/home/release/` with the source change. Never edit `release/` by hand; the site build checks its stamp and copies it. `site/story.mjs` is the copy of the retired captured homepage and is not shown on the live homepage. `public/` holds the shared stylesheet and script, fonts, favicon, CV and portrait; the retired homepage’s files also stay there but are not built into the site. See [THIRD_PARTY.md](THIRD_PARTY.md) for licenses and provenance. After intentional changes to `public/`, run `npm run manifest` to update its integrity inventory.

GitHub Actions builds on pushes to `main`, verifies the site, uploads **dist/**, and deploys through GitHub Pages. All paths use `/` for this GitHub user site. Detail pages have real HTML files and work on direct navigation and refresh; unknown paths return 404. No SPA fallback is required; Daily and HQ optionally use Supabase (deployed by hand, never from Actions).

The GitHub stars library lives at `/github/stars/`. It groups the public repositories starred by `ZelinZhu-Richard` into seven project types, then nested piles drawn from 12 purpose categories, with search, purpose and language filters, and sorting. The page ships all 708 repositories in complete static HTML and a saved snapshot, so visitors do not need GitHub authentication or a live API request. Private or inaccessible repositories cannot appear in the public collection.

Refresh the collection with `npm run stars:sync`, review the resulting `workspace/github-stars/data/stars.json` diff, then run `npm test` and `npm run build`. Reviewed classifications live in `workspace/github-stars/data/classifications.json`; new repositories receive an initial metadata-based classification that can be refined there. The sync follows all GitHub pagination and preserves the last valid snapshot if fetching fails. It runs manually; deployment does not fetch GitHub data.

Research Stack is a separate collection at `/github/stars/research/`, alongside the unchanged All Stars view. Its 21 static folder pages cover General research, AI & machine learning, and Finance, econometrics & quant. Nested URLs, breadcrumbs, and the folder tree work without JavaScript; search, type and language filters, and sorting enhance the selected folder. Repositories can belong to several folders, while parent counts and results include each repository once.

Curated folders and memberships live in `workspace/github-stars/data/research-stack.json`. The stack reuses relevant starred repositories and adds nine cached research essentials, marked **Starred** or **Suggested essential**; these additions never change the All Stars snapshot or its current 708-repository count. The suggested metadata cache is `workspace/github-stars/data/research-essentials.json`. Refresh it manually with `npm run research:sync`, review the diff, then run `npm test` and `npm run build`. Refreshing metadata does not rewrite folder memberships, and a failed request preserves the previous cache. Neither GitHub Actions nor visitors fetch live GitHub metadata.

The About page photo (and its copy on the Art page) turns into a living portrait when clicked: Richard drawn in code in six styles, with a scribble burst between them. Its code and data live in `workspace/portrait/`; `tools/portrait-prep.py` regenerates the data from new photos. See [workspace/portrait/README.md](workspace/portrait/README.md).

Experience tags on About and Research float as poppable soap bubbles up the column under each date, with an opt-in pop sound. See [workspace/tag-bubbles/README.md](workspace/tag-bubbles/README.md).

Everything a visitor can open is listed once, in `workspace/palette/index.mjs`. Three things read that list: the command palette (the Search button in the header, or Cmd/Ctrl+K or `/` on any page with the shared header), the index in the footer, and the “Everything here” section of the Colophon. Add a destination there and it appears in all three. Unlisted pages never go in it. See [workspace/palette/README.md](workspace/palette/README.md).

The Colophon at `/colophon/` says how the site is made and credits what is borrowed. Its copy lives in `workspace/colophon/page.mjs`; the page counts on it are filled in by the build.

Link previews use the 1200×630 cards in `workspace/og/cards/`. They are drawn by `npm run og` (a local Python script; it needs Pillow and the macOS system fonts) from `workspace/og/cards.json`, and committed. The build copies them and points each page’s `og:image` at its card; a page without its own card gets its section’s card or the site card. See [workspace/og/README.md](workspace/og/README.md).

The blog publishes an RSS feed at `/blog/feed.xml` (`workspace/blog/feed.mjs`). Publications on the Research page carry a BibTeX entry built from `PUBLICATIONS` in `site/content.mjs` (`workspace/cite/`).

A missing address gets `404.html`, which lists the seven sections and suggests the nearest real page. `npm run dev` and `npm run preview` serve that page for missing paths too, as GitHub Pages does.

The `/skills/` library lives in `workspace/skills/`. Add recommended skills to `content.mjs` with a name, author, one-sentence description, repository URL, and stable slug. Names link to `/skills/#slug` for sharing. The authored-skills section is ready for future detail pages; no placeholder skill pages are published.
