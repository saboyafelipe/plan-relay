#!/bin/sh
# Installs the CI linters at fixed versions into a folder: for Linux x86_64 (the GitHub runner) and
# for macOS (arm64 and x86_64, so tools/gates.sh can fetch them on a contributor's Mac).
# The tools: shellcheck, actionlint, zizmor and lychee. Each archive is checked against the sha256 below
# before it is unpacked, so a release asset replaced upstream fails the job instead of running.
# Dependabot does not see these versions: raising one is by hand, here, with the digest from the
# release page (gh api repos/<owner>/<repo>/releases/tags/<tag> --jq '.assets[] | .name + " " + .digest').
#
# Usage: sh tools/ci-tools.sh <folder> <tool>...
# Exits 0 with every tool in <folder>, 1 when a download or a checksum fails or the platform has no
# pinned binaries, 2 on bad usage.

set -eu

usage() {
  echo "usage: sh tools/ci-tools.sh <folder> shellcheck|actionlint|zizmor|lychee..." >&2
  exit 2
}

[ $# -ge 2 ] || usage
dir=$1
shift

sha256() {
  if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1"; else shasum -a 256 "$1"; fi | cut -d ' ' -f 1
}

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
mkdir -p "$dir"

# install <tool> <version> <url> <sha256>
install() {
  file=${3##*/}
  curl -fsSL --retry 3 -o "$tmp/$file" "$3" || { echo "ci-tools.sh: $1: download failed: $3" >&2; exit 1; }
  got=$(sha256 "$tmp/$file")
  if [ "$got" != "$4" ]; then
    echo "ci-tools.sh: $1: sha256 $got, expected $4 ($3)" >&2
    exit 1
  fi
  mkdir "$tmp/$1"
  case $file in
    *.tar.xz) tar -xJf "$tmp/$file" -C "$tmp/$1" ;;
    *) tar -xzf "$tmp/$file" -C "$tmp/$1" ;;
  esac
  bin=$(find "$tmp/$1" -type f -name "$1" | sed -n 1p)
  [ -n "$bin" ] || { echo "ci-tools.sh: $1: no $1 binary in $file" >&2; exit 1; }
  cp "$bin" "$dir/$1"
  chmod +x "$dir/$1"
  echo "$1 $2"
}

# The platform picks the release asset and its digest; the version of each tool is one, below.
case "$(uname -s) $(uname -m)" in
  "Linux x86_64") platform=linux-x86_64 ;;
  "Darwin arm64") platform=darwin-arm64 ;;
  "Darwin x86_64") platform=darwin-x86_64 ;;
  *) echo "ci-tools.sh: no pinned binaries for $(uname -s) $(uname -m)" >&2; exit 1 ;;
esac

# pick <linux-x86_64> <darwin-arm64> <darwin-x86_64>: the argument for this platform.
pick() {
  case $platform in
    linux-x86_64) echo "$1" ;;
    darwin-arm64) echo "$2" ;;
    darwin-x86_64) echo "$3" ;;
  esac
}

for tool; do
  case $tool in
    shellcheck)
      v=0.11.0
      a=$(pick linux.x86_64 darwin.aarch64 darwin.x86_64)
      install shellcheck "$v" "https://github.com/koalaman/shellcheck/releases/download/v$v/shellcheck-v$v.$a.tar.xz" \
        "$(pick 8c3be12b05d5c177a04c29e3c78ce89ac86f1595681cab149b65b97c4e227198 \
          56affdd8de5527894dca6dc3d7e0a99a873b0f004d7aabc30ae407d3f48b0a79 \
          3c89db4edcab7cf1c27bff178882e0f6f27f7afdf54e859fa041fca10febe4c6)" ;;
    actionlint)
      v=1.7.12
      a=$(pick linux_amd64 darwin_arm64 darwin_amd64)
      install actionlint "$v" "https://github.com/rhysd/actionlint/releases/download/v$v/actionlint_${v}_$a.tar.gz" \
        "$(pick 8aca8db96f1b94770f1b0d72b6dddcb1ebb8123cb3712530b08cc387b349a3d8 \
          aba9ced2dee8d27fecca3dc7feb1a7f9a52caefa1eb46f3271ea66b6e0e6953f \
          5b44c3bc2255115c9b69e30efc0fecdf498fdb63c5d58e17084fd5f16324c644)" ;;
    zizmor)
      v=1.16.3
      a=$(pick x86_64-unknown-linux-gnu aarch64-apple-darwin x86_64-apple-darwin)
      install zizmor "$v" "https://github.com/zizmorcore/zizmor/releases/download/v$v/zizmor-$a.tar.gz" \
        "$(pick f0070985e94dd7b29e30abe249f6c7b2f14078c35a8f2de78e2d6ce89de0c132 \
          d3967cfe45a2c99338dd116a5a3989787f0b9b3cd2e342ba354929f959de856f \
          9a309feafef2ddc01cdd855144118aa941d59c7d88983155c3a8d24b24f693b0)" ;;
    lychee)
      v=0.24.2
      a=$(pick x86_64-unknown-linux-gnu aarch64-apple-darwin x86_64-apple-darwin)
      install lychee "$v" "https://github.com/lycheeverse/lychee/releases/download/lychee-v$v/lychee-$a.tar.gz" \
        "$(pick 1f4e0ef7f6554a6ed33dd7ac144fb2e1bbed98598e7af973042fc5cd43951c9a \
          c9d3740ea2d891854d37116c9fba840f37b6e7c89d330e7db84ac333631c4977 \
          887503a9cff667d322b8d0892b40bf49976eb9507af8483220a3706cdad55978)" ;;
    *) usage ;;
  esac
done
