// The flat astrolabe drawing for the plate act, as ordered ink strokes
// (pure, no three.js). Built from the very data the 3D wheel is built from
// (gearOutline, the rete's traced piercings, ASTRO's scale and ecliptic, the
// alidade outline, the almucantars), in the instrument's own frame: plan
// (x, y) -> (x, PLATE_Y, -y), wheel axis at the origin. Placed with the same
// transform as the instrument, the solid wheel sits exactly over its drawing.
//
// Three sets of ribbons:
//   wheel    the wheel's own features; they turn with the wheel (a child
//            rotated by the wheel's angle, like the solid)
//   fixed    the rule and the centre lines, which do not turn
//   beneath  the plate under the rete, seen through its piercings: depends
//            on the wheel's angle, so it is rebuilt when the angle changes
// Every segment has a draw-on window [from, to] in 0..1 (lines.js order()),
// in the order a draughtsman would: centre lines, the pitch circle (a point
// that draws a line that closes into a circle), the toothed limb, the degree
// scale, the rete, the ecliptic's divisions, the plate beneath, the rule.
// Plate lines carry flag PLATE; the dimmer outline a lifted wheel leaves on
// the page carries GHOST (setGhost cross-fades the two).

import { LineData, LINE_FLAGS } from './lines.js';
import { gearOutline } from './gear.js';
import { GEAR, ALIDADE_ANGLE, trainLayout } from './layout.js';
import { ASTRO, rete, reteOpen, almucantars, alidadeOutline, alidadeCovers, eclipticPoint, clippedCircle } from './rete.js';

export const PLATE_Y = 0.003;
const UP = [0, 1, 0];
const DEG = Math.PI / 180;

/** Draw-on windows of the stroke families, in order. */
export const DRAW_ORDER = Object.freeze([
  { id: 'centre', from: 0.0, to: 0.06 },
  { id: 'pitch', from: 0.06, to: 0.16 },
  { id: 'limb', from: 0.16, to: 0.32 },
  { id: 'scale', from: 0.32, to: 0.45 },
  { id: 'rete', from: 0.45, to: 0.68 },
  { id: 'ecliptic', from: 0.68, to: 0.74 },
  { id: 'beneath', from: 0.74, to: 0.88 },
  { id: 'rule', from: 0.88, to: 1.0 },
]);
const WIN = Object.fromEntries(DRAW_ORDER.map((d) => [d.id, d]));

const rot2 = (p, th) => [p[0] * Math.cos(th) - p[1] * Math.sin(th), p[0] * Math.sin(th) + p[1] * Math.cos(th)];
const circle = (r, n = 256, cx = 0, cy = 0, a0 = 0) => {
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = a0 + (i / n) * Math.PI * 2;
    out.push([cx + r * Math.cos(t), cy + r * Math.sin(t)]);
  }
  return out;
};

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

/** The wheel's angle for a crank angle: the same as the solid wheel's. */
export const wheelAngle = (crank) => trainLayout(crank || 0).main.rot;

/**
 * Strokes that turn with the wheel and those that do not (both independent
 * of the wheel's angle). Widths are CSS px for a page drawn at about 220 px
 * per unit; `widthScale` scales them.
 */
