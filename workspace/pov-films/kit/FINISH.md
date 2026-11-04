# kit/finish.py: outro, end card and delivery encode

`finish.py` turns a rendered film (PNG frames plus soundtrack WAV) into the delivery mp4.
It adds the outro dim, the end card and the final fade to black, then encodes. It also writes
a contact sheet and a poster.

## Usage

Run it from `workspace/pov-films/`:

```
python3 kit/finish.py --slug <slug>
    [--frames renders/<slug>]          # 0001.png .. 0336.png, 1080x1920, frame 1 = t 0
    [--audio <wav>]                    # the 14.0 s soundtrack from kit/audio.py
    [--out out/<slug>.mp4]
    [--card "zelinzhu-richard.github.io"]
    [--weight medium|demi|regular]     # Avenir Next weight, default medium
    [--workers N]                      # processes for the outro frames, default 6
```

If you leave out `--audio`, the script searches these paths in order:
`out/<slug>.wav`, `out/audio/<slug>.wav`, `renders/<slug>/audio.wav`,
`renders/<slug>/<slug>.wav`, `films/<slug>/audio.wav`, `films/<slug>/<slug>.wav`,
`films/<slug>/soundtrack.wav`. If it finds none, it stops with an error. Pass `--silent` to
encode with a silent AAC track.

Other modes:

```
python3 kit/finish.py --slug <slug> --stills 10.5,11.5,13.8   # full-res finished PNG stills, no encode
python3 kit/finish.py --selftest                              # synthetic end-to-end test
```

`--stills` writes `<out stem>_t11.50.png` and similar files. Use it to check the card over a
film's real outro before the full encode.

## Outputs

| file | content |
| --- | --- |
| `out/<slug>.mp4` | H.264 High, CRF 16, preset slow, yuv420p, BT.709 tags (matrix, primaries, transfer, limited range), +faststart; AAC 48 kHz stereo 256 kb/s; exactly 336 frames at 24 fps = 14.000 s |
| `out/<slug>_contact.png` | 2 fps contact sheet made from the encoded mp4: 7 columns x 4 rows, 243x432 tiles (1701x1728), the same layout as `reference/ref_contact_2fps.png` |
| `out/<slug>_poster.jpg` | the frame at 4.0 s at full resolution, JPEG quality 92 |

After encoding, the script runs ffprobe and checks codec, pix_fmt, 24/1 fps, frame count,
video, audio and container duration (14.0 s), AAC at 48 kHz, the BT.709 tags, and that moov
comes before mdat. It prints a summary and exits with code 2 if any check fails.

## Timeline (frame n is at t = (n - 1) / 24)

| time | what happens |
| --- | --- |
| 0 to 10.0 s (frames 1 to 241) | untouched; ffmpeg reads these PNGs directly |
| 10.0 to 11.2 s | the picture eases down to 12 percent brightness. The gain is in linear light and ramps evenly in exposure stops with a smootherstep curve. Saturation drops 18 percent and a gentle gaussian blur grows to 1.8 px |
| 11.2 s onward | holds dim while the scene keeps moving underneath |
| 10.6 to 11.3 s | the end card fades in (smootherstep) and drifts 10 px up (ease-out cubic) |
| 13.6 to 13.958 s | the whole picture, card included, fades to black (cosine). Frame 336 is pure black |
| 13.6 to 14.0 s | the audio fades out to match |

About "12 percent brightness": the gain applies to linear light, so the mean luminance of the
dim hold is about 12 percent of the cruise. In 8-bit code values that is about 28 percent,
which matches the reference outro (measured 25 to 29 percent code, 7 to 13 percent linear).

## End card

- Text: `zelinzhu-richard.github.io` exactly as written, in Avenir Next Medium from
  `/System/Library/Fonts/Avenir Next.ttc`. If that font is missing, the script falls back to
  Helvetica Neue Medium.
- Size: the cap height is 2.2 percent of the frame height (42 px at 1920). That gives a
  59.5 px font and a text block about 724 px wide.
- Spacing: +0.02 em tracking on top of the font's own advances and kerning.
- Position: centred on the ink horizontally. The cap band is centred at 71.5 percent of the
  frame height (y about 1373), the top of the lower third. This keeps it above the dashboard
  and above the caption and button area of Reels and TikTok.
- Color: white at 92 percent opacity. The shadow is very soft: black at 50 percent,
  blur 0.13 cap heights (about 5.5 px), dropped 2 px.
- Rendering: the text is drawn at 4x and box-filtered down. This gives clean antialiasing and
  quarter-pixel drift.
- No logos, icons, shapes or other text.

To use different text, pass `--card "..."`. Pass `--card ""` for no card.

## How it works

- The script works out which frames need changes. Only frames 242 to 336 do: 95 frames,
  about 0.1 to 0.3 s each, on 6 worker processes.
- Frames 1 to 241 are symlinked into a temp dir, and ffmpeg reads them as an image sequence.
  They are never decoded in Python.
- The processed tail is graded in numpy: sRGB LUT to linear, blur, desaturation and gain,
  then back to sRGB, then card and black fade in display space, then TPDF dither to 8 bit.
  The frames stream to ffmpeg as raw RGB over a pipe. A sliding window keeps about 12 frames
  in memory, and no intermediate files go to disk.
- Inside ffmpeg, the two parts are joined with the `concat` filter and converted once to
  yuv420p with the BT.709 matrix (`accurate_rnd+full_chroma_int`). Passed-through frames
  decode back to within 0.7 code values of the source PNGs.
- The audio is resampled to 48 kHz, padded or trimmed to exactly 14.0 s, faded over the last
  0.4 s, and encoded to AAC at 256 kb/s.

All numbers of the look are in the `LOOK` dict at the top of `finish.py`. Sizes are fractions
of the frame height, so a half-scale test render gets the same proportions.

## Self test

`python3 kit/finish.py --selftest` does the following:

1. Generates 336 synthetic 1080x1920 frames: a moving night gradient, stars, lights streaming
   out of a vanishing point with road streaks, and a dark dashboard band.
2. Generates a 14 s tone WAV: 4 bars of chords and a hit at 10.0 s.
3. Runs the full finish into `out/_finish-test/finish-test.mp4`, then deletes the frames and
   the WAV. Add `--keep-frames` to keep them.

On the M4 Pro, the whole self test takes about 30 s: frame generation 20 s, finish and encode
about 8 to 10 s. The last measured run: 14.000 s, 336 frames, 24/1, h264 High yuv420p
bt709/bt709/bt709/tv, AAC 48 kHz 2 ch 255 kb/s, 4.8 MB, `verify ok`.

## Notes

- The PNGs must be 8-bit RGB or RGBA (alpha is dropped). 16-bit PNGs work but are read at 8 bit.
- Run it as a command. It uses spawn worker processes, so importing it from another script needs
  an `if __name__ == "__main__":` guard in the caller.
- When the mp4 is verified, delete `renders/<slug>/` to free disk (see BRIEF.md).
