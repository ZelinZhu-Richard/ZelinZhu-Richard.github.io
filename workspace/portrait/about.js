// About page: clicking the photo swaps it for the living portrait. The portrait's code and data
// (portrait.js and data/*.png) load only then; hovering or focusing the photo starts the download early.
const figure = document.querySelector('[data-portrait-figure]');
const trigger = figure?.querySelector('.portrait-trigger');
let loading = null;
const load = () => (loading ||= import('./portrait.js'));

if (trigger) {
  trigger.addEventListener('pointerenter', load, { once: true });
  trigger.addEventListener('focus', load, { once: true });
  trigger.addEventListener('click', open);
}

async function open() {
  const caption = figure.querySelector('figcaption');
  const before = caption.innerHTML;
  const stage = document.createElement('div');
  stage.className = 'portrait-stage';
  const canvas = document.createElement('canvas');
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', 'Animated portrait of Richard Zhu drawn in code.');
  const label = document.createElement('button');
  label.type = 'button';
  label.className = 'portrait-label';
  label.textContent = 'Drawing…';
  label.setAttribute('aria-describedby', 'portrait-help');
  stage.append(canvas, label);
  trigger.replaceWith(stage); // same box size as the photo, so nothing on the page moves
  caption.innerHTML = '<span id="portrait-help">Drawn in code from two selfies. Click it, or the label, for the next style.</span> <button type="button" class="portrait-back">Show the photo</button>';
  const back = caption.querySelector('.portrait-back');
  let portrait;
  back.addEventListener('click', () => {
    portrait?.destroy();
    stage.replaceWith(trigger);
    caption.innerHTML = before;
    trigger.focus();
  });
  label.addEventListener('click', () => portrait?.next());
  try {
    const { mountPortrait } = await load();
    const count = Number(new URLSearchParams(location.search).get('portrait-count')) || undefined; // for testing low-end pools
    portrait = await mountPortrait(canvas, { label, count });
    canvas.livingPortrait = portrait;
    label.focus({ preventScroll: true });
  } catch (error) {
    label.textContent = 'Could not draw the portrait';
    console.error(error);
  }
}
