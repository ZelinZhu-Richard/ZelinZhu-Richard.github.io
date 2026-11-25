// Tests for the BibTeX entry and the Cite block built from a publication (../bibtex.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { authorList, bibtex, citeBlock, citeKey } from '../bibtex.mjs';
import { PUBLICATIONS } from '../../../site/content.mjs';

const paper = (over = {}) => ({ title: 'On the Limits of Agents', authors: 'Ada Lovelace', venue: 'Some Workshop', kind: 'Poster', when: 'Dec 2026', href: 'https://example.com/paper', ...over });
const field = (entry, name) => (entry.match(new RegExp(`^  ${name}\\s+= (.*?),?$`, 'm')) || [])[1];
// Found by title: PUBLICATIONS is newest first, so the poster will not stay at index 0.
const poster = PUBLICATIONS.find(p => p.title.startsWith('Validity-Constrained'));

test('the shipped publication gives exactly this entry', () => {
  assert.equal(citeKey(poster), 'zhu2026validity');
  assert.equal(bibtex(poster), `@misc{zhu2026validity,
  title        = {{Validity-Constrained Agentic Quantitative Research: A Hidden-Ground-Truth Benchmark and a Bounded Scheduler Comparison}},
  author       = {Zhu, Zelin},
  year         = {2026},
  month        = dec,
  howpublished = {Accepted poster, Agenthon Workshop, NeurIPS 2026},
  url          = {https://www.agenthon.net/#posters}
}`);
});

test('every shipped publication can be cited, each under its own key', () => {
  const keys = PUBLICATIONS.map(citeKey);
  for (const p of PUBLICATIONS) assert.doesNotThrow(() => citeBlock(p), p.title);
  assert.equal(new Set(keys).size, keys.length, 'two publications share a key, so their ids would clash on the page');
});

test('the key is family name, year, first title word that is not a stop word', () => {
  assert.equal(citeKey(paper()), 'lovelace2026limits');
  assert.equal(citeKey(paper({ title: 'The Art of the Deal' })), 'lovelace2026art');
  assert.equal(citeKey(paper({ title: '“Quoted” Words First' })), 'lovelace2026quoted');
  assert.equal(citeKey(paper({ title: '3D Scenes for Robots' })), 'lovelace2026scenes');
  assert.equal(citeKey(paper({ title: 'Self-Play (and Why) It Works' })), 'lovelace2026self');
  assert.equal(citeKey(paper({ authors: 'Jürgen Müller and Ada Lovelace' })), 'muller2026limits');
  assert.equal(citeKey(paper({ authors: "Conan O'Brien" })), 'obrien2026limits');
  assert.equal(citeKey(paper({ when: '2025' })), 'lovelace2025limits');
});

test('authors become "Family, Given" joined with and', () => {
  assert.equal(field(bibtex(paper({ authors: 'Ada Lovelace and Alan Turing' })), 'author'), '{Lovelace, Ada and Turing, Alan}');
  assert.equal(field(bibtex(paper({ authors: 'Ada Lovelace, Alan Turing' })), 'author'), '{Lovelace, Ada and Turing, Alan}');
  assert.equal(field(bibtex(paper({ authors: 'Ada Lovelace, Alan Turing, and Grace Hopper' })), 'author'), '{Lovelace, Ada and Turing, Alan and Hopper, Grace}');
  assert.equal(field(bibtex(paper({ authors: 'Alan Mathison Turing' })), 'author'), '{Turing, Alan Mathison}');
  assert.equal(field(bibtex(paper({ authors: 'Ada Lovelace & Alan Turing' })), 'author'), '{Lovelace, Ada and Turing, Alan}');
  assert.equal(field(bibtex(paper({ authors: 'Ada Lovelace; Alan Turing' })), 'author'), '{Lovelace, Ada and Turing, Alan}');
  assert.equal(field(bibtex(paper({ authors: 'Sandy Anderson' })), 'author'), '{Anderson, Sandy}', 'the "and" inside a name is not a separator');
  assert.equal(field(bibtex(paper({ authors: 'Plato' })), 'author'), '{Plato}');
  assert.deepEqual(authorList('Alan M. Turing'), [{ given: 'Alan M.', family: 'Turing' }]);
  assert.throws(() => bibtex(paper({ authors: '' })), /at least one author/);
});

