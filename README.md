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

Edit personal information in `site/content.mjs`, the phoenix narrative in `site/story.mjs`, and detail-page templates in `site/pages.mjs`. Restart development after edits. `public/` contains the adapted Nuxt/Vue phoenix runtime and its local assets; it is a captured frontend, not the agency’s original Nuxt source project. See [THIRD_PARTY.md](THIRD_PARTY.md) for provenance. After intentional changes to `public/`, run `npm run manifest` to update its integrity inventory.

GitHub Actions builds on pushes to `main`, verifies the site, uploads **dist/**, and deploys through GitHub Pages. All paths use `/` for this GitHub user site. Detail pages have real HTML files and work on direct navigation and refresh; unknown paths return 404. No SPA fallback or server backend is required.