export function plateStrokes({ widthScale = 1 } = {}) {
  const W = (p) => [p[0], PLATE_Y, -p[1]];
  const PL = LINE_FLAGS.PLATE;
  const GH = LINE_FLAGS.GHOST;
  const RC = LINE_FLAGS.RULE;
  const wheel = new LineData();
  const fixed = new LineData();
  const ghostTone = (t) => -(0.42 + 0.46 * Math.max(0, Math.min(1, t)));
  const poly = (L, pts, w, t, closed, code, maxLen = 0.012) => L.polyline(pts.map(W), w * widthScale, t, { closed, normal: UP, code, maxLen });
  const chain = (L, pts, pat, w, t, code, closed = false) => L.pattern(pts.map(W), pat, w * widthScale, t, { closed, normal: UP, code });
  const family = (L, id, fn) => {
    const i0 = L.count;
    fn();
    L.order(i0, L.count, WIN[id].from, WIN[id].to);
  };
  const R = rete();
  const A = ASTRO;
  const { pts: outline } = gearOutline(GEAR.main.z, GEAR.module);

  // ------------------------------------------------------- plate (drawn on) ---
  family(fixed, 'centre', () => {
    const e = A.tipR + 0.14;
    chain(fixed, [[-e, 0], [e, 0]], [0.12, 0.03, 0.02, 0.03], 0.7, -0.6, PL);
    chain(fixed, [[0, -e], [0, e]], [0.12, 0.03, 0.02, 0.03], 0.7, -0.6, PL);
  });
  family(wheel, 'pitch', () => {
    const r = (GEAR.main.z * GEAR.module) / 2;
    chain(wheel, [...circle(r, 360), [r, 0]], [0.09, 0.025, 0.015, 0.025], 0.8, 0.35, PL);
  });
  family(wheel, 'limb', () => poly(wheel, outline, 2.1, 1.0, true, PL, 0));
  family(wheel, 'scale', () => {
    const sc = A.scale;
    poly(wheel, circle(sc.r0, 360), 0.8, 0.5, true, PL + RC);
    for (let d = 0; d < 360; d += 2) {
      const a = d * DEG;
      const major = d % 30 === 0;
      const mid = d % 10 === 0;
      const r1 = major ? sc.major : mid ? sc.mid : sc.minor;
      poly(wheel, [[sc.r0 * Math.cos(a), sc.r0 * Math.sin(a)], [r1 * Math.cos(a), r1 * Math.sin(a)]], major ? 1.25 : mid ? 0.95 : 0.75, major ? 0.75 : mid ? 0.56 : 0.42, false, PL + RC);
    }
  });
  family(wheel, 'rete', () => {
    for (const h of R.holes) poly(wheel, h, 1.6, 1.0, true, PL + RC);
  });
  family(wheel, 'ecliptic', () => {
    const ec = A.ecl;
    for (let lon = 0; lon < 360; lon += 10) {
      const q = eclipticPoint(lon);
      const v = [q[0] - ec.c[0], q[1] - ec.c[1]];
      const l = Math.hypot(v[0], v[1]);
      const k = lon % 30 === 0 ? 0.92 : 0.5;
      const a = [ec.c[0] + (v[0] / l) * (ec.rho - ec.hw * k), ec.c[1] + (v[1] / l) * (ec.rho - ec.hw * k)];
      const b = [ec.c[0] + (v[0] / l) * (ec.rho + ec.hw * k), ec.c[1] + (v[1] / l) * (ec.rho + ec.hw * k)];
      poly(wheel, [a, b], lon % 30 === 0 ? 1.0 : 0.75, lon % 30 === 0 ? 0.66 : 0.4, false, PL + RC);
    }
  });
  const ad = A.alidade;
  const ali = (p) => rot2(p, ALIDADE_ANGLE);
  const ruleStrokes = (code, ghost) => {
    const tone = (t) => (ghost ? ghostTone(t) : t);
    const wk = ghost ? 0.85 : 1;
    poly(fixed, alidadeOutline().map(ali), 1.7 * wk, tone(1.0), true, code);
    chain(fixed, [ali([-ad.len, 0]), ali([ad.len, 0])], [0.1, 0.03, 0.015, 0.03], 0.7 * wk, tone(0.5), code);
    for (const sgn of [1, -1]) {
      const x = sgn * ad.vaneAt;
      poly(fixed, [[x - ad.vane[0], -ad.vane[1]], [x + ad.vane[0], -ad.vane[1]], [x + ad.vane[0], ad.vane[1]], [x - ad.vane[0], ad.vane[1]]].map(ali), 1.2 * wk, tone(0.9), true, code);
      poly(fixed, circle(0.009, 12, x, 0).map(ali), 0.85 * wk, tone(0.75), true, code);
    }
    poly(fixed, circle(0.058, 40), 1.3 * wk, tone(0.95), true, code);
    poly(fixed, circle(0.03, 24), 0.85 * wk, tone(0.65), true, code);
    if (!ghost) poly(fixed, [[0.07, 0.012], [0.2, 0.008], [0.2, -0.008], [0.07, -0.012]].map(ali), 0.85, 0.65, true, code);
  };
  family(fixed, 'rule', () => ruleStrokes(PL, false));

  // ---------------------------------------------- ghost (what lift leaves) ---
  // always drawn once shown (window [0, 0]); setGhost fades them in
  poly(wheel, outline, 2.1 * 0.85, ghostTone(1.0), true, GH, 0);
  for (const h of R.holes) poly(wheel, h, 1.6 * 0.85, ghostTone(1.0), true, GH);
  ruleStrokes(GH, true);
  const whole = (p) => Math.hypot(p[0], p[1]) < A.limbIn - 0.004 && Math.hypot(p[0], p[1]) > A.bore;
  for (const al of almucantars(10)) {
    const t = al.alt === 0 ? 0.36 : al.alt < 0 ? -0.7 : 0.14;
    const w = al.alt === 0 ? 0.95 : 0.7;
    for (const r of clippedCircle(al.c, al.r, whole, 540)) {
      if (al.alt < 0) chain(fixed, r, [0.03, 0.025], w * 0.85, ghostTone(Math.max(0, t)), GH);
      else poly(fixed, r, w * 0.85, ghostTone(t), false, GH);
    }
  }
  for (const [rr, t] of [[A.Req, 0.15], [A.Rcnc, 0.3]]) {
    for (const r of clippedCircle([0, 0], rr, whole, 360)) chain(fixed, r, [0.05, 0.02, 0.01, 0.02], 0.65 * 0.85, ghostTone(t), GH);
  }
  return { wheel, fixed };
}

