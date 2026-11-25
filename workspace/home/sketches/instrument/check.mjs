// Composition and construction check in plain Node (no three.js, no
// browser): projects the anchors each still is composed around, for both
// viewports, and fails loudly on what cannot be seen from here: the seven
// spheres overlapping, labels without room (placed with overlay.js's own
// candidate and overlap rules, at the labels' estimated sizes), the
// instrument too small, the accent hidden or out of frame, the sky's band
// or nebula behind the instrument or its labels, the plate's wheel too
// small or its notes off the page, the macro frame losing its contact or
// its near-metal switch, the dial's screws and
// numerals running into the recess, a flame of the rete missing its star.
//   node sketches/instrument/check.mjs            summary + failures
//   node sketches/instrument/check.mjs --verbose  every anchor

import { SHOTS, resolveShot, cameraPose } from './shots.js';
import {
  ARMS, armAnchor, ARMILLARY, ROOM, GROUND_Y, beadCenters, trainLayout, GEAR, CRANK, BASE, DIAL, FEET, DEG, PLATE,
} from './layout.js';
import { ASTRO, rete, reteOpen, STARS, skyPoint, pocketLoop } from './rete.js';
import { meshContact, gearOutline } from './gear.js';
import { labelCandidates, labelFree, convexHull } from './overlay.js';

const VIEWS = { land: [1440, 900], port: [390, 844] };
const verbose = process.argv.includes('--verbose');
const D = Math.PI / 180;
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => {
  const l = Math.hypot(a[0], a[1], a[2]);
  return [a[0] / l, a[1] / l, a[2] / l];
};

function projector(cam, w, h) {
  const s = cam.shift || [0, 0];
  if (cam.ortho) {
    const t = cam.target;
    const f = (p) => ({ x: (p[0] - t[0]) * cam.k + w / 2 + s[0] * w, y: (p[2] - t[2]) * cam.k + h / 2 + s[1] * h, z: 10, ok: true });
    f.rpx = (p, r) => r * cam.k;
    f.ray = null;
    return f;
  }
  const pose = cameraPose(cam);
  const P = pose.position;
  const fw = norm(sub(pose.target, P));
  const rt = norm(cross(fw, [0, 1, 0]));
  const up = cross(rt, fw);
  const tanH = Math.tan((cam.fov * D) / 2);
  const asp = w / h;
  const f = (p) => {
    const v = sub(p, P);
    const zc = dot(v, fw);
    const nx = dot(v, rt) / (zc * tanH * asp);
    const ny = dot(v, up) / (zc * tanH);
    return { x: (nx * 0.5 + 0.5) * w + s[0] * w, y: (0.5 - ny * 0.5) * h + s[1] * h, z: zc, ok: zc > 0 };
  };
  f.rpx = (p, r) => (r / (dot(sub(p, P), fw) * tanH)) * (h / 2);
  // world ray through a screen pixel
  f.ray = (x, y) => {
    const nx = ((x - s[0] * w) / w - 0.5) * 2;
    const ny = (0.5 - (y - s[1] * h) / h) * 2;
    const d = norm([
      fw[0] + rt[0] * nx * tanH * asp + up[0] * ny * tanH,
      fw[1] + rt[1] * nx * tanH * asp + up[1] * ny * tanH,
      fw[2] + rt[2] * nx * tanH * asp + up[2] * ny * tanH,
    ]);
    return { o: P, d };
  };
  f.pos = P;
  return f;
}

const fails = [];
const notes = [];
const fmt = (q) => `(${q.x.toFixed(0)}, ${q.y.toFixed(0)})`;
const inFrame = (q, w, h, m = 0) => q.ok && q.x >= m && q.x <= w - m && q.y >= m && q.y <= h - m;
function need(cond, msg) {
  if (!cond) fails.push(msg);
}
function note(msg) {
  notes.push(msg);
}

// The text block each layout reserves (CSS px), mirrored from index.html.
export const TEXT_BOX = {
  point: { land: [107, 360, 720, 490], port: [27, 70, 363, 300] },
  plate: { land: [107, 320, 500, 510], port: [27, 55, 363, 200] },
  lift: { land: [107, 300, 560, 440], port: [27, 55, 363, 170] },
  inside: { land: [107, 600, 560, 830], port: [27, 45, 363, 160] },
  falsespace: { land: [107, 300, 620, 480], port: [27, 60, 363, 190] },
  desk: { land: [107, 735, 720, 860], port: [27, 55, 363, 160] },
  'object-scale': { land: [880, 90, 1340, 270], port: [27, 55, 363, 170] },
  dissolve: { land: [107, 735, 760, 860], port: [27, 55, 363, 170] },
  // "About" at 144 px italic is ~360 px wide; the body line ~270
  'final-hover': { land: [107, 590, 490, 845], port: [20, 40, 370, 270] },
  contact: { land: [107, 300, 720, 600], port: [27, 60, 363, 240] },
};
const hitsBox = (q, r, b) => q.x + r > b[0] && q.x - r < b[2] && q.y + r > b[1] && q.y - r < b[3];

