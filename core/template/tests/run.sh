#!/bin/sh
# Tests the template on the fixture (a throwaway copy): the status.sh --json contract,
# the path in MAP.md and the README.md placeholders.
# Usage: sh core/template/tests/run.sh [old-status.sh]
#   old-status.sh  optional: compares the text output and --options with that script's, byte for byte
# Needs jq. Exits 0 with "all good" when every test passes.

here=$(cd "$(dirname "$0")" && pwd) || exit 2
template=$(dirname "$here")
old=$1
# shellcheck source=tools/tests/lib.sh
. "$here/../../../tools/tests/lib.sh"
suite_start core/template/tests/run.sh 300 jq

# new_plan: a fresh copy of the fixture plan with the template scripts; prints its path.
new_plan() {
  new_plan_dir=$(fresh_plan "$here/fixture/agent_plans/test-plan") || return 1
  cp "$template/status.sh" "$template/task.sh" "$template/map.sh" "$new_plan_dir/" || return 1
  printf '%s\n' "$new_plan_dir"
}
p=$(new_plan) || exit 2

json=$(sh "$p/status.sh" --json)
if printf "%s\n" "$json" | jq -e . >/dev/null 2>&1; then ok "--json passes jq"; else ko "--json passes jq"; printf "%s\n" "$json" | head -20; fi
q() { printf "%s\n" "$json" | jq -r "$1" 2>/dev/null; }

check "contract == 1" "$(q .contract)" "1"
check "name" "$(q .name)" "test-plan"
# only the contract vocabulary keys, at any level
check "--json keys" "$(q '[.. | objects | keys[]] | unique | join(",")')" \
  "blocked_by,contract,dir,done,draft,file,finished,group,handoff,id,in_progress,language,log,name,next_step,open,parallel,pct,phases,profile,progress,repos,run,scripts_version,started,status,tasks,tier,title,total,track,type,unblocks,waiting_on"

# language, profile and scripts_version at the top of --json.
# The scripts version is the "# scripts_version: N" stamp, the same in the three template scripts;
# plan.json keeps the version of the scripts the plan received; language and profile come from plan.json.
stamp() { sed -n 's/^# scripts_version: \([0-9][0-9]*\)$/\1/p' "$1"; }
version=$(stamp "$template/status.sh")
case "$version" in ''|*[!0-9]*) ko "\"# scripts_version: N\" stamp in the template status.sh — got \"$version\"" ;; *) ok "stamp in the template status.sh: $version" ;; esac
check "task.sh with the same stamp" "$(stamp "$template/task.sh")" "$version"
check "map.sh with the same stamp" "$(stamp "$template/map.sh")" "$version"
check "a single stamp per script" "$(grep -c '^# scripts_version:' "$template/status.sh" "$template/task.sh" "$template/map.sh" | cut -d: -f2 | tr '\n' ' ')" "1 1 1 "
check "fixture plan.json with the stamp version" "$(jq -r .scripts_version "$here/fixture/agent_plans/test-plan/plan.json")" "$version"
demo="$(dirname "$(dirname "$template")")/fixtures/demo-project/agent_plans/site-de-receitas"
check "example plan.json: language, profile and stamp version" "$(jq -r '"\(.language) \(.profile) \(.scripts_version)"' "$demo/plan.json")" "pt-BR full $version"
for s in status.sh task.sh map.sh; do
  if cmp -s "$template/$s" "$demo/$s"; then ok "example $s byte for byte equal to the template"; else ko "example $s byte for byte equal to the template (copy it again)"; fi
done
check "example with the folders the README promises (spec/decisions.md, research/, prototypes/, notes/)" \
  "$(for f in spec/decisions.md research/README.md prototypes/README.md notes/README.md; do [ -f "$demo/$f" ] && printf '%s ' "$f"; done)" \
  "spec/decisions.md research/README.md prototypes/README.md notes/README.md "
check "fixture plan.json: language and profile" "$(jq -r '"\(.language) \(.profile)"' "$here/fixture/agent_plans/test-plan/plan.json")" "pt-BR full"
check "--json: scripts_version is the stamp, as a number" "$(q '.scripts_version | "\(type) \(.)"')" "number $version"
check "--json: language and profile from plan.json" "$(q '"\(.language) \(.profile)"')" "pt-BR full"
cp "$p/plan.json" "$tmp/plan.json.orig"
printf '{\n  "contract": 1,\n  "name": "test-plan",\n  "language": "en",\n  "profile": "lean",\n  "scripts_version": 1\n}\n' > "$p/plan.json"
check "--json: language en and profile lean" "$(sh "$p/status.sh" --json | jq -r '"\(.language) \(.profile)"')" "en lean"
printf '{"contract": 1, "name": "test-plan", "profile": "lean", "language": "en"}\n' > "$p/plan.json"
check "--json: plan.json on a single line, another order" "$(sh "$p/status.sh" --json | jq -r '"\(.language) \(.profile)"')" "en lean"
printf '{\n  "contract": 1,\n  "name": "test-plan",\n  "source": null,\n  "created": "2026-11-14T00:00Z"\n}\n' > "$p/plan.json"
check "--json: no language nor profile means pt-BR and full" "$(sh "$p/status.sh" --json | jq -r '"\(.language) \(.profile)"')" "pt-BR full"
check "--json: scripts_version does not depend on plan.json" "$(sh "$p/status.sh" --json | jq -r .scripts_version)" "$version"
rm "$p/plan.json"
check "--json: no plan.json means pt-BR and full" "$(sh "$p/status.sh" --json | jq -r '"\(.language) \(.profile) \(.scripts_version)"')" "pt-BR full $version"
cp "$tmp/plan.json.orig" "$p/plan.json"

# progress equal to the PROGRESSO line of the text
prog() {
  sed -n 's/^PROGRESSO: \([0-9]*\) de \([0-9]*\) concluídas (\([0-9]*\)%) · \([0-9]*\) em andamento · \([0-9]*\) em rascunho$/\1 \2 \3 \4 \5/p'
}
text=$(sh "$p/status.sh")
check "progress == PROGRESSO line" \
  "$(q '.progress | "\(.done) \(.total) \(.pct) \(.in_progress) \(.draft)"')" \
  "$(printf "%s\n" "$text" | prog)"
check "fixture progress" "$(q '.progress | "\(.done) \(.total) \(.in_progress) \(.draft)"')" "1 9 1 1"

