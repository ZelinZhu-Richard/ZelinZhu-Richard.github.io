// The instrument's parts as plain arrays (no three.js), split into rigid
// groups that move as one: the astrolabe wheel, the fixed rule, the idler,
// the pinion with its crank, the base, the column, the meridian (with its
// fork), the horizon (with its posts), the equator, the celestial rings and
// globe, the seven arms (skinned: each arm is one mesh whose parts follow six
// bones) and the contact shell. Each group's pieces are merged into one
// geometry per group (one draw for its solid, one for its outline hull, one
// for its ink ribbons). Ported from the approved sketch (machine.js) and the
// brass armillary in assets-src/room (fork, horizon ring on four posts).
//
// Group frames: 'wheel' about the column axis at rest; 'idler' and 'pinion'
// about their own centres at rest; the arms in an arm frame (arm along +x
// from the column axis); everything else in the instrument frame at rest.
// pose.js gives each group's matrix.

import {
  DEG, identity, mul, compose, translate, apply, applyDir, quatFromTo, quatAxis, fromQuat, rotY, normalMatrix, applyN,
  norm, cross, rotateVec, add, mulS,
} from './math.js';
import { lathe, extrude, annulus, box, tube, uvSphere, outlineNormals, transformGeo, chaikin, circleLoop } from './geom.js';
import { gearOutline, spokeWindows } from './gear.js';
import { LineData, LINE_FLAGS } from './lines.js';
import {
  GROUND_Y, GEAR, CRANK, ARMS, PATTERN_ID, HOOP, ARMILLARY, BASE, FEET, DIAL, ROD, ROD_START, ALIDADE_ANGLE, COLUMN,
  trainLayout, dir, plan, polarAxis, eastAxis, postPoint,
} from './layout.js';
import { ASTRO, rete, almucantars, clippedCircle, alidadeOutline, eclipticPoint, pocketLoop } from './rete.js';
import { ringNormals } from './pose.js';
import { strokeText } from './glyphs.js';

const Y = [0, 1, 0];
const Z = [0, 0, 1];
const UP = [0, 1, 0];
const rot2 = (p, th) => [p[0] * Math.cos(th) - p[1] * Math.sin(th), p[0] * Math.sin(th) + p[1] * Math.cos(th)];
const yawQ = (a) => quatAxis(Y, a);
const RX = () => {
  // rotation about X by -90 deg: (x, y, z) -> (x, z, -y)
  const m = identity();
  m[5] = 0;
  m[6] = -1;
  m[9] = 1;
  m[10] = 0;
  return m;
};

// --------------------------------------------------------------- materials ---
// Per-piece material, baked into a vertex attribute (aMat): the brass
// variant (0 polished brass, 1 dark bronze, 2 pale steel, 3 blued steel),
// the engraving's albedo and hatch width, and flags: BARE flat faces carry no
// hatching; TICKS draws graduations from aTick; ACCENT turns to the accent
// colour with the group's accent weight (the crank handle, a hovered hoop).
export const FLAG = { BARE: 1, TICKS: 2, ACCENT: 4 };
export const MAT = {
  metal: { v: 0, albedo: 1, hw: 1.05 },
  bronze: { v: 1, albedo: 1, hw: 1.05 },
  gear: { v: 0, albedo: 1, hw: 1.0 },
  astro: { v: 0, albedo: 1, hw: 1.0, bare: true },
  plinth: { v: 1, albedo: 0.78, hw: 0.95, bare: true, ticks: true },
  dial: { v: 0, albedo: 0.85, hw: 0.95, bare: true },
  ring: { v: 0, albedo: 1, hw: 0.95, ticks: true },
  hoop: { v: 0, albedo: 1, hw: 1.0, ticks: true, accent: true },
  screw: { v: 3, albedo: 1, hw: 1.05 },
  handle: { v: 0, albedo: 1, hw: 1.05, accent: true },
  shell: { v: 0, albedo: 0.95, hw: 1.0 },
};
export const matCode = (m) => m.v + 8 * ((m.bare ? FLAG.BARE : 0) + (m.ticks ? FLAG.TICKS : 0) + (m.accent ? FLAG.ACCENT : 0));
/** Outline hull widths (CSS px). */
export const HULL = { big: 1.5, mid: 1.25, small: 1.0, none: 0 };

// ------------------------------------------------------------------ groups ---

export class PartGroup {
  /** @param {string} id @param {string} stage */
  constructor(id, stage) {
    this.id = id;
    this.stage = stage;
    this.pieces = [];
    this.lines = new LineData();
    this.detail = new LineData();
    /** sphere-shader meshes: { pattern, seed, n, matrix (group frame), r, hull } */
    this.spheres = [];
  }

  /**
   * @param {import('./geom.js').Geo} geo
   * @param {ArrayLike<number>} m part -> group frame
   * @param {object} mat MAT entry
   * @param {number} hull HULL width
   * @param {number} edgeW crease ribbon width (0 = none)
   * @param {number} edgeTone
   * @param {{ accent?: boolean, bone?: number, code?: number }} [o]
   */
  add(geo, m, mat, hull, edgeW = 0.9, edgeTone = 0.7, o = {}) {
    const bone = o.bone || 0;
    this.pieces.push({ geo, m, mat, hull, bone });
    if (geo.edges && geo.edges.length && edgeW > 0) this.lines.addEdges(geo.edges, m, edgeW, edgeTone, !!o.accent, (o.code || 0) + 8 * bone);
  }
}

/**
 * Merge a group's pieces into flat typed arrays.
 * @returns {{ position: Float32Array, normal: Float32Array, hatch: Float32Array, tick: Float32Array,
 *   mat: Float32Array, onormal: Float32Array, bone: Float32Array | null, index: Uint32Array, triangles: number }}
 */
