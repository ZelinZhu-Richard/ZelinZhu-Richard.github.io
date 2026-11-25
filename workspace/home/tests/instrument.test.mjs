// The instrument's pure half (engine/instrument): the gear train meshes at
// exact ratios, the build reveals parts in order, the arms' ending layouts
// keep the seven spheres apart from the cameras that frame them, the
// retracted desk layout never collides, and the plate drawing is drawn in
// order from the solid wheel's own data. Nothing here imports three.js.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  GEAR, TRAIN, RATIO, ARMS, STONES, FINAL_ANGLES, FINAL_VIEWS, VIEWPORTS, ARMILLARY, ROD, ROD_START, HOOP,
  trainLayout, meshNext, pitchRadius, dir,
} from '../engine/instrument/layout.js';
import { gearOutline, meshContact } from '../engine/instrument/gear.js';
import { STAGES, STAGE_ORDER, buildReveal, armPose, instrumentPose } from '../engine/instrument/pose.js';
import { projector } from '../engine/instrument/views.js';
import { DRAW_ORDER, plateStrokes, PLATE_Y } from '../engine/instrument/strokes.js';
import { rete } from '../engine/instrument/rete.js';

const HOME = fileURLToPath(new URL('..', import.meta.url));
const TAU = Math.PI * 2;
const wrap = (x, period) => x - period * Math.round(x / period);

// ------------------------------------------------------------- the train ---

test('the train is 48 : 24 : 12 teeth of one module, on pitch-circle centre distances', () => {
  assert.deepEqual([GEAR.main.z, GEAR.idler.z, GEAR.pinion.z], [48, 24, 12]);
  for (const c of [0, 0.7, 2.9, -4.1]) {
    const T = trainLayout(c);
    const dMI = Math.hypot(T.idler.c[0] - T.main.c[0], T.idler.c[2] - T.main.c[2]);
    const dIP = Math.hypot(T.pinion.c[0] - T.idler.c[0], T.pinion.c[2] - T.idler.c[2]);
    assert.ok(Math.abs(dMI - (pitchRadius(48) + pitchRadius(24))) < 1e-9);
    assert.ok(Math.abs(dIP - (pitchRadius(24) + pitchRadius(12))) < 1e-9);
  }
});

test('the gears turn at exact ratios: idler -1/2, main wheel +1/4 of the crank (modulo one tooth)', () => {
  const pitch = (z) => TAU / z;
  for (let k = 0; k < 200; k++) {
    const c = -6 + k * 0.061;
    const d = 0.0137;
    const A = trainLayout(c);
    const B = trainLayout(c + d);
    assert.ok(Math.abs(B.pinion.rot - A.pinion.rot - d) < 1e-12);
    assert.ok(Math.abs(wrap(B.idler.rot - A.idler.rot, pitch(24)) - (-d * 12) / 24) < 1e-9, `idler at ${c}`);
    assert.ok(Math.abs(wrap(B.main.rot - A.main.rot, pitch(48)) - (d * 12) / 48) < 1e-9, `main at ${c}`);
  }
  assert.ok(Math.abs(RATIO.main - 1 / 4) < 1e-12);
});

test('at every crank angle a tooth of one gear faces a gap of the next', () => {
  const phase = (gamma, theta, z) => wrap((gamma - theta) / (TAU / z), 1); // 0 = a tooth centred on gamma
  for (let k = 0; k < 120; k++) {
    const c = k * 0.173 - 7;
    const T = trainLayout(c);
    // pinion -> idler along the pinion-to-idler direction, idler -> main likewise
    const gPI = TRAIN.pinionAngle + Math.PI;
    const gIM = TRAIN.idlerAngle + Math.PI;
    const a1 = phase(gPI, T.pinion.rot, 12);
    const b1 = phase(gPI + Math.PI, T.idler.rot, 24);
    assert.ok(Math.abs(wrap(a1 + b1 - 0.5, 1)) < 1e-9, `pinion/idler phase at ${c}`);
    const a2 = phase(gIM, T.idler.rot, 24);
    const b2 = phase(gIM + Math.PI, T.main.rot, 48);
    assert.ok(Math.abs(wrap(a2 + b2 - 0.5, 1)) < 1e-9, `idler/main phase at ${c}`);
    // meshNext is what the layout uses
    assert.ok(Math.abs(wrap(meshNext(T.pinion.rot, 12, gPI, 24) - T.idler.rot, TAU)) < 1e-9);
  }
});