/**
 * The plate beneath the rete, seen through its piercings (and not under the
 * rule), for a wheel turned by `rot`: fixed frame, PLATE lines, drawn in
 * the 'beneath' window.
 */
export function beneathStrokes(rot, { widthScale = 1 } = {}) {
  const W = (p) => [p[0], PLATE_Y, -p[1]];
  const PL = LINE_FLAGS.PLATE;
  const L = new LineData();
  const A = ASTRO;
  const gi = (p) => rot2(p, -rot);
  const alii = (p) => rot2(p, -ALIDADE_ANGLE);
  const open = (p) => !alidadeCovers(alii(p)) && reteOpen(gi(p), 0.007) && Math.hypot(p[0], p[1]) > A.bore;
  const poly = (pts, w, t) => L.polyline(pts.map(W), w * widthScale, t, { normal: UP, code: PL });
  const chain = (pts, pat, w, t) => L.pattern(pts.map(W), pat, w * widthScale, t, { normal: UP, code: PL });
  for (const al of almucantars(10)) {
    const t = al.alt === 0 ? 0.36 : al.alt < 0 ? -0.7 : 0.14;
    const w = al.alt === 0 ? 0.95 : 0.7;
    for (const r of clippedCircle(al.c, al.r, open, 540)) {
      if (al.alt < 0) chain(r, [0.03, 0.025], w, t);
      else poly(r, w, t);
    }
  }
  for (const [rr, t] of [[A.Req, -0.85], [A.Rcnc, -0.7]]) {
    for (const r of clippedCircle([0, 0], rr, open, 360)) chain(r, [0.05, 0.02, 0.01, 0.02], 0.65, t);
  }
  for (const r of clipRuns([[0, -A.limbIn], [0, A.limbIn]], open)) chain(r, [0.12, 0.03, 0.02, 0.03], 0.65, -0.75);
  L.order(0, L.count, WIN.beneath.from, WIN.beneath.to);
  return L;
}

/**
 * Anchors on the drawing (plan coordinates, before the wheel turns by rot):
 * star tips (their names), a tooth's tip at a given angle, the rule's tip.
 */
export function plateAnchors(rot) {
  const R = rete();
  const pitch = (2 * Math.PI) / GEAR.main.z;
  return {
    centre: [0, 0],
    stars: R.pointers.map((f) => ({ name: f.name, tip: rot2(f.tip, rot) })),
    tooth(deg) {
      const k = Math.round((deg * DEG - rot) / pitch);
      const ta = k * pitch + rot;
      return [(ASTRO.tipR + 0.015) * Math.cos(ta), (ASTRO.tipR + 0.015) * Math.sin(ta)];
    },
    ruleTip: (s = 1) => rot2([s * (ASTRO.alidade.len + 0.045), 0], ALIDADE_ANGLE),
    toWorld: (p) => [p[0], PLATE_Y, -p[1]],
  };
}
