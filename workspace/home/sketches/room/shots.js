// Shots for the room look test: cameras, depth of field, text and sky per
// shot and layout. Pure module (Three.js math only, no DOM), so check.mjs can
// import it in Node and project known objects through every camera.
//
// The five landscape cameras are Blender's (assets-src/room/build_room.py
// CAMERAS, rendered at 1600x900, sensor 36 mm, sensor fit AUTO, so the lens
// sets the HORIZONTAL field of view). Blender is Z-up, the GLB and three are
// Y-up: three (x, y, z) = Blender (x, z, -y). Blender aims its cameras with
// to_track_quat('-Z', 'Y') (look down -Z, keep +Y up), which is exactly
// three's lookAt with up = +Y.

import * as THREE from 'three';

export const DEG = Math.PI / 180;

/** Blender Z-up world position -> three Y-up world position. */
export function b2t(p) {
  return [p[0], p[2], -p[1]];
}

/** three Y-up -> Blender Z-up (for messages and checks). */
export function t2b(p) {
  return [p[0], -p[2], p[1]];
}

export const BLENDER_FRAME = Object.freeze({ w: 1600, h: 900, sensor: 36 });

// Copied from build_room.py CAMERAS: location, target, lens (mm), focus, f-stop.
export const BLENDER_CAMERAS = Object.freeze({
  wide: { loc: [0.2, 0.9, 1.35], tgt: [0.73, 5.4, 1.67], lens: 16, focus: 5.4, fstop: 2.8 },
  desk: { loc: [-3.1, 4.05, 1.75], tgt: [-3.0, 6.45, 0.92], lens: 21, focus: null, fstop: 0 },
  instrument: { loc: [-0.55, 5.92, 1.08], tgt: [-1.38, 6.4, 0.99], lens: 38, focus: 'armillary', fstop: 2.8 },
  bed: { loc: [1.83, 3.48, 1.4], tgt: [3.95, 5.45, 0.64], lens: 28, focus: null, fstop: 0 },
  wall: { loc: [1.15, 2.3, 1.7], tgt: [1.15, 6.96, 1.62], lens: 31, focus: null, fstop: 0 },
});

// Known object positions in Blender world space (queried from room.blend):
// the checks project these through each camera.
export const LANDMARKS = Object.freeze({
  armillaryCore: [-1.38, 6.4, 1.06],
  monitorCenter: [-3.05, 6.6195, 1.15],
  monitorLeft: [-4.034, 6.436, 1.12],
  monitorRight: [-2.066, 6.436, 1.12],
  globeHead: [4.67, 4.39, 0.91],
  globeFoot: [2.6, 6.37, 0.91],
  board: [1.15, 6.955, 1.95],
  penguin: [3.74, 6.12, 0.87],
  bookStack: [2.02, 2.62, 0.6],
  deskLamp: [-1.316, 6.488, 1.363],
  notebook: [-3.9, 6.1, 0.78],
});

// The words, copied verbatim from workspace/home/content.mjs CHAPTERS (the
// browser cannot import it: it reaches outside the served folder). check.mjs
// compares them with content.mjs. Section numbers follow STORYBOARD.md.
export const CHAPTER_TEXT = Object.freeze({
  11: 'Wake up.\nShip. Learn. *Repeat.*',
  12: 'What am I\n*working on?*',
  13: 'Learning from images\n\nAt UNC PRIMES, I work on\ndeep learning for neuroscience\nimage processing.',
  14: 'Building ZeroMind\n\nOne agent on every frontier model,\none memory of your whole life,\nbetter at it every week.',
  15: 'Building in the open\n\nFrom Apex Analysis to EqualVoice,\nI turn questions into code,\nthen learn from the results.',
  16: 'Bringing people together\n\nI lead teams and host events.\nOff the keyboard: skiing,\nsnow, and the northern lights.',
});

// Portrait cameras (390x844) are new compositions, not Blender's: position
// and target in Blender coordinates, vertical field of view in degrees. Each
// keeps the shot's subject in one part of the frame and leaves the other part
// quiet for the text.
const PORTRAIT = {
  wide: { loc: [0.6, 1.2, 1.45], tgt: [-2.4, 6.3, 1.72], vfov: 78 },
  desk: { loc: [-3.05, 4.5, 1.62], tgt: [-3.05, 6.6, 1.06], vfov: 72 },
  instrument: { loc: [-0.55, 5.92, 1.08], tgt: [-1.38, 6.4, 1.11], vfov: 52 },
  bed: { loc: [2.72, 3.86, 1.6], tgt: [3.8, 5.95, 0.82], vfov: 72 },
  wall: { loc: [1.15, 1.2, 1.75], tgt: [1.15, 6.96, 2.3], vfov: 76 },
  screens: { loc: [-3.3, 5.3, 1.32], tgt: [-4.03, 6.44, 1.06], vfov: 64 },
};

// One extra shot with no Blender still: the left monitor (model evaluation
// curves) for section 13, so every text beat from 11 to 16 has a frame.
const EXTRA_LAND = {
  screens: { loc: [-3.0, 5.32, 1.24], tgt: [-4.2, 6.42, 1.07], lens: 30, focus: null, fstop: 0 },
};

