import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const source = fileURLToPath(new URL('.', import.meta.url));

export const MUSIC_FILES = ['player.js', 'playlist.js', 'player.css', 'dock.js'];
// The phoenix runtime pages whose sound button the player replaces.
export const MUSIC_PAGES = ['index.html', 'contacts/index.html'];
// The runtime chunk holding AudioComponent, whose background loop the player replaces.
export const RUNTIME_CHUNK = '_nuxt/CbdjwYMp.js';
// Songs under /music/tracks/ ship only when their file is present (tracks/ is git-ignored).
export const availableTracks = (playlist, has) => playlist.filter(t => !t.src.startsWith('/music/tracks/') || has(t.src.slice('/music/tracks/'.length)));

const LOOP_START = 'u=()=>{if(l)return;const x=c();l=x,x.start()}';

export function withMusic(html, version) {
  if (html.includes('/music/player.js')) return html;
  return html.replace(/<\/head\s*>/i, `<link rel="stylesheet" href="/music/player.css?v=${version}">\n<script type="module" src="/music/player.js?v=${version}"></script>\n<script type="module" src="/music/dock.js?v=${version}"></script>\n</head>`);
}

// Turn off the runtime's own background loop; its sound effects and sound switch stay as they are.
export function withoutRuntimeLoop(chunk) {
  if (chunk.includes('u=()=>{}/*music player*/')) return chunk;
  if (chunk.split(LOOP_START).length !== 2) throw new Error('music: runtime background loop not found');
  return chunk.replace(LOOP_START, 'u=()=>{}/*music player*/');
}

export async function buildMusic(output) {
  const target = join(output, 'music');
  await mkdir(target, { recursive: true });
  const hash = createHash('sha256');
  for (const file of MUSIC_FILES) {
    await cp(join(source, file), join(target, file));
    hash.update(await readFile(join(source, file)));
  }
  if (existsSync(join(source, 'tracks'))) {
    await cp(join(source, 'tracks'), join(target, 'tracks'), { recursive: true });
    for (const file of (await readdir(join(source, 'tracks'))).sort()) hash.update(file);
  }
  const { PLAYLIST } = await import('./playlist.js');
  const songs = availableTracks(PLAYLIST, file => existsSync(join(source, 'tracks', file)));
  await writeFile(join(target, 'playlist.js'), `// Built from workspace/music/playlist.js; songs without a file are left out.\nexport const PLAYLIST = ${JSON.stringify(songs, null, 2)};\n`);
  hash.update(JSON.stringify(songs));
  const version = hash.digest('hex').slice(0, 10);
  // player.js imports the playlist; stamp that import too so a new playlist is never served stale.
  const player = await readFile(join(target, 'player.js'), 'utf8');
  await writeFile(join(target, 'player.js'), player.replace("from './playlist.js'", `from './playlist.js?v=${version}'`));
  for (const page of MUSIC_PAGES) {
    const file = join(output, page);
    await writeFile(file, withMusic(await readFile(file, 'utf8'), version));
  }
  const chunk = join(output, RUNTIME_CHUNK);
  await writeFile(chunk, withoutRuntimeLoop(await readFile(chunk, 'utf8')));
}
