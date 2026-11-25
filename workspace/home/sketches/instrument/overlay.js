// Real DOM text over the canvas. Blocks are placed per shot and layout by
// CSS (index.html); the stone labels follow the projected spheres and the
// plate's callouts sit on the drawing's leader shelves.

const TEXT = {
  point: `
    <div class="block">
      <h1 class="display name">Richard Zhu</h1>
      <p class="mono line">A student of what comes next.</p>
    </div>
    <div class="scroll mono"><span class="rule"></span>Scroll</div>`,
  plate: `
    <div class="block">
      <h2 class="display roman">High school senior.<br>Computer science.<br>Economics.<br><em>Curiosity.</em></h2>
    </div>`,
  lift: `
    <div class="block">
      <h2 class="display roman">Good questions<br>become <em>experiments.</em></h2>
    </div>`,
  inside: `
    <div class="block bigword display">Build</div>`,
  falsespace: `
    <div class="block">
      <h2 class="display roman">Machine learning.<br>Quant experiments.<br>Things built in public.</h2>
    </div>`,
  desk: `
    <div class="block">
      <h2 class="display roman">Wake up. Ship. Learn.<br><em>Repeat.</em></h2>
    </div>`,
  'object-scale': `
    <div class="block">
      <h2 class="display">Building<br>in the open</h2>
    </div>`,
  dissolve: `
    <div class="block">
      <h2 class="display roman">Explore the work.<br><em>Follow the curiosity.</em></h2>
    </div>`,
  final: '',
  'final-hover': `
    <div class="block">
      <h2 class="display xl">About</h2>
      <p class="body">Who I am, CV, contact, stars</p>
      <p class="mono cue"><span>Open</span><span class="rule"></span></p>
    </div>`,
  contact: `
    <div class="block">
      <h2 class="display roman">Have something in mind?<br><em>Let&rsquo;s build it together.</em></h2>
      <nav class="links mono" aria-label="Contact">
        <a>Email</a><a>X</a><a>GitHub</a><a>LinkedIn</a>
      </nav>
    </div>`,
};

export function renderOverlay(root, shotId, layout, { labels = null, callouts = null, obstacles = [], polys = [], segs = [] } = {}) {
  root.innerHTML = TEXT[shotId] || '';
  if (labels) placeLabels(root, labels, layout, obstacles, polys, segs);
  if (callouts) placeCallouts(root, callouts);
}

// The text block's rectangle (CSS px), measured from its lines of type so a
// wide block element does not over-state it; null when the frame has none.
export function blockRect(root) {
  const el = root.querySelector('.block');
  if (!el) return null;
  let r = null;
  for (const child of el.querySelectorAll('h1, h2, p, nav, .display')) {
    const range = document.createRange();
    range.selectNodeContents(child);
    for (const b of range.getClientRects()) {
      if (b.width <= 0 || b.height <= 0) continue;
      r = r ? [Math.min(r[0], b.left), Math.min(r[1], b.top), Math.max(r[2], b.right), Math.max(r[3], b.bottom)] : [b.left, b.top, b.right, b.bottom];
    }
  }
  if (!r) {
    const b = el.getBoundingClientRect();
    if (b.width > 0 && b.height > 0) r = [b.left, b.top, b.right, b.bottom];
  }
  return r;
}

// Rectangles (CSS px) the type occupies, for the stars' quiet zones.
export function textRects(root) {
  const out = [];
  for (const el of root.querySelectorAll('.block, .scroll, .label, .callout')) {
    const b = el.getBoundingClientRect();
    if (b.width > 0 && b.height > 0) out.push([b.left, b.top, b.right, b.bottom]);
  }
  return out;
}

// callouts: [{ text, x, y, ex, align }] in CSS px: (x, y) the elbow of the
// leader, ex the shelf's far end; the note sits on the shelf.
function placeCallouts(root, callouts) {
  for (const c of callouts) {
    const el = document.createElement('div');
    el.className = c.hand ? 'callout hand' : 'callout mono';
    el.innerHTML = c.text;
    root.appendChild(el);
    const b = el.getBoundingClientRect();
    let left;
    if (c.align === 'above') left = c.x - b.width / 2;
    else if (c.align === 'right') left = c.x + (c.hand ? 2 : 5);
    else left = c.x - (c.hand ? 2 : 5) - b.width;
    el.style.left = `${Math.round(left)}px`;
    el.style.top = `${Math.round(c.y - b.height - (c.hand ? 2 : 3))}px`;
  }
}

