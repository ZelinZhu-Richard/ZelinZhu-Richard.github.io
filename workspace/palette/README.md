# Command palette

On every page with the shared header, the Search button opens a dialog that lists everything a
visitor can open: the seven sections, the projects, the browser experiments, the pages the menu
does not show, and my profiles elsewhere. Type to narrow the list, press Enter to go. Two entries
do something instead: copy my email address, and pause or resume the ASCII sharks (only on pages
where the sharks button is showing). Without JavaScript the button is a plain link to the full
list on the Colophon page.

Search looks at titles, hints, keywords and group names. It does not read the pages themselves.
A title still matches with a few letters missing ("projcts"), as long as the letters sit close
together. If the browser will not copy the address, it is put in the search field, selected, so
it can be copied by hand.

## Where the list comes from

`index.mjs` is the one list. `build.mjs` flattens it into `dist/palette/index.js`, and the browser
fetches that file the first time the palette is needed (when the pointer or focus reaches the
button, or on the first shortcut), not on page load.

To add a destination, add an item to the right group in `siteIndex()`:

```js
{ title: 'Flash', hint: 'Design a holographic foil card and download it.', href: '/flash/', keywords: 'card maker holographic foil' }
```

`href` is root-relative for a page here; a full `https://` address also needs `external: true`.
`keywords` are extra words to match and are never shown. Only pages the public site already links
belong in the list; `tests/index.test.mjs` fails if an unlisted page gets in. Then run
`node --test workspace/palette/tests/*.test.mjs` and build.

| File | What it is |
| --- | --- |
| `index.mjs` | The list, in groups. Also read by the footer and the Colophon page. |
| `search.js` | Pure ranking (`search`) and the 404 page's nearest-path guess (`closest`). No DOM, so it is unit-tested. |
| `palette.js` | Turns the Search link into a button, builds the dialog on first use, handles the keys. |
| `notfound.js` | On the 404 page: shows the address that was asked for and offers one real page: a typo fixed, a cut-off address completed, or the folder above. |
| `palette.css` | The header button at each breakpoint and the dialog. Site tokens only. |
| `build.mjs` | Copies the files to `dist/palette/`, writes `index.js`, stamps a version on every import, and adds the button and assets to each page with the shared header. |

## Keys

| Key | What it does |
| --- | --- |
| `Cmd+K` / `Ctrl+K` | Open or close, from anywhere. |
| `/` | Open, unless the cursor is in a text field or a dialog is already open. |
| `↑` `↓` | Move the selection; it wraps at both ends. |
| `Home` `End` | First and last result. With Shift they select text in the field, as usual. |
| `Enter` | Open the selected entry. With `Cmd` or `Ctrl`: open it in a new tab and keep the list. |
| `Esc` | Close. Focus goes back to where it was. |

Accessibility: a modal `<dialog>` holding a combobox and a listbox. Focus stays in the input and
`aria-activedescendant` names the selected row; the result count is a polite live region. Rows are
real links, so middle-click and Cmd-click work. The open animation runs only when motion is
welcome, and the selected row uses the system highlight colours in forced-colours mode.

The page tests in `tests/palette.test.mjs` run the built script against a small stand-in for the
browser. That is not a real browser: the layout, and the dialog shrinking to stay above a phone's
keyboard, still need a look on real devices.