function inside(p, poly) {
  let s = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a[1] > p[1] !== b[1] > p[1] && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) s = !s;
  }
  return s;
}
function depthIn(p, poly) {
  let d = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const ab = [b[0] - a[0], b[1] - a[1]];
    const l2 = ab[0] ** 2 + ab[1] ** 2;
    const t = Math.max(0, Math.min(1, l2 ? ((p[0] - a[0]) * ab[0] + (p[1] - a[1]) * ab[1]) / l2 : 0));
    d = Math.min(d, Math.hypot(p[0] - a[0] - ab[0] * t, p[1] - a[1] - ab[1] * t));
  }
  return d;
}
function outlineAt(z, centre, rot) {
  // the solid maps drawing (x, y) to world (x, -z) and yaws by rot
  return gearOutline(z, GEAR.module).pts.map(([x, y]) => {
    const u = x * Math.cos(rot) - y * Math.sin(rot);
    const v = x * Math.sin(rot) + y * Math.cos(rot);
    return [centre[0] + u, -centre[2] + v];
  });
}

test('meshing teeth never pass through each other and keep touching', () => {
  for (let k = 0; k < 48; k++) {
    const c = k * 0.091;
    const T = trainLayout(c);
    const M = outlineAt(48, T.main.c, T.main.rot);
    const I = outlineAt(24, T.idler.c, T.idler.rot);
    const P = outlineAt(12, T.pinion.c, T.pinion.rot);
    for (const [A, B, name] of [[I, P, 'idler/pinion'], [M, I, 'main/idler']]) {
      // zero backlash: flanks touch; the polyline involutes may cross by a few microns at most
      for (const [X, Y] of [[A, B], [B, A]]) {
        for (const p of X) if (inside(p, Y)) assert.ok(depthIn(p, Y) < 2e-4, `${name} teeth overlap at crank ${c.toFixed(3)}`);
      }
    }
    assert.ok(meshContact(T).gap < 0.006, `pinion and idler drift apart at ${c.toFixed(3)}`);
  }
});

test('above the dial everything turns slower than the gears', () => {
  assert.ok(RATIO.celestial > 0 && RATIO.celestial < RATIO.main);
  assert.ok(RATIO.arms > 0 && RATIO.arms < RATIO.main);
  for (const s of RATIO.spin) assert.ok(Math.abs(s) < 1 / 2 && Math.abs(s) > 0);
  // the celestial rings follow the crank at exactly their ratio
  const a = instrumentPose({ crank: 2, build: 1 });
  const b = instrumentPose({ crank: 3, build: 1 });
  assert.ok(Math.abs(b.tau - a.tau - RATIO.celestial) < 1e-12);
});

// ----------------------------------------------------------- build order ---

test('build stages tile 0..1 in the fixed order', () => {
  assert.deepEqual(STAGE_ORDER, ['wheel', 'gears', 'base', 'column', 'rings', 'arms', 'spheres']);
  assert.deepEqual(STAGES.map((s) => s.id), STAGE_ORDER);
  assert.equal(STAGES[0].from, 0);
  assert.equal(STAGES[STAGES.length - 1].to, 1);
  for (let i = 1; i < STAGES.length; i++) assert.equal(STAGES[i].from, STAGES[i - 1].to);
});

