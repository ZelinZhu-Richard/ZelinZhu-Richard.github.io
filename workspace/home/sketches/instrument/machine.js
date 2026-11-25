// Assembles the instrument for one build state. Parts are built
// parametrically; each solid gets an engraving material, an inverted-hull
// outline and ink ribbons along its creases. `state.build` says which parts
// have been earned so far (see BUILDS in layout.js); anything not listed is
// absent.
//
// Every part sits on another part: the wheels on bushings in a recess of an
// engraved dial, the dial on a turned plinth on four knurled feet, the arms
// in collars locked by set-screws, each sphere's hoop in a pivot cup on its
// stem, the meridian ring in a saddle on the column, the crank handle on a
// washer on its arm, the pinion's arbor in a jewelled bushing.

import * as THREE from 'three';
import { lathe, extrude, extrudeY, annulus, sphereGeometry, chaikin, circleLoop, applyRes, box } from './geom.js';
import { gearOutline, spokeWindows, meshContact } from './gear.js';
import { solidMaterial, sphereMaterial, hullMaterial } from './materials.js';
import { LineSet } from './lines.js';
import { makeRng } from './rng.js';
import {
  DEG, GROUND_Y, GEAR, CRANK, ARMS, PATTERN_ID, HOOP, ARMILLARY, BASE, FEET, DIAL, ROD, ALIDADE_ANGLE, COLUMN,
  trainLayout, armAnchor, dir, polarAxis, beadCenters,
} from './layout.js';
import { ASTRO, rete, almucantars, clippedCircle, alidadeOutline, alidadeCovers, eclipticPoint, pocketLoop } from './rete.js';
import { strokeText } from './glyphs.js';

export const LAYERS = { SOLID: 1, INK: 2, GROUND: 3, NOCAST: 4, FX: 5 };

const V = (a) => new THREE.Vector3(a[0], a[1], a[2]);
const Y = new THREE.Vector3(0, 1, 0);
const Z = new THREE.Vector3(0, 0, 1);
const UP = [0, 1, 0];

export function quatFromTo(from, to) {
  return new THREE.Quaternion().setFromUnitVectors(from.clone().normalize(), to.clone().normalize());
}

export function compose(pos, quat, scale = 1) {
  const s = Array.isArray(scale) ? new THREE.Vector3(scale[0], scale[1], scale[2]) : new THREE.Vector3(scale, scale, scale);
  return new THREE.Matrix4().compose(V(pos), quat || new THREE.Quaternion(), s);
}

const RX = () => new THREE.Matrix4().makeRotationX(-Math.PI / 2);
const yaw = (a) => new THREE.Quaternion().setFromAxisAngle(Y, a);
const rot2 = (p, th) => [p[0] * Math.cos(th) - p[1] * Math.sin(th), p[0] * Math.sin(th) + p[1] * Math.cos(th)];
// drawing / plan (x, y) at height h -> world
const plan = (p, h) => [p[0], h, -p[1]];

// ---------------------------------------------------------------- parts ---

function gearPart(z, thick, holes, hatchAngle) {
  const { pts } = gearOutline(z, GEAR.module);
  const res = extrude([pts, ...holes], 0, thick, { hatchAngle, smoothAngle: 32 });
  // extrusion +Z becomes world +Y; 2D (x, y) becomes world (x, -z)
  return applyRes(res, RX());
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
  return applyRes(res, RX());
}

const hexLoop = (r) => Array.from({ length: 6 }, (_, k) => [r * Math.cos((k * Math.PI) / 3 + Math.PI / 6), r * Math.sin((k * Math.PI) / 3 + Math.PI / 6)]);

// plinth: a turned base with a graduated band, standing on the feet
const BASE_PROFILE = [
  [0, BASE.bottom], [2.54, BASE.bottom], [2.6, -0.5], [2.62, -0.47], [2.62, -0.44], [2.55, -0.415], [2.47, -0.415],
  [2.47, -0.395], [2.42, -0.375], [2.42, -0.365], [2.4, -0.36], [2.4, -0.22], [2.42, -0.215], [2.42, -0.13],
  [2.47, -0.1], [2.5, -0.05], [2.5, 0], [0, 0],
];

const COLUMN_PROFILE = [
  [0, 0.125], [0.21, 0.125], [0.21, 0.15], [0.18, 0.175], [0.15, 0.2], [0.125, 0.25], [0.11, 0.32],
  [0.11, 2.33], [0.13, 2.35], [0.15, 2.37], [0.165, 2.4], [0.165, 2.425], [0.14, 2.44], [0.09, 2.45], [0, 2.45],
];

// the crank handle: a turned grip whose middle is knurled
const HANDLE_PROFILE = [
  [0, 0], [0.024, 0], [0.024, 0.03], [0.038, 0.05], [0.046, 0.08], [0.046, 0.27], [0.042, 0.31],
  [0.032, 0.355], [0.016, 0.375], [0, 0.38],
];

const FOOT_PROFILE = [
  [0, GROUND_Y], [0.14, GROUND_Y], [FEET.radius, GROUND_Y + 0.016], [FEET.radius, BASE.bottom - 0.028],
  [0.148, BASE.bottom - 0.012], [0.1, BASE.bottom - 0.008], [0.1, BASE.bottom], [0, BASE.bottom],
];

const SCREW_PROFILE = (r, h) => [[0, 0], [r, 0], [r, h * 0.4], [r * 0.8, h * 0.8], [r * 0.42, h], [0, h * 1.02]];

