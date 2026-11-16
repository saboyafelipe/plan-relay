#!/bin/sh
# Release by tag: the logic that .github/workflows/release.yml calls, testable here
# (tools/tests/release.sh). Every subcommand first checks the tag with tools/versions.sh --tag.
#
# Usage, from any folder:
#   sh tools/release.sh info <tag>                key=value lines for GITHUB_OUTPUT: package, version,
#                                                 pre_release (true when the extension's minor is odd) and,
#                                                 for the extension, vsix (the file name vsce package gives)
#   sh tools/release.sh notes <tag>               the body of the version's CHANGELOG section, without the
#                                                 heading; exits 1 when the section is missing or empty
#   sh tools/release.sh github <tag> [asset…]     creates the tag's GitHub Release with the notes and assets;
#                                                 if it already exists, only re-uploads (--clobber), to redo
#                                                 a publication that failed midway
#   --root <folder>, before the subcommand, changes the root (the suites use it on a copy)
# Exits 0 on success, 1 when the tag does not match or something is missing, 2 without jq.
#
# Where the notes come from: the extension, from hosts/vscode/CHANGELOG.md (section "## [X.Y.Z]", the
# one the store shows); the plugin, from the root CHANGELOG.md (section "## [claude-code-vX.Y.Z]").
# Pre-release: an odd minor on the extension (0.1.x, 0.3.x) ships as a pre-release on both stores
# and on the GitHub Release; an even minor ships as a regular release. The plugin has no pre-release.

case "$0" in */*) here=${0%/*} ;; *) here=. ;; esac
versions="$here/versions.sh"

fail() { printf 'release.sh: %s\n' "$1" >&2; exit 1; }

root=
if [ "${1-}" = --root ]; then
  [ -n "${2-}" ] || fail "--root needs a folder"
  root=$2; shift 2
fi
[ -n "$root" ] || root=$(git -C "$here" rev-parse --show-toplevel 2>/dev/null) || root=$(cd "$here/.." && pwd)

mode=${1-}
[ -n "$mode" ] || fail "usage: sh tools/release.sh [--root <folder>] info|notes|github <tag> [asset…]"
tag=${2-}
[ -n "$tag" ] || fail "$mode needs a tag (<package>-v<X.Y.Z>)"
shift 2

# Checks the tag; versions.sh says what diverges. From here on, package and version are right.
sh "$versions" --root "$root" --tag "$tag" >/dev/null || exit $?
package=${tag%-v*}
version=${tag##*-v}

pre_release=false
case "$package" in
  vscode)
    minor=${version#*.}; minor=${minor%%.*}
    [ $((minor % 2)) -eq 1 ] && pre_release=true
    changelog=hosts/vscode/CHANGELOG.md section=$version title="Plan Relay for VS Code $version" ;;
  claude-code)
    changelog=CHANGELOG.md section=$tag title="Plan Relay for Claude Code $version" ;;
  *) fail "the package $package has no release defined" ;;
esac

# notes: the body of the "## [<section>]" section (with or without " - date" after it), up to the
# next "## ", without the blank lines at the ends.
notes() {
  [ -f "$root/$changelog" ] || fail "$changelog is missing"
  body=$(awk -v s="## [$section]" '
    index($0, "## ") == 1 { if (inside) exit; if (index($0, s) == 1) { inside = 1; next } }
    inside { lines[++n] = $0 }
    END {
      i = 1; while (i <= n && lines[i] ~ /^[ \t]*$/) i++
      f = n; while (f >= i && lines[f] ~ /^[ \t]*$/) f--
      for (k = i; k <= f; k++) print lines[k]
    }' "$root/$changelog")
  [ -n "$body" ] || fail "$changelog has no \"## [$section]\" section, or it is empty"
  printf '%s\n' "$body"
}

case "$mode" in
  info)
    printf 'package=%s\nversion=%s\npre_release=%s\n' "$package" "$version" "$pre_release"
    [ "$package" = vscode ] && printf 'vsix=%s\n' "plan-relay-$version.vsix"
    exit 0 ;;
  notes)
    notes ;;
  github)
    for asset in "$@"; do
      [ -z "$asset" ] || [ -f "$asset" ] || fail "the asset $asset does not exist"
    done
    file=$(mktemp) || exit 1
    trap 'rm -f "$file"' EXIT
    notes > "$file" || exit 1
    # Empty assets (the plugin passes "") are dropped from the list.
    for asset in "$@"; do shift; [ -z "$asset" ] || set -- "$@" "$asset"; done
    if gh release view "$tag" ${GITHUB_REPOSITORY:+--repo "$GITHUB_REPOSITORY"} >/dev/null 2>&1; then
      printf 'release.sh: the release %s already exists; only the assets are uploaded again\n' "$tag"
      [ "$#" -eq 0 ] || gh release upload "$tag" "$@" --clobber ${GITHUB_REPOSITORY:+--repo "$GITHUB_REPOSITORY"}
    else
      if [ "$pre_release" = true ]; then
        gh release create "$tag" "$@" ${GITHUB_REPOSITORY:+--repo "$GITHUB_REPOSITORY"} --verify-tag --title "$title" --notes-file "$file" --prerelease
      else
        gh release create "$tag" "$@" ${GITHUB_REPOSITORY:+--repo "$GITHUB_REPOSITORY"} --verify-tag --title "$title" --notes-file "$file"
      fi
    fi ;;
  *)
    fail "unknown subcommand: $mode (info, notes or github)" ;;
esac
