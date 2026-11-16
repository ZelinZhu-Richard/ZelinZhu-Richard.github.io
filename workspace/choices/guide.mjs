import { ALTERNATIVES } from './data/alternatives.mjs';
import { UNC } from './data/unc.mjs';
import { DUKE } from './data/duke.mjs';
import { STANFORD } from './data/stanford.mjs';
import { FUNDING } from './data/funding.mjs';
import { FIELDS } from './data/fields.mjs';
import { CAREERS } from './data/careers.mjs';
import { INTERNSHIPS } from './data/internships.mjs';
import { TRANSFER } from './data/transfer.mjs';

export const SCHOOLS = [UNC, DUKE, STANFORD];
export const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const external = (href, label) => /^https:\/\//.test(href || '') ? `<a href="${escape(href)}" target="_blank" rel="noopener noreferrer">${escape(label)}<span aria-hidden="true"> ↗</span></a>` : '';
const list = items => `<ul>${(items || []).map(item => `<li>${escape(item)}</li>`).join('')}</ul>`;
const fact = (label, value) => value ? `<div><dt>${escape(label)}</dt><dd>${escape(value)}</dd></div>` : '';
const sources = items => `<div class="guide-sources">${(items || []).map(item => external(item.href, item.label)).join('')}</div>`;
const statusClass = value => ['rolling', 'upcoming', 'closed', 'verify', 'automatic'].includes(value) ? value : 'verify';

export function renderRoute(school, route) {
  return `<details class="school-route" id="route-${escape(school.id)}-${escape(route.id)}">
    <summary><span class="route-title"><span class="route-mode">${({stretch: 'Stretch · very high load', ambitious: 'Ambitious · high load', balanced: 'Balanced · sustainable pace'})[route.id]}</span>${escape(route.name)}</span><span class="route-summary">${escape(route.degree)}</span><span class="route-load">${escape(route.load)}</span></summary>
    <div class="route-body">
      <dl class="route-facts">${fact('Aim', route.goal)}${fact('Weekly budget · estimate', route.weeklyHours)}${fact('What this costs', route.tradeoff)}${fact('When to reduce the load', route.guardrail)}</dl>
      <h4>Proposed course sequence</h4>
      <p class="schedule-note">A prerequisite-aware planning draft, not a completed degree audit. Reserved breadth, writing, language, and science slots still need an adviser’s review. Placement and actual course offerings can change the order.</p>
      <ol class="term-sequence">${route.terms.map(term => `<li class="study-term"><h5>${escape(term.label)}</h5><div>${list(term.courses)}<p class="term-focus">${escape(term.focus)}</p></div></li>`).join('')}</ol>
      <p class="summer-plan"><strong>Summer strategy.</strong> ${escape(route.summer)}</p>
    </div>
  </details>`;
}

function renderFocusTracks(school) {
  if (!school.focusTracks?.length) return '';
  return `<section class="school-focus" id="school-focus-${escape(school.id)}" aria-labelledby="focus-title-${escape(school.id)}">
    <h4 id="focus-title-${escape(school.id)}">Make the plan fit your interests</h4>
    <p class="schedule-note">Choose an academic workload above, then a focus below. These are proposed course choices and activities within that workload. Confirm elective substitutions, prerequisites, and access before changing the semester plan.</p>
    ${school.focusTracks.map(track => `<details class="focus-track" id="focus-${escape(school.id)}-${escape(track.id)}">
      <summary><strong>${escape(track.name)}</strong><span>${escape(track.aim)}</span></summary>
      <div class="focus-body">
        <p class="focus-base"><strong>Start from this route.</strong> ${escape(track.degreeFit)}</p>
        <h5>Courses with a purpose</h5>
        <ul class="focus-courses">${track.coursePlan.map(item => `<li><div>${external(item.href, item.course)}</div><div><p>${escape(item.purpose)}</p><p class="focus-access">${escape(item.access)}</p></div></li>`).join('')}</ul>
        <h5>Build it year by year</h5>
        <ol class="focus-timeline">${track.timeline.map(step => `<li><h6>${escape(step.stage)}</h6><dl class="guide-facts">${fact('Course choices', step.courses)}${fact('Activity', step.activity)}${fact('Finish with', step.output)}</dl></li>`).join('')}</ol>
        <h5>Fit the ambition to the week</h5>
        <dl class="focus-workloads guide-facts">${fact('Stretch', track.workload.stretch)}${fact('Ambitious', track.workload.ambitious)}${fact('Balanced', track.workload.balanced)}</dl>
        <p class="summer-plan"><strong>Capstone idea.</strong> ${escape(track.capstone)}</p>
        ${sources(track.sources)}
      </div>
    </details>`).join('')}
    <p class="focus-combination"><strong>Where the interests meet.</strong> Build one AI product evaluation with two separate questions: does the system perform reliably, and do people understand and value what it does? Keep accuracy, safety, user trust, and conversion as separate outcomes. A successful marketing experiment does not establish that a model is safe.</p>
  </section>`;
}

