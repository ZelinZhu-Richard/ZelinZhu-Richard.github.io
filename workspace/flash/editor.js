import { DEFAULTS, PRESETS, LIMITS, TEXT_LIMITS, MAX_IMAGE_BYTES, MAX_IMPORT_BYTES, validateCard, parseSettings, serializeSettings } from './state.js';
import { mountCard, mountAurora } from './renderer.js';
import { loadDesign, saveDesign } from './storage.js';
import { buildInteractiveHTML, exportFilename, download } from './export.js';
import { exportAssets } from './export-assets.js';

const form = document.querySelector('#controls');
const saveStatus = document.querySelector('#save-status');
const message = document.querySelector('#message');
const uploadIcon = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 13V3m-4 4 4-4 4 4M4 12v4h12v-4"/></svg>';
const section = (title, body) => `<details class="control-section" open><summary>${title}</summary><div class="section-body">${body}</div></details>`;
const select = (key, title, options) => `<div class="field inline-field"><label for="setting-${key}">${title}</label><select name="${key}" id="setting-${key}">${options.map(([value, label]) => `<option value="${value}">${label}</option>`).join('')}</select></div>`;
const range = (key, title, unit) => `<div class="field range-field"><div class="range-heading"><label for="setting-${key}">${title}</label><output for="setting-${key}" data-output="${key}" data-unit="${unit}"></output></div><input type="range" name="${key}" id="setting-${key}" min="${LIMITS[key][0]}" max="${LIMITS[key][1]}" step="1"></div>`;
const toggle = (key, title, hint = '') => `<label class="toggle-field" for="setting-${key}"><span><span class="toggle-label">${title}</span>${hint ? `<small>${hint}</small>` : ''}</span><input type="checkbox" role="switch" name="${key}" id="setting-${key}"></label>`;
const color = (key, title) => `<div class="color-field"><label for="hex-${key}">${title}</label><div class="color-input"><input type="color" name="${key}" aria-label="Choose ${title.toLowerCase()} color"><input type="text" id="hex-${key}" data-hex="${key}" maxlength="7" spellcheck="false" aria-label="${title} hex color"></div></div>`;
const text = (key, title) => `<div class="field"><label for="setting-${key}">${title}</label><input type="text" name="${key}" id="setting-${key}" maxlength="${TEXT_LIMITS[key]}" autocomplete="off" spellcheck="false"></div>`;
form.innerHTML = section('Card',
  select('ratio', 'Ratio', [['original', 'Original · 292:423'], ['portrait', 'Portrait · 3:4'], ['square', 'Square · 1:1'], ['landscape', 'Landscape · 85.6:54']]) +
  range('width', 'Width', 'px') + range('radius', 'Corner radius', 'px') + toggle('ticket', 'Ticket style', 'Side punches and tear line')) +
  section('Colors', `<div class="presets" role="group" aria-label="Color presets">${Object.entries(PRESETS).map(([name, colors]) => `<button type="button" class="preset" data-preset="${name}" aria-pressed="false"><span class="swatch" style="background:linear-gradient(125deg,${colors.join(',')})"></span>${name}</button>`).join('')}</div><div class="color-stack">${color('primary', 'Primary')}${color('secondary', 'Secondary')}${color('accent', 'Accent')}</div>${range('angle', 'Gradient angle', '°')}`) +
  section('Texture', select('texture', 'Pattern', [['rosette', 'Rosette'], ['waves', 'Waves'], ['lines', 'Fine lines'], ['none', 'None'], ['custom', 'Uploaded image']]) +
  `<div><button class="upload" id="upload-texture" type="button">${uploadIcon} Upload image…</button><p class="upload-note" id="upload-note">Seamless tiles work best. Max 3 MB.</p><button type="button" class="remove-texture" id="remove-texture" hidden>Remove uploaded image</button></div>` +
  range('scale', 'Scale', '%') + range('opacity', 'Opacity', '%') + select('blend', 'Blend', [['normal', 'Normal'], ['multiply', 'Multiply'], ['screen', 'Screen'], ['overlay', 'Overlay'], ['soft-light', 'Soft light']]) + toggle('emboss', 'Emboss stroke')) +
  section('Lighting', range('foil', 'Foil', '%') + range('glare', 'Glare', '%') + range('grain', 'Grain', '%') + range('tilt', 'Max tilt', '°')) +
  section('Content', text('title', 'Title') + text('subtitle', 'Subtitle') + text('cardholder', 'Cardholder') + `<div class="two-fields">${text('number', 'Number')}${text('valid', 'Valid thru')}</div>` + color('textColor', 'Text color') +
  `<div class="field inline-field"><span class="inline-label" id="logo-label">Logo</span><div class="segmented" role="radiogroup" aria-labelledby="logo-label">${['star','rings','none'].map(value => `<label><input type="radio" name="logo" value="${value}"><span>${value[0].toUpperCase() + value.slice(1)}</span></label>`).join('')}</div></div>`) +
  section('Scene', toggle('aurora', 'Aurora background', 'Animated light behind the card'));
