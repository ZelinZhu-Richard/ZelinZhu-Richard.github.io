import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const source = fileURLToPath(new URL('.', import.meta.url));

export const MUSIC_FILES = ['player.js', 'playlist.js', 'player.css'];
// The pages that host the player: none. It was the captured phoenix homepage's music, following that runtime's
// sound switch, and that page is retired. The homepage and Contact page (workspace/home) have their own sound
// toggle, so the player never goes on them; dock.js, which parked the sharks toggle in the phoenix pill's place,
// stays in this folder without shipping.
export const MUSIC_PAGES = [];
// Songs under /music/tracks/ ship only when their file is present (tracks/ is git-ignored).
export const availableTracks = (playlist, has) => playlist.filter(t => !t.src.startsWith('/music/tracks/') || has(t.src.slice('/music/tracks/'.length)));

const isHomeShell = html => /<html\b[^>]*\sdata-home=/i.test(html);

export function withMusic(html, version) {
  if (html.includes('/music/player.js') || isHomeShell(html)) return html;
  return html.replace(/<\/head\s*>/i, `<link rel="stylesheet" href="/music/player.css?v=${version}">\n<script type="module" src="/music/player.js?v=${version}"></script>\n</head>`);
}

/**
 * Ships the player only where it has something to play and somewhere to play it: with no song files, or no
 * host page, nothing is written. Returns the songs that shipped.
 * @param {string} output
 * @param {{ pages?: string[], playlist?: { title: string, artist?: string, src: string }[], tracks?: string }} [options]
 */
export async function buildMusic(output, { pages = MUSIC_PAGES, playlist, tracks = join(source, 'tracks') } = {}) {
  const list = playlist || (await import('./playlist.js')).PLAYLIST;
  const songs = availableTracks(list, file => existsSync(join(tracks, file)));
  const hosts = [];
  for (const page of pages) {
    const file = join(output, page);
    if (existsSync(file) && !isHomeShell(await readFile(file, 'utf8'))) hosts.push(file);
  }
  if (!songs.length || !hosts.length) return [];
  const target = join(output, 'music');
  await mkdir(join(target, 'tracks'), { recursive: true });
  const hash = createHash('sha256');
  for (const file of MUSIC_FILES) {
    await cp(join(source, file), join(target, file));
    hash.update(await readFile(join(source, file)));
  }
  for (const song of songs) {
    if (!song.src.startsWith('/music/tracks/')) continue;
    const name = song.src.slice('/music/tracks/'.length);
    await cp(join(tracks, name), join(target, 'tracks', name));
    hash.update(name);
  }
  await writeFile(join(target, 'playlist.js'), `// Built from workspace/music/playlist.js; songs without a file are left out.\nexport const PLAYLIST = ${JSON.stringify(songs, null, 2)};\n`);
  hash.update(JSON.stringify(songs));
  const version = hash.digest('hex').slice(0, 10);
  // player.js imports the playlist; stamp that import too so a new playlist is never served stale.
  const player = await readFile(join(target, 'player.js'), 'utf8');
  await writeFile(join(target, 'player.js'), player.replace("from './playlist.js'", `from './playlist.js?v=${version}'`));
  for (const file of hosts) await writeFile(file, withMusic(await readFile(file, 'utf8'), version));
  return songs;
}
