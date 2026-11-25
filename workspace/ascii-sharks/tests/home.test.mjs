// The homepage and Contact page (workspace/home) carry the shared shark tags, as every page must
// (tools/verify.mjs), but draw their own sky: the ocean stays hidden and never starts there.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { withSharkBackground } from '../build.mjs';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');

test('the shark tags go on the homepage outside the Nuxt root, once', async () => {
  for (const file of ['index.html', 'contacts/index.html']) {
    const html = await read(`../../home/release/${file}`);
    const built = withSharkBackground(html);
    assert.equal(withSharkBackground(built), built);
    assert.ok(built.indexOf('<canvas id="ascii-sharks-background"') < built.indexOf('<div id="__home">'), `${file}: the canvas sits before #__home, not in it`);
    assert.equal(built.slice(built.indexOf('<div id="__home">')), html.slice(html.indexOf('<div id="__home">')), `${file}: the app's markup is untouched`);
    assert.ok(built.includes('href="/ascii-sharks/background.css"') && built.includes('src="/ascii-sharks/background.js"'));
  }
});

test('on html[data-home] the canvas and its toggle are hidden, and nothing else in the sheet is phoenix-only', async () => {
  const css = await read('../background.css');
  assert.match(css, /html\[data-home\] #ascii-sharks-background,\s*html\[data-home\] \.sharks-toggle \{ display: none !important; \}/);
  assert.match(css, /html:not\(\[data-home\]\) body:has\(> #ascii-sharks-background\) \{\s*isolation: isolate;/, 'the homepage keeps its own stacking');
  assert.doesNotMatch(css, /#__nuxt|#smooth-wrapper|sharks-in-slot|phoenix-dark/, 'the captured runtime selectors are gone');
});

test('the engine never starts on a page with html[data-home]', async () => {
  const source = (await read('../background.js')).replace(/^import.*\n/, '');
  for (const home of [true, false]) {
    let constructed = 0;
    let appended = 0;
    const handlers = {};
    const node = () => ({ hidden: false, setAttribute() {}, append() {}, remove() {}, addEventListener() {} });
    const context = {
      OceanEngine: class { constructor() { constructed++; } pause() {} resume() {} destroy() {} },
      document: {
        hidden: false,
        documentElement: { hasAttribute: name => home && name === 'data-home' },
        querySelector: () => ({}), querySelectorAll: () => [], createElement: node, createElementNS: node,
        addEventListener() {}, body: { dataset: {}, append() { appended++; } },
      },
      window: { innerWidth: 1440, matchMedia: () => ({ matches: false, addEventListener() {} }), addEventListener: (name, fn) => { handlers[name] = fn; } },
      localStorage: { getItem: () => null }, MutationObserver: class { observe() {} disconnect() {} }, console,
    };
    vm.runInNewContext(source, context);
    handlers.pagehide();
    handlers.pageshow();
    assert.deepEqual({ constructed, appended }, home ? { constructed: 0, appended: 0 } : { constructed: 2, appended: 2 }, home ? 'homepage' : 'other pages');
  }
});