check "one entry per task" "$(q '.tasks | length')" "10"
for pair in F0-01:done F0-02:in-progress F0-03:cancelled F1-01:available F1-02:available F1-03:owner \
           F1-03.1:available F1-04:blocked F1-05:draft F1-06:invalid; do
  id=${pair%%:*}; g=${pair#*:}
  check "group of $id" "$(q ".tasks[] | select(.id == \"$id\") | .group")" "$g"
done
check "task order (the files', as in the text)" "$(q '[.tasks[].id] | join(" ")')" "F0-01 F0-02 F0-03 F1-01 F1-02 F1-03 F1-03.1 F1-04 F1-05 F1-06"

t() { q ".tasks[] | select(.id == \"$1\") | $2"; }
check "waiting_on with (?) for the missing one" "$(t F1-04 '.waiting_on | join(",")')" "F1-01,F9-99(?)"
check "waiting_on empty outside the blocked group" "$(t F1-01 '.waiting_on | length')" "0"
check "blocked_by as an array" "$(t F1-04 '.blocked_by | join(",")')" "F1-01,F9-99"
check "repos as an array" "$(t F0-02 '.repos | join(",")')" "repo-a"
check "empty repos" "$(t F1-03 '.repos | length')" "0"
check "unblocks" "$(t F1-01 .unblocks)" "1"
check "started" "$(t F0-02 .started)" "2026-11-13T10:00Z"
check "finished" "$(t F0-01 .finished)" "2026-11-12T11:30Z"
check "finished null" "$(t F0-02 '.finished == null')" "true"
check "type and track" "$(t F1-03 '"\(.type)/\(.track)"')" "decision/resto"
check "invalid status keeps the text" "$(t F1-06 .status)" "talvez"
check "file" "$(t F1-04 .file)" "phase-1-rest/F1-04-waiting.md"
check "next_step null without a log" "$(t F1-01 '.next_step == null')" "true"

expected=$(sed -n 's/^- Next step: //p' "$p/phase-0-base/F0-02-in-progress.md")
check "next_step with quotes, backslashes and tab intact" "$(t F0-02 .next_step)" "$expected"
check "title with quotes and backslash intact (em dash)" "$(t F1-01 .title)" 'Título com "aspas" e barra \ invertida'
check "title with a hyphen" "$(t F1-02 .title)" "Livre mas com repo ocupado"

check "phases" "$(q '[.phases[] | "\(.dir)|\(.title)|\(.done)|\(.total)|\(.in_progress)"] | join(";")')" \
  "phase-0-base|Fase 0 — Base|1|2|1;phase-1-rest|Fase 1 — Resto|0|7|0"

check "parallel == text section" "$(q '.parallel | join(" ")')" \
  "$(printf "%s\n" "$text" | sed -n 's/^  sessão [0-9]*: \(.*\)$/\1/p' | tr '\n' ' ' | sed 's/ $//')"
check "fixture parallel" "$(q '.parallel | join(" ")')" "F1-01 F1-03.1"

# --options: machine columns
check "--options: id, group, unblocks, type" "$(sh "$p/status.sh" --options | cut -f1-4 | tr '\t\n' ', ' | sed 's/ $//')" \
  "F1-01,available,1,code F1-02,available,0,code F1-03.1,available,0,code F1-03,owner,0,decision"

check "run: most recent log" "$(q .run.log)" "notes/run-2026-11-13.md"
check "run open without ## Closing" "$(q .run.open)" "true"
printf '\n## Closing\n- fim\n' >> "$p/notes/run-2026-11-13.md"
check "run closed with ## Closing" "$(sh "$p/status.sh" --json | jq -r .run.open)" "false"
# run.handoff is the stamp of the last "## Handoff"; with none, null
check "run without ## Handoff: handoff null" "$(sh "$p/status.sh" --json | jq -c .run.handoff)" "null"
printf '\n## Handoff — 2026-11-13 21:30 UTC\n- Next step: x\n\n## Handoff — 2026-11-13 22:05 UTC\n- Next step: y\n' >> "$p/notes/run-2026-11-13.md"
check "run: handoff from the last ## Handoff, without UTC" "$(sh "$p/status.sh" --json | jq -r .run.handoff)" "2026-11-13 22:05"
# the second run of the day is run-<date>-2.md, which name order puts before the unsuffixed one
printf '# Diário\n' > "$p/notes/run-2026-11-13-2.md"
check "run: suffix -2 comes after the unsuffixed one" "$(sh "$p/status.sh" --json | jq -r '"\(.run.log) \(.run.open)"')" "notes/run-2026-11-13-2.md true"
printf '# Diário\n' > "$p/notes/run-2026-11-13-10.md"
check "run: suffix -10 comes after -2" "$(sh "$p/status.sh" --json | jq -r .run.log)" "notes/run-2026-11-13-10.md"
printf '# Diário\n' > "$p/notes/run-2026-11-14.md"
check "run: the next day comes after the suffixes" "$(sh "$p/status.sh" --json | jq -r .run.log)" "notes/run-2026-11-14.md"
rm -rf "$p/notes"
check "run null without a log" "$(sh "$p/status.sh" --json | jq -r '.run == null')" "true"

# Each block below starts from a fresh copy of the fixture: no case depends on what an earlier block left.
# the filter applies to --json as to the text
p=$(new_plan) || exit 2
jf=$(sh "$p/status.sh" --json F1)
check "filter F1: only F1 tasks" "$(printf "%s\n" "$jf" | jq -r '[.tasks[].id | select(startswith("F1") | not)] | length')" "0"
check "filter F1: progress == text" \
  "$(printf "%s\n" "$jf" | jq -r '.progress | "\(.done) \(.total) \(.pct) \(.in_progress) \(.draft)"')" \
  "$(sh "$p/status.sh" F1 | prog)"

# control characters in a title
p=$(new_plan) || exit 2
printf 'Status: ready\nType: code\nTrack: resto\n\n# F1-07 - sino\001 e fim\n' > "$p/phase-1-rest/F1-07-controlo.md"
if sh "$p/status.sh" --json | jq -e . >/dev/null 2>&1; then ok "control character escaped: jq accepts it"; else ko "control character escaped: jq accepts it"; fi
check "control character intact after jq -r" "$(sh "$p/status.sh" --json | jq -r '.tasks[] | select(.id == "F1-07") | .title' | od -An -c | tr -s ' ')" \
  "$(printf 'sino\001 e fim\n' | od -An -c | tr -s ' ')"

# only a line starting with "Next step:" counts (after spaces and an optional "- " or "* ");
# quoting the marker in the middle of the text is not the next step.
p=$(new_plan) || exit 2
# shellcheck disable=SC2016 # the backtick is task text, not an expansion
printf 'Status: in-progress\nType: code\nTrack: resto\nStarted: 2026-11-13T10:00Z\n\n# F1-07 - Citada depois\n\n## Log\n\n- Next step: rodar os testes\n- Feito: retomou do `Next step:` do último handoff.\n' > "$p/phase-1-rest/F1-07-citada.md"
printf 'Status: in-progress\nType: code\nTrack: resto\nStarted: 2026-11-13T10:00Z\n\n# F1-08 - Só citada\n\nA sessão lê o Next step: do registro.\n\n## Log\n\n- Feito: retomou do «Next step:» de ontem.\n' > "$p/phase-1-rest/F1-08-so-citada.md"
printf 'Status: in-progress\nType: code\nTrack: resto\nStarted: 2026-11-13T10:00Z\n\n# F1-09 - Recuada e com asterisco\n\n  - Next step: a recuada\n* Next step: a do asterisco\n' > "$p/phase-1-rest/F1-09-formas.md"
jn=$(sh "$p/status.sh" --json)
check "next_step: a quote after the real one does not count" "$(printf "%s\n" "$jn" | jq -r '.tasks[] | select(.id == "F1-07") | .next_step')" "rodar os testes"
check "next_step: only a quote gives null" "$(printf "%s\n" "$jn" | jq -r '.tasks[] | select(.id == "F1-08") | .next_step == null')" "true"
check "next_step: indented and \"* \" count, the last one wins" "$(printf "%s\n" "$jn" | jq -r '.tasks[] | select(.id == "F1-09") | .next_step')" "a do asterisco"
check "text: only the quoted one falls in the no-\"Next step:\" warning" "$(sh "$p/status.sh" | sed -n '/^EM ANDAMENTO SEM/,/^$/p' | grep -c -e 'F1-07' -e 'F1-08' -e 'F1-09')" "1"
check "text: the one in the warning is F1-08" "$(sh "$p/status.sh" | sed -n '/^EM ANDAMENTO SEM/,/^$/p' | grep -c '^  F1-08 ')" "1"

# Tier: outside junior|mid|senior silently means senior in --json;
# the text lists the task, with the written value. human, cancelled and a missing Tier: are left out.
p=$(new_plan) || exit 2
printf 'Status: ready\nType: code\nTrack: resto\nTier: mid\n\n# F1-07 - Mid certo\n' > "$p/phase-1-rest/F1-07-mid.md"
printf 'Status: ready\nType: code\nTrack: resto\n\n# F1-08 - Sem Tier\n' > "$p/phase-1-rest/F1-08-sem.md"
printf 'Status: ready\nType: human\nTrack: resto\nTier: Mid\n\n# F1-09 - Human\n' > "$p/phase-1-rest/F1-09-human.md"
printf 'Status: cancelled\nType: code\nTrack: resto\nTier: Mid\n\n# F1-10 - Cancelada\n' > "$p/phase-1-rest/F1-10-cancelada.md"
printf 'Status: ready\nType: code\nTrack: resto\nTier: senior\n\n# F1-11 - Mid errado\n' > "$p/phase-1-rest/F1-11-mid.md"
js_before=$(sh "$p/status.sh" --json)
check "tier: no unknown one, text without warning" "$(sh "$p/status.sh" | grep -c '^TIER DESCONHECIDO')" "0"
printf 'Status: ready\nType: code\nTrack: resto\nTier: Mid\n\n# F1-11 - Mid errado\n' > "$p/phase-1-rest/F1-11-mid.md"
tx=$(sh "$p/status.sh")
check "tier: Tier: Mid warns, with the ID and the value" "$(printf "%s\n" "$tx" | sed -n '/^TIER DESCONHECIDO (1) — vale senior/,/^$/p' | grep -c '^  F1-11  *Tier: Mid ')" "1"
check "tier: Tier: mid, no Tier:, human and cancelled do not warn" "$(printf "%s\n" "$tx" | sed -n '/^TIER DESCONHECIDO/,/^$/p' | grep -c -e 'F1-07' -e 'F1-08' -e 'F1-09' -e 'F1-10')" "0"
check "tier: --json equal to the one with Tier: senior" "$(sh "$p/status.sh" --json)" "$js_before"

# the old contract is never read: keys, values, folders, run log and verbs
# (the fixture's notes/ goes, so only the old notas/ could give a run log)
p=$(new_plan) || exit 2
rm -rf "$p/notes"
printf 'Estado: pronta\nTipo: codigo\nTrilha: resto\nBloqueado por: F0-01\n\n# F1-08 - Cabeçalho antigo\n' > "$p/phase-1-rest/F1-08-antigo.md"
printf 'Status: pronta\nType: codigo\nTrack: resto\n\n# F1-10 - Valores antigos\n' > "$p/phase-1-rest/F1-10-valores.md"
mkdir -p "$p/fase-2-velha" "$p/notas"
printf 'Status: ready\nType: code\n\n# F2-01 - Pasta antiga\n' > "$p/fase-2-velha/F2-01-velha.md"
printf '# Diário\n' > "$p/notas/piloto-2026-11-20.md"
ja=$(sh "$p/status.sh" --json)
check "old: Estado: is not read (no status, invalid)" "$(printf "%s\n" "$ja" | jq -r '.tasks[] | select(.id == "F1-08") | "\(.status)|\(.type)|\(.track)|\(.group)|\(.blocked_by | length)"')" "|||invalid|0"
check "old: Portuguese values are invalid" "$(printf "%s\n" "$ja" | jq -r '.tasks[] | select(.id == "F1-10") | .group')" "invalid"
check "old: fase-*/ is not read" "$(printf "%s\n" "$ja" | jq -r '[.tasks[] | select(.id == "F2-01")] | length')" "0"
check "old: notas/piloto-*.md is not a run log" "$(printf "%s\n" "$ja" | jq -r '.run == null')" "true"
if sh "$p/task.sh" reclamar F1-01 >/dev/null 2>&1; then ko "old: task.sh reclamar should refuse"; else ok "old: task.sh reclamar refuses"; fi
if sh "$p/status.sh" --opcoes 2>/dev/null | grep -q 'available'; then ko "old: --opcoes is not an option"; else ok "old: --opcoes is not an option"; fi

# phases by the number N of phase-N-<slug> (phase-2 before phase-10), and tasks by the
# numeric value of each part of the ID (F2-9 before F2-10, F2-10.2 before F2-10.10).
o="$tmp/order/agent_plans/order"
mkdir -p "$o/phase-10-dez" "$o/phase-2-dois" "$o/phase-1-um" && cp "$template/status.sh" "$template/map.sh" "$o/" || exit 1
printf '# Fase 10\n' > "$o/phase-10-dez/PHASE.md"
for x in phase-1-um/F1-01-a phase-2-dois/F2-9-b phase-2-dois/F2-10-c phase-2-dois/F2-10.10-d phase-2-dois/F2-10.2-e phase-10-dez/F10-01-f; do
  printf 'Status: ready\nType: code\nTrack: ordem\n\n# %s - t\n' "${x#*/}" > "$o/$x.md"
done
jo=$(sh "$o/status.sh" --json)
check "order: phases by phase number" "$(printf "%s\n" "$jo" | jq -r '[.phases[].dir] | join(" ")')" "phase-1-um phase-2-dois phase-10-dez"
check "order: tasks by phase and by numeric ID" "$(printf "%s\n" "$jo" | jq -r '[.tasks[].id] | join(" ")')" "F1-01 F2-9 F2-10 F2-10.2 F2-10.10 F10-01"
check "order: the text lists the phases in numeric order" "$(sh "$o/status.sh" | sed -n 's/^  \(phase-[^ ]*\) .*/\1/p' | tr '\n' ' ')" "phase-1-um phase-2-dois phase-10-dez "
check "order: the text lists the available ones in numeric order" "$(sh "$o/status.sh" | sed -n '/^LIVRES PARA/,/^$/s/^  \(F[0-9][^ ]*\) .*/\1/p' | tr '\n' ' ')" "F1-01 F2-9 F2-10 F2-10.2 F2-10.10 F10-01 "
sh "$o/map.sh" >/dev/null
check "order: MAP.md with phases and tasks in numeric order" "$(sed -n 's/^| \[\([^]]*\)\].*/\1/p;s/^## \(.*\)/\1/p' "$o/MAP.md" | tr '\n' ' ')" "phase-1-um F1-01 phase-2-dois F2-9 F2-10 F2-10.2 F2-10.10 Fase 10 F10-01 "

# plan without tasks: --json is still a valid object
mkdir -p "$tmp/agent_plans/empty" && cp "$template/status.sh" "$tmp/agent_plans/empty/"
check "empty plan: JSON with total 0" "$(sh "$tmp/agent_plans/empty/status.sh" --json | jq -r '"\(.contract) \(.progress.total) \(.tasks | length)"')" "1 0 0"
printf '{"contract": 1, "name": "empty", "language": "en", "profile": "lean"}\n' > "$tmp/agent_plans/empty/plan.json"
check "empty plan: language, profile and scripts_version" "$(sh "$tmp/agent_plans/empty/status.sh" --json | jq -r '"\(.language) \(.profile) \(.scripts_version)"')" "en lean $version"
# a folder name with a quote still gives valid JSON
mkdir -p "$tmp/agent_plans/a\"b" && cp "$template/status.sh" "$tmp/agent_plans/a\"b/"
check "empty plan: a quote in the folder name is escaped in the JSON" "$(sh "$tmp/agent_plans/a\"b/status.sh" --json | jq -r .name)" 'a"b'