// Engraved helices on a cylinder (axis +Y from y0 to y1, radius r): a
// diamond knurl. Lines in the part's frame; m places them in the world.
function knurl(lines, m, r, y0, y1, n, tone, accent = false, width = 0.55) {
  const pitch = ((y1 - y0) * Math.tan(32 * DEG)) / r;
  const A = new THREE.Vector3();
  const N = new THREE.Vector3();
  for (const hand of [1, -1]) {
    for (let k = 0; k < n; k++) {
      const a0 = (k / n) * Math.PI * 2;
      const pts = [];
      const nn = [];
      for (let s = 0; s <= 4; s++) {
        const t = s / 4;
        const a = a0 + hand * pitch * t;
        A.set(r * Math.cos(a), y0 + (y1 - y0) * t, -r * Math.sin(a)).applyMatrix4(m);
        N.set(Math.cos(a), 0, -Math.sin(a)).transformDirection(m);
        pts.push(A.toArray());
        nn.push(N.toArray());
      }
      lines.polyline(pts, width, tone, { normals: nn, accent });
    }
  }
}

// a screw slot: a short dark groove across a head
function slot(lines, c, axisN, ang, len, tone = -0.08) {
  const n = V(axisN).normalize();
  const ref = Math.abs(n.y) < 0.9 ? Y : new THREE.Vector3(1, 0, 0);
  const u = new THREE.Vector3().crossVectors(n, ref).normalize();
  const v = new THREE.Vector3().crossVectors(n, u);
  const d = u.multiplyScalar(Math.cos(ang)).add(v.multiplyScalar(Math.sin(ang)));
  const a = V(c).addScaledVector(d, -len / 2);
  const b = V(c).addScaledVector(d, len / 2);
  lines.seg(a.toArray(), b.toArray(), n.toArray(), n.toArray(), 1.15, tone);
}

// --------------------------------------------------------------- build ---

