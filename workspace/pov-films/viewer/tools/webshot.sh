#!/bin/zsh
# Screenshot the real-time edition at one time, headless Chrome, 540x960, one Chrome at a time.
# Usage: viewer/tools/webshot.sh <slug> <seconds> <out.png> [extra query, e.g. "fog=0&bloom=0"]
# Needs the viewer served at http://127.0.0.1:8000 from workspace/pov-films.
set -eu
slug=$1; t=$2; out=$3; extra=${4:-}
TMPROOT=${TMPDIR:-/tmp}/pov-webshot
mkdir -p $TMPROOT
lock=$TMPROOT/lock
n=0
until mkdir $lock 2>/dev/null; do sleep 1; n=$((n+1)); (( n > 300 )) && { echo "webshot: lock timeout"; exit 1; }; done
trap 'rmdir $lock 2>/dev/null' EXIT
# The static server sends no Cache-Control, so Chrome would keep serving an old viewer.js or
# scene.glb from the profile's cache for a while after they change. Start every shot cold.
url="http://127.0.0.1:8000/viewer/?film=$slug&t=$t&paused=1&bare=1&dpr=1${extra:+&$extra}"
# A cold load now and then runs out of virtual time before the first frame and the shot comes
# back all black (about 1 in 10 to 1 in 3 for some films). Retry those, up to 4 shots in all.
for try in 1 2 3 4; do
  rm -rf $TMPROOT/profile/Default/Cache "$TMPROOT/profile/Default/Code Cache"
  rm -f $out
  perl -e 'alarm 120; exec @ARGV' "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
    --headless=new --user-data-dir=$TMPROOT/profile --use-angle=metal --enable-gpu --ignore-gpu-blocklist \
    --hide-scrollbars --window-size=540,960 --virtual-time-budget=20000 --screenshot=$out "$url" >/dev/null 2>&1 || true
  [[ -s $out ]] || continue
  # exit 2 = under 1 percent of the pixels above luma 3 (a black canvas, perhaps with the
  # loading bar); any other failure (no python3 or PIL) keeps the shot
  python3 -c 'import sys; from PIL import Image; h = Image.open(sys.argv[1]).convert("L").histogram(); sys.exit(2 if sum(h[4:]) < 0.01 * sum(h) else 0)' $out 2>/dev/null && break
  [[ $? -eq 2 ]] || break
  echo "webshot: black frame, retrying ($try)" >&2
done
[[ -s $out ]] && echo "webshot: $out" || { echo "webshot: failed for $url"; exit 1; }
