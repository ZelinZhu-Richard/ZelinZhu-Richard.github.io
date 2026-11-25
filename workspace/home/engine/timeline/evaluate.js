// The timeline: story time u and a viewport in, one FrameState out (ARCHITECTURE.md).
// Pure: imports only its two siblings; no three, no DOM, no clock.
//
//   const timeline = createTimeline(CHOREOGRAPHY);
//   const frame = timeline.evaluate(u, 'land');          // a fresh FrameState
//   timeline.evaluateInto(frame, u, 'port', aspect);      // refills it, allocates nothing
//
// FrameState
//   u            section units, clamped to [0, 20] (NaN reads as 0)
//   section      integer 0..19
//   beat         text beat in view (0..16) or -1
//   viewport     'land' | 'port'
//   acts         [{ id, weight }]: one act, or the two acts of a transition; weights sum to 1
//   transition   null | { from, to, t, kind }: t eases 0 -> 1 (smoothstep of the window)
//   camera       { position: [x, y, z], target: [x, y, z], fov, roll } of acts[0], in its world;
//                fov is the vertical field of view in degrees, roll is degrees about the view axis
//   cameraB      the same for acts[1] during a transition, else null
//   params       { draw, lift, train, crank, build, lights, ... } as the choreography declares them
//
// Transitions end on section boundaries, so `camera` changes world only where `section`
// changes. Up is +Y in every world.
//
// The choreography (engine/choreo/choreography.mjs is the real one):
//   { acts: [id, ...],
//     transitions: [{ from, to, u: [a, b], kind }],           // b is the section where `to` starts
//     land: { params: { name: trackSpec & { range } }, cameras: { act: rig } },
//     port: { ...partial overrides, deep-merged over land; arrays (keys) replace } }
// Camera rigs (angles in degrees):
//   { rig: 'look',  position, target, fov, roll }
//   { rig: 'orbit', subject, az, el, size, fov, roll, shiftX, shiftY }
//     The camera looks at `subject` from azimuth az (world angle: the camera sits along
//     (cos az, 0, -sin az) from the subject, so az -90 is the +Z side) and elevation el,
//     far enough that the frame's half-height at the subject is `size` (distance =
//     size / tan(fov / 2), so changing fov at a fixed size is a dolly zoom). shiftX/shiftY
//     move the subject off centre on screen as fractions of the frame (+x right, +y down:
//     the subject lands at NDC (2 shiftX, -2 shiftY)) by trucking the camera.

import { SECTIONS, SECTION_COUNT, U_MAX, beatAt, sectionAt } from './schedule.js';
import { compileTrack, scalarTrack, vec3Track } from './tracks.js';

/** @typedef {'land' | 'port'} Viewport */
/** @typedef {'cut' | 'fade' | 'lift' | 'reveal' | 'dissolve'} TransitionKind */
/** @typedef {{ position: number[], target: number[], fov: number, roll: number }} FrameCamera */
/**
 * @typedef {{
 *   u: number, section: number, beat: number, viewport: Viewport,
 *   acts: { id: string, weight: number }[],
 *   transition: null | { from: string, to: string, t: number, kind: TransitionKind },
 *   camera: FrameCamera, cameraB: FrameCamera | null,
 *   params: Record<string, number>,
 * }} FrameState
 */

export const VIEWPORTS = Object.freeze(/** @type {Viewport[]} */ (['land', 'port']));
export const TRANSITION_KINDS = Object.freeze(/** @type {TransitionKind[]} */ (['cut', 'fade', 'lift', 'reveal', 'dissolve']));

/** Frame aspect (width / height) the orbit shifts assume when the caller gives none. */
export const NOMINAL_ASPECT = Object.freeze({ land: 1440 / 900, port: 390 / 844 });

/** Windows narrower than this (width / height) use the 'port' choreography. */
export const PORTRAIT_BELOW = 0.8;

/**
 * Which choreography a window uses.
 * @param {number} width
 * @param {number} height
 * @returns {Viewport}
 */
export function layoutFor(width, height) {
  return width > 0 && height > 0 && width / height < PORTRAIT_BELOW ? 'port' : 'land';
}

