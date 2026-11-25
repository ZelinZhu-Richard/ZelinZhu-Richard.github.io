// The story as data: the first full draft of the choreography for all 20 sections
// (STORYBOARD.md, ROOM.md, ART.md's last section). createTimeline(CHOREOGRAPHY) turns it
// into FrameStates. Pure: imports only engine/timeline and ./rig.mjs (no three, no DOM).
//
// Worlds (each act's camera is in its own):
//   plate  instrument units (about 8 cm each), the page on y = 0, the drawn wheel at the
//          origin; the page faces +Y and screen-up is -Z, as in sketches/instrument
//   gears  instrument units, the train on its floor (engine/instrument/layout.js)
//   room   metres, Y up (sketches/room/shots.js, Blender converted with b2t)
//   space  instrument units, the instrument at its own origin
//
// The knobs come first; then the params; then one camera table per act and viewport,
// where each line is one pose to retune by eye. Angles in degrees unless named radians.

import { BEAT_COUNT, SECTIONS } from '../timeline/schedule.js';
import { NOMINAL_ASPECT } from '../timeline/evaluate.js';
import { DEG, b2t, deepFreeze, frameMap, lensVfov, lookRig, orbitRig, orbitSampler, toOrbit } from './rig.mjs';

// ================================================================ the knobs ===

/**
 * 1.25 crank turns per section: crank(u) = CRANK_PHASE + CRANK_PER_U * u, exactly. One
 * pinion revolution takes 0.8 u, so the §7 ride fits inside §7 with room to ease in and out.
 */
export const CRANK_PER_U = 2.5 * Math.PI;

const RIDE_FROM = 7.25;
/**
 * §7 rides one pinion tooth round a full revolution. The pinion turns with the crank
 * (trainLayout: pinion.rot = crank), so for u in [from, to] the camera's azimuth about the
 * pinion axis is crank plus a constant: on land it sits on the tooth opposite the crank arm
 * (toothFromArm degrees), and the arm points away from it. `az` is the camera azimuth at
 * `from` per viewport (degrees).
 */
export const RIDE = Object.freeze({
  from: RIDE_FROM,
  to: RIDE_FROM + (2 * Math.PI) / CRANK_PER_U,
  gear: 'pinion',
  toothFromArm: 180,
  az: Object.freeze({ land: 32, port: -2 }),
  el: 37,
  dist: 0.86,
});

/** Chosen so the land ride sits on RIDE.toothFromArm. Radians, in [0, 2 pi). */
export const CRANK_PHASE = mod((RIDE.az.land - RIDE.toothFromArm) * DEG - CRANK_PER_U * RIDE.from, 2 * Math.PI);

/** How high the plate act lifts the wheel off the page at lift = 1 (sketches/instrument shots.js 'lift'). */
export const PLATE_LIFT_Y = 1.3;

/** The plate's "plan view": a long lens from nearly overhead reads as the flat page. */
export const FLAT = Object.freeze({ fov: 4, el: 89 });

/**
 * Where the room act stands the instrument: origin in room metres, yaw about +Y, metres per
 * unit. From the shipped room's Anchor_Instrument (public/home-assets/room/manifest.json:
 * base centre on the desk top, height 0.414 m, yaw 0.4887 rad) and the instrument's own
 * span (engine/instrument/layout.js: feet at -0.62, meridian top at 5.47 units), exactly as
 * the room act's instrumentFrame() computes it; tests/engine.test.mjs holds the two equal.
 */
export const ROOM_INSTRUMENT = Object.freeze(roomInstrument());

/**
 * The desk frame the close instrument shots (false space, the reveals, the instrument) were
 * first framed against: the armillary of sketches/room. onDesk() carries those shots rigidly
 * from it onto ROOM_INSTRUMENT, so they frame the shipped instrument the same way.
 */
const SKETCH_INSTRUMENT = Object.freeze(sketchInstrument());

/** u at which /contacts/ (contact mode) is drawn: the rings sealed, the labels gone. */
export const CONTACT_U = 19.85;

/**
 * Transition windows [a, b): each ends where the next act's first section starts. The
 * dissolve's own phases (engine/post 'dissolve': the room irises to black round the
 * instrument, then space comes up out of the black) are fractions of its eased t.
 */
const WINDOWS = Object.freeze({ lift: Object.freeze([3.7, 4]), fade: Object.freeze([8.72, 9]), dissolve: Object.freeze([17.2, 18]) });

// ================================================================ sections ===

export const ACTS = Object.freeze(['plate', 'gears', 'room', 'space']);

export const TRANSITIONS = Object.freeze([
  // the camera dives off the page into the lifted wheel's teeth; the macro world fades in
  Object.freeze({ from: 'plate', to: 'gears', u: WINDOWS.lift, kind: 'lift' }),
  // up past the rings into darkness; the dark room (false space) comes up out of it
  Object.freeze({ from: 'gears', to: 'room', u: WINDOWS.fade, kind: 'fade' }),
  // lamp off; the camera pushes in on the instrument against the window while the room goes
  // dark from the edges inward; the window's sky becomes the sky all round
  Object.freeze({ from: 'room', to: 'space', u: WINDOWS.dissolve, kind: 'dissolve' }),
]);

