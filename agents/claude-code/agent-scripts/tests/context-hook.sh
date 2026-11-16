#!/bin/sh
# Tests context-hook.sh, the plugin's PostToolUse hook.
# All the state lives in a temporary folder; nothing is read from or written to the real $HOME.
# Usage: sh agents/claude-code/agent-scripts/tests/context-hook.sh (tests/run.sh runs this suite)
# Needs jq. Exits 0 and prints "all good" when everything passes.

here=$(cd "$(dirname "$0")" && pwd) || exit 2
scripts=$(dirname "$here")
hook_sh="$scripts/context-hook.sh"
# shellcheck source=tools/tests/lib.sh
. "$here/../../../../tools/tests/lib.sh"
suite_start agents/claude-code/agent-scripts/tests/context-hook.sh 120 jq
HOME="$tmp/home"; export HOME
mkdir -p "$HOME"
# the suite may run inside a Claude Code session, which exports these
unset CLAUDE_PLUGIN_DATA CLAUDE_PROJECT_DIR PLAN_RELAY_CONTEXT_LIMIT AGENT_PLANS_LIMITE_CONTEXTO XDG_STATE_HOME

exists() { if [ -e "$1" ]; then printf yes; else printf no; fi; }

printf '%s\n' "context-hook.sh"

session="test-plan-relay-$$"
tr="$tmp/transcript.jsonl"
proj="$tmp/proj"; mkdir -p "$proj/agent_plans" "$proj/sub"
noplan="$tmp/noplan"; mkdir -p "$noplan"
# transcript <total>: one assistant line with a usage that adds up to <total>
transcript() {
  printf '{"type":"user","message":{"content":"x"}}\n' > "$tr"
  printf '{"type":"assistant","message":{"usage":{"input_tokens":%s,"cache_creation_input_tokens":0,"cache_read_input_tokens":0,"output_tokens":5}}}\n' "$1" >> "$tr"
}
# input [cwd] [session]: the JSON that Claude Code sends on the hook's stdin
input() { printf '{"session_id":"%s","transcript_path":"%s","cwd":"%s","hook_event_name":"PostToolUse","tool_name":"Read"}\n' "${2:-$session}" "$tr" "${1:-$proj}"; }
d4="$tmp/d4"
hook() { input | CLAUDE_PLUGIN_DATA="$d4" PLAN_RELAY_CONTEXT_LIMIT=1000 sh "$hook_sh"; }

transcript 500
check "below the warning → silence" "$(hook)" ""
transcript 950
s=$(hook)
check "warning (90 %) → additionalContext" "$(printf '%s\n' "$s" | jq -r '.hookSpecificOutput.hookEventName' 2>/dev/null)" "PostToolUse"
check "warning: mark context-<session>-near" "$(ls "$d4")" "context-$session-near"
check "after the warning above, the same reading again → silence" "$(hook)" ""
transcript 1200
s=$(hook)
msg=$(printf '%s\n' "$s" | jq -r '.hookSpecificOutput.additionalContext' 2>/dev/null)
check "above the limit → one additionalContext" "$(printf '%s\n' "$s" | grep -c additionalContext)" "1"
# the source carries the prefix placeholder; tools/build.sh fills it with each package's plugin name
check "message mentions the run skill through the prefix placeholder" "$(printf '%s\n' "$msg" | grep -c '{{AGENT_PLUGIN_SKILL_PREFIX}}run')" "1"
check "message without the old skill names" "$(printf '%s\n' "$msg" | grep -c -e '/plan-relay:''conduzir' -e '/plan-relay:''mapear')" "0"
check "message mentions the handoff skill through the prefix placeholder" "$(printf '%s\n' "$msg" | grep -c '{{AGENT_PLUGIN_SKILL_PREFIX}}handoff')" "1"
check "message without a personal skill path" "$(printf '%s\n' "$msg" | grep -c 'claude/skills')" "0"
check "message cites the Next step: marker" "$(printf '%s\n' "$msg" | grep -c 'Next step:')" "1"
check "message cites the INTERRUPTED result" "$(printf '%s\n' "$msg" | grep -c 'INTERRUPTED')" "1"
check "message without the old marker or result" "$(printf '%s\n' "$msg" | grep -c -e 'Próximo passo' -e 'INTERROMPIDA')" "0"
check "mark context-<session>-over-0" "$(exists "$d4/context-$session-over-0")" "yes"
check "after the over-limit warning above, the same level again → silence" "$(hook)" ""
transcript 1100
check "after the over-limit warning above, another reading at the same level → silence" "$(hook)" ""
transcript 51200
check "after the over-limit warning above, 50k above → a new level warns" "$(hook | grep -c additionalContext)" "1"
transcript 300
check "back below → silence" "$(hook)" ""

