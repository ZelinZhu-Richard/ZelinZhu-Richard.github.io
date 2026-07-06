# Zelin (Richard) Zhu — Personal Portfolio

Galaxy-themed personal portfolio, live at **https://zelinzhu-richard.github.io/**.

React 18 + Vite + three.js (interactive particle hero) + GSAP (scroll reveals).

## Develop

```bash
npm install
npm run dev
```

## Build & preview

```bash
npm run build
npm run preview
```

## Deploy

Pushing to `main` triggers `.github/workflows/deploy.yml`, which builds the site
and publishes `dist/` to GitHub Pages. One-time setup: repo **Settings → Pages →
Source: GitHub Actions**.

## Where things live

- `src/data/content.js` — all copy, links, projects, timeline entries. Edit content here.
- `src/sections/` — one component per page section.
- `src/components/` — splash, preloader, cursor, header, scramble text, starfield.
- `src/canvas/` — three.js particle text engine + domain-expansion intro.
- `public/` — headshot, resume PDF, favicon, OG card, particle sprite.
- `fix&improve.md` — deferred features backlog.
- `q.md` — the original personalization questionnaire (source of truth for content).