const DEG = Math.PI / 180;
/** Orbit elevations are kept inside +-EL_LIMIT degrees so "up" stays defined. */
const EL_LIMIT = 89.9;
const SPARE = Symbol('timeline.spare');

/** C1 smoothstep on [0, 1]. @param {number} x */
const smooth = x => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

/** @returns {FrameCamera} */
function newCamera() {
  return { position: [0, 0, 0], target: [0, 0, -1], fov: 50, roll: 0 };
}

/** @param {any} out */
function ensure(out) {
  if (out[SPARE]) return out[SPARE];
  const spare = {
    a0: { id: '', weight: 1 },
    a1: { id: '', weight: 0 },
    transition: { from: '', to: '', t: 0, kind: /** @type {TransitionKind} */ ('fade') },
    cameraB: newCamera(),
  };
  Object.defineProperty(out, SPARE, { value: spare, enumerable: false });
  if (!Array.isArray(out.acts)) out.acts = [];
  if (!out.camera || !Array.isArray(out.camera.position) || !Array.isArray(out.camera.target)) out.camera = newCamera();
  if (!out.params || typeof out.params !== 'object') out.params = {};
  return spare;
}

/**
 * An empty FrameState, shaped for evaluateInto.
 * @returns {FrameState}
 */
export function createFrameState() {
  const frame = /** @type {FrameState} */ ({
    u: 0, section: 0, beat: -1, viewport: 'land',
    acts: [], transition: null,
    camera: newCamera(), cameraB: null,
    params: {},
  });
  ensure(frame);
  return frame;
}

/**
 * The orbit rig's pose, written into `cam`. Exported so the choreography can derive matching
 * look-rig keys (the dissolve from the room into space) with the same arithmetic.
 * @param {FrameCamera} cam
 * @param {ArrayLike<number>} subject
 * @param {number} azDeg
 * @param {number} elDeg
 * @param {number} size half-height of the frame at the subject, world units
 * @param {number} fovDeg vertical
 * @param {number} rollDeg
 * @param {number} shiftX
 * @param {number} shiftY
 * @param {number} aspect width / height
 * @returns {FrameCamera}
 */
export function orbitInto(cam, subject, azDeg, elDeg, size, fovDeg, rollDeg, shiftX, shiftY, aspect) {
  const el = Math.max(-EL_LIMIT, Math.min(EL_LIMIT, elDeg)) * DEG;
  const az = azDeg * DEG;
  const ce = Math.cos(el);
  const se = Math.sin(el);
  const ca = Math.cos(az);
  const sa = Math.sin(az);
  const dist = size / Math.tan(0.5 * fovDeg * DEG);
  // o: from subject to camera; r: screen right; up: screen up (all unit length)
  const ox = ce * ca;
  const oy = se;
  const oz = -ce * sa;
  const rx = -sa;
  const rz = -ca;
  const ux = -ca * se;
  const uy = ce;
  const uz = sa * se;
  const k1 = 2 * shiftX * size * aspect;
  const k2 = 2 * shiftY * size;
  const px = subject[0] - rx * k1 + ux * k2;
  const py = subject[1] + uy * k2;
  const pz = subject[2] - rz * k1 + uz * k2;
  cam.target[0] = px;
  cam.target[1] = py;
  cam.target[2] = pz;
  cam.position[0] = px + ox * dist;
  cam.position[1] = py + oy * dist;
  cam.position[2] = pz + oz * dist;
  cam.fov = fovDeg;
  cam.roll = rollDeg;
  return cam;
}

/** Plain objects merge key by key; anything else (arrays, numbers, tracks' keys) replaces. */
function isPlain(x) {
  if (!x || typeof x !== 'object' || Array.isArray(x)) return false;
  const proto = Object.getPrototypeOf(x);
  return proto === Object.prototype || proto === null;
}

/**
 * Deep-merges `over` onto `base` without touching either (how 'port' overrides 'land').
 * @param {any} base
 * @param {any} over
 * @returns {any}
 */
