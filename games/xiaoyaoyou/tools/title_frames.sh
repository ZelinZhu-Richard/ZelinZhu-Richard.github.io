#!/bin/sh
# The title and social images are real frames from the game, unretouched except for resizing.
# Run from games/xiaoyaoyou, with the local server up, after any change to the look.
set -eu
node tools/frames.mjs title-wide --size 2560x1440 --clean north-full
node tools/frames.mjs title-narrow --size 860x1864 --clean north-full
python3 - <<'PY'
from PIL import Image
frames = '_dev/tmp/frames/'
wide = Image.open(frames + 'title-wide-north-full.png').convert('RGB')
wide.save('assets/title.webp', quality=84, method=6)
Image.open(frames + 'title-narrow-north-full.png').convert('RGB').save('assets/title-narrow.webp', quality=82, method=6)
# 1200 x 630 from the wide frame, keeping Kun whole.
height = round(wide.width * 630 / 1200)
top = max(0, round(wide.height * .49 - height / 2))
wide.crop((0, top, wide.width, top + height)).resize((1200, 630), Image.LANCZOS).save('assets/og.jpg', quality=86, optimize=True, progressive=True)
PY
