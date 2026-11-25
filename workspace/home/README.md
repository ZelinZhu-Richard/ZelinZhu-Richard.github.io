# Home

The homepage (`/`) and the Contact page (`/contacts/`), built as a small Nuxt 4 app (plain JavaScript with JSDoc). Both pages share one Three.js scene. Today it is a stub with the real interface: the pages are complete, readable without JavaScript, and draw nothing on the canvas yet. ART.md is the art brief. `sketches/` holds concept stills that never ship.

Nuxt, Vue, three and gsap are installed only here, in `workspace/home/node_modules`. The site root stays dependency-free. CI never runs Nuxt: it only copies the committed `release/`.

## Commands

Run these in `workspace/home/`:

| Command | What it does |
|---|---|
| `npm run dev` | Nuxt dev server. Restart it after editing `content.mjs`, `site/content.mjs` or `stones/parts.mjs`. |
| `npm run release` (or `npm run home`) | Runs `nuxt generate`, then replaces `release/` with the allowlisted output and writes `release/stamp.json`. Fails if any file contains `/Users/` or `localhost`. |
| `npm run check` | Rebuilds from scratch in `_dev/check-*/` and checks that the result matches `release/` byte for byte. |
| `npm test` | The node:test suite in `tests/`. It needs no packages and resolves every path from its own location, so `node --test <path>/workspace/home/tests/*.test.mjs` works from any folder. |
| `npm run sketches` | Serves `sketches/` at http://127.0.0.1:8210/sketches/. |

If `nuxt generate` reports that the esbuild binary is missing (install scripts were skipped), run `node node_modules/esbuild/install.js` once.

## release/ is generated and committed

Do not edit `release/` by hand. It holds `index.html`, `contacts/index.html`, the `_home/` build assets and, later, `home-assets/`, plus `stamp.json`. The stamp records a hash of the sources (`app/`, `engine/`, `modules/`, `scripts/`, `public/`, `content.mjs`, `contract.mjs`, `nuxt.config.js`, `package.json`, `package-lock.json`) and of `homeContent()`, so a change to any of them, or to the PARTS and LINKS it reads, makes the release stale. Run `npm run release` and commit `release/` together with the source change.

`build.mjs` exports `buildHome(output, { index })` for the site build, and `tools/build.mjs` calls it. It checks the stamp and copies the release into `output`. With `index` (the site build passes `siteIndex()` from `workspace/palette/index.mjs`), it also adds the site index, a plain `<nav id="home-index">` of every public destination, at the end of both pages, after `#__home`, so the app's markup and hydration are untouched, and the blog's feed link in the head. Without `index` the copy is byte-identical to `release/`. `build.mjs` also decides which files in the site's `public/` ship: the retired captured homepage there stays on disk but is left out, except its two fonts in `public/_nuxt/`, which the other pages load.

## Layout

| Path | Contents |
|---|---|
| `nuxt.config.js` | Static generate of `/` and `/contacts/`. Assets under `/_home/`, root `#__home`, a constant build id, and three in its own chunk. |
| `content.mjs` | `homeContent()`: every word on both pages (zero-dependency). |
| `modules/site-content.js` | Turns `homeContent()` into the build template `#build/site-content.mjs`. |
| `app/` | `app.vue`, the two pages, components, the window-contract plugin and `assets/css/home.css`. |
| `engine/` | The scene facade (`index.js`), its heavy half (`stage.js`) and `core/rng.js`. |
| `contract.mjs`, `CONTRACTS.md` | The names shared by the app, the engine and the rest of the site, and what they mean. |
| `stamp.mjs`, `scripts/`, `build.mjs` | The release: stamp, generate, check and copy. |
