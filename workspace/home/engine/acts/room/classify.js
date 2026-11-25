// The room act's pure half: what each node and material of the shipped room GLB is,
// the anchors, the quality table and the light model. No three, no DOM: node checks it
// against the real manifest and GLB JSON.
//
// The GLB (assets-src/room/pack_room.py, manifest v1) stores:
//  - unlit materials only. LM_* are baked atlases: the texel IS the final colour
//    (light x albedo + emission), saved through Blender's display transform, so it is
//    drawn unlit (sRGB texture -> linear in the fetch -> sRGB in the film finish: an
//    identity). *_Unlit are an object's own image (screens, desk mat, board, pictures).
//    Unlit_<rrggbb>_e<strength> are constant emitters, colour normalised to max 1, the
//    Blender emission strength in the name and in extras.emit. Glass_Export is
//    alpha-blended glass. Contact_Shadow is an unlit black decal whose alpha is the
//    texture. The sea is Unlit_010305_e0.
//  - quantized meshes positioned by their node (translation + uniform scale); only
//    Outside_Land, Skyline and Sea keep float positions and no transform.
//  - anchors as mesh-less nodes Anchor_* with extras { facing, size, bounds_min,
//    bounds_max, beat?, height?, radius?, yaw? }, three's Y-up metres.

import { GROUND_Y, ARMILLARY } from '../../instrument/layout.js';
import { TIERS, clampTier } from '../../quality/tiers.js';

const DEG = Math.PI / 180;

/**
 * Render layers. The far outside (km away) is drawn by its own camera into its own
 * target, so it never shares the room camera's depth range.
 */
export const LAYERS = Object.freeze({ ROOM: 0, OUT: 1, BG_MAIN: 2, BG_REFL: 3, FLOOR: 4, SEA: 5, DUST: 6 });

/** @param {...number} ls */
export const layerMask = (...ls) => ls.reduce((m, l) => m | (1 << l), 0);

/** Layer masks per pass. */
export const MASKS = Object.freeze({
  room: layerMask(LAYERS.ROOM, LAYERS.BG_MAIN, LAYERS.FLOOR, LAYERS.DUST),
  out: layerMask(LAYERS.OUT, LAYERS.SEA),
  mirrorOut: layerMask(LAYERS.OUT),
  mirrorRoom: layerMask(LAYERS.ROOM, LAYERS.BG_REFL),
  sea: layerMask(LAYERS.OUT),
});

export const OUTSIDE_NODES = Object.freeze(['Outside_Land', 'Skyline']);
/** Status lights and the city ignore the room's light switch. */
export const ALWAYS_ON_NODES = Object.freeze(['Compute_Rack', 'Outside_Land', 'Skyline']);
export const SCREEN_NODES = Object.freeze(['Monitor_Left_Screen', 'Monitor_Center_Screen', 'Monitor_Right_Screen', 'Desk_Mat']);
/** The desk lamp: its filament warms first (the reveal), the room follows. */
export const LAMP_NODE = 'Desk_Lamp';
export const WINDOW_NODE = 'Window_Glass';
export const SHADOW_NODE = 'Instrument_Contact_Shadow';

/** Nodes the act animates or reads; the loader reports any that are missing. */
export const REQUIRED_NODES = Object.freeze([
  'Monitor_Left_Screen', 'Monitor_Center_Screen', 'Monitor_Right_Screen', 'Desk_Mat',
  'Window_Glass', 'Desk_Lamp', 'Floor', 'Sea', 'Outside_Land', 'Skyline', 'Instrument_Contact_Shadow',
  'Globe_Lamp_Foot', 'Globe_Lamp_Head', 'Globe_Lamp_Mezz', 'Ring_Light', 'Board',
]);

export const EMIT_RE = /^Unlit_([0-9a-f]{6})_e([0-9.]+)$/;

const OUTSIDE = new Set(OUTSIDE_NODES);
const ALWAYS = new Set(ALWAYS_ON_NODES);
const SCREENS = new Set(SCREEN_NODES);

/**
 * @typedef {{
 *   kind: 'sea' | 'shadow' | 'floor' | 'bake' | 'screen' | 'image' | 'emit' | 'glass' | 'fallback',
 *   layer: number,
 *   lit?: boolean,          // bake/image: dims with the room lights (false for the outside's atlas)
 *   group?: 'lamp' | 'room' | 'always' | 'outside', // emit: which switch drives it
 *   strength?: number,      // emit: Blender emission strength
 *   window?: boolean,       // glass: the window wall (darker, more transmissive)
 * }} MaterialClass
 */

