// The astrolabe face of the main wheel. Pure math (no three.js), so the plate
// drawing, the solid wheel, the base and check.mjs all share one geometry.
//
// The 48-tooth wheel is the astrolabe: its rim is the limb (the degree scale
// is engraved on it), and inside the limb, instead of spokes, is a pierced
// rete: an offset ecliptic ring, the equinoctial bar, a south meridian bar,
// the southern half of the equator, two sweeping bars and twelve flame
// pointers ending on the stereographic positions of twelve real bright stars
// (latitude 35.9 deg, the armillary's latitude). Beneath it, on the plate
// (or on the floor of the base's recess), are the almucantars: circles of
// equal altitude. A rule (the alidade) crosses the centre, pinned at the hub.
//
// Gear frame: 2D (x, y), y toward the ecliptic's tangent point (the top of
// the face). The solid maps (x, y) to world (x, -z) before it turns.
//
// The solid is found as a field: the rete's signed distance is sampled on a
// grid and its holes are traced with marching squares, so bars, rings and
// pointers merge into one pierced plate with clean joins.

import { GEAR } from './layout.js';

const DEG = Math.PI / 180;

export const ASTRO = (() => {
  const eps = 23.44 * DEG;
  const limbIn = 0.88; // inner edge of the limb = Tropic of Capricorn
  const Req = limbIn / Math.tan(Math.PI / 4 + eps / 2);
  const Rcnc = Req * Math.tan(Math.PI / 4 - eps / 2);
  const r = (z) => (z * GEAR.module) / 2;
  return {
    eps,
    latitude: 35.9 * DEG,
    limbIn,
    rootR: r(GEAR.main.z) - 1.25 * GEAR.module,
    tipR: r(GEAR.main.z) + GEAR.module,
    Req,
    Rcnc,
    bore: 0.13,
    hubR: 0.215,
    ecl: { c: [0, (limbIn - Rcnc) / 2], rho: (limbIn + Rcnc) / 2, hw: 0.034 },
    barHW: 0.022,
    scale: { r0: 0.895, minor: 0.935, mid: 0.958, major: 0.99 },
    alidade: { len: 0.985, hw: 0.04, tipHW: 0.012, disc: 0.2, hole: 0.13, vaneAt: 0.6, vane: [0.011, 0.052], thick: 0.014, vaneH: 0.07 },
  };
})();

// Stereographic projection from the south pole: declination -> radius,
// right ascension -> angle (so the ecliptic touches the limb at the top).
export function decRadius(decDeg) {
  return ASTRO.Req * Math.tan(((90 - decDeg) * DEG) / 2);
}
export function skyPoint(raDeg, decDeg) {
  const R = decRadius(decDeg);
  const a = Math.PI + raDeg * DEG;
  return [R * Math.cos(a), R * Math.sin(a)];
}
// ecliptic longitude -> point on the projected ecliptic
export function eclipticPoint(lonDeg) {
  const l = lonDeg * DEG;
  const dec = Math.asin(Math.sin(ASTRO.eps) * Math.sin(l)) / DEG;
  const ra = Math.atan2(Math.cos(ASTRO.eps) * Math.sin(l), Math.cos(l)) / DEG;
  return skyPoint(ra, dec);
}

// Twelve bright stars (J2000 RA, Dec in degrees) with dec above the Tropic of
// Capricorn and clear of the bars; `bend` sets which way the flame curves.
export const STARS = [
  { name: 'Altair', ra: 297.7, dec: 8.9, bend: 1 },
  { name: 'Sadalmelik', ra: 331.4, dec: -0.3, bend: -1 },
  { name: 'Markab', ra: 346.2, dec: 15.2, bend: 1 },
  { name: 'Arcturus', ra: 213.9, dec: 19.2, bend: -1 },
  { name: 'Unukalhai', ra: 236.1, dec: 6.4, bend: 1 },
  { name: 'Algorab', ra: 187.5, dec: -16.5, bend: -1 },
  { name: 'Rigel', ra: 78.6, dec: -8.2, bend: -1 },
  { name: 'Sirius', ra: 101.3, dec: -16.7, bend: 1 },
  { name: 'Procyon', ra: 114.8, dec: 5.2, bend: -1 },
  { name: 'Alphard', ra: 142.0, dec: -8.7, bend: 1 },
  { name: 'Menkar', ra: 45.6, dec: 4.1, bend: 1 },
  { name: 'Diphda', ra: 10.9, dec: -18.0, bend: -1 },
];

