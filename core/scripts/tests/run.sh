#!/bin/sh
# Tests boundary.sh and summary.sh, runs the idea.sh suite (tests/idea.sh) and the check.sh suite
# (tests/check.sh, general checks only), and the text of all four in the x-test language. The agent
# scripts (window, context hook, the agent part of check.sh) are tested in the adapter:
# agents/<agent>/agent-scripts/tests/run.sh.
# All state lives in a temporary directory; nothing is read from or written to the real $HOME.
# Usage: sh core/scripts/tests/run.sh
# Needs jq and git. Exits 0 with "all good" when everything passes.

here=$(cd "$(dirname "$0")" && pwd) || exit 2
scripts=$(dirname "$here")
# shellcheck source=tools/tests/lib.sh
. "$here/../../../tools/tests/lib.sh"
suite_start core/scripts/tests/run.sh 120 jq git

HOME="$tmp/home"; export HOME
mkdir -p "$HOME"

printf '%s\n' "boundary.sh"
f="$tmp/plan"
mkdir -p "$f/phase-0-a"
printf 'Status: done\nType: code\n\n# F0-01 - feita\n' > "$f/phase-0-a/F0-01-a.md"
printf 'Status: ready\nType: code\nBlocked by: F0-01\n\n# F0-02 - livre\n' > "$f/phase-0-a/F0-02-b.md"
printf 'Status: ready\nType: decision\nBlocked by: F0-02\n\n# F0-03 - escolha\n' > "$f/phase-0-a/F0-03-c.md"
printf 'Status: draft\nType: code\nBlocked by: F0-03\n\n# F0-04 - depois da escolha\n' > "$f/phase-0-a/F0-04-d.md"
printf 'Status: in-progress\nType: human\n\n# F0-05 — acesso\n' > "$f/phase-0-a/F0-05-e.md"
printf 'Status: cancelled\nType: code\n\n# F0-06 - largada\n' > "$f/phase-0-a/F0-06-f.md"
printf 'Status: abandoned\nType: human\n\n# F0-07 - saiu do plano\n' > "$f/phase-0-a/F0-07-g.md"
# The source scripts speak the fallback language, English: the build writes the package language in.
s=$(sh "$scripts/boundary.sh" "$f")
check "reaches F0-02" "$(printf '%s\n' "$s" | sed -n '2p' | tr -d ' ')" "F0-02"
check "F0-03 is left for the run" "$(printf '%s\n' "$s" | grep -c 'F0-03 *\[decision\] escolha')" "1"
check "F0-04 behind the decision is not reached" "$(printf '%s\n' "$s" | sed -n '1,2p' | grep -c 'F0-04')" "0"
check "title with an em dash is read; owner's human task, in progress" "$(printf '%s\n' "$s" | grep -c 'F0-05 *\[human\] acesso  (in progress)')" "1"
check "in-progress listed as in progress" "$(printf '%s\n' "$s" | sed -n '/^IN PROGRESS/,$p' | grep -c 'F0-05')" "1"
check "cancelled left out of everything" "$(printf '%s\n' "$s" | grep -c 'F0-06')" "0"
check "abandoned (human) left out of everything" "$(printf '%s\n' "$s" | grep -c 'F0-07')" "0"
# the old contract is not read: fase-*/ folders and Estado: headers do not count
g="$tmp/old-plan"
mkdir -p "$g/fase-0-a"
printf 'Estado: pronta\nTipo: codigo\n\n# F0-01 — antiga\n' > "$g/fase-0-a/F0-01-a.md"
check "fase-*/ folder (old) → error, exit 1" "$(sh "$scripts/boundary.sh" "$g" >/dev/null 2>&1; printf '%s' $?)" "1"
mkdir -p "$g/phase-0-a"
printf 'Estado: pronta\nTipo: codigo\n\n# F0-02 — antiga\n' > "$g/phase-0-a/F0-02-a.md"
check "Estado:/Tipo: header (old) → not reached" "$(sh "$scripts/boundary.sh" "$g" | sed -n '2p' | tr -d ' ')" ""

