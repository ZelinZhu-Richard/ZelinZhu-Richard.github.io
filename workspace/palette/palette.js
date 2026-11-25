// Command palette. Cmd/Ctrl+K, "/" or the header's Search button opens a dialog that lists every page,
// project and link on the site. The list (index.js) is fetched when it is first needed, not on page load.
import { search } from './search.js';

export const countLabel = n => (n === 1 ? '1 result' : n ? `${n} results` : 'No results');

/** What a keydown means for the palette: 'toggle', 'open' or null. */
export function shortcut(event, { typing = false, dialogOpen = false } = {}) {
  if (event.defaultPrevented || event.isComposing) return null;
  const command = event.metaKey || event.ctrlKey;
  const key = String(event.key);
  // On a Cyrillic or Greek layout the K key types another letter; there the physical key decides.
  const k = key.toLowerCase() === 'k' || (event.code === 'KeyK' && !/^[a-z]$/i.test(key));
  if (command && !event.altKey && !event.shiftKey && k) return 'toggle';
  // Shift is not checked: several keyboard layouts need it to type "/".
  if (event.key === '/' && !command && !event.altKey && !typing && !dialogOpen) return 'open';
  return null;
}

/** Where the selection lands for a list key, wrapping at both ends; null for any other key. */
export function moveTo(key, selected, length) {
  if (!length) return null;
  if (key === 'ArrowDown') return selected >= length - 1 ? 0 : selected + 1;
  if (key === 'ArrowUp') return selected <= 0 ? length - 1 : selected - 1;
  if (key === 'Home') return 0;
  if (key === 'End') return length - 1;
  return null;
}

/** Items in order, split where the group name changes: [[name, items], ...]. */
export function byGroup(items) {
  const groups = [];
  for (const item of items) {
    if (groups.at(-1)?.[0] !== item.group) groups.push([item.group, []]);
    groups.at(-1)[1].push(item);
  }
  return groups;
}

/** The entries that do something instead of opening a link. `sharks` is the pause button's text, '' when the page has none. */
export function actionItems(index, sharks) {
  const mail = index.find(item => item.href.startsWith('mailto:'));
  const actions = [];
  if (mail) actions.push({ group: 'Actions', id: 'copy-email', title: 'Copy email address', hint: 'Puts my address on your clipboard.', keywords: 'mail contact clipboard', address: mail.href.slice('mailto:'.length).split('?')[0] });
  if (sharks) actions.push({ group: 'Actions', id: 'sharks', title: /pause/i.test(sharks) ? 'Pause the sharks' : 'Resume the sharks', hint: 'The ASCII sharks that swim behind the page.', keywords: 'background animation motion' });
  return actions;
}

