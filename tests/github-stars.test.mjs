import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pages } from '../site/pages.mjs';
import { filterRepos, groupRepos, groupByType, stateFromSearch, searchFromState } from '../workspace/github-stars/model.js';
import { renderTypeGroups } from '../workspace/github-stars/render.mjs';
import { buildStars } from '../workspace/github-stars/build.mjs';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const repos = [
  { full_name: 'example/AgentKit', name: 'AgentKit', description: 'Build coding agents', topics: ['agents', 'coding'], category: 'agents', type: 'library', language: 'TypeScript', stars: 1200, starred_at: '2026-10-25T10:00:00Z' },
  { full_name: 'example/模型指南', name: '模型指南', description: '中文机器学习指南', topics: ['machine-learning'], category: 'models', type: 'resource', language: null, stars: 300, starred_at: '2026-10-24T10:00:00Z' },
  { full_name: 'example/agent-cli', name: 'agent-cli', description: 'Terminal assistant', topics: ['agents'], category: 'agents', type: 'cli', language: 'Python', stars: 2400, starred_at: '2026-10-23T10:00:00Z' },
];

test('star filters combine purpose, type, language and case-insensitive text', () => {
  assert.deepEqual(filterRepos(repos, { category: 'agents', type: 'library', language: 'TypeScript', query: 'CODING' }).map(r => r.full_name), ['example/AgentKit']);
  assert.equal(filterRepos(repos, { category: 'models', type: 'cli' }).length, 0);
  assert.deepEqual(filterRepos(repos, { query: '模型' }).map(r => r.full_name), ['example/模型指南']);
  assert.equal(filterRepos(repos, { query: 'unfindable-repo-name' }).length, 0);
});

test('star groups account for every filtered repository exactly once', () => {
  const categories = [{ id: 'agents', label: 'AI agents & coding' }, { id: 'models', label: 'AI models & ML' }];
  const groups = groupRepos(filterRepos(repos, { category: 'agents' }), categories);
  const grouped = groups.flatMap(group => group.repos);
  assert.equal(grouped.length, 2);
  assert.equal(new Set(grouped.map(repo => repo.full_name)).size, 2);
  assert.ok(grouped.every(repo => repo.category === 'agents'));
});

test('type hierarchy preserves definition order, separates purposes and accounts for each repository once', () => {
  const categories = [{id:'models',label:'AI models & ML'},{id:'agents',label:'AI agents & coding'},{id:'unused',label:'Unused'}];
  const types = [{id:'resource',label:'Resource'},{id:'library',label:'Library'},{id:'cli',label:'CLI'},{id:'unused',label:'Unused'}];
  const extra = {...repos[0],name:'ModelKit',full_name:'example/ModelKit',category:'models'};
  const source = [...repos,extra];
  const grouped = groupByType(source,types,categories);
  assert.deepEqual(grouped.map(group=>group.id),['resource','library','cli']);
  assert.deepEqual(grouped.find(group=>group.id==='library').purposes.map(purpose=>purpose.id),['models','agents']);
  const leaves = grouped.flatMap(group=>group.purposes.flatMap(purpose=>purpose.repos));
  assert.equal(leaves.length,source.length);
  assert.equal(new Set(leaves.map(repo=>repo.full_name)).size,source.length);
  assert.ok(grouped.every(group=>group.purposes.every(purpose=>purpose.repos.every(repo=>repo.type===group.id&&repo.category===purpose.id))));
  const ordered = groupByType([extra,repos[0],{...extra,full_name:'example/SecondModel'}],types,categories);
  assert.deepEqual(ordered[0].purposes[0].repos.map(repo=>repo.full_name),['example/ModelKit','example/SecondModel']);
});

test('type and purpose drill-down controls stay scoped and progressive limits apply per purpose', () => {
  const categories = [{id:'agents',label:'AI agents & coding',description:'Agent tools'},{id:'models',label:'AI models & ML',description:'Model tools'}];
  const types = [{id:'library',label:'Library / framework'}];
  const source = Array.from({length:40},(_,index)=>({...repos[0],name:`repo-${index}`,full_name:`example/repo-${index}`,url:`https://github.com/example/repo-${index}`,category:index<20?'agents':'models'}));
  const groups = groupByType(source,types,categories);
  const overview = renderTypeGroups(groups,types,{overview:true});
  assert.equal([...overview.matchAll(/class="repo-row"/g)].length,2);
  assert.match(overview,/data-type="library" data-open-type="true"/);
  assert.match(overview,/data-type="library" data-purpose="agents" data-open-purpose="true"/);
  assert.match(overview,/<h2 id="type-heading-library">Libraries &amp; frameworks/);
  assert.match(overview,/<h3 id="type-library-pile-agents-heading">AI agents &amp; coding/);
  const detail = renderTypeGroups(groups,types,{limits:{agents:18}});
  assert.equal([...detail.matchAll(/class="repo-row"/g)].length,30);
  assert.match(detail,/data-type="library" data-more="agents"/);
  assert.match(detail,/Show 2 more/);
  const complete = renderTypeGroups(groups,types,{staticContent:true});
  assert.equal([...complete.matchAll(/class="repo-row"/g)].length,40);
  assert.doesNotMatch(complete,/data-(?:open-type|open-purpose|more)=/);
});

