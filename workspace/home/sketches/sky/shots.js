// Shots for the sky test page: camera plus sky settings per shot and layout.
// Pure module (Three.js math only, no DOM), so a Node script can reuse it.
// Feature placement is expressed in NDC of the shot's own camera and turned
// into world directions, so each layout composes its own frame.

import * as THREE from 'three';
import { directionAtNdc } from './sky.js';

export const SHOT_IDS = ['space', 'window', 'both', 'nebula', 'text', 'plain'];
export const DEFAULT_SHOT = 'space';

// Use the window size, not the shot, to choose the layout.
export function layoutFor(w, h) {
  return w / h < 0.8 ? 'portrait' : 'landscape';
}

const DEG = Math.PI / 180;

// Camera per shot: vertical fov, pitch (up is positive) and yaw (degrees).
const CAMERAS = {
  landscape: {
    space: { fov: 50, pitch: 0, yaw: 0 },
    text: { fov: 50, pitch: 0, yaw: 0 },
    plain: { fov: 50, pitch: 0, yaw: 0 },
    nebula: { fov: 50, pitch: 0, yaw: 0 },
    window: { fov: 52, pitch: 30, yaw: 0 },
    both: { fov: 54, pitch: 24, yaw: -8 },
  },
  portrait: {
    space: { fov: 64, pitch: 0, yaw: 0 },
    text: { fov: 64, pitch: 0, yaw: 0 },
    plain: { fov: 64, pitch: 0, yaw: 0 },
    nebula: { fov: 64, pitch: 0, yaw: 0 },
    window: { fov: 66, pitch: 34, yaw: 0 },
    both: { fov: 68, pitch: 30, yaw: -6 },
  },
};

export function makeCamera(shotId, layout, w, h) {
  const c = CAMERAS[layout][shotId];
  const camera = new THREE.PerspectiveCamera(c.fov, w / h, 0.1, 100);
  camera.rotation.order = 'YXZ';
  camera.rotation.set(c.pitch * DEG, -c.yaw * DEG, 0);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  return camera;
}

// The ink placeholder for the instrument ('space' and 'text'): centre and
// radius in NDC-y units (so a circle stays round), about a third of the
// frame wide at centre-right.
export function instrumentPlacement(layout, w, h) {
  const aspect = w / h;
  if (layout === 'portrait') {
    return { x: 0.24, y: 0.2, r: (1 / 3) * aspect };
  }
  return { x: 0.36, y: -0.02, r: (1 / 3) * aspect };
}

// Where the sample text sits on the 'text' shot, as fractions of the window
// (left, top, width, height). main.js lays the DOM out from this and then
// measures the real box for the quiet zone; the Node preview uses it as is.
export function textBox(layout) {
  if (layout === 'portrait') return { left: 0.08, top: 0.66, width: 0.84, height: 0.22 };
  return { left: 0.075, top: 0.38, width: 0.36, height: 0.25 };
}

// Box (fractions, y down) -> NDC rect with padding in CSS px.
export function boxToNdc(box, w, h, pad = 28) {
  const x0 = box.left * w - pad;
  const x1 = (box.left + box.width) * w + pad;
  const y0 = box.top * h - pad;
  const y1 = (box.top + box.height) * h + pad;
  return [(x0 / w) * 2 - 1, 1 - (y1 / h) * 2, (x1 / w) * 2 - 1, 1 - (y0 / h) * 2];
}

// NDC helpers bound to a camera
function dirs(camera) {
  return (x, y) => directionAtNdc(camera, x, y, new THREE.Vector3());
}

// Galaxy band through NDC points a and b, bright core toward NDC point k.
function galaxyThrough(sky, camera, a, b, k, shape) {
  const D = dirs(camera);
  const da = D(a[0], a[1]);
  const db = D(b[0], b[1]);
  const pole = new THREE.Vector3().crossVectors(da, db).normalize();
  sky.setGalaxyFrame(pole, D(k[0], k[1]), shape);
}

function hero(camera, x, y, flux, color, size) {
  return { dir: directionAtNdc(camera, x, y, new THREE.Vector3()), flux, color, size };
}

