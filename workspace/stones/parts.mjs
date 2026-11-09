// The seven stones at the end of the phoenix homepage, one per part of the site.
// ring: the hold ring's colours for that stone, deep to near-white; it brightens as it fills.
// site/story.mjs turns these into the crystal cards; build.mjs links the destination pages together.
export const PARTS = [
  { id: 'about', title: 'About', subtitle: 'Who I am, CV, contact, stars', href: '/about/', ring: ['#1d2a00', '#5e8a00', '#a6e22e', '#dcf7a0', '#fbfff0'] },
  { id: 'projects', title: 'Projects', subtitle: 'Quant research, AI evaluation', href: '/projects/', ring: ['#0a1a4f', '#1f4fd1', '#19b4e6', '#8fd8ff', '#eef9ff'] },
  { id: 'research', title: 'Research', subtitle: 'Deep learning on brain images', href: '/research/', ring: ['#24104f', '#5b2fd0', '#9b6bff', '#cdb6ff', '#f6f1ff'] },
  { id: 'experiments', title: 'Experiments', subtitle: 'Camera toys in your browser', href: '/experiments/', ring: ['#062e26', '#0f8a5f', '#2fd39a', '#a6f2d2', '#f0fff8'] },
  { id: 'film', title: 'Film', subtitle: 'Neon Rain, ten seconds of noir', href: '/video/', ring: ['#3d0a2a', '#b0186a', '#ff4fa0', '#ffb3d6', '#fff2f8'] },
  { id: 'now', title: 'Now', subtitle: 'What I’m studying this term', href: '/now/', ring: ['#3b1f00', '#b86a00', '#ffb000', '#ffe08a', '#fffbea'] },
  { id: 'daily', title: 'Daily', subtitle: 'My to-do list feeds my pets', href: '/daily/', ring: ['#3f0d08', '#c2321f', '#ff6a4d', '#ffc0b0', '#fff3ef'] },
];

// A stone's card link is a hash on the homepage; home.js reads it and hands off to the page.
export const stoneHash = part => `#to-${part.id}`;

// Which stone a page belongs to, for the site menu's current marker.
const OWNER = [
  [/^\/(about|contacts|skills)\/|^\/github\/stars\//, 'about'],
  [/^\/projects\//, 'projects'],
  [/^\/research\//, 'research'],
  [/^\/(experiments|domainexp|ppiano|gym|flash)\//, 'experiments'],
  [/^\/video\//, 'film'],
  [/^\/now\//, 'now'],
  [/^\/daily\//, 'daily'],
];
export const ownerOf = path => OWNER.find(([re]) => re.test(path))?.[1] || '';

// The one site menu: the seven stones, numbered. Replaces the old page list everywhere.
export function stoneNav(path) {
  const current = ownerOf(path);
  return `<nav id="navigation" class="stone-nav" aria-label="Main navigation">${PARTS.map((p, i) => `<a href="${p.href}"${p.id === current ? ' aria-current="page"' : ''}><span>${String(i + 1).padStart(2, '0')}</span>${p.title}</a>`).join('')}</nav>`;
}
