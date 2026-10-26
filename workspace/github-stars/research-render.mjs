import { escape,arrow,repoRow } from './render.mjs';
import { folderUrl,folderChildren,folderBreadcrumbs,folderCount } from './research-model.js';

export const folderIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M3 7V5a1 1 0 0 1 1-1h5l2 3h9a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1Z"/></svg>';
const chevron = '<svg class="tree-chevron" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="m6 3 5 5-5 5"/></svg>';

export function collectionNavigation(active='all') {
  return `<nav class="collection-views" aria-label="Collection views"><a href="/github/stars/"${active==='all'?' aria-current="page"':''}>All Stars</a><a href="/github/stars/research/"${active==='research'?' aria-current="page"':''}>${folderIcon}Research Stack</a></nav>`;
}

function treeLink(catalog,folder,current,label=folder.label) {
  return `<a class="tree-link" data-folder-link="${escape(folder.id)}" href="${folderUrl(folder.id)}"${folder.id===current?' aria-current="page"':''}><span>${escape(label)}</span><span class="folder-count">${folderCount(catalog,folder.id)}</span></a>`;
}

export function renderFolderTree(catalog,current='') {
  const root=catalog.folders.find(folder=>folder.id==='');
  function branch(folder) {
    const children=folderChildren(catalog,folder.id);
    if(!children.length) return `<li>${treeLink(catalog,folder,current)}</li>`;
    const selected=current===folder.id || current.startsWith(`${folder.id}/`);
    const open=selected || (current==='' && folder.id==='general');
    return `<li><details class="tree-branch"${open?' open':''}><summary${selected?' class="contains-current"':''}>${chevron}<span>${escape(folder.label)}</span><span class="folder-count">${folderCount(catalog,folder.id)}</span></summary><ul><li>${treeLink(catalog,folder,current,`All ${folder.label}`)}</li>${children.map(branch).join('')}</ul></details></li>`;
  }
  return `<details class="research-tree-disclosure" open><summary>Browse folders<span class="disclosure-hint">Expand or collapse</span></summary><nav aria-label="Research folders">${treeLink(catalog,root,current,'All research tools')}<ul class="folder-tree">${folderChildren(catalog,'').map(branch).join('')}</ul></nav></details>`;
}

export function renderBreadcrumbs(catalog,current='') {
  return `<nav class="research-breadcrumbs" aria-label="Breadcrumb"><ol>${folderBreadcrumbs(catalog,current).map((folder,index,array)=>`<li>${index===array.length-1?`<span aria-current="page">${escape(folder.label)}</span>`:`<a data-folder-link="${escape(folder.id)}" href="${folderUrl(folder.id)}">${escape(folder.label)}</a><span aria-hidden="true">/</span>`}</li>`).join('')}</ol></nav>`;
}

export function renderChildFolders(catalog,current='') {
  const children=folderChildren(catalog,current);
  if(!children.length) return '';
  return `<section class="child-folders" aria-labelledby="child-folders-heading"><h2 id="child-folders-heading">Explore folders</h2><ul>${children.map(folder=>`<li><a data-folder-link="${escape(folder.id)}" href="${folderUrl(folder.id)}">${folderIcon}<span class="child-folder-copy"><strong>${escape(folder.label)}</strong><span>${escape(folder.description)}</span></span><span class="folder-count">${folderCount(catalog,folder.id)}<span class="sr-only"> tools</span></span>${arrow}</a></li>`).join('')}</ul></section>`;
}

export function researchRepoRow(repo,types) {
  return repoRow(repo,types,{research:true});
}

export function renderResearchRows(repos,types) {
  return repos.map(repo=>researchRepoRow(repo,types)).join('');
}