// ------------------------------------------------------------- 2D helpers ---
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const len = (a) => Math.hypot(a[0], a[1]);
function bez(P0, P1, P2, t) {
  const u = 1 - t;
  return [u * u * P0[0] + 2 * u * t * P1[0] + t * t * P2[0], u * u * P0[1] + 2 * u * t * P1[1] + t * t * P2[1]];
}
// distance to segment ab, and the parameter of the closest point
function segDist(p, a, b) {
  const ab = sub(b, a);
  const l2 = ab[0] * ab[0] + ab[1] * ab[1];
  let t = l2 > 0 ? ((p[0] - a[0]) * ab[0] + (p[1] - a[1]) * ab[1]) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  return [Math.hypot(p[0] - a[0] - ab[0] * t, p[1] - a[1] - ab[1] * t), t];
}

// A primitive is a polyline with a half-width per vertex (a chain of round
// cones), or a ring/arc. Each has a bounding circle for a cheap early-out.
function chain(pts, hws) {
  let cx = 0;
  let cy = 0;
  for (const p of pts) {
    cx += p[0];
    cy += p[1];
  }
  cx /= pts.length;
  cy /= pts.length;
  let R = 0;
  pts.forEach((p, i) => (R = Math.max(R, Math.hypot(p[0] - cx, p[1] - cy) + hws[i])));
  return {
    kind: 'chain', pts, hws, bc: [cx, cy], bR: R,
    sd(p) {
      let d = 1e9;
      for (let i = 0; i + 1 < pts.length; i++) {
        const [dd, t] = segDist(p, pts[i], pts[i + 1]);
        d = Math.min(d, dd - (hws[i] + (hws[i + 1] - hws[i]) * t));
      }
      return d;
    },
  };
}
function ring(c, rho, hw, a0 = null, a1 = null) {
  return {
    kind: 'ring', bc: c, bR: rho + hw,
    sd(p) {
      const v = sub(p, c);
      if (a0 !== null) {
        let a = Math.atan2(v[1], v[0]);
        while (a < a0) a += 2 * Math.PI;
        while (a > a0 + 2 * Math.PI) a -= 2 * Math.PI;
        if (a > a1) {
          const e0 = [c[0] + rho * Math.cos(a0), c[1] + rho * Math.sin(a0)];
          const e1 = [c[0] + rho * Math.cos(a1), c[1] + rho * Math.sin(a1)];
          return Math.min(len(sub(p, e0)), len(sub(p, e1))) - hw;
        }
      }
      return Math.abs(len(v) - rho) - hw;
    },
  };
}
function curve(P0, P1, P2, hw0, hw1, n = 16, profile = null) {
  const pts = [];
  const hws = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    pts.push(bez(P0, P1, P2, t));
    hws.push(profile ? profile(t) : hw0 + (hw1 - hw0) * t);
  }
  return chain(pts, hws);
}

// --------------------------------------------------------------- the web ---
function structure() {
  const A = ASTRO;
  const prims = [];
  prims.push(ring([0, 0], (A.bore + A.hubR) / 2, (A.hubR - A.bore) / 2));
  prims.push(ring(A.ecl.c, A.ecl.rho, A.ecl.hw));
  const reach = A.limbIn + 0.03;
  const r0 = (A.bore + A.hubR) / 2;
  prims.push(chain([[r0, 0], [reach, 0]], [A.barHW, A.barHW]));
  prims.push(chain([[-r0, 0], [-reach, 0]], [A.barHW, A.barHW]));
  prims.push(chain([[0, -r0], [0, -reach]], [0.02, 0.02]));
  // the southern half of the equator
  prims.push(ring([0, 0], A.Req, 0.016, Math.PI, 2 * Math.PI));
  // two sweeping bars from the hub out to the ecliptic, mirrored
  const e = (deg) => [A.ecl.c[0] + A.ecl.rho * Math.cos(deg * DEG), A.ecl.c[1] + A.ecl.rho * Math.sin(deg * DEG)];
  const h = (deg) => [r0 * Math.cos(deg * DEG), r0 * Math.sin(deg * DEG)];
  prims.push(curve(h(68), [0.06, 0.6], e(52), 0.024, 0.02));
  prims.push(curve(h(112), [-0.06, 0.6], e(128), 0.024, 0.02));
  // two gothic arcs in the south, from the limb to the meridian bar
  const lim = (deg) => [reach * Math.cos(deg * DEG), reach * Math.sin(deg * DEG)];
  prims.push(curve(lim(214), [-0.34, -0.86], [0, -0.66], 0.018, 0.018));
  prims.push(curve(lim(326), [0.34, -0.86], [0, -0.66], 0.018, 0.018));
  return prims;
}

