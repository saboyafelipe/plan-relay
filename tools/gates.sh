#!/bin/sh
# Runs every CI gate, in order, from the "CI gates" list of docs/development.md: the same list
# .github/workflows/ci.yml runs (tools/tests/gates.sh keeps the two equal and reads the list).
# Run it after npm ci --ignore-scripts, from a clean tree, before a pull request.
#
# Each gate runs from the repository root with its output in a log; this prints one line per gate,
# with the seconds it took:
#   ok       <command> (<n> s)
#   FAILED   <command> (<n> s)    followed by the last lines of its output
#   skipped  <command> (missing <tool>: <how to get it>)
# A tool the list needs and the machine lacks:
#   - shellcheck, actionlint, zizmor, lychee: fetched with tools/ci-tools.sh, at the versions it pins
#     and checked by sha256, into a temporary folder removed at the end; nothing is installed. When
#     the download fails (offline, an unsupported platform), the gates that need it are skipped.
#   - xvfb-run (the integration run, for a display on Linux): on macOS, or with a display already set,
#     the command runs without it; otherwise the gate is skipped.
#   - anything else (claude, for example): the gate is skipped, with how to install it.
#
# Usage: sh tools/gates.sh [--allow-skip] [--guide <file>] [<repository folder>]
#   --allow-skip  a skipped gate does not fail the run (every skip is still listed with its reason)
#   --guide       read the list from <file> instead of <repository folder>/docs/development.md
# Exits 0 when every gate passed (or was skipped, with --allow-skip), 1 when one failed or was
# skipped, 2 on bad usage or when the tree is not ready (no node_modules for the npm gates).

here=$(cd "$(dirname "$0")" && pwd) || exit 2
allow_skip=0
guide=
root=
while [ $# -gt 0 ]; do
  case $1 in
    --allow-skip) allow_skip=1 ;;
    --guide)
      [ $# -ge 2 ] || { echo "gates.sh: --guide needs a file" >&2; exit 2; }
      guide=$2
      shift ;;
    -*) echo "usage: sh tools/gates.sh [--allow-skip] [--guide <file>] [<repository folder>]" >&2; exit 2 ;;
    *) root=$1 ;;
  esac
  shift
done
[ -n "$root" ] || root=$(git -C "$here" rev-parse --show-toplevel 2>/dev/null) || root=$(pwd)
[ -n "$guide" ] || guide=$root/docs/development.md
[ -f "$guide" ] || { echo "gates.sh: no guide at $guide" >&2; exit 2; }

list=$(sh "$here/tests/gates.sh" --list "$guide") || exit 2
[ -n "$list" ] || { echo "gates.sh: no \"### CI gates\" list with a sh block in $guide" >&2; exit 2; }
if printf '%s\n' "$list" | grep -Eq '^npm (run|test)' && [ ! -d "$root/node_modules" ]; then
  echo "gates.sh: no node_modules in $root; run npm ci --ignore-scripts first" >&2
  exit 2
fi

tmp=$(mktemp -d "${TMPDIR:-/tmp}/gates.XXXXXX") || exit 2
trap 'rm -rf "$tmp"' EXIT
mkdir "$tmp/bin" "$tmp/log" || exit 2
PATH=$tmp/bin:$PATH
export PATH

# tool <command>: the tool a gate needs that is not a POSIX shell, or nothing.
tool() {
  case $1 in
    "sh tools/tests/shellcheck.sh"*) echo shellcheck ;;
    "sh tools/tests/links.sh"*) echo lychee ;;
    "sh "*) ;;
    *) echo "${1%% *}" ;;
  esac
}

# hint <tool>: how to get a missing tool.
hint() {
  case $1 in
    shellcheck | actionlint | zizmor | lychee)
      echo "sh tools/ci-tools.sh <folder> $1 could not fetch it; put <folder> on PATH, or install $1" ;;
    claude) echo "install Claude Code and put claude on PATH" ;;
    xvfb-run) echo "install xvfb (apt-get install xvfb), or set DISPLAY" ;;
    npm) echo "install Node.js, at the version in .nvmrc" ;;
    *) echo "install it and put it on PATH" ;;
  esac
}

# have <tool>: true when the tool is on PATH, fetching the ones tools/ci-tools.sh pins.
have() {
  command -v "$1" >/dev/null 2>&1 && return 0
  case $1 in
    shellcheck | actionlint | zizmor | lychee)
      [ -e "$tmp/tried-$1" ] && return 1
      : > "$tmp/tried-$1"
      echo "fetching $1 with tools/ci-tools.sh"
      sh "$here/ci-tools.sh" "$tmp/bin" "$1" > "$tmp/log/fetch-$1" 2>&1 || {
        sed 's/^/    /' "$tmp/log/fetch-$1"
        return 1
      }
      command -v "$1" >/dev/null 2>&1 ;;
    *) return 1 ;;
  esac
}

ok=0 failed=0 skipped=0 n=0
tab=$(printf '\t')
# The list goes through a file, not a pipe, so the counters stay in this shell.
printf '%s\n' "$list" > "$tmp/list"
while IFS= read -r gate; do
  n=$((n + 1))
  cmd=$gate
  need=$(tool "$gate")
  if [ "$need" = xvfb-run ] && ! have xvfb-run; then
    if [ "$(uname -s)" = Darwin ] || [ -n "${DISPLAY:-}${WAYLAND_DISPLAY:-}" ]; then
      cmd=$(printf '%s\n' "$gate" | sed 's/^xvfb-run\( -[^ ]*\)* //')
      need=$(tool "$cmd")
    fi
  fi
  if [ -n "$need" ] && ! have "$need"; then
    printf '%-8s %s (missing %s: %s)\n' skipped "$gate" "$need" "$(hint "$need")"
    skipped=$((skipped + 1))
    continue
  fi
  log=$tmp/log/$n
  start=$(date +%s)
  if (cd "$root" && sh -c "$cmd") > "$log" 2>&1 < /dev/null; then
    note=
    [ "$cmd" = "$gate" ] || note=", run as: $cmd"
    printf '%-8s %s (%s s%s)\n' ok "$gate" "$(($(date +%s) - start))" "$note"
    ok=$((ok + 1))
  else
    printf '%-8s %s (%s s)\n' FAILED "$gate" "$(($(date +%s) - start))"
    tail -n 20 "$log" | sed "s/^/    /;s/$tab/ /g"
    failed=$((failed + 1))
  fi
done < "$tmp/list"

printf '%s\n' "gates: $ok ok, $failed failed, $skipped skipped, of $n"
[ "$failed" -eq 0 ] || exit 1
if [ "$skipped" -gt 0 ] && [ "$allow_skip" -eq 0 ]; then
  echo "gates: a skipped gate is not a pass; install what it needs, or accept the skips with --allow-skip"
  exit 1
fi
exit 0
