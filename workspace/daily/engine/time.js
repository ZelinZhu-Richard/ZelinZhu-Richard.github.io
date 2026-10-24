// America/New_York calendar helpers. Every calendar decision in the engine goes through this file.
// Never uses local-time Date getters or new Date('YYYY-MM-DD'): wall times come from Intl with an explicit
// timeZone, and date-only arithmetic is done on UTC epoch days (Date.UTC + getUTC*), which is zone-free.

import { CONFIG } from './config.js';

const MINUTE = 60_000;
const DAY = 86_400_000;
let fmt = null;
let fmtZone = null;

function formatter() {
  if (!fmt || fmtZone !== CONFIG.time.zone) {
    fmtZone = CONFIG.time.zone;
    fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: fmtZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  }
  return fmt;
}

const pad = (n, w = 2) => String(n).padStart(w, '0');

/** Wall-clock parts in New York for an epoch-ms instant. */
export function nyParts(ms) {
  const o = {};
  for (const p of formatter().formatToParts(new Date(ms))) o[p.type] = p.value;
  const hour = Number(o.hour) % 24;
  return { year: Number(o.year), month: Number(o.month), day: Number(o.day), hour, minute: Number(o.minute), second: Number(o.second) };
}

/** 'YYYY-MM-DD' in New York. */
export function dayKey(ms) {
  const p = nyParts(ms);
  return `${pad(p.year, 4)}-${pad(p.month)}-${pad(p.day)}`;
}

/** Minutes since local midnight in New York. */
export function minuteOfDay(ms) {
  const p = nyParts(ms);
  return p.hour * 60 + p.minute;
}

export function parseKey(key) {
  if (typeof key !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(key)) throw new TypeError(`Bad day key: ${key}`);
  const [y, m, d] = key.split('-').map(Number);
  return { y, m, d };
}

function keyFromUtcMs(t) {
  const dt = new Date(t);
  return `${pad(dt.getUTCFullYear(), 4)}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

const epochDay = (key) => {
  const { y, m, d } = parseKey(key);
  return Date.UTC(y, m - 1, d) / DAY;
};

export function addDays(key, n) {
  const { y, m, d } = parseKey(key);
  return keyFromUtcMs(Date.UTC(y, m - 1, d + n));
}

/** b − a in calendar days. */
export function daysBetween(a, b) {
  return epochDay(b) - epochDay(a);
}

/** 0 = Sunday … 6 = Saturday. */
export function weekdayOf(key) {
  const { y, m, d } = parseKey(key);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export const isWeekend = (key) => {
  const w = weekdayOf(key);
  return w === 0 || w === 6;
};

/** The Monday on or before the day (weekly chest weeks run Monday–Sunday). */
export function mondayOf(key) {
  return addDays(key, -((weekdayOf(key) + 6) % 7));
}

export const monthOf = (key) => key.slice(0, 7);

export function nextMonth(month) {
  const [y, m] = month.split('-').map(Number);
  return m === 12 ? `${pad(y + 1, 4)}-01` : `${pad(y, 4)}-${pad(m + 1)}`;
}

function offsetAt(ms) {
  const p = nyParts(ms);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(ms / 1000) * 1000;
}

/** Epoch ms of a New York wall time on a day (DST-safe; 05:00 and 22:00 never fall in a DST gap). */
export function nyInstant(key, minuteOfDayValue) {
  const { y, m, d } = parseKey(key);
  const wall = Date.UTC(y, m - 1, d, 0, minuteOfDayValue);
  let guess = wall - offsetAt(wall);
  guess = wall - offsetAt(guess);
  return guess;
}

export const openInstant = (key) => nyInstant(key, CONFIG.time.openMinute);
export const closeInstant = (key) => nyInstant(key, CONFIG.time.closeMinute);

/** 'before' (00:00–05:00), 'open' (05:00–22:00) or 'closed' (22:00–24:00), New York time. */
export function phaseAt(ms) {
  const min = minuteOfDay(ms);
  if (min < CONFIG.time.openMinute) return 'before';
  if (min < CONFIG.time.closeMinute) return 'open';
  return 'closed';
}

/** The latest day whose 22:00 close has passed at `ms`. */
export function lastFinishedDay(ms) {
  const today = dayKey(ms);
  return ms >= closeInstant(today) ? today : addDays(today, -1);
}

/** 'HH:MM' from minutes since midnight. */
export function clock(minutes) {
  return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
}

export function parseClock(text) {
  const [h, m] = text.split(':').map(Number);
  return h * 60 + m;
}

export { MINUTE, DAY };
