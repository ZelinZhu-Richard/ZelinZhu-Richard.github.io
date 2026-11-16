---
name: Choices
description: Scoped design record for the Choices decision map and planning guide
colors:
  night-paper: "#100f15"
  night-hover: "#1a1920"
  night-card: "#16151c"
  warm-ink: "#ece9e1"
  muted-stone: "#a8a398"
  connector-stone: "#7a766d"
  quiet-line: "#2d2b34"
  ember: "#e8743b"
typography:
  display:
    fontFamily: 'Neoris, "Helvetica Neue", Arial, sans-serif'
    fontSize: "clamp(48px, 7vw, 88px)"
    fontWeight: 400
    lineHeight: 1
    letterSpacing: "-.04em"
  lede:
    fontFamily: '"Iowan Old Style", Charter, "Sitka Text", Cambria, Georgia, serif'
    fontSize: "clamp(23px, 2.8vw, 32px)"
    lineHeight: 1.3
  headline:
    fontFamily: 'Neoris, "Helvetica Neue", Arial, sans-serif'
    fontSize: "clamp(30px, 3.5vw, 44px)"
    fontWeight: 400
    lineHeight: 1.15
    letterSpacing: "-.03em"
  school-title:
    fontFamily: 'Neoris, "Helvetica Neue", Arial, sans-serif'
    fontSize: "30px"
    fontWeight: 400
    lineHeight: 1.2
    letterSpacing: "-.025em"
  guide-subheading:
    fontFamily: 'Neoris, "Helvetica Neue", Arial, sans-serif'
    fontSize: "25px"
    fontWeight: 400
    lineHeight: 1.3
    letterSpacing: "-.02em"
  title:
    fontFamily: 'Neoris, "Helvetica Neue", Arial, sans-serif'
    fontSize: "23px"
    fontWeight: 400
    lineHeight: 1.18
    letterSpacing: "-.025em"
  route-title:
    fontFamily: 'Neoris, "Helvetica Neue", Arial, sans-serif'
    fontSize: "22px"
    fontWeight: 400
    lineHeight: 1.25
    letterSpacing: "-.02em"
  guide-row-title:
    fontFamily: 'Neoris, "Helvetica Neue", Arial, sans-serif'
    fontSize: "21px"
    fontWeight: 400
    lineHeight: 1.3
    letterSpacing: "-.02em"
  guide-intro:
    fontFamily: '"Iowan Old Style", Charter, "Sitka Text", Cambria, Georgia, serif'
    fontSize: "19px"
    lineHeight: 1.55
  guide-body:
    fontFamily: '"Iowan Old Style", Charter, "Sitka Text", Cambria, Georgia, serif'
    fontSize: "16px"
    lineHeight: 1.55
  guide-note:
    fontFamily: '"Iowan Old Style", Charter, "Sitka Text", Cambria, Georgia, serif'
    fontSize: "15px"
    lineHeight: 1.55
  body:
    fontFamily: '"Iowan Old Style", Charter, "Sitka Text", Cambria, Georgia, serif'
    fontSize: "16px"
    lineHeight: 1.45
  label:
    fontFamily: 'ui-monospace, "SF Mono", SFMono-Regular, Menlo, Consolas, monospace'
    fontSize: "11px"
    lineHeight: 1.5
  guide-label:
    fontFamily: 'ui-monospace, "SF Mono", SFMono-Regular, Menlo, Consolas, monospace'
    fontSize: "11px"
    lineHeight: 1.6
  guide-control:
    fontFamily: 'ui-monospace, "SF Mono", SFMono-Regular, Menlo, Consolas, monospace'
    fontSize: "12px"
    lineHeight: 1.5
  school-control:
    fontFamily: 'ui-monospace, "SF Mono", SFMono-Regular, Menlo, Consolas, monospace'
    fontSize: "14px"
    lineHeight: 1.5
rounded:
  surface: "2px"
spacing:
  control-gap: "8px"
  guide-section: "64px"
