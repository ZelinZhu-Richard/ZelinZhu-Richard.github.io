import { WHITE_NOTES } from './music.js';
export const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, (a.z || 0) - (b.z || 0));
export function angle(a, b, c) {
  const u = [a.x - b.x, a.y - b.y, (a.z || 0) - (b.z || 0)];
  const v = [c.x - b.x, c.y - b.y, (c.z || 0) - (b.z || 0)];
  const den = Math.hypot(...u) * Math.hypot(...v);
  return den < 1e-8 ? 0 : Math.acos(Math.max(-1, Math.min(1, u.reduce((s, n, i) => s + n * v[i], 0) / den))) * 180 / Math.PI;
}
export function homography(corners) {
  if (corners.length !== 4) throw new Error('Four corners are required.');
  const targets = [[0, 0], [1, 0], [1, 1], [0, 1]], rows = [];
  corners.forEach(({ x, y }, i) => {
    const [u, v] = targets[i];
    rows.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u]);
    rows.push([0, 0, 0, x, y, 1, -v * x, -v * y, v]);
  });
  for (let col = 0; col < 8; col++) {
    let pivot = col;
    for (let i = col + 1; i < 8; i++) if (Math.abs(rows[i][col]) > Math.abs(rows[pivot][col])) pivot = i;
    [rows[pivot], rows[col]] = [rows[col], rows[pivot]];
    const n = rows[col][col];
    if (Math.abs(n) < 1e-10) throw new Error('The keyboard outline is too flat or crosses itself.');
    rows[col] = rows[col].map(v => v / n);
    for (let i = 0; i < 8; i++) if (i !== col) {
      const factor = rows[i][col]; rows[i] = rows[i].map((v, j) => v - factor * rows[col][j]);
    }
  }
  return [...rows.map(r => r[8]), 1];
}
export function project(h, p) {
  const d = h[6] * p.x + h[7] * p.y + h[8];
  return { x: (h[0] * p.x + h[1] * p.y + h[2]) / d, y: (h[3] * p.x + h[4] * p.y + h[5]) / d };
}
export function inverse(h) {
  const [a,b,c,d,e,f,g,i,j] = h;
  const out = [e*j-f*i,c*i-b*j,b*f-c*e,f*g-d*j,a*j-c*g,c*d-a*f,d*i-e*g,b*g-a*i,a*e-b*d];
  const det = a*out[0]+b*out[3]+c*out[6];
  if (Math.abs(det) < 1e-10) throw new Error('Invalid camera perspective.');
  return out.map(n => n / det);
}
export function validateLayout(layout) {
  if (!layout || layout.corners?.length !== 4 || layout.dividers?.length !== 9 || layout.blacks?.length !== 5) return false;
  try { homography(layout.corners); } catch { return false; }
  const c = layout.corners;
  const crosses = c.map((p,i) => { const q=c[(i+1)%4], r=c[(i+2)%4]; return (q.x-p.x)*(r.y-q.y)-(q.y-p.y)*(r.x-q.x); });
  if (crosses.some(n => n <= .0001)) return false;
  if (c.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y) || p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1)) return false;
  return layout.dividers.every((n,i,a) => Number.isFinite(n) && n >= 0 && n <= 1 && (!i || n-a[i-1]>.035))
    && layout.blacks.every(b => b.x0 >= 0 && b.x1 <= 1 && b.x1 > b.x0 && b.y0 >= 0 && b.y1 <= .85 && b.y1 > b.y0);
}
export function keyAt(layout, point) {
  if (point.x < 0 || point.x > 1 || point.y < 0 || point.y > 1) return null;
  for (const b of layout.blacks) if (point.x >= b.x0 && point.x <= b.x1 && point.y >= b.y0 && point.y <= b.y1) return b.midi;
  const i = layout.dividers.findIndex((n,i) => i > 0 && point.x <= n);
  return i > 0 ? WHITE_NOTES[i-1] : null;
}
// Project normalized camera coordinates into a contained video rectangle (never crop).
export function videoRect(width, height, videoWidth, videoHeight) {
  const scale = Math.min(width / videoWidth, height / videoHeight);
  return { x: (width-videoWidth*scale)/2, y: (height-videoHeight*scale)/2, w: videoWidth*scale, h: videoHeight*scale };
}
