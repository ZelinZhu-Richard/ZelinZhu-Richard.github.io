// The seven stones on screen: where each sphere falls in CSS px, how big its
// hoop is, whether it can be seen, and which one a point picks. Works from
// the instrument's own stone positions (stoneWorldPosition / stoneRadius), so
// it must run while the act holds the instrument with the frame's state.

/**
 * @typedef {{ id: string, x: number, y: number, r: number, radius: number, hit: number, depth: number, visible: boolean }} StoneScreen
 */

/** Smallest pick radius (CSS px) on phones (ART: thumbs) and elsewhere. */
export const MIN_HIT = Object.freeze({ phone: 22, desk: 14 });

/**
 * @param {any} THREE
 */
export function createStoneProjector(THREE) {
  const v = new THREE.Vector3();
  const e = new THREE.Vector3();
  /**
   * @param {any} inst the instrument, held in the act's scene
   * @param {any} camera an updated PerspectiveCamera
   * @param {number} w CSS width of the view
   * @param {number} h CSS height
   * @param {{ phone?: boolean, shown?: boolean }} [o] shown: false marks every stone not visible
   * @returns {StoneScreen[]}
   */
  return function project(inst, camera, w, h, o = {}) {
    const out = [];
    const minHit = o.phone ? MIN_HIT.phone : MIN_HIT.desk;
    const P5 = camera.projectionMatrix.elements[5];
    for (const id of inst.stones) {
      inst.stoneWorldPosition(id, v);
      e.copy(v).applyMatrix4(camera.matrixWorldInverse);
      const depth = -e.z;
      const rw = inst.stoneRadius(id);
      const r = depth > 1e-4 ? ((rw * P5) / depth) * (h / 2) : 0;
      v.project(camera);
      const x = (v.x * 0.5 + 0.5) * w;
      const y = (0.5 - v.y * 0.5) * h;
      const onScreen = x > -r && x < w + r && y > -r && y < h + r;
      const visible = o.shown !== false && depth > camera.near && v.z < 1 && onScreen && r > 0.5;
      out.push({ id, x, y, r, radius: r, hit: Math.max(r * 1.15, minHit), depth, visible });
    }
    return out;
  };
}

/**
 * The stone under (x, y) CSS px: the visible one whose hit circle holds the
 * point most centrally; the nearer wins a tie.
 * @param {StoneScreen[]} stones
 * @param {number} x
 * @param {number} y
 * @returns {string | null}
 */
export function pickFrom(stones, x, y) {
  let best = null;
  let bestK = Infinity;
  let bestD = Infinity;
  for (const s of stones) {
    if (!s.visible) continue;
    const k = Math.hypot(x - s.x, y - s.y) / s.hit;
    if (k > 1) continue;
    if (k < bestK - 0.05 || (Math.abs(k - bestK) <= 0.05 && s.depth < bestD)) {
      best = s.id;
      bestK = k;
      bestD = s.depth;
    }
  }
  return best;
}
