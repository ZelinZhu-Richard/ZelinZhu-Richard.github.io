import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile,mkdtemp,rm,stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { buildStars } from '../workspace/github-stars/build.mjs';
import { createResearchCatalog,folderRepos,folderUrl,folderBreadcrumbs } from '../workspace/github-stars/research-model.js';
import { researchRepoRow } from '../workspace/github-stars/research-render.mjs';

const read=path=>readFile(new URL(`../workspace/github-stars/${path}`,import.meta.url),'utf8');

test('every curated folder is a real, complete HTML page with unique tools and clear sources',async t=>{
  const original=await read('data/stars.json');
  const stars=JSON.parse(original);
  const manifest=JSON.parse(await read('data/research-stack.json'));
  const cache=JSON.parse(await read('data/research-essentials.json'));
  const catalog=createResearchCatalog(stars,manifest,cache);
  const output=await mkdtemp(resolve('workspace/github-stars/.sync-test-research-build-'));
  t.after(()=>rm(output,{recursive:true,force:true}));
  const routes=await buildStars(output);
  assert.equal(routes.length,21);
  assert.equal(new Set(routes).size,21);
  assert.equal(catalog.repos.filter(repo=>repo.source==='essential').length,9);
  for(const folder of catalog.folders) {
    const repos=folderRepos(catalog,folder.id);
    assert.ok(repos.length>0,`Empty curated folder: ${folder.id}`);
    const path=folderUrl(folder.id);
    assert.ok(routes.includes(path));
    const html=await readFile(resolve(output,path.slice(1),'index.html'),'utf8');
    assert.equal([...html.matchAll(/class="repo-row"/g)].length,repos.length,path);
    assert.equal([...html.matchAll(/research-source is-essential/g)].length,repos.filter(repo=>repo.source==='essential').length,path);
    assert.equal([...html.matchAll(/research-source is-starred/g)].length,repos.filter(repo=>repo.source==='starred').length,path);
    assert.ok(html.includes(`https://zelinzhu-richard.github.io${path}`));
    assert.ok(html.includes('aria-label="Breadcrumb"'));
    for(const breadcrumb of folderBreadcrumbs(catalog,folder.id).slice(0,-1)) assert.ok(html.includes(`href="${folderUrl(breadcrumb.id)}"`));
    for(const repo of repos) assert.ok(html.includes(`href="${repo.url}"`),repo.full_name);
    assert.ok(html.includes('folder browsing works without it'));
  }
  const allStars=await readFile(resolve(output,'github/stars/index.html'),'utf8');
  assert.equal([...allStars.matchAll(/class="repo-row"/g)].length,stars.total);
  assert.doesNotMatch(allStars,/research-source/);
  assert.equal(await read('data/stars.json'),original);
  await assert.rejects(stat(resolve(output,'github/stars/research/nonexistent/index.html')),/ENOENT/);
  const publicCatalog=JSON.parse(await readFile(resolve(output,'github/stars/research.json'),'utf8'));
  assert.equal(publicCatalog.repos.length,catalog.repos.length);
  assert.equal(new Set(publicCatalog.repos.map(repo=>repo.id)).size,catalog.repos.length);
});

test('research notes and repository metadata are escaped in shared row rendering',()=>{
  const repo={full_name:'owner/example',name:'example',url:'https://github.com/owner/example',description:'<script>alert(1)</script>',language:'Python',topics:[],stars:1,type:'library',source:'essential',note:'Use <img src=x onerror=alert(1)> for plots'};
  const html=researchRepoRow(repo,[{id:'library',label:'Library'}]);
  assert.match(html,/Suggested essential/);
  assert.doesNotMatch(html,/<script>|<img/);
  assert.match(html,/&lt;script&gt;/);
  assert.match(html,/Use &lt;img/);
});
