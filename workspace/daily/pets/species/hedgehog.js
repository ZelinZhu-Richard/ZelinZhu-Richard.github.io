// Bramblekin (hedgehog): CONTENT.md §A.2 "Bramblekin (hedgehog, Keeper 25)".
// A round chibi collector: a fan of 13 soft-pointed spines (tips on r 54 around (80, 84)) with a
// centre crease each, a round body-coloured head framing a pale heart mask (forehead and cheek band),
// a button nose, a bean belly and two little paws held together in front.
//
// Layering (see rig.js): the 6 lower "back" spines sit in g-tail behind the torso (visible down to
// y ≈ 128); the 7 upper spines, ears, head and mask are in g-head (head in front of the top of the
// body). A cosmetic sits on the crown (headTop 80,30) in front of the top spines; only the two
// spines at ±46° are repeated in g-occlude-front (clipped outside the head) so a hat brim tucks
// behind them. headTop (80, 35) puts the hat band on the spine crown, just above the head. Every spine is its own <g class="hh-sp"> so the idle ripple can scale each in turn
// (pets.css, hedgehog block).
// Owner-review deviations from A.2 (art pass 2026-10-24): 13 spines instead of 11, a smaller heart
// mask (x 56–104, y 54–96), only the ±46° spines in occlude-front, headTop (80, 35), starving
// spines lean forward 12° instead of 20°.

import { cel, face, specular, star4, glow, trim, prismOverlay, ol, f } from '../rig.js';
import { OUTLINE, WHITE, GOLD, mix } from '../palette.js';

const AURA_CENTER = [80, 90];
const FAN_C = [80, 84];
const R_IN = 22; // inner end of each spine (always hidden under the head or torso)
const R_V = 40; // valley radius between spines
const HALF_W = 9.5; // spine half-width at the valley
const STEP = 23; // degrees between spines (13 spines span ±138°)
const THETAS = Array.from({ length: 13 }, (_, i) => (i - 6) * STEP);
const BACK = [-138, 138, -115, 115, -92, 92]; // draw order (lowest first), g-tail
const HEAD = [-69, 69, -46, 46, -23, 23, 0]; // g-head, behind the ears and head
const OCCLUDE = [-46, 46]; // repeated in occlude-front, in front of a hat brim

// Mood geometry. lean: tips sweep back (+) or bend forward (−) in degrees around each spine's base;
// rT: tip radius; fanDy: fan centre drop; ear: droop (deg, + = down); noseDy: nose drop;
// paws: [left, right] centres.
const POSE = {
  healthy: { lean: 4, rT: 54, fanDy: 0, ear: 0, noseDy: 0, paws: [[71.5, 117], [88.5, 117]] },
  happy: { lean: 6, rT: 55.5, fanDy: 0, ear: -8, noseDy: 0, paws: [[75, 114.5], [85, 114.5]] },
  hungry: { lean: 1, rT: 52.5, fanDy: 1, ear: 15, noseDy: 2, paws: [[71, 123], [89, 123]] },
  starving: { lean: -12, rT: 52, fanDy: 2, ear: 26, noseDy: 2, paws: [[70, 124], [90, 124]] },
};
// Where both paws meet to hold the food while eating (the orb sits between them).
const HOLD = [[73, 106], [87, 106]];
const SHOULDERS = [[54.5, 108.5], [105.5, 108.5]];
const HOLD_ORB = [80, 104];
const PAW_R = [8.5, 6.5];

// ---------- geometry helpers ----------

const rad = (d) => (d * Math.PI) / 180;
const P = ([x, y]) => `${f(x)} ${f(y)}`;
const rotAbout = ([x, y], a, [cx, cy]) => {
  const c = Math.cos(rad(a)), s = Math.sin(rad(a));
  return [cx + (x - cx) * c - (y - cy) * s, cy + (x - cx) * s + (y - cy) * c];
};

/**
 * One spine: a leaf with a soft point (tip roundness ~3), half-width 9.5 at the valley, built in a
 * local frame pointing up from the fan centre, leaned around its base, then rotated to theta.
 */
