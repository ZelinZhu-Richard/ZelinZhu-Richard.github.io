// Site build step for the homepage and Contact page. Zero-dependency: it never runs
// Nuxt. It checks that the committed release/ is fresh, then copies it into the output.
import { copyFile, mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { RELEASE_DIR, checkRelease } from './stamp.mjs';

/**
 * @param {string} output the site output folder, e.g. 'dist'
 * @returns {Promise<string[]>} the files written, relative to output
 */
export async function buildHome(output) {
  const stamp = await checkRelease();
  const root = resolve(output);
  for (const { file } of stamp.files) {
    await mkdir(dirname(join(root, file)), { recursive: true });
    await copyFile(join(RELEASE_DIR, file), join(root, file));
  }
  return stamp.files.map(entry => entry.file);
}
