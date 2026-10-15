# Domain Expansion

Visitors to Richard Zhu’s portfolio can turn the space between their hands into a pixelated window in a mirrored webcam image. This is a playful browser experiment for desktop and mobile, published at `/domainexp/` and linked from the portfolio navigation and project list.

Two visible palms with extended thumbs and index fingers define the four corners. A valid window automatically activates after 150 ms. Moving the hands reshapes it; losing the frame for 200 ms removes it. Pixel size ranges from 6 to 40, initially 16. The desired visual direction is an anime-inspired glowing violet domain, with a short activation pulse.

Start camera is the only permission trigger. Camera frames remain on-device. There is no microphone, upload, recording, backend, sign-in, or sound. Stop, navigation, and a hidden tab release camera and tracking resources. Fullscreen, adjustable pixel size, responsive layout, keyboard controls, and reduced motion are included.

Success means a visibly pixelated interior with the original camera image outside, aligned mirrored fingertips, understandable guidance/errors, and a working destination from desktop and mobile portfolio menus. Automated fixtures and synthetic cameras test implementation behavior; physical hand-tracking accuracy must be reported separately and never inferred from synthetic tests.
