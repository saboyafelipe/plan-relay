#!/bin/sh
# Runs shellcheck on every versioned .sh in a repository (the ones git knows).
# Usage: sh tools/tests/shellcheck.sh [--self-test] [<repository folder>]
#   <repository folder>  defaults to the repository this script is in.
#   --self-test          proves the gate instead of running it: in a temporary repository, a script
#                        with an unquoted variable (SC2086) must make the gate exit 1, and a clean
#                        one must pass. Exits 0 when both hold, 1 when the gate stayed green on the
#                        bad file (a wrong path or an empty file list would do that).
# Exits 0 with no findings, 1 with findings and 2 without git or without shellcheck.
# Every "# shellcheck disable=SCxxxx" in the scripts carries its reason on the same line.

self=$0
if [ "$1" = "--self-test" ]; then selftest=1; shift; fi
command -v shellcheck >/dev/null 2>&1 || { echo "shellcheck.sh: shellcheck not found" >&2; exit 2; }

if [ -n "$selftest" ]; then
  command -v git >/dev/null 2>&1 || { echo "shellcheck.sh: git not found" >&2; exit 2; }
  dir=$(mktemp -d) || exit 2
  trap 'rm -rf "$dir"' EXIT
  mkdir "$dir/bad" "$dir/good" || exit 2
  # shellcheck disable=SC2016 # the planted script must hold the literal $1
  printf '#!/bin/sh\necho $1\n' > "$dir/bad/bad.sh"
  # shellcheck disable=SC2016 # the clean script must hold the literal "$1"
  printf '#!/bin/sh\necho "$1"\n' > "$dir/good/good.sh"
  for r in bad good; do
    git -C "$dir/$r" init -q && git -C "$dir/$r" add -- "$r.sh" || exit 2
  done
  sh "$self" "$dir/bad" >/dev/null 2>&1
  rc_bad=$?
  sh "$self" "$dir/good" >/dev/null 2>&1
  rc_good=$?
  if [ "$rc_bad" -ne 1 ]; then echo "shellcheck self-test: FAIL  the planted SC2086 gave exit $rc_bad, expected 1" >&2; exit 1; fi
  if [ "$rc_good" -ne 0 ]; then echo "shellcheck self-test: FAIL  the clean script gave exit $rc_good, expected 0" >&2; exit 1; fi
  echo "shellcheck self-test: the planted SC2086 exits 1, the clean script exits 0"
  exit 0
fi

if [ -n "$1" ]; then
  root=$1
else
  root=$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null) || { echo "shellcheck.sh: not inside a git repository" >&2; exit 2; }
fi
cd "$root" || exit 2

n=$(git ls-files -- '*.sh' | wc -l | tr -d ' ')
# A repository with no .sh would run xargs on nothing and print "no findings": that is no proof.
[ "$n" -gt 0 ] || { echo "shellcheck.sh: no versioned .sh in $root" >&2; exit 2; }
printf '%s\n' "== $(shellcheck --version | sed -n 's/^version: /shellcheck /p'), $n .sh files"
# -x follows the "# shellcheck source=" of the suites into tools/tests/lib.sh (paths from the root).
if git ls-files -z -- '*.sh' | xargs -0 shellcheck -x; then
  echo "shellcheck: no findings"
else
  exit 1
fi
