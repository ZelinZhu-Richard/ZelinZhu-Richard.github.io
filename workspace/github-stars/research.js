import { folderRepos,researchStateFromSearch,researchSearchFromState,filterResearchRepos } from './research-model.js';
import { renderResearchRows } from './research-render.mjs';
const status=document.querySelector('#research-status');
status.hidden=false;
try {
  const response=await fetch(new URL('./research.json',import.meta.url));
  if(!response.ok) throw new Error('Research collection unavailable');
  const catalog=await response.json();
  const folder=document.body.dataset.researchFolder||'';
  const repos=folderRepos(catalog,folder);
  const query=document.querySelector('#research-query');
  const type=document.querySelector('#research-type');
  const language=document.querySelector('#research-language');
  const sort=document.querySelector('#research-sort');
  const count=document.querySelector('#research-count');
  const results=document.querySelector('#research-results');
  const reset=document.querySelector('#research-reset');
  const clear=document.querySelector('#research-clear');
  let state=researchStateFromSearch(location.search);
  let visible=36;
  const defaults={query:'',type:'all',language:'all',sort:'newest'};
  function validate() {
    if(!catalog.types.some(item=>item.id===state.type)) state.type='all';
    if(![...language.options].some(option=>option.value===state.language)) state.language='all';
  }
  function syncControls() {query.value=state.query;type.value=state.type;language.value=state.language;sort.value=state.sort;}
  function render(updateURL=true) {
    validate();
    const matches=filterResearchRepos(repos,state);
    const shown=matches.slice(0,visible);
    const remaining=matches.length-shown.length;
    count.textContent=`${matches.length} ${matches.length===1?'tool':'tools'}${matches.length?` · showing ${shown.length}`:''}`;
    reset.hidden=!Object.keys(defaults).some(key=>state[key]!==defaults[key]);
    clear.hidden=!state.query;
    results.innerHTML=matches.length?`<ul class="repo-list">${renderResearchRows(shown,catalog.types)}</ul>${remaining?`<button type="button" class="load-more" data-research-more>Show ${Math.min(36,remaining)} more <span>(${remaining} remaining)</span></button>`:''}`:'<div class="empty-state"><h3>No tools match these filters.</h3><p>Try another search or reset your filters. You can also choose a broader folder.</p><button type="button" data-research-reset>Reset filters</button></div>';
    const search=researchSearchFromState(state);
    for(const link of document.querySelectorAll('[data-folder-link]')) {
      const url=new URL(link.href,location.origin);link.href=url.pathname+search;
    }
    if(updateURL) history.replaceState(null,'',location.pathname+search);
  }
  function update(next) {state={...state,...next};visible=36;render();}
  function resetFilters() {state={...defaults};visible=36;syncControls();render();}
  query.addEventListener('input',()=>update({query:query.value}));
  document.querySelector('#research-search-form').addEventListener('submit',event=>{event.preventDefault();update({query:query.value});});
  type.addEventListener('change',()=>update({type:type.value}));
  language.addEventListener('change',()=>update({language:language.value}));
  sort.addEventListener('change',()=>update({sort:sort.value}));
  clear.addEventListener('click',()=>{query.value='';update({query:''});query.focus();});
  reset.addEventListener('click',resetFilters);
  results.addEventListener('click',event=>{
    if(event.target.closest('[data-research-reset]')) {resetFilters();query.focus();return;}
    if(event.target.closest('[data-research-more]')) {const firstNew=visible;visible+=36;render(false);results.querySelectorAll('.repo-name')[firstNew]?.focus();}
  });
  window.addEventListener('popstate',()=>{state=researchStateFromSearch(location.search);visible=36;validate();syncControls();render(false);});
  const disclosure=document.querySelector('.research-tree-disclosure');
  const mobile=matchMedia('(max-width:800px)');
  function adaptTree() {disclosure.open=!mobile.matches;}
  mobile.addEventListener('change',adaptTree);adaptTree();
  validate();syncControls();render();
  document.querySelectorAll('.enhanced').forEach(element=>element.hidden=false);
  status.hidden=true;
} catch(error) {
  status.textContent='Search and filters could not load. All tools in this folder are still listed below. Reload to try again.';
}
