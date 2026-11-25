import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { join, relative, sep } from 'node:path';
import { PARTS, stoneNav } from './parts.mjs';

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
  return `<nav class="stone-next" aria-label="Next part"><a class="next" href="${n.href}"><small>Next stone · ${num(PARTS.indexOf(n))} / ${num(PARTS.length - 1)}</small> <strong>${escape(n.title)} →</strong> <em>${escape(n.subtitle)}</em></a><a class="prev" href="${p.href}">← ${escape(p.title)}</a></nav>`;
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

// The homepage and Contact page (workspace/home) carry html[data-home] and their own menu and stones.
export const isHomeShell = html => /<html\b[^>]*\sdata-home=/i.test(html);

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
  const css = await readFile(join(source, 'stones.css'));
  const arrive = await readFile(join(source, 'arrive.js'));
  await writeFile(join(target, 'stones.css'), css);
  await writeFile(join(target, 'arrive.js'), arrive);
  // Version stamps so a browser never runs a cached older build of the arrival script or the styles.
  version = createHash('sha256').update(css).update(arrive).digest('hex').slice(0, 10);
  // The homepage and Contact page are workspace/home's release: the build leaves them as they are. Their stones
  // travel to the section pages below, whose arrive.js plays the fade (it reads the referrer).
  for (const file of await htmlFiles(output)) {
    const rel = relative(output, file).split(sep).join('/');
    if (rel.startsWith('hq/')) continue;
    const html = await readFile(file, 'utf8');
    if (isHomeShell(html)) continue;
    const path = '/' + rel.replace(/index\.html$/, '');
    const updated = withStoneNav(html, path);
    if (updated !== html) await writeFile(file, updated);
  }
  for (const page of PAGES) {
    const file = join(output, page.file);
    await writeFile(file, withStones(await readFile(file, 'utf8'), page));
  }
}
