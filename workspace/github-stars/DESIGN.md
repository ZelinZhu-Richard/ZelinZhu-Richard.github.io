---
name: GitHub Stars — Richard Zhu
description: A type-first reference shelf within the existing portfolio.
colors:
  paper: "#f4f3ee"
  paper-2: "#e9e7e0"
  card: "#fbfbf9"
  ink: "#161514"
  muted: "#57544e"
  line: "#d6d3ca"
  accent: "#b93c0b"
typography:
  display:
    fontFamily: "var(--font-display) (Neoris)"
    fontSize: "clamp(52px, 7vw, 104px)"
    fontWeight: 400
    lineHeight: 0.98
    letterSpacing: "-.045em"
  body:
    fontFamily: "var(--font-body) (book serif)"
    fontSize: "15-16px"
    lineHeight: 1.6
  label:
    fontFamily: "var(--font-mono)"
    fontSize: "11-14px"
rounded:
  control: "0"
---

# Design System: GitHub Stars

## Overview

This route uses the site's paper-and-ink design (`site/DESIGN.md`, tokens from `/portfolio.css`). A plain left-aligned title and a short factual description (7/5 split) lead into an open reference shelf: type navigation beside ruled repository lists. The user confirmed type first, then purpose. Seven main type sections contain nested piles drawn from 12 purpose categories; the current snapshot contains 708 repositories.

Shared navigation, local fonts, and the site's global ASCII shark backdrop remain part of the surrounding portfolio. This route introduces no image assets.

## Colors

Only the shared tokens. Ink carries names, headings and selected states; muted carries descriptions, counts, metadata and field labels. 1px rules in `--ink` separate major blocks and `--line` separates rows. The selected type link and folder link are filled ink with paper text. The accent is kept for keyboard focus, link hover and the shared header's current item. Archived repositories use `--warn` text. No translucent fills, glows or gradients.

## Typography

Neoris (`--font-display`) for headings and repository names, at regular weight, with no italic accent word. The book serif (`--font-body`) for intro copy and descriptions. `--font-mono` for labels, filters, counts, dates, chips, type badges, buttons, breadcrumbs and the folder tree. Counts use tabular numerals.

## Layout

The main container is the shared `main` (1240px cap, 92% width; 16px gutters at 700px and below). The introduction is a 7/5 split. Below a bordered search field, a sticky 220px type index sits beside the results with a 56px gap. Type sections have 88px bottom spacing; nested purposes are indented 22px behind a left rule.

- At 1180px and below, the index narrows to 200px, gaps tighten, and topic text is hidden.
- At 800px and below, the introduction and shelf become one column and the type index becomes a horizontally scrolling strip of square outlined links. Its download link is hidden.
- At 520px and below, purpose and language controls share a row, sorting occupies the next row, and the closing section and footer stack. The type badge remains beside the repository copy.

## Elevation & Depth

Flat: 1px rules and text hierarchy. The only lift is the hard `--shadow` on the Show more button on hover.

## Shapes

Square corners throughout. Repository rows are unboxed. Type badges and source chips are small 1px-bordered squares in mono. Select fields and the search field have 1px ink borders and no radius. Icons are small inline SVG strokes.

## Components

