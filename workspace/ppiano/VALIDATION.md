# Validation record

## Physical accuracy — not measured

No claim of reliable physical contact detection is made. The experimental label must remain until the following acceptance measurements pass.

| Setup | Three independent drawings | ≥95/100 taps | ≤1 false note / 60 seconds hovering | Three-note chords | Median latency <150 ms |
| --- | --- | --- | --- | --- | --- |
| Laptop camera | Not measured | Not measured | Not measured | Not measured | Not measured |
| External webcam | Not measured | Not measured | Not measured | Not measured | Not measured |
| Phone rear camera | Not measured | Not measured | Not measured | Not measured | Not measured |

Record the device, camera resolution, browser version, camera angle, and lighting for every run. Hand landmark fixtures and synthetic drawing tests verify logic; they do not establish these real-world accuracy results.

## Automated / browser checks

Verified on 2026-10-15 in the development environment:

- `npm test`: **33/33 passing**, including the 12 existing site/Flash tests. Coverage includes chord degrees/voicings, gesture settling and hand identity, perspective transforms, black-key priority, calibration rejection, repeated taps, per-finger ownership, tracking loss, camera cancellation, sustain, and stable Work navigation.
- Actual OpenCV pixel fixtures: clean drawing; uneven dividers; perspective; perspective plus uneven lines and shadow; blank scene rejection; incomplete black-key rejection; stationary/displaced paper anchor checks. These are synthetic images, not independent physical drawings.
- Codex in-app browser: decoded piano, strings, and horns samples; initialized MediaPipe in a worker; detected two hands in a local reference frame; detected two hands through the main-thread compatibility path; recognized eight white and five black keys with the actual OpenCV runtime.
- A simulated camera stream exercised Start → recognize → confirm → calibration. Switching modes stopped the stream and reset setup. A denied-camera fixture displayed recovery instructions while the accessible keyboard and sustain/release continued to work.
- Responsive layouts checked at 375, 768, and 1280 CSS pixels through a same-origin iframe. Both modes fit at 375 pixels after correcting a grid sizing issue. These are viewport checks, not physical mobile-browser tests.
- Production build verifies local links, anchors, syntax, metadata, manifests, and bundled dependency hashes. Authoring files, test fixtures, and the private reference frame are excluded from app output.

## Ease-of-use follow-up

- Easy harmony tested across all twelve keys and seven degrees: every generated note belongs to the selected major scale, including the diminished seventh-degree triad. Either hand is accepted; a closed hand and missing hands remain silent.
- In the in-app browser, an actual MediaPipe worker processed a recorded hand frame through a simulated camera stream. Showing only the four-finger hand produced IV; switching to Original with one required hand missing silenced the chord and displayed the missing-hand instruction. This verifies the software path, not physical camera accuracy.
- Chord preview, difficulty switching, automatic Performance view, guide/settings controls, and phone-sized layout were checked. A 375-pixel iframe had no horizontal overflow; phone Performance view collapses the guide by default. This does not substitute for physical mobile-browser acceptance.

## Remaining acceptance work

Desktop Chrome/Edge/Safari, Android Chrome, and iPhone Safari on physical devices have **not** been independently tested. Real camera orientation, interrupted audio, hardware camera switching, real paper recognition, three-note physical chords, false-positive rate, and tap-to-sound latency remain unmeasured. The model/sample browser checks above are functionality checks, not these acceptance measurements.

Use a fixed angled camera, landscape paper, high-contrast borders/separators, five fully filled black keys in groups of two and three, visible fingertips, and a steady palm. These are recommended setup conditions, not a validated reliability envelope. Keep the experimental label until the device/drawing matrix above is measured and passes.