export function buildInstrument(state, group) {
  const b = state.build || {};
  const rng = makeRng(0x0c0ffee);
  const root = new THREE.Group();
  const lines = new LineSet(group);
  const spheres = [];
  const anchors = {};
  const nGears = b.gears || 0;
  const has = (list, i) => Array.isArray(list) && list.includes(i);
  const acc = state.accent || '';

  const M = (o) => solidMaterial({ group, ...o });
  const mats = {
    metal: M({ albedo: 1 }),
    gear: M({ albedo: 1, hw: 1.0 }),
    // the astrolabe's faces are polished and engraved, not hatched; its
    // flanks keep the hatching
    astro: M({ albedo: 1, hw: 1.0, bare: true }),
    base: M({ albedo: 0.78, ticks: true, hw: 0.95, bare: true }),
    dial: M({ albedo: 0.85, hw: 0.95, bare: true }),
    floor: M({ albedo: 0.82, bare: true }),
    ring: M({ albedo: 1, ticks: true, hw: 0.95 }),
    hoop: M({ albedo: 1, ticks: true, hw: 1.0 }),
    accent: M({ albedo: 1, accent: true, toneFloor: 0.55, hw: 1.15 }),
    accentRing: M({ albedo: 1, accent: true, ticks: true, toneFloor: 0.5, hw: 1.2 }),
    sealed: M({ albedo: 0.95, hw: 1.0 }),
  };
  const H = (o) => hullMaterial({ group, ...o });
  const hulls = {
    big: H({ width: 1.5, tone: 1 }),
    mid: H({ width: 1.25, tone: 0.9 }),
    small: H({ width: 1.0, tone: 0.8 }),
    accent: H({ width: 1.6, accent: true }),
  };

  function add(res, matrix, mat, hull, edgeW = 0.9, edgeTone = 0.7, accent = false) {
    const geo = res.geometry || res;
    const mesh = new THREE.Mesh(geo, mat);
    mesh.matrixAutoUpdate = false;
    mesh.matrix.copy(matrix);
    mesh.layers.set(LAYERS.SOLID);
    root.add(mesh);
    if (hull) {
      const h = new THREE.Mesh(geo, hull);
      h.matrixAutoUpdate = false;
      h.matrix.copy(matrix);
      h.layers.set(LAYERS.INK);
      root.add(h);
    }
    if (res.edges && res.edges.length && edgeW > 0) lines.addEdges(res.edges, matrix, edgeW, edgeTone, accent);
    return mesh;
  }
  // a run of plan points engraved on a horizontal face at height h
  const engrave = (pts, h, w, t, closed = false) => lines.polyline(pts.map((p) => plan(p, h)), w, t, { closed, normal: UP });
  const screwHead = (r, h) => lathe(SCREW_PROFILE(r, h), { seg: 18, edges: false });

  const T = trainLayout(state.crank || 0);
  anchors.train = T;
  const y0 = GEAR.y0;
  const floorOn = b.base || b.floor;
  const pocket = floorOn ? pocketLoop(T) : null;

  // -------------------------------------------------------------- base ---
  if (b.base) {
    add(lathe(BASE_PROFILE, { seg: 160, tickBand: [-0.36, -0.22] }), new THREE.Matrix4(), mats.base, hulls.big, 0.85, 0.6);

    // the dial plate, with its recess for the train
    const rim = circleLoop(BASE.dialR, 220).map(([x, y]) => [x, -y]);
    add(extrudeY([rim, pocket.loop], BASE.top, BASE.dialTop, { smoothAngle: 40 }), new THREE.Matrix4(), mats.dial, hulls.mid, 0.85, 0.75);
    const yd = BASE.dialTop;
    const D = DIAL;

    // degree ring: two circles, a tick every 2 deg, longer every 10 and 30
    const circ = (r, n = 360) => Array.from({ length: n }, (_, k) => [r * Math.cos((k / n) * Math.PI * 2), r * Math.sin((k / n) * Math.PI * 2)]);
    engrave(circ(D.ring.r0), yd, 0.6, 0.5, true);
    engrave(circ(D.ring.edge), yd, 0.55, 0.35, true);
    for (let deg = 0; deg < 360; deg += 2) {
      const a = deg * DEG;
      const r1 = deg % 30 === 0 ? D.ring.major : deg % 10 === 0 ? D.ring.mid : D.ring.minor;
      engrave([[r1 * Math.cos(a), r1 * Math.sin(a)], [D.ring.edge * Math.cos(a), D.ring.edge * Math.sin(a)]], yd, deg % 10 === 0 ? 0.8 : 0.55, deg % 30 === 0 ? 0.7 : 0.42);
    }
    // numerals, read from outside the ring (tops toward the centre)
    for (let deg = 0; deg < 360; deg += D.numerals.every) {
      const a = deg * DEG;
      const u = [-Math.cos(a), -Math.sin(a)];
      const rt = [-Math.sin(a), Math.cos(a)];
      const c = [D.numerals.r * Math.cos(a), D.numerals.r * Math.sin(a)];
      const { lines: gl } = strokeText(String(deg));
      const h = D.numerals.h;
      for (const l of gl) engrave(l.map(([tx, ty]) => [c[0] + (rt[0] * tx + u[0] * ty) * h, c[1] + (rt[1] * tx + u[1] * ty) * h]), yd, 0.62, 0.55);
    }

    // the maker's plate, on the front of the dial
    const L = D.label;
    const lc = [L.r * Math.cos(L.angle), L.r * Math.sin(L.angle)];
    const lu = [-Math.cos(L.angle), -Math.sin(L.angle)]; // toward the centre = text up
    const lr = [-Math.sin(L.angle), Math.cos(L.angle)];
    const P2 = (x, y) => [lc[0] + lr[0] * x + lu[0] * y, lc[1] + lr[1] * x + lu[1] * y];
    const corner = (cx, cy, a0, rr) => Array.from({ length: 5 }, (_, i) => {
      const a = a0 + (i / 4) * (Math.PI / 2);
      return P2(cx + rr * Math.cos(a), cy + rr * Math.sin(a));
    });
    const hw = L.w / 2;
    const hh = L.h / 2;
    const cr = 0.025;
    const plateLoop = [
      ...corner(hw - cr, -hh + cr, -Math.PI / 2, cr), ...corner(hw - cr, hh - cr, 0, cr),
      ...corner(-hw + cr, hh - cr, Math.PI / 2, cr), ...corner(-hw + cr, -hh + cr, Math.PI, cr),
    ].map(([x, y]) => [x, -y]);
    add(extrudeY([plateLoop], yd, yd + 0.012, { smoothAngle: 50 }), new THREE.Matrix4(), mats.metal, hulls.small, 0.75, 0.75);
    const yl = yd + 0.012;
    const inset = 0.016;
    engrave([P2(-hw + inset + 0.03, -hh + inset), P2(hw - inset - 0.03, -hh + inset), P2(hw - inset - 0.03, hh - inset), P2(-hw + inset + 0.03, hh - inset)], yl, 0.5, 0.5, true);
    for (const [txt, yy, size] of [['R. ZHU', 0.026, 0.048], ['MMXXVI', -0.034, 0.036]]) {
      const { lines: gl } = strokeText(txt, { tracking: 0.18 });
      for (const l of gl) engrave(l.map(([tx, ty]) => P2(tx * size, yy + ty * size)), yl, 0.55, 0.72);
    }
    for (const sx of [-1, 1]) {
      const p = P2(sx * (hw - 0.03), 0);
      add(screwHead(0.017, 0.01), compose(plan(p, yl)), mats.metal, hulls.small, 0, 0);
      slot(lines, plan(p, yl + 0.0105), UP, rng.range(0, Math.PI), 0.026);
    }

    // screws holding the dial down
    for (let k = 0; k < D.screws.n; k++) {
      const a = D.screws.phase + (k / D.screws.n) * Math.PI * 2;
      const p = [D.screws.r * Math.cos(a), D.screws.r * Math.sin(a)];
      add(screwHead(D.screws.head, 0.026), compose(plan(p, yd)), mats.metal, hulls.small, 0, 0);
      slot(lines, plan(p, yd + 0.027), UP, rng.range(0, Math.PI), D.screws.head * 1.6);
    }

    // guilloche: concentric waved rings that fade outward, kept off the
    // recess, the screws and the maker's plate
    const G = D.guilloche;
    const tones = [0.34, 0.24, 0.15, 0.06, -0.95, -0.8, -0.62];
    const clear = (p) => {
      if (pocket.field(p[0], -p[1]) < 0.05) return false;
      for (let k = 0; k < D.screws.n; k++) {
        const a = D.screws.phase + (k / D.screws.n) * Math.PI * 2;
        if (Math.hypot(p[0] - D.screws.r * Math.cos(a), p[1] - D.screws.r * Math.sin(a)) < 0.08) return false;
      }
      const q = [p[0] - lc[0], p[1] - lc[1]];
      const x = q[0] * lr[0] + q[1] * lr[1];
      const y = q[0] * lu[0] + q[1] * lu[1];
      return !(Math.abs(x) < hw + 0.04 && Math.abs(y) < hh + 0.04);
    };
    for (let k = 0; k < G.n; k++) {
      const r = G.r0 + ((G.r1 - G.r0) * k) / (G.n - 1);
      const pts = [];
      const n = 900;
      for (let i = 0; i < n; i++) {
        const t = (i / n) * Math.PI * 2;
        const rr = r + G.amp * Math.sin(G.lobes * t + k * 0.9);
        pts.push([rr * Math.cos(t), rr * Math.sin(t)]);
      }
      let run = [];
      const flush = () => {
        if (run.length > 1) engrave(run, yd, 0.55, tones[k]);
        run = [];
      };
      for (let i = 0; i <= n; i++) {
        const p = pts[i % n];
        if (clear(p)) run.push(p);
        else flush();
      }
      flush();
    }

    // feet
    for (let k = 0; k < FEET.n; k++) {
      const a = FEET.phase + (k / FEET.n) * Math.PI * 2;
      const m = compose([FEET.r * Math.cos(a), 0, -FEET.r * Math.sin(a)], yaw(a));
      add(lathe(FOOT_PROFILE, { seg: 32 }), m, mats.metal, hulls.mid, 0.75, 0.7);
      knurl(lines, m, FEET.radius + 0.0012, GROUND_Y + 0.024, BASE.bottom - 0.034, 22, 0.45);
    }
    anchors.dial = { top: BASE.dialTop, label: plan(lc, yd) };
  }

  // ------------------------------------------- the recess floor + bushings ---
  if (floorOn) {
    if (!b.base) {
      // the floor alone (the base has not been built yet): a plain disc
      add(lathe([[0, -0.07], [2.3, -0.07], [2.3, 0], [0, 0]], { seg: 128 }), new THREE.Matrix4(), mats.floor, hulls.mid, 0.7, 0.55);
    }
    const yf = BASE.top;
    // the plate beneath the rete: almucantars, zenith toward the back
    const keep = (p) => {
      const r = Math.hypot(p[0], p[1]);
      return r < ASTRO.limbIn - 0.01 && r > 0.29;
    };
    for (const a of almucantars(10)) {
      for (const run of clippedCircle(a.c, a.r, keep, 300)) engrave(run, yf, a.alt === 0 ? 0.65 : 0.45, a.alt === 0 ? 0.3 : a.alt < 0 ? -0.7 : 0.12);
    }
    for (const rr of [ASTRO.Req, ASTRO.Rcnc]) for (const run of clippedCircle([0, 0], rr, keep, 240)) engrave(run, yf, 0.45, -0.75);
    engrave(Array.from({ length: 200 }, (_, k) => [ASTRO.limbIn * Math.cos((k / 200) * Math.PI * 2), ASTRO.limbIn * Math.sin((k / 200) * Math.PI * 2)]), yf, 0.5, -0.8, true);
    // perlage (overlapping circular graining) round the idler and pinion
    const pr = 0.034;
    const ps = 0.046;
    for (let j = -60; j <= 60; j++) {
      for (let i = -60; i <= 60; i++) {
        const x = i * ps + (j % 2 ? ps / 2 : 0);
        const z = j * ps * 0.866;
        if (Math.hypot(x, z) < ASTRO.tipR + 0.05) continue;
        if (pocket.field(x, z) > -0.04) continue;
        const ring = Array.from({ length: 14 }, (_, k) => [x + pr * Math.cos((k / 14) * Math.PI * 2), -(z) + pr * Math.sin((k / 14) * Math.PI * 2)]);
        engrave(ring, yf, 0.42, -0.62, true);
      }
    }
    // bushings: each wheel stands on one
    const bush = (r0, r1) => lathe([[r0, 0], [r1, 0], [r1, y0 * 0.6], [r1 - 0.012, y0], [r0, y0], [r0, 0]], { seg: 48 });
    add(bush(ASTRO.bore, 0.27), new THREE.Matrix4(), mats.metal, hulls.small, 0.7, 0.65);
    if (nGears >= 2) add(bush(0.03, 0.1), compose([T.idler.c[0], 0, T.idler.c[2]]), mats.metal, hulls.small, 0.7, 0.65);
    if (nGears >= 3) add(bush(0.03, 0.078), compose([T.pinion.c[0], 0, T.pinion.c[2]]), mats.metal, hulls.small, 0.7, 0.65);
    anchors.pocket = pocket.loop;
  }

  // ------------------------------------------------------------- gears ---
  if (nGears >= 1) {
    // the main wheel is the astrolabe: limb with teeth, pierced rete
    const R = rete();
    const res = gearPart(GEAR.main.z, GEAR.main.thick, R.holes, 28 * DEG);
    const q = yaw(T.main.rot);
    add(res, compose([0, y0, 0], q), mats.astro, hulls.big, 1.0, 0.85);
    anchors.mainQuat = q;
    const yt = y0 + GEAR.main.thick;
    const g = (p) => rot2(p, T.main.rot);
    // engraving under the rule stays hidden (the ribbons' depth bias would
    // otherwise lift a few through its thin tip)
    const alAng = state.alidade ?? ALIDADE_ANGLE;
    const open = (p) => !alidadeCovers(rot2(p, -alAng));
    // degree scale on the limb
    const sc = ASTRO.scale;
    let run = [];
    for (let k = 0; k <= 360; k++) {
      const p = g([sc.r0 * Math.cos((k / 360) * Math.PI * 2), sc.r0 * Math.sin((k / 360) * Math.PI * 2)]);
      if (open(p)) run.push(p);
      else {
        if (run.length > 1) engrave(run, yt, 0.5, 0.45);
        run = [];
      }
    }
    if (run.length > 1) engrave(run, yt, 0.5, 0.45);
    for (let d = 0; d < 360; d += 2) {
      const a = d * DEG;
      const r1 = d % 30 === 0 ? sc.major : d % 10 === 0 ? sc.mid : sc.minor;
      const p0 = g([sc.r0 * Math.cos(a), sc.r0 * Math.sin(a)]);
      const p1 = g([r1 * Math.cos(a), r1 * Math.sin(a)]);
      if (!open(p0) || !open(p1)) continue;
      engrave([p0, p1], yt, d % 10 === 0 ? 0.75 : 0.5, d % 30 === 0 ? 0.62 : 0.38);
    }
    // the ecliptic's divisions
    const ec = ASTRO.ecl;
    for (let lon = 0; lon < 360; lon += 10) {
      const qq = eclipticPoint(lon);
      const v = [qq[0] - ec.c[0], qq[1] - ec.c[1]];
      const l = Math.hypot(v[0], v[1]);
      const k = lon % 30 === 0 ? 0.9 : 0.5;
      const e0 = g([ec.c[0] + (v[0] / l) * (ec.rho - ec.hw * k), ec.c[1] + (v[1] / l) * (ec.rho - ec.hw * k)]);
      const e1 = g([ec.c[0] + (v[0] / l) * (ec.rho + ec.hw * k), ec.c[1] + (v[1] / l) * (ec.rho + ec.hw * k)]);
      if (open(e0) && open(e1)) engrave([e0, e1], yt, 0.5, lon % 30 === 0 ? 0.5 : 0.3);
    }

    // the rule (alidade) across the face, pinned at the hub
    const ad = ASTRO.alidade;
    const qa = yaw(alAng);
    const al = applyRes(extrude([alidadeOutline(), circleLoop(ad.hole, 48).reverse()], 0, ad.thick, { hatchAngle: 0, smoothAngle: 30 }), RX());
    add(al, compose([0, yt, 0], qa), mats.metal, hulls.mid, 0.9, 0.85);
    for (const sgn of [1, -1]) {
      const vb = box(sgn * ad.vaneAt - ad.vane[0], sgn * ad.vaneAt + ad.vane[0], yt + ad.thick, yt + ad.thick + ad.vaneH, -ad.vane[1], ad.vane[1]);
      add(vb, compose([0, 0, 0], qa), mats.metal, hulls.small, 0.7, 0.75);
      // the sight hole, engraved on both faces of the vane
      for (const f of [1, -1]) {
        const ring = [];
        const nrm = new THREE.Vector3(f, 0, 0).applyQuaternion(qa).toArray();
        for (let k = 0; k <= 12; k++) {
          const t = (k / 12) * Math.PI * 2;
          ring.push(new THREE.Vector3(sgn * ad.vaneAt + f * (ad.vane[0] + 0.0008), yt + ad.thick + ad.vaneH * 0.62 + 0.012 * Math.sin(t), 0.012 * Math.cos(t)).applyQuaternion(qa).toArray());
        }
        lines.polyline(ring, 0.6, 0.15, { normal: nrm });
      }
    }
    if (!(b.base || b.column)) {
      // without the column the rule is held by a pin with a domed head
      add(lathe([[0, y0], [ad.hole - 0.002, y0], [ad.hole - 0.002, yt + ad.thick + 0.012], [0.08, yt + ad.thick + 0.012], [0.07, yt + ad.thick + 0.03], [0.04, yt + ad.thick + 0.042], [0, yt + ad.thick + 0.045]], { seg: 48 }), compose([0, 0, 0], q), mats.metal, hulls.mid, 0.8, 0.75);
    }
    if (b.base || b.column) {
      const boss = lathe([[0.13, 0.09], [0.27, 0.09], [0.27, 0.11], [0.25, 0.125], [0.13, 0.125], [0.13, 0.09]], { seg: 64 });
      add(boss, compose([0, 0, 0], q), mats.metal, hulls.mid, 0.85, 0.7);
      // three screws in the boss
      for (let k = 0; k < 3; k++) {
        const a = T.main.rot + 0.4 + (k * 2 * Math.PI) / 3;
        const p = [0.232 * Math.cos(a), 0.232 * Math.sin(a)];
        add(screwHead(0.013, 0.008), compose(plan(p, 0.125)), mats.metal, hulls.small, 0, 0);
        slot(lines, plan(p, 0.1335), UP, a + 1.1, 0.02);
      }
    }
    anchors.rule = { angle: alAng, y: yt + ad.thick };
  }
  if (nGears >= 2) {
    const holes = spokeWindows(4, 0.16, 0.4, 0.04, { phase: 0.4 }).map((l) => chaikin(l, 2));
    holes.push(circleLoop(0.05, 24).reverse());
    const res = gearPart(GEAR.idler.z, GEAR.idler.thick, holes, -34 * DEG);
    const q = yaw(T.idler.rot);
    add(res, compose([T.idler.c[0], y0, T.idler.c[2]], q), mats.gear, hulls.big, 1.05, 0.85);
    const cap = lathe([[0, 0.09], [0.11, 0.09], [0.11, 0.105], [0.08, 0.125], [0.03, 0.135], [0, 0.137]], { seg: 48 });
    add(cap, compose([T.idler.c[0], 0, T.idler.c[2]], q), mats.metal, hulls.mid, 0.85, 0.7);
    for (let k = 0; k < 3; k++) {
      const a = T.idler.rot + 0.3 + (k * 2 * Math.PI) / 3;
      const p = [T.idler.c[0] + 0.135 * Math.cos(a), -T.idler.c[2] + 0.135 * Math.sin(a)];
      add(screwHead(0.018, 0.01), compose(plan(p, 0.09)), mats.metal, hulls.small, 0, 0);
      slot(lines, plan(p, 0.1005), UP, a + 0.6, 0.028);
    }
  }
  if (nGears >= 3) {
    const holes = [circleLoop(0.036, 24).reverse()];
    const res = gearPart(GEAR.pinion.z, GEAR.pinion.thick, holes, 62 * DEG);
    const q = yaw(T.pinion.rot);
    const pc = T.pinion.c;
    add(res, compose([pc[0], y0, pc[2]], q), mats.gear, hulls.big, 1.05, 0.85);
    const shaft = lathe(
      [[0, 0.02], [0.036, 0.02], [0.036, 0.395], [0.062, 0.395], [0.062, 0.4225], [0.036, 0.4225], [0.036, 0.4575],
        [0.046, 0.4575], [0.046, 0.483], [0.035, 0.493], [0, 0.493]],
      { seg: 40 },
    );
    add(shaft, compose([pc[0], 0, pc[2]], q), mats.metal, hulls.mid, 0.8, 0.7);
    // jewelled bushing on the pinion: a chaton holding a ring jewel round
    // the arbor, two screws in the pinion's face
    const yp = y0 + GEAR.pinion.thick;
    add(lathe([[0.04, yp], [0.078, yp], [0.078, yp + 0.012], [0.07, yp + 0.02], [0.058, yp + 0.02], [0.058, yp + 0.012], [0.04, yp + 0.012], [0.04, yp]], { seg: 40 }), compose([pc[0], 0, pc[2]], q), mats.metal, hulls.small, 0.75, 0.75);
    const jewelAcc = acc === 'jewel';
    add(
      lathe([[0.037, yp + 0.012], [0.057, yp + 0.012], [0.057, yp + 0.017], [0.05, yp + 0.024], [0.037, yp + 0.025], [0.037, yp + 0.012]], { seg: 40, edges: false }),
      compose([pc[0], 0, pc[2]], q),
      jewelAcc ? mats.accent : mats.metal,
      jewelAcc ? hulls.accent : hulls.small,
      0, 0, jewelAcc,
    );
    anchors.jewel = [pc[0], yp + 0.02, pc[2]];
    const contact = meshContact(T);
    anchors.contact = contact;
    if (acc === 'contact') {
      // the one accent of the macro frame: where the idler's tooth bears on
      // the pinion's, the top edges of the two flanks catch a warm glint
      // (up close they are chamfers, see LINE_VERT)
      for (const e of contact.edges) lines.seg(e.a, e.b, UP, e.n, 1.6, 1, true);
    }
    for (const s of [0, Math.PI]) {
      const a = T.pinion.rot + 0.7 + s;
      const p = [pc[0] + 0.125 * Math.cos(a), -pc[2] + 0.125 * Math.sin(a)];
      add(screwHead(0.017, 0.01), compose(plan(p, yp)), mats.metal, hulls.small, 0, 0);
      slot(lines, plan(p, yp + 0.0105), UP, a + 0.9, 0.026);
    }
    if (b.crank) {
      const crankQ = yaw(state.crank || 0);
      add(crankArmPart(), compose([pc[0], CRANK.armY, pc[2]], crankQ), mats.metal, hulls.big, 0.95, 0.8);
      // hex nut on the arbor over the arm
      const nut = applyRes(extrude([hexLoop(0.06), circleLoop(0.036, 20).reverse()], 0, 0.026, { smoothAngle: 10 }), RX());
      add(nut, compose([pc[0], CRANK.armY + 0.0175, pc[2]], crankQ), mats.metal, hulls.small, 0.75, 0.75);
      const accent = acc === 'crank';
      const hb = [T.handle[0], CRANK.armY + 0.0175, T.handle[2]];
      // washer under the handle
      add(lathe([[0.016, 0], [0.056, 0], [0.056, 0.008], [0.016, 0.008], [0.016, 0]], { seg: 40 }), compose(hb, crankQ), mats.metal, hulls.small, 0.7, 0.7);
      const hm = compose([hb[0], hb[1] + 0.008, hb[2]], crankQ);
      add(
        lathe(HANDLE_PROFILE, { seg: 40, hatch: 'meridian', smoothAngle: 34 }),
        hm,
        accent ? mats.accent : mats.metal,
        accent ? hulls.accent : hulls.mid,
        0.9, 0.7, accent,
      );
      knurl(lines, hm, 0.0465, 0.1, 0.25, 16, accent ? 0.8 : 0.5, accent, 0.6);
      anchors.handle = { bottom: [T.handle[0], CRANK.armY, T.handle[2]], top: [T.handle[0], CRANK.armY + 0.4, T.handle[2]] };
    }
  }

  // ------------------------------------------------------------ column ---
  const north = V(dir(ARMILLARY.north));
  const east = V(dir(ARMILLARY.north + Math.PI / 2));
  if (b.column) {
    add(lathe(COLUMN_PROFILE, { seg: 56 }), new THREE.Matrix4(), mats.metal, hulls.big, 0.85, 0.7);
    if (b.rings) {
      // the saddle the meridian ring stands in, clamped by two screws
      const qs = yaw(ARMILLARY.north);
      const sad = box(-0.15, 0.15, COLUMN.top - 0.035, COLUMN.top + 0.085, -0.055, 0.055);
      add(sad, compose([0, 0, 0], qs), mats.metal, hulls.mid, 0.8, 0.75);
      for (const s of [1, -1]) {
        for (const f of [1, -1]) {
          const c = north.clone().multiplyScalar(s * 0.09).addScaledVector(east, f * 0.055).add(new THREE.Vector3(0, COLUMN.top + 0.03, 0));
          const ax = east.clone().multiplyScalar(f);
          add(screwHead(0.019, 0.011), compose(c.toArray(), quatFromTo(Y, ax)), mats.metal, hulls.small, 0, 0);
          slot(lines, c.clone().addScaledVector(ax, 0.0115).toArray(), ax.toArray(), 0.3 + s, 0.03);
        }
      }
    }
  }

  // -------------------------------------------------------------- arms ---
  const C = ROD.collar;
  const collar = lathe([[0, -0.042], [C[0], -0.042], [C[1], -0.026], [C[1], 0.026], [C[0], 0.042], [0, 0.042]], { seg: 48 });
  const socket = lathe([[0, 0], [0.056, 0], [0.056, 0.03], [0.047, 0.07], [0.047, 0.085], [0, 0.085]], { seg: 24 });
  const knuckle = lathe([[0, -0.05], [0.042, -0.05], [ROD.knuckle, -0.028], [ROD.knuckle, 0.028], [0.042, 0.05], [0, 0.05]], { seg: 28 });
  const setScrew = lathe([[0, 0], [0.022, 0], [0.022, 0.03], [0.018, 0.036], [0, 0.037]], { seg: 14, edges: false });
  const pivot = lathe([[0, -0.03], [0.034, -0.03], [0.048, -0.012], [0.048, 0.008], [0.04, 0.016], [0, 0.016]], { seg: 24 });
  const finial = lathe([[0, 0], [0.02, 0], [0.028, 0.022], [0.024, 0.044], [0.011, 0.06], [0, 0.066]], { seg: 24 });
  const cup = lathe([[0, 0], [0.03, 0], [0.05, 0.03], [0.06, 0.07], [0.045, 0.072], [0.03, 0.04], [0, 0.035]], { seg: 28 });
  const sGeo = sphereGeometry(72, 48);
  const bGeo = sphereGeometry(28, 18);
  const gGeo = sphereGeometry(56, 36);
  anchors.spheres = [];
  ARMS.forEach((arm, i) => {
    if (!has(b.arms, i)) return;
    const ang = state.arms?.[i] ?? 0;
    const A = armAnchor(i, ang);
    const d = V(A.d);
    add(collar, compose([0, arm.h, 0]), mats.metal, hulls.mid, 0.75, 0.6);
    // the set-screw locking the collar, on the arm's left side
    const side = new THREE.Vector3(-d.z, 0, d.x);
    add(setScrew, compose(side.clone().multiplyScalar(C[1] - 0.004).add(new THREE.Vector3(0, arm.h, 0)).toArray(), quatFromTo(Y, side)), mats.metal, hulls.small, 0, 0);
    slot(lines, side.clone().multiplyScalar(C[1] + 0.033).add(new THREE.Vector3(0, arm.h, 0)).toArray(), side.toArray(), 0, 0.03);
    add(socket, compose([d.x * (C[1] - 0.01), arm.h, d.z * (C[1] - 0.01)], quatFromTo(Y, d)), mats.metal, hulls.small, 0.7, 0.6);
    const r0 = C[1] + 0.07;
    const rodLen = arm.L - r0 - 0.04;
    const rod = lathe([[0, 0], [ROD.root, 0], [ROD.tip, rodLen], [0, rodLen]], { seg: 20, hatch: 'meridian', edges: false });
    add(rod, compose([d.x * r0, arm.h, d.z * r0], quatFromTo(Y, d)), mats.metal, hulls.small, 0, 0);
    add(knuckle, compose([A.end[0], arm.h, A.end[2]]), mats.metal, hulls.small, 0.7, 0.6);
    const withSphere = has(b.spheres, i);
    const stemLen = withSphere ? arm.stem - 0.05 : arm.stem * 0.55;
    const stem = lathe([[0, 0], [ROD.stem[0], 0], [ROD.stem[1], stemLen], [0, stemLen]], { seg: 20, hatch: 'meridian', edges: false });
    add(stem, compose([A.end[0], arm.h + 0.048, A.end[2]]), mats.metal, hulls.small, 0, 0);
    if (!withSphere) {
      // an empty mount, waiting for its sphere
      add(cup, compose([A.end[0], arm.h + 0.048 + stemLen, A.end[2]]), mats.metal, hulls.small, 0.6, 0.6);
      return;
    }
    // the pivot cup the hoop stands in
    add(pivot, compose([A.end[0], arm.h + arm.stem, A.end[2]]), mats.metal, hulls.small, 0.65, 0.65);

    const hoopAccent = acc === 'hoop:' + i;
    const yawH = state.hoopYaw?.[i] ?? ang + (90 + 38) * DEG;
    const hn = V(dir(yawH));
    const hoopRes = annulus(A.hoopR, A.hoopR - HOOP.width, HOOP.thick, { seg: 128 });
    add(
      hoopRes, compose(A.center, quatFromTo(Z, hn)),
      hoopAccent ? mats.accentRing : mats.hoop,
      hoopAccent ? hulls.accent : hulls.mid,
      hoopAccent ? 0.9 : 0.75, 0.75, hoopAccent,
    );
    const pinLen = A.hoopR - HOOP.width - arm.r + 0.012;
    const pin = lathe([[0, 0], [0.012, 0], [0.012, pinLen], [0, pinLen]], { seg: 14, edges: false });
    add(pin, compose([A.center[0], A.center[1] + arm.r - 0.006, A.center[2]]), mats.metal, hulls.small, 0, 0);
    add(pin, compose([A.center[0], A.center[1] - arm.r + 0.006, A.center[2]], new THREE.Quaternion().setFromAxisAngle(Z, Math.PI)), mats.metal, hulls.small, 0, 0);
    add(finial, compose([A.center[0], A.center[1] + A.hoopR - 0.004, A.center[2]]), mats.metal, hulls.small, 0.6, 0.6);

    const smat = sphereMaterial({ group, pattern: PATTERN_ID[arm.pattern], seed: Math.floor(rng.range(1, 90)), n: 28 });
    const tilt = new THREE.Quaternion().setFromEuler(new THREE.Euler(rng.range(-0.5, 0.5), rng.range(0, Math.PI * 2), rng.range(-0.45, 0.45)));
    const mesh = add({ geometry: sGeo }, compose(A.center, tilt, arm.r), smat, hulls.big, 0, 0);
    spheres.push({ i, mesh, material: smat, center: A.center, r: arm.r, quat: tilt });
    anchors.spheres.push({ i, id: arm.id, label: arm.label, center: A.center, r: arm.r, hoopR: A.hoopR });
  });

  // --------------------------------------------------------- armillary ---
  const nRings = b.rings || 0;
  if (nRings > 0 || b.globe) {
    const Cc = ARMILLARY.c;
    const P = V(polarAxis());
    const tau = state.tau ?? 0;
    const nEq = P.clone();
    const nEcl = P.clone().applyAxisAngle(east, 23.44 * DEG).applyAxisAngle(P, tau);
    const nCol = east.clone().applyAxisAngle(P, tau + 50 * DEG);
    const normals = { meridian: east, equator: nEq, ecliptic: nEcl, colure: nCol };
    const Rm = ARMILLARY.rings[0];
    anchors.armillary = { center: Cc, R: Rm.R, P: P.toArray(), north: north.toArray() };

    ARMILLARY.rings.forEach((ring, k) => {
      if (k >= nRings) return;
      if (b.sealed && ring.kind !== 'meridian') return;
      const res = annulus(ring.R, ring.R - ring.w, ARMILLARY.thick, { seg: 224 });
      add(res, compose(Cc, quatFromTo(Z, normals[ring.kind])), mats.ring, hulls.mid, 0.95, 0.8);
    });

    if (b.globe && !b.sealed) {
      // polar axis through the globe, a bead at each end; a boss where it
      // passes through the meridian ring
      const h = ARMILLARY.axisHalf;
      const gq = quatFromTo(Y, P);
      const axis = lathe([[0, -h], [0.02, -h], [0.02, h], [0, h]], { seg: 24, hatch: 'meridian', edges: false });
      add(axis, compose(Cc, gq), mats.metal, hulls.small, 0, 0);
      if (nRings > 0) {
        const bossG = lathe([[0, -0.03], [0.04, -0.03], [0.05, -0.015], [0.05, 0.015], [0.04, 0.03], [0, 0.03]], { seg: 24 });
        for (const s of [1, -1]) {
          const c = V(Cc).addScaledVector(P, s * (Rm.R - Rm.w / 2));
          add(bossG, compose(c.toArray(), gq), mats.metal, hulls.small, 0.65, 0.7);
        }
      }
      const gmat = sphereMaterial({ group, pattern: PATTERN_ID.grid, seed: 7, n: 24 });
      const gmesh = add({ geometry: gGeo }, compose(Cc, gq, ARMILLARY.globeR), gmat, hulls.big, 0, 0);
      spheres.push({ i: 'globe', mesh: gmesh, material: gmat, center: Cc, r: ARMILLARY.globeR, quat: gq });
      anchors.globe = { center: Cc, r: ARMILLARY.globeR };
      anchors.beads = [];
      beadCenters().forEach((bc, k) => {
        const bm = sphereMaterial({ group, pattern: PATTERN_ID.rings, seed: 3 + k, n: 12 });
        const bmesh = add({ geometry: bGeo }, compose(bc, gq, ARMILLARY.beadR), bm, hulls.mid, 0, 0);
        spheres.push({ i: 'bead' + k, mesh: bmesh, material: bm, center: bc, r: ARMILLARY.beadR, quat: gq });
        anchors.beads.push({ center: bc, r: ARMILLARY.beadR });
      });
    }

    if (b.sealed) {
      const R = ARMILLARY.sealedR;
      const sg = sphereGeometry(112, 72);
      add({ geometry: sg }, compose(Cc, quatFromTo(Y, P), R), mats.sealed, hulls.big, 0, 0);
      const h = ARMILLARY.axisHalf;
      const axis = lathe([[0, -h], [0.02, -h], [0.02, h], [0, h]], { seg: 24, hatch: 'meridian', edges: false });
      add(axis, compose(Cc, quatFromTo(Y, P)), mats.metal, hulls.small, 0, 0);
      for (const nrm of [nEq, nEcl, nCol]) {
        const q = quatFromTo(Z, nrm);
        const seamAccent = acc === 'seam' && nrm === nEq;
        for (const off of [-0.01, 0.01]) {
          const rr = Math.sqrt(R * R - off * off) + 0.0015;
          const pts = [];
          const nn = [];
          for (let k = 0; k < 360; k++) {
            const t = (k / 360) * Math.PI * 2;
            const p = new THREE.Vector3(rr * Math.cos(t), rr * Math.sin(t), off).applyQuaternion(q);
            nn.push(p.clone().normalize().toArray());
            pts.push(p.add(V(Cc)).toArray());
          }
          lines.polyline(pts, seamAccent ? 1.3 : 0.85, 0.78, { closed: true, normals: nn, accent: seamAccent });
        }
      }
      anchors.sealed = { center: Cc, R };
    }
  }

  // ------------------------------------------------------------ orbits ---
  if (state.orbits) {
    ARMS.forEach((arm, i) => {
      if (!has(b.arms, i) || arm.L < 2.62) return;
      const pts = [];
      const nn = [];
      const n = 360;
      for (let k = 0; k < n; k++) {
        const t = (k / n) * Math.PI * 2;
        pts.push([arm.L * Math.cos(t), GROUND_Y + 0.003, -arm.L * Math.sin(t)]);
        nn.push([0, 0, 0]);
      }
      lines.polyline(pts, 0.7, -0.55, { closed: true, dash: 3, normals: nn });
    });
  }

  const lineMesh = lines.count > 0 ? lines.build() : null;
  if (lineMesh) {
    lineMesh.layers.set(LAYERS.INK);
    root.add(lineMesh);
  }
  return { group: root, spheres, anchors, mats, hulls, lineMesh };
}
