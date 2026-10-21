import { mkdir, readFile, readdir, writeFile, copyFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';
import { parseFrontMatter, renderMarkdown, newContext, escapeHtml, BASE } from './lib/markdown.mjs';
import { layout, CHAPTERS, EXTRA_PAGES } from './lib/layout.mjs';

const source = fileURLToPath(new URL('.', import.meta.url));
const pad = n => String(n).padStart(2, '0');
const ASSETS = ['style.css', 'app.js'];

async function readContent() {
  const dir = join(source, 'content');
  const files = existsSync(dir) ? (await readdir(dir)).filter(f => f.endsWith('.md')).sort() : [];
  const docs = new Map();
  for (const file of files) {
    const raw = await readFile(join(dir, file), 'utf8');
    const { data, body } = parseFrontMatter(raw, file);
    const slug = file === 'index.md' ? 'home' : file.replace(/^\d\d-/, '').replace(/\.md$/, '');
    if (file !== 'index.md' && !/^\d\d-[a-z0-9-]+\.md$/.test(file)) throw new Error(`content/${file}: name must be NN-slug.md`);
    if (file !== 'index.md' && !CHAPTERS.some(c => c.slug === slug)) throw new Error(`content/${file}: slug "${slug}" is not in the chapter registry`);
    const chapter = CHAPTERS.find(c => c.slug === slug);
    if (chapter && file.slice(0, 2) !== pad(chapter.num)) throw new Error(`content/${file}: number must be ${pad(chapter.num)}`);
    docs.set(slug, { file, data, body });
  }
  const cardDir = join(dir, 'cards');
  const cards = existsSync(cardDir) ? (await readdir(cardDir)).filter(f => f.endsWith('.md')).sort() : [];
  const cardBodies = [];
  for (const file of cards) cardBodies.push(parseFrontMatter(await readFile(join(cardDir, file), 'utf8'), `cards/${file}`).body);
  return { docs, cardBodies };
}

export async function renderSite({ built = new Date().toISOString().slice(0, 10) } = {}) {
  const { docs, cardBodies } = await readContent();
  const pages = new Map();
  pages.set('home', { title: 'Overview' });
  for (const c of CHAPTERS) {
    const d = docs.get(c.slug)?.data || {};
    pages.set(c.slug, { title: d.title || c.slug, short: d.short || d.title || c.slug, summary: d.summary || '' });
  }
  for (const p of EXTRA_PAGES) pages.set(p.slug, { title: p.title, short: p.title });

  const errors = [];
  const out = new Map();
  const meta = { chapters: [], drills: [], selfchecks: [], badges: [], links: [], placeholders: [], ids: new Map() };

  const render = (slug, body) => {
    const ctx = newContext(slug, pages);
    const html = renderMarkdown(body, ctx);
    errors.push(...ctx.errors);
    meta.drills.push(...ctx.drills);
    meta.selfchecks.push(...ctx.selfchecks);
    meta.badges.push(...ctx.badges.map(b => ({ ...b, page: slug })));
    meta.links.push(...ctx.links.map(href => ({ href, page: slug })));
    meta.ids.set(slug, ctx.ids);
    return { html, ctx };
  };

  const chapterInfo = [];
  for (const c of CHAPTERS) {
    const doc = docs.get(c.slug);
    let html, ctx;
    if (doc) ({ html, ctx } = render(c.slug, doc.body));
    else {
      meta.placeholders.push(c.slug);
      ({ html, ctx } = render(c.slug, ':::note title="Not written yet"\nThis chapter is still being written.\n:::'));
    }
    chapterInfo.push({ c, doc, html, ctx });
    meta.chapters.push({
      slug: c.slug, num: c.num, part: c.part, hours: c.hours, title: pages.get(c.slug).title,
      drills: ctx.drills.map(d => d.id), selfchecks: ctx.selfchecks.map(s => s.id),
    });
  }
  const data = { chapters: meta.chapters };

  for (const { c, doc, html, ctx } of chapterInfo) {
    let body = html;
    if (c.slug === 'tracker') body += trackerTables(meta);
    out.set(`${c.slug}/index.html`, layout({
      slug: c.slug, title: pages.get(c.slug).title, pages, built,
      eyebrow: `Chapter ${pad(c.num)} · ${c.part}${c.star ? ' · core' : ''} · ${escapeHtml(c.hours)} of your time`,
      summary: doc?.data.summary || '', body, toc: ctx.toc, data,
    }));
  }

  const home = docs.get('home');
  const homeRender = home ? render('home', home.body) : { html: '', ctx: { toc: [] } };
  out.set('index.html', layout({
    slug: 'home', title: home?.data.title || 'Polaris Playbook', pages, built,
    eyebrow: 'Research Engineer, Polaris · Google DeepMind · a personal field guide',
    summary: home?.data.summary || '', body: homeRender.html + chapterTable(meta, pages), toc: homeRender.ctx.toc, data,
  }));

  out.set('placement/index.html', layout({
    slug: 'placement', title: 'Placement test', pages, built,
    eyebrow: 'Start · 30–60 minutes',
    summary: 'Every self-check from every chapter on one page. Tick what you can already do. Chapters where you tick everything go on your skip list.',
    body: placement(meta, pages), data,
  }));

  const cards = render('cards', cardBodies.join('\n\n'));
  out.set('cards/index.html', layout({
    slug: 'cards', title: 'Printable cards', pages, built,
    eyebrow: 'Reference · print or keep open during practice',
    summary: 'The method, the mistake card, prompts, the say-it-out-loud card and templates. Print with your browser; the page prints in black on white.',
    body: `<p><button type="button" class="pb-button" data-print>Print these cards</button></p>${cards.html}`, toc: cards.ctx.toc, data,
  }));

  // Cross-page link and anchor check.
  for (const { href, page } of meta.links) {
    const [path, hashPart] = href.slice(BASE.length).split('#');
    const slug = path.replace(/\/$/, '') || 'home';
    if (!pages.has(slug)) { errors.push(`${page}: link to unknown page ${href}`); continue; }
    if (hashPart && !meta.ids.get(slug)?.has(hashPart)) errors.push(`${page}: link to missing anchor ${href}`);
  }
  return { pages: out, meta, errors };
}

function chapterTable(meta, pages) {
  const rows = meta.chapters.map(c => `<tr><td>${pad(c.num)}</td><td><a href="${BASE}${c.slug}/">${escapeHtml(pages.get(c.slug).title)}</a></td><td>${c.part}</td><td>${escapeHtml(c.hours)}</td><td data-progress="${c.slug}">—</td></tr>`).join('');
  return `<h2 id="all-chapters">All chapters<a class="anchor" href="#all-chapters" aria-label="Link to this section">#</a></h2><div class="table-wrap" role="region" aria-label="All chapters" tabindex="0"><table><thead><tr><th scope="col">#</th><th scope="col">Chapter</th><th scope="col">Part</th><th scope="col">Your time</th><th scope="col">Your progress</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

function placement(meta, pages) {
  const groups = meta.chapters.filter(c => c.selfchecks.length).map(c => {
    const items = meta.selfchecks.filter(s => s.page === c.slug).map(s => {
      const ctx = newContext('placement', pages);
      const q = renderMarkdown(s.question, ctx).replace(/^<p>|<\/p>$/g, '');
      const a = s.answer ? `<details><summary>Show the answer</summary><div>${renderMarkdown(s.answer, ctx)}</div></details>` : '';
      const local = html => html.replace(/href="#([\w-]+)"/g, `href="${BASE}${c.slug}/#$1"`);
      return `<li><label class="task"><input type="checkbox" data-track="${s.id}"><span>${local(q)}</span></label>${local(a)}</li>`;
    }).join('');
    return `<section class="placement-group" id="place-${c.slug}"><h2 id="h-place-${c.slug}"><span class="nav-num">${pad(c.num)}</span> <a href="${BASE}${c.slug}/">${escapeHtml(pages.get(c.slug).title)}</a> <span class="placement-verdict" data-skip="${c.slug}"></span></h2><ol>${items}</ol></section>`;
  }).join('');
  return `<p class="hint">Be strict. Tick an item only if you could do it right now, without notes or an AI. The verdict next to each chapter updates as you tick.</p><div class="placement-summary"><p><strong>Your skip list:</strong> <span data-skiplist>none yet</span></p><p><strong>Hours left on the full route:</strong> <span data-hoursleft>—</span></p></div>${groups}`;
}

function trackerTables(meta) {
  const byPage = new Map(meta.chapters.map(c => [c.slug, c]));
  const rows = meta.drills.map(d => {
    const c = byPage.get(d.page);
    return `<tr><td>${pad(c.num)}</td><td><label class="task"><input type="checkbox" data-track="${d.id}"><span><a href="${BASE}${d.page}/#${d.anchor}">${escapeHtml(d.title)}</a></span></label></td><td>${escapeHtml(d.time)}</td></tr>`;
  }).join('');
  return `<h2 id="every-drill">Every drill in one list<a class="anchor" href="#every-drill" aria-label="Link to this section">#</a></h2>
<p class="hint">Ticking a drill here also ticks it on its chapter page.</p>
<div class="table-wrap" role="region" aria-label="Every drill" tabindex="0"><table><thead><tr><th scope="col">Ch</th><th scope="col">Drill</th><th scope="col">Time</th></tr></thead><tbody>${rows}</tbody></table></div>
<h2 id="backup">Back up your progress<a class="anchor" href="#backup" aria-label="Link to this section">#</a></h2>
<p>Your ticks, logs and scores live only in this browser. Export them to a file now and then.</p>
<p class="pb-actions"><button type="button" class="pb-button" data-export>Export progress (JSON)</button> <label class="pb-button pb-file">Import progress<input type="file" accept="application/json" data-import></label> <button type="button" class="pb-button pb-danger" data-reset>Reset everything</button></p>`;
}

export async function buildRepolarisdm(output, options) {
  const { pages, errors, meta } = await renderSite(options);
  if (errors.length) throw new Error(`Polaris Playbook content errors:\n${errors.join('\n')}`);
  const target = join(output, 'repolarisdm');
  for (const [file, html] of pages) {
    const path = join(target, file);
    await mkdir(path.slice(0, path.lastIndexOf('/')), { recursive: true });
    await writeFile(path, html);
  }
  await mkdir(join(target, 'assets'), { recursive: true });
  for (const asset of ASSETS) await copyFile(join(source, 'assets', asset), join(target, 'assets', asset));
  return meta;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const outDir = process.argv[2] || join(source, '.preview');
  try {
    const meta = await buildRepolarisdm(outDir);
    console.log(`Rendered Polaris Playbook into ${outDir}/repolarisdm (${meta.chapters.length} chapters, ${meta.drills.length} drills, ${meta.selfchecks.length} self-check items, placeholders: ${meta.placeholders.join(', ') || 'none'})`);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
