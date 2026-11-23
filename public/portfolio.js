const button = document.querySelector('.menu-button');
const navigation = document.querySelector('#navigation');
function setMenu(open) {
  button.setAttribute('aria-expanded', String(open));
  button.textContent = open ? 'Close' : 'Menu';
  navigation.classList.toggle('open', open);
}
button.addEventListener('click', () => setMenu(button.getAttribute('aria-expanded') !== 'true'));
navigation.addEventListener('click', event => { if (event.target.closest('a')) setMenu(false); });
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && button.getAttribute('aria-expanded') === 'true') {
    setMenu(false);
    button.focus();
  }
});
// The open menu also closes when a click or keyboard focus lands outside the header.
const header = button.closest('.site-header');
const isOpen = () => button.getAttribute('aria-expanded') === 'true';
document.addEventListener('click', event => { if (isOpen() && !header.contains(event.target)) setMenu(false); });
header.addEventListener('focusout', event => { if (isOpen() && event.relatedTarget && !header.contains(event.relatedTarget)) setMenu(false); });

// Copy buttons: data-copy holds the text, data-copy-from the id of the element whose text to copy.
// They ship hidden and are shown only where the clipboard is available.
if (navigator.clipboard) for (const copy of document.querySelectorAll('[data-copy],[data-copy-from]')) {
  const label = copy.textContent;
  let timer;
  copy.hidden = false;
  copy.setAttribute('aria-live', 'polite');
  copy.addEventListener('click', async () => {
    const text = copy.dataset.copy ?? document.getElementById(copy.dataset.copyFrom)?.textContent ?? '';
    try { await navigator.clipboard.writeText(text); copy.textContent = 'Copied'; }
    catch { copy.textContent = 'Copy failed'; }
    clearTimeout(timer);
    timer = setTimeout(() => { copy.textContent = label; }, 1600);
  });
}
