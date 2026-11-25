import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import http from 'node:http';
import { createStaticServer } from '../tools/serve.mjs';

let folder, server, origin;
before(async () => {
  folder = await mkdtemp(join(tmpdir(), 'noomo-server-'));
  const root = join(folder, 'public');
  await mkdir(join(root, 'contacts'), { recursive: true });
  await writeFile(join(root, 'index.html'), '<h1>Storytelling</h1>');
  await writeFile(join(root, 'contacts/index.html'), '<h1>Contact</h1>');
  await writeFile(join(root, 'scene.wasm'), '0123456789');
  await writeFile(join(folder, 'outside.txt'), 'private');
  await symlink(join(folder, 'outside.txt'), join(root, 'link.txt'));
  server = await createStaticServer(root);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
  await rm(folder, { recursive: true });
});

test('serves real HTML routes and returns 404 for unknown routes', async () => {
  assert.match(await (await fetch(origin + '/')).text(), /Storytelling/);
  assert.match(await (await fetch(origin + '/contacts')).text(), /Contact/);
  assert.equal((await fetch(origin + '/unknown-page')).status, 404);
  const redirect = await fetch(origin + '/contacts?from=menu', { redirect: 'manual' });
  assert.equal(redirect.status, 301);
  assert.equal(redirect.headers.get('location'), '/contacts/?from=menu');
  assert.equal((await fetch(origin + '/missing.js')).status, 404);
});
test('answers a missing path with the site 404 page when there is one, as GitHub Pages does', async () => {
  const site = await mkdtemp(join(tmpdir(), 'site-404-'));
  await writeFile(join(site, '404.html'), '<h1>Page not found</h1>');
  const local = await createStaticServer(site);
  await new Promise(resolve => local.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${local.address().port}`;
  try {
    const missing = await fetch(base + '/nothing-here/');
    assert.equal(missing.status, 404);
    assert.match(missing.headers.get('content-type'), /^text\/html/);
    assert.match(await missing.text(), /Page not found/);
    const head = await fetch(base + '/nothing.js', { method: 'HEAD' });
    assert.equal(head.status, 404);
    assert.equal(await head.text(), '');
    // Without a 404.html the answer stays plain text.
    const plain = await fetch(origin + '/unknown-page');
    assert.equal(plain.status, 404);
    assert.equal(await plain.text(), 'Not found');
    // A 404.html that points outside the served folder is never read.
    await rm(join(site, '404.html'));
    await symlink(join(folder, 'outside.txt'), join(site, '404.html'));
    const escaped = await fetch(base + '/nothing-here/');
    assert.equal(escaped.status, 404);
    assert.equal(await escaped.text(), 'Not found');
  } finally {
    local.closeAllConnections();
    await new Promise(resolve => local.close(resolve));
    await rm(site, { recursive: true });
  }
});
test('uses WebAssembly MIME type and supports media byte ranges', async () => {
  const result = await fetch(origin + '/scene.wasm', { headers: { Range: 'bytes=2-5' } });
  assert.equal(result.status, 206);
  assert.equal(result.headers.get('content-type'), 'application/wasm');
  assert.equal(result.headers.get('content-range'), 'bytes 2-5/10');
  assert.equal(await result.text(), '2345');
  assert.equal(await (await fetch(origin + '/scene.wasm', { headers: { Range: 'bytes=-3' } })).text(), '789');
  assert.equal((await fetch(origin + '/scene.wasm', { headers: { Range: 'bytes=20-' } })).status, 416);
});
test('supports HEAD and conditional requests without transmitting a body', async () => {
  const head = await fetch(origin + '/scene.wasm', { method: 'HEAD' });
  assert.equal(head.headers.get('content-length'), '10');
  assert.equal(await head.text(), '');
  assert.equal((await fetch(origin + '/scene.wasm', { headers: { 'If-None-Match': head.headers.get('etag') } })).status, 304);
});
test('rejects traversal, escaping symlinks, malformed URLs, and mutation methods', async () => {
  const raw = path => new Promise((resolve, reject) => {
    http.get(origin + path, response => { response.resume(); resolve(response.statusCode); }).on('error', reject);
  });
  assert.equal(await raw('/%2e%2e%2foutside.txt'), 403);
  assert.equal((await fetch(origin + '/link.txt')).status, 403);
  assert.equal(await raw('/%zz'), 400);
  assert.equal((await fetch(origin, { method: 'POST', body: 'test' })).status, 405);
});
