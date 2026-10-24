import { cp, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const source = fileURLToPath(new URL('.', import.meta.url));

// Runtime files only. now/index.html itself is rendered by site/pages.mjs.
export const NOW_FILES = ['style.css', 'strip.js'];

export async function buildNow(output) {
  const target = join(output, 'now');
  await mkdir(target, { recursive: true });
  for (const file of NOW_FILES) await cp(join(source, file), join(target, file));
}
