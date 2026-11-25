import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { affineTrack, compileTrack, scalarTrack, stepTrack, vec3Track } from '../engine/timeline/tracks.js';
import {
  NOMINAL_ASPECT, TRANSITION_KINDS, VIEWPORTS, createFrameState, createTimeline, layoutFor, mergeOver, orbitInto,
} from '../engine/timeline/evaluate.js';
import { SECTIONS, beatAt, sectionAt } from '../engine/timeline/schedule.js';
import {
  ACTS, BEATS, BUILD_STAGES, CHOREOGRAPHY, CONTACT_U, CRANK_PER_U, CRANK_PHASE, GEARS, PARAM_RANGES, PLATE_LIFT_Y,
  RIDE, ROOM_INSTRUMENT, SECTION_PLAN, TRANSITIONS,
} from '../engine/choreo/choreography.mjs';
import { frameMap, orbitRig } from '../engine/choreo/rig.mjs';

/** The params ARCHITECTURE.md lists. */
const ARCH_PARAMS = ['draw', 'lift', 'train', 'crank', 'build', 'lights', 'screens', 'aurora', 'galaxy', 'brass', 'arms', 'stones', 'contact'];
const SAMPLES = 5000;
const timeline = createTimeline(CHOREOGRAPHY);
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const len = v => Math.hypot(v[0], v[1], v[2]);
const newCam = () => ({ position: [0, 0, 0], target: [0, 0, 0], fov: 0, roll: 0 });
const cloneCam = c => ({ position: c.position.slice(), target: c.target.slice(), fov: c.fov, roll: c.roll });

/** Left and right finite-difference slopes of f at u. */
function slopes(f, u, h = 1e-6) {
  return [(f(u) - f(u - h)) / h, (f(u + h) - f(u)) / h];
}
/** f is C1 at u (finite differences agree up to curvature and rounding). */
function assertC1(f, u, what) {
  const [l, r] = slopes(f, u);
  assert.ok(Math.abs(l - r) <= 2e-3 * (1 + Math.abs(l) + Math.abs(r)), `${what}: slope breaks at u = ${u} (${l} vs ${r})`);
}

// ================================================================ tracks ===

test('scalar easings: named shapes hit their keys and their midpoints', () => {
  const at = (ease, s) => scalarTrack([[0, 0, ease], [1, 1]]).evaluate(s);
  for (const ease of ['linear', 'in', 'out', 'inOut', 'smooth', 'cubic-bezier(0.42, 0, 0.58, 1)', [0.25, 0.1, 0.25, 1]]) {
    assert.equal(at(ease, 0), 0, String(ease));
    assert.equal(at(ease, 1), 1, String(ease));
    let last = 0;
    for (let i = 1; i <= 100; i++) {
      const v = at(ease, i / 100);
      assert.ok(v >= last - 1e-12, `${ease} monotone`);
      last = v;
    }
  }
  assert.equal(at('linear', 0.5), 0.5);
  assert.equal(at('in', 0.5), 0.25);
  assert.equal(at('out', 0.5), 0.75);
  assert.equal(at('inOut', 0.5), 0.5);
  assert.ok(near(at('cubic-bezier(0, 0, 1, 1)', 0.3), 0.3, 1e-9));
  assert.ok(near(at('cubic-bezier(0.42, 0, 0.58, 1)', 0.5), 0.5, 1e-9), 'symmetric curve passes the middle');
  assert.ok(near(at('cubic-bezier(0.42, 0, 0.58, 1)', 0.2) + at('cubic-bezier(0.42, 0, 0.58, 1)', 0.8), 1, 1e-9));
  assert.ok(near(at('cubic-bezier(0.25, 0.1, 0.25, 1)', 0.5), 0.8024033877399112, 1e-6), "CSS 'ease' at 0.5");
  assert.equal(at('hold', 0.99), 0);
  assert.throws(() => scalarTrack([[0, 0, 'bouncy'], [1, 1]]), /unknown ease/);
  assert.throws(() => scalarTrack([[0, 0, 'cubic-bezier(1.2, 0, 0.5, 1)'], [1, 1]]), RangeError);
});

test('scalar tracks clamp outside their keys, and treat NaN as the start', () => {
  const t = scalarTrack([[1, 2], [3, 5]]);
  assert.equal(t.evaluate(0), 2);
  assert.equal(t.evaluate(1), 2);
  assert.equal(t.evaluate(3), 5);
  assert.equal(t.evaluate(9), 5);
  assert.equal(t.evaluate(Number.NaN), 2);
  assert.equal(scalarTrack([[4, 7]]).evaluate(-1), 7);
  assert.equal(compileTrack(3.5).evaluate(10), 3.5);
});

