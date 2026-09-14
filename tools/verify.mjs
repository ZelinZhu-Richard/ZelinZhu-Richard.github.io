import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { extname } from 'node:path';
import { inventory } from './manifest.mjs';
const root = process.argv[2] || 'dist';
const files = await inventory(root);
const names = new Set(files.map(x => x.file));
const errors = [];
const seen = new Map();
const documents = new Map();
for (const { file } of files) {
  const folded = file.toLowerCase();
  if (seen.has(folded)) errors.push(`Case-sensitive filename collision: ${file}`);
  seen.set(folded, file);
  if (/(^|\/)(?:\.env(?:\.|$)|node_modules|\.git|\.DS_Store|\.cache)(?:\/|$)/.test(file)) errors.push(`Private/development file in output: ${file}`);
  if (['.html', '.css', '.js', '.json', '.xml', '.txt'].includes(extname(file))) documents.set(file, await readFile(`${root}/${file}`, 'utf8'));
}
function localReference(ref, from) {
  if (!ref || ref.startsWith('//') || /^[\w+.-]+:/.test(ref) || ref.includes('${')) return;
  let url;
  const base = from.endsWith('index.html') ? from.slice(0, -10) : from;
  try { url = new URL(ref.replaceAll('&amp;', '&'), `https://local.test/${base}`); } catch { errors.push(`Invalid URL in ${from}`); return; }
  let path;
  try { path = decodeURIComponent(url.pathname).slice(1); } catch { errors.push(`Invalid URL encoding in ${from}`); return; }
  const target = names.has(path) ? path : `${path.replace(/\/$/, '')}${path ? '/' : ''}index.html`;
  if (!names.has(target)) { errors.push(`Missing local target: ${ref} in ${from}`); return; }
  if (url.hash && target.endsWith('.html')) {
    const html = documents.get(target) || '';
    const id = decodeURIComponent(url.hash.slice(1));
    if (!html.includes(`id="${id}"`) && !html.includes(`id='${id}'`)) errors.push(`Missing anchor ${ref} in ${from}`);
  }
}
for (const [file, text] of documents) {
  if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})|\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/.test(text)) errors.push(`Possible secret material in ${file}`);
  if (/https?:\/\/(?:localhost|127\.0\.0\.1):\d+|\/Users\/|\/src\/main\.jsx/.test(text)) errors.push(`Development path in ${file}`);
  if (/noomoagency\.com|hello@noomo|Noomo Agency Logo|\/cases\/|videos\/cases/.test(text)) errors.push(`Obsolete agency content in ${file}`);
  if (file.endsWith('.html')) {
    if (/noindex|gtag:\{enabled:true/.test(text)) errors.push(`Incorrect production metadata or analytics: ${file}`);
    if (!text.includes('https://zelinzhu-richard.github.io')) errors.push(`Production metadata missing: ${file}`);
    for (const m of text.matchAll(/(?:src|href)=["']([^"']+)["']/g)) localReference(m[1], file);
  }
  if (file.endsWith('.css')) for (const m of text.matchAll(/url\(["']?([^"')\s]+)["']?\)/g)) localReference(m[1], file);
  if (file.endsWith('.js')) {
    const check = spawnSync(process.execPath, ['--check', `${root}/${file}`], { encoding: 'utf8' });
    if (check.status !== 0) errors.push(`JavaScript syntax error: ${file}\n${check.stderr}`);
    for (const m of text.matchAll(/(?:from\s*|import\s*\(?)["'](\.[^"']+)["']/g)) localReference(m[1], file);
    for (const m of text.matchAll(/["'`]((?:\/(?:_nuxt|audio|images|models|textures|timelines|libs)\/)[^"'`\s]+\.[a-zA-Z0-9]+)["'`]/g)) localReference(m[1], file);
    if (file === 'story.js') for (const m of text.matchAll(/"href":\s*"([^"]+)"/g)) localReference(m[1], 'index.html');
  }
}
for (const file of ['index.html', 'work/index.html', 'about/index.html', 'research/index.html', 'contacts/index.html', '404.html', 'Zelin_Zhu_CV.pdf', '.nojekyll', 'robots.txt', 'sitemap.xml', 'models/v20.glb']) if (!names.has(file)) errors.push(`Required output missing: ${file}`);
if (!(await readFile(`${root}/Zelin_Zhu_CV.pdf`)).subarray(0, 5).equals(Buffer.from('%PDF-'))) errors.push('CV is not a valid PDF file');
if (errors.length) { console.error([...new Set(errors)].join('\n')); process.exitCode = 1; }
else console.log(`Verified ${files.length} production files: local links, anchors, asset/module paths, JS syntax, case sensitivity, metadata, and repository hygiene (${(files.reduce((n,x)=>n+x.bytes,0)/1024/1024).toFixed(1)} MiB).`);