function sphereCircles(S, prj) {
  const out = [];
  ARMS.forEach((arm, i) => {
    if (!S.build.spheres || !S.build.spheres.includes(i)) return;
    const A = armAnchor(i, S.state.arms[i]);
    const q = prj(A.center);
    out.push({ i, label: arm.label, q, r: prj.rpx(A.center, A.hoopR), rs: prj.rpx(A.center, arm.r) });
  });
  return out;
}

// Estimated label sizes (CSS px), mirroring index.html: land 12.5 px mono
// at 0.18 em tracking, port 12 px at 0.14 em; the number is followed by a
// 0.9 em gap. A mono advance is 0.6 em.
export function labelSize(text, layout) {
  const px = layout === 'port' ? 12 : 12.5;
  const track = layout === 'port' ? 0.14 : 0.18;
  return [Math.ceil((2 + text.length) * px * (0.6 + track) + 0.9 * px + 2), Math.ceil(px * 1.4)];
}

// Screen hulls of the base and the column (what main.js hands overlay.js).
function instrumentHulls(prj) {
  const base = [];
  for (let k = 0; k < 48; k++) {
    const a = (k / 48) * Math.PI * 2;
    for (const [r, y] of [[2.62, -0.47], [2.5, 0.06], [2.44, GROUND_Y]]) {
      const q = prj([r * Math.cos(a), y, -r * Math.sin(a)]);
      base.push([q.x, q.y]);
    }
  }
  const col = [];
  for (const y of [0.1, 2.45]) for (const x of [-0.2, 0.2]) for (const z of [-0.2, 0.2]) {
    const q = prj([x, y, z]);
    col.push([q.x, q.y]);
  }
  return [convexHull(base), convexHull(col)];
}

// The arms on screen: rod (column to knuckle) and stem (knuckle to pivot).
function armSegments(arms, prj) {
  const out = [];
  ARMS.forEach((arm, i) => {
    const A = armAnchor(i, arms[i]);
    const P = [[0, arm.h, 0], A.end, [A.end[0], arm.h + arm.stem, A.end[2]]].map((p) => {
      const q = prj(p);
      return [q.x, q.y];
    });
    out.push([P[0], P[1]], [P[1], P[2]]);
  });
  return out;
}

// Where overlay.js would put each sphere's label: its own candidates and
// overlap rules, fed estimated sizes.
function placeLabels(circles, obstacles, polys, layout, w, h, segs = []) {
  const boxes = [];
  const out = [];
  const all = circles.map((c) => ({ x: c.q.x, y: c.q.y, r: c.r + 2 })).concat(obstacles);
  for (const c of circles) {
    const [lw, lh] = labelSize(c.label, layout);
    const L = { x: c.q.x, y: c.q.y, r: c.r + 2 };
    const cands = labelCandidates(L, lw, lh, layout, w);
    const k = cands.findIndex((b) => labelFree(b, boxes, all, polys, w, h, segs));
    const pick = k >= 0 ? cands[k] : cands[0];
    boxes.push(pick);
    out.push({ label: c.label, box: [pick.x, pick.y, pick.w, pick.h], free: k >= 0, kind: pick.kind });
  }
  return out;
}

// Distance (px) from a point to the galaxy band's centre line on screen: a
// great circle seen through a pinhole is a straight line, here through the
// two NDC points the shot names.
function bandDistance(sky, w, h) {
  const A = [((sky.galaxy.a[0] + 1) / 2) * w, ((1 - sky.galaxy.a[1]) / 2) * h];
  const B = [((sky.galaxy.b[0] + 1) / 2) * w, ((1 - sky.galaxy.b[1]) / 2) * h];
  const d = [B[0] - A[0], B[1] - A[1]];
  const l = Math.hypot(d[0], d[1]);
  return (x, y) => Math.abs((x - A[0]) * d[1] - (y - A[1]) * d[0]) / l;
}
const ndcPx = (p, w, h) => ({ x: ((p[0] + 1) / 2) * w, y: ((1 - p[1]) / 2) * h });
const boxDist = (b, q) => Math.hypot(Math.max(b[0] - q.x, 0, q.x - b[0] - b[2]), Math.max(b[1] - q.y, 0, q.y - b[1] - b[3]));

