import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { listFiles } from '../stamp.mjs';

const HOME = fileURLToPath(new URL('..', import.meta.url));
/** Modules plain node must load without workspace/home/node_modules. */
const ZERO_DEP = ['content.mjs', 'contract.mjs', 'stamp.mjs', 'build.mjs', 'engine/core/rng.js', 'app/utils/text.js'];

/** Source text without comments (keeps "https://" inside strings). */
function code(text, file) {
  const script = file.endsWith('.vue') ? [...text.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n') : text;
  return script.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
}

/** @returns {{ specifier: string, dynamic: boolean }[]} */
function imports(source) {
  const found = [];
  for (const m of source.matchAll(/\bimport\s*(?:[\w$*{}\s,]+?\s*from\s*)?["']([^"']+)["']/g)) found.push({ specifier: m[1], dynamic: false });
  for (const m of source.matchAll(/\bexport\s*(?:\*(?:\s*as\s+[\w$]+)?|\{[^}]*\})\s*from\s*["']([^"']+)["']/g)) found.push({ specifier: m[1], dynamic: false });
  for (const m of source.matchAll(/\bimport\s*\(\s*["']([^"']+)["']\s*\)/g)) found.push({ specifier: m[1], dynamic: true });
  return found;
}

const isRelative = specifier => specifier.startsWith('./') || specifier.startsWith('../');

/** Follows relative imports from `entry`; returns every non-relative, non-node: specifier reached. */
async function bareImports(entry, { dynamic }) {
  const bad = [];
  const seen = new Set();
  const visit = async (file, chain) => {
    if (seen.has(file)) return;
    seen.add(file);
    for (const { specifier, dynamic: isDynamic } of imports(code(await readFile(file, 'utf8'), file))) {
      if (isDynamic && !dynamic) continue;
      if (specifier.startsWith('node:')) continue;
      if (!isRelative(specifier)) { bad.push(`${[...chain, specifier].join(' -> ')}`); continue; }
      await visit(resolve(dirname(file), specifier), [...chain, specifier]);
    }
  };
  await visit(join(HOME, entry), [entry]);
  return bad;
}

test('zero-dependency modules import no bare specifiers, transitively', async () => {
  for (const entry of ZERO_DEP) assert.deepEqual(await bareImports(entry, { dynamic: true }), [], entry);
});

test('the engine facade loads in plain node; only load() reaches three', async () => {
  // nothing the facade imports statically reaches a package (CONTRACTS.md)
  assert.deepEqual(await bareImports('engine/index.js', { dynamic: false }), []);
  // everything that does goes through load()'s import('./stage.js'), and it is three (or its
  // addons) and nothing else; the stage, post, the sky and the room act import it themselves
  const lazy = await bareImports('engine/index.js', { dynamic: true });
  assert.ok(lazy.includes('engine/index.js -> ./stage.js -> three'), 'the stage imports three');
  for (const chain of lazy) {
    assert.ok(chain.startsWith('engine/index.js -> ./stage.js -> '), `reached before load(): ${chain}`);
    assert.match(chain.split(' -> ').at(-1), /^three(?:\/|$)/, `not three: ${chain}`);
  }
});

test('app and engine never import files outside workspace/home', async () => {
  for (const dir of ['app', 'engine', 'modules']) {
    for (const file of await listFiles(join(HOME, dir))) {
      if (!/\.(?:m?js|vue)$/.test(file)) continue;
      const path = join(HOME, dir, file);
      for (const { specifier } of imports(code(await readFile(path, 'utf8'), file))) {
        const local = specifier.startsWith('~~/') ? join(HOME, specifier.slice(3)) : isRelative(specifier) ? resolve(dirname(path), specifier) : null;
        if (local) assert.ok(!relative(HOME, local).startsWith(`..${sep}`), `${dir}/${file} imports ${specifier}, outside workspace/home`);
        if (dir !== 'modules') assert.ok(!/(?:^|\/)content\.mjs$/.test(specifier), `${dir}/${file} imports content.mjs; use #build/site-content.mjs`);
      }
    }
  }
});

test('the import scanner sees what it should', () => {
  const found = imports(code(`import a from 'x';\nimport {\n  b,\n  c,\n} from "./y.js";\nexport * from '../z.mjs';\n// import q from 'commented';\nconst u = 'https://a.b/c';\nawait import('./d.js');`, 'f.js'));
  assert.deepEqual(found.map(f => f.specifier).sort(), ['../z.mjs', './d.js', './y.js', 'x']);
});
