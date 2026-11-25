// Share cards: the committed images, which page gets which card, and the meta tags the build rewrites.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';
import { CARD, cardFor, cards } from '../cards.mjs';
import { buildOg, pagePath, withCard } from '../build.mjs';
import { pages } from '../../../site/pages.mjs';
import { PARTS } from '../../stones/parts.mjs';

const images = fileURLToPath(new URL('../cards/', import.meta.url));
const repo = file => fileURLToPath(new URL(`../../../${file}`, import.meta.url));
const SITE = 'https://zelinzhu-richard.github.io';
const PORTRAIT = `${SITE}/richard.jpg`;
const POSTER = `${SITE}/video/assets/neon-rain-poster.jpg`;
// The shapes the site writes: site/pages.mjs and the homepage release (workspace/home: Nuxt's head) both write
// plain; the retired captured homepage wrote both attributes, which withCard still reads.
const plain = image => `<meta property="og:image" content="${image}">`;
const captured = image => `<meta name="og:image" property="og:image" content="${image}">`;
const release = file => readFile(repo(`workspace/home/release/${file}`), 'utf8');
const page = (tags, body = '') => `<!doctype html><html><head><title>t</title>\n${tags}\n</head><body>${SITE}${body}</body></html>`;
const details = alt => `<meta property="og:image:width" content="1200">\n<meta property="og:image:height" content="630">\n<meta property="og:image:type" content="image/png">\n<meta property="og:image:alt" content="${alt}">`;

// Reads single pixels out of an 8-bit RGB PNG, which is what make_cards.py saves. Returns (x, y) => '#rrggbb'.
function pixels(png) {
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  assert.deepEqual([png[24], png[25], png[28]], [8, 2, 0], '8-bit RGB, not interlaced');
  const data = [];
  for (let at = 8; at < png.length; at += png.readUInt32BE(at) + 12) {
    if (png.toString('latin1', at + 4, at + 8) === 'IDAT') data.push(png.subarray(at + 8, at + 8 + png.readUInt32BE(at)));
  }
  const raw = inflateSync(Buffer.concat(data));
  const stride = width * 3;
  const out = Buffer.alloc(stride * height);
  const paeth = (left, up, corner) => {
    const [toLeft, toUp, toCorner] = [Math.abs(up - corner), Math.abs(left - corner), Math.abs(left + up - 2 * corner)];
    return toLeft <= toUp && toLeft <= toCorner ? left : toUp <= toCorner ? up : corner;
  };
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)];
    for (let i = 0; i < stride; i += 1) {
      const left = i >= 3 ? out[y * stride + i - 3] : 0;
      const up = y ? out[(y - 1) * stride + i] : 0;
      const corner = y && i >= 3 ? out[(y - 1) * stride + i - 3] : 0;
      const predicted = filter === 1 ? left : filter === 2 ? up : filter === 3 ? (left + up) >> 1 : filter === 4 ? paeth(left, up, corner) : 0;
      out[y * stride + i] = raw[y * (stride + 1) + 1 + i] + predicted;
    }
  }
  return (x, y) => `#${out.toString('hex', y * stride + x * 3, y * stride + x * 3 + 3)}`;
}

test('every card has a committed 1200x630 PNG under 400 kB, and nothing else sits beside them', async () => {
  assert.deepEqual(CARD, { width: 1200, height: 630 });
  for (const { name } of cards()) {
    const png = await readFile(join(images, `${name}.png`));
    assert.deepEqual([...png.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], `${name} starts with the PNG signature`);
    assert.equal(png.toString('latin1', 12, 16), 'IHDR', `${name} opens with its header chunk`);
    assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [CARD.width, CARD.height], `${name} size`);
    assert.ok(png.length < 400_000, `${name} is ${png.length} bytes`);
  }
  assert.deepEqual((await readdir(images)).filter(file => file.endsWith('.png')).sort(), cards().map(c => `${c.name}.png`).sort(), 'a PNG without a card would never ship; delete it');
});

