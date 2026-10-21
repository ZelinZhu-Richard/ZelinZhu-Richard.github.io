#!/usr/bin/env bash
# Run a solution against the task verifier, the way a Harbor trial would:
#   1. copy the app into a fresh folder (or container),
#   2. run the solution's solve.sh in it (the "agent" step),
#   3. only then copy in the tests and run tests/test.sh,
#   4. read the reward the verifier wrote.
# Works with macOS /bin/bash 3.2 and with newer bash.
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  bash run_task.sh [options] SOLUTION     run one solution; writes reward.txt
  bash run_task.sh [options] --all        run every solution; prints the validation matrix

SOLUTION is "reference", a folder name under solutions/, or a path to a folder with solve.sh.

Options:
  --runs N        run each solution N times (default 1). Use 3 to check stability.
  --tests DIR     verifier folder to use (default: task/tests). Must contain test.sh.
  --corpus DIR    with --all: also run every DIR/*/solve.sh (may repeat).
  --docker        run inside Docker (no network) instead of a local temp folder.
  --out DIR       where reward.txt, matrix.tsv and runs/ go (default: current folder).
  -h, --help      show this help.

Expected rewards come from names: reference and alt-* should get 1;
wrong-* and do-nothing should get 0.
EOF
}

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TASK="$HERE/task"
TESTS="$TASK/tests"
RUNS=1
MODE=local
ALL=0
TARGET=""
OUT="$(pwd)"
IMAGE="lab-f-freebusy:local"
CORPORA=()

while [ $# -gt 0 ]; do
  case "$1" in
    --runs) RUNS="$2"; shift 2 ;;
    --tests) TESTS="$2"; shift 2 ;;
    --corpus) CORPORA+=("$2"); shift 2 ;;
    --docker) MODE=docker; shift ;;
    --out) OUT="$2"; shift 2 ;;
    --all) ALL=1; shift ;;
    -h|--help) usage; exit 0 ;;
    -*) echo "unknown option: $1" >&2; usage >&2; exit 2 ;;
    *) TARGET="$1"; shift ;;
  esac
done

case "$RUNS" in ''|*[!0-9]*) echo "--runs needs a positive number" >&2; exit 2 ;; esac
[ "$RUNS" -ge 1 ] || { echo "--runs needs a positive number" >&2; exit 2; }
[ -f "$TESTS/test.sh" ] || { echo "no test.sh in $TESTS" >&2; exit 2; }
TESTS="$(cd "$TESTS" && pwd)"
mkdir -p "$OUT/runs"
OUT="$(cd "$OUT" && pwd)"

resolve() {  # name or path -> folder that holds solve.sh
  if [ "$1" = "reference" ]; then echo "$TASK/solution"
  elif [ -f "$1/solve.sh" ]; then (cd "$1" && pwd)
  elif [ -f "$HERE/solutions/$1/solve.sh" ]; then echo "$HERE/solutions/$1"
  else echo "no such solution: $1" >&2; return 1
  fi
}

expected() {
  case "$1" in
    reference|alt-*) echo 1 ;;
    wrong-*|do-nothing) echo 0 ;;
    *) echo "?" ;;
  esac
}

read_reward() {  # file -> reward on stdout ("0" if missing)
  if [ -s "$1" ]; then tr -d '[:space:]' < "$1"; else echo 0; fi
}

docker_build() {
  command -v docker >/dev/null 2>&1 || { echo "docker is not installed" >&2; exit 2; }
  echo "building $IMAGE from task/environment ..." >&2
  docker build -q -t "$IMAGE" "$TASK/environment" >/dev/null
}

run_once() {  # solution_dir name k -> prints reward; log in runs/
  local sol="$1" name="$2" k="$3"
  local log="$OUT/runs/$name.run$k.log"
  local work
  work="$(mktemp -d "${TMPDIR:-/tmp}/lab-f-run.XXXXXX")"
  : > "$log"
  if [ "$MODE" = local ]; then
    cp -R "$TASK/environment/app" "$work/app"
    cp -R "$sol" "$work/solution"
    echo "== solve.sh ($name)" >> "$log"
    (cd "$work/app" && bash "$work/solution/solve.sh") >> "$log" 2>&1 || echo "solve.sh exited non-zero" >> "$log"
    cp -R "$TESTS" "$work/tests"
    mkdir -p "$work/logs/verifier"
    echo "== tests/test.sh" >> "$log"
    (cd "$work/app" && APP_DIR="$work/app" TESTS_DIR="$work/tests" LOGS_DIR="$work/logs" bash "$work/tests/test.sh") >> "$log" 2>&1 || true
    [ -f "$work/logs/verifier/checks.json" ] && cp "$work/logs/verifier/checks.json" "$OUT/runs/$name.run$k.checks.json"
    read_reward "$work/logs/verifier/reward.txt"
  else
    local cid
    cid="$(docker run -d --network none "$IMAGE" sleep infinity)"
    docker exec "$cid" mkdir -p /solution /tests /logs/verifier
    docker cp "$sol/." "$cid:/solution/" >/dev/null
    echo "== solve.sh ($name, docker)" >> "$log"
    docker exec -w /app "$cid" bash /solution/solve.sh >> "$log" 2>&1 || echo "solve.sh exited non-zero" >> "$log"
    docker cp "$TESTS/." "$cid:/tests/" >/dev/null
    echo "== tests/test.sh (docker)" >> "$log"
    docker exec -w /app "$cid" bash /tests/test.sh >> "$log" 2>&1 || true
    docker cp "$cid:/logs/verifier/reward.txt" "$work/reward.txt" >/dev/null 2>&1 || true
    docker cp "$cid:/logs/verifier/checks.json" "$OUT/runs/$name.run$k.checks.json" >/dev/null 2>&1 || true
    docker rm -f "$cid" >/dev/null
    read_reward "$work/reward.txt"
  fi
  rm -rf "$work"
}

[ "$MODE" = docker ] && docker_build

if [ "$ALL" -eq 0 ]; then
  [ -n "$TARGET" ] || { usage >&2; exit 2; }
  sol="$(resolve "$TARGET")"
  name="$(basename "$TARGET")"
  [ "$TARGET" = "reference" ] && name=reference
  reward=0
  for k in $(seq 1 "$RUNS"); do
    reward="$(run_once "$sol" "$name" "$k")"
    echo "run $k: reward=$reward (log: runs/$name.run$k.log)"
  done
  [ "$RUNS" -eq 1 ] && cat "$OUT/runs/$name.run1.log"
  echo "$reward" > "$OUT/reward.txt"
  echo "reward=$reward (written to reward.txt)"
  exit 0
fi

# --all: build the list of (name, folder) pairs.
NAMES=(reference)
DIRS=("$TASK/solution")
for d in "$HERE"/solutions/*/; do
  [ -f "$d/solve.sh" ] || continue
  NAMES+=("$(basename "$d")"); DIRS+=("$(cd "$d" && pwd)")
