// The seven shots. Each is a camera (per layout) plus a scene state.
// cam: eye, target, fov (vertical, degrees), and an optional anchor that the
// lens shift pins to a screen position `at` = [u, v] (0..1 from top left).
// Ground-level shots keep the eye at y = 0 so the seed sits on the horizon.
//
// text: blocks of real DOM text. x, y are fractions of the viewport, `anchor`
// is the point of the block placed there ([0, 1] = bottom left), `size` is the
// display size in CSS px for that layout.

export const SHOTS = {
  hero: {
    cam: {
      desktop: { eye: [0, 0, 15.5], target: [0, 0.55, 0], fov: 30, anchor: [0, 0, 0], at: [0.705, 0.635] },
      portrait: { eye: [0, 0, 15.5], target: [0, 0.6, 0], fov: 46, anchor: [0, 0, 0], at: [0.74, 0.7] },
    },
    tree: { growth: 0.0006, front: false, minR: 0.0115, ghost: { span: 0.17, alpha: 0.3, dash: 5 } },
    seed: 'accent',
    stars: 0.5,
    horizonGlow: 0.5,
    fog: [10, 60, 0.4],
    text: {
      desktop: [
        { cls: 'name', html: 'Richard Zhu', x: 0.083, y: 0.6, anchor: [0, 1], size: 104 },
        { cls: 'tag mono', html: 'A student of what comes next.', x: 0.086, y: 0.672, anchor: [0, 0], size: 12.5 },
        { cls: 'cue mono', html: 'Scroll', x: 0.086, y: 0.915, anchor: [0, 1], size: 11 },
      ],
      portrait: [
        { cls: 'name', html: 'Richard<br>Zhu', x: 0.062, y: 0.36, anchor: [0, 1], size: 64 },
        { cls: 'tag mono', html: 'A student of<br>what comes next.', x: 0.066, y: 0.39, anchor: [0, 0], size: 11.5 },
        { cls: 'cue mono', html: 'Scroll', x: 0.066, y: 0.94, anchor: [0, 1], size: 10.5 },
      ],
    },
  },

  experiments: {
    cam: {
      desktop: { eye: [2.8, 0, 10.2], target: [0.4, 3.4, 0], fov: 40, anchor: [0, 0, 0], at: [0.68, 0.93] },
      portrait: { eye: [2.2, 0, 13.5], target: [0.2, 3.4, 0], fov: 56, anchor: [0, 0, 0], at: [0.56, 0.9] },
    },
    tree: { growth: 0.2, front: true, frontLen: 0.32, ghost: { span: 0.2, alpha: 0.36, dash: 5 } },
    seed: 'ink',
    stars: 0.7,
    far: 0.8,
    horizonGlow: 0.25,
    fog: [10, 70, 0.35],
    text: {
      desktop: [{ cls: 'display', html: 'Good questions<br>become <em>experiments.</em>', x: 0.083, y: 0.44, anchor: [0, 0.5], size: 62 }],
      portrait: [{ cls: 'display', html: 'Good questions<br>become <em>experiments.</em>', x: 0.062, y: 0.15, anchor: [0, 0.5], size: 38 }],
    },
  },

  repeat: {
    cam: {
      desktop: { eye: [0.4, 4.6, 28], target: [0.0, 9.3, 0], fov: 11 },
      portrait: { eye: [0.3, 4.6, 28], target: [0.0, 8.9, 0], fov: 14 },
    },
    tree: { growth: 1, front: false, accentTip: true, frontLen: 0.55, knotW: 0.012 },
    knots: true,
    clear: { cx: 0.5, cy: 0.5, rx: 0.36, ry: 0.2, keep: 0.4 },
    fog: [24.5, 31.5, 0.22],
    subdiv: 2,
    text: {
      desktop: [{ cls: 'word', html: 'Repeat', x: 0.5, y: 0.5, anchor: [0.5, 0.56], size: 300 }],
      portrait: [{ cls: 'word', html: 'Repeat', x: 0.5, y: 0.5, anchor: [0.5, 0.56], size: 112 }],
    },
  },

  research: {
    cam: {
      desktop: { eye: [7.9, 6.6, 10.6], target: [3.2, 6.3, -0.6], fov: 38, anchor: [3.3, 6.5, -0.5], at: [0.7, 0.5] },
      portrait: { eye: [8.6, 6.4, 13.6], target: [3.4, 6.4, -0.6], fov: 46, anchor: [3.0, 6.3, -0.5], at: [0.58, 0.63] },
    },
    tree: { growth: 1, front: false, focus: 4, dim: 0.07 },
    knots: false,
    neuron: 4,
    horizon: false,
    fog: [6, 24, 0.25],
    subdiv: 2,
    text: {
      desktop: [
        { cls: 'display', html: 'Learning from <em>images</em>', x: 0.083, y: 0.47, anchor: [0, 1], size: 54 },
        { cls: 'body', html: 'At UNC PRIMES, I work on deep learning for neuroscience image processing.', x: 0.084, y: 0.5, anchor: [0, 0], size: 19, width: 400 },
      ],
      portrait: [
        { cls: 'display', html: 'Learning<br>from <em>images</em>', x: 0.062, y: 0.17, anchor: [0, 1], size: 40 },
        { cls: 'body', html: 'At UNC PRIMES, I work on deep learning for neuroscience image processing.', x: 0.064, y: 0.195, anchor: [0, 0], size: 16, width: 300 },
      ],
    },
  },

  stones: {
    cam: {
      desktop: { eye: [0.4, 3.0, 20.5], target: [0, 9.4, 0], fov: 35.5, anchor: [0, 10.1, 0], at: [0.5, 0.5] },
      portrait: { eye: [-20.84, 1.5, 21.78], target: [0, 10.3, 0.2], fov: 51, anchor: [0, 10.3, 0.2], at: [0.5, 0.47] },
    },
    tree: { growth: 0.985, front: false, knotW: 0.016, dailyFront: true },
    knots: true,
    labels: true,
    seed: 'ink',
    stars: 0.8,
    far: 1,
    fog: [17, 26, 0.4],
    text: { desktop: [], portrait: [] },
  },

  stone: {
    cam: {
      desktop: { eye: [-7.95, 6.6, 6.5], target: [-7.35, 7.15, 1.85], fov: 30, anchor: [-7.35, 7.15, 1.85], at: [0.665, 0.5] },
      portrait: { eye: [-7.9, 6.5, 6.7], target: [-7.35, 7.15, 1.85], fov: 44, anchor: [-7.35, 7.15, 1.85], at: [0.5, 0.63] },
    },
    tree: { growth: 1, front: false, knotW: 0.0075, hover: 0 },
    knots: true,
    stars: 0.6,
    horizon: false,
    fog: [4.9, 7.2, 0.07],
    subdiv: 2,
    text: {
      desktop: [
        { cls: 'display big', html: 'About', x: 0.083, y: 0.47, anchor: [0, 1], size: 104 },
        { cls: 'body', html: 'Who I am, CV, contact, stars', x: 0.086, y: 0.505, anchor: [0, 0], size: 20, width: 380 },
        { cls: 'cue mono open', html: 'Open', x: 0.086, y: 0.6, anchor: [0, 0], size: 11 },
      ],
      portrait: [
        { cls: 'display big', html: 'About', x: 0.062, y: 0.2, anchor: [0, 1], size: 72 },
        { cls: 'body', html: 'Who I am, CV, contact, stars', x: 0.066, y: 0.225, anchor: [0, 0], size: 17, width: 300 },
        { cls: 'cue mono open', html: 'Open', x: 0.066, y: 0.29, anchor: [0, 0], size: 10.5 },
      ],
    },
  },

  contact: {
    cam: {
      desktop: { eye: [3.0, 0, 13.0], target: [0.6, -1.7, 0], fov: 36, anchor: [0, 0, 0], at: [0.665, 0.37] },
      portrait: { eye: [2.2, 0, 12.0], target: [0.3, -1.8, 0], fov: 50, anchor: [0, 0, 0], at: [0.6, 0.27] },
    },
    tree: { growth: 1, front: false, dim: 0.42, knotW: 0.012 },
    roots: { pulse: true },
    seed: 'ink',
    stars: 0.6,
    far: 0.7,
    horizonGlow: 0.3,
    fog: [10, 36, 0.3],
    text: {
      desktop: [
        { cls: 'display', html: 'Have something in mind?<br><em>Let’s build it together.</em>', x: 0.083, y: 0.25, anchor: [0, 1], size: 46 },
        {
          cls: 'links mono',
          html: '<a href="#">Email</a><a href="#">X</a><a href="#">GitHub</a><a href="#">LinkedIn</a>',
          x: 0.084,
          y: 0.3,
          anchor: [0, 0],
          size: 11.5,
        },
      ],
      portrait: [
        { cls: 'display', html: 'Have something<br>in mind? <em>Let’s<br>build it together.</em>', x: 0.062, y: 0.86, anchor: [0, 1], size: 34 },
        {
          cls: 'links mono',
          html: '<a href="#">Email</a><a href="#">X</a><a href="#">GitHub</a><a href="#">LinkedIn</a>',
          x: 0.064,
          y: 0.895,
          anchor: [0, 0],
          size: 10.5,
        },
      ],
    },
  },
};

export const SHOT_IDS = Object.keys(SHOTS);
