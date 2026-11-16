#!/bin/sh
# Tests core/scripts/check.sh on its own, without an adapter's check-agent.sh: only the
# general checks (jq, git, os, shell). The script runs copied into a temporary folder, with
# a PATH built here holding only the tools each case wants; HOME points to the temporary folder.
# The agent part is tested in the adapter (agents/<agent>/agent-scripts/tests/).
# Usage: sh core/scripts/tests/check.sh
# Needs jq to inspect the JSON (the check.sh under test does not see it) and git, which the
# cases put on their PATH. Exits 0 with "all good" when everything passes.
# shellcheck disable=SC2016  # the fake scripts carry a literal $1

here=$(cd "$(dirname "$0")" && pwd) || exit 2
# shellcheck source=tools/tests/lib.sh
. "$here/../../../tools/tests/lib.sh"
suite_start core/scripts/tests/check.sh 60 jq git
jq=$(command -v jq)

mkdir -p "$tmp/scripts" || exit 2
cp "$(dirname "$here")/check.sh" "$tmp/scripts/check.sh" || exit 2
script="$tmp/scripts/check.sh"

# bin <dir> <tool>…: a PATH directory with links to the real tools
bin() {
  d=$1; shift
  mkdir -p "$d"
  for t in "$@"; do
    r=$(tool_path "$t") || { printf '%s\n' "tool missing for the test: $t" >&2; exit 1; }
    ln -sf "$r" "$d/$t"
  done
}
base() { bin "$1" sh uname sed awk; }

run() { p=$1; shift; env -i HOME="$tmp/home" PATH="$p" sh "$script" "$@" > "$tmp/out" 2>"$tmp/err"; rc=$?; }
field() { "$jq" -r "$1" "$tmp/out" 2>/dev/null; }
status() { field ".checks[] | select(.id == \"$1\") | .status"; }
required() { field ".checks[] | select(.id == \"$1\") | .required"; }
valid() { if "$jq" -e 'has("ok") and has("checks")' "$tmp/out" >/dev/null 2>&1; then printf yes; else printf no; fi; }

printf '%s\n' "check.sh — general checks only"
full="$tmp/full"; base "$full"; bin "$full" jq git
run "$full" --json
check "--json passes jq ." "$(valid)" "yes"
check "exit 0" "$rc" "0"
check "only the general ids, in that order" "$(field '[.checks[].id] | join(" ")')" "jq git os shell"
check "jq ok and required" "$(status jq) $(required jq)" "ok true"
check "every check with the four keys" "$(field '[.checks[] | select((keys | sort) != ["detail","id","required","status"])] | length')" "0"
check "nothing on stderr" "$(cat "$tmp/err")" ""

printf '%s\n' "check.sh — no jq, no git"
nojq="$tmp/nojq"; base "$nojq"; bin "$nojq" git
run "$nojq" --json
check "still returns well-formed JSON" "$(valid)" "yes"
check "exit 1, ok: false" "$rc $(field .ok)" "1 false"
check "jq missing and required" "$(status jq) $(required jq)" "missing true"
nogit="$tmp/nogit"; base "$nogit"; bin "$nogit" jq
run "$nogit" --json
check "git missing and optional, ok stays" "$(status git) $(required git) $(field .ok)" "missing false true"

printf '%s\n' "check.sh — system"
if path_wins uname; then
  win="$tmp/win"; bin "$win" sh sed awk jq git
  printf '#!/bin/sh\ncase "$1" in -r) echo 3.5.0;; *) echo MINGW64_NT-10.0;; esac\n' > "$win/uname"; chmod +x "$win/uname"
  run "$win" --json
  check "Windows with Git Bash → shell ok" "$(status shell)" "ok"
  odd="$tmp/odd"; bin "$odd" sh sed awk jq git
  printf '#!/bin/sh\necho Plan9\n' > "$odd/uname"; chmod +x "$odd/uname"
  run "$odd" --json
  check "unrecognised system → shell warning, ok stays" "$(status shell) $(field .ok)" "warning true"
else
  skip "the system cases" "this sh runs its own uname before the PATH (BusyBox), so a fake uname cannot answer"
fi

printf '%s\n' "check.sh — text"
run "$nojq"
check "without --json: exit 1 when a required tool is missing" "$rc" "1"
check "one line per general check" "$(grep -c -E '^ *(ok|missing|warning|unknown) ' "$tmp/out")" "4"
run "$full"
check "all up to date: exit 0" "$rc" "0"
check "unknown argument → exit 2" "$(env -i PATH="$full" sh "$script" --x >/dev/null 2>&1; printf '%s' $?)" "2"
check "no HOME touched" "$(ls -A "$tmp/home" 2>/dev/null)" ""

suite_end
