// Assembles the instrument for one scene state. Parts are built
// parametrically; each solid gets an engraving material, an inverted-hull
// outline and ink ribbons along its creases.

import * as THREE from 'three';
import { lathe, extrude, annulus, sphereGeometry, disc, chaikin, circleLoop } from './geom.js';
import { gearOutline, spokeWindows } from './gear.js';
import { solidMaterial, sphereMaterial, hullMaterial } from './materials.js';
import { LineSet } from './lines.js';
import { makeRng } from './rng.js';
import {
  DEG, GROUND_Y, GEAR, CRANK, ARMS, PATTERN_ID, HOOP, ARMILLARY,
  trainLayout, armAnchor, dir,
} from './layout.js';

const LAYER_SOLID = 1;
const LAYER_INK = 2;
const LAYER_GROUND = 3;
export const LAYERS = { SOLID: LAYER_SOLID, INK: LAYER_INK, GROUND: LAYER_GROUND };

const V = (a) => new THREE.Vector3(a[0], a[1], a[2]);
const Y = new THREE.Vector3(0, 1, 0);
const Z = new THREE.Vector3(0, 0, 1);

function quatFromTo(from, to) {
  return new THREE.Quaternion().setFromUnitVectors(from.clone().normalize(), to.clone().normalize());
}

function compose(pos, quat, scale = 1) {
  return new THREE.Matrix4().compose(V(pos), quat || new THREE.Quaternion(), new THREE.Vector3(scale, scale, scale));
}

// ---------------------------------------------------------------- parts ---

function gearPart(z, thick, holes, hatchAngle) {
  const m = GEAR.module;
  const { pts } = gearOutline(z, m);
  const loops = [pts, ...holes];
  const res = extrude(loops, 0, thick, { hatchAngle, smoothAngle: 32 });
  // extrusion +Z becomes world +Y; 2D (x, y) becomes world (x, -z)
  const rx = new THREE.Matrix4().makeRotationX(-Math.PI / 2);
  res.geometry.applyMatrix4(rx);
  res.geometry.computeBoundingSphere();
  res.edges = res.edges.map((e) => ({
    a: V(e.a).applyMatrix4(rx).toArray(),
    b: V(e.b).applyMatrix4(rx).toArray(),
    nA: V(e.nA).applyMatrix4(rx).toArray(),
    nB: V(e.nB).applyMatrix4(rx).toArray(),
  }));
  return res;
}

function crankArmPart() {
  const L = CRANK.arm;
  const r0 = 0.068;
  const r1 = 0.048;
  const loop = [];
  const n = 14;
  for (let i = 0; i <= n; i++) {
    const a = Math.PI / 2 + (Math.PI * i) / n;
    loop.push([r0 * Math.cos(a), r0 * Math.sin(a)]);
  }
  for (let i = 0; i <= n; i++) {
    const a = -Math.PI / 2 + (Math.PI * i) / n;
    loop.push([L + r1 * Math.cos(a), r1 * Math.sin(a)]);
  }
  const res = extrude([loop], -0.0175, 0.0175, { hatchAngle: Math.PI / 2, smoothAngle: 30 });
  const rx = new THREE.Matrix4().makeRotationX(-Math.PI / 2);
  res.geometry.applyMatrix4(rx);
  res.geometry.computeBoundingSphere();
  res.edges = res.edges.map((e) => ({
    a: V(e.a).applyMatrix4(rx).toArray(),
    b: V(e.b).applyMatrix4(rx).toArray(),
    nA: V(e.nA).applyMatrix4(rx).toArray(),
    nB: V(e.nB).applyMatrix4(rx).toArray(),
  }));
  return res;
}

const BASE_PROFILE = [
  [0, GROUND_Y], [2.62, GROUND_Y], [2.62, -0.575], [2.55, -0.54], [2.47, -0.54], [2.47, -0.505],
  [2.42, -0.475], [2.42, -0.365], [2.4, -0.36], [2.4, -0.22], [2.42, -0.215], [2.42, -0.13],
  [2.47, -0.1], [2.5, -0.05], [2.5, 0], [2.3, 0], [0, 0],
];

