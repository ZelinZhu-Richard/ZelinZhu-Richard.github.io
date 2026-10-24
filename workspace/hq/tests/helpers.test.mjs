import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as H from '../helpers.js';

const at = iso => Date.parse(iso); // fixed UTC instants only

test('dateKey and periodDay use New York time, with the 05:00 reset', () => {
  // 18:00 UTC = 14:00 EDT
  assert.equal(H.dateKey(at('2026-10-24T18:00:00Z')), '2026-10-24');
  // 03:30 UTC Oct 25 = 23:30 EDT Oct 24 (UTC already says the 25th)
  assert.equal(H.dateKey(at('2026-10-25T03:30:00Z')), '2026-10-24');
  // 04:59 EDT is still yesterday's priorities; 05:00 EDT starts the new day
  assert.equal(H.periodDay(at('2026-10-31T08:59:00Z')), '2026-10-30');
  assert.equal(H.periodDay(at('2026-10-31T09:00:00Z')), '2026-10-31');
});

test('period reset across the Nov 1 2026 DST change (EDT -> EST)', () => {
  // 00:30 EDT Nov 1: calendar day is Nov 1, priorities still belong to Oct 31, month still October
  assert.equal(H.dateKey(at('2026-11-01T04:30:00Z')), '2026-11-01');
  assert.equal(H.periodDay(at('2026-11-01T04:30:00Z')), '2026-10-31');
  assert.equal(H.periodMonth(at('2026-11-01T04:30:00Z')), '2026-10');
  // 01:30 happens twice: 05:30Z (EDT) and 06:30Z (EST). Both are Nov 1, both before the reset.
  assert.equal(H.nyParts(at('2026-11-01T05:30:00Z')).hour, 1);
  assert.equal(H.nyParts(at('2026-11-01T06:30:00Z')).hour, 1);
  assert.equal(H.periodDay(at('2026-11-01T06:30:00Z')), '2026-10-31');
  // After the change, 05:00 local is 10:00 UTC, not 09:00 UTC
  assert.equal(H.periodDay(at('2026-11-01T09:59:00Z')), '2026-10-31');
  assert.equal(H.periodMonth(at('2026-11-01T09:59:00Z')), '2026-10');
  assert.equal(H.periodDay(at('2026-11-01T10:00:00Z')), '2026-11-01');
  assert.equal(H.periodMonth(at('2026-11-01T10:00:00Z')), '2026-11');
  // 23:30 EST Nov 1 is 04:30 UTC Nov 2
  assert.equal(H.dateKey(at('2026-11-02T04:30:00Z')), '2026-11-01');
});

test('spring DST change (Mar 14 2027) keeps the reset at 05:00 local', () => {
  // Mar 13 is still EST: 05:00 local = 10:00 UTC
  assert.equal(H.periodDay(at('2027-03-13T09:59:00Z')), '2027-03-12');
  assert.equal(H.periodDay(at('2027-03-13T10:00:00Z')), '2027-03-13');
  // Mar 14 switches to EDT at 07:00 UTC: 05:00 local = 09:00 UTC
  assert.equal(H.periodDay(at('2027-03-14T08:59:00Z')), '2027-03-13');
  assert.equal(H.periodDay(at('2027-03-14T09:00:00Z')), '2027-03-14');
});