/**
 * What a mesh's material is, from its top-level node name and its glTF material.
 * @param {{ node: string, name: string, emit?: number, transparent?: boolean }} m
 * @returns {MaterialClass}
 */
export function classify({ node, name = '', emit, transparent = false }) {
  if (node === 'Sea') return { kind: 'sea', layer: LAYERS.SEA };
  if (name === 'Contact_Shadow' || node === SHADOW_NODE) return { kind: 'shadow', layer: LAYERS.ROOM };
  if (name === 'LM_Floor' || node === 'Floor') return { kind: 'floor', layer: LAYERS.FLOOR };
  const outside = OUTSIDE.has(node);
  const layer = outside ? LAYERS.OUT : LAYERS.ROOM;
  if (name.startsWith('LM_')) return { kind: 'bake', layer, lit: !outside };
  if (name.endsWith('_Unlit')) return SCREENS.has(node) ? { kind: 'screen', layer } : { kind: 'image', layer, lit: !outside };
  const em = EMIT_RE.exec(name);
  const ex = Number(emit);
  if (em || (emit !== undefined && emit !== null && Number.isFinite(ex))) {
    const strength = em ? Number(em[2]) : ex;
    // the city and coast stay on (but the false-space beat hides the whole outside)
    const group = outside ? 'outside' : ALWAYS.has(node) ? 'always' : node === LAMP_NODE ? 'lamp' : 'room';
    return { kind: 'emit', layer, group, strength };
  }
  if (name === 'Glass_Export' || transparent) return { kind: 'glass', layer, window: node === WINDOW_NODE };
  return { kind: 'fallback', layer, lit: !outside };
}

// ----------------------------------------------------------------- anchors ---

export const ANCHOR_NAMES = Object.freeze({
  instrument: 'Anchor_Instrument',
  monitorLeft: 'Anchor_Monitor_Left',
  monitorCenter: 'Anchor_Monitor_Center',
  board: 'Anchor_Board',
  bed: 'Anchor_Bed',
  window: 'Anchor_Window',
  notebook: 'Anchor_Notebook',
  books: 'Anchor_Books',
});

/**
 * @typedef {{
 *   name: string, position: number[], facing: number[], size: number[],
 *   boundsMin: number[], boundsMax: number[], beat: number | null,
 *   height?: number, radius?: number, yaw?: number,
 * }} RoomAnchor
 */

/**
 * One anchor from a node's position and its glTF extras (or a manifest entry, whose
 * fields are the same).
 * @param {string} name
 * @param {number[]} position
 * @param {Record<string, any>} [extras]
 * @returns {RoomAnchor}
 */
export function readAnchor(name, position, extras = {}) {
  const v = (/** @type {any} */ a, /** @type {number[]} */ d) => (Array.isArray(a) && a.length >= 3 && a.every(Number.isFinite) ? a.slice(0, 3) : d.slice());
  /** @type {RoomAnchor} */
  const out = {
    name,
    position: v(position, [0, 0, 0]),
    facing: v(extras.facing, [0, 0, 1]),
    size: v(extras.size, [0, 0, 0]),
    boundsMin: v(extras.bounds_min, position),
    boundsMax: v(extras.bounds_max, position),
    beat: Number.isInteger(extras.beat) ? extras.beat : null,
  };
  for (const k of ['height', 'radius', 'yaw']) if (Number.isFinite(extras[k])) out[k] = extras[k];
  return out;
}

/**
 * The anchors keyed by short name, from a { name: { position, ...extras } } map (the
 * manifest's `anchors`, or one built from the GLB's Anchor_* nodes). Missing ones fall
 * back to ANCHOR_DEFAULTS.
 * @param {Record<string, any> | null | undefined} byName
 * @returns {Record<keyof typeof ANCHOR_NAMES, RoomAnchor>}
 */
export function anchorsFrom(byName) {
  /** @type {any} */
  const out = {};
  for (const [key, name] of Object.entries(ANCHOR_NAMES)) {
    const src = (byName && byName[name]) || ANCHOR_SOURCE[name];
    out[key] = readAnchor(name, src.position, src);
  }
  return out;
}

