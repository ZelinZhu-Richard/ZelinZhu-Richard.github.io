# Gym validation — 2026-10-15

Release status: experimental. These checks validate software behaviour; they do not establish physical push-up detection accuracy.

| Check | Result |
| --- | --- |
| Automated suite | 54 passing tests across the site, Flash, Paper Piano, and Gym; 17 are Gym tests |
| Pose/counter logic | Synthetic landmarks test confidence, framing, fixed side, body/arm agreement, stable calibration, full cycles, partial movements, brief jitter, stale tracking, tracking loss, and reset |
| Streak/storage logic | Local dates, calendar-day arithmetic across DST boundaries, missed days, future dates, reload, separate demo scores, invalid data, unavailable storage, and scoped erasure |
| Camera/worker lifecycle | Video only; stop previous stream; cancel late permission results; release on video play failure; terminate worker and reject pending frames |
| Browser lifecycle scenario | Synthetic video/landmarks exercised Start, both real UI capture countdowns, one completed rep, interrupted-rep rejection, moved-position recalibration, mode-change cleanup, one frame in flight, demo, pause, and camera switching |
| Real model execution | Bundled Pose Landmarker initialized in a worker and processed a blank video frame: zero poses, 90 ms for that single inference call in the desktop in-app browser |
| Permission recovery | Simulated NotAllowedError displays recovery instructions and re-enables Start |
| Desktop/mobile layout | In-app browser desktop and 390 px portrait checks; a found mobile overflow was repaired; portrait page width then matched the 390 px viewport; 844 px landscape also had no horizontal overflow |
| Model/asset integrity | Build checks every pinned vendor file against its byte count and SHA-256 hash |
| Production package | Standalone app; development files and QA fixtures excluded; canonical URL, Work anchor, navigation, sitemap, module/asset references, and JavaScript syntax checked |
| UI detector | No reported regex findings; the detector ran in degraded mode because parser dependencies were unavailable. This is not a full contrast/accessibility certification |

The model timing is one blank-frame measurement, not a workout latency benchmark. Synthetic replay does not measure the model’s ability to recognize actual people. No camera recordings, images, or landmark logs were retained. Local QA uses generated frames, generated landmarks, and in-memory progress only.

## Still needs physical acceptance

Test a laptop camera, external webcam, and phone rear camera, with independent users/lighting and realistic side views. Manually label complete and partial reps; compare totals; test repeated sets, slow movements, extended pauses, body occlusion, multiple people, camera movement, orientation changes, and leaving/returning to the frame. Record missed reps, extra reps, inference rate, and end-to-end movement-to-display latency, including mobile thermal throttling.

Exercise real push-up flights at both paces and verify that gaps are comfortable to follow, rest/pause is usable, and physical play contributes reps only during active tracking. Test permission prompts and recovery in desktop Chrome, Edge, Safari, Android Chrome, and iPhone Safari. None of these separate browser/device combinations or physical accuracy figures is claimed as verified here. The counter estimates calibrated movement and cannot assess safe form.

Keep “Camera counting · experimental” visible until these results support a stronger statement. No physical acceptance target is reported as passed.
