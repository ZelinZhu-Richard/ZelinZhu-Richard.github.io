// Planar reflections, cheap (port of sketches/room/reflect.js): a mirrored camera
// renders into a small target that the mirror's own shader samples in screen space (the
// mirrored image lines up with the main view pixel for pixel, so no projection matrix is
// needed in the shader). Two mirrors:
//  - the floor (y = 0): the room and the view through the windows at `floor` x CSS size
//    (tiers.js reflection.scale), plus a copy at half that, blurred more along screen y
//    (polished stone smears reflections into vertical streaks); the floor shader mixes
//    the two per tile by roughness;
//  - the sea (y = -36 m): the sky and the far coast only, at `sea` x CSS size.
// The mirrored camera is the main camera's world matrix reflected in the plane
// (determinant -1). Every room material is double-sided, so the flipped winding needs no
// care; the instrument (front-face solids, back-face hulls) is hidden in the mirror (the
// desk top hides it from below anyway). Geometry under the plane is cut away with a
// global clipping plane while the mirror renders. A disabled mirror's targets are
// disposed (no GPU memory) and come back at their size when it is enabled again.
// Every target is written by exactly one render call per frame.

import * as THREE from 'three';
import { gaussTaps } from '../../post/shaders.js';
import { QUAD_VERT, BLUR_FRAG, COPY_FRAG } from './shaders.js';

const SEA_Y = -36;

/** @param {boolean} depth @param {string} name */
const target = (depth, name) => {
  const rt = new THREE.WebGLRenderTarget(1, 1, {
    type: THREE.HalfFloatType, format: THREE.RGBAFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
    generateMipmaps: false, depthBuffer: depth, stencilBuffer: false,
  });
  rt.texture.name = name;
  return rt;
};

/**
 * Reflection matrix for the horizontal plane y = h.
 * @param {number} h
 * @param {THREE.Matrix4} [out]
 */
export function mirrorMatrix(h, out = new THREE.Matrix4()) {
  return out.set(1, 0, 0, 0, 0, -1, 0, 2 * h, 0, 0, 1, 0, 0, 0, 0, 1);
}

const R = new THREE.Matrix4();
/**
 * Make `virt` the mirror image of `cam` in the plane y = h (same projection).
 * @param {THREE.PerspectiveCamera} virt
 * @param {THREE.PerspectiveCamera} cam (its matrixWorld must be current)
 * @param {number} h
 */
