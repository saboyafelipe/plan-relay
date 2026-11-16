#!/bin/sh
# Proves tools/build.sh on a copy of core/, of the adapter agents/claude-code/ and of the build
# itself, in a temporary directory: the generated tree (expected files, mode 644, no test file),
# --check (0 when up to date, 1 after touching core/, with an extra file or a mode change), the
# refusal with different # scripts_version: stamps, the {{AGENT_…}} placeholders the build fills
# with the adapter values (agent.conf), the adapter scripts (agent-scripts/) next to those of
# core/scripts/, COMMANDS.md at the package root with no validation scenario, and the worker agent
# in agents/. It also checks that core/ does not contain the word "claude" and that a refusal
# leaves the package as it was, with no temporary folder in dist/. The English package
# dist/claude-code-en/, with the files of agents/claude-code/en/ on top, the template in both
# languages in both packages, the refusal of a file in en/ without a pair and --check of both.
# Each package's language written into the scripts and no pt-BR text outside comments in the en
# package scripts (no-pt-in-en.sh, with a string planted on purpose to prove it flags it).
# Usage, from any folder: sh tools/tests/build.sh
# Exits 0 with "all good" when everything passes. The real tree does not change.

here=$(cd "$(dirname "$0")" && pwd) || exit 2
root=$(dirname "$(dirname "$here")")
# shellcheck source=tools/tests/lib.sh
. "$here/lib.sh"
suite_start tools/tests/build.sh 600

r="$tmp/repo"
mkdir -p "$r/agents/claude-code" "$r/tools" || exit 1
cp -R "$root/core" "$r/core" || exit 1
cp -R "$root/agents/claude-code/.claude-plugin" "$root/agents/claude-code/agents" "$root/agents/claude-code/hooks" "$root/agents/claude-code/skills" "$root/agents/claude-code/agent-scripts" "$root/agents/claude-code/agent.conf" "$root/agents/claude-code/COMMANDS.md" "$root/agents/claude-code/en" "$r/agents/claude-code/" || exit 1
cp "$root/tools/build.sh" "$root/tools/script-strings.sh" "$r/tools/" || exit 1
build="$r/tools/build.sh"
pkg="$r/dist/claude-code"

tree() { (cd "$pkg" && find . -type f | sed 's|^\./||' | LC_ALL=C sort | tr '\n' ' '); }
# same_but_language <folder a> <folder b>: 0 when the files of a exist in b and differ only
# in the scripts' language='…' line and in the plugin name (plan-relay-pt-br, plan-relay)
# shellcheck disable=SC2317,SC2329 # called through exit_of, which shellcheck does not follow (0.9 says SC2317, 0.11 says SC2329)
same_but_language() {
  (cd "$1" && find . -type f) | while IFS= read -r f; do
    [ -f "$2/$f" ] || exit 1
    [ "$(sed -e "s/^language='[^']*'\$/language=/" -e 's/plan-relay-pt-br/plan-relay/g' "$1/$f")" = "$(sed -e "s/^language='[^']*'\$/language=/" -e 's/plan-relay-pt-br/plan-relay/g' "$2/$f")" ] || exit 1
  done
}
# A refusal does not touch the package. snapshot keeps the current package; intact <case>
# checks that it is still the same and that no temporary folder was left in dist/.
snapshot() { rm -rf "$tmp/before" && cp -R "$pkg" "$tmp/before"; }
leftovers() { (cd "$r/dist" && find . -mindepth 1 -maxdepth 1 ! -name claude-code ! -name claude-code-en | wc -l | tr -d ' '); }
intact() {
  check "$1: the package stays as before (diff -r)" "$(exit_of diff -r "$tmp/before" "$pkg")" "0"
  check "$1: no temporary folder left in dist/" "$(leftovers)" "0"
}

