// Ink ribbons as plain data (no three.js). WebGL lines are 1 px, so every
// engraved crease and drawn line is one instanced quad per segment, expanded
// in screen space by the ribbon shader (shaders.js). A segment carries its
// two ends, the normals of the faces on either side (a crease is culled when
// both look away; [0,0,0] means always facing; one normal for both sides
// means a line printed on a face), and p = (width CSS px, tone, accent, code).
// code = flags + 8 * bone: flag 1 clips the segment under the alidade, 2 and
// 4 mark the plate drawing's plate-only and ghost-only lines.

import { apply, normalMatrix, applyN } from './math.js';

export const LINE_FLAGS = { RULE: 1, PLATE: 2, GHOST: 4 };

export class LineData {
  constructor() {
    this.a = [];
    this.b = [];
    this.na = [];
    this.nb = [];
    this.p = [];
    this.o = [];
  }

  get count() {
    return this.a.length / 3;
  }

  seg(a, b, nA, nB, width, tone, accent = false, code = 0) {
    this.a.push(a[0], a[1], a[2]);
    this.b.push(b[0], b[1], b[2]);
    this.na.push(nA[0], nA[1], nA[2]);
    this.nb.push(nB[0], nB[1], nB[2]);
    this.p.push(width, tone, accent ? 1 : 0, code);
    this.o.push(0, 0);
  }

  /** Builder edges (part space) moved into the group's frame by m. */
  addEdges(edges, m, width, tone, accent = false, code = 0) {
    const nm = normalMatrix(m);
    for (const e of edges) this.seg(apply(m, e.a), apply(m, e.b), applyN(nm, e.nA), applyN(nm, e.nB), width, tone, accent, code);
  }

  /**
   * Polyline in the group's frame. `normal` is one normal for every segment (a
   * line printed on a flat face), `normals` one per point; neither = always
   * facing. `maxLen` splits long segments (so clipping can follow them).
   */
  polyline(points, width, tone, opts = {}) {
    const { closed = false, dash = 0, normals = null, normal = null, accent = false, code = 0, maxLen = 0 } = opts;
    const n = points.length;
    const last = closed ? n : n - 1;
    for (let i = 0; i < last; i++) {
      if (dash > 0 && Math.floor(i / dash) % 2 === 1) continue;
      const a = points[i];
      const b = points[(i + 1) % n];
      const nn = normals ? normals[i] : normal || [0, 0, 0];
      const L = maxLen > 0 ? Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) : 0;
      const k = maxLen > 0 ? Math.max(1, Math.ceil(L / maxLen)) : 1;
      for (let j = 0; j < k; j++) {
        const t0 = j / k;
        const t1 = (j + 1) / k;
        const p0 = [a[0] + (b[0] - a[0]) * t0, a[1] + (b[1] - a[1]) * t0, a[2] + (b[2] - a[2]) * t0];
        const p1 = [a[0] + (b[0] - a[0]) * t1, a[1] + (b[1] - a[1]) * t1, a[2] + (b[2] - a[2]) * t1];
        this.seg(p0, p1, nn, nn, width, tone, accent, code);
      }
    }
  }

  /** Polyline broken by a pattern of arc lengths [on, off, on, off, ...]. */
  pattern(points, pat, width, tone, opts = {}) {
    const { closed = false, normal = null, phase = 0, code = 0 } = opts;
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
        this.seg(p0, p1, nn, nn, width, tone, false, code);
      }
      s += L;
    }
  }

  /** Set the draw-on window [from, to] of segments [i0, i1), spread by length in their order. */
  order(i0, i1, from, to) {
    let total = 0;
    const lens = [];
    for (let i = i0; i < i1; i++) {
      const l = Math.hypot(this.b[3 * i] - this.a[3 * i], this.b[3 * i + 1] - this.a[3 * i + 1], this.b[3 * i + 2] - this.a[3 * i + 2]);
      lens.push(l);
      total += l;
    }
    let s = 0;
    for (let i = i0; i < i1; i++) {
      const l = lens[i - i0];
      this.o[2 * i] = from + ((to - from) * s) / (total || 1);
      s += l;
      this.o[2 * i + 1] = from + ((to - from) * s) / (total || 1);
    }
  }
}
