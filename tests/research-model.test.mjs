import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createResearchCatalog,
  folderUrl,
  folderRepos,
  folderChildren,
  folderBreadcrumbs,
  folderCount,
  researchStateFromSearch,
  researchSearchFromState,
  filterResearchRepos,
} from '../workspace/github-stars/research-model.js';

const ids = repos => repos.map(repo => repo.id);
const clone = value => structuredClone(value);

function repo(id, full_name, overrides = {}) {
  return {
    id,
    full_name,
    name: full_name.split('/')[1],
    description: 'Tools for reproducible research',
    url: `https://github.com/${full_name}`,
    language: 'Python',
    topics: ['research'],
    stars: 100,
    type: 'library',
    category: 'tools',
    starred_at: '2026-10-20T12:00:00Z',
    pushed_at: '2026-10-19T12:00:00Z',
    ...overrides,
  };
}

function fixture() {
  const stars = {
    fetched_at: '2026-10-25T10:00:00Z',
    total: 4,
    types: [{ id: 'library', label: 'Library' }, { id: 'cli', label: 'CLI' }, { id: 'resource', label: 'Resource' }],
    categories: [{ id: 'tools', label: 'Tools' }, { id: 'models', label: 'Models' }, { id: 'finance', label: 'Finance' }],
    repos: [
      repo(1, 'new-owner/CodeReader', { language: 'TypeScript', stars: 500, description: 'Inspect source code', topics: ['code-analysis'], starred_at: '2026-10-24T12:00:00Z' }),
      repo(2, 'example/Statistics', { category: 'models', stars: 800, description: 'Estimate statistical models', topics: ['statistics', 'econometrics'], starred_at: '2026-10-23T12:00:00Z' }),
      repo(3, 'example/Uncurated', { stars: 9000 }),
      repo(4, 'example/Console', { type: 'cli', stars: 200, description: 'Inspect source code from the terminal', starred_at: '2026-10-22T12:00:00Z' }),
    ],
  };
  const manifest = {
    version: 1,
    title: 'Research stack',
    description: 'A deliberate selection of research tools.',
    folders: [
      { id: '', parent: null, label: 'Research stack', description: 'All selected tools' },
      { id: 'general', parent: '', label: 'General', description: 'Common workflows' },
      { id: 'general/code-analysis', parent: 'general', label: 'Code analysis', description: 'Read and inspect code' },
      { id: 'ai-ml', parent: '', label: 'AI and ML', description: 'Modeling workflows' },
      { id: 'ai-ml/statistics', parent: 'ai-ml', label: 'Statistics', description: 'Statistical tools' },
      { id: 'finance', parent: '', label: 'Finance', description: 'Financial research' },
      { id: 'finance/econometrics', parent: 'finance', label: 'Econometrics', description: 'Economic estimation' },
    ],
    members: [
      { repo_id: 1, full_name: 'old-owner/OldCodeReader', folders: ['general/code-analysis'], note: 'Read unfamiliar source.' },
      { repo_id: 2, full_name: 'example/Statistics', folders: ['ai-ml/statistics', 'finance/econometrics'], note: 'Shared estimation tools.' },
      { repo_id: 4, full_name: 'example/Console', folders: ['general/code-analysis'], note: 'A terminal workflow.' },
    ],
    essentials: [
      { full_name: 'NUMPY/NumPy', type: 'library', category: 'models', folders: ['ai-ml/statistics'], note: 'Array computing.' },
      { full_name: 'example/EconomicsGuide', type: 'resource', category: 'finance', folders: ['finance/econometrics'], note: 'Reference material.' },
    ],
  };
  const cache = {
    fetched_at: '2026-10-25T11:00:00Z',
    repos: [
      repo(101, 'numpy/numpy', { stars: 12000, topics: ['arrays', 'statistics'], description: 'Array computing for statistical research' }),
      repo(102, 'example/EconomicsGuide', { language: null, stars: 25, topics: ['econometrics'], description: '经济学模型参考 / C++ examples' }),
    ],
  };
  return { stars, manifest, cache };
}

function catalogFrom({ stars, manifest, cache } = fixture()) {
  return createResearchCatalog(stars, manifest, cache);
}