test('smooth tracks are C1 at every key and never overshoot their keys', () => {
  const keys = [[0, 0], [0.7, 0.2], [1.1, 0.2], [2, 1], [2.3, 0.4], [3.4, 0.45], [4, 0]];
  const t = scalarTrack(keys);
  for (const [u, v] of keys) assert.ok(near(t.evaluate(u), v, 1e-12), `passes key ${u}`);
  for (const [u] of keys.slice(1, -1)) assertC1(u2 => t.evaluate(u2), u, 'smooth');
  for (let i = 0; i < keys.length - 1; i++) {
    const [u0, v0] = keys[i];
    const [u1, v1] = keys[i + 1];
    for (let k = 0; k <= 50; k++) {
      const v = t.evaluate(u0 + ((u1 - u0) * k) / 50);
      assert.ok(v >= Math.min(v0, v1) - 1e-12 && v <= Math.max(v0, v1) + 1e-12, `segment ${i} stays between its keys`);
    }
  }
});

test('a smooth segment takes the slope of a fixed-shape neighbour, so the key stays C1', () => {
  const t = scalarTrack([[0, 0], [1, 1, 'linear'], [2, 3], [3, 3.5]]);
  for (const u of [1, 2]) assertC1(x => t.evaluate(x), u, 'smooth next to linear');
  const [l, r] = slopes(x => t.evaluate(x), 1.5);
  assert.ok(near(l, 2, 1e-6) && near(r, 2, 1e-6), 'the linear segment keeps its rate');
  const b = scalarTrack([[0, 0, 'cubic-bezier(0.3, 0.6, 0.7, 0.9)'], [1, 1], [2, 0]]);
  assertC1(x => b.evaluate(x), 1, 'smooth after a bezier');
});

test('two fixed shapes meeting at different slopes throw unless the key declares a corner', () => {
  assert.throws(() => scalarTrack([[0, 0, 'linear'], [1, 1, 'linear'], [2, 3]], { name: 'kink' }), /kink.*slope breaks at u = 1/);
  assert.throws(() => scalarTrack([[0, 0, 'in'], [1, 1, 'linear'], [2, 2]]), /slope breaks/);
  assert.doesNotThrow(() => scalarTrack([[0, 0, 'linear'], [1, 1, 'linear'], [2, 2]]), 'same slope is fine');
  assert.doesNotThrow(() => scalarTrack([[0, 0, 'inOut'], [1, 1, 'inOut'], [2, 0]]), 'both at rest is fine');
  assert.doesNotThrow(() => scalarTrack([[0, 0, 'linear'], [1, 1, 'linear', { corner: true }], [2, 3]]));
  assert.doesNotThrow(() => scalarTrack([[0, 0, 'linear'], { u: 1, v: 1, ease: 'linear', corner: true }, [2, 3]]));
});

test('hold and duplicate-u keys are declared cuts; rest pins a slope to zero', () => {
  const h = scalarTrack([[0, 1, 'hold'], [2, 5], [3, 6]]);
  assert.equal(h.evaluate(1.999), 1);
  assert.equal(h.evaluate(2), 5);
  assert.deepEqual(h.cuts, [2]);
  const c = scalarTrack([[0, 0], [1, 1], [1, 4], [2, 5]]);
  assert.equal(c.evaluate(0.9999999) < 1.0001, true);
  assert.equal(c.evaluate(1), 4, 'right-continuous at a cut');
  assert.deepEqual(c.cuts, [1]);
  assert.throws(() => scalarTrack([[0, 0], [1, 1], [1, 2], [1, 3]]), /at most two keys/);
  assert.throws(() => scalarTrack([[0, 0], [2, 1], [1, 2]]), /u order/);
  const r = scalarTrack([[0, 0], [1, 1, undefined, { rest: true }], [2, 3]]);
  const [l, rr] = slopes(x => r.evaluate(x), 1);
  assert.ok(Math.abs(l) < 1e-4 && Math.abs(rr) < 1e-4);
});

test('vec3 tracks: through every key, C1 between curved segments, straight where asked', () => {
  const keys = [[0, [0, 0, 0]], [1, [1, 0, 0]], [1.5, [1.2, 0.8, 0]], [3, [3, 1, 2]], [4, [3, 1, 2]], [5, [4, 0, 2], undefined, { path: 'linear' }], [6, [6, 0, 2]]];
  const t = vec3Track(keys, { name: 'path' });
  for (const [u, p] of keys) assert.ok(len(sub(t.evaluate(u), p)) < 1e-12, `passes key at ${u}`);
  for (const [u] of keys.slice(1, -1)) for (let c = 0; c < 3; c++) assertC1(x => t.evaluate(x)[c], u, `component ${c}`);
  for (let k = 0; k <= 20; k++) {
    const p = t.evaluate(5 + k / 20);
    assert.ok(near(p[1], 0, 1e-12) && near(p[2], 2, 1e-12), 'the linear segment is straight');
  }
  // a repeated key: no NaN, and the camera is at rest there
  const [l, r] = slopes(x => t.evaluate(x)[0], 3);
  assert.ok(Math.abs(l) < 1e-3 && Math.abs(r) < 1e-3);
  for (let i = 0; i <= 600; i++) assert.ok(t.evaluate(i / 100).every(Number.isFinite));
});

