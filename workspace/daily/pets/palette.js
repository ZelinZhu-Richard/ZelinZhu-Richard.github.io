// Shared colours for the pet art (CONTENT.md §A.1). Pure data + tiny colour helpers.
// Every species, egg and state draws from here so the tier ladder stays exact.

export const OUTLINE = '#1a1530';
export const OUTLINE_W = 4;
export const WHITE = '#ffffff';

export const TIER_KEYS = ['ordinary', 'rare', 'superRare', 'epic', 'mythic', 'legendary', 'ultra'];
export const TIER_NAMES = ['Ordinary', 'Rare', 'Super Rare', 'Epic', 'Mythic', 'Legendary', 'Ultra'];

// Tier ladder (exact hex from CONTENT.md §A.1 "Tier ladder").
export const TIERS = Object.freeze([
  { tier: 0, key: 'ordinary', name: 'Ordinary', body: '#c2bad0', shade: '#978daa', belly: '#ebe6f2', accent: '#6f6585', aura: 'none' },
  { tier: 1, key: 'rare', name: 'Rare', body: '#9fd4ff', shade: '#6aaee6', belly: '#e3f3ff', accent: '#2f6fb3', aura: 'sparkles' },
  { tier: 2, key: 'superRare', name: 'Super Rare', body: '#7ee0c3', shade: '#4cbc9c', belly: '#dcf8ef', accent: '#23866a', aura: 'groundGlow' },
  { tier: 3, key: 'epic', name: 'Epic', body: '#c9a2ff', shade: '#9c72e8', belly: '#f0e6ff', accent: '#6a3fc4', aura: 'dottedRing', glow: '#c9a2ff' },
  { tier: 4, key: 'mythic', name: 'Mythic', body: '#ff9ecf', shade: '#e46aa9', belly: '#ffe4f2', accent: '#a83a74', aura: 'pulseHalo' },
  { tier: 5, key: 'legendary', name: 'Legendary', body: '#ffc98f', shade: '#e9a25a', belly: '#fff1df', accent: '#a8611f', aura: 'sunRays', trim: '#ffe08a', flame: ['#ffb347', '#ff7a3d'] },
  { tier: 6, key: 'ultra', name: 'Ultra', body: '#fff3b0', shade: '#e3cf72', belly: '#fffbe8', accent: '#b08f2a', aura: 'raysHalo',
    iridescent: ['#fff3b0', '#ffd3ec', '#cfe8ff', '#d8ffef', '#fff3b0'] },
].map(Object.freeze));

// UI rarity label colours (always paired with the text label).
export const RARITY = Object.freeze(['#c2bad0', '#9fd4ff', '#7ee0c3', '#c9a2ff', '#ff9ecf', '#ffc98f', '#fff3b0']);

export const FACE = Object.freeze({
  eye: OUTLINE,
  blush: '#ff7fb6', blushOpacity: 0.45, blushHappyOpacity: 0.6,
  blushMythic: '#ff5a9e', blushMythicOpacity: 0.55,
  tongue: '#ff7fb6',
  tear: '#9fd4ff',
  growl: '#978daa',
  heart: '#ff7fb6',
});

export const FX = Object.freeze({
  orb: '#dfccff',
  pill: '#ffffff',
  pillText: OUTLINE,
  sparkle: '#ffffff',
});

export const GOLD = '#ffe08a';
export const COIN = '#ffd34d';
export const COIN_EDGE = '#a8611f';
export const FIVE_STAR_RIM = '#ffe08a';
export const SHADOW = Object.freeze({ rx: 35, ry: 5, cx: 80, cy: 149, color: '#000000', opacity: 0.3, ultraRx: 26, ultraOpacity: 0.2 });

export const GRAVE = Object.freeze({
  stone: '#4a4560', shade: '#37334a', carve: '#2b2740', text: '#c2bad0',
  flowerPetal: '#8a8499', flowerCentre: '#c2bad0', grass: '#3d3852',
});

export const ASHES = Object.freeze({
  nest: '#3a3548', rim: '#4a4560', medallion: '#2b2740', empty: '#4a4560', emberPulseS: 2.4, wispEveryS: 5, segments: 3,
});

export const SILHOUETTE = Object.freeze({ fill: '#2b2740', edge: '#4a4560' });

/** Palette for tier 0–6 (clamped). Frozen; never mutate. */
export function tierPalette(tier) {
  const t = Math.max(0, Math.min(6, Math.round(Number(tier) || 0)));
  return TIERS[t];
}

// ---- colour helpers (hex in, hex out) ----
const clamp255 = (v) => Math.max(0, Math.min(255, Math.round(v)));
export function hexToRgb(hex) {
  const h = String(hex).replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h.slice(0, 6);
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export function rgbToHex([r, g, b]) {
  return '#' + [r, g, b].map((v) => clamp255(v).toString(16).padStart(2, '0')).join('');
}
/** Linear mix of two hex colours, t in [0,1] (0 = a, 1 = b). */
export function mix(a, b, t) {
  const x = hexToRgb(a), y = hexToRgb(b);
  return rgbToHex(x.map((v, i) => v + (y[i] - v) * t));
}
export const lighten = (hex, t) => mix(hex, '#ffffff', t);
export const darken = (hex, t) => mix(hex, '#000000', t);
