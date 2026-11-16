#!/bin/sh
# Builds the Claude Code plugin into dist/claude-code/ (skills in pt-BR) and dist/claude-code-en/
# (skills in English) from core/ and from the adapter agents/claude-code/.
# The generated folders are versioned: the marketplace serves dist/claude-code-en/ as plan-relay and
# dist/claude-code/ as plan-relay-pt-br.
#
# Usage, from any folder: sh tools/build.sh [--check]
#   no arguments  rewrites both packages (assembles next to them and swaps; on a refusal it leaves them alone)
#   --check       builds into a temporary folder and compares with both packages, without touching them
# Exits 0 when it built (or, with --check, when the folders are up to date), 1 when a folder is
# out of date or the "# scripts_version:" stamps of core/template/ differ, 2 on wrong usage.
#
# Languages: the English package is the same package with the files of agents/claude-code/en/
# on top (skills, WORKER.md, agents/worker.md, COMMANDS.md); a file in en/ without its pt-BR
# pair makes the build exit 1. The template goes in both languages into both packages
# (template/ and template/en/, from core/template/en/); copy.sh --lang picks one. The plan scripts
# of template/en/ are those of template/ with only the English and x-test tables.
#
# The package:
#   .claude-plugin/ hooks/ skills/   from the adapter agents/claude-code/
#   agents/                          from the adapter: the run's worker agent
#   COMMANDS.md                      from the adapter: the command rule the skills cite
#   template/                        from core/template/
#   scripts/                         from core/scripts/ and from the adapter agents/claude-code/agent-scripts/
#                                    (a name in both places is refused)
# The tests/ and testes/ folders stay out (suites and skill validation scenarios), and so does
# the awk files of core/template/ (header.awk, plan-field.awk): tools/script-strings.sh already embeds them in the scripts.
# Placeholders: each {{AGENT_<KEY>}} in any package file becomes the value of the key in
# agents/claude-code/agent.conf (KEY=value lines); a placeholder with no value makes the build
# exit 1. {{PACKAGE_LANGUAGE}} becomes the package language (pt-BR or en), which the plugin
# scripts use to pick their string table. {{PLUGIN_NAME}} becomes the package's plugin name
# (plan-relay-pt-br or plan-relay), after the agent.conf values, so a value may carry it: the
# skill prefix is /{{PLUGIN_NAME}}:. Any other {{…}} (those of the map skill and of the
# conductor) stays as is.
# Every file ends up in mode 644: the scripts always run with sh.
# Uses only sh, find, grep, sed, cp, mv, chmod, mkdir, diff and mktemp.

usage() { printf '%s\n' "Usage: sh tools/build.sh [--check]" >&2; exit 2; }
check=
case "${1-}" in
  --check) check=1 ;;
  "") ;;
  *) usage ;;
esac
[ $# -le 1 ] || usage

case "$0" in */*) here=${0%/*} ;; *) here=. ;; esac
root=$(cd "$here/.." && pwd) || exit 2
adapter="$root/agents/claude-code"

# The three scripts the plan copies must carry the same stamp.
stamp() { sed -n 's/^# scripts_version: *\([0-9][0-9]*\) *$/\1/p' "$1"; }
v=$(stamp "$root/core/template/status.sh")
[ -n "$v" ] || { printf '%s\n' "build.sh: core/template/status.sh has no # scripts_version: stamp" >&2; exit 1; }
for s in task.sh map.sh; do
  c=$(stamp "$root/core/template/$s")
  if [ "$c" != "$v" ]; then
    printf '%s\n' "build.sh: core/template/$s has # scripts_version: ${c:-(none)} and status.sh has $v; the three template scripts carry the same stamp" >&2
    exit 1
  fi
done

# copy_tree <source> <target>: the files of <source>, without tests/ nor *.awk; refuses to
# overwrite a file already in the target. Regular files only: a symbolic link
# (outside git) does not enter the package.
copy_tree() {
  [ -d "$1" ] || { printf '%s\n' "build.sh: $1 is missing" >&2; return 1; }
  (cd "$1" && find . -type f ! -path '*/testes/*' ! -path '*/tests/*' ! -name .DS_Store ! -name '*.awk') |
    while IFS= read -r f; do
      f=${f#./}
      if [ -e "$2/$f" ]; then
        printf '%s\n' "build.sh: ${2##*/}/$f comes from two places (the last one is ${1#"$root"/}); rename one of them" >&2
        exit 1
      fi
      mkdir -p "$2/$(dirname "$f")" && cp "$1/$f" "$2/$f" && chmod 644 "$2/$f" || exit 1
    done
}

# The placeholder values: a sed script with s|{{KEY}}|value|g per agent.conf line.
conf="$adapter/agent.conf"
[ -f "$conf" ] || { printf '%s\n' "build.sh: agents/claude-code/agent.conf is missing" >&2; exit 1; }
read_conf() {
  grep -v -E '^[[:space:]]*(#|$)' "$conf" | while IFS= read -r line; do
    key=${line%%=*}; value=${line#*=}
    case "$key" in
      AGENT_*[!A-Z0-9_]*|AGENT_) printf '%s\n' "build.sh: agent.conf: key outside the AGENT_<KEY> pattern: $line" >&2; exit 1 ;;
      AGENT_*) ;;
      *) printf '%s\n' "build.sh: agent.conf: key outside the AGENT_<KEY> pattern: $line" >&2; exit 1 ;;
    esac
    case "$value" in
      *'|'*|*'&'*|*\\*) printf '%s\n' "build.sh: agent.conf: the value of $key cannot contain |, & or a backslash" >&2; exit 1 ;;
    esac
    printf 's|{{%s}}|%s|g\n' "$key" "$value"
  done
}
sed_marks=$(read_conf) || exit 1