// Per shot: section number (text), DOF, glass transmission (the instrument
// close-up darkens the window one stop, like render_room.py's ND override),
// text box placement per layout (CSS, read by main.js) and the sky quiet zone
// switch (dim the aurora under text that sits over the window).
export const SHOTS = Object.freeze({
  // wide: the type sits in the sky of the upper-left panes, the aurora dimmed under it
  wide: { section: 11, glass: 1, text: { land: 'wide', port: 'bottom' }, skyQuiet: { land: true, port: false } },
  desk: { section: 14, glass: 1, text: { land: 'desk', port: 'top' }, skyQuiet: { land: false, port: true } },
  instrument: { section: 12, glass: 0.5, text: { land: 'instrument', port: 'top' }, skyQuiet: { land: false, port: true } },
  bed: { section: 16, glass: 1, text: { land: 'bed', port: 'top' }, skyQuiet: { land: false, port: false } },
  wall: { section: 15, glass: 1, text: { land: 'wall', port: 'bottom' }, skyQuiet: { land: false, port: false } },
  screens: { section: 13, glass: 1, text: { land: 'screens', port: 'top' }, skyQuiet: { land: true, port: true } },
});

export const SHOT_IDS = Object.freeze(Object.keys(SHOTS));
export const BLENDER_SHOT_IDS = Object.freeze(Object.keys(BLENDER_CAMERAS));
export const DEFAULT_SHOT = 'wide';

/** Use the window size, not the shot, to choose the layout. */
export function layoutFor(w, h) {
  return w / h < 0.8 ? 'port' : 'land';
}

/** Blender horizontal field of view (radians) of a lens on the 36 mm sensor, landscape frame. */
export function blenderHfov(lens) {
  return 2 * Math.atan(BLENDER_FRAME.sensor / 2 / lens);
}

/**
 * Vertical fov (degrees) that shows Blender's whole 16:9 frame in a viewport
 * of the given aspect ("contain"): narrower viewports keep Blender's
 * horizontal fov (and show a little more above and below), wider ones keep
 * its vertical fov.
 */
export function containVfov(lens, aspect) {
  const tanH = Math.tan(blenderHfov(lens) / 2);
  const bAspect = BLENDER_FRAME.w / BLENDER_FRAME.h;
  const tanV = aspect >= bAspect ? tanH / bAspect : tanH / aspect;
  return (2 * Math.atan(tanV)) / DEG;
}

/**
 * Camera spec for a shot and layout: { pos, tgt (three, Y-up), vfov (deg),
 * aperture (m, 0 = no DOF), focus (m or 'armillary') }.
 */
export function cameraSpec(shotId, layout, aspect) {
  const land = BLENDER_CAMERAS[shotId] || EXTRA_LAND[shotId];
  if (!land) throw new Error(`unknown shot ${shotId}`);
  const aperture = land.fstop > 0 ? land.lens / 1000 / land.fstop : 0; // entrance pupil diameter (m)
  if (layout === 'port') {
    const p = PORTRAIT[shotId];
    return { pos: b2t(p.loc), tgt: b2t(p.tgt), vfov: p.vfov, aperture, focus: land.focus };
  }
  return { pos: b2t(land.loc), tgt: b2t(land.tgt), vfov: containVfov(land.lens, aspect), aperture, focus: land.focus };
}

/** Apply a camera spec to a PerspectiveCamera (aspect must already be set). */
export function applyCamera(camera, spec) {
  camera.fov = spec.vfov;
  camera.position.fromArray(spec.pos);
  camera.up.set(0, 1, 0);
  camera.lookAt(spec.tgt[0], spec.tgt[1], spec.tgt[2]);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  return camera;
}

/** A ready camera for a shot (Node checks and main.js). */
export function makeCamera(shotId, w, h) {
  const layout = layoutFor(w, h);
  const camera = new THREE.PerspectiveCamera(50, w / h, 0.05, 150);
  return applyCamera(camera, cameraSpec(shotId, layout, w / h));
}

/** Project a Blender-space point through a camera: { x, y } in NDC, z > 1 behind. */
export function projectBlender(camera, pBlender) {
  const v = new THREE.Vector3().fromArray(b2t(pBlender)).project(camera);
  return { x: v.x, y: v.y, z: v.z };
}

// ---------------------------------------------------------------- the sky
// The live sky (sketches/sky/sky.js) is a backdrop at infinity in three's
// world frame. The window walls face three -X (left, Blender x = -5) and -Z
// (back-left, Blender y = 7); sky.js azimuth runs from -Z toward +X, so the
// back window is around 0 and the left window around -90 degrees.
export const SKY = Object.freeze({
  seed: 7,
  // still frames are deterministic: this time is used for every ?shot= frame
  stillTime: 24,
  galaxy: 0.75,
  aurora: 0.85,
  nebula: 0,
  stars: 0.9,
  horizon: 1,
  exposure: 1,
  // aurora arc: nearest point toward the back-left panes (the wide shot sees
  // sky between azimuth -90 and -11 degrees), 220 km out with its hem a few
  // degrees over the mountains, so the curtains rise behind the far skyline
  // and leave dark, starry sky above them (checked offscreen with
  // sketches/sky/tools/render.py)
  auroraFrame: { azimuth: -0.44, distance: 2.2, spacing: 1.6, span: 1.3, base: 0.45, decay: 0.45, folds: 0.28, phase: 2.6 },
  // the Milky Way rises from behind the left coast through the back panes,
  // behind the aurora; directions are three world space, (x, y, z):
  // (sin az cos el, sin el, -cos az cos el)
  galaxyA: [-0.574, 0.0, -0.819], // azimuth -35, on the horizon
  galaxyB: [-0.112, 0.766, -0.633], // azimuth -10, 50 degrees up
  galaxyCore: [-0.639, -0.105, -0.762], // the core just under the horizon (behind the mountains)
  galaxyShape: { width: 0.08, coreLength: 0.75, dust: 0.9 },
  heroes: [
    { dir: [-0.42, 0.52, -0.74], flux: 0.6, color: '#c9d6ff' },
    { dir: [-0.88, 0.3, 0.36], flux: 0.42, color: '#fff1dc' },
  ],
});
