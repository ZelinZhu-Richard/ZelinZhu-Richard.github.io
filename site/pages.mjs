import { LINKS, ABOUT, EXPERIENCE, PROJECTS, SKILLS } from './content.mjs';
const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const link = (href, label) => `<a href="${escape(href)}"${href.startsWith('https:') ? ' target="_blank" rel="noopener noreferrer"' : ''}>${escape(label)} <span aria-hidden="true">↗</span>
</a>`;
const nav = [['/work/','Work'],['/about/','About'],['/research/','Research'],[LINKS.resume,'CV'],['/contacts/','Contact']];
const frame = (path, title, description, body) => `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(title)} — Richard Zhu</title>
<meta name="description" content="${escape(description)}">
<link rel="canonical" href="https://zelinzhu-richard.github.io${path}">
<meta property="og:title" content="${escape(title)} — Richard Zhu">
<meta property="og:description" content="${escape(description)}">
<meta property="og:image" content="https://zelinzhu-richard.github.io/richard.jpg">
<meta property="og:url" content="https://zelinzhu-richard.github.io${path}">
<meta property="og:type" content="website">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/portfolio.css">
<script src="/portfolio.js" defer>
</script>
</head>
<body>
<a class="skip-link" href="#main">Skip to content</a>
<header class="site-header">
<a class="wordmark" href="/" aria-label="Richard Zhu — Home">Richard Zhu</a>
<button class="menu-button" type="button" aria-expanded="false" aria-controls="navigation">Menu</button>
<nav id="navigation" aria-label="Main navigation">${nav.map(([href,label]) => `<a href="${href}"${href===path?' aria-current="page"':''}>${label}</a>`).join('')}</nav>
</header>
<main id="main">${body}</main>
<footer class="site-footer">
<p>The future is waiting<br>to be <em>built.</em>
</p>
<div class="footer-bottom">
<span>© 2026 Richard Zhu</span>
<div>${link('mailto:'+LINKS.email,'Email')}${link(LINKS.github,'GitHub')}${link(LINKS.linkedin,'LinkedIn')}${link(LINKS.x,'X')}</div>
<a href="/">Return to the phoenix ↗</a>
</div>
</footer>
</body>
</html>`;
const tags = values => `<ul class="tags">${values.map(v=>`<li>${escape(v)}</li>`).join('')}</ul>`;
const slug = ['nexus-tensor-alpha','equalvoice','apex-analysis'];
const intro = (label, title, description) => `<section class="page-intro">
<p class="eyebrow">${label}</p>
<h1>${title}</h1>
<p class="lede">${description}</p>
</section>`;
export function pages() {
  const work = intro('Selected work · 2025—2026','Curiosity,<br><em>made real.</em>','AI research, open financial tools, and experiments that leave the notebook.') + PROJECTS.map((p,i)=>`<article class="project" id="${slug[i]}">
<div class="project-heading">
<p class="eyebrow">0${i+1} / ${escape(p.context)} · ${p.year}</p>
<h2>${escape(p.name)}</h2>
</div>
<div class="project-detail">
<p class="project-lede">${escape(p.oneLiner)}</p>
<p>${escape(p.desc)}</p>${tags(p.tags)}<div class="actions">${link(p.live,i===1?'View on Devpost':'Visit project')}${link(p.repo,'Source on GitHub')}</div>
</div>
</article>`).join('') + `<aside class="related">
<p>Behind the projects</p>${link('/research/','Explore my research')}${link('/about/','About me')}</aside>`;
  const about = intro('A little about me','Always<br><em>becoming.</em>','Richard Zhu · Computer science and economics · UNC Chapel Hill') + `<section class="biography">
<div>${ABOUT.paragraphs.map(p=>`<p>${escape(p)}</p>`).join('')}<div class="actions">${link(LINKS.resume,'Read my CV')}${link('/contacts/','Get in touch')}</div>
</div>
<figure>
<img src="/richard.jpg" alt="Richard Zhu smiling at the camera" width="800" height="1000">
<figcaption>Build in public. Learn along the way.</figcaption>
</figure>
</section>
<section id="experience" class="experience">
<p class="eyebrow">My trajectory</p>
<h2>Where I am.<br><em>Where I’m going.</em>
</h2>
<ol>${EXPERIENCE.map(x=>`<li>
<span>${escape(x.when)}</span>
<div>
<h3>${escape(x.title)}</h3>
<p class="org">${escape(x.org)}</p>
<p>${escape(x.desc)}</p>${tags(x.tags)}</div>
</li>`).join('')}</ol>
</section>
<section class="skills">
<p class="eyebrow">My toolkit</p>${SKILLS.buckets.map(x=>`<div>
<h3>${escape(x.label)}</h3>
<p>${x.items.map(escape).join(' · ')}</p>
</div>`).join('')}<div>
<h3>Languages spoken</h3>
<p>${SKILLS.languages.map(escape).join(' · ')}</p>
</div>
</section>`;
  const research = intro('Research & exploration','Learning to<br><em>see more.</em>','Machine learning, neuroscience images, and the questions inside the data.') + `<section class="research">
<p class="eyebrow">UNC PRIMES</p>
<h2>${escape(EXPERIENCE[0].title)}</h2>
<p class="project-lede">${escape(EXPERIENCE[0].desc)}</p>${tags(EXPERIENCE[0].tags)}<div class="actions">${link(LINKS.resume,'Research experience in my CV')}${link('mailto:'+LINKS.email,'Talk research')}</div>
</section>
<section class="research">
<p class="eyebrow">Related work</p>
<h2>Ideas in practice.</h2>
<p>Quantitative forecasting in Nexus Tensor Alpha. Accent fairness evaluation in EqualVoice. Open financial tooling in Apex Analysis.</p>
<div class="actions">${link('/work/','Explore the projects')}${link(LINKS.github,'GitHub')}</div>
</section>`;
  return new Map([
    ['work/index.html',frame('/work/','Work','Projects by Richard Zhu: Nexus Tensor Alpha, EqualVoice, and Apex Analysis.',work)],
    ['about/index.html',frame('/about/','About','About Richard Zhu, a computer science and economics student at UNC Chapel Hill.',about)],
    ['research/index.html',frame('/research/','Research','Richard Zhu’s machine learning research at UNC PRIMES and related projects.',research)],
    ['404.html',frame('/404.html','Page not found','This page could not be found.',intro('404','A different<br><em>path.</em>','This page does not exist. Return to the homepage or explore the work.')+`<div class="actions">${link('/','Home')}${link('/work/','Selected work')}</div>`)],
  ]);
}
