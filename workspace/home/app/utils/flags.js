// URL switches for screenshots and debugging (CONTRACTS.md, "URL parameters").
// Pure: plain node can test it.
//   ?at=<u>         jump the scroll to section-unit position u (0..20) on load
//   ?nomotion=1     force the reduced-motion path (no scrub smoothing, no text animation)
//   ?webgl=0        force the no-WebGL fallback (the engine chunk is never loaded)
//   ?still          deterministic still frames in the engine
//   ?quality=<q>    auto | high | medium | low
import { SCENE_QUALITY } from '../../contract.mjs';

/**
 * @typedef {{
 *   at: number | null,
 *   nomotion: boolean,
 *   nowebgl: boolean,
 *   still: boolean,
 *   quality: 'auto' | 'high' | 'medium' | 'low',
 * }} HomeFlags
 */

/**
 * @param {string} [search] location.search
 * @returns {HomeFlags}
 */
export function parseFlags(search = '') {
  const params = new URLSearchParams(search);
  const raw = params.get('at');
  const at = raw === null || raw.trim() === '' ? Number.NaN : Number(raw);
  const quality = params.get('quality');
  return {
    at: Number.isFinite(at) ? at : null,
    nomotion: params.get('nomotion') === '1',
    nowebgl: params.get('webgl') === '0',
    still: params.has('still'),
    quality: quality && SCENE_QUALITY.includes(quality) ? /** @type {HomeFlags['quality']} */ (quality) : 'auto',
  };
}
