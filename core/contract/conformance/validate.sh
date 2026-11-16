#!/bin/sh
# Validates contract 1 against the JSON Schemas in core/contract/schema/:
#   status.schema.json  the --json output of the given status.sh on each suite case, and the expected.json files
#   check.schema.json   the --json output of the given check.sh, on this machine
#   plan.schema.json    the plan.json of the cases, of the template fixture and of the examples
#   giveup-preview.schema.json  the preview.json of the edit cases (edit.sh compares them with task.sh's output)
# And the other way round: each invalid/<schema>/*.json must be refused by core/contract/schema/<schema>.schema.json.
# Usage, from the repository root: sh core/contract/conformance/validate.sh <status.sh> <check.sh>
# Needs jq, node and ajv from the extension's devDependencies (npm ci at the repository root, which installs the npm workspaces).
# Exits 0 when everything passes, 1 when something fails, 2 on wrong usage.

if [ $# -ne 2 ] || [ ! -f "$1" ] || [ ! -f "$2" ]; then echo "Usage: sh validate.sh <status.sh> <check.sh>" >&2; exit 2; fi
command -v node >/dev/null || { echo "validate.sh needs node" >&2; exit 2; }

here=$(cd "$(dirname "$0")" && pwd) || exit 2
root=$(dirname "$(dirname "$(dirname "$here")")")
validator="$root/hosts/vscode/scripts/validate-schema.mjs"
schemas="$root/core/contract/schema"
[ -d "$root/node_modules/ajv" ] || { echo "validate.sh: ajv is missing; run npm ci at the repository root" >&2; exit 2; }

tmp=$(mktemp -d) || exit 2
trap 'rm -rf "$tmp"' EXIT
rc=0

# Comparing with the expected is run.sh's job; here only each case's output matters.
sh "$here/run.sh" --out "$tmp/status" "$1" >/dev/null || rc=1
# check.sh exits 1 when something required is missing; the JSON is still valid.
sh "$2" --json > "$tmp/check.json"

echo "== status.schema.json"
node "$validator" "$schemas/status.schema.json" "$tmp"/status/*.json "$here"/cases/*/expected.json || rc=1
echo "== check.schema.json"
node "$validator" "$schemas/check.schema.json" "$tmp/check.json" || rc=1
echo "== plan.schema.json"
node "$validator" "$schemas/plan.schema.json" "$here"/cases/*/agent_plans/*/plan.json \
  "$root"/core/template/tests/fixture/agent_plans/*/plan.json \
  "$root"/fixtures/*/agent_plans/*/plan.json || rc=1
echo "== giveup-preview.schema.json"
node "$validator" "$schemas/giveup-preview.schema.json" "$here"/edits/*/preview.json || rc=1

# Each schema names itself: an absolute $id that ends in its own file name.
echo "== \$id"
for schema in "$schemas"/*.schema.json; do
  file=$(basename "$schema")
  if jq -e --arg f "$file" '(."$id" // "") | test("^https://.+/" + ($f | gsub("\\."; "\\.")) + "$")' "$schema" >/dev/null; then
    echo "  ok    $file"
  else
    echo "  FAIL  $file: \$id missing or not ending in /$file"
    rc=1
  fi
done

# A schema that accepts everything would pass all of the above; these files break one rule each.
for dir in "$here"/invalid/*/; do
  name=$(basename "$dir")
  echo "== $name.schema.json refuses"
  if [ ! -f "$schemas/$name.schema.json" ]; then echo "  FAIL  $dir: no schema $name.schema.json"; rc=1; continue; fi
  for file in "$dir"*.json; do
    # Not JSON would be refused for the wrong reason.
    if ! jq empty "$file" 2>/dev/null; then echo "  FAIL  $file: not JSON"; rc=1; continue; fi
    node "$validator" "$schemas/$name.schema.json" "$file" > "$tmp/refused.txt"
    case $? in
      0) echo "  FAIL  $file: accepted"; rc=1 ;;
      1) echo "  ok    $file"; sed -n '/^        /p' "$tmp/refused.txt" ;;
      *) echo "  FAIL  $file: the validator did not run"; rc=1 ;;
    esac
  done
done

if [ "$rc" -eq 0 ]; then echo "validate.sh: all good"; else echo "validate.sh: failed"; fi
exit "$rc"
