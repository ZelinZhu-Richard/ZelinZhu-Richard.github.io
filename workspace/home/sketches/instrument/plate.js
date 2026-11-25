// Act 1: the main wheel drawn flat, as an astrolabe face in a notebook.
// Plan view of the 48-tooth wheel: the limb with its degree scale, the
// pierced rete (ecliptic ring, bars, twelve star flames), the almucantars of
// the plate beneath showing through its piercings, and the alidade across
// the centre, pinned at the hub. The page is a notebook page: its edge, the
// edge of the page under it, a faint margin rule and a dot grid; three
// handwritten notes on curved leaders.
//
// Drawing coordinates (x, y) are the plan: x right, y up on the page. They
// map to world (x, 0, -y); the wheel's own features turn with the wheel
// (same angle as the solid), the plate beneath, the rule and the page do not.
// mode 'plate' draws everything; mode 'ghost' is what the lifted wheel
// leaves on the page: outlines only, dimmer, the plate's almucantars whole
// (the rete no longer hides them), no notes.

import * as THREE from 'three';
import { LineSet } from './lines.js';
import { solidMaterial } from './materials.js';
import { GeoBuilder } from './geom.js';
import { gearOutline } from './gear.js';
import { LAYERS } from './machine.js';
import { GEAR, ALIDADE_ANGLE, PLATE } from './layout.js';
import { ASTRO, rete, reteOpen, almucantars, alidadeOutline, alidadeCovers, eclipticPoint, clippedCircle } from './rete.js';
import { buildPoints } from './stars.js';
import { PALETTE } from './palette.js';

export { PLATE };

const UP = [0, 1, 0];
const DEG = Math.PI / 180;

const circle = (r, n = 256, cx = 0, cy = 0) => {
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    out.push([cx + r * Math.cos(t), cy + r * Math.sin(t)]);
  }
  return out;
};

function rot2(p, th) {
  const c = Math.cos(th);
  const s = Math.sin(th);
  return [p[0] * c - p[1] * s, p[0] * s + p[1] * c];
}

// Split a polyline into the runs where keep(p) holds, resampled finely so
// clipping follows the predicate rather than the original vertices.
function clipRuns(pts, keep, closed = false, step = 0.008) {
  const src = closed ? [...pts, pts[0]] : pts;
  const runs = [];
  let cur = [];
  const push = (p) => {
    if (keep(p)) cur.push(p);
    else if (cur.length) {
      if (cur.length > 1) runs.push(cur);
      cur = [];
    }
  };
  for (let i = 0; i < src.length - 1; i++) {
    const a = src[i];
    const b = src[i + 1];
    const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / step));
    for (let k = 0; k < n; k++) push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
  }
  push(src[src.length - 1]);
  if (cur.length > 1) runs.push(cur);
  return runs;
}

function rounded(x0, y0, x1, y1, r, n = 6) {
  const out = [];
  const corner = (cx, cy, a0) => {
    for (let i = 0; i <= n; i++) {
      const a = a0 + (i / n) * (Math.PI / 2);
      out.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
    }
  };
  corner(x1 - r, y0 + r, -Math.PI / 2);
  corner(x1 - r, y1 - r, 0);
  corner(x0 + r, y1 - r, Math.PI / 2);
  corner(x0 + r, y0 + r, Math.PI);
  return out;
}