export function mergeGroup(g) {
  let nv = 0;
  let ni = 0;
  let skinned = false;
  for (const p of g.pieces) {
    nv += p.geo.pos.length / 3;
    ni += p.geo.idx.length;
    if (p.bone) skinned = true;
  }
  const position = new Float32Array(nv * 3);
  const normal = new Float32Array(nv * 3);
  const hatch = new Float32Array(nv * 2);
  const tick = new Float32Array(nv * 2);
  const mat = new Float32Array(nv * 4);
  const onormal = new Float32Array(nv * 4);
  const bone = skinned ? new Float32Array(nv) : null;
  const index = new Uint32Array(ni);
  let vo = 0;
  let io = 0;
  for (const p of g.pieces) {
    const src = p.geo;
    const on = outlineNormals(src);
    const n = src.pos.length / 3;
    const code = matCode(p.mat);
    const m = p.m;
    const nm = normalMatrix(m);
    const P = src.pos;
    const N = src.nrm;
    for (let i = 0; i < n; i++) {
      const v = vo + i;
      const x = P[3 * i], y = P[3 * i + 1], z = P[3 * i + 2];
      position[3 * v] = m[0] * x + m[4] * y + m[8] * z + m[12];
      position[3 * v + 1] = m[1] * x + m[5] * y + m[9] * z + m[13];
      position[3 * v + 2] = m[2] * x + m[6] * y + m[10] * z + m[14];
      let a = N[3 * i], b = N[3 * i + 1], c = N[3 * i + 2];
      let qx = nm[0] * a + nm[3] * b + nm[6] * c;
      let qy = nm[1] * a + nm[4] * b + nm[7] * c;
      let qz = nm[2] * a + nm[5] * b + nm[8] * c;
      let l = Math.sqrt(qx * qx + qy * qy + qz * qz) || 1;
      normal[3 * v] = qx / l;
      normal[3 * v + 1] = qy / l;
      normal[3 * v + 2] = qz / l;
      a = on[3 * i];
      b = on[3 * i + 1];
      c = on[3 * i + 2];
      qx = nm[0] * a + nm[3] * b + nm[6] * c;
      qy = nm[1] * a + nm[4] * b + nm[7] * c;
      qz = nm[2] * a + nm[5] * b + nm[8] * c;
      l = Math.sqrt(qx * qx + qy * qy + qz * qz) || 1;
      onormal[4 * v] = qx / l;
      onormal[4 * v + 1] = qy / l;
      onormal[4 * v + 2] = qz / l;
      onormal[4 * v + 3] = p.hull;
      hatch[2 * v] = src.hat[2 * i];
      hatch[2 * v + 1] = src.hat[2 * i + 1];
      tick[2 * v] = src.tik[2 * i];
      tick[2 * v + 1] = src.tik[2 * i + 1];
      mat[4 * v] = code;
      mat[4 * v + 1] = p.mat.albedo;
      mat[4 * v + 2] = p.mat.hw;
      mat[4 * v + 3] = 1; // ambient occlusion, baked later
      if (bone) bone[v] = p.bone;
    }
    for (let k = 0; k < src.idx.length; k++) index[io + k] = src.idx[k] + vo;
    vo += n;
    io += src.idx.length;
  }
  return { position, normal, hatch, tick, mat, onormal, bone, index, triangles: ni / 3 };
}

// ------------------------------------------------------------- profiles ---

const BASE_PROFILE = [
  [0, BASE.bottom], [2.54, BASE.bottom], [2.6, -0.5], [2.62, -0.47], [2.62, -0.44], [2.55, -0.415], [2.47, -0.415],
  [2.47, -0.395], [2.42, -0.375], [2.42, -0.365], [2.4, -0.36], [2.4, -0.22], [2.42, -0.215], [2.42, -0.13],
  [2.47, -0.1], [2.5, -0.05], [2.5, 0], [0, 0],
];
const COLUMN_PROFILE = [
  [0, COLUMN.bottom], [0.21, COLUMN.bottom], [0.21, 0.15], [0.18, 0.175], [0.15, 0.2], [0.125, 0.25], [0.11, 0.32],
  [0.11, 2.33], [0.13, 2.35], [0.15, 2.37], [0.165, 2.4], [0.165, 2.425], [0.14, 2.44], [0.09, 2.45], [0, 2.45],
];
const HANDLE_PROFILE = [
  [0, 0], [0.024, 0], [0.024, 0.03], [0.038, 0.05], [0.046, 0.08], [0.046, 0.27], [0.042, 0.31],
  [0.032, 0.355], [0.016, 0.375], [0, 0.38],
];
const FOOT_PROFILE = [
  [0, GROUND_Y], [0.14, GROUND_Y], [FEET.radius, GROUND_Y + 0.016], [FEET.radius, BASE.bottom - 0.028],
  [0.148, BASE.bottom - 0.012], [0.1, BASE.bottom - 0.008], [0.1, BASE.bottom], [0, BASE.bottom],
];
const SCREW_PROFILE = (r, h) => [[0, 0], [r, 0], [r, h * 0.4], [r * 0.8, h * 0.8], [r * 0.42, h], [0, h * 1.02]];
const hexLoop = (r) => Array.from({ length: 6 }, (_, k) => [r * Math.cos((k * Math.PI) / 3 + Math.PI / 6), r * Math.sin((k * Math.PI) / 3 + Math.PI / 6)]);

/**
 * Build every part.
 * @param {{ tier?: number, triangulate: (contour: number[][], holes: number[][][]) => number[][], rng?: () => number }} opts
 */
