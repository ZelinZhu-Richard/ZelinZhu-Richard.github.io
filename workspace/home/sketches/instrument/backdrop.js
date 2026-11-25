// The procedural sky behind the space frames (sketches/sky/sky.js).
//
// The sky is drawn first, in its own pass, through a sky camera that shares
// the shot camera's position, orientation and screen shift but has a wider
// field of view (the sky was designed at 50 to 64 deg; at the instrument's
// 30 deg the galaxy would fill the frame). It is still a backdrop at
// infinity: turning the shot camera turns the sky camera with it.
//
// Features are placed in screen NDC through the sky camera, so a shot says
// where the band, its core, the nebula and the few spike stars go on screen
// (and check.mjs can test those points against the labels without three.js).
//
// Colour: the instrument renders to a linear output with colour management
// off (palette hex values reach the screen unchanged). sky.js detects the
// linear output transfer in onBeforeRender and encodes sRGB itself, so the
// sky is neither double-encoded nor washed out. The page now draws the sky
// into an offscreen target first (finish.js composes it with the scene);
// getSky keeps the encode on for that target, see there.

import * as THREE from 'three';
import { createSky, directionAtNdc } from '../sky/sky.js';
import { makeCamera } from './camera.js';

let sky = null;
let skyScene = null;

export function getSky(tier) {
  if (!sky) {
    sky = createSky({ seed: 7, tier, galaxy: 0, aurora: 0, nebula: 0, stars: 1 });
    skyScene = new THREE.Scene();
    skyScene.add(sky.object3D);
    // The page draws the sky into an offscreen target (finish.js) whose
    // pixels reach the linear canvas unchanged. sky.js encodes and dithers
    // only when it draws straight to the canvas, so after its own per-draw
    // setup, do both here as if it did.
    const before = sky.object3D.onBeforeRender;
    sky.object3D.onBeforeRender = function (renderer, ...rest) {
      before.call(this, renderer, ...rest);
      if (renderer.getRenderTarget() !== null && THREE.ColorManagement.getTransfer(renderer.outputColorSpace) === THREE.LinearTransfer) {
        sky.uniforms.uEncode.value = 1;
        sky.uniforms.uDither.value = 1;
      }
    };
  }
  sky.setTier(tier);
  return { sky, scene: skyScene };
}

export function skyCamera(S, w, h) {
  return makeCamera({ ...S.cam, fov: S.sky.fov ?? S.cam.fov }, w, h);
}

// Screen NDC -> world directions for one shot's sky.
export function skyFrame(S, cam) {
  const K = S.sky;
  const D = (p) => directionAtNdc(cam, p[0], p[1], new THREE.Vector3());
  const out = { amount: K.galaxy?.amount ?? 0 };
  if (K.galaxy) {
    const a = D(K.galaxy.a);
    const b = D(K.galaxy.b);
    out.pole = new THREE.Vector3().crossVectors(a, b).normalize();
    out.core = D(K.galaxy.core);
    out.shape = { width: K.galaxy.width ?? 0.085, coreLength: K.galaxy.coreLength ?? 0.7, dust: K.galaxy.dust ?? 1 };
  }
  if (K.nebula) out.nebula = { dir: D(K.nebula.at), radius: K.nebula.radius ?? 0.08, roll: K.nebula.roll ?? 0, amount: K.nebula.amount ?? 0.6 };
  out.heroes = (K.heroes || []).map((s) => ({ dir: D(s.at), flux: s.flux, color: s.color, size: s.size }));
  return out;
}

// rect: CSS px [left, top, right, bottom] of the text block, or null.
export function applySky(S, cam, w, h, rect) {
  const K = S.sky;
  const { sky: s, scene } = getSky(K.tier ?? (S.layout === 'port' ? 1 : 2));
  const F = skyFrame(S, cam);
  s.setSkyRotation(null);
  s.setHorizon(0);
  s.setAurora(K.aurora ?? 0);
  s.setStars(K.stars ?? 1);
  s.setExposure(K.exposure ?? 1);
  s.setGalaxy(F.amount);
  if (F.pole) s.setGalaxyFrame(F.pole, F.core, F.shape);
  s.setNebula(F.nebula ? F.nebula.amount : 0);
  if (F.nebula) s.setNebulaFrame(F.nebula.dir, { radius: F.nebula.radius, roll: F.nebula.roll });
  s.setHeroStars(F.heroes);
  s.setTime(0);
  if (rect) {
    const pad = 30;
    s.setQuietZone([((rect[0] - pad) / w) * 2 - 1, 1 - ((rect[3] + pad) / h) * 2, ((rect[2] + pad) / w) * 2 - 1, 1 - ((rect[1] - pad) / h) * 2], K.quiet ?? 1);
  } else s.setQuietZone(null);
  return scene;
}
