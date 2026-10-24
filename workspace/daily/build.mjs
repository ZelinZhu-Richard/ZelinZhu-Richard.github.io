import { cp, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { pages } from '../../site/pages.mjs';

const source = fileURLToPath(new URL('.', import.meta.url));

// Runtime allowlist (ARCHITECTURE.md). Docs, tests, sim, _private, .qa, fixtures and dev HTML (e.g. a pets gallery) never ship.
const DIRS = ['app', 'engine', 'pets'];
const EXCLUDE = /(^|[\\/])(fixtures|tests?|sim|_private|\.qa|node_modules)([\\/]|$)|\.(md|mjs|py|html|test\.js)$|(^|[\\/])\./;
const ROUTES = [
  ['pages/index.html', 'daily/index.html', '/daily/'],
  ['pages/eggs.html', 'daily/eggs/index.html', '/daily/eggs/'],
];

async function exists(path) {
  try { await stat(path); return true; } catch { return false; }
}

async function copyTree(from, to) {
  const entries = await readdir(from, { withFileTypes: true });
  for (const entry of entries) {
    const src = join(from, entry.name);
    if (EXCLUDE.test(relative(source, src))) continue;
    if (entry.isDirectory()) await copyTree(src, join(to, entry.name));
    else {
      await mkdir(to, { recursive: true });
      await cp(src, join(to, entry.name));
    }
  }
}

export function siteChrome() {
  const work = pages().get('work/index.html');
  const header = work.match(/<header class="site-header">[\s\S]*?<\/header>/)?.[0];
  const footer = work.match(/<footer class="site-footer">[\s\S]*?<\/footer>/)?.[0] || '';
  if (!header || !header.includes('href="/daily/"')) throw new Error('Daily navigation is missing.');
  const active = header.replaceAll(' aria-current="page"', '').replace('href="/daily/"', 'href="/daily/" aria-current="page"');
  return { header: active, footer };
}

export async function renderPage(template, path) {
  const { header, footer } = siteChrome();
  const html = (await readFile(join(source, template), 'utf8'))
    .replace('<!-- PORTFOLIO_HEADER -->', header)
    .replace('<!-- PORTFOLIO_FOOTER -->', footer);
  const canonical = `https://zelinzhu-richard.github.io${path}`;
  if (!html.includes(`<link rel="canonical" href="${canonical}">`) || !html.includes(`<meta property="og:url" content="${canonical}">`)) {
    throw new Error(`Daily page ${template} must carry canonical and og:url for ${canonical}.`);
  }
  return html;
}

// The published snapshot if the owner committed one; otherwise a clearly labelled preview
// (kind 'preview') played by the real engine with a fixed seed: a short run of complete days.
async function snapshotJson() {
  const published = join(source, 'public', 'snapshot.json');
  if (await exists(published)) return readFile(published, 'utf8');
  if (await exists(join(source, 'engine', 'index.js'))) {
    try { return `${JSON.stringify(await enginePreview(), null, 2)}\n`; } catch (err) { console.warn(`Daily: engine preview failed, using the fixture preview (${err.message})`); }
  }
  // TODO(integration): remove this fallback once the engine preview is stable.
  const { previewSnapshot } = await import(pathToFileURL(join(source, 'app', 'fixtures', 'views.js')).href);
  return `${JSON.stringify(previewSnapshot(Date.UTC(2026, 10, 12, 20, 30)), null, 2)}\n`;
}

export async function enginePreview(days = 9) {
  const E = await import(pathToFileURL(join(source, 'engine', 'index.js')).href);
  const at = (day, hourUtc) => Date.UTC(2026, 10, 2 + day, hourUtc, 0); // November: New York = UTC−5
  let s = E.newGame({ seed: 20261024, now: at(0, 14), tasks: E.DEFAULT_TASKS });
  const run = (action, now) => { s = E.applyAction(s, action, now).state; };
  for (let d = 0; d < days; d += 1) {
    const now = at(d, 22); // 17:00 New York
    s = E.advance(s, now).state;
    for (const egg of E.viewEggs(s).petEggs) if (egg.servings >= egg.need) run({ type: 'petEgg/hatch', petEggId: egg.id }, now);
    const today = E.viewToday(s, now);
    if (d % 3 === 2) for (const t of today.tasks.slice(0, 2)) if (t.raiseTo?.length) run({ type: 'task/raise', taskId: t.id, level: t.raiseTo[0] }, now);
    const list = E.viewToday(s, now).tasks;
    for (const t of d === days - 1 ? list.slice(0, 4) : list) if (!t.ticked) run({ type: 'task/tick', taskId: t.id }, now); // today: 4 of 6 done
    for (const p of E.viewPets(s, now).active) {
      const pool = E.viewToday(s, now).food.pool;
      if (pool > 0) run({ type: 'pet/feed', petId: p.id, amount: Math.min(pool, d === days - 1 ? 100 : 160) }, now);
    }
  }
  const last = at(days - 1, 22);
  return E.publicSnapshot(s, last, { preview: true });
}

export async function buildDaily(output) {
  const target = join(output, 'daily');
  await mkdir(join(target, 'eggs'), { recursive: true });
  for (const [template, file, path] of ROUTES) await writeFile(join(output, file), await renderPage(template, path));
  await cp(join(source, 'style.css'), join(target, 'style.css'));
  for (const dir of DIRS) if (await exists(join(source, dir))) await copyTree(join(source, dir), join(target, dir));
  await writeFile(join(target, 'snapshot.json'), await snapshotJson());
}

export const DAILY_EXCLUDE = EXCLUDE;