function spine(theta, pose) {
  const c = [FAN_C[0], FAN_C[1] + pose.fanDy];
  const back = BACK.includes(theta);
  const rT = back ? pose.rT - 1.5 : pose.rT;
  const lean = theta === 0 ? 0 : Math.sign(theta) * pose.lean;
  const base = [0, -R_V];
  const L = (pts) => pts.map((q) => rotAbout(q, lean, base)); // lean the part above the valley
  const [c1, c2, tl, tq, tr, c3, c4] = L([
    [-9.6, -R_V - 6.5], [-5.2, -rT + 5.2], [-1.9, -rT + 1.1], [0, -rT - 0.4], [1.9, -rT + 1.1], [5.2, -rT + 5.2], [9.6, -R_V - 6.5],
  ]);
  const local = { P0L: [-3.5, -R_IN], VL: [-HALF_W, -R_V], VR: [HALF_W, -R_V], P0R: [3.5, -R_IN], c1, c2, tl, tq, tr, c3, c4 };
  const G = (q) => rotAbout([c[0] + q[0], c[1] + q[1]], theta, c);
  const g = Object.fromEntries(Object.entries(local).map(([k, v]) => [k, G(v)]));
  const tipCurve = (m = G) => `C${P(m(c1))} ${P(m(c2))} ${P(m(tl))}Q${P(m(tq))} ${P(m(tr))}C${P(m(c3))} ${P(m(c4))} ${P(m(local.VR))}`;
  const d = `M${P(g.P0L)}L${P(g.VL)}${tipCurve()}L${P(g.P0R)}Z`;
  const outer = `M${P(g.VL)}${tipCurve()}`;
  // The outer curve pulled 3 units inward (Legendary trim / Ultra rim highlight).
  const k = (rT - 3.2) / rT;
  const inn = (q) => { const p = G(q); return [c[0] + (p[0] - c[0]) * k, c[1] + (p[1] - c[1]) * k]; };
  const inner = `M${P(inn(local.VL))}${tipCurve(inn)}`;
  // Centre crease from just above the valley toward the tip.
  const a = L([[0, -R_V - 2.5]])[0], b = L([[0, -rT + 5.5]])[0];
  const crease = `M${P(G(a))}L${P(G(b))}`;
  const axisMid = G(L([[0, -(R_V + rT) / 2]])[0]);
  return { d, outer, inner, crease, c, th: theta, rT, lean, T: g.tq, mid: axisMid, origin: G([0, -R_V + 6]) };
}

// Head: a round body-coloured head (x 46–114, y 44–104), fuller at the cheeks.
const HEAD_D = 'M80 44C100.5 44 114 57.5 114 75C114 92.5 99.5 104 80 104C60.5 104 46 92.5 46 75C46 57.5 59.5 44 80 44Z';
const HEAD_E = { cx: 80, cy: 74.5, rx: 34, ry: 30 };
// Face mask: a pale heart (lobes at the top, a soft rounded chin), x 56–104, y 54–96, so a band of
// body colour frames it as a forehead and cheeks.
const MASK = 'M80 62C76.3 55 66 53 61.2 57.6C56.8 61.8 56 70 58.2 77C61.2 87 70.4 95.8 80 95.8C89.6 95.8 98.8 87 101.8 77C104 70 103.2 61.8 98.8 57.6C94 53 83.7 55 80 62Z';
const TORSO = 'M80 90C101 90 112.5 108 111.5 127C110.5 141.5 101 147.5 80 147.5C59 147.5 49.5 141.5 48.5 127C47.5 108 59 90 80 90Z';
const BELLY = 'M80 101C94 101 102.5 110 102 121C101.5 133 92 140 80 140C68 140 58.5 133 58 121C57.5 110 66 101 80 101Z';
const FEET = [[68, 144.5], [92, 144.5]];
const EAR = 'M-6.6 3.5C-8 -4.5 -5 -10.5 0 -10.5C5 -10.5 8 -4.5 6.6 3.5Z';
const EAR_IN = 'M-3.4 2C-4.3 -3 -2.6 -6.6 0 -6.6C2.6 -6.6 4.3 -3 3.4 2Z';
const EARS = [[53, 52, -1], [107, 52, 1]];
const EAR_TILT = 40;

// ---------- tier art on one spine ----------

function annulus(ctx, key, r0, r1, c) {
  return ctx.defOnce(key, (full) => `<clipPath id="${full}"><path clip-rule="evenodd" d="M${f(c[0] - r1)} ${f(c[1])}a${r1} ${r1} 0 1 0 ${r1 * 2} 0a${r1} ${r1} 0 1 0 ${-r1 * 2} 0Z` +
    `M${f(c[0] - r0)} ${f(c[1])}a${r0} ${r0} 0 1 0 ${r0 * 2} 0a${r0} ${r0} 0 1 0 ${-r0 * 2} 0Z"/></clipPath>`);
}

