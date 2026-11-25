// Planar reflections, cheap: a mirrored camera renders into a small target
// that the mirror's own shader samples in screen space (the mirrored image
// lines up with the main view pixel for pixel, so no projection matrix is
// needed in the shader). Two mirrors:
//  - the floor (y = 0): the room and the view through the windows, half CSS
//    resolution, plus a quarter-resolution copy blurred more along screen y
//    (polished stone smears reflections into vertical streaks); the floor
//    shader mixes the two per tile by roughness;
//  - the sea (y = -36 m): the sky and the far coast only, at about a third
//    of CSS resolution; the sea shader streaks it vertically.
// The mirrored camera is the main camera's world matrix reflected in the
// plane (determinant -1). Every room material is double-sided, so the flipped
// winding needs no special care. Geometry on the far side of the plane is
// cut away with a global clipping plane while the mirror renders.

import * as THREE from 'three';
import { gaussTaps } from '../instrument/finish.js';

const VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const BLUR_FRAG = /* glsl */ `
uniform sampler2D tSrc;
uniform vec2 uStep;
uniform float uW[5];
uniform float uO[5];
varying vec2 vUv;
void main() {
  vec3 c = texture2D(tSrc, vUv).rgb * uW[0];
  for (int i = 1; i < 5; i++) {
    c += texture2D(tSrc, vUv + uStep * uO[i]).rgb * uW[i];
    c += texture2D(tSrc, vUv - uStep * uO[i]).rgb * uW[i];
  }
  gl_FragColor = vec4(c, 1.0);
}
`;

const COPY_FRAG = /* glsl */ `
uniform sampler2D tSrc;
varying vec2 vUv;
void main() {
  gl_FragColor = vec4(min(texture2D(tSrc, vUv).rgb, vec3(32.0)), 1.0);
}
`;

// exported for glsl_check.py (compiles every custom shader without a browser)
export const SHADERS = Object.freeze({ VERT, BLUR_FRAG, COPY_FRAG });

const rt = () =>
  new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: true });
const rtFlat = () =>
  new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false });

/** Reflection matrix for the horizontal plane y = h. */
export function mirrorMatrix(h, target = new THREE.Matrix4()) {
  return target.set(1, 0, 0, 0, 0, -1, 0, 2 * h, 0, 0, 1, 0, 0, 0, 0, 1);
}

/** Make `virt` the mirror image of `cam` in the plane y = h (same projection). */
export function mirrorCamera(virt, cam, h) {
  const R = mirrorMatrix(h);
  cam.updateMatrixWorld();
  virt.matrixAutoUpdate = false;
  virt.matrixWorldAutoUpdate = false;
  virt.matrixWorld.multiplyMatrices(R, cam.matrixWorld);
  virt.matrixWorldInverse.multiplyMatrices(cam.matrixWorldInverse, R);
  virt.projectionMatrix.copy(cam.projectionMatrix);
  virt.projectionMatrixInverse.copy(cam.projectionMatrixInverse);
  virt.near = cam.near;
  virt.far = cam.far;
  virt.fov = cam.fov;
  virt.aspect = cam.aspect;
  return virt;
}

export function createReflections(renderer) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  const fsCam = new THREE.Camera();
  const fs = new THREE.Mesh(geo);
  fs.frustumCulled = false;
  const fsScene = new THREE.Scene();
  fsScene.add(fs);
  const mat = (frag, uniforms) => new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false });
  const blur = mat(BLUR_FRAG, { tSrc: { value: null }, uStep: { value: new THREE.Vector2() }, uW: { value: [1, 0, 0, 0, 0] }, uO: { value: [0, 1, 2, 3, 4] } });
  const copy = mat(COPY_FRAG, { tSrc: { value: null } });
  const pass = (m, target) => {
    fs.material = m;
    renderer.setRenderTarget(target);
    renderer.render(fsScene, fsCam);
  };
  const blurAxis = (src, dst, sigma, dx, dy) => {
    const g = gaussTaps(sigma);
    blur.uniforms.uW.value = g.W;
    blur.uniforms.uO.value = g.O;
    blur.uniforms.tSrc.value = src.texture;
    blur.uniforms.uStep.value.set(dx / src.width, dy / src.height);
    pass(blur, dst);
  };

  const floorOut = rt(); // sky and outside, mirrored in the floor
  const floorRT = rt(); // the room (over floorOut), mirrored in the floor
  const floorBlur = rtFlat();
  const floorTmp = rtFlat();
  const seaRT = rt();

  const virtRoom = new THREE.PerspectiveCamera();
  const virtOut = new THREE.PerspectiveCamera();
  const virtSea = new THREE.PerspectiveCamera();
  const floorClip = [new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)];
  const seaClip = [new THREE.Plane(new THREE.Vector3(0, 1, 0), 36)];

  return {
    floorOut,
    floorRT,
    floorBlur,
    seaRT,
    virtRoom,
    virtOut,
    virtSea,
    setSize(cssW, cssH, floorScale, seaScale) {
      const fw = Math.max(1, Math.round(cssW * floorScale));
      const fh = Math.max(1, Math.round(cssH * floorScale));
      floorRT.setSize(fw, fh);
      floorOut.setSize(Math.max(1, Math.round(fw / 2)), Math.max(1, Math.round(fh / 2)));
      floorBlur.setSize(Math.max(1, Math.round(fw / 2)), Math.max(1, Math.round(fh / 2)));
      floorTmp.setSize(floorBlur.width, floorBlur.height);
      seaRT.setSize(Math.max(1, Math.round(cssW * seaScale)), Math.max(1, Math.round(cssH * seaScale)));
    },
    /**
     * Floor mirror. outCam/roomCam: the main cameras (outside and room
     * layers); `layers` = { out, room } layer masks for the mirrored views.
     */
    renderFloor(scene, outCam, roomCam, layers) {
      const prev = renderer.clippingPlanes;
      renderer.clippingPlanes = floorClip;
      mirrorCamera(virtOut, outCam, 0).layers.mask = layers.out;
      renderer.setRenderTarget(floorOut);
      renderer.render(scene, virtOut);
      mirrorCamera(virtRoom, roomCam, 0).layers.mask = layers.room;
      renderer.setRenderTarget(floorRT);
      renderer.render(scene, virtRoom);
      renderer.clippingPlanes = prev;
      // quarter-resolution blurred copy: soft across, streaky down
      copy.uniforms.tSrc.value = floorRT.texture;
      pass(copy, floorBlur);
      blurAxis(floorBlur, floorTmp, 1.6, 1, 0);
      blurAxis(floorTmp, floorBlur, 3.2, 0, 1);
    },
    renderSea(scene, outCam, layerMask) {
      const prev = renderer.clippingPlanes;
      renderer.clippingPlanes = seaClip;
      mirrorCamera(virtSea, outCam, -36).layers.mask = layerMask;
      renderer.setRenderTarget(seaRT);
      renderer.render(scene, virtSea);
      renderer.clippingPlanes = prev;
    },
    bytes() {
      let b = 0;
      for (const t of [floorOut, floorRT, seaRT]) b += t.width * t.height * (8 + 4);
      for (const t of [floorBlur, floorTmp]) b += t.width * t.height * 8;
      return b;
    },
  };
}
