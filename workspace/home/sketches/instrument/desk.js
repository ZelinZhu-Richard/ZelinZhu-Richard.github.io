// Act 3: the desk at 3 a.m., engraved like the instrument. A desk edge, a
// big window with stars and pale aurora beyond, a balanced-arm lamp whose
// filament is the frame's orange, and four objects, one per interest:
//   loupe on a stack of printed image plates   machine learning
//   pen plotter drum drawing a forecast fan    statistics, forecasting
//   balance weighing two answer cards (A / B)  AI evaluation, judgement
//   skis against the window, aurora outside    people, off the keyboard
//
// mode 'lit'   the desk frames (lamp on).
// mode 'dark'  false space: only the room, as invisible occluders, so the
//              window's stars read as open sky; nothing else is drawn.
// mode 'ghost' the dissolve: solids become invisible occluders and only
//              broken, thinning outlines remain (the group's uDrop).

import * as THREE from 'three';
import { lathe, extrude, annulus, box, extrudeY, sweepBoard, rectLoop, GeoBuilder } from './geom.js';
import { solidMaterial, hullMaterial, occluderMaterial } from './materials.js';
import { LineSet } from './lines.js';
import { makeRng } from './rng.js';
import { LAYERS, quatFromTo, compose } from './machine.js';
import { ROOM, GROUND_Y, lampFrame, DEG } from './layout.js';
import { buildPoints } from './stars.js';

const V = (a) => new THREE.Vector3(a[0], a[1], a[2]);
const YV = new THREE.Vector3(0, 1, 0);
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const addv = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const nrmz = (a) => mul(a, 1 / (len(a) || 1));
const crossv = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

function yawQ(a) {
  return new THREE.Quaternion().setFromAxisAngle(YV, a);
}
function basis(o, ex, ey, ez) {
  return new THREE.Matrix4().makeBasis(V(ex), V(ey), V(ez)).setPosition(V(o));
}
function circle2(r, n = 48, cx = 0, cy = 0) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    out.push([cx + r * Math.cos(t), cy + r * Math.sin(t)]);
  }
  return out;
}

// Split a 2D polyline into the runs that lie inside (keep = true) or
// outside a circle.
function clipCircle(pts, closed, c, r, keepInside) {
  const P = closed ? [...pts, pts[0]] : pts;
  const runs = [];
  let cur = [];
  const inside = (p) => Math.hypot(p[0] - c[0], p[1] - c[1]) < r;
  for (let i = 0; i < P.length - 1; i++) {
    const a = P[i];
    const b = P[i + 1];
    const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.012));
    for (let k = 0; k <= n; k++) {
      if (k === 0 && i > 0) continue;
      const t = k / n;
      const p = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      if (inside(p) === keepInside) cur.push(p);
      else if (cur.length) {
        if (cur.length > 1) runs.push(cur);
        cur = [];
      }
    }
  }
  if (cur.length > 1) runs.push(cur);
  return runs;
}

// Simple motifs printed in the image plates' thumbnails (cell coords).
const MOTIFS = [
  [{ pts: circle2(0.11, 40), closed: true }],
  [{ pts: [[-0.13, -0.1], [0, 0.12], [0.13, -0.1]], closed: true }],
  [{ pts: [[0, -0.13], [0.13, 0], [0, 0.13], [-0.13, 0]], closed: true }],
  [{ pts: [[-0.2, -0.12], [-0.08, 0.07], [-0.01, -0.02], [0.08, 0.12], [0.2, -0.12]], closed: false }],
  [{ pts: circle2(0.05, 28), closed: true }, { pts: circle2(0.13, 40), closed: true }],
  [{ pts: Array.from({ length: 25 }, (_, i) => [-0.19 + i * 0.016, 0.07 * Math.sin(i * 0.52)]), closed: false }],
  [{ pts: circle2(0.05, 24, -0.08, -0.04), closed: true }, { pts: circle2(0.05, 24, 0.08, -0.04), closed: true }, { pts: circle2(0.05, 24, 0, 0.08), closed: true }],
  [{ pts: [[-0.12, -0.1], [0.12, -0.1], [0.12, 0.1], [-0.12, 0.1]], closed: true }, { pts: [[-0.12, -0.1], [0.12, 0.1]], closed: false }],
];

