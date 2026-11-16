#!/bin/sh
# Checks the local links of every versioned Markdown file with lychee, offline: a relative link to a
# file or folder that does not exist fails. Links to the web are not followed (no network in the gate,
# so a slow or moved site never turns CI red).
#
# One kind of link is left out on purpose: the GitHub-relative ones (../blob/main/... in the pull
# request template), which only resolve on github.com, from the page they are shown on.
#
# Usage, from any folder: sh tools/tests/links.sh
# Exits 0 with no broken link, 1 with any, 2 without git or without lychee (CI installs it with
# tools/ci-tools.sh).

root=$(git -C "$(dirname "$0")" rev-parse --show-toplevel 2>/dev/null) || { echo "links.sh: not inside a git repository" >&2; exit 2; }
command -v lychee >/dev/null 2>&1 || { echo "links.sh: lychee not found" >&2; exit 2; }
cd "$root" || exit 2

echo "== $(lychee --version)"
git ls-files -- '*.md' |
  lychee --offline --no-progress --exclude '/blob/main/' --files-from -