test('vec3 tracks rest at a corner between two straight segments, so motion stays C1', () => {
  const t = vec3Track([[0, [0, 0, 0], undefined, { path: 'linear' }], [1, [1, 0, 0], undefined, { path: 'linear' }], [2, [1, 1, 0]]]);
  const [l, r] = slopes(x => t.evaluate(x)[0], 1);
  const [l2, r2] = slopes(x => t.evaluate(x)[1], 1);
  for (const s of [l, r, l2, r2]) assert.ok(Math.abs(s) < 1e-4, 'velocity is zero at the corner');
  assert.ok(near(t.evaluate(0.5)[1], 0, 1e-12), 'straight leg one');
  assert.ok(near(t.evaluate(1.5)[0], 1, 1e-12), 'straight leg two');
});

test('evaluateInto reuses its output; evaluate returns a fresh value', () => {
  const t = vec3Track([[0, [0, 0, 0]], [1, [1, 2, 3]]]);
  const out = new Float64Array(3);
  assert.equal(t.evaluateInto(out, 0.5), out);
  assert.notEqual(t.evaluate(0.5), t.evaluate(0.5));
  assert.deepEqual([...out], t.evaluate(0.5));
});

test('step and affine tracks', () => {
  const s = stepTrack([[0, 'plate'], [4, 'gears'], [9, 'room']]);
  assert.equal(s.evaluate(-1), 'plate');
  assert.equal(s.evaluate(3.99), 'plate');
  assert.equal(s.evaluate(4), 'gears');
  assert.equal(s.evaluate(25), 'room');
  assert.deepEqual(s.cuts, [4, 9]);
  const a = affineTrack(0.5, 2);
  assert.equal(a.evaluate(3), 6.5);
  assert.equal(compileTrack({ type: 'affine', at0: 1, perU: -1 }).evaluate(4), -3);
  assert.equal(compileTrack({ type: 'step', keys: [[0, 1], [1, 2]] }).evaluate(1), 2);
  assert.equal(compileTrack({ type: 'vec3', keys: [[0, [1, 2, 3]]] }).evaluate(0)[2], 3);
});

// ========================================================= choreography ===

test('17 beats and 20 sections; quiet zones are rectangles in NDC', () => {
  assert.equal(SECTION_PLAN.length, 20);
  SECTION_PLAN.forEach((s, i) => {
    assert.equal(s.section, i);
    assert.equal(s.id, SECTIONS[i].id);
    assert.equal(s.act, SECTIONS[i].act);
    assert.equal(typeof s.frame, 'string');
  });
  assert.deepEqual(SECTION_PLAN.filter(s => s.enter).map(s => [s.section, s.enter]), [[4, 'lift'], [9, 'fade'], [18, 'dissolve']]);
  assert.equal(BEATS.length, 17);
  BEATS.forEach((b, i) => {
    assert.equal(b.index, i);
    assert.equal(b.section, i + 1);
    assert.equal(b.id, `c${String(i + 1).padStart(2, '0')}`);
    for (const vp of VIEWPORTS) {
      const [x0, y0, x1, y1] = b.quiet[vp];
      assert.ok(-1 <= x0 && x0 < x1 && x1 <= 1 && -1 <= y0 && y0 < y1 && y1 <= 1, `beat ${i} ${vp}`);
    }
  });
});

test('every ARCHITECTURE.md param is choreographed with a declared range', () => {
  assert.deepEqual([...timeline.params].sort(), [...ARCH_PARAMS].sort());
  assert.deepEqual(Object.keys(PARAM_RANGES).sort(), [...ARCH_PARAMS].sort());
  for (const name of ARCH_PARAMS) assert.deepEqual([...timeline.ranges[name]], [...PARAM_RANGES[name]]);
  assert.deepEqual([...timeline.acts], [...ACTS]);
  assert.deepEqual(timeline.transitions.map(t => [t.from, t.to, t.b, t.kind]), TRANSITIONS.map(t => [t.from, t.to, t.u[1], t.kind]));
  for (const t of timeline.transitions) assert.ok(TRANSITION_KINDS.includes(t.kind));
  assert.ok(Object.isFrozen(CHOREOGRAPHY) && Object.isFrozen(CHOREOGRAPHY.land.params.draw.keys));
});

