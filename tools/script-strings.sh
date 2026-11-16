#!/bin/sh
# Embeds the strings of core/i18n/*.json in the scripts that a plan copies: status.sh gets the
# status. area, task.sh the task. one and map.sh the map. one, between the lines
# "# >>> strings" and "# <<< strings". The block picks the table from the script's $language
# variable (the language of plan.json, by the contract rule: the same ignoring case, else the same base language, else English) and defines:
#   msg <key> [arguments…]   prints the string with {n} replaced by argument n (up to {5})
#   MSG_AWK                  the same msg(key, a0…a5) function for the script's awk programs,
#                            which read the table from ENVIRON["MSG_TABLE"]
# This way the script keeps running without a build, with only sh and awk, and the plan does
# not depend on any file outside its own folder. A new language or string means running this
# script and raising the # scripts_version: stamp of the three.
#
# The plugin scripts that run outside a plan get the same block, each one with its own area;
# their $language is the package language, which tools/build.sh writes in place of the
# {{PACKAGE_LANGUAGE}} marker (in the source it matches no table: English). Those in core/
# read core/i18n/; those of the adapter, which cite the agent's CLI, read
# agents/claude-code/i18n/ (same shape; core/ does not have the agent's word).
# check-agent.sh, sourced with "." by check.sh, gets a "joined" block: it only appends its own
# table to check.sh's MSG_TABLE, without redefining msg.
# Before writing, it checks that every language has the same keys as pt-BR in each area.
# It also embeds core/template/header.awk, the single reader and writer of the task header, as
# HEADER_AWK between the lines "# >>> header" and "# <<< header" of status.sh, task.sh, map.sh and
# core/scripts/boundary.sh, so the scripts copied to a plan stay self-contained.
#
# It also embeds core/template/plan-field.awk, the single reader of a plan.json field, as
# PLAN_FIELD_AWK between "# >>> plan-field" and "# <<< plan-field" of status.sh, task.sh and map.sh.
#
# A plan carries only the table of its language and the fallback (and x-test, which the template's
# selftest.sh switches the copy to). The template scripts carry every table, which is what a
# pt-BR plan gets; --only prints the variant of another language, and tools/build.sh puts it in
# the package's template/<language>/, where copy.sh --lang finds it.
#
# Usage, from any folder: sh tools/script-strings.sh [--check]
#                         sh tools/script-strings.sh --only <language> <script>
#   no arguments  rewrites the block of each script in the "targets" list below
#   --check       only checks: exits 1 when some block differs from what would be generated,
#                 without touching anything
#   --only        prints <script> with only the x-test, <language> and fallback tables in its
#                 strings block; needs neither jq nor a build, only awk
# Exits 0 when it generated (or, with --check, when everything is up to date), 1 on an outdated
# block, a missing marker, a key that is missing in a language or a string with a tab or a
# line break, 2 on wrong usage. Needs jq, except --only.

usage() { printf '%s\n' "Usage: sh tools/script-strings.sh [--check] | sh tools/script-strings.sh --only <language> <script>" >&2; exit 2; }
check=
case "${1-}" in
  --check) check=1 ;;
  --only)
    [ $# -eq 3 ] && [ -n "$2" ] && [ -f "$3" ] || usage
    # Each branch of the table selector (case "$msg_language" in … esac) is "  <language>) …='"
    # up to a line that is only "' ;;"; those of the other languages are left out.
    awk -v keep=" x-test $2 " -v q="'" '
      /^# >>> strings/ { block = 1; print; next }
      /^# <<< strings$/ { block = 0; print; next }
      skip { if ($0 == q " ;;") skip = 0; next }
      block && $0 == "case \"$msg_language\" in" { tables = 1; print; next }
      block && tables && $0 == "esac" { tables = 0; print; next }
      block && tables && match($0, /^  [^ )]+\) /) {
        label = substr($0, 3, RLENGTH - 4)
        if (label != "*" && index(keep, " " label " ") == 0) { skip = 1; next }
      }
      { print }
    ' "$3"
    exit
    ;;
  "") ;;
  *) usage ;;
