// Eggs: openable loot eggs (kind 'open') and pet eggs (kind 'pet'), tiers 0–6,
// states idle | shake | crack | open. Same 160 viewBox, outline and cel style as the pets,
// and the tier glow reuses the pet aura ladder.
//
// Loot egg: tier-coloured shell, speckles, a zigzag band with a gold star medallion.
// Pet egg:  pale shell with big tier-coloured spots and a paw print (something lives inside).

import { makeContext, svgRoot, cel, aura, ol, f, star4, glow, prismOverlay, rot, hash01 } from './rig.js';
import { OUTLINE, WHITE, GOLD, TIER_NAMES, mix } from './palette.js';

export const EGG_KINDS = Object.freeze(['open', 'pet']);
export const EGG_STATES = Object.freeze(['idle', 'shake', 'crack', 'open']);

const EGG = 'M80 28C106 28 127 66 127 101C127 130 106 147 80 147C54 147 33 130 33 101C33 66 54 28 80 28Z';
// Zigzag split line (left → right) used for cracks and the open halves.
const ZIG = [[30, 90], [40, 83], [48, 92], [57, 82], [66, 93], [75, 83], [84, 94], [93, 83], [102, 93], [111, 82], [120, 91], [130, 86]];
const zigD = ZIG.map(([x, y], i) => `${i ? 'L' : 'M'}${x} ${y}`).join('');
const TOP_REGION = `M-20 -40L180 -40L180 86${ZIG.slice().reverse().map(([x, y]) => `L${x} ${y}`).join('')}L-20 90Z`;
const BOTTOM_REGION = `M-20 90${ZIG.map(([x, y]) => `L${x} ${y}`).join('')}L180 86L180 200L-20 200Z`;

// Deterministic speckle field inside the shell.
function speckles(seed, n, avoid = () => false) {
  const out = [];
  for (let i = 0; out.length < n && i < n * 12; i += 1) {
    const x = 38 + hash01(`${seed}x${i}`) * 84, y = 36 + hash01(`${seed}y${i}`) * 106;
    const inside = ((x - 80) / 44) ** 2 + ((y - 98) / 56) ** 2 < 0.82 && !(y < 52 && Math.abs(x - 80) > 18);
    if (inside && !avoid(x, y)) out.push([x, y, hash01(`${seed}r${i}`), hash01(`${seed}a${i}`)]);
  }
  return out;
}

function lootShell(ctx) {
  const p = ctx.palette, t = ctx.tier;
  // Band follows the egg's curvature (lower in the middle) with zigzag edges.
  const bandTop = (x) => 104 + 7 * (1 - ((x - 80) / 48) ** 2);
  const xs = Array.from({ length: 11 }, (_, i) => 28 + i * 10.4);
  const top = xs.map((x, i) => [x, bandTop(x) + (i % 2 ? -3.5 : 3.5)]);
  const bot = xs.slice().reverse().map((x, i) => [x, bandTop(x) + 16 + (i % 2 ? 3.5 : -3.5)]);
  const bandD = `M${[...top, ...bot].map(([x, y]) => `${f(x)} ${f(y)}`).join('L')}Z`;
  const edge = (pts) => `M${pts.map(([x, y]) => `${f(x)} ${f(y)}`).join('L')}`;
  const bandFill = t >= 5 ? mix(p.accent, '#ffffff', 0.15) : p.accent;
  const trimC = t >= 5 ? GOLD : p.belly;
  const dots = speckles(`loot${t}`, 16, (x, y) => y > 96 && y < 134).map(([x, y, r, a], i) =>
    `<ellipse cx="${f(x)}" cy="${f(y)}" rx="${f(1.4 + r * 2)}" ry="${f(1.1 + r * 1.4)}" transform="rotate(${f(a * 180)} ${f(x)} ${f(y)})" fill="${i % 3 ? p.accent : p.belly}" opacity="${i % 3 ? 0.45 : 0.85}"/>`).join('');
  const mythicStars = t === 4 ? [[56, 62], [100, 56], [110, 86], [50, 90], [76, 46]].map(([x, y]) => star4(x, y, 5, WHITE, 'opacity=".8"')).join('') : '';
  const band = `<path d="${bandD}" fill="${bandFill}"/>` +
    `<path d="${edge(top)}" fill="none" stroke="${trimC}" stroke-width="2" stroke-linejoin="round" transform="translate(0 3)" opacity=".85"/>` +
    `<path d="${edge(bot.slice().reverse())}" fill="none" stroke="${trimC}" stroke-width="2" stroke-linejoin="round" transform="translate(0 -3)" opacity=".85"/>` +
    `<path d="${edge(top)}" fill="none" ${ol(2.5)}/><path d="${edge(bot.slice().reverse())}" fill="none" ${ol(2.5)}/>`;
  const light = `<ellipse cx="66" cy="72" rx="26" ry="34" fill="${p.belly}" opacity=".35"/>`;
  const shine = `<g class="egg-shine" transform="translate(-90 0)"><path d="M20 160L52 20L66 20L34 160Z" fill="${WHITE}" opacity=".35"/></g>`;
  const prism = t === 6 ? prismOverlay(ctx, 0.55) : '';
  const shell = cel(ctx, 'shell', EGG, { fill: p.body, shade: p.shade, shadeOffset: [-8, -7], inner: light + dots + mythicStars + band + prism + shine });
  // Medallion with a 4-point star (glows from Epic up).
  const my = bandTop(80) + 8;
  const medal = `<g class="egg-medal"${t >= 3 ? ` ${glow(ctx, t === 6 ? '#ffd3ec' : p.body, 2.2)}` : ''}><circle cx="80" cy="${f(my)}" r="12.5" fill="${GOLD}" ${ol(3)}/>` +
    `<circle cx="80" cy="${f(my)}" r="8.5" fill="none" stroke="#e3b23c" stroke-width="1.5"/>${star4(80, my, 13, t === 0 ? p.accent : p.accent, ol(1.2))}<circle cx="${f(76)}" cy="${f(my - 5)}" r="1.6" fill="${WHITE}"/></g>`;
  return shell + medal;
}

