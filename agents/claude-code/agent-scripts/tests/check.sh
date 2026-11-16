#!/bin/sh
# Tests the check.sh of the Claude Code package: core/scripts/check.sh with this adapter's
# check-agent.sh next to it, as tools/build.sh puts them together. Each case runs the script
# with a PATH built here, holding only the tools that the case wants: the real jq, git and
# claude never get in. claude is always fake and returns a fixed plugin list; HOME points to
# a temporary folder. Nothing goes to the network.
# Usage: sh agents/claude-code/agent-scripts/tests/check.sh
# Needs jq to check the JSON (the tested check.sh does not see it) and git, which the cases
# put on their PATH. Exits 0 and prints "all good" when everything passes.
# shellcheck disable=SC2016  # the fake scripts carry a literal $1

here=$(cd "$(dirname "$0")" && pwd) || exit 2
adapter=$(dirname "$here")
root=$(cd "$adapter/../../.." && pwd) || exit 2
# shellcheck source=tools/tests/lib.sh
. "$root/tools/tests/lib.sh"
suite_start agents/claude-code/agent-scripts/tests/check.sh 120 jq git
jq=$(command -v jq)

mkdir -p "$tmp/package/scripts" || exit 2
cp "$root/core/scripts/check.sh" "$adapter/check-agent.sh" "$tmp/package/scripts/" || exit 2
script="$tmp/package/scripts/check.sh"

# bin <dir> <tool>…: a PATH folder with links to the real tools
bin() {
  d=$1; shift
  mkdir -p "$d"
  for t in "$@"; do
    r=$(tool_path "$t") || { printf '%s\n' "tool missing for the test: $t" >&2; exit 1; }
    ln -sf "$r" "$d/$t"
  done
}
# the least that check.sh may require
base() { bin "$1" sh uname sed awk; }

# fake claude: "plugin list --json" returns whatever is in $tmp/plugins.json;
# "auth status --json" returns $tmp/auth.json and exits with the code in $tmp/auth.rc
# (without auth.json, it answers like an old CLI that does not know the command: exits 2)
fake_claude() {
  mkdir -p "$1"
  c=$(tool_path cat) || exit 1
  printf '#!/bin/sh\nif [ "$1 $2 $3" = "auth status --json" ]; then\n  [ -f "%s/auth.json" ] || exit 2\n  %s "%s/auth.json"\n  exit $(%s "%s/auth.rc")\nfi\n[ "$1 $2 $3" = "plugin list --json" ] || exit 2\n%s "%s/plugins.json"\n' "$tmp" "$c" "$tmp" "$c" "$tmp" "$c" "$tmp" > "$1/claude"
  chmod +x "$1/claude"
}
# auth <true|false>: the output of "claude auth status --json" with and without a login (with
# an email, which check.sh must never repeat in the detail)
auth() {
  if [ "$1" = true ]; then
    printf '{\n  "loggedIn": true,\n  "authMethod": "claude.ai",\n  "email": "person@example.dev",\n  "orgName": "Example Org"\n}\n' > "$tmp/auth.json"
    printf '0\n' > "$tmp/auth.rc"
  else
    printf '{\n  "loggedIn": false,\n  "authMethod": "none"\n}\n' > "$tmp/auth.json"
    printf '1\n' > "$tmp/auth.rc"
  fi
}
auth true
# plugins <version> [folderVersion] [enabled]
plugins() {
  fv=; [ -n "$2" ] && fv=", \"folderVersion\": \"$2\""
  printf '[{"id": "other@x", "version": "9.9.9", "enabled": true},\n {"id": "plan-relay@plan-relay", "version": "%s", "enabled": %s, "installPath": "/home/dev/.claude/plugins/cache/plan-relay"%s}]\n' "$1" "${3:-true}" "$fv" > "$tmp/plugins.json"
}

# run <PATH> [args]: output in $tmp/out, exit code in rc
run() { p=$1; shift; env -i HOME="$tmp/home" PATH="$p" sh "$script" "$@" > "$tmp/out" 2>"$tmp/err"; rc=$?; }
field() { "$jq" -r "$1" "$tmp/out" 2>/dev/null; }
status() { field ".checks[] | select(.id == \"$1\") | .status"; }
required() { field ".checks[] | select(.id == \"$1\") | .required"; }
valid() { if "$jq" -e 'has("ok") and has("checks")' "$tmp/out" >/dev/null 2>&1; then printf yes; else printf no; fi; }

# section <title>: each section starts from the same fake claude (logged in, plugin up to date),
# whatever the previous one left
section() { printf '%s\n' "$1"; auth true; plugins 0.1.0 0.1.0; }

