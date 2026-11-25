// Per-draw view uniforms (three.js side, THREE passed in): the target's size
// in device px and its pixel ratio, how many units one CSS px covers (for
// screen-stable hatching, the near-metal fallback, chamfer widths), the
// object's world scale and inverse matrix, the reference distance for line
// weights, the across-the-view direction for bare faces, and the viewer's
// azimuth in the object's frame. Hooked to onBeforeRender, so whatever
// camera and target an act renders with, the shading follows; computed once
// per render() call.

/**
 * @param {any} THREE
 * @param {Record<string, { value: any }>} U uniforms (makeUniforms)
 * @param {any} root the object whose frame the shading works in
 * @param {{ centre?: number[], onFront?: (azimuth: number) => void }} [o]
 */
export function createViewSync(THREE, U, root, o = {}) {
  const centre = o.centre || [0, 0, 0];
  const v4 = new THREE.Vector4();
  const tmp = new THREE.Vector3();
  const camPos = new THREE.Vector3();
  const fwd = new THREE.Vector3();
  let lastFrame = -1;
  let lastCam = null;
  let lastRenderer = null;
  let lastTarget = null;
  return function sync(renderer, camera) {
    const frame = renderer.info.render.frame;
    const target = renderer.getRenderTarget();
    if (frame === lastFrame && camera === lastCam && renderer === lastRenderer && target === lastTarget) return;
    lastFrame = frame;
    lastCam = camera;
    lastRenderer = renderer;
    lastTarget = target;
    renderer.getCurrentViewport(v4);
    const w = Math.max(1, v4.z);
    const h = Math.max(1, v4.w);
    const dpr = renderer.getPixelRatio() || 1;
    U.uRes.value.set(w, h);
    U.uDpr.value = dpr;
    const hCss = h / dpr;
    const P5 = camera.projectionMatrix.elements[5] || 1;
    U.uFootK.value = 2 / (P5 * hCss);
    U.uFootOrtho.value = camera.isOrthographicCamera ? 1 : 0;
    const e = root.matrixWorld.elements;
    U.uScale.value = Math.hypot(e[0], e[1], e[2]) || 1;
    U.uRootInv.value.copy(root.matrixWorld).invert();
    camPos.setFromMatrixPosition(camera.matrixWorld);
    tmp.set(centre[0], centre[1], centre[2]).applyMatrix4(root.matrixWorld);
    U.uRefDist.value = Math.max(camPos.distanceTo(tmp), 1e-3);
    fwd.set(0, 0, -1).transformDirection(camera.matrixWorld).transformDirection(U.uRootInv.value);
    const l = Math.hypot(fwd.x, fwd.z);
    if (l > 1e-4) U.uAcross.value.set(fwd.x / l, fwd.z / l);
    U.uNear.value = camera.near ?? 0.1;
    if (o.onFront) {
      tmp.copy(camPos).applyMatrix4(U.uRootInv.value);
      if (Math.hypot(tmp.x, tmp.z) > 1e-4) o.onFront(Math.atan2(-tmp.z, tmp.x));
    }
  };
}
