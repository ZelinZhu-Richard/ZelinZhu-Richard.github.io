// The seven stones as the page shows them: numbered items, the engine's screen positions
// normalised, and label placement beside each sphere (after sketches/instrument/overlay.js).
// Pure: plain node can test it.

/**
 * @typedef {{ id: string, title: string, subtitle: string, href: string }} Stone
 * @typedef {Stone & { number: string }} StoneItem
 * @typedef {{ id: string, x: number, y: number, r: number, visible: boolean }} StonePoint
 * @typedef {{ x: number, y: number, w: number, h: number, side: 'r' | 'l' | 'b' | 'a', leader: { x1: number, y1: number, x2: number, y2: number } }} LabelBox
 */

/**
 * Content stones with their two-digit number ("01" .. "07"), in content order.
 * @param {Stone[]} stones
 * @returns {StoneItem[]}
 */
export function stoneItems(stones) {
  return stones.map((stone, index) => ({
    id: stone.id,
    title: stone.title,
    subtitle: stone.subtitle,
    href: stone.href,
    number: String(index + 1).padStart(2, '0'),
  }));
}

/**
 * The engine's 'stones:screen' payload ({ id, x, y, radius, visible }[], CSS px) checked
 * and reduced to known stones. Accepts `r` for `radius`. Returns null for anything that is
 * not a list, so a bad payload switches the page back to the plain list.
 * @param {unknown} payload
 * @param {Iterable<string>} ids
 * @returns {StonePoint[] | null}
 */
export function normaliseScreen(payload, ids) {
  if (!Array.isArray(payload)) return null;
  const known = new Set(ids);
  /** @type {StonePoint[]} */
  const points = [];
  for (const entry of payload) {
    if (!entry || typeof entry !== 'object' || !known.has(entry.id)) continue;
    const x = Number(entry.x);
    const y = Number(entry.y);
    const r = Number(entry.radius ?? entry.r);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    points.push({ id: entry.id, x, y, r: Number.isFinite(r) && r > 0 ? r : 0, visible: entry.visible !== false });
  }
  return points;
}

const GAP = 7;
const EDGE = 14;
const DYS = [0, 12, -12, 24, -24, 36, -36, 48, -48];

/**
 * Candidate boxes beside one sphere, best first: the outer side on wide screens, below on
 * narrow ones, then the others, each nudged up and down.
 * @param {StonePoint} point
 * @param {number} w
 * @param {number} h
 * @param {{ width: number, portrait: boolean }} view
 */
function candidates(point, w, h, view) {
  const lead = view.portrait ? 10 : 22;
  const outerRight = point.x >= view.width / 2;
  const order = view.portrait
    ? ['b', 'a', outerRight ? 'r' : 'l', outerRight ? 'l' : 'r']
    : [outerRight ? 'r' : 'l', 'b', 'a', outerRight ? 'l' : 'r'];
  const centred = Math.min(Math.max(point.x - w / 2, EDGE), view.width - EDGE - w);
  /** @type {{ x: number, y: number, w: number, h: number, side: 'r' | 'l' | 'b' | 'a' }[]} */
  const out = [];
  for (const side of order) {
    for (const dy of DYS) {
      if (side === 'r') out.push({ x: point.x + point.r + GAP + lead, y: point.y - h / 2 + dy, w, h, side });
      else if (side === 'l') out.push({ x: point.x - point.r - GAP - lead - w, y: point.y - h / 2 + dy, w, h, side });
      else if (side === 'b') out.push({ x: centred, y: point.y + point.r + GAP + Math.max(dy, 0), w, h, side });
      else out.push({ x: centred, y: point.y - point.r - GAP - h - Math.max(dy, 0), w, h, side });
    }
  }
  return out;
}

/**
 * @param {{ x: number, y: number, w: number, h: number }} box
 * @param {{ x: number, y: number, w: number, h: number }[]} placed
 * @param {StonePoint[]} spheres
 * @param {{ width: number, height: number, top: number }} view
 */
function isFree(box, placed, spheres, view) {
  if (box.x < EDGE || box.y < view.top + EDGE || box.x + box.w > view.width - EDGE || box.y + box.h > view.height - EDGE) return false;
  for (const o of placed) {
    if (box.x < o.x + o.w + 8 && box.x + box.w + 8 > o.x && box.y < o.y + o.h + 5 && box.y + box.h + 5 > o.y) return false;
  }
  for (const s of spheres) {
    const cx = Math.max(box.x, Math.min(s.x, box.x + box.w));
    const cy = Math.max(box.y, Math.min(s.y, box.y + box.h));
    if (Math.hypot(cx - s.x, cy - s.y) < s.r + 4) return false;
  }
  return true;
}

/**
 * Places each visible stone's label beside its sphere, clear of the other labels, every
 * sphere and the frame's edges (and the header band at the top), with a hairline leader
 * from the label to the sphere's edge. Labels are placed in the order given.
 * @param {StonePoint[]} points
 * @param {Map<string, [number, number]>} sizes label width and height, CSS px
 * @param {{ width: number, height: number, top?: number, portrait?: boolean }} viewport
 * @returns {Map<string, LabelBox>} only visible stones with a known size
 */
export function placeLabels(points, sizes, viewport) {
  const view = { width: viewport.width, height: viewport.height, top: viewport.top || 0, portrait: viewport.portrait ?? viewport.height > viewport.width };
  const spheres = points.filter(point => point.visible);
  /** @type {{ x: number, y: number, w: number, h: number }[]} */
  const placed = [];
  /** @type {Map<string, LabelBox>} */
  const out = new Map();
  for (const point of spheres) {
    const size = sizes.get(point.id);
    if (!size) continue;
    const [w, h] = size;
    const list = candidates(point, w, h, view);
    const pick = list.find(box => isFree(box, placed, spheres, view)) || list[0];
    placed.push(pick);
    // The leader runs from beside the words to the sphere's edge.
    let x2;
    let y2;
    if (pick.side === 'r' || pick.side === 'l') {
      x2 = pick.side === 'r' ? pick.x - 6 : pick.x + w + 6;
      y2 = pick.y + h / 2;
    } else {
      x2 = Math.min(Math.max(point.x, pick.x + 6), pick.x + w - 6);
      y2 = pick.side === 'b' ? pick.y - 4 : pick.y + h + 4;
    }
    const dx = x2 - point.x;
    const dy = y2 - point.y;
    const dl = Math.hypot(dx, dy) || 1;
    const edge = Math.max(point.r - 2, 2);
    out.set(point.id, {
      x: pick.x,
      y: pick.y,
      w,
      h,
      side: pick.side,
      leader: { x1: point.x + (dx / dl) * edge, y1: point.y + (dy / dl) * edge, x2, y2 },
    });
  }
  return out;
}
