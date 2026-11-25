import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const json = async path => JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8'));

test('the site root package.json stays dependency-free', async () => {
  const root = await json('../../../package.json');
  assert.equal(root.name, 'richard-zhu-personal-website');
  for (const key of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies', 'workspaces']) assert.equal(root[key], undefined, `root package.json has ${key}`);
});

test('home pins exact dependency versions', async () => {
  const home = await json('../package.json');
  assert.deepEqual(Object.keys(home.dependencies).sort(), ['gsap', 'nuxt', 'three', 'vue']);
  for (const [name, version] of Object.entries(home.dependencies)) assert.match(version, /^\d+\.\d+\.\d+$/, `${name} is not pinned`);
  assert.equal(home.devDependencies, undefined);
});
