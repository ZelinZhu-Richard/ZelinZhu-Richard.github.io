import {containRect, projectPoint} from './geometry.js';
import {fireballPose} from './fireball.js';

const CONNECTIONS = [[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[0,17],[17,18],[18,19],[19,20]];

export function drawHands(ctx, hands, rect, scale = 1) {
  ctx.save();
  ctx.strokeStyle = '#c8a6ff'; ctx.lineWidth = 1.5 * scale;
  for (const hand of hands) {
    const points = hand.map(point => projectPoint(point, rect));
    ctx.beginPath();
    for (const [a, b] of CONNECTIONS) { ctx.moveTo(points[a].x, points[a].y); ctx.lineTo(points[b].x, points[b].y); }
    ctx.stroke();
    points.forEach((point, index) => {
      const corner = index === 4 || index === 8;
      ctx.beginPath(); ctx.arc(point.x, point.y, (corner ? 5 : 2.5) * scale, 0, Math.PI * 2);
      ctx.fillStyle = corner ? '#fff2cd' : '#e7d6ff'; ctx.fill();
    });
  }
  ctx.restore();
}

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

export function drawFireballs(ctx, state, rect, time, scale, reducedMotion) {
  ctx.save();
  ctx.beginPath(); ctx.rect(rect.x, rect.y, rect.width, rect.height); ctx.clip();
  for (const palm of state.charging) {
    const center = projectPoint(palm.center, rect), radius = palm.size * rect.width;
    ctx.beginPath(); ctx.arc(center.x, center.y, radius * 1.4, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * palm.progress);
    ctx.strokeStyle = '#ffd999'; ctx.lineWidth = 2 * scale; ctx.stroke();
  }
  ctx.globalCompositeOperation = 'screen';
  for (const shot of state.shots) {
    const pose = fireballPose(shot, time, reducedMotion), center = projectPoint(pose, rect);
    const radius = pose.radius * rect.width;
    ctx.globalAlpha = pose.alpha;
    if (!reducedMotion) {
      const origin = projectPoint(shot.origin, rect);
      const trail = ctx.createLinearGradient(origin.x, origin.y, center.x, center.y);
      trail.addColorStop(0, '#ec381000'); trail.addColorStop(.65, '#ff581080'); trail.addColorStop(1, '#ffc05ddd');
      ctx.beginPath(); ctx.moveTo(origin.x, origin.y);
      ctx.quadraticCurveTo(center.x - radius * .8, origin.y, center.x - radius * .65, center.y);
      ctx.lineTo(center.x + radius * .65, center.y);
      ctx.quadraticCurveTo(center.x + radius * .8, origin.y, origin.x, origin.y);
      ctx.fillStyle = trail; ctx.fill();
    }
    const halo = ctx.createRadialGradient(center.x, center.y, radius * .15, center.x, center.y, radius * 2.3);
    halo.addColorStop(0, '#ffe4abcc'); halo.addColorStop(.35, '#ff8a3770'); halo.addColorStop(1, '#ff3b1000');
    ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(center.x, center.y, radius * 2.3, 0, Math.PI * 2); ctx.fill();
    const core = ctx.createRadialGradient(center.x - radius * .15, center.y - radius * .2, 0, center.x, center.y, radius * 1.25);
    core.addColorStop(0, '#fffceb'); core.addColorStop(.24, '#ffe397'); core.addColorStop(.55, '#ff9c2c'); core.addColorStop(.8, '#f94612'); core.addColorStop(1, '#b61b0400');
    ctx.beginPath();
    for (let i = 0; i <= 48; i++) {
      const angle = i / 48 * Math.PI * 2;
      const flicker = reducedMotion ? 0 : Math.sin(angle * 7 + time / 85) * .1 + Math.cos(angle * 11 - time / 130) * .06;
      const r = radius * (1 + flicker), x = center.x + Math.cos(angle) * r, y = center.y + Math.sin(angle) * r;
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.closePath(); ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = core; ctx.fill();
    ctx.globalCompositeOperation = 'screen';
    if (!reducedMotion) for (let i = 0; i < 24; i++) {
      const phase = (pose.progress * 1.8 + i * .618) % 1, angle = i * 2.4 + shot.id;
      const spread = radius * (1 + phase * 1.3);
      ctx.globalAlpha = pose.alpha * (1 - phase) * .75;
      ctx.fillStyle = i % 3 ? '#ffbb61' : '#fff2bd';
      ctx.beginPath(); ctx.arc(center.x + Math.cos(angle) * spread, center.y + Math.sin(angle) * spread + phase * radius, (1 + (1 - phase) * 2) * scale, 0, Math.PI * 2); ctx.fill();
    }
  }
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
    if (state.mode === 'fireball') {
      drawHands(ctx, state.hands, rect, scale);
      drawFireballs(ctx, state, rect, time, scale, this.motion.matches);
      return;
    }
    if (!state.active || !state.frame) { drawHands(ctx, state.hands || [], rect, scale); return; }
    drawPixelated(ctx, video, rect, state.frame.corners, blockSize * scale, this.buffer);
    drawHands(ctx, state.hands || [], rect, scale);
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
