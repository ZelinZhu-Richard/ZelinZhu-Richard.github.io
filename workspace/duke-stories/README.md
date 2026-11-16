# A Dragon at Duke

Two original illustrated stories by Richard Zhu, built as static pages with native scroll scenes.

- `/duke/` — story selector
- `/duke/becoming-blue/` — an imagined Duke future
- `/duke/the-night-duke-lost-its-blue/` — a fictional campus adventure

## Local review

From the review checkout root:

```sh
npm test
npm run build
npm run verify
node tools/serve.mjs dist --port 8204
```

Open http://127.0.0.1:8204/duke/ in Codex's built-in browser. The stories are unlisted: direct links work, but portfolio navigation and the sitemap omit them, and all three pages carry `noindex, follow`. This is discoverability control, not access control.

## Sources

The two `script-*.md` files are the locked narrative source. `page.mjs` renders their quote paragraphs verbatim, with one paragraph per scroll beat. `build.mjs` emits the three routes and production metadata; the site build adds required shared assets while excluding these routes from the sitemap. Production verification requires noindex on precisely these three routes and rejects links to them from other portfolio pages.

`model.js` owns pure progress, transformation, workshop, spark and rescue calculations. `app.js` uses one animation-frame scheduler and current scene geometry. Reverse scrolling restores earlier states. The workshop and rescue are each 500svh, with no scroll interception. `style.css` supplies sticky scenes and complete stacked reading layouts for reduced motion and no JavaScript.

Every Duke page declares `data-ambient-background="off"`; the shared shark runtime honors that opt-out while retaining its existing behavior elsewhere.

## Art

Richard approved the four-image character gate before implementation. Original gate and production PNGs, exact prompts, reference URLs and optimized assets are retained here. See `art/PROVENANCE.md`, `art/production-manifest.json`, `art/font-provenance.json` and `assets/manifest.json`. Official reference photographs and local review evidence are excluded from Git. Only optimized assets ship through the build.

`scripts/export-art.mjs` reproduces WebP exports, mobile crops and five registered Richard variants from the retained originals. Generation itself used the built-in image tool; the export script does not generate illustrations.

The EqualVoice project link uses the existing `/work/#equalvoice` destination. The imagined and fictional labels are deliberate; the stories do not claim a Duke admissions outcome, affiliation, or real collaborators.

`DESIGN.md` and `.impeccable/design.json` record the finished visual system, its responsive layouts, controls and motion rules. See `VERIFICATION.md` for completed checks and remaining limitations. The Wings feature and checkout remain unchanged.
