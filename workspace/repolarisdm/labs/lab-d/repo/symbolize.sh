#!/usr/bin/env bash
# Add function names and file:line to a sanitizer report that has only raw
# addresses, such as "(build/test_ringlog_asan:arm64+0x1000011bc)".
#
#   bash symbolize.sh build/test_ringlog_asan < build/asan.log
#
# Why: on macOS, live symbolization runs `atos -p <pid>`, which needs
# permission to inspect a running process and can wait for a password dialog.
# `atos -o` reads the binary and its debug info offline instead. `make asan`
# uses this script. Lines without a raw address are printed unchanged.
#
# `atos -i` also prints inlined functions. A frame then shows the innermost
# function first, followed by "inlined into" lines for its callers.
set -u
bin="${1:?usage: symbolize.sh BINARY < REPORT}"
name="$(basename "$bin")"
have_atos=0
if command -v atos > /dev/null 2>&1; then
  have_atos=1
fi
while IFS= read -r line || [ -n "$line" ]; do
  case "$line" in
    *"/$name:"*"+0x"*")"* | *"($name:"*"+0x"*")"*)
      if [ "$have_atos" = 1 ]; then
        head_part="$(printf '%s' "${line%%(*}" | sed -E 's/ +$//')"
        indent="$(printf '%s' "$line" | sed -E 's/^( *).*/\1/')"
        arch="$(printf '%s' "$line" | sed -E 's/.*:([A-Za-z0-9_]+)\+0x[0-9a-fA-F]+\).*/\1/')"
        addr="$(printf '%s' "$line" | sed -E 's/.*\+(0x[0-9a-fA-F]+)\).*/\1/')"
        frames="$(atos -o "$bin" -arch "$arch" -i "$addr" 2> /dev/null \
          | sed -E '/^$/d; s/ \(in [^)]*\) \((.*)\)$/ \1/')"
        if [ -n "$frames" ] && [ "${frames#0x}" = "$frames" ]; then
          first=1
          while IFS= read -r frame; do
            if [ "$first" = 1 ]; then
              printf '%s in %s\n' "$head_part" "$frame"
              first=0
            else
              printf '%s    inlined into %s\n' "$indent" "$frame"
            fi
          done <<< "$frames"
          continue
        fi
      fi
      printf '%s\n' "$line"
      ;;
    *)
      printf '%s\n' "$line"
      ;;
  esac
done
