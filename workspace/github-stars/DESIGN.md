---
name: GitHub Stars — Richard Zhu
description: A purpose-first reference shelf within the existing portfolio.
colors:
  page: "#111022"
  ink: "#f8f0fc"
  quiet: "#c2bad0"
  accent: "#dfccff"
  line: "#ffffff30"
  control: "#211b34"
typography:
  display:
    fontFamily: "Neoris, Arial, sans-serif"
    fontSize: "clamp(72px, 8vw, 108px)"
    fontWeight: 400
    lineHeight: 0.98
    letterSpacing: "-.04em"
  body:
    fontFamily: "Neoris, Arial, sans-serif"
    fontSize: "16px"
    lineHeight: 1.65
  emphasis:
    fontFamily: "Seasons, Georgia, serif"
    fontWeight: 400
    letterSpacing: "-.03em"
rounded:
  control: "3px"
---

# Design System: GitHub Stars

## Overview

This route extends the portfolio's existing midnight-purple and lavender identity. The large, offset italic title leads into an open reference shelf: purpose navigation beside ruled repository lists. The current snapshot contains 708 repositories, grouped into 12 primary-purpose piles, with seven repository types as a separate filter.

Shared navigation, local fonts, and the site's global ASCII shark backdrop remain part of the surrounding portfolio. This route introduces no image assets.

## Colors

The accent marks italic emphasis, links, selected purpose navigation, and keyboard focus. Ink carries names and headings; quiet text carries descriptions, counts, metadata, and field labels. Translucent rules separate sections and rows. Controls use a slightly lighter purple surface. Selected piles add a faint accent wash; archived repositories use a warm text marker.

## Typography

Neoris is the regular display and reading face. Seasons supplies italic emphasis and the shared wordmark; both load from the existing local font files. Headings stay at regular weight.

The desktop title uses the display token above. Introductory copy is 28px, pile headings 27px, repository names 17px, descriptions 13px, and metadata 10–11px. Descriptions use a 1.65 line height and a maximum width of 72ch. Counts and metadata use tabular numerals. Repository owners are smaller and quieter than repository names.

## Layout

The main container is capped at 1320px and otherwise uses 92% width. The introduction has two equal columns with a 70px gap. Below the full-width search field, a sticky 225px purpose index sits beside the results with a 58px gap. Rows use roughly 23px vertical padding; pile sections have 56px bottom spacing.

- At 1180px and below, the index narrows to 200px, gaps tighten, and topic text is hidden.
- At 800px and below, the container uses 88% width. The shelf becomes one column and the purpose index becomes a horizontally scrolling strip. Its download link is hidden.
- At 520px and below, the introduction becomes one column. Type and language controls share a row, sorting occupies the next row, and the closing section and footer stack. Repository descriptions shrink to 12px; the type badge remains beside the repository copy.
- The shared header shows its expanded navigation from 1400px upward. Below that, its existing Menu control opens the navigation; at 700px and below it opens within the header flow.

## Elevation & Depth

The collection is flat: thin rules, quiet surfaces, and text hierarchy provide separation without card shadows. The existing global backdrop supplies atmosphere behind the page.

## Shapes

Repository rows are unboxed. Type badges and select fields have thin borders and restrained corners using the control radius. Desktop purpose links have the same small radius; their mobile form gains an outline. Icons are small inline SVG strokes rather than decorative illustrations.

## Components

- **Purpose index:** All stars is selected by default. Links carry counts and `aria-current`; without JavaScript, they remain anchors to the complete pile sections.
- **Search and filters:** A ruled search field precedes native labeled selects for type, language, and sorting. Defaults are an empty query, all purposes, all types, all languages, and Recently starred. Search matches every query term across repository names, descriptions, languages, and topics. Non-default state is stored in the URL.
- **Repository row:** Owner/name link, description, language, GitHub star count, optional archived marker, up to two topics, and a separate type badge. Names and descriptions can wrap; descriptions use automatic text direction. Repository links open GitHub in a new tab.
- **Progressive browsing:** The enhanced overview shows up to four repositories per pile. View all opens one pile with 36 results initially; Show more adds 36 and moves focus to the first newly exposed repository. Result counts update through a polite live status. Clear search, Reset filters, and the empty-state reset provide recovery.
- **Static fallback:** The generated HTML contains every repository. Search and select controls appear only after the snapshot loads; loading failure leaves the full collection available with a visible status message.
- **Keyboard and motion:** Preserve the shared skip link, native controls, hidden accessible labels, and visible focus outlines (2px with 5px offset within this route). Decorative SVGs are hidden from assistive technology. Reduced-motion preferences disable route transitions and animations, alongside the shared site's reduced-motion rules.

## Do's and Don'ts

- Keep purpose as the primary browsing structure and type as an independent filter.
- Extend the shared typography, navigation, colors, and backdrop when changing this route.
- Preserve open rows, thin dividers, wrapping text, and complete static HTML.
- Avoid turning repositories into image cards or adding a competing visual identity.
