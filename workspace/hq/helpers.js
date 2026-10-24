// Pure date, countdown and sorting helpers for HQ. No DOM, no storage.
// Every calendar decision uses America/New_York through Intl. Date-only strings
// ('YYYY-MM-DD') are split, never parsed with new Date(), and day arithmetic runs
// on UTC midnights so the host time zone never matters.

export const TZ = 'America/New_York';
export const CONFIG = Object.freeze({
  resetHour: 5, // today's priorities roll over at 05:00 New York time
  urgentDays: 10, // countdowns at or under this many days turn amber
  slots: Object.freeze({ today: 3, month: 5 }),
});
export const COLORS = Object.freeze({ amber: '#ffc98f', muted: '#c2bad0', accent: '#dfccff' });

const MONTHS_SHORT = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const DAY_MS = 86400000;

const partsFormat = new Intl.DateTimeFormat('en-US', {
  timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

const pad = n => String(n).padStart(2, '0');

/** Calendar parts of an instant (ms or Date) in New York. */
export function nyParts(instant) {
  const out = {};
  for (const p of partsFormat.formatToParts(new Date(Number(instant)))) if (p.type !== 'literal') out[p.type] = Number(p.value);
  if (out.hour === 24) out.hour = 0;
  return { year: out.year, month: out.month, day: out.day, hour: out.hour, minute: out.minute };
}

/** 'YYYY-MM-DD' of the New York calendar day containing the instant. */
export function dateKey(instant) {
  const p = nyParts(instant);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** Splits a strict 'YYYY-MM-DD' into numbers, or null when it is not a real calendar date. */
export function parseKey(key) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(typeof key === 'string' ? key : '');
  if (!m) return null;
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
  const t = new Date(Date.UTC(y, mo - 1, d));
  if (t.getUTCFullYear() !== y || t.getUTCMonth() !== mo - 1 || t.getUTCDate() !== d) return null;
  return { y, m: mo, d };
}
export const isDateKey = key => parseKey(key) !== null;
export const isMonthKey = key => typeof key === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(key);

const utcDay = ({ y, m, d }) => Date.UTC(y, m - 1, d);
const keyFromUtc = ms => { const t = new Date(ms); return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`; };

export function addDays(key, n) {
  const p = parseKey(key);
  if (!p) throw new Error(`Bad date key: ${key}`);
  return keyFromUtc(utcDay(p) + n * DAY_MS);
}

/** Whole calendar days from one date key to another (positive when `to` is later). */
export function diffDays(fromKey, toKey) {
  const a = parseKey(fromKey), b = parseKey(toKey);
  if (!a || !b) throw new Error(`Bad date key: ${fromKey} / ${toKey}`);
  return Math.round((utcDay(b) - utcDay(a)) / DAY_MS);
}

/** The "today" priority period: the New York date, but before 05:00 it is still yesterday. */
export function periodDay(instant) {
  const p = nyParts(instant);
  const key = `${p.year}-${pad(p.month)}-${pad(p.day)}`;
  return p.hour < CONFIG.resetHour ? addDays(key, -1) : key;
}

/** The month priority period ('YYYY-MM'). It turns over with the 05:00 reset on the 1st. */
export const periodMonth = instant => periodDay(instant).slice(0, 7);

export function previousMonth(monthKey) {
  const [y, m] = monthKey.split('-').map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${pad(m - 1)}`;
}

export function weekdayShort(key) {
  const p = parseKey(key);
  return WEEKDAYS[new Date(utcDay(p)).getUTCDay()];
}
export const monthShort = month => MONTHS_SHORT[month - 1];
export const monthLong = month => MONTHS_LONG[month - 1];

/** 'SAT, OCT 24, 2026' */
export function formatLong(key) {
  const p = parseKey(key);
  return `${weekdayShort(key)}, ${monthShort(p.m)} ${p.d}, ${p.y}`;
}
/** 'SAT, OCT 24' */
export function formatShort(key) {
  const p = parseKey(key);
  return `${weekdayShort(key)}, ${monthShort(p.m)} ${p.d}`;
}
/** 'October' from '2026-10' */
export const monthName = monthKey => monthLong(Number(monthKey.slice(5, 7)));

export const openTaskCount = tasks => tasks.filter(t => !t.done).length;

/** 'SAT, OCT 24, 2026 · 14 OPEN TASKS' */
export function headerLine(todayKey, openCount) {
  return `${formatLong(todayKey)} · ${openCount} OPEN ${openCount === 1 ? 'TASK' : 'TASKS'}`;
}

/** The date column label: the override, else 'NOV 1', else 'TBD'. */
export function dateColumnLabel(deadline) {
  if (deadline.dateLabel) return deadline.dateLabel.toUpperCase();
  const p = parseKey(deadline.date);
  return p ? `${monthShort(p.m)} ${p.d}` : 'TBD';
}

/** Countdown text and tone for a deadline as seen on `todayKey`. */
export function countdown(deadline, todayKey, allDone = false) {
  if (!deadline.date) return { text: 'no date yet', days: null, urgent: false, tone: 'muted', color: COLORS.muted };
  const days = diffDays(todayKey, deadline.date);
  const urgent = days >= 0 && days <= CONFIG.urgentDays && !allDone;
  let text;
  if (days < 0) text = 'passed';
  else if (days === 0) text = 'today';
  else if (days === 1) text = 'tomorrow';
  else text = `${deadline.approx ? '~' : ''}${days} days`;
  return { text, days, urgent, tone: urgent ? 'amber' : 'muted', color: urgent ? COLORS.amber : COLORS.muted };
}

/**
 * The date and countdown as words, for a screen reader: "due November 1, 8 days, urgent",
 * "due early nov, about 12 days", "rolling, no date yet". Matches the visible date column.
 */
export function spokenDue(deadline, todayKey, allDone = false) {
  const cd = countdown(deadline, todayKey, allDone);
  const p = parseKey(deadline.date);
  const label = deadline.dateLabel ? deadline.dateLabel.toLowerCase() : p ? `${monthLong(p.m)} ${p.d}` : null;
  const parts = [deadline.date ? `due ${label}` : label, cd.text.replace(/^~/, 'about ')];
  if (cd.urgent) parts.push('urgent');
  return parts.filter(Boolean).join(', ');
}

export function tasksFor(tasks, deadlineId) {
  return tasks.filter(t => t.deadlineId === deadlineId).sort((a, b) => a.position - b.position || cmp(a.id, b.id));
}

/**
 * Everything a timeline row shows. A deadline with no tasks is never "all done".
 * status: 'x/y' | 'ready' (all done, not past) | 'done' (all done, past) | 'check' (past, not done).
 */
export function deadlineSummary(deadline, tasks, todayKey) {
  const total = tasks.length;
  const done = tasks.filter(t => t.done).length;
  const allDone = total > 0 && done === total;
  const cd = countdown(deadline, todayKey, allDone);
  const past = cd.days !== null && cd.days < 0;
  let status, statusTone;
  if (allDone) { status = past ? 'done' : 'ready'; statusTone = 'accent'; }
  else if (past) { status = 'check'; statusTone = 'amber'; }
  else { status = `${done}/${total}`; statusTone = 'muted'; }
  return {
    done, total, allDone, past, urgent: cd.urgent,
    pct: total ? Math.round((done / total) * 100) : 0,
    countdown: cd.text, countTone: cd.tone, countColor: cd.color,
    status, statusTone, statusColor: COLORS[statusTone],
    dot: allDone ? 'done' : cd.urgent ? 'urgent' : 'open',
    faded: past && allDone,
  };
}

const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/** Dated deadlines ascending (ties by sortOrder), then undated ones by sortOrder. */
export function sortDeadlines(list) {
  return [...list].sort((a, b) => {
    if (a.date && b.date && a.date !== b.date) return cmp(a.date, b.date);
    if (a.date && !b.date) return -1;
    if (!a.date && b.date) return 1;
    return a.sortOrder - b.sortOrder || cmp(a.id, b.id);
  });
}

/** The slot records for one period: an array of length 3 (today) or 5 (month), null for an empty slot. */
export function periodSlots(priorities, scope, period) {
  const out = Array(CONFIG.slots[scope]).fill(null);
  for (const p of priorities) if (p.scope === scope && p.period === period && p.slot >= 1 && p.slot <= out.length) out[p.slot - 1] = p;
  return out;
}

/**
 * Unfinished priorities from the most recent earlier period that has any, minus texts already
 * in the current period. Returns { from, texts } or null when there is nothing to suggest.
 */
export function carryOverCandidates(priorities, scope, period) {
  const earlier = priorities.filter(p => p.scope === scope && p.period < period);
  if (!earlier.length) return null;
  const from = earlier.reduce((m, p) => (p.period > m ? p.period : m), '');
  const current = new Set(priorities.filter(p => p.scope === scope && p.period === period).map(p => p.text.trim().toLowerCase()));
  const texts = earlier
    .filter(p => p.period === from && !p.done && p.text.trim() && !current.has(p.text.trim().toLowerCase()))
    .sort((a, b) => a.slot - b.slot)
    .map(p => p.text.trim());
  return texts.length ? { from, texts } : null;
}

/** Human label for the carry-over source period. */
export function carryOverLabel(scope, from, period) {
  if (scope === 'today') return diffDays(from, period) === 1 ? 'yesterday' : formatShort(from);
  return monthName(from) === monthName(period) ? from : monthName(from);
}
