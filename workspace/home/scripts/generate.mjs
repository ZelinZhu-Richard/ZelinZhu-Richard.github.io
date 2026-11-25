// Shared by release.mjs and check.mjs: run `nuxt generate`, then pick the allowlisted
// files out of its public output.
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { HOME_ROOT, isReleaseFile, listFiles } from '../stamp.mjs';

const NUXT_BIN = join(HOME_ROOT, 'node_modules', 'nuxt', 'bin', 'nuxt.mjs');
/** Strings that mean a development path leaked into the output. */
export const LEAKS = ['/Users/', 'localhost'];

/**
 * Runs `nuxt generate` in workspace/home.
 * @param {{ output?: string, buildDir?: string }} [where] scratch folders (check.mjs); defaults to .output/ and .nuxt/
 * @returns {string} the generated public folder
 */
export function generate({ output, buildDir } = {}) {
  const env = { ...process.env, NUXT_TELEMETRY_DISABLED: '1', NODE_ENV: 'production' };
  delete env.HOME_NUXT_OUTPUT;
  delete env.HOME_NUXT_BUILD;
  if (output) env.HOME_NUXT_OUTPUT = output;
  if (buildDir) env.HOME_NUXT_BUILD = buildDir;
  const run = spawnSync(process.execPath, [NUXT_BIN, 'generate'], { cwd: HOME_ROOT, env, stdio: 'inherit' });
  if (run.error) throw run.error;
  if (run.status !== 0) throw new Error(`nuxt generate failed (exit ${run.status ?? run.signal})`);
  return join(output || join(HOME_ROOT, '.output'), 'public');
}

/**
 * Splits Nuxt's public output into the files a release keeps and the ones it drops.
 * Throws if a page is missing or a kept file contains a development path.
 * @param {string} publicDir
 * @returns {Promise<{ kept: string[], dropped: string[] }>}
 */
export async function collect(publicDir) {
  const all = await listFiles(publicDir);
  const kept = all.filter(isReleaseFile);
  const dropped = all.filter(file => !isReleaseFile(file));
  for (const page of ['index.html', 'contacts/index.html']) if (!kept.includes(page)) throw new Error(`nuxt generate did not emit ${page}`);
  const leaks = [];
  for (const file of kept) {
    const text = (await readFile(join(publicDir, file))).toString('latin1');
    for (const leak of LEAKS) if (text.includes(leak)) leaks.push(`${file} contains "${leak}"`);
  }
  if (leaks.length) throw new Error(`Development paths in the home build:\n  ${leaks.join('\n  ')}`);
  return { kept, dropped };
}
