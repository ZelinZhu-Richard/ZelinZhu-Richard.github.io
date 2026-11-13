import { cp, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const source = fileURLToPath(new URL('.', import.meta.url));

// Runtime files only. The index and post pages are rendered by site/pages.mjs.
export const BLOG_FILES = ['style.css'];

export async function buildBlog(output) {
  const target = join(output, 'blog');
  await mkdir(target, { recursive: true });
  for (const file of BLOG_FILES) await cp(join(source, file), join(target, file));
}
