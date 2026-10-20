# Neon Rain

The `/video/` page presents Richard Zhu’s GPT Image film experiment. Copy lives in `page.mjs`; the site’s shared page frame supplies navigation, metadata, and the footer. `build.mjs` copies the stylesheet and media into the production output.

The supplied film is a silent, 10-second H.264 MP4: 1920 × 1080, 24 fps, 240 frames. `assets/neon-rain.mp4` preserves the original video stream with the MP4 metadata moved to the front for progressive playback. The poster is extracted at four seconds.

Playback uses native browser controls and starts only when the visitor chooses to play. The page provides a visible scene description and a direct download. No external video embed or runtime API is required.

The description credits GPT Image without claiming a model version, a number of generated images, or an undocumented animation pipeline. The 240-frame count describes the delivered video, not the number of generation calls.

From the repository root, run `npm test` and `npm run build`. The production verifier checks the page, stylesheet, poster, and video are present.