function renderCommitment(school) {
  const chosen = school.commitment;
  if (!chosen) return '';
  return `<section class="school-commitment" aria-labelledby="commitment-title-${escape(school.id)}">
    <h4 id="commitment-title-${escape(school.id)}">${escape(chosen.title)}</h4>
    <p>${escape(chosen.summary)}</p>
    <dl class="guide-facts">${chosen.credentials.map(item => fact(item.name, item.detail)).join('')}</dl>
    <details class="commitment-audit"><summary>How the requirements fit together</summary><dl class="guide-facts">${chosen.audit.map(item => fact(item.name, item.detail)).join('')}</dl></details>
  </section>`;
}

function renderTransferTargets(path) {
  const targets = path.opportunities;
  if (!targets) return '';
  const prefix = `research-${escape(path.id)}`;
  const entries = items => items.map(item => `<details class="focus-track" id="transfer-target-${escape(item.id)}">
    <summary><strong>${escape(item.name)}<span class="opportunity-kind">${escape(item.kind)} · ${escape(item.priority)}</span></strong><span>${escape(item.target || item.ceiling)}</span></summary>
    <div class="focus-body"><dl class="guide-facts">${fact('Next stretch', item.stretch)}${fact('Test the fit first', item.diagnostic)}${fact('Eligibility and entry route', item.eligibility)}${fact('Cycle and lead time', item.window)}${fact('What could be ready by the application', item.beforeApplication)}${fact('Why this fits the route', item.why)}${fact('Preparation plan', item.plan)}${fact('Evidence to keep', item.evidence)}</dl>${sources(item.sources)}</div>
  </details>`).join('');
  return `<details class="research-block" id="${prefix}-opportunities"><summary>Aim higher: awards, competitions and research activities</summary><div class="research-content">
    <p class="focus-base">${escape(targets.intro)}</p><p class="schedule-note">${escape(targets.foundation)}</p>
    <section class="research-item"><h6>Choose a high-ambition combination</h6>${targets.combinations.map(item => `<details class="focus-track"><summary><strong>${escape(item.name)}</strong><span>${escape(item.aim)}</span></summary><div class="focus-body"><dl class="guide-facts">${fact('Primary pursuit', item.primary)}${fact('Complementary target', item.secondary)}${fact('Weekly allocation · planning estimate', item.weeklyPlan)}${fact('Evidence for the application', item.applicationEvidence)}</dl></div></details>`).join('')}</section>
    <section class="research-item"><h6>Awards and competitions</h6>${entries(targets.awards)}</section>
    <section class="research-item"><h6>Research programs and activities</h6>${entries(targets.activities)}</section>
    <section class="research-item"><h6>Turn the work into an accurate application</h6><dl class="guide-facts">${targets.rules.map(item => fact(item.label, item.detail)).join('')}</dl>${sources(targets.sources)}</section>
  </div></details>
  <details class="research-block" id="${prefix}-opportunity-timeline"><summary>Work backward from the transfer application</summary><div class="research-content"><ol class="focus-timeline">${targets.timeline.map(item => `<li><h6>${escape(item.stage)}</h6><dl class="guide-facts">${fact('Work', item.action)}${fact('Finish with', item.ready)}</dl></li>`).join('')}</ol></div></details>`;
}

