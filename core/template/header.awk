# The task header, read and rewritten as the contract says (core/contract/contract.md, "Task header"
# and "What the verbs write"). The single source: tools/script-strings.sh embeds this file in
# status.sh, task.sh, map.sh and core/scripts/boundary.sh as the variable HEADER_AWK, between the
# lines "# >>> header" and "# <<< header", and each awk program of theirs starts with "$HEADER_AWK".
# Only functions: the program that embeds them calls them. No single quotes in this file, since it
# goes inside a single-quoted sh string.
#
# Reading. On the first line of each file, id = hdr_begin() (the key of the file: its id, from the
# file name; hdr_phase gets the folder). Then, on each line, hdr_line(id) returns 1 while the line
# belongs to the header, title line included, and 0 after it; so a program reads the header with the rule
#   hdr_line(id) { next }
# hdr_line first takes one CR off the end of the line, header or body, so a task saved with CRLF reads
# like one saved with LF; a program that calls it on every line sees $0 without the CR.
# The values go to these arrays, by key: state, type, track, tier, repos, blockers, started, finished,
# replaced, gave_up, fell_with, prev_state, title. Any key can be on any header line, Status: too; a
# repeated key keeps its last value. Repos: and Blocked by: lose their spaces and tabs; the title
# loses a leading "<ID> - " or "<ID> — ". hdr_get(id, name) gives the array of that name.
# An id that more than one file has (a duplicated id) gets a key per file: the id for the first file
# read, "<ID>#2", "<ID>#3"… for the next ones; hdr_dup[<ID>] is set and hdr_idof(key) gives the id back.
# The files come in plan order, so the key that is the bare id is the first file of the plan.

function hdr_begin(   n) {
  n = split(FILENAME, hdr_parts, "/")
  hdr_phase = hdr_parts[1]
  hdr_id = hdr_parts[n]
  if (match(hdr_id, /^F[0-9]+-[0-9]+(\.[0-9]+)*/)) hdr_id = substr(hdr_id, RSTART, RLENGTH)
  hdr_on = 1
  if (hdr_id in hdr_seen) { hdr_dup[hdr_id] = 1; return hdr_id "#" (++hdr_seen[hdr_id]) }
  hdr_seen[hdr_id] = 1
  return hdr_id
}

function hdr_idof(key) { sub(/#.*/, "", key); return key }

function hdr_line(id,   k, v) {
  sub(/\r$/, "")
  if (!hdr_on) return 0
  if ($0 ~ /^# /) {
    v = substr($0, 3)
    sub(/^F[0-9]+-[0-9]+(\.[0-9]+)*[ \t]*(—|-)[ \t]*/, "", v)
    title[id] = v
    hdr_on = 0
    return 1
  }
  k = $0
  if (!sub(/:.*/, "", k)) return 1
  v = substr($0, length(k) + 2)
  sub(/^[ \t]*/, "", v)
  if (k == "Status") state[id] = v
  else if (k == "Type") type[id] = v
  else if (k == "Track") track[id] = v
  else if (k == "Tier") tier[id] = v
  else if (k == "Repos") { gsub(/[ \t]/, "", v); repos[id] = v }
  else if (k == "Blocked by") { gsub(/[ \t]/, "", v); blockers[id] = v }
  else if (k == "Started") started[id] = v
  else if (k == "Finished") finished[id] = v
  else if (k == "Replaced by") replaced[id] = v
  else if (k == "Given up by") gave_up[id] = v
  else if (k == "Given up with") fell_with[id] = v
  else if (k == "Previous status") prev_state[id] = v
  return 1
}

function hdr_get(id, name) {
  if (name == "state") return state[id]
  if (name == "type") return type[id]
  if (name == "track") return track[id]
  if (name == "tier") return tier[id]
  if (name == "repos") return repos[id]
  if (name == "blockers") return blockers[id]
  if (name == "started") return started[id]
  if (name == "finished") return finished[id]
  if (name == "replaced") return replaced[id]
  if (name == "gave_up") return gave_up[id]
  if (name == "fell_with") return fell_with[id]
  if (name == "prev_state") return prev_state[id]
  if (name == "title") return title[id]
  return ""
}

# Writing. hdr_write(fname, tmp, st, ins, drop, entry) writes to tmp the text of fname with the
# header rewritten: the Status: line (the last one, the one the reader keeps) becomes "Status: st",
# on the line where it was, and the lines of ins (separated by line breaks; none when empty) go right
# after it; every other header line whose start matches the regular expression drop goes away; every
# other line, blank lines included, stays where it was. With entry not empty, the line "- entry" goes
# into the "## Log" section (the first line equal to "## Log" below the title, or anywhere in a file
# without a title, up to the next line
# that starts with "# " or "## "): right after its last non-blank line or, with the section empty,
# after "## Log" and a blank line; without the section, the blank lines at the end go away and a
# blank line, "## Log", a blank line and the entry are added.
# Lines are compared without a CR at the end, and the whole file is written with the line ending of
# its first line: a task saved with CRLF stays CRLF, new lines included.
function hdr_write(fname, tmp, st, ins, drop, entry,   n, l, i, j, t, sl, s, e, p, z, ni, lines, eol) {
  n = 0; eol = "\n"
  while ((getline l < fname) > 0) {
    if (n == 0 && l ~ /\r$/) eol = "\r\n"
    sub(/\r$/, "", l); hdr_text[++n] = l
  }
  close(fname)
  t = n + 1; for (i = 1; i <= n; i++) if (hdr_text[i] ~ /^# /) { t = i; break }
  sl = 0; for (i = 1; i < t; i++) if (hdr_text[i] ~ /^Status:/) sl = i
  s = 0; p = 0; z = n
  if (entry != "") {
    for (i = (t <= n ? t + 1 : 1); i <= n; i++) if (hdr_text[i] == "## Log") { s = i; break }
    if (s) {
      e = n + 1; for (i = s + 1; i <= n; i++) if (hdr_text[i] ~ /^(# |## )/) { e = i; break }
      p = s; for (i = s + 1; i < e; i++) if (hdr_text[i] !~ /^[ \t]*$/) p = i
    } else while (z > 1 && hdr_text[z] ~ /^[ \t]*$/) z--
  }
  ni = split(ins, lines, "\n")
  for (i = 1; i <= z; i++) {
    if (i == sl || (sl == 0 && i == 1)) {
      printf "Status: %s%s", st, eol > tmp
      for (j = 1; j <= ni; j++) if (lines[j] != "") printf "%s%s", lines[j], eol > tmp
      if (i == sl) continue
    }
    if (i < t && drop != "" && hdr_text[i] ~ drop) continue
    printf "%s%s", hdr_text[i], eol > tmp
    if (s && i == p) { if (p == s) printf "%s", eol > tmp; printf "- %s%s", entry, eol > tmp }
  }
  if (entry != "" && !s) printf "%s## Log%s%s- %s%s", eol, eol, eol, entry, eol > tmp
  close(tmp)
}
