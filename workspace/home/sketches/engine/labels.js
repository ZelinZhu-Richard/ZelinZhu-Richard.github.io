// Debug overlay for the engine harness (?labels=1): the seven stone labels drawn over the
// canvas from the engine's 'stones:screen' report, placed by the app's own code
// (app/utils/stones.js normaliseScreen + placeLabels) with the app's label type, so what
// shows here is what StoryStones.vue would place. Each reported stone also gets its sphere
// circle (radius r), its pick circle (hit, dotted) and a hairline leader to its label;
// stones reported but not visible are a dashed circle and their id in grey. A badge in
// the top right counts the report. Key: l hides and shows the overlay.
// DOM only; loaded lazily by sketches/engine/main.js, never by the app.
import { normaliseScreen, placeLabels, stoneItems } from '/app/utils/stones.js';

const SVG = 'http://www.w3.org/2000/svg';

const CSS = `
.stone-labels { position: fixed; z-index: 30; pointer-events: none; overflow: hidden; color: #ece9e1; }
.stone-labels[data-off] { display: none; }
.stone-labels svg { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
.stone-labels .sl-sphere { fill: none; stroke: #ece9e1; stroke-opacity: 0.55; stroke-width: 1; }
.stone-labels .sl-hit { fill: none; stroke: #39f0a6; stroke-opacity: 0.45; stroke-width: 1; stroke-dasharray: 1 3; }
.stone-labels .sl-hidden .sl-sphere { stroke: #7a766d; stroke-dasharray: 4 3; }
.stone-labels .sl-hidden .sl-hit { display: none; }
.stone-labels .sl-tag { fill: #7a766d; font: 10px ui-monospace, "SF Mono", Menlo, monospace; letter-spacing: 0.08em; }
.stone-labels .sl-leader line { stroke: #ece9e1; stroke-opacity: 0.78; stroke-width: 1; }
.stone-labels .sl-leader circle { fill: #ece9e1; }
.stone-labels .sl-leader[data-hidden] { display: none; }
/* the app's placed label (app/assets/css/home.css .stones.is-placed .stone-label), so sizes match */
.stone-labels .sl-label { position: absolute; left: 0; top: 0; display: flex; align-items: baseline; gap: 0.9em;
  padding: 0.15rem 0.1rem; white-space: nowrap; font: 400 0.78125rem/1.4 ui-monospace, "SF Mono", Menlo, monospace;
  letter-spacing: 0.18em; text-transform: uppercase; text-shadow: 0 0 6px rgba(11, 10, 20, 0.9);
  outline: 1px dashed rgba(57, 240, 166, 0.35); outline-offset: 1px; }
.stone-labels .sl-label[data-hidden] { visibility: hidden; }
.stone-labels .sl-badge { position: absolute; right: 12px; top: 12px; padding: 3px 7px; border-radius: 4px;
  background: rgba(11, 10, 20, 0.78); border: 1px solid rgba(236, 233, 225, 0.16); color: #a8a398;
  font: 10px/1.4 ui-monospace, "SF Mono", Menlo, monospace; letter-spacing: 0.08em; white-space: pre; }
`;

/**
 * @param {{
 *   scene: { on(event: string, fn: (detail?: any) => void): () => void },
 *   stones: { id: string, title: string, subtitle: string, href: string }[],
 *   canvas: HTMLElement,
 *   top?: number,
 *   document?: Document,
 *   window?: Window,
 * }} options  top: a header band (CSS px) the labels keep clear of, as the app's masthead
 */