function renderResearchPlan(path) {
  const research = path.research;
  if (!research) return '';
  const prefix = `research-${escape(path.id)}`;
  const ambitions = path.ambitions;
  return `<section class="research-plan" aria-labelledby="${prefix}-title">
    <h5 id="${prefix}-title">Build a research direction</h5>
    <dl class="guide-facts research-pillars">${research.pillars.map(item => fact(item.name, item.detail)).join('')}</dl>
    ${renderTransferTargets(path)}
    <details class="research-block" id="${prefix}-accelerated"><summary>Accelerate only after placement is approved</summary><div class="research-content"><p class="schedule-note">${escape(research.accelerated.assumptions)}</p>
      <ol class="focus-timeline">${research.accelerated.terms.map(step => `<li><h6>${escape(step.stage)}</h6><dl class="guide-facts">${fact('Course choices', step.courses)}${fact('Activity', step.activity)}${fact('Finish with', step.output)}</dl></li>`).join('')}</ol>
    </div></details>
    <details class="research-block" id="${prefix}-agenda"><summary>One flagship project, two ways to extend it</summary><div class="research-content">
      ${research.agenda.map(item => `<article class="research-item"><h6>${escape(item.name)}</h6><dl class="guide-facts">${fact('Question', item.question)}${fact('Method', item.method)}${fact('Deliverable', item.deliverable)}${fact('Continue when', item.goNoGo)}</dl></article>`).join('')}
    </div></details>
    <details class="research-block" id="${prefix}-milestones"><summary>Research checkpoints before the transfer application</summary><div class="research-content"><ol class="focus-timeline">
      ${research.milestones.map(item => `<li><h6>${escape(item.stage)}</h6><dl class="guide-facts">${fact('Work', item.action)}${fact('Ready for the next step', item.exit)}</dl></li>`).join('')}
    </ol></div></details>
    <details class="research-block" id="${prefix}-stanford"><summary>Continue through MS&E, CS and econometrics at Stanford</summary><div class="research-content"><ul class="focus-courses">
      ${research.stanfordCourses.map(item => `<li><div>${external(item.href, item.name)}</div><div><p>${escape(item.role)}</p><p class="focus-access">${escape(item.access)}</p></div></li>`).join('')}
    </ul></div></details>
    <details class="research-block" id="${prefix}-workloads"><summary>Three workloads for the same research question</summary><div class="research-content"><dl class="guide-facts">
      ${research.workloads.map(item => fact(item.name, item.detail)).join('')}
    </dl></div></details>
    ${ambitions ? `<details class="research-block" id="${prefix}-ambitions"><summary>“Impossible” achievements to aim for</summary><div class="research-content"><p class="focus-base">${escape(ambitions.framing)}</p>
      ${ambitions.achievements.map(item => `<article class="research-item"><h6>${escape(item.name)}</h6><dl class="guide-facts">${fact('What would count', item.evidence)}${fact('Build toward it', item.ladder)}${fact('A valuable result along the way', item.fallback)}</dl></article>`).join('')}
    </div></details>
    <details class="research-block" id="${prefix}-publication"><summary>Publication standards and honest milestones</summary><div class="research-content"><dl class="guide-facts">
      ${ambitions.publication.map(item => fact(item.label, item.detail)).join('')}
    </dl>${sources(ambitions.sources)}</div></details>` : ''}
  </section>`;
}

