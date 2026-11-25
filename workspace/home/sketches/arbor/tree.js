// Branching structure: guided trunk and limbs, then space colonization
// (Runions, Lane and Prusinkiewicz 2007) for the crown. Pure data, no three.js,
// so the same code can be checked from Node.

export class Arbor {
  constructor() {
    this.x = [];
    this.y = [];
    this.z = [];
    this.parent = [];
    this.sprout = []; // 1 when attraction points may grow new shoots from it
    this.tag = []; // limb membership (0 trunk, 1..4 great limbs, 10+k knot stems)
    this.pin = []; // 1 keeps the node fixed during smoothing
  }
  get count() {
    return this.x.length;
  }
  add(x, y, z, parent, sprout = 1, tag = 0, pin = 0) {
    this.x.push(x);
    this.y.push(y);
    this.z.push(z);
    this.parent.push(parent);
    this.sprout.push(sprout);
    this.tag.push(tag);
    this.pin.push(pin);
    return this.x.length - 1;
  }
  pos(i) {
    return [this.x[i], this.y[i], this.z[i]];
  }
}

// Uniform Catmull-Rom through control points, resampled by arc length.
export function sampleCurve(ctrl, spacing) {
  const pts = [ctrl[0], ...ctrl, ctrl[ctrl.length - 1]];
  const dense = [];
  for (let i = 1; i < pts.length - 2; i++) {
    const p0 = pts[i - 1];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2];
    const steps = 40;
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      const t2 = t * t;
      const t3 = t2 * t;
      const q = [0, 0, 0];
      for (let k = 0; k < 3; k++) {
        q[k] =
          0.5 *
          (2 * p1[k] +
            (-p0[k] + p2[k]) * t +
            (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 +
            (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3);
      }
      dense.push(q);
    }
  }
  dense.push(ctrl[ctrl.length - 1].slice());
  const cum = [0];
  for (let i = 1; i < dense.length; i++) {
    cum.push(cum[i - 1] + Math.hypot(dense[i][0] - dense[i - 1][0], dense[i][1] - dense[i - 1][1], dense[i][2] - dense[i - 1][2]));
  }
  const total = cum[cum.length - 1];
  const n = Math.max(1, Math.round(total / spacing));
  const out = [];
  let j = 0;
  for (let s = 0; s <= n; s++) {
    const d = (total * s) / n;
    while (j < cum.length - 2 && cum[j + 1] < d) j++;
    const seg = cum[j + 1] - cum[j] || 1;
    const t = Math.min(1, Math.max(0, (d - cum[j]) / seg));
    out.push([
      dense[j][0] + (dense[j + 1][0] - dense[j][0]) * t,
      dense[j][1] + (dense[j + 1][1] - dense[j][1]) * t,
      dense[j][2] + (dense[j + 1][2] - dense[j][2]) * t,
    ]);
  }
  return out;
}

// Append a sampled curve as a chain of nodes hanging from `parent`.
// `sproutFrom` is the fraction of the chain after which shoots may grow.
export function addGuide(tree, parent, pts, { tag = 0, sproutFrom = 1.1, pin = 1, skipFirst = true } = {}) {
  let p = parent;
  const ids = [];
  const start = skipFirst ? 1 : 0;
  const n = pts.length - start;
  for (let i = start; i < pts.length; i++) {
    const f = n > 1 ? (i - start) / (n - 1) : 1;
    p = tree.add(pts[i][0], pts[i][1], pts[i][2], p, f >= sproutFrom ? 1 : 0, tag, pin);
    ids.push(p);
  }
  return ids;
}

// Attraction points in an ellipsoid, biased toward its shell so branches
// reach out and fan rather than fill a ball evenly.
export function lobePoints(rng, center, radii, count, { shell = 0.35, floorY = -Infinity, ceilY = Infinity } = {}) {
  const out = [];
  let guard = 0;
  while (out.length < count * 3 && guard++ < count * 40) {
    const d = rng.unit();
    const u = rng.next();
    const r = Math.pow(u, shell);
    const x = center[0] + d[0] * radii[0] * r;
    const y = center[1] + d[1] * radii[1] * r;
    const z = center[2] + d[2] * radii[2] * r;
    if (y < floorY || y > ceilY) continue;
    out.push(x, y, z);
  }
  return out;
}

