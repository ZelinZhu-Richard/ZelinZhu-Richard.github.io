import { mkdir,readFile,writeFile,copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { createResearchCatalog,folderUrl,folderRepos } from './research-model.js';
import { escape,TYPE_LABELS,arrow } from './render.mjs';
import { collectionNavigation,renderFolderTree,renderBreadcrumbs,renderChildFolders,renderResearchRows } from './research-render.mjs';
const base=fileURLToPath(new URL('.',import.meta.url));
const nav=[['/work/','Work'],['/about/','About'],['/research/','Research'],['/now/','Now'],['/daily/','Daily'],['/video/','Video'],['/flash/','Flash'],['/ppiano/','Paper Piano'],['/gym/','Gym'],['/domainexp/','Domain Expansion'],['/github/stars/','Stars'],['/Zelin_Zhu_CV.pdf','CV'],['/contacts/','Contact']];

export async function buildResearch(output,stars) {
  const manifest=JSON.parse(await readFile(resolve(base,'data/research-stack.json'),'utf8'));
  const essentials=JSON.parse(await readFile(resolve(base,'data/research-essentials.json'),'utf8'));
  const catalog=createResearchCatalog(stars,manifest,essentials);
  const destination=resolve(output,'github/stars');
  await mkdir(destination,{recursive:true});
  const essentialDate=new Intl.DateTimeFormat('en-US',{dateStyle:'long',timeZone:'America/New_York'}).format(new Date(catalog.fetched_at));
  for(const file of ['research.css','research.js','research-model.js','research-render.mjs']) await copyFile(resolve(base,file),resolve(destination,file));
  await writeFile(resolve(destination,'research.json'),`${JSON.stringify(catalog)}\n`);
  for(const folder of catalog.folders) {
    const path=folderUrl(folder.id);
    const repos=folderRepos(catalog,folder.id);
    const starred=repos.filter(repo=>repo.source==='starred').length;
    const root=folder.id==='';
    const title=root?'Research Stack':`${folder.label} — Research Stack`;
    const html=`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escape(title)} — Richard Zhu</title><meta name="description" content="${escape(folder.description)}"><link rel="canonical" href="https://zelinzhu-richard.github.io${path}"><meta property="og:title" content="${escape(title)} — Richard Zhu"><meta property="og:description" content="${escape(folder.description)}"><meta property="og:type" content="website"><meta property="og:url" content="https://zelinzhu-richard.github.io${path}"><meta property="og:image" content="https://zelinzhu-richard.github.io/richard.jpg"><meta name="twitter:card" content="summary_large_image"><link rel="icon" href="/favicon.svg" type="image/svg+xml"><link rel="stylesheet" href="/portfolio.css"><link rel="stylesheet" href="/github/stars/stars.css"><link rel="stylesheet" href="/github/stars/research.css"><script src="/portfolio.js" defer></script><script type="module" src="/github/stars/research.js"></script></head>
<body class="stars-page research-page" data-research-folder="${escape(folder.id)}">
<!-- THESIS: A working research shelf with real folders, overlapping tools and unique parent counts.
OWN-WORLD: The existing midnight purple, lavender, local Neoris and Seasons, and open ruled lists.
STORY: Choose a research field or workflow, follow folders, find a tool and understand its source.
FIRST VIEWPORT: Shared navigation, compact title, All Stars / Research Stack switch and a visible folder tree beside its contents.
FORM: Code-led extension of the reference shelf; seed research-stack-folder-tree.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance -->
<a class="skip-link" href="#main">Skip to content</a><header class="site-header"><a class="wordmark" href="/" aria-label="Richard Zhu — Home">Richard Zhu</a><button class="menu-button" type="button" aria-expanded="false" aria-controls="navigation">Menu</button><nav id="navigation" aria-label="Main navigation">${nav.map(([href,label])=>`<a href="${href}">${label}</a>`).join('')}</nav></header>
<main id="main">${root?`<section class="research-intro"><h1>Research<br><em>stack.</em></h1><div><p class="research-intro-line">From a question<br>to a <em>paper.</em></p><p>Tools, libraries, skills, and references for the research workflow. Browse by field or task, and find what belongs in your stack.</p></div></section>`:''}${collectionNavigation('research')}${renderBreadcrumbs(catalog,folder.id)}
<div class="research-layout"><aside class="research-index">${renderFolderTree(catalog,folder.id)}<p class="tree-note">A tool can belong in several folders. Each folder counts it once.</p></aside><div class="research-content" id="folder-contents">
${root?'':`<header class="research-folder-heading"><h1>${escape(folder.label)}</h1><p>${escape(folder.description)}</p></header>`}${renderChildFolders(catalog,folder.id)}
<section class="research-tools" aria-labelledby="tools-heading"><div class="research-tools-heading"><h2 id="tools-heading">${root?'All research tools':'Tools in this folder'}</h2><p>${repos.length} tools <span aria-hidden="true">·</span> ${starred} starred <span aria-hidden="true">·</span> ${repos.length-starred} suggested essentials</p></div>
<p class="research-legend">Starred tools come from my GitHub bookmarks. Suggested essentials are additional tools selected for this collection.</p><p id="research-status" class="enhancement-status" role="status" hidden>Loading search and filters…</p>
<form class="search-bar enhanced" id="research-search-form" role="search" hidden><label class="sr-only" for="research-query">Search research tools</label><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></svg><input id="research-query" type="search" placeholder="Search tools, descriptions, and uses…" autocomplete="off"><button type="button" id="research-clear" hidden>Clear search</button><button type="submit" class="sr-only">Search</button></form>
<div class="filter-bar enhanced research-filters" hidden><label>Type<select id="research-type"><option value="all">All types</option>${catalog.types.map(type=>`<option value="${escape(type.id)}">${escape(TYPE_LABELS[type.id]||type.label)}</option>`).join('')}</select></label><label>Language<select id="research-language"><option value="all">All languages</option>${[...new Set(catalog.repos.map(repo=>repo.language||'Unspecified'))].sort().map(language=>`<option>${escape(language)}</option>`).join('')}</select></label><label class="sort-label">Sort<select id="research-sort"><option value="newest">Recently starred</option><option value="popular">Most GitHub stars</option><option value="updated">Recently updated</option><option value="name">Name A–Z</option></select></label></div>
<div class="results-summary"><p id="research-count" role="status" aria-live="polite" aria-atomic="true">${repos.length} tools in ${root?'Research Stack':'this folder'}</p><button type="button" id="research-reset" hidden>Reset filters</button></div><div id="research-results"><ul class="repo-list">${renderResearchRows(repos,catalog.types)}</ul></div><noscript><p class="fallback-note">All tools in this folder are listed above. Search and filters are available with JavaScript; folder browsing works without it.</p></noscript>
</section><aside class="research-page-note"><p>Suggested essential metadata checked <time datetime="${escape(catalog.fetched_at)}">${essentialDate}</time>.</p><a href="/github/stars/research.json" download>Download the research collection ${arrow}</a></aside></div></div></main><footer class="stars-footer"><a class="wordmark" href="/">Richard Zhu</a><p>© 2026 Richard Zhu</p><a href="/github/stars/">All GitHub stars ${arrow}</a></footer></body></html>`;
    const target=resolve(output,path.slice(1),'index.html');
    await mkdir(resolve(target,'..'),{recursive:true});
    await writeFile(target,html);
  }
  console.log(`Built Research Stack: ${catalog.repos.length} tools across ${catalog.folders.length} folder pages.`);
  return catalog.folders.map(folder=>folderUrl(folder.id));
}
