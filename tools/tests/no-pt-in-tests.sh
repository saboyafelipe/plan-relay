#!/bin/sh
# Flags Portuguese in the tests and in the integration run: the *.test.ts the repository versions and
# hosts/vscode/src/integration/*.ts. The expected texts of the pt-BR tables stay: what sits inside quotes or
# inside «» is data, and the gate only reads what is code or prose:
#   - comments: an accented letter or a Portuguese word outside quotes and «»;
#   - identifiers: a const, let, var or function named with a Portuguese word (tarefa, barra, linhaDe…);
#   - error messages: the text of a `new Error(` with an accented letter or a Portuguese word.
# It is a heuristic, like no-pt-in-en.sh: it catches forgotten text, it does not prove a translation.
#
# Usage, from any folder: sh tools/tests/no-pt-in-tests.sh [--self-test] [<repository folder>]
#   --self-test  plants a Portuguese comment, identifier and error message in a temporary repository and
#                checks that each one makes the gate exit 1 and that English text passes (exit 1 when
#                not), and then runs the gate on the repository.
# Prints "<file>:<line>: <text>" per flagged line. Exits 0 with none, 1 with any, 2 without git.

self=$0
if [ "$1" = "--self-test" ]; then selftest=1; shift; fi

if [ -n "$selftest" ]; then
  command -v git >/dev/null 2>&1 || { echo "no-pt-in-tests.sh: git not found" >&2; exit 2; }
  dir=$(mktemp -d) || exit 2
  trap 'rm -rf "$dir"' EXIT
  fail=0
  # plant <name> <content>: a repository with one test file; the gate must exit 1 on it.
  plant() {
    rm -rf "$dir/r" && mkdir "$dir/r" && git -C "$dir/r" init -q || exit 2
    printf '%s\n' "$2" > "$dir/r/x.test.ts"
    git -C "$dir/r" add x.test.ts || exit 2
    sh "$self" "$dir/r" >/dev/null 2>&1
    got=$?
    if [ "$got" -ne "$3" ]; then echo "no-pt-in-tests self-test: FAIL  $1 gave exit $got, expected $3" >&2; fail=1; fi
  }
  plant "a Portuguese comment" '// o teste não deve passar com isso' 1
  plant "a Portuguese comment with no accent" '  // abre a janela para o usuario' 1
  plant "a Portuguese identifier" 'const tarefa = 1;' 1
  plant "a Portuguese compound identifier" 'function linhaDe(x) { return x; }' 1
  # shellcheck disable=SC2016 # the backticks are TypeScript template-literal text, not a substitution
  plant "a Portuguese error message" 'throw new Error(`falhou na pasta`);' 1
  plant "an accent in an error message" 'throw new Error("não achou");' 1
  plant "English text and quoted pt-BR data" "// the badge says «concluído»
const line = 'Título com acento'; // fine
throw new Error('failed')" 0
  [ "$fail" -eq 0 ] || exit 1
  echo "no-pt-in-tests self-test: each planted Portuguese text exits 1, English and quoted data exit 0"
fi

if [ -n "$1" ]; then
  root=$1
else
  root=$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null) || { echo "no-pt-in-tests.sh: not inside a git repository" >&2; exit 2; }
fi
cd "$root" || exit 2

rc=0
for f in $(git ls-files -- '*.test.ts' 'hosts/vscode/src/integration/*.ts'); do
  [ -f "$f" ] || continue
  LC_ALL=C awk -v name="$f" '
    function strip(s) {
      gsub(/«[^»]*»/, " ", s)
      gsub(/"[^"]*"/, " ", s)
      gsub(/\x27[^\x27]*\x27/, " ", s)
      gsub(/`[^`]*`/, " ", s)
      return s
    }
    function portuguese(s,    t) {
      if (s ~ /(á|à|â|ã|é|ê|í|ó|ô|õ|ú|ç|Á|À|Â|Ã|É|Ê|Í|Ó|Ô|Õ|Ú|Ç|«|»)/) return 1
      t = " " s " "
      return (t ~ /[ (](de|da|dos|das|em|na|com|para|uma|que|sem|ou|nao|usa|abre|fecha|janela|pasta|arquivo|usuario|teste|deve|nenhum|nenhuma|falhou|achou|tudo|cada|quando|mas)[ ,.:;)]/)
    }
    function ident(n) {
      return (n ~ /^(tarefa|tarefas|barra|clique|tecla|canal|caso|casos|fora|forma|linha|livre|mapear|afinar|mau|parado|ponto|toda|topo|uma|agora|meio|soB|soLivre|exemplo|arquivo|pasta|plano|fase|ideia)([A-Z0-9_]|$)/)
    }
    {
      line = $0
      # Comments: a line that starts one, or a trailing // after code.
      c = ""
      if (line ~ /^[ \t]*(\/\/|\/\*|\*)/) c = line
      else if (match(line, /[ \t]\/\/[ \t]/)) c = substr(line, RSTART)
      if (c != "" && portuguese(strip(c))) { printf "%s:%d: %s\n", name, FNR, $0; found = 1; next }
      # Declared identifiers.
      r = line
      while (match(r, /(const|let|var|function)[ \t]+[A-Za-z_][A-Za-z0-9_]*/)) {
        d = substr(r, RSTART, RLENGTH)
        r = substr(r, RSTART + RLENGTH)
        sub(/^(const|let|var|function)[ \t]+/, "", d)
        if (ident(d)) { printf "%s:%d: %s\n", name, FNR, $0; found = 1; next }
      }
      # Error messages.
      if (match(line, /new Error\(.*/)) {
        m = substr(line, RSTART + 10)
        gsub(/\$\{[^}]*\}/, " ", m)
        gsub(/«[^»]*»/, " ", m)
        if (portuguese(m)) { printf "%s:%d: %s\n", name, FNR, $0; found = 1 }
      }
    }
    END { exit found ? 1 : 0 }
  ' "$f" || rc=1
done
exit "$rc"