printf '%s\n' "tools/build.sh"
check "build on a copy exits 0" "$(exit_of sh "$build")" "0"
check "good build: no temporary folder left in dist/" "$(leftovers)" "0"
expected=".claude-plugin/icon.png .claude-plugin/plugin.json COMMANDS.md agents/worker.md hooks/hooks.json scripts/boundary.sh scripts/check-agent.sh scripts/check.sh scripts/context-hook.sh scripts/idea.sh scripts/plugin-path.sh scripts/summary.sh scripts/window.sh skills/check/SKILL.md skills/handoff/SKILL.md skills/idea/SKILL.md skills/map/SKILL.md skills/plan/SKILL.md skills/refine/SKILL.md skills/run/JOURNAL.md skills/run/LOOP.md skills/run/OPTIONAL.md skills/run/SKILL.md skills/run/WORKER.md template/PHASE.md template/README.md template/_template.md template/copy.sh template/en/PHASE.md template/en/README.md template/en/_template.md template/en/idea.md template/en/map.sh template/en/status.sh template/en/task.sh template/idea.md template/map.sh template/profile.sh template/selftest.sh template/status.sh template/task.sh "
check "generated tree: the adapter + core/template + core/scripts + agent-scripts" "$(tree)" "$expected"
check "no tests/ or testes/ folder nor validation scenario (scenario-*, cenario-*) in the package" "$(cd "$pkg" && find . -name tests -o -name testes -o -iname 'scenario*' -o -iname 'scenario*' | wc -l | tr -d ' ')" "0"
# The map skill scenario lives with the suites; none goes back into the skills.
check "no validation scenario in agents/claude-code/skills/" "$(find "$root/agents/claude-code/skills/" -iname 'scenario*' | wc -l | tr -d ' ')" "0"
check "package COMMANDS.md equal to the adapter's" "$(exit_of cmp "$r/agents/claude-code/COMMANDS.md" "$pkg/COMMANDS.md")" "0"
check "every package file in mode 644 (the scripts run with sh)" "$(find "$pkg" -type f ! -perm 644 | wc -l | tr -d ' ')" "0"
check "package icon.png equal to the adapter's, byte for byte" "$(exit_of cmp "$r/agents/claude-code/.claude-plugin/icon.png" "$pkg/.claude-plugin/icon.png")" "0"
check "package status.sh equal to core/template's" "$(exit_of cmp "$r/core/template/status.sh" "$pkg/template/status.sh")" "0"
# The example plan carries copies of the three plan scripts: they are the template's, byte for byte.
for s in status.sh task.sh map.sh; do
  check "example $s equal to core/template's, byte for byte" "$(exit_of cmp "$root/core/template/$s" "$root/fixtures/demo-project/agent_plans/site-de-receitas/$s")" "0"
done
check "skill file without a placeholder: package equal to the adapter" "$(exit_of cmp "$r/agents/claude-code/skills/run/JOURNAL.md" "$pkg/skills/run/JOURNAL.md")" "0"
check "skill with a placeholder: package with the agent.conf value and the pt-BR plugin name" "$(grep -c "/plan-relay-pt-br:plan <nome> <ID>" "$pkg/skills/handoff/SKILL.md")" "1"
check "building again gives the same tree" "$(sh "$build" >/dev/null 2>&1; tree)" "$expected"
check "adapter script in the package equal to agent-scripts/'s" "$(exit_of cmp "$r/agents/claude-code/agent-scripts/plugin-path.sh" "$pkg/scripts/plugin-path.sh")" "0"
# The worker agent of the run skill goes into the package, with the six tools and nothing else.
sed 's|{{AGENT_PLUGIN_SKILL_PREFIX}}|/plan-relay-pt-br:|g' "$r/agents/claude-code/agents/worker.md" > "$tmp/worker-pt.md"
check "package agents/worker.md is the adapter's with the pt-BR prefix" "$(exit_of cmp "$tmp/worker-pt.md" "$pkg/agents/worker.md")" "0"
check "agents/worker.md with name: worker" "$(sed -n '2,/^---$/p' "$pkg/agents/worker.md" | grep -cx 'name: worker')" "1"
check "agents/worker.md with tools: Read, Edit, Write, Bash, Grep, Glob" "$(sed -n '2,/^---$/p' "$pkg/agents/worker.md" | grep -cx 'tools: Read, Edit, Write, Bash, Grep, Glob')" "1"
check "agents/worker.md without model: (inherited)" "$(sed -n '2,/^---$/p' "$pkg/agents/worker.md" | grep -c '^model:')" "0"