components:
  branch-card:
    backgroundColor: "{colors.night-card}"
    textColor: "{colors.warm-ink}"
    rounded: "{rounded.surface}"
    padding: "18px 20px"
    width: "260px"
  branch-toggle:
    backgroundColor: "transparent"
    textColor: "{colors.warm-ink}"
    rounded: "{rounded.surface}"
    width: "44px"
    height: "44px"
  layout-selected:
    backgroundColor: "{colors.warm-ink}"
    textColor: "{colors.night-paper}"
    rounded: "{rounded.surface}"
    padding: "10px 12px"
  bulk-control:
    backgroundColor: "transparent"
    textColor: "{colors.warm-ink}"
    rounded: "{rounded.surface}"
    padding: "10px 12px"
  source-link:
    textColor: "{colors.warm-ink}"
  section-link:
    textColor: "{colors.warm-ink}"
    typography: "{typography.guide-control}"
  school-selector:
    backgroundColor: "transparent"
    textColor: "{colors.warm-ink}"
    typography: "{typography.school-control}"
    rounded: "{rounded.surface}"
    padding: "14px 22px"
  school-selector-selected:
    backgroundColor: "{colors.warm-ink}"
    textColor: "{colors.night-paper}"
  fellowship-filter:
    backgroundColor: "transparent"
    textColor: "{colors.warm-ink}"
    typography: "{typography.guide-control}"
    rounded: "{rounded.surface}"
    padding: "10px 16px"
  fellowship-filter-selected:
    backgroundColor: "{colors.warm-ink}"
    textColor: "{colors.night-paper}"
  course-summary:
    textColor: "{colors.warm-ink}"
    typography: "{typography.route-title}"
    padding: "26px 38px 26px 0"
  school-commitment:
    textColor: "{colors.warm-ink}"
    typography: "{typography.guide-subheading}"
    padding: "28px 0 0"
  focus-summary:
    textColor: "{colors.warm-ink}"
    typography: "{typography.guide-row-title}"
    padding: "22px 38px 22px 0"
  research-summary:
    textColor: "{colors.warm-ink}"
    typography: "{typography.guide-row-title}"
    padding: "22px 38px 22px 0"
  summer-note:
    backgroundColor: "{colors.night-hover}"
    textColor: "{colors.warm-ink}"
    padding: "20px"
---

# Design System: Choices

## Overview

**Creative North Star: "A map of possibilities"**

Choices pairs a branching decision map with a long-form guide. The map shows how possible paths connect. The guide gives readers a place to compare school plans, inspect proposed courses and interest plans, compare transfer paths, and check the eligibility and commitment of opportunities.

The incumbent portfolio supplies the night palette, Neoris headings, book-serif prose, monospace labels, and shared ASCII shark background. The precise user request and the implemented page are the visual references.

**Key Characteristics**

- Shared night palette and shark background with an animation control in the map toolbar.
- A recursive tree with fine connectors and an equivalent mobile outline.
- A section index and ruled guide with native disclosures.

## Colors

Choices inherits the night theme from the shared portfolio stylesheet.

### Primary

Ember marks the root node, focus rings, and link hover. Selected layout, school, and opportunity controls use a warm ink fill with night paper text.

### Neutral

Night paper grounds the viewport and the tree's reading area. Night card separates branches. Night hover fills hovered controls and summer strategy notes. Warm ink carries headings and major section rules. Muted stone carries supporting prose and metadata. Connector stone draws the tree and underlines guide links. Quiet line divides disclosure rows and bounds controls.

## Typography

Neoris gives structure to headings and titles. Book serif carries the lede and the text readers use to compare options. Monospace carries controls, statuses, workload labels, term labels, fact labels, and source links.

- **Opening hierarchy.** The page title uses the display role. The serif lede follows at its own fluid size. Introductory prose uses 20px, stepping to 18px at 760px.
- **Map hierarchy.** The toolbar heading is 22px and steps to 20px at 760px. Branch titles use 23px and leaf titles 21px. Descriptions use 16px, next steps and footnotes use 14px, and monospace metadata spans 10–12px.
- **Guide hierarchy.** Section headings run 30–44px. The school title is 30px and steps to 27px at 600px. School-plan subheadings and the transfer timing heading use 25px. Route titles use 22px. Focus-plan, transfer, and research row titles use 21px, and expanded focus-plan subheadings and research item headings use 23px. Campus opportunities and alternative subject disclosures use 19px, funding titles use 18px, and next-action headings use 23px.
- **Guide reading and metadata.** Section introductions use 19px/1.55 in a measure of up to 54 characters and step to 17px at 600px. Facts use 16px/1.55 and planning notes use 15px/1.55. Course lists step from 16px to 15px at 600px. Compact source and status labels use 11px, most controls use 12px, term and year labels use 13px, and desktop school selectors use 14px.

