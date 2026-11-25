// Authoring helpers for the choreography: unit conversions, camera-rig builders with
// per-key inheritance, and the map between the room (metres) and the instrument's own
// units. Pure: imports only the timeline's own modules.

import { orbitInto } from '../timeline/evaluate.js';
import { scalarTrack, vec3Track } from '../timeline/tracks.js';

export const DEG = Math.PI / 180;

/** Blender Z-up -> three Y-up: three (x, y, z) = Blender (x, z, -y). @param {number[]} p */
export const b2t = p => [p[0], p[2], -p[1]];

/**
 * Vertical fov (degrees) that shows a Blender lens's whole 16:9 frame in a viewport of the
 * given aspect ("contain"), as sketches/room/shots.js containVfov does.
 * @param {number} lens focal length, mm, on a 36 mm sensor (fit: horizontal)
 * @param {number} aspect viewport width / height
 */
export function lensVfov(lens, aspect, sensor = 36, frame = 16 / 9) {
  const tanH = sensor / 2 / lens;
  const tanV = aspect >= frame ? tanH / frame : tanH / aspect;
  return (2 * Math.atan(tanV)) / DEG;
}

/** Frame half-height at distance `dist` for a vertical fov in degrees. */
export const sizeAt = (dist, fov) => dist * Math.tan(0.5 * fov * DEG);

const FLAG_KEYS = ['corner', 'rest'];
/** @param {any} key */
function flagsOf(key) {
  /** @type {Record<string, any>} */
  const flags = {};
  for (const k of FLAG_KEYS) if (key[k]) flags[k] = true;
  return flags;
}

/**
 * An orbit rig from shot keys. Each key may leave fields out to inherit them from the key
 * before it: { u, subject: [x, y, z], az, el (degrees), dist | size, fov (vertical degrees),
 * roll, shift: [x, y], ease, corner, rest }. `dist` is converted to size (the frame's
 * half-height at the subject) with that key's fov; a key with neither keeps the previous
 * size, so a fov change alone is a dolly zoom. `ease` and the flags apply to every channel.
 * @param {any[]} keys
 */
export function orbitRig(keys) {
  /** @type {Record<string, any[]>} */
  const ch = { subject: [], az: [], el: [], size: [], fov: [], roll: [], shiftX: [], shiftY: [] };
  /** @type {any} */
  let prev = { roll: 0, shift: [0, 0] };
  for (const key of keys) {
    const k = { ...prev, ...key };
    if (key.dist !== undefined) k.size = sizeAt(key.dist, k.fov);
    else if (key.size === undefined) k.size = prev.size;
    delete k.dist;
    for (const field of ['subject', 'az', 'el', 'size', 'fov']) {
      if (k[field] === undefined) throw new TypeError(`orbitRig: key at u = ${k.u} has no ${field}`);
    }
    const ease = key.ease;
    const flags = flagsOf(key);
    ch.subject.push([k.u, k.subject.slice(), ease, flags]);
    ch.az.push([k.u, k.az, ease, flags]);
    ch.el.push([k.u, k.el, ease, flags]);
    ch.size.push([k.u, k.size, ease, flags]);
    ch.fov.push([k.u, k.fov, ease, flags]);
    ch.roll.push([k.u, k.roll, ease, flags]);
    ch.shiftX.push([k.u, k.shift[0], ease, flags]);
    ch.shiftY.push([k.u, k.shift[1], ease, flags]);
    prev = { ...k, ease: undefined, corner: undefined, rest: undefined };
  }
  return {
    rig: 'orbit',
    subject: { type: 'vec3', keys: ch.subject },
    az: { keys: ch.az },
    el: { keys: ch.el },
    size: { keys: ch.size },
    fov: { keys: ch.fov },
    roll: { keys: ch.roll },
    shiftX: { keys: ch.shiftX },
    shiftY: { keys: ch.shiftY },
  };
}

/**
 * A look rig from keys { u, pos: [x, y, z], tgt: [x, y, z], fov, roll, ease, path, corner,
 * rest }; missing fields inherit from the key before. `path: 'linear'` makes the camera
 * travel straight from this key to the next.
 * @param {any[]} keys
 */