# map.sh: a | in a title does not add a column, and two runs at once both succeed and leave a whole MAP.md
mp="$tmp/map-robust/agent_plans/m"
mkdir -p "$mp/phase-1-x" && cp "$template/map.sh" "$mp/" || exit 1
printf 'Status: ready\nType: code\nTrack: t\n\n# F1-01 - A | B\n' > "$mp/phase-1-x/F1-01-a.md"
sh "$mp/map.sh" >/dev/null
check "MAP.md: a | in a title is escaped" "$(grep -c '^| \[F1-01\](phase-1-x/F1-01-a.md) | A \\| B | code | t |$' "$mp/MAP.md")" "1"
map_race=ok
n=0
while [ "$n" -lt 10 ]; do
  n=$((n + 1))
  sh "$mp/map.sh" >/dev/null 2>&1 & pid_a=$!
  sh "$mp/map.sh" >/dev/null 2>&1 & pid_b=$!
  wait "$pid_a" || map_race="exit 1 in round $n"
  wait "$pid_b" || map_race="exit 1 in round $n"
done
check "map.sh: two at once both exit 0" "$map_race" "ok"
check "map.sh: two at once leave a whole MAP.md and no temporary" "$(grep -c '^| \[F1-01\]' "$mp/MAP.md") $(find "$mp" -name 'MAP.md.*' | wc -l | tr -d ' ')" "1 0"

# the header is read up to the title, whatever its length, and the run log by name, in a long folder name
long="$tmp/long/agent_plans/a-plan-with-a-folder-name-a-good-deal-longer-than-the-usual-one"
mkdir -p "$long/phase-1-c9" "$long/notes" && cp "$template/status.sh" "$template/task.sh" "$long/" || exit 1
printf '# Fase 1 - C9\n' > "$long/phase-1-c9/PHASE.md"
printf 'Status: ready\nType: code\nTrack: c9\n\n# F1-01 - Base\n' > "$long/phase-1-c9/F1-01-base.md"
# nine lines before the title: Started on line 9
printf 'Status: in-progress\nType: code\nTrack: c9\nExtra-1: a\nExtra-2: b\nExtra-3: c\nExtra-4: d\nExtra-5: e\nStarted: 2026-11-13T10:00Z\n\n# F1-02 - Cabeçalho longo em andamento\n\n## Done when\n\n- [x] feito\n' > "$long/phase-1-c9/F1-02-longa.md"
# Blocked by on line 10
printf 'Status: ready\nType: code\nTrack: c9\nExtra-1: a\nExtra-2: b\nExtra-3: c\nExtra-4: d\nExtra-5: e\nExtra-6: f\nBlocked by: F1-01\n\n# F1-03 - Cabeçalho longo bloqueado\n' > "$long/phase-1-c9/F1-03-bloqueada.md"
# a Started in the log, after the title, is not the header's
printf 'Status: ready\nType: code\nTrack: c9\n\n# F1-04 - Livre\n\nStarted: 2020-01-01T00:00Z\n' > "$long/phase-1-c9/F1-04-livre.md"
printf '# Diário\n' > "$long/notes/run-2026-11-13.md"
printf '# Diário\n' > "$long/notes/run-2026-11-13-10.md"
printf '# Diário\n' > "$long/notes/run-2026-11-13-2.md"
printf '# Não é diário\n' > "$long/notes/run-rascunho.md"
jc=$(sh "$long/status.sh" --json)
check "long header: run log with suffix -10 in a long folder name" "$(printf "%s\n" "$jc" | jq -r .run.log)" "notes/run-2026-11-13-10.md"
check "long header: Started on line 9 gives the duration in the text" "$(sh "$long/status.sh" | grep -c '^  F1-02 .*há ')" "1"
check "long header: Started after the title does not count" "$(sh "$long/status.sh" | grep -c '^  F1-04 .*há ')" "0"
msg=$(sh "$long/task.sh" claim F1-02 2>&1)
check "long header: claim of an in-progress task quotes the Started on line 9" "$(printf "%s\n" "$msg" | grep -c '(2026-11-13T10:00Z)')" "1"
if msg=$(sh "$long/task.sh" claim F1-03 2>&1); then ko "long header: claim with Blocked by on line 10 should refuse"
else check "long header: claim with Blocked by on line 10 refuses" "$msg" "F1-03 ainda espera: F1-01"; fi
sh "$long/task.sh" close F1-02 >/dev/null 2>&1
check "long header: close keeps the Started on line 9" "$(sed -n 's/^Started: //p' "$long/phase-1-c9/F1-02-longa.md")" "2026-11-13T10:00Z"
check "long header: close writes Status: done and Finished:" "$(sed -n '1p;3s/^Finished: .*/Finished:/p' "$long/phase-1-c9/F1-02-longa.md" | tr '\n' '|')" "Status: done|Finished:|"
rm "$long/notes/run-2026-11-13-10.md" "$long/notes/run-2026-11-13-2.md"
check "long header: a name outside the pattern is not a run log" "$(sh "$long/status.sh" --json | jq -r .run.log)" "notes/run-2026-11-13.md"

# Started: is read and turned into a duration inside awk: a value outside YYYY-MM-DDTHH:MMZ
# has no duration, one in the future counts as 0 min, and one from a minute ago as 0 or 1 min.
du="$tmp/duration/agent_plans/d"
mkdir -p "$du/phase-1-d" && cp "$template/status.sh" "$du/" || exit 1
printf 'Status: in-progress\nType: code\nStarted: ontem\n\n# F1-01 - Bad\n' > "$du/phase-1-d/F1-01-bad.md"
printf 'Status: in-progress\nType: code\nStarted: 2999-01-01T00:00Z\n\n# F1-02 - Future\n' > "$du/phase-1-d/F1-02-future.md"
printf 'Status: in-progress\nType: code\nStarted: %s\n\n# F1-03 - Now\n' "$(date -u +%Y-%m-%dT%H:%MZ)" > "$du/phase-1-d/F1-03-now.md"
tdu=$(sh "$du/status.sh")
check "duration: a Started: outside the format has none" "$(printf '%s\n' "$tdu" | grep -c '^  F1-01 .*sem Started:$')" "1"
check "duration: a Started: in the future is 0 min" "$(printf '%s\n' "$tdu" | grep -c '^  F1-02 .*há 0 min (desde 2999-01-01T00:00Z)$')" "1"
check "duration: a Started: from now is 0 or 1 min" "$(printf '%s\n' "$tdu" | grep -c -e '^  F1-03 .*há 0 min (desde' -e '^  F1-03 .*há 1 min (desde')" "1"

# status.sh reads every header in one pass: the processes it starts do not grow with the number
# of tasks. A PATH that wraps sed, head and date counts their calls for 10 and for 1,000 tasks,
# half of them in progress with a Started:.
if path_wins sed; then
  cw="$tmp/count-wrap"
  mkdir -p "$cw" || exit 1
  for t in sed head date; do
    real=$(tool_path "$t") || { ko "count: $t on the PATH"; continue; }
    # shellcheck disable=SC2016 # the $ belong to the wrapper, expanded when it runs
    printf '#!/bin/sh\necho %s >> "$STATUS_CALLS"\nexec "%s" "$@"\n' "$t" "$real" > "$cw/$t" && chmod +x "$cw/$t" || exit 1
  done
  # calls_for <n>: sed, head and date calls of status.sh, text and --json, on a plan of <n> tasks
  calls_for() {
    cdir="$tmp/count-$1/agent_plans/c"
    mkdir -p "$cdir/phase-1-c" && cp "$template/status.sh" "$cdir/" || return 1
    printf '# Phase 1\n' > "$cdir/phase-1-c/PHASE.md"
    i=1
    while [ "$i" -le "$1" ]; do
      if [ $((i % 2)) -eq 0 ]; then
        printf 'Status: in-progress\nType: code\nStarted: 2026-11-13T10:00Z\n\n# F1-%s - T\n' "$i" > "$cdir/phase-1-c/F1-$i-t.md"
      else
        printf 'Status: ready\nType: code\n\n# F1-%s - T\n' "$i" > "$cdir/phase-1-c/F1-$i-t.md"
      fi
      i=$((i + 1))
    done
    : > "$tmp/calls-$1"
    STATUS_CALLS="$tmp/calls-$1" PATH="$cw:$PATH" sh "$cdir/status.sh" >/dev/null 2>&1
    STATUS_CALLS="$tmp/calls-$1" PATH="$cw:$PATH" sh "$cdir/status.sh" --json >/dev/null 2>&1
    wc -l < "$tmp/calls-$1" | tr -d ' '
  }
  c10=$(calls_for 10)
  c1000=$(calls_for 1000)
  check "count: the wrapped tools are called (10 tasks)" "$([ "${c10:-0}" -gt 0 ] && echo yes || echo "no ($c10)")" "yes"
  check "count: sed, head and date calls are the same for 10 and for 1,000 tasks" "$c1000" "$c10"
else
  skip "count: sed, head and date calls do not grow with the tasks" "this sh runs its own sed before the PATH"
fi

# map.sh with the real path
p=$(new_plan) || exit 2
sh "$p/map.sh" >/dev/null
if grep -q 'sh agent_plans/test-plan/map.sh' "$p/MAP.md" && grep -q 'sh agent_plans/test-plan/status.sh' "$p/MAP.md"; then
  ok "MAP.md with sh agent_plans/<name>/ inside agent_plans/"; else ko "MAP.md with sh agent_plans/<name>/ inside agent_plans/"; fi
# the em dash is 3 bytes; an awk that counts bytes (mawk) must not cut it in half
check "MAP.md: title without the em dash" "$(grep -c '](phase-1-rest/F1-01-free.md) | Título com "aspas"' "$p/MAP.md")" "1"
check "MAP.md: title without the hyphen" "$(grep -c '](phase-1-rest/F1-02-free-busy.md) | Livre mas' "$p/MAP.md")" "1"
check "MAP.md: phase title from PHASE.md and new type" "$(grep -c -e '^## Fase 1 — Resto$' -e '| decision | resto |$' "$p/MAP.md")" "2"
check "map.sh leaves no MAPA.md" "$(find "$p" -name 'MAPA.md' | wc -l | tr -d ' ')" "0"
mkdir -p "$tmp/outside" && cp -R "$p" "$tmp/outside/" && sh "$tmp/outside/test-plan/map.sh" >/dev/null
if grep -q 'sh test-plan/map.sh' "$tmp/outside/test-plan/MAP.md" && ! grep -q 'agent_plans/' "$tmp/outside/test-plan/MAP.md"; then
  ok "MAP.md with sh <name>/ outside agent_plans/"; else ko "MAP.md with sh <name>/ outside agent_plans/"; fi