// ============================================================= timeline ===

/** Every number reachable in a FrameState. */
function numbers(frame) {
  const out = [frame.u, frame.section, frame.beat, ...frame.camera.position, ...frame.camera.target, frame.camera.fov, frame.camera.roll];
  for (const a of frame.acts) out.push(a.weight);
  if (frame.transition) out.push(frame.transition.t);
  if (frame.cameraB) out.push(...frame.cameraB.position, ...frame.cameraB.target, frame.cameraB.fov, frame.cameraB.roll);
  for (const name of timeline.params) out.push(frame.params[name]);
  return out;
}

/** 5000 + 1 frames across the story, for one viewport. */
function sweep(vp, n = SAMPLES) {
  const frames = [];
  for (let i = 0; i <= n; i++) frames.push(timeline.evaluate((20 * i) / n, vp));
  return frames;
}
const SWEEPS = Object.fromEntries(VIEWPORTS.map(vp => [vp, sweep(vp)]));

test('no NaN over 5000 samples of u, in both viewports', () => {
  for (const vp of VIEWPORTS) {
    for (const f of SWEEPS[vp]) {
      assert.equal(f.viewport, vp);
      for (const x of numbers(f)) assert.ok(Number.isFinite(x), `${vp} u ${f.u}: ${x}`);
      for (const cam of [f.camera, f.cameraB].filter(Boolean)) {
        assert.ok(cam.fov > 0 && cam.fov < 120, `fov ${cam.fov}`);
        assert.ok(len(sub(cam.target, cam.position)) > 1e-6, 'camera looks somewhere');
      }
    }
  }
});

test('act weights sum to 1; one act, or the two of a transition', () => {
  for (const vp of VIEWPORTS) {
    for (const f of SWEEPS[vp]) {
      assert.ok(f.acts.length === 1 || f.acts.length === 2);
      const sum = f.acts.reduce((s, a) => s + a.weight, 0);
      assert.ok(near(sum, 1, 1e-12), `${vp} u ${f.u}: weights sum to ${sum}`);
      for (const a of f.acts) assert.ok(a.weight >= 0 && a.weight <= 1 && ACTS.includes(a.id));
      assert.equal(f.acts[0].id, SECTIONS[f.section].act, 'acts[0] is the section\'s act');
      if (f.acts.length === 2) {
        assert.ok(f.transition && f.cameraB);
        assert.equal(f.transition.from, f.acts[0].id);
        assert.equal(f.transition.to, f.acts[1].id);
        assert.ok(near(f.transition.t, f.acts[1].weight, 0));
      } else {
        assert.equal(f.transition, null);
        assert.equal(f.cameraB, null);
      }
    }
  }
  // inside each window t eases 0 -> 1, and the next act owns its first section outright
  for (const tr of timeline.transitions) {
    assert.equal(timeline.evaluate(tr.a, 'land').transition.t, 0);
    let last = -1;
    for (let k = 0; k < 100; k++) {
      const t = timeline.evaluate(tr.a + ((tr.b - tr.a) * k) / 100, 'land').transition.t;
      assert.ok(t > last || (k === 0 && t === 0));
      last = t;
    }
    const after = timeline.evaluate(tr.b, 'land');
    assert.deepEqual(after.acts.map(a => [a.id, a.weight]), [[tr.to, 1]]);
  }
});

test('beat and section in the frame follow the schedule; u is clamped', () => {
  for (const f of SWEEPS.land) {
    assert.equal(f.section, sectionAt(f.u));
    assert.equal(f.beat, beatAt(f.u));
  }
  assert.equal(timeline.evaluate(-5, 'land').u, 0);
  assert.equal(timeline.evaluate(42, 'land').u, 20);
  assert.equal(timeline.evaluate(Number.NaN, 'port').u, 0);
  assert.throws(() => timeline.evaluate(1, 'square'), TypeError);
  assert.throws(() => timeline.evaluate(1), TypeError);
});