# default limit: fits a 200k window
transcript 140000
s=$(input | CLAUDE_PLUGIN_DATA="$tmp/d5" sh "$hook_sh")
k=$(printf '%s\n' "$s" | jq -r '.hookSpecificOutput.additionalContext' 2>/dev/null | sed -n 's/.* the \([0-9]*\)k limit.*/\1/p')
check "default: 140k → warning" "$(printf '%s\n' "$s" | grep -c additionalContext)" "1"
check "default: limit below 200k" "$( [ -n "$k" ] && [ "$k" -lt 200 ] && printf yes || printf 'no (%s)' "$k")" "yes"
transcript 1200
check "the old AGENT_PLANS_LIMITE_CONTEXTO variable no longer counts" "$(input | CLAUDE_PLUGIN_DATA="$tmp/d5v" AGENT_PLANS_LIMITE_CONTEXTO=1000 sh "$hook_sh")" ""
check "invalid PLAN_RELAY_CONTEXT_LIMIT → default, no error" "$(input | CLAUDE_PLUGIN_DATA="$tmp/d5i" PLAN_RELAY_CONTEXT_LIMIT=abc sh "$hook_sh" 2>&1)" ""

# --data in the hook; and neither --data nor the variable: HOME
transcript 1200
input | PLAN_RELAY_CONTEXT_LIMIT=1000 sh "$hook_sh" --data "$tmp/d6" >/dev/null
check "--data: mark in the given folder" "$(ls "$tmp/d6")" "context-$session-over-0"
input | HOME="$tmp/h6a" PLAN_RELAY_CONTEXT_LIMIT=1000 sh "$hook_sh" --dados "$tmp/d6a" >/dev/null
check "--dados (old) does not count: nothing in the given folder" "$(exists "$tmp/d6a")" "no"
input | HOME="$tmp/h7" PLAN_RELAY_CONTEXT_LIMIT=1000 sh "$hook_sh" >/dev/null
check "default: mark in ~/.local/state/plan-relay/" "$(ls "$tmp/h7/.local/state/plan-relay")" "context-$session-over-0"
check "default: nothing in ~/.claude/" "$(exists "$tmp/h7/.claude")" "no"
input | HOME="$tmp/h7x" XDG_STATE_HOME="$tmp/x7" PLAN_RELAY_CONTEXT_LIMIT=1000 sh "$hook_sh" >/dev/null
check "default with XDG_STATE_HOME: mark in \$XDG_STATE_HOME/plan-relay/" "$(ls "$tmp/x7/plan-relay")" "context-$session-over-0"

# project without agent_plans/: exits at once, with 0, no output and nothing created
transcript 1200
s=$(input "$noplan" | CLAUDE_PLUGIN_DATA="$tmp/d8" PLAN_RELAY_CONTEXT_LIMIT=1000 sh "$hook_sh" 2>&1; printf 'rc=%s' $?)
check "no agent_plans/ → exit code 0 and silence" "$s" "rc=0"
check "no agent_plans/ → no data folder created" "$(exists "$tmp/d8")" "no"
input "$noplan" | HOME="$tmp/h8" PLAN_RELAY_CONTEXT_LIMIT=1000 sh "$hook_sh" >/dev/null
check "no agent_plans/ → nothing created in HOME" "$(exists "$tmp/h8")" "no"
check "no cwd and no CLAUDE_PROJECT_DIR → silence" "$(printf '{"session_id":"%s","transcript_path":"%s"}\n' "$session" "$tr" | CLAUDE_PLUGIN_DATA="$tmp/d8" PLAN_RELAY_CONTEXT_LIMIT=1000 sh "$hook_sh")" ""
s=$(input "$proj/sub" s-sub | CLAUDE_PROJECT_DIR="$proj" CLAUDE_PLUGIN_DATA="$tmp/d8p" PLAN_RELAY_CONTEXT_LIMIT=1000 sh "$hook_sh")
check "cwd in a subfolder, CLAUDE_PROJECT_DIR with agent_plans/ → warns" "$(printf '%s\n' "$s" | grep -c additionalContext)" "1"

