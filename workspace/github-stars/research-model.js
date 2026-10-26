import { filterRepos,stateFromSearch,searchFromState } from './model.js';

export const RESEARCH_DEFAULT_STATE = Object.freeze({query:'',type:'all',language:'all',sort:'newest'});
const pathPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)*$/;
const repoNamePattern = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

function validPath(id) {
  return typeof id === 'string' && (id === '' || pathPattern.test(id));
}

export function folderUrl(id='') {
  if (!validPath(id)) throw new Error(`Invalid research folder path: ${String(id)}`);
  return `/github/stars/research/${id ? `${id}/` : ''}`;
}

function validateFolders(folders) {
  if (!Array.isArray(folders) || !folders.length) throw new Error('Research folders must include a root.');
  const byId = new Map();
  for (const folder of folders) {
    if (!folder || !validPath(folder.id) || typeof folder.label !== 'string' || !folder.label.trim() || typeof folder.description !== 'string') {
      throw new Error('Invalid research folder definition.');
    }
    if (byId.has(folder.id)) throw new Error(`Duplicate research folder path: ${folder.id}`);
    byId.set(folder.id,folder);
  }
  if (!byId.has('') || byId.get('').parent !== null) throw new Error('Research folders must have one root with a null parent.');
  for (const folder of folders) {
    if (folder.id !== '' && (typeof folder.parent !== 'string' || !byId.has(folder.parent))) {
      throw new Error(`Missing research parent for folder: ${folder.id}`);
    }
    const seen = new Set();
    let current = folder;
    while (current) {
      if (seen.has(current.id)) throw new Error(`Cycle in research folder tree: ${folder.id}`);
      seen.add(current.id);
      current = current.parent === null ? null : byId.get(current.parent);
    }
    if (folder.id !== '') {
      const expected = folder.id.includes('/') ? folder.id.slice(0,folder.id.lastIndexOf('/')) : '';
      if (folder.parent !== expected) throw new Error(`Research folder parent does not match its path: ${folder.id}`);
    }
  }
  return byId;
}

function validateRepo(repo,typeIds,categoryIds) {
  if (!repo || !Number.isSafeInteger(repo.id) || repo.id <= 0 || !repoNamePattern.test(repo.full_name || '') ||
      typeof repo.name !== 'string' || !repo.name || typeof repo.description !== 'string' ||
      !Array.isArray(repo.topics) || !repo.topics.every(topic=>typeof topic==='string') ||
      !(repo.language === null || typeof repo.language === 'string') || !Number.isFinite(repo.stars) || repo.stars < 0 ||
      !typeIds.has(repo.type) || !categoryIds.has(repo.category)) {
    throw new Error(`Missing or invalid research repository metadata: ${repo?.full_name || 'unknown'}`);
  }
  let url;
  try { url = new URL(repo.url); } catch { throw new Error(`Invalid research repository URL: ${repo.full_name}`); }
  if (url.origin !== 'https://github.com' || url.username || url.password || url.search || url.hash ||
      url.pathname.toLowerCase() !== `/${repo.full_name}`.toLowerCase()) {
    throw new Error(`Invalid research repository URL: ${repo.full_name}`);
  }
}