// The manifest's anchors (public/home-assets/room/manifest.json), used until the GLB is in.
const ANCHOR_SOURCE = /** @type {Record<string, any>} */ ({
  Anchor_Instrument: { position: [-1.3, 0.77, -6.22], size: [0.2932, 0.414, 0.2932], bounds_min: [-1.4466, 0.77, -6.3666], bounds_max: [-1.1534, 1.184, -6.0734], height: 0.414, radius: 0.1466, yaw: 0.4887, facing: [0, 1, 0], beat: null },
  Anchor_Monitor_Left: { position: [-4.0341, 1.12, -6.4365], size: [0.6887, 0.44, 0.3662], bounds_min: [-4.3785, 0.9, -6.6196], bounds_max: [-3.6898, 1.34, -6.2534], beat: 13, facing: [0.4695, 0, 0.8829] },
  Anchor_Monitor_Center: { position: [-3.05, 1.15, -6.6195], size: [1.2, 0.5, 0], bounds_min: [-3.65, 0.9, -6.6195], bounds_max: [-2.45, 1.4, -6.6195], beat: 14, facing: [0, 0, 1] },
  Anchor_Board: { position: [1.15, 1.95, -6.955], size: [2.5, 1.5625, 0], bounds_min: [-0.1, 1.1688, -6.955], bounds_max: [2.4, 2.7313, -6.955], beat: 15, facing: [0, 0, 1] },
  Anchor_Bed: { position: [3.85, 0.58, -5.635], size: [2.1618, 1.4068, 1.9802], bounds_min: [2.7382, 0, -6.59], bounds_max: [4.9, 1.4068, -4.6098], beat: 16, facing: [-0.8745, 0, 0.485] },
  Anchor_Window: { position: [-3.01, 2.5, -7.01], size: [4.02, 5, 0.02], bounds_min: [-5.02, 0, -7.02], bounds_max: [-1, 5, -7], beat: 17, facing: [0, 0, 1] },
  Anchor_Notebook: { position: [-3.9, 0.7896, -6.1], size: [0.3192, 0.0161, 0.2302], bounds_min: [-4.0596, 0.7735, -6.2151], bounds_max: [-3.7404, 0.7896, -5.9849], facing: [0, 1, 0], beat: null },
  Anchor_Books: { position: [2.02, 0.593, -2.6195], size: [0.3222, 0.3, 0.3139], bounds_min: [1.8589, 0.443, -2.7764], bounds_max: [2.1811, 0.743, -2.4625], facing: [-0.7268, 0, 0.6869], beat: null },
});

/** The anchors as the manifest gives them (frozen copies). */
export const ANCHOR_DEFAULTS = Object.freeze(anchorsFrom(null));

/**
 * The instrument's own frame (layout.js, unit scale): feet underside at GROUND_Y, top of
 * the meridian ring's band at the armillary centre + R + 0.02 (the instrument's bounds).
 */
export const INSTRUMENT_UNITS = Object.freeze({ ground: GROUND_Y, top: ARMILLARY.c[1] + ARMILLARY.rings[0].R + 0.02, centre: ARMILLARY.c[1] });

/**
 * Where the instrument stands on the desk: its feet on the anchor (the base centre on
 * the desk top), scaled so its height matches the anchor's, turned by the anchor's yaw.
 * `position` is where the instrument's own origin lands in room metres, `yaw` is in
 * degrees about +Y (the choreography's frameMap convention), `scale` is metres per unit,
 * so { position, yaw, scale } is a drop-in for the choreography's ROOM_INSTRUMENT.
 * @param {RoomAnchor} anchor
 */
export function instrumentFrame(anchor) {
  const height = Number.isFinite(anchor.height) ? /** @type {number} */ (anchor.height) : anchor.size[1] > 0 ? anchor.size[1] : 0.414;
  const scale = height / (INSTRUMENT_UNITS.top - INSTRUMENT_UNITS.ground);
  const yawRad = Number.isFinite(anchor.yaw) ? /** @type {number} */ (anchor.yaw) : 0;
  const p = anchor.position;
  const position = [p[0], p[1] - INSTRUMENT_UNITS.ground * scale, p[2]];
  return Object.freeze({
    position: Object.freeze(position),
    yaw: yawRad / DEG,
    yawRad,
    scale,
    height,
    base: Object.freeze(p.slice()),
    /** The armillary's centre in room metres (what the cameras frame). */
    centre: Object.freeze([position[0], position[1] + INSTRUMENT_UNITS.centre * scale, position[2]]),
  });
}

