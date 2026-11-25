// Camera ray math shared by the sky and its presets (no shader code here).

import * as THREE from 'three';

/**
 * World direction through an NDC point of a perspective camera. Honours
 * setViewOffset, because it reads only the projection's x/y scale and shear.
 * @param {THREE.PerspectiveCamera} camera
 * @param {number} x NDC x (-1..1)
 * @param {number} y NDC y (-1..1, up)
 * @param {THREE.Vector3} [target]
 * @returns {THREE.Vector3} unit vector, world space
 */
export function directionAtNdc(camera, x, y, target = new THREE.Vector3()) {
  camera.updateMatrixWorld();
  const e = camera.projectionMatrix.elements;
  target.set((x + e[8]) / e[0], (y + e[9]) / e[5], -1);
  return target.transformDirection(camera.matrixWorld);
}