export function createStoneLabels({ scene, stones, canvas, top = 0, document: doc = globalThis.document, window: win = globalThis.window }) {
  const items = stoneItems(stones);
  const ids = items.map((s) => s.id);

  const style = doc.createElement('style');
  style.textContent = CSS;
  doc.head.appendChild(style);
  const root = doc.createElement('div');
  root.className = 'stone-labels';
  root.setAttribute('aria-hidden', 'true');
  const svg = doc.createElementNS(SVG, 'svg');
  root.appendChild(svg);
  const badge = doc.createElement('div');
  badge.className = 'sl-badge';
  root.appendChild(badge);

  /** @type {Map<string, { g: SVGGElement, sphere: SVGCircleElement, hit: SVGCircleElement, tag: SVGTextElement, leader: SVGGElement, line: SVGLineElement, dot: SVGCircleElement, label: HTMLElement }>} */
  const parts = new Map();
  for (const s of items) {
    const g = /** @type {SVGGElement} */ (doc.createElementNS(SVG, 'g'));
    const sphere = /** @type {SVGCircleElement} */ (doc.createElementNS(SVG, 'circle'));
    sphere.setAttribute('class', 'sl-sphere');
    const hit = /** @type {SVGCircleElement} */ (doc.createElementNS(SVG, 'circle'));
    hit.setAttribute('class', 'sl-hit');
    const tag = /** @type {SVGTextElement} */ (doc.createElementNS(SVG, 'text'));
    tag.setAttribute('class', 'sl-tag');
    tag.textContent = s.id;
    g.append(sphere, hit, tag);
    const leader = /** @type {SVGGElement} */ (doc.createElementNS(SVG, 'g'));
    leader.setAttribute('class', 'sl-leader');
    const line = /** @type {SVGLineElement} */ (doc.createElementNS(SVG, 'line'));
    const dot = /** @type {SVGCircleElement} */ (doc.createElementNS(SVG, 'circle'));
    dot.setAttribute('r', '1.5');
    leader.append(line, dot);
    svg.append(g, leader);
    const label = doc.createElement('div');
    label.className = 'sl-label';
    const n = doc.createElement('span');
    n.textContent = s.number;
    const t = doc.createElement('span');
    t.textContent = s.title;
    label.append(n, t);
    root.appendChild(label);
    parts.set(s.id, { g, sphere, hit, tag, leader, line, dot, label });
  }
  doc.body.appendChild(root);

  /** @type {any[] | null} the last report, as the engine sent it */
  let report = null;
  let reports = 0;
  /** @type {Map<string, [number, number]> | null} */
  let sizes = null;
  let raf = 0;

  function measure() {
    sizes = new Map();
    for (const [id, p] of parts) sizes.set(id, [Math.ceil(p.label.offsetWidth), Math.ceil(p.label.offsetHeight)]);
  }

  /** @param {Element} el @param {boolean} hidden */
  const hide = (el, hidden) => (hidden ? el.setAttribute('data-hidden', '') : el.removeAttribute('data-hidden'));
  /** @param {Element} el @param {Record<string, number>} attrs */
  const set = (el, attrs) => {
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, Number.isFinite(v) ? v.toFixed(1) : '0');
  };

  function layout() {
    raf = 0;
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(1, rect.width || win.innerWidth);
    const h = Math.max(1, rect.height || win.innerHeight);
    Object.assign(root.style, { left: `${rect.left}px`, top: `${rect.top}px`, width: `${w}px`, height: `${h}px` });
    if (!sizes) measure();
    const points = normaliseScreen(report, ids);
    const byId = new Map((points || []).map((p) => [p.id, p]));
    const raw = new Map((Array.isArray(report) ? report : []).map((s) => [s && s.id, s]));
    const boxes = points ? placeLabels(points, /** @type {Map<string, [number, number]>} */ (sizes), { width: w, height: h, top }) : new Map();
    let visible = 0;
    for (const [id, p] of parts) {
      const point = byId.get(id);
      const box = boxes.get(id);
      p.g.style.display = point ? '' : 'none';
      if (point) {
        p.g.setAttribute('class', point.visible ? '' : 'sl-hidden');
        set(p.sphere, { cx: point.x, cy: point.y, r: Math.max(point.r, 1) });
        const hitR = Number(raw.get(id)?.hit);
        set(p.hit, { cx: point.x, cy: point.y, r: Number.isFinite(hitR) && hitR > 0 ? hitR : 0 });
        set(p.tag, { x: point.x + Math.max(point.r, 3) + 4, y: point.y + 3 });
        p.tag.style.display = point.visible ? 'none' : '';
        if (point.visible) visible++;
      }
      const shown = !!(point && point.visible && box);
      hide(p.label, !shown);
      hide(p.leader, !shown);
      if (!shown || !box) continue;
      p.label.style.transform = `translate3d(${box.x.toFixed(1)}px, ${box.y.toFixed(1)}px, 0)`;
      const { x1, y1, x2, y2 } = box.leader;
      set(p.line, { x1, y1, x2, y2 });
      set(p.dot, { cx: x1, cy: y1 });
    }
    badge.textContent = report === null
      ? 'labels  no stones:screen yet'
      : `labels  ${Array.isArray(report) ? report.length : 0} reported  ${visible} visible  #${reports}`;
  }

  function request() {
    if (!raf) raf = win.requestAnimationFrame(layout);
  }

  const off = scene.on('stones:screen', (list) => {
    report = Array.isArray(list) ? list.map((s) => ({ ...s })) : [];
    reports++;
    request();
  });
  const onResize = () => {
    sizes = null;
    request();
  };
  const onKey = (/** @type {KeyboardEvent} */ e) => {
    if (e.key !== 'l' || e.metaKey || e.ctrlKey || e.altKey) return;
    if (root.hasAttribute('data-off')) {
      root.removeAttribute('data-off');
      request();
    } else root.setAttribute('data-off', '');
  };
  win.addEventListener('resize', onResize);
  win.addEventListener('keydown', onKey);
  request();

  return {
    element: root,
    /** The last report as the engine sent it (copies), or null. */
    get report() {
      return report;
    },
    update: request,
    dispose() {
      off();
      if (raf) win.cancelAnimationFrame(raf);
      win.removeEventListener('resize', onResize);
      win.removeEventListener('keydown', onKey);
      root.remove();
      style.remove();
    },
  };
}
