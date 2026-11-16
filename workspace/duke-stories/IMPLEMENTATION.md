# A Dragon at Duke — accepted implementation plan

Status: Richard approved all four character images with “Yes Approve”. Both local story drafts are complete; automated and browser verification is recorded in VERIFICATION.md.

Branch: codex/duke-stories, fresh from fetched GitHub main at 7adc30210b8d665dc9e0dfa59c833f455d34e5ce.
Updated with GitHub main 38aede6c1a389fc05c707910349db9806a0d95c2 on 2026-11-16 before opening the PR.
Review checkout: this session's workspace/site-duke-stories.
Feature source: workspace/duke-stories in that checkout.
Wings remains unchanged. On 2026-11-16 Richard authorized committing, pushing the branch and opening a PR, with all three routes unlisted. No merge or live deployment is authorized.

## Deliverable

- /duke/: small two-story selector.
- /duke/becoming-blue/: Becoming Blue, explicitly an imagined Duke future about building for people, belonging and personal growth.
- /duke/the-night-duke-lost-its-blue/: fictional campus adventure through Brodhead, the quad and Duke Chapel.
- Exact narrative source: script-becoming-blue.md (21 beats) and script-night.md (24 beats). Separate quoted paragraphs are separate scroll beats; preserve wording, punctuation and emphasis.
- Both stories credit Richard Zhu and link “Inspired by Nicky Case's AI Safety Dance.” to https://aisafety.dance/conclusion/.
- Local previews, reviewable diff, original artwork, prompts, provenance and verification notes.

## Mandatory approval gate

Generate and show all four images together: shared front/side/back character sheet; Richard's five-stage transformation; airborne lantern rescue; transformed Richard and Blue Devil welcoming the viewer beside the Chapel.

Gate satisfied by Richard's explicit “Yes Approve” response to the four-image board. Complete both local drafts under this plan.

## Visual direction

Original loose ink outlines and flat comic shading, black pauses and white serif narration, generous reading space, sticky illustrations and native scroll camera effects.
Blue Devil is an active humanoid guide. Richard begins as the approved black/purple dragon and gains royal-blue scales and white devil horns. Preserve dragon face, purple eyes, wings, tail, galaxy marks, pendant and proportions.
Use Duke Royal Blue #00539B and Navy #012169 with the original purples. Official references establish recognizable mascot and architecture; generate original illustrations. Supporting students are fictional.
Character states: original black; blue accents; mixed scales; predominantly blue with emerging devil horns; complete Duke-blue dragon. Registered proportions and wing roots, adjacent-state interpolation.

## Implementation after approval

- Static HTML/CSS/JS; one requestAnimationFrame scheduler per page.
- Reuse validated Wings patterns and approved references explicitly, without modifying Wings.
- Native scrolling and position:sticky. Workshop and Chapel rescue approximately 500svh.
- Current geometry determines normalized progress. Camera, text, sparks, assembly, transformation and catch are pure progress functions; reverse scroll restores all earlier states. Velocity affects only bounded wind intensity.
- Site build integration and build-generated production metadata. Per Richard's 2026-11-16 update, all three routes are unlisted: no sitemap or portfolio nav entry, with noindex metadata.
- Keep required shared injected assets; page-level shark runtime opt-out with regression coverage.
- Explicit image dimensions, eager opening assets, prepare approaching layers, lazy-load later art.
- Optimized WebP/PNG and real alpha where needed. Mobile compositions for Brodhead, quad, Chapel ascent and finales. All lettering in HTML.
- Mobile copy separated from characters. No horizontal overflow.
- Contextual alt text, keyboard focus, fixed motion toggle, keyboard replay.
- Reduced motion and no JS: complete stacked illustrated stories.
- No audio, backend, forms or added analytics.
- Optional EqualVoice link uses a verified existing public destination. Do not invent admissions outcomes, affiliations, collaborators or achievements. Do not read private or application data.

## Verification after implementation

- Unit tests: progress boundaries and overshoot, reverse, resize, five transformation states, workshop assembly, spark collection, rescue/catch boundaries.
- Exact scripts, routes, metadata, assets, cross-story/project links and shark regression.
- Built-in IAB only, 1440px and 390px: every scene and transformation state, forward/reverse, character consistency, layering, mobile clearance, final poses.
- Keyboard, replay, motion toggle, reduced-motion initialization and true no-JS reading.
- npm test; npm run build; npm run verify. Report incomplete checks explicitly.
- Deliver local previews and reviewable diff. Do not publish or merge.