test('build reveal is monotonic, starts empty, ends complete, and parts appear in order', () => {
  const parts = STAGES.flatMap((s) => s.parts.map((p) => ({ p, stage: s.id })));
  const first = {};
  let prev = buildReveal(0);
  for (const { p } of parts) assert.equal(prev[p], 0, `${p} at build 0`);
  for (let k = 1; k <= 2000; k++) {
    const b = k / 2000;
    const r = buildReveal(b);
    for (const { p } of parts) {
      assert.ok(r[p] >= prev[p] - 1e-12, `${p} goes backwards at ${b}`);
      assert.ok(r[p] >= 0 && r[p] <= 1);
      if (r[p] > 0 && first[p] === undefined) first[p] = b;
    }
    prev = r;
  }
  for (const { p } of parts) assert.equal(prev[p], 1, `${p} at build 1`);
  // every part of a stage starts after every part of the stage before has started
  for (let i = 1; i < STAGES.length; i++) {
    const before = Math.max(...STAGES[i - 1].parts.map((p) => first[p]));
    const after = Math.min(...STAGES[i].parts.map((p) => first[p]));
    assert.ok(after > before, `${STAGES[i].id} starts before ${STAGES[i - 1].id}`);
  }
  // and inside a stage, in the listed order
  for (const S of STAGES) for (let k = 1; k < S.parts.length; k++) assert.ok(first[S.parts[k]] > first[S.parts[k - 1]], `${S.parts[k]} order`);
});

// ------------------------------------------------------------------ arms ---

test('seven stones, one per arm, in site order', () => {
  assert.deepEqual(STONES, ['about', 'projects', 'research', 'art', 'fun', 'blog', 'daily']);
  assert.deepEqual(ARMS.map((a) => a.id), STONES);
  for (const vp of VIEWPORTS) assert.equal(FINAL_ANGLES[vp].length, 7);
});

test('at arms = 1 the spheres stand at the ending layout, full size', () => {
  for (const viewport of VIEWPORTS) {
    ARMS.forEach((A, i) => {
      for (const crank of [0, 5, 40]) {
        const p = armPose(i, { arms: 1, build: 1, crank, viewport });
        const d = dir(FINAL_ANGLES[viewport][i]);
        assert.ok(Math.abs(p.r - A.r) < 1e-9, `${A.id} radius`);
        assert.ok(Math.abs(p.centre[0] - d[0] * A.L) < 1e-9 && Math.abs(p.centre[2] - d[2] * A.L) < 1e-9, `${A.id} position (crank ${crank})`);
        assert.ok(Math.abs(p.centre[1] - (A.h + A.stem + A.r * HOOP.scale)) < 1e-6, `${A.id} height`);
      }
    });
  }
});

test('the ending layouts keep every sphere clear from the cameras that frame them', () => {
  for (const vp of VIEWPORTS) {
    const V = FINAL_VIEWS[vp];
    const [w, h] = V.size;
    const k = h / 900; // judged in px of a 900-high frame
    const poses = ARMS.map((_, i) => armPose(i, { arms: 1, build: 1, crank: 0, viewport: vp }));
    for (const daz of [-8, -4, 0, 4, 8]) {
      for (const del of [-5, 0, 5]) {
        const pr = projector({ ...V, az: V.az + daz, el: V.el + del }, w, h);
        const cs = poses.map((p, i) => ({ id: STONES[i], q: pr.point(p.centre), r: pr.radius(p.centre, p.hoopR) }));
        const ac = pr.point(ARMILLARY.c);
        const ar = pr.radius(ARMILLARY.c, ARMILLARY.rings[0].R);
        const c0 = pr.point([0, 0.3, 0]);
        const c1 = pr.point([0, 2.45, 0]);
        const tag = `${vp} az${daz >= 0 ? '+' : ''}${daz} el${del >= 0 ? '+' : ''}${del}`;
        for (let a = 0; a < 7; a++) {
          const A = cs[a];
          for (let b = a + 1; b < 7; b++) {
            const B = cs[b];
            const gap = (Math.hypot(A.q.x - B.q.x, A.q.y - B.q.y) - A.r - B.r) / k;
            assert.ok(gap >= 10, `${tag}: ${A.id} and ${B.id} ${gap.toFixed(1)} px apart`);
          }
          const gA = (Math.hypot(A.q.x - ac.x, A.q.y - ac.y) - A.r - ar) / k;
          assert.ok(gA >= 3, `${tag}: ${A.id} over the armillary (${gA.toFixed(1)} px)`);
          const inY = A.q.y > c1.y - A.r && A.q.y < c0.y + A.r;
          if (inY) assert.ok((Math.abs(A.q.x - c0.x) - A.r) / k >= 3, `${tag}: ${A.id} in front of the column`);
          const m = 6 * k;
          assert.ok(A.q.x - A.r > m && A.q.x + A.r < w - m && A.q.y - A.r > m && A.q.y + A.r < h - m, `${tag}: ${A.id} out of frame`);
        }
      }
    }
  }
});

