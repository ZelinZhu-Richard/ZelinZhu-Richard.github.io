// The ART.md palette, as sRGB triples. Colour management is switched off in
// main.js, so these values reach the screen unchanged.

function hex(h) {
  const n = parseInt(h.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export const PALETTE = {
  night: hex('#100f15'),
  stage: hex('#08070b'),
  ink: hex('#ece9e1'),
  muted: hex('#a8a398'),
  faint: hex('#7a766d'),
  line: hex('#2d2b34'),
  accent: hex('#e8743b'),
};

export const NIGHT_HEX = 0x100f15;