const FRAMES = [
  'Night. One orange point. Nothing else but the name.',
  'The point draws a single ink line; the line closes into a circle.',
  "The drawing fills in like a draughtsman's plate. Still completely flat.",
  'The camera tilts off-axis; the wheel lifts off the paper, its outline left as a ghost.',
  "Macro, inside the main gear's teeth. Dark, close, only metal edges.",
  'A second gear (the idler) slides in and meshes.',
  'The pinion arrives; the train is 1:2:4 and turns with scroll.',
  'The camera rides one pinion tooth round a full revolution.',
  'Rising up the column as the three inner rings arrive, then above them into darkness.',
  'False space: the armillary in a dark room before the window reads as planets and stars.',
  'The lamp warms; the room lights come up: a desk at 3 a.m., the half-built instrument on it.',
  'The room, wide: window with real stars, lamp, the instrument.',
  'The instrument at the centre, unfinished (no arms yet).',
  'The left monitor (model evaluation curves); the fourth ring arrives.',
  'The desk and the middle monitor (ZeroMind); the arms arrive.',
  'The board on the back wall; two spheres arrive.',
  'The bed and the window, northern lights outside; the other spheres arrive.',
  'The lamp clicks off; the room goes dark round the instrument and the window; the stars are all around.',
  'The final frame: the instrument afloat, seven labelled spheres on seven arms.',
  'Contact: the rings close into one sealed sphere among the stars.',
];

/**
 * Per section: its act, the transition that brings that act in (on the act's first section),
 * and what the frame shows.
 */
export const SECTION_PLAN = Object.freeze(SECTIONS.map((s, i) => {
  const enter = TRANSITIONS.find(tr => tr.u[1] === i);
  return Object.freeze({ section: i, id: s.id, act: s.act, enter: enter ? enter.kind : null, frame: FRAMES[i] });
}));

// ================================================================== params ===

/**
 * What build (0..1) has earned at each step, and where it rises. The instrument maps the
 * level to parts; these are the levels the choreography means.
 */
export const BUILD_STAGES = Object.freeze([
  { level: 0.06, u: [3.7, 3.95], part: 'main gear on its engraved floor (it is the lifted wheel)' },
  { level: 0.12, u: [5.1, 5.6], part: 'idler' },
  { level: 0.18, u: [6.1, 6.55], part: 'pinion' },
  { level: 0.24, u: [7.05, 7.35], part: 'crank handle' },
  { level: 0.44, u: [8.0, 8.62], part: 'base and column, then the three inner rings one after another' },
  { level: 0.5, u: [9.0, 9.4], part: 'globe' },
  { level: 0.6, u: [13.1, 13.5], part: 'fourth ring (the loupe lens ring)' },
  { level: 0.7, u: [14.1, 14.5], part: 'the seven arms, retracted (the plotter drum axle)' },
  { level: 0.8, u: [15.1, 15.5], part: 'two spheres (the balance pans)' },
  { level: 1, u: [16.1, 16.8], part: 'the other five spheres (points of light from the window)' },
].map(s => Object.freeze({ ...s, u: Object.freeze(s.u) })));

function buildKeys() {
  /** @type {number[][]} */
  const keys = [[0, 0]];
  let level = 0;
  for (const s of BUILD_STAGES) {
    keys.push([s.u[0], level], [s.u[1], s.level]);
    level = s.level;
  }
  return keys;
}

const UNIT = [0, 1];

/** Every param track; ranges are what the tests hold them to. */
const PARAMS = {
  // plate line drawing: the point's line closes into a circle (to 0.25), then the plate fills in
  draw: { range: UNIT, keys: [[0, 0], [1.08, 0], [1.85, 0.25], [2.1, 0.25], [2.85, 1]] },
  // the wheel off the page
  lift: { range: UNIT, keys: [[0, 0], [3.12, 0], [3.6, 1]] },
  // gears present: the fraction is the next gear sliding in
  train: { range: [0, 3], keys: [[0, 0], [3.05, 0], [3.25, 1], [5.1, 1], [5.6, 2], [6.1, 2], [6.55, 3]] },
  // radians, an exact linear function of u
  crank: { type: 'affine', at0: CRANK_PHASE, perU: CRANK_PER_U, range: [0, Infinity] },
  build: { range: UNIT, keys: buildKeys() },
  // room strips and lamps: on in §10, click off early in §17. The room act splits the ramp
  // (acts/room/classify.js lightLevels): the lamp's filament warms alone first (to 10.3),
  // then the light front runs out from it, the window's outside comes in, and the strips
  // bloom on in turn (desk about 10.4, shelves 10.48, ceiling 10.55, bed 10.6); the
  // monitors wake last (10.65 - 10.93)
  lights: { range: UNIT, keys: [[0, 0], [10, 0], [10.9, 1], [17.06, 1], [17.12, 0]] },
  screens: { range: UNIT, keys: [[0, 0], [10.64, 0], [10.93, 1], [17.06, 1], [17.18, 0]] },
  // northern lights through the window; brightest at the skis (§16); they hold while the lamp
  // goes off and the room darkens round them (§17), and fade as the window's sky becomes
  // space (the space act draws the same aurora, registered, until it is gone); none in space
  aurora: { range: UNIT, keys: [[0, 0], [9.9, 0], [10.8, 0.55], [11.4, 0.8], [15.6, 0.8], [16.3, 1], [16.8, 1], [17.35, 0.9], [17.9, 0]] },
  // the galaxy: faint through the dark window (false space), the room's sky, then all around
  galaxy: { range: UNIT, keys: [[0, 0], [8.75, 0], [9.15, 0.35], [9.9, 0.35], [10.8, 0.75], [17.25, 0.75], [17.95, 1]] },
  // engraved in the plate and the macro, brass in lamplight, engraved again in space: the
  // brass holds while the room is still there to light it, then turns to line work as the
  // instrument floats out (§17's last third)
  // (a declared cut to brass where the room comes in, 8.72, so the desk's instrument is never
  // engraved; the plate and gears acts set their own look and do not read it)
  brass: { range: UNIT, keys: [[0, 0], [8.72, 0], [8.72, 1], [17, 1], [17.55, 1], [17.98, 0]] },
  // the arms extend (and the spheres grow with them) as the instrument floats up
  arms: { range: UNIT, keys: [[0, 0], [17, 0], [17.58, 0], [18, 1]] },
  // stone labels: the final frame only
  stones: { range: UNIT, keys: [[0, 0], [18.02, 0], [18.3, 1], [18.86, 1], [19.1, 0]] },
  contact: { range: UNIT, keys: [[0, 0], [19.1, 0], [19.7, 1]] },
};