## Layout

The shared content width is the smaller of 1240px and 92% of the viewport. The introductory columns have an 8% gap and stack at 760px. A wrapping section index precedes the decision map and links to the guide's main sections.

The desktop map reads left to right inside a keyboard-focusable scrolling region. Root, branch, and leaf widths are 200px, 260px, and 280px. Each side of a branch junction spans 42px. At 1100px, the widths tighten to 180px, 250px, and 252px, and the connectors shorten to 28px.

At 760px, the enhanced map defaults to the outline. Both layouts render the same nested list. The outline uses 12px of margin and a 16px connector at mobile sizes. Outline cards fill the available width up to 720px, with the root capped at 420px. An explicit layout choice lasts through viewport changes for that page session.

Guide sections have a full-width top rule and 64px of space on either side of it. Their heading and introduction occupy a 5:6 grid with an 8% gap. Course summary rows allocate columns to the route title and intensity, proposed degree, and estimated load. Expanded course plans use a two-column facts grid and a term sequence with a 180px term column. At 900px, section headings stack and route and fellowship summaries reorganize into two columns. At 600px, summaries, facts, terms, funding, and next-action rows stack. Section spacing drops to a 44px outer margin and 36px top padding.

Focus-plan summaries and course rows use a 1:2 grid with a 24px gap. The same timeline pattern pairs a 140px year or semester label with stacked facts. Transfer path and application timing summaries use the same 1:2 columns and 24px gap. The three workload adaptations use the guide's two-column facts grid. At 600px, focus and transfer summaries, course rows, timeline rows, and workload adaptations stack. The optional research section uses the shared two-column facts grid, timelines, and course rows. Its facts and rows also stack at 600px.

## Elevation & Depth

The build supplies the shared ASCII sharks behind the page. The tree's opaque night-paper viewport and night-card branch surfaces keep connectors and node text clear. The guide uses tonal fill for summer and capstone notes and fine horizontal rules for grouping and expanded states. Depth comes from those layers and borders.

## Shapes

Buttons and branch cards have a 2px radius. Dashed card borders identify collapsed branches. Leaf nodes are square and transparent with a single left rule. Orthogonal tree connectors and the guide's right-aligned plus/minus marks are 1px strokes. The guide disclosures use flat, full-width rows.

## Components

### Section index and decision map

The section index uses wrapping monospace links with a quiet bottom rule and 36px minimum height. Tree nodes combine a status, heading, description, and optional next step or source. The visible branch counts refer to immediate children.

Branch controls are 44px square. They name the action and branch in their accessible label and expose the controlled list and expanded state. Enhancement collapses the branches designated as initial categories. Without JavaScript, the entire tree is readable and narrow screens use a CSS outline.

Map and Outline are mutually exclusive pressed buttons. Switching resets horizontal scroll and updates reading instructions. Bulk controls disable when their action is exhausted and move focus to the inverse action before the clicked control disables. A polite live region reports branch and bulk changes.

The shared shark animation button sits in the map toolbar's normal flow and wraps with the other controls on narrow screens. Choices places the existing button there at initialization and when browser history navigation reattaches it. The button uses the shared animation handlers and settings.

### School selector and course disclosures

UNC–Chapel Hill, Duke, and Stanford each expose Stretch, Ambitious, and Balanced course plans. All course disclosures start closed by default, so the three summaries can be compared in sequence. Each summary shows intensity, degree, and estimated load. Opening it reveals the aim, weekly budget, tradeoffs, load-reduction guidance, term sequence, and summer strategy.

The school selectors appear with JavaScript as a group of mutually exclusive pressed buttons, with UNC–Chapel Hill initially selected. Without JavaScript, all three school panels are visible and their native disclosures work. Course, school-rule, alternative subject, and campus opportunity sections use native details and summary elements.

A valid course fragment such as #route-duke-balanced selects the containing school and opens the target disclosure and any enclosing disclosures. The initial URL fragment, same-page links, and hash changes share this behavior. On initial load and hash changes, the page reveals the target before scrolling it into view. Fragment handling decodes safely, resolves by element ID, and ignores malformed or missing targets.

The chosen Duke program appears beneath the school heading. A muted top rule separates the program ledger, which uses a 25px Neoris heading, a short introduction, and three credential facts in the shared grid. Its closed requirements audit uses a 12px monospace summary and opens to a second facts grid. Both grids stack at 600px.

