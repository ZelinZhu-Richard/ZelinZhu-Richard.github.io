#!/bin/zsh
# Run one Blender job for a film with a machine-wide lock, so side jobs (stills, web exports) never
# stack up next to a film render and push the machine into swap. Run from workspace/pov-films.
# Usage: kit/blender_locked.sh <slug> [build args after --], e.g. kit/blender_locked.sh 03-first-snow-village --export-web
set -eu
slug=$1; shift
lock=${TMPDIR:-/tmp}/pov-blender-lock
n=0
until mkdir $lock 2>/dev/null; do
  sleep 2; n=$((n+1))
  (( n % 30 == 0 )) && echo "blender_locked: waiting for the lock ($((n*2)) s)"
  (( n > 1800 )) && { echo "blender_locked: lock timeout"; exit 1; }
done
trap 'rmdir $lock 2>/dev/null' EXIT
free=$(df -k / | awk 'NR==2 {print int($4/1048576)}')
(( free < 3 )) && { echo "blender_locked: only ${free} GB free, not starting"; exit 2; }
/Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup --python-exit-code 1 -P films/$slug/build.py -- "$@"
