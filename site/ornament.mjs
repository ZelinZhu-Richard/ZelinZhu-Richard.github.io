// The one ornament of the "instrument" look (site/DESIGN.md): an engraved orrery drawn as inline SVG.
// A graduated dial ring, the sphere's meridian, an equator, the ecliptic tilted by 23.4 degrees (the
// Earth's axial tilt) with its axis, a planet on it and an amber sun. Back halves of the rings are
// dashed, as hidden lines are in a technical drawing. Colours come from CSS (.orrery in portfolio.css),
// so the same markup works on night and chart paper. Deterministic: the same variant draws the same SVG.
const TILT = 23.4;
const r1 = n => Math.round(n * 10) / 10;

// Ticks every 5 degrees, inward from the dial ring: long every 30, medium every 15.
function dialTicks(radius) {
  let d = '';
  for (let i = 0; i < 72; i++) {
    const a = (i * 5 - 90) * Math.PI / 180;
    const length = i % 6 === 0 ? 13 : i % 3 === 0 ? 8 : 4;
    const [cx, cy] = [Math.cos(a), Math.sin(a)];
    d += `M${r1(cx * radius)} ${r1(cy * radius)}L${r1(cx * (radius - length))} ${r1(cy * (radius - length))}`;
  }
  return d;
}

// An ellipse seen edge-on: the back (upper) half dashed, the front (lower) half solid.
const ring = (rx, ry, cls) => `<path class="${cls} o-back" d="M${-rx} 0A${rx} ${ry} 0 0 1 ${rx} 0"/><path class="${cls}" d="M${-rx} 0A${rx} ${ry} 0 0 0 ${rx} 0"/>`;

/** variant: a section's index (0 to 6); it turns the figure and moves the planet, so each section has its own. */
export function orrery(variant = 0) {
  const turn = -8 + variant * 7;
  const phase = (40 + variant * 47) % 360;
  const p = phase * Math.PI / 180;
  // The planet rides the front half of the ecliptic when it can be seen there.
  const planet = [r1(Math.cos(p) * 150), r1(Math.abs(Math.sin(p)) * 44)];
  return `<svg class="orrery" viewBox="-200 -200 400 400" width="400" height="400" aria-hidden="true" focusable="false">
<g transform="rotate(${turn})">
<circle class="o-dial" r="190"/><path class="o-tick" d="${dialTicks(190)}"/>
<circle class="o-ring" r="150"/>
${ring(150, 34, 'o-ring')}
<g transform="rotate(${-TILT})">${ring(150, 44, 'o-tilt')}<path class="o-tilt o-axis" d="M0 -172V172"/><circle class="o-planet" cx="${planet[0]}" cy="${planet[1]}" r="4"/></g>
<circle class="o-halo" r="12"/><circle class="o-sun" r="5"/>
</g>
</svg>`;
}
