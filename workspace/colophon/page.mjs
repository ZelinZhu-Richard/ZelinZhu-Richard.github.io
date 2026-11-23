// /colophon/ body: how the site is made, what it borrows, and the index of everything on it.
// site/pages.mjs wraps it in the site frame. Every claim below should stay checkable in the repo (README.md).
import { siteIndex } from '../palette/index.mjs';

const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const REPO = 'https://github.com/ZelinZhu-Richard/ZelinZhu-Richard.github.io';

export const COLOPHON_DESCRIPTION = 'How Richard Zhu’s site is made: a static site with no npm dependencies and no framework of its own, what it borrows, and a list of everything on it.';

// The four figures. The page ships placeholders; build.mjs counts the built site and fills them in.
const FIGURES = [
  ['pages', 'pages'],
  ['files', 'files'],
  ['size', 'MiB, mostly MediaPipe and OpenCV for the camera toys'],
  ['deps', 'npm dependencies'],
];

// One row per typeface. face picks the specimen's class in style.css.
const FACES = [
  { label: 'Headings', face: 'display', specimen: 'Build. Learn. Repeat.', note: 'TT Neoris. It came with the homepage scene.' },
  { label: 'Reading text', face: 'body', specimen: 'I will stand in the snow at 3am to see the northern lights.', note: 'Iowan Old Style where the system has it, then Charter, Sitka Text, Cambria or Georgia. Nothing is downloaded.' },
  { label: 'Labels and numbers', face: 'mono', specimen: '01 About · Nov 2025–now · v0.1', note: 'The system monospace: SF Mono, Menlo or Consolas.' },
  { label: 'The name on the homepage', face: 'name', specimen: 'Richard Zhu', note: 'Ibarra Real Nova Italic, under the SIL Open Font License.', link: ['/hero-name/OFL.txt', 'License text'] },
];

// Night-theme values from public/portfolio.css. The test compares them with that file, so they cannot drift.
export const SWATCHES = [
  ['--paper', '#100f15'],
  ['--card', '#16151c'],
  ['--line', '#2d2b34'],
  ['--muted', '#a8a398'],
  ['--ink', '#ece9e1'],
  ['--accent', '#e8743b'],
];

// What is not mine. THIRD_PARTY.md and the vendor folders hold the details these sentences summarise.
const CREDITS = [
  {
    name: 'The phoenix homepage',
    text: 'Adapted from a public storytelling site by the agency Noomo. I captured its front end in September 2026 and replaced the copy, navigation, links and destinations with my own. The 3D scene, the models, the choreography and the audio are their work, not mine. It still runs on their Nuxt and Vue build, with Three.js and GSAP, and so does the Contact page.',
    link: [`${REPO}/blob/main/THIRD_PARTY.md`, 'Provenance notes'],
  },
  {
    name: 'The sharks',
    text: 'The ASCII sharks behind every page are stackedlol/ascii-sharks, vendored and adapted: a pause button, a lower rendering cost and no grid lines.',
    link: ['https://github.com/stackedlol/ascii-sharks', 'ascii-sharks'],
  },
  {
    name: 'Hand and pose tracking',
    text: 'The camera toys use Google’s MediaPipe, and Paper Piano also uses OpenCV.js. Both run in your browser; no video is uploaded.',
  },
  {
    name: 'Sync',
    text: 'Daily is connected to a Supabase project. The page reads a public copy of my game from it, and a vendored copy of supabase-js handles my sign-in.',
  },
];

const LIMITS = [
  ['Analytics', 'No analytics and no tracking scripts. The borrowed homepage came with Google Analytics; it is switched off and its ID is removed. GitHub Pages, which serves the site, logs IP addresses for security.'],
  ['Cookies', 'The site sets no cookies. Some pages keep settings or progress in your browser’s local storage.'],
  ['JavaScript', 'The pages you read are static HTML and work without JavaScript. The homepage, Contact, the camera toys, Flash and Daily need it.'],
];

// Same marks as the rest of the site: ↗ leaves it and opens a new tab (also said in words), → stays.
const leaves = href => href.startsWith('https:');
const newTab = href => leaves(href) ? ' target="_blank" rel="noopener noreferrer"' : '';
const away = '<span aria-hidden="true">↗</span><span class="visually-hidden"> (opens in a new tab)</span>';
const textLink = ([href, label]) => `<a href="${escape(href)}"${newTab(href)}>${escape(label)} ${leaves(href) ? away : '<span aria-hidden="true">→</span>'}</a>`;
const more = link => link ? `\n<p class="colophon-more">${textLink(link)}</p>` : '';

const section = (id, title, body) => `<section id="${escape(id)}" class="colophon-section" aria-labelledby="${escape(id)}-title">
<h2 id="${escape(id)}-title">${escape(title)}</h2>
${body}
</section>`;

