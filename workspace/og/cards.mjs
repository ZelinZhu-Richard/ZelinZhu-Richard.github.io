// The social share cards: which 1200x630 image a link to a page shows.
// make_cards.py draws one image per entry in cards.json; build.mjs points each page's meta tags at its card.
import { readFileSync } from 'node:fs';
import { ownerOf } from '../stones/parts.mjs';

export const CARD = { width: 1200, height: 630 };

const list = JSON.parse(readFileSync(new URL('./cards.json', import.meta.url), 'utf8'));
export const cards = () => list;

// The most specific rule wins: the page itself, then the longest folder it sits in, then its section, then the site card.
export function cardFor(path, all = cards()) {
  const card = all.find(c => c.match?.paths?.includes(path))
    || all.filter(c => c.match?.prefix && path.startsWith(c.match.prefix)).sort((a, b) => b.match.prefix.length - a.match.prefix.length)[0]
    || all.find(c => c.match?.section && c.match.section === ownerOf(path))
    || all.find(c => c.name === 'site');
  if (!card) throw new Error('og: cards.json has no card named "site", the card every other page falls back to');
  return { name: card.name, src: `/og/${card.name}.png`, alt: `${card.title}: ${card.text}` };
}
