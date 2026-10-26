export const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
export const arrow = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M6 18 18 6M6 6h12v12"/></svg>';
export const star = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9Z"/></svg>';
export const TYPE_LABELS = Object.freeze({
  application:'Applications',
  library:'Libraries & frameworks',
  cli:'CLI & developer tools',
  skill:'Agent skills & plugins',
  resource:'Learning & resources',
  model:'Models & datasets',
  research:'Research & experiments',
});
export const TYPE_DESCRIPTIONS = Object.freeze({
  application:'Ready-to-use apps, editors, and services, grouped by what they help you do.',
  library:'Reusable code and frameworks, organized by where they fit in a project.',
  cli:'Command-line tools and developer utilities, arranged by the work they support.',
  skill:'Skills and plugins that extend agents, grouped by the task they help with.',
  resource:'Courses, guides, and reference collections, arranged by subject and use.',
  model:'Models and datasets, grouped by the problems they address.',
  research:'Research implementations and experiments, organized by field and purpose.',
});
export function repoRow(repo,types) {
  const type = types.find(type => type.id === repo.type)?.label || repo.type;
  return `<li class="repo-row"><div class="repo-copy"><a class="repo-name" href="${escape(repo.url)}" target="_blank" rel="noopener noreferrer"><span class="repo-owner">${escape(repo.full_name.split('/')[0])} / </span><span>${escape(repo.name)}</span>${arrow}</a><p dir="auto">${escape(repo.description || 'No description provided on GitHub.')}</p><div class="repo-meta"><span>${escape(repo.language || 'Language unspecified')}</span><span class="repo-stars">${star}${repo.stars.toLocaleString('en-US')}<span class="sr-only"> GitHub stars</span></span>${repo.archived ? '<span class="archived">Archived</span>' : ''}${repo.topics.slice(0,2).map(topic => `<span class="repo-topic">${escape(topic)}</span>`).join('')}</div></div><span class="repo-type">${escape(type)}</span></li>`;
}

export function renderTypeGroups(groups,types,{overview=false,limits={},staticContent=false}={}) {
  return groups.map(group => {
    const typeId = escape(group.id);
    const typeLabel = TYPE_LABELS[group.id] || group.label;
    const openType = overview && !staticContent ? `<button class="view-pile" data-type="${typeId}" data-open-type="true" type="button">View all ${group.repos.length}<span class="sr-only"> ${escape(typeLabel)}</span><span aria-hidden="true"> →</span></button>` : '';
    const purposes = group.purposes.map(purpose => {
      const purposeId = escape(purpose.id);
      const id = `type-${typeId}-pile-${purposeId}`;
      const requested = Number(limits[purpose.id]);
      const limit = staticContent ? Infinity : overview ? 1 : Number.isFinite(requested) && requested > 0 ? Math.floor(requested) : 12;
      const shown = purpose.repos.slice(0,limit);
      const remaining = purpose.repos.length - shown.length;
      const openPurpose = overview && remaining && !staticContent ? `<button class="view-pile" data-type="${typeId}" data-purpose="${purposeId}" data-open-purpose="true" type="button">View all ${purpose.repos.length}<span class="sr-only"> in ${escape(purpose.label)} · ${escape(typeLabel)}</span><span aria-hidden="true"> →</span></button>` : '';
      const more = !overview && remaining && !staticContent ? `<button class="load-more" data-type="${typeId}" data-more="${purposeId}" type="button">Show ${Math.min(24,remaining)} more <span>(${remaining} remaining)</span><span class="sr-only"> in ${escape(purpose.label)} · ${escape(typeLabel)}</span></button>` : '';
      return `<section class="repo-pile" id="${id}" aria-labelledby="${id}-heading"><div class="pile-heading"><div><h3 id="${id}-heading">${escape(purpose.label)} <span>${purpose.repos.length}</span></h3><p>${escape(purpose.description)}</p></div>${openPurpose}</div><ul class="repo-list">${shown.map(repo=>repoRow(repo,types)).join('')}</ul>${more}</section>`;
    }).join('');
    return `<section class="repo-type-group" id="type-${typeId}" aria-labelledby="type-heading-${typeId}"><div class="type-heading"><div><h2 id="type-heading-${typeId}">${escape(typeLabel)} <span>${group.repos.length}</span></h2><p>${escape(TYPE_DESCRIPTIONS[group.id] || group.description || '')}</p></div>${openType}</div><div class="type-purpose-list">${purposes}</div></section>`;
  }).join('');
}