export function colonize(tree, attr, opts) {
  const { D, di, dk, maxIter = 400, tropism = [0, 1, 0], tropismW = 0.2, jitter = 0.1, rng, tagOf = null } = opts;
  const nA = attr.length / 3;
  const alive = new Uint8Array(nA).fill(1);
  const best = new Int32Array(nA).fill(-1);
  const bestD = new Float64Array(nA).fill(Infinity);
  const cs = di;
  const grid = new Map();
  const key = (ix, iy, iz) => ((ix + 512) * 1024 + (iy + 512)) * 1024 + (iz + 512);
  for (let a = 0; a < nA; a++) {
    const k = key(Math.floor(attr[3 * a] / cs), Math.floor(attr[3 * a + 1] / cs), Math.floor(attr[3 * a + 2] / cs));
    let cell = grid.get(k);
    if (!cell) grid.set(k, (cell = []));
    cell.push(a);
  }
  const di2 = di * di;
  const dk2 = dk * dk;
  const touch = (i) => {
    const x = tree.x[i];
    const y = tree.y[i];
    const z = tree.z[i];
    const ix = Math.floor(x / cs);
    const iy = Math.floor(y / cs);
    const iz = Math.floor(z / cs);
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++)
        for (let dz = -1; dz <= 1; dz++) {
          const cell = grid.get(key(ix + dx, iy + dy, iz + dz));
          if (!cell) continue;
          for (let c = 0; c < cell.length; c++) {
            const a = cell[c];
            if (!alive[a]) continue;
            const ex = attr[3 * a] - x;
            const ey = attr[3 * a + 1] - y;
            const ez = attr[3 * a + 2] - z;
            const d2 = ex * ex + ey * ey + ez * ez;
            if (d2 < di2 && d2 < bestD[a]) {
              bestD[a] = d2;
              best[a] = i;
            }
          }
        }
  };
  for (let i = 0; i < tree.count; i++) if (tree.sprout[i]) touch(i);
  const kidDirs = new Map();
  for (let iter = 0; iter < maxIter; iter++) {
    const acc = new Map();
    for (let a = 0; a < nA; a++) {
      if (!alive[a] || best[a] < 0) continue;
      if (bestD[a] < dk2) {
        alive[a] = 0;
        continue;
      }
      const i = best[a];
      const len = Math.sqrt(bestD[a]);
      let s = acc.get(i);
      if (!s) acc.set(i, (s = [0, 0, 0, 0]));
      s[0] += (attr[3 * a] - tree.x[i]) / len;
      s[1] += (attr[3 * a + 1] - tree.y[i]) / len;
      s[2] += (attr[3 * a + 2] - tree.z[i]) / len;
      s[3]++;
    }
    if (acc.size === 0) break;
    const fresh = [];
    for (const [i, s] of acc) {
      let l = Math.hypot(s[0], s[1], s[2]);
      if (l < 1e-6) continue;
      const j = rng.unit();
      let dx = s[0] / l + tropism[0] * tropismW + j[0] * jitter;
      let dy = s[1] / l + tropism[1] * tropismW + j[1] * jitter;
      let dz = s[2] / l + tropism[2] * tropismW + j[2] * jitter;
      l = Math.hypot(dx, dy, dz);
      dx /= l;
      dy /= l;
      dz /= l;
      const dirs = kidDirs.get(i) || [];
      let dup = false;
      for (const d of dirs) if (d[0] * dx + d[1] * dy + d[2] * dz > 0.9) dup = true;
      if (dup) continue;
      dirs.push([dx, dy, dz]);
      kidDirs.set(i, dirs);
      const tag = tagOf ? tagOf(i) : tree.tag[i];
      const n = tree.add(tree.x[i] + dx * D, tree.y[i] + dy * D, tree.z[i] + dz * D, i, 1, tag, 0);
      fresh.push(n);
    }
    if (fresh.length === 0) break;
    for (const n of fresh) touch(n);
  }
  return tree;
}

// Children lists, smoothing, path length, leaf weights and chain decomposition.
export function finalize(tree, { smooth = 3, leafWeight = null } = {}) {
  const n = tree.count;
  const kids = Array.from({ length: n }, () => []);
  for (let i = 0; i < n; i++) if (tree.parent[i] >= 0) kids[tree.parent[i]].push(i);
  for (let pass = 0; pass < smooth; pass++) {
    const nx = tree.x.slice();
    const ny = tree.y.slice();
    const nz = tree.z.slice();
    for (let i = 0; i < n; i++) {
      const p = tree.parent[i];
      if (p < 0 || tree.pin[i] || kids[i].length !== 1) continue;
      const c = kids[i][0];
      nx[i] = 0.5 * tree.x[i] + 0.25 * (tree.x[p] + tree.x[c]);
      ny[i] = 0.5 * tree.y[i] + 0.25 * (tree.y[p] + tree.y[c]);
      nz[i] = 0.5 * tree.z[i] + 0.25 * (tree.z[p] + tree.z[c]);
    }
    tree.x = nx;
    tree.y = ny;
    tree.z = nz;
  }
  const s = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const p = tree.parent[i];
    if (p >= 0) s[i] = s[p] + Math.hypot(tree.x[i] - tree.x[p], tree.y[i] - tree.y[p], tree.z[i] - tree.z[p]);
  }
  // Parents are always created before children, so a reverse sweep accumulates.
  const weight = new Float64Array(n);
  for (let i = n - 1; i >= 0; i--) {
    if (kids[i].length === 0) weight[i] = leafWeight ? leafWeight(i) : 1;
    const p = tree.parent[i];
    if (p >= 0) weight[p] += weight[i];
  }
  // Chains follow the heaviest child; every other child starts a new chain at its fork.
  const chains = [];
  const roots = [];
  for (let i = 0; i < n; i++) if (tree.parent[i] < 0) roots.push(i);
  const stack = roots.map((r) => [r]);
  while (stack.length) {
    const chain = stack.pop();
    let cur = chain[chain.length - 1];
    for (;;) {
      const k = kids[cur];
      if (k.length === 0) break;
      let main = k[0];
      for (const c of k) if (weight[c] > weight[main]) main = c;
      for (const c of k) if (c !== main) stack.push([cur, c]);
      chain.push(main);
      cur = main;
    }
    chains.push(chain);
  }
  tree.kids = kids;
  tree.s = s;
  tree.weight = weight;
  tree.chains = chains;
  return tree;
}
