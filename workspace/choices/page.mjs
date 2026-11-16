import { CHOICES, CONTENT_NOTE } from './plans.mjs';
import { renderGuide } from './guide.mjs';

const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const minus = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8h10"/><path class="toggle-vertical" d="M8 3v10"/></svg>';
const arrow = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 10h13m-5-5 5 5-5 5"/></svg>';

export function renderTree(root) {
  const ids = new Set();
  function node(item, depth = 0) {
    if (!item || typeof item.id !== 'string' || !/^[a-z][a-z0-9-]*$/.test(item.id) || ids.has(item.id)) {
      throw new Error('Choices nodes need unique lowercase ids, using letters, numbers, and hyphens.');
    }
    ids.add(item.id);
    const children = item.children || [];
    const hasChildren = children.length > 0;
    const toggle = hasChildren && depth > 0
      ? `<button class="branch-toggle" type="button" aria-expanded="true" aria-controls="children-${item.id}" aria-label="Collapse ${escape(item.title)}" data-title="${escape(item.title)}"${item.collapsed ? ' data-start-collapsed' : ''} hidden>${minus}</button>`
      : '';
    return `<li class="choice-branch${depth === 0 ? ' choice-root' : ''}">
      <div class="choice-node${hasChildren ? ' choice-node--branch' : ' choice-node--leaf'}" id="node-${item.id}">
        ${item.status ? `<span class="node-status">${escape(item.status)}</span>` : ''}
        <div class="node-heading"><h3>${escape(item.title)}</h3>${toggle}</div>
        <p class="node-description">${escape(item.description || '')}</p>
        ${item.nextStep ? `<p class="node-next"><span>Next step</span>${escape(item.nextStep)}</p>` : ''}
        ${item.href && /^(https:\/\/|#[a-z][a-z0-9-]*$)/.test(item.href) ? `<a class="node-source" href="${escape(item.href)}"${item.href.startsWith('https:') ? ' target="_blank" rel="noopener noreferrer"' : ''}>${escape(item.linkLabel || 'Official details')}${arrow}</a>` : ''}
        ${hasChildren && depth > 0 ? `<span class="branch-count" aria-hidden="true">${children.length} possible paths</span>` : ''}
      </div>
      ${hasChildren ? `<ul class="tree-children" id="children-${item.id}" aria-label="Paths from ${escape(item.title)}">${children.map(child => node(child, depth + 1)).join('')}</ul>` : ''}
    </li>`;
  }
  return `<ul class="choice-tree" aria-label="Future paths">${node(root)}</ul>`;
}

export const choicesPage = `
<section class="choices-intro" aria-labelledby="choices-title">
  <div><h1 id="choices-title">Choices</h1><p class="choices-lede">Ambitious paths, with a way to get there.</p></div>
  <p class="choices-description">From senior spring to courses, research, internships, and a career—or a company. A closer look at UNC and Duke connects marketing, AI safety, and evaluation with what to study and build.</p>
</section>
<nav class="choices-index" aria-label="Planning sections">
  <a href="#map-title">Decision map</a><a href="#schools">Course plans</a><a href="#transfer-plans">UNC → Stanford</a><a href="#career-lanes">Careers</a><a href="#internships">Internships</a><a href="#alternatives">Fellowships</a><a href="#study-fields">Fields of study</a><a href="#funding">Funding memo</a>
</nav>
<section class="choices-map" aria-labelledby="map-title" data-choices data-view="map">
  <div class="map-toolbar">
    <h2 id="map-title">My possible paths</h2>
    <div class="map-controls" hidden>
      <div class="view-switch" role="group" aria-label="View layout">
        <button type="button" data-view-button="map" aria-pressed="true">Map</button>
        <button type="button" data-view-button="outline" aria-pressed="false">Outline</button>
      </div>
      <button class="expand-control" type="button" data-expand-all>Expand all</button>
      <button class="expand-control" type="button" data-collapse-all>Collapse branches</button>
    </div>
  </div>
  <div class="map-caption"><p id="map-help">Read from left to right. Each branch opens another possibility.</p><span class="map-direction" aria-hidden="true">Now ${arrow} Possibilities</span></div>
  <div class="tree-viewport" tabindex="0" role="region" aria-label="Decision tree" aria-describedby="map-help">
    ${renderTree(CHOICES)}
  </div>
  <div class="map-footnote"><p>${CONTENT_NOTE}</p><span>Unlisted · November 2026</span></div>
  <p class="choices-announcement" role="status" aria-live="polite" aria-atomic="true"></p>
</section>
${renderGuide()}`;