# the scripts copied into each plan print no agent invocation syntax;
# they print the ID and the path, and the skill or the panel builds the invocation.
check "MAP.md without a \"/<name>\" invocation" "$(grep -c "\`/test-plan\`" "$p/MAP.md")" "0"
txt=$(sh "$p/status.sh")
check "status.sh: suggested sessions with the ID only" "$(printf '%s\n' "$txt" | grep -c '^  sessão 1: F[0-9]')" "1"
check "status.sh: no line with \"/test-plan \"" "$(printf '%s\n' "$txt" | grep -c '/test-plan ')" "0"

# the template README.md
if [ "$(grep -c '{{PLAN_PATH}}' "$template/README.md")" -gt 0 ] && ! grep -q -e 'sh {{PLAN_NAME}}/' -e '^{{PLAN_NAME}}/' "$template/README.md"; then
  ok "README.md with {{PLAN_PATH}} and without sh {{PLAN_NAME}}/"; else ko "README.md with {{PLAN_PATH}} and without sh {{PLAN_NAME}}/"; fi

# task.sh: read-check-write under a lock. N simultaneous claims of the same available task
# give exactly one success; the race is rare, so the loop repeats. One case: each round restores the task.
p=$(new_plan) || exit 2
free="$p/phase-1-rest/F1-01-free.md"
cp "$free" "$tmp/F1-01.orig"
rounds=20; n=8; wrong=""
r=1
while [ "$r" -le "$rounds" ]; do
  cp "$tmp/F1-01.orig" "$free"
  pids=""
  i=1
  while [ "$i" -le "$n" ]; do sh "$p/task.sh" claim F1-01 >/dev/null 2>&1 & pids="$pids $!"; i=$((i + 1)); done
  wins=0
  for pid in $pids; do wait "$pid" && wins=$((wins + 1)); done
  [ "$wins" -eq 1 ] || wrong="$wrong r$r:$wins"
  r=$((r + 1))
done
check "concurrent claim: only one wins in $rounds rounds of $n" "${wrong:-none}" "none"
check "concurrent claim: no lock left" "$(find "$p" -name '.lock-*' | wc -l | tr -d ' ')" "0"
check "after the concurrent claim: Status: in-progress and Started: in the header" "$(sed -n '1p;2s/^Started: .*/Started:/p' "$free" | tr '\n' '|')" "Status: in-progress|Started:|"
if sh "$p/task.sh" release F1-01 >/dev/null 2>&1; then ok "after the concurrent claim: release goes through"; else ko "after the concurrent claim: release goes through"; fi
check "after the release: Status: ready without Started:" "$(sed -n '1,/^# /p' "$free" | grep -c -e '^Status: ready$' -e '^Started:')" "1"

# orphan lock of a process killed with SIGKILL (the trap does not run): old, it is removed and the claim goes through
p=$(new_plan) || exit 2
free="$p/phase-1-rest/F1-01-free.md"
(sh -c 'mkdir "$1/.lock-F1-01"; kill -9 $$' _ "$p"; :) 2>/dev/null
touch -t 202001010000 "$p/.lock-F1-01"
if sh "$p/task.sh" claim F1-01 >/dev/null 2>&1; then ok "old orphan lock: claim goes through"; else ko "old orphan lock: claim goes through"; fi
check "old orphan lock: removed" "$(find "$p" -name '.lock-*' | wc -l | tr -d ' ')" "0"
check "old orphan lock: the task is in progress" "$(sed -n 1p "$free")" "Status: in-progress"

# recent lock of another owner: bounded wait, refusal with a message, and the other lock stays
p=$(new_plan) || exit 2
free="$p/phase-1-rest/F1-01-free.md"
mkdir "$p/.lock-F1-01"
msg=$(TASK_LOCK_WAIT=1 sh "$p/task.sh" claim F1-01 2>&1); rc=$?
check "busy lock: refuses" "$rc" "1"
case "$msg" in *".lock-F1-01"*) ok "busy lock: the message names the lock";; *) ko "busy lock: the message names the lock — \"$msg\"";; esac
check "busy lock: status intact" "$(sed -n 1p "$free")" "Status: ready"
if [ -d "$p/.lock-F1-01" ]; then ok "busy lock: the other lock stays"; else ko "busy lock: the other lock stays"; fi
rmdir "$p/.lock-F1-01"

# a lock with an owner: "<host> <pid> <UTC time>". On this machine with a process that is not
# running, it is an orphan even when recent; a running one, or another machine's, is held until
# the owner's time is older than TASK_LOCK_STALE_MIN.
p=$(new_plan) || exit 2
free="$p/phase-1-rest/F1-01-free.md"
host=$(uname -n)
now_s=$(date -u +%Y-%m-%dT%H:%M:%SZ)
sh -c 'exit 0' & dead=$!
wait "$dead"
mkdir "$p/.lock-F1-01"
printf '%s %s %s\n' "$host" "$dead" "$now_s" > "$p/.lock-F1-01/owner"
if TASK_LOCK_WAIT=2 sh "$p/task.sh" claim F1-01 >/dev/null 2>&1; then ok "dead owner: the lock is stolen and the claim goes through"; else ko "dead owner: the lock is stolen and the claim goes through"; fi
check "dead owner: no lock nor stale copy left" "$(find "$p" -name '.lock-*' | wc -l | tr -d ' ')" "0"
sh "$p/task.sh" release F1-01 >/dev/null 2>&1
mkdir "$p/.lock-F1-01"
printf '%s %s %s\n' "$host" "$$" "$now_s" > "$p/.lock-F1-01/owner"
msg=$(TASK_LOCK_WAIT=1 sh "$p/task.sh" claim F1-01 2>&1); rc=$?
check "live owner: refuses" "$rc" "1"
check "live owner: the lock and its owner stay" "$(cat "$p/.lock-F1-01/owner" 2>/dev/null)" "$host $$ $now_s"
check "live owner: status intact" "$(sed -n 1p "$free")" "Status: ready"
printf '%s %s %s\n' "other-$host" "$dead" "$now_s" > "$p/.lock-F1-01/owner"
check "another machine's recent owner: refuses" "$(exit_of env TASK_LOCK_WAIT=1 sh "$p/task.sh" claim F1-01)" "1"
printf '%s %s %s\n' "$host" "$$" "2020-01-01T00:00:00Z" > "$p/.lock-F1-01/owner"
if TASK_LOCK_WAIT=2 sh "$p/task.sh" claim F1-01 >/dev/null 2>&1; then ok "owner time past TASK_LOCK_STALE_MIN: stolen even with a live pid"; else ko "owner time past TASK_LOCK_STALE_MIN: stolen even with a live pid"; fi
check "stale owner: no lock left" "$(find "$p" -name '.lock-*' | wc -l | tr -d ' ')" "0"

# claim killed by TERM while holding the lock: the trap releases it.
# The task is a FIFO: task.sh blocks reading it after taking the lock. Opening the FIFO to
# write blocks until someone opens it to read, so the writer runs in the background and both
# processes get a deadline: if task.sh exits before reading (claim refused, lock busy), the case
# fails instead of holding the suite.
p=$(new_plan) || exit 2
fifo="$p/phase-1-rest/F1-09-fifo.md"
mkfifo "$fifo"
sh "$p/task.sh" claim F1-09 >/dev/null 2>&1 &
pid=$!
i=0; while [ ! -d "$p/.lock-F1-09" ] && [ "$i" -lt 50 ]; do sleep 0.1 2>/dev/null || sleep 1; i=$((i + 1)); done
if [ -d "$p/.lock-F1-09" ]; then ok "claim holding the lock: the lock exists"; else ko "claim holding the lock: the lock exists"; fi
i=0; while [ ! -f "$p/.lock-F1-09/owner" ] && [ "$i" -lt 50 ]; do sleep 0.1 2>/dev/null || sleep 1; i=$((i + 1)); done
check "claim holding the lock: owner is this machine, its pid and a UTC time" \
  "$(sed 's/[0-9]\{4\}-[0-9][0-9]-[0-9][0-9]T[0-9][0-9]:[0-9][0-9]:[0-9][0-9]Z$/<time>/' "$p/.lock-F1-09/owner" 2>/dev/null)" "$(uname -n) $pid <time>"
kill -TERM "$pid" 2>/dev/null
(: > "$fifo") 2>/dev/null &
writer=$!
deadline 10 "$pid"; rc=$?
# The writer only ends when task.sh opened the FIFO; a TERM that lands before that leaves it
# waiting, which is fine: it is only killed.
deadline 2 "$writer"
if [ "$rc" -ne 0 ] && [ "$rc" -ne 124 ] && [ ! -d "$p/.lock-F1-09" ]; then ok "claim killed by TERM: exits with an error and releases the lock"
else ko "claim killed by TERM: exits with an error and releases the lock — got exit $rc (124 is a timeout), lock $([ -d "$p/.lock-F1-09" ] && echo left || echo gone)"; fi
rm -f "$fifo"

# two giveups of different roots with a common dependent: each takes the lock of every task it
# writes, so the second one sees the dependent already abandoned. In every round one reports
# 2 tasks and the other 1 (or refuses); without those locks both report 2 and one write is lost.
race="$tmp/race/agent_plans/q"
mkdir -p "$race/phase-1-x"
cp "$template/status.sh" "$template/task.sh" "$template/map.sh" "$race/"
printf '# Phase 1\n' > "$race/phase-1-x/PHASE.md"
rounds=20; wrong=""
r=1
while [ "$r" -le "$rounds" ]; do
  printf 'Status: ready\nType: code\n\n# F1-01 - A\n\n## Log\n' > "$race/phase-1-x/F1-01-a.md"
  printf 'Status: ready\nType: code\n\n# F1-02 - B\n\n## Log\n' > "$race/phase-1-x/F1-02-b.md"
  printf 'Status: ready\nType: code\nBlocked by: F1-01, F1-02\n\n# F1-03 - C\n\n## Log\n' > "$race/phase-1-x/F1-03-c.md"
  sh "$race/task.sh" giveup F1-01 --reason "race one" --yes > "$tmp/race-1" 2>&1 &
  a=$!
  sh "$race/task.sh" giveup F1-02 --reason "race two" --yes > "$tmp/race-2" 2>&1 &
  b=$!
  wait "$a"; wait "$b"
  counts=$(sed -n 's/.* com \([0-9][0-9]*\) task(s) no total$/\1/p' "$tmp/race-1" "$tmp/race-2" | sort | tr '\n' ' ')
  logs=$(grep -c '^- ' "$race/phase-1-x/F1-03-c.md")
  case "$counts:$logs" in "1 2 :1"|"2 :1") ;; *) wrong="$wrong r$r:[$counts]logs=$logs" ;; esac
  r=$((r + 1))
done
check "concurrent giveup with a common dependent: one with 2 tasks, the other with 1 or refused, in $rounds rounds" "${wrong:-none}" "none"
check "concurrent giveup: no lock left" "$(find "$race" -name '.lock-*' | wc -l | tr -d ' ')" "0"

# full and lean profiles. profile.sh resolves the {{#full}}…{{/full}} and {{#lean}}…{{/lean}}
# blocks of a template .md, so each plan gets a text without dead branches.
pf="$template/profile.sh"
if [ -f "$pf" ]; then ok "profile.sh in the template"; else ko "profile.sh in the template"; fi
for profile in full lean; do
  for md in README.md PHASE.md _template.md; do
    rm -f "$tmp/$profile-$md"
    if sh "$pf" "$profile" "$template/$md" "$tmp/$profile-$md" 2>/dev/null && [ -f "$tmp/$profile-$md" ]; then
      check "profile $profile, $md: no block marker left" "$(grep -c '{{[#/]' "$tmp/$profile-$md")" "0"
    else ko "profile.sh $profile $md writes the file"; fi
  done
done
# count_of <file> <text>: lines with the text ("no file" when the file is missing)
count_of() { if [ -f "$1" ]; then grep -c -F -e "$2" "$1"; else echo "no file"; fi; }
# shellcheck disable=SC2016 # the backtick is README text, not an expansion
for x in 'spec/' 'research/' 'prototypes/' 'test-first' 'Toda fase fecha com um `review`'; do
  if [ "$(count_of "$tmp/full-README.md" "$x")" -gt 0 ] 2>/dev/null; then ok "full: README mentions \"${x}\""; else ko "full: README mentions \"${x}\""; fi
  check "lean: README without \"${x}\"" "$(count_of "$tmp/lean-README.md" "$x")" "0"
done
# shellcheck disable=SC2016 # the backtick is README text, not an expansion
for x in 'notes/' '{{PLAN_PATH}}' '{{CONVENTIONS}}' '«Decisões» do `PLAN.md`'; do
  if [ "$(count_of "$tmp/lean-README.md" "$x")" -gt 0 ] 2>/dev/null; then ok "lean: README mentions \"${x}\""; else ko "lean: README mentions \"${x}\""; fi
done
# whoever details the task writes the Tier:, by the criteria of the «Níveis» section.
for profile in full lean; do
  check "$profile: _template.md with the Tier: line pointing to the «Níveis» section" "$(grep '^Tier:' "$tmp/$profile-_template.md" 2>/dev/null | grep -c '«Níveis»')" "1"
  check "$profile: README with Tier: in the «Cabeçalho» list" "$(count_of "$tmp/$profile-README.md" '- **Tier:**')" "1"
  check "$profile: README with the «Níveis» section" "$(grep -c '^### Níveis$' "$tmp/$profile-README.md" 2>/dev/null)" "1"
  # shellcheck disable=SC2016 # the backtick is README text, not an expansion
  for x in '`junior`' '`mid`' '`senior`' 'Na dúvida, `senior`'; do
    if [ "$(sed -n '/^### Níveis$/,/^## /p' "$tmp/$profile-README.md" 2>/dev/null | grep -c -F -e "$x")" -gt 0 ]; then ok "$profile: «Níveis» mentions \"${x}\""; else ko "$profile: «Níveis» mentions \"${x}\""; fi
  done
  n=$(sed -n '/^### Níveis$/,/^## /p' "$tmp/$profile-README.md" 2>/dev/null | sed '1d;$d' | grep -c .)
  if [ "$n" -gt 0 ] && [ "$n" -le 15 ]; then ok "$profile: «Níveis» is short ($n lines, up to 15)"; else ko "$profile: «Níveis» is short — $n lines, expected 1 to 15"; fi
done
# shellcheck disable=SC2016 # the backtick is README text, not an expansion
check "full: «Níveis» says the end-of-phase review classifies the draft" "$(sed -n '/^### Níveis$/,/^## /p' "$tmp/full-README.md" 2>/dev/null | grep -c 'review` de fim de fase ao detalhar um `draft`')" "1"
check "lean: «Níveis» without the end-of-phase review (only map and whoever creates the task)" "$(sed -n '/^### Níveis$/,/^## /p' "$tmp/lean-README.md" 2>/dev/null | grep -c 'fim de fase')" "0"
# shellcheck disable=SC2016 # the backtick is README text, not an expansion
check "full: the end-of-phase review writes the Tier: of the draft it details" "$(grep -F 'Toda fase fecha com um `review`' "$tmp/full-README.md" 2>/dev/null | grep -c 'Tier:')" "1"
check "full: _template.md equal to lean's (no blocks)" "$(cksum < "$tmp/full-_template.md" 2>/dev/null)" "$(cksum < "$tmp/lean-_template.md" 2>/dev/null)"
check "full: README with the template lines outside the lean blocks" \
  "$(sed '/^{{#lean}}$/,/^{{\/lean}}$/d; /^{{[#/]full}}$/d' "$template/README.md" | cksum)" "$(cksum < "$tmp/full-README.md" 2>/dev/null)"
