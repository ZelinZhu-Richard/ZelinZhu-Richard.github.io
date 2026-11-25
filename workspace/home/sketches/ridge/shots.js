// Shot table for "Ridge, 3 a.m.". The scene is a function of (shot, viewport):
// each shot has scene state, plus a desktop and a portrait entry with its own
// camera and text placement. Cameras are written against world landmarks
// (plateau, route, cairns) so the framing follows the terrain.
// Units: 1 = about 10 m. Angles in radians unless noted.

import { heightAt, routeAt } from './world.js';

export const SHOT_IDS = ['hero', 'experiments', 'repeat', 'research', 'stones', 'stone', 'contact'];

// Use the window, never the shot, to pick the layout.
export function layoutFor(width, height) {
  return width < 700 || width / height < 0.8 ? 'portrait' : 'desktop';
}

const g = (x, z, lift) => [x, heightAt(x, z) + lift, z];
const deg = (d) => (d * Math.PI) / 180;

const DEFAULT_SCENE = {
  ink: 1.0, // terrain line intensity
  fog: [30, 160], // lines fade to night between these distances
  fine: 1.0, minor: 1.0, major: 1.0, // isoline families: 0.08, 0.4, 2.0
  width: 1.0, // line width scale
  aurora: 0.0, auroraAz: 0.0, auroraSpan: 0.6, auroraBase: deg(8), auroraHeight: deg(13),
  stars: 0.8, trails: false,
  snow: 0, snowNear: 1.5, snowFar: 30,
  lamp: null, // { s: arc length on the route, tail: length of lit path behind }
  trackLamp: null, // { track, at: fraction along it, tail }
  route: 0.0, // dashed route intensity
  tracks: 0.0, // ski track intensity
  cairns: false, lift: -1, ring: -1, stoneStep: 0.03,
  slice: null, // { h, radius }: one orange isoline through the cirque
  quiet: 0.55, // how much lines dim under the text
  horizon: 0.0,
  // terrain tessellation: uniform inside the focus rectangle, growing outside
  grid: { x0: -30, x1: 30, z0: -30, z1: 30, n: 330, frac: 0.78, outer: 320 },
};