test('the cards wear the night theme: the script and the committed PNGs match public/portfolio.css', async () => {
  const night = (await readFile(repo('public/portfolio.css'), 'utf8')).split('html[data-theme="paper"]')[0];
  const token = name => night.match(new RegExp(`--${name}:\\s*(#[0-9a-f]{6})\\b`, 'i'))?.[1].toLowerCase();
  const shade = night.match(/--shadow:[^;]*?(#[0-9a-f]{6})\b/i)?.[1].toLowerCase();
  const script = await readFile(new URL('../make_cards.py', import.meta.url), 'utf8');
  const drawn = Object.fromEntries([...script.matchAll(/^([A-Z]+) = '(#[0-9a-f]{6})'$/gm)].map(m => [m[1], m[2]]));
  assert.deepEqual(drawn, { PAPER: token('paper'), CARD: token('card'), INK: token('ink'), MUTED: token('muted'), FAINT: token('faint'), LINE: token('line'), ACCENT: token('accent'), SHADE: shade }, 'a token changed: update make_cards.py and redraw the cards');
  for (const { name } of cards()) {
    const at = pixels(await readFile(join(images, `${name}.png`)));
    assert.deepEqual(
      { canvas: at(10, 10), border: at(56, 300), panel: at(80, 300), shadow: at(1138, 300), below: at(600, 572), corner: at(1190, 620) },
      { canvas: drawn.PAPER, border: drawn.INK, panel: drawn.CARD, shadow: drawn.ACCENT, below: drawn.ACCENT, corner: drawn.PAPER },
      `${name}.png was drawn with other colours: run python3 workspace/og/make_cards.py`,
    );
  }
});

test('cards.json gives every card its copy and a rule for where it applies', () => {
  const names = cards().map(c => c.name);
  assert.equal(new Set(names).size, names.length, 'names are unique');
  assert.ok(names.includes('site'), 'the default card exists');
  const claimed = [];
  for (const card of cards()) {
    assert.match(card.name, /^[a-z0-9-]+$/);
    for (const field of ['label', 'title', 'text']) assert.ok(card[field]?.trim(), `${card.name} has a ${field}`);
    assert.doesNotMatch(`${card.label}${card.title}${card.text}`, /['"]|--/, `${card.name} uses typographic quotes and dashes`);
    const { paths = [], prefix, section } = card.match || {};
    assert.ok(card.name === 'site' || paths.length || prefix || section, `${card.name} matches something`);
    for (const path of [...paths, ...(prefix ? [prefix] : [])]) assert.match(path, /^\/([^/]+\/)*$/, `${path} is a folder path`);
    if (section) assert.ok(PARTS.some(part => part.id === section), `${section} is a section of the site`);
    claimed.push(...paths.map(path => `path ${path}`), ...(prefix ? [`prefix ${prefix}`] : []), ...(section ? [`section ${section}`] : []));
  }
  assert.equal(new Set(claimed).size, claimed.length, 'no path, prefix or section is claimed by two cards');
  assert.doesNotMatch(JSON.stringify(cards()), /\/(?:hq|duke|choices|repolarisdm)\b/, 'no card is for an unlisted page');
});

test('a card says what its page says', async () => {
  // When a page's copy changes, change the card in cards.json to match and redraw it.
  const built = pages();
  const { colophonPage } = await import('../../colophon/page.mjs');
  const said = [
    ['about', built.get('about/index.html'), ['I work on computer science and economics, and do machine learning research at UNC PRIMES.']],
    ['projects', built.get('projects/index.html'), ['a quant research system, a benchmark for speech-recognition bias, and an open-source stock analysis app.']],
    ['research', built.get('research/index.html'), ['Deep learning on brain imaging data at UNC PRIMES', 'a workshop poster on agents for quantitative research']],
    ['fun', built.get('fun/index.html'), ['Small camera toys that run in your browser.', 'nothing is uploaded']],
    ['blog', built.get('blog/index.html'), ['Notes on what I’m building and learning, written as I go.']],
    ['daily', await readFile(repo('workspace/daily/pages/index.html'), 'utf8'), ['to-do list', 'Finish a task']],
    ['work', built.get('work/index.html'), ['Eight projects', 'five things that live on this site']],
    ['skills', built.get('skills/index.html'), ['The AI agent skills I use, and the ones I create.']],
    ['colophon', colophonPage(), ['no npm dependencies and no framework of its own. One Node script builds it']],
  ];
  for (const [name, html, phrases] of said) {
    const card = cards().find(c => c.name === name);
    for (const phrase of phrases) {
      assert.ok(card.text.toLowerCase().includes(phrase.toLowerCase()), `the ${name} card says "${phrase}"`);
      assert.ok(html.toLowerCase().includes(phrase.toLowerCase()), `the ${name} page no longer says "${phrase}": update the card`);
    }
  }
});

test('a page gets the card for its own path, then its folder, then its section, then the site card', () => {
  assert.deepEqual(cardFor('/about/'), { name: 'about', src: '/og/about.png', alt: 'Richard Zhu: High school senior. I work on computer science and economics, and do machine learning research at UNC PRIMES.' });
  assert.equal(cardFor('/github/stars/research/ai-ml/').name, 'research-stack', 'the longer folder wins over /github/stars/');
  assert.equal(cardFor('/github/stars/research/').name, 'research-stack');
  assert.equal(cardFor('/github/stars/').name, 'stars');
  assert.equal(cardFor('/flash/').name, 'flash', 'Flash needs no camera, so it does not take the Fun card');
  assert.equal(cardFor('/ppiano/').name, 'fun', 'Paper Piano belongs to the Fun section');
  assert.equal(cardFor('/domainexp/').name, 'fun');
  assert.equal(cardFor('/blog/some-post/').name, 'blog');
  assert.equal(cardFor('/daily/eggs/').name, 'daily');
  assert.equal(cardFor('/colophon/').name, 'colophon');
  assert.equal(cardFor('/contacts/').name, 'site', 'the About card is for the About page only');
  assert.equal(cardFor('/nowhere/').name, 'site');
  assert.equal(cardFor('/404.html').name, 'site');
  assert.deepEqual(cardFor('/'), { name: 'site', src: '/og/site.png', alt: 'Richard Zhu: High school senior. Computer science, economics and machine learning research.' });

  const card = (name, match) => ({ name, match, title: name, text: name });
  const all = [card('site'), card('section', { section: 'fun' }), card('folder', { prefix: '/gym/' }), card('deep', { prefix: '/gym/log/' }), card('exact', { paths: ['/gym/log/today/'] })];
  assert.equal(cardFor('/gym/log/today/', all).name, 'exact');
  assert.equal(cardFor('/gym/log/', all).name, 'deep', 'the longest folder wins');
  assert.equal(cardFor('/gym/', all).name, 'folder', 'a folder rule beats the section');
  assert.equal(cardFor('/flash/', all).name, 'section');
  assert.equal(cardFor('/about/', all).name, 'site');
  assert.throws(() => cardFor('/about/', all.slice(1)), /no card named "site"/);
});

test('a built file maps to its site path', () => {
  assert.equal(pagePath('index.html'), '/');
  assert.equal(pagePath('about/index.html'), '/about/');
  assert.equal(pagePath('github/stars/research/ai-ml/index.html'), '/github/stars/research/ai-ml/');
  assert.equal(pagePath('404.html'), '/404.html');
  assert.equal(pagePath('blog/reindex.html'), '/blog/reindex.html', 'only a file named index.html stands for its folder');
});

test('the portrait is swapped for the card in both tag shapes the site writes', () => {
  const alt = 'Richard Zhu: High school senior. I work on computer science and economics, and do machine learning research at UNC PRIMES.';
  assert.equal(
    withCard(page(`${plain(PORTRAIT)}\n<meta name="twitter:card" content="summary_large_image">`), '/about/'),
    page(`${plain(`${SITE}/og/about.png`)}\n${details(alt)}\n<meta name="twitter:card" content="summary_large_image">`),
  );
  const siteAlt = 'Richard Zhu: High school senior. Computer science, economics and machine learning research.';
  assert.equal(
    withCard(page(`${captured(PORTRAIT)}<meta name="twitter:image" content="${PORTRAIT}">`), '/'),
    page(`${captured(`${SITE}/og/site.png`)}\n${details(siteAlt)}<meta name="twitter:image" content="${SITE}/og/site.png">`),
  );
  assert.match(withCard(page(`<meta content='${PORTRAIT}' property='og:image'>`), '/fun/'), /<meta content='https:\/\/zelinzhu-richard\.github\.io\/og\/fun\.png' property='og:image'>/, 'any attribute order, either quote');
  assert.match(withCard(page(`<meta\n  property="og:image"\n  content="${PORTRAIT}" />`), '/fun/'), /<meta\n {2}property="og:image"\n {2}content="https:\/\/zelinzhu-richard\.github\.io\/og\/fun\.png" \/>\n<meta property="og:image:width"/, 'a tag broken over lines');
});

test('the real pages take their cards', async () => {
  const built = pages();
  for (const [file, name] of [['about/index.html', 'about'], ['projects/index.html', 'projects'], ['research/index.html', 'research'], ['fun/index.html', 'fun'], ['blog/index.html', 'blog'], ['work/index.html', 'work'], ['skills/index.html', 'skills'], ['404.html', 'site']]) {
    const html = withCard(built.get(file), pagePath(file));
    assert.ok(html.includes(plain(`${SITE}/og/${name}.png`)), `${file} shows the ${name} card`);
    assert.ok(!html.includes(plain(PORTRAIT)), `${file} no longer shares the portrait`);
    assert.equal(html.split('property="og:image:').length, 5, `${file} has one set of image details`);
  }
  const poster = built.get('video/index.html');
  assert.ok(poster.includes(plain(POSTER)) && withCard(poster, '/video/') === poster, 'the film page keeps its own poster');

  // The homepage and Contact page (workspace/home/release) share the portrait in Nuxt's tag shapes; both take the site card.
  for (const [file, path] of [['index.html', '/'], ['contacts/index.html', '/contacts/']]) {
    const before = await release(file);
    const after = withCard(before, path);
    assert.ok(before.includes(plain(PORTRAIT)) && before.includes(`<meta name="twitter:image" content="${PORTRAIT}">`), `${file} shares the portrait as released`);
    assert.ok(after.includes(plain(`${SITE}/og/site.png`)) && after.includes(`<meta name="twitter:image" content="${SITE}/og/site.png">`), file);
    assert.ok(!after.includes(PORTRAIT), `${file} names the portrait nowhere else`);
    assert.equal(after.split('og:image:alt').length, 2, `${file}: one set of image details`);
    const added = `\n${details('Richard Zhu: High school senior. Computer science, economics and machine learning research.')}`;
    assert.equal(after.length - before.length, added.length + 2 * (`${SITE}/og/site.png`.length - PORTRAIT.length), `${file}: nothing but the two tags and the details changed`);
    assert.equal(after.slice(after.indexOf('<body>')), before.slice(before.indexOf('<body>')), `${file}: the body is untouched`);
    assert.equal(withCard(after, path), after);
  }
});

test('withCard is safe to run twice and leaves other pages alone', () => {
  const once = withCard(page(`${plain(PORTRAIT)}\n<meta name="twitter:image" content="${PORTRAIT}">`), '/projects/');
  assert.equal(withCard(once, '/projects/'), once);
  const film = page(`${plain(POSTER)}\n<meta name="twitter:image" content="${PORTRAIT}">`);
  assert.equal(withCard(film, '/video/'), film, 'a page with its own og:image is not touched, twitter:image included');
  const bare = page('<meta name="description" content="No image here.">', `<img src="/richard.jpg" alt=""><p>${PORTRAIT}</p>`);
  assert.equal(withCard(bare, '/about/'), bare, 'no og:image, no change');
  const other = page(`${plain(PORTRAIT)}\n<meta itemprop="image" content="${PORTRAIT}">\n<script type="application/ld+json">{"image":"${PORTRAIT}"}</script>`, `<img src="/richard.jpg" alt="">`);
  const swapped = withCard(other, '/about/');
  assert.ok(swapped.includes(`<meta itemprop="image" content="${PORTRAIT}">`) && swapped.includes(`{"image":"${PORTRAIT}"}`) && swapped.includes('<img src="/richard.jpg" alt="">'), 'only og:image and twitter:image change');
});

test('the alt text is escaped and a card name is never read as a replacement pattern', () => {
  const all = [{ name: 'site', title: 'Tom & "Jerry"', text: `<b>it's</b>` }];
  const html = withCard(page(plain(PORTRAIT)), '/', all);
  assert.ok(html.includes('<meta property="og:image:alt" content="Tom &amp; &quot;Jerry&quot;: &lt;b&gt;it&#39;s&lt;/b&gt;">'));
  assert.doesNotMatch(html, /<b>/);
  const odd = withCard(page(`${plain(PORTRAIT)}<meta name="twitter:image" content="${PORTRAIT}">`), '/', [{ name: "$&-$'", match: { paths: ['/'] }, title: 'T', text: 't' }]);
  assert.equal(odd.split(`content="${SITE}/og/$&-$'.png"`).length, 3, 'og:image and twitter:image');
});

test('buildOg copies the cards, rewrites the public pages and leaves the unlisted ones byte-identical', async t => {
  const output = await mkdtemp(join(tmpdir(), 'og-test-'));
  t.after(() => rm(output, { recursive: true, force: true }));
  const shared = page(`${plain(PORTRAIT)}\n<meta name="twitter:card" content="summary_large_image">`);
  const files = {
    'index.html': page(`${captured(PORTRAIT)}<meta name="twitter:image" content="${PORTRAIT}">`),
    '404.html': shared,
    'about/index.html': shared,
    'github/stars/research/ai-ml/index.html': shared,
    'gym/index.html': shared,
    'video/index.html': page(plain(POSTER)),
    'hq/index.html': shared,
    'duke/index.html': shared,
    'duke/becoming-blue/index.html': shared,
    'choices/index.html': shared,
  };
  for (const [file, html] of Object.entries(files)) {
    await mkdir(dirname(join(output, file)), { recursive: true });
    await writeFile(join(output, file), html);
  }
  await buildOg(output);
  assert.deepEqual((await readdir(join(output, 'og'))).sort(), cards().map(c => `${c.name}.png`).sort());
  for (const { name } of cards()) assert.deepEqual(await readFile(join(output, 'og', `${name}.png`)), await readFile(join(images, `${name}.png`)), `${name}.png copied`);
  const read = file => readFile(join(output, file), 'utf8');
  for (const [file, name] of [['index.html', 'site'], ['404.html', 'site'], ['about/index.html', 'about'], ['github/stars/research/ai-ml/index.html', 'research-stack'], ['gym/index.html', 'fun']]) {
    const html = await read(file);
    assert.ok(html.includes(`content="${SITE}/og/${name}.png"`) && !html.includes(PORTRAIT), `${file} shows the ${name} card`);
    assert.ok(html.includes('<meta property="og:image:width" content="1200">\n<meta property="og:image:height" content="630">\n<meta property="og:image:type" content="image/png">\n<meta property="og:image:alt" content="'));
  }
  assert.equal((await read('index.html')).split('/og/site.png').length, 3, 'og:image and twitter:image');
  for (const file of ['video/index.html', 'hq/index.html', 'duke/index.html', 'duke/becoming-blue/index.html', 'choices/index.html']) assert.equal(await read(file), files[file], `${file} untouched`);

  const first = await Promise.all(Object.keys(files).map(read));
  await buildOg(output);
  assert.deepEqual(await Promise.all(Object.keys(files).map(read)), first, 'a second build changes nothing');
});

test('every share image a rewritten page names is a file the build copied', async t => {
  const output = await mkdtemp(join(tmpdir(), 'og-test-'));
  t.after(() => rm(output, { recursive: true, force: true }));
  const paths = ['/', '/404.html', '/about/', '/projects/', '/research/', '/fun/', '/flash/', '/blog/', '/blog/a-post/', '/daily/', '/daily/eggs/', '/work/', '/skills/', '/contacts/', '/github/stars/', '/github/stars/research/finance/', '/colophon/'];
  for (const path of paths) {
    const file = join(output, path.endsWith('/') ? `${path}index.html` : path);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, page(`${captured(PORTRAIT)}<meta name="twitter:image" content="${PORTRAIT}">`));
  }
  await buildOg(output);
  for (const path of paths) {
    const html = await readFile(join(output, path.endsWith('/') ? `${path}index.html` : path), 'utf8');
    const named = [...html.matchAll(/content="https:\/\/zelinzhu-richard\.github\.io\/(og\/[^"]+)"/g)].map(m => m[1]);
    assert.deepEqual(named, [`og/${cardFor(path).name}.png`, `og/${cardFor(path).name}.png`], `${path} names its card twice`);
    for (const image of named) assert.ok((await readFile(join(output, image))).length > 0, `${image} exists for ${path}`);
  }
});

test('a card without its image stops the build before anything is written', async t => {
  const output = await mkdtemp(join(tmpdir(), 'og-test-'));
  t.after(() => rm(output, { recursive: true, force: true }));
  const html = page(plain(PORTRAIT));
  await writeFile(join(output, 'index.html'), html);
  await assert.rejects(buildOg(output, { all: [...cards(), { name: 'ghost', title: 'Ghost', text: 'Not drawn yet.' }] }), /no image for ghost\. Run python3 workspace\/og\/make_cards\.py/);
  assert.deepEqual(await readdir(output), ['index.html']);
  assert.equal(await readFile(join(output, 'index.html'), 'utf8'), html);
});
