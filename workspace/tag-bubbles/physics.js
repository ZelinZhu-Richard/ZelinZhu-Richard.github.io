// Pure motion for the tag bubbles: no DOM, so node tests can drive it.
// A bubble is { x, y, d, vx, vy, phase, alive }: x/y are its top-left corner inside a field
// of size w x h (px), d its diameter. Bubbles rise, sway, push apart, shy away from the cursor,
// and wrap from the top of the field back to the bottom.

export const RISE = 0.32;       // px per frame, upward
export const MAX_SPEED = 1.4;   // px per frame

export const diameter = label => Math.round(Math.max(56, Math.min(92, 26 + label.length * 5.6)));

// Spread new bubbles through the field so they don't all start at the bottom.
export function seed(labels, w, h, random = Math.random) {
  return labels.map((label, i) => {
    const d = diameter(label);
    const lane = labels.length > 1 ? i / (labels.length - 1) : 0.5;
    return {
      label, d, alive: true,
      x: Math.max(0, (w - d) * (0.15 + 0.7 * lane) + (random() - 0.5) * 12),
      y: Math.max(0, h - d) * ((i + 0.35) / labels.length) + (random() - 0.5) * 20,
      vx: (random() - 0.5) * 0.3, vy: -RISE,
      phase: random() * Math.PI * 2,
    };
  });
}

// Back in at the bottom edge, in a random spot across the width.
export function respawn(b, w, h, random = Math.random) {
  b.x = random() * Math.max(0, w - b.d);
  b.y = h;
  b.vx = (random() - 0.5) * 0.3;
  b.vy = -RISE;
  b.alive = true;
  return b;
}

// Advance every live bubble by dt frames (1 = 1/60 s). t is seconds, for the sway.
export function step(bubbles, w, h, dt, t, mouse = null, random = Math.random) {
  for (const b of bubbles) {
    if (!b.alive) continue;
    // Sway left and right; ease the vertical speed toward a steady rise.
    b.vx += Math.sin(t * 0.8 + b.phase) * 0.012 * dt;
    b.vy += (-RISE - b.vy) * 0.04 * dt;
    if (mouse) {
      const dx = b.x + b.d / 2 - mouse.x, dy = b.y + b.d / 2 - mouse.y, dist = Math.hypot(dx, dy), reach = b.d / 2 + 36;
      if (dist > 0 && dist < reach) { const k = (reach - dist) / reach * 0.3 * dt; b.vx += dx / dist * k; b.vy += dy / dist * k; }
    }
    for (const o of bubbles) {
      if (o === b || !o.alive) continue;
      const dx = b.x + b.d / 2 - (o.x + o.d / 2), dy = b.y + b.d / 2 - (o.y + o.d / 2), dist = Math.hypot(dx, dy), min = (b.d + o.d) / 2 + 4;
      if (dist > 0 && dist < min) { const k = (min - dist) / min * 0.06 * dt; b.vx += dx / dist * k; b.vy += dy / dist * k; }
    }
    b.vx *= Math.pow(0.97, dt);
    const speed = Math.hypot(b.vx, b.vy);
    if (speed > MAX_SPEED) { b.vx *= MAX_SPEED / speed; b.vy *= MAX_SPEED / speed; }
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    if (b.x < 0) { b.x = 0; b.vx = Math.abs(b.vx) * 0.5; }
    if (b.x > w - b.d) { b.x = Math.max(0, w - b.d); b.vx = -Math.abs(b.vx) * 0.5; }
    if (b.y > h) b.y = h;
    if (b.y + b.d < 0) respawn(b, w, h, random);
  }
  return bubbles;
}