check "full: PHASE.md with \"Fecha com\"" "$(count_of "$tmp/full-PHASE.md" 'Fecha com')" "1"
check "lean: PHASE.md without \"Fecha com\"" "$(count_of "$tmp/lean-PHASE.md" 'Fecha com')" "0"
if sh "$pf" medio "$template/README.md" "$tmp/x.md" 2>/dev/null || [ -f "$tmp/x.md" ]; then ko "profile.sh refuses an unknown profile without writing"; else ok "profile.sh refuses an unknown profile without writing"; fi
printf 'a\n{{#full}}\nb\n' > "$tmp/unclosed.md"
if sh "$pf" lean "$tmp/unclosed.md" "$tmp/y.md" 2>/dev/null || [ -f "$tmp/y.md" ]; then ko "profile.sh refuses an unclosed block"; else ok "profile.sh refuses an unclosed block"; fi
printf '{{#full}}\n{{#lean}}\nb\n{{/lean}}\n{{/full}}\n' > "$tmp/nested.md"
if sh "$pf" full "$tmp/nested.md" "$tmp/z.md" 2>/dev/null || [ -f "$tmp/z.md" ]; then ko "profile.sh refuses a block inside a block"; else ok "profile.sh refuses a block inside a block"; fi

# copy.sh copies the template files into the plan byte for byte, called with sh,
# because a cp from outside the project is refused by the agent's permissions.
cs="$template/copy.sh"
if [ -f "$cs" ]; then ok "copy.sh in the template"; else ko "copy.sh in the template"; fi
check "copy.sh without a stamp (it does not go into the plan)" "$(grep -c '^# scripts_version:' "$cs" 2>/dev/null)" "0"
cp_dest="$tmp/cp/agent_plans/new"
if sh "$cs" "$cp_dest" >/dev/null 2>&1; then ok "copy.sh creates the folder and exits 0"; else ko "copy.sh creates the folder and exits 0"; fi
for s in status.sh task.sh map.sh; do
  check "copy.sh: $s byte for byte" "$(cmp "$template/$s" "$cp_dest/$s" >/dev/null 2>&1 && echo same)" "same"
done
check "copy.sh: _template.md becomes _template.md" "$(cmp "$template/_template.md" "$cp_dest/_template.md" >/dev/null 2>&1 && echo same)" "same"
check "copy.sh: only the four files" "$(find "$cp_dest" -mindepth 1 2>/dev/null | sed 's|.*/||' | sort | tr '\n' ' ')" "_template.md map.sh status.sh task.sh "
printf 'mine\n' > "$cp_dest/task.sh"
rm "$cp_dest/status.sh"
if sh "$cs" "$cp_dest" >/dev/null 2>&1; then ko "copy.sh refuses to overwrite (exits 1)"; else ok "copy.sh refuses to overwrite (exits 1)"; fi
check "copy.sh: the refusal leaves the existing file alone" "$(cat "$cp_dest/task.sh")" "mine"
check "copy.sh: the refusal copies nothing (all or nothing)" "$(test -e "$cp_dest/status.sh" && echo copied || echo nothing)" "nothing"
check "copy.sh: the refusal names the file" "$(sh "$cs" "$cp_dest" 2>&1 >/dev/null | grep -c 'task.sh')" "1"
check "copy.sh without an argument exits 2" "$(sh "$cs" >/dev/null 2>&1; echo $?)" "2"
# the single-file form (for the idea skill): copy.sh <template file> <destination>
if sh "$cs" _template.md "$tmp/cp/one/x.md" >/dev/null 2>&1 && cmp -s "$template/_template.md" "$tmp/cp/one/x.md"; then ok "copy.sh <file> <destination> copies one file, creating the folder"; else ko "copy.sh <file> <destination> copies one file, creating the folder"; fi
check "copy.sh <file> <destination> refuses to overwrite" "$(sh "$cs" status.sh "$tmp/cp/one/x.md" >/dev/null 2>&1; echo $?)" "1"
check "copy.sh <file> outside the template exits 2" "$(sh "$cs" ../profile.sh "$tmp/cp/one/y.md" >/dev/null 2>&1; echo $?)" "2"
check "copy.sh <file> missing from the template exits 2" "$(sh "$cs" nada.md "$tmp/cp/one/z.md" >/dev/null 2>&1; echo $?)" "2"
# --lang <language> picks the template text (en/ next to it); the scripts are
# the same in the source (the package adds the English-only ones in en/); without --lang, pt-BR; the
# language follows the contract rule: pt-BR by base language ignoring case, anything else English.
if sh "$cs" --lang en idea.md "$tmp/cp/en/idea.md" >/dev/null 2>&1 && cmp -s "$template/en/idea.md" "$tmp/cp/en/idea.md"; then ok "copy.sh --lang en <file> copies from en/"; else ko "copy.sh --lang en <file> copies from en/"; fi
if sh "$cs" --lang en status.sh "$tmp/cp/en/status.sh" >/dev/null 2>&1 && cmp -s "$template/status.sh" "$tmp/cp/en/status.sh"; then ok "copy.sh --lang en status.sh: the script is the same"; else ko "copy.sh --lang en status.sh: the script is the same"; fi
if sh "$cs" --lang pt-BR idea.md "$tmp/cp/pt/idea.md" >/dev/null 2>&1 && cmp -s "$template/idea.md" "$tmp/cp/pt/idea.md"; then ok "copy.sh --lang pt-BR copies the pt-BR one"; else ko "copy.sh --lang pt-BR copies the pt-BR one"; fi
if sh "$cs" --lang xx _template.md "$tmp/cp/xx/t.md" >/dev/null 2>&1 && cmp -s "$template/en/_template.md" "$tmp/cp/xx/t.md"; then ok "copy.sh --lang with a language that does not exist falls back to English"; else ko "copy.sh --lang with a language that does not exist falls back to English"; fi
if sh "$cs" --lang EN-us idea.md "$tmp/cp/enus/idea.md" >/dev/null 2>&1 && cmp -s "$template/en/idea.md" "$tmp/cp/enus/idea.md"; then ok "copy.sh --lang EN-us copies from en/"; else ko "copy.sh --lang EN-us copies from en/"; fi
if sh "$cs" --lang pt-pt idea.md "$tmp/cp/ptpt/idea.md" >/dev/null 2>&1 && cmp -s "$template/idea.md" "$tmp/cp/ptpt/idea.md"; then ok "copy.sh --lang pt-pt copies the pt-BR one"; else ko "copy.sh --lang pt-pt copies the pt-BR one"; fi
check "copy.sh --lang without a value exits 2" "$(sh "$cs" --lang >/dev/null 2>&1; echo $?)" "2"
# an en plan built the way map builds it: copy.sh --lang en, profile.sh on en/README.md and
# en/PHASE.md, the lean fixture tasks; no hard-coded pt-BR text in what came from the template, and selftest green
accents() { grep -c -e 'á' -e 'à' -e 'â' -e 'ã' -e 'é' -e 'ê' -e 'í' -e 'ó' -e 'ô' -e 'õ' -e 'ú' -e 'ç' -e 'Á' -e 'É' -e 'Ó' -e 'Ç' -e '«' -e '»' "$1"; }
for profile in full lean; do
  pe="$tmp/en-$profile/agent_plans/plan-en"
  if sh "$cs" --lang en "$pe" >/dev/null 2>&1; then ok "en $profile: copy.sh --lang en <folder>"; else ko "en $profile: copy.sh --lang en <folder>"; fi
  mkdir -p "$pe/phase-1-all" "$pe/notes"
  sh "$pf" "$profile" "$template/en/README.md" "$pe/README.md" 2>/dev/null || ko "en $profile: profile.sh en/README.md"
  sh "$pf" "$profile" "$template/en/PHASE.md" "$pe/phase-1-all/PHASE.md" 2>/dev/null || ko "en $profile: profile.sh en/PHASE.md"
  cp "$here"/fixture/agent_plans/lean-plan/phase-1-all/F1-0*.md "$pe/phase-1-all/"
  sed "s/\"language\": \"[^\"]*\"/\"language\": \"en\"/; s/\"lean\"/\"$profile\"/" "$here/fixture/agent_plans/lean-plan/plan.json" > "$pe/plan.json"
  check "en $profile: _template.md is en/_template.md" "$(cmp "$template/en/_template.md" "$pe/_template.md" >/dev/null 2>&1 && echo same)" "same"
  for f in README.md phase-1-all/PHASE.md _template.md; do
    check "en $profile: $f without pt-BR text (accents, «»)" "$(accents "$pe/$f" 2>/dev/null)" "0"
    check "en $profile: $f without block markers" "$(grep -c '{{[#/]' "$pe/$f" 2>/dev/null)" "0"
  done
  check "en $profile: selftest" "$(sh "$template/selftest.sh" "$pe" 2>&1 | tail -1 | cut -c1-21)" "Selftest: all good (c"
  check "en $profile: language en in --json" "$(sh "$pe/status.sh" --json 2>/dev/null | jq -r .language)" "en"