function structureSD(prims, p) {
  let d = 1e9;
  for (const q of prims) {
    if (Math.hypot(p[0] - q.bc[0], p[1] - q.bc[1]) - q.bR > d) continue;
    d = Math.min(d, q.sd(p));
  }
  return d;
}

// Flame pointers: a curved taper that grows out of a bar and ends in a sharp
// point on the star itself. The root is searched by casting rays from the
// star: the hit nearest a target length wins, preferring roots where the
// flame leaves its bar squarely and paths that keep clear of other flames.
const FLAME_L = 0.17;
const flameProfile = (t) => (0.021 + 0.013 * Math.sin(Math.PI * Math.min(1, t * 1.6))) * Math.pow(1 - t, 0.85);
function pointers(prims) {
  const out = [];
  const limb = ASTRO.limbIn;
  const sd = (p) => Math.min(structureSD(prims, p), limb - Math.hypot(p[0], p[1]));
  const grad = (p) => {
    const e = 1e-4;
    const gx = (sd([p[0] + e, p[1]]) - sd([p[0] - e, p[1]])) / (2 * e);
    const gy = (sd([p[0], p[1] + e]) - sd([p[0], p[1] - e])) / (2 * e);
    const l = Math.hypot(gx, gy) || 1;
    return [gx / l, gy / l];
  };
  const clearOfFlames = (p, r) => out.every((f) => f.prim.sd(p) > r);
  for (const s of STARS) {
    const T = skyPoint(s.ra, s.dec);
    let best = null;
    for (let k = 0; k < 120; k++) {
      const a = (k / 120) * Math.PI * 2;
      const d = [Math.cos(a), Math.sin(a)];
      let tr = 0;
      let hit = null;
      let ok = true;
      while (tr < 0.34) {
        const p = [T[0] + d[0] * tr, T[1] + d[1] * tr];
        const v = sd(p);
        if (v < 0.003) {
          hit = p;
          break;
        }
        if (!clearOfFlames(p, 0.045)) {
          ok = false;
          break;
        }
        tr += Math.max(v * 0.8, 0.002);
      }
      if (!hit || !ok || tr < 0.07) continue;
      const g = grad(hit);
      const square = Math.abs(g[0] * d[0] + g[1] * d[1]);
      const score = Math.abs(tr - FLAME_L) + 0.12 * (1 - square);
      if (!best || score < best.score) best = { score, hit, d, tr };
    }
    if (!best) continue;
    const L = best.tr + 0.012;
    // sink the root into the bar so the flame grows out of it
    const B = [best.hit[0] + best.d[0] * 0.012, best.hit[1] + best.d[1] * 0.012];
    const u = [-best.d[0], -best.d[1]];
    let chosen = null;
    for (const bend of [s.bend, -s.bend, s.bend * 0.4, 0]) {
      const v = [-u[1] * bend, u[0] * bend];
      const C = [(B[0] + T[0]) / 2 + v[0] * L * 0.24, (B[1] + T[1]) / 2 + v[1] * L * 0.24];
      const prim = curve(B, C, T, 0, 0, 18, flameProfile);
      // the curve must not graze other bars on its way (its root apart)
      let clear = true;
      for (let i = 7; i <= 18; i++) {
        const p = prim.pts[i];
        if (sd(p) < prim.hws[i] + 0.008 || !clearOfFlames(p, prim.hws[i] + 0.03)) {
          clear = false;
          break;
        }
      }
      if (clear) {
        chosen = { C, prim };
        break;
      }
    }
    if (!chosen) continue;
    out.push({ ...s, tip: T, base: B, ctrl: chosen.C, prim: chosen.prim });
  }
  return out;
}

