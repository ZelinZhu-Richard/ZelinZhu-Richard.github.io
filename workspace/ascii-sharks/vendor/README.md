# ASCII sharks source provenance

The six TypeScript modules in `source/` are vendored from
https://github.com/stackedlol/ascii-sharks at commit
`c521e24a787e6d4cc460d4cf2b9815f25e4fe453`.

The upstream repository does not state a license. This record preserves the source
and attribution; it does not assign a license to the upstream work.

Local adaptations keep the upstream fish behavior, shark anatomy, glyphs, colors,
and wake rendering. `engine.ts` adds explicit pause/resume, hidden-document
suspension, a 30 fps work limit, a 1.5 device-pixel-ratio cap, and an optional fish
population argument. It renders an initial frame and redraws while paused on
resize; reduced motion displays a settled static frame. `renderer.ts` omits the
background grid lines while retaining the black base for CSS screen blending.

Regenerate the checked-in dependency-free browser ESM with `node generate.mjs`
using Node's built-in `stripTypeScriptTypes` transformer (Node 22.13+ or Node 24+).
The site's build consumes the generated `.js` modules directly.