function petShell(ctx) {
  const p = ctx.palette, t = ctx.tier;
  const base = t === 0 ? '#f3f0f7' : mix(p.belly, '#ffffff', 0.25);
  const shade = mix(p.body, p.belly, 0.35);
  const spots = [[58, 62, 10, 7, 20], [99, 52, 7, 5.5, -30], [106, 96, 12, 9, 70], [52, 112, 9.5, 7, -15], [86, 130, 9, 6, 10], [96, 74, 4.5, 3.5, 0], [64, 136, 4, 3, 30], [70, 44, 4.5, 3.4, -20]]
    .map(([x, y, rx, ry, a], i) => `<g transform="rotate(${a} ${x} ${y})"><ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="${i % 3 === 2 ? p.shade : p.body}"/><ellipse cx="${f(x - rx * 0.25)}" cy="${f(y - ry * 0.3)}" rx="${f(rx * 0.45)}" ry="${f(ry * 0.35)}" fill="${WHITE}" opacity=".25"/></g>`).join('');
  const dots = speckles(`pet${t}`, 12, (x, y) => Math.hypot(x - 80, y - 100) < 16).map(([x, y, r]) =>
    `<circle cx="${f(x)}" cy="${f(y)}" r="${f(1 + r * 1.4)}" fill="${p.accent}" opacity=".5"/>`).join('');
  const paw = (() => {
    const c = t >= 5 ? GOLD : p.accent;
    const toes = [[-7, -6], [-2.5, -10], [2.5, -10], [7, -6]].map(([x, y]) => `<ellipse cx="${80 + x}" cy="${100 + y}" rx="2.6" ry="3.2" fill="${c}"/>`).join('');
    return `<g class="egg-paw" opacity=".6"><path d="M80 94C86 94 90 99 89 103C88 106 84 106 80 105C76 106 72 106 71 103C70 99 74 94 80 94Z" fill="${c}"/>${toes}</g>`;
  })();
  const mythicStars = t === 4 ? [[46, 86], [112, 70], [74, 118], [104, 122]].map(([x, y]) => star4(x, y, 5, WHITE, 'opacity=".8"')).join('') : '';
  const glowIn = `<ellipse class="egg-life" cx="80" cy="104" rx="30" ry="30" fill="${p.body}" opacity=".18"/>`;
  const light = `<ellipse cx="66" cy="72" rx="26" ry="34" fill="${WHITE}" opacity=".35"/>`;
  const prism = t === 6 ? prismOverlay(ctx, 0.6) : '';
  const shine = `<g class="egg-shine" transform="translate(-90 0)"><path d="M20 160L52 20L66 20L34 160Z" fill="${WHITE}" opacity=".35"/></g>`;
  const trimLine = t === 5 ? `<path d="M44 66C52 46 66 34 80 33" fill="none" stroke="${GOLD}" stroke-width="1.5" stroke-linecap="round"/>` : '';
  return cel(ctx, 'shell', EGG, { fill: base, shade, shadeOffset: [-8, -7], inner: glowIn + light + spots + dots + mythicStars + paw + prism + shine + trimLine });
}