export const SHOTS = {
  // 1. The opening frame: the valley floor at night, the mountain a faint mass.
  hero: {
    scene: {
      ink: 0.9,
      fog: [70, 260],
      fine: 0.8, minor: 1.0, major: 0.85,
      aurora: 1.0, auroraAz: deg(-22), auroraSpan: 0.42, auroraBase: deg(10.5), auroraHeight: deg(10),
      stars: 0.75,
      snow: 60, snowNear: 4, snowFar: 40,
      lamp: { s: 84.0, tail: 9.0 },
      horizon: 1.0,
      grid: { x0: -36, x1: 40, z0: -30, z1: 36, n: 350, frac: 0.8, outer: 330 },
    },
    desktop: {
      cam: () => ({ pos: g(66, 80, 9.0), target: [-16.0, 19.0, 4.0], fov: 34, near: 0.5 }),
      text: [
        { kind: 'name', text: 'Richard Zhu', x: 0.072, y: 0.15, size: 'clamp(60px, 7.4vw, 124px)' },
        { kind: 'mono', text: 'A student of what comes next.', x: 0.076, y: 0.305 },
        { kind: 'cue', text: 'Scroll', x: 0.076, y: 0.86 },
      ],
    },
    portrait: {
      cam: () => ({ pos: g(50, 62, 6.0), target: [-5.0, 22.0, -2.0], fov: 66, near: 0.5, shift: [0, -0.18] }),
      text: [
        { kind: 'name', text: 'Richard Zhu', x: 0.085, y: 0.115, size: '58px' },
        { kind: 'mono', text: 'A student of what comes next.', x: 0.09, y: 0.205 },
        { kind: 'cue', text: 'Scroll', x: 0.09, y: 0.88 },
      ],
    },
  },

  // 2. Early in the story: contours resolve; ski tracks cut across them.
  experiments: {
    scene: {
      fog: [16, 70],
      aurora: 0.0,
      stars: 0.6,
      snow: 150, snowNear: 1.0, snowFar: 20,
      trackLamp: { track: 0, at: 0.6, tail: 3.0 },
      tracks: 1.0,
      grid: { x0: -26, x1: 14, z0: -6, z1: 36, n: 340, frac: 0.8, outer: 320 },
    },
    desktop: {
      cam: () => ({ pos: g(5.5, 24.0, 10.5), target: [-10.0, 10.0, 17.0], fov: 42 }),
      text: [{ kind: 'display', text: 'Good questions\nbecome *experiments.*', x: 0.07, y: 0.14, size: 'clamp(40px, 4.6vw, 76px)' }],
    },
    portrait: {
      cam: () => ({ pos: g(5.0, 22.0, 8.5), target: [-8.5, 9.5, 18.5], fov: 60, shift: [0, -0.1] }),
      text: [{ kind: 'display', text: 'Good questions\nbecome *experiments.*', x: 0.085, y: 0.085, size: '38px' }],
    },
  },

  // 3. The big-word beat: switchbacks from above, behind "Repeat".
  repeat: {
    scene: {
      ink: 0.82,
      fog: [12, 60],
      stars: 0.0,
      snow: 80, snowNear: 1.0, snowFar: 14,
      lamp: { s: 101.0, tail: 7.0 },
      route: 0.9,
      quiet: 0.5,
      grid: { x0: -12, x1: 14, z0: 4, z1: 32, n: 340, frac: 0.8, outer: 320 },
    },
    desktop: {
      cam: (W) => {
        const c = routeAt(W, 86);
        return { pos: [1.2, c[1] + 23.0, c[2] + 4.5], target: [1.0, c[1] - 0.5, c[2] - 0.9], fov: 42 };
      },
      text: [{ kind: 'word', text: 'Repeat', x: 0.5, y: 0.5, size: 'clamp(120px, 19vw, 320px)', anchor: 'center' }],
    },
    portrait: {
      cam: (W) => {
        const c = routeAt(W, 86);
        return { pos: [1.0, c[1] + 25.0, c[2] + 4.0], target: [0.9, c[1] - 0.5, c[2] - 1.0], fov: 58 };
      },
      text: [{ kind: 'word', text: 'Repeat', x: 0.5, y: 0.5, size: '27vw', anchor: 'center' }],
    },
  },

  // 4. Chapter frame: a cirque whose stacked contours read like image slices.
  research: {
    scene: {
      ink: 0.95,
      fog: [24, 80],
      fine: 0.35, minor: 0.6, major: 1.15,
      stars: 0.55,
      snow: 50, snowNear: 2, snowFar: 25,
      slice: { h: 21.0, radius: 8.5 },
      grid: { x0: -6, x1: 26, z0: -8, z1: 22, n: 340, frac: 0.8, outer: 320 },
    },
    desktop: {
      cam: () => ({ pos: [24.0, 36.0, 34.0], target: [9.0, 22.0, 5.0], fov: 38, shift: [0.34, 0] }),
      text: [
        { kind: 'heading', text: 'Learning from images', x: 0.07, y: 0.34, size: 'clamp(36px, 3.9vw, 64px)' },
        { kind: 'body', text: 'At UNC PRIMES, I work on deep learning for neuroscience image processing.', x: 0.072, y: 0.455, w: 0.27 },
      ],
    },
    portrait: {
      cam: () => ({ pos: [26.0, 30.0, 36.0], target: [9.0, 24.5, 4.0], fov: 62, shift: [0, -0.2] }),
      text: [
        { kind: 'heading', text: 'Learning from images', x: 0.085, y: 0.075, size: '34px' },
        { kind: 'body', text: 'At UNC PRIMES, I work on deep learning for neuroscience image processing.', x: 0.087, y: 0.14, w: 0.8 },
      ],
    },
  },

  // 5. The summit plateau: seven cairns in an arc, each labelled.
  stones: {
    scene: {
      ink: 0.9,
      fog: [9, 40],
      aurora: 1.0, auroraAz: deg(-6), auroraSpan: 0.7, auroraBase: deg(5), auroraHeight: deg(13),
      stars: 0.7,
      snow: 100, snowNear: 1.0, snowFar: 16,
      lamp: { s: -0.3, tail: 1.3 },
      cairns: true, stoneStep: 0.034,
      quiet: 0.0,
      grid: { x0: -11, x1: 10, z0: -9, z1: 12, n: 300, frac: 0.8, outer: 320 },
    },
    desktop: {
      cam: (W) => {
        const p = W.plateau.center;
        return { pos: [p[0] - 0.35, p[1] + 1.35, p[2] + 6.4], target: [p[0] - 0.05, p[1] + 0.75, p[2] - 1.2], fov: 44, near: 0.05 };
      },
      text: 'labels',
      labels: { dx: 0, dy: 16, align: 'center' },
    },
    portrait: {
      cam: (W) => {
        const a = W.arcCenter;
        return { pos: [a[0] + 6.3, W.plateau.center[1] + 6.4, a[1] - 1.3], target: [a[0] - 0.3, W.plateau.center[1] - 0.3, a[1] - 1.9], fov: 60, near: 0.05 };
      },
      text: 'labels',
      labels: { dx: -22, dy: -7, align: 'right' },
    },
  },

  // 6. One stone (About) hovered: top stone lifted, one orange isoline rings it.
  stone: {
    scene: {
      ink: 0.9,
      fog: [5, 26],
      aurora: 0.9, auroraAz: deg(-18), auroraSpan: 0.5, auroraBase: deg(6), auroraHeight: deg(12),
      stars: 0.6,
      snow: 60, snowNear: 0.6, snowFar: 8,
      cairns: true, lift: 0, ring: 0, stoneStep: 0.021,
      grid: { x0: -8, x1: 2, z0: -5, z1: 5, n: 300, frac: 0.8, outer: 320 },
    },
    desktop: {
      cam: (W) => {
        const c = W.cairns[0].position;
        return { pos: [c[0] + 1.35, c[1] + 0.78, c[2] + 2.7], target: [c[0] - 0.8, c[1] + 0.62, c[2] - 0.05], fov: 34, near: 0.03 };
      },
      text: [
        { kind: 'name', text: 'About', x: 0.072, y: 0.36, size: 'clamp(56px, 6.4vw, 104px)' },
        { kind: 'body', text: 'Who I am, CV, contact, stars', x: 0.076, y: 0.505 },
        { kind: 'cue', text: 'Open', x: 0.076, y: 0.585, arrow: true },
      ],
    },
    portrait: {
      cam: (W) => {
        const c = W.cairns[0].position;
        return { pos: [c[0] + 0.9, c[1] + 0.75, c[2] + 2.9], target: [c[0] + 0.02, c[1] + 0.62, c[2] - 0.1], fov: 50, near: 0.03, shift: [0, -0.2] };
      },
      text: [
        { kind: 'name', text: 'About', x: 0.085, y: 0.085, size: '56px' },
        { kind: 'body', text: 'Who I am, CV, contact, stars', x: 0.09, y: 0.165 },
        { kind: 'cue', text: 'Open', x: 0.09, y: 0.21, arrow: true },
      ],
    },
  },

  // 7. Contact: the view tilts up; star trails wheel round the pole.
  contact: {
    scene: {
      ink: 0.34,
      fog: [6, 40],
      fine: 0.6, minor: 0.8, major: 1.0,
      stars: 0.0, trails: true,
      lamp: { s: 135.0, tail: 4.0 },
      quiet: 0.3,
      grid: { x0: -26, x1: 16, z0: -10, z1: 30, n: 300, frac: 0.8, outer: 320 },
    },
    desktop: {
      cam: () => ({ pos: [-14.0, 8.5, 24.0], target: [-2.0, 34.0, -4.0], fov: 54 }),
      pole: { az: deg(6), el: deg(52) },
      text: [
        { kind: 'display', text: 'Have something in mind?\n*Let’s build it together.*', x: 0.07, y: 0.66, size: 'clamp(34px, 3.6vw, 60px)' },
        { kind: 'links', items: ['Email', 'X', 'GitHub', 'LinkedIn'], x: 0.072, y: 0.84 },
      ],
    },
    portrait: {
      cam: () => ({ pos: [-10.0, 8.5, 25.0], target: [-1.0, 36.0, -4.0], fov: 66 }),
      pole: { az: deg(-4), el: deg(60) },
      text: [
        { kind: 'display', text: 'Have something in mind?\n*Let’s build it together.*', x: 0.085, y: 0.69, size: '31px' },
        { kind: 'links', items: ['Email', 'X', 'GitHub', 'LinkedIn'], x: 0.087, y: 0.87 },
      ],
    },
  },
};

// Merge the shot's scene with its layout's overrides; evaluate the camera.
export function resolveShot(id, layout, world) {
  const key = SHOTS[id] ? id : 'hero';
  const shot = SHOTS[key];
  const lay = shot[layout] || shot.desktop;
  const scene = { ...DEFAULT_SCENE, ...shot.scene, ...(lay.scene || {}) };
  scene.grid = { ...DEFAULT_SCENE.grid, ...(shot.scene.grid || {}), ...((lay.scene && lay.scene.grid) || {}) };
  const cam = { near: 0.1, far: 2400, shift: [0, 0], ...lay.cam(world) };
  return { id: key, layout, scene, cam, text: lay.text, labels: lay.labels || null, pole: lay.pole || null };
}
