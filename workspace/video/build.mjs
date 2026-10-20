import { cp, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const source = fileURLToPath(new URL('.', import.meta.url));

export async function buildVideo(output) {
  const target = join(output, 'video');
  await mkdir(target, { recursive: true });
  for (const file of ['style.css', 'assets']) {
    await cp(join(source, file), join(target, file), { recursive: true });
  }
}
