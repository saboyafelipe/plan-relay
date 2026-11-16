#!/bin/sh
# Proves that the repository's Portuguese text is pt-BR with "você": counts the pt-PT forms in
# core/, agents/claude-code/, hosts/vscode/ and in the pt-BR root documents (README.pt-BR.md,
# CONTRIBUTING.pt-BR.md, SECURITY.pt-BR.md, CODE_OF_CONDUCT.pt-BR.md, CHANGELOG.md), and exits 1,
# listing file:line, if it finds any. New text is born in pt-BR; this test keeps it from regressing.
#
# The forms: registo, ficheiro, projecto, actual/actualizar, acção/acções, facto, contacto;
# addressing with "tu" (ti, tens, estás, podes, queres, teu, tua); the pt-PT gerund "a +
# infinitive" (a correr, a ler, a carregar, a verificar, a instalar), correr/corre meaning
# "rodar", activo/inactivo/desactivar, utilizador and "por omissão"; regista/registar/registado,
# ecrã, the old spelling "lêem" and the silent consonants (afecta, objecto, directo, exacto,
# efectivo, óptimo, -cç-). Enclisis ("grava-se", "lê-se") stays: it is written pt-BR and does
# not change the meaning.
#
# Usage (from the repository root): sh tools/tests/pt-br.sh [--self-test]
#   --self-test  first proves that the pattern flags each form and lets pt-BR through.

# \b needs a UTF-8 locale: in the C locale "ç" is not a word character, and "correção" would match
# \bcorre\b. The caller's locale does not count.
LC_ALL=C.UTF-8
export LC_ALL

root=$(git rev-parse --show-toplevel 2>/dev/null) || root=$(pwd)

pattern='registo|ficheiro|projecto|actualiz|\bactual\b|acç|\b(facto|contacto)s?\b|\b(ti|tens|estás|podes|queres|teu|tua|corre|correr)\b|\ba (correr|ler|carregar|verificar|instalar|actualizar)\b|activ(o|a|os|as|ar|ado|ada|ação|ações)\b|utilizador|por omissão|\bregist(a|am|ar|ado|ada|ados|adas)\b|ecrã|\blêem\b|\bafect|\bobjecto|\bdirect(o|a|os|as|amente)\b|\bexact(o|a|os|as|amente)\b|\befectiv|óptim|cç'

if [ "$1" = "--self-test" ]; then
  rc=0
  for f in "o registo" "um ficheiro" "o projecto" "actualizar" "a versão actual" "a acção" "as acções" "de facto" "o contacto" \
    "para ti" "tu tens" "tu estás" "tu podes" "se queres" "o teu" "a tua" "a correr" "a ler" "a carregar" "a verificar" \
    "a instalar" "o estado activo" "o plugin inactivo" "desactivar" "o utilizador" "por omissão" "corre o script" "correr o script" \
    "regista-se" "registar" "registado" "o ecrã" "lêem-se" \
    "não afecta" "o objecto" "o caminho directo" "o valor exacto" "efectivo" "óptimo" "a selecção"; do
    if ! printf '%s\n' "$f" | grep -qiE "$pattern"; then
      printf '%s\n' "FAIL: the pattern does not flag \"$f\""
      rc=1
    fi
  done
  for f in "o registro" "um arquivo" "o projeto" "atualizar" "a versão atual" "a ação" "as ações" "o fato" "o contato" \
    "para você" "você tem" "você está" "rodando" "lendo" "rode o script" "a cor" "a tabela" "o estado ativo" "o usuário" "por padrão" "os planos a mostrar" \
    "registra-se" "registrar" "registrado" "a tela" "leem-se" "grava-se" "lê-se" \
    "não afeta" "o objeto" "o caminho direto" "o valor exato" "efetivo" "ótimo" "a seleção" "a correção" "directory"; do
    if printf '%s\n' "$f" | grep -qiE "$pattern"; then
      printf '%s\n' "FAIL: the pattern flags the pt-BR \"$f\""
      rc=1
    fi
  done
  [ "$rc" -eq 0 ] || exit 1
  printf '%s\n' "ok: the pattern flags the pt-PT forms and lets pt-BR through"
fi

# The en/ folders (core/template/en/, agents/claude-code/en/) are the English text: outside the
# scan, which is about pt-BR. The public documents are X.md (English, not scanned) and
# X.pt-BR.md (scanned); .github/ and the contract text are in English.
findings=$(cd "$root" && grep -rIniE "$pattern" core agents/claude-code hosts/vscode \
  README.pt-BR.md CONTRIBUTING.pt-BR.md SECURITY.pt-BR.md CODE_OF_CONDUCT.pt-BR.md CHANGELOG.md \
  --exclude-dir=en --exclude-dir=node_modules --exclude-dir=out --exclude-dir=dist --exclude-dir=.vscode-test \
  --exclude=package-lock.json --exclude='*.vsix' | grep -v '^hosts/vscode/README\.md:')

if [ -n "$findings" ]; then
  printf '%s\n' "$findings"
  printf '%s\n' "pt-PT forms: $(printf '%s\n' "$findings" | wc -l | tr -d ' ') line(s)"
  exit 1
fi
printf '%s\n' "ok: no pt-PT form in core/, agents/claude-code/, hosts/vscode/, or the pt-BR root documents"