# CLAUDE_PROJECT_DIR without agent_plans/: exits before reading the stdin. The input is a
# regular file; a reader that consumed it leaves nothing for the head that follows.
input "$proj" > "$tmp/stdin.json"
s=$({ CLAUDE_PROJECT_DIR="$noplan" CLAUDE_PLUGIN_DATA="$tmp/d8q" PLAN_RELAY_CONTEXT_LIMIT=1000 sh "$hook_sh"; head -c 1; } < "$tmp/stdin.json")
check "CLAUDE_PROJECT_DIR without agent_plans/ → stdin left unread, silence" "$s" "{"
check "CLAUDE_PROJECT_DIR without agent_plans/ → nothing created" "$(exists "$tmp/d8q")" "no"
s=$({ CLAUDE_PROJECT_DIR="$proj" CLAUDE_PLUGIN_DATA="$tmp/d8r" PLAN_RELAY_CONTEXT_LIMIT=1000 sh "$hook_sh"; head -c 1; } < "$tmp/stdin.json")
check "CLAUDE_PROJECT_DIR with agent_plans/ → stdin read, warns" "$(printf '%s\n' "$s" | grep -c additionalContext)" "1"

# session_id is sanitized like the agent key: ../ does not escape <data>, the warning arrives
d17="$tmp/d17"; mkdir -p "$d17"
s=$(input "$proj" '../out/escaped' | CLAUDE_PLUGIN_DATA="$d17/data" PLAN_RELAY_CONTEXT_LIMIT=1000 sh "$hook_sh" 2>&1)
check "session_id with ../ → the warning is delivered" "$(printf '%s\n' "$s" | grep -c additionalContext)" "1"
check "session_id with ../ → nothing outside the data folder" "$(ls "$d17")" "data"
check "session_id with ../ → mark inside the data folder, without / or ." "$(ls "$d17/data")" "context-outescaped-over-0"
mkdir -p "$d17/context-x"
input "$proj" 'x/../../out/escaped' | CLAUDE_PLUGIN_DATA="$d17/data2" PLAN_RELAY_CONTEXT_LIMIT=1000 sh "$hook_sh" >/dev/null 2>&1
# shellcheck disable=SC2012 # the case compares ls's sorted listing; every name here is fixed by the test
check "session_id with x/../../ → nothing outside the data folder" "$(ls "$d17" | tr '\n' ' ')" "context-x data data2 "

# usage read by key path: keys in another order, nested objects before them, and the
# last usage of the transcript wins
d18="$tmp/d18"
printf '{"type":"user","message":{"content":"x"}}\n{"type":"assistant","message":{"usage":{"server_tool_use":{"web_search_requests":0},"cache_creation":{"ephemeral_5m_input_tokens":0},"output_tokens":5,"cache_read_input_tokens":1100,"input_tokens":3,"cache_creation_input_tokens":0}}}\n' > "$tr"
check "usage with nested objects before the keys, any order → warns" "$(input "$proj" k-order | CLAUDE_PLUGIN_DATA="$d18" PLAN_RELAY_CONTEXT_LIMIT=1000 sh "$hook_sh" | grep -c additionalContext)" "1"
printf '{"type":"assistant","message":{"usage":{"input_tokens":1,"output_tokens_details":{"input_tokens":9000}}}}\n' > "$tr"
check "a nested input_tokens does not count" "$(input "$proj" k-nested | CLAUDE_PLUGIN_DATA="$d18" PLAN_RELAY_CONTEXT_LIMIT=1000 sh "$hook_sh")" ""
transcript 1200