test('BibTeX specials are escaped everywhere except the url', () => {
  const entry = bibtex(paper({ title: 'Risk & Return: 100% of $5 in #1 a_b', authors: 'Ada Love_lace', venue: 'R&D Day', href: 'https://example.com/a_b?x=1&y=2#top' }));
  assert.equal(field(entry, 'title'), '{{Risk \\& Return: 100\\% of \\$5 in \\#1 a\\_b}}');
  assert.equal(field(entry, 'author'), '{Love\\_lace, Ada}');
  assert.equal(field(entry, 'howpublished'), '{Poster, R\\&D Day}');
  assert.equal(field(entry, 'url'), '{https://example.com/a_b?x=1&y=2#top}');
});

test('a publication with no year cannot be cited', () => {
  assert.throws(() => bibtex(paper({ when: 'Forthcoming' })), /no four-digit year/);
  assert.throws(() => citeKey(paper({ when: undefined })), /no four-digit year/);
  assert.throws(() => citeBlock(paper({ when: 'Dec 26' })), /no four-digit year/);
  assert.throws(() => bibtex(paper({ when: 'Dec 20261' })), /no four-digit year/);
});

test('a publication with no title stops instead of printing "undefined"', () => {
  for (const title of [undefined, '']) {
    assert.throws(() => bibtex(paper({ title })), /needs a title/);
    assert.throws(() => citeBlock(paper({ title })), /needs a title/);
  }
});

test('the month is a BibTeX macro when the date starts with a month name, and is left out otherwise', () => {
  assert.equal(field(bibtex(paper({ when: 'Dec 2026' })), 'month'), 'dec');
  assert.equal(field(bibtex(paper({ when: 'September 2026' })), 'month'), 'sep');
  assert.equal(field(bibtex(paper({ when: 'Sept 2026' })), 'month'), 'sep');
  for (const when of ['2026', 'Fall 2026', 'Ma 2026', 'Decade of 2026']) {
    const entry = bibtex(paper({ when }));
    assert.doesNotMatch(entry, /month/, when);
    assert.match(entry, /^  year         = \{2026\},\n  howpublished/m, when);
  }
});

test('fields that have no value are left out, and the entry never ends with a comma or a newline', () => {
  const entry = bibtex(paper({ href: '', kind: '', venue: '' }));
  assert.doesNotMatch(entry, /url|howpublished/);
  assert.ok(entry.endsWith('  month        = dec\n}'));
  assert.equal(bibtex(paper()), bibtex(paper()), 'same input, same text');
});

test('the Cite block escapes the entry, points the hidden copy button at it, and reads without JavaScript', () => {
  const p = paper({ title: 'Risk & <Return>' });
  const html = citeBlock(p);
  assert.ok(html.startsWith('<details class="cite"><summary>Cite</summary><div class="cite-body"><pre><code id="cite-lovelace2026risk">@misc{lovelace2026risk,\n'));
  assert.ok(html.endsWith('</code></pre><button type="button" class="copy-button" data-copy-from="cite-lovelace2026risk" hidden>Copy BibTeX</button></div></details>'));
  assert.ok(html.includes('{{Risk \\&amp; &lt;Return&gt;}}'));
  assert.doesNotMatch(html, /<Return>/);
  const [, id] = html.match(/<code id="([^"]+)">/);
  const [, from] = html.match(/data-copy-from="([^"]+)"/);
  assert.equal(id, from);
  assert.equal(id, `cite-${citeKey(p)}`);
  const unescaped = html.match(/<code[^>]*>([\s\S]*?)<\/code>/)[1].replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&quot;', '"').replaceAll('&#39;', "'").replaceAll('&amp;', '&');
  assert.equal(unescaped, bibtex(p), 'the browser shows, and the button copies, the entry itself');
});

test('the shipped Cite block has nothing the site check rejects', () => {
  const html = citeBlock(poster);
  assert.doesNotMatch(html, /noindex|(?:href|src)=/);
  assert.equal(html.split('id="cite-zhu2026validity"').length, 2);
});
