// "This month" strip on /now/: reads Daily's public Receipts from /daily/snapshot.json.
// Read-only. The strip stays hidden unless the snapshot is a real published one
// (kind: 'published', not the build-time preview) for the current America/New_York
// month and carries all four numbers.
//
// Expected snapshot shape (agreed with Daily):
//   { kind: 'published' | 'preview',
//     receipts: { month: { key: 'YYYY-MM', pagesRead, hoursOutside, workouts, avgSleepHours } } }

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const FIELDS = [
  ['pagesRead', 'pages read', 0, ''],
  ['hoursOutside', 'hours outside', 1, ''],
  ['workouts', 'workouts', 0, ''],
  ['avgSleepHours', 'avg sleep', 1, ' h'],
];

const MONTH_KEY = /^(\d{4})-(0[1-9]|1[0-2])$/;

const format = (value, digits) => {
  const rounded = digits ? Math.round(value * 10 ** digits) / 10 ** digits : Math.round(value);
  return rounded.toLocaleString('en-US', { maximumFractionDigits: digits });
};

const nyMonth = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit' });

/** 'YYYY-MM' of the given instant (ms since epoch) in America/New_York. No local Date getters. */
export function nyMonthKey(instant) {
  const parts = Object.fromEntries(nyMonth.formatToParts(instant).map(p => [p.type, p.value]));
  return `${parts.year}-${parts.month}`;
}

/** 'YYYY-MM' -> 'October 2026', by splitting the string. */
export function formatMonthKey(key) {
  const [year, month] = key.split('-');
  return `${MONTHS[Number(month) - 1]} ${year}`;
}

/**
 * Returns { month: 'October 2026', stats: [{ label, value }] }, or null (strip stays hidden) when
 * the snapshot is not published, is for another month than `currentMonth` ('YYYY-MM'),
 * or any number is missing or not a finite, non-negative number.
 */
export function monthStats(snapshot, currentMonth) {
  if (snapshot?.kind !== 'published') return null;
  const month = snapshot.receipts?.month;
  if (!month || typeof month !== 'object') return null;
  if (typeof month.key !== 'string' || !MONTH_KEY.test(month.key) || month.key !== currentMonth) return null;
  const stats = [];
  for (const [key, label, digits, unit] of FIELDS) {
    const value = month[key];
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null;
    stats.push({ label, value: format(value, digits) + unit });
  }
  return { month: formatMonthKey(month.key), stats };
}

/** Loads the snapshot and fills the strip. Resolves true when the strip was shown. Never throws. */
export async function show(strip, fetchImpl = fetch, now = Date.now()) {
  try {
    const list = strip.querySelector('[data-now-stats]');
    if (!list) return false;
    const response = await fetchImpl('/daily/snapshot.json', { cache: 'no-cache' });
    if (!response.ok) return false;
    const result = monthStats(await response.json(), nyMonthKey(now));
    if (!result) return false;
    const doc = list.ownerDocument;
    list.replaceChildren(...result.stats.map(({ label, value }) => {
      const item = doc.createElement('div');
      const term = doc.createElement('dt');
      const detail = doc.createElement('dd');
      term.textContent = label;
      detail.textContent = value;
      item.append(term, detail);
      return item;
    }));
    const monthLabel = strip.querySelector('[data-now-month-key]');
    if (monthLabel) monthLabel.textContent = result.month;
    strip.hidden = false;
    return true;
  } catch {
    return false; // Leave the strip hidden.
  }
}

if (typeof document !== 'undefined') {
  const strip = document.querySelector('[data-now-month]');
  if (strip) show(strip);
}
