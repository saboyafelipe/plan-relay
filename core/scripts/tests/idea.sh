#!/bin/sh
# Tests idea.sh: count, sync and status of an idea in agent_plans/_ideas/; the refused
# transitions and the end-to-end case open → refining → ready → mapped.
# Everything in a temporary directory. Usage: sh core/scripts/tests/idea.sh
# Exits 0 with "all good" when everything passes.

here=$(cd "$(dirname "$0")" && pwd) || exit 2
scripts=$(dirname "$here")
idea="$scripts/idea.sh"
template="$(dirname "$scripts")/template/idea.md"
# shellcheck source=tools/tests/lib.sh
. "$here/../../../tools/tests/lib.sh"
suite_start core/scripts/tests/idea.sh 60
# key <file> <key>: the value of the first "<key>: …" line of the file
key() { sed -n "s/^$2: //p" "$1" | sed -n '1p'; }
# same <a> <b>: "same" when the two files are equal byte for byte
same() { if cmp -s "$1" "$2"; then printf same; else printf different; fi; }

printf '%s\n' "idea.sh count"
a="$tmp/zero.md"
printf 'Status: open\nCreated: 2026-11-14T10:00Z\nOpen questions: 3\n\n# Zero\n\nTexto com pergunta? E outra?\n\n## Perguntas em aberto\n<!-- open-questions -->\n\n' > "$a"
check "empty section → 0 (a ? in the text does not count)" "$(sh "$idea" count "$a")" "0"
b="$tmp/two.md"
# shellcheck disable=SC2016 # the code block backticks are literal text of the idea
printf 'Status: refining\nCreated: 2026-11-14T10:00Z\nOpen questions: 0\n\n# Duas\n\n- item fora da seção\n\n## Decisões\n\n- decidido\n* também decidido\n\n## Perguntas em aberto\n<!-- open-questions -->\n\n- Primeira?\n  - detalhe da primeira, não conta\n  continuação da primeira\n* Segunda?\n\n```\n- dentro de bloco de código, não conta\n```\n\n## Depois\n\n- fora outra vez\n' > "$b"
check "two items in the section; outside it, nested and in a code block do not count" "$(sh "$idea" count "$b")" "2"
c="$tmp/numbered.md"
printf 'Status: open\nCreated: 2026-11-14T10:00Z\nOpen questions: 0\n\n# Numerada\n\n## Open questions\n<!-- open-questions -->\n\n1. First?\n2. Second?\n10. Tenth?\n\n# Not a section\n' > "$c"
check "numbered items count; heading in another language, found by the marker" "$(sh "$idea" count "$c")" "3"
d="$tmp/no-marker.md"
printf 'Status: open\nCreated: 2026-11-14T10:00Z\nOpen questions: 1\n\n# Sem marcador\n\n## Perguntas em aberto\n\n- Uma?\n' > "$d"
check "no marker → exit 1" "$(exit_of sh "$idea" count "$d")" "1"
check "missing file → exit 1" "$(exit_of sh "$idea" count "$tmp/none.md")" "1"
check "no file → exit 2" "$(exit_of sh "$idea" count)" "2"
check "unknown action → exit 2" "$(exit_of sh "$idea" contar "$a")" "2"