/** Param names and declared ranges. */
export const PARAM_RANGES = Object.freeze(Object.fromEntries(Object.entries(PARAMS).map(([k, p]) => [k, Object.freeze(p.range.slice())])));

// ============================================================ the gear train ===
// engine/instrument/layout.js: module 0.045, 48 : 24 : 12 teeth, idler at world angle -40
// from the main gear, pinion at 66 from the idler. dir(a) = (cos a, 0, -sin a).

const MODULE = 0.045;
const dir = a => [Math.cos(a * DEG), 0, -Math.sin(a * DEG)];
const IDLER = scale(dir(-40), ((48 + 24) * MODULE) / 2);
const PINION = add(IDLER, scale(dir(66), ((24 + 12) * MODULE) / 2));

/** Gear landmarks the gears act cameras look at (instrument units). */
export const GEARS = Object.freeze({
  idler: Object.freeze(IDLER),
  pinion: Object.freeze(PINION),
  // pitch point main / idler, a little above the floor
  mainIdler: Object.freeze(add(scale(dir(-40), (48 * MODULE) / 2), [0, 0.06, 0])),
  // the sketch's 'inside' target, near the idler / pinion contact
  inside: Object.freeze([1.518, 0.065, 0.42]),
  // the main wheel's rim where §4 looks at its teeth (world angle -100)
  rim: Object.freeze(add(scale(dir(-100), (48 * MODULE) / 2), [0, 0.05, 0])),
  // pitch point idler / pinion, at the teeth's tops
  idlerPinion: Object.freeze(add(add(IDLER, scale(dir(66), (24 * MODULE) / 2)), [0, 0.07, 0])),
  // the pinion hub top: the ride's centre
  hub: Object.freeze(add(PINION, [0, 0.1, 0])),
});

// =========================================================== plate cameras ===
// sketches/instrument/shots.js: 'point' (ortho, k = 147 / 108 px per unit at 900 / 844 px
// high), 'plate' (k = 220 / 114), 'lift'. An ortho k becomes a frame half-height of
// (height / 2) / k units.

const PLATE_LAND = [
  { u: 0, subject: [0, 0, 0], az: -90, el: FLAT.el, size: 450 / 147, fov: FLAT.fov, shift: [0.124, 0] },
  { u: 0.75, size: 3.0 },
  { u: 1.2, size: 2.85 },
  { u: 1.9, size: 2.3 },
  { u: 2.25, size: 450 / 220 },
  { u: 2.85, size: 2.02 },
  { u: 3.08, el: 87.5, fov: 5 },
];
const PLATE_PORT = [
  { u: 0, subject: [0, 0, 0], az: -90, el: FLAT.el, size: 422 / 108, fov: FLAT.fov, shift: [0, 0.108] },
  { u: 0.75, size: 3.86 },
  { u: 1.2, size: 3.8 },
  { u: 1.9, size: 3.74 },
  { u: 2.25, size: 422 / 114 },
  { u: 2.85, size: 3.66 },
  { u: 3.08, el: 87.5, fov: 5 },
];