printf '%s\n' "English package"
en="$r/dist/claude-code-en"
tree_en() { (cd "$en" && find . -type f | sed 's|^\./||' | LC_ALL=C sort | tr '\n' ' '); }
check "dist/claude-code-en/ with the same tree as pt-BR" "$(tree_en)" "$expected"
# The plugin description is the first text `claude plugin` shows: the English package carries its own,
# and the rest of the manifest (name, version, author) stays the pt-BR one.
desc() { sed -n 's/^ *"description": *"\(.*\)",*$/\1/p' "$1"; }
name_of() { sed -n 's/^ *"name": *"\([^"]*\)".*/\1/p' "$1" | sed -n 1p; }
check "en: plugin.json description is not the pt-BR one" "$([ -n "$(desc "$en/.claude-plugin/plugin.json")" ] && [ "$(desc "$en/.claude-plugin/plugin.json")" != "$(desc "$pkg/.claude-plugin/plugin.json")" ] && echo english)" "english"
check "en: plugin.json equal to pt-BR's except the description and the name" "$([ "$(grep -v -e '"description"' -e '"name": "plan-relay' "$en/.claude-plugin/plugin.json")" = "$(grep -v -e '"description"' -e '"name": "plan-relay' "$pkg/.claude-plugin/plugin.json")" ] && echo same)" "same"
# Each package has its own plugin name: the marketplace serves English as plan-relay and pt-BR
# as plan-relay-pt-br, and the skill prefix follows the name.
check "en: plugin name plan-relay" "$(name_of "$en/.claude-plugin/plugin.json")" "plan-relay"
check "pt-BR: plugin name plan-relay-pt-br" "$(name_of "$pkg/.claude-plugin/plugin.json")" "plan-relay-pt-br"
check "no {{PLUGIN_NAME}} left in the packages" "$(grep -rl '{{PLUGIN_NAME}}' "$pkg" "$en" | wc -l | tr -d ' ')" "0"
check "en: skills cite /plan-relay:, never the pt-BR prefix" "$(grep -rl '/plan-relay:' "$en/skills" | wc -l | tr -d ' ' | sed 's/^[1-9][0-9]*$/yes/')$(grep -rl 'plan-relay-pt-br' "$en" | wc -l | tr -d ' ')" "yes0"
check "pt-BR: skills cite /plan-relay-pt-br:, never the English prefix" "$(grep -rl '/plan-relay-pt-br:' "$pkg/skills" | wc -l | tr -d ' ' | sed 's/^[1-9][0-9]*$/yes/')$(grep -rl '/plan-relay:' "$pkg" | wc -l | tr -d ' ')" "yes0"
check "run launches the worker agent of its own package" "$(grep -c 'subagent_type: plan-relay-pt-br:worker' "$pkg/skills/run/SKILL.md")$(grep -c 'subagent_type: plan-relay:worker' "$en/skills/run/SKILL.md")" "11"
check "context-hook.sh points at the handoff skill of its own package" "$(grep -c '/plan-relay-pt-br:handoff' "$pkg/scripts/context-hook.sh" | sed 's/^[1-9][0-9]*$/yes/')$(grep -c '/plan-relay:handoff' "$en/scripts/context-hook.sh" | sed 's/^[1-9][0-9]*$/yes/')" "yesyes"
check "en: template/ equal to pt-BR's, except the scripts' language (the template goes in both languages into both)" "$(exit_of same_but_language "$pkg/template" "$en/template")" "0"
check "en: scripts/ equal to pt-BR's, except the language" "$(exit_of same_but_language "$pkg/scripts" "$en/scripts")" "0"
# {{PACKAGE_LANGUAGE}} becomes each package's language in the plugin scripts.
check "pt-BR: nine scripts with language='pt-BR' (check-agent.sh uses check.sh's)" "$(grep -lx "language='pt-BR'" "$pkg"/scripts/*.sh "$pkg"/template/*.sh | wc -l | tr -d ' ')" "9"
check "en: nine scripts with language='en'" "$(grep -lx "language='en'" "$en"/scripts/*.sh "$en"/template/*.sh | wc -l | tr -d ' ')" "9"
check "no {{PACKAGE_LANGUAGE}} left in the packages" "$(grep -rl '{{PACKAGE_LANGUAGE}}' "$pkg" "$en" | wc -l | tr -d ' ')" "0"
check "en: no pt-BR text outside comments in the scripts (no-pt-in-en.sh)" "$(exit_of sh "$here/no-pt-in-en.sh" "$en")" "0"
printf '%s\n' 'printf "%s\n" "Nada a fazer: tudo em dia."' >> "$r/core/scripts/check.sh"
sh "$build" >/dev/null 2>&1
check "pt-BR text planted in a script: no-pt-in-en.sh exits 1" "$(exit_of sh "$here/no-pt-in-en.sh" "$en")" "1"
check "the finding names the script and the line" "$(sh "$here/no-pt-in-en.sh" "$en" | grep -c '^scripts/check.sh:[0-9]*: .*Nada a fazer')" "1"
cp "$root/core/scripts/check.sh" "$r/core/scripts/check.sh"
sh "$build" >/dev/null 2>&1
# A plan carries the table of its language and the English fallback (and x-test, for selftest.sh):
# template/en/ has the scripts of an English plan, without the pt-BR table.
for s in status.sh task.sh map.sh; do
  check "template/en/$s without the pt-BR table, template/$s with it" "$(grep -c '^  pt-BR) MSG_TABLE=' "$pkg/template/en/$s") $(grep -c '^  pt-BR) MSG_TABLE=' "$pkg/template/$s")" "0 1"
  check "template/en/$s with the x-test table and the English fallback" "$(grep -c -e '^  x-test) MSG_TABLE=' -e '^  \*) MSG_TABLE=' "$pkg/template/en/$s")" "2"
