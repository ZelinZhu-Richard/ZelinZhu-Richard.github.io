# Flash — holographic card station

`/flash/` is a standalone browser-local card designer. The existing site build calls `buildFlash()` to copy this directory's runtime files into `dist/flash/`. It does not load the homepage's Nuxt or Three.js runtime.

- `renderer.js` and `card.css` define the shared card and aurora. The exporter embeds these same functions, CSS, and the local font into one offline HTML file.
- `state.js` defines defaults, bounded settings, and the version 1 settings interchange format (`format: "flash-card"`, `version: 1`, `card: {...}`). Uploaded raster textures are embedded as data URLs.
- `editor.js` binds the controls and downloads. `storage.js` saves the most recent design in this browser's IndexedDB; designs never leave the browser.
- `build.mjs` embeds the font and card CSS in a generated export-assets module so downloading an interactive card needs no network request.
- `tests/` covers settings, export safety, and build integration. Run with `node --test workspace/flash/tests/*.test.mjs` or the repository's `npm test`.

The source is recreated from the supplied 16-second recording. Hidden dropdown options are practical defaults. Instrument Serif is supplied under the SIL Open Font License in `assets/OFL.txt`, from the Google Fonts `ofl/instrumentserif` directory. All other card artwork is procedural.

Custom textures are restricted to PNG, JPEG, or WebP up to 3 MiB, 8192 pixels per side, and 16 megapixels. Settings imports are validated before applying; imported text is rendered as text and escaped when embedded in the downloaded HTML.

The export supports pointer, touch, keyboard, reduced motion, and an aurora fallback without WebGL. It has no editor or network dependencies. Open the downloaded `.html` file in a browser; an email or file-manager preview may not run its interactive content.