export function mergeOver(base, over) {
  if (over === undefined) return base;
  if (!isPlain(base) || !isPlain(over)) return over;
  const out = { ...base };
  for (const key of Object.keys(over)) out[key] = mergeOver(base[key], over[key]);
  return out;
}

/** @param {any} spec @param {string} name */
function scalarChannel(spec, name, fallback) {
  if (spec === undefined || spec === null) return scalarTrack([[0, fallback]], { name });
  if (typeof spec === 'number') return scalarTrack([[0, spec]], { name });
  if (Array.isArray(spec)) return scalarTrack(spec, { name });
  return scalarTrack(spec.keys, { name });
}

/** @param {any} spec @param {string} name */
function vecChannel(spec, name) {
  if (!spec) throw new TypeError(`${name}: missing`);
  if (Array.isArray(spec) && spec.length === 3 && spec.every(x => typeof x === 'number')) return vec3Track([[0, spec]], { name });
  if (Array.isArray(spec)) return vec3Track(spec, { name });
  return vec3Track(spec.keys, { name });
}

/** @param {any} spec @param {string} where */
function compileRig(spec, where) {
  if (!spec || typeof spec !== 'object') throw new TypeError(`${where}: missing camera rig`);
  if (spec.rig === 'look') {
    return {
      rig: 'look',
      position: vecChannel(spec.position, `${where}.position`),
      target: vecChannel(spec.target, `${where}.target`),
      fov: scalarChannel(spec.fov, `${where}.fov`, 50),
      roll: scalarChannel(spec.roll, `${where}.roll`, 0),
    };
  }
  if (spec.rig === 'orbit') {
    if (spec.size === undefined) throw new TypeError(`${where}: an orbit rig needs size (frame half-height at the subject)`);
    return {
      rig: 'orbit',
      subject: vecChannel(spec.subject, `${where}.subject`),
      az: scalarChannel(spec.az, `${where}.az`, -90),
      el: scalarChannel(spec.el, `${where}.el`, 0),
      size: scalarChannel(spec.size, `${where}.size`, 1),
      fov: scalarChannel(spec.fov, `${where}.fov`, 50),
      roll: scalarChannel(spec.roll, `${where}.roll`, 0),
      shiftX: scalarChannel(spec.shiftX, `${where}.shiftX`, 0),
      shiftY: scalarChannel(spec.shiftY, `${where}.shiftY`, 0),
    };
  }
  throw new TypeError(`${where}: rig must be 'look' or 'orbit'`);
}

/** Camera cuts declared in a rig's tracks. */
function rigCuts(rig) {
  const all = new Set();
  for (const key of Object.keys(rig)) if (rig[key] && rig[key].cuts) for (const u of rig[key].cuts) all.add(u);
  return [...all].sort((a, b) => a - b);
}

/**
 * @param {any} rig
 * @param {number} u
 * @param {number} aspect
 * @param {FrameCamera} cam
 * @param {Float64Array} scratch
 */
function cameraInto(rig, u, aspect, cam, scratch) {
  if (rig.rig === 'look') {
    rig.position.evaluateInto(cam.position, u);
    rig.target.evaluateInto(cam.target, u);
    cam.fov = rig.fov.evaluate(u);
    cam.roll = rig.roll.evaluate(u);
    return cam;
  }
  rig.subject.evaluateInto(scratch, u);
  return orbitInto(cam, scratch, rig.az.evaluate(u), rig.el.evaluate(u), rig.size.evaluate(u), rig.fov.evaluate(u),
    rig.roll.evaluate(u), rig.shiftX.evaluate(u), rig.shiftY.evaluate(u), aspect);
}

/**
 * @param {any} spec land, or land with port merged over it
 * @param {string[]} acts
 * @param {Viewport} viewport
 */
