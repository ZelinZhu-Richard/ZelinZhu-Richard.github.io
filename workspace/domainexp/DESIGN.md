---
name: Domain Expansion
description: Camera-first hand-framed pixel windows, open-palm fireballs, and two-palm Dust Release in Richard Zhu’s purple portfolio.
colors:
  page: "#111022"
  surface: "#0c0915"
  ink: "#f8f0fc"
  muted: "#c2bad0"
  domain: "#b589ed"
  edge: "#baa2d53d"
  emphasis: "#e0c6fa"
  primary: "#dfc4fa"
  primary-ink: "#231333"
  primary-hover: "#f0ddff"
  live-backing: "#090713e6"
  live-ink: "#f2e7ff"
  fire-selection: "#ffd39a"
  fire-ink: "#35180e"
  fire-core: "#fffceb"
  fire-orange: "#ff9c2c"
  fire-red: "#f94612"
  dust-selection: "#dcfff0"
  dust-ink: "#10271e"
typography:
  display:
    fontFamily: "Neoris, Arial, sans-serif"
    fontSize: "clamp(33px, 4vw, 54px)"
    fontWeight: 400
    lineHeight: 1.08
    letterSpacing: "-.035em"
  title:
    fontFamily: "Neoris, Arial, sans-serif"
    fontSize: "clamp(30px, 3.3vw, 52px)"
    fontWeight: 400
    lineHeight: 1.1
    letterSpacing: "-.035em"
  emphasis:
    fontFamily: "Seasons, Georgia, serif"
    fontWeight: 400
  body:
    fontFamily: "Neoris, Arial, sans-serif"
    fontSize: "14px"
    lineHeight: 1.7
  button:
    fontFamily: "Neoris, Arial, sans-serif"
    fontSize: "14px"
    lineHeight: 1.3
  effect:
    fontFamily: "Neoris, Arial, sans-serif"
    fontSize: "13px"
    lineHeight: 1.3
rounded:
  control: "3px"
spacing:
  control-x: "18px"
  control-y: "11px"
  control-gap: "9px"
  bar-gap: "28px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-ink}"
    typography: "{typography.button}"
    rounded: "{rounded.control}"
    padding: "11px 18px"
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.button}"
    rounded: "{rounded.control}"
    padding: "11px 18px"
  live-status:
    backgroundColor: "{colors.live-backing}"
    textColor: "{colors.live-ink}"
    padding: "6px 10px"
  effect-domain-selected:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-ink}"
    typography: "{typography.effect}"
    rounded: "{rounded.control}"
    padding: "10px 18px"
  effect-fireball-selected:
    backgroundColor: "{colors.fire-selection}"
    textColor: "{colors.fire-ink}"
    typography: "{typography.effect}"
    rounded: "{rounded.control}"
    padding: "10px 18px"
  effect-dust-selected:
    backgroundColor: "{colors.dust-selection}"
    textColor: "{colors.dust-ink}"
    typography: "{typography.effect}"
    rounded: "{rounded.control}"
    padding: "10px 18px"
---

# Design System: Domain Expansion

## Overview

**Creative North Star: "The webcam is the work"**

An Experience surface: the live webcam is the work. The portfolio’s deep purple ground, Neoris text, Seasons italics, pale lavender ink, and thin rules remain the visual authority. The title is compact so the camera occupies most of the first view. This document records the implemented Domain Expansion surface and its Fireball and Dust Release modes, not new rules for the whole portfolio.

Before camera permission, an authored two-hand diagram explains the Domain frame; Fireball replaces it with a single open palm, a warm glow, and a directional arrow. Dust Release uses two camera-facing palms, paired thumb and index tips with small gaps, and a mint-white cube between them. A three-mode selector above the stage changes the guidance and effect. Start camera is the primary action. During startup, Stop remains outside the loading overlay. During play, controls remain below the camera rather than obscuring the effect. The same controls and reading order persist on phones; the Domain pixel slider becomes a second row and hides in Fireball and Dust Release modes.

