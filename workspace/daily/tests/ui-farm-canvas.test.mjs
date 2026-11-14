// The space farm painter runs its animation loop only while the farm is on screen AND the tab
// is visible. Browser-only code, so the DOM, canvas, observers and frames are faked here.
import test from 'node:test';
import assert from 'node:assert/strict';
import { placeholderArt } from '../app/art.js';
import { ownerViews } from '../app/fixtures/views.js';
import { canvasData, farmModel } from '../app/farm.js';
import { mountFarm } from '../app/farm-canvas.js';

const vm = ownerViews(Date.UTC(2026, 10, 12, 20, 30));
const data = JSON.stringify(canvasData(farmModel(vm.today, vm.pets, vm.header)));
void placeholderArt;

// A 2D context that accepts every call (gradients included) and draws nothing.
const sink = new Proxy(function () {}, { get: (t, k) => (k === Symbol.toPrimitive ? () => '' : sink), apply: () => sink, set: () => true });
const element = (extra = {}) => ({ style: {}, dataset: {}, addEventListener() {}, removeEventListener() {}, ...extra });

function setup() {
  const frames = new Set();
  let nextId = 1, io = null;
  const docListeners = new Map();
  globalThis.document = {
    hidden: false,
    createElement: () => element({ width: 0, height: 0, getContext: () => sink }),
    addEventListener: (type, fn) => docListeners.set(type, fn),
    removeEventListener: type => docListeners.delete(type),
  };
  globalThis.requestAnimationFrame = () => { const id = nextId++; frames.add(id); return id; };
  globalThis.cancelAnimationFrame = id => frames.delete(id);
  globalThis.IntersectionObserver = class { constructor(cb) { io = cb; } observe() {} disconnect() {} };
  globalThis.ResizeObserver = class { observe() {} disconnect() {} };
  const canvas = element({ clientWidth: 500, width: 0, height: 0, getContext: () => sink, getBoundingClientRect: () => ({ left: 0, top: 0, width: 500, height: 330 }) });
  const parts = { canvas, '.farm-stage': element(), '.farm-crew': element(), '.farm-tip': element({ hidden: true }) };
  const root = element({ isConnected: true, dataset: { farm: data }, querySelector: sel => parts[sel] });
  return {
    root,
    running: () => frames.size > 0,
    intersect: on => io([{ isIntersecting: on }]),
    tab: hidden => { document.hidden = hidden; docListeners.get('visibilitychange')?.(); },
  };
}

test('the loop waits for the observer, and returning to the tab never restarts it off screen', () => {
  const s = setup();
  mountFarm(s.root, { reduced: false });
  assert.equal(s.running(), false, 'no frames before the first intersection report');
  s.intersect(false);
  s.tab(true);
  s.tab(false);
  assert.equal(s.running(), false, 'off screen + tab visible again → still idle');
  s.intersect(true);
  assert.equal(s.running(), true, 'on screen and visible → animating');
  s.tab(true);
  assert.equal(s.running(), false, 'hidden tab stops it');
  s.tab(false);
  assert.equal(s.running(), true, 'back to the tab while on screen resumes it');
  s.intersect(false);
  assert.equal(s.running(), false, 'scrolled away stops it');
  mountFarm(null);
});

test('reduced motion never starts the loop; destroy stops it', () => {
  const s = setup();
  mountFarm(s.root, { reduced: true });
  s.intersect(true);
  assert.equal(s.running(), false);
  mountFarm(null);
  const t = setup();
  mountFarm(t.root, { reduced: false });
  t.intersect(true);
  assert.equal(t.running(), true);
  mountFarm(null);
  assert.equal(t.running(), false);
});
