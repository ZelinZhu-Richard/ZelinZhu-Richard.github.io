// A pure perspective projector for orbit views (no three.js): the same
// camera the acts build from { target, az, el, dist, fov, shift }, so tests
// can check where things land on screen.

import { DEG, sub, norm, cross, dot } from './math.js';

/** Camera position for an orbit view (az / el in degrees, dir() convention). */
export function viewPosition(view) {
  const az = view.az * DEG;
  const el = view.el * DEG;
  const t = view.target;
  const ce = Math.cos(el);
  return [t[0] + view.dist * ce * Math.cos(az), t[1] + view.dist * Math.sin(el), t[2] - view.dist * ce * Math.sin(az)];
}

/**
 * @param {{ target: number[], az: number, el: number, dist: number, fov: number, shift?: number[] }} view
 * @param {number} w CSS px
 * @param {number} h CSS px
 * @returns {{ point(p: number[]): { x: number, y: number, z: number }, radius(p: number[], r: number): number, eye: number[] }}
 */
export function projector(view, w, h) {
  const eye = viewPosition(view);
  const f = norm(sub(view.target, eye)); // forward
  const r = norm(cross(f, [0, 1, 0])); // right
  const u = cross(r, f); // up
  const tanH = Math.tan((view.fov * DEG) / 2);
  const s = view.shift || [0, 0];
  const aspect = w / h;
  return {
    eye,
    point(p) {
      const d = sub(p, eye);
      const z = dot(d, f);
      const x = dot(d, r) / (z * tanH * aspect);
      const y = dot(d, u) / (z * tanH);
      return { x: (x * 0.5 + 0.5) * w + s[0] * w, y: (0.5 - y * 0.5) * h + s[1] * h, z };
    },
    radius(p, rad) {
      const z = dot(sub(p, eye), f);
      return (rad / (z * tanH)) * (h / 2);
    },
  };
}
