// The release stamp: which sources release/ was built from, and what it contains.
// Zero-dependency, so the site build (build.mjs) and plain `node --test` can check that
// the committed release still matches its sources without installing Nuxt.
import { createHash } from 'node:crypto';
import { lstat, readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homeContent } from './content.mjs';

/** workspace/home, wherever node is started from. */
export const HOME_ROOT = fileURLToPath(new URL('.', import.meta.url));
export const RELEASE_DIR = join(HOME_ROOT, 'release');
export const STAMP_FILE = 'stamp.json';
export const STALE_MESSAGE = 'Home release is stale: run npm run home';

/**
 * Everything that can change what Nuxt emits. Folders are walked; missing entries are skipped.
 * content.mjs and contract.mjs are hashed too (the app imports contract.mjs directly);
 * homeContent()'s output is added separately because it reads files outside this folder.
 */
export const SOURCE_ROOTS = Object.freeze([
  'app/',
  'engine/',
  'modules/',
  'scripts/',
  'public/',
  'content.mjs',
  'contract.mjs',
  'nuxt.config.js',
  'package.json',
  'package-lock.json',
]);

/**
 * The only paths release/ may hold (besides stamp.json): the two pages, Nuxt's
 * /_home/ build assets, and engine assets under /home-assets/. Never 200.html or 404.html.
 * @param {string} file posix path relative to the release root
 */
export function isReleaseFile(file) {
  return file === 'index.html' || file === 'contacts/index.html' || /^(?:_home|home-assets)\/[^/](?:.*[^/])?$/.test(file);
}

/** @param {string} name */
const ignored = name => name === '.DS_Store' || name.endsWith('.log');
/** @param {string} a @param {string} b */
const byCodeUnit = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
/** @param {Buffer | string} data */
const sha256 = data => createHash('sha256').update(data).digest('hex');

/**
 * Files under a folder as sorted posix paths. Symlinks are refused.
 * @param {string} dir absolute folder
 * @param {string} [prefix]
 * @returns {Promise<string[]>}
 */
export async function listFiles(dir, prefix = '') {
  const files = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (ignored(entry.name)) continue;
    const file = prefix + entry.name;
    if (entry.isSymbolicLink()) throw new Error(`Symlinks are not allowed in the home build: ${file}`);
    if (entry.isDirectory()) files.push(...await listFiles(join(dir, entry.name), `${file}/`));
    else if (entry.isFile()) files.push(file);
  }
  return files.sort(byCodeUnit);
}

/**
 * @typedef {{ file: string, bytes: number, sha256: string }} StampFile
 * @param {string} dir absolute folder
 * @param {string[]} [files] defaults to everything under dir
 * @returns {Promise<StampFile[]>}
 */
export async function inventory(dir, files) {
  const out = [];
  for (const file of files ? [...files].sort(byCodeUnit) : await listFiles(dir)) {
    const data = await readFile(join(dir, file));
    out.push({ file, bytes: data.length, sha256: sha256(data) });
  }
  return out;
}

/**
 * sha256 over the sorted [path, sha256] pairs of SOURCE_ROOTS, plus JSON.stringify(homeContent()).
 * @returns {Promise<string>}
 */
export async function sourceHash() {
  /** @type {[string, string][]} */
  const pairs = [];
  for (const source of SOURCE_ROOTS) {
    const path = join(HOME_ROOT, source);
    const info = await lstat(path).catch(() => null);
    if (!info) continue;
    if (info.isSymbolicLink()) throw new Error(`Symlinks are not allowed in the home sources: ${source}`);
    const files = source.endsWith('/') ? (await listFiles(path)).map(file => source + file) : [source];
    for (const file of files) pairs.push([file, sha256(await readFile(join(HOME_ROOT, file)))]);
  }
  pairs.sort((a, b) => byCodeUnit(a[0], b[0]));
  return createHash('sha256').update(JSON.stringify(pairs)).update('\n').update(JSON.stringify(homeContent())).digest('hex');
}

/**
 * @typedef {{ sourceHash: string, files: StampFile[] }} Stamp
 * @param {string} [dir] the release folder (tests pass a copy)
 * @returns {Promise<Stamp>}
 */
export async function readStamp(dir = RELEASE_DIR) {
  let text;
  try {
    text = await readFile(join(dir, STAMP_FILE), 'utf8');
  } catch {
    throw new Error('Home release has no stamp (workspace/home/release/stamp.json): run npm run home');
  }
  let stamp;
  try {
    stamp = JSON.parse(text);
  } catch {
    throw new Error('Home release stamp is not valid JSON: run npm run home');
  }
  if (typeof stamp?.sourceHash !== 'string' || !Array.isArray(stamp.files)) throw new Error('Home release stamp is malformed: run npm run home');
  return stamp;
}

/**
 * Throws unless release/ is exactly what its stamp says and the stamp matches today's sources.
 * @param {string} [dir] the release folder (tests pass a copy)
 * @returns {Promise<Stamp>}
 */
export async function checkRelease(dir = RELEASE_DIR) {
  const stamp = await readStamp(dir);
  const actual = (await listFiles(dir)).filter(file => file !== STAMP_FILE);
  for (const file of [...actual, ...stamp.files.map(entry => entry.file)]) {
    if (!isReleaseFile(file)) throw new Error(`Home release has a file outside the allowlist: ${file}`);
  }
  const stamped = new Map(stamp.files.map(entry => [entry.file, entry]));
  for (const file of actual) if (!stamped.has(file)) throw new Error(`Home release file is not in the stamp: ${file}`);
  for (const entry of stamp.files) {
    const data = await readFile(join(dir, entry.file)).catch(() => null);
    if (!data) throw new Error(`Home release file is missing: ${entry.file}`);
    if (data.length !== entry.bytes || sha256(data) !== entry.sha256) throw new Error(`Home release file differs from its stamp: ${entry.file}`);
  }
  if (stamp.sourceHash !== await sourceHash()) throw new Error(STALE_MESSAGE);
  return stamp;
}
