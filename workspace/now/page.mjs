import { validateNow } from './validate.mjs';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const STATUS_LABELS = { enrolled: 'Enrolled', 'sitting-in': 'Sitting in', auditing: 'Auditing', 'self-study': 'Self-study' };

const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** 'YYYY-MM-DD' -> 'Oct 24, 2026', by splitting the string (never through Date). */
export function formatUpdated(iso) {
  const [year, month, day] = iso.split('-');
  return `${MONTHS[Number(month) - 1]} ${Number(day)}, ${year}`;
}

const arrow = '<span aria-hidden="true"> →</span>';

const statusText = c => `${escape(STATUS_LABELS[c.status])}${c.statusNote ? ` · ${escape(c.statusNote)}` : ''}`;

// The visible chip comes before the h3 in the DOM, so it is hidden from assistive tech
// and repeated, visually hidden, inside the h3 where heading navigation lands.
const course = c => `<li class="now-course">
<div class="now-course-meta">
<span class="now-chip now-chip--${c.status}" aria-hidden="true">${statusText(c)}</span>
<span class="now-where">${escape(c.where)}</span>
</div>
<div>
<h3><span class="now-visually-hidden">${statusText(c)}: </span>${escape(c.title)}</h3>
<p class="now-note">${escape(c.note)}</p>
<p class="now-lines"><span><span class="now-line-label">${escape(c.labels?.now ?? 'now')}${arrow}</span> ${escape(c.now)}</span><span><span class="now-line-label">${escape(c.labels?.next ?? 'next')}${arrow}</span> ${escape(c.next)}</span></p>
</div>
</li>`;

const milestone = m => {
  const label = m.state === 'next' ? 'Next' : m.label;
  const when = m.date ? `<time datetime="${escape(m.date)}">${escape(label)}</time>` : escape(label);
  const state = m.review ? 'Under review' : { done: 'Done', next: 'Next up', upcoming: 'Upcoming' }[m.state];
  const classes = `now-milestone now-milestone--${m.state}${m.review ? ' now-milestone--review' : ''}`;
  // For the next item the date column only repeats "Next"; the h3 already says "Next up".
  return `<li class="${classes}">
<span class="now-when"${m.state === 'next' ? ' aria-hidden="true"' : ''}>${when}</span>
<span class="now-rail" aria-hidden="true"><span class="now-dot">${m.state === 'next' ? '<span class="now-pulse"></span>' : ''}</span></span>
<div class="now-milestone-body">
<h3><span class="now-visually-hidden">${state}: </span>${escape(m.title)}</h3>
<p>${escape(m.detail)}</p>
</div>
</li>`;
};

const head = (id, title, eyebrow) => `<div class="now-section-head">
<h2 id="${id}">${title}</h2>
<p class="now-eyebrow">${eyebrow}</p>
</div>`;

// The caret sits inside the items, glued to the last one, so it never wraps onto its own line.
const currently = items => {
  const last = `<span class="now-currently-last">${escape(items.at(-1))}<span class="now-caret" aria-hidden="true">▍</span></span>`;
  return [...items.slice(0, -1).map(escape), last].join(' · ');
};

/** The <main> body for /now/. Throws (failing the build) when the data is invalid. */
export function nowPage(data) {
  validateNow(data);
  const updated = formatUpdated(data.updated);
  const updatedTime = `<time datetime="${escape(data.updated)}">${escape(updated)}</time>`;
  return `<section class="page-intro now-intro">
<p class="eyebrow now-mono">Now · updated ${updatedTime}</p>
<h1>Learning, <em>in public.</em></h1>
<p class="lede now-lede">A running log of what I'm studying, what I've shipped, and what's next. I update it as things move — wins and misses both.</p>
<p class="now-currently"><span class="now-currently-label">currently${arrow}</span> <span class="now-currently-items">${currently(data.currently)}</span></p>
</section>
<section class="experience now-section now-courses" aria-labelledby="now-term">
${head('now-term', `${escape(data.term.label)} <em>${escape(data.term.emphasis)}</em>`, '01 — Coursework &amp; study')}
<ol>${data.courses.map(course).join('')}</ol>
</section>
<section class="now-section now-milestones" aria-labelledby="now-milestones-title">
${head('now-milestones-title', 'Shipped, <em>and next</em>', '02 — Milestones')}
<ol class="now-timeline">${data.milestones.map(milestone).join('')}</ol>
</section>
<section class="now-section now-month" aria-labelledby="now-month-title" data-now-month hidden>
<div class="now-section-head">
<h2 id="now-month-title" class="now-month-title">This month</h2>
<p class="now-eyebrow">03 — Daily receipts · <span data-now-month-key></span></p>
</div>
<dl class="now-stats" data-now-stats></dl>
<a class="now-month-link" href="/daily/">See the receipts on Daily <span aria-hidden="true">↗</span></a>
</section>
<p class="now-closing">Build. Learn. Repeat. · Last updated ${updatedTime}</p>
<script type="module" src="/now/strip.js"></script>`;
}
