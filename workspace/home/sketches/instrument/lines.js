// Weighted ink ribbons. WebGL lines are 1 px, so every engraved crease and
// every drawn line is an instanced quad expanded in screen space (see
// LINE_VERT in materials.js). Each LineSet belongs to one group, so the
// plate, the desk and the instrument can be inked (or dissolved) apart.

import * as THREE from 'three';
import { lineMaterial } from './materials.js';

export class LineSet {
  constructor(group, opts = {}) {
    this.group = group;
    this.opts = opts;
    this.a = [];
    this.b = [];
    this.na = [];
    this.nb = [];
    this.p = [];
  }

  get count() {
    return this.a.length / 3;
  }

  seg(a, b, nA, nB, width, tone, accent = false) {
    this.a.push(a[0], a[1], a[2]);
    this.b.push(b[0], b[1], b[2]);
    this.na.push(nA[0], nA[1], nA[2]);
    this.nb.push(nB[0], nB[1], nB[2]);
    this.p.push(width, tone, accent ? 1 : 0, 0);
  }

  // Add builder edges (object space) transformed by a world matrix.
  addEdges(edges, matrix, width, tone, accent = false) {
    const nm = new THREE.Matrix3().getNormalMatrix(matrix);
    const A = new THREE.Vector3();
    const B = new THREE.Vector3();
    const NA = new THREE.Vector3();
    const NB = new THREE.Vector3();
    for (const e of edges) {
      A.fromArray(e.a).applyMatrix4(matrix);
      B.fromArray(e.b).applyMatrix4(matrix);
      NA.fromArray(e.nA).applyMatrix3(nm).normalize();
      NB.fromArray(e.nB).applyMatrix3(nm).normalize();
      this.seg([A.x, A.y, A.z], [B.x, B.y, B.z], [NA.x, NA.y, NA.z], [NB.x, NB.y, NB.z], width, tone, accent);
    }
  }

  // World-space polyline; normals [0,0,0] mean "always facing". `normal` is
  // one normal for every segment (a line printed on a flat face).
  polyline(points, width, tone, opts = {}) {
    const { closed = false, dash = 0, normals = null, normal = null, accent = false } = opts;
    const n = points.length;
    const last = closed ? n : n - 1;
    for (let i = 0; i < last; i++) {
      if (dash > 0 && Math.floor(i / dash) % 2 === 1) continue;
      const a = points[i];
      const b = points[(i + 1) % n];
      const nn = normals ? normals[i] : normal || [0, 0, 0];
      this.seg(a, b, nn, nn, width, tone, accent);
    }
  }

  // Polyline broken by a pattern of arc lengths [on, off, on, off, ...]
  // (world units): chain lines, dashes, dash-dot centre lines.
  pattern(points, pat, width, tone, opts = {}) {
    const { closed = false, normal = null, phase = 0 } = opts;
    const pts = closed ? [...points, points[0]] : points;
    const total = pat.reduce((s, v) => s + v, 0);
    let s = phase % total;
    const at = (x) => {
      let r = ((x % total) + total) % total;
      for (let k = 0; k < pat.length; k++) {
        if (r < pat[k]) return k % 2 === 0;
        r -= pat[k];
      }
      return false;
    };
    const nn = normal || [0, 0, 0];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      const L = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
      if (L < 1e-9) continue;
      const steps = Math.max(1, Math.ceil(L / (total / 24)));
      for (let k = 0; k < steps; k++) {
        const t0 = k / steps;
        const t1 = (k + 1) / steps;
        const sm = s + L * (t0 + t1) * 0.5;
        if (!at(sm)) continue;
        const p0 = [a[0] + (b[0] - a[0]) * t0, a[1] + (b[1] - a[1]) * t0, a[2] + (b[2] - a[2]) * t0];
        const p1 = [a[0] + (b[0] - a[0]) * t1, a[1] + (b[1] - a[1]) * t1, a[2] + (b[2] - a[2]) * t1];
        this.seg(p0, p1, nn, nn, width, tone);
      }
      s += L;
    }
  }

  build() {
    const quad = new THREE.InstancedBufferGeometry();
    quad.setAttribute('position', new THREE.Float32BufferAttribute([0, -1, 0, 1, -1, 0, 1, 1, 0, 0, 1, 0], 3));
    quad.setIndex([0, 1, 2, 0, 2, 3]);
    quad.setAttribute('iA', new THREE.InstancedBufferAttribute(new Float32Array(this.a), 3));
    quad.setAttribute('iB', new THREE.InstancedBufferAttribute(new Float32Array(this.b), 3));
    quad.setAttribute('iNA', new THREE.InstancedBufferAttribute(new Float32Array(this.na), 3));
    quad.setAttribute('iNB', new THREE.InstancedBufferAttribute(new Float32Array(this.nb), 3));
    quad.setAttribute('iP', new THREE.InstancedBufferAttribute(new Float32Array(this.p), 4));
    quad.instanceCount = this.count;
    const mesh = new THREE.Mesh(quad, lineMaterial(this.group, this.opts));
    mesh.frustumCulled = false;
    mesh.renderOrder = 2;
    return mesh;
  }
}
