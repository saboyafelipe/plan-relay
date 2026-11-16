#!/bin/sh
# Tests the scripts of the Claude Code adapter: window.sh and literal-commands.sh; checks that
# no skill cites an agent variable in its body, that the command rule lives only in
# COMMANDS.md and the map scenario outside the skills (the checks on the skill text run on
# skills/ and en/skills/, through language-neutral anchors), that no skill cites a design
# decision number or a task ID outside an example; and runs the suites of context-hook.sh
# (tests/context-hook.sh), of plugin-path.sh (tests/plugin-path.sh) and of the package
# check.sh, core's one with the check-agent.sh next door (tests/check.sh).
# All the state lives in a temporary folder; nothing is read from or written to the real $HOME.
# Usage: sh agents/claude-code/agent-scripts/tests/run.sh
# Needs jq. Never calls claude: a fake claude in PATH records any probe attempt and the test
# fails. Exits 0 and prints "all good" when everything passes.
# shellcheck disable=SC2016 # the literal-commands.sh cases carry literal $, $( ) and backticks

here=$(cd "$(dirname "$0")" && pwd) || exit 2
scripts=$(dirname "$here")
# shellcheck source=tools/tests/lib.sh
. "$here/../../../../tools/tests/lib.sh"
suite_start agents/claude-code/agent-scripts/tests/run.sh 180 jq git
# A new case that forgets HOME or --data lands here, never in the $HOME of whoever runs it;
# nor in the plugin data folder, if the suite runs inside a session.
HOME="$tmp/home"; export HOME
mkdir -p "$HOME"
unset CLAUDE_PLUGIN_DATA XDG_STATE_HOME
# The suite may run in a session without a subscription (Agents window, API key): without
# this, window.sh would answer no-subscription in every case.
unset ANTHROPIC_BASE_URL ANTHROPIC_AUTH_TOKEN ANTHROPIC_API_KEY
# The probe is opt-in: the cases below run with it on; the ones about the default unset it.
PLAN_RELAY_WINDOW=on; export PLAN_RELAY_WINDOW

state_of() { printf '%s\n' "$1" | sed -n 's/.*status=\([a-z-]*\).*/\1/p'; }

# fake claude: any probe leaves a trace in $tmp/probe
mkdir -p "$tmp/bin"
printf '#!/bin/sh\n: > "%s/probe"\nexit 1\n' "$tmp" > "$tmp/bin/claude"
chmod +x "$tmp/bin/claude"
PATH="$tmp/bin:$PATH"; export PATH

now=$(date +%s)
# cache <file> <utilization> <resetsAt>
cache() { mkdir -p "$(dirname "$1")"; printf '{"utilization":%s,"resetsAt":%s}\n' "$2" "$3" > "$1"; }

printf '%s\n' "window.sh"

# 1. CLAUDE_PLUGIN_DATA
d1="$tmp/d1"
cache "$d1/window.json" 0.40 $((now + 3600))
s=$(CLAUDE_PLUGIN_DATA="$d1" sh "$scripts/window.sh" --read 85)
check "variable: 40 % → ok" "$(state_of "$s")" "ok"
check "variable: line with five_hour=40" "$(printf '%s\n' "$s" | sed -n 's/^five_hour=\([0-9]*\) .*/\1/p')" "40"
# age read from the cache mtime: a small number and nothing on stderr (GNU × BSD stat)
s=$(CLAUDE_PLUGIN_DATA="$d1" sh "$scripts/window.sh" --read 85 2>"$tmp/err")
i=$(printf '%s\n' "$s" | sed -n 's/.* age=\([0-9]*\)s .*/\1/p')
check "age of a freshly written cache < 60 s" "$( [ -n "$i" ] && [ "$i" -lt 60 ] && printf yes || printf 'no (%s)' "$s")" "yes"
check "age without an error on stderr" "$(cat "$tmp/err")" ""
cache "$d1/window.json" 0.90 $((now + 3600))
s=$(CLAUDE_PLUGIN_DATA="$d1" sh "$scripts/window.sh" --read 85)
check "variable: 90 % → stop" "$(state_of "$s")" "stop"
s=$(CLAUDE_PLUGIN_DATA="$d1" sh "$scripts/window.sh" --read 95)
check "variable: 90 % with threshold 95 → ok" "$(state_of "$s")" "ok"
cache "$d1/window.json" 0.90 $((now - 10))
s=$(CLAUDE_PLUGIN_DATA="$d1" sh "$scripts/window.sh" --read 85)
check "variable: past reset → renewed" "$(state_of "$s")" "renewed"

# 2. --data, without the variable; --data wins over the variable
d2="$tmp/d2"
cache "$d2/window.json" 0.10 $((now + 3600))
s=$(env -u CLAUDE_PLUGIN_DATA sh "$scripts/window.sh" --read 85 --data "$d2")
check "--data: 10 % → ok" "$(state_of "$s")" "ok"
cache "$d2/window.json" 0.86 $((now + 3600))
s=$(env -u CLAUDE_PLUGIN_DATA sh "$scripts/window.sh" --data "$d2" --read 85)
check "--data before the action: 86 % → stop" "$(state_of "$s")" "stop"
cache "$d2/window.json" 0.86 $((now - 10))
s=$(env -u CLAUDE_PLUGIN_DATA sh "$scripts/window.sh" --read --data "$d2")
check "--data without a threshold: past reset → renewed" "$(state_of "$s")" "renewed"
cache "$d2/window.json" 0.20 $((now + 3600))
s=$(CLAUDE_PLUGIN_DATA="$d1" sh "$scripts/window.sh" --read 85 --data "$d2")
check "--data wins over the variable" "$(state_of "$s")" "ok"

