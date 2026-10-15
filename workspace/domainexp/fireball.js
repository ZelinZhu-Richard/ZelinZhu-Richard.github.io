import {LOST_MS} from './geometry.js';

export const PALM_HOLD_MS = 160;
export const REARM_MS = 180;
export const COOLDOWN_MS = 900;
export const FLIGHT_MS = 950;
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

export function palmPose(points) {
  if (points?.length !== 21 || points.some(p => !p || !Number.isFinite(p.x) || !Number.isFinite(p.y))) return null;
  const width = distance(points[5], points[17]);
  const length = distance(points[0], points[9]);
  if (width < .018 || length < .025) return null;
  const extended = [[5,6,8], [9,10,12], [13,14,16], [17,18,20]].filter(([base, joint, tip]) =>
    distance(points[tip], points[0]) > distance(points[joint], points[0]) * 1.12
    && distance(points[tip], points[base]) > length * .48).length;
  const open = extended >= 3 && distance(points[4], points[9]) > width * .65;
  const center = [0,5,9,13,17].reduce((sum, i) => ({x: sum.x + points[i].x / 5, y: sum.y + points[i].y / 5}), {x: 0, y: 0});
  return {open, center, wrist: points[0], size: Math.max(.022, Math.min(.09, width * .38))};
}

// Each spatially matched hand casts once per opening, not once per video frame.
export class FireballState {
  constructor() { this.reset(); }
  reset() {
    this.hands = []; this.tracks = []; this.shots = []; this.nextId = 1;
    this.lastResult = null; this.expiresAfter = LOST_MS;
  }
  update(frame, time, latency = 0) {
    this.snapshot(time);
    this.lastResult = time;
    this.expiresAfter = Math.max(LOST_MS, Math.min(1200, latency * 2 + 100));
    this.hands = frame.hands || [];
    const poses = this.hands.map(palmPose).filter(Boolean);
    const candidates = poses.flatMap((pose, i) => this.tracks.map((track, j) => ({i, j, distance: distance(pose.wrist, track.wrist)}))).sort((a, b) => a.distance - b.distance);
    const matches = new Map(), used = new Set();
    for (const pair of candidates) if (pair.distance < .3 && !matches.has(pair.i) && !used.has(pair.j)) { matches.set(pair.i, pair.j); used.add(pair.j); }
    for (const [i, pose] of poses.entries()) {
      let track = this.tracks[matches.get(i)];
      if (!track) {
        track = {id: this.nextId++, armed: true, openSince: null, closedSince: null, cooldownUntil: 0};
        this.tracks.push(track);
      }
      Object.assign(track, {wrist: pose.wrist, center: pose.center, size: pose.size, seen: time, open: pose.open});
      if (!pose.open) {
        track.openSince = null;
        track.closedSince ??= time;
        if (time - track.closedSince >= REARM_MS) track.armed = true;
        continue;
      }
      track.closedSince = null;
      if (!track.armed || time < track.cooldownUntil) { track.openSince = null; continue; }
      track.openSince ??= time;
      if (time - track.openSince >= PALM_HOLD_MS) {
        this.shots.push({id: track.id, origin: {...pose.center}, size: pose.size, born: time});
        track.armed = false; track.openSince = null; track.cooldownUntil = time + COOLDOWN_MS;
      }
    }
    for (const track of this.tracks) if (track.seen !== time) { track.openSince = null; track.closedSince = null; track.open = false; }
    // A brief occlusion must not count as a new opening. Long absence allows a fresh cast.
    this.tracks = this.tracks.filter(track => time - track.seen < 1800);
    this.shots = this.shots.slice(-6);
    return this.snapshot(time);
  }
  snapshot(time) {
    if (this.lastResult !== null && time - this.lastResult >= this.expiresAfter) {
      this.hands = []; this.lastResult = null;
      for (const track of this.tracks) { track.openSince = null; track.closedSince = null; track.open = false; }
    }
    this.tracks = this.tracks.filter(track => time - track.seen < 1800);
    this.shots = this.shots.filter(shot => time - shot.born < FLIGHT_MS);
    const visible = this.tracks.filter(track => this.lastResult !== null && track.seen === this.lastResult);
    const charging = visible.filter(track => track.open && track.armed && track.openSince !== null).map(track => ({center: track.center, size: track.size, progress: Math.min(1, (time - track.openSince) / PALM_HOLD_MS)}));
    const fired = visible.some(track => track.open && !track.armed);
    const cooling = visible.some(track => track.open && track.armed && time < track.cooldownUntil);
    const reason = !this.hands.length ? 'Show an open palm'
      : fired ? 'Fireball cast · Close your hand to cast again'
      : charging.length ? 'Palm found · Hold to cast'
      : cooling ? 'Recharging…'
      : 'Open your palm toward the camera';
    return {mode: 'fireball', active: this.shots.length > 0, hands: this.hands, shots: this.shots, charging, reason};
  }
}

export function fireballPose(shot, time, reducedMotion = false) {
  const progress = Math.max(0, Math.min(1, (time - shot.born) / FLIGHT_MS));
  // Perspective growth reads as travel toward the viewer. Reduced motion stays at the palm.
  return {
    x: shot.origin.x + (reducedMotion ? 0 : (shot.origin.x - .5) * progress * .35),
    y: shot.origin.y - (reducedMotion ? 0 : .18 * progress),
    radius: shot.size * (reducedMotion ? 1.25 : 1 + 4 * progress * progress),
    alpha: reducedMotion ? .7 * (1 - progress) : Math.min(1, (1 - progress) * 4), progress,
  };
}