# JSON on several lines, fields in another order, with escaped decoy keys in tool_response
multi() { printf '{\n  "tool_name": "Read",\n  "cwd" : "%s",\n  "tool_response": {"text": "{\\"session_id\\": \\"decoy\\", \\"cwd\\": \\"/nothing\\"}"},\n  "transcript_path":\n    "%s",\n  "session_id": "%s"\n}\n' "$proj" "$tr" "$1"; }
transcript 1200
multi s-jq | CLAUDE_PLUGIN_DATA="$tmp/d9" PLAN_RELAY_CONTEXT_LIMIT=1000 sh "$hook_sh" >/dev/null
check "JSON on several lines (jq) → session read right" "$(ls "$tmp/d9")" "context-s-jq-over-0"
# a jq that fails, first in PATH, forces the sed fallback
mkdir -p "$tmp/fakejq"
printf '#!/bin/sh\nexit 3\n' > "$tmp/fakejq/jq"
chmod +x "$tmp/fakejq/jq"
s=$(multi s-sed | PATH="$tmp/fakejq:$PATH" CLAUDE_PLUGIN_DATA="$tmp/d10" PLAN_RELAY_CONTEXT_LIMIT=1000 sh "$hook_sh" 2>"$tmp/err")
check "JSON on several lines (sed) → session read right" "$(ls "$tmp/d10")" "context-s-sed-over-0"
check "no working jq → nothing on stderr" "$(cat "$tmp/err")" ""
check "no working jq → the warning comes out as valid JSON" "$(printf '%s\n' "$s" | jq -r '.hookSpecificOutput.hookEventName')" "PostToolUse"
# The same jq, which exits without reading its input, with SIGPIPE ignored (as on some CI
# runners) and a transcript whose last 400 lines exceed a pipe buffer: the writer into the
# pipe is still writing after the reader is gone, every time, and gets EPIPE.
big="$tmp/transcript-big.jsonl"
awk 'BEGIN { s = sprintf("%500s", ""); gsub(/ /, "x", s)
  for (i = 0; i < 400; i++) printf "{\"type\":\"user\",\"message\":{\"content\":\"%s\"}}\n", s }' > "$big"
printf '{"type":"assistant","message":{"usage":{"input_tokens":1200,"cache_creation_input_tokens":0,"cache_read_input_tokens":0,"output_tokens":5}}}\n' >> "$big"
bigin() { printf '{"session_id":"s-epipe","transcript_path":"%s","cwd":"%s"}\n' "$big" "$proj"; }
s=$( (trap '' PIPE; bigin | PATH="$tmp/fakejq:$PATH" CLAUDE_PLUGIN_DATA="$tmp/d10p" PLAN_RELAY_CONTEXT_LIMIT=1000 sh "$hook_sh") 2>"$tmp/err-epipe")
check "jq exits unread, SIGPIPE ignored → nothing on stderr" "$(cat "$tmp/err-epipe")" ""
check "jq exits unread, SIGPIPE ignored → the warning still comes out" "$(printf '%s\n' "$s" | grep -c additionalContext)" "1"
s=$(input "$noplan" | PATH="$tmp/fakejq:$PATH" CLAUDE_PLUGIN_DATA="$tmp/d10s" PLAN_RELAY_CONTEXT_LIMIT=1000 sh "$hook_sh" 2>&1; printf 'rc=%s' $?)
check "no jq and no agent_plans/ → exit code 0 and silence" "$s" "rc=0"