done
cp "$en/template/status.sh" "$en/template/en/status.sh"
check "the pt-BR status.sh in template/en/: no-pt-in-en.sh exits 1" "$(exit_of sh "$here/no-pt-in-en.sh" "$en")" "1"
sh "$build" >/dev/null 2>&1
# Placeholders: a Portuguese <placeholder> in an English skill, a Portuguese {{MARKER}} in any template.
# shellcheck disable=SC2016 # the backticks are Markdown code, written as is
printf 'Run `sh <plugin>/x.sh <modelo>`.\n' >> "$en/skills/handoff/SKILL.md"
printf '{{CAMINHO}}\n' >> "$en/template/README.md"
check "pt-BR placeholders planted in the Markdown: no-pt-in-en.sh exits 1" "$(exit_of sh "$here/no-pt-in-en.sh" "$en")" "1"
check "the findings name the skill and the template" "$(sh "$here/no-pt-in-en.sh" "$en" | grep -c -e '^skills/handoff/SKILL.md:[0-9]*: .*<modelo>' -e '^template/README.md:[0-9]*: {{CAMINHO}}')" "2"
sh "$build" >/dev/null 2>&1
check "en: hooks/ and .claude-plugin/ equal to pt-BR's, except plugin.json" "$(exit_of diff -r "$pkg/hooks" "$en/hooks")$(exit_of diff -r -x plugin.json "$pkg/.claude-plugin" "$en/.claude-plugin")" "00"
for f in COMMANDS.md agents/worker.md skills/run/WORKER.md; do
  if [ -f "$r/agents/claude-code/en/$f" ] && ! grep -q '{{AGENT_' "$r/agents/claude-code/en/$f"; then
    check "en: package $f equal to agents/claude-code/en/'s" "$(exit_of cmp "$r/agents/claude-code/en/$f" "$en/$f")" "0"
  fi
