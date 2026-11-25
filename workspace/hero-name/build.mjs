import { cp, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const source = fileURLToPath(new URL('.', import.meta.url));

// Ibarra Real Nova Italic and its license, served at /hero-name/. The Colophon's type specimen loads the font
// from there and links the license. The captured phoenix homepage it was first made for is retired: the
// homepage (workspace/home) sets its own type, so the build no longer edits / or /contacts/, and the old
// page's stylesheet and hero-line script (hero-name.css, agency.js) stay in this folder without shipping.
// subset.py (which regenerates the font) does not ship either.
export const HERO_NAME_FILES = ['ibarra-real-nova-italic.woff2', 'OFL.txt'];

export async function buildHeroName(output) {
  const target = join(output, 'hero-name');
  await mkdir(target, { recursive: true });
  for (const file of HERO_NAME_FILES) await cp(join(source, file), join(target, file));
  return HERO_NAME_FILES.map(file => `hero-name/${file}`);
}