function freeze(value) {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

test('research selects starred members by ID and keeps the All Stars snapshot independent', () => {
  const input = fixture();
  const catalog = catalogFrom(input);
  assert.deepEqual(ids(catalog.repos), [1, 2, 4, 101, 102]);
  const renamed = catalog.repos.find(item => item.id === 1);
  assert.equal(renamed.full_name, 'new-owner/CodeReader');
  assert.equal(renamed.url, 'https://github.com/new-owner/CodeReader');
  assert.equal(renamed.source, 'starred');
  assert.equal(renamed.note, 'Read unfamiliar source.');
  assert.equal(input.stars.total, 4);
  assert.equal(input.stars.repos.length, 4);
  assert.equal(folderCount(catalog), 5);
  assert.ok(!catalog.repos.some(item => item.id === 3));
});

test('essential lookup ignores name case and applies its curated type and purpose', () => {
  const catalog = catalogFrom();
  const numpy = catalog.repos.find(item => item.id === 101);
  assert.equal(numpy.full_name, 'numpy/numpy');
  assert.equal(numpy.source, 'essential');
  assert.equal(numpy.category, 'models');
  assert.equal(numpy.type, 'library');
  assert.equal(numpy.starred_at, null);
  const guide = catalog.repos.find(item => item.id === 102);
  assert.equal(guide.type, 'resource');
  assert.equal(guide.category, 'finance');
  assert.equal(guide.language, null);
});

test('a cached essential already starred merges by ID and prefers current starred metadata', () => {
  const input = fixture();
  input.cache.repos.push(repo(1, 'old-owner/OldCodeReader', { language: 'Ruby', stars: 1 }));
  input.manifest.essentials.push({
    full_name: 'old-owner/OldCodeReader', type: 'resource', category: 'finance',
    folders: ['ai-ml/statistics', 'general/code-analysis', 'ai-ml/statistics'], note: 'Useful for method review.',
  });
  const catalog = catalogFrom(input);
  const merged = catalog.repos.find(item => item.id === 1);
  assert.equal(catalog.repos.filter(item => item.id === 1).length, 1);
  assert.equal(merged.full_name, 'new-owner/CodeReader');
  assert.equal(merged.language, 'TypeScript');
  assert.equal(merged.stars, 500);
  assert.equal(merged.type, 'library');
  assert.equal(merged.category, 'tools');
  assert.equal(merged.source, 'starred');
  assert.deepEqual(merged.folder_ids, ['general/code-analysis', 'ai-ml/statistics']);
  assert.equal(merged.note, 'Read unfamiliar source. Useful for method review.');
});

test('an essential pinned by repository ID survives a rename and becomes starred when available', () => {
  const input = fixture();
  input.manifest.essentials[0].repo_id = 101;
  input.manifest.essentials[0].full_name = 'previous-owner/OldArrayName';
  const cached = catalogFrom(input).repos.find(item => item.id === 101);
  assert.equal(cached.full_name, 'numpy/numpy');
  assert.equal(cached.source, 'essential');
  input.stars.repos.push(repo(101, 'current-owner/ArrayKit', { stars: 45000, category: 'tools' }));
  const starred = catalogFrom(input).repos.find(item => item.id === 101);
  assert.equal(starred.full_name, 'current-owner/ArrayKit');
  assert.equal(starred.source, 'starred');
  assert.equal(starred.stars, 45000);
  assert.equal(starred.category, 'tools');
});

test('folder parents show the deduplicated union of descendants', () => {
  const input = fixture();
  input.manifest.members[0].folders.push('ai-ml/statistics');
  input.manifest.members[1].folders.push('ai-ml/statistics');
  const catalog = catalogFrom(input);
  assert.deepEqual(ids(folderRepos(catalog, 'general')), [1, 4]);
  assert.deepEqual(ids(folderRepos(catalog, 'general/code-analysis')), [1, 4]);
  assert.deepEqual(ids(folderRepos(catalog, 'ai-ml')), [1, 2, 101]);
  assert.deepEqual(ids(folderRepos(catalog, 'finance')), [2, 102]);
  assert.equal(folderCount(catalog, ''), 5);
  assert.equal(folderCount(catalog, 'ai-ml'), 3);
  assert.equal(new Set(ids(folderRepos(catalog))).size, folderCount(catalog));
  assert.deepEqual(catalog.repos.find(item => item.id === 2).folder_ids, ['ai-ml/statistics', 'finance/econometrics']);
});

test('folder navigation keeps direct children in manifest order and breadcrumbs from root', () => {
  const catalog = catalogFrom();
  assert.deepEqual(folderChildren(catalog).map(item => item.id), ['general', 'ai-ml', 'finance']);
  assert.deepEqual(folderChildren(catalog, 'ai-ml').map(item => item.id), ['ai-ml/statistics']);
  assert.deepEqual(folderChildren(catalog, 'ai-ml/statistics'), []);
  assert.deepEqual(folderBreadcrumbs(catalog, 'finance/econometrics').map(item => item.id), ['', 'finance', 'finance/econometrics']);
  assert.deepEqual(folderBreadcrumbs(catalog).map(item => item.id), ['']);
  for (const helper of [folderRepos, folderChildren, folderBreadcrumbs, folderCount]) {
    assert.throws(() => helper(catalog, 'missing/folder'));
  }
});

test('folder URLs use canonical root and nested paths and reject ambiguous paths', () => {
  assert.equal(folderUrl(), '/github/stars/research/');
  assert.equal(folderUrl(''), '/github/stars/research/');
  assert.equal(folderUrl('ai-ml/statistics'), '/github/stars/research/ai-ml/statistics/');
  for (const path of ['../private', '/general', 'general/', 'general//code-analysis', 'General', 'general/a_b', 'general/%2e%2e', 'general?x=1', '统计', null]) {
    assert.throws(() => folderUrl(path), String(path));
  }
});

test('research state round-trips Unicode and punctuation without carrying the All Stars pile', () => {
  const state = { query: '模型 & coding / C++ + #methods?', type: 'resource', language: 'C++', sort: 'popular' };
  const search = researchSearchFromState({ ...state, category: 'finance', pile: 'models' });
  assert.deepEqual(researchStateFromSearch(search), state);
  assert.equal(new URLSearchParams(search).has('pile'), false);
  assert.equal(new URLSearchParams(search).has('category'), false);
  assert.deepEqual(researchStateFromSearch('?pile=finance&sort=unknown'), { query: '', type: 'all', language: 'all', sort: 'newest' });
  assert.equal(researchSearchFromState({ query: '', type: 'all', language: 'all', sort: 'newest' }), '');
  assert.equal(researchStateFromSearch(`?q=${'x'.repeat(400)}`).query.length, 300);
});

test('research filters combine text, type and language within the selected subtree', () => {
  const catalog = catalogFrom();
  assert.deepEqual(ids(filterResearchRepos(folderRepos(catalog, 'general'), { query: 'SOURCE code', type: 'cli', language: 'Python' })), [4]);
  assert.deepEqual(ids(filterResearchRepos(catalog.repos, { query: 'statistics', type: 'library', language: 'Python' })), [2, 101]);
  assert.deepEqual(ids(filterResearchRepos(catalog.repos, { query: '经济学模型 / C++', type: 'resource', language: 'Unspecified' })), [102]);
  assert.deepEqual(filterResearchRepos(catalog.repos, { query: 'missing-search-token' }), []);
  assert.deepEqual(filterResearchRepos(catalog.repos, { type: 'cli', language: 'TypeScript' }), []);
  assert.deepEqual(ids(filterResearchRepos(catalog.repos, { category: 'nonexistent' })), ids(filterResearchRepos(catalog.repos)));
});

test('research search combines curated uses with repository text without changing metadata', () => {
  const source = catalogFrom().repos.map(item=>item.id===1 ? {...item,note:`${item.note} 方法比较`} : item);
  const before = clone(source);
  freeze(source);
  const result = filterResearchRepos(source, {query:'CODEREADER unfamiliar 方法',type:'library',language:'TypeScript'});
  assert.deepEqual(ids(result), [1]);
  assert.equal(result[0], source[0]);
  assert.deepEqual(filterResearchRepos(source, {query:'unfamiliar Statistics'}), []);
  assert.deepEqual(source, before);
});

test('research sorting keeps unstarred essentials after actual star dates and retains extra fields', () => {
  const catalog = catalogFrom();
  const source = catalog.repos.map(item => ({ ...item, annotation: { selected: true } }));
  const original = clone(source);
  assert.deepEqual(ids(filterResearchRepos(source)), [1, 2, 4, 102, 101]);
  assert.deepEqual(ids(filterResearchRepos(source, { sort: 'popular' })), [101, 2, 1, 4, 102]);
  assert.deepEqual(ids(filterResearchRepos(source, { sort: 'name' })), ids([...source].sort((a, b) => a.full_name.localeCompare(b.full_name))));
  assert.ok(filterResearchRepos(source).every(item => item.annotation.selected && item.folder_ids.length && item.source && typeof item.note === 'string'));
  assert.deepEqual(source, original);
});

test('catalog construction and folder/filter helpers do not mutate any authoring inputs', () => {
  const input = fixture();
  const before = clone(input);
  freeze(input);
  const catalog = catalogFrom(input);
  freeze(catalog);
  folderRepos(catalog, 'ai-ml');
  folderChildren(catalog);
  folderBreadcrumbs(catalog, 'finance/econometrics');
  folderCount(catalog);
  filterResearchRepos(catalog.repos, { sort: 'popular' });
  assert.deepEqual(input, before);
});

const invalidTrees = [
  ['missing root', folders => folders.filter(folder => folder.id !== '')],
  ['duplicate root', folders => [...folders, { ...folders[0] }]],
  ['duplicate path', folders => [...folders, { ...folders[2] }]],
  ['invalid path', folders => folders.map(folder => folder.id === 'general' ? { ...folder, id: 'General' } : folder)],
  ['missing parent', folders => folders.map(folder => folder.id === 'general/code-analysis' ? { ...folder, parent: 'missing' } : folder)],
  ['wrong immediate parent', folders => folders.map(folder => folder.id === 'general/code-analysis' ? { ...folder, parent: '' } : folder)],
  ['cycle', folders => folders.map(folder => folder.id === 'general' ? { ...folder, parent: 'general/code-analysis' } : folder)],
  ['non-null root parent', folders => folders.map(folder => folder.id === '' ? { ...folder, parent: 'general' } : folder)],
];

for (const [name, change] of invalidTrees) {
  test(`invalid research tree rejects ${name}`, () => {
    const input = fixture();
    input.manifest.folders = change(input.manifest.folders);
    assert.throws(() => catalogFrom(input));
  });
}

for (const folders of [[], ['unknown'], ['general'], [''], ['ai-ml/statistics', 'unknown']]) {
  test(`starred membership must name nonempty existing leaves: ${JSON.stringify(folders)}`, () => {
    const input = fixture();
    input.manifest.members[0].folders = folders;
    assert.throws(() => catalogFrom(input));
  });
}

test('essential memberships also reject non-leaf folders', () => {
  const input = fixture();
  input.manifest.essentials[0].folders = ['ai-ml'];
  assert.throws(() => catalogFrom(input));
});

test('missing starred ID fails even when the recorded name matches a real star', () => {
  const input = fixture();
  input.manifest.members[0] = { ...input.manifest.members[0], repo_id: 99999, full_name: input.stars.repos[0].full_name };
  assert.throws(() => catalogFrom(input));
});

test('essential definitions require cached metadata and cached IDs must be unique', () => {
  const missing = fixture();
  missing.cache.repos = missing.cache.repos.filter(item => item.id !== 101);
  assert.throws(() => catalogFrom(missing));
  const duplicate = fixture();
  duplicate.cache.repos.push(repo(101, 'other/Repository'));
  assert.throws(() => catalogFrom(duplicate));
});

for (const [name, change] of [
  ['nonpositive ID', item => ({ ...item, id: 0 })],
  ['unsafe URL', item => ({ ...item, url: 'https://example.com/numpy/numpy' })],
  ['mismatched repository URL', item => ({ ...item, url: 'https://github.com/other/repository' })],
  ['unknown type', item => ({ ...item, type: 'undefined-type' })],
  ['unknown category', item => ({ ...item, category: 'undefined-category' })],
  ['missing description', item => ({ ...item, description: null })],
  ['invalid topics', item => ({ ...item, topics: ['arrays', 7] })],
  ['negative star count', item => ({ ...item, stars: -1 })],
]) {
  test(`essential metadata rejects ${name}`, () => {
    const input = fixture();
    input.cache.repos[0] = change(input.cache.repos[0]);
    assert.throws(() => catalogFrom(input));
  });
}