### UNC and Duke focus plans

UNC–Chapel Hill and Duke each offer focus plans for marketing and experimentation, and for AI safety and model evaluation. The four plans supplement the chosen academic workload. Each native disclosure starts closed and shows the focus title and aim in its summary. The expanded plan starts with a suggested base route and gives seven linked course anchors, each with a purpose and access guidance. A four-year timeline presents course choices, an activity, and a concrete output at each stage. Stretch, Ambitious, and Balanced adaptations follow, then a capstone idea and source links.

Wrapping monospace links under the school heading and the matching branches in the decision map jump to the focus disclosures. With JavaScript, a fragment such as #focus-duke-ai-safety-evaluation selects Duke and opens that focus plan through the same fragment handling as course plans. With JavaScript disabled, readers can follow the anchors and expand the plans through their summaries.

### UNC-to-Stanford planner

The planner opens with a short two-line heading and a collapsed starting-assumptions disclosure before six closed path disclosures. Each path summary pairs a name with its guiding question. The open path shows the Stanford direction and UNC academic base, then uses the focus-plan timeline for four UNC semesters. Each semester presents course choices, an activity, and an output. Evidence, tradeoff, and stay-at-UNC facts close each path, with sources and a link to the Stanford course panel.

The integrated machine learning, operations research, and econometrics path adds an optional research section. A 19px serif thesis and five wrapping quick links lead to the UNC semesters, research agenda, ambitious outcomes, Awards & activities, and Application timeline. Below the baseline four semesters, a facts grid introduces the research pillars. Nine research disclosures start closed and cover awards and activities, the application timeline, the accelerated four-term sequence, project agenda, milestones, Stanford courses, workload choices, ambitious outcomes, and publication standards. Expanded blocks reuse the guide's headings, timelines, and facts. Rules separate successive project or outcome items. Direct links reveal both the path and the requested nested disclosure.

The awards and activities disclosure groups three closed combination summaries, seven award summaries across high school and college, eight activity summaries, and application guidance. Each target summary uses the focus-plan grid. The 21px Neoris name sits above an 11px monospace type and priority line, with the target outcome in the second column. These columns stack at 600px. Expanded disclosures use the shared facts grid. Next stretch and Test the fit first give a further outcome and a short diagnostic, followed by eligibility, timing, preparation, and evidence. Source links follow the facts. The separate five-stage application timeline reuses the term timeline to pair each stage with work and a concrete output.

Two closed application-timing disclosures pair a window name with timing guidance. A separate closed application and credit checklist uses the same ruled rows as focus courses. The page index links to the planner, and the decision map links to individual paths and timing windows. Opening a fragment reveals the target disclosure through the shared deep-link behavior.

### Research guide and funding memo

The research lists contain 10 career lanes, 12 internships and related early-career opportunities, 10 fellowships and alternatives, and 10 fields of study. Each has a short comparison summary and details on demand. Source links accompany the relevant details.

Fellowships default to all opportunities. JavaScript enables four type filters covering college alternatives, opportunities alongside school, gap-year components, and startup accelerators. Pressed state identifies the current filter and a status line reports the visible count. A deep link to a filtered-out fellowship restores All opportunities and opens the target. Without JavaScript, all rows remain available through their native disclosures.

Funding appears near the end as a short memo with linked entries, dated status, and eligibility notes. The final next-actions section presents an ordered set of planning steps.

### Focus, links, and motion

Interactive elements use a 2px ember focus outline with a 4px offset. Map and guide buttons have a 44px minimum height. Map source links use an underlined monospace treatment with a 44px minimum height and an arrow. Guide source links use underlined monospace text with a 36px minimum height. Official sources use HTTPS links that open externally with noopener and noreferrer. Internal map links jump to the related guide content.

Map toolbar controls use 160ms transitions on color, background, and border. Reduced-motion preferences remove those transitions and disable smooth scrolling.

## Do's and Don'ts

- Do keep course, focus-plan, and transfer summaries visible by default so readers can compare workloads and directions before opening details.
- Do preserve the single nested tree, visible focus, native disclosures, and full content access without JavaScript.
- Do keep this unlisted surface absent from site navigation and the sitemap, with noindex and no-referrer metadata. Anyone with the URL can read it.
