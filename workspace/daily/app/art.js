// Pet art adapter. Uses ../pets/index.js (renderPet, renderEgg, renderSilhouette) when it
// exists; otherwise neutral placeholders with the same signatures, so the UI works mid-build.
import { esc } from './html.js';
import { tierColor, tierName } from './format.js';

const box = size => `width="${size}" height="${size}" viewBox="0 0 160 160"`;

export const placeholderArt = {
  placeholder: true,
  renderPet({ species = 'pet', tier = 0, mood = 'healthy', size = 128, name = '' } = {}) {
    const c = tierColor(tier);
    if (mood === 'dead') {
      return `<svg class="pet pet--placeholder pet--dead" ${box(size)} role="img" aria-label="${esc(name || species)}: gravestone"><ellipse cx="80" cy="149" rx="35" ry="5" fill="#000" opacity=".3"/><path d="M52 148V82a28 28 0 0 1 56 0v66z" fill="#4a4560" stroke="#1a1530" stroke-width="4"/><text x="80" y="104" text-anchor="middle" font-size="16" fill="#c2bad0">RIP</text></svg>`;
    }
    if (mood === 'ashes') {
      return `<svg class="pet pet--placeholder pet--ashes" ${box(size)} role="img" aria-label="${esc(name || species)}: ashes"><ellipse cx="80" cy="138" rx="46" ry="12" fill="#3a3548" stroke="#4a4560" stroke-width="4"/><circle cx="70" cy="132" r="4" fill="#ffb347"/><circle cx="86" cy="136" r="3" fill="#ff7a3d"/><circle cx="95" cy="130" r="3" fill="#ffb347"/></svg>`;
    }
    const face = mood === 'hungry' || mood === 'starving'
      ? '<path d="M62 84h10M88 84h10" stroke="#1a1530" stroke-width="4" stroke-linecap="round"/><path d="M72 102q8-6 16 0" fill="none" stroke="#1a1530" stroke-width="3" stroke-linecap="round"/>'
      : '<ellipse cx="67" cy="84" rx="6.5" ry="8.5" fill="#1a1530"/><ellipse cx="93" cy="84" rx="6.5" ry="8.5" fill="#1a1530"/><circle cx="65" cy="81" r="2.5" fill="#fff"/><circle cx="91" cy="81" r="2.5" fill="#fff"/><path d="M75 100q5 5 10 0" fill="none" stroke="#1a1530" stroke-width="3" stroke-linecap="round"/>';
    return `<svg class="pet pet--placeholder pet--${esc(mood)}" ${box(size)} role="img" aria-label="${esc(name || species)}, ${esc(tierName(tier))} ${esc(species)}"><ellipse cx="80" cy="149" rx="35" ry="5" fill="#000" opacity=".3"/><g class="pet-body"><circle cx="80" cy="92" r="52" fill="${c}" stroke="#1a1530" stroke-width="4"/><ellipse cx="94" cy="112" rx="26" ry="18" fill="#000" opacity=".08"/><circle cx="58" cy="66" r="4" fill="#fff" opacity=".9"/>${face}</g></svg>`;
  },
  renderEgg({ kind = 'open', tier = 0, state = 'idle', size = 72 } = {}) {
    const c = tierColor(tier);
    const crack = state === 'crack' || state === 'open' ? '<path d="M50 90l12-8 10 10 12-10 10 8 14-8" fill="none" stroke="#1a1530" stroke-width="4" stroke-linejoin="round"/>' : '';
    const band = kind === 'pet' ? `<path d="M44 104q36 14 72 0" fill="none" stroke="#1a1530" stroke-width="3" opacity=".35"/><circle cx="80" cy="74" r="7" fill="#fff" opacity=".55"/>` : `<path d="M46 96h68" stroke="#1a1530" stroke-width="3" opacity=".3"/>`;
    return `<svg class="egg egg--placeholder egg--${esc(state)}" ${box(size)} aria-hidden="true"><ellipse cx="80" cy="149" rx="30" ry="5" fill="#000" opacity=".3"/><path d="M80 24c26 0 42 44 42 74a42 42 0 0 1-84 0c0-30 16-74 42-74z" fill="${c}" stroke="#1a1530" stroke-width="4"/>${band}${crack}<circle cx="64" cy="58" r="5" fill="#fff" opacity=".8"/></svg>`;
  },
  renderSilhouette({ size = 72 } = {}) {
    return `<svg class="pet pet--silhouette" ${box(size)} aria-hidden="true"><circle cx="80" cy="92" r="50" fill="#ffffff10" stroke="#ffffff30" stroke-width="3" stroke-dasharray="6 8"/><text x="80" y="104" text-anchor="middle" font-size="36" fill="#5f5975">?</text></svg>`;
  },
  SPECIES: [
    { id: 'dragon', name: 'Drakelet' }, { id: 'fox', name: 'Kitsu' }, { id: 'slime', name: 'Gumdrop' },
    { id: 'owl', name: 'Hootling' }, { id: 'turtle', name: 'Pebbleback' }, { id: 'axolotl', name: 'Ripplegill' },
    { id: 'hedgehog', name: 'Bramblekin', unlock: { type: 'keeper', level: 25 } },
  ],
};

// Loads the real renderer if the art module exists. The URL is built at runtime so the
// build verifier does not require ../pets/ to exist while it is still being written.
export async function loadArt(base = import.meta.url) {
  try {
    const mod = await import(new URL('../pets/index.js', base).href);
    if (typeof mod.renderPet !== 'function') return placeholderArt;
    return {
      placeholder: false,
      renderPet: mod.renderPet,
      renderEgg: typeof mod.renderEgg === 'function' ? mod.renderEgg : placeholderArt.renderEgg,
      renderSilhouette: typeof mod.renderSilhouette === 'function' ? mod.renderSilhouette : placeholderArt.renderSilhouette,
      SPECIES: Array.isArray(mod.SPECIES) ? mod.SPECIES : placeholderArt.SPECIES,
    };
  } catch {
    return placeholderArt;
  }
}

export function petsStylesheet(doc, base = import.meta.url) {
  if (!doc || doc.querySelector('link[data-pets-css]')) return;
  const link = doc.createElement('link');
  link.rel = 'stylesheet';
  link.href = new URL('../pets/pets.css', base).href;
  link.dataset.petsCss = '';
  doc.head.append(link);
}
