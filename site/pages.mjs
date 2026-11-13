import { LINKS, ABOUT, EXPERIENCE, PROJECTS, PUBLICATIONS, SKILLS } from './content.mjs';
import { skillsPage } from '../workspace/skills/page.mjs';
import { videoPage } from '../workspace/video/page.mjs';
import { blogIndex, blogPost, checkPosts, postPath } from '../workspace/blog/page.mjs';
import { POSTS } from '../workspace/blog/posts.mjs';
import { stoneNav } from '../workspace/stones/parts.mjs';
const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const link = (href, label) => `<a href="${escape(href)}"${href.startsWith('https:') ? ' target="_blank" rel="noopener noreferrer"' : ''}>${escape(label)} <span aria-hidden="true">↗</span>
</a>`;
// The site menu is the seven stones (workspace/stones/parts.mjs); CV, Contact, Stars and Skills live at the bottom of About.
const frame = (path, title, description, body, { image = '/richard.jpg', stylesheet, script, bodyClass } = {}) => `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(title)} — Richard Zhu</title>
<meta name="description" content="${escape(description)}">
<link rel="canonical" href="https://zelinzhu-richard.github.io${path}">
<meta property="og:title" content="${escape(title)} — Richard Zhu">
<meta property="og:description" content="${escape(description)}">
<meta property="og:image" content="https://zelinzhu-richard.github.io${escape(image)}">
<meta property="og:url" content="https://zelinzhu-richard.github.io${path}">
<meta property="og:type" content="website">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/portfolio.css">
${[].concat(stylesheet || []).map(href => `<link rel="stylesheet" href="${escape(href)}">`).join('\n')}
<script src="/portfolio.js" defer>
</script>
${[].concat(script || []).map(src => `<script type="module" src="${escape(src)}"></script>\n`).join('')}</head>
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
<div class="footer-bottom">
<div>${link(LINKS.github,'GitHub')}${link(LINKS.linkedin,'LinkedIn')}${link(LINKS.x,'X')}${link(LINKS.resume,'CV (PDF)')}</div>
<span>Richard Zhu · High school senior · CS and economics · © 2026</span>
<a href="/">Back to the phoenix homepage</a>
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
</div>
</li>`;
const intro = (label, title, description) => `<section class="page-intro">
<p class="eyebrow">${label}</p>
<h1>${title}</h1>
<p class="lede">${description}</p>
</section>`;
export function pages() {
  const groups = [
    ['research', 'Quant and AI evaluation', 'Longer projects. Python, mostly.'],
    ['site', 'Experiments on this site', 'Small things that run in your browser. Click through and try them.'],
  ];
  const facts = p => `<dl class="work-facts">
<div><dt>Year</dt><dd>${escape(p.year)}</dd></div>
<div><dt>Role</dt><dd>${escape(p.role)}</dd></div>
<div><dt>Stack</dt><dd>${escape(p.stack)}</dd></div>
<div><dt>Status</dt><dd>${escape(p.status)}</dd></div>
</dl>`;
  const media = p => p.image ? `<figure class="work-shot"><img src="${escape(p.image.src)}" alt="${escape(p.image.alt)}" loading="lazy" decoding="async"></figure>`
    : p.artifact ? `<figure class="work-code"><figcaption>${escape(p.artifact.label)}</figcaption><pre><code>${escape(p.artifact.code)}</code></pre></figure>` : '';
  const item = (p, n) => `<article class="work-item work-item--${p.group}" id="${escape(p.id)}">
<header class="work-head">
<p class="work-num">${String(n).padStart(2, '0')}</p>
<h2>${escape(p.name)}</h2>
<p class="work-context">${escape(p.context)}</p>
</header>
<div class="work-body">
<p class="work-summary">${escape(p.oneLiner)}</p>
<p class="work-desc">${escape(p.desc)}</p>${facts(p)}<div class="actions">${link(p.live, p.liveLabel || 'Open')}${link(p.repo, 'Source')}</div>
</div>${media(p)}
</article>`;
  let count = 0;
  const work = `<section class="work-intro">
<div>
<p class="eyebrow">Work · 2025–2026</p>
<h1>Things I’ve built</h1>
<p class="lede">Eight projects. Three are quant and AI evaluation work. Five are experiments that run right here in the browser. The source for all of them is on GitHub.</p>
</div>
<nav class="work-index" aria-label="Projects on this page">
<ol>${PROJECTS.map((p, i) => `<li><a href="#${escape(p.id)}"><span>${String(i + 1).padStart(2, '0')}</span><span>${escape(p.name)}</span><span>${escape(p.year)}</span></a></li>`).join('')}</ol>
</nav>
</section>` + groups.map(([key, label, note]) => `<section class="work-group work-group--${key}" aria-labelledby="group-${key}">
<div class="work-group-head"><h2 id="group-${key}" class="work-group-title">${label}</h2><p>${note}</p></div>
${PROJECTS.filter(p => p.group === key).map(p => item(p, ++count)).join('')}
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
  const projects = section('Projects', 'Projects', 'Three longer projects: a quant research system, a benchmark for speech-recognition bias, and an open-source stock analysis app. All Python.',
    PROJECTS.filter(p => p.group === 'research'), `${link('/fun/','Fun')}${link('/research/','Research')}${link('/work/','All work')}`);
  const fun = section('Fun', 'Fun', 'Small camera toys that run in your browser. They use your webcam with MediaPipe; nothing is uploaded. Open one and try it.',
    PROJECTS.filter(p => ['paper-piano', 'gym', 'domain-expansion'].includes(p.id)), `${link('/flash/','Flash')}${link('/art/','Art')}${link('/projects/','Projects')}${link('/work/','All work')}`);
  // Art: Neon Rain, then a second copy of the About page's living portrait (workspace/portrait/about.js binds to it).
  const art = `<section class="work-intro work-intro--section">
<div>
<p class="eyebrow">Art</p>
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
<button type="button" class="portrait-trigger" aria-label="Photo of Richard Zhu smiling at the camera. Click to see a living portrait of him drawn in code.">
<img src="/richard.jpg" alt="" width="800" height="1000" loading="lazy" decoding="async">
<span class="portrait-hint" aria-hidden="true">Click to see me drawn in code</span>
</button>
<figcaption>Me, 2026.</figcaption>
</figure>
</div>
</section><aside class="related">
<p>More</p>${link('/video/','Neon Rain')}${link('/fun/','Fun')}${link('/about/','About me')}</aside>`;
  const posts = checkPosts(POSTS);
  const about = intro('About','Richard Zhu','High school senior. I work on computer science and economics, and do machine learning research at UNC PRIMES.') + `<section class="biography">
<div>${ABOUT.paragraphs.map(p=>`<p>${escape(p)}</p>`).join('')}<div class="actions">${link(LINKS.resume,'CV (PDF)')}${link('/contacts/','Contact')}</div>
</div>
<figure data-portrait-figure>
<button type="button" class="portrait-trigger" aria-label="Photo of Richard Zhu smiling at the camera. Click to see a living portrait of him drawn in code.">
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
<li><a href="${escape(LINKS.resume)}"><span>CV</span><em>My CV as a PDF.</em></a></li>
<li><a href="/contacts/"><span>Contact</span><em>Email, GitHub, LinkedIn and X.</em></a></li>
<li><a href="/github/stars/"><span>Stars</span><em>Repositories I have starred on GitHub, sorted by type and purpose.</em></a></li>
<li><a href="/skills/"><span>Skills</span><em>Agent skills I use and the ones I write.</em></a></li>
</ul>
</section>`;
  // Research: only research roles go under Experience (UNC PRIMES for now); papers and posters under Publications.
  const researchRoles = EXPERIENCE.filter(x => x.org === 'UNC PRIMES');
  const research = intro('Machine learning','Research','Deep learning on brain imaging data at UNC PRIMES, a paper on agents for quantitative research, and the projects where I test the ideas.') + `<section id="experience" class="experience" aria-labelledby="research-experience">
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
<p>Forecasting models in Nexus Tensor Alpha. Measuring speech-recognition bias in EqualVoice. Open stock-analysis tools in Apex Analysis.</p>
<div class="actions">${link('/projects/','See the projects')}${link(LINKS.resume,'CV (PDF)')}${link('mailto:'+LINKS.email,'Email me about research')}</div>
</section>`;
  return new Map([
    ['skills/index.html',frame('/skills/','Skills','AI agent skills Richard Zhu uses and creates, with source repositories and notes on design and testing.',skillsPage,{ stylesheet: '/skills/style.css' })],
    ['video/index.html',frame('/video/','Neon Rain — Video','Neon Rain: an agentic AI filmmaking experiment by Richard Zhu, combining GPT Image, computer graphics, and temporal validation into a 10-second sci-fi noir film.',videoPage,{ image: '/video/assets/neon-rain-poster.jpg', stylesheet: '/video/style.css' })],
    ['art/index.html',frame('/art/','Art','Art by Richard Zhu: Neon Rain, a ten-second AI-made noir film, and a living portrait of him drawn in code.',art,{ image: '/video/assets/neon-rain-poster.jpg', stylesheet: ['/work/style.css', '/portrait/portrait.css'], script: '/portrait/about.js' })],
    ['blog/index.html',frame('/blog/','Blog','Richard Zhu’s blog: notes on what he is building and learning.',blogIndex(posts),{ stylesheet: '/blog/style.css' })],
    ...posts.map(p => [`${postPath(p).slice(1)}index.html`, frame(postPath(p), p.title, p.summary, blogPost(p), { stylesheet: '/blog/style.css' })]),
    ['work/index.html',frame('/work/','Work','Eight projects by Richard Zhu: a quant research system, an accent-bias benchmark for speech recognition, a stock analysis app, and five browser experiments.',work,{ stylesheet: '/work/style.css' })],
    ['projects/index.html',frame('/projects/','Projects','Projects by Richard Zhu: Nexus Tensor Alpha, a quant research system; EqualVoice, an accent-bias benchmark for speech recognition; and Apex Analysis, an open-source stock analysis app.',projects,{ stylesheet: '/work/style.css' })],
    ['fun/index.html',frame('/fun/','Fun','Browser toys by Richard Zhu: Paper Piano, Gym and Domain Expansion. Webcam hand and pose tracking that runs locally.',fun,{ stylesheet: '/work/style.css' })],
    ['about/index.html',frame('/about/','About','About Richard Zhu, a high school senior working on computer science, economics and machine learning research.',about,{ stylesheet: ['/portrait/portrait.css', BUBBLES.stylesheet], script: ['/portrait/about.js', BUBBLES.script] })],
    ['research/index.html',frame('/research/','Research','Richard Zhu’s machine learning research at UNC PRIMES, his NeurIPS 2026 Agenthon workshop poster, and related projects.',research,{ stylesheet: BUBBLES.stylesheet, script: BUBBLES.script })],
    ['404.html',frame('/404.html','Page not found','This page could not be found.',intro('404','Page not found','Nothing lives at this address. It may have moved.')+`<div class="actions">${link('/work/','Work')}${link('/','Homepage')}</div>`)],
  ]);
}
