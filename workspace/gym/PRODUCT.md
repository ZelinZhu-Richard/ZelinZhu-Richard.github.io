# Gym
<!-- impeccable:product-schema 1 -->
## Platform
web
## Users and purpose
The portfolio owner wants to count push-ups and play a bird obstacle game controlled by push-up height. The approved plan includes camera calibration, two modes, local daily streaks, and a camera-free game demo.
## Constraints
Static browser app at /gym/, integrated with the existing GitHub Pages site. New material stays under workspace/gym. Camera frames stay on device; save only dates, rep totals, and best scores. No microphone, recording, accounts, or training uploads. Existing unrelated work and holdout remain untouched.
## Confirmed decisions
At least one completed camera-counted push-up earns a daily streak day, using the device's local calendar. Demo input never earns reps or streaks. Both modes share rep detection. Raised body means higher bird; lowered body means lower bird. Full-body side-view camera, a raised/lowered calibration, and pause on tracking loss are required.
## Evidence
The user approved the plan on 2026-10-15. Real physical counting accuracy is unmeasured and must remain described as experimental.