export function buildPlate({ layout, mode, rot, group, alidade = ALIDADE_ANGLE }) {
  const P = PLATE[layout];
  const ghost = mode === 'ghost';
  const lines = new LineSet(group, { bias: ghost ? 0.0025 : 0 });
  const Y0 = 0.003;
  const W = (p) => [p[0], Y0, -p[1]];
  const Wl = (pts) => pts.map(W);
  const g = (p) => rot2(p, rot); // wheel frame -> drawing
  const gi = (p) => rot2(p, -rot); // drawing -> wheel frame
  const ali = (p) => rot2(p, alidade); // rule frame -> drawing
  const alii = (p) => rot2(p, -alidade);
  // ghost lines use the dim hairline tones (line..faint): brighter for
  // the main outline, dimmer for what was secondary
  const tone = (t) => (ghost ? -(0.42 + 0.46 * Math.max(0, Math.min(1, t))) : t);
  const wk = ghost ? 0.85 : 1;
  const poly = (pts, w, t, closed = true) => lines.polyline(Wl(pts), w * wk, tone(t), { closed, normal: UP });
  const chain = (pts, pat, w, t, closed = false) => lines.pattern(Wl(pts), pat, w * wk, tone(t), { closed, normal: UP });
  const seg = (a, b, w, t) => lines.seg(W(a), W(b), UP, UP, w * wk, tone(t));
  // in the drawing the rule hides what lies under it; once lifted it is gone
  const underRule = (p) => !ghost && alidadeCovers(alii(p));
  const runs = (pts, w, t, closed, keep) => {
    for (const r of clipRuns(pts, keep, closed)) poly(r, w, t, false);
  };
  const R = rete();
  const A = ASTRO;

  // ------------------------------------------------------- the wheel ---
  // Line weights (CSS px) are set for the page at 220 px per unit: the
  // wheel's outline and the rete (its bars and flames) read at a glance,
  // the scale and the plate beneath stay finer.
  const { pts: outline } = gearOutline(GEAR.main.z, GEAR.module);
  poly(outline.map(g), 2.1, 1.0);
  for (const h of R.holes) runs(h.map(g), 1.6, 1.0, true, (p) => !underRule(p));

  if (!ghost) {
    // limb: the degree scale, turning with the wheel
    const sc = A.scale;
    runs(circle(sc.r0, 360).map(g), 0.8, 0.5, true, (p) => !underRule(p));
    for (let d = 0; d < 360; d += 2) {
      const a = d * DEG;
      const major = d % 30 === 0;
      const mid = d % 10 === 0;
      const r1 = major ? sc.major : mid ? sc.mid : sc.minor;
      const p0 = g([sc.r0 * Math.cos(a), sc.r0 * Math.sin(a)]);
      const p1 = g([r1 * Math.cos(a), r1 * Math.sin(a)]);
      if (underRule(p0) || underRule(p1)) continue;
      seg(p0, p1, major ? 1.25 : mid ? 0.95 : 0.75, major ? 0.75 : mid ? 0.56 : 0.42);
    }
    // ecliptic: a division across the band every 10 deg of longitude
    const ec = A.ecl;
    for (let lon = 0; lon < 360; lon += 10) {
      const q = eclipticPoint(lon);
      const v = [q[0] - ec.c[0], q[1] - ec.c[1]];
      const l = Math.hypot(v[0], v[1]);
      const k = lon % 30 === 0 ? 0.92 : 0.5;
      const a = g([ec.c[0] + (v[0] / l) * (ec.rho - ec.hw * k), ec.c[1] + (v[1] / l) * (ec.rho - ec.hw * k)]);
      const b = g([ec.c[0] + (v[0] / l) * (ec.rho + ec.hw * k), ec.c[1] + (v[1] / l) * (ec.rho + ec.hw * k)]);
      if (underRule(a) || underRule(b)) continue;
      seg(a, b, lon % 30 === 0 ? 1.0 : 0.75, lon % 30 === 0 ? 0.66 : 0.4);
    }
  }

  // ----------------------------------------- the plate beneath the rete ---
  // seen through the piercings while the rete is on it; whole once it lifts
  const open = ghost
    ? (p) => Math.hypot(p[0], p[1]) < A.limbIn - 0.004 && Math.hypot(p[0], p[1]) > A.bore
    : (p) => !underRule(p) && reteOpen(gi(p), 0.007) && Math.hypot(p[0], p[1]) > A.bore;
  for (const a of almucantars(10)) {
    const t = a.alt === 0 ? 0.36 : a.alt < 0 ? -0.7 : 0.14;
    const w = a.alt === 0 ? 0.95 : 0.7;
    for (const r of clippedCircle(a.c, a.r, open, 540)) {
      if (a.alt < 0) chain(r, [0.03, 0.025], w, t);
      else poly(r, w, t, false);
    }
  }
  for (const [rr, t] of [[A.Req, -0.85], [A.Rcnc, -0.7]]) {
    for (const r of clippedCircle([0, 0], rr, open, 360)) chain(r, [0.05, 0.02, 0.01, 0.02], 0.65, t);
  }
  // the plate's meridian
  for (const r of clipRuns([[0, -A.limbIn], [0, A.limbIn]], open)) chain(r, [0.12, 0.03, 0.02, 0.03], 0.65, -0.75);

  // ----------------------------------------------------------- the rule ---
  const al = alidadeOutline().map(ali);
  poly(al, 1.7, 1.0);
  const ad = A.alidade;
  chain([ali([-ad.len, 0]), ali([ad.len, 0])], [0.1, 0.03, 0.015, 0.03], 0.7, 0.5);
  for (const sgn of [1, -1]) {
    const x = sgn * ad.vaneAt;
    poly([[x - ad.vane[0], -ad.vane[1]], [x + ad.vane[0], -ad.vane[1]], [x + ad.vane[0], ad.vane[1]], [x - ad.vane[0], ad.vane[1]]].map(ali), 1.2, 0.9);
    poly(circle(0.009, 12, x, 0).map(ali), 0.85, 0.75);
  }
  // the pin through the hub, and its wedge
  poly(circle(0.058, 40), 1.3, 0.95);
  poly(circle(0.03, 24), 0.85, 0.65);
  if (!ghost) {
    const wd = [[0.07, 0.012], [0.2, 0.008], [0.2, -0.008], [0.07, -0.012]].map(ali);
    poly(wd, 0.85, 0.65);
  }

  // ------------------------------------------------------------ notes ---
  const anchors = { centre: [0, Y0, 0], callouts: [] };
  if (!ghost) {
    for (const n of P.notes) {
      let target;
      if (n.target.star) {
        const want = n.target.star;
        let best = null;
        for (const f of R.pointers) {
          const tp = g(f.tip);
          if (underRule(tp)) continue;
          const d = Math.hypot(tp[0] - want[0], tp[1] - want[1]);
          if (!best || d < best.d) best = { d, p: tp };
        }
        target = best.p;
      } else if (n.target.tooth !== undefined) {
        const pitch = (2 * Math.PI) / GEAR.main.z;
        const want = n.target.tooth * DEG;
        const k = Math.round((want - rot) / pitch);
        const ta = k * pitch + rot;
        target = [(A.tipR + 0.015) * Math.cos(ta), (A.tipR + 0.015) * Math.sin(ta)];
      } else {
        target = ali([n.target.rule * (ad.len + 0.045), 0]);
      }
      // a hand-drawn leader: a bowed curve from the words to the mark
      const S = n.at;
      const E = target;
      const L = Math.hypot(E[0] - S[0], E[1] - S[1]);
      const u = [(E[0] - S[0]) / L, (E[1] - S[1]) / L];
      const v = [-u[1], u[0]];
      const C = [(S[0] + E[0]) / 2 + v[0] * L * n.bow, (S[1] + E[1]) / 2 + v[1] * L * n.bow];
      const pts = [];
      for (let i = 0; i <= 40; i++) {
        const t = i / 40;
        const w = 1 - t;
        // a slight tremor, as a pen line has
        const j = 0.004 * Math.sin(t * 23.0 + S[0] * 7) * Math.sin(Math.PI * t);
        pts.push([w * w * S[0] + 2 * w * t * C[0] + t * t * E[0] + v[0] * j, w * w * S[1] + 2 * w * t * C[1] + t * t * E[1] + v[1] * j]);
      }
      const end = pts.length - 1;
      const back = pts[end - 4];
      const dE = [E[0] - back[0], E[1] - back[1]];
      const dl = Math.hypot(dE[0], dE[1]);
      const ue = [dE[0] / dl, dE[1] / dl];
      poly(pts.slice(0, end - 1), 1.0, 0.68, false);
      const head = 0.05;
      for (const s of [1, -1]) {
        const a = rot2(ue, s * 0.42);
        seg(E, [E[0] - a[0] * head, E[1] - a[1] * head], 1.0, 0.68);
      }
      anchors.callouts.push({ id: n.id, text: n.text, at: W(S), align: n.align, hand: true });
    }
  }

  // ------------------------------------------------------------ the page ---
  const [x0, y0, x1, y1] = P.sheet;
  poly(rounded(x0, y0, x1, y1, 0.07), 1.3, ghost ? 0.8 : 0.55);
  // the edge of the page beneath, peeking out right and below
  const o = 0.045;
  poly([[x1 + o, y1 - 0.16], [x1 + o, y0 - o + 0.05], [x1 + o - 0.05, y0 - o], [x0 + 0.16, y0 - o]], 0.9, ghost ? 0.4 : 0.3, false);
  // margin rule
  poly([[x0 + P.margin, y1 - 0.02], [x0 + P.margin, y0 + 0.02]], 0.7, ghost ? 0.1 : -0.8, false);

  const root = new THREE.Group();
  const lineMesh = lines.build();
  lineMesh.layers.set(LAYERS.INK);
  root.add(lineMesh);

  // dot grid, kept off the wheel so the drawing stays clear
  const dots = [];
  const sp = 0.2;
  for (let x = Math.ceil((x0 + P.margin + 0.05) / sp) * sp; x < x1 - 0.06; x += sp) {
    for (let y = Math.ceil((y0 + 0.06) / sp) * sp; y < y1 - 0.06; y += sp) {
      if (Math.hypot(x, y) < A.tipR + 0.08) continue;
      dots.push({ p: W([x, y]), size: 1.25, alpha: ghost ? 0.3 : 0.5 });
    }
  }
  const dotMesh = buildPoints(dots, { color: PALETTE.faint, useQuiet: false, name: 'page-dots', renderOrder: 3 });
  dotMesh.layers.set(LAYERS.INK);
  root.add(dotMesh);

  // the paper itself: invisible where lit, a hairline cross-hatch in shadow
  let sheetMesh = null;
  if (ghost) {
    const B = new GeoBuilder();
    const c = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]].map((p) => B.vertex([p[0], 0, -p[1]], [0, 1, 0], [0, 0], null));
    B.quad(c[0], c[1], c[2], c[3]);
    const mat = solidMaterial({ group, paper: true, ground: true, groundDir: [0.6, 0.8], albedo: 0.9 });
    sheetMesh = new THREE.Mesh(B.build(), mat);
    sheetMesh.layers.set(LAYERS.GROUND);
    root.add(sheetMesh);
  }
  return { group: root, lineMesh, sheetMesh, anchors, sheet: P.sheet };
}

// Points round the wheel's outline where the lift's projection lines run.
export function liftProjections(rot, liftY, angles) {
  const { ra } = gearOutline(GEAR.main.z, GEAR.module);
  return angles.map((deg) => {
    const a = (deg * Math.PI) / 180 + rot;
    const p = [ra * Math.cos(a), ra * Math.sin(a)];
    return { from: [p[0], 0.003, -p[1]], to: [p[0], liftY, -p[1]] };
  });
}
