import { cp, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const source = fileURLToPath(new URL('.', import.meta.url));

// The /work/ HTML comes from site/pages.mjs; this copies its stylesheet and screenshots.
export async function buildWork(output) {
  const target = join(output, 'work');
  await mkdir(join(target, 'shots'), { recursive: true });
  await cp(join(source, 'style.css'), join(target, 'style.css'));
  await cp(join(source, 'shots'), join(target, 'shots'), { recursive: true });
}
