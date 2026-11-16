---
name: "A Dragon at Duke"
description: "Black pauses, white serif narration, and original inked comic stories about a dragon growing without losing himself."
colors:
  ink: "#050608"
  paper: "#f8f4ec"
  muted: "#c5ccdf"
  royal: "#00539b"
  navy: "#012169"
  violet: "#c7a8ef"
  line: "#33415b"
  control-bg: "#090e19"
  control-hover: "#172949"
  control-border: "#63738f"
  focus: "#b5dbff"
  link-hover: "#b7d9ff"
typography:
  display:
    fontFamily: "Merriweather, Georgia, serif"
    fontSize: "clamp(50px,6.7vw,96px)"
    fontWeight: 700
    lineHeight: 1.12
    letterSpacing: "-.035em"
  display-night:
    fontFamily: "Merriweather, Georgia, serif"
    fontSize: "clamp(48px,5.8vw,84px)"
    fontWeight: 700
    lineHeight: 1.12
    letterSpacing: "-.035em"
  display-selector:
    fontFamily: "Merriweather, Georgia, serif"
    fontSize: "clamp(56px,7vw,96px)"
    fontWeight: 700
    lineHeight: 1.12
    letterSpacing: "-.035em"
  display-mobile:
    fontFamily: "Merriweather, Georgia, serif"
    fontSize: "clamp(43px,11.7vw,68px)"
    fontWeight: 700
    lineHeight: 1.12
    letterSpacing: "-.035em"
  headline:
    fontFamily: "Merriweather, Georgia, serif"
    fontSize: "clamp(30px,3.4vw,48px)"
    fontWeight: 700
    lineHeight: 1.12
    letterSpacing: "-.035em"
  body:
    fontFamily: "Merriweather, Georgia, serif"
    fontSize: "18px"
    lineHeight: 1.6
  narration:
    fontFamily: "Merriweather, Georgia, serif"
    fontSize: "clamp(22px,2.4vw,31px)"
    lineHeight: 1.55
  narration-emphasis:
    fontFamily: "Merriweather, Georgia, serif"
    fontSize: "clamp(30px,4vw,52px)"
    fontWeight: 700
    lineHeight: 1.4
  label:
    fontFamily: "Merriweather, Georgia, serif"
    fontSize: "13px"
    lineHeight: 1.6
    letterSpacing: ".015em"
  action:
    fontFamily: "Merriweather, Georgia, serif"
    fontSize: "15px"
    lineHeight: 1.6
  control:
    fontFamily: "system-ui, sans-serif"
    fontSize: "13px"
    lineHeight: 1.6
rounded:
  control: "30px"
spacing:
  stage-gap: "20px"
  mobile-stage-gap: "28px"
  desktop-gutter: "24px"
  mobile-gutter: "16px"
  choice-gap: "50px"
  beat-margin: "72px"
  mobile-beat-margin: "54px"
components:
  motion-toggle:
    backgroundColor: "{colors.control-bg}"
    textColor: "{colors.paper}"
    typography: "{typography.control}"
    rounded: "{rounded.control}"
    padding: "12px 16px"
  motion-toggle-hover:
    backgroundColor: "{colors.control-hover}"
    textColor: "{colors.paper}"
  text-action:
    textColor: "{colors.paper}"
    typography: "{typography.action}"
    padding: "10px 0"
  story-navigation:
    textColor: "{colors.paper}"
    typography: "{typography.label}"
    padding: "26px 4vw"
  next-scene:
    textColor: "{colors.paper}"
    width: "48px"
    height: "48px"
  narrative-beat:
    textColor: "{colors.paper}"
    typography: "{typography.narration}"
  other-story:
    textColor: "{colors.paper}"
    padding: "35px 0"
    width: "100%"
---

# Design System: A Dragon at Duke

## Overview

**Creative North Star: "A dragon grows without losing himself"**

A Dragon at Duke extends the user-approved Wings visual language with original loose-ink outlines and flat comic shading. Black pauses give white Merriweather narration room to breathe; Duke blues and purple galaxy wings carry the characters through the night into warm communal dawn. The interface stays quiet around the illustration.

Richard remains recognizably the same dragon as his scales turn Duke blue and his horns become ivory devil horns. Preserve his face, purple eyes, galaxy wings, tail, pendant, and proportions. The blue-and-white humanoid Blue Devil is an active guide and teammate. These are approved identity constraints, not interchangeable decorative motifs.

This document records the implemented Duke feature only: the selector at /duke/, Becoming Blue at /duke/becoming-blue/, and The Night Duke Lost Its Blue at /duke/the-night-duke-lost-its-blue/. The first story remains explicitly an imagined Duke future; the second remains explicitly a fictional campus adventure. It does not define or revise the rest of the portfolio.

**Key Characteristics:**

