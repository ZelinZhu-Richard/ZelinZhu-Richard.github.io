import { cp, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const source = fileURLToPath(new URL('.', import.meta.url));
export const CHOICES_FILES = ['style.css', 'tree.js'];

export async function buildChoices(output) {
  const target = join(output, 'choices');
  await mkdir(target, { recursive: true });
  for (const file of CHOICES_FILES) await cp(join(source, file), join(target, file));
}
