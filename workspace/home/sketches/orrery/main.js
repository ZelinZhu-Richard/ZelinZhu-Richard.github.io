// Sketch C, "The Instrument": an engraved forecasting machine drawn as one
// still per URL. ?shot=<id> picks the frame, &notext=1 hides the type.

import * as THREE from 'three';
import { SHOTS, layoutFor, resolveShot } from './shots.js';
import { buildInstrument, LAYERS } from './machine.js';
import { shared, depthMaterial } from './materials.js';
import { makeCamera } from './camera.js';
import { renderOverlay } from './overlay.js';
import { PALETTE } from './palette.js';

THREE.ColorManagement.enabled = false;

const params = new URLSearchParams(window.location.search);
const requested = params.get('shot');
const shotId = requested && Object.prototype.hasOwnProperty.call(SHOTS, requested) ? requested : 'hero';
if (params.get('notext') === '1') document.documentElement.classList.add('notext');
document.documentElement.dataset.frame = shotId;

const canvas = document.getElementById('c');
const overlayRoot = document.getElementById('overlay');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: true });
renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
renderer.setClearColor(new THREE.Color(PALETTE.night[0], PALETTE.night[1], PALETTE.night[2]), 1);

const SHADOW_SIZE = 2048;
const shadowRT = new THREE.WebGLRenderTarget(SHADOW_SIZE, SHADOW_SIZE, {
  depthBuffer: true,
  depthTexture: new THREE.DepthTexture(SHADOW_SIZE, SHADOW_SIZE),
});
const depthMat = depthMaterial();
const BIAS = new THREE.Matrix4().set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
const DEG = Math.PI / 180;

function lightDir([az, el]) {
  return new THREE.Vector3(Math.cos(el * DEG) * Math.cos(az * DEG), Math.sin(el * DEG), -Math.cos(el * DEG) * Math.sin(az * DEG)).normalize();
}

let built = null;

function sceneFor(S) {
  const key = S.id + ':' + S.layout;
  if (built && built.key === key) return built;
  if (built) {
    built.scene.traverse((o) => {
      if (o.isMesh) o.geometry.dispose();
    });
  }
  const inst = buildInstrument(S.state);
  const scene = new THREE.Scene();
  scene.add(inst.group);
  scene.updateMatrixWorld(true);
  built = { key, scene, inst };
  return built;
}

function shadowPass(scene, S) {
  const C = new THREE.Vector3().fromArray(S.shadow.center);
  const R = S.shadow.radius;
  const L = shared.uKeyDir.value;
  const cam = new THREE.OrthographicCamera(-R, R, R, -R, 0.05, R * 4);
  cam.position.copy(C).addScaledVector(L, R * 2);
  if (Math.abs(L.y) > 0.98) cam.up.set(0, 0, -1);
  cam.lookAt(C);
  cam.updateMatrixWorld(true);
  cam.updateProjectionMatrix();
  cam.layers.set(LAYERS.SOLID);
  scene.overrideMaterial = depthMat;
  renderer.setRenderTarget(shadowRT);
  renderer.render(scene, cam);
  renderer.setRenderTarget(null);
  scene.overrideMaterial = null;
  shared.uShadowMatrix.value.copy(BIAS).multiply(cam.projectionMatrix).multiply(cam.matrixWorldInverse);
  shared.uShadowMap.value = shadowRT.depthTexture;
  shared.uShadowTexel.value = 1 / SHADOW_SIZE;
  shared.uShadowBias.value = 0.0007;
  shared.uShadowNormal.value = (2 * R) / SHADOW_SIZE * 1.6;
  shared.uShadowOn.value = 1;
}

function draw() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  renderer.setPixelRatio(dpr);
  renderer.setSize(w, h);
  const layout = layoutFor(w, h);
  document.documentElement.dataset.layout = layout;
  const S = resolveShot(shotId, layout);
  const { scene, inst } = sceneFor(S);

  const camera = makeCamera(S.cam, w, h);
  camera.layers.enable(LAYERS.SOLID);
  camera.layers.enable(LAYERS.INK);
  camera.layers.enable(LAYERS.GROUND);
  const target = new THREE.Vector3().fromArray(S.cam.target);
  const camDist = camera.position.distanceTo(target);

  const buf = renderer.getDrawingBufferSize(new THREE.Vector2());
  shared.uRes.value.copy(buf);
  shared.uDpr.value = buf.x / w;
  shared.uKeyDir.value.copy(lightDir(S.light.key));
  shared.uKeyI.value = S.light.keyI;
  shared.uFillDir.value.copy(lightDir(S.light.fill));
  shared.uFillI.value = S.light.fillI;
  shared.uAmb.value = S.light.amb;
  shared.uRim.value = S.light.rim;
  shared.uFogNear.value = S.fog[0];
  shared.uFogFar.value = S.fog[1];
  shared.uInkScale.value = S.look.inkScale;
  shared.uOutline.value = S.look.outline ?? 1;
  shared.uDarkScale.value = S.look.darkScale;
  shared.uSpacing.value = S.look.spacing;
  shared.uRefDist.value = camDist;

  // ground hatch runs across the view, like the horizon lines of a plate
  const fwd = new THREE.Vector3();
  camera.getWorldDirection(fwd);
  fwd.y = 0;
  if (fwd.lengthSq() < 1e-6) fwd.set(0, 0, -1);
  fwd.normalize();
  inst.mats.ground.uniforms.uGroundDir.value.set(fwd.x, fwd.z);
  if (inst.lineMesh) inst.lineMesh.material.uniforms.uNear.value = camera.near;

  // each sphere's engraving density follows its size on screen
  const tanH = Math.tan((camera.fov * DEG) / 2);
  for (const s of inst.spheres) {
    const c = new THREE.Vector3().fromArray(s.center);
    const d = c.distanceTo(camera.position);
    const rpx = (s.r / d / tanH) * (h / 2);
    s.material.uniforms.uPatN.value = Math.min(72, Math.max(12, (Math.PI * rpx) / 5.4));
    if (S.state.accent === 'contour:' + s.i) {
      const toCam = camera.position.clone().sub(c).normalize();
      const p = toCam.multiplyScalar(0.75).addScaledVector(shared.uKeyDir.value, 0.4).add(new THREE.Vector3(0, 0.3, 0)).normalize();
      p.applyQuaternion(s.quat.clone().invert());
      s.material.uniforms.uAccentP.value.copy(p);
      s.material.uniforms.uAccentLevel.value = 1;
    }
  }

  shadowPass(scene, S);
  renderer.render(scene, camera);

  // labels for the seven stones
  let labels = null;
  if (shotId === 'stones' && inst.anchors.spheres) {
    labels = inst.anchors.spheres.map((a, i) => {
      const c = new THREE.Vector3().fromArray(a.center);
      const p = c.clone().project(camera);
      const d = c.distanceTo(camera.position);
      return {
        n: String(i + 1).padStart(2, '0'),
        text: a.label,
        x: (p.x * 0.5 + 0.5) * w,
        y: (1 - (p.y * 0.5 + 0.5)) * h,
        r: (a.hoopR / d / tanH) * (h / 2) + 2,
      };
    });
  }
  renderOverlay(overlayRoot, shotId, layout, labels);
}

let resizeTimer = 0;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(draw, 120);
});

async function start() {
  try {
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
  } catch (e) {
    /* fonts are system fonts; carry on */
  }
  draw();
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      document.documentElement.dataset.shot = shotId;
      window.__SKETCH_READY__ = true;
    });
  });
}

start();
