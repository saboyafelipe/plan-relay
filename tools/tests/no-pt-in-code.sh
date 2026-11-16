#!/bin/sh
# Flags Portuguese in the production code, where no-pt-in-tests.sh does not look:
#   - the *.ts of core/ and hosts/vscode/src/, except the tests (*.test.ts), their helpers (testing/) and the
#     integration run (integration/), which no-pt-in-tests.sh reads;
#   - the key names of the string tables (core/i18n/*.json, agents/claude-code/i18n/*.json), not their texts;
#   - the field ids of the issue forms (.github/ISSUE_TEMPLATE/*.yml).
# In the code every word counts, string literals included: a sentinel such as 'motivo-invalido' or a persisted key
# such as '@concluidas' is as much code as an identifier. Only what sits inside «» is data, and in a comment also
# what sits inside double quotes (an example of pt-BR output). Identifiers are split at each lower-to-upper
# change (abrirUri → abrir, uri) and every word is matched against a list of Portuguese words; an accented
# letter outside the data is flagged too.
# It is a heuristic, like no-pt-in-tests.sh: it catches a forgotten name, it does not prove a translation.
#
# Usage, from any folder: sh tools/tests/no-pt-in-code.sh [--self-test] [<repository folder>]
#   --self-test  plants a Portuguese method, literal, parameter, comment, string key and form id in a temporary
#                repository and checks that each one makes the gate exit 1 and that English code passes (exit 1
#                when not), and then runs the gate on the repository.
# Prints "<file>:<line>: [<word>] <text>" per flagged line. Exits 0 with none, 1 with any, 2 without git.

self=$0
if [ "$1" = "--self-test" ]; then selftest=1; shift; fi

if [ -n "$selftest" ]; then
  command -v git >/dev/null 2>&1 || { echo "no-pt-in-code.sh: git not found" >&2; exit 2; }
  dir=$(mktemp -d) || exit 2
  trap 'rm -rf "$dir"' EXIT
  fail=0
  # plant <name> <path> <content> <expected exit>: a repository with one file; the gate must give the exit.
  plant() {
    rm -rf "$dir/r" && mkdir "$dir/r" && git -C "$dir/r" init -q || exit 2
    mkdir -p "$dir/r/$(dirname "$2")" || exit 2
    printf '%s\n' "$3" > "$dir/r/$2"
    git -C "$dir/r" add "$2" || exit 2
    sh "$self" "$dir/r" >/dev/null 2>&1
    got=$?
    if [ "$got" -ne "$4" ]; then echo "no-pt-in-code self-test: FAIL  $1 gave exit $got, expected $4" >&2; fail=1; fi
  }
  plant "a Portuguese method" core/panel/src/open.ts '  abrirUri(parts: UriParts): PromiseLike<boolean>;' 1
  plant "a Portuguese literal" core/panel/src/reply.ts "export type Reply = 'motivo-invalido' | undefined;" 1
  plant "a Portuguese parameter" hosts/vscode/src/view.ts 'const showError = (sim: boolean) => sim;' 1
  plant "a persisted Portuguese key" core/panel/src/keys.ts "export const DONE_BLOCK = '@concluidas';" 1
  # shellcheck disable=SC2016 # the backticks are planted text, not a command substitution
  plant "a stale name in a doc comment" hosts/vscode/src/actions/delete.ts '/** Deletes the plan at `pastaPlano`. */' 1
  plant "an accent in a comment" core/reader/src/x.ts '// a pasta é a raiz' 1
  plant "a Portuguese string key" core/i18n/en.json '{ "check.jqFalta": "jq not found" }' 1
  plant "a Portuguese form id" .github/ISSUE_TEMPLATE/idea.yml '    id: problema' 1
  plant "English code and quoted pt-BR data" core/panel/src/fine.ts "// the badge says «concluído»; the toast reads \"<ID> abandonada\"
export const DONE_BLOCK = '@done';
const label = (reason: string): string => reason;" 0
  plant "English string keys with pt-BR texts" core/i18n/pt-BR.json '{ "check.jqMissing": "jq não encontrado" }' 0
  plant "a test file (no-pt-in-tests.sh reads it)" core/panel/src/x.test.ts "const reason = 'Sem motivo';" 0
  [ "$fail" -eq 0 ] || exit 1
  echo "no-pt-in-code self-test: each planted Portuguese name exits 1, English code and quoted data exit 0"
fi

if [ -n "$1" ]; then
  root=$1
else
  root=$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null) || { echo "no-pt-in-code.sh: not inside a git repository" >&2; exit 2; }
fi
cd "$root" || exit 2

