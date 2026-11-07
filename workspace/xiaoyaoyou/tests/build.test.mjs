import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildXiaoyaoyou, listFiles } from '../build.mjs';

test('xiaoyaoyou ships the runtime and making-of page, and nothing from its workshop', async () => {
  const output = await mkdtemp(join(tmpdir(), 'xiaoyaoyou-'));
  try {
    await buildXiaoyaoyou(output);
    const root = join(output, 'games', 'xiaoyaoyou');
    const files = await listFiles(root);
    for (const file of ['index.html', 'styles.css', 'assets.json', 'text.json', 'src/boot.js', 'src/main.js',
      'assets/kun.glb', 'assets/sea.glb', 'assets/og.jpg', 'fonts/wenkai.woff2', 'fonts/OFL-LXGWWenKai.txt',
      'fonts/OFL-EBGaramond.txt', 'vendor/three/LICENSE', 'vendor/three/build/three.module.min.js',
      'making-of/index.html', 'making-of/img/concept.jpg']) {
      assert.ok(files.includes(file), `missing ${file}`);
    }
    for (const file of files) {
      assert.doesNotMatch(file, /^(ref|blender|tools|_dev)\/|\.(md|py|sh|blend)$|(^|\/)\./, `workshop file shipped: ${file}`);
    }
    assert.ok(!files.includes('vendor/three/VERSION.json'));
    assert.match(await readFile(join(root, 'index.html'), 'utf8'), /<body data-sharks="off">/);
    assert.doesNotMatch(await readFile(join(root, 'making-of/index.html'), 'utf8'), /data-sharks/);
    // Every model the manifest names must ship.
    for (const { path } of Object.values(JSON.parse(await readFile(join(root, 'assets.json'), 'utf8')))) {
      assert.ok(files.includes(path), `manifest asset missing: ${path}`);
    }
    const bytes = (await Promise.all(files.map(f => readFile(join(root, f))))).reduce((n, b) => n + b.length, 0);
    assert.ok(bytes < 20_000_000, `game download budget exceeded: ${bytes} bytes`);
  } finally {
    await rm(output, { recursive: true, force: true });
  }
});
