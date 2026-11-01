#!/bin/bash
# Independent review: build an evidence-only bundle and run Codex read-only on it.
# Usage: bash games/xiaoyaoyou/tools/codex_review.sh <M3|M4|...> <round> <evidence dir> [extra png ...]
# Builder notes (LOG.md, MORNING.md, NIGHT.md) and the source tree are never copied in.
set -euo pipefail

milestone=$1
round=$2
evidence=$3
shift 3
root="$(cd "$(dirname "$0")/.." && pwd)"
repo="$(cd "$root/../.." && pwd)"
bundle="$root/_dev/review/$milestone-round$round"
model="${CODEX_REVIEW_MODEL:-gpt-6.1-sol}"
effort="${CODEX_REVIEW_EFFORT:-high}"

mkdir -p "$bundle/images" "$bundle/ref"
cp "$evidence"/*.png "$bundle/images/"
for extra in "$@"; do cp "$extra" "$bundle/images/"; done
for name in metrics checks console; do
  [ -f "$evidence/$name.json" ] && cp "$evidence/$name.json" "$bundle/$name.json"
done
if [ -f "$root/_dev/silhouette/kun.json" ]; then
  cp "$root/_dev/silhouette/kun.json" "$bundle/silhouette.json"
  # Reference | Blender preview | mask overlay panels, for regression and browser-match criteria.
  for view in side top front; do cp "$root/_dev/silhouette/kun-$view.png" "$bundle/images/"; done
fi
cp "$root/PLAN.md" "$root/REVIEW_RUBRIC.md" "$bundle/"
cp "$root/ref/key-north-sea.png" "$root/ref/key-peng-sunset.png" "$bundle/ref/"
{
  echo "commit $(git -C "$repo" rev-parse HEAD)"
  # Notes and review tooling never make evidence stale, per REVIEW_RUBRIC §1.
  notes='games/xiaoyaoyou/(PLAN|LOG|MORNING|NIGHT)\.md$|games/xiaoyaoyou/tools/codex_review'
  dirty="$(git -C "$repo" status --porcelain | grep -vE "$notes" || true)"
  echo "dirty $([ -z "$dirty" ] && echo false || echo true)"
  [ -n "$dirty" ] && echo "$dirty"
  evidenced="$(python3 -c "import json,sys; print(json.load(open(sys.argv[1]))['commit'])" "$evidence/metrics.json")"
  echo "evidenceCommit $evidenced"
  echo "codeChangedSinceEvidence:"
  git -C "$repo" diff --name-only "$evidenced" HEAD | grep -vE "$notes" || echo "(none)"
} > "$bundle/HEAD.txt"

# Long PNGs are attached in a stable order; key art first so comparisons anchor on it.
args=(-i "$bundle/ref/key-north-sea.png")
for png in "$bundle"/images/*.png; do args+=(-i "$png"); done

sed -e "s/{{MILESTONE}}/$milestone/g" -e "s/{{ROUND}}/$round/g" "$root/tools/codex_review.md" > "$bundle/prompt.md"
cd "$bundle"
started=$SECONDS
codex exec --ignore-user-config --ignore-rules --ephemeral --skip-git-repo-check \
  -m "$model" -c "model_reasoning_effort=\"$effort\"" \
  --sandbox read-only -C "$bundle" \
  --output-schema "$root/tools/codex_review.schema.json" \
  -o "$bundle/verdict.json" "${args[@]}" - < "$bundle/prompt.md" > "$bundle/codex.log" 2>&1
echo "seconds $((SECONDS - started))"
python3 -c "import json,sys; v=json.load(open(sys.argv[1])); print(v['verdict'], '|', v['summary']); [print(' -', i['severity'], i['file'], '|', i['observed']) for i in v['issues']]" "$bundle/verdict.json"