// Convex hull of 2D points (monotone chain).
export function convexHull(P) {
  const p = P.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [];
  for (const q of p) {
    while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop();
    lo.push(q);
  }
  const up = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i];
    while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop();
    up.push(q);
  }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}

// Does the rectangle [x, y, w, h] (grown by pad) meet the convex polygon?
// (separating axes: the rectangle's two, then each polygon edge's normal)
export function rectHitsPoly(r, poly, pad = 0) {
  const x0 = r[0] - pad;
  const y0 = r[1] - pad;
  const x1 = r[0] + r[2] + pad;
  const y1 = r[1] + r[3] + pad;
  let px0 = Infinity;
  let px1 = -Infinity;
  let py0 = Infinity;
  let py1 = -Infinity;
  for (const [x, y] of poly) {
    px0 = Math.min(px0, x);
    px1 = Math.max(px1, x);
    py0 = Math.min(py0, y);
    py1 = Math.max(py1, y);
  }
  if (px1 < x0 || px0 > x1 || py1 < y0 || py0 > y1) return false;
  const corners = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const n = [b[1] - a[1], a[0] - b[0]];
    let pmin = Infinity;
    let pmax = -Infinity;
    for (const q of poly) {
      const v = q[0] * n[0] + q[1] * n[1];
      pmin = Math.min(pmin, v);
      pmax = Math.max(pmax, v);
    }
    let rmin = Infinity;
    let rmax = -Infinity;
    for (const q of corners) {
      const v = q[0] * n[0] + q[1] * n[1];
      rmin = Math.min(rmin, v);
      rmax = Math.max(rmax, v);
    }
    if (rmax < pmin || rmin > pmax) return false;
  }
  return true;
}

// Does the rectangle [x, y, w, h] (grown by pad) meet the segment ab?
export function rectHitsSeg(r, a, b, pad = 0) {
  const x0 = r[0] - pad;
  const y0 = r[1] - pad;
  const x1 = r[0] + r[2] + pad;
  const y1 = r[1] + r[3] + pad;
  // clip the segment to the rectangle (Liang-Barsky)
  let t0 = 0;
  let t1 = 1;
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  for (const [p, q] of [[-dx, a[0] - x0], [dx, x1 - a[0]], [-dy, a[1] - y0], [dy, y1 - a[1]]]) {
    if (p === 0) {
      if (q < 0) return false;
    } else {
      const t = q / p;
      if (p < 0) t0 = Math.max(t0, t);
      else t1 = Math.min(t1, t);
      if (t0 > t1) return false;
    }
  }
  return true;
}

// Candidate places for a label beside its sphere, in order of preference:
// the outer side on wide screens, below on narrow ones. Shared with
// check.mjs (which feeds it estimated label sizes).
export function labelCandidates(L, w, h, layout, W) {
  const gap = 7;
  const lead = layout === 'port' ? 10 : 22;
  const outerRight = L.x >= W / 2;
  const cands = [];
  const order = layout === 'port' ? ['b', 'a', outerRight ? 'r' : 'l', outerRight ? 'l' : 'r'] : [outerRight ? 'r' : 'l', 'b', 'a', outerRight ? 'l' : 'r'];
  for (const k of order) {
    for (const dy of [0, 12, -12, 24, -24, 36, -36, 48, -48]) {
      if (k === 'r') cands.push({ x: L.x + L.r + gap + lead, y: L.y - h / 2 + dy, w, h, kind: 'r' });
      else if (k === 'l') cands.push({ x: L.x - L.r - gap - lead - w, y: L.y - h / 2 + dy, w, h, kind: 'l' });
      else if (k === 'b') cands.push({ x: Math.min(Math.max(L.x - w / 2, 14), W - 14 - w), y: L.y + L.r + gap + Math.max(dy, 0), w, h, kind: 'b' });
      else cands.push({ x: Math.min(Math.max(L.x - w / 2, 14), W - 14 - w), y: L.y - L.r - gap - h - Math.max(dy, 0), w, h, kind: 'a' });
    }
  }
  return cands;
}

