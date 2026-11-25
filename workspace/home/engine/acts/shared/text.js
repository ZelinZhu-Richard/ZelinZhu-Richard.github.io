// Short handwritten-style notes drawn into a texture and laid on a surface
// (the plate act's callouts). The text is rasterised once with the system
// mono italic the sketches used; the texture keeps only coverage (alpha), the
// shader tints it and wipes it on from the left as if written. Without a
// canvas (plain node) there is no texture and the note is skipped.

export const TEXT_VERT = /* glsl */ `
varying vec2 vUv;
varying float vDist;
void main() {
  vUv = uv;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vDist = length(mv.xyz);
  gl_Position = projectionMatrix * mv;
}
`;

export const TEXT_FRAG = /* glsl */ `
uniform sampler2D tText;
uniform vec3 uColor;
uniform float uAlpha;
uniform float uReveal;
uniform vec2 uFog;
varying vec2 vUv;
varying float vDist;
void main() {
  float cov = texture2D(tText, vUv).a;
  // written left to right: a soft pen front sweeps across
  float m = clamp((uReveal * 1.08 - vUv.x) / 0.08, 0.0, 1.0);
  float a = cov * m * uAlpha * (1.0 - smoothstep(uFog.x, uFog.y, vDist));
  if (a < 0.002) discard;
  gl_FragColor = vec4(uColor * a, a);
}
`;

/** @returns {any} a 2D-capable canvas, or null */
function makeCanvas(w, h) {
  const g = /** @type {any} */ (globalThis);
  if (g.document && typeof g.document.createElement === 'function') {
    const c = g.document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  }
  if (typeof g.OffscreenCanvas === 'function') return new g.OffscreenCanvas(w, h);
  return null;
}

/**
 * Rasterises lines of text. Size is CSS px; `scale` device px per CSS px of
 * the raster (oversampled so it stays crisp when the camera comes closer).
 * @param {any} THREE
 * @param {string[]} lines
 * @param {{ px?: number, lineHeight?: number, font?: string, scale?: number, anisotropy?: number }} [o]
 * @returns {{ texture: any, width: number, height: number } | null} width / height in CSS px
 */
export function textTexture(THREE, lines, o = {}) {
  const px = o.px ?? 13;
  const lh = o.lineHeight ?? 1.35;
  const scale = o.scale ?? 4;
  const font = o.font ?? `italic 400 ${px * scale}px ui-monospace, "SF Mono", Menlo, Consolas, monospace`;
  const probe = makeCanvas(8, 8);
  const pctx = probe && probe.getContext('2d');
  if (!pctx) return null;
  pctx.font = font;
  const pad = Math.ceil(px * 0.3 * scale);
  const textW = Math.max(...lines.map((l) => pctx.measureText(l).width), 1);
  const W = Math.ceil(textW + pad * 2);
  const H = Math.ceil(lines.length * px * lh * scale + pad * 2);
  const canvas = makeCanvas(W, H);
  const ctx = canvas && canvas.getContext('2d');
  if (!ctx) return null;
  ctx.clearRect(0, 0, W, H);
  ctx.font = font;
  ctx.fillStyle = '#ffffff';
  ctx.textBaseline = 'alphabetic';
  lines.forEach((l, i) => ctx.fillText(l, pad, pad + (i + 0.78) * px * lh * scale));
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.NoColorSpace;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.anisotropy = o.anisotropy ?? 1;
  texture.needsUpdate = true;
  return { texture, width: W / scale, height: H / scale, pad: pad / scale };
}
