// Copies the blog's runtime files and writes its RSS feed into the built site.
import { cp, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { blogFeed } from './feed.mjs';
import { POSTS } from './posts.mjs';

const source = fileURLToPath(new URL('.', import.meta.url));

// Runtime files only. The index and post pages are rendered by site/pages.mjs.
export const BLOG_FILES = ['style.css'];

export async function buildBlog(output) {
  const target = join(output, 'blog');
  await mkdir(target, { recursive: true });
  for (const file of BLOG_FILES) await cp(join(source, file), join(target, file));
  await writeFile(join(target, 'feed.xml'), blogFeed(POSTS));
}