test('day arithmetic is calendar-based, not 24-hour based', () => {
  assert.equal(H.diffDays('2026-10-31', '2026-11-02'), 2);
  assert.equal(H.diffDays('2026-11-02', '2026-10-31'), -2);
  assert.equal(H.addDays('2026-11-01', -1), '2026-10-31');
  assert.equal(H.addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(H.addDays('2028-02-28', 1), '2028-02-29');
  assert.equal(H.previousMonth('2027-01'), '2026-12');
  assert.equal(H.previousMonth('2026-11'), '2026-10');
});

test('parseKey accepts only real YYYY-MM-DD dates', () => {
  assert.deepEqual(H.parseKey('2026-11-01'), { y: 2026, m: 11, d: 1 });
  for (const bad of ['2026-02-30', '2026-13-01', '11/01/2026', '2026-11-1', '', null, 20261101]) assert.equal(H.parseKey(bad), null, String(bad));
  assert.ok(H.isMonthKey('2026-10'));
  assert.ok(!H.isMonthKey('2026-13'));
});

test('formatting: header line, short dates, month name, date column', () => {
  assert.equal(H.headerLine('2026-10-24', 14), 'SAT, OCT 24, 2026 · 14 OPEN TASKS');
  assert.equal(H.headerLine('2026-11-01', 1), 'SUN, NOV 1, 2026 · 1 OPEN TASK');
  assert.equal(H.headerLine('2026-11-02', 0), 'MON, NOV 2, 2026 · 0 OPEN TASKS');
  assert.equal(H.formatShort('2026-10-24'), 'SAT, OCT 24');
  assert.equal(H.monthName('2026-10'), 'October');
  assert.equal(H.dateColumnLabel({ date: '2026-11-01', dateLabel: null }), 'NOV 1');
  assert.equal(H.dateColumnLabel({ date: '2026-11-05', dateLabel: 'early nov' }), 'EARLY NOV');
  assert.equal(H.dateColumnLabel({ date: null, dateLabel: null }), 'TBD');
  assert.equal(H.dateColumnLabel({ date: null, dateLabel: 'ROLLING' }), 'ROLLING');
});

test('countdown text and colour', () => {
  const d = (date, approx = false) => ({ date, approx });
  const today = '2026-10-24';
  assert.deepEqual(
    ['2026-10-20', '2026-10-24', '2026-10-25', '2026-11-01', '2026-11-03', '2026-11-04'].map(x => H.countdown(d(x), today).text),
    ['passed', 'today', 'tomorrow', '8 days', '10 days', '11 days']);
  assert.equal(H.countdown(d('2026-11-01', true), today).text, '~8 days');
  assert.equal(H.countdown(d(null), today).text, 'no date yet');
  // amber when 10 days or fewer away and not all done
  assert.equal(H.countdown(d('2026-11-03'), today).color, H.COLORS.amber);
  assert.equal(H.countdown(d('2026-11-03'), today).urgent, true);
  assert.equal(H.countdown(d('2026-11-04'), today).color, H.COLORS.muted);
  assert.equal(H.countdown(d('2026-11-01'), today, true).urgent, false);
  assert.equal(H.countdown(d('2026-10-20'), today).urgent, false);
  assert.equal(H.countdown(d(null), today).color, H.COLORS.muted);
});

test('countdown across the DST change counts calendar days', () => {
  const today = H.dateKey(at('2026-10-31T16:00:00Z')); // noon EDT Oct 31
  assert.equal(H.countdown({ date: '2026-11-02' }, today).text, '2 days');
  const late = H.dateKey(at('2026-11-02T03:00:00Z')); // 22:00 EST Nov 1
  assert.equal(H.countdown({ date: '2026-11-01' }, late).text, 'today');
  assert.equal(H.countdown({ date: '2026-11-02' }, late).text, 'tomorrow');
});

test('deadline status, dot and fading', () => {
  const t = (done) => ({ done });
  const today = '2026-10-24';
  const future = { date: '2026-11-20' };
  const soon = { date: '2026-10-30' };
  const past = { date: '2026-10-01' };
  const undated = { date: null };
  assert.equal(H.deadlineSummary(future, [t(true), t(false), t(false)], today).status, '1/3');
  assert.equal(H.deadlineSummary(future, [t(true), t(false), t(false)], today).pct, 33);
  assert.equal(H.deadlineSummary(future, [t(true), t(true)], today).status, 'ready');
  assert.equal(H.deadlineSummary(past, [t(true)], today).status, 'done');
  assert.equal(H.deadlineSummary(past, [t(true)], today).faded, true);
  assert.equal(H.deadlineSummary(past, [t(false)], today).status, 'check');
  assert.equal(H.deadlineSummary(past, [t(false)], today).statusColor, H.COLORS.amber);
  assert.equal(H.deadlineSummary(undated, [t(false)], today).status, '0/1');
  assert.equal(H.deadlineSummary(undated, [t(false)], today).past, false);
  assert.equal(H.deadlineSummary(future, [], today).status, '0/0');
  assert.equal(H.deadlineSummary(future, [], today).allDone, false);
  assert.equal(H.deadlineSummary(soon, [t(false)], today).dot, 'urgent');
  assert.equal(H.deadlineSummary(soon, [t(true)], today).dot, 'done');
  assert.equal(H.deadlineSummary(future, [t(false)], today).dot, 'open');
});

test('sorting: dated ascending, ties by sortOrder, undated last by sortOrder', () => {
  const list = [
    { id: 'a', date: null, sortOrder: 5 },
    { id: 'b', date: '2026-11-01', sortOrder: 4 },
    { id: 'c', date: '2026-09-30', sortOrder: 9 },
    { id: 'd', date: null, sortOrder: 1 },
    { id: 'e', date: '2026-11-01', sortOrder: 2 },
    { id: 'f', date: '2027-01-15', sortOrder: 0 },
  ];
  assert.deepEqual(H.sortDeadlines(list).map(x => x.id), ['c', 'e', 'b', 'f', 'd', 'a']);
  assert.equal(list[0].id, 'a', 'does not mutate the input');
});

test('open task count and tasksFor ordering', () => {
  const tasks = [{ id: '1', deadlineId: 'x', done: false, position: 2 }, { id: '2', deadlineId: 'x', done: true, position: 0 }, { id: '3', deadlineId: 'y', done: false, position: 0 }];
  assert.equal(H.openTaskCount(tasks), 2);
  assert.deepEqual(H.tasksFor(tasks, 'x').map(t => t.id), ['2', '1']);
});

test('period slots and carry-over suggestions', () => {
  const p = (scope, period, slot, text, done = false) => ({ id: `${scope}${period}${slot}`, scope, period, slot, text, done });
  const list = [
    p('today', '2026-10-22', 1, 'Old item'),
    p('today', '2026-10-23', 1, 'Finish draft'),
    p('today', '2026-10-23', 2, 'Done thing', true),
    p('today', '2026-10-23', 3, 'Email someone'),
    p('today', '2026-10-24', 1, 'email someone'),
    p('month', '2026-09', 2, 'Ship it'),
  ];
  const slots = H.periodSlots(list, 'today', '2026-10-24');
  assert.equal(slots.length, 3);
  assert.equal(slots[0].text, 'email someone');
  assert.equal(slots[1], null);
  assert.equal(H.periodSlots(list, 'month', '2026-10').length, 5);
  // most recent earlier period only; done and already-present items are skipped
  assert.deepEqual(H.carryOverCandidates(list, 'today', '2026-10-24'), { from: '2026-10-23', texts: ['Finish draft'] });
  assert.equal(H.carryOverLabel('today', '2026-10-23', '2026-10-24'), 'yesterday');
  assert.equal(H.carryOverLabel('today', '2026-10-20', '2026-10-24'), 'TUE, OCT 20');
  assert.deepEqual(H.carryOverCandidates(list, 'month', '2026-10'), { from: '2026-09', texts: ['Ship it'] });
  assert.equal(H.carryOverLabel('month', '2026-09', '2026-10'), 'September');
  assert.equal(H.carryOverCandidates(list, 'today', '2026-10-22'), null);
  assert.equal(H.carryOverCandidates([], 'month', '2026-10'), null);
});

test('HQ logic never uses local-time Date getters or new Date("YYYY-MM-DD")', async () => {
  for (const file of ['helpers.js', 'store.js', 'app.js']) {
    const src = await readFile(new URL(`../${file}`, import.meta.url), 'utf8');
    assert.doesNotMatch(src, /\.(get|set)(FullYear|Month|Date|Day|Hours|Minutes|Seconds)\(/, `${file} uses a local-time getter/setter`);
    assert.doesNotMatch(src, /new Date\(\s*['"`]\d{4}-/, `${file} parses a date-only string`);
    assert.doesNotMatch(src, /toLocale(Date)?String\(/, `${file} formats with the host time zone`);
  }
});

test('spokenDue says the date column in words for the timeline button', () => {
  const today = '2026-10-24';
  assert.equal(H.spokenDue({ date: '2026-11-01', approx: false, dateLabel: null }, today), 'due November 1, 8 days, urgent');
  assert.equal(H.spokenDue({ date: '2026-11-01', approx: false, dateLabel: null }, today, true), 'due November 1, 8 days', 'not urgent once all done');
  assert.equal(H.spokenDue({ date: '2026-12-15', approx: true, dateLabel: 'MID DEC' }, today), 'due mid dec, about 52 days');
  assert.equal(H.spokenDue({ date: '2026-10-25', approx: false, dateLabel: null }, today), 'due October 25, tomorrow, urgent');
  assert.equal(H.spokenDue({ date: '2026-10-01', approx: false, dateLabel: null }, today), 'due October 1, passed');
  assert.equal(H.spokenDue({ date: null, approx: false, dateLabel: 'ROLLING' }, today), 'rolling, no date yet');
  assert.equal(H.spokenDue({ date: null, approx: false, dateLabel: null }, today), 'no date yet');
});