test('filter URLs preserve punctuation and non-Latin search text', () => {
  const state = { query: '模型 & coding / C++', category: 'models', type: 'resource', language: 'C++', sort: 'newest' };
  const decoded = stateFromSearch(searchFromState(state));
  for (const [key, value] of Object.entries(state)) assert.equal(decoded[key], value);
});

test('sorts use GitHub counts and actual star dates without mutating the snapshot', () => {
  const original = repos.map(repo => repo.full_name);
  assert.equal(filterRepos(repos, {sort:'popular'})[0].full_name, 'example/agent-cli');
  assert.equal(filterRepos(repos, {sort:'newest'})[0].full_name, 'example/AgentKit');
  assert.equal(filterRepos(repos, {sort:'name'})[0].full_name, [...repos].sort((a,b)=>a.full_name.localeCompare(b.full_name))[0].full_name);
  assert.deepEqual(repos.map(repo => repo.full_name), original);
  assert.equal(filterRepos(repos, {language:'Unspecified'})[0].name, '模型指南');
});

test('static route includes every repo without JavaScript and excludes authoring data', async t => {
  const target = await mkdtemp(resolve('workspace/github-stars/.sync-test-build-'));
  t.after(()=>rm(target,{recursive:true,force:true}));
  await buildStars(target);
  const catalog = JSON.parse(await read('workspace/github-stars/data/stars.json'));
  const html = await readFile(resolve(target,'github/stars/index.html'),'utf8');
  assert.equal([...html.matchAll(/class="repo-row"/g)].length, catalog.total);
  for (const repo of catalog.repos) assert.ok(html.includes(`href="${repo.url}"`), repo.full_name);
  assert.match(html,/https:\/\/zelinzhu-richard.github.io\/github\/stars\//);
  assert.match(html,/enhancement-status[^>]*hidden/);
  assert.equal([...html.matchAll(/class="repo-type-group"/g)].length,catalog.types.length);
  assert.match(html,/<h2 id="type-heading-application">Applications/);
  assert.match(html,/<h3 id="type-application-pile-[^"]+-heading">/);
  const files=await readdir(resolve(target,'github/stars'));
  for(const file of ['index.html','model.js','render.mjs','stars.css','stars.js','stars.json','research']) assert.ok(files.includes(file));
  assert.ok(!files.some(file=>/^(?:data|scripts|tests|research-stack\.json|research-essentials\.json)$/.test(file)));
  assert.match(html,/href="\/github\/stars\/research\/"/);
});

test('star library is discoverable from detail pages and both captured homepage menus', async () => {
  for (const html of pages().values()) assert.match(html, /href="\/github\/stars\/">Stars<\/a>/);
  assert.match(await read('public/index.html'), /href="\/github\/stars\/"/);
  const runtime = await read('public/_nuxt/CbdjwYMp.js');
  assert.match(runtime, /to:"\/github\/stars\/"/);
  assert.match(runtime, /link:"\/github\/stars\/",text:"Stars"/);
});

test('saved public star collection is complete, uniquely classified and safe to link', async () => {
  const catalog = JSON.parse(await read('workspace/github-stars/data/stars.json'));
  assert.equal(catalog.username, 'ZelinZhu-Richard');
  assert.equal(catalog.complete, true);
  assert.ok(catalog.repos.length > 0);
  assert.equal(catalog.total, catalog.repos.length);
  assert.equal(new Set(catalog.repos.map(repo => repo.full_name.toLowerCase())).size, catalog.total);
  const categories = new Set(catalog.categories.map(category => category.id));
  const types = new Set(catalog.types.map(type => type.id));
  for (const repo of catalog.repos) {
    assert.ok(categories.has(repo.category), `Unknown purpose for ${repo.full_name}`);
    assert.ok(types.has(repo.type), `Unknown type for ${repo.full_name}`);
    assert.equal(new URL(repo.url).origin, 'https://github.com');
    assert.ok(Number.isFinite(repo.stars) && repo.stars >= 0);
    assert.ok(Number.isFinite(Date.parse(repo.starred_at)));
  }
});
