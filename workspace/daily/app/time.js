// Display-only time helpers. Everything goes through Intl with America/New_York;
// no local-time Date getters and no Date parsing of date-only strings.
export const ZONE = 'America/New_York';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const partsFormat = new Intl.DateTimeFormat('en-US', {
  timeZone: ZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});
const clockFormat = new Intl.DateTimeFormat('en-US', { timeZone: ZONE, hour: 'numeric', minute: '2-digit' });

export function nyParts(ms) {
  const out = {};
  for (const p of partsFormat.formatToParts(new Date(ms))) if (p.type !== 'literal') out[p.type] = Number(p.value);
  if (out.hour === 24) out.hour = 0;
  return out;
}
export const nyMinutes = ms => { const p = nyParts(ms); return p.hour * 60 + p.minute; };
export const dayKey = ms => { const p = nyParts(ms); return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`; };
export const clock = ms => clockFormat.format(new Date(ms));

// 'YYYY-MM-DD' or 'YYYY-MM' → 'Nov 12' / 'November'; split, never Date-parsed.
export function dayLabel(key) {
  const [, m, d] = String(key ?? '').split('-').map(Number);
  if (!m) return String(key ?? '');
  return d ? `${MONTHS[m - 1]} ${d}` : MONTHS_LONG[m - 1];
}
export const monthName = key => MONTHS_LONG[Number(String(key ?? '').split('-')[1]) - 1] || '';
export function stampLabel(ms) {
  const p = nyParts(ms);
  return `${MONTHS[p.month - 1]} ${p.day}, ${clock(ms)}`;
}

export function duration(ms) {
  const mins = Math.max(0, Math.round(ms / 60000));
  const h = Math.floor(mins / 60);
  return h ? `${h}h ${mins % 60}m` : `${mins}m`;
}

// The day window from the wall clock: 05:00–22:00 New York. Used for visitors and
// fixtures (a snapshot's own window goes stale); owners use the engine's viewHeader.window.
export function liveWindow(now) {
  const m = nyMinutes(now);
  const p = nyParts(now);
  const base = now - (m * 60 + p.second) * 1000;
  if (m < 300) return { phase: 'before', opensAt: base + 300 * 60000, closesAt: base + 1320 * 60000 };
  if (m >= 1320) return { phase: 'closed', opensAt: base + (1440 + 300) * 60000, closesAt: base + 1320 * 60000 };
  return { phase: 'open', opensAt: base + 300 * 60000, closesAt: base + 1320 * 60000 };
}