const figure = ([key, label]) => `<div><dt>${escape(label)}</dt><dd><span data-stat="${escape(key)}">–</span></dd></div>`;

const faceRow = f => `<div><dt>${escape(f.label)}</dt><dd>
<p class="colophon-specimen colophon-specimen--${escape(f.face)}">${escape(f.specimen)}</p>
<p class="colophon-note">${escape(f.note)}</p>${more(f.link)}
</dd></div>`;

const swatch = ([token, hex]) => `<li><span class="colophon-chip" style="background:var(${escape(token)})" aria-hidden="true"></span><code>${escape(token)}</code> ${escape(hex)}</li>`;

const creditRow = c => `<div><dt>${escape(c.name)}</dt><dd>
<p>${escape(c.text)}</p>${more(c.link)}
</dd></div>`;

const limitRow = ([label, text]) => `<div><dt>${escape(label)}</dt><dd><p>${escape(text)}</p></dd></div>`;

// One row of the index. The hint sits inside the link, so the whole row is the target.
// The space before the hint keeps the two apart where the grid is not there to do it (reader views, copied text).
function indexRow(item) {
  const out = Boolean(item.external) || leaves(item.href);
  const current = item.href === '/colophon/' ? ' aria-current="page"' : '';
  const label = item.label ? `<span class="colophon-label">${escape(item.label)}</span> ` : '';
  const hint = item.hint ? ` <span class="colophon-hint">${escape(item.hint)}</span>` : '';
  return `<li><a href="${escape(item.href)}"${out ? ' target="_blank" rel="noopener noreferrer"' : ''}${current}><span class="colophon-title">${label}${escape(item.title)}${out ? ` ${away}` : ''}</span>${hint}</a></li>`;
}

// Numbered ids, not ones made from the group's name: a name can never collide with another id on the page.
// role="list": Safari stops announcing a list once its bullets are styled away, and with it the label.
const groupBlock = (g, i) => `<div class="colophon-group">
<h3 id="everything-${i + 1}">${escape(g.group)}</h3>
<ul role="list" aria-labelledby="everything-${i + 1}">${g.items.map(indexRow).join('')}</ul>
</div>`;

/** The page body, for frame() in site/pages.mjs. index: the groups to list; the site's own index unless a test passes one. */
export function colophonPage({ index = siteIndex() } = {}) {
  return `<section class="page-intro">
<p class="eyebrow">Colophon</p>
<h1>How this site is made</h1>
<p class="lede">A static site with no npm dependencies and no framework of its own. One Node script builds it, a test suite checks it, and GitHub Pages serves it.</p>
</section>
${section('numbers', 'Numbers', `<dl class="colophon-numbers">
${FIGURES.map(figure).join('\n')}
</dl>
<p class="colophon-note">Counted from the built files on every build.</p>`)}
${section('build', 'Build', `<p>Every page ships as plain HTML, CSS and JavaScript. A build script renders the pages from a few data files and copies each feature from its own folder. Then a checker walks the output and fails the build on a broken link, a missing anchor, a JavaScript syntax error or anything that looks like a leaked key.</p>
<p>A push to main runs the tests, builds the site and deploys it. Nothing is fetched at build time. Of my pages in <a href="#everything">the list below</a>, only Daily calls an outside server: it asks Supabase for my game.</p>
<div class="actions">${textLink([REPO, 'Source on GitHub'])}</div>`)}
${section('type', 'Type', `<dl class="colophon-rows">
${FACES.map(faceRow).join('\n')}
</dl>`)}
${section('colour', 'Colour', `<p>Night is the default, so the pages read as a continuation of the homepage. There is one accent, burnt orange, and it is used for one thing per screen.</p>
<ul class="colophon-swatches">
${SWATCHES.map(swatch).join('\n')}
</ul>`)}
${section('borrowed', 'Borrowed', `<dl class="colophon-rows colophon-credits">
${CREDITS.map(creditRow).join('\n')}
</dl>`)}
${section('limits', 'What it does not do', `<dl class="colophon-rows">
${LIMITS.map(limitRow).join('\n')}
</dl>`)}
${section('everything', 'Everything here', `<div class="colophon-index">
${index.map(groupBlock).join('\n')}
</div>`)}`;
}

const PLACEHOLDER = /(<span data-stat="([^"]*)">)[^<]*(<\/span>)/g;

/** Writes each figure into its <span data-stat="KEY">. Throws when a figure and a placeholder do not pair up. */
export function fillStats(html, stats) {
  const filled = new Set();
  const out = html.replace(PLACEHOLDER, (_, open, key, close) => {
    if (!Object.hasOwn(stats, key) || stats[key] == null) throw new Error(`Colophon: no value for the "${key}" figure`);
    filled.add(key);
    return `${open}${escape(stats[key])}${close}`;
  });
  for (const key of Object.keys(stats)) if (!filled.has(key)) throw new Error(`Colophon: no placeholder for the "${key}" figure`);
  return out;
}