# subagent: same session_id as the conductor, a mark of its own
trs="$tmp/agent-sub1.jsonl"
printf '{"type":"assistant","message":{"usage":{"input_tokens":1200,"cache_creation_input_tokens":0,"cache_read_input_tokens":0,"output_tokens":5}}}\n' > "$trs"
# sub [agent_id]: a subagent's input, with agent_transcript_path and, if given, agent_id
sub() {
  if [ -n "$1" ]; then
    printf '{"session_id":"%s","transcript_path":"%s","agent_transcript_path":"%s","agent_id":"%s","agent_type":"general-purpose","cwd":"%s"}\n' "$session" "$tr" "$trs" "$1" "$proj"
  else
    printf '{"session_id":"%s","transcript_path":"%s","agent_transcript_path":"%s","cwd":"%s"}\n' "$session" "$tr" "$trs" "$proj"
  fi
}
d12="$tmp/d12"
transcript 1200
check "subagent above the limit → warning" "$(sub | CLAUDE_PLUGIN_DATA="$d12" PLAN_RELAY_CONTEXT_LIMIT=1000 sh "$hook_sh" | grep -c additionalContext)" "1"
check "subagent warned, then conductor above the limit → warning" "$(input | CLAUDE_PLUGIN_DATA="$d12" PLAN_RELAY_CONTEXT_LIMIT=1000 sh "$hook_sh" | grep -c additionalContext)" "1"
check "conductor: mark with the usual name" "$(exists "$d12/context-$session-over-0")" "yes"
check "subagent again at the same level → silence" "$(sub | CLAUDE_PLUGIN_DATA="$d12" PLAN_RELAY_CONTEXT_LIMIT=1000 sh "$hook_sh")" ""
check "two marks: conductor and subagent" "$(find "$d12" -name 'context-*' | wc -l | tr -d ' ')" "2"
d13="$tmp/d13"
transcript 1200
input | CLAUDE_PLUGIN_DATA="$d13" PLAN_RELAY_CONTEXT_LIMIT=1000 sh "$hook_sh" >/dev/null
check "conductor warned, then subagent above the limit → warning" "$(sub a1b2 | CLAUDE_PLUGIN_DATA="$d13" PLAN_RELAY_CONTEXT_LIMIT=1000 sh "$hook_sh" | grep -c additionalContext)" "1"
check "with agent_id: the mark key is the agent_id" "$(exists "$d13/context-$session-a1b2-over-0")" "yes"
check "another subagent in the same session → its own warning" "$(sub c3d4 | CLAUDE_PLUGIN_DATA="$d13" PLAN_RELAY_CONTEXT_LIMIT=1000 sh "$hook_sh" | grep -c additionalContext)" "1"
s=$(sub e5f6 | PATH="$tmp/fakejq:$PATH" CLAUDE_PLUGIN_DATA="$d13" PLAN_RELAY_CONTEXT_LIMIT=1000 sh "$hook_sh")
check "no jq: subagent with agent_id → its own mark" "$(exists "$d13/context-$session-e5f6-over-0")" "yes"
d14="$tmp/d14"
s=$(sub '../x y' | CLAUDE_PLUGIN_DATA="$d14" PLAN_RELAY_CONTEXT_LIMIT=1000 sh "$hook_sh")
check "agent_id with / or a space → mark inside <data>, without those characters" "$(ls "$d14")" "context-$session-xy-over-0"

# a subagent's PostToolUse may bring only agent_id (the hooks documentation only guarantees
# agent_transcript_path in SubagentStop): the key is the agent_id, and the transcript is
# <transcript without .jsonl>/subagents/agent-<agent_id>.jsonl
d15="$tmp/d15"
mkdir -p "$tmp/transcript/subagents"
printf '{"type":"assistant","message":{"usage":{"input_tokens":1200,"cache_creation_input_tokens":0,"cache_read_input_tokens":0,"output_tokens":5}}}\n' > "$tmp/transcript/subagents/agent-g7h8.jsonl"
only_id() { printf '{"session_id":"%s","transcript_path":"%s","agent_id":"%s","agent_type":"general-purpose","cwd":"%s"}\n' "$session" "$tr" "$1" "$proj"; }
transcript 300
check "only agent_id: measures the subagent's transcript in subagents/" "$(only_id g7h8 | CLAUDE_PLUGIN_DATA="$d15" PLAN_RELAY_CONTEXT_LIMIT=1000 sh "$hook_sh" | grep -c additionalContext)" "1"
check "only agent_id: mark with the agent_id key" "$(exists "$d15/context-$session-g7h8-over-0")" "yes"
transcript 1200
check "only agent_id, then conductor above the limit → warning" "$(input | CLAUDE_PLUGIN_DATA="$d15" PLAN_RELAY_CONTEXT_LIMIT=1000 sh "$hook_sh" | grep -c additionalContext)" "1"
d16="$tmp/d16"
input | CLAUDE_PLUGIN_DATA="$d16" PLAN_RELAY_CONTEXT_LIMIT=1000 sh "$hook_sh" >/dev/null
check "only agent_id without its own transcript → its own mark anyway" "$(only_id z9 | CLAUDE_PLUGIN_DATA="$d16" PLAN_RELAY_CONTEXT_LIMIT=1000 sh "$hook_sh" | grep -c additionalContext)" "1"