- Large serif titles and centered narration against near-black reading space.
- Original character art with ink contours, flat shading, recognizable campus settings, and warm dawn endings.
- Native scroll, sticky illustration stages, reversible progress, and held moments of teamwork.
- Separate mobile art and copy regions, plus a complete stacked reading mode.

Extracted from the implemented `page.mjs`, `style.css`, `app.js`, `model.js`, and `assets/manifest.json`, with the approved direction recorded in `PRODUCT.md` and `IMPLEMENTATION.md`. The frontmatter is the normative token layer; `.impeccable/design.json` holds extensions and component previews.

## Colors

The palette places cool Duke blues and familiar violet character accents inside a quiet near-black frame; warmth comes primarily from the dawn illustrations.

### Primary

- **Duke Royal Blue** (`royal`) carries the transformation identity and the returning wave of blue.
- **Duke Navy** (`navy`) belongs to the approved Duke palette and the illustrated night world. It is registered in the root palette; the current CSS does not use it as a general surface fill.

### Secondary

- **Galaxy Violet** (`violet`) connects the approved purple character identity to the illustrated voice display.

### Neutral

- **Pause Ink** (`ink`) is the page canvas, the space between scenes, and the edge into which illustration fades.
- **Narration Paper** (`paper`) carries titles, narration, navigation, and control text.
- **Quiet Copy** (`muted`) carries story labels, bylines, credits, and supporting selector text.
- **Story Divider** (`line`) separates the cross-story invitation from the credits.
- **Control Night / Control Hover / Control Border** (`control-bg`, `control-hover`, `control-border`) make the small motion pill legible against the black canvas.
- **Focus Ice / Link Ice** (`focus`, `link-hover`) are functional accents for keyboard focus and hovered links.

**The Same Dragon Rule.** A transformation may change scale color and horns; it must retain Richard’s established face, purple eyes, galaxy wings, tail, pendant, and proportions.

The sidecar’s eight-step OKLCH ramps are synthesized swatch previews required by the document format. They are not an additional production palette or authorization to recolor the approved artwork.

## Typography

**Display and body:** locally served Merriweather roman and italic, with Georgia and serif fallbacks. **Motion control:** system UI sans serif.

Merriweather gives the narration the feel of a story being read. Bold compressed titles, ordinary-weight reading text, and occasional large emphatic lines form the hierarchy; the small sans serif motion control remains a utility.

- **Display:** `display`, `display-night`, and `display-selector` retain the three observed title sizes. The mobile story titles use `display-mobile`; the selector keeps its own clamp.
- **Headline:** `headline` is the two-story selector’s heading scale. At the mobile breakpoint, those headings use (33px).
- **Body:** `body` supplies the base reading inheritance. The mobile base is (16px).
- **Narration:** `narration` is centered, with a maximum line block of (780px). Mobile narration uses (22px) with line height (1.6).
- **Emphasis:** `narration-emphasis` is reserved for script emphasis rendered as bold story beats. Mobile emphasis uses (30px) with line height (1.45). Italic emphasis remains normal weight (400).
- **Label, action, control:** `label`, `action`, and `control` describe top navigation, arrow actions, and the motion pill. Mobile navigation is (11px), actions are (13px), and the control is (12px).

**The Reading Space Rule.** Keep narration in its own reading region below the scene art, including on mobile. Do not cover faces or action with story copy.

## Layout

The selector is an open two-row composition within a maximum width of (1240px). Desktop rows pair illustration and copy in (1.35fr / 1fr) columns, reversing the second row. At widths up to (700px), both rows stack art above copy. These are linked story rows, without raised card shells.

Story openings use a full small-viewport height, a large serif title, original character art, a story label, and a Begin action. Desktop titles sit beside art that fades into the canvas. Mobile openings place the art lower in the viewport and retain a separate title region.

Ordinary illustrated scenes have a maximum art width of (1060px) and an aspect ratio of (3 / 2). Copy sits below in its own container, up to (800px) wide. With enhancement, each scene becomes a sticky viewport stage; normal sections span (300svh), while the workshop and rescue span (500svh). Black gaps between sections remain part of the reading rhythm.

At the mobile breakpoint, scene art generally uses a (1.25) aspect ratio. The prototype, workshop, noodles, and rescue preserve their internal (1.5) composition inside that region. Enhanced art is constrained to (49svh), and the narration region has a separate reserved height. The transformation scene is square. Source-selected mobile image crops are supplied through picture elements where present; the runtime does not substitute an unrelated mobile composition.

Short desktop viewports, at maximum height (650px) and minimum width (701px), reduce stage dimensions and narration size. With JavaScript absent or motion disabled, stages stack normally, all beats remain visible, and the page grows with the text.

## Elevation & Depth

Interface surfaces are flat. Depth comes from original illustrated perspective, layered character cutouts, controlled camera movement, fades into black, and local light. There is no raised card shadow vocabulary. The motion pill has a border, not a shadow.