export function mirrorCamera(virt, cam, h) {
  mirrorMatrix(h, R);
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

/** @param {THREE.WebGLRenderer} renderer */
export function createReflections(renderer) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  const fsCam = new THREE.Camera();
  const fs = new THREE.Mesh(geo);
  fs.frustumCulled = false;
  const fsScene = new THREE.Scene();
  fsScene.add(fs);
  /** @param {string} frag @param {Record<string, THREE.IUniform>} uniforms */
  const mat = (frag, uniforms) => new THREE.ShaderMaterial({ vertexShader: QUAD_VERT, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false, blending: THREE.NoBlending });
  const blur = mat(BLUR_FRAG, { tSrc: { value: null }, uStep: { value: new THREE.Vector2() }, uW: { value: [1, 0, 0, 0, 0] }, uO: { value: [0, 1, 2, 3, 4] } });
  const copy = mat(COPY_FRAG, { tSrc: { value: null } });
  const tapsAcross = gaussTaps(1.6);
  const tapsDown = gaussTaps(3.2);

  /** @param {THREE.ShaderMaterial} m @param {THREE.WebGLRenderTarget} dst */
  const pass = (m, dst) => {
    fs.material = m;
    renderer.setRenderTarget(dst);
    renderer.render(fsScene, fsCam);
  };
  /** @param {THREE.WebGLRenderTarget} src @param {THREE.WebGLRenderTarget} dst @param {{ W: number[], O: number[] }} taps @param {number} dx @param {number} dy */
  const blurAxis = (src, dst, taps, dx, dy) => {
    blur.uniforms.uW.value = taps.W;
    blur.uniforms.uO.value = taps.O;
    blur.uniforms.tSrc.value = src.texture;
    blur.uniforms.uStep.value.set(dx / src.width, dy / src.height);
    pass(blur, dst);
  };

  const floorOut = target(true, 'room:floor-outside'); // sky and outside, mirrored in the floor
  const floorRT = target(true, 'room:floor'); // the room (over floorOut), mirrored in the floor
  const floorBlur = target(false, 'room:floor-blur');
  const floorTmp = target(false, 'room:floor-tmp');
  const seaRT = target(true, 'room:sea');
  const floorTargets = [floorOut, floorRT, floorBlur, floorTmp];

  const virtRoom = new THREE.PerspectiveCamera();
  const virtOut = new THREE.PerspectiveCamera();
  const virtSea = new THREE.PerspectiveCamera();
  const floorClip = [new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)];
  const seaClip = [new THREE.Plane(new THREE.Vector3(0, 1, 0), -SEA_Y)];
  const on = { floor: false, sea: false };

  /** @param {THREE.WebGLRenderTarget} rt @param {number} w @param {number} h */
  const fit = (rt, w, h) => {
    const W = Math.max(1, Math.round(w));
    const H = Math.max(1, Math.round(h));
    if (rt.width !== W || rt.height !== H) rt.setSize(W, H);
  };

  return {
    floorOut,
    floorRT,
    floorBlur,
    seaRT,
    virtRoom,
    virtOut,
    virtSea,
    floorClip,
    seaClip,
    get floorOn() {
      return on.floor;
    },
    get seaOn() {
      return on.sea;
    },
    /**
     * Sizes in CSS px times each mirror's scale; a scale of 0 turns that mirror off.
     * @param {number} cssW @param {number} cssH @param {number} floorScale @param {number} seaScale
     */
    setSize(cssW, cssH, floorScale, seaScale) {
      on.floor = floorScale > 0;
      on.sea = seaScale > 0;
      if (on.floor) {
        const fw = cssW * floorScale;
        const fh = cssH * floorScale;
        fit(floorRT, fw, fh);
        fit(floorOut, fw / 2, fh / 2);
        fit(floorBlur, fw / 2, fh / 2);
        fit(floorTmp, fw / 2, fh / 2);
      } else for (const t of floorTargets) t.dispose();
      if (on.sea) fit(seaRT, cssW * seaScale, cssH * seaScale);
      else seaRT.dispose();
    },
    /**
     * The floor mirror. The mirrored outside and room passes, then the blurred copy.
     * @param {THREE.Scene} scene
     * @param {THREE.PerspectiveCamera} outCam the outside camera (its matrixWorld current)
     * @param {THREE.PerspectiveCamera} roomCam the room camera (its matrixWorld current)
     * @param {{ out: number, room: number }} masks layer masks of the two mirrored views
     * @param {boolean} drawOutside false skips the outside (not seen in the mirror); the
     *   room pass still draws its backdrop from floorOut, which then holds a stale frame
     */
    renderFloor(scene, outCam, roomCam, masks, drawOutside) {
      const prev = renderer.clippingPlanes;
      renderer.clippingPlanes = floorClip;
      if (drawOutside) {
        mirrorCamera(virtOut, outCam, 0).layers.mask = masks.out;
        renderer.setRenderTarget(floorOut);
        renderer.render(scene, virtOut);
      }
      mirrorCamera(virtRoom, roomCam, 0).layers.mask = masks.room;
      renderer.setRenderTarget(floorRT);
      renderer.render(scene, virtRoom);
      renderer.clippingPlanes = prev;
      // the soft copy: across a little, down a lot
      copy.uniforms.tSrc.value = floorRT.texture;
      pass(copy, floorBlur);
      blurAxis(floorBlur, floorTmp, tapsAcross, 1, 0);
      blurAxis(floorTmp, floorBlur, tapsDown, 0, 1);
    },
    /**
     * The sea mirror: sky and coast only.
     * @param {THREE.Scene} scene @param {THREE.PerspectiveCamera} outCam @param {number} layerMask
     */
    renderSea(scene, outCam, layerMask) {
      const prev = renderer.clippingPlanes;
      renderer.clippingPlanes = seaClip;
      mirrorCamera(virtSea, outCam, SEA_Y).layers.mask = layerMask;
      renderer.setRenderTarget(seaRT);
      renderer.render(scene, virtSea);
      renderer.clippingPlanes = prev;
    },
    /** GPU bytes of the live mirror targets (colour 8 B/px, depth 4 B/px). */
    bytes() {
      let b = 0;
      if (on.floor) {
        b += floorRT.width * floorRT.height * 12 + floorOut.width * floorOut.height * 12;
        b += floorBlur.width * floorBlur.height * 8 + floorTmp.width * floorTmp.height * 8;
      }
      if (on.sea) b += seaRT.width * seaRT.height * 12;
      return b;
    },
    /** The full-screen pass materials (for precompiling). */
    materials: [blur, copy],
    dispose() {
      for (const t of [...floorTargets, seaRT]) t.dispose();
      blur.dispose();
      copy.dispose();
      geo.dispose();
    },
  };
}
