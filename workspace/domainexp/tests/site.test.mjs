import {test} from 'node:test';
import assert from 'node:assert/strict';
import {pages} from '../../../site/pages.mjs';
import {PROJECTS} from '../../../site/content.mjs';

test('Domain Expansion has a stable project entry and is listed on Fun and Work', () => {
  const project = PROJECTS.find(p => p.id === 'domain-expansion');
  assert.equal(project.live, '/domainexp/');
  assert.match(project.repo, /workspace\/domainexp$/);
  for (const html of pages().values()) assert.match(html.match(/<nav id="navigation"[^>]*>([\s\S]*?)<\/nav>/)?.[1] || '', /href="\/fun\/"/);
  assert.match(pages().get('fun/index.html'), /id="domain-expansion"[\s\S]*href="\/domainexp\/"/);
  assert.match(pages().get('work/index.html'), /id="domain-expansion"/);
});