const specularBits = `<ellipse cx="57" cy="60" rx="6" ry="12" transform="rotate(24 57 60)" fill="${WHITE}" opacity=".85"/><circle cx="66" cy="44" r="2.6" fill="${WHITE}" opacity=".9"/>`;

// The crack runs inside the shell: its ends are inset 3 units and the whole crack (and its light leak)
// is clipped to the shell, so nothing floats outside the egg.
const CRACK = ZIG.map(([x, y], i, a) => (i === 0 ? [x + 3, y - 0.7] : i === a.length - 1 ? [x - 3, y + 0.5] : [x, y]));
const crackD = CRACK.map(([x, y], i) => `${i ? 'L' : 'M'}${f(x)} ${f(y)}`).join('');

function cracks(ctx, visible) {
  const p = ctx.palette;
  const leakId = ctx.defOnce('leak', (full) => `<filter id="${full}" x="-20%" y="-50%" width="140%" height="200%"><feGaussianBlur stdDeviation="2.5"/></filter>`);
  const branches = 'M57 82L54 74M84 94L88 101M111 82L114 75M44 86L41 80';
  const shellClip = ctx.defOnce('clip-shell', (cid) => `<clipPath id="${cid}"><path d="${EGG}"/></clipPath>`);
  return `<g class="egg-cracks"${visible ? '' : ' display="none"'}><g clip-path="url(#${shellClip})">` +
    `<path d="${crackD}" fill="none" stroke="${mix(p.belly, '#ffffff', 0.5)}" stroke-width="8" stroke-linejoin="round" filter="url(#${leakId})" class="egg-leak"/>` +
    `<path class="egg-crackline" d="${crackD}" pathLength="100" fill="none" ${ol(3)}/>` +
    `<path class="egg-crackline" d="${branches}" pathLength="100" fill="none" ${ol(2.2)}/></g></g>`;
}

/**
 * renderEgg({ kind: 'open'|'pet', tier, state: 'idle'|'shake'|'crack'|'open', size, uid?, animate?, focus?, label? }) → svg string.
 * Triggered one-shot classes on the root: egg--shake, egg--crack (and the 'open' state plays its
 * burst once when inserted). Idle motion (wiggle, shine, inner life) runs while animate is true
 * (.egg--live); the tier aura animates only on the focused egg (.egg--focus; focus defaults to
 * size ≥ 200, the reveal stage), like pets.
 */
