import { mkdir,readFile,writeFile,copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { filterRepos,groupByType } from './model.js';
import { escape,renderTypeGroups,TYPE_LABELS,arrow,star } from './render.mjs';
import { buildResearch } from './research-build.mjs';
import { collectionNavigation } from './research-render.mjs';
const base = fileURLToPath(new URL('.',import.meta.url));

export async function buildStars(output='dist') {
  const catalog = JSON.parse(await readFile(resolve(base,'data/stars.json'),'utf8'));
  if (!catalog.complete || catalog.total !== catalog.repos.length) throw new Error('Stars snapshot must be complete before publication.');
  const target = resolve(output,'github/stars');
  await mkdir(target,{recursive:true});
  for (const file of ['stars.css','stars.js','model.js','render.mjs','research.css']) await copyFile(resolve(base,file),resolve(target,file));
  await copyFile(resolve(base,'data/stars.json'),resolve(target,'stars.json'));
  const groups = groupByType(filterRepos(catalog.repos),catalog.types,catalog.categories);
  const date = new Intl.DateTimeFormat('en-US',{dateStyle:'long',timeZone:'America/New_York'}).format(new Date(catalog.fetched_at));
  const nav = [['/work/','Work'],['/about/','About'],['/research/','Research'],['/now/','Now'],['/daily/','Daily'],['/video/','Video'],['/flash/','Flash'],['/ppiano/','Paper Piano'],['/gym/','Gym'],['/domainexp/','Domain Expansion'],['/github/stars/','Stars'],['/Zelin_Zhu_CV.pdf','CV'],['/contacts/','Contact']];
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>GitHub Stars — Richard Zhu</title><meta name="description" content="${catalog.total} repositories from Richard Zhu’s GitHub stars, sorted into useful piles. Explore AI agents, developer tools, research, creative projects, and more."><link rel="canonical" href="https://zelinzhu-richard.github.io/github/stars/"><meta property="og:title" content="GitHub Stars — Richard Zhu"><meta property="og:description" content="An open-source library, sorted by what it is, then what it does."><meta property="og:type" content="website"><meta property="og:url" content="https://zelinzhu-richard.github.io/github/stars/"><meta property="og:image" content="https://zelinzhu-richard.github.io/richard.jpg"><meta name="twitter:card" content="summary_large_image"><link rel="icon" href="/favicon.svg" type="image/svg+xml"><link rel="stylesheet" href="/portfolio.css"><link rel="stylesheet" href="./stars.css"><link rel="stylesheet" href="./research.css"><script src="/portfolio.js" defer></script><script type="module" src="./stars.js"></script></head>
<body class="stars-page">
<!-- THESIS: A personal reference shelf: browse repositories by type, then explore their purpose piles.
OWN-WORLD: Incumbent midnight purple, lavender ink, Neoris and italic Seasons, thin rules and open editorial lists.
STORY: See the real collection, choose a pile, search and open a useful repository.
FIRST VIEWPORT: Compact shared navigation; a large left title with explanatory copy right; search above a pile index and repository rows.
FORM: Code-led extension, reference shelf; seed github-stars-type-shelf.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance -->
<a class="skip-link" href="#main">Skip to content</a><header class="site-header"><a class="wordmark" href="/" aria-label="Richard Zhu — Home">Richard Zhu</a><button class="menu-button" type="button" aria-expanded="false" aria-controls="navigation">Menu</button><nav id="navigation" aria-label="Main navigation">${nav.map(([href,label])=>`<a href="${href}"${href==='/github/stars/'?' aria-current="page"':''}>${label}</a>`).join('')}</nav></header>
<main id="main"><section class="stars-intro"><h1>Stars,<br><em>sorted.</em></h1><div class="intro-copy"><p>A little less searching.<br>A little more <em>finding.</em></p><p>My GitHub bookmarks, organized by what they are, then what they do. A growing shelf of tools, ideas, and things worth exploring.</p><a class="source-link" href="${escape(catalog.source)}" target="_blank" rel="noopener noreferrer">${star} ${catalog.total.toLocaleString('en-US')} repositories on GitHub ${arrow}</a></div></section>
${collectionNavigation('all')}<div class="collection-heading"><h2>The collection</h2><p>${catalog.types.length} types · ${catalog.categories.length} purposes <span aria-hidden="true">·</span> Snapshot <time datetime="${escape(catalog.fetched_at)}">${date}</time></p></div>
<p class="collection-note">Choose a type, then explore its purpose piles. Use the purpose and language filters to narrow it down. Stars are bookmarks, not endorsements.</p>
<div id="enhancement-status" role="status" class="enhancement-status" hidden>Loading search and filters…</div>
<form id="search-form" role="search" class="search-bar enhanced" hidden><label for="repo-search" class="sr-only">Search repositories, descriptions, and topics</label><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></svg><input id="repo-search" type="search" name="q" placeholder="Search names, descriptions, topics…" autocomplete="off"><button id="clear-search" type="button" hidden>Clear search</button><button type="submit" class="sr-only">Search</button></form>
<div class="shelf-layout"><aside class="pile-index" aria-label="Repository piles"><p class="index-label">Browse by type</p><nav id="pile-navigation" aria-label="Repository types"><a class="pile-link" href="#collection" data-type="all" aria-current="true"><span>All stars</span><span class="pile-count">${catalog.total}</span></a>${catalog.types.map(type=>`<a class="pile-link" href="#type-${escape(type.id)}" data-type="${escape(type.id)}"><span>${escape(TYPE_LABELS[type.id] || type.label)}</span><span class="pile-count">${catalog.repos.filter(repo=>repo.type===type.id).length}</span></a>`).join('')}</nav><a class="download-link" href="./stars.json" download>Download the collection ${arrow}</a></aside>
<div class="shelf-content" id="collection"><div class="filter-bar enhanced" hidden><label>Purpose<select id="purpose-filter"><option value="all">All purposes</option>${catalog.categories.map(category=>`<option value="${escape(category.id)}">${escape(category.label)}</option>`).join('')}</select></label><label>Language<select id="language-filter"><option value="all">All languages</option>${[...new Set(catalog.repos.map(repo=>repo.language||'Unspecified'))].sort().map(language=>`<option>${escape(language)}</option>`).join('')}</select></label><label class="sort-label">Sort<select id="sort-filter"><option value="newest">Recently starred</option><option value="popular">Most GitHub stars</option><option value="updated">Recently updated</option><option value="name">Name A–Z</option></select></label></div>
<div class="results-summary"><p id="result-count" role="status" aria-live="polite" aria-atomic="true">${catalog.total} repositories in ${catalog.types.length} types</p><button type="button" id="reset-filters" hidden>Reset filters</button></div><div id="repository-results">${renderTypeGroups(groups,catalog.types,{staticContent:true})}</div>
<noscript><p class="fallback-note">All ${catalog.total} repositories are available below. Enable JavaScript for search, filters, and sorting.</p></noscript></div></div>
<aside class="collection-footer"><p>Good things are better <em>shared.</em></p><a href="${escape(catalog.source)}" target="_blank" rel="noopener noreferrer">Explore my stars on GitHub ${arrow}</a></aside></main><footer class="stars-footer"><a class="wordmark" href="/">Richard Zhu</a><p>© 2026 Richard Zhu</p><a href="/work/">Back to my work ${arrow}</a></footer></body></html>`;
  await writeFile(resolve(target,'index.html'),html);
  console.log(`Built /github/stars/ with ${catalog.total} repositories in ${catalog.types.length} types.`);
  return buildResearch(output,catalog);
}
