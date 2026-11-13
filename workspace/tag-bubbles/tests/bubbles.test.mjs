import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { diameter, seed, step, respawn, RISE } from '../physics.js';
import { BUBBLE_FILES } from '../build.mjs';
import { pages } from '../../../site/pages.mjs';

const fixed = (values => () => values[(values.i = ((values.i ?? -1) + 1) % values.length)])([0.1, 0.5, 0.9, 0.3, 0.7]);

test('bubble size follows the label, within limits', () => {
  assert.equal(diameter('Quant'), 56);
  assert.equal(diameter('A much longer tag than usual'), 92);
  assert.ok(diameter('scikit-learn') > diameter('Python'));
});

test('seeded bubbles start inside the field, spread top to bottom', () => {
  const bubbles = seed(['Python', 'scikit-learn', 'Open Source'], 280, 220, fixed);
  for (const b of bubbles) {
    assert.ok(b.x >= 0 && b.x <= 280 - b.d + 6, `x ${b.x}`);
    assert.ok(b.alive);
  }
  assert.ok(bubbles[0].y < bubbles[2].y, 'first bubble starts higher than the last');
});

test('bubbles rise, stay inside the sides, and come back in at the bottom after leaving the top', () => {
  const [b] = seed(['Python'], 280, 220, fixed);
  const start = b.y;
  for (let i = 0; i < 30; i++) step([b], 280, 220, 1, i / 60, null, fixed);
  assert.ok(b.y < start, 'it rose');
  for (let i = 0; i < 2000; i++) {
    step([b], 280, 220, 1, i / 60, null, fixed);
    assert.ok(b.x >= 0 && b.x <= 280 - b.d + 1e-9, `x stays in the column: ${b.x}`);
    assert.ok(b.y + b.d >= -RISE * 3 && b.y <= 220, `y stays in range: ${b.y}`);
  }
});

test('popped bubbles stand still until they respawn at the bottom', () => {
  const [b] = seed(['Python'], 280, 220, fixed);
  b.alive = false;
  const { x, y } = b;
  step([b], 280, 220, 1, 0, null, fixed);
  assert.deepEqual([b.x, b.y], [x, y]);
  respawn(b, 280, 220, fixed);
  assert.equal(b.y, 220);
  assert.ok(b.alive);
});

test('the cursor pushes a nearby bubble away', () => {
  const [b] = seed(['Python'], 280, 220, fixed);
  b.x = 100; b.y = 100; b.vx = 0; b.vy = 0;
  step([b], 280, 220, 1, 0, { x: 100, y: 100 + b.d / 2 }, fixed);
  assert.ok(b.vx > 0, 'pushed right, away from a cursor on its left edge');
});

test('overlapping bubbles push apart', () => {
  const bubbles = seed(['Python', 'Python'], 280, 220, fixed);
  Object.assign(bubbles[0], { x: 100, y: 100, vx: 0, vy: 0 });
  Object.assign(bubbles[1], { x: 110, y: 100, vx: 0, vy: 0 });
  step(bubbles, 280, 220, 1, 0, null, fixed);
  assert.ok(bubbles[0].vx < bubbles[1].vx);
});

test('About and Research load the bubbles and keep the plain tag list for screen readers', () => {
  const output = pages();
  for (const file of ['about/index.html', 'research/index.html']) {
    const html = output.get(file);
    assert.match(html, /<link rel="stylesheet" href="\/tag-bubbles\/bubbles\.css">/, file);
    assert.match(html, /<script type="module" src="\/tag-bubbles\/bubbles\.js"><\/script>/, file);
    assert.match(html, /<ul class="tags">/, file);
  }
  assert.match(output.get('about/index.html'), /<script type="module" src="\/portrait\/about\.js"><\/script>/);
});

test('the page script is decoration only, and sound is off until the visitor turns it on', async () => {
  const source = await readFile(new URL('../bubbles.js', import.meta.url), 'utf8');
  assert.match(source, /setAttribute\('aria-hidden', 'true'\)/);
  assert.match(source, /let soundOn = false;/);
  assert.match(source, /prefers-reduced-motion/);
  assert.deepEqual(BUBBLE_FILES.sort(), ['bubbles.css', 'bubbles.js', 'physics.js']);
});
