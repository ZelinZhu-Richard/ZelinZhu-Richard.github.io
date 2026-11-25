// The eleven storyboard stills. Each shot is a function of (shot, viewport):
// a world (which parts exist, how they are inked), a build state for the
// instrument, lights, and one camera per layout ("land" for wide windows,
// "port" for narrow ones); a layout may override parts of the state.
//
// Cameras orbit a target (az/el in degrees, world angle convention of
// layout.js, dist in world units), give pos + target, or are `ortho`
// (plan view of the plate; k = CSS px per unit). fov is vertical. shift
// moves the target off centre on screen (fractions; +x right, +y down).
// Lights: key [azimuth, elevation] toward the light, or `lamp: true` for the
// desk lamp (point light with a cone). Fog is [near, far] from the camera.
//
// Space frames (final, final-hover, contact) sit in front of the procedural
// sky (backdrop.js): `sky` places the galaxy band (through two screen NDC
// points, core toward a third), a small nebula and a few spike stars, seen
// through a sky camera of `fov`. Their solids are filled deep indigo so they
// hide the sky, and their accent is amber (the crank) or aurora green (the
// hovered ring); the earlier frames keep the burnt-orange accent.
//
// look.macro: footprint thresholds (world units per CSS px) under which a
// surface is drawn as near metal instead of engraving (materials.js); off
// unless a shot sets it. finish: the film pass (finish.js), per shot.

import { BUILDS, ROOM, lampFrame } from './layout.js';

const D = Math.PI / 180;
const deg = (list) => list.map((a) => (a == null ? null : a * D));

// Where the seven spheres rest on the last screen, for the larger framing
// of the second review (searched against the rules check.mjs tests: every
// sphere in frame and at least 20 px from the next, clear of the armillary,
// the column and the band; each label has a place off the spheres, the
// armillary, the crank, the base and the column; About can swing forward
// for the hover without crossing the hover text).
export const ARMS_FINAL = deg([196, 152, 293, 190, 246, 15, 18]);
export const ARMS_FINAL_PORT = deg([296, 165, 268, 311, 234, 94, 41]);
// the dissolve keeps the arms where they were before the final framing
const ARMS_DISSOLVE = deg([187, 207, 308, 179, 23, 314, 13]);
const ARMS_DISSOLVE_PORT = deg([283, 200, 327, 145, 223, 67, 14]);
// About swung forward, toward the viewer, for the hover state.
const HOVER = (arms, a) => arms.map((v, i) => (i === 0 ? a * D : v));
const HOVER_LAND = 294;
const HOVER_PORT = 282;

// The last screen's cameras. Land: the whole instrument fills 80 percent of
// the frame height (meridian ring to feet), right of centre, the lower left
// kept for the hover text; port: as large as the labels allow (at dist 17;
// closer, some label finds no free place off the spheres, arms and base).
const CAM_FINAL = {
  land: { target: [0, 2.4, 0], az: -90, el: 15, dist: 16.3, fov: 30, shift: [0.09, -0.035] },
  port: { target: [0, 1.9, 0], az: -90, el: 60, dist: 17, fov: 46, shift: [0, 0.12] },
};
const FOG_FINAL = { land: [14.5, 29.5], port: [15, 30] };

const LAMP = lampFrame();

const INK = (ink = 1, dark = 0.7, outline = 1) => ({ ink, dark, outline });

const AMBER = '#ffb469';
const AURORA = '#39f0a6';
// deep indigo fill (hides the sky), a darker shadow fill, and shadow-side
// ink leaning slightly cool toward the sky
const SPACE = { night: '#0b0a14', stage: '#09080f', shade: '#9ea0ae' };

// The sky for the last screen: the band across the top-left corner, clear
// of the instrument and every label; a small nebula top right; two spike
// stars. Portrait: the band across the empty top of the frame.
const SKY_FINAL = {
  land: {
    fov: 52,
    galaxy: { a: [-1.15, 0.4], b: [-0.46, 1.15], core: [-1.7, 0.05], width: 0.08, coreLength: 0.7, dust: 1, amount: 0.9 },
    nebula: { at: [0.8, 0.78], radius: 0.07, roll: 0.6, amount: 0.55 },
    heroes: [{ at: [-0.27, 0.84], flux: 0.75, color: '#9fc0ff' }, { at: [0.9, -0.74], flux: 0.4, color: '#ffd6a8' }],
  },
  port: {
    fov: 64,
    galaxy: { a: [-1.2, 0.52], b: [1.2, 0.98], core: [-1.9, 0.4], width: 0.08, coreLength: 0.7, dust: 1, amount: 0.9 },
    nebula: { at: [0.64, 0.56], radius: 0.06, roll: 0.4, amount: 0.5 },
    heroes: [{ at: [-0.62, 0.34], flux: 0.6, color: '#9fc0ff' }],
  },
};

