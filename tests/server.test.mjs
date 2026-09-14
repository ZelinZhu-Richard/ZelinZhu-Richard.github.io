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
