#!/bin/sh
# Language parity: each translatable pt-BR file has its English pair with the same name in an en/
# folder next to it, and each file in en/ has its pt-BR pair.
# The pairs have the same {{…}} placeholders, the same sequence of profile blocks
# ({{#full}}, {{/lean}}…), the same number of <!-- open-questions -->, the same cited scripts
# (*.sh), the same number of headings (lines starting with #) and, in the skills and in the
# agent, the same name: and disable-model-invocation: in the frontmatter.
#   template: core/template/{README.md,PHASE.md,_template.md,idea.md}  ↔ core/template/en/
#   adapter:  agents/claude-code/{COMMANDS.md,agents/*.md,skills/**/*.md} ↔ agents/claude-code/en/
# Usage: sh tools/tests/languages.sh [root]
#   no root    checks the repository and proves the red on a copy (a pair removed, one too many)
#   with root  only checks that tree (exits 1 with the list of what is missing)
# Exits 0 with "all good" when everything passes.

case "$0" in */*) here=${0%/*} ;; *) here=. ;; esac
here=$(cd "$here" && pwd) || exit 2
root=${1:-$(dirname "$(dirname "$here")")}
# shellcheck source=tools/tests/lib.sh
. "$here/lib.sh"
suite_start tools/tests/languages.sh 120
# The pairs go through check <case> <pt-BR signature> <en signature>: "got" is the pt-BR side.

# signatures of a file (one line each, to compare the pair)
marks() { grep -o '{{[^}]*}}' "$1" | LC_ALL=C sort -u | tr '\n' ' '; }
blocks() { grep -x -E '\{\{[#/](full|lean)\}\}' "$1" | tr '\n' ' '; }
questions() { grep -c -F '<!-- open-questions -->' "$1"; }
scripts() { grep -o '[a-z][a-z-]*\.sh' "$1" | LC_ALL=C sort -u | tr '\n' ' '; }
headings() { grep -c '^#' "$1"; }
front() { sed -n '1{/^---$/!q;};2,/^---$/p' "$1" | grep -E '^(name|disable-model-invocation|tools):' | tr '\n' ' '; }

# pair <label> <pt-BR file> <en file>
pair() {
  if [ ! -f "$3" ]; then ko "$1: the English pair is missing (${3#"$root"/})"; return; fi
  if [ ! -f "$2" ]; then ko "$1: the pt-BR pair is missing (${2#"$root"/})"; return; fi
  check "$1: {{…}} placeholders" "$(marks "$2")" "$(marks "$3")"
  check "$1: profile blocks" "$(blocks "$2")" "$(blocks "$3")"
  check "$1: <!-- open-questions -->" "$(questions "$2")" "$(questions "$3")"
  check "$1: cited scripts" "$(scripts "$2")" "$(scripts "$3")"
  check "$1: number of headings" "$(headings "$2")" "$(headings "$3")"
  check "$1: frontmatter" "$(front "$2")" "$(front "$3")"
}

m="$root/core/template"
a="$root/agents/claude-code"
printf '%s\n' "template and adapter pairs"
for f in README.md PHASE.md _template.md idea.md; do pair "template/$f" "$m/$f" "$m/en/$f"; done
pt_list() { (cd "$a" && { [ -f COMMANDS.md ] && echo COMMANDS.md; find agents skills -name '*.md' 2>/dev/null; } | LC_ALL=C sort); }
for f in $(pt_list); do pair "$f" "$a/$f" "$a/en/$f"; done
# the reverse direction: a file in en/ without a pt-BR pair
if [ -d "$m/en" ]; then
  for f in $(cd "$m/en" && find . -type f ! -name .DS_Store | sed 's|^\./||'); do
    [ -f "$m/$f" ] || ko "template/en/$f: no pt-BR pair"
  done
fi
if [ -d "$a/en" ]; then
  for f in $(cd "$a/en" && find . -type f ! -name .DS_Store | sed 's|^\./||'); do
    [ -f "$a/$f" ] || ko "en/$f: no pt-BR pair"
  done
fi

# Public documents: X.md in English and X.pt-BR.md in pt-BR, side by side. The first line of each
# is the language selector and is not counted. Checked: ## headings, code fences, images (with
# ".pt-BR" before .png ignored) and relative links (with .pt-BR.md read as .md, without internal #… anchors).
docs="README.md CONTRIBUTING.md SECURITY.md CODE_OF_CONDUCT.md ARCHITECTURE.md docs/autopilot.md hosts/vscode/README.md"
h2() { sed 1d "$1" | grep -c '^## '; }
fences() { sed 1d "$1" | grep -c '^```'; }
images() { sed 1d "$1" | grep -o '!\[[^]]*\]([^)]*)' | sed 's/^[^(]*(//; s/)$//; s/\.pt-BR\.png$/.png/' | tr '\n' ' '; }
links() { sed 1d "$1" | grep -v '^\[[^]]*\]: ' | sed 's/!\[[^]]*\]([^)]*)//g' | grep -o '\]([^)]*)' | sed 's/^](//; s/)$//; s/\.pt-BR\.md/.md/' | grep -v -E '^(https?:|mailto:|#)' | LC_ALL=C sort -u | tr '\n' ' '; }
selector() { sed -n 1p "$1"; }
# doc_pair <English file> (the pt-BR pair is the same name with .pt-BR.md)
doc_pair() {
  en="$root/$1"; pt="$root/${1%.md}.pt-BR.md"; r="doc $1"
  if [ ! -f "$en" ]; then ko "$r: the English file is missing ($1)"; return; fi
  if [ ! -f "$pt" ]; then ko "$r: the pt-BR pair is missing (${1%.md}.pt-BR.md)"; return; fi
  check "$r: ## headings" "$(h2 "$pt")" "$(h2 "$en")"
  check "$r: code fences" "$(fences "$pt")" "$(fences "$en")"
  check "$r: images" "$(images "$pt")" "$(images "$en")"
  check "$r: relative links" "$(links "$pt")" "$(links "$en")"
  if selector "$en" | grep -q 'pt-BR\.md'; then ok "$r: language selector in English"; else ko "$r: the first line of the English file does not link to pt-BR"; fi
  if selector "$pt" | grep -q '\.md'; then ok "$r: language selector in pt-BR"; else ko "$r: the first line of the pt-BR file does not link to English"; fi
}
printf '%s\n' "public document pairs"
for f in $docs; do doc_pair "$f"; done

if [ -z "${1-}" ]; then
  printf '%s\n' "red on a copy"
  mkdir -p "$tmp/core" "$tmp/agents" || exit 2
  cp -R "$m" "$tmp/core/template" && cp -R "$a" "$tmp/agents/claude-code" || exit 2
  mkdir -p "$tmp/hosts/vscode" "$tmp/docs" || exit 2
  for f in $docs; do cp "$root/$f" "$tmp/$f" && cp "$root/${f%.md}.pt-BR.md" "$tmp/${f%.md}.pt-BR.md" || exit 2; done
  awk '/^## / && !done { done = 1; next } { print }' "$root/SECURITY.pt-BR.md" > "$tmp/SECURITY.pt-BR.md"
  out=$(sh "$here/languages.sh" "$tmp" 2>&1); rc=$?
  if [ "$rc" -eq 1 ] && printf '%s\n' "$out" | grep -q 'FAIL  doc SECURITY.md: ## headings'; then ok "one ## heading fewer in the SECURITY pt-BR: flagged"; else ko "one ## heading fewer in the SECURITY pt-BR: flagged (exited $rc)"; fi
  cp "$root/SECURITY.pt-BR.md" "$tmp/SECURITY.pt-BR.md"
  rm "$tmp/hosts/vscode/README.pt-BR.md"
  if sh "$here/languages.sh" "$tmp" 2>&1 | grep -q 'FAIL  doc hosts/vscode/README.md: the pt-BR pair is missing'; then ok "without hosts/vscode/README.pt-BR.md: flagged"; else ko "without hosts/vscode/README.pt-BR.md: flagged"; fi
  cp "$root/hosts/vscode/README.pt-BR.md" "$tmp/hosts/vscode/README.pt-BR.md"
  rm "$tmp/core/template/en/PHASE.md"
  out=$(sh "$here/languages.sh" "$tmp" 2>&1); rc=$?
  if [ "$rc" -eq 1 ] && printf '%s\n' "$out" | grep -q 'FAIL  template/PHASE.md: the English pair is missing'; then ok "without en/PHASE.md: exits 1 and names the file"; else ko "without en/PHASE.md: exits 1 and names the file (exited $rc)"; fi
  cp "$m/en/PHASE.md" "$tmp/core/template/en/PHASE.md"
  rm "$tmp/agents/claude-code/en/skills/refine/SKILL.md"
  if sh "$here/languages.sh" "$tmp" >/dev/null 2>&1; then ko "without en/skills/refine/SKILL.md: exits 1"; else ok "without en/skills/refine/SKILL.md: exits 1"; fi
  cp "$a/en/skills/refine/SKILL.md" "$tmp/agents/claude-code/en/skills/refine/SKILL.md"
  mkdir -p "$tmp/agents/claude-code/en/skills/extra" && printf 'x\n' > "$tmp/agents/claude-code/en/skills/extra/SKILL.md"
  if sh "$here/languages.sh" "$tmp" 2>&1 | grep -q 'en/skills/extra/SKILL.md: no pt-BR pair'; then ok "en/ with a file without a pt-BR pair: flagged"; else ko "en/ with a file without a pt-BR pair: flagged"; fi
  rm -r "$tmp/agents/claude-code/en/skills/extra"
  printf '{{AGENT_EXTRA}}\n' >> "$tmp/agents/claude-code/en/COMMANDS.md"
  if sh "$here/languages.sh" "$tmp" 2>&1 | grep -q 'FAIL  COMMANDS.md: {{…}} placeholders'; then ok "an extra placeholder in en: flagged"; else ko "an extra placeholder in en: flagged"; fi
fi

suite_end
