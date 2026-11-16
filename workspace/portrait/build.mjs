import { cp, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const source = fileURLToPath(new URL('.', import.meta.url));

// Ships the module, the About-page hook and the two data sheets. The source photos (photos/) never ship.
export const PORTRAIT_FILES = ['portrait.js', 'about.js', 'portrait.css', 'data/a.png', 'data/b.png'];

export async function buildPortrait(output) {
  const target = join(output, 'portrait');
  await mkdir(join(target, 'data'), { recursive: true });
  for (const file of PORTRAIT_FILES) await cp(join(source, file), join(target, file));
}
