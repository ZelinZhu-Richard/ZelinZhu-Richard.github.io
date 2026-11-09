---
name: Domain Expansion
description: Webcam hand-tracking toy on the site's paper-and-ink look. The camera sits on a dark ink stage; controls, copy and help sit on paper.
colors:
  paper: "#f4f3ee"        # page, from portfolio.css --paper
  paper-2: "#e9e7e0"      # disabled buttons, option hover
  card: "#fbfbf9"         # secondary buttons, unselected options, error notice
  ink: "#161514"          # text, borders, primary button, selected option
  muted: "#57544e"        # labels, secondary notes
  faint: "#8a867e"        # idle status square (graphic only, never text)
  line: "#d6d3ca"         # disabled borders
  accent: "#b93c0b"       # focus ring, live/active state, fire guide core
  danger: "#a4231b"       # error notice border
  stage: "#161514"        # camera stage and canvas letterbox
  stage-muted: "#b4b0a7"  # secondary text and guide strokes on the stage (8.4:1)
  stage-line: "#4a4741"   # 1px borders of overlays on the stage
typography:
  display: "var(--font-display) — Neoris; h1 clamp(40px,4.6vw,68px), intro h2 clamp(30px,3.4vw,46px), loading line 30px"
  body: "var(--font-body) — serif stack; title copy 19px, intro 17px, help 17px/1.65, below-stage 18px"
  mono: "var(--font-mono) — eyebrow, Chinese subtitle, effect options, buttons, pixel size, stage labels, status, help summaries, footer"
rounded:
  everything: "0"
shadow:
  lift: "4px 4px 0 var(--ink) on button hover; 4px 4px 0 var(--accent) on primary hover"
---

# Design: Domain Expansion

The live webcam is the work. The page follows `site/DESIGN.md` and builds on the tokens in `/portfolio.css`; `style.css` adds only two stage tokens (`--stage-muted`, `--stage-line`). The shared header, nav and skip link come from the portfolio and are not restyled here.

## Layout

- Main column `min(1240px, 92%)`, aligned with the site header; `calc(100% - 32px)` at 700px and below (16px gutters, no horizontal scroll at 390px).
- Title row: a 7/5 split. Left: mono eyebrow ("Webcam experiment · MediaPipe Hands · runs in your browser"), the Neoris h1 "Domain Expansion" and the mono Chinese subtitle 领域展开. Right: one plain serif sentence (`#title-copy`) that says what to do for the selected effect. Stacks at 1000px.
- Effect picker above the stage: a mono "EFFECT" label and three native radios drawn as square bordered options. Selected is ink fill with paper text; the others are card with an ink border.
- Stage: `min(64vw, 630px)` tall, 480px minimum, 75svh cap; 570px at 1000px; 580px (480px minimum, no cap) at 700px. 1px ink border, flat `--stage` fill, no washes or gradients.
- Idle intro on the stage is left-aligned. Desktop is a 6/5 grid: heading, instruction, Start camera and the local-processing note on the left; the line-drawing guide for the selected effect on the right. Phones stack the guide above the text.
- Below the stage: control bar (Start / Stop, pixel size, fullscreen) with an ink rule under it, then a 7/5 row with the effect's instruction (serif) and the honesty note (mono, muted), then one help disclosure and the footer.
- Fullscreen keeps the controls under the flexible stage, on paper.

## Stage overlays

Camera label (top right), status (bottom left) and the effect label (bottom right, hidden on phones) are solid `--stage` boxes with a 1px `--stage-line` border and mono text. They sit over footage without blur or gradient scrims.

- Status square: faint when idle, paper while the camera is live, accent while an effect is active.
- Effect label: reads "DOMAIN · 2 HANDS", "FIREBALL · 1 PALM" or "DUST RELEASE · 2 PALMS" when idle, the tracked-hand count while live, and switches to an accent fill with paper text while the effect is active ("DOMAIN EXPANDED", "FIREBALL CAST", "尘遁 · DUST RELEASE").
- Loading covers only the stage with solid `--stage`, a small square outline turning once per 1.6s, and a Neoris line. Stop stays reachable below the stage.

## Guide drawings

Pre-permission line drawings explain each gesture. Hands are `--stage-muted` strokes, key fingertips are small paper squares, and the frame or cube is a thin paper line. The Domain frame is filled with a flat checker of paper at low opacity to show "pixels". The Fireball guide has one small solid accent disc where the fire starts, inside a dashed ring, with an arrow toward the viewer. No gradients, glows or sparkles.

## Controls

- Buttons: mono 14px, square, 1px ink border, 46px minimum height. Secondary is card with ink text; primary (Start camera) is ink with paper text. The Start button on the stage is inverted to paper with ink text. Hover (fine pointers only) lifts the button 2px with the hard 4px ink shadow, or an accent shadow for primary. Disabled is paper-2 with muted text and a line border.
- Pixel size: native range (6 to 40, default 16), `accent-color: ink`, mono label and tabular number. Shown only in Domain mode; Fireball and Dust Release hide it and push fullscreen to the right.
- Focus: 2px accent outline with 4px offset on buttons, links, the range, help summaries and the visible label of the focused radio. Inside the stage the focus outline is paper for contrast on ink.
- Errors: card notice with a 1px danger border and a 4px danger left edge, ink text.

## In-camera art (unchanged)

The canvas effects are the piece and keep their own colours: violet finger outlines with gold thumb and index tips; the violet Domain boundary with its glow, activation pulse and perimeter particles; the orange-red fireball with trail and embers; the mint-white Dust Release cube and particles. The only canvas change is the letterbox fill around the contained video, now `#161514` to match the stage. Help text still refers to the violet outlines and gold dots because that is what the camera view shows.

## Copy

Plain sentences that say what to do and what happens. Chinese mode names stay (领域展开, 火球, 尘遁). The page states its limits: video is processed in the browser and never uploaded or recorded, and the effect is a toy, not a privacy filter, because the plain camera image shows whenever tracking loses a hand.

## Motion and accessibility

- `prefers-reduced-motion: reduce` removes CSS animation and transitions (button lift, loading turn); the canvas effects follow their own reduced-motion paths (stationary boundary, still fading fireball glow and cube).
- Text contrast: ink on paper and paper on stage above 15:1; muted on paper 6.8:1; stage-muted on stage 8.4:1; paper on accent 5.1:1. Accent and faint are used on the stage only for non-text indicators.
- Native buttons, radios and range keep keyboard access to every control without gestures. Status changes are announced only when the text changes.

## Do and don't

- Do keep controls below the stage, never over the live effect.
- Do keep overlays solid with a 1px border so footage is never their only background.
- Don't reintroduce purple UI chrome, glows, blurred shadows, gradients, rounded or pill controls, or serif-italic accent words.
- Don't treat synthetic captures as evidence of physical hand-tracking accuracy. See [VALIDATION.md](VALIDATION.md).