// ----------------------------------------------------------------- quality ---

// Per tier: outside target (fraction of CSS size, MSAA samples), dust motes, texture
// filtering and which texture set to load. Mirror scales and the sky tier come from
// engine/quality/tiers.js so there is one table for every act.
const ROOM_TIERS = Object.freeze([
  Object.freeze({ outScale: 0.75, outSamples: 0, dust: 70, anisotropy: 1, set: 'phone' }),
  Object.freeze({ outScale: 1, outSamples: 0, dust: 120, anisotropy: 2, set: 'phone' }),
  Object.freeze({ outScale: 1, outSamples: 2, dust: 170, anisotropy: 8, set: 'desktop' }),
  Object.freeze({ outScale: 1, outSamples: 4, dust: 220, anisotropy: 8, set: 'desktop' }),
]);

/** Most dust motes any tier draws (the geometry holds this many). */
export const DUST_MAX = 220;

/**
 * The room's settings for a quality tier.
 * @param {unknown} t
 */
export function roomTier(t) {
  const tier = clampTier(t);
  const T = TIERS[tier];
  const R = ROOM_TIERS[tier];
  const on = T.reflection.enabled;
  return Object.freeze({
    tier,
    outScale: R.outScale,
    outSamples: R.outSamples,
    floor: on ? T.reflection.scale : 0,
    sea: on ? T.reflection.seaScale : 0,
    sky: T.sky,
    dust: R.dust,
    anisotropy: R.anisotropy,
    set: R.set,
  });
}

/**
 * Which texture set to load: 'desktop' from tier 2 up, else 'phone' (half width and
 * height); whichever the manifest has if one is missing.
 * @param {{ sets?: Record<string, { file: string }> }} manifest
 * @param {unknown} tier
 * @returns {'desktop' | 'phone'}
 */
export function chooseSet(manifest, tier) {
  const want = roomTier(tier).set;
  const sets = (manifest && manifest.sets) || {};
  if (sets[want] && sets[want].file) return want;
  const other = want === 'desktop' ? 'phone' : 'desktop';
  if (sets[other] && sets[other].file) return other;
  throw new Error('room: the manifest names no desktop or phone set');
}

/**
 * Checks a manifest is one this act reads (format v1 with both sets and the anchors).
 * @param {any} manifest
 * @returns {string[]} problems (empty when fine)
 */
export function manifestProblems(manifest) {
  const out = [];
  if (!manifest || typeof manifest !== 'object') return ['manifest is not an object'];
  if (manifest.version !== 1) out.push(`manifest version ${manifest.version} (this act reads 1)`);
  for (const s of ['desktop', 'phone']) {
    const set = manifest.sets && manifest.sets[s];
    if (!set || typeof set.file !== 'string' || !set.file.endsWith('.glb')) out.push(`sets.${s}.file missing`);
  }
  const req = (manifest.requires && manifest.requires.extensions) || [];
  for (const e of req) if (!KNOWN_EXTENSIONS.includes(e)) out.push(`requires unknown extension ${e}`);
  for (const name of Object.values(ANCHOR_NAMES)) {
    const a = manifest.anchors && manifest.anchors[name];
    if (!a || !Array.isArray(a.position) || a.position.length !== 3) out.push(`anchor ${name} missing`);
  }
  return out;
}

/** Extensions the loader handles (three's GLTFLoader with the meshopt decoder set). */
export const KNOWN_EXTENSIONS = Object.freeze(['EXT_meshopt_compression', 'KHR_mesh_quantization', 'EXT_texture_webp', 'KHR_materials_unlit']);

// --------------------------------------------------------------- the light ---

const clamp01 = (/** @type {number} */ x) => (x <= 0 ? 0 : x >= 1 ? 1 : x);
const smooth = (/** @type {number} */ a, /** @type {number} */ b, /** @type {number} */ x) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/**
 * The light switch, split: the desk lamp's filament leads (the reveal: an orange
 * filament warms on, alone, while the window still reads as space); then the room
 * comes up as a light front (`room`, 0..1) that starts at the lamp and runs out
 * through the room, so the strips bloom on in sequence (desk, shelves, ceiling, bed)
 * and the baked light follows them, near the lamp first. See STRIP_STAGES, FRONT.
 * @param {number} lights frame.params.lights, 0..1
 * @returns {{ lamp: number, room: number }}
 */