section "check.sh — everything present"
full="$tmp/full"; base "$full"; bin "$full" jq git; fake_claude "$full"
run "$full" --json
check "--json passes jq ." "$(valid)" "yes"
check "exit code 0" "$rc" "0"
check "ok: true" "$(field .ok)" "true"
check "jq ok and required" "$(status jq) $(required jq)" "ok true"
check "git ok and optional" "$(status git) $(required git)" "ok false"
check "agent-cli ok" "$(status agent-cli)" "ok"
check "plugin ok, version in the detail" "$(status plugin) $(field '.checks[] | select(.id == "plugin") | .detail' | grep -c '0\.1\.0')" "ok 1"
check "plugin-current ok (local folder up to date)" "$(status plugin-current)" "ok"
check "os and shell present" "$(field '[.checks[].id] | map(select(. == "os" or . == "shell")) | length')" "2"
check "every status in the vocabulary" "$(field '[.checks[].status] | map(select(. != "ok" and . != "missing" and . != "warning" and . != "unknown")) | length')" "0"
check "every check with the four keys" "$(field '[.checks[] | select((keys | sort) != ["detail","id","required","status"])] | length')" "0"
check "nothing on stderr" "$(cat "$tmp/err")" ""

section "check.sh — without jq"
nojq="$tmp/nojq"; base "$nojq"; bin "$nojq" git; fake_claude "$nojq"
run "$nojq" --json
check "still returns well-formed JSON" "$(valid)" "yes"
check "exit code 1" "$rc" "1"
check "ok: false" "$(field .ok)" "false"
check "jq missing and required" "$(status jq) $(required jq)" "missing true"
check "jq: detail with the install hint" "$(field '.checks[] | select(.id == "jq") | .detail' | grep -c 'brew install jq')" "1"
check "plugin unknown (no way to read the list)" "$(status plugin)" "unknown"

section "check.sh — without git"
nogit="$tmp/nogit"; base "$nogit"; bin "$nogit" jq; fake_claude "$nogit"
run "$nogit" --json
check "exit code 0" "$rc" "0"
check "ok: true" "$(field .ok)" "true"
check "git missing and optional" "$(status git) $(required git)" "missing false"

section "check.sh — without claude"
nocli="$tmp/nocli"; base "$nocli"; bin "$nocli" jq git
run "$nocli" --json
check "exit code 0" "$rc" "0"
check "agent-cli missing and optional" "$(status agent-cli) $(required agent-cli)" "missing false"
check "plugin unknown" "$(status plugin)" "unknown"
check "plugin-current unknown" "$(status plugin-current)" "unknown"
check "no required check failed" "$(field '[.checks[] | select(.required and .status != "ok")] | length')" "0"

section "check.sh — plugin states"
plugins 0.1.0 0.2.0
run "$full" --json
check "local folder ahead → plugin-current warning" "$(status plugin-current)" "warning"
check "a warning does not bring ok down" "$(field .ok) $rc" "true 0"
plugins 0.1.0
run "$full" --json
check "source without a local folder → plugin ok, plugin-current unknown" "$(status plugin) $(status plugin-current)" "ok unknown"
# the entry as the CLI writes it after installing from a git marketplace
printf '[{"id": "plan-relay@plan-relay", "version": "0.1.0", "scope": "user", "enabled": true, "installPath": "/home/dev/.claude/plugins/cache/plan-relay/plan-relay/0.1.0", "installedAt": "2026-11-14T16:18:39.885Z", "lastUpdated": "2026-11-14T16:18:39.885Z", "projectEnabled": false}]\n' > "$tmp/plugins.json"
run "$full" --json
check "git source → plugin ok, plugin-current unknown, ok stays" "$(status plugin) $(status plugin-current) $(field .ok)" "ok unknown true"
check "git source: the detail says how to update" "$(field '.checks[] | select(.id == "plugin-current") | .detail' | grep -c 'claude plugin marketplace update plan-relay')" "1"
plugins 0.1.0 0.1.0 false
run "$full" --json
check "disabled → plugin warning" "$(status plugin)" "warning"
printf '[{"id": "other@x", "version": "1.0.0"}]\n' > "$tmp/plugins.json"
run "$full" --json
check "not installed → plugin missing, optional" "$(status plugin) $(required plugin)" "missing false"
printf 'this is not json\n' > "$tmp/plugins.json"
run "$full" --json
check "unreadable list → plugin unknown, JSON still valid" "$(status plugin) $(valid)" "unknown yes"
plugins 0.1.0 0.1.0

