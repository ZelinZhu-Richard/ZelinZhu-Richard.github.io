import {containRect, projectPoint} from './geometry.js';

function path(ctx, points) {
  ctx.beginPath();
  points.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
  ctx.closePath();
}

// Both layers use the same contained viewport and mirror transform.
export function drawCamera(ctx, source, rect) {
  ctx.save();
  ctx.translate(rect.x + rect.width, rect.y);
  ctx.scale(-1, 1);
  ctx.drawImage(source, 0, 0, rect.width, rect.height);
  ctx.restore();
}

export function drawPixelated(ctx, source, rect, corners, blockSize, buffer) {
  const width = Math.max(1, Math.ceil(rect.width / blockSize));
  const height = Math.max(1, Math.ceil(rect.height / blockSize));
  if (buffer.width !== width || buffer.height !== height) { buffer.width = width; buffer.height = height; }
  const small = buffer.getContext('2d');
  small.imageSmoothingEnabled = true;
  small.drawImage(source, 0, 0, width, height);
  ctx.save();
  path(ctx, corners.map(p => projectPoint(p, rect)));
  ctx.clip();
  ctx.imageSmoothingEnabled = false;
  drawCamera(ctx, buffer, rect);
  ctx.restore();
}

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas; this.ctx = canvas.getContext('2d', {alpha: false});
    this.buffer = document.createElement('canvas');
    this.motion = matchMedia('(prefers-reduced-motion: reduce)');
  }
  draw(video, state, time, blockSize) {
    const bounds = this.canvas.getBoundingClientRect();
    const scale = Math.min(devicePixelRatio || 1, 1.5, 1600 / Math.max(1, bounds.width));
    const width = Math.max(1, Math.round(bounds.width * scale)), height = Math.max(1, Math.round(bounds.height * scale));
    if (this.canvas.width !== width || this.canvas.height !== height) { this.canvas.width = width; this.canvas.height = height; }
    const ctx = this.ctx;
    ctx.fillStyle = '#090713'; ctx.fillRect(0, 0, width, height);
    if (!video.videoWidth || video.readyState < 2) return;
    const rect = containRect(video.videoWidth, video.videoHeight, width, height);
    drawCamera(ctx, video, rect);
    if (!state.active || !state.frame) return;
    drawPixelated(ctx, video, rect, state.frame.corners, blockSize * scale, this.buffer);
    const corners = state.frame.corners.map(p => projectPoint(p, rect));
    ctx.save();
    path(ctx, corners);
    ctx.strokeStyle = '#ad7cff'; ctx.lineWidth = 2 * scale; ctx.shadowColor = '#964cff'; ctx.shadowBlur = 22 * scale; ctx.stroke();
    ctx.shadowBlur = 0; ctx.strokeStyle = '#f1e4ff'; ctx.lineWidth = scale; ctx.stroke();
    const elapsed = time - state.activatedAt;
    if (!this.motion.matches && elapsed < 650) {
      const center = {x: corners.reduce((n, p) => n + p.x, 0) / 4, y: corners.reduce((n, p) => n + p.y, 0) / 4};
      const progress = elapsed / 650;
      const expansion = 1 + .12 * (1 - (1 - progress) ** 3);
      path(ctx, corners.map(p => ({x: center.x + (p.x - center.x) * expansion, y: center.y + (p.y - center.y) * expansion})));
      ctx.globalAlpha = (1 - progress) * .6; ctx.lineWidth = 2 * scale; ctx.stroke(); ctx.globalAlpha = 1;
    }
    for (const p of corners) {
      ctx.beginPath(); ctx.arc(p.x, p.y, 5 * scale, 0, Math.PI * 2); ctx.fillStyle = '#eee0ff'; ctx.fill();
      ctx.beginPath(); ctx.arc(p.x, p.y, 10 * scale, 0, Math.PI * 2); ctx.strokeStyle = '#c495ff'; ctx.lineWidth = scale; ctx.stroke();
    }
    if (!this.motion.matches) {
      ctx.fillStyle = '#e8d2ff';
      for (let i = 0; i < 12; i++) {
        const edge = i % 4, a = corners[edge], b = corners[(edge + 1) % 4];
        const t = ((time / 4200) + i / 12) % 1;
        const x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t;
        ctx.globalAlpha = .25 + .6 * Math.sin(t * Math.PI);
        ctx.fillRect(x - scale, y - scale, 2 * scale, 2 * scale);
      }
    }
    ctx.restore();
  }
}