export function lightLevels(lights) {
  const l = clamp01(Number.isFinite(lights) ? lights : 0);
  return { lamp: smooth(0, 0.28, l), room: smooth(0.2, 1, l) };
}

/**
 * The light front (the `room` level is its progress t, 0..1): a surface `d` metres
 * from the desk lamp's bulb starts to come up at t0 = start + perMetre * d and is fully
 * lit `width` later. At t = 1 everything within `reach` of the bulb is lit (the room's
 * far corner is about 9.3 m away). Shared by the baked atlases (per fragment, in
 * shaders.js BAKE_FRAG and FLOOR_FRAG) and the room's own ordering of the strips.
 */
export const FRONT = Object.freeze({ start: 0.05, perMetre: 0.088, width: 0.1, reach: 9.6 });

/** How lit a baked surface `d` metres from the bulb is at front progress t (0..1). */
export function frontLevel(t, d) {
  const x = clamp01((t - FRONT.start - FRONT.perMetre * Math.min(d, FRONT.reach)) / FRONT.width);
  return x * x * (3 - 2 * x);
}

/**
 * The strips and lamps that switch with the room, in the order they come on: each
 * stage starts at `t` (front progress) plus a small ripple by distance from the bulb
 * (STRIP_RIPPLE per metre) and blooms on over STRIP_RISE. A room emitter on no listed
 * node starts with the bake round it (FRONT).
 */
export const STRIP_STAGES = Object.freeze([
  Object.freeze({ id: 'desk', t: 0.1, re: /^(Strip_Desk_|Strip_Pedestal_|Strip_Cabinet_(Violet|Floor)|Desk_Objects$)/ }),
  Object.freeze({ id: 'shelves', t: 0.28, re: /^(Strip_Shelf_|Strip_Cabinet_Top|Strip_Mezzanine_|Ornaments$|Globe_Lamp_Mezz$)/ }),
  Object.freeze({ id: 'ceiling', t: 0.46, re: /^(Strip_Ceiling_|Strip_Cove_|Strip_Ring_Light$|Ring_Light$)/ }),
  Object.freeze({ id: 'bed', t: 0.64, re: /^(Strip_Bed_|Strip_Picture_|Globe_Lamp_(Foot|Head)$|Soft_Toys$|Lounge$)/ }),
]);
export const STRIP_RIPPLE = 0.012;
export const STRIP_RISE = 0.07;

/**
 * Front progress at which a room emitter on `node`, `d` metres from the bulb, starts.
 * @param {string} node @param {number} d
 */
export function stripStart(node, d) {
  const s = STRIP_STAGES.find((x) => x.re.test(node));
  const dd = Math.min(Math.max(d, 0), FRONT.reach);
  return s ? s.t + STRIP_RIPPLE * dd : FRONT.start + FRONT.perMetre * dd - 0.03;
}

/** A room emitter's switch (0 off .. 1 on) at front progress t. @param {number} t @param {number} t0 */
export function stripLevel(t, t0) {
  const x = clamp01((t - t0) / STRIP_RISE);
  return x * x * (3 - 2 * x);
}

/**
 * Display level of an emitter of Blender emission strength `s`: the export's strengths
 * (0.45 .. 60) are scene radiance that Blender's AgX rolled off to its display range;
 * drawn linearly (x emitK) they reached 4 .. 96 and flooded the film finish's glow.
 * Here they rise linearly (x emitK) for the faint ones and saturate toward `cap`, so a
 * strip is a hot core the finish's path to white and shoulder can still shape.
 * @param {number} s @param {{ emitK: number, emitCap: number }} look
 */
export function emitLevel(s, look) {
  const cap = look.emitCap;
  return cap * (1 - Math.exp((-Math.max(s, 0) * look.emitK) / cap));
}

/**
 * The filament's colour as it warms (linear RGB, max channel 1): deep orange when it
 * first glows, the 2700 K amber of the lit lamp at 1.
 * @param {number} k 0..1
 * @param {number[]} [out]
 */
