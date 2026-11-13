# Tag bubbles

On `/about/` and `/research/`, each Experience entry's tags float as soap bubbles that rise up the
empty column under the date. Click or tap one to pop it; it floats back up from the bottom 3.5 s later.
A "Pop sound" switch next to the Experience heading turns on a soft synthesized pop. It starts off, and the choice is remembered in that browser.

| File | What it is |
| --- | --- |
| `physics.js` | Pure motion: rise, sway, push apart, shy from the cursor, wrap top to bottom. No DOM, so it is unit-tested. |
| `bubbles.js` | Builds a bubble field per entry from its `<ul class="tags">`, runs one animation loop, pops, sound. |
| `bubbles.css` | Bubble look (iridescent rim, highlight), pop droplets, margin layout; stacks under the entry below 900px. |
| `build.mjs` | Copies the three files to `dist/tag-bubbles/`. |

Accessibility: the tag list stays in the page, visually hidden, so screen readers read it as before;
the bubble field is `aria-hidden` decoration. With reduced motion the bubbles stay still and popping
only hides one briefly. The loop pauses while a field is off screen or the tab is hidden.
Without JavaScript the tags show as the plain list.
