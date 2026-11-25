// Ambient occlusion baked per vertex at build time, pure (no three.js).
// Occluder surfaces are splatted into a voxel grid; each target vertex
// marches a few short rays over its hemisphere and counts the voxels they
// meet. The brass shader turns crevices toward patina with it (tooth roots,
// screw heads on the dial, collars on the column, the recess floor under the
// wheels); the engraved shader thins its hatching there.

/** @typedef {{ pos: ArrayLike<number>, nrm?: ArrayLike<number>, idx: ArrayLike<number> }} AOMesh */

const TILT = (55 * Math.PI) / 180;
const DIRS = [[0, 0, 1]];
for (let k = 0; k < 6; k++) {
  const a = (k / 6) * Math.PI * 2;
  DIRS.push([Math.sin(TILT) * Math.cos(a), Math.sin(TILT) * Math.sin(a), Math.cos(TILT)]);
}
const WTS = DIRS.map((d) => d[2]);
const WSUM = WTS.reduce((s, v) => s + v, 0);

export class VoxelGrid {
  /**
   * @param {number[]} min bounds
   * @param {number[]} max
   * @param {number} cells voxels along the longest side
   */
  constructor(min, max, cells = 112) {
    const ext = Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2], 1e-6);
    this.cell = ext / cells;
    const pad = 2 * this.cell;
    this.o = [min[0] - pad, min[1] - pad, min[2] - pad];
    this.n = [0, 1, 2].map((k) => Math.ceil((max[k] - min[k] + 2 * pad) / this.cell) + 1);
    this.inv = 1 / this.cell;
    this.grid = new Uint8Array(this.n[0] * this.n[1] * this.n[2]);
  }

  clone() {
    const g = Object.create(VoxelGrid.prototype);
    Object.assign(g, this);
    g.grid = this.grid.slice();
    return g;
  }

  index(x, y, z) {
    const i = Math.floor((x - this.o[0]) * this.inv);
    const j = Math.floor((y - this.o[1]) * this.inv);
    const k = Math.floor((z - this.o[2]) * this.inv);
    const [nx, ny, nz] = this.n;
    if (i < 0 || j < 0 || k < 0 || i >= nx || j >= ny || k >= nz) return -1;
    return (k * ny + j) * nx + i;
  }

  /** Mark every voxel a mesh's triangles pass through. @param {AOMesh} m */
  splat(m) {
    const P = m.pos;
    const I = m.idx;
    const step = 0.7 * this.cell;
    const G = this.grid;
    for (let t = 0; t < I.length; t += 3) {
      const a = 3 * I[t], b = 3 * I[t + 1], c = 3 * I[t + 2];
      const ax = P[a], ay = P[a + 1], az = P[a + 2];
      const ux = P[b] - ax, uy = P[b + 1] - ay, uz = P[b + 2] - az;
      const vx = P[c] - ax, vy = P[c + 1] - ay, vz = P[c + 2] - az;
      const nu = Math.max(1, Math.ceil(Math.sqrt(ux * ux + uy * uy + uz * uz) / step));
      const nv = Math.max(1, Math.ceil(Math.sqrt(vx * vx + vy * vy + vz * vz) / step));
      for (let i = 0; i <= nu; i++) {
        const s = i / nu;
        const jm = Math.floor((1 - s) * nv + 1e-9);
        for (let j = 0; j <= jm; j++) {
          const r = j / nv;
          const q = this.index(ax + ux * s + vx * r, ay + uy * s + vy * r, az + uz * s + vz * r);
          if (q >= 0) G[q] = 1;
        }
      }
    }
  }

  /**
   * Occlusion of each vertex of a mesh (1 open .. 0.2 buried).
   * @param {AOMesh} m
   * @param {Float32Array} out one value per vertex
   * @param {number} [strength]
   */
  occlude(m, out, strength = 0.8) {
    const P = m.pos;
    const N = m.nrm;
    const G = this.grid;
    const c = this.cell;
    const steps = [1.0 * c, 1.6 * c, 2.4 * c, 3.4 * c];
    const lift = 0.75 * c;
    const n = P.length / 3;
    for (let v = 0; v < n; v++) {
      let nx = N[3 * v], ny = N[3 * v + 1], nz = N[3 * v + 2];
      const nl = Math.hypot(nx, ny, nz) || 1;
      nx /= nl;
      ny /= nl;
      nz /= nl;
      let tx, ty, tz;
      if (Math.abs(ny) < 0.9) {
        tx = -nz;
        ty = 0;
        tz = nx;
      } else {
        tx = 0;
        ty = nz;
        tz = -ny;
      }
      const tl = Math.hypot(tx, ty, tz) || 1;
      tx /= tl;
      ty /= tl;
      tz /= tl;
      const bx = ny * tz - nz * ty;
      const by = nz * tx - nx * tz;
      const bz = nx * ty - ny * tx;
      const ox = P[3 * v] + nx * lift;
      const oy = P[3 * v + 1] + ny * lift;
      const oz = P[3 * v + 2] + nz * lift;
      let occ = 0;
      for (let d = 0; d < DIRS.length; d++) {
        const D = DIRS[d];
        const dx = tx * D[0] + bx * D[1] + nx * D[2];
        const dy = ty * D[0] + by * D[1] + ny * D[2];
        const dz = tz * D[0] + bz * D[1] + nz * D[2];
        for (let s = 0; s < steps.length; s++) {
          const L = steps[s];
          const q = this.index(ox + dx * L, oy + dy * L, oz + dz * L);
          if (q >= 0 && G[q]) {
            occ += WTS[d] * (1 - 0.6 * (s / (steps.length - 1)));
            break;
          }
        }
      }
      const a = 1 - strength * (occ / WSUM);
      out[v] = Math.max(0.2, Math.min(1, a));
    }
  }
}

/** Bounds of several meshes' positions. @param {AOMesh[]} meshes */
export function boundsOf(meshes) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const m of meshes) {
    const P = m.pos;
    for (let i = 0; i < P.length; i += 3) {
      for (let k = 0; k < 3; k++) {
        if (P[i + k] < min[k]) min[k] = P[i + k];
        if (P[i + k] > max[k]) max[k] = P[i + k];
      }
    }
  }
  return { min, max };
}
