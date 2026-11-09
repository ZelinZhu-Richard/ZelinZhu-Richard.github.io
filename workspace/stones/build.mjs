import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { join, relative, sep } from 'node:path';
import { PARTS, stoneNav } from './parts.mjs';
import { panels } from './panels.mjs';

const source = fileURLToPath(new URL('.', import.meta.url));
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = i => String(i + 1).padStart(2, '0');

// Pages that end with a link to the next stone (Daily's eggs page counts as Daily, without the link).
const PAGES = [
  ...PARTS.map((part, i) => ({ file: `${part.href.slice(1)}index.html`, index: i })),
  { file: 'daily/eggs/index.html', index: PARTS.findIndex(p => p.id === 'daily'), noNext: true },
  { file: 'work/index.html', index: -1, noNext: true },
];

export function next(index) {
  const n = PARTS[(index + 1) % PARTS.length];
  const p = PARTS[(index + PARTS.length - 1) % PARTS.length];
  return `<nav class="stone-next" aria-label="Next part"><a class="next" href="${n.href}"><small>Next stone · ${num(PARTS.indexOf(n))} / 07</small><strong>${escape(n.title)} →</strong><em>${escape(n.subtitle)}</em></a><a class="prev" href="${p.href}">← ${escape(p.title)}</a></nav>`;
}

let version = '';
export function withStones(html, { index, noNext }) {
  if (html.includes('/stones/stones.css')) return html;
  const stamp = version ? `?v=${version}` : '';
  const head = `<link rel="stylesheet" href="/stones/stones.css${stamp}">\n<script src="/stones/arrive.js${stamp}"></script>\n`;
  let out = html.replace(/<\/head\s*>/i, head + '</head>');
  if (!noNext && index >= 0) out = out.replace(/(<\/main>)/i, `${next(index)}\n$1`);
  return out;
}

// Every built page with the old page list in its header gets the seven-stone menu instead.
const NAV = /<nav id="navigation"[^>]*>[\s\S]*?<\/nav>/;
export const withStoneNav = (html, path) => NAV.test(html) ? html.replace(NAV, stoneNav(path)) : html;

async function htmlFiles(directory) {
  const out = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) out.push(...await htmlFiles(path));
    else if (entry.name.endsWith('.html')) out.push(path);
  }
  return out;
}

export async function buildStones(output) {
  const target = join(output, 'stones');
  await mkdir(target, { recursive: true });
  const home = (await readFile(join(source, 'home.js'), 'utf8')).replace('__PANELS__', JSON.stringify(panels()));
  await writeFile(join(target, 'home.js'), home);
  const css = await readFile(join(source, 'stones.css'));
  await writeFile(join(target, 'stones.css'), css);
  await writeFile(join(target, 'arrive.js'), await readFile(join(source, 'arrive.js')));
  // Version stamps so a browser never runs a cached older build of the stone script or styles.
  const v = createHash('sha256').update(home).update(css).digest('hex').slice(0, 10);
  version = v;
  // The captured phoenix homepage stays as committed; the stone script is added to the built copy only.
  // The captured contact page runs the same runtime and gets the same menu.
  for (const page of ['index.html', 'contacts/index.html']) {
    const file = join(output, page);
    const html = await readFile(file, 'utf8');
    if (!html.includes('/stones/home.js')) {
      // The captured pages still describe Richard as a UNC student; he is a high school senior.
      const described = html
        .replaceAll('computer science and economics at UNC Chapel Hill', 'high school senior, computer science and economics')
        .replaceAll('Computer science and economics at UNC Chapel Hill.', 'High school senior. Computer science and economics.');
      await writeFile(file, described.replace(/<\/head\s*>/i, `<link rel="stylesheet" href="/stones/stones.css?v=${v}">\n<script type="module" src="/stones/home.js?v=${v}"></script>\n</head>`));
    }
  }
  for (const file of await htmlFiles(output)) {
    const rel = relative(output, file).split(sep).join('/');
    if (rel === 'index.html' || rel.startsWith('hq/')) continue;
    const path = '/' + rel.replace(/index\.html$/, '');
    const html = await readFile(file, 'utf8');
    const updated = withStoneNav(html, path);
    if (updated !== html) await writeFile(file, updated);
  }
  for (const page of PAGES) {
    const file = join(output, page.file);
    await writeFile(file, withStones(await readFile(file, 'utf8'), page));
  }
}