printf '%s\n' "idea.sh sync"
sh "$idea" sync "$b"
check "sync writes the count" "$(key "$b" 'Open questions')" "2"
cp "$b" "$tmp/b1.md"
sh "$idea" sync "$b"
check "sync is idempotent (file equal byte for byte)" "$(same "$b" "$tmp/b1.md")" "same"
e="$tmp/repeated.md"
printf 'Status: open\nCreated: 2026-11-14T10:00Z\nOwner: alguém\nOpen questions: 9\nOpen questions: 7\n\n# Repetida\n\nOpen questions: 5 (no corpo, não é cabeçalho)\n\n## Perguntas em aberto\n<!-- open-questions -->\n\n- Uma?\n' > "$e"
sh "$idea" sync "$e"
check "repeated key: only the last one changes" "$(sed -n '4,5p' "$e" | tr '\n' '|')" "Open questions: 9|Open questions: 1|"
check "unknown header line kept" "$(sed -n '3p' "$e")" "Owner: alguém"
check "the body does not change" "$(grep -c '^Open questions: 5 (no corpo' "$e")" "1"
f="$tmp/no-key.md"
printf 'Status: open\nCreated: 2026-11-14T10:00Z\n\n# Sem chave\n\n## Perguntas em aberto\n<!-- open-questions -->\n\n- Uma?\n- Duas?\n' > "$f"
sh "$idea" sync "$f"
check "no Open questions: → written right after Created:" "$(sed -n '1,3p' "$f" | tr '\n' '|')" "Status: open|Created: 2026-11-14T10:00Z|Open questions: 2|"
cp "$d" "$tmp/d1.md"
check "sync without a marker → exit 1" "$(exit_of sh "$idea" sync "$d")" "1"
check "sync without a marker leaves the file alone" "$(same "$d" "$tmp/d1.md")" "same"

printf '%s\n' "idea.sh status"
g="$tmp/status.md"
cp "$a" "$g"
sh "$idea" status "$g" refining
check "refining written" "$(key "$g" Status)" "refining"
check "Plan: absent outside mapped" "$(grep -c '^Plan:' "$g")" "0"
cp "$g" "$tmp/g1.md"
check "status outside the contract → exit 2" "$(exit_of sh "$idea" status "$g" aberta)" "2"
check "invalid status leaves the file alone" "$(same "$g" "$tmp/g1.md")" "same"
check "plan outside mapped → exit 2" "$(exit_of sh "$idea" status "$g" ready agent_plans/x)" "2"
check "mapped without a plan → exit 2" "$(exit_of sh "$idea" status "$g" mapped)" "2"
sh "$idea" status "$g" mapped agent_plans/exportar-csv/
check "mapped writes Status:" "$(key "$g" Status)" "mapped"
check "mapped writes Plan: without the trailing slash" "$(key "$g" Plan)" "agent_plans/exportar-csv"
check "Plan: in the header, before the title" "$(sed -n '1,/^# /p' "$g" | grep -c '^Plan: ')" "1"
sh "$idea" status "$g" mapped agent_plans/outro
check "mapped again replaces Plan:, without duplicating it" "$(grep -c '^Plan: ' "$g") $(key "$g" Plan)" "1 agent_plans/outro"
h="$tmp/no-status.md"
printf 'Created: 2026-11-14T10:00Z\nOpen questions: 0\n\n# Sem status\n' > "$h"
sh "$idea" status "$h" open
check "no Status: → written on the first line" "$(sed -n '1p' "$h")" "Status: open"

printf '%s\n' "idea.sh refused transitions"
m="$tmp/mapped.md"
printf 'Status: mapped\nPlan: agent_plans/x\nCreated: 2026-11-14T10:00Z\nOpen questions: 0\n\n# Mapeada\n\n## Perguntas em aberto\n<!-- open-questions -->\n' > "$m"
cp "$m" "$tmp/m1.md"
for back in open refining ready; do
  check "leaving mapped for $back → exit 2" "$(exit_of sh "$idea" status "$m" "$back")" "2"
