# Home contracts

Three boundaries: the engine facade (app to engine), the window contract (page to the rest of the site) and the release (home to the site build). The names live once, in `contract.mjs`; this file says what they mean. Events the stub does not emit yet are marked *planned*. Their payloads are the intended shape, and the real engine may still refine them.

## 1. Engine facade: `engine/index.js`

The app imports only `engine/index.js`, and only through a dynamic `import()` in `SceneCanvas.client.vue`. Importing the facade needs no packages. three.js is reached only from `load()`, through `engine/stage.js`, and lands in its own chunk, `_home/three.[hash].js`. All randomness comes from `engine/core/rng.js` (`rngFor(seed, key)`, sfc32), never from `Math.random`.

```js
const scene = createHomeScene({ canvas, mode, stones, assetsBase, quality, reducedMotion, still });
```

| Option | Type | Default | Meaning |
|---|---|---|---|
| `canvas` | `HTMLCanvasElement` | required | The one fixed, full-viewport canvas. The app sizes its backing store (device pixel ratio capped at 2). |
| `mode` | `'story' \| 'contact'` | `'story'` | `/` is story, `/contacts/` is contact. |
| `stones` | `{ id, title, subtitle, href }[]` | `[]` | The seven stones in order (`content.stones`). |
| `assetsBase` | string ending in `/` | `'/home-assets/'` | Where generated engine assets are fetched from. |
| `quality` | `'auto' \| 'high' \| 'medium' \| 'low'` | `'auto'` | `auto` lets the engine pick and change tiers. |
| `reducedMotion` | boolean | `false` | From `prefers-reduced-motion`. Means no camera flights and no idle motion. |
| `still` | boolean | `false` | Deterministic still frames for screenshots. No time-based animation. |

Unknown modes, qualities, events or stone ids throw `TypeError`. After `dispose()` every method is a no-op, and `load()` rejects.

| Method | Meaning |
|---|---|
| `async load(onProgress?)` | Loads the heavy half and draws the first frame. `onProgress(fraction)` gets values from 0 to 1. Emits `ready`. Repeat calls return the same promise. |
| `setProgress(p)` | Story scroll position, 0 to 1 over the whole page (clamped; NaN becomes 0). |
| `setMode(mode)` | `'story'` or `'contact'`, on client navigation between the two pages. |
| `setPointer(x, y)` | Pointer in CSS pixels from the canvas's top-left (the viewport, because the canvas is fixed). |
| `pick(x, y)` | The stone id under that point, or `null`. |
| `focusStone(id \| null)` | Highlights a stone, for keyboard focus on its DOM link. `null` clears it. |
| `async release(id)` | Plays the stone's "open" beat. Resolves when the app may navigate to its `href`. Resolves at once under reduced motion. |
| `setSound(on)` | Scene sound on or off. The stub has no audio. |
| `pause()` / `resume()` | Stop and restart the frame loop (hidden tab, off-screen). |
| `stats()` | `{ version, mode, progress, tier, quality, loaded, paused, disposed, sound, focused, stones, frames, drawCalls, triangles, reducedMotion, still, three }`. |
| `dispose()` | Frees GPU resources and listeners. Idempotent. |
| `on(event, fn)` | Subscribes and returns an unsubscribe function. |

| Event | Payload | When |
|---|---|---|
| `ready` | `{ mode, tier }` | First frame drawn (stub: at the end of `load()`). |
| `stone:enter` | `{ id }` | *Planned.* Pointer moves onto a stone. |
| `stone:leave` | `{ id }` | *Planned.* Pointer leaves it. |
| `stone:click` | `{ id, href }` | *Planned.* A stone is clicked on the canvas. The app awaits `release(id)` and then navigates. |
| `stones:screen` | `{ id, x, y, radius, visible }[]` | *Planned.* Stone positions on screen in CSS pixels, emitted when they change, so DOM labels and links can follow. |
| `beat` | `{ index, id, tone? }` | *Planned.* The story enters chapter `index` (0-based), whose id is `id` (for example `'c05'`). An optional `tone` updates the window contract. |
| `tier` | `{ tier, reason }` | *Planned.* Auto quality changed tier (`high`, `medium` or `low`). |
| `contextlost` | `{}` | *Planned.* The WebGL context was lost. The app sets `data-home-webgl="lost"`. |

