#!/bin/sh
# Shared pinned toolchain is read-only; geometry and named nodes are preserved.
set -eu
GAME=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
CLI=/Users/richardzhu/game-assets/node_modules/.bin/gltf-transform
export TMPDIR="$GAME/_dev/tmp"
mkdir -p "$GAME/assets" "$TMPDIR" "$GAME/_dev/build"
"$CLI" webp "$GAME/_dev/raw/kun.glb" "$GAME/_dev/tmp/kun-webp.glb" --lossless true
"$CLI" optimize "$GAME/_dev/tmp/kun-webp.glb" "$GAME/assets/kun.glb" \
  --compress meshopt --simplify false --flatten false --join false \
  --instance false --palette false --texture-compress false --texture-size 2048
# Props have no textures; meshopt alone, with every named pillar kept separate.
"$CLI" optimize "$GAME/_dev/raw/sea.glb" "$GAME/assets/sea.glb" \
  --compress meshopt --simplify false --flatten false --join false \
  --instance false --palette false --texture-compress false
node "$GAME/tools/inspect_assets.mjs"
