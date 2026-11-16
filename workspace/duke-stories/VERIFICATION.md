# Duke stories verification

Review branch: `codex/duke-stories`, based on GitHub main `7adc30210b8d665dc9e0dfa59c833f455d34e5ce`.

## Automated coverage

The feature tests cover normalized progress at both endpoints and overshoot, reverse scrolling, resize mid-scene, all five transformation states, prototype assembly, spark collection, and rescue hold/catch boundaries. Build tests verify both locked script hashes and all 45 rendered narrative beats, routes, canonical metadata, asset references and dimensions, cross-story links, the existing EqualVoice anchor, raster provenance, and shark opt-out/startup/restoration behavior.

Final results after the independent review's correction batch:

| Check | Result |
| --- | --- |
| `npm test` | 671 passed; 0 failed or skipped |
| `npm run build` | Passed; all three Duke routes generated |
| `npm run verify` | Passed; 389 production files checked |
| `git diff --check` | Passed |
| Raster provenance | All 32 exported WebP assets have prompt sidecars |
| Locked copy | All 45 narrative beats match the two locked script files |

## Browser coverage

Codex's built-in IAB was used at 1440 × 900 and 390 × 844. Both openings and all sixteen story scenes were inspected, including each transformation state, prototype assembly stages, the Chapel ascent, rescue hold and catch, and both finales. Forward and reverse native scrolling restored the expected states. Resizing mid-scene recomputed progress from the new bounds. The inspected layouts had no horizontal overflow and kept narration below character art.

The actual production motion toggle was exercised by keyboard; it changed between animated and complete stacked reading modes. Replay returned to the opening and focused the story title. Both cross-story links worked. The EqualVoice link opened `/work/#equalvoice` and its existing project section; the ordinary portfolio page retained its shark control.

Two local, ignored test-server fixtures supplement the production preview:

- Port 8205 served the actual build with Content-Security-Policy `script-src 'none'`. Both stories showed all 21/24 beats and narrative illustrations in a stacked layout, with the unavailable motion control hidden.
- Port 8206 supplied a test-only reduced-motion preference object to the story runtime. Both stories initialized in reading mode. IAB does not expose native OS media-preference emulation, so this verifies the initialization branch, not a real operating-system preference switch.

The fixtures do not alter production output. Screenshots and local logs are under ignored `.impeccable/review/` and `.review/` folders.

After the correction batch, both sizes were recaptured for the rescue hold/catch, no-JavaScript rescue and workshop, and reduced-motion rescue. The no-JavaScript waveform rows have equal heights and no transforms. The actual production tab reported no browser warnings or errors before visiting the CSP fixtures (which intentionally block scripts).

## Independent visual review

A fresh reviewer inspected 35 supplied desktop/mobile captures, the four approved character images, and the relevant source. Its first disposition was `fix`: rescue-background seam, a stale no-JavaScript cord path, and unequal no-JavaScript workshop waveforms. The correction batch resolved all three. The reviewer inspected ten updated captures and source and returned `ship` at the F1–F3 fix-list scope. This verdict does not claim a new full-surface audit or independent browser run.

The harness supplied general subagents rather than a separately injected reviewer role. The fresh reviewer used the explicit five-section review contract and Impeccable craft-floor reference. Local review reports are `.review/finish-review.md` and `.review/finish-verdict.md`.

After the final corrections, a separate documenter extracted `DESIGN.md` and `.impeccable/design.json` from the implementation using the supplied document.md workflow. YAML/JSON parsing, token references, source-backed values, section order and seven component snippets were checked. The standalone documentation snippets were not browser-rendered; the actual website was inspected as described above.

## Limits

No physical-device, additional browser-engine, real screen-reader, or native OS reduced-motion test was performed. Local preview and repository verification do not constitute production deployment. No push, PR, merge or publication was performed.
