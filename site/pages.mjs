import { LINKS, ABOUT, EXPERIENCE, PROJECTS, PUBLICATIONS, SKILLS } from './content.mjs';
import { skillsPage } from '../workspace/skills/page.mjs';
import { videoPage } from '../workspace/video/page.mjs';
import { blogIndex, blogPost, checkPosts, postPath } from '../workspace/blog/page.mjs';
import { POSTS } from '../workspace/blog/posts.mjs';
import { choicesPage } from '../workspace/choices/page.mjs';
import { PARTS, stoneNav } from '../workspace/stones/parts.mjs';
import { indexGroup, indexItem } from '../workspace/palette/index.mjs';
import { COLOPHON_DESCRIPTION, colophonPage } from '../workspace/colophon/page.mjs';
import { FEED_PATH, FEED_TITLE } from '../workspace/blog/feed.mjs';
import { citeBlock } from '../workspace/cite/bibtex.mjs';
const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// ↗ means the link leaves the site (and opens a new tab, which is also said in words); → stays on it.
// name: a fuller accessible name for links whose visible label repeats on a page ("Source").
const link = (href, label, name) => {
  const external = href.startsWith('https:');
  const hint = external ? ' (opens in a new tab)' : '';
  return `<a href="${escape(href)}"${name ? ` aria-label="${escape(name + hint)}"` : ''}${external ? ' target="_blank" rel="noopener noreferrer"' : ''}>${escape(label)} <span aria-hidden="true">${external ? '↗' : '→'}</span>${external && !name ? `<span class="visually-hidden">${hint}</span>` : ''}</a>`;
};
// The site menu is the seven stones (workspace/stones/parts.mjs); CV, Contact, Stars and Skills live at the bottom of About.
// The footer index: the seven sections, the pages the menu does not show, and where else to find me.
const footRow = item => `<li><a href="${escape(item.href)}"${item.external ? ' target="_blank" rel="noopener noreferrer"' : ''}>${item.label ? `<span class="foot-n" aria-hidden="true">${escape(item.label)}</span> ` : ''}${escape(item.title)}${item.external ? ' <span aria-hidden="true">↗</span><span class="visually-hidden"> (opens in a new tab)</span>' : ''}</a></li>`;
const footColumn = (id, label, rows) => `<div>
<p id="${id}">${label}</p>
<ul aria-labelledby="${id}">${rows}</ul>
</div>`;
// Contact is here too: the site menu is only the seven sections, so without it most pages had no direct link to the Contact page.
const FOOT_MORE = ['/work/', '/skills/', '/github/stars/', '/github/stars/research/', '/flash/', '/colophon/', '/contacts/'];
const footIndex = () => `<nav class="footer-index" id="site-index" aria-label="Site index">
${footColumn('foot-sections', 'Sections', indexGroup('Sections').map(footRow).join(''))}
${footColumn('foot-more', 'More', FOOT_MORE.map(href => footRow(indexItem(href))).join(''))}
${footColumn('foot-elsewhere', 'Elsewhere', indexGroup('Elsewhere').filter(item => item.external).map(footRow).join('') + `<li><a href="${escape(LINKS.resume)}">CV (PDF)</a></li><li class="footer-email"><a href="mailto:${escape(LINKS.email)}">Email</a><button type="button" class="copy-button" data-copy="${escape(LINKS.email)}" hidden>Copy address</button></li>`)}
</nav>`;
// head: extra tags for one page (structured data). type: the Open Graph type ("article" for a blog post).
// The 404 page is served at whatever address was missing, so it names no canonical address of its own.
const frame = (path, title, description, body, { image = '/richard.jpg', stylesheet, script, bodyClass, robots, referrer, head = '', type = 'website' } = {}) => `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark">
<title>${escape(title)} — Richard Zhu</title>
<meta name="description" content="${escape(description)}">
${robots ? `<meta name="robots" content="${escape(robots)}">\n` : ''}${referrer ? `<meta name="referrer" content="${escape(referrer)}">\n` : ''}${path === '/404.html' ? '' : `<link rel="canonical" href="https://zelinzhu-richard.github.io${path}">\n`}<meta property="og:title" content="${escape(title)} — Richard Zhu">
<meta property="og:description" content="${escape(description)}">
<meta property="og:image" content="https://zelinzhu-richard.github.io${escape(image)}">
${path === '/404.html' ? '' : `<meta property="og:url" content="https://zelinzhu-richard.github.io${path}">\n`}<meta property="og:type" content="${escape(type)}">
<meta property="og:site_name" content="Richard Zhu">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#100f15">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="alternate" type="application/rss+xml" title="${escape(FEED_TITLE)}" href="${FEED_PATH}">
<link rel="preload" href="/_nuxt/TTNeorisTrialRegular.CykOY4gR.ttf" as="font" type="font/ttf" crossorigin>
<link rel="stylesheet" href="/portfolio.css">
${[].concat(stylesheet || []).map(href => `<link rel="stylesheet" href="${escape(href)}">`).join('\n')}
<script src="/portfolio.js" defer></script>
<noscript><style>@media(max-width:899px){.site-header{flex-wrap:wrap}.site-header nav{display:flex!important;position:static!important;flex-direction:row!important;flex-wrap:wrap;width:100%!important;padding:12px 0 0!important;border:0!important;background:none!important;box-shadow:none!important}.menu-button{display:none!important}}</style></noscript>
${[].concat(script || []).map(src => `<script type="module" src="${escape(src)}"></script>\n`).join('')}${head}</head>
<body${bodyClass ? ` class="${escape(bodyClass)}"` : ''}>
<a class="skip-link" href="#main">Skip to content</a>
<header class="site-header">
<a class="wordmark" href="/" aria-label="Richard Zhu — Home">Richard Zhu</a>
<button class="menu-button" type="button" aria-expanded="false" aria-controls="navigation">Menu</button>
${stoneNav(path)}
</header>
<main id="main">${body}</main>
<footer class="site-footer">
<p>Questions, or want to build something? <a href="mailto:${escape(LINKS.email)}">Email me</a>.</p>
${footIndex()}
<div class="footer-bottom">
<span>Richard Zhu · High school senior · CS and economics · © 2026</span>
<a href="/">Back to the homepage</a>
</div>
</footer>
</body>
</html>`;
const tags = values => `<ul class="tags">${values.map(v=>`<li>${escape(v)}</li>`).join('')}</ul>`;
// Experience tags float as poppable bubbles on About and Research (workspace/tag-bubbles).
const BUBBLES = { stylesheet: '/tag-bubbles/bubbles.css', script: '/tag-bubbles/bubbles.js' };
// One dated row of the Experience list, shared by About and Research.
const experienceRow = x => `<li>
<span>${escape(x.when)}</span>
<div>
<h3>${escape(x.title)}</h3>
<p class="org">${escape(x.org)}</p>
<p>${escape(x.desc)}</p>${tags(x.tags)}</div>
</li>`;
const publicationRow = p => `<li>
<span>${escape(p.when)}</span>
<div>
<h3><a href="${escape(p.href)}" target="_blank" rel="noopener noreferrer">${escape(p.title)} <span aria-hidden="true">↗</span></a></h3>
<p class="org">${escape(p.venue)} · ${escape(p.kind)}</p>
<p>${escape(p.authors)}</p>
${citeBlock(p)}
</div>
</li>`;
// A section page's eyebrow: its place among the seven, as the menu numbers them ("02 / 07").
const two = n => String(n).padStart(2, '0');
const place = (id, label) => `${two(PARTS.findIndex(p => p.id === id) + 1)} / ${two(PARTS.length)}${label ? ` · ${label}` : ''}`;
const intro = (label, title, description) => `<section class="page-intro">
<p class="eyebrow">${label}</p>
<h1>${title}</h1>
<p class="lede">${description}</p>
</section>`;
// The Work page's totals come from the data, so adding a project cannot leave a wrong total behind.
const WORDS = ['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve'];
const word = n => WORDS[n] || String(n);
const WORK_COUNTS = { total: word(PROJECTS.length), research: word(PROJECTS.filter(p => p.group === 'research').length), site: word(PROJECTS.filter(p => p.group === 'site').length) };
// Research: which project each method shows up in. The names come from PROJECTS and link to their rows.
const METHODS = [['nexus-tensor-alpha', 'Forecasting models'], ['equalvoice', 'Measuring speech-recognition bias'], ['apex-analysis', 'Open stock-analysis tools']];
const projectLink = id => {
  const p = PROJECTS.find(x => x.id === id);
  if (!p) throw new Error(`Research page names a project that does not exist: ${id}`);
  return `<a href="/projects/#${escape(p.id)}">${escape(p.name)}</a>`;
};
// Structured data for search engines. "<" is escaped so the JSON can never close its own script tag.
const jsonLd = data => `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>\n`;
const PERSON = {
  '@context': 'https://schema.org',
  '@type': 'Person',
  name: 'Richard Zhu',
  alternateName: 'Zelin Zhu',
  url: 'https://zelinzhu-richard.github.io/',
  image: 'https://zelinzhu-richard.github.io/richard.jpg',
  description: 'High school senior working on computer science, economics and machine learning research.',
  sameAs: [LINKS.github, LINKS.linkedin, LINKS.x],
};
// 404: the seven sections as a way back. workspace/palette/notfound.js fills in the address that was
// asked for and, when one is close, the page the visitor probably meant.
const lost = `<section class="page-intro">
<p class="eyebrow">404</p>
<h1>Page not found</h1>
<p class="lede">This page does not exist. It may have moved, or the link was wrong.</p>
<p class="lost" data-lost hidden>Nothing lives at <code data-lost-path></code>.<span data-lost-guess hidden> Did you mean <a data-lost-link href="/"></a>?</span></p>
</section>
<section class="about-more" aria-labelledby="lost-title">
<h2 id="lost-title">Where things are</h2>
<ul>${indexGroup('Sections').map(item => `<li><a href="${escape(item.href)}"><span>${escape(item.title)}</span> <em>${escape(item.hint)}.</em></a></li>`).join('')}</ul>
</section>
<aside class="related">
<p>Or</p>${link('/colophon/#everything','Everything on this site')}${link('/work/','All work')}${link('/','Homepage')}</aside>`;
export function pages() {
  const groups = [
    ['research', 'Quant and AI evaluation', 'Longer projects. All Python.'],
    ['site', 'On this site', 'Things that live on this site. Open them.'],
  ];
  const facts = p => `<dl class="work-facts">
<div><dt>Year</dt><dd>${escape(p.year)}</dd></div>
<div><dt>Role</dt><dd>${escape(p.role)}</dd></div>
<div><dt>Stack</dt><dd>${escape(p.stack)}</dd></div>
<div><dt>Status</dt><dd>${escape(p.status)}</dd></div>
</dl>`;
  // The first picture on a page is above the fold, so it is not lazy.
  const media = (p, n) => p.image ? `<figure class="work-shot"><img src="${escape(p.image.src)}" alt="${escape(p.image.alt)}" width="${p.image.width}" height="${p.image.height}"${n === 1 ? '' : ' loading="lazy"'} decoding="async"></figure>`
    : p.artifact ? `<figure class="work-code"><figcaption>${escape(p.artifact.label)}</figcaption><pre><code>${escape(p.artifact.code)}</code></pre></figure>` : '';
  // h: the heading level. /work/ groups its projects under h2 titles, so there they are h3.
  const item = (p, n, h = 'h2') => `<article class="work-item work-item--${p.group}" id="${escape(p.id)}">
<header class="work-head">
<p class="work-num">${String(n).padStart(2, '0')}</p>
<${h}>${escape(p.name)}</${h}>
<p class="work-context">${escape(p.context)}</p>
</header>
<div class="work-body">
<p class="work-summary">${escape(p.oneLiner)}</p>
<p class="work-desc">${escape(p.desc)}</p>${facts(p)}<div class="actions">${link(p.live, p.liveLabel || 'Open')}${link(p.repo, 'Source', `Source for ${p.name}`)}</div>
</div>${media(p, n)}
</article>`;
  let count = 0;
  const work = `<section class="work-intro">
<div>
<p class="eyebrow">Work · 2025–2026</p>
<h1>Things I’ve built</h1>
<p class="lede">${WORK_COUNTS.total} projects. ${WORK_COUNTS.research} are quant and AI evaluation work. ${WORK_COUNTS.site} live on this site: three camera toys, a short film and a habit game. The source for all of them is on GitHub.</p>
</div>
<nav class="work-index" aria-label="Projects on this page">
<ol>${PROJECTS.map((p, i) => `<li><a href="#${escape(p.id)}"><span aria-hidden="true">${String(i + 1).padStart(2, '0')}</span> <span>${escape(p.name)}</span> <span>${escape(p.year)}</span></a></li>`).join('')}</ol>
</nav>
</section>` + groups.map(([key, label, note]) => `<section class="work-group work-group--${key}" aria-labelledby="group-${key}">
<div class="work-group-head"><h2 id="group-${key}" class="work-group-title">${label}</h2><p>${note}</p></div>
${PROJECTS.filter(p => p.group === key).map(p => item(p, ++count, 'h3')).join('')}
</section>`).join('') + `<aside class="related">
<p>More context</p>${link('/research/','Research')}${link('/about/','About me')}${link(LINKS.resume,'CV (PDF)')}</aside>`;
  const section = (eyebrow, title, lede, list, other) => `<section class="work-intro work-intro--section">
<div>
<p class="eyebrow">${eyebrow}</p>
<h1>${title}</h1>
<p class="lede">${lede}</p>
</div>
</section><section class="work-group work-group--${list[0].group}">
${list.map((p, i) => item(p, i + 1)).join('')}
</section><aside class="related">
<p>More</p>${other}</aside>`;
  const projects = section(place('projects'), 'Projects', 'Three longer projects: a quant research system, a benchmark for speech-recognition bias, and an open-source stock analysis app. All Python.',
    PROJECTS.filter(p => p.group === 'research'), `${link('/fun/','Fun')}${link('/research/','Research')}${link('/work/','All work')}`);
  const fun = section(place('fun'), 'Fun', 'Small camera toys that run in your browser. They use your webcam with MediaPipe; nothing is uploaded. Open one and try it. Also here: Flash, a card designer that needs no camera.',
    PROJECTS.filter(p => ['paper-piano', 'gym', 'domain-expansion'].includes(p.id)), `${link('/flash/','Flash')}${link('/art/','Art')}${link('/projects/','Projects')}${link('/work/','All work')}`);
  // Art: Neon Rain, then a second copy of the About page's living portrait (workspace/portrait/about.js binds to it).
  const art = `<section class="work-intro work-intro--section">
<div>
<p class="eyebrow">${place('art')}</p>
<h1>Art</h1>
<p class="lede">Things I make to look at: a ten-second noir film, and a portrait of me drawn in code.</p>
</div>
</section><section class="work-group work-group--site">
${item(PROJECTS.find(p => p.id === 'neon-rain'), 1)}
</section><section id="portrait" class="art-portrait" aria-labelledby="portrait-title">
<header class="work-head">
<p class="work-num">02</p>
<h2 id="portrait-title">Living portrait</h2>
<p class="work-context">Code, 2026</p>
</header>
<div class="biography">
<div>
<p>Click the photo and it turns into me drawn in code. The portrait cycles through six styles: ASCII, pencil hatching, scribble ink, halftone, neon contours and pixel art.</p>
<p>Between styles every stroke bursts outward as blue, purple and pink ink, then re-forms as the next one. The styles alternate between two selfies, and the second loop swaps them, so each style shows both poses. It is one small JavaScript module with no dependencies, and it loads only when you click.</p>
<p>The same portrait lives on my <a href="/about/">About</a> page.</p>
</div>
<figure data-portrait-figure>
<button type="button" class="portrait-trigger" aria-label="Click to see me drawn in code. Photo of Richard Zhu smiling at the camera.">
<img src="/richard.jpg" alt="" width="800" height="1000" loading="lazy" decoding="async">
<span class="portrait-hint" aria-hidden="true">Click to see me drawn in code</span>
</button>
<figcaption>Me, 2026.</figcaption>
</figure>
</div>
</section><aside class="related">
<p>More</p>${link('/video/','Neon Rain')}${link('/fun/','Fun')}${link('/about/','About me')}</aside>`;
  const posts = checkPosts(POSTS);
  const about = intro(place('about', 'About'),'Richard Zhu','High school senior. I work on computer science and economics, and do machine learning research at UNC PRIMES.') + `<section class="biography">
<div>${ABOUT.paragraphs.map(p=>`<p>${escape(p)}</p>`).join('')}<div class="actions">${link(LINKS.resume,'CV (PDF)')}${link('/contacts/','Contact')}</div>
</div>
<figure data-portrait-figure>
<button type="button" class="portrait-trigger" aria-label="Click to see me drawn in code. Photo of Richard Zhu smiling at the camera.">
<img src="/richard.jpg" alt="" width="800" height="1000">
<span class="portrait-hint" aria-hidden="true">Click to see me drawn in code</span>
</button>
<figcaption>Me, 2026.</figcaption>
</figure>
</section>
<section class="about-quotes" aria-label="Quotes I keep in mind">
<figure class="about-quote">
<blockquote><p>“What we outsource, we tend to lose. And what we cultivate, we tend to keep.”</p></blockquote>
<figcaption>— Eric So</figcaption>
</figure>
<figure class="about-quote">
<blockquote><p>“Do so much volume it would be unreasonable for you to fail… Don’t change your mind before you let compounding compound.”</p></blockquote>
<figcaption>— Alex Hormozi</figcaption>
</figure>
</section>
<section id="experience" class="experience">
<h2>Experience</h2>
<ol>${EXPERIENCE.map(experienceRow).join('')}</ol>
</section>
<section class="skills">
<h2>Tools I use</h2>${SKILLS.buckets.map(x=>`<div>
<h3>${escape(x.label)}</h3>
<p>${x.items.map(escape).join(' · ')}</p>
</div>`).join('')}<div>
<h3>Languages spoken</h3>
<p>${SKILLS.languages.map(escape).join(' · ')}</p>
</div>
</section>
<section class="about-more" aria-labelledby="about-more-title">
<h2 id="about-more-title">More about me</h2>
<ul>
<li><a href="${escape(LINKS.resume)}"><span>CV</span> <em>My CV as a PDF.</em></a></li>
<li><a href="/contacts/"><span>Contact</span> <em>Email, GitHub, LinkedIn and X.</em></a></li>
<li><a href="/github/stars/"><span>Stars</span> <em>Repositories I have starred on GitHub, sorted by type and purpose.</em></a></li>
<li><a href="/skills/"><span>Skills</span> <em>Agent skills I use and the ones I write.</em></a></li>
</ul>
</section>`;
  // Research: only research roles go under Experience (UNC PRIMES for now); papers and posters under Publications.
  const researchRoles = EXPERIENCE.filter(x => x.org === 'UNC PRIMES');
  const research = intro(place('research', 'Machine learning'),'Research','Deep learning on brain imaging data at UNC PRIMES, a workshop poster on agents for quantitative research, and the projects where I test the ideas.') + `<section id="experience" class="experience" aria-labelledby="research-experience">
<h2 id="research-experience">Experience</h2>
<ol>${researchRoles.map(experienceRow).join('')}</ol>
</section>
<section id="publications" class="experience publications" aria-labelledby="research-publications">
<h2 id="research-publications">Publications</h2>
<ol>${PUBLICATIONS.map(publicationRow).join('')}</ol>
</section>
<section class="research">
<p class="eyebrow">Related projects</p>
<h2>Where the methods show up</h2>
<p>${METHODS.map(([id, what]) => `${what} in ${projectLink(id)}.`).join(' ')}</p>
<div class="actions">${link('/projects/','See the projects')}${link('/github/stars/research/','Research Stack')}${link(LINKS.resume,'CV (PDF)')}${link('mailto:'+LINKS.email,'Email me about research')}</div>
</section>`;
  return new Map([
    ['skills/index.html',frame('/skills/','Skills','AI agent skills Richard Zhu uses, with links to their source. His own skills will be added here.',skillsPage,{ stylesheet: '/skills/style.css' })],
    ['video/index.html',frame('/video/','Neon Rain — Video','Neon Rain: a ten-second noir clip by Richard Zhu, made from GPT Image stills and 3D-guided motion instead of a text-to-video model.',videoPage,{ image: '/video/assets/neon-rain-poster.jpg', stylesheet: '/video/style.css' })],
    ['art/index.html',frame('/art/','Art','Art by Richard Zhu: Neon Rain, a ten-second AI-made noir film, and a living portrait of him drawn in code.',art,{ image: '/video/assets/neon-rain-poster.jpg', stylesheet: ['/work/style.css', '/portrait/portrait.css'], script: '/portrait/about.js' })],
    ['blog/index.html',frame('/blog/','Blog','Richard Zhu’s blog: notes on what he is building and learning.',blogIndex(posts),{ stylesheet: '/blog/style.css' })],
    ...posts.map(p => [`${postPath(p).slice(1)}index.html`, frame(postPath(p), p.title, p.summary, blogPost(p), { stylesheet: '/blog/style.css', type: 'article' })]),
    ['colophon/index.html',frame('/colophon/','Colophon',COLOPHON_DESCRIPTION,colophonPage(),{ stylesheet: '/colophon/style.css' })],
    ['choices/index.html',frame('/choices/','Choices','A personal map of possible next steps.',choicesPage,{ stylesheet: '/choices/style.css', script: '/choices/tree.js', bodyClass: 'choices-page', robots: 'noindex, nofollow', referrer: 'no-referrer' })],
    ['work/index.html',frame('/work/','Work',`${WORK_COUNTS.total} projects by Richard Zhu: a quant research system, an accent-bias benchmark for speech recognition, a stock analysis app, and ${WORK_COUNTS.site.toLowerCase()} things that live on this site.`,work,{ stylesheet: '/work/style.css' })],
    ['projects/index.html',frame('/projects/','Projects','Projects by Richard Zhu: Nexus Tensor Alpha, a quant research system; EqualVoice, an accent-bias benchmark for speech recognition; and Apex Analysis, an open-source stock analysis app.',projects,{ stylesheet: '/work/style.css' })],
    ['fun/index.html',frame('/fun/','Fun','Browser toys by Richard Zhu: Paper Piano, Gym and Domain Expansion. Webcam hand and pose tracking that runs locally.',fun,{ stylesheet: '/work/style.css' })],
    ['about/index.html',frame('/about/','About','About Richard Zhu, a high school senior working on computer science, economics and machine learning research.',about,{ stylesheet: ['/portrait/portrait.css', BUBBLES.stylesheet], script: ['/portrait/about.js', BUBBLES.script], head: jsonLd(PERSON) })],
    ['research/index.html',frame('/research/','Research','Richard Zhu’s machine learning research at UNC PRIMES, his NeurIPS 2026 Agenthon workshop poster, and related projects.',research,{ stylesheet: BUBBLES.stylesheet, script: BUBBLES.script })],
    ['404.html',frame('/404.html','Page not found','This page could not be found.',lost,{ script: '/palette/notfound.js' })],
  ]);
}
