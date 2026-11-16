#!/bin/sh
# Checks that the commands cited in the skills are literal: one command per Bash call, with
# nothing that the permission mode cannot check before running it.
# Usage: sh agents/claude-code/agent-scripts/tests/literal-commands.sh [file.md ...]
# Without arguments, checks COMMANDS.md and the skills of the agents/claude-code/ adapter
# (map, plan, run, handoff, check, idea and refine).
#
# A command is a line of a fenced block without a language or in sh/bash/shell/zsh, or an
# inline code span that starts with a known command or with a NAME= assignment followed by a
# command (NAME=x alone is output, not a command).
# A command cannot have $( , a backtick, ; , && , for , a NAME= assignment nor a $NAME or
# ${NAME} variable. That includes ${CLAUDE_PLUGIN_ROOT}, ${CLAUDE_PLUGIN_DATA} and
# ${CLAUDE_SKILL_DIR}: ZCode leaves them literal in the body; the plugin path is written
# <plugin> (the "plan-relay plugin root:" line of the context).
# Exits 0 with no findings; with 1 and one "file:line: reason: command" line per finding.

here=$(cd "$(dirname "$0")" && pwd) || exit 1
plugin=$(dirname "$(dirname "$here")")
if [ "$#" -eq 0 ]; then
  set -- "$plugin/COMMANDS.md" "$plugin/skills/map/SKILL.md" "$plugin/skills/plan/SKILL.md" "$plugin/skills/run/SKILL.md" "$plugin/skills/run/WORKER.md" "$plugin/skills/handoff/SKILL.md" "$plugin/skills/check/SKILL.md" "$plugin/skills/idea/SKILL.md" "$plugin/skills/refine/SKILL.md"
fi

awk '
function reason(c,   s) {
  s = c
  if (index(s, "$(")) return "$( )"
  if (fenced && index(s, "`")) return "backtick"
  if (index(s, "&&")) return "&&"
  if (index(s, ";")) return ";"
  if (s ~ /(^|[ \t|])for[ \t]/) return "for"
  if (s ~ /^[ \t]*[A-Za-z_][A-Za-z0-9_]*=/) return "assignment"
  if (s ~ /\$[{A-Za-z_]/) return "variable"
  return ""
}
function check(c,   m) {
  m = reason(c)
  if (m != "") { printf "%s:%d: %s: %s\n", FILENAME, FNR, m, c; findings++ }
}
FNR == 1 { fence = 0 }
/^[ \t]*```/ {
  if (!fence) {
    lang = $0; sub(/^[ \t]*```[ \t]*/, "", lang); sub(/[ \t].*$/, "", lang)
    fence = 1; shell = (lang == "" || lang ~ /^(sh|bash|shell|zsh)$/)
  } else fence = 0
  next
}
fence { if (shell) { fenced = 1; check($0); fenced = 0 } ; next }
{
  line = $0
  while ((i = index(line, "`")) > 0) {
    rest = substr(line, i + 1)
    j = index(rest, "`")
    if (j == 0) break
    span = substr(rest, 1, j - 1)
    line = substr(rest, j + 1)
    if (span ~ /^(sh|bash|git|claude|ls|cd|cat|jq|date|grep|sed|awk|find|test|echo|printf|env|export|for|while|if)( |$)/ || span ~ /^[A-Za-z_][A-Za-z0-9_]*=[^ \t;]*[ \t;]+[^ \t]/)
      check(span)
  }
}
END { exit findings > 0 }
' "$@"