form.addEventListener('submit', event => event.preventDefault());
let state = { ...DEFAULTS }, revision = 0, saveTimer = 0, toastTimer = 0, saveQueue = Promise.resolve(), exportOpen = false, initialized = false;
let pendingInitialSave = false;
const card = mountCard(document.querySelector('.flash-card-host'), state);
const aurora = mountAurora(document.querySelector('.flash-aurora'), state.aurora);

function notify(text, error = false) {
  clearTimeout(toastTimer); message.textContent = text; message.dataset.error = String(error); message.hidden = false;
  toastTimer = setTimeout(() => { message.hidden = true; }, error ? 8000 : 4500);
}
function status(text, error = false) { saveStatus.textContent = text; saveStatus.classList.toggle('save-error', error); }
function syncForm() {
  for (const control of form.querySelectorAll('[name]')) {
    const value = state[control.name];
    if (control.type === 'checkbox') control.checked = value;
    else if (control.type === 'radio') control.checked = value === control.value;
    else control.value = value;
    if (control.type === 'range') {
      const progress = (value - Number(control.min)) / (Number(control.max) - Number(control.min)) * 100;
      control.style.setProperty('--progress', `${progress}%`);
      const output = form.querySelector(`[data-output="${control.name}"]`);
      output.value = `${value}${output.dataset.unit}`;
    }
  }
  for (const input of form.querySelectorAll('[data-hex]')) {
    if (document.activeElement !== input) { input.value = state[input.dataset.hex]; input.setCustomValidity(''); }
  }
  for (const button of form.querySelectorAll('[data-preset]')) {
    button.setAttribute('aria-pressed', String(PRESETS[button.dataset.preset].every((value, index) => value.toLowerCase() === state[['primary', 'secondary', 'accent'][index]].toLowerCase())));
  }
  form.querySelector('option[value="custom"]').disabled = !state.image;
  document.querySelector('#remove-texture').hidden = !state.image;
  document.querySelector('#upload-note').textContent = state.image ? 'Custom texture saved with your design. Max 3 MB.' : 'Seamless tiles work best. Max 3 MB.';
}
function persist() {
  clearTimeout(saveTimer); saveTimer = 0;
  if (!initialized) { pendingInitialSave = true; return; }
  const snapshot = { ...state }, snapshotRevision = revision;
  saveQueue = saveQueue.catch(() => {}).then(() => saveDesign(snapshot)).then(() => {
    if (snapshotRevision === revision) status('Live preview · auto-saved locally');
  }).catch(() => {
    if (snapshotRevision === revision) status('Not saved · export settings to keep this design', true);
  });
}
function update(next, { save = true } = {}) {
  const previousAurora = state.aurora;
  state = validateCard(next); revision++;
  card.update(state);
  if (state.aurora !== previousAurora) aurora.update(state.aurora);
  syncForm();
  if (save) { status('Live preview · saving…'); clearTimeout(saveTimer); saveTimer = setTimeout(persist, 180); }
}
form.addEventListener('input', event => {
  const input = event.target;
  let key = input.name, value = input.value;
  if (input.dataset.hex) {
    key = input.dataset.hex;
    if (!/^#[\da-f]{6}$/i.test(value)) { input.setCustomValidity('Enter a color such as #FFC9D8.'); return; }
    input.setCustomValidity(''); value = value.toUpperCase();
  } else if (!key) return;
  else if (input.type === 'checkbox') value = input.checked;
  else if (input.type === 'range') value = Number(value);
  try { update({ ...state, [key]: value }); } catch (error) { notify(error.message, true); syncForm(); }
});
form.addEventListener('change', event => {
  if (event.target.dataset.hex && !event.target.checkValidity()) event.target.reportValidity();
});
form.addEventListener('click', event => {
  const preset = event.target.closest('[data-preset]');
  if (!preset) return;
  const [primary, secondary, accent] = PRESETS[preset.dataset.preset];
  update({ ...state, primary, secondary, accent });
});
document.querySelector('#reset').addEventListener('click', () => { update({ ...DEFAULTS }); notify('Restored the original Pearl card.'); });
document.addEventListener('visibilitychange', () => { if (document.hidden && saveTimer) persist(); });
window.addEventListener('pagehide', () => { if (saveTimer) persist(); });

function decodeTexture(source) {
  if (!source) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => image.naturalWidth > 8192 || image.naturalHeight > 8192 || image.naturalWidth * image.naturalHeight > 16_777_216
      ? reject(new Error('Use a texture no larger than 8192 pixels on either side and 16 megapixels.')) : resolve();
    image.onerror = () => reject(new Error('This image could not be read. Choose a PNG, JPEG, or WebP file.'));
    image.src = source;
  });
}
function readDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(new Error('The image could not be read.')); reader.readAsDataURL(file);
  });
}
document.querySelector('#upload-texture').addEventListener('click', () => document.querySelector('#texture-file').click());
document.querySelector('#texture-file').addEventListener('change', async event => {
  const file = event.target.files[0]; event.target.value = ''; if (!file) return;
  const startedAt = revision;
  try {
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > MAX_IMAGE_BYTES) throw new Error('Choose a PNG, JPEG, or WebP image smaller than 3 MB.');
    const image = await readDataURL(file); await decodeTexture(image);
    if (startedAt !== revision) throw new Error('The design changed while loading. Please choose the texture again.');
    update({ ...state, image, texture: 'custom' }); notify('Texture added. It will be included in your exports.');
  } catch (error) { notify(error.message, true); }
});
document.querySelector('#remove-texture').addEventListener('click', () => update({ ...state, image: null, texture: 'rosette' }));
document.querySelector('#import').addEventListener('click', () => document.querySelector('#settings-file').click());
document.querySelector('#settings-file').addEventListener('change', async event => {
  const file = event.target.files[0]; event.target.value = ''; if (!file) return;
  const startedAt = revision;
  try {
    if (file.size > MAX_IMPORT_BYTES) throw new Error('This settings file is too large. Choose a Flash settings export.');
    const imported = parseSettings(await file.text()); await decodeTexture(imported.image);
    if (startedAt !== revision) throw new Error('The design changed while loading. Please import the file again.');
    update(imported); notify('Design imported and saved in this browser.');
  } catch (error) { notify(error.message, true); }
});
const exportButton = document.querySelector('#export');
const exportOptions = document.querySelector('#export-options');
function toggleExport(open, returnFocus = false) {
  exportOpen = open; exportOptions.hidden = !open; exportButton.setAttribute('aria-expanded', String(open));
  if (open) document.querySelector('#export-card').focus();
  else if (returnFocus) exportButton.focus();
}
exportButton.addEventListener('click', () => toggleExport(!exportOpen));
document.addEventListener('click', event => { if (exportOpen && !event.target.closest('.export-wrapper')) toggleExport(false); });
document.addEventListener('focusin', event => { if (exportOpen && !event.target.closest('.export-wrapper')) toggleExport(false); });
document.addEventListener('keydown', event => { if (event.key === 'Escape' && exportOpen) { event.preventDefault(); toggleExport(false, true); } });
document.querySelector('#export-card').addEventListener('click', () => {
  try {
    download(buildInteractiveHTML(state, exportAssets), exportFilename(state.title, 'html'), 'text/html;charset=utf-8');
    toggleExport(false, true); notify('Interactive card downloaded. Open the HTML file in a browser to catch the light.');
  } catch { notify('The card could not be exported. Please try again.', true); }
});
document.querySelector('#export-settings').addEventListener('click', () => {
  download(serializeSettings(state), exportFilename(state.title, 'json'), 'application/json');
  toggleExport(false, true); notify('Settings downloaded. Import this file to keep editing later.');
});

