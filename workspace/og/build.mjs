// Copies the share cards into the built site and points each page's og:image at its card.
// Runs after every step that writes HTML: it edits the pages that are already there.
import { cp, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, relative, sep } from 'node:path';
import { CARD, cardFor, cards } from './cards.mjs';

const source = fileURLToPath(new URL('.', import.meta.url));
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const SITE = 'https://zelinzhu-richard.github.io';
// The tall photo most pages shared. A link preview is wide, so it showed a strip of it.
const PORTRAIT = `${SITE}/richard.jpg`;
// Unlisted pages keep the image they were given.
const SKIPPED = ['hq/', 'duke/', 'choices/'];

const META = /<meta\b[^>]*>/gi;
const showsPortrait = tag => tag.includes(`content="${PORTRAIT}"`) || tag.includes(`content='${PORTRAIT}'`);
const isOgImage = tag => /\bproperty=["']og:image["']/i.test(tag);
const isTwitterImage = tag => /\b(?:name|property)=["']twitter:image["']/i.test(tag);

// The site path of a built file: "/about/" for about/index.html, "/" for index.html, "/404.html" for 404.html.
export const pagePath = file => '/' + file.replace(/(^|\/)index\.html$/, '$1');

// A page that chose its own image (the Neon Rain poster) or has none is returned as it is.
export function withCard(html, path, all = cards()) {
  if (!(html.match(META) || []).some(tag => isOgImage(tag) && showsPortrait(tag))) return html;
  const card = cardFor(path, all);
  const url = `${SITE}${card.src}`;
  const details = [['width', CARD.width], ['height', CARD.height], ['type', 'image/png'], ['alt', card.alt]]
    .map(([name, value]) => `<meta property="og:image:${name}" content="${escape(value)}">`).join('\n');
  return html.replace(META, tag => {
    if (!showsPortrait(tag)) return tag;
    if (isOgImage(tag)) return `${tag.replace(PORTRAIT, () => url)}\n${details}`;
    return isTwitterImage(tag) ? tag.replace(PORTRAIT, () => url) : tag;
  });
}

async function htmlFiles(directory) {
  const out = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) out.push(...await htmlFiles(path));
    else if (entry.name.endsWith('.html')) out.push(path);
  }
  return out;
}

export async function buildOg(output, { all = cards(), images = join(source, 'cards') } = {}) {
  const missing = all.filter(card => !existsSync(join(images, `${card.name}.png`))).map(card => card.name);
  if (missing.length) throw new Error(`og: no image for ${missing.join(', ')}. Run python3 workspace/og/make_cards.py`);
  const target = join(output, 'og');
  await mkdir(target, { recursive: true });
  for (const { name } of all) await cp(join(images, `${name}.png`), join(target, `${name}.png`));
  for (const file of await htmlFiles(output)) {
    const rel = relative(output, file).split(sep).join('/');
    if (SKIPPED.some(folder => rel.startsWith(folder))) continue;
    const html = await readFile(file, 'utf8');
    const updated = withCard(html, pagePath(rel), all);
    if (updated !== html) await writeFile(file, updated);
  }
}
