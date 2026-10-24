import assert from 'node:assert/strict';
import test from 'node:test';
import { OceanEngine } from '../vendor/engine.js';

// Exercise the shipped engine and renderer with deterministic browser timing.
// Canvas calls are no-ops; drawImage records each actual rendered frame.
function browserEnvironment({ reducedMotion = false } = {}) {
  let now = 0;
  let nextFrame = 1;
  const frames = new Map();
  const resizeObservers = [];
  const intersectionObservers = [];
  const globalDescriptors = new Map();

  class EventTargetMock {
    listeners = new Map();
    addEventListener(name, handler) {
      if (!this.listeners.has(name)) this.listeners.set(name, new Set());
      this.listeners.get(name).add(handler);
    }
    removeEventListener(name, handler) {
      this.listeners.get(name)?.delete(handler);
      if (!this.listeners.get(name)?.size) this.listeners.delete(name);
    }
    dispatch(name, event = {}) {
      for (const handler of [...(this.listeners.get(name) ?? [])]) handler(event);
    }
    get listenerCount() {
      return [...this.listeners.values()].reduce((sum, set) => sum + set.size, 0);
    }
  }

  function canvasMock() {
    const canvas = {
      width: 0,
      height: 0,
      rendered: 0,
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 320, height: 240 }),
    };
    const context = {
      setTransform() {}, fillRect() {}, fillText() {}, beginPath() {},
      moveTo() {}, lineTo() {}, stroke() {},
      drawImage() { canvas.rendered++; },
    };
    canvas.getContext = () => context;
    return canvas;
  }

  const canvas = canvasMock();
  const media = Object.assign(new EventTargetMock(), { matches: reducedMotion });
  const documentElement = new EventTargetMock();
  const document = Object.assign(new EventTargetMock(), {
    hidden: false,
    documentElement,
    createElement: canvasMock,
  });
  const window = Object.assign(new EventTargetMock(), {
    devicePixelRatio: 3,
    matchMedia: () => media,
  });
  const globals = {
    window,
    document,
    getComputedStyle: () => ({ fontFamily: 'monospace' }),
    performance: { now: () => now },
    requestAnimationFrame: callback => {
      const id = nextFrame++;
      frames.set(id, callback);
      return id;
    },
    cancelAnimationFrame: id => frames.delete(id),
    ResizeObserver: class {
      disconnected = false;
      constructor(callback) { this.callback = callback; resizeObservers.push(this); }
      observe() {}
      disconnect() { this.disconnected = true; }
    },
    IntersectionObserver: class {
      disconnected = false;
      constructor(callback) { this.callback = callback; intersectionObservers.push(this); }
      observe() {}
      disconnect() { this.disconnected = true; }
    },
  };
  for (const [key, value] of Object.entries(globals)) {
    globalDescriptors.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }

  return {
    canvas, frames, media, document, window, documentElement,
    resizeObservers, intersectionObservers,
    tick(milliseconds) {
      now += milliseconds;
      const pending = [...frames.values()];
      frames.clear();
      for (const callback of pending) callback(now);
    },
    resize() { for (const observer of resizeObservers) observer.callback(); },
    setVisible(visible) {
      for (const observer of intersectionObservers) {
        observer.callback([{ isIntersecting: visible }]);
      }
    },
    setHidden(hidden) {
      document.hidden = hidden;
      document.dispatch('visibilitychange');
    },
    setReducedMotion(matches) {
      media.matches = matches;
      media.dispatch('change');
    },
    restore() {
      for (const [key, descriptor] of globalDescriptors) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else delete globalThis[key];
      }
    },
  };
}

function setup(t, options) {
  const browser = browserEnvironment(options);
  const engine = new OceanEngine(browser.canvas, undefined, 85);
  t.after(() => { engine.destroy(); browser.restore(); });
  return { browser, engine };
}

test('a saved pause keeps the initial frame and redraws safely on resize', t => {
  const { browser, engine } = setup(t);
  assert.equal(browser.canvas.rendered, 1, 'the initial frame exists before the first rAF');
  assert.equal(engine.world.fish.length, 85, 'the population override reaches World');
  assert.equal(browser.canvas.width, 480, 'DPR is capped at 1.5');
  engine.pause();
  const time = engine.world.time;
  const sharkPositions = engine.world.sharks.map(shark => [...shark.nodes]);
  browser.tick(60_000);
  assert.equal(browser.frames.size, 0);
  assert.equal(browser.canvas.rendered, 1);
  assert.equal(engine.world.time, time);
  assert.deepEqual(engine.world.sharks.map(shark => [...shark.nodes]), sharkPositions);
  browser.resize();
  assert.equal(browser.canvas.rendered, 2, 'resize redraws the paused ecosystem');
  assert.equal(engine.world.time, time);
});