done
check "en: no {{AGENT_ left" "$(grep -rl '{{AGENT_' "$en" | wc -l | tr -d ' ')" "0"
check "en: skills/plan/SKILL.md with name: plan" "$(grep -c '^name: plan$' "$en/skills/plan/SKILL.md")" "1"
snapshot
mkdir -p "$r/agents/claude-code/en/skills/extra"
printf 'x\n' > "$r/agents/claude-code/en/skills/extra/SKILL.md"
check "file in en/ without a pt-BR pair: build exits 1" "$(exit_of sh "$build")" "1"
check "the refusal names the file without a pair" "$(sh "$build" 2>&1 | grep -c 'skills/extra/SKILL.md')" "1"
intact "file without a pair"
rm -r "$r/agents/claude-code/en/skills/extra"
# A swap that fails after the first package was swapped puts it back: both packages stay as they were.
# The core/ change is what makes the first package differ, so a swap that is not undone shows.
rm -rf "$tmp/before-both" && mkdir "$tmp/before-both" && cp -R "$r/dist/claude-code" "$r/dist/claude-code-en" "$tmp/before-both/"
printf '\nSwap marker.\n' >> "$r/core/template/PHASE.md"
check "a swap that fails after the first one: build exits 1" "$(exit_of env BUILD_TEST_FAIL_SWAP=2 sh "$build")" "1"
check "the first swap is undone: both packages as before (diff -r)" "$(exit_of diff -r "$tmp/before-both" "$r/dist")" "0"
check "the failed swap leaves no temporary folder in dist/" "$(leftovers)" "0"
cp "$root/core/template/PHASE.md" "$r/core/template/PHASE.md"

printf '%s\n' "neutral core/ and {{AGENT_…}} placeholders"
# Regular files only: a run's temporary links (outside git) do not count.
check "core/ does not contain the word claude" "$(find "$root/core" -type f -exec grep -il claude {} + | sed "s|$root/||")" ""
check "core/template/README.md uses {{AGENT_…}} placeholders" "$(grep -l '{{AGENT_' "$root/core/template/README.md" | wc -l | tr -d ' ')" "1"
check "core/template without ENTRADA.md (single plan skill)" "$(test -e "$root/core/template/ENTRADA.md" && printf yes || printf no)" "no"
check "no {{AGENT_ left in the package" "$(grep -rl '{{AGENT_' "$pkg" | wc -l | tr -d ' ')" "0"
check "package template/README.md with the Claude Code invocation" "$(grep -c '/plan-relay-pt-br:map`' "$pkg/template/README.md")" "1"
check "package template/README.md starts with the plan skill" "$(grep -c '/plan-relay-pt-br:plan {{PLAN_NAME}}' "$pkg/template/README.md" | sed 's/^[1-9][0-9]*$/yes/')" "yes"
check "en package template/README.md with the English plugin name" "$(grep -c '/plan-relay:map`' "$r/dist/claude-code-en/template/README.md")" "1"
check "package skills/plan/SKILL.md with name: plan" "$(grep -c '^name: plan$' "$pkg/skills/plan/SKILL.md")" "1"
check "package skills/plan/SKILL.md with the question tool" "$(grep -c 'AskUserQuestion' "$pkg/skills/plan/SKILL.md" | sed 's/^[1-9][0-9]*$/yes/')" "yes"
check "plan placeholders ({{PLAN_NAME}}, {{PLAN_PATH}}) are left for map" "$(grep -c '{{PLAN_PATH}}' "$pkg/template/README.md" | sed 's/^[1-9][0-9]*$/yes/')" "yes"
snapshot
printf 'Text {{AGENT_NOTHING}}.\n' >> "$r/core/template/PHASE.md"
check "placeholder with no value in agent.conf: build exits 1" "$(exit_of sh "$build")" "1"
check "the refusal names the placeholder" "$(sh "$build" 2>&1 | grep -c 'AGENT_NOTHING')" "1"
intact "placeholder with no value"
cp "$root/core/template/PHASE.md" "$r/core/template/PHASE.md"
rm -f "$r/core/scripts/window.sh"
cp "$r/agents/claude-code/agent-scripts/window.sh" "$r/core/scripts/window.sh"
check "script with the same name in core/scripts and agent-scripts: build exits 1" "$(exit_of sh "$build")" "1"
intact "repeated script"
rm "$r/core/scripts/window.sh"
sh "$build" >/dev/null 2>&1

