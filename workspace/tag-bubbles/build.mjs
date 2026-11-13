import { cp, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const source = fileURLToPath(new URL('.', import.meta.url));

export const BUBBLE_FILES = ['bubbles.js', 'physics.js', 'bubbles.css'];

export async function buildTagBubbles(output) {
  const target = join(output, 'tag-bubbles');
  await mkdir(target, { recursive: true });
  for (const file of BUBBLE_FILES) await cp(join(source, file), join(target, file));
}
