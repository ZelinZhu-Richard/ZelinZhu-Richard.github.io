// A small debugging overlay for the engine harness (sketches/engine/): a readout of the
// frame (u, section, beat, acts and their weights, the transition, fps, tier, pixel ratio,
// draw calls, what is loaded) and a scrubber over story time with section steps. Loaded
// lazily by the harness only; the app never imports it. DOM only, no three, no imports.

/**
 * @typedef {{ stats(): any }} StatsSource the facade (engine/index.js)
 * @typedef {{
 *   scene: StatsSource,
 *   document?: Document,
 *   onScrub?: (u: number) => void,
 *   sections?: ReadonlyArray<{ id: string, act: string }>,
 *   uMax?: number,
 *   every?: number,
 * }} PanelOptions
 */

const CSS = `
.engine-debug { position: fixed; right: 12px; bottom: 12px; z-index: 50; width: 300px; max-width: calc(100vw - 24px);
  box-sizing: border-box; padding: 10px 12px 12px; border: 1px solid rgba(236, 233, 225, 0.16); border-radius: 6px;
  background: rgba(11, 10, 20, 0.82); color: #ece9e1; font: 11px/1.45 ui-monospace, "SF Mono", Menlo, monospace;
  letter-spacing: 0.02em; backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px); }
.engine-debug[data-collapsed] .engine-debug-body { display: none; }
.engine-debug-head { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
.engine-debug-head strong { font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; color: #a8a398; }
.engine-debug button { font: inherit; color: inherit; background: rgba(236, 233, 225, 0.08); border: 1px solid rgba(236, 233, 225, 0.18);
  border-radius: 4px; padding: 2px 7px; cursor: pointer; }
.engine-debug button:hover { background: rgba(236, 233, 225, 0.16); }
.engine-debug pre { margin: 8px 0; white-space: pre-wrap; word-break: break-word; }
.engine-debug input[type=range] { width: 100%; margin: 4px 0 6px; accent-color: #39f0a6; }
.engine-debug-row { display: flex; gap: 6px; align-items: center; }
.engine-debug-row span { flex: 1; color: #a8a398; }
`;

/** @param {number} x @param {number} [d] */
const f = (x, d = 3) => (Number.isFinite(x) ? x.toFixed(d) : '-');

/**
 * Mounts the panel. Returns { element, update(), setU(u), dispose() }.
 * @param {PanelOptions} options
 */
export function createDebugPanel({ scene, document: doc = globalThis.document, onScrub, sections = [], uMax = 20, every = 250 }) {
  if (!doc) throw new TypeError('createDebugPanel: a document is required');
  const style = doc.createElement('style');
  style.textContent = CSS;
  doc.head.appendChild(style);

  const root = doc.createElement('aside');
  root.className = 'engine-debug';
  root.setAttribute('aria-label', 'Engine debug');
  const head = doc.createElement('div');
  head.className = 'engine-debug-head';
  const title = doc.createElement('strong');
  title.textContent = 'engine';
  const toggle = doc.createElement('button');
  toggle.type = 'button';
  toggle.textContent = 'hide';
  head.append(title, toggle);

  const body = doc.createElement('div');
  body.className = 'engine-debug-body';
  const out = doc.createElement('pre');
  const range = doc.createElement('input');
  range.type = 'range';
  range.min = '0';
  range.max = String(uMax);
  range.step = '0.001';
  range.value = '0';
  range.setAttribute('aria-label', 'Story time u');
  const row = doc.createElement('div');
  row.className = 'engine-debug-row';
  const prev = doc.createElement('button');
  prev.type = 'button';
  prev.textContent = '← section';
  const label = doc.createElement('span');
  const next = doc.createElement('button');
  next.type = 'button';
  next.textContent = 'section →';
  row.append(prev, label, next);
  body.append(out, range, row);
  root.append(head, body);
  doc.body.appendChild(root);

  let u = 0;
  let scrubbing = false;
  /** @param {number} v */
  const go = (v) => {
    u = Math.min(uMax, Math.max(0, v));
    range.value = String(u);
    onScrub?.(u);
  };
  range.addEventListener('input', () => {
    scrubbing = true;
    go(Number(range.value));
  });
  range.addEventListener('change', () => {
    scrubbing = false;
  });
  prev.addEventListener('click', () => go(Math.max(0, Math.ceil(u - 1e-6) - 1)));
  next.addEventListener('click', () => go(Math.floor(u + 1e-6) + 1));
  toggle.addEventListener('click', () => {
    if (root.hasAttribute('data-collapsed')) root.removeAttribute('data-collapsed');
    else root.setAttribute('data-collapsed', '');
    toggle.textContent = root.hasAttribute('data-collapsed') ? 'show' : 'hide';
  });

  function update() {
    let s;
    try {
      s = scene.stats();
    } catch {
      return;
    }
    const e = s.engine;
    if (!e) {
      out.textContent = `loading… ${s.loaded ? '' : '(not loaded)'}`;
      return;
    }
    const sec = sections[e.section];
    const acts = e.acts.map((/** @type {any} */ a) => `${a.id} ${f(a.weight, 2)}`).join(' + ');
    const tr = e.transition ? `${e.transition.kind} ${e.transition.from}→${e.transition.to} t ${f(e.transition.t, 2)}` : 'none';
    out.textContent = [
      `u ${f(e.u)}  (target ${f(e.target)})`,
      `section ${e.section}${sec ? ` ${sec.id} · ${sec.act}` : ''}  beat ${e.beat}`,
      `acts ${acts}`,
      `transition ${tr}`,
      `${e.viewport}  ${e.css[0]}×${e.css[1]} @${f(e.dpr, 2)}  tier ${e.tierId} (${s.tier})`,
      `fps ${f(e.fps, 1)}  calls ${s.drawCalls}  tris ${s.triangles}  frames ${s.frames}`,
      `ready ${e.ready.join(', ') || '-'}${e.loading.length ? `  loading ${e.loading.join(', ')}` : ''}`,
      `settled ${e.settled}  hover ${e.hover ?? '-'}  compose ${e.post ? e.post.compose : '-'}`,
    ].join('\n');
    label.textContent = sec ? `§${e.section} ${sec.id}` : '';
    if (!scrubbing) {
      u = e.target;
      range.value = String(e.target);
    }
  }
  const timer = setInterval(update, every);
  update();

  return {
    element: root,
    update,
    /** Moves the scrubber without calling onScrub. @param {number} v */
    setU(v) {
      u = v;
      range.value = String(v);
    },
    dispose() {
      clearInterval(timer);
      root.remove();
      style.remove();
    },
  };
}