// The dive, in the gears world. The plate act flies the same keys with the wheel
// PLATE_LIFT_Y up, and both rigs carry them from 3.45 to 4.4, so over the lift window the
// two cameras interpolate identically and the gears act fades in exactly under the plate.
const DIVE_LAND = [
  { u: 3.45, subject: [0.35, 0.7 - PLATE_LIFT_Y, 0], az: -90, el: 36, dist: 9, fov: 30, shift: [0.2, 0.03] }, // 'lift'
  { u: 3.62, subject: [0.4, 0.75 - PLATE_LIFT_Y, 0.05], az: -94, el: 33, dist: 8.4, fov: 30, shift: [0.19, 0.02] },
  { u: 3.82, subject: [0.7, -0.05, 0.5], az: -112, el: 22, dist: 2.2, fov: 32, shift: [0.15, 0] },
  // a macro lens over the plate, 26 to 30 degrees up and far enough back that a dozen of the
  // main wheel's teeth cross the frame (the act's depth of field keeps a few of them sharp)
  { u: 4, subject: [0.12, 0.03, 0.9], az: -116, el: 25, dist: 1.6, fov: 33, shift: [0.13, -0.02] },
  { u: 4.4, subject: GEARS.rim, az: -72, el: 30, dist: 1.22, shift: [0.12, -0.04] },
];
const DIVE_PORT = [
  { u: 3.45, subject: [0, 0.6 - PLATE_LIFT_Y, 0.3], az: -90, el: 40, dist: 13.5, fov: 34, shift: [0, 0.12] }, // 'lift'
  { u: 3.62, subject: [0.05, 0.62 - PLATE_LIFT_Y, 0.32], az: -93, el: 37, dist: 12.6, fov: 34, shift: [0, 0.12] },
  { u: 3.82, subject: [0.65, -0.1, 0.5], az: -110, el: 24, dist: 2.8, fov: 44, shift: [0.04, 0.12] },
  { u: 4, subject: [0.12, 0.03, 0.9], az: -113, el: 28, dist: 1.95, fov: 50, shift: [0.03, 0.12] },
  { u: 4.4, subject: GEARS.rim, az: -76, el: 34, dist: 1.55, fov: 52, shift: [0, 0.12] },
];

// =========================================================== gears cameras ===
// §4-5 from the front-left of the main / idler contact (clear of where the idler slides in),
// over the idler in §6 down to the sketch's 'inside' macro, the ride in §7, then up the
// column to the rings in §8. Every pose was checked to sit outside the gears' tip circles
// or above their tops; sampled every 0.0026 u, the camera keeps 0.065 units from the
// nearest part (the main wheel's teeth at u 4.72, land), against a near plane of 0.008.

/** @param {'land' | 'port'} vp */
function gearKeys(vp) {
  const L = vp === 'land';
  const az0 = RIDE.az[vp];
  return [
    ...(L ? DIVE_LAND : DIVE_PORT),
    // §4: a slow push along the main wheel's rim
    { u: 4.85, subject: GEARS.rim, az: L ? -68 : -72, el: L ? 31 : 35, dist: L ? 1.12 : 1.45 },
    // §5: the lens pans right to the main / idler pitch point as the idler slides in from the
    // right and meshes (train 1 -> 2 over 5.1 - 5.6): main wheel left, idler right
    { u: 5.3, subject: GEARS.mainIdler, az: L ? -118 : -112, el: L ? 33 : 37, dist: L ? 1.42 : 1.8, shift: L ? [0.08, -0.05] : [0, 0.1] },
    { u: 5.75, subject: GEARS.mainIdler, az: L ? -126 : -120, el: L ? 34 : 38, dist: L ? 1.3 : 1.68 },
    // §6: over the idler and down beside the idler / pinion pitch point as the pinion arrives
    // (train 2 -> 3 over 6.1 - 6.55): idler left, pinion right, the main wheel beyond in the blur
    { u: 6.08, subject: [1.25, 0.08, 0.72], az: L ? -82 : -95, el: L ? 46 : 48, dist: L ? 1.35 : 1.7, shift: L ? [0.06, -0.04] : [0, 0.1] },
    { u: 6.42, subject: GEARS.idlerPinion, az: L ? -34 : -62, el: L ? 33 : 35, dist: L ? 1.16 : 1.5, shift: L ? [0.1, -0.05] : [0, 0.1] },
    { u: 6.7, subject: GEARS.idlerPinion, az: L ? -30 : -59, el: L ? 33 : 35, dist: L ? 1.1 : 1.45 },
    { u: 7, subject: GEARS.idlerPinion, az: L ? -27 : -57, el: L ? 34 : 36, dist: L ? 1.06 : 1.42 },
    // the ride: every channel linear, the azimuth exactly crank + a constant
    { u: RIDE.from, subject: GEARS.hub, az: az0, el: RIDE.el + (L ? 0 : 2), dist: L ? RIDE.dist : 1.05, fov: L ? 40 : 52, shift: L ? [0.1, -0.02] : [0, 0.1], ease: 'linear' },
    { u: RIDE.to, az: az0 + 360 },
    // §8: up the column, the rings arriving one after another; the climb ends level with the
    // armillary, looking at its rings (centre y 3.95, horizon ring r 1.74) from outside them
    // while the light goes
    // §8: back and up off the train as the base and the column arrive, then low beside the
    // column looking UP through the armillary as its rings arrive one after another: out of
    // the machine room into a dark sky of rings (centre y 3.95, meridian R 1.5, horizon r 1.74)
    { u: 8.3, subject: [0.3, 0.75, 0.1], az: az0 + 425, el: L ? 22 : 24, dist: L ? 2.0 : 2.5, fov: L ? 40 : 52, shift: L ? [0.08, 0] : [0, 0.1] },
    { u: 8.44, subject: [0.2, 0.95, 0.05], az: az0 + 448, el: L ? 13 : 15, dist: L ? 2.6 : 3.2, fov: L ? 42 : 54, shift: L ? [0.07, 0] : [0, 0.08] },
    { u: 8.6, subject: [0, 3.5, 0], az: az0 + 480, el: L ? -19 : -17, dist: L ? 3.1 : 3.8, fov: L ? 44 : 56, shift: L ? [0.07, 0] : [0, 0.1] },
    { u: 8.8, subject: [0, 3.85, 0], az: az0 + 496, el: L ? -22 : -20, dist: L ? 3.3 : 4.0, shift: L ? [0.08, 0] : [0, 0.12] },
    { u: 9, subject: [0, 4, 0], az: az0 + 502, el: L ? -23 : -21, dist: L ? 3.5 : 4.2, shift: L ? [0.08, 0] : [0, 0.14] },
  ];
}