printf '%s\n' "summary.sh"
demo="$(dirname "$(dirname "$scripts")")/fixtures/demo-project/agent_plans/site-de-receitas"
s=$(sh "$scripts/summary.sh" "$demo")
check "summary of the example: valid JSON" "$(printf '%s\n' "$s" | jq -e . >/dev/null 2>&1 && printf yes || printf no)" "yes"
check "same top-level keys as status.sh --json" "$(printf '%s\n' "$s" | jq -c 'keys')" "$(sh "$demo/status.sh" --json | jq -c 'keys')"
check "only in-progress, available and owner, in that order" "$(printf '%s\n' "$s" | jq -r '[.tasks[] | .id + ":" + .group] | join(" ")')" "F0-03:in-progress F1-01:available F1-02:owner"
check "task with the fields of status.sh --json" "$(printf '%s\n' "$s" | jq -c '.tasks[0] | keys')" "$(sh "$demo/status.sh" --json | jq -c '.tasks[0] | keys')"
check "progress and parallel equal to status.sh --json" "$(printf '%s\n' "$s" | jq -c '[.progress, .parallel]')" "$(sh "$demo/status.sh" --json | jq -c '[.progress, .parallel]')"
r="$tmp/summary"
mkdir -p "$r/phase-0-a"
cp "$demo/status.sh" "$r/status.sh"
printf 'Status: ready\nType: code\n\n# F0-01 - um\n' > "$r/phase-0-a/F0-01-a.md"
printf 'Status: ready\nType: code\n\n# F0-02 - dois\n' > "$r/phase-0-a/F0-02-b.md"
printf 'Status: ready\nType: decision\n\n# F0-03 - escolha\n' > "$r/phase-0-a/F0-03-c.md"
printf 'Status: ready\nType: code\nBlocked by: F0-02, F0-03\n\n# F0-04 - depois\n' > "$r/phase-0-a/F0-04-d.md"
printf 'Status: talvez\nType: code\n\n# F0-05 - torta\n' > "$r/phase-0-a/F0-05-e.md"
s=$(sh "$scripts/summary.sh" "$r")
check "available by unblocks, then owner, then invalid" "$(printf '%s\n' "$s" | jq -r '[.tasks[] | .id] | join(" ")')" "F0-02 F0-01 F0-03 F0-05"
check "folder without status.sh → exit 1" "$(sh "$scripts/summary.sh" "$tmp/none" >/dev/null 2>&1; printf '%s' $?)" "1"

# The text comes from the table of the package language. A copy of each script with the
# placeholder replaced by x-test, as the build does with pt-BR and en, proves nothing is hard-coded.
printf '%s\n' "test language (x-test)"
mkdir -p "$tmp/x"
xtest() { sed "s/^language='{{PACKAGE_LANGUAGE}}'\$/language='x-test'/" "$scripts/$1" > "$tmp/x/$1"; }
for s in boundary.sh summary.sh idea.sh check.sh; do xtest "$s"; done
check "the source has the language placeholder in all four" "$(grep -lx "language='x-test'" "$tmp"/x/*.sh | wc -l | tr -d ' ')" "4"
s=$(sh "$tmp/x/boundary.sh" "$f")
check "boundary.sh: the summary in x-test" "$(printf '%s\n' "$s" | sed -n 1p)" "x-test:boundary.reaches 1 0"
check "boundary.sh: the four titles in x-test" "$(printf '%s\n' "$s" | grep -c -E '^x-test:boundary\.(freeNow|freeDuringRun|behindOwner|inProgressTitle)$')" "4"
check "boundary.sh: in progress in x-test" "$(printf '%s\n' "$s" | grep -c 'F0-05 *\[human\] acesso  x-test:boundary.inProgress$')" "1"
check "boundary.sh: usage in x-test" "$(sh "$tmp/x/boundary.sh" "$tmp/none" 2>&1)" "x-test:boundary.usage"
mkdir -p "$tmp/empty"
check "boundary.sh: no tasks in x-test" "$(sh "$tmp/x/boundary.sh" "$tmp/empty" 2>&1 | sed 's/ .*//')" "x-test:boundary.noTask"
check "summary.sh: usage in x-test" "$(sh "$tmp/x/summary.sh" "$tmp/none" 2>&1)" "x-test:summary.usage"
check "idea.sh: usage in x-test" "$(sh "$tmp/x/idea.sh" 2>&1)" "x-test:idea.usage"
check "idea.sh: missing file in x-test" "$(sh "$tmp/x/idea.sh" count "$tmp/none.md" 2>&1)" "x-test:idea.notFound $tmp/none.md"
printf 'Status: open\n\n# Ideia\n' > "$tmp/idea.md"
check "idea.sh: status outside the contract in x-test" "$(sh "$tmp/x/idea.sh" status "$tmp/idea.md" talvez 2>&1)" "x-test:idea.invalidState talvez"
check "idea.sh: no marker in x-test" "$(sh "$tmp/x/idea.sh" count "$tmp/idea.md" 2>&1)" "x-test:idea.noMarker $tmp/idea.md"
check "check.sh: usage in x-test" "$(sh "$tmp/x/check.sh" --x 2>&1)" "x-test:check.usage"
c=$(sh "$tmp/x/check.sh")
check "check.sh: role of the git line in x-test" "$(printf '%s\n' "$c" | grep -c '^  ok  *git  *x-test:check.optional ')" "1"
check "check.sh: verdict in x-test" "$(printf '%s\n' "$c" | grep -c -E '^x-test:check\.(allGood|missing)$')" "1"
check "check.sh --json: the detail in x-test, the keys unchanged" "$(sh "$tmp/x/check.sh" --json | jq -r '.checks[] | select(.id == "shell") | .detail' | sed 's/ .*//')" "x-test:check.shellPosix"

printf '%s\n' "idea.sh"
if sh "$here/idea.sh" >"$tmp/idea.out" 2>&1; then ok "idea.sh suite (tests/idea.sh)"
else ko "idea.sh suite (tests/idea.sh):"; sed -n '/FAIL/p' "$tmp/idea.out"; fi

printf '%s\n' "check.sh"
if sh "$here/check.sh" >"$tmp/check.out" 2>&1; then ok "check.sh suite (tests/check.sh)"
else ko "check.sh suite (tests/check.sh):"; sed -n '/FAIL/p' "$tmp/check.out"; fi

suite_end
