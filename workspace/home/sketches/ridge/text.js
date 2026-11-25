// Real DOM text over the canvas, placed per shot and layout. Returns the
// rectangles the copy occupies (drawing-buffer pixels, origin bottom-left) so
// the shaders can keep a quiet zone under it.

import * as THREE from 'three';

// '\n' breaks a line, *...* sets a run in italic.
function appendMarkup(el, text) {
  text.split('\n').forEach((line, i) => {
    if (i > 0) el.appendChild(document.createElement('br'));
    line.split(/(\*[^*]+\*)/).forEach((run) => {
      if (!run) return;
      if (run.startsWith('*') && run.endsWith('*')) {
        const em = document.createElement('em');
        em.textContent = run.slice(1, -1);
        el.appendChild(em);
      } else {
        el.appendChild(document.createTextNode(run));
      }
    });
  });
}

const TAG = { name: 'h1', word: 'h1', display: 'h2', heading: 'h2', body: 'p', mono: 'p', cue: 'p', links: 'nav' };

function blockElement(b) {
  const el = document.createElement(TAG[b.kind] || 'p');
  el.className = `blk t-${b.kind}${b.arrow ? ' arrow' : ''}`;
  if (b.kind === 'links') {
    for (const item of b.items) {
      const a = document.createElement('a');
      a.href = '#';
      a.textContent = item;
      el.appendChild(a);
    }
  } else {
    appendMarkup(el, b.text);
  }
  el.style.left = `${(b.x * 100).toFixed(3)}vw`;
  el.style.top = `${(b.y * 100).toFixed(3)}vh`;
  if (b.size) el.style.fontSize = b.size;
  if (b.w) el.style.width = `${(b.w * 100).toFixed(3)}vw`;
  return el;
}

function cairnLabels(root, shot, w, h) {
  const cfg = shot.R.labels || { dx: 0, dy: 16, align: 'center' };
  const v = new THREE.Vector3();
  shot.world.cairns.forEach((c, i) => {
    v.set(c.position[0], c.position[1], c.position[2]).project(shot.camera);
    const sx = ((v.x + 1) / 2) * w, sy = ((1 - v.y) / 2) * h;
    const el = document.createElement('p');
    el.className = `blk t-label ${cfg.align}`;
    const idx = document.createElement('span');
    idx.className = 'idx';
    idx.textContent = String(i + 1).padStart(2, '0');
    el.appendChild(idx);
    el.appendChild(document.createTextNode(c.label));
    el.style.left = `${(sx + cfg.dx).toFixed(1)}px`;
    el.style.top = `${(sy + cfg.dy).toFixed(1)}px`;
    root.appendChild(el);
  });
}

export function renderText(root, shot, { w, h, bufferW, bufferH, noText }) {
  root.replaceChildren();
  root.classList.toggle('hidden', noText);
  root.dataset.layout = shot.R.layout;
  root.dataset.shot = shot.R.id;
  const T = shot.R.text;
  if (T === 'labels') {
    cairnLabels(root, shot, w, h);
    return [];
  }
  const els = T.map((b) => {
    const el = blockElement(b);
    root.appendChild(el);
    return el;
  });
  // quiet zones: one rectangle per block (the third absorbs any extras)
  const sx = bufferW / w, sy = bufferH / h, pad = 18;
  const rects = [];
  els.forEach((el, i) => {
    const r = el.getBoundingClientRect();
    const box = [r.left - pad, r.top - pad, r.right + pad, r.bottom + pad];
    if (i < 3) rects.push(box);
    else {
      const last = rects[2];
      rects[2] = [Math.min(last[0], box[0]), Math.min(last[1], box[1]), Math.max(last[2], box[2]), Math.max(last[3], box[3])];
    }
  });
  return rects.map(([l, t, r, b]) => [l * sx, (h - b) * sy, r * sx, (h - t) * sy]);
}