done
check "en: idea.md without pt-BR text (accents, «»)" "$(accents "$template/en/idea.md")" "0"
check "en: idea.md with the marker right below ## Open questions" "$(sed -n '/^## Open questions$/{n;p;}' "$template/en/idea.md")" "<!-- open-questions -->"

# selftest passes on a plan of each profile: the full one is the example
# (site-de-receitas, with spec/, research/ and prototypes/), the lean one is the lean-plan fixture.
# The test-plan fixture has invalid tasks on purpose and does not suit selftest.
st="$tmp/st"
mkdir -p "$st/agent_plans" && cp -R "$here/fixture/agent_plans/lean-plan" "$demo" "$st/agent_plans/" || exit 1
for name in site-de-receitas lean-plan; do
  cp "$template/status.sh" "$template/task.sh" "$template/map.sh" "$st/agent_plans/$name/" || exit 1
  check "selftest on $name" "$(sh "$template/selftest.sh" "$st/agent_plans/$name" 2>&1 | tail -1 | cut -c1-21)" "Selftest: all good (c"
done
check "lean fixture plan.json: profile and stamp version" "$(jq -r '"\(.profile) \(.scripts_version)"' "$here/fixture/agent_plans/lean-plan/plan.json")" "lean $version"
check "selftest on lean-plan tests the profile" "$(sh "$template/selftest.sh" "$st/agent_plans/lean-plan" | grep -c -e 'profile lean' -e 'lean profile')" "2"
# a signal in the middle leaves no copy of the plan behind (TMPDIR points at a folder of its own;
# TERM stands for INT, which a background job ignores)
mkdir "$tmp/sig-tmp"
TMPDIR="$tmp/sig-tmp" sh "$template/selftest.sh" "$st/agent_plans/lean-plan" >/dev/null 2>&1 & sig_pid=$!
sig_n=0
while [ -z "$(ls -A "$tmp/sig-tmp")" ] && [ "$sig_n" -lt 20000 ]; do sig_n=$((sig_n + 1)); done
kill -TERM "$sig_pid" 2>/dev/null
wait "$sig_pid" 2>/dev/null
check "selftest: a TERM in the middle leaves no folder in TMPDIR" "$(find "$tmp/sig-tmp" -mindepth 1 | wc -l | tr -d ' ')" "0"
# a plan in another language passes the same (selftest tests the copy in x-test),
# and the real plan.json stays
cp "$st/agent_plans/lean-plan/plan.json" "$tmp/lean.json"
sed 's/"language": "[^"]*"/"language": "x-test"/' "$tmp/lean.json" > "$st/agent_plans/lean-plan/plan.json"
check "selftest on lean-plan in the test language" "$(sh "$template/selftest.sh" "$st/agent_plans/lean-plan" 2>&1 | tail -1 | cut -c1-21)" "Selftest: all good (c"
check "selftest: the real plan.json stays in the test language" "$(jq -r .language "$st/agent_plans/lean-plan/plan.json")" "x-test"
cp "$tmp/lean.json" "$st/agent_plans/lean-plan/plan.json"
mkdir "$st/agent_plans/lean-plan/spec"
if sh "$template/selftest.sh" "$st/agent_plans/lean-plan" >/dev/null 2>&1; then ko "selftest: lean plan with spec/ fails"; else ok "selftest: lean plan with spec/ fails"; fi
rmdir "$st/agent_plans/lean-plan/spec"
sed 's/"lean"/"full"/' "$here/fixture/agent_plans/lean-plan/plan.json" > "$st/agent_plans/lean-plan/plan.json"
check "selftest: full plan without spec/ passes (full does not require the folders)" "$(sh "$template/selftest.sh" "$st/agent_plans/lean-plan" 2>&1 | tail -1 | cut -c1-21)" "Selftest: all good (c"
# a blocker cycle fails selftest: F1-03 already waits on F1-01, and F1-01 now waits on F1-03 too
cyc=$(ls "$st"/agent_plans/site-de-receitas/phase-1-*/F1-01-*.md)
cp "$cyc" "$tmp/cycle-orig.md"
sed 's/^Blocked by: .*/&, F1-03/' "$tmp/cycle-orig.md" > "$cyc"
if sh "$template/selftest.sh" "$st/agent_plans/site-de-receitas" >/dev/null 2>&1; then ko "selftest: a blocker cycle fails"; else ok "selftest: a blocker cycle fails"; fi
cp "$tmp/cycle-orig.md" "$cyc"
# selftest.sh, copy.sh and profile.sh speak the package language, which the build
# writes in place of the placeholder. A copy with the placeholder replaced by x-test proves nothing is hard-coded.
xm="$tmp/xm"
mkdir -p "$xm"
cp "$template/status.sh" "$template/task.sh" "$template/map.sh" "$template/_template.md" "$xm/" || exit 1
for s in selftest.sh copy.sh profile.sh; do sed "s/^language='{{PACKAGE_LANGUAGE}}'\$/language='x-test'/" "$template/$s" > "$xm/$s"; done
check "x-test: the source has the language placeholder in all three" "$(grep -lx "language='x-test'" "$xm"/*.sh | wc -l | tr -d ' ')" "3"
lp=$(fresh_plan "$here/fixture/agent_plans/lean-plan") || exit 2
cp "$template/status.sh" "$template/task.sh" "$template/map.sh" "$lp/" || exit 2
out_xm=$(sh "$xm/selftest.sh" "$lp" 2>&1)
check "x-test: selftest in the test language ends on its key" "$(printf '%s\n' "$out_xm" | tail -1)" "x-test:selftest.allGood $lp"
check "x-test: selftest: every test with the table text" "$(printf '%s\n' "$out_xm" | grep -c '^  ok    x-test:selftest\.')" "$(printf '%s\n' "$out_xm" | grep -c '^  ok ')"
check "x-test: selftest: the task.sh refusal does not show raw" "$(printf '%s\n' "$out_xm" | grep -c 'x-test:task\.')" "0"
check "x-test: selftest: usage in the test language" "$(sh "$xm/selftest.sh" 2>&1)" "x-test:selftest.usage"
check "x-test: copy.sh: usage in the test language" "$(sh "$xm/copy.sh" 2>&1)" "x-test:copy.usage"
check "x-test: copy.sh: missing file in the test language" "$(sh "$xm/copy.sh" nada.md "$tmp/xm-dest/nada.md" 2>&1)" "x-test:copy.missing nada.md $xm"
check "x-test: copy.sh: existing destination in the test language" "$(sh "$xm/copy.sh" status.sh "$xm/task.sh" 2>&1)" "x-test:copy.alreadyExists $xm/task.sh"
check "x-test: copy.sh: name with a slash in the test language" "$(sh "$xm/copy.sh" a/b "$tmp/xm-dest/b" 2>&1)" "x-test:copy.notAName a/b"
check "x-test: profile.sh: usage in the test language" "$(sh "$xm/profile.sh" 2>&1)" "x-test:profile.usage"
check "x-test: profile.sh: unknown profile in the test language" "$(sh "$xm/profile.sh" medio "$template/PHASE.md" "$tmp/xm-phase.md" 2>&1)" "x-test:profile.unknown medio"
printf '{{#full}}\nx\n' > "$tmp/xm-unclosed.md"
check "x-test: profile.sh: unclosed block in the test language" "$(sh "$xm/profile.sh" full "$tmp/xm-unclosed.md" "$tmp/xm-out.md" 2>&1)" "x-test:profile.noClose $tmp/xm-unclosed.md full"
printf '{{#full}}\n{{#lean}}\n' > "$tmp/xm-inside.md"
check "x-test: profile.sh: block inside a block in the test language" "$(sh "$xm/profile.sh" full "$tmp/xm-inside.md" "$tmp/xm-out.md" 2>&1)" "x-test:profile.openInside $tmp/xm-inside.md 2 full"

# the text output of status.sh and the messages of task.sh and map.sh (MAP.md included)
# follow the plan.json language, with the strings from core/i18n; --json and --options
# do not change. Three identical plans: language pt-BR, no language (means pt-BR) and the test language.
i18n="$(dirname "$template")/i18n"
li="$tmp/languages"
mkdir -p "$li" || exit 1
# the same folder name in all three, so the --json name is the same
for l in pt x0 xt; do
  mkdir "$li/$l" && cp -R "$here/fixture/agent_plans/test-plan" "$li/$l/" && cp "$template/status.sh" "$template/task.sh" "$template/map.sh" "$li/$l/test-plan/" || exit 1