export function buildDesk(opts) {
  const { group, mode = 'lit', accent = 'filament', show = {} } = opts;
  const on = (k) => show[k] !== false;
  const root = new THREE.Group();
  const lines = new LineSet(group);
  const sky = new LineSet(group, { noFog: true, bias: 0 });
  const occ = occluderMaterial();
  const ghost = mode === 'ghost';
  const dark = mode === 'dark';
  const anchors = {};

  const M = (o) => solidMaterial({ group, ...o });
  const lampF = lampFrame();
  const pool = [lampF.filament[0] + lampF.axis[0] * 5.5, lampF.filament[2] + lampF.axis[2] * 5.5];
  const mats = {
    desk: M({ ground: true, groundDir: [0, 1], albedo: 0.85, hw: 0.8, fadeC: pool, fadeR: [7, 15] }),
    wall: M({ albedo: 0.42, hw: 0.7 }),
    wood: M({ albedo: 0.72, hw: 0.85 }),
    metal: M({ albedo: 1 }),
    dim: M({ albedo: 0.8, hw: 0.9 }),
    paper: M({ paper: true, albedo: 0.9 }),
    shade: M({ albedo: 0.55, spotFree: true, hw: 0.9 }),
    ski: M({ albedo: 0.85, hw: 0.9 }),
    accent: M({ accent: true, toneFloor: 0.55, hw: 1.1 }),
  };
  const Hm = (o) => hullMaterial({ group, ...o });
  const hulls = {
    big: Hm({ width: 1.3, tone: 0.95 }),
    mid: Hm({ width: 1.05, tone: 0.85 }),
    small: Hm({ width: 0.85, tone: 0.75 }),
    accent: Hm({ width: 1.4, accent: true }),
  };

  // one solid: its fill, its outline hull and its crease ribbons
  function put(res, matrix, mat, layer, hull, edgeW = 0.8, edgeTone = 0.6, acc = false, opt = {}) {
    const geo = res.geometry || res;
    const useAcc = acc && !ghost;
    if (!(ghost && opt.noGhostFill)) {
      const m = new THREE.Mesh(geo, ghost || dark ? occ : useAcc ? mats.accent : mat);
      m.matrixAutoUpdate = false;
      m.matrix.copy(matrix);
      m.layers.set(layer);
      root.add(m);
    }
    if (dark) return;
    if (hull && !(ghost && opt.noGhostFill)) {
      const h = new THREE.Mesh(geo, useAcc ? hulls.accent : hull);
      h.matrixAutoUpdate = false;
      h.matrix.copy(matrix);
      h.layers.set(LAYERS.INK);
      root.add(h);
    }
    if (res.edges && res.edges.length && edgeW > 0) {
      const keep = opt.edgeFilter ? res.edges.filter(opt.edgeFilter) : res.edges;
      lines.addEdges(keep, matrix, edgeW, edgeTone, useAcc);
    }
  }
  const I = new THREE.Matrix4();
  const UP = [0, 1, 0];

  // ------------------------------------------------------------ the room ---
  const W = ROOM.window;
  const wz = ROOM.wall.z;
  if (on('room')) {
    // the top sits a hair below GROUND_Y so the outlines of everything
    // standing on it win the depth test instead of z-fighting with it
    const d = ROOM.desk;
    const top = GROUND_Y - 0.004;
    const deskRes = extrudeY([rectLoop(d.x0, d.z0 + 0.02, d.x1, d.z1)], top - d.thick, top, { smoothAngle: 10 });
    put(deskRes, I, mats.desk, LAYERS.GROUND, hulls.big, 1.25, 0.75, false, {
      noGhostFill: true,
      edgeFilter: (e) => !(Math.abs(e.a[2] - d.z0 - 0.02) < 1e-3 && Math.abs(e.b[2] - d.z0 - 0.02) < 1e-3),
    });

    const wall = ROOM.wall;
    const hole = rectLoop(W.x0, W.y0, W.x1, W.y1);
    const wallRes = extrude([rectLoop(wall.x0, wall.y0, wall.x1, wall.y1), hole], wz - wall.thick, wz, { hatchAngle: 0, smoothAngle: 10 });
    const nearHole = (e) => Math.abs(e.a[0]) < 30 && e.a[1] < 30 && e.a[1] > -11;
    put(wallRes, I, mats.wall, LAYERS.GROUND, null, 0.9, 0.55, false, { noGhostFill: true, edgeFilter: nearHole });

    // window frame, recessed into the opening, one mullion
    const f = W.frame;
    const m0 = W.mullion - 0.15;
    const m1 = W.mullion + 0.15;
    const e = 0.012; // inset, so the frame never shares a plane with the jamb
    const frameRes = extrude(
      [rectLoop(W.x0 + e, W.y0 + e, W.x1 - e, W.y1 - e), rectLoop(W.x0 + f, W.y0 + f, m0, W.y1 - f), rectLoop(m1, W.y0 + f, W.x1 - f, W.y1 - f)],
      wz - 0.12 - W.depth, wz - 0.12, { hatchAngle: Math.PI / 2, smoothAngle: 10 },
    );
    put(frameRes, I, mats.wood, LAYERS.NOCAST, hulls.mid, 0.85, 0.65);
    const sill = box(W.x0 - 0.38, W.x1 + 0.38, W.y0 - 0.24, W.y0 + 0.02, wz - 0.42, wz + 0.4);
    put(sill, I, mats.wood, LAYERS.NOCAST, hulls.mid, 0.9, 0.7);
  }

  // ------------------------------------------------------------ the lamp ---
  if (on('lamp') && !dark) {
    const L = ROOM.lamp;
    const F = lampF;
    const baseC = [L.base[0], GROUND_Y, L.base[1]];
    const base = lathe([[0, 0], [1.05, 0], [1.05, 0.1], [0.99, 0.17], [0.74, 0.24], [0.4, 0.29], [0.3, 0.4], [0, 0.4]], { seg: 96 });
    put(base, compose(baseC), mats.metal, LAYERS.NOCAST, hulls.big, 0.85, 0.65);
    const P0 = [baseC[0], GROUND_Y + 0.55, baseC[2]];
    const E = L.elbow;
    const J = L.joint;
    const a1 = sub(E, P0);
    const a2 = sub(J, E);
    const pv = nrmz(crossv(a1, a2)); // pivot axis of the arm's joints
    const rod = (a, b, r) => {
      const dv = sub(b, a);
      const l = len(dv);
      const res = lathe([[0, 0], [r, 0], [r, l], [0, l]], { seg: 18, hatch: 'meridian', edges: false });
      put(res, compose(a, quatFromTo(YV, V(dv))), mats.metal, LAYERS.NOCAST, hulls.small, 0, 0);
    };
    const knuckle = (p, r, l) => {
      const res = lathe([[0, -l / 2], [r, -l / 2], [r, l / 2], [0, l / 2]], { seg: 28 });
      put(res, compose(p, quatFromTo(YV, V(pv))), mats.metal, LAYERS.NOCAST, hulls.small, 0.7, 0.6);
    };
    // bracket on the base, two pairs of rods, springs at the foot
    put(box(-0.16, 0.16, 0, 0.5, -0.16, 0.16), compose([baseC[0], GROUND_Y + 0.36, baseC[2]]), mats.metal, LAYERS.NOCAST, hulls.small, 0.7, 0.6);
    for (const s of [-1, 1]) {
      rod(addv(P0, mul(pv, 0.12 * s)), addv(E, mul(pv, 0.12 * s)), 0.045);
      rod(addv(E, mul(pv, 0.085 * s)), addv(J, mul(pv, 0.085 * s)), 0.04);
    }
    knuckle(P0, 0.11, 0.44);
    knuckle(E, 0.1, 0.36);
    knuckle(J, 0.09, 0.3);
    for (const s of [-1, 1]) {
      const A = addv(addv(P0, mul(a1, 0.06)), mul(pv, 0.27 * s));
      const B = addv(addv(P0, mul(a1, 0.46)), mul(pv, 0.27 * s));
      const k = nrmz(sub(B, A));
      const p1 = nrmz(crossv(k, pv));
      const p2 = crossv(k, p1);
      const pts = [];
      const turns = 17;
      const N = turns * 22;
      for (let i = 0; i <= N; i++) {
        const t = i / N;
        const w = t * turns * Math.PI * 2;
        const c = addv(A, mul(sub(B, A), t));
        pts.push(addv(c, addv(mul(p1, Math.cos(w) * 0.06), mul(p2, Math.sin(w) * 0.06))));
      }
      lines.polyline(pts, 0.6, 0.42);
      lines.seg(A, addv(P0, mul(pv, 0.2 * s)), [0, 0, 0], [0, 0, 0], 0.6, 0.42);
    }
    rod(J, F.apex, 0.05);

    // the shade: a closed thin shell, so its lining faces the bulb
    const shadeProfile = [[0, 0], [0.18, 0.02], [0.3, 0.1], [0.36, 0.25], [0.5, 0.45], [0.72, 0.75], [0.92, 1.05],
      [0.88, 1.05], [0.68, 0.765], [0.46, 0.47], [0.32, 0.27], [0.26, 0.13], [0.15, 0.06], [0, 0.04]];
    const shadeQ = quatFromTo(YV, V(F.axis));
    put(lathe(shadeProfile, { seg: 72, smoothAngle: 34 }), compose(F.apex, shadeQ), mats.shade, LAYERS.NOCAST, hulls.big, 0.9, 0.75);
    put(lathe([[0, 0.04], [0.13, 0.04], [0.13, 0.3], [0.09, 0.33], [0, 0.33]], { seg: 32 }), compose(F.apex, shadeQ), mats.shade, LAYERS.NOCAST, hulls.small, 0.6, 0.6);

    // filament: a coil across the axis on two support wires
    const ax = F.axis;
    const cAx = nrmz(crossv(ax, [0, 1, 0]));
    const e2 = crossv(cAx, ax);
    const coil = [];
    const turns = 7;
    const n = turns * 28;
    const coilL = 0.36;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const w = t * turns * Math.PI * 2;
      const c = addv(F.filament, mul(cAx, (t - 0.5) * coilL));
      coil.push(addv(c, addv(mul(ax, Math.cos(w) * 0.055), mul(e2, Math.sin(w) * 0.055))));
    }
    const filAcc = accent === 'filament' && !ghost;
    lines.polyline(coil, filAcc ? 1.5 : 0.8, 0.75, { accent: filAcc });
    const sock = addv(F.apex, mul(ax, 0.33));
    for (const s of [-1, 1]) {
      const end = addv(F.filament, mul(cAx, s * coilL * 0.5));
      lines.seg(end, addv(sock, mul(cAx, s * 0.06)), [0, 0, 0], [0, 0, 0], 0.6, 0.45);
    }
    anchors.lamp = { filament: F.filament, axis: F.axis, apex: F.apex, mouth: F.mouth, base: baseC, elbow: E, joint: J };

    // dust caught in the beam
    if (mode === 'lit' && on('dust')) {
      const rng = makeRng(0xd0d0);
      const pts = [];
      const u1 = nrmz(crossv(ax, [0, 0, 1]));
      const u2 = crossv(ax, u1);
      while (pts.length < 38) {
        const r = Math.sqrt(rng.next()) * Math.tan(26 * DEG);
        const t = rng.range(0, Math.PI * 2);
        const dvec = nrmz(addv(ax, addv(mul(u1, r * Math.cos(t)), mul(u2, r * Math.sin(t)))));
        const dist = rng.range(1.3, 5.2);
        const p = addv(F.filament, mul(dvec, dist));
        if (p[1] < GROUND_Y + 0.25) continue;
        pts.push({ p, size: rng.next() < 0.85 ? 1.0 : 1.35, alpha: rng.range(0.2, 0.5) });
      }
      const dots = buildPoints(pts, { name: 'beam-dust' });
      dots.layers.set(LAYERS.FX);
      root.add(dots);
    }
  }

  // -------------------------------------------- loupe on the image plates ---
  if (on('loupe') && !dark) {
    const LP = ROOM.loupe;
    const rng = makeRng(0x100b);
    const th = 0.028;
    let top = null;
    for (let i = 0; i < 5; i++) {
      const yaw = LP.yaw + (i < 4 ? rng.range(-6, 6) * DEG : 0);
      const off = i < 4 ? [rng.range(-0.1, 0.1), rng.range(-0.08, 0.08)] : [0, 0];
      const m = compose([LP.c[0] + off[0], GROUND_Y + i * th, LP.c[1] + off[1]], yawQ(yaw));
      put(box(-1.25, 1.25, 0, th, -0.9, 0.9), m, mats.paper, LAYERS.SOLID, hulls.small, 0.7, 0.55);
      if (i === 4) top = m;
    }
    const yTop = th; // the top plate's own top face, in its local frame
    const P = (x, z, dy = 0.002) => V([x, yTop + dy, z]).applyMatrix4(top).toArray();
    const ring = [-0.29, -0.5];
    const rIn = 0.5;
    const drawCell = (cx, cz, motifIdx, scale, about, clipKeepInside, clipR) => {
      const map = (p) => [about[0] + (cx - about[0] + p[0]) * scale, about[1] + (cz - about[1] - p[1]) * scale];
      const items = [{ pts: [[-0.25, -0.21], [0.25, -0.21], [0.25, 0.21], [-0.25, 0.21]], closed: true, w: 0.6, t: 0.42 }];
      for (const mm of MOTIFS[motifIdx]) items.push({ ...mm, w: 0.7, t: 0.72 });
      for (const it of items) {
        const pts = it.pts.map(map);
        for (const run of clipCircle(pts, it.closed, ring, clipR, clipKeepInside)) {
          lines.polyline(run.map((q) => P(q[0], q[1])), it.w * (scale > 1 ? 1.25 : 1), it.t, { normal: UP });
        }
      }
    };
    let k = 0;
    for (let j = 0; j < 3; j++) {
      for (let i = 0; i < 4; i++) {
        const cx = -1.12 + 0.25 + i * 0.58;
        const cz = -0.71 + 0.21 + j * 0.5;
        const motif = (k * 5 + 3) % MOTIFS.length;
        drawCell(cx, cz, motif, 1, [cx, cz], false, 0.62);
        if (Math.hypot(cx - ring[0], cz - ring[1]) < 0.05) drawCell(cx, cz, motif, 1.9, ring, true, rIn - 0.02);
        k++;
      }
    }
    // the magnifier: a ring and a turned handle lying on the top plate
    const ringC = P(ring[0], ring[1], 0.0375);
    const ringQ = quatFromTo(new THREE.Vector3(0, 0, 1), YV).premultiply(new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().extractRotation(top)));
    put(annulus(0.62, rIn, 0.075, { seg: 128 }), compose(ringC, ringQ), mats.metal, LAYERS.SOLID, hulls.mid, 0.85, 0.75);
    const hd = [0.75, 0.66];
    const hl = Math.hypot(hd[0], hd[1]);
    const h0 = P(ring[0] + (hd[0] / hl) * 0.6, ring[1] + (hd[1] / hl) * 0.6, 0.085);
    const h1 = P(ring[0] + (hd[0] / hl) * 1.72, ring[1] + (hd[1] / hl) * 1.72, 0.085);
    const hres = lathe([[0, 0], [0.05, 0], [0.05, 0.1], [0.075, 0.13], [0.085, 0.5], [0.08, 0.98], [0.06, 1.08], [0, 1.1]], { seg: 32 });
    put(hres, compose(h0, quatFromTo(YV, V(sub(h1, h0)))), mats.metal, LAYERS.SOLID, hulls.mid, 0.7, 0.65);
    // two engraver's highlight strokes on the lens
    for (const r of [0.36, 0.42]) {
      const arc = [];
      for (let a = 112; a <= 152; a += 4) arc.push([ring[0] + r * Math.cos(a * DEG), ring[1] - r * Math.sin(a * DEG)]);
      lines.polyline(arc.map((q) => P(q[0], q[1], 0.004)), 0.8, 0.55, { normal: UP });
    }
    anchors.loupe = { ring: ringC, stack: [LP.c[0], GROUND_Y + 5 * th, LP.c[1]] };
  }

  // --------------------------------------------------- pen plotter drum ---
  if (on('plotter') && !dark) {
    const O = [ROOM.plotter.c[0], GROUND_Y, ROOM.plotter.c[1]];
    const at = (x, y, z) => [O[0] + x, O[1] + y, O[2] + z];
    const rotY = new THREE.Matrix4().makeRotationY(-Math.PI / 2);
    const plateLoop = [[-0.62, 0], [0.98, 0], [0.98, 0.8], [0.82, 0.98], [0.45, 1.04], [-0.2, 1.12], [-0.55, 0.95], [-0.62, 0.7]];
    for (const s of [-1, 1]) {
      const res = extrude([plateLoop], -0.05, 0.05, { hatchAngle: Math.PI / 2, smoothAngle: 20 });
      const m = new THREE.Matrix4().makeTranslation(...at(1.95 * s, 0, 0)).multiply(rotY);
      put(res, m, mats.metal, LAYERS.SOLID, hulls.mid, 0.8, 0.65);
    }
    const drum = lathe([[0, -2.08], [0.07, -2.08], [0.07, -1.78], [0.52, -1.78], [0.52, -1.72], [0.42, -1.72], [0.42, 1.72],
      [0.52, 1.72], [0.52, 1.78], [0.07, 1.78], [0.07, 2.08], [0, 2.08]], { seg: 64 });
    const toX = quatFromTo(YV, new THREE.Vector3(1, 0, 0));
    put(drum, compose(at(0, 0.6, -0.05), toX), mats.metal, LAYERS.SOLID, hulls.big, 0.85, 0.7);
    put(box(-1.55, 1.55, 0, 0.012, 0.28, 2.5), compose(O), mats.paper, LAYERS.GROUND, hulls.small, 0.7, 0.55);
    const railY = 0.86;
    const zPen = 0.66;
    const xPen = 1.15;
    const rail = lathe([[0, 0], [0.04, 0], [0.04, 3.9], [0, 3.9]], { seg: 18, hatch: 'meridian', edges: false });
    put(rail, compose(at(-1.95, railY, zPen), toX), mats.metal, LAYERS.SOLID, hulls.small, 0, 0);
    put(box(-0.16, 0.16, -0.1, 0.1, -0.14, 0.14), compose(at(xPen, railY, zPen)), mats.metal, LAYERS.SOLID, hulls.mid, 0.75, 0.7);
    const pen = lathe([[0, 0], [0.01, 0], [0.03, 0.08], [0.032, 0.75], [0, 0.75]], { seg: 20 });
    put(pen, compose(at(xPen, 0.012, zPen)), mats.metal, LAYERS.SOLID, hulls.small, 0.6, 0.6);

    // the forecast fan: history, then quantile bands opening to the pen
    const yP = 0.014;
    const C = (x, z) => at(x, yP, z);
    const ln = (pts, w, t) => lines.polyline(pts.map((p) => C(p[0], p[1])), w, t, { normal: UP });
    ln([[-1.42, 2.38], [1.42, 2.38]], 0.6, 0.32);
    ln([[-1.42, 2.38], [-1.42, 0.45]], 0.6, 0.32);
    for (let x = -1.17; x < 1.42; x += 0.25) ln([[x, 2.38], [x, 2.43]], 0.55, 0.3);
    for (let z = 2.08; z > 0.45; z -= 0.3) ln([[-1.47, z], [-1.42, z]], 0.55, 0.3);
    const rng = makeRng(0xfa11);
    const x0 = -0.15;
    const hist = [];
    let zz = 1.78;
    const nH = 62;
    for (let i = 0; i <= nH; i++) {
      const x = -1.35 + ((x0 + 1.35) * i) / nH;
      zz += rng.range(-0.03, 0.03) + (1.62 - zz) * 0.06;
      hist.push([x, i === nH ? 1.62 : zz]);
    }
    hist[nH][1] = 1.62;
    ln(hist, 1.0, 0.85);
    const med = (x) => 1.62 - 0.18 * ((x - x0) / (xPen - x0));
    const spread = (x, q) => q * 0.78 * Math.sqrt(Math.max(0, (x - x0) / (xPen - x0)));
    const curve = (q) => {
      const pts = [];
      for (let i = 0; i <= 40; i++) {
        const x = x0 + ((xPen - x0) * i) / 40;
        pts.push([x, med(x) - spread(x, q)]);
      }
      return pts;
    };
    for (const q of [1 / 3, 2 / 3, 1, -1 / 3, -2 / 3, -1]) ln(curve(q), Math.abs(q) === 1 ? 0.75 : 0.62, Math.abs(q) === 1 ? 0.6 : 0.45);
    const medPts = [];
    for (let i = 0; i <= 40; i++) {
      const x = x0 + ((xPen - x0) * i) / 40;
      medPts.push(C(x, med(x)));
    }
    lines.pattern(medPts, [0.07, 0.045], 0.8, 0.75, { normal: UP });
    let idx = 0;
    for (let x = x0 + 0.03; x < xPen - 0.005; x += 0.03, idx++) {
      const a1 = spread(x, 1 / 3);
      const a2 = spread(x, 2 / 3);
      const a3 = spread(x, 1);
      ln([[x, med(x) - a1], [x, med(x) + a1]], 0.5, 0.12);
      if (idx % 2 === 0) {
        ln([[x, med(x) - a2], [x, med(x) - a1]], 0.5, 0.05);
        ln([[x, med(x) + a1], [x, med(x) + a2]], 0.5, 0.05);
      }
      if (idx % 4 === 0) {
        ln([[x, med(x) - a3], [x, med(x) - a2]], 0.5, -0.1);
        ln([[x, med(x) + a2], [x, med(x) + a3]], 0.5, -0.1);
      }
    }
    anchors.plotter = { drum: at(0, 0.6, -0.05), pen: at(xPen, 0.012, zPen), paper: at(0, 0.01, 1.4) };
  }

  // ------------------------------------------- balance with two answers ---
  if (on('balance') && !dark) {
    const O = [ROOM.balance.c[0], GROUND_Y, ROOM.balance.c[1]];
    const at = (x, y, z) => [O[0] + x, O[1] + y, O[2] + z];
    put(lathe([[0, 0], [0.82, 0], [0.82, 0.1], [0.75, 0.16], [0.5, 0.2], [0.3, 0.26], [0, 0.26]], { seg: 80 }), compose(O), mats.metal, LAYERS.SOLID, hulls.big, 0.8, 0.65);
    put(lathe([[0, 0.26], [0.16, 0.26], [0.13, 0.36], [0.09, 0.44], [0.075, 0.5], [0.075, 2.95], [0.1, 3.0], [0.1, 3.08], [0.06, 3.12], [0, 3.12]], { seg: 40 }), compose(O), mats.metal, LAYERS.SOLID, hulls.big, 0.75, 0.65);
    const Pv = at(0, 3.24, 0);
    const tilt = -6 * DEG;
    const rz = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), tilt);
    const beamLoop = [[-1.85, 0], [-1.6, 0.035], [-0.35, 0.085], [0, 0.13], [0.35, 0.085], [1.6, 0.035], [1.85, 0], [1.6, -0.03], [0.35, -0.06], [0, -0.09], [-0.35, -0.06], [-1.6, -0.03]];
    put(extrude([beamLoop], -0.035, 0.035, { hatchAngle: 0, smoothAngle: 30 }), compose(Pv, rz), mats.metal, LAYERS.SOLID, hulls.big, 0.85, 0.75);
    put(lathe([[0, -0.07], [0.055, -0.07], [0.055, 0.07], [0, 0.07]], { seg: 24 }), compose(Pv, quatFromTo(YV, new THREE.Vector3(0, 0, 1))), mats.metal, LAYERS.SOLID, hulls.small, 0.6, 0.6);
    // pointer over a small graduated arc: the judgement
    const ptrAcc = accent === 'pointer';
    const needle = lathe([[0, -1.3], [0.007, -1.22], [0.022, -0.12], [0.03, 0], [0.02, 0.05], [0, 0.06]], { seg: 20 });
    put(needle, compose(addv(Pv, [0, 0, 0.095]), rz), mats.metal, LAYERS.SOLID, hulls.small, 0.6, 0.7, ptrAcc);
    const arc = [];
    for (let a = -114; a <= -66; a += 3) arc.push([1.2 * Math.cos(a * DEG), 1.2 * Math.sin(a * DEG)]);
    for (let a = -66; a >= -114; a -= 3) arc.push([1.06 * Math.cos(a * DEG), 1.06 * Math.sin(a * DEG)]);
    put(extrude([arc], 0.045, 0.07, { hatchAngle: 0, smoothAngle: 20 }), compose(Pv), mats.dim, LAYERS.SOLID, hulls.small, 0.6, 0.6);
    for (let k = -4; k <= 4; k++) {
      const a = (-90 + k * 6) * DEG;
      const r0 = k === 0 ? 1.08 : 1.12;
      lines.seg(addv(Pv, [r0 * Math.cos(a), r0 * Math.sin(a), 0.072]), addv(Pv, [1.19 * Math.cos(a), 1.19 * Math.sin(a), 0.072]), [0, 0, 1], [0, 0, 1], k === 0 ? 0.8 : 0.6, 0.6);
    }
    const dish = lathe([[0, 0], [0.3, 0.02], [0.55, 0.07], [0.68, 0.14], [0.655, 0.145], [0.53, 0.09], [0.29, 0.045], [0, 0.035]], { seg: 72 });
    const hooks = [];
    for (const s of [-1, 1]) {
      const hk = V([s * 1.8, -0.02, 0]).applyQuaternion(rz).add(V(Pv)).toArray();
      hooks.push(hk);
      const pc = [hk[0], hk[1] - 1.75, hk[2]];
      put(dish, compose(pc), mats.metal, LAYERS.SOLID, hulls.mid, 0.75, 0.7);
      put(lathe([[0, -0.06], [0.035, -0.05], [0.035, 0.02], [0, 0.03]], { seg: 16 }), compose(hk), mats.metal, LAYERS.SOLID, hulls.small, 0, 0);
      for (const sx of [-1, 1]) lines.seg(hk, [pc[0] + sx * 0.645, pc[1] + 0.145, pc[2]], [0, 0, 0], [0, 0, 0], 0.65, 0.5);

      // a tent card: two leaning panels; the front one carries the answer
      const letter = s < 0 ? 'A' : 'B';
      const foot = [pc[0], pc[1] + 0.08, pc[2]];
      const front = new THREE.Matrix4().makeTranslation(foot[0], foot[1], foot[2] + 0.17).multiply(new THREE.Matrix4().makeRotationX(-18 * DEG));
      const back = new THREE.Matrix4().makeTranslation(foot[0], foot[1], foot[2] - 0.17).multiply(new THREE.Matrix4().makeRotationX(18 * DEG));
      const panel = box(-0.4, 0.4, 0, 0.56, -0.006, 0.006);
      put(panel, front, mats.paper, LAYERS.SOLID, hulls.small, 0.65, 0.6);
      put(box(-0.4, 0.4, 0, 0.56, -0.006, 0.006), back, mats.paper, LAYERS.SOLID, hulls.small, 0.65, 0.6);
      const nF = V([0, 0, 1]).transformDirection(front).toArray();
      const F = (x, y) => V([x, y, 0.0075]).applyMatrix4(front).toArray();
      const strokes = letter === 'A'
        ? [[[-0.32, 0.14], [-0.2, 0.44], [-0.08, 0.14]], [[-0.275, 0.25], [-0.125, 0.25]]]
        : [[[-0.3, 0.14], [-0.3, 0.44], [-0.19, 0.44], [-0.15, 0.425], [-0.13, 0.39], [-0.15, 0.315], [-0.2, 0.295], [-0.3, 0.295]],
          [[-0.2, 0.295], [-0.14, 0.275], [-0.115, 0.22], [-0.135, 0.16], [-0.19, 0.14], [-0.3, 0.14]]];
      for (const st of strokes) lines.polyline(st.map((p) => F(p[0], p[1])), 1.3, 0.95, { normal: nF });
      for (const [y, x1] of [[0.4, 0.3], [0.33, 0.3], [0.26, 0.3], [0.19, 0.16]]) lines.polyline([F(0.0, y), F(x1, y)], 0.6, 0.4, { normal: nF });
    }
    anchors.balance = { pivot: Pv, hooks, base: O };
  }

  // -------------------------------------------------- skis by the window ---
  if (on('skis') && !dark) {
    const S = ROOM.skis;
    S.x.forEach((x, k) => {
      const F = [x, ROOM.floorY, S.foot[1] + k * 0.18];
      const P1 = [x + k * 0.04, S.tipY - 1.0 - k * 0.15, wz - 0.08];
      const u = nrmz(sub(P1, F));
      const side = [1, 0, 0];
      const N0 = nrmz(crossv(side, u));
      const C = [];
      const Nn = [];
      const Ls = len(sub(P1, F));
      const nS = 40;
      const sAt = [];
      for (let i = 0; i <= nS; i++) {
        C.push(addv(F, mul(u, (Ls * i) / nS)));
        Nn.push(N0);
        sAt.push(i / nS);
      }
      const R = 0.9;
      const nT = 14;
      for (let i = 1; i <= nT; i++) {
        const ph = (i / nT) * 74 * DEG;
        C.push(addv(P1, addv(mul(u, R * Math.sin(ph)), mul(N0, R * (1 - Math.cos(ph))))));
        Nn.push(nrmz(addv(mul(N0, Math.cos(ph)), mul(u, -Math.sin(ph)))));
        sAt.push(1 + i / nT);
      }
      const w = (i) => {
        const s = sAt[i];
        if (s <= 1) return 0.9 - 0.13 * Math.sin(Math.PI * s) + 0.06 * Math.max(0, s - 0.85) / 0.15;
        const f = s - 1;
        return 0.96 - 0.42 * f * f;
      };
      const t = (i) => (sAt[i] <= 1 ? 0.12 : 0.12 - 0.08 * (sAt[i] - 1));
      put(sweepBoard(C, Nn, side, w, t), I, mats.ski, LAYERS.NOCAST, hulls.mid, 0.8, 0.7);
      // bindings: toe and heel pieces
      const mid = addv(F, mul(u, Ls * 0.5));
      const top = addv(mid, mul(N0, 0.06));
      const bm = basis(top, side, u, N0);
      put(box(-0.28, 0.28, -0.6, -0.18, 0, 0.17), bm, mats.metal, LAYERS.NOCAST, hulls.small, 0.65, 0.65);
      put(box(-0.25, 0.25, 0.36, 0.72, 0, 0.21), bm, mats.metal, LAYERS.NOCAST, hulls.small, 0.65, 0.65);
    });
    anchors.skis = { tip: [S.x[0], S.tipY, wz + 0.5] };
  }

  // ------------------------------------------- outside: ridge and aurora ---
  if (on('aurora') && !dark && !ghost) {
    const E = [2.0, 4.0, 16.0];
    const D = (th, e, r) => addv(E, mul([Math.sin(th) * Math.cos(e), Math.sin(e), -Math.cos(th) * Math.cos(e)], r));
    const ridgeE = (th) => -0.075 + 0.022 * Math.sin(3.1 * th + 0.4) + 0.012 * Math.sin(7.3 * th + 1.1) + 0.005 * Math.sin(17 * th);
    const ridge = [];
    const land = new GeoBuilder();
    for (let i = 0; i <= 160; i++) {
      const th = -0.75 + (1.75 * i) / 160;
      ridge.push(D(th, ridgeE(th), 88));
      land.vertex(D(th, ridgeE(th), 89), [0, 0, 1], [0, 0], null);
      land.vertex(D(th, -0.7, 89), [0, 0, 1], [0, 0], null);
    }
    for (let i = 0; i < 160; i++) land.quad(i * 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    const landOcc = occluderMaterial();
    landOcc.side = THREE.DoubleSide;
    const landMesh = new THREE.Mesh(land.build(), landOcc);
    landMesh.layers.set(LAYERS.GROUND);
    root.add(landMesh);
    sky.polyline(ridge, 0.85, 0.2);
    const rng = makeRng(0xa0a0);
    const curtain = (thA, thB, base, hgt, tone0, step) => {
      for (let th = thA; th < thB; th += step * rng.range(0.6, 1.4)) {
        const dens = 0.5 + 0.5 * Math.sin(th * 23.0 + 1.3) * Math.sin(th * 7.1);
        if (rng.next() > 0.35 + 0.65 * Math.abs(dens)) continue;
        const e0 = base(th);
        const h = hgt(th) * rng.range(0.7, 1.15);
        const segs = 4;
        for (let s = 0; s < segs; s++) {
          const a = D(th, e0 + (h * s) / segs, 84);
          const b = D(th + 0.002, e0 + (h * (s + 1)) / segs, 84);
          sky.seg(a, b, [0, 0, 0], [0, 0, 0], 0.62, tone0 - 0.24 * s);
        }
      }
    };
    curtain(0.02, 0.66, (th) => 0.035 + 0.035 * Math.sin(4.3 * th + 0.2) + 0.012 * Math.sin(11 * th), (th) => 0.11 + 0.06 * Math.sin(2.7 * th + 1.3) ** 2, 0.08, 0.0042);
    curtain(0.2, 0.86, (th) => 0.12 + 0.03 * Math.sin(3.6 * th + 2.0), (th) => 0.09 + 0.05 * Math.sin(3.1 * th) ** 2, -0.12, 0.0055);
  }

  const lineMeshes = [];
  for (const L of [lines, sky]) {
    if (L.count === 0) continue;
    const m = L.build();
    m.layers.set(LAYERS.INK);
    root.add(m);
    lineMeshes.push(m);
  }
  return { group: root, anchors, mats, lineMeshes, light: { pos: lampF.filament, axis: lampF.axis, pool } };
}
