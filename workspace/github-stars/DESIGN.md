---
name: GitHub Stars — Richard Zhu
description: A type-first reference shelf within the existing portfolio.
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

This route extends the portfolio's existing midnight-purple and lavender identity. The large, offset italic title leads into an open reference shelf: type navigation beside ruled repository lists. The user confirmed type first, then purpose. Seven main type sections contain nested piles drawn from 12 purpose categories; the current snapshot contains 708 repositories.

Shared navigation, local fonts, and the site's global ASCII shark backdrop remain part of the surrounding portfolio. This route introduces no image assets.

## Colors

The accent marks italic emphasis, links, selected type navigation, and keyboard focus. Ink carries names and headings; quiet text carries descriptions, counts, metadata, and field labels. Translucent rules separate sections and rows. Controls use a slightly lighter purple surface. Selected type links add a faint accent wash; archived repositories use a warm text marker.

## Typography

Neoris is the regular display and reading face. Seasons supplies italic emphasis and the shared wordmark; both load from the existing local font files. Headings stay at regular weight.

The desktop title uses the display token above. Introductory copy is 28px, type headings 32px, nested purpose headings 22px, repository names 17px, descriptions 13px, and metadata 10–11px. Descriptions use a 1.65 line height and a maximum width of 72ch. Counts and metadata use tabular numerals. Repository owners are smaller and quieter than repository names.

## Layout

The main container is capped at 1320px and otherwise uses 92% width. The introduction has two equal columns with a 70px gap. Below the full-width search field, a sticky 225px type index sits beside the results with a 58px gap. Type sections have 80px bottom spacing; nested purposes are indented 22px behind a left rule. Rows use roughly 23px vertical padding; purpose sections have 56px bottom spacing.

- At 1180px and below, the index narrows to 200px, gaps tighten, and topic text is hidden.
- At 800px and below, the container uses 88% width. The shelf becomes one column and the type index becomes a horizontally scrolling strip. Its download link is hidden.
- At 520px and below, the introduction becomes one column. Purpose and language controls share a row, sorting occupies the next row, and the closing section and footer stack. Type headings shrink to 27px, purpose headings to 20px, and the nested indent to 12px. Repository descriptions shrink to 12px; the type badge remains beside the repository copy.
- The shared header shows its expanded navigation from 1400px upward. Below that, its existing Menu control opens the navigation; at 700px and below it opens within the header flow.

## Elevation & Depth

The collection is flat: thin rules, quiet surfaces, and text hierarchy provide separation without card shadows. The existing global backdrop supplies atmosphere behind the page.

## Shapes

Repository rows are unboxed. Type badges and select fields have thin borders and restrained corners using the control radius. Desktop type links have the same small radius; their mobile form gains an outline. Icons are small inline SVG strokes rather than decorative illustrations.

## Components

- **Type index and headings:** All stars is selected by default. Seven type links carry counts and `aria-current`; without JavaScript, they remain anchors to complete type sections. Type headings use `h2`; nested purpose headings use `h3`.
- **Search and filters:** A ruled search field precedes native labeled selects for purpose, language, and sorting. Defaults are an empty query, all types, all purposes, all languages, and Recently starred. Search matches every query term across repository names, descriptions, languages, and topics. Non-default state is stored in the URL; the existing `type` and `pile` parameters retain their meanings.
- **Repository row:** Owner/name link, description, language, GitHub star count, optional archived marker, up to two topics, and a separate type badge. Names and descriptions can wrap; descriptions use automatic text direction. Repository links open GitHub in a new tab.
- **Progressive browsing:** The enhanced overview shows one repository per type-and-purpose subgroup. Scoped View all actions open either a type or one purpose within a type. A selected type starts with 12 repositories per purpose; a purpose-specific view starts with 36. Show more adds up to 24 within that purpose and moves focus to the first newly exposed repository. Result counts use a polite live status. Clear search and reset actions provide recovery.
- **Static fallback:** The generated HTML contains all 708 repositories under type and purpose headings. Search and select controls appear only after the snapshot loads; loading failure leaves the full collection available with a visible status message.
- **Keyboard and motion:** Preserve the shared skip link, native controls, hidden accessible labels, and visible focus outlines (2px with 5px offset within this route). Decorative SVGs are hidden from assistive technology. Reduced-motion preferences disable route transitions and animations, alongside the shared site's reduced-motion rules.

## Do's and Don'ts

- Keep type as the primary browsing structure, with purpose piles nested inside and purpose available as a filter.
- Extend the shared typography, navigation, colors, and backdrop when changing this route.
- Preserve open rows, thin dividers, wrapping text, and complete static HTML.
- Avoid turning repositories into image cards or adding a competing visual identity.

## Research Stack extension

All Stars remains the default collection. A ruled **All Stars / Research Stack** navigation marks the current view with lavender text and an underline. Research Stack extends the same local fonts, midnight-purple palette, open rows, and thin dividers; it adds no raster assets. Its directory tree, breadcrumbs, and child-folder rows link to 21 real HTML routes under `/github/stars/research/`: the root, three parent folders, and 17 leaf folders.

- **General research:** Read papers & manage sources; Code & analyze data; Run experiments & reproduce results; Write, visualize & present.
- **AI & machine learning:** Statistics & classical ML; Deep learning & training; Computer vision; Natural language processing; Transformers & architectures; Datasets & evaluation; Time series & forecasting; Reinforcement learning.
- **Finance, econometrics & quant:** Market data & financial research; Econometrics; Portfolio construction & risk; Backtesting & trading; Financial machine learning.

Folder membership may overlap. Counts show each repository once within a folder and its descendants, so sibling counts need not add to their parent. The initial collection has 326 unique tools: 317 starred repositories and nine suggested essentials. Rows retain their type badge and metadata, add a **Starred** or **Suggested essential** source badge, and show a lavender research-use note when one is supplied. The legend explains both sources; suggested essentials remain outside All Stars and its count.

On desktop, a sticky, independently scrollable 255px directory sits beside the contents with a 50px gap. At 1180px the directory narrows to 230px and the gap to 30px. The root title reaches 96px; folder titles reach 64px. At 800px the layout becomes one column and the directory becomes a native **Browse folders** disclosure, collapsed initially after JavaScript loads. At 520px the introduction stacks, the root title is 72px, and folder titles are 36px; Type and Language share a row above Sort. Native branch disclosures support keyboard activation, visible focus, selected-ancestor emphasis, and links to each parent's complete contents. The selected branch opens initially; the root starts with General research open. Without JavaScript the outer directory remains open and every folder's complete tool list is available.

Enhanced folder lists start with 36 tools; **Show more** adds up to 36 and focuses the first newly exposed repository. Search matches every term across names, descriptions, language, topics, and research-use notes. Type and Language filters accompany Recently starred, Most GitHub stars, Recently updated, and Name A–Z sorting. Non-default query state is stored in the URL and carried through folder links. Polite live counts, Clear search, Reset filters, and an empty-state recovery action support exploration; a loading failure leaves the complete static list visible. Reduced-motion preferences remove chevron transitions.

Folder structure, membership, and research-use notes stay in the curated source manifest. The manual metadata refresh uses stable GitHub repository IDs for suggested essentials, preserves that manifest, and replaces the cache only after all requests succeed. Each page displays the metadata-check date and offers the research snapshot download.