/** @param {any} key @param {number} dy */
const raised = (key, dy) => ({ ...key, subject: [key.subject[0], key.subject[1] + dy, key.subject[2]] });

// =========================================================== room cameras ===
// Shots in room metres (three, Y up). Copied ones note their source in sketches/room/
// shots.js (BLENDER_CAMERAS / PORTRAIT, in Blender coordinates there). Land fovs follow
// Blender's lens at the nominal 1440 x 900 frame (containVfov). `drift` moves the camera and
// `pan` the target over a held shot: key = shot + f * drift (f from the sequence).

const LAND_ASPECT = NOMINAL_ASPECT.land;
// Shots marked onDesk() frame the instrument itself and follow it when its desk anchor moves.
// Shots marked nearInstrument() are offsets (room axes, metres) from the shipped armillary's
// centre (ROOM_INSTRUMENT): they frame it against the window, which does not turn with it.
//  - falsespace (§9): low under the horizon ring, close, looking up past the globe and a
//    bead (the planets) at the window's middle pane: only sky behind (no mullion, coast,
//    skyline or sea from 8.72 to 9.75 on land; on phones the lamp's dark shade touches the
//    top corner), the text's side (left) empty sky. Checked by rasterising the shipped GLB.
//  - filament (§10 start): eased back so the lamp's bulb comes into the upper right as it
//    warms, the globe still in frame.
//  - instrument (§12): the whole instrument, plinth and all, standing on the desk, left of
//    centre, the lower right (the text's) clear desk.
const ROOM_SHOTS = {
  land: {
    falsespace: nearInstrument({ pos: [-0.01, -0.1647, 0.309], tgt: [-0.25, 0.2103, -0.587], fov: 28, drift: [0.015, 0.012, -0.01], pan: [0.005, 0.022, 0] }),
    filament: nearInstrument({ pos: [-0.02, -0.1307, 0.42], tgt: [-0.146, 0.2913, -0.4778], fov: 36 }),
    reveal: onDesk({ pos: [-0.8, 1.1, -5.95], tgt: [-1.42, 1.06, -6.5], fov: 38 }),
    deskReveal: onDesk({ pos: [-0.3, 1.25, -5.1], tgt: [-1.45, 1.0, -6.45], fov: 48 }),
    // Blender wide loc (0.2, 0.9, 1.35) tgt (0.73, 5.4, 1.67), 16 mm; the pan starts on the desk
    wide: { pos: b2t([0.2, 0.9, 1.35]), tgt: b2t([0.73, 5.4, 1.67]), fov: lensVfov(16, LAND_ASPECT), drift: [-0.02, -0.01, 0.06], pan: [-1.03, -0.12, -0.15] },
    instrument: nearInstrument({ pos: [0.562, 0.1383, 0.974], tgt: [0.1162, -0.0843, 0.107], fov: lensVfov(38, LAND_ASPECT), drift: [-0.06, -0.01, -0.07] }),
    screens: { pos: b2t([-3.0, 5.32, 1.24]), tgt: b2t([-4.2, 6.42, 1.07]), fov: lensVfov(30, LAND_ASPECT), drift: [-0.09, -0.02, -0.08] },
    desk: { pos: b2t([-3.1, 4.05, 1.75]), tgt: b2t([-3.0, 6.45, 0.92]), fov: lensVfov(21, LAND_ASPECT), drift: [0.06, -0.03, -0.11] },
    wall: { pos: b2t([1.15, 2.3, 1.7]), tgt: b2t([1.15, 6.96, 1.62]), fov: lensVfov(31, LAND_ASPECT), drift: [0, 0, -0.16] },
    bed: { pos: b2t([1.83, 3.48, 1.4]), tgt: b2t([3.95, 5.45, 0.64]), fov: lensVfov(28, LAND_ASPECT), drift: [0.04, 0.02, -0.08] },
  },
  port: {
    falsespace: nearInstrument({ pos: [0.05, -0.1397, 0.22], tgt: [-0.1744, 0.3876, -0.5993], fov: 44, drift: [-0.012, 0.01, 0], pan: [-0.007, 0.012, 0] }),
    filament: nearInstrument({ pos: [0.02, -0.1307, 0.38], tgt: [-0.0467, 0.3487, -0.495], fov: 52 }),
    reveal: onDesk({ pos: [-0.82, 1.1, -5.97], tgt: [-1.4, 1.08, -6.48], fov: 52 }),
    deskReveal: onDesk({ pos: [-0.25, 1.35, -5.0], tgt: [-1.42, 1.02, -6.42], fov: 62 }),
    wide: { pos: b2t([0.6, 1.2, 1.45]), tgt: b2t([-2.4, 6.3, 1.72]), fov: 78, drift: [0.02, 0, 0.05], pan: [0.4, -0.06, 0] },
    instrument: nearInstrument({ pos: [0.475, 0.1383, 1.019], tgt: [0.0504, 0.045, 0.1184], fov: 50, drift: [-0.06, -0.01, -0.07] }),
    // the left monitor edge to edge on a phone: a wider lens and a shorter push keep its corners in
    screens: { pos: b2t([-3.3, 5.3, 1.32]), tgt: b2t([-4.03, 6.44, 1.06]), fov: 68, drift: [-0.05, -0.01, -0.05] },
    desk: { pos: b2t([-3.05, 4.5, 1.62]), tgt: b2t([-3.05, 6.6, 1.06]), fov: 72, drift: [0, -0.02, -0.1] },
    wall: { pos: b2t([1.15, 1.2, 1.75]), tgt: b2t([1.15, 6.96, 2.3]), fov: 76, drift: [0, 0, -0.16] },
    bed: { pos: b2t([2.72, 3.86, 1.6]), tgt: b2t([3.8, 5.95, 0.82]), fov: 72, drift: [0.04, 0.01, -0.08] },
  },
};

