#!/bin/sh
# Tests plugin-path.sh, the SessionStart and SubagentStart hook that hands the skills the
# line "plan-relay plugin root: <path>".
# Usage: sh agents/claude-code/agent-scripts/tests/plugin-path.sh (tests/run.sh runs this suite)
# Needs jq. Exits 0 and prints "all good" when everything passes.

here=$(cd "$(dirname "$0")" && pwd) || exit 2
scripts=$(dirname "$here")
adapter=$(dirname "$scripts")
hook_sh="$scripts/plugin-path.sh"
# shellcheck source=tools/tests/lib.sh
. "$here/../../../../tools/tests/lib.sh"
suite_start agents/claude-code/agent-scripts/tests/plugin-path.sh 60 jq
unset CLAUDE_PLUGIN_ROOT
# event_and_root <output>: "<hookEventName> <root>", read by jq; empty if it is not valid JSON
event_and_root() {
  printf '%s' "$1" | jq -r '.hookSpecificOutput | .hookEventName + " " + (.additionalContext | capture("^plan-relay plugin root: (?<r>.*) \\(scripts: ").r)' 2>/dev/null
}
start='{"session_id":"s1","hook_event_name":"SessionStart","source":"startup","cwd":"/home/dev/project"}'
sub='{"session_id":"s1","hook_event_name":"SubagentStart","agent_id":"a1","agent_type":"general-purpose","cwd":"/home/dev/project"}'

printf '%s\n' "plugin-path.sh"

check "SessionStart with CLAUDE_PLUGIN_ROOT" "$(event_and_root "$(printf '%s\n' "$start" | CLAUDE_PLUGIN_ROOT=/home/dev/plug sh "$hook_sh")")" "SessionStart /home/dev/plug"
check "SubagentStart with CLAUDE_PLUGIN_ROOT" "$(event_and_root "$(printf '%s\n' "$sub" | CLAUDE_PLUGIN_ROOT=/home/dev/plug sh "$hook_sh")")" "SubagentStart /home/dev/plug"
check "without the variable: the folder above the script" "$(event_and_root "$(printf '%s\n' "$start" | sh "$hook_sh")")" "SessionStart $adapter"
check "double quotes, space and backslash in the path" "$(event_and_root "$(printf '%s\n' "$start" | CLAUDE_PLUGIN_ROOT='/home/dev/a "b" c\d' sh "$hook_sh")")" 'SessionStart /home/dev/a "b" c\d'
check "empty stdin → SessionStart" "$(event_and_root "$(printf '' | CLAUDE_PLUGIN_ROOT=/x sh "$hook_sh")")" "SessionStart /x"
check "another event → SessionStart" "$(event_and_root "$(printf '{"hook_event_name":"Stop"}' | CLAUDE_PLUGIN_ROOT=/x sh "$hook_sh")")" "SessionStart /x"
s=$(printf '%s\n' "$start" | CLAUDE_PLUGIN_ROOT=/home/dev/plug sh "$hook_sh" | jq -r '.hookSpecificOutput.additionalContext')
check "the line cites scripts/ and template/" "$s" "plan-relay plugin root: /home/dev/plug (scripts: /home/dev/plug/scripts, template: /home/dev/plug/template). Skills of the plan-relay plugin use this absolute path wherever they say <plugin>."
check "exit code 0" "$(printf '%s\n' "$start" | sh "$hook_sh" >/dev/null 2>&1; printf '%s' $?)" "0"
check "nothing on stderr" "$(printf '%s\n' "$start" | sh "$hook_sh" 2>&1 >/dev/null)" ""

# hooks.json: the script on both events, without a matcher, with the path through the hook variable
h="$adapter/hooks/hooks.json"
for e in SessionStart SubagentStart; do
  check "hooks.json: $e runs plugin-path.sh, without a matcher" "$(jq -r --arg e "$e" '[.hooks[$e][]? | select(has("matcher") | not) | .hooks[] | .command] | map(select(. == "sh \"${CLAUDE_PLUGIN_ROOT}\"/scripts/plugin-path.sh")) | length' "$h")" "1"
done

suite_end
