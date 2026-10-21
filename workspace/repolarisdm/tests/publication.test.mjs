// Publication safeguards (review findings S4 and S5).
// 1. No private path may be tracked by git in the website repository, now or in its history.
// 2. No tracked file may contain the Chronos canary. The source repository is public, so every tracked file is published.
// 3. The built playbook may not contain private paths or the canary.
// Ignore rules are not access control. These checks catch mistakes before a push; they do not hide anything.
// The git checks skip when git is missing, except when CI is set: then they fail, so CI never drops the guard.
// They never read a file in a private folder: such paths are reported by name only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { lstat, mkdir, mkdtemp, readdir, readFile, readlink, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildRepolarisdm, renderSite } from '../build.mjs';

const playbook = fileURLToPath(new URL('..', import.meta.url));

// One rule for tracked paths and built paths: a private folder or file name anywhere in the path. Case does not matter.
// Covers holdout, _key, _private*, .venv, .git, polaris-capstone and .env* (but not .env.example).
const PRIVATE_PATH = /(^|[\\/])(holdout|_key|_private[^\\/]*|\.venv|\.git|polaris-capstone|(?!\.env\.example([\\/]|$))\.env[^\\/]*)([\\/]|$)/i;
const trackedProblems = paths => paths.filter(p => PRIVATE_PATH.test(p)).map(p => `${p} is in a private folder or is a private file`);

// The canary is matched by its prefix, so this file never holds the private value.
// The prefix is built at run time, so this file does not contain it either.
const PREFIX = ['CHRONOS', 'CANARY'].join('-');
const CANARY = /chronos[-_]?canary/i;

