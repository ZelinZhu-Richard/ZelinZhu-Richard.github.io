import {test} from 'node:test';
import assert from 'node:assert/strict';
import {pages} from '../../../site/pages.mjs';
import {PROJECTS} from '../../../site/content.mjs';

test('Domain Expansion has a stable project entry and appears after Gym in every shared navigation', () => {
  const project = PROJECTS.find(p => p.id === 'domain-expansion');
  assert.equal(project.live, '/domainexp/');
  assert.match(project.repo, /workspace\/domainexp$/);
  for (const html of pages().values()) {
    const nav = html.match(/<nav id="navigation"[^>]*>([\s\S]*?)<\/nav>/)?.[1];
    assert.ok(nav);
    assert.match(nav, /href="\/gym\/"[^>]*>Gym<\/a><a href="\/domainexp\/"/);
  }
  assert.match(pages().get('work/index.html'), /id="domain-expansion"/);
});