/** [u, shot, f]: the room's tour. Shots hold through each beat and move between them. */
const ROOM_SEQUENCE = [
  [8.72, 'falsespace', -0.3],
  [9.3, 'falsespace', 0.3],
  [9.75, 'falsespace', 1],
  // the filament warms (10 - 10.3) in the upper right; the strips bloom on as the camera
  // draws back to the desk (lights, screens above)
  [10.18, 'filament', 0],
  [10.45, 'reveal', 0],
  [10.84, 'deskReveal', 0],
  [11.3, 'wide', 1],
  [11.72, 'wide', 0],
  [12.3, 'instrument', -0.5],
  [12.7, 'instrument', 0.5],
  [13.3, 'screens', -0.5],
  [13.7, 'screens', 0.5],
  [14.3, 'desk', -0.5],
  [14.7, 'desk', 0.5],
  [15.3, 'wall', -0.5],
  [15.7, 'wall', 0.5],
  [16.3, 'bed', -0.5],
  [16.7, 'bed', 0.5],
];

// =========================================================== space cameras ===
// The ending framing is engine/instrument/layout.js FINAL_VIEWS (the stone layout is
// checked from it); contact from sketches/instrument/shots.js 'contact'.

const FINAL = {
  land: { subject: [0, 2.4, 0], az: -90, el: 15, dist: 16.3, fov: 30, shift: [0.09, -0.035] },
  port: { subject: [0, 1.9, 0], az: -90, el: 60, dist: 17, fov: 46, shift: [0, 0.12] },
};
// Contact (and /contacts/, held at CONTACT_U): the sealed sphere right of centre on wide
// screens, clear of the coda's text zone on the left (engine/acts/space.js CODA_QUIET, right
// edge at NDC -0.12; the shell's left edge sits at about +0.14, the rest of the instrument
// right of about -0.1 in the text's rows); below the text on phones.
const CONTACT = {
  land: { subject: [0, 3.55, 0], az: -100, el: 4, dist: 10.9, fov: 30, shift: [0.22, 0.02] },
  port: { subject: [0, 3.35, 0], az: -100, el: 5, dist: 14.9, fov: 36, shift: [0, 0.18] },
};
// The approach over the dissolve (§17), authored in the room: the camera turns from the bed
// to the instrument standing against the window as the lamp goes off, then pushes in on it,
// nearly level, so the window and its aurora fill the frame behind the brass while the room
// goes dark round them. It comes in from the window side of the desk chair (the chair stands
// in front of the desk at about 34 degrees off the instrument and 2 m out; the old straight
// approach at 28 degrees flew through its back) and only swings round to the ending's
// azimuth once the room is gone. Keys: `angle` (degrees about +Y from +Z toward +X, round
// the instrument's desk anchor), `range` (horizontal metres from the anchor), `height` (the
// camera, room metres), `look` (the height it looks at, room metres), `fov`, `shift`.
// approachKeys() maps them through ROOM_INSTRUMENT into this act's orbit keys, so if the
// anchor moves the room path keeps its place round the desk. The room camera over the
// window is this camera mapped back onto the desk (roomKeys), so the two worlds stay
// registered on the instrument.
const ROOM_APPROACH = {
  land: [
    { u: 17.2, angle: 8, range: 2.8, height: 1.16, look: 1.03, fov: 42, shift: [0.07, 0.03] },
    { u: 17.45, angle: 10, range: 2.12, height: 1.15, look: 1.03, fov: 38, shift: [0.07, 0.025] },
    { u: 17.7, angle: 16, range: 1.5, height: 1.2, look: 1.04, fov: 34, shift: [0.07, 0.01] },
  ],
  port: [
    { u: 17.2, angle: 8, range: 3.1, height: 1.2, look: 1.12, fov: 56, shift: [0, -0.06] },
    { u: 17.45, angle: 10, range: 2.35, height: 1.2, look: 1.11, fov: 54, shift: [0, -0.04] },
    { u: 17.7, angle: 16, range: 1.7, height: 1.3, look: 1.08, fov: 51, shift: [0, 0] },
  ],
};
// Then, the room gone, the instrument floats up into the ending: the camera has swung to the
// ending's azimuth and elevation and from here only sinks and closes in, so the instrument
// rises through the frame against the stars (which only pan slowly as the sky settles into
// the ending's composition, engine/acts/space.js SKY_HANDOVER) to the final framing at 18.
const FLOAT = {
  land: { u: 17.87, subject: [0, 3.3, 0], az: -90, el: 15, dist: 17.6, fov: 31, shift: [0.09, -0.035] },
  port: { u: 17.87, subject: [0, 2.7, 0], az: -90, el: 54, dist: 18.4, fov: 47, shift: [0, 0.12] },
};

