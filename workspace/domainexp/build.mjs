import {cp, mkdir, readFile, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {pages} from '../../site/pages.mjs';
const source = fileURLToPath(new URL('.', import.meta.url));
const shared = fileURLToPath(new URL('../ppiano/', import.meta.url));
const runtime = ['style.css', 'app.js', 'camera.js', 'geometry.js', 'render.js', 'fireball.js', 'dust.js', 'vision.js', 'vision-worker.js'];

export async function buildDomainExpansion(output) {
  const target = join(output, 'domainexp');
  await mkdir(target, {recursive: true});
  for (const file of runtime) await cp(join(source, file), join(target, file));
  const header = pages().get('work/index.html').match(/<header class="site-header">[\s\S]*?<\/header>/)?.[0];
  if (!header || !header.includes('/domainexp/')) throw new Error('Domain Expansion navigation is missing.');
  const activeHeader = header.replaceAll(' aria-current="page"', '').replace('href="/domainexp/"', 'href="/domainexp/" aria-current="page"');
  await writeFile(join(target, 'index.html'), (await readFile(join(source, 'index.html'), 'utf8')).replace('<!-- PORTFOLIO_HEADER -->', activeHeader));
  const manifest = JSON.parse(await readFile(join(shared, 'assets/manifest.json'), 'utf8'));
  if (manifest.mediapipe !== '0.10.14') throw new Error('Review the MediaPipe version before updating Domain Expansion.');
  const files = manifest.files.filter(entry => entry.file.startsWith('vendor/mediapipe/') || ['vendor/hand_landmarker.task', 'vendor/MEDIAPIPE-LICENSE.txt'].includes(entry.file));
  if (files.length !== 7) throw new Error('Incomplete hand-tracking dependencies.');
  for (const entry of files) {
    const data = await readFile(join(shared, entry.file));
    if (data.length !== entry.bytes || createHash('sha256').update(data).digest('hex') !== entry.sha256) throw new Error(`Domain Expansion dependency integrity failed: ${entry.file}`);
    await mkdir(join(target, entry.file, '..'), {recursive: true});
    await writeFile(join(target, entry.file), data);
  }
}
