export const ACTIVATE_MS = 150;
export const LOST_MS = 200;
export const MAX_RESULT_AGE_MS = 1500;
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

export function isFraming(points) {
  const palm = distance(points[5], points[17]);
  // Fingertip separation is enough; a bent index or relaxed thumb is still a frame.
  return palm > .01 && distance(points[4], points[8]) > Math.max(.015, palm * .4);
}

export class FrameTracker {
  constructor() { this.reset(); }
  reset() { this.previous = []; this.lastTime = null; }
  update(result, time) {
    // Handedness confidence describes left/right classification, not hand visibility.
    const entries = (result?.landmarks || []).map((points, i) => ({points, i})).filter(({points}) => points.length === 21
      && points.every(p => Number.isFinite(p.x) && Number.isFinite(p.y))).slice(0, 2);
    const rawHands = entries.map(({points}) => points);
    const handInfo = entries.map(({i}) => ({handedness: result.handedness?.[i]?.[0], world: result.worldLandmarks?.[i]}));
    const aspectRatio = result?.aspectRatio || 1;
    let hands = rawHands;
    if (this.previous.length && time - this.lastTime < 400) {
      const pairs = rawHands.flatMap((hand, i) => this.previous.map((previous, j) => ({i, j, distance: distance(hand[0], previous[0])}))).sort((a, b) => a.distance - b.distance);
      const matches = new Map(), used = new Set();
      for (const pair of pairs) {
        if (pair.distance < .25 && !matches.has(pair.i) && !used.has(pair.j)) { matches.set(pair.i, pair.j); used.add(pair.j); }
      }
      const alpha = 1 - Math.exp(-Math.max(1, time - this.lastTime) / 35);
      hands = rawHands.map((points, i) => {
        const previous = this.previous[matches.get(i)];
        return previous ? points.map((p, j) => ({...p, x: previous[j].x + alpha * (p.x - previous[j].x), y: previous[j].y + alpha * (p.y - previous[j].y)})) : points;
      });
    }
    this.previous = hands;
    this.lastTime = time;
    const invalid = reason => ({valid: false, hands, rawHands, handInfo, aspectRatio, reason});
    if (hands.length < 2) return invalid(hands.length ? 'One hand tracked · Show your other hand' : 'Show both hands');
    if (!rawHands.every(isFraming)) return invalid('Open your thumbs and index fingers');
    const boundary = points => convexHull(points.flatMap(hand => [hand[4], hand[8]]));
    const usable = corners => corners.length === 4 && polygonArea(corners) >= .002
      && corners.every(p => p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1);
    const corners = boundary(hands);
    if (distance(rawHands[0][0], rawHands[1][0]) < .04 || !usable(boundary(rawHands)) || !usable(corners)) return invalid('Spread your hands to make a window');
    return {valid: true, corners, hands, rawHands, handInfo, aspectRatio, reason: 'Hold your frame'};
  }
}

export class DomainState {
  constructor() { this.reset(); }
  reset() { this.since = null; this.lastResult = null; this.expiresAfter = LOST_MS; this.hands = []; this.frame = null; this.active = false; this.activatedAt = null; this.reason = 'Show both hands'; }
  update(frame, time, latency = 0) {
    this.snapshot(time);
    this.lastResult = time;
    // Allow one inference interval on slower devices; explicit hand loss clears immediately.
    this.expiresAfter = Math.max(LOST_MS, Math.min(1200, latency * 2 + 100));
    this.hands = frame.hands || [];
    this.reason = frame.reason;
    if (!frame.valid) { this.since = null; this.active = false; this.frame = null; return this.snapshot(time); }
    if (this.since === null) this.since = time;
    this.frame = frame;
    if (!this.active && time - this.since >= ACTIVATE_MS) { this.active = true; this.activatedAt = time; }
    return this.snapshot(time);
  }
  snapshot(time) {
    if (this.lastResult !== null && time - this.lastResult >= this.expiresAfter) this.reset();
    return {active: this.active, frame: this.active ? this.frame : null, hands: this.hands, activatedAt: this.activatedAt, reason: this.active ? 'Domain active' : this.reason};
  }
}

export function applyTrackingResult(tracker, domain, result, capturedAt, receivedAt) {
  const latency = receivedAt - capturedAt;
  if (latency < 0 || latency >= MAX_RESULT_AGE_MS) {
    tracker.reset(); domain.reset();
    return domain.snapshot(receivedAt);
  }
  return domain.update(tracker.update(result, receivedAt), receivedAt, latency);
}

export function containRect(sourceWidth, sourceHeight, width, height) {
  const scale = Math.min(width / sourceWidth, height / sourceHeight);
  const w = sourceWidth * scale, h = sourceHeight * scale;
  return {x: (width - w) / 2, y: (height - h) / 2, width: w, height: h};
}

export function projectPoint(point, rect, mirrored = true) {
  return {x: rect.x + (mirrored ? 1 - point.x : point.x) * rect.width, y: rect.y + point.y * rect.height};
}
