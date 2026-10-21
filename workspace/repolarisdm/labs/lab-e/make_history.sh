#!/usr/bin/env bash
# Build the lab-e practice repo (200 commits of "billsplit") in a new temp
# folder and print its path. It never writes inside this lab folder.
#
#   bash labs/lab-e/make_history.sh
#   cd "$(bash labs/lab-e/make_history.sh)"
#
# Needs git (2.28 or newer) and python3 (3.9 or newer). Takes about 10 seconds.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
tmp="${TMPDIR:-/tmp}"
base="$(mktemp -d "${tmp%/}/bisect200.XXXXXX")"
python3 "$here/gen_history.py" "$base/billsplit" >&2
echo "$base/billsplit"
