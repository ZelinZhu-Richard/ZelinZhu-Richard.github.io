// Build-time validation for workspace/now/now.mjs. No Date parsing: dates are
// checked with regexes and integer arithmetic so results never depend on TZ.

export const COURSE_STATUSES = ['enrolled', 'sitting-in', 'auditing', 'self-study'];
export const MILESTONE_STATES = ['done', 'next', 'upcoming'];

const DATE_FULL = /^(\d{4})-(\d{2})-(\d{2})$/;
const DATE_MONTH = /^(\d{4})-(\d{2})$/;

const daysIn = (year, month) =>
  month === 2 ? ((year % 4 === 0 && year % 100 !== 0) || year % 400 === 0 ? 29 : 28) : [4, 6, 9, 11].includes(month) ? 30 : 31;

/** Returns 'YYYY-MM-DD' or 'YYYY-MM' if strictly valid, otherwise null. */
export function strictDate(value, { allowMonth = true } = {}) {
  if (typeof value !== 'string') return null;
  const full = DATE_FULL.exec(value);
  const part = full || (allowMonth ? DATE_MONTH.exec(value) : null);
  if (!part) return null;
  const year = Number(part[1]);
  const month = Number(part[2]);
  if (month < 1 || month > 12) return null;
  if (full) {
    const day = Number(full[3]);
    if (day < 1 || day > daysIn(year, month)) return null;
  }
  return value;
}

const text = value => typeof value === 'string' && value.trim() !== '';
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);

function keys(errors, where, value, allowed) {
  for (const key of Object.keys(value)) if (!allowed.includes(key)) errors.push(`${where}: unknown field "${key}" (allowed: ${allowed.join(', ')})`);
}

function requireText(errors, where, value, fields) {
  for (const field of fields) if (!text(value[field])) errors.push(`${where}.${field} must be a non-empty string`);
}

/** Collects every problem in the data; returns an array of messages (empty when valid). */
export function nowErrors(data) {
  const errors = [];
  if (!plain(data)) return ['NOW must be an object'];
  keys(errors, 'NOW', data, ['updated', 'currently', 'term', 'courses', 'milestones']);

  if (!strictDate(data.updated, { allowMonth: false })) errors.push(`NOW.updated must be a real date in YYYY-MM-DD form (got ${JSON.stringify(data.updated)})`);

  if (!Array.isArray(data.currently) || data.currently.length === 0) errors.push('NOW.currently must be a non-empty array of strings');
  else data.currently.forEach((item, i) => { if (!text(item)) errors.push(`NOW.currently[${i}] must be a non-empty string`); });

  if (!plain(data.term)) errors.push('NOW.term must be an object like { label: "Fall", emphasis: "2026" }');
  else {
    keys(errors, 'NOW.term', data.term, ['label', 'emphasis']);
    requireText(errors, 'NOW.term', data.term, ['label', 'emphasis']);
  }

  if (!Array.isArray(data.courses) || data.courses.length === 0) errors.push('NOW.courses must be a non-empty array');
  else data.courses.forEach((course, i) => {
    const where = `NOW.courses[${i}]`;
    if (!plain(course)) { errors.push(`${where} must be an object`); return; }
    keys(errors, where, course, ['title', 'status', 'statusNote', 'where', 'note', 'now', 'next', 'labels']);
    requireText(errors, where, course, ['title', 'where', 'note', 'now', 'next']);
    if (!COURSE_STATUSES.includes(course.status)) errors.push(`${where}.status ${JSON.stringify(course.status)} must be one of ${COURSE_STATUSES.join(', ')}`);
    if ('statusNote' in course && !text(course.statusNote)) errors.push(`${where}.statusNote must be a non-empty string when present`);
    if ('labels' in course) {
      if (!plain(course.labels)) errors.push(`${where}.labels must be an object like { next: "mock score" }`);
      else {
        keys(errors, `${where}.labels`, course.labels, ['now', 'next']);
        for (const [key, value] of Object.entries(course.labels)) if (!text(value)) errors.push(`${where}.labels.${key} must be a non-empty string`);
      }
    }
  });

  if (!Array.isArray(data.milestones) || data.milestones.length === 0) errors.push('NOW.milestones must be a non-empty array');
  else {
    let lastDate = null; // previous dated item, any precision
    let lastDay = null; // latest full YYYY-MM-DD seen, so a month-only date in between cannot reset day order
    let nextCount = 0;
    data.milestones.forEach((item, i) => {
      const where = `NOW.milestones[${i}]`;
      if (!plain(item)) { errors.push(`${where} must be an object`); return; }
      keys(errors, where, item, ['label', 'date', 'state', 'review', 'title', 'detail']);
      requireText(errors, where, item, ['label', 'title', 'detail']);
      if (!MILESTONE_STATES.includes(item.state)) errors.push(`${where}.state ${JSON.stringify(item.state)} must be one of ${MILESTONE_STATES.join(', ')}`);
      if (item.state === 'next') nextCount += 1;
      if ('review' in item) {
        if (typeof item.review !== 'boolean') errors.push(`${where}.review must be true or false when present`);
        else if (item.review && item.state !== 'upcoming') errors.push(`${where}.review is only allowed on "upcoming" milestones (got state ${JSON.stringify(item.state)})`);
      }
      if ('date' in item) {
        if (!strictDate(item.date)) errors.push(`${where}.date ${JSON.stringify(item.date)} must be a real date in YYYY-MM or YYYY-MM-DD form`);
        else {
          // Compare at the coarser precision so '2026-10' and '2026-10-05' count as the same month.
          if (lastDate) {
            const n = Math.min(lastDate.length, item.date.length);
            if (item.date.slice(0, n) < lastDate.slice(0, n)) errors.push(`${where}.date ${item.date} is earlier than a previous milestone (${lastDate}); list milestones in chronological order`);
            else if (lastDay && item.date.length === 10 && item.date < lastDay) errors.push(`${where}.date ${item.date} is earlier than a previous milestone (${lastDay}); list milestones in chronological order`);
          }
          lastDate = item.date;
          if (item.date.length === 10) lastDay = item.date;
        }
      }
    });
    if (nextCount > 1) errors.push(`NOW.milestones has ${nextCount} items with state "next"; at most one is allowed`);
  }
  return errors;
}

/** Throws a single readable error when the data is invalid; returns the data otherwise. */
export function validateNow(data) {
  const errors = nowErrors(data);
  if (errors.length) throw new Error(`Invalid /now/ data in workspace/now/now.mjs:\n- ${errors.join('\n- ')}`);
  return data;
}
