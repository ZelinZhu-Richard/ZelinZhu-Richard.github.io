import { escapeHtml, BASE } from './markdown.mjs';

export const ORIGIN = 'https://zelinzhu-richard.github.io';

// The chapter registry (order, number, part, personal-prep hours). Titles and summaries come from content front matter.
export const CHAPTERS = [
  { num: 0, slug: 'start-here', part: 'Start', hours: '1 h' },
  { num: 1, slug: 'toolbelt', part: 'Catch', hours: '6–10 h' },
  { num: 2, slug: 'agent-patch-audit', part: 'Catch', hours: '4 h', star: true },
  { num: 3, slug: 'map', part: 'Catch', hours: '5 h' },
  { num: 4, slug: 'change', part: 'Catch', hours: '4 h' },
  { num: 5, slug: 'prove', part: 'Catch', hours: '5 h' },
  { num: 6, slug: 'debug', part: 'Catch', hours: '5 h' },
  { num: 7, slug: 'task-design', part: 'Build', hours: '4 h' },
  { num: 8, slug: 'grader-validity', part: 'Build', hours: '5 h', star: true },
  { num: 9, slug: 'runs-and-weaknesses', part: 'Build', hours: '4 h' },
  { num: 10, slug: 'unfamiliar-stacks', part: 'Interview', hours: '4 h + 15 min/day' },
  { num: 11, slug: 'interview', part: 'Interview', hours: '4 h' },
  { num: 12, slug: 'defend-it', part: 'Interview', hours: '4 h', star: true },
  { num: 13, slug: 'capstone', part: 'Capstone', hours: '13 h + 1–7 days', star: true },
  { num: 14, slug: 'tracker', part: 'Capstone', hours: '—' },
  { num: 15, slug: 'gpu-practice', part: 'Build', hours: '8–15 h on a Colab GPU' },
];
export const PARTS = ['Start', 'Catch', 'Build', 'Interview', 'Capstone'];
export const EXTRA_PAGES = [
  { slug: 'placement', title: 'Placement test', part: 'Start' },
  { slug: 'cards', title: 'Printable cards', part: 'Capstone' },
];

const pad = n => String(n).padStart(2, '0');

function nav(current, pages) {
  const groups = PARTS.map(part => {
    const items = [
      ...CHAPTERS.filter(c => c.part === part).map(c => ({ slug: c.slug, label: `<span class="nav-num">${pad(c.num)}</span> ${escapeHtml(pages.get(c.slug)?.short || pages.get(c.slug)?.title || c.slug)}${c.star ? ' <span class="nav-star" aria-label="core">★</span>' : ''}` })),
      ...EXTRA_PAGES.filter(p => p.part === part).map(p => ({ slug: p.slug, label: `<span class="nav-num">··</span> ${escapeHtml(p.title)}` })),
    ];
    return `<div class="nav-group"><p class="nav-part">${part}</p><ul>${items.map(i => `<li><a href="${BASE}${i.slug}/"${i.slug === current ? ' aria-current="page"' : ''} data-nav="${i.slug}">${i.label}</a></li>`).join('')}</ul></div>`;
  }).join('');
  return `<nav id="pb-nav" class="pb-nav" aria-label="Chapters"><a class="nav-home" href="${BASE}"${current === 'home' ? ' aria-current="page"' : ''}>Overview</a>${groups}</nav>`;
}

function pager(current) {
  const order = ['home', 'placement', ...CHAPTERS.map(c => c.slug), 'cards'];
  const k = order.indexOf(current);
  if (k < 0) return '';
  const link = (slug, rel) => {
    if (!slug) return '<span></span>';
    const href = slug === 'home' ? BASE : `${BASE}${slug}/`;
    const chapter = CHAPTERS.find(c => c.slug === slug);
    const label = slug === 'home' ? 'Overview' : chapter ? `Chapter ${pad(chapter.num)}` : (EXTRA_PAGES.find(p => p.slug === slug)?.title || slug);
    return `<a class="pager-${rel}" href="${href}" rel="${rel}"><span class="pager-dir">${rel === 'prev' ? '← Previous' : 'Next →'}</span><span>${escapeHtml(label)}</span></a>`;
  };
  return `<nav class="pb-pager" aria-label="Previous and next">${link(order[k - 1], 'prev')}${link(order[k + 1], 'next')}</nav>`;
}

export function layout({ slug, title, eyebrow, summary, body, toc = [], pages, built, data }) {
  const path = slug === 'home' ? BASE : `${BASE}${slug}/`;
  const fullTitle = slug === 'home' ? 'Polaris Playbook — Richard Zhu' : `${title} — Polaris Playbook`;
  const tocHtml = toc.length > 2 ? `<nav class="pb-toc" aria-label="On this page"><p class="toc-title">On this page</p><ol>${toc.map(t => `<li><a href="#${t.id}">${t.text}</a></li>`).join('')}</ol></nav>` : '';
  const dataTag = data ? `<script type="application/json" id="pb-data">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>` : '';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(fullTitle)}</title>
<meta name="description" content="${escapeHtml(summary || title)}">
<link rel="canonical" href="${ORIGIN}${path}">
<meta property="og:title" content="${escapeHtml(fullTitle)}">
<meta property="og:description" content="${escapeHtml(summary || title)}">
<meta property="og:url" content="${ORIGIN}${path}">
<meta property="og:type" content="article">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="${BASE}assets/style.css">
<script src="${BASE}assets/app.js" defer></script>
</head>
<body data-page="${escapeHtml(slug)}">
<a class="skip-link" href="#main">Skip to content</a>
<header class="pb-header">
<a class="pb-wordmark" href="${BASE}">Polaris <em>Playbook</em></a>
<button class="pb-menu" type="button" aria-expanded="false" aria-controls="pb-nav">Chapters</button>
<a class="pb-home" href="/">Richard Zhu</a>
</header>
<div class="pb-shell">
${nav(slug, pages)}
<main id="main" class="pb-main">
<header class="pb-intro">
<p class="eyebrow">${eyebrow}</p>
<h1>${escapeHtml(title)}</h1>
${summary ? `<p class="lede">${escapeHtml(summary)}</p>` : ''}
<p class="pb-status" data-status="${escapeHtml(slug)}" aria-live="polite"></p>
</header>
${tocHtml}
<article class="pb-article">
${body}
</article>
${pager(slug)}
</main>
</div>
<footer class="pb-footer">
<p>Personal study notes by Richard Zhu for one job: Research Engineer, Polaris, at Google DeepMind. Not affiliated with Google or Google DeepMind.</p>
<p>Every important claim carries a label: <span class="badge badge-confirmed">Confirmed</span> (primary source read), <span class="badge badge-reported">Reported</span> (secondary source) or <span class="badge badge-inference">Inference</span> (our reasoning). Facts were checked on the dates shown; tools and hiring processes change, so check again before you act.</p>
<p>Progress is saved only in this browser. Built ${escapeHtml(built)}.</p>
</footer>
${dataTag}
</body>
</html>
`;
}
