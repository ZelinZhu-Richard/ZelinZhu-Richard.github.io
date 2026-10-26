import { DEFAULT_STATE,filterRepos,groupByType,stateFromSearch,searchFromState } from './model.js';
import { renderTypeGroups } from './render.mjs';

const status = document.querySelector('#enhancement-status');
status.hidden=false;
try {
  const response = await fetch(new URL('./stars.json',import.meta.url));
  if (!response.ok) throw new Error('Snapshot unavailable');
  const catalog = await response.json();
  const input = document.querySelector('#repo-search');
  const purpose = document.querySelector('#purpose-filter');
  const language = document.querySelector('#language-filter');
  const sort = document.querySelector('#sort-filter');
  const clear = document.querySelector('#clear-search');
  const reset = document.querySelector('#reset-filters');
  const results = document.querySelector('#repository-results');
  const count = document.querySelector('#result-count');
  const navigation = document.querySelector('#pile-navigation');
  let state = stateFromSearch(location.search);
  let limits = {};
  function validate() {
    if (!catalog.categories.some(category=>category.id===state.category)) state.category='all';
    if (!catalog.types.some(item=>item.id===state.type)) state.type='all';
    if (![...language.options].some(option=>option.value===state.language)) state.language='all';
  }
  function syncControls() {
    input.value=state.query;purpose.value=state.category;language.value=state.language;sort.value=state.sort;
  }
  function render(updateURL=true) {
    validate();
    const filtered = filterRepos(catalog.repos,state);
    const groups = groupByType(filtered,catalog.types,catalog.categories);
    const overview = state.type==='all';
    const total = filtered.length;
    count.textContent=`${total.toLocaleString('en-US')} ${total===1?'repository':'repositories'} in ${groups.length} ${groups.length===1?'type':'types'}`;
    clear.hidden=!state.query;
    reset.hidden=!Object.keys(DEFAULT_STATE).some(key=>state[key]!==DEFAULT_STATE[key]);
    for (const link of navigation.querySelectorAll('[data-type]')) {
      if (link.dataset.type===state.type) link.setAttribute('aria-current','true');
      else link.removeAttribute('aria-current');
    }
    const displayLimits = state.category==='all' ? limits : {[state.category]:36,...limits};
    results.innerHTML=groups.length ? renderTypeGroups(groups,catalog.types,{overview,limits:displayLimits}) : '<div class="empty-state"><h2>No stars in this corner.</h2><p>Try a broader search, a different type or purpose, or reset your filters.</p><button type="button" data-reset="true">Reset all filters</button></div>';
    if (updateURL) history.replaceState(null,'',location.pathname+searchFromState(state));
  }
  function update(next) {state={...state,...next};limits={};render();}
  function selectGroup(type,category=state.category) {
    update({type,category});purpose.value=state.category;
    document.querySelector('#collection').scrollIntoView({block:'start',behavior:'instant'});
  }
  function resetAll() {state={...DEFAULT_STATE};limits={};syncControls();render();}
  input.addEventListener('input',()=>update({query:input.value}));
  document.querySelector('#search-form').addEventListener('submit',event=>{event.preventDefault();update({query:input.value});});
  purpose.addEventListener('change',()=>update({category:purpose.value}));
  language.addEventListener('change',()=>update({language:language.value}));
  sort.addEventListener('change',()=>update({sort:sort.value}));
  clear.addEventListener('click',()=>{input.value='';update({query:''});input.focus();});
  reset.addEventListener('click',resetAll);
  navigation.addEventListener('click',event=>{const link=event.target.closest('[data-type]');if(!link)return;event.preventDefault();selectGroup(link.dataset.type);});
  results.addEventListener('click',event=>{
    const purposeButton=event.target.closest('[data-open-purpose]');
    if(purposeButton) {selectGroup(purposeButton.dataset.type,purposeButton.dataset.purpose);return;}
    const typeButton=event.target.closest('[data-open-type]');
    if(typeButton) {selectGroup(typeButton.dataset.type);return;}
    if(event.target.closest('[data-reset]')) {resetAll();input.focus();return;}
    const more=event.target.closest('[data-more]');
    if(more) {
      const category=more.dataset.more;
      const firstNewIndex=limits[category] ?? (state.category==='all'?12:36);
      limits[category]=firstNewIndex+24;render(false);
      document.getElementById(`type-${more.dataset.type}-pile-${category}`)?.querySelectorAll('.repo-name')[firstNewIndex]?.focus();
    }
  });
  window.addEventListener('popstate',()=>{state=stateFromSearch(location.search);limits={};validate();syncControls();render(false);});
  validate();syncControls();render();
  document.querySelectorAll('.enhanced').forEach(element=>element.hidden=false);
  status.hidden=true;
} catch (error) {
  status.textContent='Search and filters could not load. Browse the full collection below, or reload to try again.';
}
