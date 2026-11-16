#!/bin/sh
# Contract edit cases (core/contract/contract.md, "Cancel, give up and reopen" and "Writers"): runs a
# task.sh against each case in edits/ and against the reasons.json table, and compares with the
# expected. The shape of the cases is in edits/README.md. The task.sh runs with
# TASK_TEST_NOW=2026-01-02T03:04Z, the time that claim and close write.
#
# Usage: sh core/contract/conformance/edit.sh <task.sh> [case…]
#   case…  only these cases (folder names in edits/, or "reasons" for the table); with none, all of them
#
# For each case: copies before/ to a throwaway folder, puts task.sh in the plan folder, runs it with
# the arguments of args (one per line) under LC_ALL=C and checks the exit code (exit), the plan tree
# (after/, or before/ when there is no after/; without task.sh and without any .lock-*), stderr (if the
# case has stderr) and stdout as JSON (if the case has preview.json, compared with jq -S).
# For each reason in reasons.json: in a single-task plan, "cancel F1-01 --reason <input>" must
# refuse with x-test:task.invalidReason and leave the plan tree byte for byte as it was (valid
# false), or leave a tree where only the task changed, to "Status: cancelled" and the line
# "- x-test:task.logCancel <written>" in the ## Log (valid true). No input ends in a line break, so
# it passes whole through $(…).
# Needs jq. Exits 0 when everything matches, 1 when something diverges, 2 on wrong usage.
#
#      sh core/contract/conformance/edit.sh --self-test <task.sh>
# proves the suite can fail: <task.sh> must pass, and copies of it broken on purpose (cancel
# without its ## Log line, giveup without the Given up by: line) must each make the suite exit 1.
# Exits 0 when all of that holds, 1 otherwise.

usage() { echo "Usage: sh edit.sh <task.sh> [case…] | sh edit.sh --self-test <task.sh>" >&2; exit 2; }

