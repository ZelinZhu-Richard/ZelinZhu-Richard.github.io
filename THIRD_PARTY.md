# Third-party code and provenance

## Homepage and Contact page

The homepage (`/`) and the Contact page (`/contacts/`) are Richard’s own Nuxt and Vue project in `workspace/home/`. It is built ahead of time with `npm run home` (in `workspace/home/`), and the output in `workspace/home/release/` is committed. The site build checks the release stamp and copies it; CI never runs Nuxt. The pages bundle these libraries, at the versions pinned in `workspace/home/package.json`:

| Library | Version | License |
| --- | --- | --- |
| [Nuxt](https://nuxt.com/) | 4.7.0 | MIT, © 2016-present Nuxt Team |
| [Vue](https://vuejs.org/) | 3.5.46 | MIT, © 2018-present Yuxi (Evan) You |
| [three.js](https://threejs.org/) | 0.187.0 | MIT, © 2010-2026 three.js authors |
| [GSAP](https://gsap.com/), with ScrollTrigger and SplitText | 3.15.1 | GreenSock’s standard “no charge” license (not an open-source license) |

GSAP ships no license file. Its package and source files say only: “Copyright 2008-2026, GreenSock. All rights reserved. Subject to the terms at https://gsap.com/standard-license”, and its README says GSAP is free, including for commercial use. As read from that page on 2026-11-24 (the page itself is the binding text): GSAP may be used on any website or app, commercial ones included; it may not be used in a no-code visual animation builder that competes with Webflow’s; its proprietary notices must not be removed or altered; no other attribution is asked for; and Webflow may change the terms for later versions.

Nuxt’s client runtime and Vue also bring in small MIT-licensed helpers, among them vue-router and unhead. The minifier drops every library’s license comment from the bundle, so the license texts, and GSAP’s notice, ship separately at `/colophon/licenses.txt` (`workspace/colophon/licenses.txt`, written from `workspace/home/node_modules` by `node workspace/colophon/licenses.mjs`). The Colophon links to it.

Everything else on the two pages is original and made from code in this repository:

- The scene and its choreography: `workspace/home/engine/`.
- The models, textures and shaders. The room is built, painted, lit and baked in Blender by the scripts in `workspace/home/assets-src/room/` (meshes from code, every image painted by `make_textures.py`, no downloaded assets). The instrument’s geometry, the sky and the shaders are generated in `workspace/home/engine/`.
- The sounds, which `workspace/home/engine/audio/` synthesizes in the browser with Web Audio. No audio files ship.
- The words, in `workspace/home/content.mjs`.

The two pages download no fonts: they use the system serif and monospace stacks in `workspace/home/app/assets/css/home.css`.

## Display fonts: an open item

Two display fonts used by the other pages are third-party trial or demo builds. They were kept from an earlier version of the homepage and still ship at their old addresses, which the shared stylesheet `public/portfolio.css` loads:

- `public/_nuxt/TTNeorisTrialRegular.CykOY4gR.ttf`: TT Neoris Trial Regular, © 2023 TypeType, the headings face (`--font-display`). The license note inside the font file says the trial is for evaluation only, not for commercial or personal use, and points to https://typetype.org/licensing/.
- `public/_nuxt/fonnts.com-theseasons-it.CUCq9ttA.otf`: The Seasons Italic by Elena Genova, named “FSP DEMO” in the file, used by a few pages such as Paper Piano and Gym. The file carries no license text.

Neither is licensed for this use as far as this repository shows. Buying licenses or replacing both with faces whose licenses allow web use is still to do.

## Ocean background

The decorative ocean background uses [stackedlol/ascii-sharks](https://github.com/stackedlol/ascii-sharks), pinned to commit `c521e24a787e6d4cc460d4cf2b9815f25e4fe453`. Vendored TypeScript, browser JavaScript, and local adaptations are in `workspace/ascii-sharks/vendor/`; attribution and upstream license status are in `workspace/ascii-sharks/NOTICE.txt`. The site serves this code locally with no runtime dependencies or external requests. Local changes add pause/resume, limit rendering cost, and remove grid lines. The shared build adds this background to every generated HTML page.

## Supabase

Daily and HQ vendor [@supabase/supabase-js](https://github.com/supabase/supabase-js) 2.118.0 (MIT), its unmodified UMD build, in `workspace/daily/vendor/` with `SUPABASE-LICENSE.txt` and a SHA-256 `manifest.json` that `buildDaily` checks. It loads only when a Supabase project is configured.

## History: the earlier homepage

From September to November 2026 the homepage was adapted from a third-party site: a captured front end with its runtime, models, textures, fonts and audio, served from `public/`. It has been replaced by the homepage above, and none of it ships: the site build leaves those files out. They remain on disk and in git history, where the earlier versions of this file record where they came from.

The name on that earlier homepage used Ibarra Real Nova Italic (SIL Open Font License 1.1, no Reserved Font Name; © 2007 The Ibarra Real Nova Project Authors), from google/fonts at commit `89ade4fa7b7663aec69d3202d2eefd928e78c467`, subset by `workspace/hero-name/subset.py`. The current homepage does not use it. Its files and `OFL.txt` remain in `workspace/hero-name/`, with the hero line’s sand animation (`agency.js`), which was written for this site and takes only its idea from Canvas UI’s Particle Scroll component (https://canvasui.dev/).

## Personal content

Richard’s biography, experience, projects, skills, CV PDF, and portrait were retained from commit `27e53264071e9ce9d5b690833f361e5d82e80cda` of this repository. The old React/Vite interface is replaced. `asset-manifest.json` records every retained public file’s size and SHA-256 digest; it is verified on every build.

The Work, About, and Research pages provide a conventional, keyboard-accessible way to read all personal information without running the WebGL scene. No publications were supplied in the previous site, so none are invented here.