export const SHOTS = {
  // §0 Night. One orange point; the plate's centre before the plate exists.
  point: {
    build: 'empty',
    world: { plate: null, dot: 'centre' },
    light: null,
    look: {},
    land: { cam: { ortho: true, k: 147, target: [0, 0, 0], shift: [0.124, 0] }, fog: [90, 100] },
    port: { cam: { ortho: true, k: 108, target: [0, 0, 0], shift: [0, 0.108] }, fog: [90, 100] },
  },
  // §2 The draughtsman's plate: completely flat.
  plate: {
    build: 'empty',
    state: { crank: 300 * D },
    world: { plate: 'plate', dot: 'centre' },
    light: null,
    // a bigger page (the wheel 55 percent of the height) drawn with heavier
    // lines, so the limb, the rete and its flames read at a glance
    look: { plate: INK() },
    finish: { glow: 0.12 },
    land: { cam: { ortho: true, k: 220, target: [0, 0, 0], shift: [0.124, 0] }, fog: [90, 100] },
    port: { cam: { ortho: true, k: 114, target: [0, 0, 0], shift: [0, 0.108] }, fog: [90, 100] },
  },
  // §3 The camera tilts; the gear rises off the sheet, its drawing stays.
  lift: {
    build: 'one',
    state: { crank: 300 * D },
    world: { plate: 'ghost', lift: 1.3, dot: 'centre', projections: [208, 332, 118] },
    light: { key: [128, 58], keyI: 1.0, fill: [20, 25], fillI: 0.12, amb: 0.03, rim: 0.22 },
    look: { inst: INK(1, 0.7), plate: INK(1, 1, 1), spacing: 3.6 },
    shadow: { center: [0.4, 0.6, 0], radius: 3.2 },
    finish: { glow: 0.16 },
    land: {
      cam: { target: [0.35, 0.7, 0.0], az: -90, el: 36, dist: 9, fov: 30, shift: [0.2, 0.03] },
      fog: [11.2, 17.8],
    },
    port: {
      cam: { target: [0, 0.6, 0.3], az: -90, el: 40, dist: 13.5, fov: 34, shift: [0, 0.12] },
      fog: [17, 27],
    },
  },
  // §6 Macro, deep in the train: a low raking camera in the notch between
  // the idler and the pinion, a few huge tooth flanks, one meshing contact
  // in focus where a small orange glint marks the bearing teeth (the one
  // accent). Up close the parts are machined metal, not hatching: clean
  // tone, brushing along the flanks, lit chamfers on every tooth edge.
  // Fog takes everything past a hand's breadth, so the whole cannot be read.
  inside: {
    build: 'train',
    // the crank arm points off to the side, out of frame, so nothing
    // crosses the type and the whole stays unreadable
    state: { crank: 64 * D, accent: 'contact' },
    world: {},
    light: { key: [150, 26], keyI: 1.05, fill: [20, 12], fillI: 0.2, amb: 0.02, rim: 0.34 },
    look: { inst: INK(1, 0.75, 0.95), spacing: 3.6, macro: [0.004, 0.008] },
    finish: { glow: 0.3 },
    shadow: { center: [1.5, 0.05, 0.5], radius: 0.9 },
    land: {
      cam: { pos: [2.052, 0.155, 0.746], target: [1.518, 0.065, 0.42], fov: 34, shift: [0.12, -0.02] },
      fog: [0.62, 1.9],
    },
    // portrait: turned toward the idler so the jewel sits behind the
    // contact instead of beside it; the idler's teeth stack up in front
    port: {
      cam: { pos: [1.909, 0.17, 1.212], target: [1.518, 0.065, 0.42], fov: 52, shift: [0.06, 0.12] },
      fog: [0.72, 2.4],
    },
  },
  // §9 False space: a crescent planet, a small moon, faint orbits and
  // stars. It is the armillary's globe in a dark room before a window; the
  // one orange star is the lamp filament, just warming.
  falsespace: {
    build: 'desk',
    state: { crank: 40 * D, tau: 30 * D },
    world: { desk: 'dark', stars: true, dust: 'room', dot: 'filament' },
    light: { key: [60, 25], keyI: 0.95, fill: [270, 5], fillI: 0.0, amb: 0.0, rim: 0.12 },
    look: { inst: INK(0.75, 0.4, 0.22), spacing: 3.6 },
    shadow: { center: [0, 3.6, 0], radius: 1.6 },
    land: {
      cam: { pos: [1.3, 2.9, 3.6], target: [-0.15, 4.0, -0.6], fov: 34, shift: [0.1, 0.0] },
      fog: [4.0, 9.0],
    },
    port: {
      cam: { pos: [2.5, 2.6, 3.6], target: [-0.39, 4.31, -0.1], fov: 52, shift: [0, 0.06] },
      fog: [4.4, 9.4],
    },
  },
  // §11 The reveal, wide: desk edge, window with stars and aurora, the lamp
  // on, the half-built instrument, the four objects.
  desk: {
    build: 'desk',
    state: { crank: 70 * D, tau: 40 * D },
    world: { desk: 'lit', deskAccent: 'filament', stars: true },
    light: { lamp: true, keyI: 1.4, range: 9, cone: [76, 32], fill: [95, 12], fillI: 0.1, amb: 0.012, rim: 0.2 },
    look: { inst: INK(1, 0.7), desk: INK(1, 0.75), spacing: 3.6 },
    shadow: { from: 'lamp', center: [0.4, -0.2, 1.6], fov: 118, near: 0.6, far: 30 },
    land: {
      cam: { pos: [1.4, 4.1, 18.5], target: [1.15, 1.0, -1.0], fov: 37, shift: [0, -0.02] },
      fog: [22, 44],
    },
    port: {
      cam: { pos: [-4.1, 5.8, 29.65], target: [0.3, 0.1, 1.81], fov: 52, shift: [0, 0.12] },
      fog: [30, 54],
    },
  },
  // §15 Object: the balance weighing answer A against answer B. Its two
  // pans are the instrument's two newest spheres behind it.
  'object-scale': {
    build: 'partial',
    state: { crank: 95 * D, tau: 55 * D, arms: deg([0, 15, 335, 0, 0, 0, 70]) },
    world: { desk: 'lit', deskAccent: 'pointer', stars: true, deskShow: { dust: false } },
    light: { lamp: true, keyI: 1.45, range: 16, cone: [95, 50], fill: [95, 14], fillI: 0.12, amb: 0.015, rim: 0.26 },
    look: { inst: INK(0.9, 0.6, 0.85), desk: INK(1, 0.75), spacing: 3.6 },
    shadow: { from: 'lamp', center: [6.0, 0.6, -2.0], fov: 100, near: 0.6, far: 30 },
    land: {
      cam: { pos: [14.4, 3.39, 6.35], target: [7.77, 2.24, -2.74], fov: 34, shift: [0.183, -0.015] },
      fog: [11.5, 22],
    },
    port: {
      cam: { pos: [14.4, 3.39, 6.35], target: [7.77, 2.24, -2.74], fov: 46, shift: [0.028, 0.087] },
      fog: [12, 26],
    },
  },
  // §17 The lamp clicks off; the room thins to broken outlines; the stars
  // from the window are all around the finished instrument.
  dissolve: {
    build: 'full',
    state: { crank: 150 * D, tau: 80 * D, accent: 'crank', arms: ARMS_DISSOLVE },
    world: { desk: 'ghost', stars: true },
    light: { key: [222, 34], keyI: 1.0, fill: [330, 18], fillI: 0.13, amb: 0.02, rim: 0.24 },
    look: { inst: INK(1, 0.7), desk: { ink: 0, dark: 0, outline: 0.55, drop: 0.46, widthK: 0.62 }, spacing: 3.6 },
    shadow: { center: [0, 1.6, 0], radius: 6.4 },
    land: {
      cam: { pos: [1.4, 4.6, 19.5], target: [0.9, 1.3, -0.6], fov: 37, shift: [0.1, -0.02] },
      fog: [26, 50],
    },
    port: {
      state: { crank: 40 * D, arms: ARMS_DISSOLVE_PORT },
      cam: { pos: [1.0, 9.0, 26.0], target: [0.6, 1.7, -0.4], fov: 48, shift: [0, 0.1] },
      fog: [30, 54],
    },
  },
  // §18 The last screen: the whole instrument afloat in front of the
  // galaxy, seven engraved spheres on seven arms, labelled in full ink on
  // leaders that end on their spheres. On a wide screen the object fills 80
  // percent of the frame height from the meridian ring to the feet (61
  // before this round) and 73 from the ring to the dial's front edge; the
  // amber crank is the one accent. CAM_FINAL.land.dist sets the size.
  final: {
    build: 'full',
    state: { crank: 70 * D, tau: 70 * D, accent: 'crank', arms: ARMS_FINAL },
    world: { sky: true, labels: true },
    palette: SPACE,
    accentColor: AMBER,
    light: { key: [225, 40], keyI: 1.0, fill: [330, 20], fillI: 0.14, amb: 0.02, rim: 0.24 },
    look: { inst: INK(1, 0.7), spacing: 3.6 },
    shadow: { center: [0, 1.8, 0], radius: 6.8 },
    land: {
      cam: CAM_FINAL.land,
      fog: FOG_FINAL.land,
      sky: SKY_FINAL.land,
    },
    port: {
      state: { arms: ARMS_FINAL_PORT },
      cam: CAM_FINAL.port,
      fog: FOG_FINAL.port,
      sky: SKY_FINAL.port,
    },
  },
  // §18 hover: About's arm swings forward and its ring turns aurora green.
  'final-hover': {
    build: 'full',
    state: { crank: 70 * D, tau: 70 * D, accent: 'hoop:0', arms: HOVER(ARMS_FINAL, HOVER_LAND), hoopYaw: deg([262]) },
    world: { sky: true },
    palette: SPACE,
    accentColor: AURORA,
    light: { key: [225, 40], keyI: 1.0, fill: [330, 20], fillI: 0.14, amb: 0.02, rim: 0.26 },
    look: { inst: INK(1, 0.7), spacing: 3.6 },
    shadow: { center: [0, 1.8, 0], radius: 6.8 },
    land: {
      cam: CAM_FINAL.land,
      fog: FOG_FINAL.land,
      sky: SKY_FINAL.land,
    },
    port: {
      state: { arms: HOVER(ARMS_FINAL_PORT, HOVER_PORT), hoopYaw: deg([255]) },
      cam: CAM_FINAL.port,
      fog: FOG_FINAL.port,
      // the type covers the top here: same band (quieted), no nebula
      sky: { ...SKY_FINAL.port, nebula: null },
    },
  },
  // §19 Contact: the rings closed into one sealed sphere in front of the
  // galaxy; the band runs behind the text (quieted there), the sphere sits
  // over calm sky. The amber seam is the accent.
  contact: {
    build: 'sealed',
    state: { crank: 130 * D, tau: 110 * D, accent: 'seam', arms: deg([92, 70, 106, 76, 82, 72, 90]) },
    world: { sky: true },
    palette: SPACE,
    accentColor: AMBER,
    light: { key: [205, 34], keyI: 0.95, fill: [320, 15], fillI: 0.12, amb: 0.02, rim: 0.3 },
    look: { inst: INK(1, 0.72), spacing: 3.6 },
    shadow: { center: [0, 3.0, 0], radius: 5.4 },
    land: {
      cam: { target: [0, 3.55, 0], az: -100, el: 4, dist: 10.9, fov: 30, shift: [0.2, 0.02] },
      fog: [10.5, 16.5],
      sky: {
        fov: 52,
        galaxy: { a: [-1.1, -0.95], b: [0.02, 1.15], core: [-1.6, -1.5], width: 0.085, coreLength: 0.7, dust: 1, amount: 0.9 },
        nebula: { at: [0.9, 0.84], radius: 0.06, roll: 1.1, amount: 0.5 },
        heroes: [{ at: [-0.08, -0.78], flux: 0.55, color: '#9fc0ff' }],
      },
    },
    port: {
      cam: { target: [0, 3.35, 0], az: -100, el: 5, dist: 14.9, fov: 36, shift: [0, 0.18] },
      fog: [14, 21],
      sky: {
        fov: 64,
        galaxy: { a: [-1.2, 0.4], b: [1.2, 1.0], core: [1.9, 1.2], width: 0.08, coreLength: 0.7, dust: 1, amount: 0.85 },
        // no nebula: the narrow frame has no clear corner for one
        heroes: [{ at: [0.7, -0.08], flux: 0.5, color: '#9fc0ff' }],
      },
    },
  },
};

export const SHOT_IDS = Object.keys(SHOTS);
export const DEFAULT_SHOT = 'point';

// Layout follows the window, not the shot.
export function layoutFor(w, h) {
  return w / h < 0.82 ? 'port' : 'land';
}

export function resolveShot(id, layout) {
  const s = SHOTS[id];
  const L = s[layout];
  const state = { ...(s.state || {}), ...(L.state || {}) };
  if (state.arms === null || state.arms === undefined) state.arms = layout === 'port' ? ARMS_FINAL_PORT : ARMS_FINAL;
  return {
    id,
    layout,
    build: BUILDS[s.build],
    state: { ...state, build: BUILDS[s.build] },
    world: s.world || {},
    cam: L.cam,
    fog: L.fog,
    light: s.light,
    look: s.look || {},
    shadow: L.shadow || s.shadow || null,
    lamp: LAMP,
    sky: s.world?.sky ? L.sky || s.sky || null : null,
    palette: s.palette || null,
    accentColor: s.accentColor || null,
    finish: { ...(s.finish || {}), ...(L.finish || {}) },
  };
}

export function cameraPose(cam) {
  if (cam.ortho) return { position: [cam.target[0], cam.target[1] + 10, cam.target[2]], target: cam.target };
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

export { ROOM };
