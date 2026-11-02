// The north-sea journey as a pure fixed-step simulation. Nothing here touches
// three.js or the DOM, so checkpoints replay the real path instead of staging it.

export const BODY_LENGTH = 10.4;
export const GROWTH = Object.freeze({ motes: 7, factor: 1.43 });
export const WORLD = Object.freeze({ surface: 640, arena: 3000 });
export const ART_PITCH = .225;
export const PILLAR_CENTER = Object.freeze({ x: 0, z: 0, radius: 58, height: 240 });

const TAU = Math.PI * 2;
const STEP = 1 / 60;
// Behind and to one side, looking ahead of Kun, so the heading and the next mote stay in frame.
const CAMERA_PLAY = Object.freeze({ azimuth: 2.3, elevation: -.07, distance: 2.1, aimAhead: .32, aimLift: .02, aimSide: 0 });
const CAMERA_PORTRAIT = Object.freeze({ azimuth: 2.74, aimAhead: .16 });
// Low and close, looking up at Kun as the key art does. Kun sits right of centre, so the
// fins trail across the frame.
const CAMERA_ART = Object.freeze({ azimuth: 1.24, elevation: -ART_PITCH, distance: 1.5, aimAhead: 0, aimLift: -.12, aimSide: -.1 });
const CAMERA_MIX = Object.freeze({ introHold: 2.4, introEase: 4.4, finaleEase: 5.5, finaleHold: 4 });
const SPEED = Object.freeze({ held: 1.2, idleFraction: .25, rise: .34, fall: 1 });
const TURN = Object.freeze({ yawRate: 1.0, pitchLimit: .55, yawFollow: 5, pitchFollow: 2.2, bank: .5 });
const MOTE = Object.freeze({ spawnSeconds: 14.5, drift: .24, delay: 3.4, lost: 1.7, reach: .95, swell: 2.4 });

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const wrap = angle => { const a = (angle + Math.PI) % TAU; return (a < 0 ? a + TAU : a) - Math.PI; };
// Heading zero faces world +Z, the model's own forward axis.
const forward = (yaw, pitch) => [Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)];
// How far the first pillar sits off the view axis; portrait frames keep it centred.
const openingOffset = aspect => .26 * clamp((aspect - .46) / 1.14, 0, 1);
// Kun stays down among the towers as it grows, so they keep passing close by.
const altitude = scale => 112 + 12 * (scale - 1);
// Kun opens low over the seabed, so the camera can look up with the first pillar's foot in frame.
const OPENING_ALTITUDE = 54;
// The horizontal direction the key-art camera sits at relative to heading zero.
const ART_BEARING = Math.atan2(-Math.sin(CAMERA_ART.azimuth), Math.cos(CAMERA_ART.azimuth));

// The opening shot's ground plan: where Kun starts and which way the camera looks.
export function openingView(aspect = 1.6) {
  const bearing = ART_BEARING + openingOffset(aspect), radius = 606;
  const fx = -Math.sin(ART_BEARING), fz = -Math.cos(ART_BEARING);
  return { x: PILLAR_CENTER.x + Math.sin(bearing) * radius, z: PILLAR_CENTER.z + Math.cos(bearing) * radius, fx, fz, rx: -fz, rz: fx };
}