done
printf '{"contract": 1, "name": "test-plan", "language": "pt-BR"}\n' > "$li/pt/test-plan/plan.json"
rm -f "$li/x0/test-plan/plan.json"
printf '{"contract": 1, "name": "test-plan", "language": "x-test"}\n' > "$li/xt/test-plan/plan.json"
# fixed fragments of an area's pt-BR strings (what is left between the {n}, 6 characters or more: "repos" and "Task" are also in the fixture titles)
fragments() { jq -r --arg a "$1." 'to_entries[] | select(.key | startswith($a)) | .value | gsub("\\{[0-9]+\\}"; "\n") | split("\n")[] | gsub("^ +| +$"; "") | select(length >= 6)' "$i18n/pt-BR.json"; }
# the lines of <text> with some pt-BR fragment of the area, leaving out the test-language keys
# (x-test:map.taskColumn contains "Task")
with_ptbr() { printf '%s\n' "$2" | sed 's/x-test:[A-Za-z.]*//g' | grep -F "$(fragments "$1")"; }
txt_pt=$(sh "$li/pt/test-plan/status.sh" --all)
txt_xt=$(sh "$li/xt/test-plan/status.sh" --all)
check "languages: status.sh in pt-BR has the pt-BR headings" "$(printf '%s\n' "$txt_pt" | grep -c -e '^PROGRESSO: ' -e '^EM ANDAMENTO (' -e '^LIVRES PARA UMA SESSÃO (' -e '^CONCLUÍDAS (')" "4"
check "languages: status.sh without language equal to pt-BR" "$(sh "$li/x0/test-plan/status.sh" --all | sed 's/há [0-9].*(desde/(desde/')" "$(printf '%s\n' "$txt_pt" | sed 's/há [0-9].*(desde/(desde/')"
check "languages: status.sh in the test language without pt-BR text" "$(with_ptbr status "$txt_xt")" ""
check "languages: status.sh in the test language with its strings" "$(printf '%s\n' "$txt_xt" | grep -c -e '^x-test:status.progress ' -e '^x-test:status.inProgress ' -e '^x-test:status.available ' -e '^x-test:status.legend$')" "4"
check "languages: without a plan, the test language too" "$(mkdir -p "$li/empty" && cp "$template/status.sh" "$li/xt/test-plan/plan.json" "$li/empty/" && sh "$li/empty/status.sh")" "x-test:status.noTasks empty"
check "languages: --json of the test language equal to pt-BR, except language" "$(sh "$li/xt/test-plan/status.sh" --json | jq -c 'del(.language)')" "$(sh "$li/pt/test-plan/status.sh" --json | jq -c 'del(.language)')"
check "languages: --json of the test language names the language" "$(sh "$li/xt/test-plan/status.sh" --json | jq -r .language)" "x-test"
check "languages: --options does not change with the language" "$(sh "$li/xt/test-plan/status.sh" --options)" "$(sh "$li/pt/test-plan/status.sh" --options)"
# task.sh: the success and refusal messages
out_xt=$(sh "$li/xt/test-plan/task.sh" claim F1-01 2>&1; sh "$li/xt/test-plan/task.sh" claim F1-01 2>&1; sh "$li/xt/test-plan/task.sh" release F1-01 2>&1; sh "$li/xt/test-plan/task.sh" release F1-01 2>&1; sh "$li/xt/test-plan/task.sh" close F1-01 2>&1; sh "$li/xt/test-plan/task.sh" claim F9-99 2>&1; sh "$li/xt/test-plan/task.sh" zap F1-01 2>&1; sh "$li/xt/test-plan/task.sh" 2>&1)
check "languages: task.sh in the test language without pt-BR text" "$(with_ptbr task "$out_xt")" ""
check "languages: task.sh in the test language with its strings" "$(printf '%s\n' "$out_xt" | grep -c '^x-test:task\.')" "8"
out_pt=$(sh "$li/pt/test-plan/task.sh" claim F1-01 2>&1; sh "$li/pt/test-plan/task.sh" release F1-01 2>&1)
check "languages: task.sh in pt-BR as before" "$(printf '%s\n' "$out_pt" | sed 's/[0-9T:-]*Z$/<hora>/')" "$(printf 'F1-01 em andamento desde <hora>\nF1-01 voltou a ready')"
# map.sh: MAP.md and the line it prints
out_xt=$(sh "$li/xt/test-plan/map.sh")
check "languages: map.sh in the test language without pt-BR text" "$(with_ptbr map "$out_xt$(cat "$li/xt/test-plan/MAP.md")")" ""
# title, critical path and the table header of each of the two fixture phases
check "languages: MAP.md in the test language with its strings" "$(grep -c -e '^# x-test:map.title$' -e '^x-test:map.criticalPath ' -e '^| ID | x-test:map.taskColumn | x-test:map.typeColumn | x-test:map.trackColumn |$' "$li/xt/test-plan/MAP.md")" "4"
check "languages: MAP.md keeps the task lines" "$(grep -c '^| \[' "$li/xt/test-plan/MAP.md")" "$(sh "$li/pt/test-plan/map.sh" >/dev/null && grep -c '^| \[' "$li/pt/test-plan/MAP.md")"
check "languages: map.sh in pt-BR as before" "$(sh "$li/pt/test-plan/map.sh" | sed 's/[0-9]*//g')" "MAP.md reescrito ( tasks)"
# the same for the en language, which the scripts also embed. The pt-BR fragments the English
# text also contains (file names, "claim|close|…", "phase-*/") do not count as pt-BR text.
with_ptbr_en() {
  while IFS= read -r t; do
    jq -e --arg a "$1." --arg t "$t" '[to_entries[] | select(.key | startswith($a)) | .value | contains($t)] | any' "$i18n/en.json" >/dev/null && continue
    printf '%s\n' "$2" | grep -F -e "$t"
  done <<EOF
$(fragments "$1")
EOF
}
mkdir -p "$li/en" && cp -R "$here/fixture/agent_plans/test-plan" "$li/en/" && cp "$template/status.sh" "$template/task.sh" "$template/map.sh" "$li/en/test-plan/" || exit 1
printf '{"contract": 1, "name": "test-plan", "language": "en"}\n' > "$li/en/test-plan/plan.json"
txt_en=$(sh "$li/en/test-plan/status.sh" --all)
check "en: status.sh without pt-BR text" "$(with_ptbr_en status "$txt_en")" ""
check "en: status.sh without accents, « or »" "$(printf '%s\n' "$txt_en" | grep -v -E '^ {2}F[0-9]|^ {12}' | grep -c -E 'á|à|â|ã|é|ê|í|ó|ô|õ|ú|ç|Á|É|Í|Ó|Ú|Ç|«|»')" "0"
check "en: status.sh with the English headings" "$(printf '%s\n' "$txt_en" | grep -c -e '^PROGRESS: ' -e '^IN PROGRESS (' -e '^AVAILABLE FOR A SESSION (' -e '^DONE (')" "4"
check "en: without a plan, status.sh in en" "$(mkdir -p "$li/empty-en" && cp "$template/status.sh" "$li/en/test-plan/plan.json" "$li/empty-en/" && sh "$li/empty-en/status.sh")" "$(jq -r '.["status.noTasks"]' "$i18n/en.json" | sed 's/{0}/empty-en/')"
check "en: --json equal to pt-BR, except language" "$(sh "$li/en/test-plan/status.sh" --json | jq -c 'del(.language)')" "$(sh "$li/pt/test-plan/status.sh" --json | jq -c 'del(.language)')"
check "en: --json names the language" "$(sh "$li/en/test-plan/status.sh" --json | jq -r .language)" "en"
check "en: --options does not change with the language" "$(sh "$li/en/test-plan/status.sh" --options)" "$(sh "$li/pt/test-plan/status.sh" --options)"
out_en=$(sh "$li/en/test-plan/task.sh" claim F1-01 2>&1; sh "$li/en/test-plan/task.sh" claim F1-01 2>&1; sh "$li/en/test-plan/task.sh" release F1-01 2>&1; sh "$li/en/test-plan/task.sh" release F1-01 2>&1; sh "$li/en/test-plan/task.sh" close F1-01 2>&1; sh "$li/en/test-plan/task.sh" claim F9-99 2>&1; sh "$li/en/test-plan/task.sh" zap F1-01 2>&1; sh "$li/en/test-plan/task.sh" 2>&1; sh "$li/en/test-plan/task.sh" cancel F1-01 --reason x 2>&1; sh "$li/en/test-plan/task.sh" giveup F9-99 2>&1)
check "en: task.sh without pt-BR text" "$(with_ptbr_en task "$out_en")" ""
check "en: task.sh without accents, « or »" "$(printf '%s\n' "$out_en" | grep -c -E 'á|à|â|ã|é|ê|í|ó|ô|õ|ú|ç|Á|É|Í|Ó|Ú|Ç|«|»')" "0"
out_en=$(sh "$li/en/test-plan/task.sh" claim F1-01 2>&1; sh "$li/en/test-plan/task.sh" release F1-01 2>&1)
check "en: task.sh with the English strings" "$(printf '%s\n' "$out_en" | sed 's/[0-9T:-]*Z$/<hora>/')" "$(printf 'F1-01 in progress since <hora>\nF1-01 is back to ready')"
out_en=$(sh "$li/en/test-plan/map.sh")
check "en: map.sh without pt-BR text" "$(with_ptbr_en map "$out_en$(cat "$li/en/test-plan/MAP.md")")" ""
check "en: MAP.md without accents, « or »" "$(grep -v '^| \[' "$li/en/test-plan/MAP.md" | grep -c -E 'á|à|â|ã|é|ê|í|ó|ô|õ|ú|ç|Á|É|Í|Ó|Ú|Ç|«|»')" "0"
check "en: MAP.md with the English heading" "$(grep -c -e "^# $(jq -r '.["map.title"]' "$i18n/en.json")\$" -e '^| ID | Task | Type | Track |$' "$li/en/test-plan/MAP.md")" "3"
# the strings block of the three scripts is up to date with core/i18n
if sh "$(dirname "$(dirname "$template")")/tools/script-strings.sh" --check >/dev/null 2>&1; then ok "languages: script strings up to date with core/i18n"; else ko "languages: script strings up to date with core/i18n (sh tools/script-strings.sh)"; fi

# cancel, giveup and reopen (core/contract/contract.md, "Cancel, give up and reopen"). The 14
# edit cases and the reasons table belong to the contract suite; here that suite runs against the
# template task.sh, and this file tests what it does not cover: usage, the text preview, status.sh
# and map.sh with the new state.
repo_root=$(dirname "$(dirname "$template")")
if sh "$repo_root/core/contract/conformance/edit.sh" "$template/task.sh" > "$tmp/edit.txt" 2>&1; then ok "giveup: contract edit cases and reasons ($(tail -1 "$tmp/edit.txt"))"; else ko "giveup: contract edit cases and reasons"; sed 's/^/        /' "$tmp/edit.txt"; fi
ab="$tmp/giveup/agent_plans/ab"
mkdir -p "$ab/phase-1-base" "$ab/phase-2-win" || exit 1
cp "$template/status.sh" "$template/task.sh" "$template/map.sh" "$ab/" || exit 1
printf '{"contract": 1, "name": "ab", "language": "pt-BR"}\n' > "$ab/plan.json"
printf 'Status: done\nType: code\n\n# F1-01 - Base\n' > "$ab/phase-1-base/F1-01-base.md"
printf 'Status: ready\nType: human\nBlocked by: F1-01\n\n# F1-02 - Provar no Windows\n\n## Log\n' > "$ab/phase-1-base/F1-02-windows.md"
printf 'Status: draft\nType: code\nBlocked by: F1-02\n\n# F2-01 - Instalador\n' > "$ab/phase-2-win/F2-01-instalador.md"
printf 'Status: ready\nType: code\nBlocked by: F2-01\n\n# F2-02 - Assinar\n' > "$ab/phase-2-win/F2-02-assinar.md"
usage_ab() { sh "$ab/task.sh" "$@" 2>&1 | cut -c1-4; }
check "giveup: unknown option, giveup --json --yes, cancel --yes and claim --reason give the usage" \
  "$(usage_ab cancel F1-02 --zap; usage_ab giveup F1-02 --json --yes; usage_ab cancel F1-02 --yes --reason ok; usage_ab claim F1-02 --reason ok)" "$(printf 'Uso:\nUso:\nUso:\nUso:')"
before_ab=$(cat "$ab"/phase-*/*.md)
preview=$(sh "$ab/task.sh" giveup F1-02 --reason "ignorado sem yes")
check "giveup: the text preview changes nothing and lists the graph, indented by parent" "$(cat "$ab"/phase-*/*.md)$(printf '%s\n' "$preview" | sed -n '2,4p' | sed 's/  \[.*//')" "$before_ab$(printf '  F1-02  Provar no Windows\n    F2-01  Instalador\n      F2-02  Assinar')"
check "giveup: the preview names the phase that becomes abandoned" "$(printf '%s\n' "$preview" | grep -c '^Fases que ficam abandonadas: phase-2-win$')" "1"
# the preview hint quotes the path from the project root, like MAP.md
check "giveup: the preview hint quotes sh agent_plans/<name>/task.sh inside agent_plans/" "$(printf '%s\n' "$preview" | grep -c 'sh agent_plans/ab/task\.sh giveup F1-02 ')" "1"
mkdir -p "$tmp/outside-ab" && cp -R "$ab" "$tmp/outside-ab/" || exit 1
check "giveup: the preview hint quotes sh <name>/task.sh outside agent_plans/" "$(sh "$tmp/outside-ab/ab/task.sh" giveup F1-02 | grep -c -e 'sh ab/task\.sh giveup F1-02 ' -e 'agent_plans/')" "1"
sh "$ab/task.sh" giveup F1-02 --reason "Sem máquina Windows" --yes >/dev/null
jab=$(sh "$ab/status.sh" --json)
check "giveup: abandoned ones out of the total, the abandoned phase and the give-up keys" \
  "$(printf '%s\n' "$jab" | jq -c '[.progress.total, .progress.done, ([.phases[] | select(.abandoned) | .dir]), ([.tasks[] | select(.group == "abandoned") | .id]), .tasks[1].given_up_by, .tasks[2].given_up_with, (.tasks[0] | has("given_up_by"))]')" \
  '[1,1,["phase-2-win"],["F1-02","F2-01","F2-02"],"owner","F1-02",false]'