export function buildParts(opts) {
  const tier = Math.max(0, Math.min(3, opts.tier ?? 3));
  const triangulate = opts.triangulate;
  const K = [0.45, 0.6, 0.8, 1][tier];
  const seg = (n) => Math.max(8, Math.round(n * K));
  let seed = 0x0c0ffee >>> 0;
  const rnd = opts.rng || (() => {
    seed = (seed + 0x6d2b79f5) >>> 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  });
  const range = (lo, hi) => lo + (hi - lo) * rnd();

  const G = {};
  const group = (id, stage) => (G[id] = new PartGroup(id, stage));
  const T0 = trainLayout(0);
  const y0 = GEAR.y0;
  const screwHead = (r, h) => lathe(SCREW_PROFILE(r, h), { seg: seg(18), edges: false });

  // a run of plan points engraved on a horizontal face at height h
  const engrave = (L, pts, h, w, t, closed = false, code = 0, maxLen = 0) =>
    L.polyline(pts.map((p) => plan(p, h)), w, t, { closed, normal: UP, code, maxLen });

  // a screw slot: a short dark groove across a head
  const slot = (L, c, axisN, ang, len, tone = -0.08, code = 0) => {
    const n = norm(axisN);
    const ref = Math.abs(n[1]) < 0.9 ? Y : [1, 0, 0];
    const u = norm(cross(n, ref));
    const v = cross(n, u);
    const d = add(mulS(u, Math.cos(ang)), mulS(v, Math.sin(ang)));
    L.seg(add(c, mulS(d, -len / 2)), add(c, mulS(d, len / 2)), n, n, 1.15, tone, false, code);
  };

  // engraved helices on a cylinder (axis +Y from y0 to y1, radius r): a
  // diamond knurl; m places them in the group's frame
  const knurl = (L, m, r, ya, yb, n, tone, accent = false, width = 0.55, code = 0) => {
    const pitch = ((yb - ya) * Math.tan(32 * DEG)) / r;
    const nm = normalMatrix(m);
    for (const hand of [1, -1]) {
      for (let k = 0; k < n; k++) {
        const a0 = (k / n) * Math.PI * 2;
        const pts = [];
        const nn = [];
        for (let s = 0; s <= 4; s++) {
          const t = s / 4;
          const a = a0 + hand * pitch * t;
          pts.push(apply(m, [r * Math.cos(a), ya + (yb - ya) * t, -r * Math.sin(a)]));
          nn.push(applyN(nm, [Math.cos(a), 0, -Math.sin(a)]));
        }
        L.polyline(pts, width, tone, { normals: nn, accent, code });
      }
    }
  };

  const gearPart = (z, thick, holes, hatchAngle) => {
    const { pts } = gearOutline(z, GEAR.module);
    const res = extrude([pts, ...holes], 0, thick, { hatchAngle, smoothAngle: 32 }, triangulate);
    return transformGeo(res, RX());
  };

  const pocket = pocketLoop(T0);
  const R = rete();

  // ================================================================ base ===
  {
    const B = group('base', 'base');
    B.add(lathe(BASE_PROFILE, { seg: seg(160), tickBand: [-0.36, -0.22] }), identity(), MAT.plinth, HULL.big, 0.85, 0.6);

    // the dial plate, with its recess for the train; turned (polar) faces
    const rim = circleLoop(BASE.dialR, seg(220)).map(([x, y]) => [x, -y]);
    const loops = [rim, pocket.loop].map((l) => l.map((p) => [p[0], -p[1]]));
    B.add(transformGeo(extrude(loops, BASE.top, BASE.dialTop, { smoothAngle: 40, polar: true }, triangulate), RX()), identity(), MAT.dial, HULL.mid, 0.85, 0.75);
    const yd = BASE.dialTop;
    const D = DIAL;
    const L = B.lines;
    const DL = B.detail;

    // degree ring: two circles, a tick every 2 deg, longer every 10 and 30
    const circ = (r, n = 360) => Array.from({ length: n }, (_, k) => [r * Math.cos((k / n) * Math.PI * 2), r * Math.sin((k / n) * Math.PI * 2)]);
    engrave(L, circ(D.ring.r0), yd, 0.6, 0.5, true);
    engrave(L, circ(D.ring.edge), yd, 0.55, 0.35, true);
    for (let deg = 0; deg < 360; deg += 2) {
      const a = deg * DEG;
      const r1 = deg % 30 === 0 ? D.ring.major : deg % 10 === 0 ? D.ring.mid : D.ring.minor;
      engrave(L, [[r1 * Math.cos(a), r1 * Math.sin(a)], [D.ring.edge * Math.cos(a), D.ring.edge * Math.sin(a)]], yd, deg % 10 === 0 ? 0.8 : 0.55, deg % 30 === 0 ? 0.7 : 0.42);
    }
    // numerals, read from outside the ring (tops toward the centre)
    for (let deg = 0; deg < 360; deg += D.numerals.every) {
      const a = deg * DEG;
      const u = [-Math.cos(a), -Math.sin(a)];
      const rt = [-Math.sin(a), Math.cos(a)];
      const c = [D.numerals.r * Math.cos(a), D.numerals.r * Math.sin(a)];
      const { lines: gl } = strokeText(String(deg));
      const h = D.numerals.h;
      for (const l of gl) engrave(L, l.map(([tx, ty]) => [c[0] + (rt[0] * tx + u[0] * ty) * h, c[1] + (rt[1] * tx + u[1] * ty) * h]), yd, 0.62, 0.55);
    }

    // the maker's plate
    const Lb = D.label;
    const lc = [Lb.r * Math.cos(Lb.angle), Lb.r * Math.sin(Lb.angle)];
    const lu = [-Math.cos(Lb.angle), -Math.sin(Lb.angle)];
    const lr = [-Math.sin(Lb.angle), Math.cos(Lb.angle)];
    const P2 = (x, y) => [lc[0] + lr[0] * x + lu[0] * y, lc[1] + lr[1] * x + lu[1] * y];
    const corner = (cx, cy, a0, rr) => Array.from({ length: 5 }, (_, i) => {
      const a = a0 + (i / 4) * (Math.PI / 2);
      return P2(cx + rr * Math.cos(a), cy + rr * Math.sin(a));
    });
    const hw = Lb.w / 2;
    const hh = Lb.h / 2;
    const cr = 0.025;
    const plateLoop = [
      ...corner(hw - cr, -hh + cr, -Math.PI / 2, cr), ...corner(hw - cr, hh - cr, 0, cr),
      ...corner(-hw + cr, hh - cr, Math.PI / 2, cr), ...corner(-hw + cr, -hh + cr, Math.PI, cr),
    ];
    // plan (x, y) -> extrude space (x, y): the RX turn maps it to (x, h, -y)
    B.add(transformGeo(extrude([plateLoop], yd, yd + 0.012, { smoothAngle: 50 }, triangulate), RX()), identity(), MAT.metal, HULL.small, 0.75, 0.75);
    const yl = yd + 0.012;
    const inset = 0.016;
    engrave(L, [P2(-hw + inset + 0.03, -hh + inset), P2(hw - inset - 0.03, -hh + inset), P2(hw - inset - 0.03, hh - inset), P2(-hw + inset + 0.03, hh - inset)], yl, 0.5, 0.5, true);
    for (const [txt, yy, size] of [['R. ZHU', 0.026, 0.048], ['MMXXVI', -0.034, 0.036]]) {
      const { lines: gl } = strokeText(txt, { tracking: 0.18 });
      for (const l of gl) engrave(L, l.map(([tx, ty]) => P2(tx * size, yy + ty * size)), yl, 0.55, 0.72);
    }
    for (const sx of [-1, 1]) {
      const p = P2(sx * (hw - 0.03), 0);
      B.add(screwHead(0.017, 0.01), translate(plan(p, yl)), MAT.screw, HULL.small, 0, 0);
      slot(L, plan(p, yl + 0.0105), UP, range(0, Math.PI), 0.026);
    }
    // screws holding the dial down
    for (let k = 0; k < D.screws.n; k++) {
      const a = D.screws.phase + (k / D.screws.n) * Math.PI * 2;
      const p = [D.screws.r * Math.cos(a), D.screws.r * Math.sin(a)];
      B.add(screwHead(D.screws.head, 0.026), translate(plan(p, yd)), MAT.screw, HULL.small, 0, 0);
      slot(L, plan(p, yd + 0.027), UP, range(0, Math.PI), D.screws.head * 1.6);
    }

    // guilloche: concentric waved rings that fade outward, kept off the
    // recess, the screws and the maker's plate (detail: tier 1 and up)
    if (tier >= 1) {
      const Gq = D.guilloche;
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
      const rings = tier >= 2 ? Gq.n : 4;
      const n = tier >= 3 ? 900 : tier >= 2 ? 720 : 480;
      for (let kk = 0; kk < rings; kk++) {
        const k = tier >= 2 ? kk : kk * 2;
        const r = Gq.r0 + ((Gq.r1 - Gq.r0) * k) / (Gq.n - 1);
        const pts = [];
        for (let i = 0; i < n; i++) {
          const t = (i / n) * Math.PI * 2;
          const rr = r + Gq.amp * Math.sin(Gq.lobes * t + k * 0.9);
          pts.push([rr * Math.cos(t), rr * Math.sin(t)]);
        }
        let run = [];
        const flush = () => {
          if (run.length > 1) engrave(DL, run, yd, 0.55, tones[k]);
          run = [];
        };
        for (let i = 0; i <= n; i++) {
          const p = pts[i % n];
          if (clear(p)) run.push(p);
          else flush();
        }
        flush();
      }
    }

    // feet, knurled
    for (let k = 0; k < FEET.n; k++) {
      const a = FEET.phase + (k / FEET.n) * Math.PI * 2;
      const m = compose([FEET.r * Math.cos(a), 0, -FEET.r * Math.sin(a)], yawQ(a));
      B.add(lathe(FOOT_PROFILE, { seg: seg(32) }), m, MAT.bronze, HULL.mid, 0.75, 0.7);
      if (tier >= 1) knurl(DL, m, FEET.radius + 0.0012, GROUND_Y + 0.024, BASE.bottom - 0.034, 22, 0.45);
    }

    // the recess floor: the plate beneath the rete (almucantars, zenith toward the back)
    const yf = BASE.top;
    const keep = (p) => {
      const r = Math.hypot(p[0], p[1]);
      return r < ASTRO.limbIn - 0.01 && r > 0.29;
    };
    for (const al of almucantars(10)) {
      for (const run of clippedCircle(al.c, al.r, keep, 300)) engrave(L, run, yf, al.alt === 0 ? 0.65 : 0.45, al.alt === 0 ? 0.3 : al.alt < 0 ? -0.7 : 0.12);
    }
    for (const rr of [ASTRO.Req, ASTRO.Rcnc]) for (const run of clippedCircle([0, 0], rr, keep, 240)) engrave(L, run, yf, 0.45, -0.75);
    engrave(L, Array.from({ length: 200 }, (_, k) => [ASTRO.limbIn * Math.cos((k / 200) * Math.PI * 2), ASTRO.limbIn * Math.sin((k / 200) * Math.PI * 2)]), yf, 0.5, -0.8, true);
    // perlage (overlapping circular graining) round the idler and pinion
    if (tier >= 3) {
      const pr = 0.034;
      const ps = 0.046;
      for (let j = -60; j <= 60; j++) {
        for (let i = -60; i <= 60; i++) {
          const x = i * ps + (j % 2 ? ps / 2 : 0);
          const z = j * ps * 0.866;
          if (Math.hypot(x, z) < ASTRO.tipR + 0.05) continue;
          if (pocket.field(x, z) > -0.04) continue;
          // under the idler's and the pinion's discs it is never seen
          if (Math.hypot(x - T0.idler.c[0], z - T0.idler.c[2]) < (GEAR.idler.z * GEAR.module) / 2 - 0.08) continue;
          if (Math.hypot(x - T0.pinion.c[0], z - T0.pinion.c[2]) < (GEAR.pinion.z * GEAR.module) / 2 - 0.06) continue;
          const ringP = Array.from({ length: 14 }, (_, k) => [x + pr * Math.cos((k / 14) * Math.PI * 2), -z + pr * Math.sin((k / 14) * Math.PI * 2)]);
          engrave(DL, ringP, yf, 0.42, -0.62, true);
        }
      }
    }
    // bushings: each wheel stands on one
    const bush = (r0, r1) => lathe([[r0, 0], [r1, 0], [r1, y0 * 0.6], [r1 - 0.012, y0], [r0, y0], [r0, 0]], { seg: seg(48) });
    B.add(bush(ASTRO.bore, 0.27), identity(), MAT.metal, HULL.small, 0.7, 0.65);
    B.add(bush(0.03, 0.1), translate([T0.idler.c[0], 0, T0.idler.c[2]]), MAT.metal, HULL.small, 0.7, 0.65);
    B.add(bush(0.03, 0.078), translate([T0.pinion.c[0], 0, T0.pinion.c[2]]), MAT.metal, HULL.small, 0.7, 0.65);
  }

  // ===================================================== the astrolabe wheel ===
  {
    const W = group('wheel', 'wheel');
    W.add(gearPart(GEAR.main.z, GEAR.main.thick, R.holes, 28 * DEG), translate([0, y0, 0]), MAT.astro, HULL.big, 1.0, 0.85);
    const yt = y0 + GEAR.main.thick;
    const L = W.lines;
    const RC = LINE_FLAGS.RULE;
    // degree scale on the limb (clipped under the rule in the shader)
    const sc = ASTRO.scale;
    engrave(L, Array.from({ length: 360 }, (_, k) => [sc.r0 * Math.cos((k / 360) * Math.PI * 2), sc.r0 * Math.sin((k / 360) * Math.PI * 2)]), yt, 0.5, 0.45, true, RC, 0.012);
    for (let d = 0; d < 360; d += 2) {
      const a = d * DEG;
      const r1 = d % 30 === 0 ? sc.major : d % 10 === 0 ? sc.mid : sc.minor;
      engrave(L, [[sc.r0 * Math.cos(a), sc.r0 * Math.sin(a)], [r1 * Math.cos(a), r1 * Math.sin(a)]], yt, d % 10 === 0 ? 0.75 : 0.5, d % 30 === 0 ? 0.62 : 0.38, false, RC, 0.012);
    }
    // the ecliptic's divisions
    const ec = ASTRO.ecl;
    for (let lon = 0; lon < 360; lon += 10) {
      const qq = eclipticPoint(lon);
      const v = [qq[0] - ec.c[0], qq[1] - ec.c[1]];
      const l = Math.hypot(v[0], v[1]);
      const k = lon % 30 === 0 ? 0.9 : 0.5;
      const e0 = [ec.c[0] + (v[0] / l) * (ec.rho - ec.hw * k), ec.c[1] + (v[1] / l) * (ec.rho - ec.hw * k)];
      const e1 = [ec.c[0] + (v[0] / l) * (ec.rho + ec.hw * k), ec.c[1] + (v[1] / l) * (ec.rho + ec.hw * k)];
      engrave(L, [e0, e1], yt, 0.5, lon % 30 === 0 ? 0.5 : 0.3, false, RC, 0.012);
    }
    // the top face's crease ribbons are clipped under the rule too
    for (let i = 0; i < L.count; i++) {
      const ya = L.a[3 * i + 1];
      const yb = L.b[3 * i + 1];
      if (Math.abs(ya - yt) < 1e-4 && Math.abs(yb - yt) < 1e-4 && !(L.p[4 * i + 3] & RC)) L.p[4 * i + 3] += RC;
    }
  }

  // ================================================================ the rule ===
  {
    const Rg = group('rule', 'wheel');
    const yt = y0 + GEAR.main.thick;
    const ad = ASTRO.alidade;
    const qa = yawQ(ALIDADE_ANGLE);
    const al = transformGeo(extrude([alidadeOutline(), circleLoop(ad.hole, 48).reverse()], 0, ad.thick, { hatchAngle: 0, smoothAngle: 30 }, triangulate), RX());
    Rg.add(al, compose([0, yt, 0], qa), MAT.metal, HULL.mid, 0.9, 0.85);
    const qm = fromQuat(qa);
    for (const sgn of [1, -1]) {
      const vb = box(sgn * ad.vaneAt - ad.vane[0], sgn * ad.vaneAt + ad.vane[0], yt + ad.thick, yt + ad.thick + ad.vaneH, -ad.vane[1], ad.vane[1]);
      Rg.add(vb, qm, MAT.metal, HULL.small, 0.7, 0.75);
      // the sight hole, engraved on both faces of the vane
      for (const f of [1, -1]) {
        const ring = [];
        const nrm = applyDir(qm, [f, 0, 0]);
        for (let k = 0; k <= 12; k++) {
          const t = (k / 12) * Math.PI * 2;
          ring.push(apply(qm, [sgn * ad.vaneAt + f * (ad.vane[0] + 0.0008), yt + ad.thick + ad.vaneH * 0.62 + 0.012 * Math.sin(t), 0.012 * Math.cos(t)]));
        }
        Rg.lines.polyline(ring, 0.6, 0.15, { normal: nrm });
      }
    }
    // the pin through the hub, with a domed head
    Rg.add(lathe([[0, y0], [ad.hole - 0.002, y0], [ad.hole - 0.002, yt + ad.thick + 0.012], [0.08, yt + ad.thick + 0.012], [0.07, yt + ad.thick + 0.03], [0.04, yt + ad.thick + 0.042], [0, yt + ad.thick + 0.045]], { seg: seg(48) }), identity(), MAT.metal, HULL.mid, 0.8, 0.75);
  }

  // ============================================================== the idler ===
  {
    const I = group('idler', 'gears');
    const holes = spokeWindows(4, 0.16, 0.4, 0.04, { phase: 0.4 }).map((l) => chaikin(l, 2));
    holes.push(circleLoop(0.05, 24).reverse());
    I.add(gearPart(GEAR.idler.z, GEAR.idler.thick, holes, -34 * DEG), translate([0, y0, 0]), MAT.gear, HULL.big, 1.05, 0.85);
    I.add(lathe([[0, 0.09], [0.11, 0.09], [0.11, 0.105], [0.08, 0.125], [0.03, 0.135], [0, 0.137]], { seg: seg(48) }), identity(), MAT.metal, HULL.mid, 0.85, 0.7);
    for (let k = 0; k < 3; k++) {
      const a = 0.3 + (k * 2 * Math.PI) / 3;
      const p = [0.135 * Math.cos(a), 0.135 * Math.sin(a)];
      I.add(screwHead(0.018, 0.01), translate(plan(p, 0.09)), MAT.screw, HULL.small, 0, 0);
      slot(I.lines, plan(p, 0.1005), UP, a + 0.6, 0.028);
    }
  }

  // ===================================================== the pinion and crank ===
  {
    const P = group('pinion', 'gears');
    P.add(gearPart(GEAR.pinion.z, GEAR.pinion.thick, [circleLoop(0.036, 24).reverse()], 62 * DEG), translate([0, y0, 0]), MAT.gear, HULL.big, 1.05, 0.85);
    P.add(lathe(
      [[0, 0.02], [0.036, 0.02], [0.036, 0.395], [0.062, 0.395], [0.062, 0.4225], [0.036, 0.4225], [0.036, 0.4575],
        [0.046, 0.4575], [0.046, 0.483], [0.035, 0.493], [0, 0.493]],
      { seg: seg(40) },
    ), identity(), MAT.metal, HULL.mid, 0.8, 0.7);
    // a jewelled bushing: a chaton holding a ring jewel round the arbor
    const yp = y0 + GEAR.pinion.thick;
    P.add(lathe([[0.04, yp], [0.078, yp], [0.078, yp + 0.012], [0.07, yp + 0.02], [0.058, yp + 0.02], [0.058, yp + 0.012], [0.04, yp + 0.012], [0.04, yp]], { seg: seg(40) }), identity(), MAT.metal, HULL.small, 0.75, 0.75);
    P.add(lathe([[0.037, yp + 0.012], [0.057, yp + 0.012], [0.057, yp + 0.017], [0.05, yp + 0.024], [0.037, yp + 0.025], [0.037, yp + 0.012]], { seg: seg(40), edges: false }), identity(), MAT.screw, HULL.small, 0, 0);
    for (const s of [0, Math.PI]) {
      const a = 0.7 + s;
      const p = [0.125 * Math.cos(a), 0.125 * Math.sin(a)];
      P.add(screwHead(0.017, 0.01), translate(plan(p, yp)), MAT.screw, HULL.small, 0, 0);
      slot(P.lines, plan(p, yp + 0.0105), UP, a + 0.9, 0.026);
    }
    // the crank arm (along +x at rest), the nut on the arbor, the handle
    {
      const Lc = CRANK.arm;
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
        loop.push([Lc + r1 * Math.cos(a), r1 * Math.sin(a)]);
      }
      const arm = transformGeo(extrude([loop], -0.0175, 0.0175, { hatchAngle: Math.PI / 2, smoothAngle: 30 }, triangulate), RX());
      P.add(arm, translate([0, CRANK.armY, 0]), MAT.metal, HULL.big, 0.95, 0.8);
    }
    const nut = transformGeo(extrude([hexLoop(0.06), circleLoop(0.036, 20).reverse()], 0, 0.026, { smoothAngle: 10 }, triangulate), RX());
    P.add(nut, translate([0, CRANK.armY + 0.0175, 0]), MAT.metal, HULL.small, 0.75, 0.75);
    const hb = [CRANK.arm, CRANK.armY + 0.0175, 0];
    P.add(lathe([[0.016, 0], [0.056, 0], [0.056, 0.008], [0.016, 0.008], [0.016, 0]], { seg: seg(40) }), translate(hb), MAT.metal, HULL.small, 0.7, 0.7);
    const hm = translate([hb[0], hb[1] + 0.008, hb[2]]);
    P.add(lathe(HANDLE_PROFILE, { seg: seg(40), hatch: 'meridian', smoothAngle: 34 }), hm, MAT.handle, HULL.mid, 0.9, 0.7, { accent: true });
    knurl(P.lines, hm, 0.0465, 0.1, 0.25, 16, 0.5, true, 0.6);
  }

  // ============================================================== the column ===
  const east = eastAxis();
  {
    const Cg = group('column', 'column');
    Cg.add(lathe(COLUMN_PROFILE, { seg: seg(56) }), identity(), MAT.bronze, HULL.big, 0.85, 0.7);
    // the bearing cap over the wheel's hub, the column standing on it
    Cg.add(lathe([[0.13, 0.09], [0.27, 0.09], [0.27, 0.11], [0.25, 0.125], [0.13, 0.125], [0.13, 0.09]], { seg: seg(64) }), identity(), MAT.bronze, HULL.mid, 0.85, 0.7);
    for (let k = 0; k < 3; k++) {
      const a = 0.4 + (k * 2 * Math.PI) / 3;
      const p = [0.232 * Math.cos(a), 0.232 * Math.sin(a)];
      Cg.add(screwHead(0.013, 0.008), translate(plan(p, 0.125)), MAT.screw, HULL.small, 0, 0);
      slot(Cg.lines, plan(p, 0.1335), UP, a + 1.1, 0.02);
    }
  }

  // ============================================================ the armillary ===
  const Cc = ARMILLARY.c;
  const Pax = polarAxis();
  const N0 = ringNormals(0);
  const ringPiece = (Gp, k, nrm, mat = MAT.ring) => {
    const r = ARMILLARY.rings[k];
    Gp.add(annulus(r.R, r.R - r.w, ARMILLARY.thick, { seg: seg(224) }), compose(Cc, quatFromTo(Z, nrm)), mat, HULL.mid, 0.95, 0.8);
  };
  // a stud joining two nested rings along a radius, riveted over at both
  // ends: a dome on the outer ring's rim (rOut) and one inside the inner
  // ring's rim (rIn), facing the centre
  const dome = (rr) => lathe([[0, 0], [rr, 0], [rr * 0.92, rr * 0.3], [rr * 0.62, rr * 0.62], [0, rr * 0.75]], { seg: seg(16), edges: false });
  const stud = (Gp, dirv, r0, r1, rad, rOut, rIn) => {
    for (const s of [1, -1]) {
      const d = mulS(norm(dirv), s);
      const g = lathe([[0, r0], [rad, r0], [rad, r1], [0, r1]], { seg: seg(16), edges: false });
      Gp.add(g, compose(Cc, quatFromTo(Y, d)), MAT.metal, HULL.small, 0, 0);
      Gp.add(dome(rad * 1.45), compose(add(Cc, mulS(d, rOut)), quatFromTo(Y, d)), MAT.metal, HULL.small, 0, 0);
      Gp.add(dome(rad * 1.3), compose(add(Cc, mulS(d, rIn)), quatFromTo(Y, mulS(d, -1))), MAT.metal, HULL.small, 0, 0);
    }
  };
  {
    // the meridian ring standing in its fork on the column top
    const M = group('meridian', 'rings');
    ringPiece(M, 0, east);
    const qs = yawQ(ARMILLARY.north);
    const qsm = fromQuat(qs);
    M.add(box(-0.15, 0.15, COLUMN.top - 0.035, COLUMN.top + 0.07, -0.06, 0.06), qsm, MAT.bronze, HULL.mid, 0.8, 0.75);
    // two cheeks either side of the ring's foot, a pin through them
    const t = ARMILLARY.thick;
    for (const s of [1, -1]) {
      const cz0 = s > 0 ? t / 2 + 0.002 : -t / 2 - 0.028;
      M.add(box(-0.1, 0.1, COLUMN.top + 0.07, COLUMN.top + 0.19, cz0, cz0 + 0.026), qsm, MAT.bronze, HULL.small, 0.7, 0.75);
    }
    const pinY = COLUMN.top + 0.13;
    M.add(lathe([[0, -0.05], [0.016, -0.05], [0.016, 0.05], [0, 0.05]], { seg: seg(16) }), compose([0, pinY, 0], quatFromTo(Y, east)), MAT.metal, HULL.small, 0.6, 0.7);
    for (const s of [1, -1]) {
      const c = add([0, pinY, 0], mulS(east, s * 0.05));
      M.add(screwHead(0.022, 0.01), compose(c, quatFromTo(Y, mulS(east, s))), MAT.screw, HULL.small, 0, 0);
      slot(M.lines, add(c, mulS(east, s * 0.0105)), mulS(east, s), 0.6, 0.032);
    }
    // bearing bosses where the polar axis passes through the meridian ring
    const Rm = ARMILLARY.rings[0];
    const bossG = lathe([[0, -0.03], [0.04, -0.03], [0.05, -0.015], [0.05, 0.015], [0.04, 0.03], [0, 0.03]], { seg: seg(24) });
    for (const s of [1, -1]) M.add(bossG, compose(add(Cc, mulS(Pax, s * (Rm.R - Rm.w / 2))), quatFromTo(Y, Pax)), MAT.bronze, HULL.small, 0.65, 0.7);
  }
  {
    // the horizon ring on four bowed posts that spring from a spider
    const H = group('horizon', 'rings');
    const Hr = ARMILLARY.horizon;
    H.add(annulus(Hr.r1, Hr.r0, Hr.thick, { seg: seg(240) }), compose(Cc, quatFromTo(Z, Y)), MAT.ring, HULL.mid, 0.95, 0.8);
    const sp = ARMILLARY.spider;
    H.add(lathe([[0.168, sp.y - 0.03], [sp.r + 0.05, sp.y - 0.025], [sp.r + 0.05, sp.y + 0.005], [sp.r, sp.y + 0.02], [0.168, sp.y + 0.02], [0.168, sp.y - 0.03]], { seg: seg(56) }), identity(), MAT.bronze, HULL.mid, 0.8, 0.7);
    const nP = 18;
    for (let k = 0; k < ARMILLARY.posts.n; k++) {
      const pts = [];
      const radii = [];
      for (let i = 0; i <= nP; i++) {
        const t = i / nP;
        pts.push(postPoint(k, t));
        radii.push(ARMILLARY.posts.r * (1 + 0.55 * Math.exp(-(((t - 0.16) / 0.07) ** 2)) + 0.35 * Math.exp(-(((t - 0.62) / 0.04) ** 2)) - 0.15 * t));
      }
      const a = ARMILLARY.north + 45 * DEG + k * 90 * DEG;
      const side = dir(a + Math.PI / 2);
      H.add(tube(pts, radii, side, { sides: tier >= 2 ? 12 : 8 }), identity(), MAT.bronze, HULL.small, 0, 0);
      const top = pts[nP];
      H.add(lathe([[0, -0.012], [0.042, -0.012], [0.042, 0.0], [0.036, 0.008], [0, 0.008]], { seg: seg(20) }), translate([top[0], top[1] - 0.005, top[2]]), MAT.metal, HULL.small, 0.6, 0.7);
    }
    // clamps where the meridian passes the horizon's inner edge
    const Rm = ARMILLARY.rings[0].R;
    const qn = fromQuat(yawQ(ARMILLARY.north));
    for (const s of [1, -1]) {
      const x0 = s > 0 ? Rm - 0.03 : -Hr.r0 - 0.05;
      const x1 = s > 0 ? Hr.r0 + 0.05 : -Rm + 0.03;
      const tz = ARMILLARY.thick / 2 + 0.014;
      H.add(box(x0, x1, Cc[1] - Hr.thick / 2 - 0.01, Cc[1] + Hr.thick / 2 + 0.01, -tz, tz), qn, MAT.bronze, HULL.small, 0.7, 0.75);
    }
  }
  {
    // the equator, fixed to the meridian by two studs
    const E = group('equator', 'rings');
    ringPiece(E, 1, N0.equator);
    const Rk = ARMILLARY.rings;
    stud(E, cross(east, Pax), Rk[1].R - 0.01, Rk[0].R - 0.004, 0.02, Rk[0].R - 0.002, Rk[1].R - Rk[1].w + 0.002);
  }
  {
    // the ecliptic, studded to the colure where their planes cross
    const Ec = group('ecliptic', 'rings');
    ringPiece(Ec, 2, N0.ecliptic);
    const Rk = ARMILLARY.rings;
    stud(Ec, cross(N0.ecliptic, N0.colure), Rk[3].R - 0.01, Rk[2].R - 0.004, 0.018, Rk[2].R - 0.002, Rk[3].R - Rk[3].w + 0.002);
  }
  {
    const Co = group('colure', 'rings');
    ringPiece(Co, 3, N0.colure);
  }
  {
    // the polar axis, its hubs on the colure, the globe and two beads
    const Gl = group('globe', 'rings');
    const h = ARMILLARY.axisHalf;
    const gq = quatFromTo(Y, Pax);
    Gl.add(lathe([[0, -h], [0.02, -h], [0.02, h], [0, h]], { seg: seg(24), hatch: 'meridian', edges: false }), compose(Cc, gq), MAT.metal, HULL.small, 0, 0);
    const hub = lathe([[0, -0.03], [0.045, -0.03], [0.045, 0.03], [0, 0.03]], { seg: seg(20) });
    for (const s of [1, -1]) Gl.add(hub, compose(add(Cc, mulS(Pax, s * ARMILLARY.rings[3].R)), gq), MAT.metal, HULL.small, 0.6, 0.7);
    Gl.spheres.push({ id: 'globe', pattern: PATTERN_ID.grid, seed: 7, n: 24, matrix: compose(Cc, gq, ARMILLARY.globeR), r: ARMILLARY.globeR, hull: HULL.big });
    [1, -1].forEach((s, k) => {
      const c = add(Cc, mulS(Pax, s * h));
      Gl.spheres.push({ id: 'bead' + k, pattern: PATTERN_ID.rings, seed: 3 + k, n: 12, matrix: compose(c, gq, ARMILLARY.beadR), r: ARMILLARY.beadR, hull: HULL.mid });
    });
  }

  // ================================================================ the arms ===
  // Authored at the ending layout in the arm frame; pose.js bends the six
  // bones: 0 collar, 1 rod (stretches), 2 knuckle, 3 stem (stretches), 4
  // pivot cup, 5 hoop with its pins and finial (turns, grows).
  const C1 = ROD.collar;
  const collar = lathe([[0, -0.042], [C1[0], -0.042], [C1[1], -0.026], [C1[1], 0.026], [C1[0], 0.042], [0, 0.042]], { seg: seg(48) });
  const socket = lathe([[0, 0], [0.056, 0], [0.056, 0.03], [0.047, 0.07], [0.047, 0.085], [0, 0.085]], { seg: seg(24) });
  const knuckle = lathe([[0, -0.05], [0.042, -0.05], [ROD.knuckle, -0.028], [ROD.knuckle, 0.028], [0.042, 0.05], [0, 0.05]], { seg: seg(28) });
  const setScrew = lathe([[0, 0], [0.022, 0], [0.022, 0.03], [0.018, 0.036], [0, 0.037]], { seg: seg(14), edges: false });
  const pivot = lathe([[0, -0.03], [0.034, -0.03], [0.048, -0.012], [0.048, 0.008], [0.04, 0.016], [0, 0.016]], { seg: seg(24) });
  const finial = lathe([[0, 0], [0.02, 0], [0.028, 0.022], [0.024, 0.044], [0.011, 0.06], [0, 0.066]], { seg: seg(24) });
  const X = [1, 0, 0];
  const sideV = [0, 0, 1];
  ARMS.forEach((A) => {
    const Ag = group('arm:' + A.id, 'arms');
    Ag.arm = A.id;
    Ag.add(collar, translate([0, A.h, 0]), MAT.bronze, HULL.mid, 0.75, 0.6, { bone: 0 });
    Ag.add(setScrew, compose(add(mulS(sideV, C1[1] - 0.004), [0, A.h, 0]), quatFromTo(Y, sideV)), MAT.screw, HULL.small, 0, 0, { bone: 0 });
    slot(Ag.lines, add(mulS(sideV, C1[1] + 0.033), [0, A.h, 0]), sideV, 0, 0.03, -0.08, 0);
    Ag.add(socket, compose([C1[1] - 0.01, A.h, 0], quatFromTo(Y, X)), MAT.metal, HULL.small, 0.7, 0.6, { bone: 0 });
    const rodLen = A.L - ROD_START - 0.04;
    Ag.add(lathe([[0, 0], [ROD.root, 0], [ROD.tip, rodLen], [0, rodLen]], { seg: seg(20), hatch: 'meridian', edges: false }), compose([ROD_START, A.h, 0], quatFromTo(Y, X)), MAT.metal, HULL.small, 0, 0, { bone: 1 });
    Ag.add(knuckle, translate([A.L, A.h, 0]), MAT.metal, HULL.small, 0.7, 0.6, { bone: 2 });
    const stemLen = A.stem - 0.05;
    Ag.add(lathe([[0, 0], [ROD.stem[0], 0], [ROD.stem[1], stemLen], [0, stemLen]], { seg: seg(20), hatch: 'meridian', edges: false }), translate([A.L, A.h + 0.048, 0]), MAT.metal, HULL.small, 0, 0, { bone: 3 });
    Ag.add(pivot, translate([A.L, A.h + A.stem, 0]), MAT.metal, HULL.small, 0.65, 0.65, { bone: 4 });
    const hoopR = A.r * HOOP.scale;
    const centre = [A.L, A.h + A.stem + hoopR, 0];
    Ag.add(annulus(hoopR, hoopR - HOOP.width, HOOP.thick, { seg: seg(128) }), compose(centre, quatFromTo(Z, X)), MAT.hoop, HULL.mid, 0.75, 0.75, { bone: 5, accent: true });
    const pinLen = hoopR - HOOP.width - A.r + 0.012;
    const pin = lathe([[0, 0], [0.012, 0], [0.012, pinLen], [0, pinLen]], { seg: seg(14), edges: false });
    Ag.add(pin, translate([centre[0], centre[1] + A.r - 0.006, centre[2]]), MAT.metal, HULL.small, 0, 0, { bone: 5 });
    Ag.add(pin, compose([centre[0], centre[1] - A.r + 0.006, centre[2]], quatAxis(Z, Math.PI)), MAT.metal, HULL.small, 0, 0, { bone: 5 });
    Ag.add(finial, translate([centre[0], centre[1] + hoopR - 0.004, centre[2]]), MAT.metal, HULL.small, 0.6, 0.6, { bone: 5 });
    Ag.spheres.push({ id: A.id, pattern: PATTERN_ID[A.pattern], seed: Math.floor(range(1, 90)), n: 28, r: A.r, hull: HULL.big });
  });

  // ============================================================ contact shell ===
  {
    const S = group('shell', 'contact');
    S.add(uvSphere(seg(112), seg(72)), identity(), MAT.shell, HULL.big, 0, 0);
  }

  return { groups: G, tier, rete: R, pocket };
}

/** The rest matrix (group frame -> instrument frame) used to bake ambient occlusion. */
export function restMatrix(id) {
  const T = trainLayout(0);
  if (id === 'wheel') return rotY(T.main.rot);
  if (id === 'idler') return mul(translate(T.idler.c), rotY(T.idler.rot));
  if (id === 'pinion') return mul(translate(T.pinion.c), rotY(T.pinion.rot));
  return identity();
}

export { rotateVec };
