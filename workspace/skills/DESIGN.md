# Skills page

Code-derived documentation for the narrow `/skills/` extension. The approved product structure is recorded in `PRODUCT.md`; no separate visual comp was supplied. This surface continues the existing portfolio design.

## Content and ownership

| Source | Owns |
| --- | --- |
| `content.mjs` | `usedSkills`: each entry's stable `slug`, display `name`, `author`, one-sentence `description`, and upstream `repository` URL. |
| `page.mjs` | Page introduction, section headings, in-page navigation, entry markup, repository-link labels, and the authored-skills empty state. Content fields are HTML-escaped during rendering. |
| `style.css` | Skills-specific section grid, spacing, entry typography, wrapping, and mobile layout. |
| `../../public/portfolio.css` | Existing background, fonts, colors, page frame, actions, shared menu presentation, focus treatment, and reduced-motion behavior. |

The initial entry is **SkillSpector**, authored by **NVIDIA**, with upstream repository `https://github.com/NVIDIA/SkillSpector`. Its heading links to the stable permalink `/skills/#skillspector`. Repository links open a new tab with `noopener noreferrer`; the accessible link label announces that behavior.

The introduction links to `#skills-i-use` and `#skills-i-create`. Each section has a heading referenced by `aria-labelledby`. Used skills form an unordered list; each name is an `h3` beneath its section's `h2`.

“Skills I create” currently displays: “My own skills will appear here, with individual pages about how I design and test them.” It has no authored entries or detail-page links yet. Future supplied entries may link to `/skills/xxx/` writeups covering purpose, design, testing, and usage. Do not invent authored skills, completed writeups, capabilities, or validation claims; actual skill development belongs in its separate project.

## Visual continuity

The page inherits the fixed purple photographic background, Neoris regular text, Seasons italic emphasis, pale ink, muted supporting text, and purple accent. Section headings use italic emphasis on “use” and “create.” Thin rules and open rows continue the portfolio's existing composition.

Above 700px, sections use a `1fr 1.5fr` two-column grid with an 8% gap: heading on the left, entries or empty state on the right. Sections have 56px top and 64px bottom padding. Skill headings wrap their name and author as needed; names permit long-word wrapping. Descriptions are limited to 65 characters of typographic width. Additional entries receive a thin separator and 36px spacing.

## Responsive and interaction behavior

- **700px and below:** sections stack in one column with a 32px gap and 38px/46px vertical padding; introduction bottom padding becomes 48px. The shared frame uses 88% width and its existing mobile menu.
- **701–1399px:** sections retain two columns; the shared menu button reveals an absolutely positioned navigation panel.
- **1400px and above:** the shared navigation displays inline. The main frame remains capped at 1320px and 92% width.
- Section and entry anchors have a 32px scroll margin; the shared document supplies 120px scroll padding and smooth scrolling. Reduced-motion preferences switch scrolling to `auto`.
- Links and buttons inherit a visible 2px accent focus outline with a 6px offset. The existing skip link becomes visible on focus. In-page and repository navigation use native links; this page introduces no custom focus handling.

## Verification and disposition

Completion handoff reports passing desktop and mobile browser checks, all 95 existing tests, and the build. Reviewer disposition: **SHIP**, with no material findings. This document records the implemented scoped surface and does not expand the shared design system.
