import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { MUSIC_FILES, MUSIC_PAGES, RUNTIME_CHUNK, withMusic, withoutRuntimeLoop } from '../workspace/music/build.mjs';
import { PLAYLIST } from '../workspace/music/playlist.js';
import { VOLUME, follow, nextIndex, trackLabel } from '../workspace/music/player.js';

test('the current phoenix music is the default, first song', async () => {
  assert.deepEqual(PLAYLIST[0], { title: 'Phoenix', artist: 'Site theme', src: '/audio/BG_music_ST.mp3' });
  assert.equal(VOLUME, 0.4, 'same level as the runtime loop it replaces');
  for (const track of PLAYLIST) {
    assert.ok(track.title && track.src.startsWith('/'), `${track.title} has a site-relative source`);
    const file = track.src.startsWith('/music/tracks/') ? `workspace/music/tracks/${track.src.slice(14)}` : `public${track.src}`;
    assert.ok((await stat(file)).size > 0, `${file} exists`);
  }
});

test('playlist moves to the next song and wraps', () => {
  assert.equal(nextIndex(0, 3), 1);
  assert.equal(nextIndex(2, 3), 0);
  assert.equal(nextIndex(0, 1), 0);
  assert.equal(trackLabel({ title: 'Phoenix', artist: 'Site theme' }), 'Phoenix · Site theme');
  assert.equal(trackLabel({ title: 'Solo' }), 'Solo');
});

test('player follows the runtime sound switch unless the visitor paused it', () => {
  assert.equal(follow({ active: true, playing: false, userPaused: false }), 'play', 'Click to start starts the music');
  assert.equal(follow({ active: true, playing: false, userPaused: true }), 'stay');
  assert.equal(follow({ active: false, playing: true, userPaused: false }), 'pause', 'hidden tab or muted runtime');
  assert.equal(follow({ active: true, playing: true, userPaused: false }), 'stay');
  assert.equal(follow({ active: false, playing: false, userPaused: true }), 'stay');
});

test('runtime pages load the player once and the runtime loop is switched off once', async () => {
  assert.deepEqual(MUSIC_PAGES, ['index.html', 'contacts/index.html']);
  const html = withMusic('<head></head>', 'v1');
  assert.equal(html, '<head><link rel="stylesheet" href="/music/player.css?v=v1">\n<script type="module" src="/music/player.js?v=v1"></script>\n</head>');
  assert.equal(withMusic(html, 'v1'), html);
  const chunk = await readFile(`public/${RUNTIME_CHUNK}`, 'utf8');
  const patched = withoutRuntimeLoop(chunk);
  assert.ok(patched.includes('u=()=>{}/*music player*/') && !patched.includes('l=x,x.start()'));
  assert.equal(patched.length, chunk.length - 'if(l)return;const x=c();l=x,x.start()'.length + '/*music player*/'.length);
  assert.equal(withoutRuntimeLoop(patched), patched);
  assert.throws(() => withoutRuntimeLoop('nothing here'), /background loop not found/);
});

test('player files ship and the phoenix sharks toggle uses the glass pill', async () => {
  for (const file of MUSIC_FILES) assert.ok((await stat(`workspace/music/${file}`)).size > 0, file);
  const css = await readFile('workspace/ascii-sharks/background.css', 'utf8');
  assert.match(css, /body:has\(> #__nuxt\) \.sharks-toggle \{[^}]*border-radius: 100px;[^}]*backdrop-filter: blur\(6px\);[^}]*color: #29345a;/);
});