export function renderEgg({ kind = 'open', tier = 0, state = 'idle', size = 128, uid, animate = true, focus = Number(size) >= 200, label, className = '' } = {}) {
  const k = EGG_KINDS.includes(kind) ? kind : 'open';
  const st = EGG_STATES.includes(state) ? state : 'idle';
  const ctx = makeContext({ species: 'egg', tier, mood: 'healthy', size, uid, focus: animate });
  const p = ctx.palette;
  const au = aura(ctx, [80, 90]);
  const shellArt = (k === 'open' ? lootShell(ctx) : petShell(ctx)) + specularBits;
  let core;
  if (st !== 'open') {
    core = `<g class="egg-shell">${shellArt}</g>${cracks(ctx, st === 'crack')}`;
  } else {
    const topClip = ctx.defOnce('top', (full) => `<clipPath id="${full}"><path d="${TOP_REGION}"/></clipPath>`);
    const botClip = ctx.defOnce('bot', (full) => `<clipPath id="${full}"><path d="${BOTTOM_REGION}"/></clipPath>`);
    const glowIn = ctx.defOnce('inside', (full) => `<radialGradient id="${full}" cx=".5" cy=".4" r=".7"><stop offset="0" stop-color="${WHITE}"/><stop offset=".55" stop-color="${p.belly}"/><stop offset="1" stop-color="${p.body}"/></radialGradient>`);
    const beamId = ctx.defOnce('beam', (full) => `<linearGradient id="${full}" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="${WHITE}" stop-opacity=".9"/><stop offset=".45" stop-color="${p.belly}" stop-opacity=".45"/><stop offset="1" stop-color="${p.body}" stop-opacity="0"/></linearGradient>`);
    const lip = `M${ZIG.map(([x, y]) => `${x} ${y}`).join('L')}C126 97 108 103 80 103C52 103 34 97 30 90Z`;
    core =
      `<g class="egg-beam"><path d="M36 92L18 6L142 6L124 92Z" fill="url(#${beamId})"/></g>` +
      `<g class="egg-bottom"><g clip-path="url(#${botClip})">${shellArt}</g><path d="${lip}" fill="url(#${glowIn})" ${ol(3)}/></g>` +
      `<g class="egg-cap" style="transform-origin:80px 88px" transform="translate(-14 -20) rotate(-24)"><g clip-path="url(#${topClip})">${shellArt}</g><path d="${zigD}" fill="none" ${ol(3.5)}/></g>`;
  }
  let burstBack = '', burstFront = '';
  if (st === 'open') {
    const rayIds = [WHITE, p.body].map((c, i) => ctx.defOnce(`burst-${i}`, (full) => `<radialGradient id="${full}" gradientUnits="userSpaceOnUse" cx="80" cy="88" r="78"><stop offset=".3" stop-color="${c}" stop-opacity=".95"/><stop offset="1" stop-color="${c}" stop-opacity="0"/></radialGradient>`));
    const coreGlow = ctx.defOnce('burst-core', (full) => `<radialGradient id="${full}"><stop offset="0" stop-color="${WHITE}"/><stop offset=".5" stop-color="${p.belly}" stop-opacity=".8"/><stop offset="1" stop-color="${p.body}" stop-opacity="0"/></radialGradient>`);
    burstBack = `<g class="egg-burst"><circle class="egg-core-glow" cx="80" cy="84" r="40" fill="url(#${coreGlow})"/><g class="egg-rays" style="transform-origin:80px 88px">${Array.from({ length: 12 }, (_, i) => {
      const pts = [[72, 70], [88, 70], [80, 6]].map((pt) => rot(pt, i * 30 + 15, [80, 88]));
      return `<path d="M${pts.map(([x, y]) => `${f(x)} ${f(y)}`).join('L')}Z" fill="url(#${rayIds[i % 2]})"/>`;
    }).join('')}</g></g>`;
    burstFront = `<g class="egg-sparks">${[[38, 52, 0], [122, 46, 1], [30, 96, 2], [132, 92, 3], [58, 22, 4], [106, 18, 5], [84, 8, 6], [20, 70, 7]].map(([x, y, i]) =>
      `<g class="egg-spark" style="--i:${i};--dx:${80 - x}px;--dy:${88 - y}px">${star4(x, y, 7 + (i % 3) * 2, i % 2 ? WHITE : p.belly, ol(1))}</g>`).join('')}</g>`;
  }
  const body =
    `<ellipse class="egg-shadow" cx="80" cy="149" rx="36" ry="5" fill="#000" opacity=".3"/>` +
    `<g class="egg-aura-back">${au.back}</g>${burstBack}` +
    `<g class="egg-wobble">${core}</g>` +
    `<g class="egg-aura-front">${au.front}</g>${burstFront}`;
  const kindName = k === 'open' ? 'egg' : 'pet egg';
  const text = label || `${TIER_NAMES[ctx.tier]} ${kindName}${st === 'idle' ? '' : `, ${st === 'open' ? 'opened' : st === 'crack' ? 'cracking' : 'shaking'}`}`;
  return svgRoot({
    size, label: text, defs: ctx.defs, body,
    classes: ['egg', `egg--kind-${k}`, `egg--tier-${ctx.tier}`, `egg--${p.key}`, `egg--state-${st}`, `egg--s${size}`, ctx.thumb && 'egg--thumb', animate && !ctx.thumb && 'egg--live',
      animate && focus && !ctx.thumb && 'egg--focus', !animate && 'egg--still', className],
  });
}
