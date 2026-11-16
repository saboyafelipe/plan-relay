#!/bin/sh
# Refuses pointers to documents that are not in the repository: a design decision cited by number
# ("decision 43"), a task ID of the private plan ("F8-05"), a spec file ("spec/architecture.md"),
# a section ("P02 §3"), a finding pair ("C2/C7") or the working notes of a plan
# ("agent_plans/<plan>/notes/…", also spec/, research/, prototypes/). After a squash the public repository cannot resolve any of them, so the
# comment keeps the reason and drops the reference.
#
# It scans the tracked files (git ls-files). Exceptions are by path, never by line:
#   - decision/spec/section/finding/plan-folder pointers: no exception, except this suite and the
#     skills test, which plant a pointer on purpose to prove their own red. "spec/decisions.md" is
#     not a pointer: it is where a plan keeps its decisions.
#   - task IDs: allowed where an ID is data, not a pointer: tests and their fixtures (*.test.ts,
#     testing/, tests/), the demo project fixture (fixtures/), the contract and its conformance suite
#     (core/contract/), the plan model whose README and scripts document the ID format
#     (core/template/), the skills (their own test refuses IDs outside an example), the generated
#     dist/ and the integration suite of the extension (hosts/vscode/src/integration/).
#     A pointer to a task inside those paths is not caught: the reviewer is the guard there.
#
# Usage (from the repository root): sh tools/tests/internal-pointers.sh [--self-test] [<repository folder>]
#   --self-test  first proves that each pattern flags a planted pointer in a copy and lets the
#                legitimate text through.
# Prints "<file>:<line>: <text>" per flagged line. Exits 0 with none, 1 with any.

if [ "$1" = "--self-test" ]; then selftest=1; shift; fi
root=$1
[ -n "$root" ] || root=$(git rev-parse --show-toplevel 2>/dev/null) || root=$(pwd)

id_re='(^|[^A-Za-z0-9])F[0-9]+-[0-9]+(\.[0-9]+)*([^0-9]|$)'
other_re='[Dd]ecis(ã|a)o [0-9]+|[Dd]ecision [0-9]+|agent_plans/[a-z0-9][a-z0-9-]*/(spec|notes|research|prototypes)/|spec/[a-z-]+\.md|(^|[^A-Za-z0-9])P[0-9]+ §|(^|[^A-Za-z0-9])C[0-9]+/C[0-9]+'

# id_allowed <path>: the task ID is data here.
id_allowed() {
  case "$1" in
    *.test.ts | */testing/* | */tests/* | fixtures/* | core/contract/* | core/template/* | hosts/vscode/src/integration/*) return 0 ;;
    agents/claude-code/skills/* | agents/claude-code/en/skills/* | dist/*) return 0 ;;
  esac
  return 1
}

# other_allowed <path>: the suites that plant a pointer on purpose.
other_allowed() {
  case "$1" in
    tools/tests/internal-pointers.sh | agents/claude-code/agent-scripts/tests/run.sh) return 0 ;;
  esac
  return 1
}

# scan <folder> <file list>: prints the flagged lines of the listed files (paths relative to the folder).
scan() {
  while IFS= read -r f; do
    [ -f "$1/$f" ] || continue
    if ! other_allowed "$f"; then
      LC_ALL=C sed 's|spec/decisions\.md||g' "$1/$f" | LC_ALL=C grep -nE "$other_re" | sed "s|^|$f:|"
    fi
    if ! id_allowed "$f"; then
      LC_ALL=C grep -InE "$id_re" "$1/$f" | sed "s|^|$f:|"
    fi
  done < "$2"
}

if [ "$selftest" = 1 ]; then
  tmp=$(mktemp -d "${TMPDIR:-/tmp}/pointers.XXXXXX") || exit 1
  mkdir -p "$tmp/src" "$tmp/fixtures"
  printf '%s\n' '# see decision 43' > "$tmp/src/a.sh"
  printf '%s\n' '# veja a decisão 5' > "$tmp/src/b.sh"
  printf '%s\n' '// as F17-06 asked' > "$tmp/src/c.ts"
  printf '%s\n' '// see spec/architecture.md' > "$tmp/src/d.ts"
  printf '%s\n' '// P02 §3 says so' > "$tmp/src/e.ts"
  printf '%s\n' '// C2/C7' > "$tmp/src/f.ts"
  printf '%s\n' '# measured in agent_plans/my-plan/notes/gates.md' > "$tmp/src/g.sh"
  printf '%s\n' '# subtask F1-03.1.2 here' > "$tmp/src/h.sh"
  printf '%s\n' 'a task F1-03 as data' > "$tmp/fixtures/ok.md"
  printf '%s\n' '# the agent_plans/ folder of a project, agent_plans/<name>/, a decision to make, F1 and F-1, XF1-03' > "$tmp/src/ok.sh"
  ( cd "$tmp" && find src fixtures -type f | sort ) > "$tmp.list"
  found=$(scan "$tmp" "$tmp.list")
  rm -rf "$tmp" "$tmp.list"
  rc=0
  for f in a.sh b.sh c.ts d.ts e.ts f.ts g.sh h.sh; do
    case "$found" in
      *"src/$f:"*) ;;
      *) printf '%s\n' "FAIL: the suite does not flag src/$f"; rc=1 ;;
    esac
  done
  for f in fixtures/ok.md src/ok.sh; do
    case "$found" in
      *"$f:"*) printf '%s\n' "FAIL: the suite flags the legitimate $f"; rc=1 ;;
    esac
  done
  [ "$rc" -eq 0 ] || exit 1
  printf '%s\n' "ok: the suite flags each planted pointer and lets the legitimate text through"
fi

list=$(mktemp "${TMPDIR:-/tmp}/pointers-list.XXXXXX") || exit 1
trap 'rm -f "$list"' EXIT
git -C "$root" ls-files > "$list"
findings=$(scan "$root" "$list")

if [ -n "$findings" ]; then
  printf '%s\n' "$findings"
  printf '%s\n' "internal pointers: $(printf '%s\n' "$findings" | wc -l | tr -d ' ') line(s)"
  exit 1
fi
printf '%s\n' "ok: no pointer to a document outside the repository"