function compileViewport(spec, acts, viewport) {
  if (!spec || typeof spec !== 'object') throw new TypeError(`createTimeline: missing the ${viewport} choreography`);
  const paramSpecs = spec.params || {};
  const params = Object.keys(paramSpecs).map(name => {
    const p = paramSpecs[name];
    const range = p && p.range;
    if (!Array.isArray(range) || range.length !== 2 || !(range[0] <= range[1])) {
      throw new TypeError(`createTimeline: param "${name}" needs range [lo, hi]`);
    }
    const track = compileTrack(p, `${viewport}.params.${name}`);
    if (track.type !== 'scalar' && track.type !== 'affine') throw new TypeError(`createTimeline: param "${name}" must be a scalar or affine track`);
    return { name, track, range: /** @type {[number, number]} */ ([range[0], range[1]]) };
  });
  const cameras = /** @type {Record<string, any>} */ ({});
  for (const id of acts) cameras[id] = compileRig(spec.cameras && spec.cameras[id], `${viewport}.cameras.${id}`);
  return { params, cameras };
}

/** @param {any[]} list @param {string[]} acts */
function compileTransitions(list, acts) {
  if (!Array.isArray(list)) throw new TypeError('createTimeline: transitions must be an array');
  const out = list.map((tr, i) => {
    const where = `createTimeline: transition ${i}`;
    if (!tr || !acts.includes(tr.from) || !acts.includes(tr.to)) throw new TypeError(`${where}: from and to must be acts`);
    if (!TRANSITION_KINDS.includes(tr.kind)) throw new TypeError(`${where}: unknown kind "${tr.kind}"`);
    const [a, b] = tr.u || [];
    if (!Number.isInteger(b) || b < 1 || b >= SECTION_COUNT) throw new RangeError(`${where}: must end on a section boundary`);
    if (SECTIONS[b - 1].act !== tr.from || SECTIONS[b].act !== tr.to) throw new RangeError(`${where}: section ${b} is where ${SECTIONS[b - 1].act} hands over to ${SECTIONS[b].act}`);
    if (!(a >= b - 1 && a <= b)) throw new RangeError(`${where}: the window must sit inside section ${b - 1}`);
    if (tr.kind !== 'cut' && !(a < b)) throw new RangeError(`${where}: a ${tr.kind} needs a window`);
    return Object.freeze({ from: tr.from, to: tr.to, a, b, kind: tr.kind });
  }).sort((x, y) => x.b - y.b);
  for (let s = 1; s < SECTION_COUNT; s++) {
    if (SECTIONS[s].act === SECTIONS[s - 1].act) continue;
    const n = out.filter(tr => tr.b === s).length;
    if (n !== 1) throw new RangeError(`createTimeline: the hand-over at section ${s} needs exactly one transition (found ${n})`);
  }
  if (out.some(tr => SECTIONS[tr.b].act === SECTIONS[tr.b - 1].act)) throw new RangeError('createTimeline: a transition sits where no act changes');
  return Object.freeze(out);
}

/**
 * Builds the timeline from a choreography.
 * @param {any} choreo
 */
