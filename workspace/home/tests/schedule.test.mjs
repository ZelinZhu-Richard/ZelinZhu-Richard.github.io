import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  BEAT_COUNT, BEAT_WINDOWS, SECTIONS, SECTION_COUNT, SECTION_STARTS_VH, U_MAX,
  beatAt, beatOpacity, progressToU, sectionAt, sectionRange, totalVh, uToProgress,
} from '../engine/timeline/schedule.js';

const ACT_OF = i => (i <= 3 ? 'plate' : i <= 8 ? 'gears' : i <= 17 ? 'room' : 'space');

test('20 sections: hero, the 17 beats, stones, coda, in the four acts of ARCHITECTURE.md', () => {
  assert.equal(SECTION_COUNT, 20);
  assert.equal(SECTIONS.length, 20);
  assert.equal(BEAT_COUNT, 17);
  assert.equal(U_MAX, 20);
  const ids = ['hero', ...Array.from({ length: 17 }, (_, i) => `c${String(i + 1).padStart(2, '0')}`), 'stones', 'coda'];
  assert.deepEqual(SECTIONS.map(s => s.id), ids);
  SECTIONS.forEach((s, i) => {
    assert.deepEqual(Object.keys(s).sort(), ['act', 'id', 'vh']);
    assert.equal(s.act, ACT_OF(i), `section ${i}`);
    assert.ok(Number.isInteger(s.vh) && s.vh >= 60 && s.vh <= 400, `section ${i} vh ${s.vh}`);
    assert.ok(Object.isFrozen(s));
  });
  assert.ok(Object.isFrozen(SECTIONS));
});

test('scroll lengths: total in [2600, 3200] vh, single words short, the room and the stones long', () => {
  const total = SECTIONS.reduce((sum, s) => sum + s.vh, 0);
  assert.equal(totalVh(), total);
  assert.ok(total >= 2600 && total <= 3200, `total ${total}`);
  assert.equal(SECTION_STARTS_VH.length, 21);
  assert.equal(SECTION_STARTS_VH[0], 0);
  assert.equal(SECTION_STARTS_VH[20], total);
  for (let i = 0; i < 20; i++) assert.equal(SECTION_STARTS_VH[i + 1] - SECTION_STARTS_VH[i], SECTIONS[i].vh);
  for (const i of [4, 5, 6]) assert.ok(SECTIONS[i].vh <= 110, `single word §${i}`);
  for (const i of [13, 14, 15, 16]) assert.ok(SECTIONS[i].vh >= 160, `room chapter §${i}`);
  const longest = Math.max(...SECTIONS.map(s => s.vh));
  assert.equal(SECTIONS[18].vh, longest, 'the stones are the longest section');
});

test('progressToU and uToProgress are inverse, monotone and clamped', () => {
  let last = -1;
  for (let i = 0; i <= 10000; i++) {
    const p = i / 10000;
    const u = progressToU(p);
    assert.ok(u >= 0 && u <= 20, `u ${u}`);
    assert.ok(u >= last, 'monotone');
    last = u;
    assert.ok(Math.abs(uToProgress(u) - p) < 1e-12, `p ${p} -> u ${u} -> ${uToProgress(u)}`);
  }
  for (let i = 0; i <= 10000; i++) {
    const u = (20 * i) / 10000;
    assert.ok(Math.abs(progressToU(uToProgress(u)) - u) < 1e-9, `u ${u}`);
  }
  assert.equal(progressToU(0), 0);
  assert.equal(progressToU(1), 20);
  assert.equal(progressToU(-3), 0);
  assert.equal(progressToU(7), 20);
  assert.equal(progressToU(Number.NaN), 0);
  assert.equal(uToProgress(0), 0);
  assert.equal(uToProgress(20), 1);
  assert.equal(uToProgress(-1), 0);
  assert.equal(uToProgress(99), 1);
  assert.equal(uToProgress(Number.NaN), 0);
  // section i starts where its scroll starts, and u is linear in scroll inside a section
  for (let i = 0; i < 20; i++) {
    assert.ok(Math.abs(uToProgress(i) - SECTION_STARTS_VH[i] / totalVh()) < 1e-15);
    const { p0, p1 } = sectionRange(i);
    for (const f of [0.25, 0.5, 0.75]) assert.ok(Math.abs(progressToU(p0 + f * (p1 - p0)) - (i + f)) < 1e-9);
  }
});

test('sectionAt floors and clamps; sectionRange matches the schedule', () => {
  assert.equal(sectionAt(0), 0);
  assert.equal(sectionAt(0.999), 0);
  assert.equal(sectionAt(1), 1);
  assert.equal(sectionAt(19.5), 19);
  assert.equal(sectionAt(20), 19);
  assert.equal(sectionAt(25), 19);
  assert.equal(sectionAt(-2), 0);
  assert.equal(sectionAt(Number.NaN), 0);
  const r = sectionRange(7);
  assert.equal(r.u0, 7);
  assert.equal(r.u1, 8);
  assert.equal(r.vh, SECTIONS[7].vh);
  assert.equal(r.startVh, SECTION_STARTS_VH[7]);
  assert.throws(() => sectionRange(20), RangeError);
  assert.throws(() => sectionRange(1.5), RangeError);
});

test('17 beat windows, each inside its section, never overlapping', () => {
  assert.equal(BEAT_WINDOWS.length, 17);
  BEAT_WINDOWS.forEach((w, b) => {
    assert.equal(w.index, b);
    assert.equal(w.section, b + 1);
    assert.equal(w.id, SECTIONS[b + 1].id);
    assert.ok(w.section < w.u0 && w.u0 < w.in1 && w.in1 <= w.out0 && w.out0 < w.u1 && w.u1 < w.section + 1, `beat ${b}`);
    if (b > 0) assert.ok(BEAT_WINDOWS[b - 1].u1 < w.u0, `beats ${b - 1} and ${b} overlap`);
  });
});

test('beatAt and beatOpacity follow the windows; hero, stones and coda have none', () => {
  let prevOpacity = 0;
  const seen = new Set();
  for (let i = 0; i <= 40000; i++) {
    const u = (20 * i) / 40000;
    const b = beatAt(u);
    const o = beatOpacity(u);
    assert.ok(Number.isInteger(b) && b >= -1 && b < 17);
    assert.ok(o >= 0 && o <= 1);
    if (b < 0) assert.equal(o, 0);
    else {
      const w = BEAT_WINDOWS[b];
      assert.ok(u >= w.u0 && u < w.u1);
      seen.add(b);
    }
    const s = sectionAt(u);
    if (s === 0 || s >= 18) assert.equal(b, -1, `u ${u}`);
    // fades are gradual: no jump of more than the steepest smoothstep step allows
    assert.ok(Math.abs(o - prevOpacity) < 0.05, `opacity jumps at u ${u}`);
    prevOpacity = o;
  }
  assert.equal(seen.size, 17);
  for (let s = 1; s <= 17; s++) {
    assert.equal(beatAt(s + 0.5), s - 1);
    assert.equal(beatOpacity(s + 0.5), 1);
    assert.equal(beatAt(s), -1, 'no text on the very first scroll of a section');
  }
  assert.equal(beatAt(Number.NaN), -1);
});

test('the schedule is pure: no imports, no clock, no DOM', async () => {
  const source = await readFile(new URL('../engine/timeline/schedule.js', import.meta.url), 'utf8');
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
  assert.doesNotMatch(code, /\bimport\b/);
  assert.doesNotMatch(code, /\b(?:Date|performance|window|document|Math\.random)\b/);
});
