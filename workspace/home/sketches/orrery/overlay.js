// Real DOM text over the canvas. Blocks are placed per shot and layout by
// CSS (index.html); the stone labels follow the projected spheres.

const TEXT = {
  hero: `
    <div class="block">
      <h1 class="display name">Richard Zhu</h1>
      <p class="mono line">A student of what comes next.</p>
    </div>
    <div class="scroll mono"><span class="rule"></span>Scroll</div>`,
  experiments: `
    <div class="block">
      <h2 class="display roman">Good questions<br>become <em>experiments.</em></h2>
    </div>`,
  repeat: `
    <div class="bigword display">Repeat</div>`,
  research: `
    <div class="block">
      <h2 class="display">Learning from images</h2>
      <p class="body">At UNC PRIMES, I work on deep learning for neuroscience image processing.</p>
    </div>`,
  stones: '',
  stone: `
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

export function renderOverlay(root, shotId, layout, labels) {
  root.innerHTML = TEXT[shotId] || '';
  if (shotId === 'stones' && labels) placeLabels(root, labels, layout);
}

// labels: [{ n, text, x, y, r }] in CSS px. Each label sits beside its
// sphere (outer side on wide screens, below on narrow ones) on a hairline
// leader, nudged until no label overlaps another label or any sphere.
function placeLabels(root, labels, layout) {
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

  const gap = 7;
  const lead = layout === 'port' ? 10 : 22;
  const boxes = [];
  const overlaps = (b, i) => {
    for (const o of boxes) if (b.x < o.x + o.w + 6 && b.x + b.w + 6 > o.x && b.y < o.y + o.h + 4 && b.y + b.h + 4 > o.y) return true;
    for (let j = 0; j < labels.length; j++) {
      const s = labels[j];
      const cx = Math.max(b.x, Math.min(s.x, b.x + b.w));
      const cy = Math.max(b.y, Math.min(s.y, b.y + b.h));
      if (Math.hypot(cx - s.x, cy - s.y) < s.r + 3) return true;
    }
    return b.x < 12 || b.y < 12 || b.x + b.w > W - 12 || b.y + b.h > H - 12;
  };

  labels.forEach((L, i) => {
    const [w, h] = sizes[i];
    const outerRight = L.x >= W / 2;
    const cands = [];
    const side = (right, dy) => {
      const x = right ? L.x + L.r + gap + lead : L.x - L.r - gap - lead - w;
      return { x, y: L.y - h / 2 + dy, w, h, kind: right ? 'r' : 'l', dy };
    };
    const below = (dy) => ({ x: Math.min(Math.max(L.x - L.r * 0.6, 12), W - 12 - w), y: L.y + L.r + gap + dy, w, h, kind: 'b', dy });
    const above = (dy) => ({ x: Math.min(Math.max(L.x - L.r * 0.6, 12), W - 12 - w), y: L.y - L.r - gap - h - dy, w, h, kind: 'a', dy });
    // preferred side first with small vertical nudges, then the others
    const order = layout === 'port' ? ['b', 'a', outerRight ? 'r' : 'l', outerRight ? 'l' : 'r'] : [outerRight ? 'r' : 'l', 'b', 'a', outerRight ? 'l' : 'r'];
    for (const k of order) {
      for (const dy of [0, 12, -12, 24, -24, 36, -36]) {
        if (k === 'r') cands.push(side(true, dy));
        else if (k === 'l') cands.push(side(false, dy));
        else if (k === 'b') cands.push(below(Math.max(dy, 0)));
        else cands.push(above(Math.max(dy, 0)));
      }
    }
    let pick = cands.find((c) => !overlaps(c, i)) || cands[0];
    boxes.push(pick);
    const el = els[i];
    el.style.left = `${Math.round(pick.x)}px`;
    el.style.top = `${Math.round(pick.y)}px`;
    // hairline leader from the sphere's rim to the label
    const line = document.createElementNS(svgNS, 'line');
    let x1;
    let y1;
    let x2;
    let y2;
    const my = pick.y + h / 2;
    if (pick.kind === 'r' || pick.kind === 'l') {
      const dir = pick.kind === 'r' ? 1 : -1;
      const ang = Math.atan2(my - L.y, dir * (L.r + gap));
      x1 = L.x + Math.cos(ang) * (L.r + 4);
      y1 = L.y + Math.sin(ang) * (L.r + 4);
      x2 = pick.kind === 'r' ? pick.x - 5 : pick.x + w + 5;
      y2 = my;
    } else {
      const ty = pick.kind === 'b' ? pick.y - 3 : pick.y + h + 3;
      x1 = L.x;
      y1 = L.y + (pick.kind === 'b' ? L.r + 4 : -L.r - 4);
      x2 = Math.min(Math.max(L.x, pick.x + 4), pick.x + w - 4);
      y2 = ty;
    }
    line.setAttribute('x1', x1.toFixed(1));
    line.setAttribute('y1', y1.toFixed(1));
    line.setAttribute('x2', x2.toFixed(1));
    line.setAttribute('y2', y2.toFixed(1));
    svg.appendChild(line);
  });
}