# cleanup: when it writes a mark, it deletes the context-* ones older than 7 days, and only those:
# other files of the data folder stay, whatever their age
d11="$tmp/d11"; mkdir -p "$d11"
: > "$d11/context-old-near"; touch -t 202001010000 "$d11/context-old-near"
: > "$d11/context-recent-near"
: > "$d11/window.json"; touch -t 202001010000 "$d11/window.json"
: > "$d11/contexto-old-aviso"; touch -t 202001010000 "$d11/contexto-old-aviso"
: > "$d11/janela.json"; touch -t 202001010000 "$d11/janela.json"
transcript 1200
input | CLAUDE_PLUGIN_DATA="$d11" PLAN_RELAY_CONTEXT_LIMIT=1000 sh "$hook_sh" >/dev/null
check "mark older than 7 days → removed" "$(exists "$d11/context-old-near")" "no"
check "recent mark → stays" "$(exists "$d11/context-recent-near")" "yes"
check "a file that is not a mark → stays" "$(exists "$d11/window.json")" "yes"
check "an old file with another prefix → stays" "$(exists "$d11/contexto-old-aviso")" "yes"
check "an old json that is not a mark → stays" "$(exists "$d11/janela.json")" "yes"
check "the new mark was written" "$(exists "$d11/context-$session-over-0")" "yes"

# package language: the build replaces the marker; with x-test, the whole warning comes from
# the table, and in en it cites the Baton section of the English run skill
mkdir -p "$tmp/package-x" "$tmp/package-en" "$tmp/package-pt"
sed "s/^language='{{PACKAGE_LANGUAGE}}'\$/language='x-test'/" "$hook_sh" > "$tmp/package-x/context-hook.sh"
sed -e "s/^language='{{PACKAGE_LANGUAGE}}'\$/language='en'/" -e 's|{{AGENT_PLUGIN_SKILL_PREFIX}}|/plan-relay:|g' "$hook_sh" > "$tmp/package-en/context-hook.sh"
sed "s/^language='{{PACKAGE_LANGUAGE}}'\$/language='pt-BR'/" "$hook_sh" > "$tmp/package-pt/context-hook.sh"
check "the context-hook.sh source has the language marker" "$(grep -cx "language='x-test'" "$tmp/package-x/context-hook.sh")" "1"
language_msg() { input | CLAUDE_PLUGIN_DATA="$1" PLAN_RELAY_CONTEXT_LIMIT=1000 sh "$2" | jq -r '.hookSpecificOutput.additionalContext'; }
transcript 950
check "x-test: the near-the-limit warning comes from the table" "$(language_msg "$tmp/dx1" "$tmp/package-x/context-hook.sh" | cut -d' ' -f1)" "x-test:contextHook.near"
transcript 1200
check "x-test: the above-the-limit warning comes from the table" "$(language_msg "$tmp/dx2" "$tmp/package-x/context-hook.sh" | cut -d' ' -f1)" "x-test:contextHook.over"
msg=$(language_msg "$tmp/de1" "$tmp/package-en/context-hook.sh")
check "en: the warning cites the Baton section and /plan-relay:handoff" "$(printf '%s\n' "$msg" | grep -c 'Baton section')$(printf '%s\n' "$msg" | grep -c '/plan-relay:handoff')" "11"
check "en: the warning without Bastão" "$(printf '%s\n' "$msg" | grep -c 'Bastão')" "0"
msg=$(language_msg "$tmp/dp1" "$tmp/package-pt/context-hook.sh")
check "pt-BR: the warning cites the «Bastão» section" "$(printf '%s\n' "$msg" | grep -c '«Bastão»')" "1"
msg=$(language_msg "$tmp/dd1" "$hook_sh")
check "source (no package language): the warning falls back to English" "$(printf '%s\n' "$msg" | grep -c 'Baton section')" "1"

# inputs that do not serve
check "empty stdin → silence" "$(printf '' | CLAUDE_PLUGIN_DATA="$d4" sh "$hook_sh")" ""
check "missing transcript → silence" "$(printf '{"session_id":"x","transcript_path":"%s/nothing","cwd":"%s"}\n' "$tmp" "$proj" | CLAUDE_PLUGIN_DATA="$d4" sh "$hook_sh")" ""
check "stdin that is not JSON → silence, exit code 0" "$(printf 'junk\n' | CLAUDE_PLUGIN_DATA="$d4" sh "$hook_sh" 2>&1; printf 'rc=%s' $?)" "rc=0"

suite_end