// ------------------------------------------------------ construction ---
{
  const R = rete();
  need(R.holes.length >= 10, `rete: only ${R.holes.length} piercings`);
  need(R.pointers.length === STARS.length, `rete: ${R.pointers.length} of ${STARS.length} star flames were built`);
  for (const f of R.pointers) {
    const L = Math.hypot(f.tip[0] - f.base[0], f.tip[1] - f.base[1]);
    need(L > 0.08 && L < 0.36, `rete: flame to ${f.name} is ${L.toFixed(2)} long`);
    const sp = skyPoint(f.ra, f.dec);
    need(Math.hypot(sp[0], sp[1]) < ASTRO.limbIn - 0.02, `rete: ${f.name} lies on the limb`);
  }
  note(`rete: ${R.holes.length} piercings, ${R.pointers.length} flames (${R.pointers.map((f) => f.name).join(', ')})`);
  // the plate shows through: some of every almucantar inside the limb is open
  let open = 0;
  for (let k = 0; k < 400; k++) {
    const t = (k / 400) * Math.PI * 2;
    if (reteOpen([0.5 * Math.cos(t), 0.5 * Math.sin(t)], 0.006)) open++;
  }
  need(open > 120, `rete: too little of the plate shows through (${open}/400 open at r 0.5)`);

  // the dial: screws, numerals and the maker's plate stay off the recess
  const T = trainLayout(0);
  const { field } = pocketLoop(T);
  for (let k = 0; k < DIAL.screws.n; k++) {
    const a = DIAL.screws.phase + (k / DIAL.screws.n) * Math.PI * 2;
    const x = DIAL.screws.r * Math.cos(a);
    const z = -DIAL.screws.r * Math.sin(a);
    need(field(x, z) > DIAL.screws.head + 0.02, `dial: screw ${k} runs into the recess`);
  }
  for (let deg = 0; deg < 360; deg += DIAL.numerals.every) {
    const a = deg * DEG;
    for (const off of [-0.09, 0, 0.09]) {
      const r = DIAL.numerals.r;
      const x = r * Math.cos(a) - off * Math.sin(a);
      const z = -(r * Math.sin(a) + off * Math.cos(a));
      need(field(x, z) > DIAL.numerals.h * 0.6, `dial: numeral ${deg} runs into the recess`);
    }
  }
  {
    const L = DIAL.label;
    const c = [L.r * Math.cos(L.angle), -L.r * Math.sin(L.angle)];
    need(field(c[0], c[1]) > Math.hypot(L.w, L.h) / 2 + 0.03, `dial: the maker's plate runs into the recess`);
    need(L.r + L.h / 2 < DIAL.ring.r0 - 0.05 && L.r - L.h / 2 > DIAL.guilloche.r0 - 0.2, `dial: the maker's plate is off the guilloche band`);
  }
  // the whole recess inside the degree ring
  let rmax = 0;
  for (const p of pocketLoop(T).loop) rmax = Math.max(rmax, Math.hypot(p[0], p[1]));
  note(`dial: recess reaches r ${rmax.toFixed(3)} (numerals from ${(DIAL.numerals.r - DIAL.numerals.h / 2).toFixed(3)})`);
  need(rmax < DIAL.ring.r0 - 0.03, `dial: the recess (r ${rmax.toFixed(2)}) cuts the degree ring`);
  // the train must fit between the wheels: pinion clear of the main wheel
  const pr = Math.hypot(T.pinion.c[0], T.pinion.c[2]);
  need(pr > ASTRO.tipR + (GEAR.pinion.z * GEAR.module) / 2 + GEAR.module + 0.04, 'train: the pinion fouls the main wheel');
  // feet under the plinth
  need(FEET.r < 2.54 && FEET.r + FEET.radius <= 2.62, 'base: feet are not under the plinth rim');
}