# 3. neither --data nor the variable: the default folder ${XDG_STATE_HOME:-~/.local/state}/plan-relay/
h3="$tmp/h3"
cache "$h3/.local/state/plan-relay/window.json" 0.99 $((now + 3600))
s=$(env -u CLAUDE_PLUGIN_DATA HOME="$h3" sh "$scripts/window.sh" --read 85)
check "default: reads ~/.local/state/plan-relay/window.json" "$(state_of "$s")" "stop"
check "default: nothing in ~/.claude/" "$( [ -e "$h3/.claude" ] && printf yes || printf no)" "no"
x3="$tmp/x3"
cache "$x3/plan-relay/window.json" 0.10 $((now + 3600))
s=$(env -u CLAUDE_PLUGIN_DATA HOME="$h3" XDG_STATE_HOME="$x3" sh "$scripts/window.sh" --read 85)
check "default with XDG_STATE_HOME: reads \$XDG_STATE_HOME/plan-relay/window.json" "$(state_of "$s")" "ok"

# 4. --wait with a past reset does not sleep and clears the cache
cache "$d2/window.json" 0.20 $((now - 120))
s=$(env -u CLAUDE_PLUGIN_DATA sh "$scripts/window.sh" --wait --data "$d2")
check "--wait: past reset → exits and deletes the cache" "$( [ -e "$d2/window.json" ] && printf yes || printf no)" "no"
s=$(env -u CLAUDE_PLUGIN_DATA sh "$scripts/window.sh" --wait --data "$d2" 2>&1); rc=$?
check "--wait without a cache → error" "$rc" "1"

check "no probe fired" "$( [ -e "$tmp/probe" ] && printf yes || printf no)" "no"
check "wrong usage → exit code 1" "$(sh "$scripts/window.sh" --x >/dev/null 2>&1; printf '%s' $?)" "1"
# the old contract is not read: --ler, --esperar, --dados are wrong usage
check "--ler (old) → exit code 1" "$(sh "$scripts/window.sh" --ler 85 --data "$d1" >/dev/null 2>&1; printf '%s' $?)" "1"
check "--esperar (old) → exit code 1" "$(sh "$scripts/window.sh" --esperar --data "$d1" >/dev/null 2>&1; printf '%s' $?)" "1"
check "--dados (old) → exit code 1" "$(sh "$scripts/window.sh" --read 85 --dados "$d1" >/dev/null 2>&1; printf '%s' $?)" "1"
s=$(CLAUDE_PLUGIN_DATA="$d1" sh "$scripts/window.sh" --read 85)
check "line with the new fields only: five_hour= reset= age= status=" "$(printf '%s\n' "$s" | sed 's/=[^ ]*/=/g')" "five_hour= reset= age= status="

# package language: in a copy with x-test, every message comes from the table
mkdir -p "$tmp/package-x"
winx="$tmp/package-x/window.sh"
sed "s/^language='{{PACKAGE_LANGUAGE}}'\$/language='x-test'/" "$scripts/window.sh" > "$winx"
check "the window.sh source has the language marker" "$(grep -cx "language='x-test'" "$winx")" "1"
check "x-test: wrong usage" "$(sh "$winx" --x 2>&1)" "x-test:window.usage"
check "x-test: --wait with the window off" "$(PLAN_RELAY_WINDOW=off sh "$winx" --wait --data "$tmp/dxj")" "x-test:window.off"
check "x-test: --wait without a subscription" "$(ANTHROPIC_API_KEY=x sh "$winx" --wait --data "$tmp/dxj")" "x-test:window.noSubscription"
check "x-test: --wait without a cache" "$(env -u CLAUDE_PLUGIN_DATA sh "$winx" --wait --data "$tmp/dxj" 2>&1)" "x-test:window.noReset"

# 5. probes with a fake claude of their own: <dir>/claude leaves a trace in <dir>/called
# (the arguments, one per line) and prints <dir>/stream.jsonl, exiting with <dir>/rc (0 if none)
# fake_claude <dir> <stream content> [rc]
fake_claude() {
  mkdir -p "$1"
  printf '%s\n' "$2" > "$1/stream.jsonl"
  printf '#!/bin/sh\nprintf "%%s\\n" "$@" > "%s/called"\ncat "%s/stream.jsonl"\nexit %s\n' "$1" "$1" "${3:-0}" > "$1/claude"
  chmod +x "$1/claude"
}
called() { if [ -e "$1/called" ]; then printf yes; else printf no; fi; }
event='{"type":"rate_limit_event","rate_limit_info":{"unifiedWindows":{"five_hour":{"utilization":0.5,"resetsAt":'$((now + 3600))'}}}}'
end='{"type":"result","subtype":"success","result":"ok"}'

# off: does not probe or read the cache, and --wait does not sleep
c5="$tmp/c5"; fake_claude "$c5" "$event"
d5="$tmp/d5j"; mkdir -p "$d5"
s=$(PATH="$c5:$PATH" PLAN_RELAY_WINDOW=off sh "$scripts/window.sh" --read 85 --data "$d5")
check "PLAN_RELAY_WINDOW=off, no cache → off" "$(state_of "$s")" "off"
check "off: claude is not called" "$(called "$c5")" "no"
cache "$d5/window.json" 0.99 $((now + 3600))
s=$(PATH="$c5:$PATH" PLAN_RELAY_WINDOW=off sh "$scripts/window.sh" --read 85 --data "$d5")
check "PLAN_RELAY_WINDOW=off with the cache at 99 % → off, not stop" "$(state_of "$s")" "off"
s=$(PATH="$c5:$PATH" PLAN_RELAY_WINDOW=off sh "$scripts/window.sh" --wait --data "$d5" 2>&1); rc=$?
check "PLAN_RELAY_WINDOW=off: --wait exits at once, with 0" "$rc" "0"
check "PLAN_RELAY_WINDOW=off: --wait leaves the cache" "$( [ -e "$d5/window.json" ] && printf yes || printf no)" "yes"
check "PLAN_RELAY_WINDOW=off: claude never called" "$(called "$c5")" "no"

