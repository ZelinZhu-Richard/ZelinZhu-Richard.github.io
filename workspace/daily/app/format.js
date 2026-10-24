// Display constants and formatters. Numbers that drive rules live in the engine;
// these are labels and colours only (PLAN.md Ground rules: rarity and difficulty colours).
export const TIERS = ['Ordinary', 'Rare', 'Super Rare', 'Epic', 'Mythic', 'Legendary', 'Ultra'];
export const TIER_SHORT = ['OR', 'RA', 'SR', 'EP', 'MY', 'LG', 'UL'];
export const TIER_COLORS = ['#c2bad0', '#9fd4ff', '#7ee0c3', '#c9a2ff', '#ff9ecf', '#ffc98f', '#fff3b0'];
export const LEVELS = ['chill', 'easy', 'medium', 'hard', 'goddamn'];
export const DAY_LEVELS = ['chill', 'easy', 'medium', 'hard'];
export const LEVEL_LABELS = { chill: 'Chill', easy: 'Easy', medium: 'Medium', hard: 'Hard', goddamn: 'Goddamn' };
export const LEVEL_COLORS = { chill: '#c2bad0', easy: '#9fd4ff', medium: '#7ee0c3', hard: '#ffc98f', goddamn: '#ff9fb2' };
export const ORBS_BY_LEVEL = { chill: 3, easy: 4, medium: 6, hard: 9, goddamn: 14 };
export const SPECIES_NAMES = { dragon: 'Drakelet', fox: 'Kitsu', slime: 'Gumdrop', owl: 'Hootling', turtle: 'Pebbleback', axolotl: 'Ripplegill', hedgehog: 'Bramblekin' };
export const SPECIES_PATRON = { dragon: 'physical', fox: 'outdoors', slime: 'food', owl: 'study', turtle: 'sleep', axolotl: 'lastMissed', hedgehog: 'frog' };
export const AMBER = '#ffc98f';
export const DEEP_WORK_TAGS = ['ILO', 'Coursework', 'ML research', 'College applications', 'Other']; // CONTENT.md §I.8 (private ledger)

export const tierIndex = t => {
  if (typeof t === 'number') return Math.max(0, Math.min(6, t));
  const i = TIERS.findIndex(name => name.toLowerCase().replace(/\s/g, '') === String(t ?? '').toLowerCase().replace(/[\s_-]/g, ''));
  return i < 0 ? 0 : i;
};
export const tierName = t => TIERS[tierIndex(t)];
export const tierColor = t => TIER_COLORS[tierIndex(t)];
export const levelLabel = l => LEVEL_LABELS[l] || String(l ?? '');
export const levelColor = l => LEVEL_COLORS[l] || '#c2bad0';
export const levelIndex = l => LEVELS.indexOf(l);

export const num = n => (Number.isFinite(Number(n)) ? Math.round(Number(n)).toLocaleString('en-US') : '0');
export const signed = n => (n >= 0 ? '+' : '−') + num(Math.abs(n));
export function pct(x, digits) {
  const v = Number(x) * 100;
  if (!Number.isFinite(v)) return '—';
  if (digits !== undefined) return `${v.toFixed(digits).replace(/\.0+$/, '')}%`;
  if (v === 0) return '0%';
  const rounded = v >= 10 || Number.isInteger(v) ? Math.round(v * 10) / 10 : Math.round(v * 1000) / 1000;
  return `${rounded}%`;
}
export const stars = (n, max = 5) => '★'.repeat(Math.max(0, n)) + '☆'.repeat(Math.max(0, max - n));
export const plural = (n, one, many = `${one}s`) => `${num(n)} ${n === 1 ? one : many}`;
export const clamp01 = x => Math.max(0, Math.min(1, Number(x) || 0));
export const percentWidth = (a, b) => Math.round(clamp01(b ? a / b : 0) * 100);

export function listText(items) {
  const xs = items.filter(Boolean);
  if (xs.length <= 1) return xs.join('');
  return `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;
}
export const article = word => (/^[aeiou]/i.test(String(word)) ? 'an' : 'a');