// ------------------------------------------------------- marching squares ---
// Loops (closed, no repeated end point) where field < 0, sampled on a grid.
export function traceLoops(field, x0, y0, step, nx, ny) {
  const W = nx + 1;
  const vals = new Float64Array(W * (ny + 1));
  for (let j = 0; j <= ny; j++) {
    for (let i = 0; i <= nx; i++) {
      let v = field(x0 + i * step, y0 + j * step);
      if (v === 0) v = 1e-12;
      vals[j * W + i] = v;
    }
  }
  const H = (i, j) => 2 * (j * W + i);
  const Vt = (i, j) => 2 * (j * W + i) + 1;
  const pt = new Map();
  const adj = new Map();
  const edgePoint = (id) => {
    if (pt.has(id)) return;
    const k = id >> 1;
    const i = k % W;
    const j = (k - i) / W;
    const a = vals[k];
    const b = id & 1 ? vals[k + W] : vals[k + 1];
    const t = a / (a - b);
    pt.set(id, id & 1 ? [x0 + i * step, y0 + (j + t) * step] : [x0 + (i + t) * step, y0 + j * step]);
  };
  const link = (a, b) => {
    edgePoint(a);
    edgePoint(b);
    if (!adj.has(a)) adj.set(a, []);
    if (!adj.has(b)) adj.set(b, []);
    adj.get(a).push(b);
    adj.get(b).push(a);
  };
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const v0 = vals[j * W + i];
      const v1 = vals[j * W + i + 1];
      const v2 = vals[(j + 1) * W + i + 1];
      const v3 = vals[(j + 1) * W + i];
      const c = (v0 < 0) | ((v1 < 0) << 1) | ((v2 < 0) << 2) | ((v3 < 0) << 3);
      if (c === 0 || c === 15) continue;
      const E = [H(i, j), Vt(i + 1, j), H(i, j + 1), Vt(i, j)];
      const centre = (v0 + v1 + v2 + v3) / 4;
      const S = {
        1: [[3, 0]], 2: [[0, 1]], 3: [[3, 1]], 4: [[1, 2]], 6: [[0, 2]], 7: [[3, 2]], 8: [[2, 3]], 9: [[0, 2]],
        11: [[1, 2]], 12: [[3, 1]], 13: [[0, 1]], 14: [[3, 0]],
        5: centre < 0 ? [[0, 1], [2, 3]] : [[3, 0], [1, 2]],
        10: centre < 0 ? [[3, 0], [1, 2]] : [[0, 1], [2, 3]],
      }[c];
      for (const [a, b] of S) link(E[a], E[b]);
    }
  }
  const seen = new Set();
  const loops = [];
  for (const start of adj.keys()) {
    if (seen.has(start)) continue;
    const loop = [];
    let prev = -1;
    let cur = start;
    while (!seen.has(cur)) {
      seen.add(cur);
      loop.push(pt.get(cur));
      const nb = adj.get(cur);
      const next = nb[0] !== prev ? nb[0] : nb[1];
      prev = cur;
      cur = next;
      if (cur === undefined) break;
    }
    if (loop.length > 2) loops.push(loop);
  }
  return loops;
}

