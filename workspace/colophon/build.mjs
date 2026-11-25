// Build steps for /colophon/: copy the stylesheet early, then count the finished site and write the
// four figures into the page. The page itself is rendered by site/pages.mjs from page.mjs.
import { cp, mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { fillStats } from './page.mjs';
import { UNLISTED_FOLDERS } from '../palette/index.mjs';

const source = fileURLToPath(new URL('.', import.meta.url));
const PACKAGE = fileURLToPath(new URL('../../package.json', import.meta.url));

export const COLOPHON_FILES = ['style.css'];

export const countDependencies = pkg => Object.keys(pkg.dependencies || {}).length + Object.keys(pkg.devDependencies || {}).length;

async function tally(directory, skip = []) {
  const total = { pages: 0, files: 0, bytes: 0 };
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (skip.includes(entry.name)) continue;
      const inner = await tally(path);
      for (const key of Object.keys(total)) total[key] += inner[key];
    } else {
      total.files += 1;
      total.bytes += (await stat(path)).size;
      if (entry.name.endsWith('.html')) total.pages += 1;
    }
  }
  return total;
}

/** The page's four figures for a built tree: what a visitor can open. The unlisted folders are left out. */
export async function siteStats(output, { packageFile = PACKAGE } = {}) {
  const { pages, files, bytes } = await tally(output, UNLISTED_FOLDERS);
  const deps = countDependencies(JSON.parse(await readFile(packageFile, 'utf8')));
  return { pages, files, size: (bytes / 1024 / 1024).toFixed(1), deps };
}

export async function buildColophon(output) {
  const target = join(output, 'colophon');
  await mkdir(target, { recursive: true });
  for (const file of COLOPHON_FILES) await cp(join(source, file), join(target, file));
}

// Must run after every other build step: the counts are only right once all the files are written.
export async function finishColophon(output) {
  const file = join(output, 'colophon', 'index.html');
  const stats = await siteStats(output);
  await writeFile(file, fillStats(await readFile(file, 'utf8'), stats));
  return stats;
}