section "check.sh — cache copy against the source folder"
# cache <source> <installPath> [scope]: the entry as CLI 2.1 writes it for a folder marketplace
cache() {
  printf '[{"id": "plan-relay@plan-relay", "version": "0.1.0", "scope": "%s", "enabled": true, "installPath": "%s", "readFromFolder": "%s", "folderVersion": "0.1.0"}]\n' "${3:-project}" "$2" "$1" > "$tmp/plugins.json"
}
detail() { field '.checks[] | select(.id == "plugin-current") | .detail'; }
source_dir="$tmp/fonte com espaço/dist"; cache_copy="$tmp/home dev/cache/0.1.0"
mkdir -p "$source_dir/skills/plan" "$source_dir/.claude-plugin" "$cache_copy" || exit 1
printf 'skill\n' > "$source_dir/skills/plan/SKILL.md"; printf '{}\n' > "$source_dir/.claude-plugin/plugin.json"
same_again() { rm -rf "$cache_copy"; cp -R "$source_dir" "$cache_copy"; }
withcmp="$tmp/withcmp"; base "$withcmp"; bin "$withcmp" jq git find sort cmp; fake_claude "$withcmp"
same_again; cache "$source_dir" "$cache_copy"
run "$withcmp" --json
check "cache equal to the source → plugin-current ok" "$(status plugin-current)" "ok"
printf 'new skill\n' > "$source_dir/skills/plan/SKILL.md"
run "$withcmp" --json
check "file with other bytes → plugin-current warning" "$(status plugin-current)" "warning"
check "a warning does not bring ok down" "$(field .ok) $rc" "true 0"
check "the detail names the installPath" "$(detail | grep -c 'home dev/cache/0.1.0')" "1"
check "the detail says how to reinstall, in the entry's scope" "$(detail | grep -c 'claude plugin uninstall plan-relay@plan-relay --scope project and claude plugin install plan-relay@plan-relay --scope project')" "1"
cache "$source_dir" "$cache_copy" user
run "$withcmp" --json
check "user scope in the detail" "$(detail | grep -c 'install plan-relay@plan-relay --scope user')" "1"
same_again; printf 'x\n' > "$cache_copy/extra.md"; cache "$source_dir" "$cache_copy"
run "$withcmp" --json
check "an extra file in the cache → warning" "$(status plugin-current)" "warning"
same_again; printf 'x\n' > "$source_dir/new.md"
run "$withcmp" --json
check "a new file in the source, missing from the cache → warning" "$(status plugin-current)" "warning"
rm -f "$source_dir/new.md"; rm -rf "$cache_copy"
run "$withcmp" --json
check "cache deleted → warning" "$(status plugin-current)" "warning"
same_again
run "$withcmp" --json
check "equal again → ok" "$(status plugin-current)" "ok"
printf '[{"id": "plan-relay@plan-relay", "version": "0.1.0", "scope": "project", "enabled": true, "installPath": "%s", "readFromFolder": "%s", "folderVersion": "0.2.0"}]\n' "$cache_copy" "$source_dir" > "$tmp/plugins.json"
run "$withcmp" --json
check "a new version in the source wins: warning with plugin update" "$(status plugin-current) $(detail | grep -c 'plugin update')" "warning 1"
printf 'other\n' > "$cache_copy/skills/plan/SKILL.md"; cache "$source_dir" "$cache_copy"
if path_wins find; then
  run "$full" --json
  check "without find/cmp → plugin-current ok, as before, and the detail says it did not compare" "$(status plugin-current) $(detail | grep -c 'was not compared')" "ok 1"
else
  skip "without find/cmp" "this sh runs its own find, sort and cmp whatever the PATH holds (BusyBox)"
fi
same_again; plugins 0.1.0 0.1.0

section "check.sh — CLI authentication (agent-auth)"
run "$full" --json
check "with a login → agent-auth ok and optional" "$(status agent-auth) $(required agent-auth)" "ok false"
check "agent-auth right after agent-cli" "$(field '[.checks[].id] | (index("agent-auth") - index("agent-cli"))')" "1"
check "the detail says the login method" "$(field '.checks[] | select(.id == "agent-auth") | .detail' | grep -c 'claude\.ai')" "1"
check "the detail never repeats the email or the organization" "$(grep -c -e 'person@example' -e 'Example Org' "$tmp/out")" "0"
auth false
run "$full" --json
check "no login → agent-auth missing, optional" "$(status agent-auth) $(required agent-auth)" "missing false"
check "no login: the detail says how to log in" "$(field '.checks[] | select(.id == "agent-auth") | .detail' | grep -c 'claude auth login')" "1"
check "no login does not bring ok down" "$(field .ok) $rc" "true 0"
run "$nojq" --json
check "no login and no jq → agent-auth missing (does not need jq)" "$(status agent-auth)" "missing"
rm -f "$tmp/auth.json"
run "$full" --json
check "CLI without \"auth status\" → agent-auth unknown" "$(status agent-auth)" "unknown"
printf 'this is not json\n' > "$tmp/auth.json"; printf '0\n' > "$tmp/auth.rc"
run "$full" --json
check "unreadable answer → agent-auth unknown, JSON still valid" "$(status agent-auth) $(valid)" "unknown yes"
run "$nocli" --json
check "without the CLI → agent-auth unknown" "$(status agent-auth)" "unknown"
auth true