for (const id of Object.keys(SHOTS)) {
  for (const [layout, [w, h]] of Object.entries(VIEWS)) {
    const S = resolveShot(id, layout);
    const prj = projector(S.cam, w, h);
    const tag = `${id}/${layout}`;
    const box = TEXT_BOX[id]?.[layout];

    if (id === 'point' || id === 'plate') {
      const c = prj([0, 0, 0]);
      note(`${tag}: centre ${fmt(c)}`);
      need(inFrame(c, w, h, 20), `${tag}: centre point out of frame`);
      if (box) need(!hitsBox(c, 8, box), `${tag}: orange point under the text`);
    }

    if (id === 'plate') {
      // the notebook page, the wheel on it, the notes on the page
      const P = PLATE[layout];
      const [x0, y0, x1, y1] = P.sheet;
      const corners = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]].map(([x, y]) => prj([x, 0, -y]));
      for (const q of corners) need(inFrame(q, w, h, 8), `${tag}: page corner out of frame ${fmt(q)}`);
      if (box) need(!corners.some((q) => q.x > box[0] && q.x < box[2] && q.y > box[1] && q.y < box[3]) && (layout === 'land' ? Math.min(...corners.map((q) => q.x)) > box[2] + 10 : Math.min(...corners.map((q) => q.y)) > box[3] + 10), `${tag}: the page runs under the text`);
      const R = ASTRO.tipR;
      need(x0 + P.margin < -R - 0.08 && x1 > R + 0.08 && y0 < -R - 0.08 && y1 > R + 0.08, `${tag}: the wheel does not sit inside the page`);
      // the wheel is the drawing: about 55 percent of the height on a wide
      // screen, most of the width on a phone
      const wheelPx = 2 * R * S.cam.k;
      note(`${tag}: wheel ${wheelPx.toFixed(0)} px across (${((wheelPx / h) * 100).toFixed(0)}% of the height, ${((wheelPx / w) * 100).toFixed(0)}% of the width)`);
      if (layout === 'land') need(wheelPx / h > 0.52 && wheelPx / h < 0.6, `${tag}: the wheel is ${((wheelPx / h) * 100).toFixed(0)}% of the height (want about 55)`);
      else need(wheelPx / w > 0.6, `${tag}: the wheel is only ${((wheelPx / w) * 100).toFixed(0)}% of the width`);
      if (box) need(Math.min(...corners.map((q) => q.x)) > box[2] + 40 || layout === 'port', `${tag}: less than 40 px between the text and the page`);
      for (const n of P.notes) {
        const q = prj([n.at[0], 0, -n.at[1]]);
        // 13 px (land) / 12 px (port) mono italic; the longest line counts
        const longest = Math.max(...n.text.split('<br>').map((t) => t.replace(/&[a-z]+;/g, 'x').length));
        const est = longest * (layout === 'port' ? 7.4 : 8.1);
        note(`${tag}: note "${n.id}" at ${fmt(q)} ~${est.toFixed(0)} px wide`);
        need(n.at[0] > x0 + P.margin + 0.05 && n.at[1] > y0 + 0.08 && n.at[1] < y1 - 0.12, `${tag}: note ${n.id} leaves the page`);
        // the words sit to the right of `at`; they must end on the page and off the wheel
        const xr = n.at[0] + (est + 6) / (S.cam.k);
        need(xr < x1 - 0.04, `${tag}: note ${n.id} runs off the page's right edge`);
        need(Math.hypot(n.at[0], n.at[1]) > R + 0.06 || n.at[0] > R + 0.06, `${tag}: note ${n.id} sits on the wheel`);
      }
    }

    if (id === 'lift') {
      const H = S.world.lift;
      const c0 = prj([0, 0.003, 0]);
      const c1 = prj([0, H + GEAR.y0, 0]);
      // is the drawn centre point hidden by the lifted wheel?
      const ra = ASTRO.tipR;
      const poly = [];
      for (let k = 0; k < 96; k++) {
        const t = (k / 96) * Math.PI * 2;
        poly.push(prj([ra * Math.cos(t), H + GEAR.y0, -ra * Math.sin(t)]));
        poly.push(prj([ra * Math.cos(t), H + GEAR.y0 + GEAR.main.thick + 0.09, -ra * Math.sin(t)]));
      }
      const ys = poly.map((q) => q.y);
      note(`${tag}: drawn centre ${fmt(c0)}, wheel centre ${fmt(c1)}, wheel y ${Math.min(...ys).toFixed(0)}..${Math.max(...ys).toFixed(0)}`);
      need(c0.y > Math.max(...ys) + 6, `${tag}: the orange centre point is under the lifted wheel`);
      const sheet = PLATE[layout].sheet;
      const cs = [[sheet[0], sheet[1]], [sheet[2], sheet[1]], [sheet[2], sheet[3]], [sheet[0], sheet[3]]].map(([x, y]) => prj([x, 0, -y]));
      for (const q of cs) need(inFrame(q, w, h, 4), `${tag}: page corner out of frame ${fmt(q)}`);
      if (box) need(!hitsBox(c1, prj.rpx([0, H, 0], ra) * 0.9, box), `${tag}: wheel under the text`);
      if (box) {
        const minX = Math.min(...cs.map((q) => q.x));
        const minY = Math.min(...cs.map((q) => q.y));
        note(`${tag}: page spans x ${minX.toFixed(0)}.., y ${minY.toFixed(0)}..`);
        need(layout === 'land' ? minX > box[2] + 12 : minY > box[3] + 12, `${tag}: the page runs under the text`);
      }
    }

    if (id === 'inside') {
      // macro: the idler-pinion contact in focus, the jewel beside it, the
      // teeth huge, the camera clear of every wheel
      const T = trainLayout(S.state.crank);
      const I = T.idler.c;
      const Pn = T.pinion.c;
      const ri = (GEAR.idler.z * GEAR.module) / 2;
      const rp = (GEAR.pinion.z * GEAR.module) / 2;
      const u = norm(sub(Pn, I));
      const C = [I[0] + u[0] * ri, 0.06, I[2] + u[2] * ri];
      const cq = prj(C);
      // the accent is the glint on the flanks' top edges where the teeth
      // bear (machine.js); at least one of them must be in plain view (a
      // ray from the camera meets no wheel on its way)
      const M = meshContact(T);
      const wheels = [[GEAR.main.z, T.main.c, T.main.rot, GEAR.main.thick], [GEAR.idler.z, I, T.idler.rot, GEAR.idler.thick], [GEAR.pinion.z, Pn, T.pinion.rot, GEAR.pinion.thick]].map(([z, c, r, th]) => ({
        th,
        poly: gearOutline(z, GEAR.module).pts.map((p) => [c[0] + p[0] * Math.cos(r) - p[1] * Math.sin(r), c[2] - (p[0] * Math.sin(r) + p[1] * Math.cos(r))]),
      }));
      const inPoly = (poly, x, z) => {
        let s = false;
        for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
          const a = poly[i];
          const b = poly[j];
          if (a[1] > z !== b[1] > z && x < ((b[0] - a[0]) * (z - a[1])) / (b[1] - a[1]) + a[0]) s = !s;
        }
        return s;
      };
      const eye = cameraPose(S.cam).position;
      const seen = M.edges.map((e) => [(e.a[0] + e.b[0]) / 2, e.a[1], (e.a[2] + e.b[2]) / 2]).filter((P) => {
        for (let k = 1; k < 400; k++) {
          const t = (k / 400) * 0.985;
          const x = eye[0] + (P[0] - eye[0]) * t;
          const y = eye[1] + (P[1] - eye[1]) * t;
          const z = eye[2] + (P[2] - eye[2]) * t;
          for (const W of wheels) if (y > GEAR.y0 && y < GEAR.y0 + W.th && inPoly(W.poly, x, z)) return false;
        }
        return true;
      });
      need(seen.length > 0, `${tag}: every orange edge at the contact is hidden behind a tooth`);
      const aq = seen.length ? prj(seen[0]) : prj([M.p[0], GEAR.y0 + GEAR.pinion.thick, M.p[2]]);
      note(`${tag}: ${seen.length} of ${M.edges.length} orange contact edges in plain view`);
      note(`${tag}: pitch point ${fmt(cq)}, orange contact ${fmt(aq)} (tooth gap ${(M.gap * 1000).toFixed(2)} mm-units)`);
      need(S.state.accent === 'contact', `${tag}: the accent is not at the meshing contact`);
      need(M.gap < 0.004, `${tag}: the teeth do not touch at the contact (gap ${M.gap.toFixed(4)})`);
      need(inFrame(cq, w, h, w * 0.15), `${tag}: the meshing contact is not in the frame's middle`);
      need(inFrame(aq, w, h, 24), `${tag}: the orange contact is out of frame`);
      if (box) {
        need(!hitsBox(cq, 30, box), `${tag}: the contact is under the text`);
        need(!hitsBox(aq, 20, box), `${tag}: the orange contact is under the text`);
      }
      // every visible surface is near enough to switch to machined metal
      // (materials.js): footprint at the far end of the fog under uMacro.x
      const mac = S.look.macro;
      const footFar = (S.fog[1] * 2 * Math.tan((S.cam.fov * D) / 2)) / h;
      note(`${tag}: footprint at the fog's far end ${footFar.toFixed(5)} (near metal below ${mac ? mac[0] : 'off'})`);
      need(mac && footFar < mac[0], `${tag}: surfaces inside the fog still draw screen-spaced hatching (the wireframe grid)`);
      // a tooth near the contact spans a good part of the frame
      const pitch = (2 * Math.PI * rp) / GEAR.pinion.z;
      const t = [-u[2], 0, u[0]];
      const a = prj([C[0] - t[0] * pitch / 2, 0.06, C[2] - t[2] * pitch / 2]);
      const b = prj([C[0] + t[0] * pitch / 2, 0.06, C[2] + t[2] * pitch / 2]);
      const toothPx = Math.hypot(a.x - b.x, a.y - b.y) + prj.rpx(C, GEAR.module * 2.25);
      note(`${tag}: one tooth ~${toothPx.toFixed(0)} px`);
      need(toothPx > (layout === 'land' ? 110 : 60), `${tag}: not macro enough (a tooth is ${toothPx.toFixed(0)} px)`);
      // camera outside every wheel (or above its top)
      const cp = cameraPose(S.cam).position;
      for (const [k, c, z, th] of [['main', T.main.c, GEAR.main.z, GEAR.main.thick], ['idler', I, GEAR.idler.z, GEAR.idler.thick], ['pinion', Pn, GEAR.pinion.z, GEAR.pinion.thick]]) {
        const ra = (z * GEAR.module) / 2 + GEAR.module;
        const inside = Math.hypot(cp[0] - c[0], cp[2] - c[2]) < ra + 0.02 && cp[1] < GEAR.y0 + th + 0.03;
        need(!inside, `${tag}: the camera is inside the ${k} wheel`);
      }
      // the crank's handle stays out of the macro frame
      const hq = prj([T.handle[0], CRANK.armY + 0.2, T.handle[2]]);
      need(!inFrame(hq, w, h, -40), `${tag}: the crank handle is in the macro frame ${fmt(hq)}`);
    }

    if (id === 'falsespace') {
      const g = prj(ARMILLARY.c);
      const gr = prj.rpx(ARMILLARY.c, ARMILLARY.globeR);
      note(`${tag}: globe ${fmt(g)} r=${gr.toFixed(0)}`);
      beadCenters().forEach((b, k) => note(`${tag}: bead${k} ${fmt(prj(b))} r=${prj.rpx(b, ARMILLARY.beadR).toFixed(1)} ${inFrame(prj(b), w, h) ? '' : '(out)'}`));
      need(inFrame(g, w, h, gr * 0.6), `${tag}: globe out of frame`);
      if (box) need(!hitsBox(g, gr, box), `${tag}: globe under the text`);
      const f = prj(S.lamp.filament);
      note(`${tag}: orange star (filament) ${fmt(f)}`);
      need(inFrame(f, w, h, 24), `${tag}: orange star out of frame`);
      need(Math.hypot(f.x - g.x, f.y - g.y) > gr + 30, `${tag}: orange star behind the globe`);
      if (box) need(!hitsBox(f, 10, box), `${tag}: orange star under the text`);
      // every pixel row/column edge must look out through the window
      const Wn = ROOM.window;
      let bad = 0;
      const N = 24;
      for (let i = 0; i <= N; i++) {
        for (let j = 0; j <= N; j++) {
          const r = prj.ray((i / N) * w, (j / N) * h);
          if (r.d[2] >= -1e-6) {
            bad++;
            continue;
          }
          const t = (ROOM.wall.z - r.o[2]) / r.d[2];
          const x = r.o[0] + r.d[0] * t;
          const y = r.o[1] + r.d[1] * t;
          if (r.d[1] < 0 && (GROUND_Y - r.o[1]) / r.d[1] < t) {
            bad++;
            continue;
          }
          if (x < Wn.x0 + Wn.frame || x > Wn.x1 - Wn.frame || y < Wn.y0 + Wn.frame || y > Wn.y1 - Wn.frame) bad++;
        }
      }
      note(`${tag}: ${bad} of ${(N + 1) ** 2} sample rays hit wall or desk`);
      need(bad === 0, `${tag}: frame sees wall/desk at ${bad} samples (should be all window)`);
    }

    if (id === 'desk' || id === 'dissolve' || id === 'object-scale') {
      const A = {
        armillaryTop: [0, ARMILLARY.c[1] + ARMILLARY.rings[0].R, 0],
        baseFront: [0, GROUND_Y, 2.62],
        lampHead: S.lamp.filament,
        lampBase: [ROOM.lamp.base[0], GROUND_Y, ROOM.lamp.base[1]],
        loupe: [ROOM.loupe.c[0], GROUND_Y, ROOM.loupe.c[1]],
        plotter: [ROOM.plotter.c[0], GROUND_Y + 0.6, ROOM.plotter.c[1]],
        balanceTop: [ROOM.balance.c[0], GROUND_Y + 3.3, ROOM.balance.c[1]],
        balancePanL: [ROOM.balance.c[0] - 1.79, GROUND_Y + 1.6, ROOM.balance.c[1]],
        balancePanR: [ROOM.balance.c[0] + 1.79, GROUND_Y + 1.3, ROOM.balance.c[1]],
        skiTip: [ROOM.skis.x[0], ROOM.skis.tipY - 0.15, ROOM.wall.z + 0.55],
        skiMid: [ROOM.skis.x[0], 2.0, -5.6],
        deskFrontL: [-6, GROUND_Y, ROOM.desk.z1],
        deskFrontR: [6, GROUND_Y, ROOM.desk.z1],
      };
      note(`${tag}: ${Object.entries(A).map(([k, p]) => `${k} ${fmt(prj(p))}${inFrame(prj(p), w, h) ? '' : '*'}`).join('  ')}`);
      if ((id === 'desk' || id === 'dissolve') && box && layout === 'land') {
        const ey = Math.max(prj(A.deskFrontL).y, prj(A.deskFrontR).y, prj([0, GROUND_Y - ROOM.desk.thick, ROOM.desk.z1]).y);
        need(ey < box[1] - 8, `${tag}: desk edge (${ey.toFixed(0)}) runs into the text (${box[1]})`);
      }
      if (id === 'desk') {
        for (const k of ['armillaryTop', 'baseFront', 'lampHead', 'loupe', 'plotter', 'balanceTop']) need(inFrame(prj(A[k]), w, h, 6), `${tag}: ${k} out of frame`);
        if (layout === 'land') need(inFrame(prj(A.skiMid), w, h, 6) && inFrame(prj(A.skiTip), w, h, 10), `${tag}: skis (or their tips) out of frame`);
        const toCam = norm(sub(prj.pos, S.lamp.filament));
        const ang = Math.acos(dot(toCam, S.lamp.axis)) / D;
        need(ang < 52, `${tag}: filament hidden inside the shade (${ang.toFixed(1)} deg)`);
        if (box) for (const k of ['lampHead', 'loupe', 'plotter', 'balanceTop']) need(!hitsBox(prj(A[k]), 20, box), `${tag}: ${k} under the text`);
      }
      if (id === 'object-scale') {
        for (const k of ['balanceTop', 'balancePanL', 'balancePanR']) need(inFrame(prj(A[k]), w, h, 10), `${tag}: ${k} out of frame`);
        if (box) for (const k of ['balanceTop', 'balancePanL', 'balancePanR', 'lampHead', 'plotter']) need(!hitsBox(prj(A[k]), 30, box), `${tag}: ${k} under the text`);
        need(inFrame(prj([ROOM.balance.c[0], GROUND_Y + 2.3, ROOM.balance.c[1] + 0.1]), w, h, 20), `${tag}: the pointer (accent) is out of frame`);
      }
      if (id === 'dissolve') {
        const circles = sphereCircles(S, prj);
        circles.forEach((c) => {
          need(inFrame(c.q, w, h, c.r), `${tag}: sphere ${c.label} out of frame`);
          if (box) need(!hitsBox(c.q, c.r, box), `${tag}: sphere ${c.label} under the text`);
        });
        const T = trainLayout(S.state.crank);
        const hq = prj([T.handle[0], CRANK.armY + 0.2, T.handle[2]]);
        note(`${tag}: orange crank handle ${fmt(hq)}`);
        for (const c of circles) need(Math.hypot(hq.x - c.q.x, hq.y - c.q.y) > c.r + 6, `${tag}: crank handle hidden behind ${c.label}`);
      }
    }

    if (id === 'final' || id === 'final-hover') {
      const circles = sphereCircles(S, prj);
      const arm = prj(ARMILLARY.c);
      const armR = prj.rpx(ARMILLARY.c, ARMILLARY.rings[0].R);
      const col = [prj([0, 0.3, 0]), prj([0, 2.45, 0])];
      note(`${tag}: armillary ${fmt(arm)} r=${armR.toFixed(0)}`);
      for (const c of circles) {
        note(`${tag}: ${c.label.padEnd(9)} ${fmt(c.q)} r=${c.r.toFixed(0)}`);
        need(inFrame(c.q, w, h, c.r + 14), `${tag}: ${c.label} out of frame`);
        const dA = Math.hypot(c.q.x - arm.x, c.q.y - arm.y);
        need(dA > c.r + armR + 6, `${tag}: ${c.label} overlaps the armillary (gap ${(dA - c.r - armR).toFixed(0)} px)`);
        const inY = c.q.y > col[1].y - c.r && c.q.y < col[0].y + c.r;
        need(!(inY && Math.abs(c.q.x - col[0].x) < c.r + 6), `${tag}: ${c.label} in front of the column`);
        if (id === 'final-hover' && box) need(!hitsBox(c.q, c.r, box), `${tag}: ${c.label} under the hover text`);
      }
      for (let a = 0; a < circles.length; a++) {
        for (let b = a + 1; b < circles.length; b++) {
          const A = circles[a];
          const B = circles[b];
          const gap = Math.hypot(A.q.x - B.q.x, A.q.y - B.q.y) - A.r - B.r;
          need(gap > (id === 'final' ? 16 : 6), `${tag}: ${A.label} and ${B.label} too close (gap ${gap.toFixed(0)} px)`);
        }
      }
      const T = trainLayout(S.state.crank);
      const hq = prj([T.handle[0], CRANK.armY + 0.2, T.handle[2]]);
      if (S.state.accent === 'crank') {
        note(`${tag}: amber crank handle ${fmt(hq)}`);
        need(inFrame(hq, w, h, 20), `${tag}: crank handle out of frame`);
        for (const c of circles) need(Math.hypot(hq.x - c.q.x, hq.y - c.q.y) > c.r + 10, `${tag}: crank handle hidden behind ${c.label}`);
      }
      if (id === 'final-hover') {
        const about = circles.find((c) => c.i === 0);
        need(inFrame(about.q, w, h, about.r + 10), `${tag}: the hovered sphere is out of frame`);
      }
      // how much of the frame the object fills: meridian ring (or the
      // upper bead) to the lowest point of the feet or plinth, and from the
      // ring to the dial's front edge
      const tops = [[0, ARMILLARY.c[1] + ARMILLARY.rings[0].R, 0], beadCenters()[0]].map((p) => prj(p).y);
      let bot = -Infinity;
      let dial = -Infinity;
      for (let k = 0; k < 64; k++) {
        const a = (k / 64) * Math.PI * 2;
        bot = Math.max(bot, prj([FEET.r * Math.cos(a), GROUND_Y, -FEET.r * Math.sin(a)]).y, prj([2.62 * Math.cos(a), BASE.bottom, -2.62 * Math.sin(a)]).y);
        dial = Math.max(dial, prj([BASE.dialR * Math.cos(a), BASE.dialTop, -BASE.dialR * Math.sin(a)]).y);
      }
      const top = Math.min(...tops);
      const frac = (bot - top) / h;
      const core = (dial - top) / h;
      const sphTop = Math.min(...circles.map((c) => c.q.y - c.r));
      const sphBot = Math.max(...circles.map((c) => c.q.y + c.r));
      const all = (Math.max(bot, sphBot) - Math.min(top, sphTop)) / h;
      note(`${tag}: object spans ${(frac * 100).toFixed(0)}% of the height (ring to feet), ${(core * 100).toFixed(0)}% ring to dial edge, ${(all * 100).toFixed(0)}% with the spheres; top ${top.toFixed(0)}, bottom ${bot.toFixed(0)}`);
      if (layout === 'land') {
        need(frac > 0.74 && frac < 0.86, `${tag}: object fills ${(frac * 100).toFixed(0)}% of the height (want about 80, ring to feet)`);
        need(core > 0.6 && core < 0.78, `${tag}: ring to dial edge is ${(core * 100).toFixed(0)}% of the height (want at least 60)`);
        need(top > 40 && bot < h - 40, `${tag}: the object is cut by the frame`);
      } else {
        // the phone is as large as the labels allow (a closer camera leaves
        // some label no free place): ring to feet ~43, spheres ~58 percent
        need(frac > 0.41 && all > 0.54, `${tag}: object fills only ${(frac * 100).toFixed(0)}% (ring to feet), ${(all * 100).toFixed(0)}% with its spheres`);
      }
      // labels: each has a free place off the spheres, the armillary, the
      // crank, the base and the column
      const obstacles = [{ x: arm.x, y: arm.y, r: armR }, { x: hq.x, y: hq.y, r: prj.rpx([T.handle[0], 0.6, T.handle[2]], 0.3) }];
      const labels = id === 'final' ? placeLabels(circles, obstacles, instrumentHulls(prj), layout, w, h, armSegments(S.state.arms, prj)) : [];
      for (const L of labels) {
        need(L.free, `${tag}: no free place for the ${L.label} label`);
        if (box) need(!(L.box[0] < box[2] && L.box[0] + L.box[2] > box[0] && L.box[1] < box[3] && L.box[1] + L.box[3] > box[1]), `${tag}: ${L.label} label under the text`);
      }
      // the hover text keeps the left of the frame: no sphere under it in
      // either state
      const hb = TEXT_BOX['final-hover'][layout];
      for (const c of circles) need(!hitsBox(c.q, c.r, hb), `${tag}: ${c.label} sits where the hover text goes`);
      if (id === 'final-hover') {
        const rest = resolveShot('final', layout);
        const a0 = armAnchor(0, rest.state.arms[0]);
        const a1 = armAnchor(0, S.state.arms[0]);
        const d0 = Math.hypot(a0.center[0] - prj.pos[0], a0.center[2] - prj.pos[2]);
        const d1 = Math.hypot(a1.center[0] - prj.pos[0], a1.center[2] - prj.pos[2]);
        note(`${tag}: About swings ${(Math.abs((((S.state.arms[0] - rest.state.arms[0]) / D + 540) % 360) - 180)).toFixed(0)} deg, ${(d0 - d1).toFixed(2)} nearer the camera`);
        need(d1 < d0 - 0.3, `${tag}: About's hover does not swing it toward the viewer`);
      }
      if (labels.length) note(`${tag}: labels ${labels.map((L) => `${L.label}@${L.box[0].toFixed(0)},${L.box[1].toFixed(0)}`).join(' ')}`);
      // the sky: band clear of the instrument, labels and spheres; the
      // nebula far from all of them
      if (S.sky) {
        const K = S.sky;
        const pxRad = h / 2 / Math.tan(((K.fov ?? S.cam.fov) * D) / 2);
        const We = (K.galaxy.width ?? 0.085) * pxRad;
        const bd = bandDistance(K, w, h);
        const dArm = bd(arm.x, arm.y) - armR;
        note(`${tag}: band centre line ${dArm.toFixed(0)} px from the armillary's edge (band half-width ~${We.toFixed(0)} px)`);
        need(dArm > 2.2 * We, `${tag}: the galaxy band runs behind the armillary`);
        for (const c of circles) need(bd(c.q.x, c.q.y) - c.r > 1.6 * We, `${tag}: the band runs behind ${c.label}`);
        for (const L of labels) {
          const corners = [[L.box[0], L.box[1]], [L.box[0] + L.box[2], L.box[1]], [L.box[0], L.box[1] + L.box[3]], [L.box[0] + L.box[2], L.box[1] + L.box[3]]];
          need(Math.min(...corners.map(([x, y]) => bd(x, y))) > 1.2 * We, `${tag}: the band runs behind the ${L.label} label`);
        }
        if (K.nebula) {
          const nq = ndcPx(K.nebula.at, w, h);
          const nr = K.nebula.radius * pxRad * 1.6;
          for (const c of circles) need(Math.hypot(nq.x - c.q.x, nq.y - c.q.y) > c.r + nr + 40, `${tag}: the nebula is near ${c.label}`);
          for (const L of labels) need(boxDist([L.box[0], L.box[1], L.box[2], L.box[3]], nq) > nr + 40, `${tag}: the nebula is near the ${L.label} label`);
          need(Math.hypot(nq.x - arm.x, nq.y - arm.y) > armR + nr + 40, `${tag}: the nebula is near the armillary`);
          if (box) need(!hitsBox(nq, nr + 30, box), `${tag}: the nebula is under the text`);
          need(inFrame({ ...nq, ok: true }, w, h, 10), `${tag}: the nebula is off screen`);
        }
      }
    }

    if (id === 'contact' || id === 'dissolve') {
      const c = prj(ARMILLARY.c);
      const r = prj.rpx(ARMILLARY.c, id === 'contact' ? ARMILLARY.sealedR : ARMILLARY.rings[0].R);
      note(`${tag}: armillary/sealed sphere ${fmt(c)} r=${r.toFixed(0)}`);
      if (box) need(!hitsBox(c, r, box), `${tag}: sphere under the text`);
      need(inFrame(c, w, h, r), `${tag}: sphere out of frame`);
      if (id === 'contact' && S.sky) {
        const K = S.sky;
        const pxRad = h / 2 / Math.tan(((K.fov ?? S.cam.fov) * D) / 2);
        const bd = bandDistance(K, w, h);
        const We = (K.galaxy.width ?? 0.085) * pxRad;
        note(`${tag}: band centre line ${(bd(c.x, c.y) - r).toFixed(0)} px from the sphere's edge`);
        need(bd(c.x, c.y) - r > 1.2 * We, `${tag}: the galaxy band runs behind the sealed sphere`);
        if (K.nebula) {
          const nq = ndcPx(K.nebula.at, w, h);
          const nr = K.nebula.radius * pxRad * 1.6;
          need(Math.hypot(nq.x - c.x, nq.y - c.y) > r + nr + 20, `${tag}: the nebula is behind the sealed sphere`);
          if (box) need(!hitsBox(nq, nr + 30, box), `${tag}: the nebula is under the text`);
          need(inFrame({ ...nq, ok: true }, w, h, 10), `${tag}: the nebula is off screen`);
        }
      }
    }
  }
}

if (verbose || fails.length) for (const n of notes) console.log('  ' + n);
if (fails.length) {
  console.log(`\n${fails.length} composition problem(s):`);
  for (const f of fails) console.log('  FAIL ' + f);
  process.exitCode = 1;
} else {
  console.log(`composition check: all ${Object.keys(SHOTS).length} shots x 2 viewports pass, plus rete and dial construction`);
}
