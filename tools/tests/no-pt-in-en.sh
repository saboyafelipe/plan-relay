#!/bin/sh
# Flags pt-BR text outside comments in the scripts of an English package: the
# scripts/*.sh, template/*.sh and template/en/*.sh of <package> (usually dist/claude-code-en/). The scripts' strings
# come from the package language table, embedded between "# >>> strings" and "# <<< strings"; the
# block carries the pt-BR table too, so it is skipped, except in template/en/, the scripts of an English
# plan, which carry only the English and x-test tables. Outside it, a line that is not a
# comment is pt-BR when it has an accented letter or «», or when a double-quoted string has a
# word from the list below, standing between spaces or parentheses (words English does not use).
# It is a heuristic: it catches forgotten text, it does not prove a translation.
#
# The Markdown of the package is read for placeholders: a {{MARKER}} named in Portuguese in any
# .md (the pt-BR template goes in the English package too, and its markers are filled in by the
# same English map skill), and a <placeholder> named in Portuguese, or an example script with a
# Portuguese name, in the English text: skills/, agents/, COMMANDS.md and template/en/.
#
# Usage: sh tools/tests/no-pt-in-en.sh <package folder>
#        sh tools/tests/no-pt-in-en.sh --self-test
# Prints "<file>:<line>: <text>" per flagged line. Exits 0 with none, 1 with any,
# 2 on wrong usage.
#   --self-test  proves the gate instead of running it: in a temporary package, a script with a pt-BR
#                message and a Markdown file with a pt-BR placeholder must each make the gate exit 1, and
#                an English package must pass. Exits 0 when so, 1 when the gate stayed green on a bad file.

if [ "$1" = "--self-test" ]; then
  self=$0
  dir=$(mktemp -d) || exit 2
  trap 'rm -rf "$dir"' EXIT
  fail=0
  for kind in good script placeholder; do
    mkdir -p "$dir/$kind/template" "$dir/$kind/scripts" || exit 2
    printf '#!/bin/sh\necho "all good"\n' > "$dir/$kind/scripts/x.sh"
    printf 'Fill in {{NAME}}.\n' > "$dir/$kind/template/a.md"
  done
  printf '#!/bin/sh\necho "Uso: x <pasta>"\n' > "$dir/script/scripts/x.sh"
  printf 'Fill in {{NOME}}.\n' > "$dir/placeholder/template/a.md"
  sh "$self" "$dir/good" >/dev/null 2>&1
  got=$?
  [ "$got" -eq 0 ] || { echo "no-pt-in-en self-test: FAIL  the English package gave exit $got, expected 0" >&2; fail=1; }
  for kind in script placeholder; do
    sh "$self" "$dir/$kind" >/dev/null 2>&1
    got=$?
    [ "$got" -eq 1 ] || { echo "no-pt-in-en self-test: FAIL  the planted $kind gave exit $got, expected 1" >&2; fail=1; }
  done
  [ "$fail" -eq 0 ] || exit 1
  echo "no-pt-in-en self-test: the planted pt-BR script and placeholder exit 1, the English package exits 0"
  exit 0
fi

if [ $# -ne 1 ] || [ ! -d "$1" ]; then printf '%s\n' "Usage: sh tools/tests/no-pt-in-en.sh <package folder>" >&2; exit 2; fi

rc=0
for f in "$1"/scripts/*.sh "$1"/template/*.sh "$1"/template/en/*.sh; do
  [ -f "$f" ] || continue
  # The plan scripts of template/en/ carry no pt-BR table: their strings block is read too.
  case "$f" in */template/en/*) strict=1 ;; *) strict=0 ;; esac
  LC_ALL=C awk -v name="${f#"$1"/}" -v strict="$strict" '
    !strict && /^# >>> strings/ { block = 1; next }
    /^# <<< strings$/ { block = 0; next }
    block { next }
    /^[ \t]*#/ { next }
    {
      l = $0
      sub(/[ \t]#[ \t].*$/, "", l)
      bad = (l ~ /(á|à|â|ã|é|ê|í|ó|ô|õ|ú|ç|Á|À|Â|Ã|É|Ê|Í|Ó|Ô|Õ|Ú|Ç|«|»)/)
      r = l
      while (!bad && match(r, /"[^"]*"/)) {
        s = " " substr(r, RSTART + 1, RLENGTH - 2) " "
        r = substr(r, RSTART + RLENGTH)
        if (s ~ /[ (](Uso|nenhum|nenhuma|tudo|falta|existe|precisa|aviso|desconhecido|sem|com|em|de|da|na|ou|para|pasta|arquivo|janela|limite)[ ,.:;)]/) bad = 1
      }
      if (bad) { printf "%s:%d: %s\n", name, FNR, $0; found = 1 }
    }
    END { exit found ? 1 : 0 }
  ' "$f" || rc=1
done

# Portuguese names of placeholders and of example scripts.
words='nome|caminho|convencoes|convenções|modelo|plano|pasta|perfil|fase|titulo|título|motivo|raiz|substituta|arquivo|lingua|língua|sessao|sessão|ideia'
find "$1" -type f -name '*.md' | LC_ALL=C sort | while IFS= read -r f; do
  name=${f#"$1"/}
  case "$name" in
    skills/* | agents/* | COMMANDS.md | template/en/*) pattern="\{\{($(printf '%s' "$words" | tr '[:lower:]' '[:upper:]'))\}\}|<($words)>|[a-z_-]*(testar|rodar|conferir)\.sh" ;;
    *) pattern="\{\{($(printf '%s' "$words" | tr '[:lower:]' '[:upper:]'))\}\}" ;;
  esac
  grep -nE "$pattern" "$f" | sed "s|^\([0-9]*\):|$name:\1: |"
done | grep . && rc=1
exit "$rc"