test('camera continuity: inside a section no jump beyond the threshold except at declared cuts', () => {
  const MAX_PER_VH = 0.12; // camera travel per viewport height of scroll, as a fraction of its viewing distance
  const n = 20000;
  for (const vp of VIEWPORTS) {
    const cuts = timeline.cuts(vp);
    const frame = createFrameState();
    let prev = null;
    for (let i = 0; i <= n; i++) {
      const u = (20 * i) / n;
      timeline.evaluateInto(frame, u, vp);
      const now = { u, section: frame.section, ids: frame.acts.map(a => a.id), cams: [cloneCam(frame.camera), frame.cameraB && cloneCam(frame.cameraB)] };
      if (prev) {
        if (prev.ids[0] !== now.ids[0]) assert.notEqual(prev.section, now.section, `${vp}: camera world changes inside section ${now.section}`);
        for (let k = 0; k < 2; k++) {
          const id = now.ids[k];
          const j = prev.ids.indexOf(id);
          if (!id || j < 0) continue;
          if (cuts.some(c => c.act === id && c.u > prev.u && c.u <= u)) continue;
          const a = prev.cams[j];
          const b = now.cams[k];
          const dist = len(sub(b.position, b.target));
          const vh = SECTIONS[sectionAt(prev.u)].vh * (u - prev.u);
          assert.ok(len(sub(b.position, a.position)) / dist / vh <= MAX_PER_VH, `${vp} ${id}: position jumps at u ${u}`);
          assert.ok(len(sub(b.target, a.target)) / dist / vh <= 2 * MAX_PER_VH, `${vp} ${id}: target jumps at u ${u}`);
        }
      }
      prev = now;
    }
  }
});

test('camera angular speed is bounded (degrees per viewport height of scroll)', () => {
  const MAX_DEG_PER_VH = 2.5;
  const n = 20000;
  const dirOf = c => {
    const d = sub(c.target, c.position);
    const l = len(d);
    return [d[0] / l, d[1] / l, d[2] / l];
  };
  for (const vp of VIEWPORTS) {
    let worst = 0;
    for (const act of ACTS) {
      let prev = null;
      for (let i = 0; i <= n; i++) {
        const u = (20 * i) / n;
        const f = timeline.evaluate(u, vp);
        const k = f.acts.findIndex(a => a.id === act);
        if (k < 0) {
          prev = null;
          continue;
        }
        const d = dirOf(k === 0 ? f.camera : f.cameraB);
        const roll = (k === 0 ? f.camera : f.cameraB).roll;
        if (prev) {
          const vh = SECTIONS[sectionAt(prev.u)].vh * (u - prev.u);
          const turn = Math.acos(Math.min(1, d[0] * prev.d[0] + d[1] * prev.d[1] + d[2] * prev.d[2])) / (Math.PI / 180);
          const rate = (turn + Math.abs(roll - prev.roll)) / vh;
          worst = Math.max(worst, rate);
          assert.ok(rate <= MAX_DEG_PER_VH, `${vp} ${act}: turns ${rate.toFixed(2)} deg/vh at u ${u}`);
        }
        prev = { u, d, roll };
      }
    }
    assert.ok(worst > 0.5, 'the measure sees motion');
  }
});

test('every camera channel and param is C1 at its keys (no undeclared corners)', () => {
  const portSpec = mergeOver(CHOREOGRAPHY.land, CHOREOGRAPHY.port);
  for (const [vp, spec] of [['land', CHOREOGRAPHY.land], ['port', portSpec]]) {
    for (const [name, p] of Object.entries(spec.params)) {
      if (p.type === 'affine') continue;
      const t = compileTrack(p, name);
      for (const u of t.us) if (!t.cuts.includes(u)) assertC1(x => t.evaluate(x), u, `${vp} param ${name}`);
    }
    for (const [act, rig] of Object.entries(spec.cameras)) {
      for (const [ch, chSpec] of Object.entries(rig)) {
        if (ch === 'rig') continue;
        const t = chSpec.type === 'vec3' ? vec3Track(chSpec.keys) : scalarTrack(chSpec.keys);
        for (const u of t.us) {
          if (t.cuts.includes(u)) continue;
          if (t.type === 'vec3') for (let c = 0; c < 3; c++) assertC1(x => t.evaluate(x)[c], u, `${vp} ${act}.${ch}[${c}]`);
          else assertC1(x => t.evaluate(x), u, `${vp} ${act}.${ch}`);
        }
      }
    }
  }
  assert.deepEqual(timeline.cuts('land'), [], 'this draft declares no camera cuts');
  assert.deepEqual(timeline.cuts('port'), []);
});

test('crank is an exact linear function of u, and monotonic', () => {
  for (const vp of VIEWPORTS) {
    let last = -Infinity;
    for (const f of SWEEPS[vp]) {
      assert.equal(f.params.crank, CRANK_PHASE + CRANK_PER_U * f.u);
      assert.ok(f.params.crank > last);
      last = f.params.crank;
    }
  }
  assert.ok(CRANK_PHASE >= 0 && CRANK_PHASE < 2 * Math.PI);
});

