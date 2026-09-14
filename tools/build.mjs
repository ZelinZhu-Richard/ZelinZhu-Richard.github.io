import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { pages } from '../site/pages.mjs';
import { story } from '../site/story.mjs';
import { verifyManifest } from './manifest.mjs';
await verifyManifest();
await rm('dist', { recursive: true, force: true });
await cp('public', 'dist', { recursive: true });
await writeFile('dist/story.js', `export const story = ${JSON.stringify(story, null, 2)};\n`);
for (const [file, html] of pages()) {
  await mkdir(`dist/${file.substring(0, file.lastIndexOf('/') + 1)}`, { recursive: true });
  await writeFile(`dist/${file}`, html);
}
await writeFile('dist/.nojekyll', '');
const urls = ['/', '/work/', '/about/', '/research/', '/contacts/'];
await writeFile('dist/sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map(url => `<url><loc>https://zelinzhu-richard.github.io${url}</loc></url>`).join('')}</urlset>\n`);
await writeFile('dist/robots.txt', 'User-agent: *\nAllow: /\nSitemap: https://zelinzhu-richard.github.io/sitemap.xml\n');
const check = spawnSync(process.execPath, ['tools/verify.mjs', 'dist'], { stdio: 'inherit' });
if (check.status !== 0) process.exit(check.status || 1);
console.log('Built dist/ for https://zelinzhu-richard.github.io/');