esac
[ $# -le 1 ] || usage
command -v jq >/dev/null || { printf '%s\n' "script-strings.sh: needs jq" >&2; exit 1; }

case "$0" in */*) here=${0%/*} ;; *) here=. ;; esac
root=$(cd "$here/.." && pwd) || exit 2
for d in core/i18n agents/claude-code/i18n; do
  [ -f "$root/$d/pt-BR.json" ] || { printf '%s\n' "script-strings.sh: $d/pt-BR.json is missing" >&2; exit 1; }
done

# The tables the scripts embed: one branch for each language of branch_languages, in this order,
# and the fallback for any other value (decision of the contract: English). The keys of each
# one are checked against those of pt-BR.
branch_languages="x-test pt-BR"
fallback_language=en
script_languages="x-test en"

# any_case <language>: the sh pattern that matches it ignoring case (pt-BR → [Pp][Tt]-[Bb][Rr])
any_case() {
  printf '%s\n' "$1" | awk '{
    r = ""
    for (i = 1; i <= length($0); i++) {
      c = substr($0, i, 1)
      if (c ~ /[A-Za-z]/) r = r "[" toupper(c) tolower(c) "]"; else r = r c
    }
    print r
  }'
}

# The targets, one per line: <script>:<area>:<tables folder>[:joined], paths from the root.
targets="core/template/status.sh:status:core/i18n
core/template/task.sh:task:core/i18n
core/template/map.sh:map:core/i18n
core/template/selftest.sh:selftest:core/i18n
core/template/copy.sh:copy:core/i18n
core/template/profile.sh:profile:core/i18n
core/scripts/check.sh:check:core/i18n
core/scripts/boundary.sh:boundary:core/i18n
core/scripts/idea.sh:idea:core/i18n
core/scripts/summary.sh:summary:core/i18n
agents/claude-code/agent-scripts/check-agent.sh:agentcheck:agents/claude-code/i18n:joined
agents/claude-code/agent-scripts/context-hook.sh:contextHook:agents/claude-code/i18n
agents/claude-code/agent-scripts/window.sh:window:agents/claude-code/i18n"

tmp=$(mktemp -d) || exit 1
trap 'rm -rf "$tmp"' EXIT

# table <file.json> <area>: "key<TAB>text" lines of the area, with ' escaped for sh inside single quotes
table() {
  jq -r --arg a "$2." --arg q "'" '
    to_entries[] | select(.key | startswith($a))
    | if (.value | test("[\t\n]")) then error("text with a tab or line break: \(.key)") else . end
    | "\(.key)\t\(.value | gsub($q; $q + "\\" + $q + $q))"' "$1"
}

# keys <file.json> <area>: the keys of the area, one per line, in order
keys() { jq -r --arg a "$2." 'keys[] | select(startswith($a))' "$1"; }

# block <area> <tables folder, from the root> [joined]
block() {
  # The English table is the fallback; in a "joined" block the variable is another one and is appended to MSG_TABLE.
  if [ "${3-}" = joined ]; then var=msg_joined_table; else var=MSG_TABLE; fi
  printf '%s\n' "# >>> strings (area $1.): generated by tools/script-strings.sh from $2/*.json; do not edit by hand"
  # shellcheck disable=SC2016 # it is the text of the generated script: the expansion is its own
  if [ "${3-}" = joined ]; then printf '%s\n' '# shellcheck disable=SC2154 # language and MSG_TABLE come from the script that reads this file'; fi
  # The language rule of the contract: the same ignoring case, else (not for a test language) the
  # same base language, else the fallback.
  # shellcheck disable=SC2016 # same
  printf '%s\n' 'case "$language" in'
  for l in $branch_languages; do
    printf '  %s) msg_language="%s" ;;\n' "$(any_case "$l")" "$l"
  done
  for l in $branch_languages; do
    case "$l" in x-*) continue ;; esac
    b=$(any_case "${l%%-*}")
    printf '  %s|%s-*) msg_language="%s" ;;\n' "$b" "$b" "$l"
  done
  printf '  *) msg_language="%s" ;;\n' "$fallback_language"
  printf '%s\n' 'esac'
  printf '%s\n' '# shellcheck disable=SC2016,SC2089 # backticks and quotes in the strings are text, not expansion'
  # shellcheck disable=SC2016 # same
  printf '%s\n' 'case "$msg_language" in'
  for l in $branch_languages; do
    printf '  %s) %s='"'"'' "$l" "$var"
    table "$root/$2/$l.json" "$1" || return 1
    printf '%s\n' "' ;;"
  done
  printf '  *) %s='"'" "$var"
  table "$root/$2/$fallback_language.json" "$1" || return 1
  printf '%s\n' "' ;;"
  printf '%s\n' 'esac'
  if [ "${3-}" = joined ]; then
    # shellcheck disable=SC2016 # same
    printf '%s\n' 'MSG_TABLE="$MSG_TABLE' '$msg_joined_table"' '# shellcheck disable=SC2090 # a table read by awk from the environment, never split by the shell' 'export MSG_TABLE' '# <<< strings'
    return 0
  fi
  printf '%s\n' '# shellcheck disable=SC2090 # a table read by awk from the environment, never split by the shell' 'export MSG_TABLE'
  cat <<'END_OF_BLOCK'
MSG_AWK='
function msg_load(   m, ls, j, p) {
  msg_ok = 1
  m = split(ENVIRON["MSG_TABLE"], ls, "\n")
  for (j = 1; j <= m; j++) { p = index(ls[j], "\t"); if (p > 0) MSG[substr(ls[j], 1, p - 1)] = substr(ls[j], p + 1) }
}
function msg(k, a0, a1, a2, a3, a4, a5,   s, r, i, c) {
  if (!msg_ok) msg_load()
  s = (k in MSG) ? MSG[k] : k
  r = ""
  while ((i = index(s, "{")) > 0) {
    c = substr(s, i + 1, 2)
    if (c ~ /^[0-5][}]$/) {
      c = substr(c, 1, 1)
      r = r substr(s, 1, i - 1) (c == "0" ? a0 : (c == "1" ? a1 : (c == "2" ? a2 : (c == "3" ? a3 : (c == "4" ? a4 : a5)))))
      s = substr(s, i + 3)
    } else { r = r substr(s, 1, i); s = substr(s, i + 1) }
  }
  return r s
}
'
msg() { awk "$MSG_AWK"' BEGIN { print msg(ARGV[1], ARGV[2], ARGV[3], ARGV[4], ARGV[5], ARGV[6], ARGV[7]); exit }' "$@"; }
# <<< strings
END_OF_BLOCK
}

rc=0
n=0
while IFS=: read -r s area folder mode; do
  [ -n "$s" ] || continue
  n=$((n + 1))
  target="$root/$s"
  if [ "$(grep -c -e '^# >>> strings' -e '^# <<< strings$' "$target" 2>/dev/null)" != 2 ]; then
    printf '%s\n' "script-strings.sh: $s lacks the lines \"# >>> strings\" and \"# <<< strings\"" >&2
    exit 1
  fi
  keys "$root/$folder/pt-BR.json" "$area" > "$tmp/keys-pt-BR" || exit 1
  if [ ! -s "$tmp/keys-pt-BR" ]; then
    printf '%s\n' "script-strings.sh: $folder/pt-BR.json has no $area area." >&2
    exit 1
  fi
  for l in $script_languages; do
    keys "$root/$folder/$l.json" "$area" > "$tmp/keys-$l" || exit 1
    if ! cmp -s "$tmp/keys-pt-BR" "$tmp/keys-$l"; then
      printf '%s\n' "script-strings.sh: the $area. area of $folder/$l.json does not have the same keys as pt-BR" >&2
      exit 1
    fi
  done
  block "$area" "$folder" "$mode" > "$tmp/block" || exit 1
  awk -v block="$tmp/block" '
    /^# >>> strings/ { while ((getline l < block) > 0) print l; inside = 1; next }
    inside && /^# <<< strings$/ { inside = 0; next }
    !inside { print }
  ' "$target" > "$tmp/new-$n" || exit 1
  if cmp -s "$tmp/new-$n" "$target"; then continue; fi
  if [ -n "$check" ]; then
    printf '%s\n' "script-strings.sh: the strings block of $s is out of date; run sh tools/script-strings.sh" >&2
    rc=1
  else
    cat "$tmp/new-$n" > "$target" || exit 1
    printf '%s\n' "$s: strings block rewritten"
  fi
done <<EOF
$targets
EOF

# The awk blocks: each awk file below, as a variable between "# >>> <marker>" and "# <<< <marker>"
# in each script that uses it. core/template/header.awk is the single reader and writer of the task
# header; core/template/plan-field.awk the single reader of a plan.json field.
# embed <awk file> <marker> <variable> <targets…>
embed() {
  src=$1 marker=$2 var=$3
  shift 3
  if grep -q "'" "$root/$src"; then
    printf '%s\n' "script-strings.sh: $src has a single quote, which cannot go inside $var='…'" >&2
    exit 1
  fi
  {
    printf '%s\n' "# >>> $marker: generated by tools/script-strings.sh from $src; do not edit by hand"
    printf '%s\n' '# shellcheck disable=SC2016 # an awk program: the $ are awk fields'
    printf '%s\n' "$var='"
    cat "$root/$src"
    printf '%s\n' "'" "# <<< $marker"
  } > "$tmp/$marker" || exit 1
  for s in "$@"; do
    n=$((n + 1))
    target="$root/$s"
    if [ "$(grep -c -e "^# >>> $marker:" -e "^# <<< $marker\$" "$target" 2>/dev/null)" != 2 ]; then
      printf '%s\n' "script-strings.sh: $s lacks the lines \"# >>> $marker\" and \"# <<< $marker\"" >&2
      exit 1
    fi
    awk -v block="$tmp/$marker" -v open="# >>> $marker:" -v close_line="# <<< $marker" '
      index($0, open) == 1 { while ((getline l < block) > 0) print l; close(block); inside = 1; next }
      inside && $0 == close_line { inside = 0; next }
      !inside { print }
    ' "$target" > "$tmp/new-$n" || exit 1
    if cmp -s "$tmp/new-$n" "$target"; then continue; fi
    if [ -n "$check" ]; then
      printf '%s\n' "script-strings.sh: the $marker block of $s is out of date; run sh tools/script-strings.sh" >&2
      rc=1
    else
      cat "$tmp/new-$n" > "$target" || exit 1
      printf '%s\n' "$s: $marker block rewritten"
    fi
  done
}
embed core/template/header.awk header HEADER_AWK core/template/status.sh core/template/task.sh core/template/map.sh core/scripts/boundary.sh
embed core/template/plan-field.awk plan-field PLAN_FIELD_AWK core/template/status.sh core/template/task.sh core/template/map.sh
exit "$rc"