**Key Characteristics:**
- A large, square-cornered camera stage with a restrained editorial frame.
- Neoris interface text paired with Seasons italic emphasis.
- Pale lavender controls and an anime-inspired violet Domain boundary, with gold-orange selection and fire in Fireball mode and a local mint-white selection and cube in Dust Release.
- Explicit camera states and readable text over changing footage.

The original Domain-mode record comes from final source and desktop, mobile, and synthetic-active captures on October 15, 2026. Its finish reviewer’s ship disposition covers the four requested corrections only. Its mechanical detector used degraded regex mode with no findings; this is not a full accessibility audit. The Fireball addition is recorded from the implemented source and the [scoped Fireball review](.qa/fireball-review/review.md), whose desktop, active-desktop, and mobile captures support the visible extension. The frozen active fixture is visual evidence, not motion or physical-hand evidence. The Dust Release addition is recorded from the implemented source and the [scoped Dust review](.qa/dust-review/review.md), whose ship disposition covers this extension with no material fixes. Its desktop, active-desktop, mobile, active-mobile, and 652px captures preserve the existing frame and show the third option wrapping at 375px. The two active captures are labeled synthetic fixtures frozen at 500ms; they establish visible composition, not motion or physical seal accuracy. Physical hand tracking and mobile hardware remain unverified. See [VALIDATION.md](VALIDATION.md).

## Colors

The shared frame and Domain effect stay within the inherited purple family; Fireball adds a local warm accent and Dust Release a local mint-white accent. **Primary:** pale lavender identifies Start camera and the selected Domain option; lavender emphasis colors the page heading and keyboard focus; domain violet supplies text selection and quiet hover/link accents. **Secondary:** Fireball gold marks its selected option, introductory italic emphasis, and active status point. Its fire-ink token supplies dark selected text. The luminous fire moves from a pale core through orange and red, with a warm halo and embers. **Tertiary:** Dust mint-white marks its selected option, introductory italic emphasis, and active status point; dust-ink supplies the dark green selected text. The cube uses translucent mint faces, white-mint edges and a bright central glow, followed by pale mint particles. **Neutral:** deep purple surrounds the darker stage, pale lavender ink carries primary text, muted lavender supports instructions, and translucent rules separate regions. Bright live text sits on a near-black backing.

**The Live Text Rule.** Live camera labels and status text keep their individual dark backings as well as the stage-edge gradients. Footage must not become their only background.

## Typography

Neoris uses Arial and sans-serif fallbacks; Seasons uses Georgia and serif fallbacks and remains italic. Both font assets come from the portfolio. The Chinese subtitle additionally names PingFang SC and Microsoft YaHei fallbacks.

The display token belongs to the centered introductory headline, and the title token belongs to the page heading. At the 700px breakpoint, these become 40px and 36px respectively. Introductory body copy becomes 12px on phones. Help uses 14px text, 1.75 line height, and a 70ch maximum measure. Camera metadata uses small, spaced text; numeric pixel-size output uses tabular numerals and reserved width.

## Layout

The main container occupies 92% of the viewport, capped at 1440px. Desktop title and introductory sentence share a row. The stage, controls, brief gesture guidance, expandable help, and footer follow in reading order. The stage uses `min(64vw, 630px)` height, a 480px minimum, and a 75svh cap. At 1000px and below its height becomes 570px. At 700px and below it becomes 540px high with a 440px minimum and no viewport-height cap. Short desktop viewports also remove that cap.

At 700px and below, the title stacks, the introductory sentence’s line break hides while retaining its separating space, and Domain controls form two rows: Start/Stop and icon-only fullscreen above the full-width pixel-size row. Fireball and Dust Release hide the pixel-size row and keep fullscreen aligned to the right. The effect selector remains above the stage; its label stacks over wrapping options on phones, with Dust Release moving to another row at 375px. Fullscreen text remains available to assistive technology. Buttons retain a 46px minimum height and the slider a 44px interaction height. The portfolio navigation becomes a Menu control at narrow and intermediate widths. Fullscreen keeps the controls below the flexible camera stage.

