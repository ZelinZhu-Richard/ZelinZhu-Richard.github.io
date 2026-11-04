# kit/audio.py: procedural soundtracks

`audio.py` writes the 14 s soundtrack for each film. Every sound is synthesized in numpy and
scipy: no samples, no downloaded audio, and every melody and progression is original.
PIL is imported only by the optional spectrogram check (`--png`).

## Usage

Run it from `workspace/pov-films/`:

```
python3 kit/audio.py --preset <slug> --out <wav> [--seed N] [--png [PNG]]
python3 kit/audio.py --all out/_audio-test --png      # all five presets, WAV + PNG each
python3 kit/audio.py --list                            # key and progression of every preset
```

- `--seed N` changes the humanized timing, velocities, noise and reverb, not the notes.
  Without it each preset uses its own fixed seed, so renders are reproducible.
- `--png` also writes a spectrogram next to the WAV (or at the given path) and prints one
  JSON line of checks: loudness, true peak, onset-to-grid stats, hit time, tail levels,
  click score, DC, stereo correlation and octave balance.
- About 3 s per preset on the M4 Pro.

`kit/finish.py` finds `out/<slug>.wav` on its own, so the delivery render is:

```
python3 kit/audio.py --preset 03-first-snow-village --out out/03-first-snow-village.wav
```

## Output

- 48 kHz, stereo, 24-bit PCM WAV, exactly 672000 frames (14.000 s).
- Integrated loudness -14.0 LUFS, true peak -1.5 dBTP or lower (BS.1770-4 with 4x
  oversampled peaks). The ceiling sits 0.5 dB under the -1 dBTP spec to leave room for AAC.
- First and last samples are exactly zero. TPDF dither at 24-bit only where there is signal.

## Timeline

| time | what happens |
| --- | --- |
| 0 to 9.69 s | 4 bars at 96 BPM (2.5 s per bar), swung 16ths, humanized |
| 9.69 to 10.0 s | the band rests (drums, keys and bass stop at bar 4, 16th 14). A reverse-reverb swell built from the first chime note rises about 27 dB/s into the hit. Lead pickups may play here |
| 10.0 s | the ending hit: soft boom tuned to the root, a felt thump, a soft brushed crash, the resolving chord on electric piano and pad, a sub note, and a chime arpeggio whose first note lands on 10.000 s |
| 10.0 to 14.0 s | hall reverb tail. The ambience fades from 10.25 s to -48 dB at 13.6 s. A master cosine fade runs 12.9 to 13.96 s, so the file is silent before 14.0 s |

`finish.py` also fades the audio over its last 0.4 s, which matches.

## Signal chain

Instruments
- Pad: 2 to 4 detuned band-limited (PolyBLEP) saw or pulse voices per note, slow random pitch
  drift, voices spread across the stereo field, through a 4-pole time-varying low-pass that
  moves with a slow LFO and opens on each chord change.
- Electric piano: 2-operator FM tine (1:1 with a decaying index) plus a 14:1 attack ping,
  velocity sets brightness and level, pitch-dependent decay, pickup asymmetry, a left-hand
  root note, slight strum, stereo tremolo and chorus.
- Leads: Karplus-Strong pluck (tuned to within 0.2 cents), music box (tine partials with a
  6.27 ratio ping), or vibraphone (1:4:10 bar, motor tremolo).
- Chimes for the hit: celesta, glockenspiel, tubular chime, small bell or music box, each a
  set of inharmonic decaying partials with a slightly detuned twin for shimmer.
- Sub bass: sine with 2nd and 3rd harmonics through gentle tanh, so it is audible on phones.
- Drums: soft kick (pitch sweep, knock, click, saturation), brushed snare with swish tail,
  rim click (resonator bank), filtered 808-style hats, shaker, frame tom, a continuous brush
  swirl for the brush presets. All on the swung 16th grid, with velocity and timing jitter and
  a slightly late snare.

Bus and master
- Each stem is set by loudness (LUFS over the cruise) from the preset's `mix` table.
- Kick-triggered sidechain ducking: 2 to 3 dB on pads, less on keys and bass.
- Convolution reverbs with synthesized impulses: band-split noise with per-band decay,
  diffuse build-up, soft early reflections, HF damping. A room (RT about 1.6 s) for the loop
  and a hall (RT about 3.0 s) for the hit and its tail.
- Tape: wow (0.55 Hz) and flutter (6.3 Hz) by a modulated read head, 2x oversampled tanh
  saturation with pre/de-emphasis, head bump at 85 Hz, roll-off at 14.5 kHz.
- Ambience bed at a fixed loudness under the music (`amb_rel`, -11 to -12 LU).
- Master: 20 Hz high-pass, M/S width with mono bass under 140 Hz, fades, then a look-ahead
  true-peak limiter (2.5 ms, linear-in-dB release) inside a loudness loop that lands on
  -14 LUFS.

## Presets

