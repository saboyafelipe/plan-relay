#!/bin/sh
# Conformance suite of contract 1 (core/contract/contract.md): runs a status.sh against each case
# and compares the --json with the case's expected.json, normalized with jq -S.
#
# Usage: sh core/contract/conformance/run.sh [--out <dir>] <status.sh> [case…]
#   --out <dir>  keeps each case's output in <dir>/<case>.json (validate.sh uses it)
#   case…        only these cases (folder names in cases/); with none, all of them
#
# Each case is a folder cases/<case>/ with:
#   agent_plans/<plan>/…  a single plan, without the scripts
#   expected.json         the expected --json, written by hand from the specification
#   expected.tsv          instead of expected.json, for the --options lines: status.sh runs with args
#                         alone (no --json) and stdout must equal the file byte for byte; only the
#                         shell runs these cases, because no host implements --options
#   args                  optional: status.sh arguments besides --json, on one line
#   since                 the lowest scripts version that implements the case (every case has one; a
#                         missing file counts as 0); a status.sh with a lower stamp skips the case
#                         (and says so), one without a stamp runs them all
# status.sh is copied into the plan folder of a throwaway copy of the case and runs from there.
# The scripts_version key is not compared: it is the stamp of whoever runs (the schema checks the type).
# A case also fails when status.sh exits with a code other than 0 or writes to stderr: the host
# treats either as a failure, even after a valid JSON.
# Needs jq. Exits 0 when every case matches, 1 when any diverges, 2 on wrong usage.
#
#      sh core/contract/conformance/run.sh --self-test <status.sh>
# proves the suite can fail: <status.sh> must pass, and copies of it broken on purpose (pct
# rounded down, exit 3 after the JSON, a line on stderr) must each make the suite exit 1.
# Exits 0 when all of that holds, 1 otherwise.

usage() { echo "Usage: sh run.sh [--out <dir>] <status.sh> [case…] | sh run.sh --self-test <status.sh>" >&2; exit 2; }