const segDist3 = (p, a, b) => {
  const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const l2 = ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2;
  let t = l2 ? ((p[0] - a[0]) * ab[0] + (p[1] - a[1]) * ab[1] + (p[2] - a[2]) * ab[2]) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p[0] - a[0] - ab[0] * t, p[1] - a[1] - ab[1] * t, p[2] - a[2] - ab[2] * t);
};

test('retracted on the desk, the carousel of small spheres never collides as the crank turns', () => {
  for (let k = 0; k < 24; k++) {
    const crank = k * 2.7;
    const P = ARMS.map((_, i) => armPose(i, { arms: 0, build: 1, crank }));
    for (let a = 0; a < 7; a++) {
      for (let b = a + 1; b < 7; b++) {
        const d = Math.hypot(P[a].centre[0] - P[b].centre[0], P[a].centre[1] - P[b].centre[1], P[a].centre[2] - P[b].centre[2]);
        assert.ok(d > P[a].hoopR + P[b].hoopR + 0.05, `${STONES[a]} and ${STONES[b]} touch at crank ${crank}`);
      }
      // no sphere on another arm's rod
      for (let b = 0; b < 7; b++) {
        if (a === b) continue;
        const d = dir(P[b].angle);
        const h = ARMS[b].h;
        const rod0 = [d[0] * ROD_START, h, d[2] * ROD_START];
        const rod1 = [d[0] * P[b].L, h, d[2] * P[b].L];
        assert.ok(segDist3(P[a].centre, rod0, rod1) > P[a].hoopR + ROD.root + 0.03, `${STONES[a]} on ${STONES[b]}'s rod at crank ${crank}`);
      }
      // clear of the column and under the armillary's horizon
      assert.ok(Math.hypot(P[a].centre[0], P[a].centre[2]) > P[a].hoopR + 0.3, `${STONES[a]} in the column`);
      assert.ok(P[a].centre[1] + P[a].hoopR < ARMILLARY.c[1] - ARMILLARY.rings[0].R * 0.6, `${STONES[a]} up in the armillary`);
    }
  }
});

test('extended, no sphere touches another, a rod, or the armillary', () => {
  for (const vp of VIEWPORTS) {
    const P = ARMS.map((_, i) => armPose(i, { arms: 1, build: 1, crank: 0, viewport: vp }));
    for (let a = 0; a < 7; a++) {
      const C = P[a].centre;
      assert.ok(Math.hypot(C[0] - ARMILLARY.c[0], C[1] - ARMILLARY.c[1], C[2] - ARMILLARY.c[2]) > ARMILLARY.horizon.r1 + P[a].hoopR + 0.05, `${vp}: ${STONES[a]} in the armillary`);
      for (let b = 0; b < 7; b++) {
        if (a === b) continue;
        const d = Math.hypot(C[0] - P[b].centre[0], C[1] - P[b].centre[1], C[2] - P[b].centre[2]);
        assert.ok(d > P[a].hoopR + P[b].hoopR + 0.05, `${vp}: ${STONES[a]} and ${STONES[b]} touch`);
        const dd = dir(P[b].angle);
        const h = ARMS[b].h;
        const dist = segDist3(C, [dd[0] * ROD_START, h, dd[2] * ROD_START], [dd[0] * P[b].L, h, dd[2] * P[b].L]);
        assert.ok(dist > P[a].hoopR + ROD.root, `${vp}: ${STONES[a]} on ${STONES[b]}'s rod`);
      }
    }
  }
});

test('extending, each arm swings the short way from the carousel to its place', () => {
  for (const viewport of VIEWPORTS) {
    ARMS.forEach((A, i) => {
      const a0 = armPose(i, { arms: 0, build: 1, crank: 0, viewport }).angle;
      const a1 = armPose(i, { arms: 1, build: 1, crank: 0, viewport }).angle;
      assert.ok(Math.abs(a1 - a0) <= Math.PI + 1e-9, `${viewport}: ${A.id} sweeps ${(((a1 - a0) * 180) / Math.PI).toFixed(0)} deg`);
    });
  }
});