test('the §7 ride stays on one pinion tooth for a whole revolution', () => {
  assert.ok(near(CRANK_PER_U * (RIDE.to - RIDE.from), 2 * Math.PI, 1e-12), 'one revolution');
  assert.ok(RIDE.from >= 7 && RIDE.to <= 8.1);
  for (const vp of VIEWPORTS) {
    const cam = newCam();
    const rel = [];
    for (let i = 0; i <= 200; i++) {
      const u = RIDE.from + ((RIDE.to - RIDE.from) * i) / 200;
      timeline.cameraInto(cam, 'gears', u, vp);
      const crank = CRANK_PHASE + CRANK_PER_U * u;
      const dx = cam.position[0] - GEARS.pinion[0];
      const dz = cam.position[2] - GEARS.pinion[2];
      const angle = Math.atan2(-dz, dx); // world angle: dir(a) = (cos a, 0, -sin a)
      rel.push({ phase: (((angle - crank) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI), r: Math.hypot(dx, dz), y: cam.position[1] });
    }
    for (const x of rel) {
      assert.ok(near(x.phase, rel[0].phase, 1e-9), `${vp}: the camera slips on the tooth`);
      assert.ok(near(x.r, rel[0].r, 1e-9) && near(x.y, rel[0].y, 1e-9));
    }
    if (vp === 'land') assert.ok(near(rel[0].phase, Math.PI, 0.25), 'land rides opposite the crank arm (give or take the shift)');
  }
});

test('the two worlds stay registered across the lift and the dissolve', () => {
  const map = frameMap(ROOM_INSTRUMENT);
  for (const vp of VIEWPORTS) {
    const [lift, , dissolve] = timeline.transitions;
    for (let i = 0; i <= 60; i++) {
      const u = lift.a + ((lift.b - lift.a) * i) / 60;
      const plate = timeline.cameraInto(newCam(), 'plate', u, vp);
      const gears = timeline.cameraInto(newCam(), 'gears', u, vp);
      const d = sub(plate.position, [gears.position[0], gears.position[1] + PLATE_LIFT_Y, gears.position[2]]);
      assert.ok(len(d) < 1e-9, `${vp}: plate and gears cameras differ at u ${u}`);
      assert.ok(near(plate.fov, gears.fov, 1e-9));
    }
    for (let i = 0; i <= 60; i++) {
      const u = dissolve.a + ((dissolve.b - dissolve.a) * i) / 60;
      const room = timeline.cameraInto(newCam(), 'room', u, vp);
      const space = timeline.cameraInto(newCam(), 'space', u, vp);
      const err = len(sub(map.toWorld(space.position), room.position)) / len(sub(room.position, room.target));
      assert.ok(err < 0.01, `${vp}: room and space cameras drift apart at u ${u} (${err})`);
    }
  }
});

test('every param stays in its declared range, and the storyboard beats land where they should', () => {
  for (const vp of VIEWPORTS) {
    for (const f of SWEEPS[vp]) {
      for (const name of timeline.params) {
        const [lo, hi] = timeline.ranges[name];
        const v = f.params[name];
        assert.ok(v >= lo - 1e-12 && v <= hi + 1e-12, `${vp} ${name} = ${v} at u ${f.u}`);
      }
    }
  }
  const p = u => timeline.evaluate(u, 'land').params;
  // lights and screens: on in §10, off in §17
  for (const k of ['lights', 'screens']) {
    assert.equal(p(9.95)[k], 0);
    assert.equal(p(10.95)[k], 1);
    assert.equal(p(16.99)[k], 1);
    assert.equal(p(17.3)[k], 0);
  }
  // brass 1 -> 0 and arms 0 -> 1 across 17 -> 18, monotone
  assert.equal(p(17).brass, 1);
  assert.equal(p(18).brass, 0);
  assert.equal(p(17).arms, 0);
  assert.equal(p(18).arms, 1);
  for (let k = 1; k <= 100; k++) {
    assert.ok(p(17 + k / 100).brass <= p(17 + (k - 1) / 100).brass);
    assert.ok(p(17 + k / 100).arms >= p(17 + (k - 1) / 100).arms);
  }
  // build rises in steps across 4..16 and never falls
  let last = 0;
  let plateaus = 0;
  let flat = false;
  for (const f of SWEEPS.land) {
    assert.ok(f.params.build >= last - 1e-12, `build falls at u ${f.u}`);
    const isFlat = f.params.build === last;
    if (isFlat && !flat && f.u > 3.6 && f.u < 17) plateaus++;
    flat = isFlat;
    last = f.params.build;
  }
  assert.ok(plateaus >= 8, `build rises in steps (${plateaus} plateaus)`);
  assert.equal(p(3.6).build, 0);
  assert.equal(p(16.9).build, 1);
  for (let i = 1; i < BUILD_STAGES.length; i++) assert.ok(BUILD_STAGES[i].level > BUILD_STAGES[i - 1].level && BUILD_STAGES[i].u[0] >= BUILD_STAGES[i - 1].u[1]);
  // the train: one gear by the lift, two in §5, three in §6
  assert.equal(p(3.5).train, 1);
  assert.equal(p(5.95).train, 2);
  assert.equal(p(6.8).train, 3);
  // the plate draws in §1-2 and lifts in §3; labels only on the stones; contact seals in the coda
  assert.equal(p(0.5).draw, 0);
  assert.equal(p(3).draw, 1);
  assert.equal(p(3.65).lift, 1);
  assert.equal(p(17.5).stones, 0);
  assert.equal(p(18.5).stones, 1);
  assert.equal(p(19.5).stones, 0);
  assert.equal(p(CONTACT_U).contact, 1);
  assert.equal(p(18.9).contact, 0);
  assert.equal(p(12).aurora > 0, true);
  assert.equal(p(19).aurora, 0);
  assert.equal(p(19).galaxy, 1);
});

test("'port' overrides merge over 'land'", () => {
  const base = { a: 1, b: { c: [1, 2], d: { e: 3, f: 4 } }, g: [5] };
  const over = { b: { c: [9], d: { f: 8 } }, h: 7 };
  const merged = mergeOver(base, over);
  assert.deepEqual(merged, { a: 1, b: { c: [9], d: { e: 3, f: 8 } }, g: [5], h: 7 });
  assert.deepEqual(base, { a: 1, b: { c: [1, 2], d: { e: 3, f: 4 } }, g: [5] }, 'base untouched');
  assert.equal(mergeOver(base, undefined), base);
  // a choreography whose port overrides only one camera channel and one param
  const mini = {
    acts: ACTS,
    transitions: TRANSITIONS,
    land: {
      params: { x: { range: [0, 1], keys: [[0, 0], [20, 1]] }, y: { range: [0, 5], keys: [[0, 2]] } },
      cameras: Object.fromEntries(ACTS.map(a => [a, { rig: 'look', position: [0, 0, 5], target: [0, 0, 0], fov: 40 }])),
    },
    port: { params: { y: { keys: [[0, 3]] } }, cameras: { room: { fov: 70 } } },
  };
  const tl = createTimeline(mini);
  assert.equal(tl.evaluate(12, 'land').camera.fov, 40);
  assert.equal(tl.evaluate(12, 'port').camera.fov, 70);
  assert.equal(tl.evaluate(2, 'port').camera.fov, 40, 'other acts keep land');
  assert.equal(tl.evaluate(10, 'port').params.x, tl.evaluate(10, 'land').params.x);
  assert.equal(tl.evaluate(10, 'port').params.y, 3);
  assert.equal(tl.evaluate(10, 'land').params.y, 2);
  // the real one: port reframes every act and shares every param
  for (const u of [0.5, 5.5, 12.5, 18.5]) {
    const l = timeline.evaluate(u, 'land');
    const q = timeline.evaluate(u, 'port');
    assert.notDeepEqual(l.camera, q.camera, `port frames u ${u} for itself`);
    assert.deepEqual(l.params, q.params);
  }
});

test('evaluateInto refills one frame and allocates nothing new; evaluate is fresh and deterministic', () => {
  const frame = createFrameState();
  const { acts, camera, params } = frame;
  const r1 = timeline.evaluateInto(frame, 3.8, 'land');
  const camB = frame.cameraB;
  const transition = frame.transition;
  assert.equal(r1, frame);
  assert.ok(camB && transition);
  timeline.evaluateInto(frame, 12, 'land');
  assert.equal(frame.cameraB, null);
  timeline.evaluateInto(frame, 17.6, 'port', 0.5);
  assert.equal(frame.acts, acts);
  assert.equal(frame.camera, camera);
  assert.equal(frame.params, params);
  assert.equal(frame.cameraB, camB, 'the spare camera is reused');
  assert.equal(frame.transition, transition, 'the transition record is reused');
  assert.deepEqual(Object.keys(frame).sort(), ['acts', 'beat', 'camera', 'cameraB', 'params', 'section', 'transition', 'u', 'viewport']);
  const a = timeline.evaluate(17.6, 'port', 0.5);
  assert.deepEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(frame)));
  assert.notEqual(a.camera, timeline.evaluate(17.6, 'port', 0.5).camera);
  assert.deepEqual(JSON.stringify(createTimeline(CHOREOGRAPHY).evaluate(7.7, 'land')), JSON.stringify(timeline.evaluate(7.7, 'land')));
  // a plain object works too
  const plain = timeline.evaluateInto({}, 9.5, 'land');
  assert.equal(plain.acts[0].id, 'room');
});

