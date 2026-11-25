// BibTeX for a publication in site/content.mjs (PUBLICATIONS), and the "Cite" block the Research page shows under it.
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const STOP_WORDS = new Set(['a', 'an', 'the', 'on', 'of', 'for', 'in', 'and', 'to', 'with']);
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

// Müller -> muller: citation keys are safest as plain a-z.
const fold = text => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
const tex = value => String(value).replace(/[&%$#_]/g, '\\$&');

/** 'Ada Lovelace, Alan M. Turing and Grace Hopper' -> [{ given: 'Ada', family: 'Lovelace' }, ...]. The family name is the last word. */
export function authorList(authors) {
  const names = String(authors || '').split(/\s*[,;]\s*(?:(?:and|&)\s+)?|\s+(?:and|&)\s+/).map(name => name.trim()).filter(Boolean);
  if (!names.length) throw new Error('A publication needs at least one author to be cited');
  return names.map(name => {
    const words = name.split(/\s+/);
    return { given: words.slice(0, -1).join(' '), family: words.at(-1) };
  });
}

function year(p) {
  const found = String(p.when || '').match(/\b\d{4}\b/);
  if (!found) throw new Error(`Publication "${p.title}" has no four-digit year in when: "${p.when || ''}"`);
  return found[0];
}

// 'Dec 2026' or 'December 2026' -> 'dec', the macro every BibTeX style defines. Anything else gives no month.
function month(p) {
  const [, word = ''] = String(p.when || '').match(/^\s*([A-Za-z]{3,})/) || [];
  const name = word && MONTHS.find(m => m.startsWith(word.toLowerCase()));
  return name ? name.slice(0, 3) : '';
}

/** zhu2026validity: first author's family name, the year, the first title word that carries meaning. */
export function citeKey(p) {
  if (!p.title) throw new Error('A publication needs a title to be cited');
  const family = fold(authorList(p.authors)[0].family).replace(/[^a-z]/g, '');
  // Leading letters of each word, past any opening quote or bracket: 'Validity-Constrained' gives 'validity', '3D' gives nothing.
  const word = String(p.title).split(/\s+/).map(w => (fold(w).match(/^[^a-z0-9]*([a-z]+)/) || [])[1]).find(w => w && !STOP_WORDS.has(w)) || '';
  return `${family}${year(p)}${word}`;
}

/** An @misc entry: the shipped publication is a workshop poster, not a paper in proceedings. */
export function bibtex(p) {
  const key = citeKey(p);
  const howPublished = [p.kind, p.venue].filter(Boolean).join(', ');
  const fields = [
    // Double braces stop BibTeX styles from lower-casing the title.
    ['title', `{{${tex(p.title)}}}`],
    ['author', `{${authorList(p.authors).map(a => tex(a.given ? `${a.family}, ${a.given}` : a.family)).join(' and ')}}`],
    ['year', `{${year(p)}}`],
    ['month', month(p)],
    ['howpublished', howPublished && `{${tex(howPublished)}}`],
    ['url', p.href && `{${p.href}}`],
  ].filter(([, value]) => value);
  return `@misc{${key},\n${fields.map(([name, value]) => `  ${name.padEnd(12)} = ${value}`).join(',\n')}\n}`;
}

/** The folded block under a publication. The copy button ships hidden; /portfolio.js shows it where the clipboard works. */
export function citeBlock(p) {
  const id = escape(`cite-${citeKey(p)}`);
  return `<details class="cite"><summary>Cite</summary><div class="cite-body"><pre><code id="${id}">${escape(bibtex(p))}</code></pre><button type="button" class="copy-button" data-copy-from="${id}" hidden>Copy BibTeX</button></div></details>`;
}