function spineMarks(ctx, theta, s) {
  const p = ctx.palette, t = ctx.tier;
  const i = THETAS.indexOf(theta);
  let m = '';
  if (t === 1 || t === 2) {
    // Rare: pale tips (outer 30 % of each spine). SR adds a 5 px accent band across the fan.
    const tipR = R_V + (s.rT - R_V) * 0.62;
    m += `<g clip-path="url(#${annulus(ctx, 'tips', tipR, 90, s.c)})"><path d="${s.d}" fill="${p.belly}"/></g>`;
    if (t === 2) m += `<g clip-path="url(#${annulus(ctx, 'band', 41, 46, s.c)})"><path d="${s.d}" fill="${p.accent}"/></g>`;
  }
  if (t === 4) {
    // Mythic: leaf markings on 5 spines, white star specks on the others.
    if ([-92, -46, 0, 46, 92].includes(theta)) {
      const [x, y] = s.mid;
      m += `<g transform="translate(${f(x)} ${f(y)}) rotate(${f(theta + s.lean)})"><path d="M0 -6.5C3.8 -3.6 3.8 2.4 0 6C-3.8 2.4 -3.8 -3.6 0 -6.5Z" fill="${p.accent}"/>` +
        (ctx.thumb ? '' : `<path d="M0 -3.6L0 4" stroke="${p.belly}" stroke-width="1.2" stroke-linecap="round" opacity=".7"/>`) + `</g>`;
    } else if ([-69, -23, 23, 69].includes(theta)) {
      const [x, y] = s.mid;
      m += star4(x, y, 4.5, WHITE, 'opacity=".75"');
    }
  }
  if (t === 5 && i % 2 === 0) {
    // Legendary: sunburst bands, alternating gold wedges across the fan.
    const a = theta + s.lean * 0.6;
    const pol = (r, deg) => [s.c[0] + r * Math.sin(rad(deg)), s.c[1] - r * Math.cos(rad(deg))];
    const A = pol(30, a), B = pol(s.rT + 4, a - 5.5), C = pol(s.rT + 4, a + 5.5);
    m += `<path d="M${P(A)}L${P(B)}L${P(C)}Z" fill="${GOLD}" opacity=".95"/>`;
  }
  if (t === 6) {
    // Ultra: luminous prismatic tips forming one continuous scalloped rim.
    const gid = ctx.defOnce('rim-grad', (full) => `<linearGradient id="${full}" gradientUnits="userSpaceOnUse" x1="26" y1="40" x2="134" y2="120">` +
      ['#fff3b0', '#ffd3ec', '#cfe8ff', '#d8ffef', '#fff3b0', '#ffd3ec', '#cfe8ff', '#d8ffef'].map((c, k, a) => `<stop offset="${f(k / (a.length - 1))}" stop-color="${c}"/>`).join('') + `</linearGradient>`);
    m += `<g clip-path="url(#${annulus(ctx, 'rim', R_V + (s.rT - R_V) * 0.4, 90, s.c)})"><path d="${s.d}" fill="url(#${gid})"/></g>`;
  }
  return m;
}

/**
 * A set of spines drawn in two passes so the fan reads as one coat: every fill first (with its own
 * lower-right cel shade and tier marks), then every outer contour (4 px), the centre crease and the
 * tier trims. Each spine's pieces share `.hh-sp` + --i + origin so the ripple moves them together.
 */
function spineSet(ctx, thetas, pose) {
  const p = ctx.palette;
  const dark = mix(p.shade, OUTLINE, 0.2);
  const geo = thetas.map((th) => [th, spine(th, pose)]);
  const wrap = (th, s, inner) => `<g class="hh-sp" style="--i:${THETAS.indexOf(th)};transform-origin:${f(s.origin[0])}px ${f(s.origin[1])}px">${inner}</g>`;
  const fills = geo.map(([th, s]) => wrap(th, s, cel(ctx, `sp${THETAS.indexOf(th)}`, s.d, { fill: p.shade, shade: ctx.thumb ? null : dark, shadeOffset: [-2.6, -3.2], inner: spineMarks(ctx, th, s), outline: false }))).join('');
  const lines = geo.map(([th, s]) => {
    let top = `<path d="${s.outer}" fill="none" ${ol()}/>`;
    if (ctx.tier !== 6 && !ctx.thumb) top += `<path class="thin" d="${s.crease}" fill="none" stroke="${p.accent}" stroke-width="1.5" stroke-linecap="round" opacity=".85"/>`;
    if (ctx.tier === 5 && (Math.abs(th) <= 23 || Math.abs(th) === 92)) top += trim(s.inner);
    if (ctx.tier === 6 && !ctx.thumb) top += `<path d="${s.inner}" fill="none" stroke="${WHITE}" stroke-width="1.6" stroke-linecap="round" opacity=".8"/>`;
    return wrap(th, s, top);
  }).join('');
  return fills + lines;
}

