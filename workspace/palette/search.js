// Ranking for the command palette and the "did you mean" guess on the 404 page.
// No DOM, so the browser and the Node tests import the same file.

// Lower case, accents removed: "Café" and "cafe" are the same query.
const fold = value => String(value ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
const words = text => text.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
const letters = text => text.replace(/[^\p{L}\p{N}]/gu, '');

// The needle's letters, in order, inside a stretch of the haystack at most twice the needle's length.
// Loose enough for "projcts" or "ppiano". Without the limit, a hundred-letter title matches almost any short word.
function scattered(needle, haystack) {
  if (!needle) return false;
  for (let start = haystack.indexOf(needle[0]); start >= 0; start = haystack.indexOf(needle[0], start + 1)) {
    const end = Math.min(haystack.length, start + needle.length * 2);
    let at = 1;
    for (let i = start + 1; i < end && at < needle.length; i++) if (haystack[i] === needle[at]) at++;
    if (at === needle.length) return true;
  }
  return false;
}

function fields(item) {
  const title = fold(item.title);
  const rest = fold([item.hint, [].concat(item.keywords || []).join(' '), item.group].filter(Boolean).join(' '));
  return { title, titleWords: words(title), rest, restWords: words(rest) };
}

// The best single way a token matches an item; 0 means it does not match at all.
function tokenScore(text, token) {
  if (text.title.startsWith(token)) return 100;
  if (text.titleWords.some(w => w.startsWith(token))) return 80;
  if (text.title.includes(token)) return 60;
  if (text.restWords.some(w => w.startsWith(token))) return 40;
  if (text.rest.includes(token)) return 25;
  if (scattered(letters(token), letters(text.title))) return 10;
  return 0;
}

/** Items that match every word of the query, best first. An empty query returns them all, in order. */
export function search(items, query) {
  const tokens = fold(query).trim().split(/\s+/).filter(Boolean);
  if (!tokens.length) return [...items];
  const ranked = [];
  items.forEach((item, order) => {
    const text = fields(item);
    let score = 0;
    for (const token of tokens) {
      const points = tokenScore(text, token);
      if (!points) return;
      score += points;
    }
    ranked.push({ item, score, order });
  });
  return ranked.sort((a, b) => b.score - a.score || a.order - b.order).map(r => r.item);
}

/** Damerau-Levenshtein distance: inserts, deletes, substitutions and swaps of two neighbouring letters. */
export function distance(a, b) {
  let before = [];
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) row[j] = Math.min(row[j], before[j - 2] + 1);
    }
    before = prev;
    prev = row;
  }
  return prev[b.length];
}

// "/Research/primes.html?x#y" -> "research/primes". The ".html" goes because people type /about.html for /about/.
const normalise = path => String(path ?? '').toLowerCase().split(/[?#]/)[0].replace(/^\/+|\/+$/g, '').replace(/(?:(?:^|\/)index)?\.html?$/, '');

/** The candidate path a visitor most likely meant by a path that does not exist, or null. */
export function closest(path, candidates) {
  const want = normalise(path);
  if (!want) return null;
  const segments = want.split('/');
  // Three kinds of guess, tried in this order: a typo, an address cut short, an address that goes too deep.
  let near = null;
  let longer = null;
  let parent = null;
  for (const candidate of candidates) {
    const have = normalise(candidate);
    // The homepage is never a guess: the 404 page always links it anyway.
    if (!have) continue;
    const parts = have.split('/');
    let same = 0;
    while (same < parts.length && same < segments.length && parts[same] === segments[same]) same++;
    // Only the part after the shared folders is compared, so /blog/ab/ is not taken for /blog/cd/
    // just because both start with /blog/.
    const a = segments.slice(same).join('/');
    const b = parts.slice(same).join('/');
    const d = distance(a, b);
    // Two edits is most of a three-letter name, so a guess may also change at most half of the shorter one.
    const limit = Math.min(Math.max(2, 0.34 * Math.max(a.length, b.length)), Math.min(a.length, b.length) / 2);
    if (d <= limit && (!near || d < near.d)) near = { candidate, d };
    // /github or /proj: the shortest real address that begins this way. Three letters at least, or it is a coin toss.
    if (want.length >= 3 && have.startsWith(want) && (!longer || have.length < longer.length)) longer = { candidate, length: have.length };
    if (same === parts.length && same < segments.length && (!parent || same > parent.depth)) parent = { candidate, depth: same };
  }
  return near?.candidate ?? longer?.candidate ?? parent?.candidate ?? null;
}
