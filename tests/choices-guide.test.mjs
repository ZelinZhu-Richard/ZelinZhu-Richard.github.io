import test from 'node:test';
import assert from 'node:assert/strict';
import { pages } from '../site/pages.mjs';
import { renderTree } from '../workspace/choices/page.mjs';
import { renderRoute, SCHOOLS } from '../workspace/choices/guide.mjs';
import { ALTERNATIVES } from '../workspace/choices/data/alternatives.mjs';
import { CAREERS } from '../workspace/choices/data/careers.mjs';
import { FIELDS } from '../workspace/choices/data/fields.mjs';
import { INTERNSHIPS } from '../workspace/choices/data/internships.mjs';
import { TRANSFER } from '../workspace/choices/data/transfer.mjs';

const html = pages().get('choices/index.html').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
const entities = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", apos: "'" };
const decode = value => value.replace(/&(amp|lt|gt|quot|#39|apos);/g, (_, entity) => entities[entity]);
const content = markup => decode(markup.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
const attributes = tag => new Map([...tag.matchAll(/\s+([\w:-]+)(?:="([^"]*)")?/g)].map(([, key, value]) => [key, decode(value ?? '')]));
const elements = [...html.matchAll(/<[a-z][\w-]*\b[^>]*>/gi)].map(([tag]) => attributes(tag));
const details = new Map();
const openDetails = [];
for (const match of html.matchAll(/<(\/?)details\b[^>]*>/gi)) {
  const [markup, closing] = match;
  if (!closing) {
    openDetails.push({ tag: attributes(markup), bodyStart: match.index + markup.length });
    continue;
  }
  const opening = openDetails.pop();
  assert.ok(opening, 'Unexpected closing details tag');
  const { tag, bodyStart } = opening;
  if (tag.has('id')) {
    details.set(tag.get('id'), { tag, body: html.slice(bodyStart, match.index) });
  }
}
assert.equal(openDetails.length, 0, 'Unclosed details tag');

function requireText(record, keys, context) {
  for (const key of keys) {
    assert.ok(typeof record[key] === 'string' && record[key].trim(), `${context} needs ${key}`);
  }
}

function requireRendered(record, fields, renderedText, context) {
  requireText(record, fields, context);
  for (const field of fields) {
    assert.ok(renderedText.includes(record[field]), `${context} is missing ${field}`);
  }
}

function requireSemesters(body, terms, id) {
  const sequence = body.match(/<ol\b[^>]*>([\s\S]*?)<\/ol>/)?.[1];
  assert.ok(sequence, `${id} is missing its semester list`);
  const semesters = [...sequence.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/g)].map(match => content(match[1]));
  assert.equal(terms.length, 4, id);
  assert.equal(semesters.length, 4, id);
  assert.equal(new Set(terms.map(step => step.stage)).size, 4, `${id} has duplicate semester labels`);
  for (const [index, step] of terms.entries()) {
    const fields = ['stage', 'courses', 'activity', 'output'];
    const context = `${id} semester ${index + 1}`;
    requireText(step, fields, context);
    for (const field of fields) {
      assert.ok(semesters[index].includes(step[field]), `${context} is missing ${field}`);
    }
  }
}

test('Choices navigation and accessibility references point to unique elements in the generated page', () => {
  const ids = elements.filter(element => element.has('id')).map(element => element.get('id'));
  const targets = new Set(ids);
  assert.equal(targets.size, ids.length, 'The rendered page contains duplicate IDs');

  const fragmentLinks = elements.map(element => element.get('href')).filter(href => href?.startsWith('#'));
  for (const id of ['map-title', 'schools', 'transfer-plans', 'career-lanes', 'internships', 'alternatives', 'study-fields', 'funding']) {
    assert.ok(fragmentLinks.includes(`#${id}`), `Missing link to ${id}`);
  }
  for (const href of fragmentLinks) {
    assert.ok(targets.has(href.slice(1)), `No destination for ${href}`);
  }
  for (const element of elements) {
    for (const name of ['aria-controls', 'aria-labelledby', 'aria-describedby']) {
      for (const id of (element.get(name) ?? '').split(/\s+/).filter(Boolean)) {
        assert.ok(targets.has(id), `${name} points to missing element ${id}`);
      }
    }
  }
});

test('all nine course plans include their complete, ordered course lists in the initial HTML', () => {
  const regularTermCounts = { unc: 8, duke: 8, stanford: 6 };
  assert.deepEqual(SCHOOLS.map(school => school.id).sort(), Object.keys(regularTermCounts).sort());

  for (const school of SCHOOLS) {
    const panel = elements.find(element => element.get('id') === `school-${school.id}`);
    assert.ok(panel && !panel.has('hidden'), `${school.id} must be available without JavaScript`);
    assert.deepEqual(school.routes.map(route => route.id).sort(), ['ambitious', 'balanced', 'stretch']);

    for (const route of school.routes) {
      const id = `route-${school.id}-${route.id}`;
      requireText(route, ['name', 'degree', 'load', 'goal', 'weeklyHours', 'tradeoff', 'guardrail', 'summer'], id);
      const rendered = details.get(id);
      assert.ok(rendered && !rendered.tag.has('hidden'), `${id} must be available without JavaScript`);
      const summary = rendered.body.match(/<summary\b[^>]*>([\s\S]*?)<\/summary>/);
      assert.ok(summary && content(summary[1]).includes(route.name), `${id} needs a native disclosure label`);
      const sequence = rendered.body.match(/<ol\b[^>]*>([\s\S]*?)<\/ol>/)?.[1];
      assert.ok(sequence, `${id} is missing its course sequence`);

      const regularTerms = route.terms.filter(term => !/summer/i.test(term.label));
      const expectedTerms = id === 'route-stanford-stretch' ? 9 : regularTermCounts[school.id];
      assert.equal(regularTerms.length, expectedTerms, `${id} has the wrong number of regular terms`);
      assert.equal(new Set(route.terms.map(term => term.label)).size, route.terms.length, `${id} has duplicate term labels`);
      const headings = [...sequence.matchAll(/<h[1-6]\b[^>]*>([\s\S]*?)<\/h[1-6]>/g)];
      assert.deepEqual(headings.map(match => content(match[1])), route.terms.map(term => term.label), id);
      for (const [index, term] of route.terms.entries()) {
        const context = `${id}, ${term.label}`;
        requireText(term, ['label', 'focus'], context);
        assert.ok(term.courses.length && term.courses.every(course => typeof course === 'string' && course.trim()), `${context} needs courses`);
        const markup = sequence.slice(headings[index].index + headings[index][0].length, headings[index + 1]?.index);
        assert.deepEqual([...markup.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/g)].map(match => content(match[1])), term.courses, context);
        assert.ok(content(markup).includes(term.focus), `${context} is missing its planning note`);
      }
    }
  }
});

test('Duke keeps the selected three credentials across the different term loads', () => {
  const duke = SCHOOLS.find(school => school.id === 'duke');
  const ledger = html.match(/<section\b[^>]*\baria-labelledby="commitment-title-duke"[^>]*>([\s\S]*?)<\/section>/)?.[1];
  assert.ok(ledger, 'The generated Duke panel is missing the credential ledger');
  const ledgerText = content(ledger);
  assert.match(ledgerText, /Statistical Science \+ Computer Science/i);
  assert.match(ledgerText, /second major\s*·\s*Economics/i);
  assert.match(ledgerText, /Innovation & Entrepreneurship/i);
  const audit = ledger.match(/<details\b[^>]*>\s*<summary\b[^>]*>[\s\S]*?<\/details>/)?.[0];
  assert.ok(audit, 'The requirements ledger needs a disclosure that works without JavaScript');
  assert.match(content(audit), /37\b.*\b40\b/);
  assert.match(content(audit), /Calculus I and II/);
  assert.match(content(audit), /introductory[- ]CS/);

  const summerTerms = { stretch: 0, ambitious: 1, balanced: 3 };
  for (const route of duke.routes) {
    const id = `route-duke-${route.id}`;
    const disclosure = details.get(id);
    assert.ok(disclosure, `Missing ${id} in the generated page`);
    const rendered = content(disclosure.body);
    assert.match(rendered, /Data Science B\.S\. IDM.*Economics second major.*I&E Certificate/i, id);
    assert.match(rendered, /37 Duke credits/, id);
    assert.equal(route.terms.filter(term => /summer/i.test(term.label)).length, summerTerms[route.id], id);
    assert.equal(route.terms.flatMap(term => term.courses).length, 37, `${id} should schedule 37 one-credit Duke courses`);
    for (const course of ['COMPSCI 371', 'COMPSCI 372', 'STA 325L', 'ECON 204D', 'ECON 375', 'I&E 499']) {
      assert.ok(rendered.includes(course), `${id} is missing ${course}`);
    }
  }
});

test('the six UNC transfer paths expose all four semesters, next steps, and sources without JavaScript', () => {
  const panel = elements.find(element => element.get('id') === 'transfer-plans');
  assert.ok(panel && !panel.has('hidden'), 'Transfer plans must be available without JavaScript');
  assert.equal(TRANSFER.paths.length, 6);
  for (const path of TRANSFER.paths) {
    const id = `transfer-path-${path.id}`;
    assert.ok(elements.some(element => element.get('href') === `#${id}`), `Missing link to ${id}`);
    const rendered = details.get(id);
    assert.ok(rendered && !rendered.tag.has('hidden'), `${id} needs a native disclosure`);
    const summary = rendered.body.match(/<summary\b[^>]*>([\s\S]*?)<\/summary>/)?.[1];
    assert.ok(summary && content(summary).includes(path.name), `${id} needs an identifiable disclosure label`);
    requireText(path, ['stanford', 'uncAnchor', 'portfolio', 'tradeoff', 'stay'], id);
    const pathText = content(rendered.body);
    for (const field of ['stanford', 'uncAnchor', 'portfolio', 'tradeoff', 'stay']) {
      assert.ok(pathText.includes(path[field]), `${id} is missing ${field}`);
    }

    requireSemesters(rendered.body, path.courseSequence, id);

    const links = [...rendered.body.matchAll(/<a\b[^>]*>/g)].map(([tag]) => attributes(tag).get('href'));
    assert.ok(links.includes('#school-stanford'), `${id} needs a route to the Stanford course plans`);
    assert.ok(path.sources.length && path.sources.every(source => source.href.startsWith('https://') && links.includes(source.href)), `${id} needs its source links`);
  }

  assert.ok(TRANSFER.timings.length >= 2, 'The guide needs distinct application timing options');
  for (const timing of TRANSFER.timings) {
    const id = `transfer-timing-${timing.id}`;
    const rendered = details.get(id);
    assert.ok(rendered && !rendered.tag.has('hidden'), `${id} needs a native disclosure`);
    assert.match(rendered.body, /<summary\b/);
    const fields = ['name', 'timing', 'uncPlan', 'decisionGate'];
    requireText(timing, fields, id);
    for (const field of fields) {
      assert.ok(content(rendered.body).includes(timing[field]), `${id} is missing ${field}`);
    }
  }
});

test('the integrated transfer path renders the conditional semester plan and research achievements in its disclosures', () => {
  const path = TRANSFER.paths.find(candidate => candidate.id === 'ml-decision-econometrics');
  assert.ok(path, 'Missing the integrated transfer path');
  const rendered = details.get(`transfer-path-${path.id}`);
  assert.ok(rendered && !rendered.tag.has('hidden'), 'The integrated path needs a native disclosure');
  const { research, ambitions } = path;
  const pathText = content(rendered.body);

  function disclosureBody(section) {
    const id = `research-${path.id}-${section}`;
    const disclosure = details.get(id);
    assert.ok(disclosure && !disclosure.tag.has('hidden'), `${id} needs a native disclosure`);
    assert.ok(rendered.body.includes(disclosure.body), `${id} must appear inside the integrated path`);
    assert.match(disclosure.body, /^\s*<summary\b/, `${id} needs a disclosure label`);
    return disclosure.body;
  }

  requireRendered(research, ['thesis'], pathText, 'Integrated research path');
  assert.equal(research.pillars.length, 3);
  for (const pillar of research.pillars) {
    requireRendered(pillar, ['name', 'detail'], pathText, `Pillar ${pillar.name}`);
  }

  const acceleratedBody = disclosureBody('accelerated');
  requireRendered(research.accelerated, ['assumptions'], content(acceleratedBody), 'Accelerated plan');
  requireSemesters(acceleratedBody, research.accelerated.terms, `research-${path.id}-accelerated`);

  const agendaText = content(disclosureBody('agenda'));
  assert.equal(research.agenda.length, 3);
  for (const project of research.agenda) {
    requireRendered(project, ['name', 'question', 'method', 'deliverable', 'goNoGo'], agendaText, `Project ${project.name}`);
  }

  const ambitionsBody = disclosureBody('ambitions');
  const ambitionsText = content(ambitionsBody);
  requireRendered(ambitions, ['framing'], ambitionsText, 'Research ambitions');
  assert.ok(ambitions.achievements.length >= 5, 'The research path needs at least five achievements');
  for (const achievement of ambitions.achievements) {
    requireRendered(achievement, ['name', 'evidence', 'ladder', 'fallback'], ambitionsText, `Achievement ${achievement.name}`);
  }
  const achievementTitles = [...ambitionsBody.matchAll(/<h6\b[^>]*>([\s\S]*?)<\/h6>/g)].map(match => content(match[1]));
  assert.ok(achievementTitles.some(title => /first[- ]author/i.test(title)), 'Missing a first-author achievement');
  assert.ok(achievementTitles.some(title => /solo[- ]author/i.test(title)), 'Missing a solo-author achievement');

  for (const section of ['milestones', 'stanford', 'workloads', 'publication']) {
    disclosureBody(section);
  }
});

test('transfer awards and activities show calibrated goals and application evidence without JavaScript', () => {
  const path = TRANSFER.paths.find(candidate => candidate.id === 'ml-decision-econometrics');
  assert.ok(path?.opportunities, 'Missing awards and activities for the integrated transfer path');
  const { awards, activities, combinations, timeline } = path.opportunities;
  const parent = details.get(`transfer-path-${path.id}`);
  const targets = details.get(`research-${path.id}-opportunities`);
  const schedule = details.get(`research-${path.id}-opportunity-timeline`);
  for (const disclosure of [targets, schedule]) {
    assert.ok(disclosure && !disclosure.tag.has('hidden'), 'Each section needs a native disclosure');
    assert.ok(parent?.body.includes(disclosure.body), 'Each section must appear inside the integrated path');
    assert.match(disclosure.body, /^\s*<summary\b/, 'Each section needs a disclosure label');
  }

  assert.equal(awards.length, 7, 'Provide two high-school and five college-level awards');
  assert.ok(activities.length >= 8, 'Provide at least eight activities');
  const olympiads = awards.filter(award => /high[- ]school/i.test(award.kind));
  assert.deepEqual(olympiads.map(award => award.id).sort(), ['ilo', 'usaaio']);
  assert.match(olympiads.find(award => award.id === 'ilo').name, /International Logic Olympiad/i);
  for (const target of [...awards, ...activities]) {
    const id = `transfer-target-${target.id}`;
    const entry = details.get(id);
    assert.ok(entry && !entry.tag.has('hidden') && targets.body.includes(entry.body), `${id} must appear in the awards and activities disclosure`);
    const summary = entry.body.match(/^\s*<summary\b[^>]*>([\s\S]*?)<\/summary>/)?.[1];
    assert.ok(summary, `${id} needs a native disclosure label`);
    requireRendered(target, ['name', 'kind', 'priority', 'target'], content(summary), id);
    requireRendered(target, ['stretch', 'diagnostic', 'eligibility', 'window', 'beforeApplication', 'why', 'plan', 'evidence'], content(entry.body), id);

    const links = [...entry.body.matchAll(/<a\b[^>]*>/g)].map(([tag]) => attributes(tag).get('href'));
    assert.ok(target.sources.length && target.sources.every(source => source.href.startsWith('https://') && links.includes(source.href)), `${id} needs its source links`);
  }

  assert.equal(combinations.length, 3);
  const summaries = [...targets.body.matchAll(/<summary\b[^>]*>([\s\S]*?)<\/summary>/g)].map(match => content(match[1]));
  const targetsText = content(targets.body);
  assert.doesNotMatch(`${targetsText} ${content(schedule.body)}`, /\b(?:Putnam|ICPC|Morgan Prize|International Linguistics Olympiad)\b/i);
  for (const combination of combinations) {
    assert.ok(summaries.some(summary => summary.includes(combination.name)), `Missing combination disclosure for ${combination.name}`);
    requireRendered(combination, ['aim', 'primary', 'secondary', 'weeklyPlan', 'applicationEvidence'], targetsText, combination.name);
  }

  const stages = [...schedule.body.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/g)].map(match => content(match[1]));
  assert.equal(timeline.length, 5);
  assert.equal(stages.length, timeline.length);
  for (const [index, item] of timeline.entries()) {
    requireRendered(item, ['stage', 'action', 'ready'], stages[index], `Timeline stage ${index + 1}`);
  }
});

test('guide entries have useful comparison text and a source in the initial HTML', () => {
  const sections = [
    ['career', CAREERS, 8, ['work', 'foundation', 'project', 'firstStep', 'degreeReality']],
    ['internship', INTERNSHIPS, 10, ['type', 'stage', 'eligibility', 'status', 'preparation']],
    ['opportunity', ALTERNATIVES, 10, ['kind', 'duration', 'funding', 'status', 'eligibility', 'fit', 'nextStep', 'caveat']],
    ['field', FIELDS, 6, ['question', 'foundation', 'pairing', 'project', 'tradeoff']],
  ];
  for (const [kind, records, minimum, fields] of sections) {
    assert.ok(records.length >= minimum, `The ${kind} guide needs at least ${minimum} entries`);
    for (const record of records) {
      const id = `${kind}-${record.id}`;
      requireText(record, ['id', 'name', ...fields], id);
      const rendered = details.get(id);
      assert.ok(rendered && !rendered.tag.has('hidden'), `Missing ${id} in the initial HTML`);
      const text = content(rendered.body);
      for (const field of ['name', ...fields]) {
        assert.ok(text.includes(record[field]), `${id} is missing ${field}`);
      }
      assert.match(rendered.body, /<a\b[^>]*\bhref="https:\/\//, `${id} needs a source link`);
    }
  }
});

test('renderRoute treats course and schedule text as text and escapes attribute values', () => {
  const school = { id: 'school" onfocus="alert(1)' };
  const route = {
    id: 'balanced', name: '<script>alert(1)</script>', degree: 'Math & CS', load: 'Test load',
    goal: '<b>Study</b>', weeklyHours: 'Test hours', tradeoff: 'Richard\'s "choice"', guardrail: '<svg onload=alert(1)>',
    summer: '<img src=x onerror=alert(1)>',
    terms: [{ label: 'Fall <test>', courses: ['<a href="javascript:alert(1)">Course</a>'], focus: 'Research & writing' }],
  };
  const rendered = renderRoute(school, route);
  const opening = rendered.match(/^<details\b[^>]*>/)[0];
  assert.equal(attributes(opening).get('id'), `route-${school.id}-${route.id}`);
  assert.ok(!attributes(opening).has('onfocus'));
  assert.doesNotMatch(rendered, /<(?:script|b|svg|img|a)\b/i);
  for (const value of [route.name, route.degree, route.goal, route.tradeoff, route.guardrail, route.summer, route.terms[0].label, route.terms[0].courses[0], route.terms[0].focus]) {
    assert.ok(content(rendered).includes(value), `Escaping should preserve text: ${value}`);
  }
});

test('renderTree links only to HTTPS sources and local fragment targets', () => {
  const node = href => renderTree({ id: 'choice', title: 'Choice', href, linkLabel: '<em>Read & compare</em>' });
  for (const href of ['javascript:alert(1)', 'data:text/html,<script>alert(1)</script>', '//example.org', 'http://example.org', '/about/', '#', '#choice" onclick="alert(1)']) {
    assert.doesNotMatch(node(href), /<a\b/, `${href} should not produce a link`);
  }

  const fragment = attributes(node('#course-plans').match(/<a\b[^>]*>/)[0]);
  assert.equal(fragment.get('href'), '#course-plans');
  assert.ok(!fragment.has('target'), 'In-page links stay in the same tab');

  const href = 'https://example.org/?q=" onclick="alert(1)&sort=asc';
  const rendered = node(href);
  const source = attributes(rendered.match(/<a\b[^>]*>/)[0]);
  assert.equal(source.get('href'), href);
  assert.ok(!source.has('onclick'));
  assert.equal(source.get('target'), '_blank');
  assert.deepEqual(new Set(source.get('rel').split(/\s+/)), new Set(['noopener', 'noreferrer']));
  assert.doesNotMatch(rendered, /<em>/);
  assert.ok(content(rendered).includes('<em>Read & compare</em>'));
});
