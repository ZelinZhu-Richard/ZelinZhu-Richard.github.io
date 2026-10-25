import { DEFAULT_STATE,filterRepos,groupRepos,stateFromSearch,searchFromState } from './model.js';
import { escape,repoRow } from './render.mjs';

const status = document.querySelector('#enhancement-status');
status.hidden=false;
try {
  const response = await fetch(new URL('./stars.json',import.meta.url));
  if (!response.ok) throw new Error('Snapshot unavailable');
  const catalog = await response.json();
  const input = document.querySelector('#repo-search');
  const type = document.querySelector('#type-filter');
  const language = document.querySelector('#language-filter');
  const sort = document.querySelector('#sort-filter');
  const clear = document.querySelector('#clear-search');
  const reset = document.querySelector('#reset-filters');
  const results = document.querySelector('#repository-results');
  const count = document.querySelector('#result-count');
  const navigation = document.querySelector('#pile-navigation');
  let state = stateFromSearch(location.search);
  let visible = 36;
  function validate() {
    if (!catalog.categories.some(category=>category.id===state.category)) state.category='all';
    if (!catalog.types.some(item=>item.id===state.type)) state.type='all';
    if (![...language.options].some(option=>option.value===state.language)) state.language='all';
  }
  function syncControls() {
    input.value=state.query;type.value=state.type;language.value=state.language;sort.value=state.sort;
  }
  function render(updateURL=true) {
    validate();
    const filtered = filterRepos(catalog.repos,state);
    const groups = groupRepos(filtered,catalog.categories);
    const allPiles = state.category==='all';
    const limit = allPiles ? 4 : visible;
    const total = filtered.length;
    count.textContent=`${total.toLocaleString('en-US')} ${total===1?'repository':'repositories'}${allPiles ? ` in ${groups.length} ${groups.length===1?'pile':'piles'}` : ''}`;
    clear.hidden=!state.query;
    reset.hidden=!Object.keys(DEFAULT_STATE).some(key=>state[key]!==DEFAULT_STATE[key]);
    for (const link of navigation.querySelectorAll('[data-category]')) {
      if (link.dataset.category===state.category) link.setAttribute('aria-current','true');
      else link.removeAttribute('aria-current');
    }
    results.innerHTML=groups.length ? groups.map(group=>{
      const shown = group.repos.slice(0,limit);
      const remaining = group.repos.length-shown.length;
      return `<section class="repo-pile" id="pile-${escape(group.id)}" aria-labelledby="heading-${escape(group.id)}"><div class="pile-heading"><div><h2 id="heading-${escape(group.id)}">${escape(group.label)} <span>${group.repos.length}</span></h2><p>${escape(group.description)}</p></div>${allPiles && remaining ? `<button class="view-pile" data-pile="${escape(group.id)}" type="button">View all ${group.repos.length}<span class="sr-only"> in ${escape(group.label)}</span><span aria-hidden="true"> →</span></button>`:''}</div><ul class="repo-list">${shown.map(repo=>repoRow(repo,catalog.types)).join('')}</ul>${!allPiles && remaining ? `<button class="load-more" type="button" data-more="true">Show ${Math.min(36,remaining)} more <span>(${remaining} remaining)</span></button>`:''}</section>`;
    }).join('') : '<div class="empty-state"><h2>No stars in this corner.</h2><p>Try a broader search, a different pile, or reset your filters.</p><button type="button" data-reset="true">Reset all filters</button></div>';
    if (updateURL) history.replaceState(null,'',location.pathname+searchFromState(state));
  }
  function update(next) {state={...state,...next};visible=36;render();}
  function selectPile(category) {update({category});document.querySelector('#collection').scrollIntoView({block:'start',behavior:'instant'});}
  function resetAll() {state={...DEFAULT_STATE};visible=36;syncControls();render();}
  input.addEventListener('input',()=>update({query:input.value}));
  document.querySelector('#search-form').addEventListener('submit',event=>{event.preventDefault();update({query:input.value});});
  type.addEventListener('change',()=>update({type:type.value}));
  language.addEventListener('change',()=>update({language:language.value}));
  sort.addEventListener('change',()=>update({sort:sort.value}));
  clear.addEventListener('click',()=>{input.value='';update({query:''});input.focus();});
  reset.addEventListener('click',resetAll);
  navigation.addEventListener('click',event=>{const link=event.target.closest('[data-category]');if(!link)return;event.preventDefault();selectPile(link.dataset.category);});
  results.addEventListener('click',event=>{
    const pile=event.target.closest('[data-pile]');
    if(pile) {selectPile(pile.dataset.pile);return;}
    if(event.target.closest('[data-reset]')) {resetAll();input.focus();return;}
    if(event.target.closest('[data-more]')) {
      const firstNewIndex=visible;visible+=36;render(false);
      results.querySelectorAll('.repo-name')[firstNewIndex]?.focus();
    }
  });
  window.addEventListener('popstate',()=>{state=stateFromSearch(location.search);visible=36;validate();syncControls();render(false);});
  validate();syncControls();render();
  document.querySelectorAll('.enhanced').forEach(element=>element.hidden=false);
  status.hidden=true;
} catch (error) {
  status.textContent='Search and filters could not load. Browse the full collection below, or reload to try again.';
}