export function createResearchCatalog(starsCatalog,manifest,essentialsCache) {
  if (manifest?.version !== 1 || typeof manifest.title !== 'string' || !manifest.title.trim() ||
      typeof manifest.description !== 'string' || !Array.isArray(manifest.members) || !Array.isArray(manifest.essentials)) {
    throw new Error('Invalid research manifest.');
  }
  if (!Array.isArray(starsCatalog?.repos) || !Array.isArray(starsCatalog.types) || !Array.isArray(starsCatalog.categories) ||
      !Array.isArray(essentialsCache?.repos)) throw new Error('Missing research catalog metadata.');
  const folders = validateFolders(manifest.folders);
  const leafIds = new Set(manifest.folders.filter(folder=>!manifest.folders.some(child=>child.parent===folder.id)).map(folder=>folder.id));
  const typeIds = new Set(starsCatalog.types.map(type=>type.id));
  const categoryIds = new Set(starsCatalog.categories.map(category=>category.id));
  const starsById = new Map();
  for (const repo of starsCatalog.repos) {
    if (!Number.isSafeInteger(repo.id) || starsById.has(repo.id)) throw new Error('Duplicate or invalid starred repository ID.');
    starsById.set(repo.id,repo);
  }
  const essentialsByName = new Map();
  const essentialsById = new Map();
  const cachedIds = new Set();
  for (const repo of essentialsCache.repos) {
    validateRepo(repo,typeIds,categoryIds);
    const name = repo.full_name.toLowerCase();
    if (cachedIds.has(repo.id) || essentialsByName.has(name)) throw new Error('Duplicate research essential metadata.');
    cachedIds.add(repo.id);
    essentialsByName.set(name,repo);
    essentialsById.set(repo.id,repo);
  }
  const entries = new Map();
  function add(repo,membership,source) {
    validateRepo(repo,typeIds,categoryIds);
    if (!Array.isArray(membership.folders) || !membership.folders.length ||
        !membership.folders.every(id=>folders.has(id) && leafIds.has(id)) || typeof membership.note !== 'string') {
      throw new Error(`Invalid research folder membership: ${repo.full_name}`);
    }
    const existing = entries.get(repo.id);
    if (existing) {
      existing.folder_ids = [...new Set([...existing.folder_ids,...membership.folders])];
      if (membership.note && !existing.note.includes(membership.note)) existing.note = [existing.note,membership.note].filter(Boolean).join(' ');
      return;
    }
    entries.set(repo.id,{...repo,topics:[...repo.topics],folder_ids:[...new Set(membership.folders)],note:membership.note,source});
  }
  for (const member of manifest.members) {
    if (!member || !Number.isSafeInteger(member.repo_id) || !starsById.has(member.repo_id)) {
      throw new Error(`Missing starred research repository ID: ${member?.repo_id}`);
    }
    if (!repoNamePattern.test(member.full_name || '')) throw new Error('Invalid starred research membership name.');
    add(starsById.get(member.repo_id),member,'starred');
  }
  const essentialIds = new Set();
  for (const essential of manifest.essentials) {
    if (!essential || !repoNamePattern.test(essential.full_name || '') || !typeIds.has(essential.type) || !categoryIds.has(essential.category)) {
      throw new Error('Invalid research essential definition.');
    }
    const hasId = essential.repo_id !== undefined;
    if (hasId && (!Number.isSafeInteger(essential.repo_id) || essential.repo_id <= 0)) throw new Error('Invalid research essential ID.');
    const cached = hasId ? essentialsById.get(essential.repo_id) : essentialsByName.get(essential.full_name.toLowerCase());
    const starred = starsById.get(hasId ? essential.repo_id : cached?.id);
    if (!cached && !starred) throw new Error(`Missing research essential metadata: ${essential.full_name}`);
    const id = starred?.id || cached.id;
    if (essentialIds.has(id)) throw new Error(`Duplicate research essential ID: ${id}`);
    essentialIds.add(id);
    const repo = starred || {...cached,type:essential.type,category:essential.category,starred_at:null};
    add(repo,essential,starred?'starred':'essential');
  }
  return {
    title:manifest.title,
    description:manifest.description,
    fetched_at:essentialsCache.fetched_at || starsCatalog.fetched_at,
    folders:manifest.folders.map(folder=>({...folder})),
    types:starsCatalog.types,
    categories:starsCatalog.categories,
    repos:[...entries.values()],
  };
}

function getFolder(catalog,id) {
  const folder = catalog.folders.find(item=>item.id===id);
  if (!folder) throw new Error(`Unknown research folder: ${String(id)}`);
  return folder;
}

export function folderRepos(catalog,id='') {
  getFolder(catalog,id);
  const seen = new Set();
  return catalog.repos.filter(repo=> {
    if (seen.has(repo.id) || !repo.folder_ids.some(folderId=>id==='' || folderId===id || folderId.startsWith(`${id}/`))) return false;
    seen.add(repo.id);
    return true;
  });
}

export function folderChildren(catalog,id='') {
  getFolder(catalog,id);
  return catalog.folders.filter(folder=>folder.parent===id);
}

export function folderBreadcrumbs(catalog,id='') {
  const breadcrumbs = [];
  const seen = new Set();
  let folder = getFolder(catalog,id);
  while (folder) {
    if (seen.has(folder.id)) throw new Error('Cycle in research folder breadcrumbs.');
    seen.add(folder.id);
    breadcrumbs.unshift(folder);
    folder = folder.parent===null ? null : getFolder(catalog,folder.parent);
  }
  return breadcrumbs;
}

export function folderCount(catalog,id='') {
  return folderRepos(catalog,id).length;
}

export function researchStateFromSearch(search) {
  const {query,type,language,sort} = stateFromSearch(search);
  return {query,type,language,sort};
}

export function researchSearchFromState(state) {
  return searchFromState({...state,category:'all'});
}

export function filterResearchRepos(repos,{query='',type='all',language='all',sort='newest'}={}) {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/u).filter(Boolean);
  const matches = terms.length ? repos.filter(repo=> {
    const searchable = [repo.full_name,repo.description,repo.language,...repo.topics,repo.note].join(' ').toLocaleLowerCase();
    return terms.every(term=>searchable.includes(term));
  }) : repos;
  return filterRepos(matches,{query:'',type,language,sort,category:'all'});
}
