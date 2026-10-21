#!/bin/bash
# Verifier for the freebusy-merge task.
# Harbor uploads this folder to /tests after the agent finishes, then runs this script.
# APP_DIR, TESTS_DIR and LOGS_DIR exist only so run_task.sh can run it outside a container.
set -uo pipefail

APP_DIR="${APP_DIR:-/app}"
TESTS_DIR="${TESTS_DIR:-/tests}"
LOGS_DIR="${LOGS_DIR:-/logs}"
mkdir -p "$LOGS_DIR/verifier"

cd "$APP_DIR" || exit 1

status=0
# The repository's own unit tests must still pass.
python3 -m unittest discover -s tests -v || status=1
# Task-specific checks.
python3 "$TESTS_DIR/test_outputs.py" -v || status=1

if [ "$status" -eq 0 ]; then
  echo 1 > "$LOGS_DIR/verifier/reward.txt"
else
  echo 0 > "$LOGS_DIR/verifier/reward.txt"
fi