Observed effects include the inward scene-edge fade (`scene-edge` in the sidecar), a slight two-color title offset (`title-offset`), and a blue spark glow (`spark-glow`). Pendant and lantern lights use blur inside the artwork. These are scene effects, not elevation presets for new interface containers. The rescue’s catch light uses screen blending; the returning-blue layer uses color blending.

**The Complete Still Story Rule.** The static HTML and CSS must carry the complete story and resolved visual meaning before motion enhancement runs.

## Shapes

Illustration viewports and story rows are rectangular with unrounded corners. Loose ink contours belong to the drawn world. The only rounded interface control is the compact motion pill (`rounded.control`). Circular light and orbit shapes belong to the transformation art, not to an interface radius scale.

Arrow icons are thin inline SVG strokes. The next-scene arrow points down inside a (48px) square target; reading and replay actions use a right-pointing arrow. Keyboard focus is a visible (3px) outline offset by (7px).

## Components

### Motion toggle

A small, persistent utility pill. It uses the control colors, a thin border, and the control typography. It stays at the lower right, with a minimum height of (44px); the desktop offsets are (18px) from the bottom and (20px) from the right, and mobile uses (14px) on each side. Hover changes its background. Its text names the action: “Motion off” while enhanced, “Motion on” while reading. It is hidden until JavaScript initializes, follows the initial reduced-motion preference unless the reader has saved a choice, and preserves the current reading location when switching modes.

### Text actions and navigation

Begin, Replay, and story-selection actions pair serif text with the authored arrow. Hover advances the arrow by (6px) over (.2s ease). The top navigation is a quiet two-ended row linking the selector and Richard’s work. The next-scene anchor advances to the following named section or credits. All anchors use the shared visible-focus treatment; replay also returns keyboard focus to the story title.

### Story choices and credits

Each selector row is one link around artwork, title, explicit story label, and reading action. Hover scales the art to (1.025) over (.35s ease); reduced motion removes this scale. Credits retain the Richard byline, the linked Nicky Case inspiration, replay, the other story, and portfolio navigation. The other-story invitation is separated by one thin top border and generous padding.

### Narration beat

A centered HTML paragraph carries each locked script beat and its original emphasis. In enhanced mode, only the current beat is visually active in the reserved copy region. In static reading, all paragraphs are visible in sequence. There are no lettering overlays baked into the illustrations.

### Reversible workshop

The workshop assembles four parts according to current scroll progress. Its three voices begin at unequal amplitudes and resolve to equal visibility while the revision mark appears. Reversing scroll restores prior states. The earlier prototype retains its unequal voices, but the workshop’s default CSS already supplies equal-scale voices when JavaScript is absent. The sidecar preview shows the actual completed voice display, without synthesizing a new component.

### Chapel rescue

The rescue uses a tall Chapel background, a ledge, the braced Blue Devil, Richard in flight, a lantern, the cord, wind, and the final spark. Current normalized progress drives ascent, slip, cord catch, a held composition, and the final light catch. The held interval is (.76–.88); narration changes at (0, .68, .88). Only wind intensity responds to scroll velocity.

The background covers the whole scene throughout its travel: the current tower is (128%) wide at a left offset of (-28%), with no inherited maximum-width clamp. The default cord is authored against the default glove and lantern-ring positions; live rendering derives its ring endpoint from the lantern position. Preserve both physical connections when changing composition. Mobile maintains the same rescue relationship inside a separate art region.

### Richard’s transformation

Five registered transparent dragon states preserve proportions and wing roots. Adjacent states interpolate from current progress, with the lower image kept opaque to avoid a translucent dragon. Static scenes use meaningful authored stages, culminating in the complete Duke-blue dragon. Original character artwork and declared image dimensions come from the feature’s asset manifest.

## Do's and Don'ts

### Do:

- **Do** preserve the approved dragon and humanoid Blue Devil identities through every scene and transformation state.
- **Do** retain loose ink outlines, flat comic shading, black pauses, white serif narration, and warm dawn endings.
- **Do** keep the imagined-future and fictional-adventure labels visible, and keep narrative wording and emphasis sourced from the locked scripts.
- **Do** keep all story lettering in HTML and narration separate from the illustration on mobile.
- **Do** make scroll states reversible and preserve complete reading, visible focus, keyboard replay, and the fixed motion control.
- **Do** keep the workshop’s static voices equally visible and attach the static and animated rescue cord to the glove and lantern ring.

### Don't:

- **Don’t** replace Richard with a human, lose his identifying features, or replace the humanoid Blue Devil with another dragon.
- **Don’t** turn the imagined or fictional stories into claims of admission, affiliation, collaboration, or achievement.
- **Don’t** hide story beats behind JavaScript, scroll-jack the page, or make motion necessary to understand the scene.
- **Don’t** crop the rescue background short of the scene, detach the lantern cord, or retain unequal workshop voices in the resolved fallback.
- **Don’t** apply this feature’s design contract to the root portfolio or change the accepted Wings visual direction through this document.
