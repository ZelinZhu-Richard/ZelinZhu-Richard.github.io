export const DEFAULTS = Object.freeze({
  ratio: 'original', width: 292, radius: 28, ticket: true,
  primary: '#FFC9D8', secondary: '#F3E7BD', accent: '#C9B8EE', angle: 200,
  texture: 'rosette', scale: 38, opacity: 72, blend: 'normal', emboss: true,
  foil: 100, glare: 100, grain: 100, tilt: 10,
  title: 'Luminary Club', subtitle: 'Founding Member', cardholder: 'Alex Chen',
  number: '0042', valid: '2028.09', textColor: '#1B3326', logo: 'star',
  aurora: true, image: null,
});
export const PRESETS = Object.freeze({
  Pearl: ['#FFC9D8', '#F3E7BD', '#C9B8EE'],
  Aurora: ['#F3C4E4', '#B5F4DE', '#A7D7F3'],
  Rose: ['#F5A4AA', '#FFE0AF', '#E8907D'],
  Abyss: ['#123F66', '#182D4B', '#302A74'],
  Graphite: ['#B8B8B8', '#ECEAE5', '#62656D'],
});
export const LIMITS = Object.freeze({
  width: [220, 520], radius: [0, 40], angle: [0, 360], scale: [10, 200],
  opacity: [0, 100], foil: [0, 100], glare: [0, 100], grain: [0, 100], tilt: [0, 20],
});
export const TEXT_LIMITS = Object.freeze({ title: 60, subtitle: 70, cardholder: 40, number: 16, valid: 20 });
const choices = {
  ratio: ['original', 'portrait', 'square', 'landscape'],
  texture: ['rosette', 'waves', 'lines', 'none', 'custom'],
  blend: ['normal', 'multiply', 'screen', 'overlay', 'soft-light'],
  logo: ['star', 'rings', 'none'],
};
export const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
export const MAX_IMPORT_BYTES = 4.3 * 1024 * 1024;
export function validateCard(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Choose a valid Flash settings file.');
  const card = { ...DEFAULTS };
  for (const [key, value] of Object.entries(input)) {
    if (!Object.hasOwn(DEFAULTS, key)) throw new Error(`Unknown setting: ${key}.`);
    if (Object.hasOwn(LIMITS, key)) {
      const [min, max] = LIMITS[key];
      if (!Number.isFinite(value) || value < min || value > max) throw new Error(`Invalid ${key} value.`);
    } else if (Object.hasOwn(TEXT_LIMITS, key)) {
      if (typeof value !== 'string' || value.length > TEXT_LIMITS[key]) throw new Error(`Invalid ${key} text.`);
    } else if (Object.hasOwn(choices, key)) {
      if (!choices[key].includes(value)) throw new Error(`Invalid ${key} choice.`);
    } else if (['primary', 'secondary', 'accent', 'textColor'].includes(key)) {
      if (typeof value !== 'string' || !/^#[\da-f]{6}$/i.test(value)) throw new Error('Use six-digit hex colors.');
    } else if (key === 'image') {
      if (value !== null && (typeof value !== 'string' || value.length > MAX_IMPORT_BYTES || !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(value))) throw new Error('The texture must be a PNG, JPEG, or WebP image under 3 MB.');
      if (value !== null) {
        const encoded = value.slice(value.indexOf(',') + 1);
        const bytes = encoded.length * .75 - (encoded.endsWith('==') ? 2 : encoded.endsWith('=') ? 1 : 0);
        if (encoded.length % 4 || bytes > MAX_IMAGE_BYTES) throw new Error('The texture must be smaller than 3 MB.');
      }
    } else if (typeof value !== 'boolean') throw new Error(`Invalid ${key} setting.`);
    card[key] = value;
  }
  if (card.texture === 'custom' && !card.image) throw new Error('This design is missing its custom texture.');
  return card;
}
export function parseSettings(text) {
  let file;
  try { file = JSON.parse(text); } catch { throw new Error('This file is not valid JSON.'); }
  if (file?.format !== 'flash-card' || file.version !== 1) throw new Error('Choose a Flash settings file (version 1).');
  return validateCard(file.card);
}
export function serializeSettings(card) {
  return JSON.stringify({ format: 'flash-card', version: 1, card: validateCard(card) }, null, 2);
}
