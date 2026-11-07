const wipe = document.querySelector('#wipe');
const range = document.querySelector('#wipe-range');
range.addEventListener('input', () => wipe.style.setProperty('--at', `${range.value}%`));

const image = document.querySelector('#layer-image');
const note = document.querySelector('#layer-note');
const buttons = [...document.querySelectorAll('.layer-buttons button')];
const alts = {
  1: 'Kun and the stone forest with plain lighting and flat fog.',
  2: "The same frame with a warm pool of light on Kun's back and cold light elsewhere.",
  3: 'The same frame with light shafts added from the top right.',
  4: 'The same frame with mist lying across the feet of the stone pillars.',
  5: 'The finished frame with bloom and the final color curve.',
};
function show(button) {
  for (const other of buttons) other.setAttribute('aria-pressed', String(other === button));
  image.src = `./img/layer-${button.dataset.layer}.jpg`;
  image.alt = alts[button.dataset.layer];
  note.textContent = button.dataset.note;
}
for (const button of buttons) button.addEventListener('click', () => show(button));
show(buttons[0]);

// Every figure on the page comes from one file, written from the final build.
const numbers = await (await fetch('./numbers.json')).json();
document.querySelector('[data-number="iou"]').textContent = numbers.iou;
document.querySelector('#numbers').replaceChildren(...numbers.rows.map(([name, value]) => {
  const row = document.createElement('tr');
  const head = document.createElement('th');
  head.scope = 'row';
  head.textContent = name;
  const cell = document.createElement('td');
  cell.textContent = value;
  row.append(head, cell);
  return row;
}));
