#!/bin/sh
# Proves that the task header has one reader and one writer: core/template/header.awk, which
# tools/script-strings.sh embeds between "# >>> header" and "# <<< header" in the four scripts that
# read a task. Outside that block, no script may match "^Status:" (an awk pattern or a sed
# expression that reads the Status: line on its own), and each one must use the block.
# A copy with a reader planted outside the block proves that the count can fail.
# Usage, from any folder: sh tools/tests/header.sh
# Exits 0 with "all good" when everything passes.

case "$0" in */*) here=${0%/*} ;; *) here=. ;; esac
here=$(cd "$here" && pwd) || exit 2
root=$(dirname "$(dirname "$here")")
# shellcheck source=tools/tests/lib.sh
. "$here/lib.sh"
suite_start tools/tests/header.sh 60

scripts="core/template/status.sh core/template/task.sh core/template/map.sh core/scripts/boundary.sh"

# outside <file>: the lines of the file outside the header block
outside() { awk '/^# >>> header/ { inside = 1; next } inside && /^# <<< header$/ { inside = 0; next } !inside' "$1"; }
# readers <file>: how many lines outside the header block match ^Status:
readers() { outside "$1" | grep -c -F '^Status:'; }

check "core/template/header.awk exists" "$([ -f "$root/core/template/header.awk" ] && echo yes)" yes
for s in $scripts; do
  check "$s: one header block" "$(grep -c -e '^# >>> header' -e '^# <<< header$' "$root/$s")" 2
  check "$s: no reader of Status: outside the header block" "$(readers "$root/$s")" 0
  # shellcheck disable=SC2016 # the literal text $HEADER_AWK, searched for in the script
  check "$s: the awk programs use HEADER_AWK" "$(outside "$root/$s" | grep -c -F '$HEADER_AWK' | sed 's/^0$/none/;s/^[1-9][0-9]*$/some/')" some
done

# The environment prelude of lib.sh (every suite starts from the same time zone, locale and home).
check "lib.sh prelude: TZ" "$TZ" UTC
check "lib.sh prelude: LC_ALL" "$LC_ALL" C.UTF-8
home_ok=no
case $HOME in "$tmp"/*) [ -d "$HOME" ] && home_ok=yes ;; esac
check "lib.sh prelude: HOME is a folder inside the suite's temporary one" "$home_ok" yes

printf '%s\n' "red on a copy"
cp "$root/core/template/status.sh" "$tmp/status.sh" || exit 2
printf '%s\n' "awk '/^Status:/ { print }' phase-*/*.md" >> "$tmp/status.sh"
check "a reader planted outside the block is counted" "$(readers "$tmp/status.sh")" 1

suite_end