done
check "refused exit from mapped leaves the file alone" "$(same "$m" "$tmp/m1.md")" "same"
check "the refusal names the current Plan:" "$(sh "$idea" status "$m" refining 2>&1 | grep -c 'agent_plans/x')" "1"
n="$tmp/mapped-last.md"
printf 'Status: open\nStatus: mapped\nPlan: agent_plans/y\nPlan: agent_plans/z\nCreated: 2026-11-14T10:00Z\nOpen questions: 0\n\n# Mapped last\n' > "$n"
check "repeated Status: the last one counts, so leaving mapped is refused" "$(exit_of sh "$idea" status "$n" refining)" "2"
check "repeated Plan: the refusal names the last one" "$(sh "$idea" status "$n" refining 2>&1 | grep -c 'agent_plans/z')" "1"
sh "$idea" status "$n" mapped agent_plans/w
check "repeated Status: and Plan: the verb rewrites the last of each" "$(sed -n '1,4p' "$n" | tr '\n' '|')" "Status: open|Status: mapped|Plan: agent_plans/y|Plan: agent_plans/w|"
r="$tmp/ready-with-questions.md"
printf 'Status: refining\nCreated: 2026-11-14T10:00Z\nOpen questions: 1\n\n# Pronta\n\n## Perguntas em aberto\n<!-- open-questions -->\n\n- Ainda uma?\n' > "$r"
check "ready with Open questions: above 0 → accepted (exit 0)" "$(exit_of sh "$idea" status "$r" ready)" "0"
check "ready with questions: Status: ready written" "$(key "$r" Status)" "ready"
sh "$idea" status "$r" refining
check "ready with questions: warns on stderr" "$(sh "$idea" status "$r" ready 2>&1 >/dev/null | grep -c 'Open questions: 1')" "1"
u="$tmp/unknown.md"
printf 'Status: refining\nCreated: 2026-11-14T10:00Z\n\n# Sem contagem\n' > "$u"
check "ready without Open questions: (unknown) warns too" "$(sh "$idea" status "$u" ready 2>&1 >/dev/null | grep -c 'Open questions')" "1"
z="$tmp/ready-no-questions.md"
printf 'Status: refining\nCreated: 2026-11-14T10:00Z\nOpen questions: 0\n\n# Pronta\n' > "$z"
check "ready with 0 questions: no warning" "$(sh "$idea" status "$z" ready 2>&1)" ""
check "ready goes back to refining (new question)" "$(exit_of sh "$idea" status "$z" refining) $(key "$z" Status)" "0 refining"

printf '%s\n' "idea.sh end to end: open → refining → ready → mapped"
mkdir -p "$tmp/_ideas"
p="$tmp/_ideas/exportar-csv.md"
cp "$template" "$p"
check "copied from the template: open, 0 questions, no Plan:" "$(key "$p" Status) $(key "$p" 'Open questions') $(grep -c '^Plan:' "$p")" "open 0 0"
printf '\n- Quais colunas?\n- Vírgula ou ponto e vírgula?\n' >> "$p"
sh "$idea" sync "$p"
check "two questions filled in: sync gives 2" "$(key "$p" 'Open questions')" "2"
sh "$idea" status "$p" refining
check "status refining" "$(key "$p" Status) $(key "$p" 'Open questions')" "refining 2"
sed '/^- Quais colunas?$/d; /^- Vírgula ou ponto e vírgula?$/d' "$p" > "$tmp/no-questions.md"
cat "$tmp/no-questions.md" > "$p"
sh "$idea" sync "$p"
check "questions answered: sync gives 0" "$(key "$p" 'Open questions')" "0"
check "status ready without a warning" "$(sh "$idea" status "$p" ready 2>&1) $(key "$p" Status)" " ready"
sh "$idea" status "$p" mapped agent_plans/x
check "final header: Status: mapped, Open questions: 0, Plan: agent_plans/x" "$(sed -n '1,/^# /p' "$p" | grep -E '^(Status|Open questions|Plan): ' | sort | tr '\n' '|')" "Open questions: 0|Plan: agent_plans/x|Status: mapped|"
check "final header: Plan: right after Status:" "$(sed -n '1,2p' "$p" | tr '\n' '|')" "Status: mapped|Plan: agent_plans/x|"
check "after mapped, going back to refining is refused" "$(exit_of sh "$idea" status "$p" refining) $(key "$p" Status)" "2 mapped"
check "the body came from the template (title and marker intact)" "$(grep -c '^# <título da ideia>$' "$p") $(grep -c '^<!-- open-questions -->$' "$p")" "1 1"

printf '%s\n' "idea.md template"
check "the template exists" "$(test -f "$template" && printf yes || printf no)" "yes"
check "template header: open and 0 questions" "$(key "$template" Status) $(key "$template" 'Open questions')" "open 0"
check "the template has Created:" "$(grep -c '^Created: ' "$template")" "1"
check "the template has the open-questions marker once" "$(grep -c '^<!-- open-questions -->$' "$template")" "1"
check "count on the template gives 0" "$(sh "$idea" count "$template")" "0"

suite_end
