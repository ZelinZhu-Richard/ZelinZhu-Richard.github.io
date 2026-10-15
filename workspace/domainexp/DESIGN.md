---
name: Domain Expansion
description: A camera-first hand-framed pixel window in Richard Zhu’s purple portfolio.
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
---

# Design System: Domain Expansion

## Overview

**Creative North Star: "The webcam is the work"**

An Experience surface: the live webcam is the work. The portfolio’s deep purple ground, Neoris text, Seasons italics, pale lavender ink, and thin rules remain the visual authority. The title is compact so the camera occupies most of the first view. This document records the implemented Domain Expansion surface, not new rules for the whole portfolio.

Before camera permission, an authored two-hand diagram explains the frame. Start camera is the primary action. During startup, Stop remains outside the loading overlay. During play, controls remain below the camera rather than obscuring the domain. The same controls and reading order persist on phones; the pixel slider becomes a second row.

**Key Characteristics:**
- A large, square-cornered camera stage with a restrained editorial frame.
- Neoris interface text paired with Seasons italic emphasis.
- Pale lavender controls and an anime-inspired violet domain boundary.
- Explicit camera states and readable text over changing footage.

Recorded from final source and desktop, mobile, and synthetic-active captures on October 15, 2026. The finish reviewer’s ship disposition covers the four requested corrections only. The mechanical detector used degraded regex mode with no findings; this is not a full accessibility audit. Physical hand tracking and mobile hardware remain unverified. See [VALIDATION.md](VALIDATION.md).

## Colors

The palette stays within the inherited purple family. **Primary:** pale lavender identifies Start camera; lavender emphasis colors the italic headings and keyboard focus; domain violet supplies selection and quiet hover/link accents. **Neutral:** deep purple surrounds the darker stage, pale lavender ink carries primary text, muted lavender supports instructions, and translucent rules separate regions. Bright live text sits on a near-black backing.

**The Live Text Rule.** Live camera labels and status text keep their individual dark backings as well as the stage-edge gradients. Footage must not become their only background.

## Typography

Neoris uses Arial and sans-serif fallbacks; Seasons uses Georgia and serif fallbacks and remains italic. Both font assets come from the portfolio. The Chinese subtitle additionally names PingFang SC and Microsoft YaHei fallbacks.

The display token belongs to the centered introductory headline, and the title token belongs to the page heading. At the 700px breakpoint, these become 40px and 36px respectively. Introductory body copy becomes 12px on phones. Help uses 14px text, 1.75 line height, and a 70ch maximum measure. Camera metadata uses small, spaced text; numeric pixel-size output uses tabular numerals and reserved width.

## Layout

The main container occupies 92% of the viewport, capped at 1440px. Desktop title and introductory sentence share a row. The stage, controls, brief gesture guidance, expandable help, and footer follow in reading order. The stage uses `min(64vw, 630px)` height, a 480px minimum, and a 75svh cap. At 1000px and below its height becomes 570px. At 700px and below it becomes 540px high with a 440px minimum and no viewport-height cap. Short desktop viewports also remove that cap.

At 700px and below, the title stacks, the introductory sentence’s line break hides while retaining its separating space, and the controls form two rows: Start/Stop and icon-only fullscreen above the full-width pixel-size row. Fullscreen text remains available to assistive technology. Buttons retain a 46px minimum height and the slider a 44px interaction height. The portfolio navigation becomes a Menu control at narrow and intermediate widths. Fullscreen keeps the controls below the flexible camera stage.

## Elevation & Depth

The interface uses tonal layering and thin borders rather than raised cards. A restrained radial violet wash sits behind the idle illustration. Live mode adds top and bottom gradients and individual text backings. The active status point has a small halo (`0 0 12px #c384ff`). The canvas domain combines a violet outer stroke (`#ad7cff`) with a glow (`#964cff`, blur 22 multiplied by render scale) and a pale inner stroke (`#f1e4ff`). Buttons and panels do not receive elevation shadows.

## Shapes

The stage and dividers have straight edges. Buttons use the control-radius token. Status dots and fingertip centers are circular. Four fingertips define the changing polygon, and pixelation is clipped to its interior. The authored two-hand drawing introduces that geometry before permission.

## Components

**Buttons.** Start camera uses the filled primary variant; Stop, fullscreen, and Menu use outlined treatments. The introductory button adds an arrow, a 24px content gap, and 12px by 22px padding. Hover brightens the primary fill or adds a translucent violet fill and brighter border to secondary controls. Transitions last 180ms with ease timing. Disabled buttons use .38 opacity. Active buttons use a pressed lavender fill without scaling. Buttons, links, the slider, and help summary have a two-pixel lavender focus outline with five-pixel offset.

**Camera stage.** The active domain uses a violet luminous boundary, four bright fingertip points with rings, a single outward activation pulse lasting 650ms, and twelve slow particles confined to its perimeter. Reduced motion keeps the boundary and points but removes the pulse and particles. Violet outlines and joint dots show each detected hand before activation, with gold thumb/index tips. A hand counter distinguishes recognition from framing. The webcam is mirrored and contained; the image outside the boundary remains unchanged apart from these tracking guides. There is no decorative top-left stage label. Camera metadata remains top right, status bottom left, and the secondary domain label hides on phones.

**Pixel size.** The native labeled range runs from 6 to 40, initially 16. Its lavender accent and numeric output stay visible. Width is 140px on desktop, 115px at the intermediate breakpoint, and 60% of its row on phones. Preserve native keyboard interaction.

**Loading, status, and errors.** Empty, loading, tracking, active, stopped, denied, and model-failure states have distinct text. Loading covers only the stage with a dark translucent panel and a small outlined diamond rotating on a 1.6s cycle. Stop remains reachable below it. Status changes are announced only when the text changes. Errors appear below controls in a bordered plum notice with pale rose text. Reduced motion removes CSS animations and transitions.

**Navigation and help.** The portfolio wordmark uses Seasons italic; the current destination is underlined. Menu exposes its expanded state. The native help disclosure has a thin upper rule and readable paragraph measure. Help and footer links use underlined, offset decoration. A skip link leads to the experience.

Camera processing is local; the initial view clearly states this. Native buttons, a labeled range input, accessible fullscreen state, and visible focus preserve non-gesture access to every control.

## Do's and Don'ts

### Do:
- **Do** preserve Neoris and Seasons, the purple ground, pale lavender ink, and thin rules.
- **Do** keep Start camera prominent and Stop reachable during loading.
- **Do** keep live labels on their dark backings and retain visible keyboard focus.
- **Do** preserve the mobile control order and native labeled slider.
- **Do** retain the boundary and fingertip points under reduced motion.

### Don't:
- **Don't** move controls over the live domain.
- **Don't** apply pixelation outside the fingertip-defined window; finger outlines and the boundary glow may extend outside it.
- **Don't** restore the decorative stage label or lose sentence spacing on mobile.
- **Don't** treat synthetic captures as evidence of physical hand-tracking accuracy.