test('orbit shift puts the subject at NDC (2 shiftX, -2 shiftY)', () => {
  for (const [shiftX, shiftY, aspect] of [[0.124, 0, 1.6], [0.2, 0.03, 1.6], [0, 0.12, 390 / 844], [-0.1, -0.05, 1]]) {
    const subject = [0.3, 1.2, -0.4];
    const cam = orbitInto(newCam(), subject, -70, 25, 2, 34, 0, shiftX, shiftY, aspect);
    // project the subject through a lookAt camera with up = +Y
    const f = sub(cam.target, cam.position);
    const fl = len(f);
    const fw = [f[0] / fl, f[1] / fl, f[2] / fl];
    const r = [-fw[2], 0, fw[0]];
    const rl = len(r);
    const right = [r[0] / rl, 0, r[2] / rl];
    const up = [right[1] * fw[2] - right[2] * fw[1], right[2] * fw[0] - right[0] * fw[2], right[0] * fw[1] - right[1] * fw[0]];
    const v = sub(subject, cam.position);
    const z = v[0] * fw[0] + v[1] * fw[1] + v[2] * fw[2];
    const t = Math.tan((cam.fov * Math.PI) / 360);
    const ndcX = (v[0] * right[0] + v[2] * right[2]) / z / (t * aspect);
    const ndcY = (v[0] * up[0] + v[1] * up[1] + v[2] * up[2]) / z / t;
    assert.ok(near(ndcX, 2 * shiftX, 1e-9) && near(ndcY, -2 * shiftY, 1e-9), `shift ${shiftX}, ${shiftY}: ${ndcX}, ${ndcY}`);
  }
  // the plate's long lens from nearly overhead keeps screen-up on world -Z, like the sketch
  const plate = timeline.evaluate(0, 'land').camera;
  assert.ok(plate.position[2] > plate.target[2] && plate.fov <= 5);
  const flat = orbitRig([{ u: 0, subject: [0, 0, 0], az: -90, el: 30, dist: 10, fov: 30 }]);
  assert.equal(flat.rig, 'orbit');
  assert.ok(near(flat.size.keys[0][1], 10 * Math.tan(Math.PI / 12), 1e-12), 'dist becomes the frame half-height');
});

