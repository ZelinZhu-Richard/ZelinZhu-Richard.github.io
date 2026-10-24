import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, relative } from 'node:path';
import { buildNow, NOW_FILES } from '../build.mjs';

const here = fileURLToPath(new URL('..', import.meta.url));

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await walk(path));
    else out.push(path);
  }
  return out;
}

test('buildNow copies only the runtime allowlist into <output>/now/', async () => {
  await mkdir(join(here, '.qa'), { recursive: true });
  const output = await mkdtemp(join(here, '.qa', 'build-'));
  try {
    await buildNow(output);
    const files = (await walk(output)).map(file => relative(output, file).split('\\').join('/')).sort();
    assert.deepEqual(files, ['now/strip.js', 'now/style.css']);
    assert.deepEqual([...NOW_FILES].sort(), ['strip.js', 'style.css']);
    for (const file of NOW_FILES) assert.equal(await readFile(join(output, 'now', file), 'utf8'), await readFile(join(here, file), 'utf8'));
  } finally {
    await rm(output, { recursive: true, force: true });
  }
});
