export const ACTIVATE_MS = 150;
export const LOST_MS = 200;
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

export function convexHull(points) {
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  const half = values => {
    const result = [];
    for (const p of values) {
      while (result.length >= 2 && cross(result.at(-2), result.at(-1), p) <= 1e-7) result.pop();
      result.push(p);
    }
    return result.slice(0, -1);
  };
  return [...half(sorted), ...half([...sorted].reverse())];
}

export function polygonArea(points) {
  return Math.abs(points.reduce((sum, p, i) => {
    const next = points[(i + 1) % points.length];
    return sum + p.x * next.y - next.x * p.y;
  }, 0)) / 2;
}

function angle(a, b, c) {
  const dot = (a.x - b.x) * (c.x - b.x) + (a.y - b.y) * (c.y - b.y);
  return Math.acos(Math.max(-1, Math.min(1, dot / Math.max(1e-9, distance(a, b) * distance(c, b))))) * 180 / Math.PI;
}

export function isFraming(points) {
  const palm = distance(points[5], points[17]);
  const indexLength = distance(points[5], points[6]) + distance(points[6], points[7]) + distance(points[7], points[8]);
  return palm > .025 && angle(points[5], points[6], points[8]) > 145
    && distance(points[5], points[8]) / Math.max(indexLength, .001) > .78
    && distance(points[4], points[5]) > palm * .45
    && distance(points[4], points[8]) > palm * .65;
}

export class FrameTracker {
  constructor() { this.reset(); }
  reset() { this.previous = null; this.lastTime = null; }
  update(result, time) {
    const detections = (result?.landmarks || []).map((points, i) => ({points, confidence: result.handedness?.[i]?.[0]?.score ?? 1}));
    if (detections.length !== 2 || detections.some(h => h.confidence < .6 || h.points.length !== 21 || h.points.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y)))) {
      return {valid: false, reason: 'Show both hands'};
    }
    let hands = detections.map(h => h.points);
    if (!hands.every(isFraming)) return {valid: false, reason: 'Open your thumbs and index fingers'};
    const raw = convexHull(hands.flatMap(points => [points[4], points[8]]));
    if (raw.length !== 4 || polygonArea(raw) < .008 || raw.some(p => p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1)
      || distance(hands[0][0], hands[1][0]) < .06) {
      return {valid: false, reason: 'Spread your hands to make a window'};
    }
    if (this.previous && time - this.lastTime < LOST_MS) {
      const same = distance(hands[0][0], this.previous[0][0]) + distance(hands[1][0], this.previous[1][0]);
      const swapped = distance(hands[0][0], this.previous[1][0]) + distance(hands[1][0], this.previous[0][0]);
      if (swapped < same) hands.reverse();
      const alpha = 1 - Math.exp(-Math.max(1, time - this.lastTime) / 45);
      hands = hands.map((points, i) => points.map((p, j) => ({x: this.previous[i][j].x + alpha * (p.x - this.previous[i][j].x), y: this.previous[i][j].y + alpha * (p.y - this.previous[i][j].y)})));
    }
    const corners = convexHull(hands.flatMap(points => [points[4], points[8]]));
    if (corners.length !== 4 || polygonArea(corners) < .008) return {valid: false, reason: 'Spread your hands to make a window'};
    this.previous = hands;
    this.lastTime = time;
    return {valid: true, corners, reason: 'Hold your frame'};
  }
}

export class DomainState {
  constructor() { this.reset(); }
  reset() { this.since = null; this.lastValid = null; this.frame = null; this.active = false; this.activatedAt = null; this.reason = 'Show both hands'; }
  update(frame, time) {
    this.snapshot(time);
    this.reason = frame.reason;
    if (!frame.valid) { this.since = null; return this.snapshot(time); }
    if (this.since === null) this.since = time;
    this.lastValid = time;
    this.frame = frame;
    if (!this.active && time - this.since >= ACTIVATE_MS) { this.active = true; this.activatedAt = time; }
    return this.snapshot(time);
  }
  snapshot(time) {
    if (this.lastValid !== null && time - this.lastValid >= LOST_MS) {
      this.active = false; this.since = null; this.frame = null; this.lastValid = null; this.reason = 'Show both hands';
    }
    return {active: this.active, frame: this.active ? this.frame : null, activatedAt: this.activatedAt, reason: this.active ? 'Domain active' : this.reason};
  }
}

export function containRect(sourceWidth, sourceHeight, width, height) {
  const scale = Math.min(width / sourceWidth, height / sourceHeight);
  const w = sourceWidth * scale, h = sourceHeight * scale;
  return {x: (width - w) / 2, y: (height - h) / 2, width: w, height: h};
}

export function projectPoint(point, rect, mirrored = true) {
  return {x: rect.x + (mirrored ? 1 - point.x : point.x) * rect.width, y: rect.y + point.y * rect.height};
}
