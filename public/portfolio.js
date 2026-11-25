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

// The page scale on instrument pages (pageScale() in site/ornament.mjs; wide screens only). Each section's
// mark moves to the point of the scroll where that section reaches the reading line, 30% down the window;
// the last mark passed is the current section (aria-current="location"); --p is how far down the page the
// reader is, for the cursor where the browser has no CSS scroll timeline. Without this script the marks
// stay evenly spread and there is no cursor.
{
  const scale = document.querySelector('.page-scale');
  const track = scale?.querySelector('.scale-track');
  const marks = track ? [...scale.querySelectorAll('li')].map(item => {
    const link = item.querySelector('a[href^="#"]');
    return { item, link, target: link && document.getElementById(decodeURIComponent(link.hash.slice(1))), at: parseFloat(item.style.getPropertyValue('--at')) || 0 };
  }).filter(mark => mark.target) : [];
  if (marks.length) {
    const room = () => Math.max(1, document.documentElement.scrollHeight - innerHeight);
    const update = () => {
      const progress = Math.min(1, Math.max(0, scrollY / room()));
      scale.style.setProperty('--p', progress.toFixed(4));
      const current = marks.findLastIndex(mark => progress >= mark.at);
      marks.forEach((mark, i) => i === current ? mark.link.setAttribute('aria-current', 'location') : mark.link.removeAttribute('aria-current'));
    };
    const measure = () => {
      const height = track.clientHeight;
      if (!height) return; // display:none on narrow screens
      const gap = 28 / height; // marks stay 28px apart, so their labels never touch
      let last = -Infinity;
      for (const mark of marks) {
        const start = (mark.target.getBoundingClientRect().top + scrollY - innerHeight * 0.3) / room();
        mark.at = Math.max(Math.min(1, Math.max(0, start)), last + gap);
        last = mark.at;
      }
      let next = 1 + gap;
      for (const mark of [...marks].reverse()) next = mark.at = Math.min(mark.at, next - gap);
      for (const mark of marks) mark.item.style.setProperty('--at', mark.at.toFixed(4));
      update();
    };
    let queued = 0;
    addEventListener('scroll', () => { queued ||= requestAnimationFrame(() => { queued = 0; update(); }); }, { passive: true });
    addEventListener('resize', measure);
    // The page's height changes after load too (fonts, the BibTeX drawer): measure again when it does.
    if ('ResizeObserver' in window) new ResizeObserver(measure).observe(document.body);
    measure();
    scale.classList.add('is-live');
  }
}