# no subscription: with ANTHROPIC_BASE_URL, ANTHROPIC_AUTH_TOKEN or ANTHROPIC_API_KEY in the
# environment, the probe's claude -p would go to another account (in the VS Code Agents
# window, Copilot's proxy): it does not probe, does not read the cache (here at 99 %) and
# --wait does not sleep
for v in ANTHROPIC_BASE_URL ANTHROPIC_AUTH_TOKEN ANTHROPIC_API_KEY; do
  s=$(env "$v=x" PATH="$c5:$PATH" sh "$scripts/window.sh" --read 85 --data "$d5")
  check "$v in the environment → no-subscription, not stop" "$(state_of "$s")" "no-subscription"
  check "$v: line with the fields as «?»" "$(printf '%s\n' "$s" | sed 's/ status=.*//')" "five_hour=? reset=? age=?"
done
s=$(env ANTHROPIC_BASE_URL=http://127.0.0.1:9 PATH="$c5:$PATH" sh "$scripts/window.sh" --wait --data "$d5" 2>&1); rc=$?
check "no subscription: --wait exits at once, with 0" "$rc" "0"
check "no subscription: --wait leaves the cache" "$( [ -e "$d5/window.json" ] && printf yes || printf no)" "yes"
s=$(env ANTHROPIC_BASE_URL=http://127.0.0.1:9 PATH="$c5:$PATH" PLAN_RELAY_WINDOW=off sh "$scripts/window.sh" --read 85 --data "$d5")
check "PLAN_RELAY_WINDOW=off wins over the missing subscription" "$(state_of "$s")" "off"
check "no subscription: claude never called" "$(called "$c5")" "no"

# on and without a cache: the probe runs (the fake claude answers the event); an empty
# variable does not count
rm -f "$d5/window.json"
s=$(env ANTHROPIC_BASE_URL= ANTHROPIC_AUTH_TOKEN= ANTHROPIC_API_KEY= PATH="$c5:$PATH" PLAN_RELAY_WINDOW=on sh "$scripts/window.sh" --read 85 --data "$d5")
check "probe with the event → ok, five_hour=50" "$(state_of "$s") $(printf '%s\n' "$s" | sed -n 's/^five_hour=\([0-9]*\) .*/\1/p')" "ok 50"
# lean probe: no tools, MCP, settings, skills or the agent's system prompt
for a in --tools --strict-mcp-config --setting-sources --disable-slash-commands --no-session-persistence --system-prompt; do
  check "lean probe: $a" "$(grep -cx -- "$a" "$c5/called")" "1"
done
check "probe without --bare (it would lose the subscription login)" "$(grep -cx -- --bare "$c5/called")" "0"
check "probe with the event: claude was called" "$(called "$c5")" "yes"

# the call answers, but without the expected event → unknown-format
c6="$tmp/c6"; fake_claude "$c6" "$end"
d6="$tmp/d6j"; mkdir -p "$d6"
s=$(PATH="$c6:$PATH" sh "$scripts/window.sh" --read 85 --data "$d6")
check "answer without rate_limit_event → unknown-format" "$(state_of "$s")" "unknown-format"
check "unknown-format: writes no cache" "$( [ -e "$d6/window.json" ] && printf yes || printf no)" "no"
c7="$tmp/c7"; fake_claude "$c7" '{"type":"rate_limit_event","rate_limit_info":{"unifiedWindows":{"seven_day":{"utilization":0.1}}}}
'"$end"
s=$(PATH="$c7:$PATH" sh "$scripts/window.sh" --read 85 --data "$d6")
check "event without five_hour → unknown-format" "$(state_of "$s")" "unknown-format"
printf '{"resetsAt":%s}\n' $((now + 3600)) > "$d6/window.json"
s=$(PATH="$c6:$PATH" sh "$scripts/window.sh" --read 85 --data "$d6" 2>"$tmp/err")
check "cache without utilization → unknown-format" "$(state_of "$s")" "unknown-format"
check "cache without utilization: nothing on stderr" "$(cat "$tmp/err")" ""
rm -f "$d6/window.json"

# the call fails → no-data, as before
c8="$tmp/c8"; fake_claude "$c8" "" 1
s=$(PATH="$c8:$PATH" sh "$scripts/window.sh" --read 85 --data "$d6")
check "claude fails → no-data" "$(state_of "$s")" "no-data"
c9="$tmp/c9"; fake_claude "$c9" "$end" 1
s=$(PATH="$c9:$PATH" sh "$scripts/window.sh" --read 85 --data "$d6")
check "claude exits with an error, output without the event → no-data" "$(state_of "$s")" "no-data"
c10="$tmp/c10"; fake_claude "$c10" "$event" 1
s=$(PATH="$c10:$PATH" sh "$scripts/window.sh" --read 85 --data "$d6")
check "claude exits with an error, but the event came → uses the event" "$(state_of "$s")" "ok"
rm -f "$d6/window.json"

# opt-in: without PLAN_RELAY_WINDOW the probe does not run, the cache is not read, and --wait
# does not sleep; anything but on/1/true/yes is off too
d11="$tmp/d11j"; cache "$d11/window.json" 0.99 $((now + 3600))
s=$(env -u PLAN_RELAY_WINDOW PATH="$c5:$PATH" sh "$scripts/window.sh" --read 85 --data "$d11")
check "PLAN_RELAY_WINDOW unset → off, not stop" "$(state_of "$s")" "off"
s=$(PLAN_RELAY_WINDOW=maybe PATH="$c5:$PATH" sh "$scripts/window.sh" --read 85 --data "$d11")
check "PLAN_RELAY_WINDOW=maybe → off" "$(state_of "$s")" "off"
rm -f "$c5/called"
s=$(env -u PLAN_RELAY_WINDOW PATH="$c5:$PATH" sh "$scripts/window.sh" --read 85 --data "$tmp/d11k")
check "PLAN_RELAY_WINDOW unset, no cache → off, no data folder" "$(state_of "$s") $( [ -e "$tmp/d11k" ] && printf yes || printf no)" "off no"
check "PLAN_RELAY_WINDOW unset: claude never called" "$(called "$c5")" "no"
s=$(env -u PLAN_RELAY_WINDOW sh "$scripts/window.sh" --wait --data "$d11" 2>&1); rc=$?
check "PLAN_RELAY_WINDOW unset: --wait exits at once, with 0" "$rc" "0"
for v in on ON 1 true yes; do
  s=$(PLAN_RELAY_WINDOW=$v sh "$scripts/window.sh" --read 85 --data "$d11")
  check "PLAN_RELAY_WINDOW=$v → on (cache read)" "$(state_of "$s")" "stop"
done

# a threshold that is not only digits is wrong usage, not a silent "ok"
check "threshold 85x → usage, exit code 1" "$(sh "$scripts/window.sh" --read 85x --data "$d11" >/dev/null 2>&1; printf '%s' $?)" "1"
check "threshold 85x → prints the usage" "$(sh "$scripts/window.sh" --read 85x --data "$d11" 2>&1 | grep -c Usage)" "1"
check "threshold x85 → exit code 1" "$(sh "$scripts/window.sh" --read x85 --data "$d11" >/dev/null 2>&1; printf '%s' $?)" "1"
check "threshold 8.5 → exit code 1" "$(sh "$scripts/window.sh" --read 8.5 --data "$d11" >/dev/null 2>&1; printf '%s' $?)" "1"

# a claude that never answers: the probe leaves by the timeout, with its own status, and
# does not hold the caller's output open
c12="$tmp/c12"; mkdir -p "$c12"
printf '#!/bin/sh\n: > "%s/called"\nexec sleep 30\n' "$c12" > "$c12/claude"
chmod +x "$c12/claude"
d12j="$tmp/d12j"
t0=$(date +%s)
s=$(PATH="$c12:$PATH" PLAN_RELAY_WINDOW_TIMEOUT=1 sh "$scripts/window.sh" --read 85 --data "$d12j")
t1=$(date +%s)
check "mute claude → status=timeout" "$(state_of "$s")" "timeout"
check "mute claude: the line has the fields as «?»" "$(printf '%s\n' "$s" | sed 's/ status=.*//')" "five_hour=? reset=? age=?"
check "mute claude: back in a few seconds" "$( [ $((t1 - t0)) -lt 10 ] && printf yes || printf 'no (%ss)' $((t1 - t0)))" "yes"
check "mute claude: no cache written" "$( [ -e "$d12j/window.json" ] && printf yes || printf no)" "no"
check "mute claude: no stray files left in the data folder" "$(find "$d12j" -mindepth 1 -maxdepth 1 | wc -l | tr -d ' ')" "0"
check "an invalid timeout falls back to the default (claude still called)" "$(rm -f "$c5/called"; PATH="$c5:$PATH" PLAN_RELAY_WINDOW_TIMEOUT=abc sh "$scripts/window.sh" --read 85 --data "$tmp/d12k" >/dev/null; called "$c5")" "yes"

# resetsAt that is not a number: --read says unknown-format, --wait refuses cleanly
d13="$tmp/d13j"; mkdir -p "$d13"
printf '{"utilization":0.5,"resetsAt":"soon"}\n' > "$d13/window.json"
s=$(sh "$scripts/window.sh" --read 85 --data "$d13" 2>"$tmp/err")
check "resetsAt not numeric: --read → unknown-format" "$(state_of "$s")" "unknown-format"
check "resetsAt not numeric: --read, nothing on stderr" "$(cat "$tmp/err")" ""
s=$(sh "$scripts/window.sh" --wait --data "$d13" 2>&1); rc=$?
check "resetsAt not numeric: --wait → exit code 1" "$rc" "1"
check "resetsAt not numeric: --wait → a clean message, no shell error" "$(printf '%s\n' "$s" | grep -c -e 'too great' -e 'not found' -e 'bad math' -e 'expression')" "0"
check "resetsAt not numeric: --wait → the message says so" "$(printf '%s\n' "$s" | grep -c resetsAt)" "1"
check "resetsAt not numeric: --wait keeps the cache" "$( [ -e "$d13/window.json" ] && printf yes || printf no)" "yes"
check "x-test: --wait with a resetsAt that is not a number" "$(sh "$winx" --wait --data "$d13" 2>&1)" "x-test:window.badReset"

printf '%s\n' "context-hook.sh"
if sh "$here/context-hook.sh" >"$tmp/context-hook.out" 2>&1; then ok "context-hook.sh suite (tests/context-hook.sh)"
else ko "context-hook.sh suite (tests/context-hook.sh):"; sed -n '/FAIL/p' "$tmp/context-hook.out"; fi

printf '%s\n' "plugin-path.sh"
if sh "$here/plugin-path.sh" >"$tmp/plugin-path.out" 2>&1; then ok "plugin-path.sh suite (tests/plugin-path.sh)"
else ko "plugin-path.sh suite (tests/plugin-path.sh):"; sed -n '/FAIL/p' "$tmp/plugin-path.out"; fi

printf '%s\n' "scenarios and agent.conf (once, outside the skill languages)"
adapter=$(dirname "$scripts")
root=$(dirname "$(dirname "$adapter")")
# The map writes no entry skill: ".claude/skills" only shows up in the scenario's failure
# signs (tests/scenario-map.md, outside the skills).
check "the map skill scenario lives with the suites" "$(test -f "$here/scenario-map.md" && printf yes || printf no)" "yes"
# The idea → refine → map script lives with the suites, like the map one, and not in a skill.
check "the idea scenario (idea → refine → map) lives with the suites" "$(test -f "$here/scenario-idea.md" && printf yes || printf no)" "yes"
for n in idea refine map; do
  check "the idea scenario goes through the $n skill" "$(grep -q -E "^> /plan-relay:$n( |\$)" "$here/scenario-idea.md" 2>/dev/null && printf yes || printf no)" "yes"
done
for l in 'Status: mapped' 'Open questions: 0' 'Plan: agent_plans/'; do
  check "the idea scenario shows the final header: $l" "$(grep -q "^$l" "$here/scenario-idea.md" 2>/dev/null && printf yes || printf no)" "yes"
done
# has <file> <text>: yes when some line has the text
has() { grep -c -F -e "$2" "$1" 2>/dev/null | sed 's/^[1-9][0-9]*$/yes/'; }
check "the map scenario checks the Tier: of the ready tasks" "$(has "$here/scenario-map.md" 'Tier:')" "yes"
# the tier → model map belongs to agent.conf
for k in JUNIOR MID SENIOR; do
  check "agent.conf has AGENT_TIER_${k}" "$(grep -c "^AGENT_TIER_${k}=." "$adapter/agent.conf")" "1"
done

# The checks on the skill text: each one anchors on something language-neutral — a literal
# command, a {{…}} marker or <plugin>, a contract key or value, a section number, or a name
# taken from the template README.md of the same language — and runs on skills/ and on
# en/skills/. The few that can only be proven by the sentence come after, one line per
# language, with the reason.

# A cp with its source in the plugin (outside the project) is refused by the permission; the
# template is copied with sh <plugin>/template/copy.sh. copy_from_plugin <folder>: the lines
# that say cp from the plugin or copying by hand from <plugin>/template/. Copying by hand is
# only said through a preposition: one per language, both valid in both folders.
copy_from_plugin() { grep -rn -e 'cp <plugin>' -e 'cp {{PLUGIN}}' -e 'de `<plugin>/template/`' -e 'from `<plugin>/template/`' "$1"; }
# readme_outside_sections <file>: lines that cite the plan's README.md without saying to find
# the sections with grep -n '^## ' (the worker reads the README by sections, never whole).
readme_outside_sections() { grep -n -e '`README.md`' -e '{{FOLDER}}/README.md' "$1" | grep -vc "grep -n '^## '"; }
# step <file> <n>: step n of the "## 2." section of run/SKILL.md, up to the next step
step() { sed -n '/^## 2\. /,/^## 3\. /p' "$1" | sed -n "/^$2\. /,/^$(($2 + 1))\. /p"; }
# model_by_hand <file>: lines with a model name written by hand, instead of the marker
model_by_hand() { grep -c -i -w -e 'haiku' -e 'sonnet' -e 'opus' -e 'fable' "$1"; }
# rule_in <adapter> <files…>: the files that carry the text of the command rule (the list of
# what a command does not have), relative to the language's adapter
rule_in() { a_=$1; shift; grep -l -F '`$VAR`, `$(…)`' "$@" | sed "s|^$a_/||; s|.*/skills-red/|skills/|" | tr '\n' ' '; }
# ZCode leaves the variables literal in the skill body; the path comes through the
# plugin-path.sh hook. no_variables <skills folder>: the lines that cite any of the three
# variables
no_variables() { grep -rn -e 'CLAUDE_SKILL_DIR' -e 'CLAUDE_PLUGIN_ROOT' -e 'CLAUDE_PLUGIN_DATA' "$1"; }
# A placeholder of the skill text (<língua>, <language>, <nome>, <name>…): the word changes
# with the language.
ph='<[^>]*>'

# check_skills <language adapter> <label> <template README.md in the same language>
check_skills() {
  a=$1; l=$2; readme=$3; sk="$1/skills"
  m="$sk/map/SKILL.md"; r="$sk/refine/SKILL.md"; id="$sk/idea/SKILL.md"; ru="$sk/run/SKILL.md"; tr_="$sk/run/WORKER.md"

  printf '%s\n' "skills $l (one plan skill; the skill names)"
  # Real folders only: a temporary symbolic link outside git is not an adapter skill.
  check "$l: the skills are check, handoff, idea, map, plan, refine and run" "$(find "$sk" -mindepth 1 -maxdepth 1 -type d | sed 's|.*/||' | sort | tr '\n' ' ')" "check handoff idea map plan refine run "
  for n in check handoff idea map plan refine run; do
    check "$l: skills/$n/SKILL.md with name: $n" "$(sed -n '2,/^---$/p' "$sk/$n/SKILL.md" 2>/dev/null | grep -c "^name: $n\$")" "1"
  done
  check "$l: no skill cites the old names (mapear, conduzir)" "$(grep -rn -e 'plan-relay:''mapear' -e 'plan-relay:''conduzir' -e 'PREFIX}}''mapear' -e 'PREFIX}}''conduzir' "$sk" | wc -l | tr -d ' ')" "0"
  check "$l: map does not say to write in .claude/skills/" "$(grep -rn '\.claude/skills' "$sk/map" | wc -l | tr -d ' ')" "0"
  check "$l: no scenario* nor cenario* inside the skills" "$(find "$sk" -iname 'scenario*' -o -iname 'cenario*' | wc -l | tr -d ' ')" "0"
  check "$l: map does not cite ENTRADA.md" "$(grep -c 'ENTRADA' "$m")" "0"
  check "$l: no skill says cp from the plugin nor copying by hand from <plugin>/template/" "$(copy_from_plugin "$sk")" ""
  # copy.sh receives the language; profile.sh reads the text from the language folder.
  check "$l: map copies the template with sh <plugin>/template/copy.sh --lang" "$(grep -c "sh <plugin>/template/copy.sh --lang $ph agent_plans/$ph" "$m")" "1"
  check "$l: map generates README.md and PHASE.md from the language's <template>" "$(grep -c "profile.sh $ph $ph/" "$m")" "2"
  # idea copies the idea template and leaves the count to the script, not to the template.
  check "$l: idea copies the template with sh <plugin>/template/copy.sh --lang … idea.md" "$(grep -c "sh <plugin>/template/copy.sh --lang $ph idea.md agent_plans/_ideas/<slug>.md" "$id")" "1"
  check "$l: idea counts with sh <plugin>/scripts/idea.sh sync" "$(grep -c 'sh <plugin>/scripts/idea.sh sync agent_plans/_ideas/<slug>.md' "$id")" "1"
  check "$l: idea cites another skill through the agent.conf prefix" "$(grep -c '{{AGENT_PLUGIN_SKILL_PREFIX}}map' "$id")" "1"
  check "$l: idea without a hand-written /plan-relay:" "$(grep -c '/plan-relay:' "$id")" "0"
  # refine changes the header only through idea.sh, asks through the agent.conf tool and
  # hands off through handoff, without copying its text.
  check "$l: idea points to refine" "$(has "$id" '{{AGENT_PLUGIN_SKILL_PREFIX}}refine')" "yes"
  check "$l: refine moves to refining with idea.sh status" "$(grep -c "sh <plugin>/scripts/idea.sh status $ph refining" "$r" | sed 's/^[1-9][0-9]*$/yes/')" "yes"
  check "$l: refine moves to ready with idea.sh status" "$(grep -c "sh <plugin>/scripts/idea.sh status $ph ready" "$r")" "1"
  check "$l: refine counts with idea.sh sync" "$(grep -c "sh <plugin>/scripts/idea.sh sync $ph" "$r" | sed 's/^[1-9][0-9]*$/yes/')" "yes"
  check "$l: refine asks through {{AGENT_ASK_TOOL}}" "$(has "$r" '{{AGENT_ASK_TOOL}}')" "yes"
  check "$l: refine without the tool name by hand" "$(grep -c 'AskUserQuestion' "$r")" "0"
  check "$l: refine cites handoff through the agent.conf prefix" "$(has "$r" '{{AGENT_PLUGIN_SKILL_PREFIX}}handoff')" "yes"
  check "$l: refine without a hand-written /plan-relay:" "$(grep -c '/plan-relay:' "$r")" "0"
  check "$l: refine refuses a mapped idea" "$(has "$r" 'mapped')" "yes"
  # map accepts an idea as its source, refuses one already mapped, goes on with open,
  # refining and ready (does not refuse over open questions), warns about them and marks the
  # idea mapped through idea.sh.
  check "$l: map marks the idea with idea.sh status … mapped agent_plans/<…>" "$(grep -c "sh <plugin>/scripts/idea.sh status agent_plans/_ideas/<slug>.md mapped agent_plans/$ph" "$m")" "1"
  check "$l: map refuses an idea already mapped and gives the Plan:" "$(grep -c 'Status: mapped.*Plan:' "$m" | sed 's/^[1-9][0-9]*$/yes/')" "yes"
  check "$l: map warns about the open questions and suggests refine" "$(grep -c 'Open questions:.*{{AGENT_PLUGIN_SKILL_PREFIX}}refine' "$m" | sed 's/^[1-9][0-9]*$/yes/')" "yes"
  check "$l: map goes on with the idea open, refining or ready (does not refuse over questions)" "$(grep -c '`open`, `refining`.*`ready`' "$m")" "1"
  rm -rf "$tmp/skills-red"; cp -R "$sk" "$tmp/skills-red"
  printf '\ncp <plugin>/template/status.sh agent_plans/x/\n' >> "$tmp/skills-red/map/SKILL.md"
  check "$l: a cp from the plugin put back in a skill is caught" "$(copy_from_plugin "$tmp/skills-red" | wc -l | tr -d ' ')" "1"
  rm -rf "$tmp/skills-red"

  printf '%s\n' "worker agent $l (run launches the package's worker, not general-purpose)"
  check "$l: the adapter agents/ has only worker.md" "$(find "$a/agents" -type f 2>/dev/null | sed 's|.*/||' | tr '\n' ' ')" "worker.md "
  check "$l: agents/worker.md with only the worker's tools" "$(sed -n '2,/^---$/p' "$a/agents/worker.md" | grep -cx 'tools: Read, Edit, Write, Bash, Grep, Glob')" "1"
  # The exception is the research task, which needs the web: one line only.
  check "$l: skills/run without general-purpose outside the research exception" "$(grep -rn 'general-purpose' "$sk/run" | grep -vc 'research')" "0"
  check "$l: run/SKILL.md sends the research task to general-purpose" "$(grep 'subagent_type: general-purpose' "$ru" | grep -c '`research`')" "1"
  check "$l: run/SKILL.md launches with subagent_type: {{PLUGIN_NAME}}:worker" "$(grep -c 'subagent_type: {{PLUGIN_NAME}}:worker' "$ru")" "1"
  check "$l: run/WORKER.md cites the {{PLUGIN_NAME}}:worker agent" "$(has "$tr_" '{{PLUGIN_NAME}}:worker')" "yes"
  rm -rf "$tmp/skills-red"; cp -R "$sk" "$tmp/skills-red"
  printf '\nDepois `Agent` com `subagent_type: general-purpose`.\n' >> "$tmp/skills-red/run/SKILL.md"
  check "$l: general-purpose put back in run is caught" "$(grep -rn 'general-purpose' "$tmp/skills-red/run" | grep -vc 'research')" "1"
  rm -rf "$tmp/skills-red"

  printf '%s\n' "worker reading $l (README by sections, limited outputs)"
  check "$l: run/WORKER.md only cites the plan's README.md to read it by sections" "$(readme_outside_sections "$tr_")" "0"
  check "$l: run/WORKER.md finds the sections with grep -n '^## '" "$(grep -c "grep -n '^## ' {{FOLDER}}/README.md" "$tr_")" "1"
  # The section names come from the template README.md in both languages: the worker of each
  # package runs a pt-BR or an en plan, and says when to read each section of either.
  sed -n 's/^## //p' "$root/core/template/README.md" "$root/core/template/en/README.md" > "$tmp/sections"
  check "$l: the template README.md files have sections" "$(grep -c . "$tmp/sections" | sed 's/^[1-9][0-9]*$/yes/')" "yes"
  while IFS= read -r s_; do
    check "$l: run/WORKER.md says when to read «${s_}»" "$(has "$tr_" "$s_")" "yes"
  done < "$tmp/sections"
  check "$l: run/WORKER.md limits grep and sed (-l, -c, -m; a short range)" "$(grep -c '`-m <n>`' "$tr_")" "1"
  rm -rf "$tmp/skills-red"; cp -R "$sk" "$tmp/skills-red"
  printf '\n1. `{{FOLDER}}/README.md`.\n' >> "$tmp/skills-red/run/WORKER.md"
  check "$l: README.md cited outside the reading by sections is caught" "$(readme_outside_sections "$tmp/skills-red/run/WORKER.md")" "1"
  rm -rf "$tmp/skills-red"

  printf '%s\n' "task tier $l (whoever details the task writes Tier:, by the criteria of the plan README)"
  # The criteria section is the one that the - **Tier:** line of the template README.md cites.
  tiers=$(sed -n 's/^- \*\*Tier:\*\*.*\[\([^]]*\)\](#.*/\1/p' "$readme")
  check "$l: the template README.md cites the tiers section in the - **Tier:** line" "$( [ -n "$tiers" ] && printf yes || printf no)" "yes"
  check "$l: map/SKILL.md: Tier: in the list of contract keys" "$(grep -F '`Status:`' "$m" | grep -F '`Blocked by:`' | grep -c '`Tier:`')" "1"
  check "$l: map/SKILL.md: Tier: in the tasks line, by the tiers section («${tiers}»)" "$(grep -F -e '- **Tasks:**' "$m" | grep 'Tier:' | grep -c -F "$tiers")" "1"
  check "$l: plan/SKILL.md: branch 4 writes the new task's Tier:, by the tiers section" "$(sed -n '/^## [^ ]* 4 /,$p' "$sk/plan/SKILL.md" | grep 'Tier:' | grep -c -i -F "$tiers" | sed 's/^[1-9][0-9]*$/yes/')" "yes"
  check "$l: run does not write Tier: (the autopilot does not change the field)" "$(grep -rn '`Tier:`' "$sk/run" | wc -l | tr -d ' ')" "0"

  printf '%s\n' "model per tier and escalation $l (the tier → model map belongs to agent.conf)"
  check "$l: step 3 launches with model through the three markers" "$(step "$ru" 3 | grep -o '{{AGENT_TIER_[A-Z]*}}' | sort -u | tr '\n' ' ')" "{{AGENT_TIER_JUNIOR}} {{AGENT_TIER_MID}} {{AGENT_TIER_SENIOR}} "
  check "$l: step 3: without the tier key, senior" "$(step "$ru" 3 | grep -c '{{AGENT_TIER_SENIOR}}`; [^;]*`tier`[^;]*`senior`[);]')" "1"
  check "$l: step 5 relaunches below senior with model: {{AGENT_TIER_SENIOR}} (escalation)" "$(step "$ru" 5 | grep -c '`model: {{AGENT_TIER_SENIOR}}`')" "1"
  check "$l: step 5 cites WAITING-ON-OWNER" "$(step "$ru" 5 | grep -c 'WAITING-ON-OWNER' | sed 's/^[1-9][0-9]*$/yes/')" "yes"
  # The log lines: the tier with the model, and the one-tier escalation with the reason.
  check "$l: log: tier line (<tier> (<model>)) and escalation line (<tier>: <reason> | —)" "$(grep -c -e "^- [^:]*: <tier> ($ph)\$" -e "^- [^:]*: [^<]*<tier>: $ph | —\$" "$sk/run/JOURNAL.md")" "2"
  check "$l: run/SKILL.md without a model name by hand" "$(model_by_hand "$ru")" "0"
  rm -rf "$tmp/skills-red"; cp -R "$sk" "$tmp/skills-red"
  printf '\nTask `mid` → `model: sonnet`.\n' >> "$tmp/skills-red/run/SKILL.md"
  check "$l: a model name by hand in run is caught" "$(model_by_hand "$tmp/skills-red/run/SKILL.md")" "1"
  sed '/^3\. \*\*/,/^4\. \*\*/s/{{AGENT_TIER_[A-Z]*}}//g' "$ru" > "$tmp/skills-red/run/SKILL.md"
  check "$l: step 3 without model is caught" "$(step "$tmp/skills-red/run/SKILL.md" 3 | grep -c '{{AGENT_TIER_')" "0"
  rm -rf "$tmp/skills-red"

  printf '%s\n' "COMMANDS.md $l (the command rule in a single file)"
  check "$l: the text of the rule is only in COMMANDS.md" "$(rule_in "$a" "$a/COMMANDS.md" "$sk"/*/*.md)" "COMMANDS.md "
  for f in check/SKILL.md handoff/SKILL.md idea/SKILL.md map/SKILL.md plan/SKILL.md refine/SKILL.md run/SKILL.md; do
    check "$l: skills/$f cites <plugin>/COMMANDS.md" "$(has "$sk/$f" '<plugin>/COMMANDS.md')" "yes"
  done
  check "$l: skills/run/WORKER.md cites {{PLUGIN}}/COMMANDS.md" "$(grep -c '{{PLUGIN}}/COMMANDS.md' "$tr_")" "1"
  # the red case: the rule put back in a skill is caught
  rm -rf "$tmp/skills-red"; cp -R "$sk" "$tmp/skills-red"
  printf '\nCada comando sem `$VAR`, `$(…)`, crases.\n' >> "$tmp/skills-red/map/SKILL.md"
  check "$l: the rule put back in a skill is caught" "$(rule_in "$a" "$a/COMMANDS.md" "$tmp/skills-red"/*/*.md)" "COMMANDS.md skills/map/SKILL.md "
  rm -rf "$tmp/skills-red"
  literal=0
  for f in "$a/COMMANDS.md" "$sk"/*/*.md; do sh "$here/literal-commands.sh" "$f" >/dev/null 2>&1 || literal=1; done
  check "$l: skills and COMMANDS.md without compound commands (literal-commands.sh)" "$literal" "0"

  printf '%s\n' "skills $l without a variable in the body (the path comes from the plan-relay plugin root: line)"
  check "$l: skills without CLAUDE_SKILL_DIR, CLAUDE_PLUGIN_ROOT or CLAUDE_PLUGIN_DATA" "$(no_variables "$sk")" ""
  # Each SKILL.md that writes <plugin> says where the path comes from and what to do without it.
  # find + grep -l instead of grep -r --include, which BusyBox grep lacks
  find "$sk" -name SKILL.md -exec grep -l '<plugin>' {} + > "$tmp/with-plugin"
  while IFS= read -r f; do
    check "$l: ${f#"$sk"/} explains the plan-relay plugin root: line" "$(has "$f" 'plan-relay plugin root:')" "yes"
  done < "$tmp/with-plugin"
  check "$l: map, run and check use <plugin>" "$(for n in map run check; do grep -q '<plugin>/' "$sk/$n/SKILL.md" && printf '%s ' "$n"; done)" "map run check "
  # the red case: an occurrence put back in a copy makes the test catch it
  rm -rf "$tmp/skills-red"; cp -R "$sk" "$tmp/skills-red"
  printf '\nsh ${CLAUDE_PLUGIN_ROOT}/scripts/check.sh\n' >> "$tmp/skills-red/check/SKILL.md"
  check "$l: a variable put back in a skill is caught" "$(no_variables "$tmp/skills-red" | wc -l | tr -d ' ')" "1"
  rm -rf "$tmp/skills-red"

  printf '%s\n' "skills $l without internal references"
  check "$l: no design decision number nor task ID outside an example" "$(internal_refs "$sk")" ""
  rm -rf "$tmp/skills-red"; cp -R "$sk" "$tmp/skills-red"
  printf '\nOne skill per plan (decision 7), as F3-04 asked.\n' >> "$tmp/skills-red/plan/SKILL.md"
  check "$l: a decision number and a task ID put back in a skill are caught" "$(internal_refs "$tmp/skills-red" | wc -l | tr -d ' ')" "1"
  rm -rf "$tmp/skills-red"
}

# internal_refs <skills folder>: the lines that cite a design decision by number or a task ID
# outside an example. An example is quoted (`…`, «…», "…") or ends in an ellipsis (F1-03…).
internal_refs() {
  grep -rn . "$1" \
    | sed -E -e 's/`[^`]*`//g' -e 's/«[^»]*»//g' -e 's/"[^"]*"//g' -e 's/[A-Z][0-9]+-[0-9]+(\.[0-9]+)*…//g' \
    | grep -E -e 'decis(ão|ion) [0-9]+' -e '(^|[^A-Za-z0-9])[A-Z][0-9]+-[0-9]+(\.[0-9]+)*([^0-9A-Za-z]|$)'
}

check_skills "$adapter" pt-BR "$root/core/template/README.md"
check_skills "$adapter/en" en "$root/core/template/en/README.md"

printf '%s\n' "checks that can only be proven by the sentence (one line per language)"
# "WAITING-ON-OWNER does not escalate" is a negation inside step 5: no key or marker tells it
# from the neighbouring sentence that says to escalate a BLOCKED without an action, and an
# HTML marker in the middle of the step would make the text worse for the agent.
check "pt-BR: step 5: WAITING-ON-OWNER does not escalate" "$(step "$adapter/skills/run/SKILL.md" 5 | grep -c '`WAITING-ON-OWNER` não escala')" "1"
check "en: step 5: WAITING-ON-OWNER does not escalate" "$(step "$adapter/en/skills/run/SKILL.md" 5 | grep -c '`WAITING-ON-OWNER` does not escalate')" "1"

printf '%s\n' "generated folders (dist/claude-code and dist/claude-code-en)"
for g in "$root/dist/claude-code/skills" "$root/dist/claude-code-en/skills"; do
  if [ -d "$g" ]; then
    check "skills of the generated folder (${g#"$root"/}) without the three variables" "$(no_variables "$g")" ""
  fi
done

printf '%s\n' "literal-commands.sh"
check "skills map, plan, run, handoff, check, idea and refine without compound commands" "$(sh "$here/literal-commands.sh" >/dev/null 2>&1; printf '%s' $?)" "0"
m="$tmp/skill.md"
printf '# t\n\nTexto `status=ok|stop` e `sh <plugin>/scripts/a.sh --read 85`.\n\n```json\n{"a": "$(x)"}\n```\n' > "$m"
check "literals, NAME=x output and a json block → passes" "$(sh "$here/literal-commands.sh" "$m" >/dev/null 2>&1; printf '%s' $?)" "0"
# inject <description> <block text> <expected reason>
inject() {
  printf '# t\n\n```sh\n%s\n```\n' "$2" > "$m"
  s=$(sh "$here/literal-commands.sh" "$m"); rc=$?
  check "$1 → fails ($3)" "$rc $(printf '%s\n' "$s" | sed -n '1s/^[^:]*:[0-9]*: \([^:]*\):.*/\1/p')" "1 $3"
}
inject "block with P=x; sh \$P/a.sh" 'P=x; sh $P/a.sh' ";"
inject "block with \$(…)" 'cd "$(git rev-parse --show-toplevel)"' '$( )'
inject "block with a backtick" 'cd `pwd`' "backtick"
inject "block with &&" 'cd /x && pwd' "&&"
inject "block with an assignment" 'P=x sh a.sh' "assignment"
# the plugin variables have no exception: ZCode leaves them literal in the body
inject "block with \${CLAUDE_PLUGIN_ROOT}" 'sh ${CLAUDE_PLUGIN_ROOT}/scripts/a.sh' "variable"
inject "block with \${CLAUDE_PLUGIN_DATA}" 'sh /x/window.sh --data ${CLAUDE_PLUGIN_DATA}' "variable"
inject "block with a variable" 'sh $P/a.sh' "variable"
inject "block with for" 'for f in a b' "for"
printf '# t\n\nCorrer `P=x; sh $P/a.sh`.\n' > "$m"
check "inline with P=x; sh \$P/a.sh → fails" "$(sh "$here/literal-commands.sh" "$m" >/dev/null 2>&1; printf '%s' $?)" "1"

printf '%s\n' "check.sh"
if sh "$here/check.sh" >"$tmp/check.out" 2>&1; then ok "check.sh suite (tests/check.sh)"
else ko "check.sh suite (tests/check.sh):"; sed -n '/FAIL/p' "$tmp/check.out"; fi

suite_end
