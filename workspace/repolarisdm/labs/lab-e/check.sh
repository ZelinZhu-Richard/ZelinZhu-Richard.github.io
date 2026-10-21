#!/usr/bin/env bash
# lab-e: your check script for `git bisect run`. Fill in the TODOs.
#
# Copy it OUTSIDE the practice repo first (for example to ../check.sh), then,
# inside the practice repo:
#
#   git bisect start main v0.2.0
#   git bisect run bash ../check.sh
#   git bisect reset
#
# git bisect reads only the exit code:
#   0                 good: this commit does not have the bug
#   1-124, 126, 127   bad: this commit has the bug
#   125               skip: this commit cannot be tested
#   128-255           stop the whole bisect (exit -1 becomes 255, so never use it)
set -u

# Run from the top of the repo, and never reuse a stale .pyc file.
cd "$(git rev-parse --show-toplevel)" || exit 255
export PYTHONDONTWRITEBYTECODE=1

# TODO 1: write the receipt from the bug report to a temp file OUTSIDE the repo
#         (mktemp -d), and delete it on exit (trap ... EXIT).

# TODO 2: decide whether this commit can be tested at all. If it cannot, exit 125.
#         Ask yourself: what must work before the test in TODO 3 means anything?

# TODO 3: run the reproduction from the bug report. Exit 0 if the result is
#         right, 1 if it is wrong. Test the behavior the user cares about.

echo "check.sh: the TODOs are not filled in yet" >&2
exit 255