function start() {
  // Without <dialog> the Search button stays what the build wrote: a link to the full list.
  if (typeof HTMLDialogElement !== 'function' || !HTMLDialogElement.prototype.showModal) return;
  const root = document.documentElement;
  // /about/index.html is the same page as /about/.
  const page = location.pathname.replace(/index\.html$/, '');
  let loading, dialog, input, list, empty, count;
  let items = [], shown = [], options = [];
  let selected = -1, ready = false, opener = null, overflow = '', pointer = '', pressedOutside = false;

  const el = (tag, attributes = {}, ...children) => {
    const node = document.createElement(tag);
    for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
    node.append(...children);
    return node;
  };

  // A failed fetch is forgotten, so the next open tries again.
  const load = () => (loading ||= import('./index.js').then(module => module.INDEX, () => { loading = undefined; return null; }));

  const select = (n, scroll = true) => {
    options[selected]?.setAttribute('aria-selected', 'false');
    selected = n;
    const node = options[n];
    if (!node) { input.removeAttribute('aria-activedescendant'); return; }
    node.setAttribute('aria-selected', 'true');
    input.setAttribute('aria-activedescendant', node.id);
    if (!scroll) return;
    node.scrollIntoView({ block: 'nearest' });
    // The first row sits under its group label; show the label too.
    if (n === 0) list.scrollTop = 0;
  };

  const option = (item, n, flat) => {
    const here = item.href === page;
    const shared = { class: 'palette-option', role: 'option', id: `palette-option-${n}`, 'aria-selected': 'false', tabindex: '-1' };
    const node = item.href ? el('a', { ...shared, href: item.href }) : el('button', { ...shared, type: 'button' });
    if (item.external) { node.target = '_blank'; node.rel = 'noopener noreferrer'; }
    if (here) node.setAttribute('aria-current', 'page');
    const meta = el('span', { class: 'palette-meta' }, here ? 'here' : flat ? item.group : '');
    // The same pair as on the rest of the site: the arrow for the eye, the words for a screen reader.
    if (item.external) meta.append(flat ? ' ' : '', el('span', { 'aria-hidden': 'true' }, '↗'), el('span', { class: 'visually-hidden' }, ' (opens in a new tab)'));
    // The spaces keep the parts apart when a screen reader reads the row as one name.
    node.append(el('span', { class: 'palette-label', 'aria-hidden': 'true' }, item.label || ''), el('span', { class: 'palette-title' }, item.title), ' ', el('span', { class: 'palette-hint' }, item.hint), ' ', meta);
    return node;
  };

  const render = () => {
    const query = input.value.trim();
    shown = search(items, query);
    options = shown.map((item, n) => option(item, n, Boolean(query)));
    let n = 0;
    list.replaceChildren(...(query ? options : byGroup(shown).map(([name, group]) =>
      el('div', { role: 'group', 'aria-label': name }, el('div', { class: 'palette-group', 'aria-hidden': 'true' }, name), ...group.map(() => options[n++])))));
    empty.textContent = `Nothing matches “${query}”.`;
    empty.hidden = shown.length > 0;
    count.textContent = query ? countLabel(shown.length) : '';
    selected = -1;
    select(shown.length ? 0 : -1);
  };

  // Runs for every way the dialog can close, sometimes twice, so it must be safe to repeat.
  const settle = () => {
    if (dialog.open) return;
    root.style.overflow = overflow;
    // Safari does not focus a link when it is clicked, so the dialog cannot hand focus back by itself.
    // What had focus may be gone by now (a menu link, once the menu has closed): then Search takes it.
    const back = opener && opener.isConnected && opener.getClientRects?.().length !== 0 ? opener : opener && document.querySelector('[data-palette-open]');
    if (back) back.focus({ preventScroll: true });
    opener = null;
  };
  const close = () => {
    if (!dialog?.open) return;
    dialog.close();
    settle();
  };

  const copyEmail = async (node, address) => {
    const hint = node.querySelector('.palette-hint');
    try {
      await navigator.clipboard.writeText(address);
    } catch {
      // No clipboard here (old browser, or permission refused). The row shows the address, but text in
      // a button cannot be selected, so the field takes it too, already selected for a manual copy.
      hint.textContent = address;
      input.value = address;
      input.select();
      count.textContent = 'Copy failed. The address is selected above.';
      return;
    }
    hint.textContent = 'Copied';
    count.textContent = 'Email address copied';
    setTimeout(() => { if (node.isConnected) close(); }, 700);
  };

  const run = (item, node) => {
    if (item.id === 'copy-email') { copyEmail(node, item.address); return; }
    document.querySelector('.sharks-toggle')?.click();
    close();
  };

  const build = () => {
    input = el('input', { class: 'palette-input', type: 'text', role: 'combobox', 'aria-expanded': 'true', 'aria-controls': 'palette-list', 'aria-autocomplete': 'list', autocomplete: 'off', autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false', enterkeyhint: 'go', placeholder: 'Jump to a page, project or link', 'aria-label': 'Search this site' });
    const closeButton = el('button', { type: 'button', class: 'palette-close', 'aria-label': 'Close search' }, 'esc');
    list = el('div', { class: 'palette-list', id: 'palette-list', role: 'listbox', 'aria-label': 'Results' });
    empty = el('p', { class: 'palette-empty', hidden: '' });
    count = el('span', { class: 'palette-count', role: 'status', 'aria-live': 'polite' });
    const key = name => el('kbd', {}, name);
    dialog = el('dialog', { class: 'palette', 'aria-label': 'Search this site' },
      el('div', { class: 'palette-field' }, el('span', { class: 'palette-prompt', 'aria-hidden': 'true' }, '›'), input, closeButton),
      list,
      empty,
      el('p', { class: 'palette-foot' }, el('span', {}, key('↑'), key('↓'), ' move'), el('span', {}, key('↵'), ' open'), el('span', {}, key('esc'), ' close'), count));

    input.addEventListener('input', () => { if (ready) render(); });
    input.addEventListener('keydown', event => {
      // 229: Safari reports the Enter that confirms an input-method word after it has cleared isComposing.
      if (event.isComposing || event.keyCode === 229) return;
      // With a modifier the keys keep their text-editing meaning: Shift+Home selects back to the start.
      const plain = !(event.shiftKey || event.altKey || event.metaKey || event.ctrlKey);
      const to = plain ? moveTo(event.key, selected, options.length) : null;
      if (to !== null) { event.preventDefault(); select(to); return; }
      if (event.key !== 'Enter') return;
      event.preventDefault();
      // A held key repeats: the Enter that opened the palette must not also open its first result.
      if (event.repeat) return;
      const node = options[selected];
      if (!node) return;
      if ((event.metaKey || event.ctrlKey) && /^https?:$/.test(node.protocol || '')) window.open(node.href, '_blank', 'noopener,noreferrer');
      else node.click();
    });
    // Only the input takes focus. A press on a row, a group label or the footer would otherwise leave
    // focus on nothing, and the arrow keys and typing would stop working. The click still goes through.
    dialog.addEventListener('mousedown', event => { if (event.target !== input) event.preventDefault(); });
    list.addEventListener('pointermove', event => {
      // A finger scrolling the list is not pointing at a row: the keyboard's Go key must still open the top result.
      if (event.pointerType === 'touch') return;
      // Browsers also send this when the list scrolls under a still pointer. Only a real move
      // may take the selection away from the arrow keys.
      const at = `${event.clientX},${event.clientY}`;
      if (at === pointer) return;
      pointer = at;
      const n = options.indexOf(event.target.closest('.palette-option'));
      if (n >= 0 && n !== selected) select(n, false);
    });
    list.addEventListener('click', event => {
      const node = event.target.closest('.palette-option');
      const item = shown[options.indexOf(node)];
      if (!item) return;
      if (!item.href) { run(item, node); return; }
      // Close before the browser follows the link, so a jump to an anchor on this page is not left
      // under an open dialog. A click with a modifier opens a tab and keeps the list for the next pick.
      if (!event.metaKey && !event.ctrlKey && !event.shiftKey) close();
    });
    closeButton.addEventListener('click', close);
    // Outside means the press started on the backdrop too: dragging a text selection out of the
    // input ends there, and that must not close the dialog.
    dialog.addEventListener('pointerdown', event => { pressedOutside = event.target === dialog; });
    // detail > 1 is the tail of a double-click on Search: its second click lands on the backdrop.
    dialog.addEventListener('click', event => { if (pressedOutside && event.target === dialog && !(event.detail > 1)) close(); });
    dialog.addEventListener('close', settle);
    window.visualViewport?.addEventListener('resize', fit);
  };

  // A phone's keyboard covers the lower part of the screen without making the page any shorter, so the
  // dialog is cut to the part that still shows. Otherwise its last rows sit under the keyboard.
  const fit = () => {
    const view = window.visualViewport;
    if (!view || !dialog.open) return;
    const covered = Math.abs(view.scale - 1) < 0.01 && window.innerHeight - view.height > 120;
    const room = view.offsetTop + view.height - dialog.getBoundingClientRect().top - 8;
    dialog.style.maxHeight = covered ? `${Math.max(160, Math.round(room))}px` : '';
  };

  const open = async from => {
    if (!dialog) build();
    if (dialog.open) return;
    // Put back if a page script has removed it: showModal throws on a dialog that is not in the page.
    if (!dialog.isConnected) document.body.append(dialog);
    // Read before showModal moves focus into the dialog.
    const focused = document.activeElement;
    dialog.showModal();
    opener = from || (focused && focused !== document.body ? focused : null);
    input.value = '';
    overflow = root.style.overflow;
    root.style.overflow = 'hidden';
    input.focus();
    fit();
    // A second try after a failed load starts clean, not under the old failure message.
    if (!ready) empty.hidden = true;
    const index = await load();
    if (!dialog.open) return;
    ready = Boolean(index);
    if (!index) {
      empty.textContent = 'The list of pages did not load. Close this and try again.';
      empty.hidden = false;
      count.textContent = 'The list of pages did not load.';
      return;
    }
    // Read the sharks button on every open: its label flips, and it hides while a camera runs.
    const sharks = document.querySelector('.sharks-toggle');
    items = [...index, ...actionItems(index, sharks && !sharks.hidden ? sharks.textContent : '')];
    render();
  };

  for (const trigger of document.querySelectorAll('[data-palette-open]')) {
    trigger.setAttribute('role', 'button');
    trigger.setAttribute('aria-haspopup', 'dialog');
    trigger.setAttribute('aria-keyshortcuts', '/ Meta+K Control+K');
    trigger.addEventListener('click', event => { event.preventDefault(); open(trigger); });
    trigger.addEventListener('keydown', event => {
      if (event.key !== ' ' && event.key !== 'Enter') return;
      event.preventDefault();
      if (!event.repeat) open(trigger);
    });
    // Fetch the list as soon as the visitor reaches for the button, so it is there by the click.
    trigger.addEventListener('pointerenter', load, { once: true });
    trigger.addEventListener('focus', load, { once: true });
  }
  root.classList.add('palette-ready');

  document.addEventListener('keydown', event => {
    const target = event.target;
    const typing = target instanceof Element && (Boolean(target.closest('input, textarea, select')) || target.isContentEditable === true);
    const action = shortcut(event, { typing, dialogOpen: Boolean(document.querySelector('dialog[open]')) });
    if (!action) return;
    event.preventDefault();
    // A held key repeats: the browser's own Ctrl+K stays blocked, but the dialog must not flicker.
    if (event.repeat) return;
    if (action === 'toggle' && dialog?.open) close();
    else open();
  });
}

if (typeof document !== 'undefined') start();
