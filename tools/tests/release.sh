#!/bin/sh
# Proves tools/release.sh: `info` for a tag of each package (pre-release by an odd minor only on
# the extension), `notes` taken from the CHANGELOG (middle section, last section, missing version,
# empty section), `github` with a fake gh (creates the release, or only re-uploads when it already
# exists) and the refused tags (wrong version, malformed). Runs on a copy of the manifests.
# Usage, from any folder: sh tools/tests/release.sh
# Exits 0 with "all good" when everything passes; needs jq.

case "$0" in */*) here=${0%/*} ;; *) here=. ;; esac
here=$(cd "$here" && pwd) || exit 2
root=$(dirname "$(dirname "$here")")
script="$root/tools/release.sh"
# shellcheck source=tools/tests/lib.sh
. "$here/lib.sh"
suite_start tools/tests/release.sh 120 jq

if [ ! -f "$script" ]; then ko "tools/release.sh exists"; suite_end; fi

r="$tmp/r"

# The copy: the manifests of tools/versions.sh, versions.sh itself and sample CHANGELOGs.
sh "$root/tools/versions.sh" --manifests | cut -f2 | sort -u | while IFS= read -r f; do
  mkdir -p "$r/$(dirname "$f")" && cp "$root/$f" "$r/$f" || exit 2
done
mkdir -p "$r/tools" && cp "$root/tools/versions.sh" "$r/tools/versions.sh" || exit 2

# set_version <package> <X.Y.Z>: puts the version in every manifest of the package, on the copy.
set_version() {
  sh "$root/tools/versions.sh" --manifests | while IFS="$(printf '\t')" read -r p f filter; do
    [ "$p" = "$1" ] || continue
    jq "($filter) = \"$2\"" "$r/$f" > "$tmp/new.json" && mv "$tmp/new.json" "$r/$f" || exit 2
  done
}
set_version vscode 0.3.0
set_version claude-code 0.2.0

cat > "$r/hosts/vscode/CHANGELOG.md" <<'EOF'
# Changelog

Texto de abertura.

## [Unreleased]

- Nothing yet.

## [0.3.0] - 2026-12-01

### Adicionado

- Painel novo.

## [0.2.0] - 2026-11-20

- Seção do meio, sem subtítulo.

## [0.1.0]

- A última seção do arquivo.
- Segunda linha.
EOF
cat > "$r/CHANGELOG.md" <<'EOF'
# Changelog

## [Unreleased]

## [claude-code-v0.2.0] - 2026-12-01

### Adicionado

- Skill nova.

## [vscode-v0.3.0] - 2026-12-01

- Ver hosts/vscode/CHANGELOG.md.

## [claude-code-v0.1.0]

EOF

# run_release <args…>: keeps the output in $out and the code in $rc.
run_release() { out=$(sh "$script" --root "$r" "$@" 2>&1); rc=$?; }
# has_line <label> <text>: the last output contains the text, as a whole line.
has_line() { if printf '%s\n' "$out" | grep -q -x -F -- "$2"; then ok "$1"; else ko "$1 (no \"$2\" in: $out)"; fi; }
lacks() { if printf '%s\n' "$out" | grep -q -F -- "$2"; then ko "$1 (\"$2\" in: $out)"; else ok "$1"; fi; }
# finds <label> <text>: the last output contains the text somewhere.
finds() { if printf '%s\n' "$out" | grep -q -F -- "$2"; then ok "$1"; else ko "$1 (no \"$2\" in: $out)"; fi; }
exits() { if [ "$rc" -eq "$2" ]; then ok "$1"; else ko "$1 (exited $rc, expected $2: $out)"; fi; }
# equals <label> <text>: the last output is exactly the text.
equals() { if [ "$out" = "$2" ]; then ok "$1"; else ko "$1 (got: $out)"; fi; }
# in_log / not_in_log <label> <regex>: the fake gh log has (or lacks) a matching line.
in_log() { if printf '%s\n' "$log" | grep -q -e "$2"; then ok "$1"; else ko "$1 ($log)"; fi; }
not_in_log() { if printf '%s\n' "$log" | grep -q -e "$2"; then ko "$1 ($log)"; else ok "$1"; fi; }

printf '%s\n' "info"
run_release info vscode-v0.3.0
exits "vscode-v0.3.0: exits 0" 0
has_line "vscode: package" "package=vscode"
has_line "vscode: version" "version=0.3.0"
has_line "vscode: an odd minor is a pre-release" "pre_release=true"
has_line "vscode: the .vsix" "vsix=plan-relay-0.3.0.vsix"
set_version vscode 0.4.0
run_release info vscode-v0.4.0
has_line "vscode 0.4.0: an even minor is not a pre-release" "pre_release=false"
set_version vscode 1.1.7
run_release info vscode-v1.1.7
has_line "vscode 1.1.7: the minor is the middle number" "pre_release=true"
set_version vscode 0.3.0
run_release info claude-code-v0.2.0
exits "claude-code-v0.2.0: exits 0" 0
has_line "claude-code: package" "package=claude-code"
has_line "claude-code: version" "version=0.2.0"
has_line "claude-code: no pre-release" "pre_release=false"
lacks "claude-code: no .vsix" "vsix="
run_release info vscode-v9.9.9
exits "wrong version: exits 1" 1
lacks "wrong version: nothing for GITHUB_OUTPUT" "package="
run_release info v0.3.0
exits "tag without a package: exits 1" 1
run_release info vscode-0.3.0
exits "tag without the v: exits 1" 1
run_release info
exits "no tag: exits 1" 1

printf '%s\n' "notes"
run_release notes vscode-v0.3.0
exits "vscode-v0.3.0: exits 0" 0
equals "vscode-v0.3.0: only the section body, without the heading and the blank lines at the ends" "$(printf '%s\n' '### Adicionado' '' '- Painel novo.')"
set_version vscode 0.1.0
run_release notes vscode-v0.1.0
equals "last section of the file" "$(printf '%s\n' '- A última seção do arquivo.' '- Segunda linha.')"
set_version vscode 0.2.0
run_release notes vscode-v0.2.0
equals "middle section, without a subheading" "- Seção do meio, sem subtítulo."
set_version vscode 0.5.0
run_release notes vscode-v0.5.0
exits "version missing from the CHANGELOG: exits 1" 1
finds "missing version: names the file" "hosts/vscode/CHANGELOG.md"
set_version vscode 0.3.0
run_release notes claude-code-v0.2.0
equals "claude-code: section [claude-code-v0.2.0] of the root CHANGELOG.md" "$(printf '%s\n' '### Adicionado' '' '- Skill nova.')"
set_version claude-code 0.1.0
run_release notes claude-code-v0.1.0
exits "empty section: exits 1" 1
set_version claude-code 0.2.0
run_release notes vscode-v9.9.9
exits "notes for a tag with a wrong version: exits 1" 1

printf '%s\n' "github (fake gh)"
mkdir -p "$tmp/bin"
cat > "$tmp/bin/gh" <<'EOF'
#!/bin/sh
printf '%s\n' "$*" >> "$GH_LOG"
case "$1 $2" in
  "release view") [ -n "$GH_EXISTS" ] ;;
  *) exit 0 ;;
esac
EOF
chmod +x "$tmp/bin/gh"
touch "$tmp/plan-relay-0.3.0.vsix"
run_gh() {
  : > "$tmp/gh.log"
  out=$(PATH="$tmp/bin:$PATH" GH_LOG="$tmp/gh.log" GH_EXISTS="$1" GITHUB_REPOSITORY=owner/repo sh "$script" --root "$r" github "$2" "$3" 2>&1); rc=$?
  log=$(cat "$tmp/gh.log")
}
run_gh "" vscode-v0.3.0 "$tmp/plan-relay-0.3.0.vsix"
exits "new release: exits 0" 0
in_log "new release: create with the .vsix and --prerelease (odd minor)" "^release create vscode-v0.3.0 $tmp/plan-relay-0.3.0.vsix .*--prerelease"
in_log "new release: --repo from GITHUB_REPOSITORY" "--repo owner/repo"
in_log "new release: notes from a file" "--notes-file"
run_gh 1 vscode-v0.3.0 "$tmp/plan-relay-0.3.0.vsix"
exits "existing release: exits 0" 0
in_log "existing release: only re-uploads the .vsix" "^release upload vscode-v0.3.0 $tmp/plan-relay-0.3.0.vsix --clobber"
not_in_log "existing release: does not create it again" "^release create"
run_gh "" claude-code-v0.2.0 ""
exits "plugin: exits 0" 0
in_log "plugin: create without an asset" "^release create claude-code-v0.2.0 --repo"
not_in_log "plugin: no --prerelease" "--prerelease"
run_gh "" vscode-v9.9.9 ""
exits "github with a wrong version: exits 1" 1
not_in_log "github with a wrong version: does not call gh" "."
run_gh "" vscode-v0.3.0 "$tmp/missing.vsix"
exits "github with a missing asset: exits 1" 1

suite_end
