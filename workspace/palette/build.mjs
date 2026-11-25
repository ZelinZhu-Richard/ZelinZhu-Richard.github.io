// Ships the command palette to <output>/palette/, writes its list of destinations from index.mjs,
// and adds the Search button to every built page that has the shared header.
import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, relative, sep } from 'node:path';
import { siteIndex } from './index.mjs';

const source = fileURLToPath(new URL('.', import.meta.url));
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const PALETTE_FILES = ['palette.js', 'search.js', 'notfound.js', 'palette.css'];
// A plain link to the full list on the Colophon page until palette.js turns it into a button.
// The key hint is "/": it is the same key on every platform, so nothing has to be filled in by script.
export const TRIGGER = '<a class="palette-button" href="/colophon/#everything" data-palette-open><span>Search</span><kbd aria-hidden="true">/</kbd></a>';
const MENU_BUTTON = '<button class="menu-button"';

/** The site index as one list, in display order, each item carrying its group's name. */
export const flatIndex = () => siteIndex().flatMap(({ group, items }) => items.map(item => ({ group, ...item })));

export function withPalette(html, version) {
  if (html.includes('data-palette-open') || !html.includes(MENU_BUTTON) || !html.includes('href="/portfolio.css"')) return html;
  const stamp = escape(version);
  const assets = `<link rel="stylesheet" href="/palette/palette.css?v=${stamp}">\n<script type="module" src="/palette/palette.js?v=${stamp}"></script>\n`;
  return html.replace(MENU_BUTTON, () => TRIGGER + MENU_BUTTON).replace(/<\/head\s*>/i, end => assets + end);
}

// A module's own imports carry the version too, so a new index is never read through a cached older file.
export const stampImports = (code, version) => code.replace(/((?:from\s*|import\s*\(\s*)['"]\.\/[\w.-]+\.js)(?=['"])/g, `$1?v=${version}`);

async function htmlFiles(directory) {
  const out = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) out.push(...await htmlFiles(path));
    else if (entry.name.endsWith('.html')) out.push(path);
  }
  return out;
}

export async function buildPalette(output) {
  const target = join(output, 'palette');
  await mkdir(target, { recursive: true });
  const index = `// Built from workspace/palette/index.mjs: every destination the palette can open.\nexport const INDEX = ${JSON.stringify(flatIndex())};\n`;
  const hash = createHash('sha256').update(index);
  const files = [];
  for (const file of PALETTE_FILES) {
    const text = await readFile(join(source, file), 'utf8');
    files.push([file, text]);
    hash.update(text);
  }
  const version = hash.digest('hex').slice(0, 10);
  await writeFile(join(target, 'index.js'), index);
  for (const [file, text] of files) await writeFile(join(target, file), file.endsWith('.js') ? stampImports(text, version) : text);
  for (const file of await htmlFiles(output)) {
    // hq/ is not part of the public site, so it gets no Search button.
    if (relative(output, file).split(sep)[0] === 'hq') continue;
    const html = await readFile(file, 'utf8');
    const updated = withPalette(html, version);
    if (updated !== html) await writeFile(file, updated);
  }
  return version;
}
