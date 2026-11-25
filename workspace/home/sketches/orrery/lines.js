// Weighted ink ribbons. WebGL lines are 1 px, so every engraved crease is an
// instanced quad expanded in screen space (see LINE_VERT in materials.js).

import * as THREE from 'three';
import { lineMaterial } from './materials.js';

export class LineSet {
  constructor() {
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

  // World-space polyline; normals [0,0,0] mean "always facing".
  polyline(points, width, tone, opts = {}) {
    const { closed = false, dash = 0, normals = null, accent = false } = opts;
    const n = points.length;
    const last = closed ? n : n - 1;
    for (let i = 0; i < last; i++) {
      if (dash > 0 && Math.floor(i / dash) % 2 === 1) continue;
      const a = points[i];
      const b = points[(i + 1) % n];
      const nn = normals ? normals[i] : [0, 0, 0];
      this.seg(a, b, nn, nn, width, tone, accent);
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
    const mesh = new THREE.Mesh(quad, lineMaterial());
    mesh.frustumCulled = false;
    mesh.renderOrder = 2;
    return mesh;
  }
}