if [ "${1-}" = "--self-test" ]; then
  if [ $# -ne 2 ] || [ ! -f "$2" ]; then usage; fi
  self="$(cd "$(dirname "$0")" && pwd)/edit.sh" || exit 2
  real=$2
  st=$(mktemp -d) || exit 2
  trap 'rm -rf "$st"' EXIT
  bad=0
  if sh "$self" "$real" > "$st/out" 2>&1; then echo "  ok    self-test: $real passes"
  else echo "  FAIL  self-test: $real should pass"; sed 's/^/        /' "$st/out"; bad=1; fi
  sed 's/queue(root, "cancelled", "", msg("task\.logCancel", reason))/queue(root, "cancelled", "", "")/' "$real" > "$st/log.sh"
  sed 's/"Given up by: owner" prev/"" prev/' "$real" > "$st/header.sh"
  for broken in "log:cancel without its ## Log line" "header:giveup without the Given up by: line"; do
    name=${broken%%:*}
    what=${broken#*:}
    if cmp -s "$real" "$st/$name.sh"; then echo "  FAIL  self-test: the break \"$what\" did not apply to $real"; bad=1; continue; fi
    sh "$self" "$st/$name.sh" > "$st/out" 2>&1
    rc=$?
    if [ "$rc" -eq 1 ]; then echo "  ok    self-test: $what → exits 1"
    else echo "  FAIL  self-test: $what → exited $rc, expected 1"; bad=1; fi
  done
  if [ "$bad" -eq 0 ]; then echo "edits self-test: all good"; exit 0; fi
  echo "edits self-test: failed"
  exit 1
fi

target=${1-}
if [ -z "$target" ] || [ ! -f "$target" ]; then usage; fi
shift
command -v jq >/dev/null || { echo "edit.sh needs jq" >&2; exit 2; }

LC_ALL=C
export LC_ALL
# The clock of claim and close: a task.sh writes this time as <now> when the variable is set.
TASK_TEST_NOW=2026-01-02T03:04Z
export TASK_TEST_NOW

here=$(cd "$(dirname "$0")" && pwd) || exit 2
target=$(cd "$(dirname "$target")" && pwd)/$(basename "$target") || exit 2
tmp=$(mktemp -d) || exit 2
trap 'rm -rf "$tmp"' EXIT

wants() { # wants <case>: 0 when the case is part of this run
  [ "$#" -gt 0 ] || return 1
  [ -z "$filter" ] && return 0
  for c in $filter; do [ "$c" = "$1" ] && return 0; done
  return 1
}
filter="$*"

n=0
failures=0
fail() { echo "  FAIL  $1: $2"; failures=$((failures + 1)); }

# run_task <plan dir> <args file>: runs the plan's task.sh with the arguments, one per line
run_task() (
  plan=$1
  list=$2
  set --
  while IFS= read -r line || [ -n "$line" ]; do set -- "$@" "$line"; done < "$list"
  sh "$plan/task.sh" "$@" > "$tmp/stdout" 2> "$tmp/stderr"
)

for dir in "$here"/edits/*/; do
  cname=$(basename "$dir")
  wants "$cname" || continue
  n=$((n + 1))
  rm -rf "$tmp/case"
  mkdir "$tmp/case" || exit 2
  cp -R "$dir/before/agent_plans" "$tmp/case/" || exit 2
  plan=""
  for p in "$tmp"/case/agent_plans/*/; do plan=${p%/}; done
  cp "$target" "$plan/task.sh" || exit 2
  run_task "$plan" "$dir/args"
  rc=$?
  ok=1
  expected=$(cat "$dir/exit")
  if [ "$rc" != "$expected" ]; then fail "$cname" "exited with $rc, expected $expected"; ok=0; fi
  if [ -n "$(find "$plan" -name '.lock-*' -prune)" ]; then fail "$cname" "a .lock-* was left in the plan folder"; ok=0; fi
  rm -rf "$plan"/.lock-*
  rm -f "$plan/task.sh"
  if [ -d "$dir/after" ]; then tree="$dir/after/agent_plans"; else tree="$dir/before/agent_plans"; fi
  if ! diff -r "$tree" "$tmp/case/agent_plans" > "$tmp/diff" 2>&1; then
    fail "$cname" "the plan differs from the expected (--- expected, +++ got)"
    sed 's/^/        /' "$tmp/diff"
    ok=0
  fi
  if [ -f "$dir/stderr" ] && [ "$(cat "$tmp/stderr")" != "$(cat "$dir/stderr")" ]; then
    fail "$cname" "stderr \"$(cat "$tmp/stderr")\", expected \"$(cat "$dir/stderr")\""
    ok=0
  fi
  if [ -f "$dir/preview.json" ]; then
    if ! jq -S . "$tmp/stdout" > "$tmp/a.json" 2>/dev/null; then
      fail "$cname" "stdout is not JSON"
      ok=0
    else
      jq -S . "$dir/preview.json" > "$tmp/b.json" || exit 2
      if ! cmp -s "$tmp/a.json" "$tmp/b.json"; then
        fail "$cname" "the preview differs (--- expected, +++ got)"
        diff -u "$tmp/b.json" "$tmp/a.json" | sed 's/^/        /'
        ok=0
      fi
    fi
  fi
  [ "$ok" = 0 ] || echo "  ok    $cname"
done

# The reasons table, on a single-task plan.
if wants reasons; then
  total=$(jq '.reasons | length' "$here/reasons.json") || exit 2
  i=0
  bad=0
  while [ "$i" -lt "$total" ]; do
    input=$(jq -r ".reasons[$i].input" "$here/reasons.json")
    valid=$(jq -r ".reasons[$i].valid" "$here/reasons.json")
    written=$(jq -r ".reasons[$i].written // empty" "$here/reasons.json")
    rm -rf "$tmp/m" "$tmp/m0" "$tmp/m1"
    mkdir -p "$tmp/m/phase-1-a" || exit 2
    printf '{"contract": 1, "name": "m", "source": null, "created": "2026-11-15T09:00Z", "language": "x-test"}\n' > "$tmp/m/plan.json"
    printf 'Status: ready\nType: code\n\n# F1-01 - Only\n\n## Log\n' > "$tmp/m/phase-1-a/F1-01-only.md"
    cp -R "$tmp/m" "$tmp/m0" || exit 2
    cp "$target" "$tmp/m/task.sh" || exit 2
    sh "$tmp/m/task.sh" cancel F1-01 --reason "$input" > "$tmp/stdout" 2> "$tmp/stderr"
    rc=$?
    rm -f "$tmp/m/task.sh"
    if [ "$valid" = true ]; then
      # The whole tree, byte for byte: only the task changes, with the status and the log line.
      cp -R "$tmp/m0" "$tmp/m1" || exit 2
      printf 'Status: cancelled\nType: code\n\n# F1-01 - Only\n\n## Log\n\n- x-test:task.logCancel %s\n' "$written" > "$tmp/m1/phase-1-a/F1-01-only.md"
      if [ "$rc" != 0 ] || ! diff -r "$tmp/m1" "$tmp/m" > "$tmp/diff" 2>&1; then
        fail "reasons" "\"$input\" should be accepted and written as \"$written\" (exited with $rc; --- expected, +++ got)"
        sed 's/^/        /' "$tmp/diff"
        bad=$((bad + 1))
      fi
    else
      if [ "$rc" != 1 ] || [ "$(cat "$tmp/stderr")" != "x-test:task.invalidReason" ]; then
        fail "reasons" "\"$input\" should be refused with x-test:task.invalidReason (exited with $rc: \"$(cat "$tmp/stderr")\")"
        bad=$((bad + 1))
      elif ! diff -r "$tmp/m0" "$tmp/m" > "$tmp/diff" 2>&1; then
        fail "reasons" "\"$input\" was refused but the plan changed (--- before, +++ after)"
        sed 's/^/        /' "$tmp/diff"
        bad=$((bad + 1))
      fi
    fi
    i=$((i + 1))
  done
  n=$((n + 1))
  [ "$bad" -gt 0 ] || echo "  ok    reasons ($total reasons)"
fi

[ "$n" -gt 0 ] || { echo "edit.sh: no case found" >&2; exit 2; }
if [ "$failures" -eq 0 ]; then echo "edits: $n case(s), all good"; else echo "edits: $failures failure(s) in $n case(s)"; exit 1; fi
