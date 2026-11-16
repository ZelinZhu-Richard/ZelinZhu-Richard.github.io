const map = document.querySelector('[data-choices]');

// Keep the shared animation control in the map toolbar on this long reading
// page. Observe body children because the background can start after this module
// or reattach its existing button when returning through browser history.
const motionControls = map?.querySelector('.map-controls');
if (motionControls) {
  const placeMotionControl = () => {
    const button = document.querySelector('body > .sharks-toggle');
    if (button) motionControls.append(button);
  };
  placeMotionControl();
  new MutationObserver(placeMotionControl).observe(document.body, { childList: true });
}

if (map) {
  const viewport = map.querySelector('.tree-viewport');
  const toggles = [...map.querySelectorAll('.branch-toggle')];
  const views = [...map.querySelectorAll('[data-view-button]')];
  const expandAll = map.querySelector('[data-expand-all]');
  const collapseAll = map.querySelector('[data-collapse-all]');
  const announcement = map.querySelector('[role="status"]');
  const help = map.querySelector('#map-help');
  const narrowScreen = window.matchMedia('(max-width: 760px)');
  let viewChosen = false;

  function updateControls() {
    expandAll.disabled = toggles.every(button => button.getAttribute('aria-expanded') === 'true');
    collapseAll.disabled = toggles.every(button => button.getAttribute('aria-expanded') === 'false');
  }

  function setExpanded(button, expanded) {
    const children = document.getElementById(button.getAttribute('aria-controls'));
    children.hidden = !expanded;
    button.setAttribute('aria-expanded', String(expanded));
    button.setAttribute('aria-label', `${expanded ? 'Collapse' : 'Expand'} ${button.dataset.title}`);
    button.closest('.choice-branch').classList.toggle('is-collapsed', !expanded);
  }

  function setView(view) {
    map.dataset.view = view;
    for (const button of views) button.setAttribute('aria-pressed', String(button.dataset.viewButton === view));
    help.textContent = view === 'map'
      ? 'Read from left to right. Scroll sideways if needed; use the branch buttons to explore.'
      : 'Follow the indented paths. Use the branch buttons to expand or collapse possibilities.';
    viewport.scrollLeft = 0;
  }

  for (const button of toggles) {
    button.hidden = false;
    if (button.hasAttribute('data-start-collapsed')) setExpanded(button, false);
    button.addEventListener('click', () => {
      const expanded = button.getAttribute('aria-expanded') !== 'true';
      setExpanded(button, expanded);
      updateControls();
      announcement.textContent = `${button.dataset.title} ${expanded ? 'expanded' : 'collapsed'}.`;
    });
  }
  for (const button of views) button.addEventListener('click', () => {
    viewChosen = true;
    setView(button.dataset.viewButton);
  });
  narrowScreen.addEventListener('change', () => {
    if (!viewChosen) setView(narrowScreen.matches ? 'outline' : 'map');
  });
  for (const [control, expanded] of [[expandAll, true], [collapseAll, false]]) {
    control.addEventListener('click', () => {
      for (const button of toggles) setExpanded(button, expanded);
      // Move focus to the inverse action before disabling the clicked control.
      (expanded ? collapseAll : expandAll).disabled = false;
      (expanded ? collapseAll : expandAll).focus({ preventScroll: true });
      updateControls();
      announcement.textContent = expanded ? 'All paths expanded.' : 'All branches collapsed. The main directions remain visible.';
    });
  }

  map.classList.add('is-enhanced');
  map.querySelector('.map-controls').hidden = false;
  setView(narrowScreen.matches ? 'outline' : 'map');
  updateControls();
}

// The guide stays readable without JavaScript. Enhancement narrows one school
// and opportunity category at a time, preserving native disclosure controls.
const schoolButtons = [...document.querySelectorAll('[data-school-button]')];
const schoolPanels = [...document.querySelectorAll('[data-school-panel]')];
const opportunityButtons = [...document.querySelectorAll('[data-opportunity-filter]')];
const opportunityRows = [...document.querySelectorAll('[data-opportunity-kind]')];
const opportunityCount = document.querySelector('[data-opportunity-count]');

function selectSchool(id) {
  if (!schoolPanels.some(panel => panel.dataset.schoolPanel === id)) return;
  for (const panel of schoolPanels) panel.hidden = panel.dataset.schoolPanel !== id;
  for (const button of schoolButtons) button.setAttribute('aria-pressed', String(button.dataset.schoolButton === id));
}

function filterOpportunities(kind) {
  let count = 0;
  for (const row of opportunityRows) {
    const visible = kind === 'all' || row.dataset.opportunityKind === kind;
    row.hidden = !visible;
    if (visible) count += 1;
  }
  for (const button of opportunityButtons) button.setAttribute('aria-pressed', String(button.dataset.opportunityFilter === kind));
  if (opportunityCount) opportunityCount.textContent = `${count} ${count === 1 ? 'opportunity' : 'opportunities'}`;
}

function revealGuideTarget(hash) {
  let id;
  try { id = decodeURIComponent(hash.replace(/^#/, '')); } catch { return; }
  const target = document.getElementById(id);
  if (!target) return;
  const school = target.closest('[data-school-panel]');
  if (school) selectSchool(school.dataset.schoolPanel);
  const opportunity = target.closest('[data-opportunity-kind]');
  if (opportunity?.hidden) filterOpportunities('all');
  for (let element = target; element; element = element.parentElement) {
    if (element.tagName === 'DETAILS') element.open = true;
  }
  return target;
}

if (schoolPanels.length) {
  document.querySelector('[data-school-controls]').hidden = false;
  for (const button of schoolButtons) button.addEventListener('click', () => selectSchool(button.dataset.schoolButton));
  selectSchool(schoolPanels[0].dataset.schoolPanel);
}
if (opportunityRows.length) {
  document.querySelector('[data-opportunity-controls]').hidden = false;
  for (const button of opportunityButtons) button.addEventListener('click', () => filterOpportunities(button.dataset.opportunityFilter));
}

document.addEventListener('click', event => {
  const link = event.target instanceof Element ? event.target.closest('a[href^="#"]') : null;
  if (link) revealGuideTarget(link.getAttribute('href'));
});
window.addEventListener('hashchange', () => {
  // Revealing a hidden school changes the page height. Reposition after that
  // change so the fragment lands on the requested section, not its old offset.
  revealGuideTarget(location.hash)?.scrollIntoView({ block: 'start' });
});
if (location.hash) {
  revealGuideTarget(location.hash)?.scrollIntoView({ block: 'start' });
}
