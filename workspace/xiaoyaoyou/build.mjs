import { cp, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, relative, sep } from 'node:path';

// The game is built on the game/xiaoyaoyou branch and lives in games/xiaoyaoyou/,
// with its own plan, tools, Blender scripts and reference art. Only the runtime
// and the making-of page ship; ref/, blender/, tools/, notes and _dev/ stay in the repo.
export const source = fileURLToPath(new URL('../../games/xiaoyaoyou/', import.meta.url));
export const SHIPPED = ['index.html', 'styles.css', 'assets.json', 'text.json', 'src', 'assets', 'fonts', 'vendor', 'making-of'];
// VERSION.json records the local path three.js was copied from; it is not needed at runtime.
const SKIPPED = new Set(['vendor/three/VERSION.json']);

const keep = path => {
  const name = relative(source, path).split(sep).join('/');
  return !SKIPPED.has(name) && !name.split('/').some(part => part.startsWith('.') || part === '_dev' || part === '__pycache__');
};

export async function buildXiaoyaoyou(output) {
  const target = join(output, 'games', 'xiaoyaoyou');
  await mkdir(target, { recursive: true });
  for (const entry of SHIPPED) {
    await cp(join(source, entry), join(target, entry), { recursive: true, filter: keep });
  }
  // The game's WebGL canvas is opaque and fills the viewport, so the site's shark background
  // could never be seen behind it. The build still injects its markup; this stops it running,
  // and keeps its pause button off the game and out of ?showcase=1 recordings.
  const page = join(target, 'index.html');
  const html = await readFile(page, 'utf8');
  if (!/<body>/.test(html)) throw new Error('xiaoyaoyou: expected a plain <body> tag in index.html');
  await writeFile(page, html.replace('<body>', '<body data-sharks="off">'));
}

export async function listFiles(directory) {
  const files = [];
  async function visit(path) {
    for (const entry of await readdir(path, { withFileTypes: true })) {
      const full = join(path, entry.name);
      if (entry.isDirectory()) await visit(full);
      else files.push(relative(directory, full).split(sep).join('/'));
    }
  }
  await visit(directory);
  return files.sort();
}
