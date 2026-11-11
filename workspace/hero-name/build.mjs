import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const source = fileURLToPath(new URL('.', import.meta.url));

// The font, its license and the stylesheet. subset.py (which regenerates the font) does not ship.
export const HERO_NAME_FILES = ['hero-name.css', 'ibarra-real-nova-italic.woff2', 'OFL.txt'];

// The captured homepage stays as committed; the built copy gets the stylesheet.
export function withHeroName(html, version) {
  if (html.includes('/hero-name/hero-name.css')) return html;
  const head = `<link rel="preload" href="/hero-name/ibarra-real-nova-italic.woff2?v=${version}" as="font" type="font/woff2" crossorigin>\n<link rel="stylesheet" href="/hero-name/hero-name.css?v=${version}">\n`;
  return html.replace(/<\/head\s*>/i, head + '</head>');
}

// start.js waits for the runtime's fonts before SplitText measures the letters; add the hero font to that wait.
const NEORIS_LOAD = "document.fonts.load('16px TTNeoris'),";
export function withHeroFontLoad(start) {
  if (start.includes('Ibarra Real Nova')) return start;
  if (!start.includes(NEORIS_LOAD)) throw new Error('hero-name: start.js font wait not found');
  return start.replace(NEORIS_LOAD, `${NEORIS_LOAD}\n  document.fonts.load('italic 400 16px "Ibarra Real Nova"'),`);
}

export async function buildHeroName(output) {
  const target = join(output, 'hero-name');
  await mkdir(target, { recursive: true });
  const hash = createHash('sha256');
  for (const file of HERO_NAME_FILES) {
    await cp(join(source, file), join(target, file));
    hash.update(await readFile(join(source, file)));
  }
  const version = hash.digest('hex').slice(0, 10);
  const css = await readFile(join(target, 'hero-name.css'), 'utf8');
  await writeFile(join(target, 'hero-name.css'), css.replace('ibarra-real-nova-italic.woff2', `ibarra-real-nova-italic.woff2?v=${version}`));
  const index = join(output, 'index.html');
  await writeFile(index, withHeroName(await readFile(index, 'utf8'), version));
  const start = join(output, 'start.js');
  await writeFile(start, withHeroFontLoad(await readFile(start, 'utf8')));
}