// Is a candidate box free of the placed boxes, every sphere's hoop, the
// obstacle circles (armillary, crank), the obstacle polygons (base,
// column), the arms (segments: rod and stem of every sphere) and the
// frame's edge?
export function labelFree(b, boxes, circles, polys, W, H, segs = []) {
  for (const o of boxes) if (b.x < o.x + o.w + 8 && b.x + b.w + 8 > o.x && b.y < o.y + o.h + 5 && b.y + b.h + 5 > o.y) return false;
  for (const [p, q] of segs) if (rectHitsSeg([b.x, b.y, b.w, b.h], p, q, 7)) return false;
  for (const s of circles) {
    const cx = Math.max(b.x, Math.min(s.x, b.x + b.w));
    const cy = Math.max(b.y, Math.min(s.y, b.y + b.h));
    if (Math.hypot(cx - s.x, cy - s.y) < s.r + 4) return false;
  }
  for (const p of polys) if (rectHitsPoly([b.x, b.y, b.w, b.h], p, 4)) return false;
  return !(b.x < 14 || b.y < 14 || b.x + b.w > W - 14 || b.y + b.h > H - 14);
}

// labels: [{ n, text, x, y, r, rs }] in CSS px: the sphere's centre, the
// radius of its hoop (+2) and of the sphere itself. Each label sits beside
// its sphere in full ink, nudged until it overlaps no other label, sphere,
// obstacle circle or polygon; a hairline leader runs from the label to the
// sphere's own edge and ends there in a small dot.
function placeLabels(root, labels, layout, obstacles = [], polys = [], segs = []) {
  const W = window.innerWidth;
  const H = window.innerHeight;
  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('class', 'leaders');
  svg.setAttribute('width', W);
  svg.setAttribute('height', H);
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  root.appendChild(svg);

  const els = labels.map((L) => {
    const el = document.createElement('div');
    el.className = 'label mono';
    el.innerHTML = `<span class="n">${L.n}</span>${L.text}`;
    root.appendChild(el);
    return el;
  });
  const sizes = els.map((el) => {
    const b = el.getBoundingClientRect();
    return [Math.ceil(b.width), Math.ceil(b.height)];
  });

  const boxes = [];
  const circles = labels.map((q) => ({ x: q.x, y: q.y, r: q.r })).concat(obstacles);
  labels.forEach((L, i) => {
    const [w, h] = sizes[i];
    const cands = labelCandidates(L, w, h, layout, W);
    const pick = cands.find((c) => labelFree(c, boxes, circles, polys, W, H, segs)) || cands[0];
    boxes.push(pick);
    const el = els[i];
    el.style.left = `${Math.round(pick.x)}px`;
    el.style.top = `${Math.round(pick.y)}px`;
    // the leader: from beside the words to the sphere's edge
    const my = pick.y + h / 2;
    let x2;
    let y2;
    if (pick.kind === 'r' || pick.kind === 'l') {
      x2 = pick.kind === 'r' ? pick.x - 6 : pick.x + w + 6;
      y2 = my;
    } else {
      x2 = Math.min(Math.max(L.x, pick.x + 6), pick.x + w - 6);
      y2 = pick.kind === 'b' ? pick.y - 4 : pick.y + h + 4;
    }
    const dx = x2 - L.x;
    const dy = y2 - L.y;
    const dl = Math.hypot(dx, dy) || 1;
    const rs = Math.max(L.rs ?? L.r - 2, 2);
    const x1 = L.x + (dx / dl) * rs;
    const y1 = L.y + (dy / dl) * rs;
    const line = document.createElementNS(svgNS, 'line');
    line.setAttribute('x1', x1.toFixed(1));
    line.setAttribute('y1', y1.toFixed(1));
    line.setAttribute('x2', x2.toFixed(1));
    line.setAttribute('y2', y2.toFixed(1));
    svg.appendChild(line);
    const dot = document.createElementNS(svgNS, 'circle');
    dot.setAttribute('cx', x1.toFixed(1));
    dot.setAttribute('cy', y1.toFixed(1));
    dot.setAttribute('r', '1.7');
    svg.appendChild(dot);
  });
}