section "check.sh — system"
if path_wins uname; then
  win="$tmp/win"; bin "$win" sh sed awk jq git
  printf '#!/bin/sh\ncase "$1" in -r) echo 3.5.0;; *) echo MINGW64_NT-10.0;; esac\n' > "$win/uname"; chmod +x "$win/uname"
  run "$win" --json
  check "Windows with Git Bash → shell ok" "$(status shell)" "ok"
  check "Windows with Git Bash → the detail names Git Bash" "$(field '.checks[] | select(.id == "shell") | .detail' | grep -c 'Git Bash')" "1"
  wsl="$tmp/wsl"; bin "$wsl" sh sed awk jq git
  printf '#!/bin/sh\ncase "$1" in -r) echo 5.15.0-microsoft-standard-WSL2;; *) echo Linux;; esac\n' > "$wsl/uname"; chmod +x "$wsl/uname"
  run "$wsl" --json
  check "WSL → os names WSL" "$(field '.checks[] | select(.id == "os") | .detail' | grep -c 'WSL')" "1"
  odd="$tmp/odd"; bin "$odd" sh sed awk jq git
  printf '#!/bin/sh\necho Plan9\n' > "$odd/uname"; chmod +x "$odd/uname"
  run "$odd" --json
  check "unknown system → shell warning, ok stays" "$(status shell) $(field .ok)" "warning true"
else
  skip "the system cases" "this sh runs its own uname before the PATH (BusyBox), so a fake uname cannot answer"
fi

section "check.sh — text"
run "$nojq"
check "without --json: exit code 1 when a required one is missing" "$rc" "1"
check "one line per check, with the id" "$(grep -c -E '^ *(ok|missing|warning|unknown) ' "$tmp/out")" "8"
check "at the end, what is missing and how to fix it" "$(grep -c 'brew install jq' "$tmp/out")" "1"
run "$full"
check "everything up to date: exit code 0" "$rc" "0"
check "unknown argument → exit code 2" "$(env -i PATH="$full" sh "$script" --x >/dev/null 2>&1; printf '%s' $?)" "2"

section "check.sh — test language"
# The build writes the package language into check.sh; check-agent.sh appends its table to
# check.sh's. With x-test, every detail that is text comes from the table: nothing was left
# fixed in pt-BR.
mkdir -p "$tmp/package-x/scripts" || exit 1
sed "s/^language='{{PACKAGE_LANGUAGE}}'\$/language='x-test'/" "$root/core/scripts/check.sh" > "$tmp/package-x/scripts/check.sh"
cp "$adapter/check-agent.sh" "$tmp/package-x/scripts/" || exit 1
checkx="$tmp/package-x/scripts/check.sh"
check "the check.sh source has the language marker" "$(grep -cx "language='x-test'" "$checkx")" "1"
details() { env -i HOME="$tmp/home" PATH="$1" sh "$checkx" --json | "$jq" -r '.checks[] | select(.id | startswith("agent") or startswith("plugin")) | .detail' | sed 's/ .*//' | tr '\n' ' '; }
check "without claude: the agent details in x-test" "$(details "$nocli")" "x-test:agentcheck.noCli x-test:agentcheck.noCliLogin x-test:agentcheck.noCliPlugin x-test:agentcheck.noCliVersions "
check "without jq: the plugin details in x-test" "$(env -i HOME="$tmp/home" PATH="$nojq" sh "$checkx" --json | "$jq" -r '.checks[] | select(.id | startswith("plugin")) | .detail' | sed 's/ .*//' | tr '\n' ' ')" "x-test:agentcheck.noJqList x-test:agentcheck.noJqVersions "
check "text: check.sh's role and verdict in x-test, with the agent" "$(env -i HOME="$tmp/home" PATH="$nocli" sh "$checkx" | grep -c -e 'x-test:check.optional' -e '^x-test:check.missing$' -e '^  agent-cli: x-test:agentcheck.noCli$')" "9"

check "no HOME touched" "$(ls -A "$tmp/home" 2>/dev/null)" ""

suite_end
