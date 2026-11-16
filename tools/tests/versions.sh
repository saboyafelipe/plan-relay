#!/bin/sh
# Proves tools/versions.sh: the up-to-date tree passes; each manifest with a diverging version,
# on a copy, fails naming the file; each package's right tag passes, one with another version
# and a malformed one fail; --version prints the version.
# The manifest list comes from the script itself (--manifests), its single source.
# Usage, from any folder: sh tools/tests/versions.sh
# Exits 0 with "all good" when everything passes; needs jq.

case "$0" in */*) here=${0%/*} ;; *) here=. ;; esac
here=$(cd "$here" && pwd) || exit 2
root=$(dirname "$(dirname "$here")")
script="$root/tools/versions.sh"
# shellcheck source=tools/tests/lib.sh
. "$here/lib.sh"
suite_start tools/tests/versions.sh 120 jq

# expect <label> <expected code> <text the output has (empty: not checked)> <args…>
expect() {
  label=$1 code=$2 text=$3; shift 3
  out=$(sh "$script" "$@" 2>&1); rc=$?
  if [ "$rc" -ne "$code" ]; then ko "$label (exited $rc, expected $code): $out"; return; fi
  if [ -n "$text" ] && ! printf '%s\n' "$out" | grep -q -F -- "$text"; then ko "$label (no \"$text\" in: $out)"; return; fi
  ok "$label"
}

if [ ! -f "$script" ]; then ko "tools/versions.sh exists"; printf '%s\n' "tools/tests/versions.sh: $failures failure(s)"; exit 1; fi

printf '%s\n' "repository tree"
expect "no argument: both packages up to date" 0 "" --root "$root"
manifests=$(sh "$script" --manifests) || ko "--manifests exits 0"
packages=$(printf '%s\n' "$manifests" | cut -f1 | uniq)
for p in vscode claude-code; do
  printf '%s\n' "$packages" | grep -q -x "$p" || ko "--manifests has the package $p"
done
for p in $packages; do
  v=$(sh "$script" --root "$root" --version "$p"); rc=$?
  if [ "$rc" -eq 0 ] && printf '%s\n' "$v" | grep -q -E '^[0-9]+\.[0-9]+\.[0-9]+$'; then ok "--version $p prints $v"; else ko "--version $p (exited $rc, \"$v\")"; continue; fi
  expect "--tag $p-v$v: exits 0" 0 "" --root "$root" --tag "$p-v$v"
  expect "--tag $p-v9.9.9: another version, exits 1" 1 "9.9.9" --root "$root" --tag "$p-v9.9.9"
  expect "--tag v$v: no package, exits 1" 1 "v$v" --root "$root" --tag "v$v"
  expect "--tag $p-$v: no v, exits 1" 1 "$p-$v" --root "$root" --tag "$p-$v"
  expect "--tag $p-v1.2: incomplete semver, exits 1" 1 "$p-v1.2" --root "$root" --tag "$p-v1.2"
done
expect "--tag zcode-v0.1.0: unknown package, exits 1" 1 "zcode-v0.1.0" --root "$root" --tag zcode-v0.1.0
expect "--tag with no value: exits 1" 1 "" --root "$root" --tag
expect "--version of an unknown package: exits 1" 1 "zcode" --root "$root" --version zcode
expect "unknown option: exits 1" 1 "--nothing" --root "$root" --nothing

printf '%s\n' "marketplace entries"
# A user who installs plan-relay without choosing gets the English package; pt-BR is plan-relay-pt-br.
# Each entry points at the package whose manifest carries the same name.
mk="$root/.claude-plugin/marketplace.json"
check "the marketplace has the two entries, English first" "$(jq -r '[.plugins[].name] | join(" ")' "$mk")" "plan-relay plan-relay-pt-br"
check "plan-relay serves dist/claude-code-en" "$(jq -r '.plugins[] | select(.name == "plan-relay") | .source' "$mk")" "./dist/claude-code-en"
check "plan-relay-pt-br serves dist/claude-code" "$(jq -r '.plugins[] | select(.name == "plan-relay-pt-br") | .source' "$mk")" "./dist/claude-code"
for e in plan-relay plan-relay-pt-br; do
  src=$(jq -r --arg n "$e" '.plugins[] | select(.name == $n) | .source' "$mk")
  check "$e: the manifest of $src has the same name" "$(jq -r .name "$root/$src/.claude-plugin/plugin.json")" "$e"
done

printf '%s\n' "red on a copy"
make_copy() {
  rm -rf "$tmp/r" && mkdir -p "$tmp/r" || exit 2
  printf '%s\n' "$manifests" | cut -f2 | sort -u | while IFS= read -r f; do
    mkdir -p "$tmp/r/$(dirname "$f")" && cp "$root/$f" "$tmp/r/$f" || exit 2
  done
}
make_copy
expect "up-to-date copy: exits 0" 0 "" --root "$tmp/r"
# each diverging manifest: the package version set to 9.8.7 in that one only
printf '%s\n' "$manifests" | while IFS="$(printf '\t')" read -r p f filter; do
  make_copy
  jq "($filter) = \"9.8.7\"" "$root/$f" > "$tmp/new.json" && mv "$tmp/new.json" "$tmp/r/$f" || exit 2
  out=$(sh "$script" --root "$tmp/r" 2>&1); rc=$?
  # With two manifests a package has no majority, so the message may name the file as the reference side
  # ("<package>: <other> has X, <file> has 9.8.7"); it still names the package, the file and the version.
  if [ "$rc" -eq 1 ] && printf '%s\n' "$out" | grep -q -F "$p: " && printf '%s\n' "$out" | grep -q -F "$f" && printf '%s\n' "$out" | grep -q -F "9.8.7"; then
    ok "$f ($filter) diverging: exits 1 and names the file"
  else
    ko "$f ($filter) diverging: exits 1 and names the file (exited $rc: $out)"; echo x >> "$tmp/failed"
  fi
  v=$(sh "$script" --root "$root" --version "$p")
  if sh "$script" --root "$tmp/r" --tag "$p-v$v" >/dev/null 2>&1; then
    ko "$f diverging: --tag $p-v$v exits 1"; echo x >> "$tmp/failed"
  else ok "$f diverging: --tag $p-v$v exits 1"; fi
done
[ -f "$tmp/failed" ] && failures=$((failures + $(wc -l < "$tmp/failed")))
make_copy
jq '.plugins |= map(select(.name != "plan-relay-pt-br"))' "$root/.claude-plugin/marketplace.json" > "$tmp/new.json" && mv "$tmp/new.json" "$tmp/r/.claude-plugin/marketplace.json"
expect "marketplace without the plan-relay-pt-br entry: exits 1 and names it" 1 "plan-relay-pt-br" --root "$tmp/r"
make_copy
rm "$tmp/r/package-lock.json"
expect "without package-lock.json: exits 1 and names the file" 1 "package-lock.json" --root "$tmp/r"
make_copy
jq '.version = "0.1"' "$root/hosts/vscode/package.json" > "$tmp/new.json" && mv "$tmp/new.json" "$tmp/r/hosts/vscode/package.json"
jq '.packages["hosts/vscode"].version = "0.1"' "$root/package-lock.json" > "$tmp/new.json" && mv "$tmp/new.json" "$tmp/r/package-lock.json"
expect "a version that is not semver, even if equal everywhere: exits 1" 1 "0.1" --root "$tmp/r"

suite_end
