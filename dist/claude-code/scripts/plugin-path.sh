#!/bin/sh
# SessionStart and SubagentStart hook of the plan-relay plugin: hands the plugin path to the
# skills as additional context, in the line "plan-relay plugin root: <path>", so that no skill
# depends on ${CLAUDE_PLUGIN_ROOT} being substituted in its body (another agent, ZCode, leaves it
# literal; see ARCHITECTURE.md).
# - SessionStart also runs after a compaction and injects the line again.
# - SubagentStart gives the line to each subagent, which does not inherit the parent's context.
# Runs in every project, not only in those with agent_plans/: the map skill needs the template
# before the plan exists.
# Root: CLAUDE_PLUGIN_ROOT (the agent injects it in the hook), else the folder above this script.
# Only sh, tr and sed: the event comes from stdin through sed and the JSON is written by hand,
# with the path escaped (backslash and double quotes). Always exits 0.

input=$(cat)
line=$(printf '%s' "$input" | tr '\n\r' '  ')
event=$(printf '%s' "$line" | sed -n 's/.*"hook_event_name" *: *"\([^"]*\)".*/\1/p')
case $event in
  SessionStart|SubagentStart) ;;
  *) event=SessionStart ;;
esac

root=${CLAUDE_PLUGIN_ROOT:-}
case "$0" in */*) here=${0%/*} ;; *) here=. ;; esac
[ -n "$root" ] || root=$(cd "$here/.." && pwd) || exit 0

esc=$(printf '%s' "$root" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g')
msg="plan-relay plugin root: $esc (scripts: $esc/scripts, template: $esc/template). Skills of the plan-relay plugin use this absolute path wherever they say <plugin>."

printf '{"hookSpecificOutput":{"hookEventName":"%s","additionalContext":"%s"}}\n' "$event" "$msg"
exit 0