test('hover swings an arm toward the viewer and contact folds them all behind', () => {
  const front = -Math.PI / 2;
  const rest = armPose(0, { arms: 1, build: 1, viewport: 'land', front });
  const hov = armPose(0, { arms: 1, build: 1, viewport: 'land', front, hover: [1, 0, 0, 0, 0, 0, 0] });
  const toward = (p) => (p.centre[0] * dir(front)[0] + p.centre[2] * dir(front)[2]) / Math.hypot(p.centre[0], p.centre[2]);
  assert.ok(toward(hov) > 0.85 && toward(hov) > toward(rest));
  for (let i = 0; i < 7; i++) {
    const p = armPose(i, { arms: 1, build: 1, viewport: 'land', front, contact: 1 });
    assert.ok(toward(p) < -0.7, `${STONES[i]} not folded behind`);
  }
});

// ------------------------------------------------------------ the plate ---

test('the plate drawing draws in order, from the solid wheel\'s own outline and rete', () => {
  assert.equal(DRAW_ORDER[0].from, 0);
  assert.equal(DRAW_ORDER[DRAW_ORDER.length - 1].to, 1);
  for (let i = 1; i < DRAW_ORDER.length; i++) assert.equal(DRAW_ORDER[i].from, DRAW_ORDER[i - 1].to);
  const { wheel, fixed } = plateStrokes();
  for (const L of [wheel, fixed]) {
    for (let i = 0; i < L.count; i++) {
      const [a, b] = [L.o[2 * i], L.o[2 * i + 1]];
      assert.ok(a >= 0 && b <= 1 && b >= a, 'window inside 0..1');
    }
  }
  // the limb is the gear outline itself, drawn round in order
  const lim = DRAW_ORDER.find((d) => d.id === 'limb');
  const segs = [];
  for (let i = 0; i < wheel.count; i++) if (wheel.o[2 * i] >= lim.from && wheel.o[2 * i + 1] <= lim.to && wheel.o[2 * i + 1] > wheel.o[2 * i]) segs.push(i);
  const { pts } = gearOutline(GEAR.main.z, GEAR.module);
  assert.equal(segs.length, pts.length);
  segs.forEach((i, k) => {
    assert.ok(Math.abs(wheel.a[3 * i] - pts[k][0]) < 1e-12 && Math.abs(wheel.a[3 * i + 2] + pts[k][1]) < 1e-12);
    assert.equal(wheel.a[3 * i + 1], PLATE_Y);
    if (k) assert.ok(wheel.o[2 * i] >= wheel.o[2 * segs[k - 1]], 'drawn in order round the wheel');
  });
  // the rete's piercings are the solid's holes
  const R = rete();
  assert.ok(R.holes.length >= 10 && R.pointers.length === 12);
});

// ----------------------------------------------------------------- purity ---

test('the pure modules import nothing but each other', async () => {
  const seen = new Set();
  const visit = async (file) => {
    if (seen.has(file)) return;
    seen.add(file);
    const src = (await readFile(file, 'utf8')).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
    for (const m of src.matchAll(/\b(?:import|export)\s*(?:[\w$*{}\s,]+?\s*from\s*)?["']([^"']+)["']/g)) {
      assert.ok(m[1].startsWith('./') || m[1].startsWith('../'), `${file} imports ${m[1]}`);
      await visit(resolve(dirname(file), m[1]));
    }
  };
  for (const f of ['layout.js', 'gear.js', 'pose.js', 'views.js', 'strokes.js', 'rete.js', 'parts.js', 'geom.js', 'ao.js', 'lines.js', 'math.js']) {
    await visit(resolve(HOME, 'engine/instrument', f));
  }
  for (const f of seen) assert.ok(!/three|gsap/.test(await readFile(f, 'utf8').then((s) => (s.match(/from\s+["'][^"']+["']/g) || []).join(' '))), f);
});
