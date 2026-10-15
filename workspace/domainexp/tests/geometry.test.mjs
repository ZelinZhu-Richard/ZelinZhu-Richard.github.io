import {test} from 'node:test';
import assert from 'node:assert/strict';
import {FrameTracker, DomainState, applyTrackingResult, convexHull, polygonArea, containRect, projectPoint} from '../geometry.js';
import {drawHands} from '../render.js';

export function hands() {
  const first = Array.from({length: 21}, () => ({x: .2, y: .7}));
  Object.assign(first, {0: {x: .25, y: .85}, 4: {x: .44, y: .65}, 5: {x: .22, y: .65}, 6: {x: .22, y: .5}, 7: {x: .22, y: .4}, 8: {x: .22, y: .3}, 17: {x: .12, y: .7}});
  return [first, first.map(p => ({x: 1 - p.x, y: 1 - p.y}))];
}

test('two open hand frames create a four-corner window regardless of detection order', () => {
  const tracker = new FrameTracker(), points = hands();
  const initial = tracker.update({landmarks: points}, 0);
  assert.equal(initial.valid, true);
  assert.equal(initial.corners.length, 4);
  assert.ok(polygonArea(initial.corners) > .05);
  const reordered = tracker.update({landmarks: [...points].reverse()}, 50);
  assert.deepEqual(reordered.corners, initial.corners);
});
test('tracking smooths movement without lagging after a long loss', () => {
  const tracker = new FrameTracker(), points = hands();
  const first = tracker.update({landmarks: points}, 0);
  const moved = points.map(hand => hand.map(p => ({x: p.x + .04, y: p.y})));
  const next = tracker.update({landmarks: moved}, 30);
  assert.ok(next.corners[0].x > first.corners[0].x && next.corners[0].x < first.corners[0].x + .04);
  const fresh = tracker.update({landmarks: moved}, 600);
  assert.ok(Math.abs(fresh.corners[0].x - first.corners[0].x - .04) < 1e-9);
});
test('framing works with rotated hands and swapped handedness labels', () => {
  const rotated = hands().map(hand => hand.map(p => ({x: 1 - p.y, y: p.x})));
  const tracker = new FrameTracker();
  assert.equal(tracker.update({landmarks: rotated, handedness: [[{score: .9, categoryName: 'Right'}], [{score: .9, categoryName: 'Right'}]]}, 0).valid, true);
});
test('missing, pinched, overlapping, and out-of-frame hands do not activate', () => {
  const tracker = new FrameTracker();
  assert.equal(tracker.update({landmarks: hands().slice(0, 1)}, 0).valid, false);
  const closed = hands(); closed[0][8] = {...closed[0][4]};
  assert.equal(tracker.update({landmarks: closed}, 0).valid, false);
  const overlap = hands(); overlap[1] = overlap[0].map(p => ({...p}));
  assert.equal(tracker.update({landmarks: overlap}, 0).valid, false);
  const outside = hands(); outside[0][8].y = -.1;
  assert.equal(tracker.update({landmarks: outside}, 0).valid, false);
  const invalid = hands(); invalid[0][8].x = NaN;
  assert.equal(tracker.update({landmarks: invalid}, 0).valid, false);
});
test('convex hull handles collinear and crossing input without a self-intersecting mask', () => {
  const hull = convexHull([{x: 0, y: 0}, {x: 1, y: 1}, {x: 1, y: 0}, {x: 0, y: 1}]);
  assert.equal(polygonArea(hull), 1);
  assert.equal(convexHull([{x: 0, y: 0}, {x: .2, y: 0}, {x: .5, y: 0}, {x: 1, y: 0}]).length, 2);
});
test('activation requires 150 ms of valid framing and expires after 200 ms without new tracking', () => {
  const state = new DomainState(), valid = {valid: true, corners: [], reason: 'Hold your frame'};
  assert.equal(state.update(valid, 0).active, false);
  assert.equal(state.update(valid, 100).active, false);
  assert.equal(state.update(valid, 150).active, true);
  assert.equal(state.snapshot(349).active, true);
  assert.equal(state.snapshot(350).active, false);
  assert.equal(state.update(valid, 400).active, false);
  state.update(valid, 500);
  assert.equal(state.update(valid, 550).active, true);
  assert.equal(state.snapshot(1000).frame, null);
});
test('relaxed bent fingers and ambiguous left/right classification still frame a window', () => {
  const points = hands();
  points[0][6] = {x: .15, y: .25};
  points[0][7] = {x: .16, y: .28};
  const frame = new FrameTracker().update({landmarks: points, handedness: [[{score: .2}], [{score: .9}]]}, 0);
  assert.equal(frame.valid, true);
  assert.equal(frame.hands.length, 2);
});
test('small hands can frame a usable window without the old minimum palm size', () => {
  const points = hands().map(hand => hand.map(p => ({x: .5 + (p.x - .5) * .2, y: .5 + (p.y - .5) * .2})));
  assert.equal(new FrameTracker().update({landmarks: points}, 0).valid, true);
});
test('one visible hand and pinched fingers retain tracking feedback without activating', () => {
  const tracker = new FrameTracker(), state = new DomainState();
  let result = state.update(tracker.update({landmarks: hands().slice(0, 1)}, 0), 0);
  assert.equal(result.active, false); assert.equal(result.hands.length, 1);
  assert.match(result.reason, /other hand/);
  const points = hands(); points[0][4] = {...points[0][8]};
  result = state.update(tracker.update({landmarks: points}, 40), 40);
  assert.equal(result.hands.length, 2); assert.equal(result.active, false);
  assert.equal(state.snapshot(240).hands.length, 0);
});
test('finger outlines use the mirrored camera mapping even with no active domain', () => {
  const circles = [], lines = [], ctx = {save() {}, restore() {}, beginPath() {}, stroke() {}, fill() {}, moveTo() {}, lineTo(x, y) {lines.push([x, y]);}, arc(x, y, radius) {circles.push({x, y, radius});}};
  const rect = containRect(640, 480, 800, 800), points = hands()[0];
  drawHands(ctx, [points], rect);
  assert.equal(circles.length, 21); assert.equal(lines.length, 21);
  assert.deepEqual(circles[8], {...projectPoint(points[8], rect), radius: 5});
});
test('300–600 ms inference results activate without flickering between results', () => {
  for (const latency of [300, 600]) {
    const tracker = new FrameTracker(), state = new DomainState();
    const result = {landmarks: hands()};
    assert.equal(applyTrackingResult(tracker, state, result, 0, latency).active, false);
    assert.equal(applyTrackingResult(tracker, state, result, latency + 16, latency * 2 + 16).active, true);
    assert.equal(state.snapshot(latency * 3 + 31).active, true);
    assert.equal(applyTrackingResult(tracker, state, result, latency * 2 + 32, latency * 3 + 32).active, true);
    assert.equal(state.snapshot(latency * 3 + 32 + Math.min(1200, latency * 2 + 100)).active, false);
  }
});
test('explicit hand loss clears immediately and a severely delayed result cannot revive it', () => {
  const tracker = new FrameTracker(), state = new DomainState(), result = {landmarks: hands()};
  applyTrackingResult(tracker, state, result, 0, 300);
  assert.equal(applyTrackingResult(tracker, state, result, 320, 620).active, true);
  const lost = applyTrackingResult(tracker, state, {landmarks: hands().slice(0, 1)}, 640, 940);
  assert.equal(lost.active, false); assert.equal(lost.frame, null); assert.equal(lost.hands.length, 1);
  const stale = applyTrackingResult(tracker, state, result, 960, 2460);
  assert.equal(stale.active, false); assert.equal(stale.hands.length, 0);
  assert.equal(applyTrackingResult(tracker, state, result, 2500, 2800).active, false);
});
test('invalid frames interrupt activation and reset removes every stale corner', () => {
  const state = new DomainState(), valid = {valid: true, corners: [], reason: 'Hold your frame'};
  state.update(valid, 0); state.update({valid: false}, 100);
  assert.equal(state.update(valid, 150).active, false);
  state.update(valid, 250); assert.equal(state.update(valid, 300).active, true);
  state.reset(); assert.equal(state.snapshot(310).frame, null);
});
test('video containment and mirrored landmarks align in portrait and landscape viewports', () => {
  const portrait = containRect(1280, 720, 375, 540);
  assert.equal(portrait.width, 375);
  assert.equal(projectPoint({x: 0, y: 0}, portrait).x, 375);
  assert.equal(projectPoint({x: 1, y: 1}, portrait).y, portrait.y + portrait.height);
  const landscape = containRect(720, 1280, 1280, 720);
  assert.equal(landscape.height, 720);
  assert.deepEqual(projectPoint({x: .5, y: .5}, landscape), {x: 640, y: 360});
  assert.equal(projectPoint({x: 0, y: 0}, portrait, false).x, 0);
});