printf '%s\n' "tools/build.sh --check"
check "--check right after the build exits 0" "$(exit_of sh "$build" --check)" "0"
printf '# change\n' >> "$r/core/scripts/check.sh"
check "--check after changing core/scripts/check.sh exits 1" "$(exit_of sh "$build" --check)" "1"
check "--check names the out-of-date file" "$(sh "$build" --check 2>&1 | grep -c 'dist/claude-code/scripts/check.sh')" "1"
check "--check names the out-of-date file in the English package too" "$(sh "$build" --check 2>&1 | grep -c 'dist/claude-code-en/scripts/check.sh')" "1"
check "--check does not rewrite the package" "$(exit_of cmp "$r/core/scripts/check.sh" "$pkg/scripts/check.sh")" "1"
sh "$build" >/dev/null 2>&1
check "build after the change: --check is back to 0" "$(exit_of sh "$build" --check)" "0"
printf 'x\n' > "$r/agents/claude-code/skills/handoff/SKILL.md"
check "--check after changing an adapter skill exits 1" "$(exit_of sh "$build" --check)" "1"
sh "$build" >/dev/null 2>&1
printf 'x\n' > "$r/agents/claude-code/en/COMMANDS.md"
check "--check after changing a file in en/ exits 1" "$(exit_of sh "$build" --check)" "1"
check "--check names the English package" "$(sh "$build" --check 2>&1 | grep -c 'dist/claude-code-en/ is out of date')" "1"
check "--check: the pt-BR package is still up to date" "$(sh "$build" --check 2>&1 | grep -c 'dist/claude-code/ up to date')" "1"
cp "$root/agents/claude-code/en/COMMANDS.md" "$r/agents/claude-code/en/COMMANDS.md"
sh "$build" >/dev/null 2>&1
printf 'x\n' > "$pkg/extra.txt"
check "--check with one file too many in the package exits 1" "$(exit_of sh "$build" --check)" "1"
sh "$build" >/dev/null 2>&1
check "build removes the extra file" "$(test -e "$pkg/extra.txt" && printf yes || printf no)" "no"
rm "$pkg/template/map.sh"
check "--check with one file too few in the package exits 1" "$(exit_of sh "$build" --check)" "1"
sh "$build" >/dev/null 2>&1
chmod 755 "$pkg/template/status.sh"
check "--check with the execute bit on a package file exits 1" "$(exit_of sh "$build" --check)" "1"
sh "$build" >/dev/null 2>&1

printf '%s\n' "# scripts_version: stamps"
snapshot
sed 's/^# scripts_version: .*/# scripts_version: 999/' "$r/core/template/task.sh" > "$tmp/task.sh" && cp "$tmp/task.sh" "$r/core/template/task.sh"
check "different stamps in core/template: build exits 1" "$(exit_of sh "$build")" "1"
check "the refusal says which stamp differs" "$(sh "$build" 2>&1 | grep -c 'task.sh')" "1"
check "the refusal does not touch the package" "$(grep -c '^# scripts_version: 999' "$pkg/template/task.sh")" "0"
intact "different stamps"
check "different stamps: --check exits 1 too" "$(exit_of sh "$build" --check)" "1"

printf '%s\n' "usage"
check "unknown option exits 2" "$(exit_of sh "$build" --nothing)" "2"
check "two arguments exit 2" "$(exit_of sh "$build" --check --check)" "2"

suite_end
