// Command palette: the build step, the ranking, the 404 page's guess, the rules the browser files keep,
// and the built palette.js run in a small stand-in for a page.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { PALETTE_FILES, TRIGGER, buildPalette, flatIndex, stampImports, withPalette } from '../build.mjs';
import { siteIndex } from '../index.mjs';
import { closest, distance, search } from '../search.js';
import { actionItems, byGroup, countLabel, moveTo, shortcut } from '../palette.js';
import { guess, shownPath, sitePages } from '../notfound.js';
import { pages } from '../../../site/pages.mjs';
import { LINKS } from '../../../site/content.mjs';

const source = file => readFile(new URL(`../${file}`, import.meta.url), 'utf8');
const titles = items => items.map(item => item.title);

const PAGE = `<!doctype html>
<html lang="en">
<head>
<link rel="canonical" href="https://zelinzhu-richard.github.io/about/">
<link rel="stylesheet" href="/portfolio.css">
</head>
<body>
<header class="site-header">
<a class="wordmark" href="/">Richard Zhu</a>
<button class="menu-button" type="button" aria-expanded="false" aria-controls="navigation">Menu</button>
<nav id="navigation"></nav>
</header>
<button class="menu-button" type="button">A second one, never touched</button>
</body>
</html>`;

// The same strings tools/verify.mjs refuses in built files, plus the pages that must stay unlisted.
const FORBIDDEN = [/\/Users\//, /https?:\/\/(?:localhost|127\.0\.0\.1):\d+/, /\/src\/main\.jsx/, /noomoagency\.com|hello@noomo|Noomo Agency Logo|\/cases\/|videos\/cases/, /noindex/, /\/choices|\/duke|\/hq|\/repolarisdm/];

const ITEMS = [
  { group: 'Sections', title: 'About', hint: 'Who I am, CV, contact, stars', href: '/about/', label: '01' },
  { group: 'Sections', title: 'Projects', hint: 'Quant research, AI evaluation', href: '/projects/', label: '02' },
  { group: 'In the browser', title: 'Paper Piano', hint: 'A piano drawn on paper.', href: '/ppiano/', keywords: 'JavaScript MediaPipe camera' },
  { group: 'More', title: 'All work', hint: 'All eight projects on one page.', href: '/work/', keywords: 'projects portfolio' },
  { group: 'More', title: 'Café notes', hint: 'Écriture', href: '/cafe/' },
  { group: 'Elsewhere', title: 'GitHub', hint: 'ZelinZhu-Richard', href: 'https://github.com/ZelinZhu-Richard', external: true, keywords: 'code source' },
  { group: 'Elsewhere', title: 'Email', hint: 'me@example.com', href: 'mailto:me@example.com' },
];

const PATHS = ['/', '/about/', '/projects/', '/research/', '/art/', '/fun/', '/blog/', '/blog/feed.xml', '/github/stars/', '/github/stars/research/', '/Zelin_Zhu_CV.pdf'];

test('the flat index is every item of the site index, in display order, with its group', () => {
  const groups = siteIndex();
  const flat = flatIndex();
  assert.deepEqual(flat, groups.flatMap(g => g.items.map(item => ({ group: g.group, ...item }))));
  assert.deepEqual([...new Set(flat.map(item => item.group))], groups.map(g => g.group), 'groups stay together and in order');
  for (const item of flat) {
    assert.deepEqual(Object.keys(item).slice(0, 4), ['group', 'title', 'hint', 'href']);
    for (const key of ['group', 'title', 'hint', 'href']) assert.ok(typeof item[key] === 'string' && item[key], `${item.href} ${key}`);
  }
});

test('a page with the shared header gets the Search link before the menu button and the assets before </head>', () => {
  assert.equal(TRIGGER, '<a class="palette-button" href="/colophon/#everything" data-palette-open><span>Search</span><kbd aria-hidden="true">/</kbd></a>');
  const html = withPalette(PAGE, 'abc123');
  const assets = '<link rel="stylesheet" href="/palette/palette.css?v=abc123">\n<script type="module" src="/palette/palette.js?v=abc123"></script>\n';
  // Only the first menu button gets the link, and nothing else in the page changes.
  assert.equal(html, PAGE.replace('<button class="menu-button"', `${TRIGGER}<button class="menu-button"`).replace('</head>', `${assets}</head>`));
  assert.ok(html.includes(`<a class="wordmark" href="/">Richard Zhu</a>\n${TRIGGER}<button class="menu-button" type="button" aria-expanded="false"`));
  assert.equal(html.split(TRIGGER).length, 2);
  assert.equal(withPalette(html, 'abc123'), html, 'running it again changes nothing');
  assert.equal(withPalette(html, 'a-later-build'), html);
});

test('pages without the shared header are left as they are', () => {
  const phoenix = '<html><head><link rel="stylesheet" href="/local.css"></head><body><button class="mobile-menu-button">Menu</button></body></html>';
  for (const html of [phoenix, PAGE.replace('href="/portfolio.css"', 'href="/other.css"'), PAGE.replaceAll('class="menu-button"', 'class="other-button"'), '']) {
    assert.equal(withPalette(html, 'abc123'), html);
  }
});

test('every page the site frame builds takes the Search link exactly once', () => {
  let framed = 0;
  for (const [file, html] of pages()) {
    if (!html.includes('class="site-header"')) continue;
    framed++;
    const out = withPalette(html, 'abc123');
    assert.equal(out.split('data-palette-open').length, 2, file);
    assert.ok(out.indexOf(TRIGGER) > out.indexOf('class="wordmark"') && out.indexOf(TRIGGER) < out.indexOf('<nav id="navigation"'), `${file}: between the wordmark and the menu`);
    assert.ok(out.indexOf('/palette/palette.js?v=abc123') < out.search(/<\/head>/i), file);
  }
  assert.ok(framed > 5, 'the frame still marks its header the way withPalette looks for it');
});

test('relative imports are stamped with the version, and nothing else is', () => {
  const code = "import { search } from './search.js';\nconst list = () => import('./index.js');\nimport x from 'node:fs';\nconst s = './search.js is a file';";
  assert.equal(stampImports(code, 'v9'), "import { search } from './search.js?v=v9';\nconst list = () => import('./index.js?v=v9');\nimport x from 'node:fs';\nconst s = './search.js is a file';");
});

test('the build ships the files, a parseable index and stamped imports, and skips hq/', async () => {
  const out = await mkdtemp(join(tmpdir(), 'palette-test-'));
  try {
    const bare = '<!doctype html><html><head></head><body>No shared header here.</body></html>';
    for (const dir of ['about', 'github/stars', 'hq', 'flash']) await mkdir(join(out, dir), { recursive: true });
    await writeFile(join(out, 'about/index.html'), PAGE);
    await writeFile(join(out, 'github/stars/index.html'), PAGE);
    await writeFile(join(out, 'hq/index.html'), PAGE);
    await writeFile(join(out, 'flash/index.html'), bare);

    const version = await buildPalette(out);
    assert.match(version, /^[0-9a-f]{10}$/);
    assert.deepEqual((await readdir(join(out, 'palette'))).sort(), [...PALETTE_FILES, 'index.js'].sort());

    const built = Object.fromEntries(await Promise.all([...PALETTE_FILES, 'index.js'].map(async file => [file, await readFile(join(out, 'palette', file), 'utf8')])));
    const json = built['index.js'].match(/^export const INDEX = (.+);$/m);
    assert.ok(json, 'index.js is one exported constant');
    assert.deepEqual(JSON.parse(json[1]), JSON.parse(JSON.stringify(flatIndex())));

    assert.ok(built['palette.js'].includes(`from './search.js?v=${version}'`));
    assert.ok(built['palette.js'].includes(`import('./index.js?v=${version}')`));
    assert.ok(built['notfound.js'].includes(`from './search.js?v=${version}'`));
    assert.ok(built['notfound.js'].includes(`import('./index.js?v=${version}')`));
    for (const file of ['palette.js', 'notfound.js']) assert.doesNotMatch(built[file], /(?:from\s*|import\s*\(\s*)['"]\.\/[\w.-]+\.js['"]/, `${file}: an import without the version`);
    assert.equal(built['search.js'], await source('search.js'));
    assert.equal(built['palette.css'], await source('palette.css'));

    for (const page of ['about/index.html', 'github/stars/index.html']) {
      const html = await readFile(join(out, page), 'utf8');
      assert.equal(html, withPalette(PAGE, version), page);
      assert.ok(html.includes(`/palette/palette.js?v=${version}`) && html.includes(TRIGGER), page);
    }
    assert.equal(await readFile(join(out, 'hq/index.html'), 'utf8'), PAGE, 'hq/ gets no Search button');
    assert.equal(await readFile(join(out, 'flash/index.html'), 'utf8'), bare);

    for (const [name, text] of [...Object.entries(built), ['an injected page', withPalette(PAGE, version)]]) {
      for (const pattern of FORBIDDEN) assert.doesNotMatch(text, pattern, `${name} must not contain ${pattern}`);
    }

    assert.equal(await buildPalette(out), version, 'the same sources give the same version');
    assert.equal(await readFile(join(out, 'about/index.html'), 'utf8'), withPalette(PAGE, version), 'a second run changes nothing');
  } finally {
    await rm(out, { recursive: true, force: true });
  }
});

test('an empty query returns every item in its original order', () => {
  for (const query of ['', '   ', '\t']) {
    const found = search(ITEMS, query);
    assert.deepEqual(found, ITEMS);
    assert.notEqual(found, ITEMS, 'a copy, so a caller may sort it');
  }
});

test('results are ranked by where the query matches, best first', () => {
  // Listed worst first, so the order that comes back is the ranking's own.
  const tiers = [
    { group: 'g', title: 'Plum', hint: 'no match at all', href: '/0' },
    { group: 'g', title: 'Kind in winter', hint: 'the letters in order, but far apart', href: '/far' },
    { group: 'g', title: 'Kit wash', hint: 'the letters in order, close together', href: '/10' },
    { group: 'g', title: 'Juice', hint: 'a snowkiwi blend', href: '/25' },
    { group: 'g', title: 'Fruit', hint: 'x', href: '/40', keywords: 'green kiwi' },
    { group: 'g', title: 'Snowkiwi', hint: 'inside the title', href: '/60' },
    { group: 'g', title: 'Green kiwi', hint: 'a later word of the title', href: '/80' },
    { group: 'g', title: 'Kiwi farm', hint: 'the title starts with it', href: '/100' },
  ];
  assert.deepEqual(search(tiers, 'kiw').map(item => item.href), ['/100', '/80', '/60', '/40', '/25', '/10']);
  // A title that starts with the query beats a match in the hint or keywords.
  assert.deepEqual(titles(search(ITEMS, 'pro')), ['Projects', 'All work']);
  assert.deepEqual(titles(search(ITEMS, 'work')), ['All work']);
  // The group name counts too.
  assert.deepEqual(titles(search(ITEMS, 'elsewhere')), ['GitHub', 'Email']);
  // Equal scores keep their original order.
  assert.deepEqual(titles(search(ITEMS, 'a')), ['About', 'All work', 'Paper Piano', 'Café notes', 'Email', 'Projects', 'GitHub']);
});

test('skipped letters still find a title, but a long title does not match every short word', () => {
  for (const [query, title] of [['projcts', 'Projects'], ['abt', 'About'], ['ppiano', 'Paper Piano'], ['githb', 'GitHub']]) {
    assert.deepEqual(titles(search(ITEMS, query)), [title], query);
  }
  const long = { group: 'g', title: 'Validity-Constrained Agentic Quantitative Research: A Hidden-Ground-Truth Benchmark and a Bounded Scheduler Comparison', hint: 'x', href: '/long' };
  for (const query of ['github', 'home', 'camera', 'rss', 'stars']) assert.deepEqual(search([long], query), [], query);
  assert.deepEqual(search([long], 'quant'), [long]);
  assert.deepEqual(search([long], 'bnchmrk'), [long]);
});

test('every word of the query must match', () => {
  assert.deepEqual(titles(search(ITEMS, 'all proj')), ['All work']);
  assert.deepEqual(titles(search(ITEMS, '  paper   camera ')), ['Paper Piano']);
  assert.deepEqual(search(ITEMS, 'paper zzz'), []);
});

test('matching ignores case and accents, and no match returns an empty list', () => {
  for (const query of ['CAFE', 'café', 'Cafè', 'ecriture', 'ÉCRITURE']) assert.deepEqual(titles(search(ITEMS, query)), ['Café notes'], query);
  assert.deepEqual(titles(search(ITEMS, 'GITHUB')), ['GitHub']);
  assert.deepEqual(search(ITEMS, 'zzzz'), []);
  assert.deepEqual(search([], 'about'), []);
});

test('every destination on the site can be found by typing its title', () => {
  const items = flatIndex();
  for (const item of items) assert.ok(search(items, item.title).includes(item), item.title);
  assert.equal(search(items, 'about')[0].href, '/about/');
});

test('edit distance counts a swap of two neighbouring letters as one change', () => {
  assert.equal(distance('abuot', 'about'), 1);
  assert.equal(distance('kitten', 'sitting'), 3);
  assert.equal(distance('', 'art'), 3);
  assert.equal(distance('blog', 'blog'), 0);
});

test('the 404 guess fixes typos, case, a missing slash and a stray .html', () => {
  assert.equal(closest('/abuot/', PATHS), '/about/');
  assert.equal(closest('/projcts', PATHS), '/projects/');
  assert.equal(closest('/project', PATHS), '/projects/');
  assert.equal(closest('/about', PATHS), '/about/');
  assert.equal(closest('/About/', PATHS), '/about/');
  assert.equal(closest('/about.html', PATHS), '/about/');
  assert.equal(closest('/blog/index.html', PATHS), '/blog/');
  assert.equal(closest('/reserch/?from=mail#top', PATHS), '/research/');
  assert.equal(closest('/zelin_zhu_cv.pdf', PATHS), '/Zelin_Zhu_CV.pdf');
  assert.equal(closest('/github/stars/reserch/', PATHS), '/github/stars/research/');
});

test('a deeper path that does not exist falls back to the longest real page above it', () => {
  assert.equal(closest('/research/primes', PATHS), '/research/');
  assert.equal(closest('/blog/2026/a-post-that-moved/', PATHS), '/blog/');
  assert.equal(closest('/github/stars/research/nlp/attention/', PATHS), '/github/stars/research/');
  assert.equal(closest('/github/stars/python/', PATHS), '/github/stars/');
  assert.equal(closest('/blogosphere/2026/', PATHS), null, 'whole folder names only');
  assert.equal(closest('/blog/ab/', [...PATHS, '/blog/cd/']), '/blog/', 'a shared folder does not make two different pages alike');
});

test('an address cut short is completed to the shortest real one that starts the same way', () => {
  assert.equal(closest('/github/', PATHS), '/github/stars/');
  assert.equal(closest('/github', PATHS), '/github/stars/');
  assert.equal(closest('/proj', PATHS), '/projects/');
  assert.equal(closest('/blog/fe', PATHS), '/blog/feed.xml');
  assert.equal(closest('/github/stars/res', PATHS), '/github/stars/research/', 'a longer address beats the folder above');
  assert.equal(closest('/blog', PATHS), '/blog/', 'the page itself beats a longer one');
  assert.equal(closest('/re', PATHS), null, 'two letters could be anything');
});

test('garbage gets no guess, and the homepage is never one', () => {
  for (const path of ['/wp-admin/setup.php', '/zzzzzzzz', '/xy', '/abc', '/.env', '/a/b/c/d']) assert.equal(closest(path, PATHS), null, path);
  for (const path of ['/', '', '/index.html', '//', '/?q=1']) assert.equal(closest(path, PATHS), null, path);
  assert.equal(closest('/x', ['/']), null);
  assert.equal(closest('/about', []), null);
});

test('the 404 page names pages by their own entry and never offers mail or another site', () => {
  const index = [...ITEMS, { group: 'Projects', title: 'One project', hint: 'x', href: '/projects/#one' }, { group: 'In the browser', title: 'Living portrait', hint: 'x', href: '/art/#portrait' }];
  assert.deepEqual([...sitePages(index)], [['/about/', 'About'], ['/projects/', 'Projects'], ['/ppiano/', 'Paper Piano'], ['/work/', 'All work'], ['/cafe/', 'Café notes'], ['/art/', '']]);
  assert.deepEqual(guess('/abuot', index), { href: '/about/', title: 'About' });
  assert.deepEqual(guess('/projects/one', index), { href: '/projects/', title: 'Projects' });
  assert.deepEqual(guess('/art', index), { href: '/art/', title: '/art/' }, 'a page known only by an anchor is named by its path');
  assert.equal(guess('/zzzzzzzz', index), null);
  assert.deepEqual(guess('/project', flatIndex()), { href: '/projects/', title: 'Projects' });
});

test('the missing path is shown decoded and cut to 80 characters', () => {
  assert.equal(shownPath('/abuot/'), '/abuot/');
  assert.equal(shownPath('/caf%C3%A9'), '/café');
  assert.equal(shownPath('/bad%E0%A4%A'), '/bad%E0%A4%A', 'broken encoding is shown as it came');
  const long = shownPath(`/${'x'.repeat(200)}`);
  assert.equal(long, `/${'x'.repeat(79)}…`);
  assert.equal(shownPath(`/${'x'.repeat(79)}`), `/${'x'.repeat(79)}`, 'exactly 80 characters fit');
  assert.equal(shownPath(`/${'😀'.repeat(100)}`), `/${'😀'.repeat(79)}…`, 'the cut never splits a character');
});

test('the result count and the shortcuts read as the page shows them', () => {
  assert.deepEqual([0, 1, 2, 30].map(countLabel), ['No results', '1 result', '2 results', '30 results']);

  assert.equal(shortcut({ key: 'k', metaKey: true }), 'toggle');
  assert.equal(shortcut({ key: 'K', ctrlKey: true }, { typing: true, dialogOpen: true }), 'toggle', 'Cmd/Ctrl+K works anywhere');
  assert.equal(shortcut({ key: 'k' }), null);
  assert.equal(shortcut({ key: 'л', code: 'KeyK', ctrlKey: true }), 'toggle', 'the K key on a Russian layout');
  assert.equal(shortcut({ key: 't', code: 'KeyK', ctrlKey: true }), null, 'on Dvorak that key is T, and Ctrl+T is not ours');
  assert.equal(shortcut({ key: 'k', metaKey: true, shiftKey: true }), null);
  assert.equal(shortcut({ key: 'k', ctrlKey: true, altKey: true }), null);
  assert.equal(shortcut({ key: '/' }), 'open');
  assert.equal(shortcut({ key: '/', shiftKey: true }), 'open', 'some layouts type "/" with Shift');
  assert.equal(shortcut({ key: '/' }, { typing: true }), null);
  assert.equal(shortcut({ key: '/' }, { dialogOpen: true }), null);
  assert.equal(shortcut({ key: '/', ctrlKey: true }), null);
  assert.equal(shortcut({ key: '/', altKey: true }), null);
  assert.equal(shortcut({ key: 'k', metaKey: true, defaultPrevented: true }), null);
  assert.equal(shortcut({ key: '/', isComposing: true }), null);
});

test('arrow keys wrap, Home and End jump, and other keys are left to the input', () => {
  assert.equal(moveTo('ArrowDown', 0, 3), 1);
  assert.equal(moveTo('ArrowDown', 2, 3), 0);
  assert.equal(moveTo('ArrowUp', 0, 3), 2);
  assert.equal(moveTo('ArrowUp', 2, 3), 1);
  assert.equal(moveTo('Home', 2, 3), 0);
  assert.equal(moveTo('End', 0, 3), 2);
  assert.equal(moveTo('a', 0, 3), null);
  assert.equal(moveTo('Enter', 0, 3), null);
  assert.equal(moveTo('ArrowDown', -1, 0), null, 'nothing to move to in an empty list');
});

test('the list is grouped in order and the actions fit the page they are on', () => {
  assert.deepEqual(byGroup(ITEMS).map(([name, items]) => [name, titles(items)]), [['Sections', ['About', 'Projects']], ['In the browser', ['Paper Piano']], ['More', ['All work', 'Café notes']], ['Elsewhere', ['GitHub', 'Email']]]);
  assert.deepEqual(byGroup([]), []);

  const [copy, sharks] = actionItems(ITEMS, 'Pause sharks');
  assert.deepEqual([copy.group, copy.title, copy.address, copy.href], ['Actions', 'Copy email address', 'me@example.com', undefined]);
  assert.deepEqual([sharks.group, sharks.title, sharks.href], ['Actions', 'Pause the sharks', undefined]);
  assert.equal(actionItems(ITEMS, 'Play sharks')[1].title, 'Resume the sharks');
  assert.deepEqual(titles(actionItems(ITEMS, '')), ['Copy email address'], 'no sharks entry where the page has no sharks button');
  assert.deepEqual(actionItems(ITEMS.filter(item => !item.href.startsWith('mailto:')), ''), []);
  assert.equal(actionItems(flatIndex(), '')[0].address, LINKS.email);
  assert.deepEqual(titles(search([...ITEMS, copy, sharks], 'sharks')), ['Pause the sharks']);
});

test('the browser files build their markup from nodes, stay quiet, and load the index only on demand', async () => {
  for (const file of ['palette.js', 'notfound.js']) {
    const code = await source(file);
    assert.doesNotMatch(code, /innerHTML|outerHTML|insertAdjacentHTML|document\.write|\beval\(/, `${file}: no HTML from strings`);
    assert.doesNotMatch(code, /\bconsole\./, `${file}: no console output`);
    assert.doesNotMatch(code, /\b(?:window|globalThis)\.\w+\s*=[^=]/, `${file}: no globals`);
    assert.deepEqual([...code.matchAll(/^import .+ from '(.+)';$/gm)].map(m => m[1]), ['./search.js'], `${file}: the index is not a static import`);
    assert.ok(code.includes("import('./index.js')"), file);
    assert.ok(code.trimEnd().endsWith("if (typeof document !== 'undefined') start();"), `${file}: importing it in Node runs nothing`);
  }
  assert.doesNotMatch(await source('search.js'), /\b(?:document|window|navigator|location)\b/, 'search.js has no DOM');
});

test('the stylesheet keeps to the site tokens, hard edges and one small motion', async () => {
  const css = await source('palette.css');
  assert.deepEqual(css.match(/#[0-9a-f]{3,8}\b/gi), ['#08070b'], 'the backdrop fallback is the only literal colour');
  assert.doesNotMatch(css, /blur\(|backdrop-filter|gradient\(|url\(|border-radius:(?!0[;}\s])/);
  assert.doesNotMatch(css, /transition:(?!none)/);
  const motion = css.indexOf('@media(prefers-reduced-motion:no-preference)');
  assert.ok(motion > 0 && css.indexOf('animation:') > motion, 'every animation sits behind the motion preference');
  assert.match(css, /\.palette-option\[aria-selected="true"\]\{background:var\(--ink\);color:var\(--paper\)\}/);
  assert.match(css, /@media\(forced-colors:active\)\{[^@]*Highlight;color:HighlightText/);
  for (const name of ['palette-button', 'palette', 'palette-field', 'palette-prompt', 'palette-input', 'palette-close', 'palette-list', 'palette-group', 'palette-option', 'palette-label', 'palette-title', 'palette-hint', 'palette-meta', 'palette-empty', 'palette-foot', 'palette-count']) {
    assert.ok(new RegExp(`\\.${name}[^\\w-]`).test(css), `.${name} is styled`);
    if (name !== 'palette-button') assert.ok((await source('palette.js')).includes(`'${name}'`), `.${name} is built by palette.js`);
  }
  // A page's own "a:hover" colour (the Stars pages have one) must lose to both of these.
  assert.match(css, /\.site-header \.palette-button:hover\{color:var\(--ink\)/);
  assert.ok(css.indexOf('.palette .palette-option:hover{color:var(--ink)}') > 0 && css.indexOf('.palette .palette-option:hover{') < css.indexOf('.palette .palette-option[aria-selected="true"]{'), 'the selected row is styled after the hover rule, so it wins');
  // palette.js borrows one class from the shared stylesheet, which every page with the palette loads.
  assert.match(await readFile(new URL('../../../public/portfolio.css', import.meta.url), 'utf8'), /\.visually-hidden\{[^}]*clip-path/);
});

// ---------- palette.js in a page ----------

// A browser small enough to read: only what palette.js touches. Events go from the target up to the document.
function fakeBrowser(t, pathname) {
  class FakeElement {
    constructor(tag) { Object.assign(this, { tagName: tag.toUpperCase(), attrs: new Map(), children: [], parent: null, listeners: {}, style: { overflow: '' }, value: '' }); }
    setAttribute(name, value) { this.attrs.set(name, String(value)); }
    getAttribute(name) { return this.attrs.get(name) ?? null; }
    removeAttribute(name) { this.attrs.delete(name); }
    get id() { return this.getAttribute('id') ?? ''; }
    get hidden() { return this.attrs.has('hidden'); }
    set hidden(on) { if (on) this.attrs.set('hidden', ''); else this.attrs.delete('hidden'); }
    get open() { return this.attrs.has('open'); }
    get href() { return this.attrs.has('href') ? new URL(this.getAttribute('href'), 'https://example.test').href : undefined; }
    get protocol() { return this.href && new URL(this.href).protocol; }
    get classList() {
      const names = () => (this.getAttribute('class') ?? '').split(' ').filter(Boolean);
      return { contains: name => names().includes(name), add: name => this.setAttribute('class', [...new Set([...names(), name])].join(' ')) };
    }
    append(...nodes) {
      for (const node of nodes) {
        if (typeof node !== 'string') { node.parent?.children.splice(node.parent.children.indexOf(node), 1); node.parent = this; }
        this.children.push(node);
      }
    }
    replaceChildren(...nodes) {
      for (const child of this.children) if (typeof child !== 'string') child.parent = null;
      this.children = [];
      this.append(...nodes);
    }
    get textContent() { return this.children.map(child => (typeof child === 'string' ? child : child.textContent)).join(''); }
    set textContent(text) { this.replaceChildren(String(text)); }
    get isConnected() { let node = this; while (node.parent) node = node.parent; return node === html; }
    matches(selector) {
      return selector.split(',').some(part => {
        const simple = part.trim().match(/^([a-z]+)?((?:\.[\w-]+|\[[\w-]+\])*)$/);
        assert.ok(simple, `the fake browser cannot read the selector "${part}"`);
        return (!simple[1] || simple[1].toUpperCase() === this.tagName)
          && [...simple[2].matchAll(/\.([\w-]+)|\[([\w-]+)\]/g)].every(([, name, attribute]) => (name ? this.classList.contains(name) : this.attrs.has(attribute)));
      });
    }
    closest(selector) { for (let node = this; node; node = node.parent) if (node.matches(selector)) return node; return null; }
    querySelectorAll(selector) {
      return this.children.filter(child => typeof child !== 'string').flatMap(child => [...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector)]);
    }
    querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }
    addEventListener(type, listener) { (this.listeners[type] ||= []).push(listener); }
    dispatch(type, init = {}) {
      const event = { type, target: this, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, ...init };
      for (let node = this; node; node = node.parent) for (const listener of node.listeners[type] ?? []) listener(event);
      for (const listener of document.listeners[type] ?? []) listener(event);
      return event;
    }
    focus() { document.activeElement = this; this.dispatch('focus'); }
    select() { this.selected = true; }
    click() { return this.dispatch('click'); }
    scrollIntoView() {}
  }
  // close() hands focus back and reports itself a moment later, the way the browser does after Escape.
  class FakeDialog extends FakeElement {
    showModal() {
      if (this.open || !this.isConnected) throw new Error('InvalidStateError');
      this.returnTo = document.activeElement;
      this.setAttribute('open', '');
    }
    close() {
      this.removeAttribute('open');
      document.activeElement = this.returnTo;
      queueMicrotask(() => this.dispatch('close'));
    }
  }
  const make = (tag, attributes = {}, ...children) => {
    const node = new (tag === 'dialog' ? FakeDialog : FakeElement)(tag);
    for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
    node.append(...children);
    return node;
  };
  const html = make('html');
  const body = make('body');
  html.append(body);
  const document = {
    documentElement: html, body, activeElement: body, listeners: {},
    createElement: tag => make(tag),
    querySelector: selector => html.querySelector(selector),
    querySelectorAll: selector => html.querySelectorAll(selector),
    addEventListener(type, listener) { (this.listeners[type] ||= []).push(listener); },
  };
  const copied = [];
  const opened = [];
  const navigator = { platform: 'MacIntel', clipboard: { writeText: async text => { copied.push(text); } } };
  const globals = { document, navigator, Element: FakeElement, HTMLDialogElement: FakeDialog, location: { pathname }, window: { open: (...args) => opened.push(args) } };
  const before = Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]);
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  t.after(() => {
    for (const [key, descriptor] of before) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });
  return { html, body, document, navigator, make, copied, opened };
}

// A page with the header's Search link and the sharks button, and a fresh build of the palette beside it.
// palette.js imports ./index.js, which only the build writes, so these tests run the built copy.
async function mount(t, { pathname = '/about/', withTrigger = true } = {}) {
  const page = fakeBrowser(t, pathname);
  const out = await mkdtemp(join(tmpdir(), 'palette-test-'));
  t.after(() => rm(out, { recursive: true, force: true }));
  // Outside the repo, Node reads a .js file as a module only when a package.json says so.
  await writeFile(join(out, 'package.json'), '{"type":"module"}');
  await buildPalette(out);
  const kbd = page.make('kbd', { 'aria-hidden': 'true' }, '/');
  const trigger = page.make('a', { class: 'palette-button', href: '/colophon/#everything', 'data-palette-open': '' }, page.make('span', {}, 'Search'), kbd);
  const sharks = page.make('button', { class: 'sharks-toggle' }, 'Pause sharks');
  page.body.append(...(withTrigger ? [trigger] : []), sharks);
  const parts = () => {
    const dialog = page.document.querySelector('dialog');
    const part = name => dialog.querySelector(`.palette-${name}`);
    return { dialog, input: part('input'), list: part('list'), empty: part('empty'), count: part('count'), foot: part('foot'), closeButton: part('close'), rows: () => dialog.querySelectorAll('.palette-option') };
  };
  return { ...page, out, kbd, trigger, sharks, parts, start: () => import(pathToFileURL(join(out, 'palette/palette.js')).href) };
}

const titleOf = row => row.querySelector('.palette-title').textContent;
const metaOf = row => row.querySelector('.palette-meta').textContent;
const selectedRow = ui => ui.rows().findIndex(row => row.getAttribute('aria-selected') === 'true');
const type = (input, text) => { input.value = text; input.dispatch('input'); };
const press = (target, key, init) => target.dispatch('keydown', { key, ...init });
// Long enough for a finished import to hand over its result and for a dialog's close event to fire.
const turn = () => new Promise(resolve => setImmediate(resolve));
const until = async (check, what) => {
  for (let tries = 0; tries < 400 && !check(); tries++) await new Promise(resolve => setTimeout(resolve, 5));
  assert.ok(check(), `waited two seconds for ${what}`);
};

test('on load the Search link becomes a button, and there is no dialog until it is used', async t => {
  const page = await mount(t);
  await page.start();
  assert.deepEqual(['role', 'aria-haspopup', 'aria-keyshortcuts'].map(name => page.trigger.getAttribute(name)), ['button', 'dialog', '/ Meta+K Control+K']);
  assert.equal(page.kbd.textContent, '/', 'the key hint is the one the build wrote');
  assert.ok(page.html.classList.contains('palette-ready'));
  assert.equal(page.document.querySelector('dialog'), null);

  const click = page.trigger.click();
  const ui = page.parts();
  assert.deepEqual([click.defaultPrevented, ui.dialog.open, page.html.style.overflow, page.document.activeElement === ui.input], [true, true, 'hidden', true]);
  ui.closeButton.click();
  for (const key of [' ', 'Enter']) {
    assert.equal(press(page.trigger, key).defaultPrevented, true, `"${key}" on the button`);
    assert.ok(ui.dialog.open);
    ui.closeButton.click();
  }
  assert.equal(press(page.trigger, 'a').defaultPrevented, false);
  assert.equal(ui.dialog.open, false);
});

test('a page without the Search button still gets the shortcut, and focus goes back where it was', async t => {
  const page = await mount(t, { withTrigger: false });
  await page.start();
  const field = page.make('textarea');
  page.body.append(field);
  field.focus();
  assert.equal(press(field, 'k', { ctrlKey: true }).defaultPrevented, true);
  const ui = page.parts();
  assert.ok(ui.dialog.open);
  press(ui.input, 'k', { ctrlKey: true });
  assert.deepEqual([ui.dialog.open, page.document.activeElement === field], [false, true]);
});

test('the open list has every destination under its group, with this page, outside links and actions marked', async t => {
  const page = await mount(t);
  await page.start();
  page.trigger.click();
  const ui = page.parts();
  await until(() => ui.rows().length, 'the list');
  const rows = ui.rows();
  assert.deepEqual(ui.list.children.map(group => [group.getAttribute('role'), group.getAttribute('aria-label'), group.children[0].textContent]), [...siteIndex().map(g => g.group), 'Actions'].map(name => ['group', name, name]));
  assert.deepEqual(rows.map(titleOf), [...flatIndex().map(item => item.title), 'Copy email address', 'Pause the sharks']);
  assert.deepEqual(rows.map(row => row.id), rows.map((row, n) => `palette-option-${n}`));
  for (const row of rows) assert.deepEqual([row.getAttribute('role'), row.getAttribute('tabindex')], ['option', '-1']);

  const [first] = rows;
  assert.deepEqual([first.tagName, first.getAttribute('href'), first.getAttribute('aria-current'), metaOf(first)], ['A', '/about/', 'page', 'here']);
  assert.deepEqual([selectedRow(ui), ui.input.getAttribute('aria-activedescendant')], [0, first.id]);
  assert.equal(rows.filter(row => row.getAttribute('aria-current')).length, 1);

  const outside = rows.filter(row => row.target === '_blank');
  assert.deepEqual(outside.map(row => row.getAttribute('href')), flatIndex().filter(item => item.external).map(item => item.href));
  for (const row of outside) assert.deepEqual([row.rel, metaOf(row)], ['noopener noreferrer', '↗ (opens in a new tab)']);
  assert.deepEqual(rows.slice(-2).map(row => [row.tagName, row.getAttribute('type')]), [['BUTTON', 'button'], ['BUTTON', 'button']]);
  assert.deepEqual([ui.count.textContent, ui.empty.hidden], ['', true]);
});

test('the keys move the selection, typing ranks one flat list, and a still pointer leaves the selection alone', async t => {
  const page = await mount(t);
  await page.start();
  page.trigger.click();
  const ui = page.parts();
  await until(() => ui.rows().length, 'the list');
  const last = ui.rows().length - 1;

  assert.equal(press(ui.input, 'ArrowUp').defaultPrevented, true);
  assert.equal(selectedRow(ui), last, 'up from the first row wraps to the last');
  press(ui.input, 'ArrowDown');
  assert.equal(selectedRow(ui), 0);
  press(ui.input, 'ArrowDown');
  press(ui.input, 'End');
  assert.deepEqual([selectedRow(ui), ui.input.getAttribute('aria-activedescendant')], [last, `palette-option-${last}`]);
  // With a modifier the key belongs to the text field: Shift+Home selects the query.
  assert.equal(press(ui.input, 'Home', { shiftKey: true }).defaultPrevented, false);
  assert.equal(press(ui.input, 'ArrowUp', { altKey: true }).defaultPrevented, false);
  assert.equal(selectedRow(ui), last);
  press(ui.input, 'Home');
  assert.equal(selectedRow(ui), 0);
  // Enter that ends an input-method word is not a choice.
  press(ui.input, 'Enter', { isComposing: true });
  press(ui.input, 'Enter', { keyCode: 229 });
  assert.ok(ui.dialog.open);

  type(ui.input, 'pro');
  assert.equal(ui.list.children[0], ui.rows()[0], 'no groups in a ranked list');
  assert.deepEqual([titleOf(ui.rows()[0]), metaOf(ui.rows()[0]), selectedRow(ui)], ['Projects', 'Sections', 0]);
  assert.equal(ui.count.textContent, `${ui.rows().length} results`);
  type(ui.input, 'qqqqzz');
  assert.deepEqual([ui.rows().length, ui.empty.hidden, ui.empty.textContent, ui.count.textContent, ui.input.getAttribute('aria-activedescendant')], [0, false, 'Nothing matches “qqqqzz”.', 'No results', null]);
  press(ui.input, 'ArrowDown');
  press(ui.input, 'Enter');
  assert.ok(ui.dialog.open, 'nothing to choose, nothing thrown');
  type(ui.input, '  ');
  assert.deepEqual([ui.list.children[0].getAttribute('role'), ui.empty.hidden, ui.count.textContent, selectedRow(ui)], ['group', true, '', 0]);

  const over = n => ui.rows()[n].querySelector('.palette-title').dispatch('pointermove', { clientX: 40, clientY: 200 });
  over(3);
  assert.equal(selectedRow(ui), 3);
  press(ui.input, 'ArrowDown');
  over(3);
  assert.equal(selectedRow(ui), 4, 'the list moved under the pointer; the pointer did not move');

  // A press anywhere but the input must not take focus out of it.
  for (const node of [ui.foot, ui.rows()[2], ui.list.children[0].children[0], ui.closeButton, ui.dialog]) assert.equal(node.dispatch('mousedown').defaultPrevented, true);
  assert.equal(ui.input.dispatch('mousedown').defaultPrevented, false);
});

test('every way out closes the dialog and puts the page back as it was', async t => {
  const page = await mount(t);
  await page.start();
  page.html.style.overflow = 'clip';
  page.trigger.click();
  const ui = page.parts();
  await until(() => ui.rows().length, 'the list');
  const closed = () => [ui.dialog.open, page.html.style.overflow];

  type(ui.input, 'about');
  assert.equal(ui.rows()[0].getAttribute('href'), '/about/');
  press(ui.input, 'Enter', { metaKey: true });
  assert.deepEqual(page.opened, [['https://example.test/about/', '_blank', 'noopener,noreferrer']]);
  assert.ok(ui.dialog.open, 'a new tab keeps the list for the next pick');
  press(ui.input, 'Enter');
  assert.deepEqual(closed(), [false, 'clip']);
  // The link was clicked, never focused (Safari does this), so the dialog alone would drop focus on <body>.
  assert.equal(page.document.activeElement, page.trigger);
  await turn();
  assert.deepEqual(closed(), [false, 'clip'], 'the close event after our own close changes nothing');

  assert.equal(press(page.body, 'k', { metaKey: true }).defaultPrevented, true);
  assert.deepEqual([ui.dialog.open, ui.input.value, page.html.style.overflow], [true, '', 'hidden']);
  await turn();
  assert.equal(ui.list.children[0].getAttribute('role'), 'group', 'the last query is gone');
  // A held key repeats: still swallowed, but it does not close and reopen.
  assert.deepEqual([press(ui.input, 'k', { metaKey: true, repeat: true }).defaultPrevented, ui.dialog.open], [true, true]);
  press(ui.input, 'K', { ctrlKey: true });
  assert.deepEqual(closed(), [false, 'clip']);

  const field = page.make('input');
  page.body.append(field);
  assert.deepEqual([press(field, '/').defaultPrevented, ui.dialog.open], [false, false]);
  assert.deepEqual([press(page.body, '/').defaultPrevented, ui.dialog.open], [true, true]);
  assert.equal(press(ui.input, '/').defaultPrevented, false, 'a slash typed into the search is a slash');

  ui.foot.dispatch('pointerdown');
  ui.foot.click();
  assert.ok(ui.dialog.open, 'a click inside');
  ui.input.dispatch('pointerdown');
  ui.dialog.click();
  assert.ok(ui.dialog.open, 'a text selection dragged out onto the backdrop');
  ui.dialog.dispatch('pointerdown');
  ui.dialog.click();
  assert.deepEqual(closed(), [false, 'clip']);

  press(page.body, 'k', { metaKey: true });
  ui.dialog.close();
  await turn();
  assert.deepEqual(closed(), [false, 'clip'], 'Escape, which only the browser sees');

  press(page.body, 'k', { metaKey: true });
  await turn();
  const row = ui.rows()[1];
  row.dispatch('click', { metaKey: true });
  assert.ok(ui.dialog.open);
  row.querySelector('.palette-hint').click();
  assert.deepEqual(closed(), [false, 'clip'], 'a plain click closes before the browser follows the link');
  assert.equal(page.document.querySelectorAll('dialog').length, 1, 'built once');
});

test('the actions copy my address, with a way out when the clipboard refuses, and pause the sharks', async t => {
  const page = await mount(t);
  await page.start();
  let clicks = 0;
  page.sharks.addEventListener('click', () => { clicks++; page.sharks.textContent = 'Play sharks'; });
  page.trigger.click();
  const ui = page.parts();
  await until(() => ui.rows().length, 'the list');

  type(ui.input, 'copy email');
  const copy = ui.rows()[0];
  assert.equal(titleOf(copy), 'Copy email address');
  press(ui.input, 'Enter');
  await turn();
  assert.deepEqual(page.copied, [LINKS.email]);
  assert.deepEqual([copy.querySelector('.palette-hint').textContent, ui.count.textContent, ui.dialog.open], ['Copied', 'Email address copied', true]);
  await until(() => !ui.dialog.open, 'the dialog to close after the copy');

  for (const broken of [{ writeText: async () => { throw new Error('denied'); } }, undefined]) {
    page.navigator.clipboard = broken;
    page.trigger.click();
    await turn();
    type(ui.input, 'copy email');
    const again = ui.rows()[0];
    again.click();
    await turn();
    assert.equal(again.querySelector('.palette-hint').textContent, LINKS.email);
    assert.deepEqual([ui.input.value, ui.input.selected, ui.count.textContent, ui.dialog.open], [LINKS.email, true, 'Copy failed. The address is selected above.', true]);
    ui.input.selected = false;
    ui.closeButton.click();
  }

  page.trigger.click();
  await turn();
  type(ui.input, 'sharks');
  assert.equal(titleOf(ui.rows()[0]), 'Pause the sharks');
  ui.rows()[0].click();
  assert.deepEqual([clicks, ui.dialog.open], [1, false]);
  page.trigger.click();
  await turn();
  assert.equal(titleOf(ui.rows().at(-1)), 'Resume the sharks', 'read again on every open');
  ui.closeButton.click();
  page.sharks.hidden = true;
  page.trigger.click();
  await turn();
  assert.equal(titleOf(ui.rows().at(-1)), 'Copy email address', 'no sharks row while their button is hidden');
});

test('typing before the list arrives is kept, and a list that failed to load is fetched again', async t => {
  const page = await mount(t);
  const index = join(page.out, 'palette/index.js');
  const text = await readFile(index, 'utf8');
  await rm(index);
  await page.start();
  press(page.body, 'k', { metaKey: true });
  const ui = page.parts();
  await until(() => !ui.empty.hidden, 'the failure message');
  assert.deepEqual([ui.empty.textContent, ui.rows().length], ['The list of pages did not load. Close this and try again.', 0]);
  type(ui.input, 'pro');
  press(ui.input, 'ArrowDown');
  press(ui.input, 'Enter');
  assert.ok(ui.dialog.open, 'nothing to choose, nothing thrown');
  ui.closeButton.click();

  await writeFile(index, text);
  // Open, type, close and open again, all before the file can have arrived.
  page.trigger.click();
  assert.equal(ui.empty.hidden, true, 'the old message does not greet the second try');
  type(ui.input, 'zz');
  press(page.body, 'k', { metaKey: true });
  assert.equal(ui.dialog.open, false);
  page.trigger.click();
  assert.equal(ui.input.value, '');
  type(ui.input, 'pro');
  assert.equal(ui.rows().length, 0, 'not here yet');
  await until(() => ui.rows().length, 'the list');
  assert.deepEqual([titleOf(ui.rows()[0]), selectedRow(ui), ui.empty.hidden], ['Projects', 0, true], 'what was typed while waiting is the query');
  assert.equal(page.document.querySelectorAll('dialog').length, 1);
});
