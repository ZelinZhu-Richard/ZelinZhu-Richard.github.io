import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// A reloaded or bookmarked /#to-<part> runs syncHash() on load. Calling it before the hold state
// (let pointer/hold) is initialised threw a ReferenceError and stopped the whole stone script.
test('homepage stone script handles the initial hash only after all its state is declared', async () => {
  const source = await readFile('workspace/stones/home.js', 'utf8');
  const firstCall = source.search(/^syncHash\(\);$/m);
  assert.ok(firstCall > 0, 'the script handles the initial hash');
  for (const declaration of ['let pointer', 'let hovered', 'let lastScroll', 'const menu']) {
    const at = source.indexOf(declaration);
    assert.ok(at >= 0 && at < firstCall, `${declaration} is declared before the initial syncHash()`);
  }
});