## 2. Window contract: `window.__home`

The global exists only once the client app has booted, so it is absent without JavaScript. Set by `app/plugins/home-contract.client.js`. All fields are read-only getters.

```js
window.__home = { version: 1, ready, sound, tone, route, setSound(on) }
```

| Field | Values | Meaning |
|---|---|---|
| `version` | `1` | Bumped only for a breaking change. |
| `ready` | boolean | Becomes `true` once, when the scene has drawn its first frame or the page has settled without one (no WebGL2, or a failed load). Screenshot tools wait for it. |
| `sound` | boolean | Scene sound. Starts `false`. |
| `tone` | `'dark' \| 'light'` | How the frame behind fixed site chrome reads, so overlays (music dock, menus) can choose ink or night. Starts `'dark'`. It changes only through engine `beat` events. |
| `route` | `'story' \| 'contact'` | The current page. |
| `setSound(on)` | function | Turns scene sound on or off, and forwards it to the engine. |

Events are `CustomEvent`s dispatched on `window`. Each fires only when its value changes.

| Event | `detail` |
|---|---|
| `home:ready` | `{ route }` |
| `home:route` | `{ route }`, after a client navigation finishes |
| `home:tone` | `{ tone }` |
| `home:sound` | `{ sound }` |

Attributes on `<html>`:

| Attribute | Values | Set by |
|---|---|---|
| `data-home` | `story`, `contact` | The prerendered HTML (per-page `useHead`). Updated on client navigation. |
| `data-home-js` | `on` | The client plugin at boot. Absent without JavaScript. |
| `data-home-tone` | `dark`, `light` | The client plugin. Mirrors `tone`. |
| `data-home-sound` | `on`, `off` | The client plugin. Mirrors `sound`. |
| `data-home-webgl` | `on`, `off`, `lost` | `SceneCanvas`, after a WebGL2 probe on a throwaway canvas, and on `contextlost`. |

URL parameters, for screenshots and debugging: `?still` turns on still mode, and `?quality=high|medium|low|auto` sets the quality.

## 3. Content: `#build/site-content.mjs`

`content.mjs` exports `homeContent()`. `modules/site-content.js` runs it in node at build time and writes the JSON as the build template `#build/site-content.mjs`. The app imports only that template, so the client bundle never imports `stones/parts.mjs` or `site/content.mjs`.

```js
{ meta: { home: { title, description }, contact: { title, description } },
  hero: { name, line },
  chapters: [{ id: 'c01', text }, /* … 'c17' */],
  stones: [{ id, title, subtitle, href }],          // PARTS order
  contact: { lines: [string], links: [{ id, label, href }] } }  // email, x, github, linkedin
```

Text is plain. `\n` is a line break, `*words*` is italic, and `\n\n` separates blocks; when a chapter has more than one block, its first block is the heading. `app/utils/text.js` parses this, and no template uses `v-html`.

## 4. Release: `release/`

`npm run release` (alias `npm run home`) regenerates `release/` and its `stamp.json`. `release/` is committed. It may hold only `index.html`, `contacts/index.html`, `_home/**` and `home-assets/**`, never Nuxt's `200.html` or `404.html`. `stamp.json` is `{ sourceHash, files: [{ file, bytes, sha256 }] }`, where `sourceHash` (from `stamp.mjs`) covers `SOURCE_ROOTS` plus `JSON.stringify(homeContent())`. `checkRelease()` throws if the stamp is missing, a file falls outside the allowlist, a file differs from its stamp, or the sources have changed since the stamp was written ("Home release is stale: run npm run home"). `build.mjs` runs that check and copies the files. It never runs Nuxt.