export function createJourney(pillars) {
  const j = {};
  function reset(aspect = 1.6) {
    Object.assign(j, {
      t: 0, phase: 'intro', phaseT: 0, ended: false, autoplay: false,
      x: 0, y: OPENING_ALTITUDE, z: 0, yaw: 0, pitch: 0, roll: 0, speed: 0, heading: 0,
      scale: 1, targetScale: 1, motes: 0, growth: [], moteTimes: [], pulse: 0,
      steerX: 0, steerY: 0, hold: false, steerActive: false,
      mote: { active: false, x: 0, y: 0, z: 0, wait: MOTE.delay, age: 0, fade: 0 },
      cam: { x: 0, y: 0, z: 0, aimX: 0, aimY: 0, aimZ: 0, mix: 0, ready: false },
      rig: { x: 0, y: 0, z: 0, fx: 0, fz: 1, ready: false },
      orbit: 0,
    });
    // Start on the near side of the first pillar, so it stands behind Kun in the opening shot.
    j.offset = openingOffset(aspect);
    const bearing = ART_BEARING + j.offset, radius = 606;
    j.x = PILLAR_CENTER.x + Math.sin(bearing) * radius;
    j.z = PILLAR_CENTER.z + Math.cos(bearing) * radius;
    j.yaw = j.heading = 0;
    j.orbit = bearing;
    updateCamera(STEP, aspect);
  }

  const held = () => SPEED.held * BODY_LENGTH * Math.pow(j.scale, .96);
  const radial = () => Math.hypot(j.x - PILLAR_CENTER.x, j.z - PILLAR_CENTER.z);

  function nextMotePosition() {
    // Ahead on a slow outward spiral around the first pillar; the path of the pilot
    // and of any player who keeps swimming. Head straight on if the player turned away.
    const scale = j.targetScale;
    const speed = SPEED.held * BODY_LENGTH * Math.pow(scale, .96);
    const distance = speed * MOTE.spawnSeconds;
    const radius = 620 + (scale - 1) * 188;
    const bearing = Math.atan2(j.x - PILLAR_CENTER.x, j.z - PILLAR_CENTER.z);
    const a = bearing + distance / Math.max(radius, radial() + 1);
    const ox = PILLAR_CENTER.x + Math.sin(a) * radius, oz = PILLAR_CENTER.z + Math.cos(a) * radius;
    const dirX = ox - j.x, dirZ = oz - j.z, length = Math.hypot(dirX, dirZ) || 1;
    const f = forward(j.yaw, 0);
    const aligned = (dirX * f[0] + dirZ * f[2]) / length;
    const lean = smooth(-.1, .55, aligned);
    return [
      j.x + (dirX / length * lean + f[0] * (1 - lean)) * distance,
      clamp(altitude(scale), 60, WORLD.surface - 30 - 16 * scale),
      j.z + (dirZ / length * lean + f[2] * (1 - lean)) * distance,
    ];
  }

  function pilot() {
    const m = j.mote;
    const tx = m.active ? m.x : j.x + Math.sin(j.yaw) * 100;
    const tz = m.active ? m.z : j.z + Math.cos(j.yaw) * 100;
    const ty = m.active ? m.y : altitude(j.targetScale);
    const yawError = wrap(Math.atan2(tx - j.x, tz - j.z) - j.yaw);
    const pitchTarget = Math.atan2(ty - j.y, Math.hypot(tx - j.x, tz - j.z));
    j.steerX = clamp(yawError * 2, -1, 1);
    j.steerY = clamp(pitchTarget / TURN.pitchLimit, -1, 1);
    j.hold = true;
  }

  function steer(dt) {
    const finale = j.phase === 'finale';
    let turn = 0;
    if (finale) {
      // Bring the head round so the camera looks across Kun toward the first pillar.
      const bearing = Math.atan2(j.x - PILLAR_CENTER.x, j.z - PILLAR_CENTER.z);
      turn = clamp(wrap(bearing - j.offset - ART_BEARING - j.yaw) * 1.4, -.6, .6);
    } else {
      turn = j.steerX * TURN.yawRate;
      const r = radial();
      // A soft shore: past the arena edge the sea turns Kun back. There is no wall.
      if (r > WORLD.arena) {
        const home = Math.atan2(PILLAR_CENTER.x - j.x, PILLAR_CENTER.z - j.z);
        turn += clamp(wrap(home - j.yaw) * smooth(WORLD.arena, WORLD.arena * 1.35, r) * 2, -.9, .9);
      }
    }
    j.heading += turn * dt;
    j.yaw += wrap(j.heading - j.yaw) * Math.min(1, TURN.yawFollow * dt);
    const band = 26 + 8 * j.scale;
    const desired = finale ? 0 : j.steerY * TURN.pitchLimit;
    // Kun holds its low opening line until the first shot gives way.
    const level = j.phase === 'intro' ? OPENING_ALTITUDE : altitude(j.targetScale);
    const bias = clamp((level - j.y) / band, -1, 1) * (.34 + .34 * smooth(band, band * 2.4, Math.abs(level - j.y)));
    j.pitch += (clamp(desired + bias, -TURN.pitchLimit, TURN.pitchLimit) - j.pitch) * Math.min(1, TURN.pitchFollow * dt);
    j.roll += (clamp(-turn * TURN.bank, -.42, .42) - j.roll) * Math.min(1, 2.4 * dt);
  }

  function move(dt) {
    const target = (j.hold && j.phase !== 'finale' ? held() : held() * SPEED.idleFraction * (j.phase === 'finale' ? .6 : 1));
    const tau = target > j.speed ? SPEED.rise : SPEED.fall;
    j.speed += (target - j.speed) * Math.min(1, dt / tau);
    const f = forward(j.yaw, j.pitch);
    j.x += f[0] * j.speed * dt;
    j.y += f[1] * j.speed * dt;
    j.z += f[2] * j.speed * dt;
    j.y = clamp(j.y, 38 + 9 * j.scale, WORLD.surface - 16 - 14 * j.scale);
    // Pillars push Kun gently aside; the body never passes through stone.
    for (const pillar of pillars) {
      const dx = j.x - pillar.x, dz = j.z - pillar.z, gap = pillar.radius + 7 * j.scale;
      const d = Math.hypot(dx, dz);
      if (d < gap && d > 1e-3 && j.y - 5 * j.scale < pillar.height) {
        const push = (gap - d) * Math.min(1, 3 * dt);
        j.x += dx / d * push;
        j.z += dz / d * push;
      }
    }
  }

  function updateMote(dt) {
    const m = j.mote;
    if (j.motes >= GROWTH.motes || j.phase === 'finale') { m.active = false; return; }
    if (!m.active) {
      m.wait -= dt;
      if (m.wait <= 0) {
        [m.x, m.y, m.z] = nextMotePosition();
        Object.assign(m, { active: true, age: 0, fade: 0 });
      }
      return;
    }
    m.age += dt;
    m.fade = Math.min(1, m.fade + dt / 1.2);
    const dx = j.x - m.x, dy = j.y - m.y, dz = j.z - m.z, d = Math.hypot(dx, dy, dz) || 1;
    const f = forward(j.yaw, j.pitch);
    // Drift across toward where Kun is going, then fall in when close.
    const lead = Math.min(d, j.speed * 3);
    const px = j.x + f[0] * lead - m.x, py = j.y + f[1] * lead - m.y, pz = j.z + f[2] * lead - m.z;
    const p = Math.hypot(px, py, pz) || 1;
    const close = smooth(BODY_LENGTH * j.scale * 3.4, BODY_LENGTH * j.scale * 1.2, d);
    const pace = held() * (MOTE.drift + close * .95);
    m.x += px / p * pace * dt;
    m.y += py / p * pace * dt;
    m.z += pz / p * pace * dt;
    const reach = BODY_LENGTH * j.scale * MOTE.reach;
    if (d < reach) {
      j.motes += 1;
      j.targetScale *= GROWTH.factor;
      j.pulse = 1;
      j.growth.push(j.targetScale);
      j.moteTimes.push(j.t);
      Object.assign(m, { active: false, wait: MOTE.delay });
      if (j.motes >= GROWTH.motes) { j.phase = 'finale'; j.phaseT = 0; }
      return;
    }
    // Behind the player, or left far behind: it dims and returns ahead. It can never be missed.
    const behind = (m.x - j.x) * f[0] + (m.y - j.y) * f[1] + (m.z - j.z) * f[2] < 0;
    if (d > held() * MOTE.spawnSeconds * MOTE.lost || (behind && d > held() * 3)) {
      m.fade = 0;
      [m.x, m.y, m.z] = nextMotePosition();
    }
  }

  function updateCamera(dt, aspect) {
    let mix = 1 - smooth(CAMERA_MIX.introHold, CAMERA_MIX.introHold + CAMERA_MIX.introEase, j.t);
    if (j.phase === 'finale') mix = Math.max(mix, smooth(.3, CAMERA_MIX.finaleEase, j.phaseT));
    const portrait = clamp((1.1 - aspect) / .6, 0, 1);
    const a = { ...CAMERA_PLAY, azimuth: CAMERA_PLAY.azimuth + (CAMERA_PORTRAIT.azimuth - CAMERA_PLAY.azimuth) * portrait,
      aimAhead: CAMERA_PLAY.aimAhead + (CAMERA_PORTRAIT.aimAhead - CAMERA_PLAY.aimAhead) * portrait };
    const b = CAMERA_ART;
    const blend = key => a[key] + (b[key] - a[key]) * mix;
    const size = BODY_LENGTH * j.scale;
    const fit = aspect < 1 ? 1 + (1 - aspect) * (1.15 + 1.35 * mix) : 1;
    const azimuth = blend('azimuth'), elevation = blend('elevation');
    const distance = blend('distance') * size * fit;
    const c = forward(j.yaw + Math.atan2(-Math.sin(azimuth), Math.cos(azimuth)), elevation);
    const lookYaw = forward(j.yaw, 0);
    // The camera stays anchored to Kun; only its aim looks ahead.
    const baseY = j.y + blend('aimLift') * size;
    const side = blend('aimSide') * size * (1 - portrait);
    const sideX = Math.cos(j.yaw + Math.atan2(-Math.sin(azimuth), Math.cos(azimuth))) * side;
    const sideZ = -Math.sin(j.yaw + Math.atan2(-Math.sin(azimuth), Math.cos(azimuth))) * side;
    // Look-ahead waits for the camera to swing behind Kun, or it pushes Kun out of frame.
    const ahead = a.aimAhead * (1 - mix) * (1 - mix);
    const aimX = j.x + sideX + lookYaw[0] * ahead * size;
    const aimY = baseY;
    const aimZ = j.z + sideZ + lookYaw[2] * ahead * size;
    const follow = j.cam.ready ? Math.min(1, dt * 4) : 1;
    const cam = j.cam;
    cam.x += (j.x + sideX + c[0] * distance - cam.x) * follow;
    cam.y += (baseY + c[1] * distance - cam.y) * follow;
    cam.z += (j.z + sideZ + c[2] * distance - cam.z) * follow;
    cam.aimX += (aimX - cam.aimX) * follow;
    cam.aimY += (aimY - cam.aimY) * follow;
    cam.aimZ += (aimZ - cam.aimZ) * follow;
    cam.y = Math.max(cam.y, 26);
    // Stone passes close by, but the camera never enters it.
    for (const pillar of pillars) {
      const dx = cam.x - pillar.x, dz = cam.z - pillar.z, gap = pillar.radius + 3 * j.scale;
      const d = Math.hypot(dx, dz);
      if (d < gap && d > 1e-3 && cam.y < pillar.height) {
        cam.x += dx / d * (gap - d);
        cam.z += dz / d * (gap - d);
      }
    }
    cam.mix = mix;
    cam.ready = true;
    if (j.phase === 'finale') {
      // The framing cliffs follow where the final shot will stand, then stay put as it settles.
      const yaw = j.yaw + Math.atan2(-Math.sin(b.azimuth), Math.cos(b.azimuth));
      const n = forward(yaw, b.elevation), reach = b.distance * size * (aspect < 1 ? 1 + (1 - aspect) * 2.5 : 1);
      const across = b.aimSide * size * (1 - portrait);
      const target = { x: j.x + Math.cos(yaw) * across + n[0] * reach, y: j.y + b.aimLift * size + n[1] * reach,
        z: j.z - Math.sin(yaw) * across + n[2] * reach, fx: -Math.sin(yaw), fz: -Math.cos(yaw) };
      const rig = j.rig, rate = rig.ready ? Math.min(1, dt * 1.6 * (1 - smooth(4, 7, j.phaseT))) : 1;
      for (const key of ['x', 'y', 'z', 'fx', 'fz']) rig[key] += (target[key] - rig[key]) * rate;
      rig.ready = true;
    }
  }

  function step(aspect) {
    if (j.ended) return;
    j.t += STEP;
    j.phaseT += STEP;
    if (j.phase === 'intro' && j.t > CAMERA_MIX.introHold) j.phase = 'play';
    if (j.autoplay) pilot();
    steer(STEP);
    move(STEP);
    updateMote(STEP);
    j.scale += (j.targetScale - j.scale) * Math.min(1, STEP * MOTE.swell);
    j.pulse = Math.max(0, j.pulse - STEP / 2.6);
    updateCamera(STEP, aspect);
    if (j.phase === 'finale' && j.phaseT > CAMERA_MIX.finaleEase + CAMERA_MIX.finaleHold) j.ended = true;
  }

  reset();
  return { j, step, reset, held };
}
