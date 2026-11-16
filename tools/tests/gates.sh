#!/bin/sh
# The CI gates and their list agree: every command .github/workflows/ci.yml runs is in the
# "CI gates" list of docs/development.md, and every command of that list is run by the workflow.
# The pull request template and CONTRIBUTING point to that list, so it is the one a contributor reads.
#
# The list is the first ```sh block after the "### CI gates" heading: one command per line, as the
# workflow runs it; blank lines, lines starting with # and a " # comment" after a command are ignored.
# The workflow side is every `run:` of ci.yml. A one-line run: must be in the list, unless it is
# setup (installing or printing a tool, not checking the repository):
#   npm ci …, npm install -g …, command -v …, echo …, claude --version
# A block run: (run: |) is setup or wraps a gate; its lines only count for the other direction,
# where a list command must appear inside some run: of the workflow (npm run package, for example,
# runs inside the Package block).
#
# Usage (from the repository root): sh tools/tests/gates.sh [--self-test] [<repository folder>]
#   --self-test  first proves, on copies, that a run: missing from the list and a listed command the
#                workflow does not run are both flagged, and that matching copies pass; then that
#                tools/gates.sh, the runner of the list, reports each gate and fails on a failed or
#                skipped one.
# Prints one line per mismatch. Exits 0 when the two agree, 1 otherwise.
#
#        sh tools/tests/gates.sh --list <guide>
# Prints the commands of the list in <guide>, one per line (what tools/gates.sh runs).

if [ "$1" = "--self-test" ]; then selftest=1; shift; fi
root=$1
[ -n "$root" ] || root=$(git rev-parse --show-toplevel 2>/dev/null) || root=$(pwd)

# runs <workflow>: one line per run:, "1<TAB>command" for a one-line run:, "B<TAB>line" for each
# line of a block run:.
runs() {
  awk '
    function trim(s) { sub(/^[ \t]+/, "", s); sub(/[ \t]+$/, "", s); return s }
    function indent(s) { match(s, /^ */); return RLENGTH }
    block && (trim($0) == "" || indent($0) > depth) { if (trim($0) != "") print "B\t" trim($0); next }
    { block = 0 }
    /^[ \t]*(- )?run:/ {
      value = $0; sub(/^[ \t]*(- )?run:[ \t]*/, "", value); value = trim(value)
      if (value ~ /^[|>][-+]?$/) { block = 1; depth = indent($0); if ($0 ~ /^[ \t]*- /) depth += 2 }
      else print "1\t" value
    }' "$1"
}