# shellcheck disable=SC2016 # the wrappers are text for the broken copies, expanded when they run
if [ "${1-}" = "--self-test" ]; then
  if [ $# -ne 2 ] || [ ! -f "$2" ]; then usage; fi
  self="$(cd "$(dirname "$0")" && pwd)/run.sh" || exit 2
  real=$2
  st=$(mktemp -d) || exit 2
  trap 'rm -rf "$st"' EXIT
  bad=0
  if sh "$self" "$real" > "$st/out" 2>&1; then echo "  ok    self-test: $real passes"
  else echo "  FAIL  self-test: $real should pass"; sed 's/^/        /' "$st/out"; bad=1; fi
  # The wrapper runs the real script again (same path, so the plan folder is the same) and then
  # misbehaves on the way out.
  wrap() { awk -v add="$1" 'NR == 1 { print; print add; next } { print }' "$real"; }
  sed 's/int(100 \* ndone_total \/ counted + 0\.5)/int(100 * ndone_total \/ counted)/' "$real" > "$st/pct.sh"
  wrap 'if [ -z "${SELF_TEST_INNER-}" ]; then SELF_TEST_INNER=1 sh "$0" "$@"; exit 3; fi' > "$st/exit3.sh"
  wrap 'if [ -z "${SELF_TEST_INNER-}" ]; then SELF_TEST_INNER=1 sh "$0" "$@"; rc=$?; echo "warning: noise" >&2; exit "$rc"; fi' > "$st/stderr.sh"
  for broken in "pct:pct rounded down" "exit3:exit 3 after a valid JSON" "stderr:a line on stderr after a valid JSON"; do
    name=${broken%%:*}
    what=${broken#*:}
    if cmp -s "$real" "$st/$name.sh"; then echo "  FAIL  self-test: the break \"$what\" did not apply to $real"; bad=1; continue; fi
    sh "$self" "$st/$name.sh" > "$st/out" 2>&1
    rc=$?
    if [ "$rc" -eq 1 ]; then echo "  ok    self-test: $what → exits 1"
    else echo "  FAIL  self-test: $what → exited $rc, expected 1"; bad=1; fi
  done
  if [ "$bad" -eq 0 ]; then echo "conformance self-test: all good"; exit 0; fi
  echo "conformance self-test: failed"
  exit 1
fi

out=""
if [ "${1-}" = "--out" ]; then
  [ $# -ge 2 ] || usage
  out=$2
  shift 2
fi
target=${1-}
if [ -z "$target" ] || [ ! -f "$target" ]; then usage; fi
shift
command -v jq >/dev/null || { echo "run.sh needs jq" >&2; exit 2; }
[ -z "$out" ] || mkdir -p "$out" || exit 2

# Task and phase order is numeric (core/contract/contract.md, "Order"); the C locale only removes
# the influence of the runner's locale.
LC_ALL=C
export LC_ALL

here=$(cd "$(dirname "$0")" && pwd) || exit 2
tmp=$(mktemp -d) || exit 2
trap 'rm -rf "$tmp"' EXIT

# The stamp of the status.sh under test decides which cases it already implements (each case's since file).
stamp=$(sed -n 's/^# scripts_version: \([0-9][0-9]*\)$/\1/p' "$target" | head -1)

n=0
failures=0
skipped=0
for dir in "$here"/cases/*/; do
  cname=$(basename "$dir")
  if [ $# -gt 0 ]; then
    wanted=0
    for c in "$@"; do [ "$c" = "$cname" ] && wanted=1; done
    [ "$wanted" = 1 ] || continue
  fi
  if [ -n "$stamp" ] && [ -f "$dir/since" ] && [ "$stamp" -lt "$(cat "$dir/since")" ]; then
    echo "  skip  $cname (since $(cat "$dir/since"), status.sh with stamp $stamp)"
    skipped=$((skipped + 1))
    continue
  fi
  n=$((n + 1))
  rm -rf "$tmp/case"
  mkdir "$tmp/case" || exit 2
  cp -R "$dir/agent_plans" "$tmp/case/" || exit 2
  plan=""
  for p in "$tmp"/case/agent_plans/*/; do plan=$p; done
  cp "$target" "$plan/status.sh" || exit 2
  args=""
  [ ! -f "$dir/args" ] || args=$(cat "$dir/args")
  if [ -f "$dir/expected.tsv" ]; then
    # shellcheck disable=SC2086 # args holds zero or more words, none with a space inside
    sh "$plan/status.sh" $args > "$tmp/got.tsv" 2> "$tmp/stderr"
    rc=$?
    if [ "$rc" -ne 0 ] || [ -s "$tmp/stderr" ]; then
      echo "  FAIL  $cname: status.sh exited $rc, stderr \"$(cat "$tmp/stderr")\" (expected 0 and nothing)"
      failures=$((failures + 1))
    elif cmp -s "$tmp/got.tsv" "$dir/expected.tsv"; then
      echo "  ok    $cname"
    else
      echo "  FAIL  $cname (--- expected, +++ got)"
      diff -u "$dir/expected.tsv" "$tmp/got.tsv" | sed 's/^/        /'
      failures=$((failures + 1))
    fi
    continue
  fi
  # shellcheck disable=SC2086 # args holds zero or more words, none with a space inside
  sh "$plan/status.sh" --json $args > "$tmp/got.json" 2> "$tmp/stderr"
  rc=$?
  [ -z "$out" ] || cp "$tmp/got.json" "$out/$cname.json"
  if [ "$rc" -ne 0 ] || [ -s "$tmp/stderr" ]; then
    echo "  FAIL  $cname: status.sh exited $rc, stderr \"$(cat "$tmp/stderr")\" (expected 0 and nothing)"
    failures=$((failures + 1))
    continue
  fi
  if ! jq -S 'del(.scripts_version)' "$tmp/got.json" > "$tmp/a.json" 2>"$tmp/error"; then
    echo "  FAIL  $cname: the output is not JSON ($(cat "$tmp/error"))"
    failures=$((failures + 1))
    continue
  fi
  jq -S 'del(.scripts_version)' "$dir/expected.json" > "$tmp/b.json" || exit 2
  if cmp -s "$tmp/a.json" "$tmp/b.json"; then
    echo "  ok    $cname"
  else
    echo "  FAIL  $cname (--- expected, +++ got)"
    diff -u "$tmp/b.json" "$tmp/a.json" | sed 's/^/        /'
    failures=$((failures + 1))
  fi
done

[ "$n" -gt 0 ] || { echo "run.sh: no case found" >&2; exit 2; }
skip_note=""
[ "$skipped" -eq 0 ] || skip_note=" ($skipped skipped by since)"
if [ "$failures" -eq 0 ]; then echo "conformance: $n case(s), all good$skip_note"; else echo "conformance: $failures of $n case(s) diverge$skip_note"; exit 1; fi