/** ROOM_APPROACH as this act's orbit keys. @param {'land' | 'port'} vp */
function approachKeys(vp) {
  const map = frameMap(ROOM_INSTRUMENT);
  const [x, , z] = ROOM_INSTRUMENT.position;
  return ROOM_APPROACH[vp].map(k => {
    const a = k.angle * DEG;
    const target = map.toLocal([x, k.look, z]);
    const o = toOrbit(map.toLocal([x + k.range * Math.sin(a), k.height, z + k.range * Math.cos(a)]), target);
    return { u: k.u, subject: target, az: o.az, el: o.el, dist: o.dist, fov: k.fov, shift: k.shift };
  });
}

/** @param {'land' | 'port'} vp */
function spaceKeys(vp) {
  const F = FINAL[vp];
  const C = CONTACT[vp];
  return [
    ...approachKeys(vp),
    FLOAT[vp],
    { u: 18, ...F },
    // a slow drift while the stones are read; small, so labels hardly move
    { u: 18.85, ...F, az: F.az + 3, el: F.el + 0.5, dist: F.dist - 0.2 },
    { u: 19.2, ...C },
    { u: 20, ...C, az: C.az - 3, el: C.el + 0.5, dist: C.dist - 0.2 },
  ];
}

/** @param {'land' | 'port'} vp */
function roomKeys(vp) {
  const shots = ROOM_SHOTS[vp];
  const keys = ROOM_SEQUENCE.map(([u, name, f]) => {
    const s = /** @type {any} */ (shots)[name];
    const drift = s.drift || [0, 0, 0];
    const pan = s.pan || [0, 0, 0];
    return { u, pos: add(s.pos, scale(drift, f)), tgt: add(s.tgt, scale(pan, f)), fov: s.fov };
  });
  // the dissolve: the space camera itself, sampled densely and mapped onto the instrument
  // on the desk, so both worlds stay registered while one dissolves into the other
  const map = frameMap(ROOM_INSTRUMENT);
  const space = orbitSampler(spaceKeys(vp), NOMINAL_ASPECT[vp]);
  const [a, b] = WINDOWS.dissolve;
  for (let i = 0; i <= DISSOLVE_SAMPLES; i++) {
    const u = a + ((b - a) * i) / DISSOLVE_SAMPLES;
    const pose = space(u);
    keys.push({ u, pos: map.toWorld(pose.position), tgt: map.toWorld(pose.target), fov: pose.fov });
  }
  return keys;
}

/** Room keys sampled from the space camera over the dissolve window. */
const DISSOLVE_SAMPLES = 24;

// ================================================================== beats ===
// The 17 text beats: their section and the quiet zone the text sits in, as NDC rectangles
// [x0, y0, x1, y1] (x right, y up, -1..1). From the sketches' text boxes (left 7.4vw on wide
// screens; full width with 7vw gutters on phones); acts keep these regions near-night.

const Q = {
  plateLeft: [-0.86, -0.26, -0.3, 0.3],
  liftLeft: [-0.86, -0.12, -0.25, 0.34],
  wordLowLeft: [-0.86, -0.84, 0.1, -0.3],
  midLeft: [-0.86, -0.36, -0.25, 0.4],
  upperLeft: [-0.86, -0.1, -0.15, 0.34],
  lowLeft: [-0.86, -0.82, -0.3, -0.36],
  wideTop: [-0.86, 0.22, -0.3, 0.74],
  lowRight: [0.32, -0.8, 0.9, -0.4],
  screensTop: [-0.86, 0.2, -0.18, 0.82],
  deskLowRight: [0.3, -0.86, 0.94, -0.25],
  wallLow: [-0.93, -0.9, -0.28, -0.3],
  bedTop: [-0.91, 0.3, -0.25, 0.9],
  dissolveLow: [-0.86, -0.91, -0.3, -0.5],
  portTop: [-0.86, 0.36, 0.86, 0.88],
  portTopTall: [-0.86, 0.25, 0.86, 0.88],
  portWordTop: [-0.86, 0.52, 0.86, 0.9],
  portBottom: [-0.86, -0.88, 0.86, -0.4],
};

const BEAT_QUIET = [
  [Q.plateLeft, Q.portTop], //        c01 A student of what comes next.
  [Q.plateLeft, Q.portTopTall], //    c02 High school senior ...
  [Q.liftLeft, Q.portTop], //         c03 Good questions become experiments.
  [Q.wordLowLeft, Q.portWordTop], //  c04 building.
  [Q.wordLowLeft, Q.portWordTop], //  c05 Learn
  [Q.wordLowLeft, Q.portWordTop], //  c06 Build
  [Q.wordLowLeft, Q.portWordTop], //  c07 Repeat
  [Q.midLeft, Q.portTopTall], //      c08 Making my family ...
  [Q.upperLeft, Q.portTop], //        c09 Machine learning ...
  [Q.lowLeft, Q.portTop], //          c10 From an idea to something real.
  [Q.wideTop, Q.portBottom], //       c11 Wake up. Ship. Learn. Repeat.
  [Q.lowRight, Q.portTop], //         c12 What am I working on?
  [Q.screensTop, Q.portTopTall], //   c13 Learning from images
  [Q.deskLowRight, Q.portTopTall], // c14 Building ZeroMind
  [Q.wallLow, Q.portBottom], //       c15 Building in the open
  [Q.bedTop, Q.portTopTall], //       c16 Bringing people together
  [Q.dissolveLow, Q.portTop], //      c17 Explore the work.
];

