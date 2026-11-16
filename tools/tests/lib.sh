# shellcheck shell=sh
# The harness shared by the sh suites. A suite sources it by a path relative to itself, then
# calls suite_start:
#   here=$(cd "$(dirname "$0")" && pwd) || exit 2
#   # shellcheck source=tools/tests/lib.sh
#   . "$here/../../tools/tests/lib.sh"
#   suite_start <name> <seconds> [tool...]
#   ...cases...
#   suite_end
# Home-made on purpose: the suites run wherever the scripts they test run, with nothing but sh,
# the POSIX tools and the tools they name (docs/development.md, "The sh test harness").
#
#   suite_start <name> <seconds> [tool...]
#       exits 2 with "<name>: needs <tool> on the PATH" when a tool is missing; creates $tmp
#       (removed at exit), sets failures=0 and exports the prelude (TZ=UTC, LC_ALL=C.UTF-8 and
#       HOME=$tmp/home, an empty folder), so no case depends on the machine's time zone, locale or
#       home; starts a watchdog that ends the suite after
#       <seconds>, so a hung case fails the run instead of holding it.
#   ok <case> | ko <case> | check <case> <got> <expected>
#       one line per case; a failure prints the case, what it got and what it expected.
#   skip <case> <why>
#       a case this machine cannot run; printed with the reason, not counted as a failure.
#   tool_path <tool>
#       the file that runs <tool> on the PATH, as an absolute path when the PATH entry is.
#       Unlike command -v, never a builtin's bare name: under a BusyBox sh, command -v cat
#       prints "cat", which is no use to link to or to call from a script with another PATH.
#   path_wins <tool>
#       true when sh runs a <tool> found on the PATH. False under a BusyBox sh built to run its
#       own applets first: a fake <tool> on the PATH never answers there.
#   exit_of <command...>
#       prints the command's exit status, without its output.
#   fresh_plan <plan folder>
#       a new copy of the plan, as $tmp/<new>/agent_plans/<name>; prints its path. A block of
#       cases starts from its own copy, so no case depends on what an earlier block left.
#   deadline <seconds> <pid>
#       waits for a background child; past <seconds> it kills it and returns 124, otherwise it
#       returns the child's exit status.
#   suite_end
#       prints "<name>: all good" and exits 0, or "<name>: N failure(s)" and exits 1.

ok() { printf '  ok    %s\n' "$1"; }
ko() { printf '  FAIL  %s\n' "$1"; failures=$((failures + 1)); }
check() { if [ "$2" = "$3" ]; then ok "$1"; else ko "$1 — got \"$2\", expected \"$3\""; fi; }
exit_of() { "$@" >/dev/null 2>&1; printf '%s' $?; }
skip() { printf '  skip  %s — %s\n' "$1" "$2"; }

tool_path() {
  tool_path_ifs=$IFS
  IFS=:
  for tool_path_dir in $PATH; do
    [ -n "$tool_path_dir" ] || tool_path_dir=.
    if [ -f "$tool_path_dir/$1" ] && [ -x "$tool_path_dir/$1" ]; then
      IFS=$tool_path_ifs
      printf '%s\n' "$tool_path_dir/$1"
      return 0
    fi
  done
  IFS=$tool_path_ifs
  return 1
}

path_wins() {
  path_wins_dir=$(mktemp -d "$tmp/path.XXXXXX") || return 1
  path_wins_sh=$(tool_path sh) || return 1
  ln -s "$path_wins_sh" "$path_wins_dir/sh" || return 1
  printf '#!/bin/sh\necho from-the-path\n' > "$path_wins_dir/$1" && chmod +x "$path_wins_dir/$1" || return 1
  [ "$(env -i PATH="$path_wins_dir" sh -c "$1" 2>/dev/null)" = from-the-path ]
}

suite_start() {
  suite_name=$1
  suite_limit=$2
  shift 2
  for suite_tool do
    command -v "$suite_tool" >/dev/null 2>&1 || {
      printf '%s: needs %s on the PATH\n' "$suite_name" "$suite_tool" >&2
      exit 2
    }
  done
  failures=0
  tmp=$(mktemp -d) || exit 2
  # The prelude: the same time zone, locale and home on every machine, so no case depends on them.
  mkdir "$tmp/home" || exit 2
  TZ=UTC
  LC_ALL=C.UTF-8
  HOME=$tmp/home
  export TZ LC_ALL HOME
  trap 'suite_cleanup' EXIT
  trap 'exit 124' TERM
  suite_pid=$$
  # The watchdog: on time, it stops the suite, which runs its EXIT trap, and the suite's direct
  # children (when pkill exists); a suite that still lives 10 s later gets KILL.
  (
    trap 'kill "$suite_sleep" 2>/dev/null; exit 0' TERM
    sleep "$suite_limit" >/dev/null 2>&1 &
    suite_sleep=$!
    wait "$suite_sleep" || exit 0
    printf '%s: FAIL  timed out after %s s\n' "$suite_name" "$suite_limit" >&2
    # The suite first, so its trap is already pending when the child it waits on dies.
    kill -TERM "$suite_pid" 2>/dev/null
    command -v pkill >/dev/null 2>&1 && pkill -TERM -P "$suite_pid" 2>/dev/null
    sleep 10 >/dev/null 2>&1
    kill -KILL "$suite_pid" 2>/dev/null
    exit 0
  ) </dev/null >/dev/null &
  suite_watchdog=$!
}

suite_cleanup() {
  kill "$suite_watchdog" 2>/dev/null
  rm -rf "$tmp"
}

fresh_plan() {
  fresh_dir=$(mktemp -d "$tmp/plan.XXXXXX") || return 1
  mkdir "$fresh_dir/agent_plans" && cp -R "$1" "$fresh_dir/agent_plans/" || return 1
  printf '%s\n' "$fresh_dir/agent_plans/$(basename "$1")"
}

deadline() {
  rm -f "$tmp/.late.$2"
  (
    trap 'kill "$deadline_sleep" 2>/dev/null; exit 0' TERM
    sleep "$1" >/dev/null 2>&1 &
    deadline_sleep=$!
    wait "$deadline_sleep" || exit 0
    : > "$tmp/.late.$2"
    kill -KILL "$2" 2>/dev/null
  ) </dev/null >/dev/null 2>&1 &
  deadline_watch=$!
  { wait "$2"; deadline_rc=$?; } 2>/dev/null
  kill "$deadline_watch" 2>/dev/null
  { wait "$deadline_watch"; } 2>/dev/null
  if [ -f "$tmp/.late.$2" ]; then rm -f "$tmp/.late.$2"; return 124; fi
  return "$deadline_rc"
}

suite_end() {
  if [ "$failures" -eq 0 ]; then printf '%s: all good\n' "$suite_name"; exit 0; fi
  printf '%s: %s failure(s)\n' "$suite_name" "$failures"
  exit 1
}
