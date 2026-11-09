import { LINKS, ABOUT, EXPERIENCE, PROJECTS, SKILLS } from './content.mjs';
import { skillsPage } from '../workspace/skills/page.mjs';
import { videoPage } from '../workspace/video/page.mjs';
import { nowPage } from '../workspace/now/page.mjs';
import { NOW } from '../workspace/now/now.mjs';
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
${stylesheet ? `<link rel="stylesheet" href="${escape(stylesheet)}">` : ''}
<script src="/portfolio.js" defer>
</script>
${script ? `<script type="module" src="${escape(script)}"></script>\n` : ''}</head>
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
    PROJECTS.filter(p => p.group === 'research'), `${link('/experiments/','Experiments')}${link('/research/','Research')}${link('/work/','All work')}`);
  const experiments = section('Experiments', 'Experiments', 'Small camera toys that run in your browser. They use your webcam with MediaPipe; nothing is uploaded. Open one and try it.',
    PROJECTS.filter(p => ['paper-piano', 'gym', 'domain-expansion'].includes(p.id)), `${link('/flash/','Flash')}${link('/video/','Film')}${link('/projects/','Projects')}${link('/work/','All work')}`);
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
<section id="experience" class="experience">
<h2>Experience</h2>
<ol>${EXPERIENCE.map(x=>`<li>
<span>${escape(x.when)}</span>
<div>
<h3>${escape(x.title)}</h3>
<p class="org">${escape(x.org)}</p>
<p>${escape(x.desc)}</p>${tags(x.tags)}</div>
</li>`).join('')}</ol>
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
  const research = intro('Machine learning','Research','Deep learning on brain imaging data at UNC PRIMES, and the projects where I test ideas from it.') + `<section class="research">
<p class="eyebrow">UNC PRIMES</p>
<h2>${escape(EXPERIENCE[0].title)}</h2>
<p class="project-lede">${escape(EXPERIENCE[0].desc)}</p>${tags(EXPERIENCE[0].tags)}<div class="actions">${link(LINKS.resume,'CV (PDF)')}${link('mailto:'+LINKS.email,'Email me about research')}</div>
</section>
<section class="research">
<p class="eyebrow">Related projects</p>
<h2>Where the methods show up</h2>
<p>Forecasting models in Nexus Tensor Alpha. Measuring speech-recognition bias in EqualVoice. Open stock-analysis tools in Apex Analysis.</p>
<div class="actions">${link('/work/','See the projects')}${link(LINKS.github,'GitHub')}</div>
</section>`;
  return new Map([
    ['skills/index.html',frame('/skills/','Skills','AI agent skills Richard Zhu uses and creates, with source repositories and notes on design and testing.',skillsPage,{ stylesheet: '/skills/style.css' })],
    ['video/index.html',frame('/video/','Neon Rain — Video','Neon Rain: an agentic AI filmmaking experiment by Richard Zhu, combining GPT Image, computer graphics, and temporal validation into a 10-second sci-fi noir film.',videoPage,{ image: '/video/assets/neon-rain-poster.jpg', stylesheet: '/video/style.css' })],
    ['now/index.html',frame('/now/','Now','What Richard Zhu is studying, has shipped, and plans next: a running log, updated as things move.',nowPage(NOW),{ stylesheet: '/now/style.css' })],
    ['work/index.html',frame('/work/','Work','Eight projects by Richard Zhu: a quant research system, an accent-bias benchmark for speech recognition, a stock analysis app, and five browser experiments.',work,{ stylesheet: '/work/style.css' })],
    ['projects/index.html',frame('/projects/','Projects','Projects by Richard Zhu: Nexus Tensor Alpha, a quant research system; EqualVoice, an accent-bias benchmark for speech recognition; and Apex Analysis, an open-source stock analysis app.',projects,{ stylesheet: '/work/style.css' })],
    ['experiments/index.html',frame('/experiments/','Experiments','Browser experiments by Richard Zhu: Paper Piano, Gym and Domain Expansion. Webcam hand and pose tracking that runs locally.',experiments,{ stylesheet: '/work/style.css' })],
    ['about/index.html',frame('/about/','About','About Richard Zhu, a high school senior working on computer science, economics and machine learning research.',about,{ stylesheet: '/portrait/portrait.css', script: '/portrait/about.js' })],
    ['research/index.html',frame('/research/','Research','Richard Zhu’s machine learning research at UNC PRIMES and related projects.',research)],
    ['404.html',frame('/404.html','Page not found','This page could not be found.',intro('404','Page not found','Nothing lives at this address. It may have moved.')+`<div class="actions">${link('/work/','Work')}${link('/','Homepage')}</div>`)],
  ]);
}