# gates <guide>: the commands of the list.
gates() {
  awk '
    /^### CI gates[ \t]*$/ { section = 1; next }
    section && /^#/ && !inside { exit }
    section && !inside && /^```sh[ \t]*$/ { inside = 1; next }
    inside && /^```/ { exit }
    inside {
      line = $0; sub(/[ \t]+#.*$/, "", line); sub(/^[ \t]+/, "", line); sub(/[ \t]+$/, "", line)
      if (line != "" && line !~ /^#/) print line
    }' "$1"
}

# setup <command>: true when a one-line run: only prepares the job.
setup() {
  case "$1" in
    "npm ci" | "npm ci "* | "npm install -g "* | "command -v "* | "echo "* | "claude --version") return 0 ;;
  esac
  return 1
}

# compare <workflow> <guide>: prints the mismatches.
compare() {
  list=$(gates "$2")
  if [ -z "$list" ]; then
    printf '%s\n' "$2: no \"### CI gates\" section with a sh block"
    return
  fi
  all=$(runs "$1")
  tab=$(printf '\t')
  printf '%s\n' "$all" | while IFS="$tab" read -r kind cmd; do
    [ "$kind" = 1 ] || continue
    setup "$cmd" && continue
    printf '%s\n' "$list" | grep -qxF -- "$cmd" || printf '%s\n' "not in the list: $cmd"
  done
  commands=$(printf '%s\n' "$all" | cut -f2-)
  printf '%s\n' "$list" | while IFS= read -r gate; do
    printf '%s\n' "$commands" | grep -qF -- "$gate" || printf '%s\n' "not run by the workflow: $gate"
  done
}

if [ "$1" = "--list" ]; then
  [ -f "$2" ] || { printf '%s\n' "gates.sh: --list needs a guide file" >&2; exit 2; }
  gates "$2"
  exit 0
fi

if [ "$selftest" = 1 ]; then
  tmp=$(mktemp -d "${TMPDIR:-/tmp}/gates.XXXXXX") || exit 1
  cat > "$tmp/ci.yml" <<'EOF'
jobs:
  a:
    steps:
      - run: npm ci --ignore-scripts
      - run: npm test
      - name: Package
        run: |
          if [ "$X" = true ]; then set -- --x; fi
          npm run package -- "$@"
      - run: claude --version
EOF
  cat > "$tmp/ok.md" <<'EOF'
### CI gates

```sh
# a
npm test                 # with a comment
npm run package
```
EOF
  cp "$tmp/ci.yml" "$tmp/extra.yml"
  printf '%s\n' '      - run: sh tools/tests/new.sh' >> "$tmp/extra.yml"
  { cat "$tmp/ok.md"; printf '%s\n' '' '```sh' 'not a gate' '```'; } > "$tmp/later.md"
  awk '{ print } /^npm test / { print "npm run gone" }' "$tmp/ok.md" > "$tmp/gone.md"
  rc=0
  out=$(compare "$tmp/ci.yml" "$tmp/ok.md")
  [ -z "$out" ] || { printf '%s\n' "FAIL: matching copies are flagged: $out"; rc=1; }
  out=$(compare "$tmp/ci.yml" "$tmp/later.md")
  [ -z "$out" ] || { printf '%s\n' "FAIL: a sh block after the list counts: $out"; rc=1; }
  case $(compare "$tmp/extra.yml" "$tmp/ok.md") in
    *"not in the list: sh tools/tests/new.sh"*) ;;
    *) printf '%s\n' "FAIL: a run: missing from the list is not flagged"; rc=1 ;;
  esac
  case $(compare "$tmp/ci.yml" "$tmp/gone.md") in
    *"not run by the workflow: npm run gone"*) ;;
    *) printf '%s\n' "FAIL: a listed command the workflow does not run is not flagged"; rc=1 ;;
  esac
  [ "$(sh "$0" --list "$tmp/ok.md" | tr '\n' ' ')" = "npm test npm run package " ] ||
    { printf '%s\n' "FAIL: --list does not print the commands of the list"; rc=1; }

  # The runner, tools/gates.sh, on planted lists: a gate that passes, one that fails and one whose
  # tool is missing.
  runner=$(dirname "$0")/../gates.sh
  plant() {
    printf '%s\n' '### CI gates' '' '```sh' "$@" '```' > "$tmp/run.md"
  }
  # run_planted <option>...: runs the runner on the planted list; sets out and code.
  run_planted() {
    out=$(sh "$runner" "$@" --guide "$tmp/run.md" "$tmp" 2>&1)
    code=$?
  }
  plant 'true                       # passes' 'false' 'plan-relay-no-such-tool --version'
  run_planted
  [ "$code" -eq 1 ] || { printf '%s\n' "FAIL: a failing gate does not make the runner exit 1 (exit $code)"; rc=1; }
  case $out in
    *"ok       true"*) ;;
    *) printf '%s\n' "FAIL: a passing gate is not reported ok: $out"; rc=1 ;;
  esac
  case $out in
    *"FAILED   false"*) ;;
    *) printf '%s\n' "FAIL: a failing gate is not reported: $out"; rc=1 ;;
  esac
  case $out in
    *"skipped  plan-relay-no-such-tool --version (missing plan-relay-no-such-tool"*) ;;
    *) printf '%s\n' "FAIL: a gate with a missing tool is not reported skipped: $out"; rc=1 ;;
  esac
  plant 'true' 'plan-relay-no-such-tool --version'
  run_planted
  [ "$code" -eq 1 ] || { printf '%s\n' "FAIL: a skipped gate does not make the runner exit 1 (exit $code)"; rc=1; }
  run_planted --allow-skip
  [ "$code" -eq 0 ] || { printf '%s\n' "FAIL: --allow-skip does not accept a skipped gate (exit $code): $out"; rc=1; }
  plant 'true' 'sh -c "exit 0"'
  run_planted
  [ "$code" -eq 0 ] || { printf '%s\n' "FAIL: a list where every gate passes does not exit 0 (exit $code): $out"; rc=1; }
  rm -rf "$tmp"
  [ "$rc" -eq 0 ] || exit 1
  printf '%s\n' "ok: the suite flags a run: missing from the list and a listed command the workflow does not run"
  printf '%s\n' "ok: tools/gates.sh reports each gate and exits 1 on a failed or skipped gate"
fi

found=$(compare "$root/.github/workflows/ci.yml" "$root/docs/development.md")
if [ -n "$found" ]; then
  printf '%s\n' "$found"
  printf '%s\n' "CI gates: $(printf '%s\n' "$found" | wc -l | tr -d ' ') mismatch(es) between ci.yml and docs/development.md"
  exit 1
fi
printf '%s\n' "ok: the CI gates and the list in docs/development.md agree"
