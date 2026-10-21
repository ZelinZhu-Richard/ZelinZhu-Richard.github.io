#!/bin/bash
# Reference solution. Harbor copies this folder to /solution and runs this script in /app.
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cp "$here/merge.py" freebusy/merge.py