// Undo the ways a string can hide in HTML or text: entities, <wbr>, soft hyphens, zero-width characters, look-alike hyphens.
const codePoint = n => (Number.isInteger(n) && n >= 0 && n <= 0x10ffff ? String.fromCodePoint(n) : '');
function plain(text) {
  return text
    .replace(/<wbr\s*\/?>/gi, '')
    .replace(/&#x([0-9a-f]+);?/gi, (_, hex) => codePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);?/g, (_, dec) => codePoint(Number(dec)))
    .replace(/&(shy|hyphen|dash|ndash|mdash|minus);/gi, (_, name) => (name.toLowerCase() === 'shy' ? '' : '-'))
    .replace(/[\u00ad\u200b-\u200d\u2060\ufeff]/g, '')
    .replace(/[\u2010-\u2015\u2212\ufe58\ufe63\uff0d]/g, '-');
}

// Text markers for built output. The prose may use the word "holdout", so only path forms and the canary count.
const TEXT_MARKERS = [
  [/[\\/]holdout\b|\bholdout[\\/]/i, 'a holdout path'],
  [/polaris-capstone[\\/]_private/i, 'the capstone _private path'],
  [/_private_staging/i, 'the _private_staging path'],
  [CANARY, 'the Chronos canary'],
];
function builtProblems(files) {
  const problems = [];
  for (const { path, text } of files) {
    if (PRIVATE_PATH.test(path)) problems.push(`path ${path} is in a private folder`);
    for (const source of [path, plain(text)]) {
      for (const [re, name] of TEXT_MARKERS) {
        const m = source.match(re);
        if (m) problems.push(`${path} contains ${name}: "${m[0]}"`);
      }
    }
  }
  return [...new Set(problems)];
}

// Tracked files are scanned for the canary only. Path words like "holdout/" appear on purpose in ignore rules and docs.
// Files in private folders are skipped (the path check reports them), symlinks are not followed, binary files are skipped.
async function trackedTextProblems(root, paths, allowed) {
  const problems = [];
  for (const path of paths) {
    if (PRIVATE_PATH.test(path)) continue;
    const full = join(root, path);
    let info;
    try { info = await lstat(full); } catch { continue; } // deleted in the working tree
    if (info.isSymbolicLink()) {
      const target = await readlink(full);
      if (PRIVATE_PATH.test(target)) problems.push(`${path} links to a private path: ${target}`);
      continue;
    }
    if (!info.isFile()) continue;
    const bytes = await readFile(full);
    if (bytes.subarray(0, 8000).includes(0)) continue;
    const m = plain(bytes.toString('utf8')).match(CANARY);
    if (m && !allowed.has(path)) problems.push(`${path} contains the Chronos canary prefix: "${m[0]}"`);
  }
  return problems;
}

function git(args, cwd) {
  return spawnSync('git', ['-c', 'core.quotePath=false', ...args], { cwd, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' } });
}

const top = git(['rev-parse', '--show-toplevel'], playbook);
const repoRoot = !top.error && top.status === 0 ? top.stdout.trim() : null;
const gitSkip = top.error
  ? `git is not available here (${top.error.code}); the tracked-file checks need git`
  : top.status !== 0 ? `the playbook is not inside a git checkout (${top.stderr.trim() || `git exited ${top.status}`})` : false;
const gitOptions = { skip: gitSkip && !process.env.CI ? gitSkip : false, timeout: 180000 };
const requireGit = () => assert.equal(gitSkip, false, `CI is set, so the git checks may not skip: ${gitSkip}`);
// The playbook's folder inside the repository, for example "workspace/repolarisdm/".
const prefix = repoRoot ? git(['rev-parse', '--show-prefix'], playbook).stdout.trim() : '';
// Files that name the canary prefix on purpose: the forbidden-strings test and the style guide.
const CANARY_ALLOWED = new Set([`${prefix}tests/content.test.mjs`, `${prefix}STYLE.md`]);
// Older versions of this file named the prefix too, so history allows it as well.
const CANARY_ALLOWED_IN_HISTORY = new Set([...CANARY_ALLOWED, `${prefix}tests/publication.test.mjs`]);

test('the path rule catches private folders anywhere, in any case (control)', () => {
  for (const path of [
    'holdout/answers.json',
    'Holdout/answers.json',
    'workspace/domainexp/holdout/answers.json',
    'workspace/x/HOLDOUT',
    'workspace/polaris-capstone/harness/run.py',
    'workspace/polaris-capstone',
    'workspace/repolarisdm/labs/lab-a/_key/expected.txt',
    'workspace/x/_private_staging/a.json',
    'workspace/repolarisdm/_private/notes.md',
    'tools/.venv/bin/python',
    '.env',
    '.env.local',
    'app/.env.production',
    '.envrc',
    'repolarisdm/.git/config',
    'C:\\work\\holdout\\a.json',
  ]) assert.equal(trackedProblems([path]).length, 1, path);
  assert.deepEqual(trackedProblems([
    'workspace/repolarisdm/content/07-task-design.md',
    'workspace/repolarisdm/tests/publication.test.mjs',
    'docs/holdout-policy.md',
    'workspace/polaris-capstone-notes.md',
    'workspace/g2_private.md',
    '.env.example',
    'app/.env.example',
    '.github/workflows/deploy.yml',
    '.gitignore',
    'docs/environment.md',
    'site/keys.mjs',
  ]), []);
});

test('the tracked-file scan finds hidden canaries and never reads private folders (control)', async () => {
  const root = await mkdtemp(join(tmpdir(), 'playbook-tracked-'));
  try {
    const files = {
      'notes/plain.md': `token ${PREFIX}-1234`,
      'notes/lower.md': `token ${PREFIX.toLowerCase()}`,
      'notes/nbhyphen.md': PREFIX.replace('-', '\u2011'),
      'notes/entity.html': PREFIX.replace('-', '&#8209;'),
      'notes/wbr.html': PREFIX.replace('-', '<wbr>-'),
      'notes/allowed.md': `the forbidden word ${PREFIX}`,
      'notes/prose.md': 'The Chronos canary is private. Keep a holdout set. See holdout/ in .gitignore.',
      'notes/binary.dat': `\0${PREFIX}`,
      '_private/secret.md': PREFIX, // in a private folder: must be skipped, not read
    };
    for (const [path, text] of Object.entries(files)) {
      await mkdir(dirname(join(root, path)), { recursive: true });
      await writeFile(join(root, path), text);
    }
    await symlink('../holdout/answers.json', join(root, 'notes/link.json')); // the target does not exist and is never read
    const paths = [...Object.keys(files), 'notes/link.json', 'notes/deleted.md'];
    const problems = await trackedTextProblems(root, paths, new Set(['notes/allowed.md']));
    const flagged = problems.map(p => p.split(' ')[0]).sort();
    assert.deepEqual(flagged, ['notes/entity.html', 'notes/link.json', 'notes/lower.md', 'notes/nbhyphen.md', 'notes/plain.md', 'notes/wbr.html']);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('git tracks no private paths', gitOptions, () => {
  requireGit();
  const listed = git(['ls-files', '-z'], repoRoot);
  assert.equal(listed.status, 0, `git ls-files failed: ${listed.stderr}`);
  const paths = listed.stdout.split('\0').filter(Boolean);
  assert.ok(paths.some(p => p.startsWith(prefix)), `git ls-files in ${repoRoot} does not list the playbook`);
  assert.deepEqual(trackedProblems(paths), []);
});

test('no tracked file contains the Chronos canary', gitOptions, async () => {
  requireGit();
  const listed = git(['ls-files', '-z'], repoRoot);
  assert.equal(listed.status, 0, `git ls-files failed: ${listed.stderr}`);
  const paths = listed.stdout.split('\0').filter(Boolean);
  assert.deepEqual(await trackedTextProblems(repoRoot, paths, CANARY_ALLOWED), []);
});

test('git history never tracked a private path or added the canary', gitOptions, () => {
  requireGit();
  // Every path any commit on any ref ever touched. In a shallow CI clone this is the current tree only.
  const names = git(['log', '--all', '--format=', '--name-only', '-z'], repoRoot);
  assert.equal(names.status, 0, `git log --name-only failed: ${names.stderr}`);
  const everTracked = [...new Set(names.stdout.split(/[\0\n]/).filter(Boolean))];
  assert.ok(everTracked.some(p => p.startsWith(prefix)), 'git log lists no playbook paths');
  assert.deepEqual(trackedProblems(everTracked), [], 'removing a file does not unpublish it: these paths are still in history');
  // Every commit that changed how often a file names the canary prefix, any case, outside the allowed files.
  const pickaxe = git(['log', '--all', '-i', `-S${PREFIX}`, '--format=commit %h %s', '--name-only'], repoRoot);
  assert.equal(pickaxe.status, 0, `git log -S failed: ${pickaxe.stderr}`);
  const hits = [];
  let commit = '';
  for (const line of pickaxe.stdout.split('\n')) {
    if (line.startsWith('commit ')) commit = line.slice(7);
    else if (line && !CANARY_ALLOWED_IN_HISTORY.has(line)) hits.push(`${commit}: ${line}`);
  }
  assert.deepEqual(hits, []);
});

test('the built-output rules catch private markers and their disguises (control)', () => {
  const planted = [
    { path: 'repolarisdm/index.html', text: 'see holdout/answers.json' },
    { path: 'repolarisdm/a.html', text: 'from workspace/polaris-capstone/_private/x' },
    { path: 'repolarisdm/b.html', text: 'copied from _private_staging' },
    { path: 'repolarisdm/c.html', text: `${PREFIX}-test-value` },
    { path: 'repolarisdm/d.html', text: PREFIX.toLowerCase() },
    { path: 'repolarisdm/e.html', text: PREFIX.replace('-', '\u2011') },
    { path: 'repolarisdm/f.html', text: PREFIX.replace('-', '&#8209;') },
    { path: 'repolarisdm/g.html', text: PREFIX.replace('-', '&#x2011;') },
    { path: 'repolarisdm/h.html', text: PREFIX.replace('-', '<wbr>-') },
    { path: 'repolarisdm/i.html', text: PREFIX.replace('-', '-&shy;') },
    { path: 'repolarisdm/j.html', text: PREFIX.replace('-', '\u200b-') },
    { path: 'repolarisdm/k.html', text: 'answers live in workspace/domainexp/holdout' },
    { path: 'repolarisdm/l.html', text: 'answers live in C:\\work\\Holdout\\a.json' },
    { path: 'repolarisdm/holdout/index.html', text: '' },
    { path: 'repolarisdm/HOLDOUT/index.html', text: '' },
    { path: 'repolarisdm/.env.local', text: '' },
  ];
  for (const file of planted) assert.ok(builtProblems([file]).length > 0, file.path);
  assert.deepEqual(builtProblems([
    { path: 'repolarisdm/task-design/index.html', text: 'Keep a holdout set that agents never see.' },
    { path: 'repolarisdm/capstone/index.html', text: 'The Chronos canary is a private marker. The <code>labs/*/_key</code> folders hold answers. <code>.env</code> is blocked.' },
  ]), []);
});

test('the built playbook contains no private paths or the canary', async () => {
  const out = await mkdtemp(join(tmpdir(), 'playbook-publication-'));
  try {
    await buildRepolarisdm(out, { built: '2026-10-21' });
    const files = [];
    const walk = async dir => {
      for (const entry of await readdir(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) await walk(full);
        else files.push({ path: relative(out, full).split(sep).join('/'), text: await readFile(full, 'utf8') });
      }
    };
    await walk(out);
    assert.ok(files.length >= 21, `expected at least 19 pages and 2 assets, built ${files.length} files`);
    assert.ok(files.every(f => f.path.startsWith('repolarisdm/')), 'the build writes only under repolarisdm/');
    assert.deepEqual(builtProblems(files), []);
  } finally {
    await rm(out, { recursive: true, force: true });
  }
});

test('pages say the playbook is public and never call it unlisted', async () => {
  const site = await renderSite({ built: '2026-10-21' });
  const footer = "This playbook is public. Anyone with the link can read it, and search engines may list it. It is not linked from the site's main navigation.";
  for (const [file, html] of site.pages) {
    assert.ok(html.includes(footer), `${file} lacks the public notice in its footer`);
    assert.ok(!/\bunlisted\b/i.test(html), `${file} says "unlisted"`);
  }
  assert.match(site.pages.get('index.html'), /This site is public\.<\/strong> Anyone with the link can read it/);
  assert.match(site.pages.get('start-here/index.html'), /This playbook is public\. Anyone with the link can read it/);
});