// ---------- species ----------

export default {
  id: 'hedgehog',
  name: 'Bramblekin',
  anchors: { headTop: [80, 35], brow: [80, 56], neck: [80, 100], chest: [80, 116], hand: [80, 118], mouth: [80, 105], accScale: 1 },
  auraCenter: AURA_CENTER,
  // Rare sparkles clear of the spine fan (they vanished on the spines at the default offsets).
  sparkles: [[22, 52], [140, 64]],
  idleClass: 'pet-idle--hedgehog',

  draw(ctx) {
    const p = ctx.palette, t = ctx.tier;
    const pose = POSE[ctx.mood] || POSE.healthy;
    const prism = t === 6 ? prismOverlay(ctx) : '';
    const fc = [FAN_C[0], FAN_C[1] + pose.fanDy];

    // Back spines peek out from behind the torso (down to y ≈ 128); a base disc closes the seams.
    const tail = `<circle cx="${fc[0]}" cy="${f(fc[1])}" r="${R_V - 1}" fill="${p.shade}"/>` + spineSet(ctx, BACK, pose);
    const headSpines = spineSet(ctx, HEAD, pose);

    // Ears sit on the head's top corners, in front of the spines and tucked behind the head.
    const earIn = mix(p.body, '#ff7fb6', 0.35);
    const ears = EARS.map(([x, y, side]) => {
      const a = side * (EAR_TILT + pose.ear);
      return `<g class="hh-ear" transform="translate(${x} ${y}) rotate(${f(a)})">${cel(ctx, `ear${side > 0 ? 'r' : 'l'}`, EAR, { fill: p.body, shade: p.shade, shadeOffset: [-2, -2.5] })}<path d="${EAR_IN}" fill="${earIn}"/></g>`;
    }).join('');

    const headArt = cel(ctx, 'headd', HEAD_D, { fill: p.body, shade: p.shade, shadeOffset: [-6, -6], inner: prism });
    const mask = cel(ctx, 'mask', MASK, { fill: p.belly, shade: mix(p.belly, p.body, 0.45), shadeOffset: [-4, -5], outline: false }) +
      `<path d="${MASK}" fill="none" stroke="${mix(p.body, p.shade, 0.55)}" stroke-width="2" stroke-linejoin="round"/>`;
    let headMarks = '';
    if (t === 5) headMarks = trim('M53 62C57.5 52 67.5 47.5 80 47.5C92.5 47.5 102.5 52 107 62');

    // Torso, belly, feet.
    const torso = cel(ctx, 'torso', TORSO, { fill: p.body, shade: p.shade, shadeOffset: [-7, -6], inner: prism });
    const belly = `<path d="${BELLY}" fill="${p.belly}"/>` +
      `<path d="M95.5 132C92 137 86.5 139.6 80 139.6" fill="none" stroke="${mix(p.belly, p.body, 0.55)}" stroke-width="3" stroke-linecap="round"/>`;
    const feet = FEET.map(([x, y], k) => {
      const toes = ctx.thumb ? '' : [-3.5, 0.5].map((dx) => `<path d="M${f(x + dx + (k ? 1 : -1))} ${f(y + 1.5)}l0 2.6" stroke="${OUTLINE}" stroke-width="1.6" stroke-linecap="round" opacity=".55"/>`).join('');
      return `<ellipse cx="${x}" cy="${y}" rx="10" ry="5.6" fill="${p.body}" ${ol()}/><ellipse cx="${f(x - 2.5)}" cy="${f(y - 1.6)}" rx="4" ry="1.6" fill="${WHITE}" opacity=".35"/>${toes}`;
    }).join('');

    // Arms: a short stub from the body side into a round paw; the two paws meet in front of the
    // belly (happy: overlapping). While eating each arm swings round its shoulder up to HOLD.
    const pawFill = mix(p.body, p.belly, 0.25);
    const bean = mix(pawFill, '#ff7fb6', 0.45);
    const deg = (v) => (Math.atan2(v[1], v[0]) * 180) / Math.PI;
    const norm = (d) => ((((d + 180) % 360) + 360) % 360) - 180;
    const paws = pose.paws.map(([x, y], k) => {
      const [sx, sy] = SHOULDERS[k];
      const a0 = deg([x - sx, y - sy]);
      const ra = norm(deg([HOLD[k][0] - sx, HOLD[k][1] - sy]) - a0);
      const rb = norm(deg([HOLD[k][0] - sx, HOLD[k][1] - 3.5 - sy]) - a0);
      const len = Math.hypot(x - sx, y - sy), ux = (x - sx) / len, uy = (y - sy) / len;
      const end = [x - ux * (PAW_R[0] - 1), y - uy * (PAW_R[0] - 1)];
      const arm = `M${f(sx + ux * 1.5)} ${f(sy + uy * 1.5)}L${P(end)}`;
      const beans = ctx.thumb ? '' : [-2.6, 0, 2.6].map((dx) => `<circle cx="${f(dx)}" cy="-2.6" r="1.1" fill="${bean}"/>`).join('');
      return `<g class="hh-arm hh-arm-${k ? 'r' : 'l'}" style="transform-origin:${sx}px ${sy}px;--ra:${f(ra)}deg;--rb:${f(rb)}deg">` +
        `<path d="${arm}" fill="none" stroke="${OUTLINE}" stroke-width="11" stroke-linecap="round"/><path d="${arm}" fill="none" stroke="${p.body}" stroke-width="4" stroke-linecap="round"/>` +
        `<g transform="translate(${x} ${y}) rotate(${f(k ? -8 : 8)})"><ellipse rx="${PAW_R[0]}" ry="${PAW_R[1]}" fill="${pawFill}" ${ol(3.2)}/>` +
        `<ellipse cx="${k ? 2 : -2}" cy="2.4" rx="4.4" ry="2.2" fill="${p.shade}" opacity=".45"/>${beans}</g></g>`;
    });
    // Paws meet in the middle: the left paw is drawn last when happy so the clasp overlaps.
    const arms = (ctx.mood === 'happy' ? paws[1] + paws[0] : paws.join(''));
    const [ox, oy] = HOLD_ORB;
    const held = `<g class="hh-held" opacity="0"><g class="hh-held-orb">${star4(ox, oy, 15, '#dfccff', ol(1.5))}<circle cx="${ox}" cy="${oy}" r="2.4" fill="${WHITE}" opacity=".5"/><circle cx="${f(ox - 0.6)}" cy="${f(oy - 0.6)}" r="1.2" fill="${WHITE}"/></g></g>`;

    // Tier accessory: the cross-body seed pouch (Epic → Legendary), carrying each tier's decoration.
    // Drawn at x 95–113 and mirrored onto the pet's right hip (viewer's left), clear of the hungry growl.
    let strap = '', pouch = '';
    if (t >= 3 && t <= 5) {
      const strapD = 'M57 102.5C70 105 88 111 99.5 122';
      strap = `<path d="${strapD}" fill="none" stroke="${OUTLINE}" stroke-width="6.5" stroke-linecap="round"/><path d="${strapD}" fill="none" stroke="${p.accent}" stroke-width="3" stroke-linecap="round"/>`;
      const bodyD = 'M96.6 124.5C95.4 131 97.6 137 104.25 137C110.9 137 113.1 131 111.9 124.5Z';
      const flapD = 'M95.2 124.6Q104.25 120.2 113.3 124.6Q112.4 130 104.25 131Q96.1 130 95.2 124.6Z';
      let deco = '';
      if (t === 3) {
        // Epic: a glowing crystal seed peeking out of the pouch.
        deco = `<g ${glow(ctx, '#c9a2ff', 2)}><path d="M108.5 114.5L111.8 119.4L108.5 123L105.2 119.4Z" fill="#c9a2ff" ${ol(2)}/><path d="M108.5 116L110 119.3L108.5 120.8Z" fill="${WHITE}" opacity=".85"/></g>`;
      }
      if (t === 4) {
        // Mythic: an acorn pin on the flap.
        deco = `<ellipse cx="104.25" cy="129.4" rx="2.9" ry="3.4" fill="#ffe4f2" ${ol(1.5)}/><path d="M100.7 127.4Q104.25 123.4 107.8 127.4Z" fill="#8a5a3b" ${ol(1.5)}/><path d="M104.25 124.4l0.6 -1.8" stroke="#5c3b22" stroke-width="1.4" stroke-linecap="round"/>`;
      }
      if (t === 5) {
        // Legendary: a gold clasp.
        deco = `<ellipse cx="104.25" cy="128.2" rx="3.6" ry="3" fill="${GOLD}" ${ol(1.8)}/><circle cx="103.1" cy="127.3" r="1" fill="${WHITE}"/>`;
      }
      pouch = (t === 3 ? deco : '') + `<path d="${bodyD}" fill="${p.belly}" ${ol(3)}/>` +
        `<path d="M99.5 133.5Q104.25 135.6 109 133.5" fill="none" stroke="${mix(p.belly, p.shade, 0.45)}" stroke-width="1.8" stroke-linecap="round"/>` +
        `<path d="${flapD}" fill="${mix(p.belly, p.shade, 0.3)}" ${ol(3)}/>` + (t === 3 ? `<circle cx="104.25" cy="129" r="1.6" fill="${p.accent}"/>` : deco);
    }
    // Mythic celestial specks on the body; Legendary trim on the shoulders.
    let bodyMarks = '';
    if (t === 4) bodyMarks = [[56, 116], [105, 112]].map(([x, y]) => star4(x, y, 4.5, WHITE, 'opacity=".7"')).join('');
    if (t === 5) bodyMarks = trim('M54.5 107C57.5 99 62 94.5 66 92.5') + trim('M94 92.5C98 94.5 102.5 99 105.5 107');

    // Face: bead eyes, button nose, a little ω mouth.
    const nose = `<g class="hh-nose"><ellipse cx="80" cy="${f(82 + pose.noseDy)}" rx="5.4" ry="4.5" fill="${OUTLINE}"/><ellipse cx="78.3" cy="${f(80.5 + pose.noseDy)}" rx="1.9" ry="1.2" fill="${WHITE}" opacity=".9"/></g>`;
    const mouthY = 90.5 + pose.noseDy * 0.5;
    const faceMarkup = face(ctx, {
      eyes: [[66, 72], [94, 72]],
      mouth: [80, mouthY],
      eyeSize: [12, 13.5],
      mouthWidth: 10,
      blushDx: 1, blushDy: 10,
      parts: {
        'mouth-smile': (c, o) => {
          const [x, y] = o.mouth;
          return `<g class="mouth-smile"><path d="M${f(x - 5.5)} ${f(y - 1.4)}Q${f(x - 2.75)} ${f(y + 3.4)} ${f(x)} ${f(y - 0.4)}Q${f(x + 2.75)} ${f(y + 3.4)} ${f(x + 5.5)} ${f(y - 1.4)}" fill="none" ${ol(2.8)}/></g>`;
        },
      },
    }) + nose;

    // The ±46° spines again, in front of any hat brim, clipped to outside the head (outline included).
    const { cx, cy, rx, ry } = HEAD_E;
    const clip = ctx.defOnce('crown', (full) => `<clipPath id="${full}"><path clip-rule="evenodd" d="M-20 -20H180V180H-20Z` +
      `M${cx - rx - 2} ${cy}a${rx + 2} ${ry + 2} 0 1 0 ${(rx + 2) * 2} 0a${rx + 2} ${ry + 2} 0 1 0 ${-(rx + 2) * 2} 0Z"/></clipPath>`);
    const crown = `<g clip-path="url(#${clip})">${spineSet(ctx, OCCLUDE, pose)}</g>`;

    return {
      tail,
      body: torso,
      legs: feet,
      belly,
      markings: bodyMarks + (strap ? `<g transform="translate(160 0) scale(-1 1)">${strap}</g>` : ''),
      arms: arms + held,
      'acc-body': pouch ? `<g class="hh-pouch" transform="translate(160 0) scale(-1 1)">${pouch}</g>` : '',
      head: headSpines + ears + headArt + mask + specular(61, 55) + headMarks,
      face: faceMarkup,
      'occlude-front': crown,
    };
  },

  silhouette() {
    const pose = POSE.healthy;
    const spines = THETAS.map((th) => `<path d="${spine(th, pose).d}"/>`).join('');
    const ears = EARS.map(([x, y, side]) => `<path transform="translate(${x} ${y}) rotate(${side * EAR_TILT})" d="${EAR}"/>`).join('');
    const feet = FEET.map(([x, y]) => `<ellipse cx="${x}" cy="${y}" rx="10" ry="5.6"/>`).join('');
    return `${spines}${ears}<path d="${TORSO}"/>${feet}<path d="${HEAD_D}"/>`;
  },
};
