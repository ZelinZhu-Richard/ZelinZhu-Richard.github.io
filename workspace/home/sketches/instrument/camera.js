// Camera for a shot and a viewport. Perspective cameras orbit a target or
// give pos + target; `ortho` cameras look straight down at the plate
// (k = CSS px per world unit, screen-up = world -z = the drawing's +y).

import * as THREE from 'three';
import { cameraPose } from './shots.js';

export function makeCamera(cam, w, h) {
  const s = cam.shift || [0, 0];
  if (cam.ortho) {
    const k = cam.k;
    const hw = w / 2 / k;
    const hh = h / 2 / k;
    const camera = new THREE.OrthographicCamera(-hw, hw, hh, -hh, 1, 40);
    const t = cam.target;
    camera.position.set(t[0], t[1] + 10, t[2]);
    camera.up.set(0, 0, -1);
    camera.lookAt(new THREE.Vector3(t[0], t[1], t[2]));
    if (s[0] || s[1]) camera.setViewOffset(w, h, -s[0] * w, -s[1] * h, w, h);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
    return camera;
  }
  const pose = cameraPose(cam);
  const dist = Math.hypot(pose.position[0] - pose.target[0], pose.position[1] - pose.target[1], pose.position[2] - pose.target[2]);
  const camera = new THREE.PerspectiveCamera(cam.fov, w / h, cam.near ?? Math.max(0.02, dist * 0.02), cam.far ?? 420);
  camera.position.fromArray(pose.position);
  camera.up.set(0, 1, 0);
  camera.lookAt(new THREE.Vector3().fromArray(pose.target));
  if (cam.roll) camera.rotateZ((cam.roll * Math.PI) / 180);
  if (s[0] || s[1]) camera.setViewOffset(w, h, -s[0] * w, -s[1] * h, w, h);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  return camera;
}
