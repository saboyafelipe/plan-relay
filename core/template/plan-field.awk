# A text field of plan.json, read as the contract says (core/contract/contract.md, "plan.json"): only
# a key of the top-level object counts, not one nested in another value nor one quoted inside a
# string; the last one wins; a value that is not a string, or has a backslash, gives nothing. The
# single source: tools/script-strings.sh embeds this file in status.sh, task.sh and map.sh as the
# variable PLAN_FIELD_AWK, between the lines "# >>> plan-field" and "# <<< plan-field", and they run
#   awk -v field=<key> "$PLAN_FIELD_AWK" plan.json
# which prints the value, without a line break, or nothing. The reader in core/reader
# (planField in status.ts) scans the same way. No single quotes in this file, since it goes inside a
# single-quoted sh string.
{ s = s $0 "\n" }
END {
  n = length(s); depth = 0; top = 0; state = "key"; key = ""; found = ""
  for (i = 1; i <= n; i++) {
    c = substr(s, i, 1)
    if (c == "\"") {
      j = i + 1; escaped = 0
      while (j <= n && substr(s, j, 1) != "\"") {
        if (substr(s, j, 1) == "\\") { escaped = 1; j++ }
        j++
      }
      text = substr(s, i + 1, j - i - 1)
      i = j
      if (depth != 1 || !top) continue
      if (state == "key") { key = text; state = "colon" }
      else if (state == "value") { if (key == field) found = escaped ? "" : text; state = "comma" }
    } else if (c == "{" || c == "[") {
      if (depth == 1 && state == "value") { if (key == field) found = ""; state = "comma" }
      depth++
      if (depth == 1) { top = (c == "{"); state = "key" }
    } else if (c == "}" || c == "]") {
      depth--
    } else if (depth == 1 && top) {
      if (c == ":" && state == "colon") state = "value"
      else if (c == ",") state = "key"
      else if (state == "value" && c !~ /[ \t\r\n]/) { if (key == field) found = ""; state = "comma" }
    }
  }
  printf "%s", found
}