# Portuguese words, as the split leaves them (lowercase, no accent). Words that are also English, or a common
# token of English code, stay out: do, so, os, com (.COM, github.com), ja (a language code), no, as, se.
words=" abandonada abandonadas abandonado abandonados aberta abertas aberto abertos abrir aceitou agora ajuda apagar
  arquivo arquivos aviso bastante binario bloqueada bloqueadas bloqueio botao caminho causa certo chave ciclo coerente
  concluida concluidas concluido conduzir contrato copia da dado dados das de desconhecido desinstalar detalhe
  diferente disponivel dos erro estado executar falha falhas falta fase fases fechar ideia ideias igual incoerente
  instalar intacto janela largura limpo linha livre mais mapear marcador metodo mostrar motivo mudou nao nenhum
  nenhuma nome obrigatorio opcao opcional opcoes origem para pasta perfil plano planos problema pronto proposta recusa resposta
  respostas retomada retomar sem sim sistema sobra soma tarefa tarefas texto textos tudo uma ultimo uso usuario
  valido valor vazio vista "

# Named exceptions, "<file>:<word>", one per line, each with its reason.
#   discover.ts reads plano.json only to recognize a plan of the format before contract 1 and say so.
#   saved.ts carries a saved state of an earlier version over: it reads the old Portuguese keys and values once
#   (vista, ultimo; the open-block keys \0estado, \0agora, \0ideias and the blocks @concluidas, @abandonadas).
exceptions="
core/reader/src/discover.ts:plano
core/panel/src/saved.ts:vista
core/panel/src/saved.ts:ultimo
core/panel/src/saved.ts:estado
core/panel/src/saved.ts:agora
core/panel/src/saved.ts:ideias
core/panel/src/saved.ts:concluidas
core/panel/src/saved.ts:abandonadas
"

rc=0
for f in $(git ls-files -- 'core/*.ts' 'hosts/vscode/src/*.ts' 'core/i18n/*.json' 'agents/claude-code/i18n/*.json' '.github/ISSUE_TEMPLATE/*.yml'); do
  case $f in
    *.test.ts | */testing/* | hosts/vscode/src/integration/*) continue ;;
  esac
  [ -f "$f" ] || continue
  PT_WORDS=$words PT_EXCEPTIONS=$exceptions LC_ALL=C awk -v name="$f" '
    BEGIN {
      words = ENVIRON["PT_WORDS"]; gsub(/[ \t\n]+/, " ", words)
      n = split(ENVIRON["PT_EXCEPTIONS"], ex, "\n")
      for (i = 1; i <= n; i++) if (index(ex[i], name ":") == 1) allowed[substr(ex[i], length(name) + 2)] = 1
      kind = name ~ /\.json$/ ? "json" : (name ~ /\.yml$/ ? "yml" : "ts")
    }
    function accented(s) {
      return s ~ /(á|à|â|ã|é|ê|í|ó|ô|õ|ú|ç|Á|À|Â|Ã|É|Ê|Í|Ó|Ô|Õ|Ú|Ç)/
    }
    # The first Portuguese word of s, or "": camelCase split, then every run of letters is a word.
    function portuguese(s,    out, w, k, i) {
      out = ""
      s = s " "
      while (match(s, /[a-z][A-Z]/)) { out = out substr(s, 1, RSTART) " "; s = substr(s, RSTART + 1) }
      s = tolower(out s)
      gsub(/[^a-z]+/, " ", s)
      k = split(s, w, " ")
      for (i = 1; i <= k; i++) if (index(words, " " w[i] " ") && !(w[i] in allowed)) return w[i]
      return ""
    }
    function flag(word) { printf "%s:%d: [%s] %s\n", name, FNR, word, $0; found = 1 }
    {
      line = $0
      gsub(/«[^»]*»/, " ", line)
      if (kind == "json") {
        # Only a key name counts: the text after it is a translation.
        if (!match(line, /^[ \t{,]*"[^"]*"[ \t]*:/)) next
        line = substr(line, RSTART, RLENGTH)
      } else if (kind == "yml") {
        if (!match(line, /^[ \t-]*id:.*/)) next
      }
      # Comments: what a line that starts one holds, or what follows a trailing //; quoted text in them is data.
      code = line
      c = ""
      if (kind == "ts") {
        if (line ~ /^[ \t]*(\/\/|\/\*|\*)/) { c = line; code = "" }
        else if (match(line, /[ \t]\/\/[ \t]/)) { c = substr(line, RSTART); code = substr(line, 1, RSTART - 1) }
        gsub(/"[^"]*"/, " ", c)
      }
      if (accented(code) || accented(c)) { flag("accent"); next }
      w = portuguese(code " " c)
      if (w != "") flag(w)
    }
    END { exit found ? 1 : 0 }
  ' "$f" || rc=1
done
exit "$rc"