function renderTransferGuide() {
  return `<section class="guide-section" id="transfer-plans" aria-labelledby="transfer-title">
    <div class="guide-section-head"><h2 id="transfer-title">UNC → Stanford.<br>Six paths to explore.</h2><p>For MS&E + CS, start with the combined machine learning, operations research and econometrics route. Compare it with five other directions. Each connects four UNC semesters to a project, a Stanford direction, and a strong reason to keep building at UNC.</p></div>
    <details class="transfer-context"><summary>Starting assumptions and how to choose</summary><div><p>${escape(TRANSFER.assumption)}</p><p>${escape(TRANSFER.framing)}</p></div></details>
    <div class="transfer-paths">${TRANSFER.paths.map(path => `<details class="focus-track" id="transfer-path-${escape(path.id)}">
      <summary><strong>${escape(path.name)}</strong><span>${escape(path.question)}</span></summary>
      <div class="focus-body">
        <dl class="guide-facts">${fact('Stanford direction', path.stanford)}${fact('UNC academic base', path.uncAnchor)}</dl>
        ${path.research ? `<p class="research-thesis">${escape(path.research.thesis)}</p><nav class="school-focus-links" aria-label="${escape(path.name)} sections"><a href="#research-${escape(path.id)}-courses">UNC semesters</a><a href="#research-${escape(path.id)}-agenda">Research agenda</a><a href="#research-${escape(path.id)}-ambitions">“Impossible” achievements</a>${path.opportunities ? `<a href="#research-${escape(path.id)}-opportunities">Awards & activities</a><a href="#research-${escape(path.id)}-opportunity-timeline">Application timeline</a>` : ''}</nav>` : ''}
        <h5${path.research ? ` id="research-${escape(path.id)}-courses"` : ''}>Four semesters at UNC</h5>
        <ol class="focus-timeline">${path.courseSequence.map(step => `<li><h6>${escape(step.stage)}</h6><dl class="guide-facts">${fact('Course choices', step.courses)}${fact('Activity', step.activity)}${fact('Finish with', step.output)}</dl></li>`).join('')}</ol>
        ${renderResearchPlan(path)}
        <h5>Evidence and decisions</h5>
        <dl class="guide-facts">${fact('Portfolio', path.portfolio)}${fact('Tradeoff', path.tradeoff)}${fact('If I stay at UNC', path.stay)}</dl>
        ${sources(path.sources)}
        <p class="transfer-course-link"><a href="#school-stanford">Compare the Stanford course plans</a></p>
      </div>
    </details>`).join('')}</div>
    <section class="transfer-logistics" aria-labelledby="transfer-timing-title"><h3 id="transfer-timing-title">Choose the application year</h3>
      ${TRANSFER.timings.map(item => `<details id="transfer-timing-${escape(item.id)}"><summary><strong>${escape(item.name)}</strong><span>${escape(item.timing)}</span></summary><div class="focus-body"><dl class="guide-facts">${fact('When this fits', item.whenItFits)}${fact('UNC preparation', item.uncPlan)}${fact('Decision checkpoint', item.decisionGate)}</dl></div></details>`).join('')}
      <details class="transfer-checklist"><summary>Application and credit checkpoints</summary><ul class="focus-courses">${TRANSFER.checklist.map(item => `<li><div>${external(item.href, item.label)}</div><p>${escape(item.detail)}</p></li>`).join('')}</ul>${sources(TRANSFER.sources)}</details>
    </section>
  </section>`;
}

export function renderCareerGuide() {
  return `<section class="guide-section" id="career-lanes" aria-labelledby="careers-title">
    <div class="guide-section-head"><h2 id="careers-title">Courses are inputs. What do I want to do?</h2><p>Pick two lanes to test over eight weeks. A reproducible analysis, a useful software tool, and a clear technical explanation are reusable evidence. The next project should help you choose.</p></div>
    <p class="planning-assumption">Shared foundation: Python, Git, SQL, data structures, calculus, linear algebra, probability, inference, and clear writing. If you take a noncollege route, treat the year labels as experience checkpoints; student-only programs may be unavailable.</p>
    <div class="career-list">${CAREERS.map(lane => `<details id="career-${escape(lane.id)}"><summary><strong>${escape(lane.name)}</strong><span>${escape(lane.work)}</span></summary><div class="career-body"><dl class="guide-facts">${fact('Course and skill foundation', lane.foundation)}${fact('Portfolio test', lane.project)}${fact('Start here', lane.firstStep)}${fact('Degree / entry reality', lane.degreeReality)}</dl><ol class="career-stages">${lane.milestones.map(step => `<li><strong>${escape(step.stage)}</strong><span>${escape(step.action)}</span></li>`).join('')}</ol>${sources(lane.sources)}</div></details>`).join('')}</div>
  </section>
  <section class="guide-section" id="internships" aria-labelledby="internships-title">
    <div class="guide-section-head"><h2 id="internships-title">Get experience at the right stage.</h2><p>A first-year discovery event, a research placement, and an internship serve different purposes. Prepare for the next eligible step rather than applying to every recognizable name.</p></div>
    <div class="internship-list">${INTERNSHIPS.map(item => `<details id="internship-${escape(item.id)}"><summary><span><strong>${escape(item.name)}</strong><span class="opportunity-kind">${escape(item.type)}</span></span><span>${escape(item.stage)}</span></summary><div class="opportunity-body"><dl class="guide-facts">${fact('Who can apply', item.eligibility)}${fact('Cycle / availability', item.status)}${fact('What to prepare', item.preparation)}</dl>${sources(item.sources?.length ? item.sources : [{label:'Official opportunity',href:item.href}])}</div></details>`).join('')}</div>
  </section>`;
}