/** Each text beat: index (0-based), chapter id, its section, and its quiet zone per viewport. */
export const BEATS = Object.freeze(BEAT_QUIET.map(([land, port], index) => Object.freeze({
  index,
  id: SECTIONS[index + 1].id,
  section: index + 1,
  quiet: Object.freeze({ land: Object.freeze(land.slice()), port: Object.freeze(port.slice()) }),
})));
if (BEATS.length !== BEAT_COUNT) throw new Error('choreography: BEATS must cover every text beat');

// ============================================================ the export ===

/** The choreography createTimeline() reads. 'port' is deep-merged over 'land'. */
export const CHOREOGRAPHY = deepFreeze({
  version: 1,
  acts: ACTS.slice(),
  sections: SECTION_PLAN,
  transitions: TRANSITIONS.map(tr => ({ ...tr, u: tr.u.slice() })),
  land: {
    params: PARAMS,
    cameras: {
      plate: orbitRig([...PLATE_LAND, ...DIVE_LAND.map(k => raised(k, PLATE_LIFT_Y))]),
      gears: orbitRig(gearKeys('land')),
      room: lookRig(roomKeys('land')),
      space: orbitRig(spaceKeys('land')),
    },
  },
  port: {
    cameras: {
      plate: orbitRig([...PLATE_PORT, ...DIVE_PORT.map(k => raised(k, PLATE_LIFT_Y))]),
      gears: orbitRig(gearKeys('port')),
      room: lookRig(roomKeys('port')),
      space: orbitRig(spaceKeys('port')),
    },
  },
});

// ================================================================= helpers ===

function roomInstrument() {
  // Anchor_Instrument: the base centre on the desk top, the height and yaw of the instrument
  const anchor = { position: [-1.3, 0.77, -6.22], height: 0.414, yaw: 0.4887 };
  // layout.js: GROUND_Y (feet underside) and ARMILLARY.c[1] + rings[0].R + 0.02 (meridian top)
  const ground = -0.62;
  const top = 3.95 + 1.5 + 0.02;
  const scaleM = anchor.height / (top - ground);
  const p = anchor.position;
  return { position: [p[0], p[1] - ground * scaleM, p[2]], yaw: anchor.yaw / DEG, scale: scaleM };
}

function sketchInstrument() {
  // the armillary on the sketch's desk (sketches/room/shots.js LANDMARKS.armillaryCore,
  // Blender) and its meridian ring radius (RM = 0.118 m) against the instrument's (meridian
  // R 1.5 units, armillary centre 3.95 units up); yaw from the Blender armillary root
  const core = b2t([-1.38, 6.4, 1.06]);
  const scaleM = 0.118 / 1.5;
  return { position: [core[0], core[1] - 3.95 * scaleM, core[2]], yaw: 28, scale: scaleM };
}

/**
 * A room shot framed on the sketch's armillary, carried rigidly onto the shipped instrument:
 * position and target through both frames, drift and pan turned and scaled with them.
 * @param {{ pos: number[], tgt: number[], fov: number, drift?: number[], pan?: number[] }} shot
 */
function onDesk(shot) {
  const from = frameMap(SKETCH_INSTRUMENT);
  const to = frameMap(ROOM_INSTRUMENT);
  const carry = (/** @type {number[]} */ p) => to.toWorld(from.toLocal(p));
  const origin = carry([0, 0, 0]);
  const vector = (/** @type {number[] | undefined} */ v) => (v ? sub(carry(v), origin) : undefined);
  /** @type {any} */
  const out = { ...shot, pos: carry(shot.pos), tgt: carry(shot.tgt) };
  if (shot.drift) out.drift = vector(shot.drift);
  if (shot.pan) out.pan = vector(shot.pan);
  return out;
}

/**
 * A room shot given as offsets (room axes, metres) from the shipped armillary's centre
 * (ROOM_INSTRUMENT; layout.js ARMILLARY.c, 3.95 units up). Drift and pan are room vectors.
 * @param {{ pos: number[], tgt: number[], fov: number, drift?: number[], pan?: number[] }} shot
 */
function nearInstrument(shot) {
  const p = ROOM_INSTRUMENT.position;
  const c = [p[0], p[1] + 3.95 * ROOM_INSTRUMENT.scale, p[2]];
  return { ...shot, pos: add(c, shot.pos), tgt: add(c, shot.tgt) };
}

/** @param {number} x @param {number} m */
function mod(x, m) {
  return ((x % m) + m) % m;
}
/** @param {number[]} a @param {number[]} b */
function add(a, b) {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}
/** @param {number[]} a @param {number[]} b */
function sub(a, b) {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}
/** @param {number[]} a @param {number} k */
function scale(a, k) {
  return [a[0] * k, a[1] * k, a[2] * k];
}
