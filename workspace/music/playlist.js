// Songs for the homepage music player, played in this order and looped.
// To add a song: put the audio file in workspace/music/tracks/ and add
//   { title: 'Song', artist: 'Artist', src: '/music/tracks/<file>' }
// tracks/ is git-ignored, so songs there play on a local build only. The build leaves out any song
// whose file is missing, so the published site plays only songs whose files are in the repository.
// Only commit audio you have the right to publish: the repository and site are public.
export const PLAYLIST = [
  { title: 'Phoenix', artist: 'Default', src: '/audio/BG_music_ST.mp3' },
  { title: 'Bad at Love', artist: 'Halsey', src: '/music/tracks/bad-at-love.m4a' },
];
