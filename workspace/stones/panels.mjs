// The short version of each part, shown in the panel that opens over the phoenix scene.
// Built from the same data as the full pages, so the two never disagree.
import { PARTS } from './parts.mjs';
import { LINKS, ABOUT, EXPERIENCE, PROJECTS, PUBLICATIONS } from '../../site/content.mjs';
import { POSTS } from '../blog/posts.mjs';
import { checkPosts, formatDate, postPath } from '../blog/page.mjs';

const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ext = href => href.startsWith('http') ? ' target="_blank" rel="noopener noreferrer"' : '';
const a = (href, label, cls = '') => `<a${cls ? ` class="${cls}"` : ''} href="${escape(href)}"${ext(href)}>${escape(label)}</a>`;
const project = id => PROJECTS.find(p => p.id === id);

const row = p => `<li class="sp-row">
<div class="sp-row-head"><h3>${escape(p.name)}</h3><span>${escape(p.year)}</span></div>
<p>${escape(p.oneLiner)}</p>
<p class="sp-meta">${escape(p.stack)} · ${escape(p.status)}</p>
<p class="sp-links">${a(p.live, p.liveLabel || 'Open')}${a(p.repo, 'Source')}</p>
</li>`;

const shotRow = p => `<li class="sp-shot">
<img src="${escape(p.image.src)}" alt="${escape(p.image.alt)}" loading="lazy" decoding="async">
<div><h3>${escape(p.name)}</h3><p>${escape(p.oneLiner)}</p><p class="sp-links">${a(p.live, p.liveLabel || 'Open')}</p></div>
</li>`;

const BODY = {
  projects: () => ({
    lede: 'Three longer projects. All Python.',
    html: `<ul class="sp-list">${PROJECTS.filter(p => p.group === 'research').map(row).join('')}</ul>`,
  }),
  research: () => {
    const r = EXPERIENCE[0];
    return {
      lede: `${r.org}. ${r.desc}`,
      html: `<ul class="sp-tags">${r.tags.map(t => `<li>${escape(t)}</li>`).join('')}</ul>
<h3 class="sp-sub">Publications</h3>
<ul class="sp-plain">${PUBLICATIONS.map(p => `<li><b>${a(p.href, p.title)}</b><span>${escape(p.venue)} · ${escape(p.kind)}</span></li>`).join('')}</ul>
<h3 class="sp-sub">Where the methods show up</h3>
<ul class="sp-plain"><li><b>Nexus Tensor Alpha</b> forecasting models picked by market regime</li><li><b>EqualVoice</b> measuring speech-recognition bias by accent</li><li><b>Apex Analysis</b> open-source stock analysis</li></ul>`,
    };
  },
  art: () => {
    const p = project('neon-rain');
    return {
      lede: 'A short film and a portrait of me, both made in code.',
      html: `<figure class="sp-poster"><img src="${escape(p.image.src)}" alt="${escape(p.image.alt)}" loading="lazy" decoding="async"></figure>
<h3 class="sp-sub">${escape(p.name)}</h3><p>${escape(p.oneLiner)}</p>
<h3 class="sp-sub">Living portrait</h3><p>Me drawn in code from two selfies, in six styles from ASCII to pixel art.</p>
<p class="sp-links">${a(p.live, 'Watch the film')}${a('/art/#portrait', 'See the portrait')}</p>`,
    };
  },
  fun: () => ({
    lede: 'Camera toys that run in your browser with MediaPipe. Nothing is uploaded.',
    html: `<ul class="sp-shots">${['paper-piano', 'gym', 'domain-expansion'].map(id => shotRow(project(id))).join('')}</ul>
<p class="sp-links">${a('/flash/', 'Flash, a card maker')}</p>`,
  }),
  blog: () => {
    const posts = checkPosts(POSTS).slice(0, 3);
    return {
      lede: 'Notes on what I’m building and learning, written as I go.',
      html: posts.length
        ? `<ul class="sp-plain">${posts.map(p => `<li><b>${a(postPath(p), p.title)}</b><span>${formatDate(p.date)}</span><em>${escape(p.summary)}</em></li>`).join('')}</ul>`
        : '<p>No posts yet. The first ones are on the way.</p>',
    };
  },
  daily: () => {
    const p = project('daily');
    return {
      lede: p.oneLiner,
      html: `<figure class="sp-poster"><img src="${escape(p.image.src)}" alt="${escape(p.image.alt)}" loading="lazy" decoding="async"></figure><p>${escape(p.desc)}</p>`,
    };
  },
  about: () => ({
    lede: 'High school senior. I work on computer science and economics, and do machine learning research at UNC PRIMES.',
    html: `<div class="sp-about"><img src="/richard.jpg" alt="Richard Zhu" loading="lazy" decoding="async"><div>${ABOUT.paragraphs.slice(0, 2).map(p => `<p>${escape(p)}</p>`).join('')}</div></div>
<h3 class="sp-sub">Experience</h3>
<ul class="sp-plain">${EXPERIENCE.map(x => `<li><b>${escape(x.title)}</b><span>${escape(x.org)} · ${escape(x.when)}</span></li>`).join('')}</ul>
<p class="sp-links">${a(LINKS.resume, 'CV (PDF)')}${a('mailto:' + LINKS.email, 'Email')}${a(LINKS.github, 'GitHub')}${a(LINKS.linkedin, 'LinkedIn')}</p>`,
  }),
};

export function panels() {
  return PARTS.map(part => ({ id: part.id, title: part.title, href: part.href, ring: part.ring, ...BODY[part.id]() }));
}
