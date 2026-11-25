// The flat astrolabe drawing for the plate act (three.js side; THREE passed
// in). The strokes come from strokes.js, built from the same rete, gear and
// alidade data as the 3D wheel, in the instrument's own frame: give
// `object3D` the same transform as the instrument's and the lifted wheel
// sits exactly over its drawing. Ink on night, the approved plate weights.
//
//   const plate = createPlateDrawing({ THREE, crank, widthScale })
//   plate.object3D           lines in the XZ plane at y = 0.003 (instrument units)
//   plate.setDraw(0..1)      draw-on: lines appear in order, as if drawn
//   plate.setCrank(rad)      turns the wheel's features with the solid wheel's
//                            angle (the plate beneath is re-clipped to the rete)
//   plate.setGhost(0..1)     0 the full drawing, 1 the dimmer outline the lifted
//                            wheel leaves (the plate beneath whole, no scale)
//   plate.setLook({ ink, outline, widthK, fog, fogColor, palette })
//   plate.anchors()          star tips, teeth, the rule's tip (plan coordinates,
//                            with toWorld) for callouts
//   plate.order              the draw-on windows of the stroke families
//   plate.dispose()

import { makeUniforms, lineMaterial, lineMesh, toLinear } from './materials.js';
import { createViewSync } from './viewsync.js';
import { plateStrokes, beneathStrokes, plateAnchors, wheelAngle, DRAW_ORDER } from './strokes.js';
import { ALIDADE_ANGLE } from './layout.js';

/**
 * @param {{ THREE: any, crank?: number, widthScale?: number, draw?: number, ghost?: number }} options
 */
export function createPlateDrawing({ THREE, crank = 0, widthScale = 1, draw = 1, ghost = 0 } = /** @type {any} */ ({})) {
  if (!THREE) throw new TypeError('createPlateDrawing: THREE is required');
  const root = new THREE.Group();
  root.name = 'instrument-plate';
  const U = makeUniforms(THREE);
  U.uBrass.value = 0;
  U.uDarkScale.value = 1;
  const sync = createViewSync(THREE, U, root, { centre: [0, 0, 0] });
  const hook = (renderer, scene, camera) => sync(renderer, camera);

  const { wheel, fixed } = plateStrokes({ widthScale });
  const matWheel = lineMaterial(THREE, U, { draw: true, bias: 0 });
  const matFixed = lineMaterial(THREE, U, { draw: true, bias: 0 });
  const wheelGroup = new THREE.Group();
  wheelGroup.name = 'instrument-plate:wheel';
  root.add(wheelGroup);
  const wheelMesh = lineMesh(THREE, wheel, matWheel, { draw: true });
  const fixedMesh = lineMesh(THREE, fixed, matFixed, { draw: true });
  wheelMesh.onBeforeRender = hook;
  fixedMesh.onBeforeRender = hook;
  wheelGroup.add(wheelMesh);
  root.add(fixedMesh);
  let beneathMesh = null;
  let rot = NaN;
  let ghostK = 0;
  let drawK = 1;

  function setBeneath(r) {
    if (beneathMesh) {
      beneathMesh.geometry.dispose();
      root.remove(beneathMesh);
    }
    beneathMesh = lineMesh(THREE, beneathStrokes(r, { widthScale }), matFixed, { draw: true });
    beneathMesh.onBeforeRender = hook;
    root.add(beneathMesh);
  }

  const api = {
    object3D: root,
    order: DRAW_ORDER,
    setDraw(t) {
      drawK = Math.max(0, Math.min(1, Number.isFinite(t) ? t : 0));
      // past the end of the last window, everything is drawn
      const v = drawK >= 1 ? 1.001 : drawK;
      matWheel.uniforms.uDraw.value = v;
      matFixed.uniforms.uDraw.value = v;
    },
    setCrank(rad) {
      const r = wheelAngle(rad);
      wheelGroup.rotation.y = r;
      wheelGroup.updateMatrix();
      // the rule's angle in the wheel's frame clips the wheel's engraving
      const a = ALIDADE_ANGLE - r;
      matWheel.uniforms.uRule.value.set(Math.cos(a), Math.sin(a), ghostK < 0.5 ? 1 : 0, 0);
      if (!(Math.abs(r - rot) < 1e-5)) {
        rot = r;
        setBeneath(r);
      }
    },
    setGhost(k) {
      ghostK = Math.max(0, Math.min(1, Number.isFinite(k) ? k : 0));
      matWheel.uniforms.uGhost.value = ghostK;
      matFixed.uniforms.uGhost.value = ghostK;
      const u = matWheel.uniforms.uRule.value;
      u.z = ghostK < 0.5 ? 1 : 0;
    },
    setLook(o = {}) {
      if (o.ink !== undefined) U.uInkScale.value = o.ink;
      if (o.outline !== undefined) U.uOutline.value = o.outline;
      if (o.widthK !== undefined) U.uWidthK.value = o.widthK;
      if (o.fog !== undefined) {
        if (o.fog) U.uFog.value.set(o.fog[0], o.fog[1]);
        else U.uFog.value.set(1e6, 2e6);
      }
      if (o.fogColor !== undefined) U.uFogCol.value.set(...toLinear(o.fogColor));
      const P = o.palette || {};
      for (const [k, u] of [['night', 'uNight'], ['ink', 'uInk'], ['muted', 'uMuted'], ['faint', 'uFaint'], ['line', 'uLine']]) {
        if (P[k] !== undefined) U[u].value.set(...toLinear(P[k]));
      }
    },
    anchors() {
      return plateAnchors(Number.isFinite(rot) ? rot : 0);
    },
    dispose() {
      wheelMesh.geometry.dispose();
      fixedMesh.geometry.dispose();
      if (beneathMesh) beneathMesh.geometry.dispose();
      matWheel.dispose();
      matFixed.dispose();
      root.removeFromParent();
    },
  };
  api.setCrank(crank);
  api.setGhost(ghost);
  api.setDraw(draw);
  return api;
}