# fill_marks <folder>: replaces the placeholders in every file of the folder that has any; exits 1 if one is left
fill_marks() {
  grep -rl '{{AGENT_' "$1" | while IFS= read -r f; do
    sed "$sed_marks" "$f" > "$f.tmp" && mv "$f.tmp" "$f" && chmod 644 "$f" || exit 1
    left=$(grep -o '{{AGENT_[A-Za-z0-9_]*}}' "$f" | sed -n 1p)
    if [ -n "$left" ]; then
      printf '%s\n' "build.sh: ${f#"$1"/} uses $left, which has no value in agents/claude-code/agent.conf" >&2
      exit 1
    fi
  done
}

# overlay <language> <target>: the files of agents/claude-code/<language>/ on top of the
# package's; each one must already exist in the package (its pt-BR pair), otherwise exits 1.
overlay() {
  [ -d "$adapter/$1" ] || { printf '%s\n' "build.sh: agents/claude-code/$1/ is missing" >&2; return 1; }
  (cd "$adapter/$1" && find . -type f ! -path '*/testes/*' ! -path '*/tests/*' ! -name .DS_Store) |
    while IFS= read -r f; do
      f=${f#./}
      if [ ! -f "$2/$f" ]; then
        printf '%s\n' "build.sh: agents/claude-code/$1/$f has no pt-BR pair in the package ($f)" >&2
        exit 1
      fi
      cp "$adapter/$1/$f" "$2/$f" && chmod 644 "$2/$f" || exit 1
    done
}

# package_mark <folder> <mark> <value>: replaces {{<mark>}} with the value in every file that has it
# (PACKAGE_LANGUAGE: the plugin scripts speak the package language; PLUGIN_NAME: the manifest
# name and the skill prefix of the package)
package_mark() {
  grep -rl "{{$2}}" "$1" | while IFS= read -r f; do
    sed "s|{{$2}}|$3|g" "$f" > "$f.tmp" && mv "$f.tmp" "$f" && chmod 644 "$f" || exit 1
  done
}

# plan_variants <template folder>: the plan scripts of an English plan, in template/en/, with only
# the English and x-test tables (tools/script-strings.sh --only); those of template/ carry pt-BR
# too. copy.sh --lang en picks them.
plan_variants() {
  for s in status.sh task.sh map.sh; do
    sh "$root/tools/script-strings.sh" --only en "$root/core/template/$s" > "$1/en/$s" && chmod 644 "$1/en/$s" || return 1
  done
}

# assemble <target> <skills language: pt-BR|en> <plugin name>
assemble() {
  mkdir -p "$1" &&
    copy_tree "$adapter/.claude-plugin" "$1/.claude-plugin" &&
    copy_tree "$adapter/agents" "$1/agents" &&
    copy_tree "$adapter/hooks" "$1/hooks" &&
    copy_tree "$adapter/skills" "$1/skills" &&
    cp "$adapter/COMMANDS.md" "$1/COMMANDS.md" && chmod 644 "$1/COMMANDS.md" &&
    copy_tree "$root/core/template" "$1/template" &&
    plan_variants "$1/template" &&
    copy_tree "$root/core/scripts" "$1/scripts" &&
    copy_tree "$adapter/agent-scripts" "$1/scripts" || return 1
  if [ "$2" != pt-BR ]; then overlay "$2" "$1" || return 1; fi
  package_mark "$1" PACKAGE_LANGUAGE "$2" || return 1
  fill_marks "$1" || return 1
  package_mark "$1" PLUGIN_NAME "$3"
}

# The packages: folder in dist/, skills language and plugin name. English is plan-relay, the name
# a user installs without choosing; pt-BR is plan-relay-pt-br.
packages="claude-code:pt-BR:plan-relay-pt-br claude-code-en:en:plan-relay"
# language_of <package>, plugin_of <package>: the second and third fields
language_of() { l=${1#*:}; printf '%s' "${l%%:*}"; }
plugin_of() { printf '%s' "${1##*:}"; }

# The build assembles each package in a temporary folder next to it (same file system, so mv is
# a rename) and swaps only when every assembly passed: on a refusal the packages stay as they
# were, because a live conductor may be reading from them.
# Each swap is two mv; the old package is removed only afterwards. When a swap fails, the ones
# already made are undone (the old packages are still there), so dist/ never holds a new package
# next to an old one. The temporaries go away on exit.
# BUILD_TEST_FAIL_SWAP=<n> makes the n-th swap fail, for the test of that undo.
if [ -z "$check" ]; then
  trap 'rm -rf "$root/dist/.claude-code"*".new.$$" "$root/dist/.claude-code"*".old.$$"' EXIT
  trap 'exit 1' HUP INT TERM
  mkdir -p "$root/dist" || exit 1
  for p in $packages; do
    name=${p%%:*}
    new="$root/dist/.$name.new.$$"
    rm -rf "$new" || exit 1
    assemble "$new" "$(language_of "$p")" "$(plugin_of "$p")" || { printf '%s\n' "build.sh: could not build dist/$name/; the packages were left as they were" >&2; exit 1; }
  done
  swapped=""
  swap_n=0
  # undo_swaps: puts back the packages swapped so far, from their old copies
  undo_swaps() {
    for u in $swapped; do
      rm -rf "$root/dist/$u"
      [ -d "$root/dist/.$u.old.$$" ] && mv "$root/dist/.$u.old.$$" "$root/dist/$u"
    done
  }
  for p in $packages; do
    name=${p%%:*}
    new="$root/dist/.$name.new.$$"
    old="$root/dist/.$name.old.$$"
    swap_n=$((swap_n + 1))
    if [ -d "$root/dist/$name" ]; then mv "$root/dist/$name" "$old" || { undo_swaps; exit 1; }; fi
    if [ "$BUILD_TEST_FAIL_SWAP" = "$swap_n" ] || ! mv "$new" "$root/dist/$name"; then
      [ -d "$old" ] && mv "$old" "$root/dist/$name"
      undo_swaps
      printf '%s\n' "build.sh: could not swap dist/$name/; the packages were left as they were" >&2
      exit 1
    fi
    swapped="$swapped $name"
  done
  for name in $swapped; do printf '%s\n' "build.sh: dist/$name/ built (scripts_version $v)"; done
  exit 0
fi

tmp=$(mktemp -d) || exit 2
trap 'rm -rf "$tmp"' EXIT
rc=0
for p in $packages; do
  name=${p%%:*}
  pkg="$root/dist/$name"
  assemble "$tmp/$name" "$(language_of "$p")" "$(plugin_of "$p")" || exit 1
  r1=0
  if [ ! -d "$pkg" ]; then
    printf '%s\n' "build.sh: dist/$name/ does not exist" >&2
    r1=1
  elif ! differences=$(diff -rq "$tmp/$name" "$pkg" 2>&1); then
    printf '%s\n' "$differences" | sed "s|$tmp/$name|(new build of $name)|g; s|$root/||g" >&2
    r1=1
  fi
  modes=$( (cd "$pkg" 2>/dev/null && find . -type f ! -perm 644) | sed 's|^\./||')
  if [ -n "$modes" ]; then
    printf '%s\n' "$modes" | sed "s|^|mode other than 644: dist/$name/|" >&2
    r1=1
  fi
  if [ "$r1" -ne 0 ]; then
    printf '%s\n' "build.sh: dist/$name/ is out of date; run sh tools/build.sh" >&2
    rc=1
  else
    printf '%s\n' "build.sh: dist/$name/ up to date"
  fi
done
exit "$rc"
