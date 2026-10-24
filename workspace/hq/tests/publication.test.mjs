// Publication guard for HQ. The repo is public, so every tracked file is published.
// These checks never open a file in a private folder: private paths are matched by name only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));

function git(args) {
  const r = spawnSync('git', args, { cwd: repoRoot, encoding: 'utf8' });
  if (r.error || r.status === null) return null;
  return r;
}

test('git tracks nothing under any _private/ folder and no real HQ seed file', t => {
  const r = git(['ls-files', '-z']);
  if (!r || r.status !== 0) {
    if (process.env.CI) assert.fail('git is required in CI for the publication check');
    t.skip('git not available');
    return;
  }
  const files = r.stdout.split('\0').filter(Boolean);
  assert.ok(files.length > 0);
  assert.deepEqual(files.filter(f => /(^|\/)_private(\/|$)/i.test(f)), []);
  assert.deepEqual(files.filter(f => /(^|\/)hq-seed\.json$/i.test(f)), []);
});

test('the private HQ seed path is gitignored', t => {
  const r = git(['check-ignore', '-q', 'workspace/hq/_private/hq-seed.json']);
  if (!r) { if (process.env.CI) assert.fail('git is required in CI'); t.skip('git not available'); return; }
  assert.equal(r.status, 0, 'workspace/hq/_private/ must be ignored');
});

// Generic placeholder check: no real names are written here. Every capitalized word in the
// example seed must be a generic word from this list, and named things follow "Kind X" patterns.
const GENERIC = new Set(['College', 'Fellowships', 'Fellowship', 'Jobs', 'Research', 'Placeholder', 'Program', 'Company', 'Workshop', 'Project', 'Early', 'Cut', 'Final', 'Confirm', 'Submit', 'Phase', 'Application', 'Record', 'Post', 'Prepare', 'Follow', 'Schedule', 'NOV', 'EARLY', 'ROLLING']);
const NAMED = /^(College|Fellowship|Program|Company|Workshop|Project) [A-Z]$/;

function strings(value, out = []) {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) value.forEach(v => strings(v, out));
  else if (value && typeof value === 'object') Object.values(value).forEach(v => strings(v, out));
  return out;
}

test('seed.example.json holds fictional placeholders only', async () => {
  const text = await readFile(new URL('../seed.example.json', import.meta.url), 'utf8');
  const seed = JSON.parse(text);
  assert.match(text, /Placeholder/);
  assert.match(text, /College A/);
  for (const d of seed.deadlines) assert.match(d.title, NAMED, `deadline title "${d.title}" is not a placeholder name`);
  for (const x of seed.ideas) assert.match(x.title, NAMED, `idea title "${x.title}" is not a placeholder name`);
  const unexpected = new Set();
  for (const s of strings(seed)) {
    if (/^[\w-]+$/.test(s) && /\d|^[a-z]/.test(s)) continue; // ids, scopes, buckets
    for (const word of s.match(/\b[A-Z][A-Za-z]+\b/g) || []) if (!GENERIC.has(word)) unexpected.add(word);
    assert.doesNotMatch(s, /https?:|@|www\./, 'no links or emails in the example seed');
  }
  assert.deepEqual([...unexpected], [], 'capitalized words outside the generic list (possible real names)');
});