test('pause and resume are idempotent and discard paused elapsed time', t => {
  const { browser, engine } = setup(t);
  browser.tick(10);
  const pending = [...browser.frames.keys()];
  const runningLast = engine.last;
  engine.resume();
  engine.resume();
  assert.deepEqual([...browser.frames.keys()], pending, 'resuming an active loop does not reschedule it');
  assert.equal(engine.last, runningLast);

  engine.pause();
  const pauseLast = engine.last;
  const pausedTime = engine.world.time;
  browser.tick(60_000);
  engine.pause();
  assert.equal(engine.last, pauseLast, 'repeated pause does not reset timing');
  engine.resume();
  const resumedPending = [...browser.frames.keys()];
  engine.resume();
  assert.deepEqual([...browser.frames.keys()], resumedPending);
  browser.tick(1000 / 30);
  assert.ok(engine.world.time > pausedTime);
  assert.ok(engine.world.time - pausedTime < 0.05, 'paused time is never simulated on resume');
});

for (const refreshRate of [60, 120, 144]) {
  test(`rendering stays at most 30 fps on a ${refreshRate} Hz display`, t => {
    const { browser, engine } = setup(t);
    const initialRenders = browser.canvas.rendered;
    for (let i = 0; i < refreshRate * 2; i++) browser.tick(1000 / refreshRate);
    const renders = browser.canvas.rendered - initialRenders;
    assert.ok(renders > 50 && renders <= 60, `rendered ${renders} frames in two seconds`);
    assert.ok(engine.world.time > 1.9 && engine.world.time <= 2.001,
      `fixed-timestep simulation advanced ${engine.world.time} seconds`);
    assert.ok(engine.world.fish.every(fish => [fish.x, fish.y, fish.vx, fish.vy].every(Number.isFinite)));
  });
}

test('reduced motion settles once and remains static', t => {
  const { browser, engine } = setup(t, { reducedMotion: true });
  assert.ok(Math.abs(engine.world.time - 4) < 0.02);
  assert.equal(browser.frames.size, 0);
  const time = engine.world.time;
  const rendered = browser.canvas.rendered;
  browser.tick(60_000);
  assert.equal(engine.world.time, time);
  assert.equal(browser.canvas.rendered, rendered);
  browser.resize();
  assert.equal(engine.world.time, time, 'resize does not settle the simulation again');
  engine.pause();
  engine.resume();
  assert.equal(browser.frames.size, 0, 'manual resume respects reduced motion');
  browser.setReducedMotion(false);
  assert.equal(browser.frames.size, 1);
  browser.tick(1000 / 30);
  assert.ok(engine.world.time > time);
  browser.setReducedMotion(true);
  assert.equal(browser.frames.size, 0);
  const nextTime = engine.world.time;
  browser.tick(60_000);
  assert.equal(engine.world.time, nextTime);
});

test('document visibility and intersection suspend and resume the loop', t => {
  const { browser, engine } = setup(t);
  browser.setHidden(true);
  const hiddenTime = engine.world.time;
  browser.tick(60_000);
  assert.equal(browser.frames.size, 0);
  assert.equal(engine.world.time, hiddenTime);
  browser.setHidden(false);
  assert.equal(browser.frames.size, 1);
  browser.tick(1000 / 30);
  assert.ok(engine.world.time - hiddenTime < 0.05);
  browser.setVisible(false);
  assert.equal(browser.frames.size, 0);
  const offscreenTime = engine.world.time;
  browser.tick(60_000);
  assert.equal(engine.world.time, offscreenTime);
  browser.setVisible(true);
  assert.equal(browser.frames.size, 1);
  engine.pause();
  browser.setHidden(true);
  browser.setHidden(false);
  browser.setVisible(false);
  browser.setVisible(true);
  assert.equal(browser.frames.size, 0, 'visibility cannot override an explicit pause');
});

test('destroy removes listeners, disconnects observers, and prevents restart', t => {
  const { browser, engine } = setup(t);
  const lateFrame = [...browser.frames.values()][0];
  engine.destroy();
  engine.destroy();
  assert.equal(browser.frames.size, 0);
  assert.equal(browser.document.listenerCount, 0);
  assert.equal(browser.window.listenerCount, 0);
  assert.equal(browser.documentElement.listenerCount, 0);
  assert.equal(browser.media.listenerCount, 0);
  assert.ok(browser.resizeObservers.every(observer => observer.disconnected));
  assert.ok(browser.intersectionObservers.every(observer => observer.disconnected));
  const rendered = browser.canvas.rendered;
  const time = engine.world.time;
  engine.pause();
  engine.resume();
  browser.resize();
  browser.setVisible(true);
  lateFrame(60_000);
  assert.equal(browser.frames.size, 0);
  assert.equal(browser.canvas.rendered, rendered);
  assert.equal(engine.world.time, time);
});