export function lookRig(keys) {
  /** @type {Record<string, any[]>} */
  const ch = { position: [], target: [], fov: [], roll: [] };
  /** @type {any} */
  let prev = { roll: 0 };
  for (const key of keys) {
    const k = { ...prev, ...key };
    for (const field of ['pos', 'tgt', 'fov']) {
      if (k[field] === undefined) throw new TypeError(`lookRig: key at u = ${k.u} has no ${field}`);
    }
    const ease = key.ease;
    const flags = flagsOf(key);
    const vflags = key.path ? { ...flags, path: key.path } : flags;
    ch.position.push([k.u, k.pos.slice(), ease, vflags]);
    ch.target.push([k.u, k.tgt.slice(), ease, vflags]);
    ch.fov.push([k.u, k.fov, ease, flags]);
    ch.roll.push([k.u, k.roll, ease, flags]);
    prev = { ...k, ease: undefined, path: undefined, corner: undefined, rest: undefined };
  }
  return {
    rig: 'look',
    position: { type: 'vec3', keys: ch.position },
    target: { type: 'vec3', keys: ch.target },
    fov: { keys: ch.fov },
    roll: { keys: ch.roll },
  };
}

/**
 * The pose an orbit key gives (the same arithmetic as the timeline).
 * @param {{ subject: number[], az: number, el: number, size?: number, dist?: number, fov: number, roll?: number, shift?: number[] }} key
 * @param {number} aspect
 * @returns {{ position: number[], target: number[], fov: number, roll: number }}
 */
export function orbitPose(key, aspect) {
  const size = key.size !== undefined ? key.size : sizeAt(/** @type {number} */ (key.dist), key.fov);
  const shift = key.shift || [0, 0];
  const cam = { position: [0, 0, 0], target: [0, 0, 0], fov: 0, roll: 0 };
  return orbitInto(cam, key.subject, key.az, key.el, size, key.fov, key.roll || 0, shift[0], shift[1], aspect);
}

/**
 * The pose an orbit rig built from `keys` gives at any u, exactly as the timeline would
 * compute it (same tracks, same arithmetic). Used to fly another act's camera along it.
 * @param {any[]} keys orbitRig keys
 * @param {number} aspect
 * @returns {(u: number) => { position: number[], target: number[], fov: number, roll: number }}
 */
export function orbitSampler(keys, aspect) {
  const rig = orbitRig(keys);
  const subject = vec3Track(rig.subject.keys, { name: 'sampler.subject' });
  /** @type {Record<string, ReturnType<typeof scalarTrack>>} */
  const ch = {};
  for (const name of ['az', 'el', 'size', 'fov', 'roll', 'shiftX', 'shiftY']) ch[name] = scalarTrack(rig[name].keys, { name: `sampler.${name}` });
  return u => orbitInto({ position: [0, 0, 0], target: [0, 0, 0], fov: 0, roll: 0 }, subject.evaluate(u),
    ch.az.evaluate(u), ch.el.evaluate(u), ch.size.evaluate(u), ch.fov.evaluate(u), ch.roll.evaluate(u),
    ch.shiftX.evaluate(u), ch.shiftY.evaluate(u), aspect);
}

/**
 * Azimuth, elevation (degrees) and distance of a camera position seen from a target, in the
 * orbit convention (the camera sits along (cos az, 0, -sin az) from the target).
 * @param {number[]} position
 * @param {number[]} target
 */
export function toOrbit(position, target) {
  const dx = position[0] - target[0];
  const dy = position[1] - target[1];
  const dz = position[2] - target[2];
  const h = Math.hypot(dx, dz);
  return { az: Math.atan2(-dz, dx) / DEG, el: Math.atan2(dy, h) / DEG, dist: Math.hypot(dx, dy, dz) };
}

/**
 * A rigid frame with uniform scale: where an object authored in its own units sits in a
 * world (the instrument on the room's desk).
 * @param {{ position: number[], yaw: number, scale: number }} frame yaw in degrees about +Y
 */
export function frameMap({ position, yaw, scale }) {
  const c = Math.cos(yaw * DEG);
  const s = Math.sin(yaw * DEG);
  return {
    /** world -> local @param {number[]} p */
    toLocal(p) {
      const x = p[0] - position[0];
      const y = p[1] - position[1];
      const z = p[2] - position[2];
      return [(x * c - z * s) / scale, y / scale, (x * s + z * c) / scale];
    },
    /** local -> world @param {number[]} q */
    toWorld(q) {
      const x = q[0] * scale;
      const z = q[2] * scale;
      return [position[0] + x * c + z * s, position[1] + q[1] * scale, position[2] - x * s + z * c];
    },
  };
}

/** Freezes plain data all the way down. @template T @param {T} value @returns {T} */
export function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const v of Object.values(value)) deepFreeze(v);
    Object.freeze(value);
  }
  return value;
}
