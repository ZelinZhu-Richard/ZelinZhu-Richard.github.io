import { cp, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

export async function buildSkills(output) {
  const target = join(output, 'skills');
  await mkdir(target, { recursive: true });
  await cp(new URL('./style.css', import.meta.url), join(target, 'style.css'));
}
