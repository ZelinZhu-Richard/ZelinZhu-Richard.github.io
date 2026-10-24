import { cp, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const source = fileURLToPath(new URL('.', import.meta.url));

// Runtime files only: never docs, tests, seed files, _private or .qa.
export const HQ_FILES = Object.freeze(['index.html', 'style.css', 'app.js', 'store.js', 'helpers.js']);

export async function buildHq(output) {
  const target = join(output, 'hq');
  await mkdir(target, { recursive: true });
  for (const file of HQ_FILES) await cp(join(source, file), join(target, file));
}
