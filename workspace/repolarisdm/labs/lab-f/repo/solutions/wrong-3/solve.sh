#!/bin/bash
# Candidate solution. run_task.sh copies this folder to a "solution" folder and runs this script in the app folder.
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cp "$here/merge.py" freebusy/merge.py
