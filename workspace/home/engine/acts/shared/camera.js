// FrameState cameras onto three.js cameras. A FrameCamera is plain data,
// { position: [x, y, z], target: [x, y, z], fov (vertical degrees), roll
// (degrees) }, in the act's own world (engine/timeline/evaluate.js). Every act
// turns it into the same PerspectiveCamera for render, pick and stonesScreen,
// so what is picked is what was drawn.

import { DEG } from './math.js';

/**
 * @typedef {{ position: ArrayLike<number>, target: ArrayLike<number>, fov: number, roll?: number }} FrameCamera
 * @typedef {{ nearK?: number, minNear?: number, maxNear?: number, farK?: number, farAdd?: number, offset?: ArrayLike<number> | null }} CameraFit
 */

/**
 * The camera an act should use. ARCHITECTURE.md passes the act's FrameCamera
 * as `camera`; if that is missing, it is read from the frame (camera belongs
 * to acts[0], cameraB to acts[1] during a transition). A three.js camera
 * passed instead is drawn with as it is (`three`), and the frame's camera
 * still gives the distance the act fits its fog and planes to.
 * @param {string} actId
 * @param {any} frame
 * @param {any} camera
 * @returns {{ frame: FrameCamera | null, three: any, dist: number }}
 */
export function resolveCamera(actId, frame, camera) {
  const three = camera && camera.isCamera ? camera : null;
  /** @type {FrameCamera | null} */
  let fc = null;
  if (!three && camera && camera.position && camera.target) fc = camera;
  else if (frame && frame.acts && frame.acts.length > 1 && frame.acts[1].id === actId && frame.cameraB) fc = frame.cameraB;
  else if (frame && frame.camera) fc = frame.camera;
  let dist = NaN;
  if (three && fc) {
    const p = three.position;
    const t = fc.target;
    dist = Math.hypot(t[0] - p.x, t[1] - p.y, t[2] - p.z);
  } else if (fc) dist = Math.hypot(fc.target[0] - fc.position[0], fc.target[1] - fc.position[1], fc.target[2] - fc.position[2]);
  return { frame: three ? null : fc, three, dist: Number.isFinite(dist) && dist > 1e-6 ? dist : 10 };
}

/**
 * Writes a FrameCamera into a PerspectiveCamera: position, look-at with +Y up,
 * roll about the view axis (positive turns the camera counter-clockwise as the
 * viewer sees it, so the image turns clockwise; the choreography uses 0),
 * vertical fov, aspect, and near / far planes fitted to the distance to the
 * target (near = dist * nearK within [minNear, maxNear], far = dist * farK +
 * farAdd). `offset` trucks camera and target together (pointer parallax).
 * @param {any} cam THREE.PerspectiveCamera
 * @param {FrameCamera} fc
 * @param {number} aspect width / height
 * @param {CameraFit} [fit]
 * @returns {number} the camera's distance to its target
 */
export function applyFrameCamera(cam, fc, aspect, fit = {}) {
  const ox = fit.offset ? fit.offset[0] : 0;
  const oy = fit.offset ? fit.offset[1] : 0;
  const oz = fit.offset ? fit.offset[2] : 0;
  const p = fc.position;
  const t = fc.target;
  cam.position.set(p[0] + ox, p[1] + oy, p[2] + oz);
  cam.up.set(0, 1, 0);
  cam.lookAt(t[0] + ox, t[1] + oy, t[2] + oz);
  const roll = Number.isFinite(fc.roll) ? /** @type {number} */ (fc.roll) : 0;
  if (roll) cam.rotateZ(roll * DEG);
  const dist = Math.max(Math.hypot(t[0] - p[0], t[1] - p[1], t[2] - p[2]), 1e-6);
  const nearK = fit.nearK ?? 0.02;
  const near = Math.min(Math.max(dist * nearK, fit.minNear ?? 0.002), fit.maxNear ?? 10);
  const far = Math.max(dist * (fit.farK ?? 3) + (fit.farAdd ?? 10), near * 4);
  cam.fov = Number.isFinite(fc.fov) && fc.fov > 0.01 ? fc.fov : 50;
  cam.aspect = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
  cam.near = near;
  cam.far = far;
  cam.updateProjectionMatrix();
  cam.updateMatrixWorld(true);
  return dist;
}

/**
 * Camera basis vectors (world), from an updated camera: right and up.
 * @param {any} cam
 * @param {number[]} right out
 * @param {number[]} up out
 */
export function cameraBasis(cam, right, up) {
  const e = cam.matrixWorld.elements;
  right[0] = e[0];
  right[1] = e[1];
  right[2] = e[2];
  up[0] = e[4];
  up[1] = e[5];
  up[2] = e[6];
}

/**
 * The aspect an act draws at: the target's own (a render target), else the
 * CSS size from resize(), else 16:10.
 * @param {any} target
 * @param {{ width: number, height: number }} css
 */
export function aspectOf(target, css) {
  if (target && target.width > 0 && target.height > 0) return target.width / target.height;
  if (css.width > 0 && css.height > 0) return css.width / css.height;
  return 1.6;
}