## Elevation & Depth

The interface uses tonal layering and thin borders rather than raised cards. A restrained radial violet wash sits behind the idle illustration. Live mode adds top and bottom gradients and individual text backings. The active Domain status point has a small halo (`0 0 12px #c384ff`); Fireball uses a warm halo (`0 0 12px #ff883e`), and Dust Release a mint halo (`0 0 12px #b7f7d9`). The canvas domain combines a violet outer stroke (`#ad7cff`) with a glow (`#964cff`, blur 22 multiplied by render scale) and a pale inner stroke (`#f1e4ff`). Fireball uses radial core/halo gradients and perspective growth to read as travel toward the viewer, with a trailing flame and scattered embers. Dust Release uses translucent cube faces, luminous white-mint edges, a central radial glow, and perspective growth to suggest forward release. Buttons and panels do not receive elevation shadows.

## Shapes

The stage and dividers have straight edges. Buttons and effect options use the control-radius token. Status dots and fingertip centers are circular. In Domain mode, four fingertips define the changing polygon, and pixelation is clipped to its interior. The authored two-hand drawing introduces that geometry before permission. Fireball uses an open-palm line drawing with a circular glow and arrow before permission; live fire has a circular, flickering outline that becomes stable under reduced motion. Dust Release’s paired-palm line drawing leaves small gaps between matching fingertip pairs around a wireframe cube. Its live geometry is a luminous cube with square dust particles, clipped to the camera image.

## Components

**Buttons.** Start camera uses the filled primary variant; Stop, fullscreen, and Menu use outlined treatments. The introductory button adds an arrow, a 24px content gap, and 12px by 22px padding. Hover brightens the primary fill or adds a translucent violet fill and brighter border to secondary controls. Transitions last 180ms with ease timing. Disabled buttons use .38 opacity. Active buttons use a pressed lavender fill without scaling. Buttons, links, the slider, and help summary have a two-pixel lavender focus outline with five-pixel offset.

**Effect selector.** Native radios select Domain Expansion, Fireball / 火球, or Dust Release / 尘遁 before startup or during a live session. The selected Domain option uses the primary lavender fill; selected Fireball uses gold with dark fire ink; selected Dust Release uses mint-white with dark green dust ink. Options have thin borders, a 44px minimum height, 10px by 18px padding, and an 8px gap. Hover lightens the border. Keyboard focus draws a two-pixel lavender outline around the visible label with four-pixel offset. At 700px and below, option text becomes 12px and horizontal padding becomes 14px. Preserve native radio keyboard behavior. Switching updates the illustration, instructions, canvas accessible label, status, and help, hides the pixel control in Fireball and Dust Release, and clears the previous effect while sharing the running camera stream.

**Camera stage.** The active Domain effect uses a violet luminous boundary, four bright fingertip points with rings, a single outward activation pulse lasting 650ms, and twelve slow particles confined to its perimeter. Reduced motion keeps the boundary and points but removes the pulse and particles. In all three modes, violet outlines and joint dots show each detected hand, with gold thumb/index tips. In Domain mode, a hand counter distinguishes recognition from framing. The webcam is mirrored and contained; the image outside the Domain boundary remains unchanged apart from these tracking guides. There is no decorative top-left stage label. Camera metadata remains top right, status bottom left, and the secondary effect label hides on phones.

**Fireball guidance and effect.** One open palm is enough. The idle palm guide replaces the two-hand frame, and its warm glow matches the gold introductory emphasis. Live text distinguishes finding a palm, holding to cast, casting, and recharging. An open palm held for 160ms automatically casts once. Closing for 180ms rearms that hand; a 900ms per-hand cooldown separates casts, and both hands can cast independently. The projectile grows in perspective and travels upward from its palm origin over 950ms, with a flame trail, flickering edge, and embers. Reduced motion keeps a stationary, fixed-size fading glow at the palm origin and removes flight, trail, embers, and flicker. The violet tracking guides and readable status backings remain.

