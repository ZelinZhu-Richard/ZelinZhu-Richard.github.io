# Domain Expansion

Visitors to Richard Zhu’s portfolio can turn the space between their hands into a pixelated window in a mirrored webcam image. This is a playful browser experiment for desktop and mobile, published at `/domainexp/` and linked from the portfolio navigation and project list.

Two visible hands with separated thumbs and index fingers define the four corners. Violet outlines show every detected finger before activation, with gold thumb/index tips; the hand count distinguishes recognition from framing. A valid window automatically activates after 150 ms. Moving the hands reshapes it; a missing-hand result removes it immediately. Stalled tracking expires after 200 ms on fast devices, with a bounded allowance up to 1.2 seconds for slower inference. Pixel size ranges from 6 to 40, initially 16. The desired visual direction is an anime-inspired glowing violet domain, with a short activation pulse.

Start camera is the only permission trigger. Camera frames remain on-device. There is no microphone, upload, recording, backend, sign-in, or sound. Stop, navigation, and a hidden tab release camera and tracking resources. Fullscreen, adjustable pixel size, responsive layout, keyboard controls, and reduced motion are included.

Success means a visibly pixelated interior with the original camera image outside, aligned mirrored fingertips, understandable guidance/errors, and a working destination from desktop and mobile portfolio menus. Automated fixtures and synthetic cameras test implementation behavior; physical hand-tracking accuracy must be reported separately and never inferred from synthetic tests.
