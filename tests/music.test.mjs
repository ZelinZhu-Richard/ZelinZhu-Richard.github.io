import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MUSIC_FILES, MUSIC_PAGES, availableTracks, buildMusic, withMusic } from '../workspace/music/build.mjs';
import { PLAYLIST } from '../workspace/music/playlist.js';
import { VOLUME, follow, lastAction, nextIndex, prevIndex, trackLabel } from '../workspace/music/player.js';
import { RELEASE_DIR } from '../workspace/home/stamp.mjs';

test('the playlist has no third-party default: every song is a file in workspace/music/tracks/', () => {
  assert.ok(PLAYLIST.length > 0);
  for (const track of PLAYLIST) {
    assert.ok(track.title, 'every song has a title');
    assert.match(track.src, /^\/music\/tracks\/[^/]+$/, `${track.title} is a local track`);
  }
  assert.ok(!JSON.stringify(PLAYLIST).includes('/audio/'), 'the phoenix loop (/audio/BG_music_ST.mp3) is gone');
  assert.equal(VOLUME, 0.4);
});

test('songs whose files are absent are left out of the built playlist', () => {
  const list = [{ src: '/audio/a.mp3' }, { src: '/music/tracks/here.m4a' }, { src: '/music/tracks/gone.m4a' }];
  assert.deepEqual(availableTracks(list, f => f === 'here.m4a'), list.slice(0, 2));
  assert.deepEqual(availableTracks(PLAYLIST, () => false), [], 'without track files there is nothing to play');
});

test('playlist moves to the next song and wraps', () => {
  assert.equal(nextIndex(0, 3), 1);
  assert.equal(nextIndex(2, 3), 0);
  assert.equal(nextIndex(0, 1), 0);
  assert.equal(prevIndex(0, 3), 2);
  assert.equal(prevIndex(2, 3), 1);
  assert.equal(lastAction(12), 'restart', 'last restarts a song that is under way');
  assert.equal(lastAction(1.5), 'previous');
  assert.equal(trackLabel({ title: 'Phoenix', artist: 'Default' }), 'Phoenix · Default');
  assert.equal(trackLabel({ title: 'Solo' }), 'Solo');
});

test('player follows a sound switch unless the visitor paused it', () => {
  assert.equal(follow({ active: true, playing: false, userPaused: false }), 'play');
  assert.equal(follow({ active: true, playing: false, userPaused: true }), 'stay');
  assert.equal(follow({ active: false, playing: true, userPaused: false }), 'pause');
  assert.equal(follow({ active: true, playing: true, userPaused: false }), 'stay');
  assert.equal(follow({ active: false, playing: false, userPaused: true }), 'stay');
});

test('the player never goes on the homepage or Contact page: they have their own sound toggle', async () => {
  assert.deepEqual(MUSIC_PAGES, []);
  assert.deepEqual(MUSIC_FILES, ['player.js', 'playlist.js', 'player.css']);
  for (const file of MUSIC_FILES) assert.ok((await stat(`workspace/music/${file}`)).size > 0, file);
  for (const file of ['index.html', 'contacts/index.html']) {
    const html = await readFile(join(RELEASE_DIR, file), 'utf8');
    assert.match(html, /<button type="button" class="sound-toggle"/, `${file} has its own sound toggle`);
    assert.equal(withMusic(html, 'v1'), html, `${file} gets no player`);
  }
  const page = '<html><head></head><body></body></html>';
  const once = withMusic(page, 'v1');
  assert.equal(once, '<html><head><link rel="stylesheet" href="/music/player.css?v=v1">\n<script type="module" src="/music/player.js?v=v1"></script>\n</head><body></body></html>');
  assert.equal(withMusic(once, 'v1'), once);
  assert.doesNotMatch(once, /dock\.js/);
});

test('the build ships the player only where there is a song and a page to play it on', async t => {
  const out = await mkdtemp(join(tmpdir(), 'music-test-'));
  const tracks = await mkdtemp(join(tmpdir(), 'music-tracks-'));
  t.after(() => Promise.all([rm(out, { recursive: true, force: true }), rm(tracks, { recursive: true, force: true })]));
  const home = await readFile(join(RELEASE_DIR, 'index.html'), 'utf8');
  const page = '<!doctype html><html><head></head><body>a page</body></html>';
  await writeFile(join(out, 'index.html'), home);
  await mkdir(join(out, 'fun'), { recursive: true });
  await writeFile(join(out, 'fun/index.html'), page);
  const song = { title: 'Song', src: '/music/tracks/song.m4a' };

  // The real build: no host page, so nothing ships whatever tracks/ holds.
  assert.deepEqual(await buildMusic(out), []);
  // A host page but no song file.
  assert.deepEqual(await buildMusic(out, { pages: ['fun/index.html'], playlist: [song], tracks }), []);
  // A song but only the homepage as host.
  await writeFile(join(tracks, 'song.m4a'), 'audio');
  assert.deepEqual(await buildMusic(out, { pages: ['index.html'], playlist: [song], tracks }), []);
  assert.deepEqual((await readdir(out)).sort(), ['fun', 'index.html'], 'no music/ folder');
  assert.equal(await readFile(join(out, 'index.html'), 'utf8'), home);

  // Both: the player, its playlist and the song ship, and the page loads them once.
  assert.deepEqual(await buildMusic(out, { pages: ['index.html', 'fun/index.html'], playlist: [song, { title: 'Gone', src: '/music/tracks/gone.m4a' }], tracks }), [song]);
  assert.deepEqual((await readdir(join(out, 'music'))).sort(), [...MUSIC_FILES, 'tracks'].sort());
  assert.deepEqual(await readdir(join(out, 'music/tracks')), ['song.m4a']);
  assert.match(await readFile(join(out, 'music/playlist.js'), 'utf8'), /"src": "\/music\/tracks\/song\.m4a"/);
  const built = await readFile(join(out, 'fun/index.html'), 'utf8');
  assert.equal(built.split('/music/player.js?v=').length, 2);
  assert.match(await readFile(join(out, 'music/player.js'), 'utf8'), /from '\.\/playlist\.js\?v=[0-9a-f]{10}'/);
  assert.equal(await readFile(join(out, 'index.html'), 'utf8'), home, 'the homepage still has no player');
});