- **Type index and headings:** All stars is selected by default. Seven type links carry counts and `aria-current`; without JavaScript, they remain anchors to complete type sections. Type headings use `h2`; nested purpose headings use `h3`.
- **Search and filters:** A ruled search field precedes native labeled selects for purpose, language, and sorting. Defaults are an empty query, all types, all purposes, all languages, and Recently starred. Search matches every query term across repository names, descriptions, languages, and topics. Non-default state is stored in the URL; the existing `type` and `pile` parameters retain their meanings.
- **Repository row:** Owner/name link, description, language, GitHub star count, optional archived marker, up to two topics, and a separate type badge. Names and descriptions can wrap; descriptions use automatic text direction. Repository links open GitHub in a new tab.
- **Progressive browsing:** The enhanced overview shows one repository per type-and-purpose subgroup. Scoped View all actions open either a type or one purpose within a type. A selected type starts with 12 repositories per purpose; a purpose-specific view starts with 36. Show more adds up to 24 within that purpose and moves focus to the first newly exposed repository. Result counts use a polite live status. Clear search and reset actions provide recovery.
- **Static fallback:** The generated HTML contains all 708 repositories under type and purpose headings. Search and select controls appear only after the snapshot loads; loading failure leaves the full collection available with a visible status message.
- **Keyboard and motion:** Preserve the shared skip link, native controls, hidden accessible labels, and visible focus outlines (2px accent, 3px offset within this route; the search field shows it on the whole bar). Decorative SVGs are hidden from assistive technology. Reduced-motion preferences disable route transitions and animations, alongside the shared site's reduced-motion rules.

## Do's and Don'ts

- Keep type as the primary browsing structure, with purpose piles nested inside and purpose available as a filter.
- Extend the shared typography, navigation, colors, and backdrop when changing this route.
- Preserve open rows, thin dividers, wrapping text, and complete static HTML.
- Avoid turning repositories into image cards or adding a competing visual identity.

## Research Stack extension

All Stars remains the default collection. A ruled **All Stars / Research Stack** navigation marks the current view with ink text and a 2px ink underline. Research Stack uses the same tokens, open rows, and thin dividers; it adds no raster assets. Its directory tree, breadcrumbs, and child-folder rows link to 21 real HTML routes under `/github/stars/research/`: the root, three parent folders, and 17 leaf folders.

- **General research:** Read papers & manage sources; Code & analyze data; Run experiments & reproduce results; Write, visualize & present.
- **AI & machine learning:** Statistics & classical ML; Deep learning & training; Computer vision; Natural language processing; Transformers & architectures; Datasets & evaluation; Time series & forecasting; Reinforcement learning.
- **Finance, econometrics & quant:** Market data & financial research; Econometrics; Portfolio construction & risk; Backtesting & trading; Financial machine learning.

Folder membership may overlap. Counts show each repository once within a folder and its descendants, so sibling counts need not add to their parent. The initial collection has 326 unique tools: 317 starred repositories and nine suggested essentials. Rows retain their type badge and metadata, add a **Starred** (ink outline) or **Suggested essential** (dashed outline on paper-2) source badge, and show a research-use note (ink text behind a 2px left rule) when one is supplied. The legend explains both sources; suggested essentials remain outside All Stars and its count.

On desktop, a sticky, independently scrollable 250px directory sits beside the contents with a 48px gap. At 1180px the directory narrows to 230px and the gap to 30px. The root title uses the shared h1; folder titles reach 64px. At 800px the layout becomes one column and the directory becomes a native **Browse folders** disclosure, collapsed initially after JavaScript loads. The introduction stacks at 800px. At 520px folder titles are 36px; Type and Language share a row above Sort. Native branch disclosures support keyboard activation, visible focus, selected-ancestor emphasis, and links to each parent's complete contents. The selected branch opens initially; the root starts with General research open. Without JavaScript the outer directory remains open and every folder's complete tool list is available.

Enhanced folder lists start with 36 tools; **Show more** adds up to 36 and focuses the first newly exposed repository. Search matches every term across names, descriptions, language, topics, and research-use notes. Type and Language filters accompany Recently starred, Most GitHub stars, Recently updated, and Name A–Z sorting. Non-default query state is stored in the URL and carried through folder links. Polite live counts, Clear search, Reset filters, and an empty-state recovery action support exploration; a loading failure leaves the complete static list visible. Reduced-motion preferences remove chevron transitions.

Folder structure, membership, and research-use notes stay in the curated source manifest. The manual metadata refresh uses stable GitHub repository IDs for suggested essentials, preserves that manifest, and replaces the cache only after all requests succeed. Each page displays the metadata-check date and offers the research snapshot download.
