// The seven frames. Each shot is a function of (shot, viewport): a scene
// state plus a camera for wide windows ("land") and one for narrow windows
// ("port"); a layout may override parts of the state (stone arm angles).
// Cameras either orbit a target (az/el in degrees, world angle convention of
// layout.js, dist in world units) or give pos + target. fov is vertical.
// shift moves the target off centre on screen (fractions; +x right, +y down).
// Lights are [azimuth, elevation] toward the light. Fog is [near, far] in
// world units from the camera.

const D = Math.PI / 180;
const deg = (list) => list.map((a) => (a == null ? null : a * D));

// Where the planets rest when the whole instrument is shown.
const ARMS_STONES = deg([320, 190, 0, 290, 160, 235, 30]);
const ARMS_STONES_PORT = deg([80, 150, 295, 245, 115, 280, 55]);

export const SHOTS = {
  // A tooth of the pinion and the crank, lit from behind: near darkness.
  hero: {
    state: { stage: 'gears', crank: 150 * D, accent: 'crank', ground: { on: false } },
    light: { key: [177, 13], keyI: 0.95, fill: [66, 24], fillI: 0.12, amb: 0.0, rim: 0.18 },
    look: { inkScale: 1, darkScale: 0.55, spacing: 4.6, outline: 0.58 },
    shadow: { center: [2.0, 0.3, 0.76], radius: 1.25 },
    land: {
      cam: { pos: [2.778, 0.17, 0.682], target: [1.779, 0.364, 0.63], fov: 40, shift: [0.24, 0.02] },
      fog: [0.75, 2.7],
    },
    port: {
      cam: { pos: [3.146, 0.2, 0.644], target: [2.147, 0.584, 0.696], fov: 50, shift: [0.06, 0.06] },
      fog: [1.1, 3.1],
    },
  },
  // Three gears in mesh, the train alone before the machine is assembled.
  experiments: {
    state: { stage: 'gears', base: false, crank: 300 * D, accent: 'crank', ground: { on: true, fade: [1.2, 2.5], center: [1.3, 0.5], albedo: 0.5 } },
    light: { key: [182, 48], keyI: 0.95, fill: [20, 30], fillI: 0.14, amb: 0.02, rim: 0.2 },
    look: { inkScale: 1, darkScale: 0.7, spacing: 4.8 },
    shadow: { center: [1.1, -0.2, 0.5], radius: 2.8 },
    land: {
      cam: { target: [1.05, 0.12, 0.45], az: -38, el: 40, dist: 5.0, fov: 30, shift: [0.25, 0.02] },
      fog: [4.6, 10.0],
    },
    port: {
      cam: { target: [1.05, 0.12, 0.45], az: -38, el: 48, dist: 8.2, fov: 34, shift: [0.0, 0.15] },
      fog: [7.4, 13.0],
    },
  },
  // 1:2:4 seen from above, filling the frame behind the word.
  repeat: {
    state: { stage: 'gears', base: false, crank: 30 * D, accent: 'crank', ground: { on: false } },
    light: { key: [150, 36], keyI: 0.9, fill: [-30, 50], fillI: 0.12, amb: 0.04, rim: 0.1 },
    look: { inkScale: 0.5, darkScale: 0.5, spacing: 4.8, outline: 0.55 },
    shadow: { center: [1.0, 0.0, 0.5], radius: 2.6 },
    land: {
      cam: { target: [0.95, 0.06, 0.5], az: -111, el: 84, dist: 4.0, fov: 30 },
      fog: [20, 40],
    },
    port: {
      cam: { target: [1.0, 0.06, 0.5], az: -21, el: 84, dist: 6.1, fov: 34 },
      fog: [20, 40],
    },
  },
  // One arm reaching out to the Research sphere; one isoline is orange.
  research: {
    state: {
      stage: 'full', crank: 20 * D, tau: 40 * D, accent: 'contour:2',
      arms: deg([140, 110, 0, 200, 170, 230, 125]), hoopYaw: deg([null, null, 85]),
      ground: { on: true, fade: [4, 9] },
    },
    light: { key: [185, 35], keyI: 1.0, fill: [300, 10], fillI: 0.12, amb: 0.02, rim: 0.3 },
    look: { inkScale: 1, darkScale: 0.72, spacing: 4.8 },
    shadow: { center: [1.9, 2.2, 0.0], radius: 2.8 },
    land: {
      cam: { pos: [0.35, 2.15, 2.4], target: [2.65, 2.45, 0.0], fov: 31, shift: [0.21, 0.0] },
      fog: [4.0, 8.5],
    },
    port: {
      cam: { pos: [-0.9, 2.1, 2.7], target: [2.65, 2.45, 0.0], fov: 36, shift: [0.06, 0.13] },
      fog: [4.6, 9.0],
    },
  },
  // The whole instrument, all seven spheres.
  stones: {
    state: { stage: 'full', crank: 70 * D, tau: 70 * D, accent: 'crank', arms: ARMS_STONES, orbits: true, ground: { on: true, fade: [5.5, 11] } },
    light: { key: [225, 40], keyI: 1.0, fill: [330, 20], fillI: 0.14, amb: 0.02, rim: 0.22 },
    look: { inkScale: 1, darkScale: 0.7, spacing: 4.6 },
    shadow: { center: [0, 1.6, 0], radius: 6.6 },
    land: {
      cam: { target: [0, 1.85, 0], az: -90, el: 18, dist: 14.2, fov: 30, shift: [0, -0.03] },
      fog: [13, 27],
    },
    port: {
      state: { arms: ARMS_STONES_PORT },
      cam: { target: [0, 1.6, 0], az: -90, el: 56, dist: 17, fov: 44 },
      fog: [16, 30],
    },
  },
  // About hovered: its arm swings forward, its ring turns orange.
  stone: {
    state: {
      stage: 'full', crank: 95 * D, tau: 85 * D, accent: 'hoop:0',
      arms: deg([258, 190, 0, 290, 160, 200, 30]), hoopYaw: deg([117]),
      ground: { on: true, fade: [4, 10] },
    },
    light: { key: [200, 38], keyI: 1.0, fill: [320, 15], fillI: 0.13, amb: 0.02, rim: 0.32 },
    look: { inkScale: 1, darkScale: 0.72, spacing: 4.8 },
    shadow: { center: [-1.0, 2.0, 4.7], radius: 1.6 },
    land: {
      cam: { target: [-1.008, 2.222, 4.744], az: -118, el: 10, dist: 2.75, fov: 28, shift: [0.18, 0.02] },
      fog: [3.1, 5.0],
    },
    port: {
      cam: { target: [-1.008, 2.222, 4.744], az: -118, el: 12, dist: 3.6, fov: 34, shift: [0.04, 0.16] },
      fog: [3.9, 5.9],
    },
  },
  // Contact: the rings closed into one sealed sphere, arms folded behind.
  contact: {
    state: {
      stage: 'full', crank: 130 * D, tau: 110 * D, sealed: true, accent: 'seam',
      arms: deg([92, 70, 106, 76, 82, 72, 90]),
      ground: { on: true, fade: [4, 10] },
    },
    light: { key: [200, 35], keyI: 0.95, fill: [320, 15], fillI: 0.12, amb: 0.02, rim: 0.3 },
    look: { inkScale: 1, darkScale: 0.72, spacing: 4.8 },
    shadow: { center: [0, 2.5, 0], radius: 4.2 },
    land: {
      cam: { target: [0, 3.25, 0], az: -100, el: 3, dist: 8.0, fov: 30, shift: [0.2, 0.02] },
      fog: [7.6, 11.5],
    },
    port: {
      cam: { target: [0, 3.0, 0], az: -100, el: 4, dist: 10.5, fov: 34, shift: [0, 0.17] },
      fog: [10.5, 15],
    },
  },
};

export const SHOT_IDS = Object.keys(SHOTS);

// Layout follows the window, not the shot.
export function layoutFor(w, h) {
  return w / h < 0.82 ? 'port' : 'land';
}

export function resolveShot(id, layout) {
  const s = SHOTS[id];
  const L = s[layout];
  return {
    id,
    layout,
    state: { ...s.state, ...(L.state || {}) },
    cam: L.cam,
    fog: L.fog,
    light: s.light,
    look: s.look,
    shadow: L.shadow || s.shadow,
  };
}

export function cameraPose(cam) {
  if (cam.pos) return { position: cam.pos, target: cam.target };
  const az = cam.az * D;
  const el = cam.el * D;
  const t = cam.target;
  const ce = Math.cos(el);
  return {
    position: [t[0] + cam.dist * ce * Math.cos(az), t[1] + cam.dist * Math.sin(el), t[2] - cam.dist * ce * Math.sin(az)],
    target: t,
  };
}