| slug | key and progression | swing | lead | drums | ambience bed | hit |
| --- | --- | --- | --- | --- | --- | --- |
| 01-mushroom-hollow | A minor: Am9, Fmaj7#11, Dm9, E7sus4 to E7b9, resolving to Amaj9 (Picardy). Mysterious and cozy | 60% | soft felt pluck | laid-back brushes, kick on 1, the "a" of 2 and the "and" of 3, ghost notes, brush swirl | light rain pattering on a car roof (modal roof ticks and thuds), low 46 Hz engine hum, distant crickets and a tree-cricket trill | celesta arpeggio E G# B C# |
| 02-bedroom-railway | F major: Fmaj9, Em7 to A7, Dm9, Gm9 to C9sus4, resolving to Fmaj9. Sweet and sleepy | 56% | music box | soft kick on 1 and 3, rim on 2 and 4, shaker 16ths | tin-toy train clickety-clack locked to the beat (two axles per beat, alternating timbre), little motor buzz, faint room tone. After the hit the train coasts to a stop | music-box arpeggio F A C E F |
| 03-first-snow-village | Eb major: Ebmaj9, G7b13 to Cm9, Abmaj9, Abm6 to Bb13sus, resolving to Eb6/9. Warm and nostalgic | 58% | vibraphone | half-time: kick on 1 and the "and" of 3, brushed snare on 3, soft hats, strong brush swirl | muffled gusting wind, tires crunching on snow, distant sleigh bells shaken on the 8ths with a flourish on the hit | glockenspiel Bb D F G |
| 04-lantern-canal | D major pentatonic: D6/9, Bm11, G6/9, A9sus4, resolving to D6/9. Serene; the melody uses only D E F# A B | 54% | bright harp-like pluck | very light: kick, rim on 2 and 4, shaker, frame tom | water lapping on a wooden hull (slosh, hull knock, bubbles), an oar-lock creak and swish once per bar, distant pentatonic wind chimes | tubular chimes A D F# B |
| 05-moonlit-desert-oasis | E Dorian with a Phrygian cadence: Em9, A9 (Dorian IV), Em11, Fmaj7#11 (bII), resolving to Em(add9), over an E-B drone | 62% | dry nylon/oud-like pluck | kick 1, "and" of 2, "and" of 3, rim with ghosts, frame tom, 16th hats | dry night wind with a faint whistle and sand hiss, three crickets (one chirps on every beat), tires hissing on wet road with four big and two small puddle splashes | small bell E B E F# and a soft gong |

The loop notes, voicings and patterns are plain data in the `PRESETS` dict. Useful knobs:
`mix` (stem loudness), `amb_rel` (bed level), `sting.lift` (how far the hit rises above the
cruise), `duck`, `width`, `tape_drive`, `swing`.

## Verification (final renders in `out/_audio-test/`)

Loudness and peaks are from `ffmpeg -af ebur128=peak=true -f null -`. The rest is from
`--png`. GR is the limiter's gain reduction. Onset deviation compares spectral-flux onsets of
the music bus (bias-calibrated on a synthetic click track) to the nearest swung 16th.

| preset | I (LUFS) | TP (dBTP) | LRA | GR max / mean (dB) | onsets: median / p90 dev, within 20 ms | hit onset | tail at 12 / 13 / 13.5 s (dBFS) | DC |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 01-mushroom-hollow | -14.0 | -1.5 | 2.1 | 0.56 / 0.31 | 4.4 / 14.0 ms, 46 of 47 | 10.002 s | -27 / -36 / -55 | -89 dBFS |
| 02-bedroom-railway | -14.0 | -1.5 | 2.1 | 1.39 / 0.59 | 4.6 / 10.8 ms, 62 of 62 | 10.000 s | -26 / -40 / -59 | -89 dBFS |
| 03-first-snow-village | -14.0 | -1.7 | 1.7 | 0 / 0 | 6.1 / 16.4 ms, 32 of 32 | 10.000 s | -26 / -35 / -52 | -90 dBFS |
| 04-lantern-canal | -14.0 | -1.5 | 1.6 | 0.80 / 0.30 | 5.6 / 10.5 ms, 57 of 57 | 10.000 s | -23 / -35 / -48 | -92 dBFS |
| 05-moonlit-desert-oasis | -14.0 | -1.5 | 1.8 | 1.23 / 0.49 | 2.9 / 8.6 ms, 62 of 62 | 10.002 s | -25 / -33 / -53 | -92 dBFS |

- The one 01 outlier (+67 ms at 5.69 s) is the room reverb building up after a loud lead note
  and snare, not a note.
- Tails fall without a rise larger than 0.1 dB between 250 ms steps, and reach digital
  silence before 14.0 s.
- Click score (largest 2nd-difference spike over its 10 ms neighbourhood) is 4 to 9 for the
  loop and the tail. A lone discontinuity would score about 22.
- L/R correlation 0.79 to 0.86, side about 10 dB under mid; bass is mono.
- Octave balance over the cruise is bass-forward, as in hip-hop: the 63 Hz octave sits 7 to 11 dB
  over the 1 kHz octave (3 dB in 02, where the music box fills 1 kHz), rolling off above 8 kHz
  (tape and lo-fi filtering).

The spectrogram PNGs show log frequency 30 Hz to 20 kHz over 0 to 14 s, beat and bar ticks,
the 10.0 s line, a 10 ms RMS strip (0 to -80 dBFS), detected onsets (white) over the swung
grid (grey).

## Limits

- Nobody has listened to these. Balance and timbre were set by numbers and spectrograms only,
  so a listening pass is the next step. The numbers to adjust are in `PRESETS`.
- The ambience beds are physical-style models (rain ticks through roof modes, Minnaert
  bubbles, stick-slip creaks, cricket syllables, jingle-bell partials). They are convincing
  as beds under music; heard alone they are simpler than field recordings.
