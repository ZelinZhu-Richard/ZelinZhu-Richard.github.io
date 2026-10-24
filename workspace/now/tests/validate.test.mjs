import test from 'node:test';
import assert from 'node:assert/strict';
import { NOW } from '../now.mjs';
import { nowErrors, validateNow, strictDate } from '../validate.mjs';
import { nowPage } from '../page.mjs';

const copy = () => structuredClone(NOW);

test('the shipped seed data is valid and keeps the bracketed placeholders', () => {
  assert.deepEqual(nowErrors(NOW), []);
  assert.equal(validateNow(NOW), NOW);
  assert.equal(NOW.courses.length, 5);
  assert.equal(NOW.milestones.length, 7);
  assert.equal(NOW.courses[3].note, "[One line on what you're getting out of it]");
  assert.equal(NOW.milestones.at(-1).label, '[Date] 2027');
});

test('strictDate accepts real YYYY-MM and YYYY-MM-DD dates only', () => {
  for (const ok of ['2026-10', '2026-10-24', '2024-02-29', '2000-02-29', '2026-12-31']) assert.equal(strictDate(ok), ok);
  for (const bad of ['2026-13', '2026-00', '2026-02-29', '1900-02-29', '2026-04-31', '2026-10-24T00:00', '2026-1-5', 'Oct 2026', '', 20261024, null]) assert.equal(strictDate(bad), null, String(bad));
  assert.equal(strictDate('2026-10', { allowMonth: false }), null);
});

const bad = [
  ['missing updated', d => { delete d.updated; }, /NOW\.updated must be a real date/],
  ['month-only updated', d => { d.updated = '2026-10'; }, /NOW\.updated/],
  ['impossible updated', d => { d.updated = '2026-02-30'; }, /NOW\.updated/],
  ['empty currently', d => { d.currently = []; }, /NOW\.currently must be a non-empty array/],
  ['blank currently item', d => { d.currently[1] = '  '; }, /NOW\.currently\[1\]/],
  ['missing term emphasis', d => { delete d.term.emphasis; }, /NOW\.term\.emphasis/],
  ['unknown course status', d => { d.courses[0].status = 'dropped'; }, /NOW\.courses\[0\]\.status "dropped" must be one of enrolled, sitting-in, auditing, self-study/],
  ['missing course title', d => { delete d.courses[2].title; }, /NOW\.courses\[2\]\.title must be a non-empty string/],
  ['typo field', d => { d.courses[1].stauts = 'auditing'; }, /unknown field "stauts"/],
  ['bad label key', d => { d.courses[4].labels = { later: 'x' }; }, /NOW\.courses\[4\]\.labels: unknown field "later"/],
  ['empty courses', d => { d.courses = []; }, /NOW\.courses must be a non-empty array/],
  ['unknown milestone state', d => { d.milestones[0].state = 'shipped'; }, /NOW\.milestones\[0\]\.state "shipped" must be one of done, next, upcoming/],
  ['missing milestone label', d => { delete d.milestones[2].label; }, /NOW\.milestones\[2\]\.label/],
  ['loose milestone date', d => { d.milestones[0].date = 'Sep 2026'; }, /NOW\.milestones\[0\]\.date "Sep 2026" must be a real date/],
  ['impossible milestone date', d => { d.milestones[4].date = '2026-12-32'; }, /NOW\.milestones\[4\]\.date/],
  ['out of order dates', d => { d.milestones[0].date = '2027-01'; }, /earlier than a previous milestone/],
  ['two next items', d => { d.milestones[5].state = 'next'; }, /2 items with state "next"/],
  ['day order reset by a month-only date', d => { d.milestones[0].date = '2026-09-20'; d.milestones[1].date = '2026-10-20'; d.milestones[2].date = '2026-10'; d.milestones[4].date = '2026-10-05'; }, /2026-10-05 is earlier than a previous milestone \(2026-10-20\)/],
  ['non-boolean review', d => { d.milestones[2].review = 'yes'; }, /NOW\.milestones\[2\]\.review must be true or false/],
  ['review on a done item', d => { d.milestones[0].review = true; }, /NOW\.milestones\[0\]\.review is only allowed on "upcoming"/],
];

for (const [name, mutate, message] of bad) {
  test(`rejects bad data: ${name}`, () => {
    const data = copy();
    mutate(data);
    assert.ok(nowErrors(data).length > 0);
    assert.throws(() => validateNow(data), message);
    assert.throws(() => nowPage(data), /Invalid \/now\/ data in workspace\/now\/now\.mjs/);
  });
}

test('reports every problem at once, not just the first', () => {
  const data = copy();
  data.courses[0].status = 'x';
  data.milestones[1].state = 'y';
  assert.equal(nowErrors(data).length, 2);
});

test('accepts optional fields being absent and same-month dates at mixed precision', () => {
  const data = copy();
  for (const c of data.courses) { delete c.statusNote; delete c.labels; }
  for (const m of data.milestones) delete m.date;
  assert.deepEqual(nowErrors(data), []);
  const mixed = copy();
  mixed.milestones[1].date = '2026-10-20';
  mixed.milestones[2].date = '2026-10';
  assert.deepEqual(nowErrors(mixed), []);
  const review = copy();
  for (const m of review.milestones) delete m.review;
  review.milestones[5].review = false;
  assert.deepEqual(nowErrors(review), []);
});

test('rejects non-object input', () => {
  assert.deepEqual(nowErrors(null), ['NOW must be an object']);
  assert.throws(() => validateNow([]), /NOW must be an object/);
});