test('createTimeline validates the choreography; layoutFor picks the viewport', () => {
  assert.throws(() => createTimeline(null), TypeError);
  const noRoom = mergeOver(CHOREOGRAPHY, { land: { cameras: { room: null } } });
  assert.throws(() => createTimeline(noRoom), /cameras\.room/);
  assert.throws(() => createTimeline({ ...CHOREOGRAPHY, transitions: TRANSITIONS.slice(1) }), /hand-over at section 4/);
  assert.throws(() => createTimeline({ ...CHOREOGRAPHY, transitions: [{ ...TRANSITIONS[0], u: [3.5, 3.9] }, ...TRANSITIONS.slice(1)] }), /section boundary/);
  assert.throws(() => createTimeline({ ...CHOREOGRAPHY, transitions: [{ ...TRANSITIONS[0], kind: 'wipe' }, ...TRANSITIONS.slice(1)] }), /unknown kind/);
  assert.throws(() => createTimeline(mergeOver(CHOREOGRAPHY, { land: { params: { draw: { range: null } } } })), /range/);
  assert.equal(layoutFor(1440, 900), 'land');
  assert.equal(layoutFor(390, 844), 'port');
  assert.equal(layoutFor(0, 0), 'land');
  assert.ok(NOMINAL_ASPECT.port < 0.8 && NOMINAL_ASPECT.land > 1);
});

test('timeline and choreography modules are pure: engine-relative imports only, no three, no clock, no DOM', async () => {
  const root = new URL('../engine/', import.meta.url);
  for (const dir of ['timeline', 'choreo']) {
    const files = (await readdir(new URL(`${dir}/`, root))).filter(f => /\.m?js$/.test(f));
    assert.ok(files.length > 0);
    for (const file of files) {
      const url = new URL(`${dir}/${file}`, root);
      const code = (await readFile(url, 'utf8')).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
      for (const m of code.matchAll(/\b(?:import|export)\b[^'"]*?\bfrom\s*['"]([^'"]+)['"]/g)) {
        const target = fileURLToPath(new URL(m[1], url));
        assert.ok(m[1].startsWith('.') && target.startsWith(fileURLToPath(root)), `${dir}/${file} imports ${m[1]}`);
      }
      assert.doesNotMatch(code, /\bimport\s*\(/, `${dir}/${file} has a dynamic import`);
      assert.doesNotMatch(code, /\b(?:Date\.now|performance\.now|requestAnimationFrame|Math\.random)\b|\b(?:window|document|globalThis)\s*\./, `${dir}/${file}`);
    }
  }
});