done
if [ "${#CORPORA[@]}" -gt 0 ]; then
  for c in "${CORPORA[@]}"; do
    for d in "$c"/*/; do
      [ -f "$d/solve.sh" ] || continue
      NAMES+=("$(basename "$d")"); DIRS+=("$(cd "$d" && pwd)")
    done
  done
fi

header="solution	expect"
for k in $(seq 1 "$RUNS"); do header="$header	run$k"; done
header="$header	verdict"
echo "$header" > "$OUT/matrix.tsv"

false_accepts=0; false_rejects=0; unstable=0; unknown=0
i=0
while [ "$i" -lt "${#NAMES[@]}" ]; do
  name="${NAMES[$i]}"; sol="${DIRS[$i]}"; want="$(expected "$name")"
  line="$name	$want"; first=""; stable=1
  for k in $(seq 1 "$RUNS"); do
    r="$(run_once "$sol" "$name" "$k")"
    line="$line	$r"
    if [ -z "$first" ]; then first="$r"; elif [ "$r" != "$first" ]; then stable=0; fi
  done
  if [ "$stable" -eq 0 ]; then verdict="UNSTABLE"; unstable=$((unstable + 1))
  elif [ "$want" = "?" ]; then verdict="no expectation"; unknown=$((unknown + 1))
  elif [ "$first" = "$want" ]; then verdict="ok"
  elif [ "$want" = 1 ]; then verdict="FALSE REJECT"; false_rejects=$((false_rejects + 1))
  else verdict="FALSE ACCEPT"; false_accepts=$((false_accepts + 1))
  fi
  echo "$line	$verdict" >> "$OUT/matrix.tsv"
  i=$((i + 1))
done

column -t -s "	" "$OUT/matrix.tsv" 2>/dev/null || cat "$OUT/matrix.tsv"
echo
echo "verifier: $TESTS"
echo "mode: $MODE, runs per solution: $RUNS, solutions: ${#NAMES[@]}"
echo "false accepts: $false_accepts, false rejects: $false_rejects, unstable: $unstable, no expectation: $unknown"
echo "These are counts over a hand-picked corpus, not error rates."
echo "logs: $OUT/runs/  matrix: $OUT/matrix.tsv"
if [ $((false_accepts + false_rejects + unstable)) -eq 0 ]; then
  echo "matrix: OK"
else
  echo "matrix: NOT OK"
  exit 1
fi