check "giveup: the text marks the abandoned phase and --all lists the abandoned tasks" \
  "$(sh "$ab/status.sh" --all | grep -c -e '^  phase-2-win .* (abandonada)$' -e '^ABANDONADAS (3)')" "2"
sh "$ab/map.sh" >/dev/null
check "giveup: the MAP.md critical path does not go through abandoned tasks" "$(sed -n 's/^\*\*Caminho crítico\*\* (a cadeia mais longa de bloqueios): //p' "$ab/MAP.md")" "F1-01"
sh "$ab/task.sh" reopen F1-02 >/dev/null
check "giveup: reopen restores the previous states" "$(awk 'FNR == 1' "$ab"/phase-*/*.md | tr '\n' ' ')" "Status: done Status: ready Status: draft Status: ready "
# the reason reaches awk through the environment: quotes, backslash, &, % and {1} reach the ## Log as written
# shellcheck disable=SC2016 # the $HOME is part of the reason, not an expansion
odd='Sem "aspas" \n c:\dir & 50%s {1} $HOME'
sh "$ab/task.sh" cancel F2-02 --reason "$odd" >/dev/null
check "cancel: reason with quotes, backslashes, & and % written as given" "$(sed -n 's/^- Cancelada\. Motivo: //p' "$ab/phase-2-win/F2-02-assinar.md")" "$odd"
check "giveup: no temporary file nor lock left" "$(find "$ab" -name '*.tmp.*' -o -name '.list*' -o -name '.lock-*' | wc -l | tr -d ' ')" "0"

# A multi-file edit is all-or-nothing (contract, "Write order", step 4). TASK_TEST_FAIL_RENAME=2 makes the
# second rename fail; TASK_TEST_FAIL_RESTORE=1 makes the restores fail too.
rb="$tmp/rollback/agent_plans/rb"
mkdir -p "$rb/phase-1-base" || exit 1
cp "$template/status.sh" "$template/task.sh" "$template/map.sh" "$rb/" || exit 1
printf '{"contract": 1, "name": "rb", "language": "pt-BR"}\n' > "$rb/plan.json"
printf 'Status: ready\nType: code\n\n# F1-01 - Um\n\n## Log\n' > "$rb/phase-1-base/F1-01-um.md"
printf 'Status: ready\nType: code\nBlocked by: F1-01\n\n# F1-02 - Dois\n\n## Log\n' > "$rb/phase-1-base/F1-02-dois.md"
printf 'Status: ready\nType: code\nBlocked by: F1-02\n\n# F1-03 - Tres\n\n## Log\n' > "$rb/phase-1-base/F1-03-tres.md"
before_rb=$(cat "$rb"/phase-*/*.md)
out_rb=$(TASK_TEST_FAIL_RENAME=2 sh "$rb/task.sh" giveup F1-01 --reason "forcando a falha" --yes 2>&1); rc_rb=$?
check "rollback: a rename that fails exits 1 with task.rewriteFailed naming the file" "$rc_rb $out_rb" "1 Falhou a reescrita de phase-1-base/F1-02-dois.md; o arquivo ficou como estava."
check "rollback: every file is back to the text it had" "$(cat "$rb"/phase-*/*.md)" "$before_rb"
check "rollback: no temporary, backup, list nor lock left" "$(find "$rb" -name '*.tmp.*' -o -name '.list*' -o -name '.lock-*' | wc -l | tr -d ' ')" "0"
out_rb=$(TASK_TEST_FAIL_RENAME=3 TASK_TEST_FAIL_RESTORE=1 sh "$rb/task.sh" giveup F1-01 --reason "forcando a falha" --yes 2>&1); rc_rb=$?
check "rollback: a restore that fails too exits 1 naming the state of each file" "$rc_rb
$out_rb" "1
Falhou a reescrita de phase-1-base/F1-03-tres.md, e desfazer os arquivos já gravados também falhou. Estado de cada arquivo:
  phase-1-base/F1-01-um.md: trocado (o texto novo ficou)
  phase-1-base/F1-02-dois.md: trocado (o texto novo ficou)
  phase-1-base/F1-03-tres.md: intacto"
check "rollback: after a failed restore no temporary, backup, list nor lock is left" "$(find "$rb" -name '*.tmp.*' -o -name '.list*' -o -name '.lock-*' | wc -l | tr -d ' ')" "0"

# An unknown option is refused, a task name with spaces is a task, and a duplicated id is named and refused.
rr="$tmp/robust/agent_plans/rr"
mkdir -p "$rr/phase-1-a" "$rr/phase-2-b" && cp "$template/status.sh" "$template/task.sh" "$template/map.sh" "$rr/" || exit 1
printf '{"contract": 1, "name": "rr", "language": "x-test"}\n' > "$rr/plan.json"
printf 'Status: ready\nType: code\nTrack: t\n\n# F1-01 - Spaced\n' > "$rr/phase-1-a/F1-01 first draft.md"
printf 'Status: ready\nType: code\nTrack: t\nBlocked by: F1-01\n\n# F1-02 - Next\n' > "$rr/phase-1-a/F1-02-next.md"
out_rr=$(sh "$rr/status.sh" --bogus 2>"$tmp/rr-err"); rc_rr=$?
check "status.sh --bogus: exit 1, the option on stderr, nothing on stdout" "$rc_rr|$(cat "$tmp/rr-err")|$out_rr" "1|x-test:status.unknownOption --bogus|"
out_rr=$(sh "$rr/map.sh" --bogus 2>"$tmp/rr-err"); rc_rr=$?
check "map.sh --bogus: exit 1, the option on stderr, no MAP.md" "$rc_rr|$(cat "$tmp/rr-err")|$(test -e "$rr/MAP.md" && echo MAP.md)" "1|x-test:map.unknownOption --bogus|"
# --help (or -h) prints the usage on stdout and exits 0, before any other argument is judged.
out_rr=$(sh "$rr/status.sh" --help 2>"$tmp/rr-err"); rc_rr=$?
check "status.sh --help: the usage on stdout, exit 0, nothing on stderr" "$rc_rr|$(cat "$tmp/rr-err")|$out_rr" "0||x-test:status.usage agent_plans/rr
x-test:status.helpFilter
x-test:status.helpAll
x-test:status.helpOptions
x-test:status.helpJson"
check "status.sh -h, and --help after an unknown option: the same usage, exit 0" "$(sh "$rr/status.sh" -h 2>&1; echo "rc=$?")|$(sh "$rr/status.sh" --bogus --help 2>&1; echo "rc=$?")" "$out_rr
rc=0|$out_rr
rc=0"
out_rr=$(sh "$rr/map.sh" --help 2>"$tmp/rr-err"); rc_rr=$?
check "map.sh --help: the usage on stdout, exit 0, no MAP.md" "$rc_rr|$(cat "$tmp/rr-err")|$out_rr|$(test -e "$rr/MAP.md" && echo MAP.md)" "0||x-test:map.usage agent_plans/rr|"
check "map.sh -h: the same usage" "$(sh "$rr/map.sh" -h 2>&1)" "$out_rr"
out_rr=$(sh "$rr/task.sh" --help 2>"$tmp/rr-err"); rc_rr=$?
check "task.sh --help: the usage and one line per verb on stdout, exit 0" "$rc_rr|$(cat "$tmp/rr-err")|$out_rr" "0||x-test:task.usage agent_plans/rr
x-test:task.helpClaim
x-test:task.helpClose
x-test:task.helpRelease
x-test:task.helpCancel
x-test:task.helpGiveup
x-test:task.helpReopen"
check "task.sh -h: the same usage" "$(sh "$rr/task.sh" -h 2>&1)" "$out_rr"
check "task.sh with no arguments: still the usage on stderr, exit 1" "$(sh "$rr/task.sh" 2>&1 >/dev/null; echo "rc=$?")" "x-test:task.usage agent_plans/rr
rc=1"
check "name with spaces: status.sh reads it" "$(sh "$rr/status.sh" --json | jq -r '[.tasks[] | "\(.id) \(.group)"] | join(",")')" "F1-01 available,F1-02 blocked"
sh "$rr/map.sh" >/dev/null
check "name with spaces: MAP.md links it with %20" "$(grep -c '^| \[F1-01\](phase-1-a/F1-01%20first%20draft.md) | Spaced |' "$rr/MAP.md")" "1"
check "name with spaces: claim finds it by its id" "$(sh "$rr/task.sh" claim F1-01 >/dev/null 2>&1; echo $?) $(sed -n 1p "$rr/phase-1-a/F1-01 first draft.md")" "0 Status: in-progress"
sh "$rr/task.sh" release F1-01 >/dev/null 2>&1
printf 'Status: done\nType: code\nTrack: t\n\n# F1-01 - Again\n' > "$rr/phase-2-b/F1-01-again.md"
txt_rr=$(sh "$rr/status.sh")
check "duplicated id: a section of its own with the id and each file" "$(printf '%s\n' "$txt_rr" | sed -n '/^x-test:status.duplicateId 2$/,/^$/p' | sed -n '2,3p')" "  F1-01     phase-1-a/F1-01 first draft.md
  F1-01     phase-2-b/F1-01-again.md"
check "duplicated id: not in the invalid-status section" "$(printf '%s\n' "$txt_rr" | grep -c 'x-test:status.invalidStatus')" "0"
check "duplicated id: the copy that says done does not unblock F1-02" "$(sh "$rr/status.sh" --json | jq -r '.tasks[] | select(.id == "F1-02") | "\(.group) \(.waiting_on | join(","))"')" "blocked F1-01"
out_rr=$(sh "$rr/task.sh" claim F1-01 2>&1); rc_rr=$?
check "duplicated id: claim refuses naming both files, and nothing changes" "$rc_rr|$out_rr|$(sed -n 1p "$rr/phase-1-a/F1-01 first draft.md")" "1|x-test:task.ambiguousId F1-01 phase-1-a/F1-01 first draft.md, phase-2-b/F1-01-again.md|Status: ready"
out_rr=$(sh "$xm/selftest.sh" "$rr" 2>&1)
check "duplicated id: selftest.sh fails the check without an invalid state" "$(printf '%s\n' "$out_rr" | grep -c 'selftest.statusValid') $(printf '%s\n' "$out_rr" | grep -c '^  ok .*selftest.statusValid')" "1 0"

# text and --options equal to the old status.sh's
if [ -n "$old" ]; then
  p=$(new_plan) || exit 2
  cp "$old" "$p/status-old.sh"
  # "há N min" changes with the clock: a difference is retried once before it counts as a failure.
  # shellcheck disable=SC2086 # $1 carries zero, one or two arguments ("resto --all")
  same_text() { [ "$(sh "$p/status.sh" $1)" = "$(sh "$p/status-old.sh" $1)" ]; }
  for args in "" "--all" "--options" "F1" "resto --all"; do
    if same_text "$args" || same_text "$args"; then ok "text equal to the old one: \"${args}\""; else ko "text equal to the old one: \"${args}\""; fi
  done
fi

suite_end