export function renderGuide() {
  return `
  <section class="guide-section" id="schools" aria-labelledby="schools-title">
    <div class="guide-section-head"><h2 id="schools-title">Three schools. Three ways to push.</h2><p>The ambition stays high. The number of simultaneous commitments changes. Stretch is the very-high-load version; ambitious keeps one major outside commitment; balanced protects time for depth and recovery.</p></div>
    <p class="planning-assumption">Working assumptions: fall 2027 college entry, no confirmed AP or dual-enrollment credit, and no known aid or residency eligibility. Stanford is modeled as a possible later transfer. Course lists use currently published rules; each entering-year catalog and adviser audit must settle the final plan.</p>
    <div class="school-switch" role="group" aria-label="School plans" data-school-controls hidden>${SCHOOLS.map((school, i) => `<button type="button" data-school-button="${school.id}" aria-pressed="${i === 0}" aria-controls="school-${school.id}">${escape(school.name)}</button>`).join('')}</div>
    ${SCHOOLS.map(school => `<article class="school-panel" id="school-${school.id}" data-school-panel="${school.id}" aria-labelledby="school-title-${school.id}">
      <div class="school-heading"><h3 id="school-title-${school.id}">${escape(school.name)}</h3><p>${escape(school.summary)}</p></div>
      ${renderCommitment(school)}
      ${school.focusTracks?.length ? `<nav class="school-focus-links" aria-label="${escape(school.name)} interest plans">${school.focusTracks.map(track => `<a href="#focus-${escape(school.id)}-${escape(track.id)}">${escape(track.name)}</a>`).join('')}</nav>` : ''}
      <details class="school-rules"><summary>Placement, requirements, and assumptions</summary><div>${list(school.assumptions)}${list(school.rules)}${sources(school.sources)}</div></details>
      <div class="school-routes">${school.routes.map(route => renderRoute(school, route)).join('')}</div>
      ${renderFocusTracks(school)}
      ${school.alternatives?.length ? `<section class="academic-switches"><h4>If a different subject wins</h4>${school.alternatives.map(path => `<details><summary>${escape(path.name)}</summary><div><p><strong>${escape(path.degree)}</strong></p><p>${escape(path.fit)}</p>${list(path.courses)}<p>${escape(path.tradeoff)}</p>${external(path.href, 'Program requirements')}</div></details>`).join('')}</section>` : ''}
      <section class="campus-opportunities"><h4>Where the coursework could lead</h4>${school.opportunities.map(item => `<details><summary>${escape(item.name)}</summary><div><p>${escape(item.detail)}</p><dl class="guide-facts">${fact('Who / when', item.eligibility)}${fact('Next move', item.nextStep)}</dl>${external(item.href, 'Official opportunity')}</div></details>`).join('')}</section>
    </article>`).join('')}
  </section>
  ${renderTransferGuide()}
  ${renderCareerGuide()}
  <section class="guide-section" id="alternatives" aria-labelledby="alternatives-title">
    <div class="guide-section-head"><h2 id="alternatives-title">College isn’t the only starting point.</h2><p>Some programs can anchor a year away from college. Others are short experiments, grants, or investments. Compare the commitment before treating them as substitutes.</p></div>
    <div class="guide-filters" role="group" aria-label="Opportunity type" data-opportunity-controls hidden>
      <button type="button" data-opportunity-filter="all" aria-pressed="true">All opportunities</button><button type="button" data-opportunity-filter="College alternative" aria-pressed="false">College alternatives</button><button type="button" data-opportunity-filter="Alongside school" aria-pressed="false">Alongside school</button><button type="button" data-opportunity-filter="Gap-year component" aria-pressed="false">Gap-year components</button><button type="button" data-opportunity-filter="Startup accelerator" aria-pressed="false">Startup accelerators</button>
    </div>
    <p class="result-count" data-opportunity-count role="status">${ALTERNATIVES.length} opportunities</p>
    <div class="opportunity-list">${ALTERNATIVES.map(item => `<details class="opportunity" id="opportunity-${escape(item.id)}" data-opportunity-kind="${escape(item.kind)}">
      <summary><span><strong>${escape(item.name)}</strong><span class="opportunity-kind">${escape(item.kind)} · ${escape(item.duration)}</span></span><span class="opportunity-finance">${escape(item.funding)}</span><span class="guide-status guide-status--${statusClass(item.statusType)}">${escape(item.status)}</span></summary>
      <div class="opportunity-body"><dl class="guide-facts">${fact('Eligibility & commitment', item.eligibility)}${fact('Best fit', item.fit)}${fact('Next move', item.nextStep)}${fact('Tradeoff / open question', item.caveat)}</dl>${sources(item.sources?.length ? item.sources : [{ label: 'Official program', href: item.href }])}</div>
    </details>`).join('')}</div>
  </section>
  <section class="guide-section" id="study-fields" aria-labelledby="fields-title">
    <div class="guide-section-head"><h2 id="fields-title">Choose the questions, then the major.</h2><p>Applied math, economics, statistics, computing, and decision science overlap. Use the kind of work you want to do to choose a degree anchor, then add the courses it is missing.</p></div>
    <div class="field-list">${FIELDS.map(field => `<details id="field-${field.id}"><summary><strong>${escape(field.name)}</strong><span>${escape(field.question)}</span></summary><div class="field-body"><dl class="guide-facts">${fact('Course spine', field.foundation)}${fact('Useful pairing', field.pairing)}${fact('Proof of work', field.project)}${fact('Tradeoff', field.tradeoff)}</dl><ul class="field-programs">${field.schools.map(school => `<li><span>${escape(school.name)}</span>${external(school.href, school.program)}</li>`).join('')}</ul></div></details>`).join('')}</div>
  </section>
  <section class="guide-section funding-memo" id="funding" aria-labelledby="funding-title">
    <div class="guide-section-head"><h2 id="funding-title">A short funding memo.</h2><p>Keep cost in the decision without letting scholarship searches replace the work. Eligibility is conditional; deadline status is a November 10, 2026 snapshot.</p></div>
    <ul class="funding-brief">${['cooke-college','elks-mvs','unc-need-aid','duke-need-aid','stanford-need-aid','amazon-future-engineer'].map(id => FUNDING.find(item => item.id === id)).filter(Boolean).map(item => `<li><div><strong>${external(item.href, item.name)}</strong><p>${escape(item.deadline || item.status)}</p></div><p>${escape(item.funding)}. ${escape(item.eligibility)}</p></li>`).join('')}</ul>
    <p class="schedule-note">See each official page for the full application and aid checklist. Need-based aid, merit awards, salary, and startup investment are not interchangeable.</p>
  </section>
  <section class="guide-section next-actions" id="next-actions" aria-labelledby="next-title">
    <div class="guide-section-head"><h2 id="next-title">Make the next month count.</h2><p>Keep several routes alive while producing work that helps across all of them.</p></div>
    <ol class="next-moves">
      <li><h3>Try the overlap in four weeks.</h3><p>Choose a narrow AI product question. Week 1: define the task, public or synthetic examples, and a scoring rubric. Week 2: run a baseline evaluation. Week 3: categorize failures and check a revised version on separate examples. Week 4: present the limitations and collect voluntary feedback on whether the explanation is clear and useful. This produces both technical evidence and a first customer-research question.</p></li>
      <li><h3>Compare three realistic launch points.</h3><p>Keep a funded-college route, a structured alternative such as the Academy or Palantir, and a self-directed route with a credible budget. Apply before changing enrollment. Any college deferral must be approved by that college.</p></li>
      <li><h3>Audit the academic starting point.</h3><p>Collect AP/IB/dual-enrollment results, placement rules, and required first-year courses. Mark which proposed courses are unlocked. Choose one school plan and one intensity to audit first; the rest remain options.</p></li>
      <li><h3>Review output and capacity every two weeks.</h3><p>Keep the hardest work that is producing progress. If mastery, deadlines, or recovery repeatedly slip, remove an optional credential or parallel project before adding more hours. The goal is strong work that compounds over years.</p></li>
    </ol>
    <details class="focus-starter"><summary>Build an AI safety foundation before adding a commitment</summary><div><p>${external('https://bluedot.org/courses/technical-ai-safety', 'BlueDot Technical AI Safety')} is a free course with a part-time option of roughly five hours a week for six weeks. It surveys alignment, interpretability, evaluations, and control. Check the next cohort and prerequisites; use this as your main outside activity while taking it.</p><p>${external('https://www.arena.education/', 'ARENA')} publishes coding materials for independent study. Start after Python and the relevant linear algebra, calculus, and probability foundations. Its separate in-person bootcamp is selective; future dates and eligibility need checking. Completing exercises is preparation for research, not a research placement.</p></div></details>
    <p class="choices-unlisted">Unlisted, not private. No other site page links here; anyone with the address can read it. Publishing to this repository also makes the source visible.</p>
  </section>`;
}
