#!/bin/sh
# Versions per package: each package has a single version, the same in all of its
# manifests, and is published with the tag <package>-v<version> (vscode-v0.1.0, claude-code-v0.1.0).
#
# Usage, from any folder:
#   sh tools/versions.sh                     checks the packages; exits 1 naming the manifest that diverges
#   sh tools/versions.sh --tag <tag>         accepts only <package>-v<semver>; checks the tag's package and
#                                           that the version matches (the release workflow uses this mode)
#   sh tools/versions.sh --version <package>  prints the package version, after checking it
#   sh tools/versions.sh --manifests         lists "package<TAB>file<TAB>jq filter", one per line
#   --root <folder>, before the mode, changes the root (the suites use it on a copy)
# Exits 0 when everything matches, 1 when something diverges or the usage is wrong, 2 without jq.

# The single place for packages and manifests: "package<TAB>file<TAB>jq filter of the version".
# The first line of each package is the reference for the messages. A new package enters here
# with its lines and gets the tag <package>-v<version>. The claude-code package is two marketplace
# entries (plan-relay in English, plan-relay-pt-br) with one version and one tag.
manifests() {
  printf '%s\t%s\t%s\n' \
    vscode hosts/vscode/package.json .version \
    vscode package-lock.json '.packages["hosts/vscode"].version' \
    claude-code agents/claude-code/.claude-plugin/plugin.json .version \
    claude-code agents/claude-code/en/.claude-plugin/plugin.json .version \
    claude-code dist/claude-code/.claude-plugin/plugin.json .version \
    claude-code dist/claude-code-en/.claude-plugin/plugin.json .version \
    claude-code .claude-plugin/marketplace.json '.plugins[]|select(.name=="plan-relay")|.version' \
    claude-code .claude-plugin/marketplace.json '.plugins[]|select(.name=="plan-relay-pt-br")|.version'
}

semver='^[0-9][0-9]*\.[0-9][0-9]*\.[0-9][0-9]*$'
tab=$(printf '\t')

fail() { printf 'versions.sh: %s\n' "$1" >&2; exit 1; }

root=
if [ "${1-}" = --root ]; then
  [ -n "${2-}" ] || fail "--root needs a folder"
  root=$2; shift 2
fi
if [ "${1-}" = --manifests ]; then manifests; exit 0; fi
[ -n "$root" ] || root=$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null) || root=$(cd "$(dirname "$0")/.." && pwd)
[ -d "$root" ] || fail "the root $root does not exist"
command -v jq >/dev/null 2>&1 || { echo "versions.sh: jq not found" >&2; exit 2; }

packages() { manifests | cut -f1 | uniq; }
package_list() { packages | paste -s -d , - | sed "s/,/, /g"; }
exists() { packages | grep -q -x -F -- "$1"; }

# check_package <package>: prints the version and exits 0, or lists the differences on stderr and exits 1.
# The reference is the version most manifests have (on a tie, the first one's), so the
# message names the file that fell behind and not the ones that are right.
check_package() {
  rc=0 seen=
  lines=$(manifests | grep "^$1$tab")
  while IFS="$tab" read -r _ file filter; do
    label=$file
    [ "$filter" = .version ] || label="$file ($filter)"
    if [ ! -f "$root/$file" ]; then printf '%s: %s is missing\n' "$1" "$file" >&2; rc=1; continue; fi
    v=$(jq -r "$filter" "$root/$file" 2>/dev/null)
    if [ -z "$v" ] || [ "$v" = null ]; then printf '%s: %s has no version\n' "$1" "$label" >&2; rc=1; continue; fi
    seen="$seen$v$tab$label
"
  done <<EOF
$lines
EOF
  [ "$rc" -eq 0 ] || return 1
  ref=$(printf '%s' "$seen" | cut -f1 | awk '{ n[$0]++; if (!($0 in o)) o[$0] = NR } END { for (v in n) if (n[v] > m || (n[v] == m && o[v] < p)) { m = n[v]; p = o[v]; r = v } print r }')
  ref_file=$(printf '%s' "$seen" | awk -F "$tab" -v r="$ref" '$1 == r { print $2; exit }')
  while IFS="$tab" read -r v label; do
    [ "$v" = "$ref" ] || { printf '%s: %s has %s, %s has %s\n' "$1" "$label" "$v" "$ref_file" "$ref" >&2; rc=1; }
  done <<EOF
$(printf '%s' "$seen")
EOF
  [ "$rc" -eq 0 ] || return 1
  if ! printf '%s\n' "$ref" | grep -q "$semver"; then
    printf '%s: the version %s (%s) is not X.Y.Z\n' "$1" "$ref" "$ref_file" >&2; return 1
  fi
  printf '%s\n' "$ref"
}

case "${1-}" in
  "")
    rc=0
    for p in $(packages); do
      if v=$(check_package "$p"); then printf '%s %s\n' "$p" "$v"; else rc=1; fi
    done
    exit "$rc" ;;
  --tag)
    [ -n "${2-}" ] || fail "--tag needs a tag (<package>-v<X.Y.Z>)"
    tag=$2
    p=${tag%-v*}
    v=${tag##*-v}
    if [ "$p" = "$tag" ] || ! exists "$p" || ! printf '%s\n' "$v" | grep -q "$semver"; then
      fail "the tag $tag is not of the form <package>-v<X.Y.Z>, with package: $(package_list)"
    fi
    current=$(check_package "$p") || exit 1
    [ "$v" = "$current" ] || fail "the tag $tag says $v, but the package $p is at $current"
    printf '%s %s: the tag %s matches\n' "$p" "$current" "$tag" ;;
  --version)
    [ -n "${2-}" ] || fail "--version needs a package: $(package_list)"
    exists "$2" || fail "the package $2 does not exist; there are: $(package_list)"
    check_package "$2" || exit 1 ;;
  *)
    fail "unknown option: $1 (usage: sh tools/versions.sh [--root <folder>] [--tag <tag> | --version <package> | --manifests])" ;;
esac