// Per-shot sky settings. Directions are fixed in the world through the shot
// camera, so the composition holds and the sky still pans correctly.
const SHOTS = {
  space(sky, cam, L) {
    sky.setHorizon(0);
    sky.setAurora(0);
    sky.setGalaxy(0.9);
    sky.setNebula(0.6);
    sky.setStars(1);
    sky.setExposure(1);
    if (L === 'portrait') {
      galaxyThrough(sky, cam, [-1.1, 0.02], [0.62, 1.08], [-1.35, -0.25], { width: 0.085, coreLength: 0.7, dust: 1 });
      sky.setNebulaFrame(directionAtNdc(cam, 0.12, 0.8), { radius: 0.085, roll: 0.6 });
      sky.setHeroStars([hero(cam, -0.55, 0.42, 1.0, '#9fc0ff'), hero(cam, 0.78, -0.48, 0.55, '#ffd6a8'), hero(cam, -0.2, -0.78, 0.42, '#eef0ff')]);
    } else {
      galaxyThrough(sky, cam, [-1.05, -0.62], [0.18, 1.08], [-1.25, -0.92], { width: 0.085, coreLength: 0.7, dust: 1 });
      sky.setNebulaFrame(directionAtNdc(cam, -0.04, 0.8), { radius: 0.085, roll: 0.6 });
      sky.setHeroStars([hero(cam, -0.44, 0.58, 1.0, '#9fc0ff'), hero(cam, 0.86, -0.64, 0.55, '#ffd6a8'), hero(cam, -0.8, -0.2, 0.42, '#eef0ff')]);
    }
  },
  text(sky, cam, L) {
    SHOTS.space(sky, cam, L);
  },
  plain(sky, cam, L) {
    sky.setHorizon(0);
    sky.setAurora(0);
    sky.setGalaxy(0);
    sky.setNebula(0);
    sky.setStars(1);
    sky.setExposure(1);
    if (L === 'portrait') {
      sky.setHeroStars([hero(cam, 0.48, 0.55, 0.6, '#c9d6ff'), hero(cam, -0.6, -0.35, 0.42, '#fff1dc')]);
    } else {
      sky.setHeroStars([hero(cam, 0.62, 0.5, 0.6, '#c9d6ff'), hero(cam, -0.55, -0.42, 0.42, '#fff1dc')]);
    }
  },
  nebula(sky, cam, L) {
    sky.setHorizon(0);
    sky.setAurora(0);
    sky.setGalaxy(0.45);
    sky.setNebula(1);
    sky.setStars(1);
    sky.setExposure(1);
    if (L === 'portrait') {
      galaxyThrough(sky, cam, [-1.1, -0.62], [1.1, 0.92], [-3.0, -1.8], { width: 0.1, coreLength: 0.7, dust: 1 });
      sky.setNebulaFrame(directionAtNdc(cam, 0.02, 0.14), { radius: 0.26, roll: 1.2 });
      sky.setHeroStars([hero(cam, -0.56, 0.62, 1.0, '#9fc0ff'), hero(cam, 0.62, -0.7, 0.5, '#eef0ff')]);
    } else {
      galaxyThrough(sky, cam, [-1.1, -0.5], [1.1, 0.55], [-2.6, -1.3], { width: 0.1, coreLength: 0.7, dust: 1 });
      sky.setNebulaFrame(directionAtNdc(cam, 0.2, 0.04), { radius: 0.24, roll: 0.35 });
      sky.setHeroStars([hero(cam, -0.34, 0.42, 1.0, '#9fc0ff'), hero(cam, 0.8, -0.62, 0.5, '#eef0ff'), hero(cam, 0.66, 0.74, 0.4, '#ffd6a8')]);
    }
  },
  window(sky, cam, L) {
    sky.setHorizon(1);
    sky.setAurora(1);
    sky.setGalaxy(0.3);
    sky.setNebula(0);
    sky.setStars(0.85);
    sky.setExposure(1);
    if (L === 'portrait') {
      galaxyThrough(sky, cam, [-0.95, -1.05], [-0.15, 1.1], [-1.1, -1.8], { width: 0.08, coreLength: 0.7, dust: 1 });
      sky.setAuroraFrame({ azimuth: 0.95, distance: 1.3, spacing: 2.3, span: 1.45, base: 1.0, decay: 0.36, folds: 0.28, phase: 1.9 });
      sky.setHeroStars([hero(cam, 0.55, 0.78, 0.6, '#eef0ff'), hero(cam, -0.62, 0.3, 0.42, '#fff1dc')]);
    } else {
      galaxyThrough(sky, cam, [-0.85, -1.05], [-0.25, 1.1], [-0.95, -1.7], { width: 0.08, coreLength: 0.7, dust: 1 });
      sky.setAuroraFrame({ azimuth: 0.5, distance: 1.35, spacing: 2.3, span: 1.5, base: 1.0, decay: 0.36, folds: 0.28, phase: 1.9 });
      sky.setHeroStars([hero(cam, 0.7, 0.78, 0.6, '#eef0ff'), hero(cam, -0.55, 0.42, 0.42, '#fff1dc')]);
    }
  },
  both(sky, cam, L) {
    sky.setHorizon(1);
    sky.setAurora(0.9);
    sky.setGalaxy(0.95);
    sky.setNebula(0);
    sky.setStars(1);
    sky.setExposure(1);
    if (L === 'portrait') {
      galaxyThrough(sky, cam, [-0.75, -1.05], [0.1, 1.1], [-0.82, -1.3], { width: 0.065, coreLength: 0.75, dust: 0.8 });
      sky.setAuroraFrame({ azimuth: 0.9, distance: 1.55, spacing: 1.8, span: 1.35, base: 1.0, decay: 0.36, folds: 0.26, phase: 4.1 });
      sky.setHeroStars([hero(cam, 0.6, 0.82, 0.7, '#9fc0ff'), hero(cam, -0.75, 0.55, 0.45, '#fff1dc')]);
    } else {
      galaxyThrough(sky, cam, [-0.55, -1.05], [0.05, 1.1], [-0.62, -1.18], { width: 0.085, coreLength: 0.75, dust: 1 });
      sky.setAuroraFrame({ azimuth: 0.75, distance: 1.6, spacing: 1.8, span: 1.3, base: 1.0, decay: 0.36, folds: 0.26, phase: 4.1 });
      sky.setHeroStars([hero(cam, 0.45, 0.84, 0.7, '#9fc0ff'), hero(cam, -0.86, 0.62, 0.45, '#fff1dc')]);
    }
  },
};

export function applyShot(sky, shotId, layout, camera) {
  sky.setQuietZone(null);
  sky.setSkyRotation(null);
  SHOTS[shotId](sky, camera, layout);
}

export function hasInstrument(shotId) {
  return shotId === 'space' || shotId === 'text';
}

export function hasText(shotId) {
  return shotId === 'text';
}
