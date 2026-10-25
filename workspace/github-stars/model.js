export const DEFAULT_STATE = Object.freeze({query:'',category:'all',type:'all',language:'all',sort:'newest'});
const SORTS = ['newest','popular','updated','name'];

export function stateFromSearch(search) {
  const params = new URLSearchParams(search);
  return {
    query: (params.get('q') || '').slice(0,300),
    category: params.get('pile') || 'all',
    type: params.get('type') || 'all',
    language: params.get('language') || 'all',
    sort: SORTS.includes(params.get('sort')) ? params.get('sort') : 'newest',
  };
}

export function searchFromState(state) {
  const params = new URLSearchParams();
  for (const [key,param] of [['query','q'],['category','pile'],['type','type'],['language','language'],['sort','sort']]) {
    if (state[key] && state[key] !== DEFAULT_STATE[key]) params.set(param,state[key]);
  }
  return params.size ? `?${params}` : '';
}

export function filterRepos(repos, {query='',category='all',type='all',language='all',sort='newest'} = {}) {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/u).filter(Boolean);
  const filtered = repos.filter(repo =>
    (category === 'all' || repo.category === category) &&
    (type === 'all' || repo.type === type) &&
    (language === 'all' || (repo.language || 'Unspecified') === language) &&
    (!terms.length || terms.every(term => [repo.full_name,repo.description,repo.language,...repo.topics].join(' ').toLocaleLowerCase().includes(term)))
  );
  const date = value => Date.parse(value) || 0;
  return filtered.sort((a,b) => {
    let compared = 0;
    if (sort === 'popular') compared = b.stars - a.stars;
    else if (sort === 'updated') compared = date(b.pushed_at) - date(a.pushed_at);
    else if (sort === 'name') compared = a.full_name.localeCompare(b.full_name);
    else compared = date(b.starred_at) - date(a.starred_at);
    return compared || a.full_name.localeCompare(b.full_name);
  });
}

export function groupRepos(repos, categories) {
  return categories.map(category => ({...category,repos:repos.filter(repo => repo.category === category.id)})).filter(group => group.repos.length);
}