export function createTimeline(choreo) {
  if (!choreo || typeof choreo !== 'object') throw new TypeError('createTimeline: choreography is required');
  const acts = Array.isArray(choreo.acts) ? choreo.acts.slice() : [];
  for (const s of SECTIONS) if (!acts.includes(s.act)) throw new TypeError(`createTimeline: act "${s.act}" (section ${s.id}) is not in choreo.acts`);
  const transitions = compileTransitions(choreo.transitions || [], acts);
  const views = {
    land: compileViewport(choreo.land, acts, 'land'),
    port: compileViewport(mergeOver(choreo.land, choreo.port), acts, 'port'),
  };
  const names = views.land.params.map(p => p.name);
  const portNames = views.port.params.map(p => p.name);
  if (names.join() !== portNames.join()) throw new TypeError('createTimeline: land and port must declare the same params');
  const ranges = Object.freeze(Object.fromEntries(views.land.params.map(p => [p.name, Object.freeze(p.range)])));
  const scratch = new Float64Array(3);

  /** @param {any} viewport */
  function view(viewport) {
    const v = viewport === 'land' ? views.land : viewport === 'port' ? views.port : null;
    if (!v) throw new TypeError(`timeline: viewport must be 'land' or 'port' (got ${JSON.stringify(viewport)})`);
    return v;
  }
  /** @param {number} u */
  function transitionAt(u) {
    for (let i = 0; i < transitions.length; i++) {
      const tr = transitions[i];
      if (u >= tr.a && u < tr.b) return tr;
    }
    return null;
  }
  /** @param {number} u */
  const clampU = u => (Number.isFinite(u) ? (u < 0 ? 0 : u > U_MAX ? U_MAX : u) : 0);
  /** @param {Viewport} viewport @param {number | undefined} aspect */
  const aspectOf = (viewport, aspect) => (Number.isFinite(aspect) && /** @type {number} */ (aspect) > 0 ? /** @type {number} */ (aspect) : NOMINAL_ASPECT[viewport]);

  /**
   * Fills `out` with the FrameState at u. Allocates nothing once `out` has been used.
   * @param {FrameState | Record<string, any>} out
   * @param {number} u
   * @param {Viewport} viewport
   * @param {number} [aspect] frame width / height for orbit shifts; defaults to NOMINAL_ASPECT
   * @returns {FrameState}
   */
  function evaluateInto(out, u, viewport, aspect) {
    const v = view(viewport);
    const frame = /** @type {any} */ (out);
    const spare = ensure(frame);
    const uu = clampU(u);
    const asp = aspectOf(viewport, aspect);
    frame.u = uu;
    frame.section = sectionAt(uu);
    frame.beat = beatAt(uu);
    frame.viewport = viewport;
    const tr = transitionAt(uu);
    if (tr) {
      const t = smooth((uu - tr.a) / (tr.b - tr.a));
      spare.a0.id = tr.from;
      spare.a0.weight = 1 - t;
      spare.a1.id = tr.to;
      spare.a1.weight = t;
      frame.acts[0] = spare.a0;
      frame.acts[1] = spare.a1;
      frame.acts.length = 2;
      spare.transition.from = tr.from;
      spare.transition.to = tr.to;
      spare.transition.t = t;
      spare.transition.kind = tr.kind;
      frame.transition = spare.transition;
      cameraInto(v.cameras[tr.from], uu, asp, frame.camera, scratch);
      frame.cameraB = cameraInto(v.cameras[tr.to], uu, asp, spare.cameraB, scratch);
    } else {
      const id = SECTIONS[frame.section].act;
      spare.a0.id = id;
      spare.a0.weight = 1;
      frame.acts[0] = spare.a0;
      frame.acts.length = 1;
      frame.transition = null;
      cameraInto(v.cameras[id], uu, asp, frame.camera, scratch);
      frame.cameraB = null;
    }
    const params = frame.params;
    for (let i = 0; i < v.params.length; i++) params[v.params[i].name] = v.params[i].track.evaluate(uu);
    return frame;
  }

  return Object.freeze({
    /** Param names, in choreography order. */
    params: Object.freeze(names),
    /** Declared [lo, hi] per param. */
    ranges,
    /** Compiled transitions { from, to, a, b, kind }, in story order. */
    transitions,
    /** Act ids. */
    acts: Object.freeze(acts),
    /**
     * A fresh FrameState at u.
     * @param {number} u
     * @param {Viewport} viewport
     * @param {number} [aspect]
     * @returns {FrameState}
     */
    evaluate(u, viewport, aspect) {
      return evaluateInto(createFrameState(), u, viewport, aspect);
    },
    evaluateInto,
    /**
     * One act's camera at u, whether or not that act is on screen (for matching cuts,
     * debugging and tests).
     * @param {FrameCamera} out
     * @param {string} act
     * @param {number} u
     * @param {Viewport} viewport
     * @param {number} [aspect]
     * @returns {FrameCamera}
     */
    cameraInto(out, act, u, viewport, aspect) {
      const rig = view(viewport).cameras[act];
      if (!rig) throw new TypeError(`timeline: unknown act "${act}"`);
      return cameraInto(rig, clampU(u), aspectOf(viewport, aspect), out, scratch);
    },
    /**
     * Camera cuts the choreography declares, per act.
     * @param {Viewport} viewport
     * @returns {{ act: string, u: number }[]}
     */
    cuts(viewport) {
      const v = view(viewport);
      return acts.flatMap(act => rigCuts(v.cameras[act]).map(u => ({ act, u })));
    },
  });
}