export function filament(k, out = [0, 0, 0]) {
  const t = clamp01(k);
  out[0] = 1;
  out[1] = 0.22 + (0.6 - 0.22) * t;
  out[2] = 0.03 + (0.27 - 0.03) * t;
  return out;
}

/**
 * Look constants, one fresh copy per act so tune() can change them live. Colours are
 * linear RGB. Values marked "sketch" are sketches/room (checked in a browser); the rest
 * (lamp pool, dust, the instrument's light) are new and want tuning by eye.
 */
export function createLook() {
  return {
    // Blender emission strength -> display level (emitLevel: linear gain emitK for the
    // faint ones, saturating at emitCap), and the screens' lift
    emitK: 1.6,
    emitCap: 2.4,
    screenK: 1.7,
    // the baked light with the room lights off: essentially black, so the false-space
    // beat reads as deep space (only the window's stars, the dust and the instrument's
    // starlit edges show); the film finish's veil is the floor
    night: [0.004, 0.0045, 0.009],
    // the desk lamp's pool on the baked surfaces while only the lamp is on: gain, reach (m)
    pool: 1.1,
    poolReach: 0.42,
    // window glass: transmission (sketch 0.93) and the faint sheen it adds
    glassTransmit: 0.93,
    // contact shadow under the base (its alpha is capped at 0.9 in the texture)
    shadow: 1,
    // floor mirror strength
    reflection: 1,
    // dust motes: starlight level with the lamp off, lamp gain, reach (m), drift (m)
    dustStar: [0.2, 0.22, 0.3],
    dustLamp: 2.2,
    dustReach: 0.5,
    dustDrift: 0.045,
    // the instrument on the desk (polished brass, as the Blender armillary in
    // _dev/room/room-instrument.png): the lamp as its key (a spot from the bulb); a warm
    // environment above (the lamp-lit room, Blender's warm card) so the rings read as
    // gold; the lamp-lit desk below; the monitors' cool light as the fill from the
    // monitor side; the window wall (starlight, then the aurora) as the cool rim.
    // With the lights off only the starlight rim is left: dim crescents.
    keyIntensity: 3.2,
    keyRange: 0.45,
    keyCone: [78, 38],
    ambient: [0.012, 0.035],
    envNight: [0.004, 0.005, 0.012],
    envRoom: [0.3, 0.2, 0.105],
    envScreens: [0.012, 0.024, 0.05],
    groundNight: [0.001, 0.001, 0.002],
    groundRoom: [0.034, 0.023, 0.015],
    rimStar: [0.03, 0.045, 0.11],
    rimAurora: [0.02, 0.3, 0.26],
    // the monitors' light on the instrument (fill colour at screens = 1) and where it
    // comes from (toward the middle monitor from the desk anchor)
    fillScreens: [0.05, 0.09, 0.17],
    fillRoom: [0.03, 0.022, 0.03],
    fillDir: [-0.97, 0.12, -0.2],
    // toward the back-left window wall from the desk
    rimDir: [-0.36, 0.34, -0.87],
    // the contact shadow under the plinth: core darkness, how far past the plinth's
    // rim it softens (m), how far its faint occlusion reaches (m)
    contact: [0.82, 0.018, 0.11],
  };
}

/**
 * Suggested film-finish options for room frames. The baked atlases are display-referred
 * (saved through Blender's AgX), so below the knee they pass the finish unchanged; the
 * knee sits at 0.9 so only the emitters' hot cores and the screens' whites are rolled
 * off (0.72 compressed the bake's own highlights too). Glow: the emitters now arrive at
 * display levels (emitLevel), the threshold is 1 (no baked texel blooms) and the widest
 * level is kept low, so the halos stay round the strips instead of a violet haze over
 * the darks. The veil is Blender's veiling glare (build_room.py VEIL, the deepest shadow
 * near #0b0a14): the bake itself carries none (its darkest texels are 0), so it is the
 * only black lift.
 */
export const FINISH = Object.freeze({
  glow: Object.freeze({ strength: 1, threshold: 1, weights: Object.freeze([0.3, 0.2, 0.08]) }),
  rolloff: Object.freeze({ knee: 0.9, white: 0.3 }),
  veil: Object.freeze([0.0024, 0.0021, 0.0058]),
  vignette: 0.22,
  grain: 0.02,
});
