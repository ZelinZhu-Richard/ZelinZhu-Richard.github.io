import {LOST_MS} from './geometry.js';

export const DUST_HOLD_MS = 450;
export const DUST_REARM_MS = 220;
export const DUST_COOLDOWN_MS = 1500;
export const DUST_FLIGHT_MS = 1300;
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const midpoint = (a, b) => ({x: (a.x + b.x) / 2, y: (a.y + b.y) / 2});

export function palmFacesCamera(points, info, aspect = 1) {
  const world = info?.world;
  const coordinates = world?.length === 21 && world.every(p => [p.x, p.y, p.z].every(Number.isFinite))
    ? world : points.map(p => ({x: p.x * aspect, y: p.y, z: (p.z || 0) * aspect}));
  const [w, index, pinky] = [coordinates[0], coordinates[5], coordinates[17]];
  const a = {x: index.x - w.x, y: index.y - w.y, z: index.z - w.z};
  const b = {x: pinky.x - w.x, y: pinky.y - w.y, z: pinky.z - w.z};
  const normal = {x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x};
  const magnitude = Math.hypot(normal.x, normal.y, normal.z);
  // Raw inference images are unmirrored; display mirroring happens only in the renderer.
  const direction = info?.handedness?.categoryName === 'Left' ? 1 : info?.handedness?.categoryName === 'Right' ? -1 : 0;
  return magnitude > 1e-6 && direction * normal.z / magnitude > .3;
}

export function dustGesture(frame) {
  const hands = frame.rawHands || frame.hands || [];
  const invalid = reason => ({valid: false, reason});
  if (hands.length !== 2) return invalid(hands.length ? 'One palm found · Show your other palm' : 'Show both palms toward the camera');
  if (hands.some(h => h.length !== 21 || h.some(p => !p || !Number.isFinite(p.x) || !Number.isFinite(p.y)))) return invalid('Keep both hands fully in view');
  const aspect = Number.isFinite(frame.aspectRatio) && frame.aspectRatio > 0 ? frame.aspectRatio : 1;
  const scaled = hands.map(h => h.map(p => ({...p, x: p.x * aspect})));
  const openPalm = h => {
    const length = distance(h[0], h[9]), width = distance(h[5], h[17]);
    const extended = [[5,6,8], [9,10,12], [13,14,16], [17,18,20]].filter(([base,joint,tip]) =>
      distance(h[tip], h[0]) > distance(h[joint], h[0]) * 1.08 && distance(h[tip], h[base]) > length * .35).length;
    return width > .018 && length > .025 && extended >= 3 && distance(h[4], h[8]) > width * .35;
  };
  if (!scaled.every(openPalm)) return invalid('Open both palms and spread your fingers');
  if (!hands.every((h, i) => palmFacesCamera(h, frame.handInfo?.[i], aspect))) return invalid('Turn both palms toward the camera');
  const widths = scaled.map(h => distance(h[5], h[17]));
  const width = (widths[0] + widths[1]) / 2;
  if (Math.min(...widths) / Math.max(...widths) < .5 || distance(scaled[0][0], scaled[1][0]) < width * .65) return invalid('Keep your palms side by side');
  const tips = hands.flatMap(h => [h[4], h[8]]);
  if (tips.some(p => p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1)) return invalid('Keep all four fingertips in view');
  // Hand-relative tolerance: approximate small gaps, never pretend camera pixels are centimetres.
  const thumbGap = distance(scaled[0][4], scaled[1][4]) / width;
  const indexGap = distance(scaled[0][8], scaled[1][8]) / width;
  if (thumbGap > .42) return {...invalid('Bring your two thumbs close together'), separated: thumbGap > .7 || indexGap > .7};
  if (indexGap > .42) return {...invalid('Bring your two index fingers close together'), separated: indexGap > .7};
  const thumb = midpoint(scaled[0][4], scaled[1][4]), index = midpoint(scaled[0][8], scaled[1][8]);
  const opening = distance(thumb, index);
  if (opening < width * .45) return invalid('Leave a little window between thumbs and index fingers');
  const displayed = frame.hands?.length === 2 ? frame.hands : hands;
  const center = midpoint(midpoint(displayed[0][4], displayed[1][4]), midpoint(displayed[0][8], displayed[1][8]));
  return {valid: true, center, size: Math.max(.025, Math.min(.09, opening / aspect * .32)), reason: 'Hold the seal · Charging 尘遁'};
}

export class DustState {
  constructor() { this.reset(); }
  reset() {
    this.hands = []; this.since = null; this.separatedSince = null; this.lastResult = null;
    this.expiresAfter = LOST_MS; this.armed = true; this.cooldownUntil = 0; this.shots = []; this.gesture = null;
    this.reason = 'Show both palms toward the camera';
  }
  update(frame, time, latency = 0) {
    this.snapshot(time); this.lastResult = time;
    this.expiresAfter = Math.max(LOST_MS, Math.min(1200, latency * 2 + 100));
    this.hands = frame.hands || [];
    const gesture = dustGesture(frame); this.gesture = gesture; this.reason = gesture.reason;
    if (!gesture.valid) {
      this.since = null;
      if (gesture.separated) {
        this.separatedSince ??= time;
        if (time - this.separatedSince >= DUST_REARM_MS) this.armed = true;
      } else this.separatedSince = null;
      return this.snapshot(time);
    }
    this.separatedSince = null;
    if (!this.armed) { this.since = null; this.reason = '尘遁 released · Separate your hands to cast again'; }
    else if (time < this.cooldownUntil) { this.since = null; this.reason = 'Recharging · Keep your palms visible'; }
    else {
      this.since ??= time;
      if (time - this.since >= DUST_HOLD_MS) {
        this.shots = [{origin: {...gesture.center}, size: gesture.size, born: time}];
        this.since = null; this.armed = false; this.cooldownUntil = time + DUST_COOLDOWN_MS;
        this.reason = '尘遁 released · Separate your hands to cast again';
      }
    }
    return this.snapshot(time);
  }
  snapshot(time) {
    if (this.lastResult !== null && time - this.lastResult >= this.expiresAfter) {
      this.lastResult = null; this.hands = []; this.gesture = null; this.since = null; this.separatedSince = null;
      this.reason = 'Show both palms toward the camera';
    }
    this.shots = this.shots.filter(shot => time - shot.born < DUST_FLIGHT_MS);
    const charging = this.gesture?.valid && this.since !== null ? {...this.gesture, progress: Math.min(1, (time - this.since) / DUST_HOLD_MS)} : null;
    return {mode: 'dust', active: this.shots.length > 0, hands: this.hands, shots: this.shots, charging, reason: this.reason};
  }
}

export function dustPose(shot, time, reducedMotion = false) {
  const progress = Math.max(0, Math.min(1, (time - shot.born) / DUST_FLIGHT_MS));
  const travel = 1 - (1 - progress) ** 3;
  return {x: shot.origin.x, y: shot.origin.y - (reducedMotion ? 0 : .1 * travel),
    radius: shot.size * (reducedMotion ? 1 : 1 + 2.2 * travel),
    alpha: reducedMotion ? 1 - progress : Math.min(1, (1 - progress) * 3),
    rotation: reducedMotion ? .2 : .2 + progress * .55, progress};
}