export function loopArea(L) {
  let a = 0;
  for (let i = 0, n = L.length; i < n; i++) {
    const p = L[i];
    const q = L[(i + 1) % n];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
}

// Ramer-Douglas-Peucker on a closed loop.
export function simplifyLoop(L, tol) {
  const n = L.length;
  if (n < 8) return L;
  let far = 0;
  let best = -1;
  for (let i = 0; i < n; i++) {
    const d = Math.hypot(L[i][0] - L[0][0], L[i][1] - L[0][1]);
    if (d > best) {
      best = d;
      far = i;
    }
  }
  const rdp = (pts) => {
    if (pts.length < 3) return pts;
    const a = pts[0];
    const b = pts[pts.length - 1];
    let dmax = 0;
    let k = 0;
    for (let i = 1; i < pts.length - 1; i++) {
      const d = segDist(pts[i], a, b)[0];
      if (d > dmax) {
        dmax = d;
        k = i;
      }
    }
    if (dmax <= tol) return [a, b];
    const l = rdp(pts.slice(0, k + 1));
    const r = rdp(pts.slice(k));
    return l.slice(0, -1).concat(r);
  };
  const A = rdp(L.slice(0, far + 1));
  const B = rdp(L.slice(far).concat([L[0]]));
  return A.slice(0, -1).concat(B.slice(0, -1));
}

// even-odd point in loops
export function insideLoops(p, loops) {
  let inside = false;
  for (const L of loops) {
    if (L.bbox && (p[0] < L.bbox[0] || p[0] > L.bbox[2] || p[1] < L.bbox[1] || p[1] > L.bbox[3])) continue;
    for (let i = 0, j = L.length - 1; i < L.length; j = i++) {
      const a = L[i];
      const b = L[j];
      if (a[1] > p[1] !== b[1] > p[1] && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
    }
  }
  return inside;
}
function withBox(L) {
  let x0 = 1e9;
  let y0 = 1e9;
  let x1 = -1e9;
  let y1 = -1e9;
  for (const p of L) {
    x0 = Math.min(x0, p[0]);
    y0 = Math.min(y0, p[1]);
    x1 = Math.max(x1, p[0]);
    y1 = Math.max(y1, p[1]);
  }
  L.bbox = [x0, y0, x1, y1];
  return L;
}

// ------------------------------------------------------------ the rete ---
let RETE = null;
// { holes: loops in the gear frame (the bore included), pointers, prims,
//   webSD(p): signed distance to the web (negative inside the metal) }
export function rete() {
  if (RETE) return RETE;
  const A = ASTRO;
  const prims = structure();
  const ptr = pointers(prims);
  const all = prims.concat(ptr.map((q) => q.prim));
  const webSD = (p) => structureSD(all, p);
  const field = (x, y) => Math.max(Math.hypot(x, y) - A.limbIn, -webSD([x, y]));
  const step = 0.004;
  const L = A.limbIn + 0.02;
  const n = Math.ceil((2 * L) / step);
  const raw = traceLoops(field, -L, -L, step, n, n);
  const holes = raw
    .filter((l) => Math.abs(loopArea(l)) > 0.0012)
    .map((l) => withBox(simplifyLoop(l, 0.0007)));
  RETE = { holes, pointers: ptr, prims: all, webSD };
  return RETE;
}

// Is a gear-frame point open (inside a piercing), with a margin?
export function reteOpen(p, margin = 0) {
  const R = rete();
  if (!insideLoops(p, R.holes)) return false;
  if (margin <= 0) return true;
  const r = Math.hypot(p[0], p[1]);
  if (r < ASTRO.bore) return r < ASTRO.bore - margin;
  return R.webSD(p) > margin && r < ASTRO.limbIn - margin;
}

// --------------------------------------------------------- the alidade ---
// Outline of the rule in its own frame (x along the rule): a slender bar
// with pointed tips, widened to a disc round the pin at the centre.
const ruleHW = (x) => {
  const a = ASTRO.alidade;
  const w = a.tipHW + (a.hw - a.tipHW) * (1 - Math.min(1, Math.abs(x) / a.len)) ** 1.4;
  return Math.max(w, Math.sqrt(Math.max(0, a.disc * a.disc - x * x)));
};
export function alidadeOutline() {
  const a = ASTRO.alidade;
  const xs = [];
  const n = 40;
  for (let i = 0; i <= n; i++) {
    const t = -1 + (2 * i) / n;
    xs.push(a.len * t);
  }
  // denser round the disc so it stays round
  for (let i = 1; i < 24; i++) xs.push(-a.disc + (2 * a.disc * i) / 24);
  xs.sort((p, q) => q - p);
  const pts = [[a.len + 0.03, 0]];
  for (const x of xs) pts.push([x, ruleHW(x)]);
  pts.push([-a.len - 0.03, 0]);
  for (let i = xs.length - 1; i >= 0; i--) pts.push([xs[i], -ruleHW(xs[i])]);
  return pts;
}
export function alidadeCovers(pLocal) {
  const a = ASTRO.alidade;
  const x = Math.abs(pLocal[0]);
  if (x > a.len + 0.03) return false;
  const w = x > a.len ? a.tipHW * (1 - (x - a.len) / 0.03) : ruleHW(x);
  const vane = Math.abs(x - a.vaneAt) < a.vane[0] && Math.abs(pLocal[1]) < a.vane[1];
  return Math.abs(pLocal[1]) < w || vane;
}

// ------------------------------------------------------ the almucantars ---
// Circles of equal altitude on the plate for the armillary's latitude, in
// plate coordinates (zenith toward +y): { alt, c: [0, yc], r }.
export function almucantars(step = 10) {
  const A = ASTRO;
  const sphi = Math.sin(A.latitude);
  const cphi = Math.cos(A.latitude);
  const out = [];
  for (let alt = -18; alt < 90; alt += step) {
    if (alt < 0 && alt !== -18) continue;
    const sa = Math.sin(alt * DEG);
    const ca = Math.cos(alt * DEG);
    out.push({ alt, c: [0, (A.Req * cphi) / (sphi + sa)], r: (A.Req * ca) / (sphi + sa) });
  }
  // the horizon (0) always, plus every `step` degrees up to the zenith
  return out;
}
export function zenith() {
  const A = ASTRO;
  return [0, (A.Req * Math.cos(A.latitude)) / (Math.sin(A.latitude) + 1)];
}

// Points of a circle clipped to the limb (r < limbIn - inset), as runs.
export function clippedCircle(c, r, keep, n = 360) {
  const runs = [];
  let cur = [];
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * Math.PI * 2;
    const p = [c[0] + r * Math.cos(t), c[1] + r * Math.sin(t)];
    if (keep(p)) cur.push(p);
    else if (cur.length) {
      if (cur.length > 1) runs.push(cur);
      cur = [];
    }
  }
  if (cur.length > 1) runs.push(cur);
  // join the wrap-around run
  if (runs.length > 1) {
    const f = runs[0];
    const l = runs[runs.length - 1];
    const d = Math.hypot(f[0][0] - l[l.length - 1][0], f[0][1] - l[l.length - 1][1]);
    if (d < 1e-9) {
      runs[0] = l.concat(f.slice(1));
      runs.pop();
    }
  }
  return runs;
}

// ------------------------------------------------------- the base recess ---
// The pocket in the dial that holds the gear train: a smooth union of a
// circle round each wheel, traced as one loop in world [x, z].
export function pocketLoop(train, margins = { main: 0.065, idler: 0.055, pinion: 0.055 }) {
  const ra = (z) => (z * GEAR.module) / 2 + GEAR.module;
  const C = [
    { c: train.main.c, r: ra(GEAR.main.z) + margins.main },
    { c: train.idler.c, r: ra(GEAR.idler.z) + margins.idler },
    { c: train.pinion.c, r: ra(GEAR.pinion.z) + margins.pinion },
  ];
  const k = 0.12;
  const smin = (a, b) => {
    const h = Math.max(k - Math.abs(a - b), 0) / k;
    return Math.min(a, b) - h * h * k * 0.25;
  };
  const field = (x, z) => {
    let d = 1e9;
    for (const q of C) d = smin(d, Math.hypot(x - q.c[0], z - q.c[2]) - q.r);
    return d;
  };
  const step = 0.01;
  const x0 = Math.min(...C.map((q) => q.c[0] - q.r)) - 0.08;
  const z0 = Math.min(...C.map((q) => q.c[2] - q.r)) - 0.08;
  const x1 = Math.max(...C.map((q) => q.c[0] + q.r)) + 0.08;
  const z1 = Math.max(...C.map((q) => q.c[2] + q.r)) + 0.08;
  const loops = traceLoops(field, x0, z0, step, Math.ceil((x1 - x0) / step), Math.ceil((z1 - z0) / step));
  loops.sort((a, b) => Math.abs(loopArea(b)) - Math.abs(loopArea(a)));
  const loop = simplifyLoop(loops[0], 0.0015);
  return { loop: withBox(loop), field };
}
