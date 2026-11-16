# Choices

`/choices/` is an unlisted planning page: a sideways decision tree followed by course plans, career paths, internships/research, fellowships, fields of study, and a short funding memo. It shares the site's header, footer, fonts, night palette, generated metadata, and background.

No other page links to Choices, and it is absent from the sitemap and robots.txt. The generated page carries `noindex, nofollow` and `no-referrer`. This controls discoverability, not access: anyone with the URL can read the page, and publishing the repository makes its source accessible too.

## Content

- `data/unc.mjs`, `duke.mjs`, `stanford.mjs`: three workload profiles per school, proposed term-by-term courses, assumptions, prerequisite and credential rules, alternative subjects, campus opportunities, and official sources. UNC and Duke also have detailed AI safety/evaluation and marketing/experimentation focus plans: course choices, access rules, four-year activities and outputs, and workload adaptations.
- `data/careers.mjs`: ten possible career lanes, including marketing and AI safety, with skill foundations, portfolio tests, milestones, and entry considerations.
- `data/internships.mjs`: twelve stage-specific research, internship, exploration, or competition leads. Their types are deliberately distinguished.
- `data/alternatives.mjs`: ten fellowships, college alternatives, short programs, grants, or startup accelerators, with commitment and eligibility details.
- `data/fields.mjs`: ten academic directions and their actual program or course-route names at each school, including Symbolic Systems and Science, Technology, and Society. A focus area is not necessarily a formal major.
- `data/transfer.mjs`: six UNC-to-Stanford academic directions, four UNC semesters per direction, year-one/year-two application choices, credit review, and official application checkpoints. Future-cycle dates are estimates until published.
- `data/research-route.mjs`: an integrated machine learning, operations research, and econometrics direction, with baseline and conditional accelerated courses, a flagship research question, extensions, checkpoints, Stanford continuation, and three workloads.
- `data/research-ambitions.mjs`: exceptionally difficult research outcomes and the work needed to pursue them. First-author and solo-author main-conference papers are separate aspirations; preprints, submissions, workshop papers, and accepted main-track publications retain their distinct status.
- `data/transfer-opportunities.mjs`, `near-term-olympiads.mjs`, `transfer-awards.mjs`, and `transfer-activities.mjs`: seven competition/award options and eight research activities, each with a concrete target, a further stretch, a readiness diagnostic, eligibility, preparation, sources and timing. USAAIO → IOAI and International Logic Olympiad (ILO) are senior-year priorities. Three combinations connect ML/OR research, AI + logic + building/communication, and econometrics + implemented decisions to a five-stage timeline. Priorities are planning judgments, not admissions probabilities.
- `data/funding.mjs`: researched funding references; the page intentionally renders only a short selected memo.
- `plans.mjs`: the decision-tree overview generated from the public planning modules.
- `guide.mjs`: the long-form guide renderer; `page.mjs` composes it with the tree in the site's shared frame.

These are possibilities and proposed plans, not admissions, offers, assured funding, or registrar-approved graduation audits. The information was checked against official sources on November 10, 2026. Future offerings, AP/IB/transfer equivalencies, assigned sections, aid eligibility, and the student's matriculation catalog require confirmation. Program status must be rechecked before applying. Never import private trackers or unrelated personal application plans.

All three school profiles pursue strong outcomes. Stretch carries the most simultaneous load; ambitious narrows concurrent commitments; balanced leaves more space for a sustained project. Weekly budgets are estimates, not measured individual capacity. Each profile includes a way to reduce load if needed.

Duke now preserves the user's selected Data Science IDM + Economics second major + I&E certificate across all three profiles. The 37-credit examples vary regular-term and summer pacing and depend on the named incoming prerequisites being formally recognized; the fallback covers unrecognized preparation. The credential ledger distinguishes placement, graduation credit, program requirements, and the certificate's two experiential requirements.

Stanford starts from the MS&E + CS preference. Its double-major example includes a six-quarter checkpoint and a conditional third year, while the single-major examples use six quarters. Neither the extension nor course equivalency is automatic. Transfer directions connect concrete UNC work to Stanford programs and retain a useful UNC path if the student stays.

## Behavior

Desktop starts with a left-to-right tree; phones start with the same semantic list as an indented outline. Users can switch layouts and expand individual branches or the whole tree. Internal links reveal the correct school panel, route disclosure, or filtered opportunity before navigation.

School selectors show one institution at a time. Native disclosures expose each route and its course sequence. Fellowship filters distinguish college alternatives, gap-year components, alongside-school programs, and startup accelerators. Without JavaScript, all school content and native disclosures remain available.

Course routes, focus plans, and transfer directions start closed so comparisons stay visible. Interest links from the tree or school heading select the correct institution and open the requested plan. Focus-course suggestions require approved substitutions; they do not silently add credits to the base schedules.

The integrated research direction adds native disclosures for accelerated placement, the research agenda, checkpoints, Stanford courses, workloads, stretch achievements, publication standards, award/activity targets, and the application timeline. Quick links open their enclosing path and research disclosure. The baseline course sequence and all research text are present in the initial HTML.

`build.mjs` copies only `style.css` and `tree.js`; authoring modules, research notes, tests, and design documentation are not copied as runtime assets. The HTML contains the rendered guide so it remains readable without JavaScript.

## Verification

Run `npm test`, `npm run build`, and `npm run verify` from the review worktree root. Tests cover unique IDs, valid internal links and controls, static availability of all nine course sequences, text escaping, safe links, runtime allowlisting, and unlisted-route behavior. Production verification rejects incoming site links or sitemap exposure.

Preview with `node tools/serve.mjs dist --port 8200 --host 127.0.0.1` when the port is free. Use Codex's built-in browser. Do not disturb an existing server.