**Dust Release guidance and effect.** Both open palms face the camera, with thumb to thumb and index to index around a window. The idle diagram and mint-white introductory emphasis show this paired-fingertip seal; small gaps are accepted, with tolerance relative to hand size on screen rather than a physical centimetre measurement. Live prompts distinguish missing or turned palms, fingertip alignment, charging, release, rearming, and cooldown. A valid seal held for 450ms charges a luminous white-mint cube between the four fingertips. Its 1300ms release grows and rotates toward the viewer, with 80 square dust particles spreading outward. Observed separation for 220ms rearms the seal, and a separate 1500ms cooldown limits releases; holding the seal or losing tracking does not rearm it. Reduced motion holds the charging cube at a fixed size, then keeps the released cube stationary at its origin with fixed size and orientation while it fades; flight, changing rotation, and particles are omitted. The shared hand guides, live-text backings, permission flow, and camera session remain in use.

**Pixel size.** Shown only in Domain mode, the native labeled range runs from 6 to 40, initially 16. Its lavender accent and numeric output stay visible in that mode. Width is 140px on desktop, 115px at the intermediate breakpoint, and 60% of its row on phones. Preserve native keyboard interaction.

**Loading, status, and errors.** Empty, loading, tracking, active, stopped, denied, and model-failure states have distinct text. Loading covers only the stage with a dark translucent panel and a small outlined diamond rotating on a 1.6s cycle. Stop remains reachable below it. Status changes are announced only when the text changes. Errors appear below controls in a bordered plum notice with pale rose text. Reduced motion removes CSS animations and transitions.

**Navigation and help.** The portfolio wordmark uses Seasons italic; the current destination is underlined. Menu exposes its expanded state. The native help disclosure has a thin upper rule and readable paragraph measure. Only the selected mode’s help is visible: Domain explains the two-hand frame; “Casting a fireball” explains open-palm casting, close/reopen rearming, independent hands, and reduced motion; “Releasing 尘遁” explains camera-facing palms, matching fingertip pairs, small-gap tolerance, separation to recast, and the stationary reduced-motion cube. Help and footer links use underlined, offset decoration. A skip link leads to the experience.

Camera processing is local; the initial view clearly states this. All three effects share the same permission and local hand model. Native buttons and radios, a labeled range input, accessible fullscreen state, and visible focus preserve non-gesture access to every control.

## Do's and Don'ts

### Do:
- **Do** preserve Neoris and Seasons, the purple ground, pale lavender ink, and thin rules.
- **Do** keep Start camera prominent and Stop reachable during loading.
- **Do** keep live labels on their dark backings and retain visible keyboard focus.
- **Do** preserve the mobile control order and native labeled slider in Domain mode; hide the slider in Fireball and Dust Release modes.
- **Do** retain the Domain boundary and fingertip points under reduced motion, use a stationary fading glow for Fireball, and keep Dust Release stationary with fixed size and orientation and no particles.
- **Do** use the local gold-orange accent, one-palm guide, and mode-specific help for Fireball while preserving the shared purple frame.
- **Do** use Dust Release’s mint-white accent, paired-palm cube guide, and hand-relative gap language while preserving the shared purple frame.
- **Do** preserve native radio selection, phone wrapping, and visible focus when switching effects.

### Don't:
- **Don't** move controls over the live effect.
- **Don't** apply Domain pixelation outside the fingertip-defined window; finger outlines and the boundary glow may extend outside it.
- **Don't** restore the decorative stage label or lose sentence spacing on mobile.
- **Don't** treat synthetic captures as evidence of physical hand-tracking accuracy.