syncForm();
// Avoid replacing edits made while IndexedDB is opening.
const initialRevision = revision;
try {
  const saved = await loadDesign();
  if (saved) {
    const restored = parseSettings(JSON.stringify(saved)); await decodeTexture(restored.image);
    // Refresh the old example in local saves while preserving personalized copy.
    const originalCopy = { title: 'Luminary Club', subtitle: 'Founding Member', cardholder: 'Alex Chen', number: '0042', valid: '2028.09' };
    const isOriginalExample = Object.entries(originalCopy).every(([key, value]) => restored[key] === value);
    if (isOriginalExample) for (const key of Object.keys(originalCopy)) restored[key] = DEFAULTS[key];
    // Update exact old preset matches; individually edited colors stay intact.
    const previousPalettes = {
      Pearl: [['#FFC9D8', '#F3E7BD', '#C9B8EE']],
      Aurora: [['#38C9AA', '#BBF1DA', '#47AFB1'], ['#66DEC4', '#CDE987', '#7DADE5']],
      Rose: [['#F07C8B', '#FFD3B9', '#EB7182'], ['#FFBD79', '#EF86B8', '#E68489']],
      Champagne: [['#E9AD39', '#FFE4A1', '#C78C39'], ['#F4A783', '#F4D06F', '#A5D4AA']],
      Glacier: [['#62A9ED', '#C3E6FF', '#7395DD'], ['#78D9EE', '#A99AE5', '#73A5E6']],
    };
    const colorKeys = ['primary', 'secondary', 'accent'];
    const previousPalette = Object.keys(previousPalettes).find(name => previousPalettes[name].some(colors => colors.every((color, index) => color.toLowerCase() === restored[colorKeys[index]].toLowerCase())));
    if (previousPalette) colorKeys.forEach((key, index) => { restored[key] = PRESETS[previousPalette][index]; });
    if (revision === initialRevision) update(restored, { save: isOriginalExample || Boolean(previousPalette) });
  }
} catch { status('Local save unavailable · export settings to keep a copy', true); }
initialized = true;
if (pendingInitialSave || (revision !== initialRevision && saveTimer)) persist();