const COLUMN_PROFILE = [
  [0, 0.125], [0.21, 0.125], [0.21, 0.15], [0.18, 0.175], [0.15, 0.2], [0.125, 0.25], [0.11, 0.32],
  [0.11, 2.33], [0.13, 2.35], [0.15, 2.37], [0.165, 2.4], [0.165, 2.425], [0.14, 2.44], [0.09, 2.45], [0, 2.45],
];

const HANDLE_PROFILE = [
  [0, 0], [0.026, 0], [0.026, 0.025], [0.04, 0.05], [0.046, 0.12], [0.046, 0.24], [0.042, 0.31],
  [0.032, 0.355], [0.016, 0.375], [0, 0.38],
];

// --------------------------------------------------------------- build ---

export function buildInstrument(state) {
  const rng = makeRng(0x0c0ffee);
  const group = new THREE.Group();
  const lines = new LineSet();
  const spheres = [];
  const anchors = {};
  let tris = 0;

  const mats = {
    metal: solidMaterial({ albedo: 1 }),
    gear: solidMaterial({ albedo: 1, hw: 1.0 }),
    base: solidMaterial({ albedo: 0.78, ticks: true, hw: 0.95 }),
    ring: solidMaterial({ albedo: 1, ticks: true, hw: 0.95 }),
    hoop: solidMaterial({ albedo: 1, ticks: true, hw: 1.0 }),
    accent: solidMaterial({ albedo: 1, accent: true, toneFloor: 0.55, hw: 1.15 }),
    accentRing: solidMaterial({ albedo: 1, accent: true, ticks: true, toneFloor: 0.5, hw: 1.2 }),
    sealed: solidMaterial({ albedo: 0.95, hw: 1.0 }),
    ground: solidMaterial({ albedo: state.ground?.albedo ?? 0.55, ground: true, hw: 0.8 }),
  };
  const hulls = {
    big: hullMaterial({ width: 1.5, tone: 1 }),
    mid: hullMaterial({ width: 1.25, tone: 0.9 }),
    small: hullMaterial({ width: 1.0, tone: 0.8 }),
    accent: hullMaterial({ width: 1.6, accent: true }),
  };

  function add(res, matrix, mat, hull, edgeW = 0.9, edgeTone = 0.7, accent = false) {
    const geo = res.geometry || res;
    const mesh = new THREE.Mesh(geo, mat);
    mesh.matrixAutoUpdate = false;
    mesh.matrix.copy(matrix);
    mesh.layers.set(LAYER_SOLID);
    group.add(mesh);
    tris += (geo.index ? geo.index.count : geo.attributes.position.count) / 3;
    if (hull) {
      const h = new THREE.Mesh(geo, hull);
      h.matrixAutoUpdate = false;
      h.matrix.copy(matrix);
      h.layers.set(LAYER_INK);
      group.add(h);
      tris += (geo.index ? geo.index.count : geo.attributes.position.count) / 3;
    }
    if (res.edges && res.edges.length && edgeW > 0) lines.addEdges(res.edges, matrix, edgeW, edgeTone, accent);
    return mesh;
  }

  // ------------------------------------------------------------ ground ---
  if (state.ground && state.ground.on) {
    const g = new THREE.Mesh(disc(22, 96), mats.ground);
    g.position.y = GROUND_Y + 0.0005;
    g.layers.set(LAYER_GROUND);
    const gd = state.ground.dir ?? 0;
    mats.ground.uniforms.uGroundDir.value.set(Math.cos(gd), Math.sin(gd));
    mats.ground.uniforms.uFadeR.value.set(state.ground.fade[0], state.ground.fade[1]);
    const gc = state.ground.center || [0, 0];
    mats.ground.uniforms.uFadeC.value.set(gc[0], gc[1]);
    group.add(g);
  }

  // -------------------------------------------------------------- base ---
  if (state.base !== false) {
    const res = lathe(BASE_PROFILE, { seg: 160, tickBand: [-0.36, -0.22] });
    add(res, new THREE.Matrix4(), mats.base, hulls.big, 0.85, 0.6);
  }

  // ------------------------------------------------------------- gears ---
  const T = trainLayout(state.crank);
  anchors.train = T;
  const y0 = GEAR.y0;
  {
    const holes = spokeWindows(6, 0.3, 0.9, 0.055, { phase: 0.26 }).map((l) => chaikin(l, 2));
    holes.push(circleLoop(0.13, 48).reverse());
    const res = gearPart(GEAR.main.z, GEAR.main.thick, holes, 28 * DEG);
    const q = new THREE.Quaternion().setFromAxisAngle(Y, T.main.rot);
    add(res, compose([0, y0, 0], q), mats.gear, hulls.big, 1.05, 0.85);
    const boss = lathe([[0.13, 0.09], [0.27, 0.09], [0.27, 0.11], [0.25, 0.125], [0.13, 0.125], [0.13, 0.09]], { seg: 64 });
    add(boss, compose([0, 0, 0], q), mats.metal, hulls.mid, 0.85, 0.7);
  }
  {
    const holes = spokeWindows(4, 0.16, 0.4, 0.04, { phase: 0.4 }).map((l) => chaikin(l, 2));
    holes.push(circleLoop(0.05, 24).reverse());
    const res = gearPart(GEAR.idler.z, GEAR.idler.thick, holes, -34 * DEG);
    const q = new THREE.Quaternion().setFromAxisAngle(Y, T.idler.rot);
    add(res, compose([T.idler.c[0], y0, T.idler.c[2]], q), mats.gear, hulls.big, 1.05, 0.85);
    const cap = lathe([[0, 0.09], [0.11, 0.09], [0.11, 0.105], [0.08, 0.125], [0.03, 0.135], [0, 0.137]], { seg: 48 });
    add(cap, compose([T.idler.c[0], 0, T.idler.c[2]], q), mats.metal, hulls.mid, 0.85, 0.7);
  }
  {
    const holes = [circleLoop(0.036, 24).reverse()];
    const res = gearPart(GEAR.pinion.z, GEAR.pinion.thick, holes, 62 * DEG);
    const q = new THREE.Quaternion().setFromAxisAngle(Y, T.pinion.rot);
    add(res, compose([T.pinion.c[0], y0, T.pinion.c[2]], q), mats.gear, hulls.big, 1.05, 0.85);
    const shaft = lathe(
      [[0, 0.02], [0.036, 0.02], [0.036, 0.395], [0.062, 0.395], [0.062, 0.4225], [0.036, 0.4225], [0.036, 0.4575],
        [0.046, 0.4575], [0.046, 0.483], [0.035, 0.493], [0, 0.493]],
      { seg: 40 },
    );
    add(shaft, compose([T.pinion.c[0], 0, T.pinion.c[2]], q), mats.metal, hulls.mid, 0.8, 0.7);
    // crank arm keyed to the pinion; handle at its far end
    const crankQ = new THREE.Quaternion().setFromAxisAngle(Y, state.crank);
    add(crankArmPart(), compose([T.pinion.c[0], CRANK.armY, T.pinion.c[2]], crankQ), mats.metal, hulls.big, 0.95, 0.8);
    const accent = state.accent === 'crank';
    const handle = lathe(HANDLE_PROFILE, { seg: 40, hatch: 'meridian', smoothAngle: 34 });
    add(
      handle,
      compose([T.handle[0], CRANK.armY + 0.0175, T.handle[2]], crankQ),
      accent ? mats.accent : mats.metal,
      accent ? hulls.accent : hulls.mid,
      0.9, 0.7, accent,
    );
    anchors.handle = { bottom: [T.handle[0], CRANK.armY, T.handle[2]], top: [T.handle[0], CRANK.armY + 0.4, T.handle[2]] };
  }

  if (state.stage === 'full') {
    // ----------------------------------------------------------- column ---
    add(lathe(COLUMN_PROFILE, { seg: 56 }), new THREE.Matrix4(), mats.metal, hulls.big, 0.85, 0.7);

    const collar = lathe([[0, -0.04], [0.15, -0.04], [0.168, -0.025], [0.168, 0.025], [0.15, 0.04], [0, 0.04]], { seg: 48 });
    const knuckle = lathe([[0, -0.045], [0.035, -0.045], [0.046, -0.025], [0.046, 0.025], [0.035, 0.045], [0, 0.045]], { seg: 28 });
    const finial = lathe([[0, 0], [0.018, 0], [0.026, 0.02], [0.022, 0.04], [0.01, 0.055], [0, 0.06]], { seg: 24 });
    const sGeo = sphereGeometry(72, 48);
    anchors.spheres = [];

    ARMS.forEach((arm, i) => {
      const ang = state.arms[i];
      const A = armAnchor(i, ang);
      const d = V(A.d);
      add(collar, compose([0, arm.h, 0]), mats.metal, hulls.mid, 0.75, 0.6);
      const rodLen = arm.L - 0.15;
      const rod = lathe([[0, 0], [0.028, 0], [0.021, rodLen], [0, rodLen]], { seg: 20, hatch: 'meridian', edges: false });
      add(rod, compose([d.x * 0.15, arm.h, d.z * 0.15], quatFromTo(Y, d)), mats.metal, hulls.small, 0, 0);
      add(knuckle, compose([A.end[0], arm.h, A.end[2]]), mats.metal, hulls.small, 0.7, 0.6);
      const stemLen = arm.stem - 0.04;
      const stem = lathe([[0, 0], [0.021, 0], [0.017, stemLen], [0, stemLen]], { seg: 20, hatch: 'meridian', edges: false });
      add(stem, compose([A.end[0], arm.h + 0.042, A.end[2]]), mats.metal, hulls.small, 0, 0);

      // hoop (meridian ring of the globe), pivots and finial
      const hoopAccent = state.accent === 'hoop:' + i;
      const yaw = state.hoopYaw?.[i] ?? ang + (90 + 38) * DEG;
      const hn = V(dir(yaw));
      const hoopRes = annulus(A.hoopR, A.hoopR - HOOP.width, HOOP.thick, { seg: 160 });
      const hq = quatFromTo(Z, hn);
      // keep the hoop's tick origin at the top
      add(
        hoopRes, compose(A.center, hq),
        hoopAccent ? mats.accentRing : mats.hoop,
        hoopAccent ? hulls.accent : hulls.mid,
        hoopAccent ? 0.9 : 0.75, 0.75, hoopAccent,
      );
      const pinLen = A.hoopR - HOOP.width - arm.r + 0.012;
      const pin = lathe([[0, 0], [0.011, 0], [0.011, pinLen], [0, pinLen]], { seg: 14, edges: false });
      add(pin, compose([A.center[0], A.center[1] + arm.r - 0.006, A.center[2]]), mats.metal, hulls.small, 0, 0);
      add(pin, compose([A.center[0], A.center[1] - arm.r + 0.006, A.center[2]], new THREE.Quaternion().setFromAxisAngle(Z, Math.PI)), mats.metal, hulls.small, 0, 0);
      add(finial, compose([A.center[0], A.center[1] + A.hoopR - 0.004, A.center[2]]), mats.metal, hulls.small, 0.6, 0.6);

      // the engraved sphere
      const smat = sphereMaterial({ pattern: PATTERN_ID[arm.pattern], seed: Math.floor(rng.range(1, 90)), n: 28 });
      const tilt = new THREE.Quaternion().setFromEuler(new THREE.Euler(rng.range(-0.5, 0.5), rng.range(0, Math.PI * 2), rng.range(-0.45, 0.45)));
      const mesh = add({ geometry: sGeo }, compose(A.center, tilt, arm.r), smat, hulls.big, 0, 0);
      spheres.push({ i, mesh, material: smat, center: A.center, r: arm.r, quat: tilt });
      anchors.spheres.push({ id: arm.id, label: arm.label, center: A.center, r: arm.r, hoopR: A.hoopR });
    });

    // -------------------------------------------------------- armillary ---
    const C = ARMILLARY.c;
    const north = V(dir(ARMILLARY.north));
    const east = V(dir(ARMILLARY.north + Math.PI / 2));
    const P = north.clone().multiplyScalar(Math.cos(ARMILLARY.latitude)).addScaledVector(Y, Math.sin(ARMILLARY.latitude)).normalize();
    const tau = state.tau ?? 0;
    const nEq = P.clone();
    const nEcl = P.clone().applyAxisAngle(east, 23.44 * DEG).applyAxisAngle(P, tau);
    const nCol = east.clone().applyAxisAngle(P, tau + 50 * DEG);
    const normals = { meridian: east, equator: nEq, ecliptic: nEcl, colure: nCol };
    anchors.armillary = { center: C, R: ARMILLARY.rings[0].R, P: P.toArray() };

    for (const ring of ARMILLARY.rings) {
      if (state.sealed && ring.kind !== 'meridian') continue;
      const res = annulus(ring.R, ring.R - ring.w, ARMILLARY.thick, { seg: 256 });
      add(res, compose(C, quatFromTo(Z, normals[ring.kind])), mats.ring, hulls.mid, 0.95, 0.8);
    }
    // polar axis with end beads
    const axis = lathe(
      [[0, -1.4], [0.012, -1.4], [0.03, -1.365], [0.03, -1.335], [0.017, -1.31], [0.017, 1.31], [0.03, 1.335],
        [0.03, 1.365], [0.012, 1.4], [0, 1.4]],
      { seg: 24, hatch: 'meridian' },
    );
    add(axis, compose(C, quatFromTo(Y, P)), mats.metal, hulls.small, 0.6, 0.6);
    if (!state.sealed) {
      const spindle = lathe([[0, -0.16], [0.05, -0.04], [0.066, 0], [0.05, 0.04], [0, 0.16]], { seg: 32 });
      add(spindle, compose(C, quatFromTo(Y, P)), mats.metal, hulls.small, 0.7, 0.7);
    } else {
      // the rings closed into one sealed sphere; their seams remain as grooves
      const R = ARMILLARY.sealedR;
      const sg = sphereGeometry(112, 72);
      add({ geometry: sg }, compose(C, quatFromTo(Y, P), R), mats.sealed, hulls.big, 0, 0);
      for (const nrm of [nEq, nEcl, nCol]) {
        const q = quatFromTo(Z, nrm);
        const seamAccent = state.accent === 'seam' && nrm === nEq;
        for (const off of [-0.008, 0.008]) {
          const rr = Math.sqrt(R * R - off * off) + 0.0015;
          const pts = [];
          const nn = [];
          for (let k = 0; k < 320; k++) {
            const t = (k / 320) * Math.PI * 2;
            const p = new THREE.Vector3(rr * Math.cos(t), rr * Math.sin(t), off).applyQuaternion(q);
            nn.push(p.clone().normalize().toArray());
            pts.push(p.add(V(C)).toArray());
          }
          lines.polyline(pts, seamAccent ? 1.25 : 0.85, 0.78, { closed: true, normals: nn, accent: seamAccent });
        }
      }
    }

    // ----------------------------------------------------------- orbits ---
    if (state.orbits) {
      ARMS.forEach((arm) => {
        if (arm.L < 2.62) return;
        const pts = [];
        const nn = [];
        const n = 360;
        for (let k = 0; k < n; k++) {
          const t = (k / n) * Math.PI * 2;
          pts.push([arm.L * Math.cos(t), GROUND_Y + 0.003, -arm.L * Math.sin(t)]);
          nn.push([0, 1, 0]);
        }
        lines.polyline(pts, 0.8, -0.55, { closed: true, dash: 3, normals: nn });
      });
    }
  }

  const lineMesh = lines.count > 0 ? lines.build() : null;
  if (lineMesh) {
    lineMesh.layers.set(LAYER_INK);
    group.add(lineMesh);
    tris += lines.count * 2;
  }
  return { group, spheres, anchors, mats, hulls, lineMesh, tris };
}
