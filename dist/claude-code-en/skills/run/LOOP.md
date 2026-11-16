# Handoff loop

On a resume (`run.open` set to `true`), the "above the limit" warning that arrives before this session's first launch may mean that merely rereading the state already costs more than the limit. Before handing off, look at the journal's `## Tasks`: if after the last "Resumed at <HH:MM>" line (in a `pt-BR` plan, «Retomada às <HH:MM>») of a previous session — or, without any, in the whole `## Tasks` — there is no `### <HH:MM> <ID> - <RESULT>` entry, the previous session launched nothing either. That is the loop: another handoff would hit the limit at the same point, endlessly. The signal is the count of those entries, not the text of the `## Handoff`.

In the loop, do not write another `## Handoff` and do not call the `handoff` skill:

1. Add to `## Tasks` the line "handoff loop: limit <n>k lower than the cost of resuming (warning at <m>k)", with the numbers from the warning. The journal stays without `## Closing` and with the `## Handoff` it already had.
2. At a git root, commit the journal as in step 3 of the `run` skill's "Closing".
3. Stop and tell the owner, with `PushNotification` and in the final message: the context at which the warning arrived and the limit; that the limit is too low to drive this plan, because merely resuming already exceeds it; and that they should raise `PLAN_RELAY_CONTEXT_LIMIT` (or remove it, so the 150k default applies) in the environment before running `/plan-relay:run <folder>` again.

The first session, which gets the warning in the preflight before a journal exists, is not a loop: it follows the "In the preflight" rule of the `run` skill's "Baton" section and hands off. The loop is only recognized in the following session. Without a loop, the handoff follows the "Baton" section.
