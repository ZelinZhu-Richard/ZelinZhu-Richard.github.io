// Camera for a shot and a viewport (shared by the page and the Node checks).

import * as THREE from 'three';
import { cameraPose } from './shots.js';

export function makeCamera(cam, w, h) {
  const pose = cameraPose(cam);
  const dist = Math.hypot(pose.position[0] - pose.target[0], pose.position[1] - pose.target[1], pose.position[2] - pose.target[2]);
  const camera = new THREE.PerspectiveCamera(cam.fov, w / h, cam.near ?? Math.max(0.02, dist * 0.02), cam.far ?? 80);
  camera.position.fromArray(pose.position);
  camera.up.set(0, 1, 0);
  camera.lookAt(new THREE.Vector3().fromArray(pose.target));
  if (cam.roll) camera.rotateZ((cam.roll * Math.PI) / 180);
  const s = cam.shift || [0, 0];
  if (s[0] || s[1]) camera.setViewOffset(w, h, -s[0] * w, -s[1] * h, w, h);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  return camera;
}
