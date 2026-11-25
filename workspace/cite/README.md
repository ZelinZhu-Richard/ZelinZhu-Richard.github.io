# Cite

`bibtex.mjs` turns a publication from `PUBLICATIONS` in `site/content.mjs` into a BibTeX `@misc` entry.
`citeBlock(p)` wraps the entry in a folded "Cite" block, made for `site/pages.mjs` to place under a publication on `/research/`.
The key is the first author's family name, the year, and the first title word that is not a stop word: `zhu2026validity`.
The Copy button ships hidden and `/portfolio.js` shows it where the clipboard works. Without JavaScript the entry can still be selected.
Limits: the last word of an author's name is taken as the family name, and a publication with no title, author or four-digit year in `when` throws.
