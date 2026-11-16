# Edit cases

Cases for the verbs of `task.sh`: `cancel`, `giveup` and `reopen` ([contract](../../contract.md#cancel-give-up-and-reopen)), and `claim`, `close` and `release` ([contract](../../contract.md#claim-close-and-release)). Each case is a plan before the verb, the arguments, and what must come out: the plan after, or the refusal, or the preview. The shell `task.sh` runs them with [`../edit.sh`](../edit.sh); a host that writes the files itself (the TypeScript of `core/`) reads the same folders and compares the same way, except the cases of `claim`, `close` and `release`, which `core/` does not implement.

## Form

```
edits/<case>/
  before/agent_plans/<plan>/…   the plan, without scripts; plan.json has "language": "x-test"
  args                          the task.sh arguments, one per line (a reason with spaces is one line)
  exit                          the expected exit code: 0 or 1
  after/agent_plans/<plan>/…    only when the verb changes files: the whole plan after the verb
  stderr                        only on refusals: the expected stderr
  preview.json                  only on a giveup --json preview: the expected stdout
```

How to compare:

1. Copy `before/` to a temporary folder; run the verb on the copy with the arguments of `args`, in that order, under `LC_ALL=C`, with the clock fixed at `2026-01-02T03:04Z` (the `<now>` that `claim` and `close` write; `task.sh` takes it from `TASK_TEST_NOW`).
2. The exit code equals `exit`.
3. The plan tree equals `after/` when the case has one, else `before/`: the same files, byte for byte, ignoring the scripts that the runner put there and the `.lock-*` folders (which must be gone).
4. With `stderr`: stderr equals the file, without the trailing line feed on either side.
5. With `preview.json`: stdout parsed as JSON equals the file after `jq -S` (any key order and spacing).
6. Stdout is not compared otherwise: the message after a change is for people.

The plans are in `x-test`, the test language of `core/i18n/`: every text is `x-test:<key>` followed by the arguments, separated by spaces, so the cases do not depend on a translation and check which text was chosen and with what.

## Texts

The verbs take their texts from `core/i18n/*.json`, area `task.`. These are the keys, with the pt-BR and en texts and the `x-test` value (the key and the pt-BR placeholders in order). The `task.log*` texts become the line `- <text>` in the `## Log`.

| Key | pt-BR | en | x-test |
| :--- | :--- | :--- | :--- |
| `task.logCancel` | `Cancelada. Motivo: {0}` | `Cancelled. Reason: {0}` | `x-test:task.logCancel {0}` |
| `task.logCancelReplaced` | `Cancelada, substituída por {0}. Motivo: {1}` | `Cancelled, replaced by {0}. Reason: {1}` | `x-test:task.logCancelReplaced {0} {1}` |
| `task.logGiveup` | `Abandonada pelo dono. Motivo: {0}` | `Given up by the owner. Reason: {0}` | `x-test:task.logGiveup {0}` |
| `task.logGiveupWith` | `Abandonada junto com {0}.` | `Given up with {0}.` | `x-test:task.logGiveupWith {0}` |
| `task.logReopen` | `Retomada.` | `Reopened.` | `x-test:task.logReopen` |
| `task.logReopenWith` | `Retomada junto com {0}.` | `Reopened with {0}.` | `x-test:task.logReopenWith {0}` |
| `task.invalidReason` | `O motivo não é válido.` | `The reason is not valid.` | `x-test:task.invalidReason` |
| `task.cancelOnlyLive` | `{0} está «{1}»: só se cancela uma task draft, ready ou in-progress.` | `{0} is "{1}": only a draft, ready or in-progress task can be cancelled.` | `x-test:task.cancelOnlyLive {0} {1}` |
| `task.invalidReplacement` | `{0} não pode ser substituída por {1}: a substituta tem de ser outra task, existir e não estar cancelled nem abandoned.` | `{0} cannot be replaced by {1}: the replacement must be another task that exists and is not cancelled or abandoned.` | `x-test:task.invalidReplacement {0} {1}` |
| `task.cancelHasDependents` | `{0} tem dependentes vivas: {1}. Crie a substituta, troque o ID no «Blocked by:» de cada uma e cancele com --replaced-by.` | `{0} has live dependents: {1}. Create the replacement, swap the id in the "Blocked by:" of each one, and cancel with --replaced-by.` | `x-test:task.cancelHasDependents {0} {1}` |
| `task.giveupOnlyReadyOrDraft` | `{0} está «{1}»: só se desiste de uma task ready ou draft.` | `{0} is "{1}": only a ready or draft task can be given up.` | `x-test:task.giveupOnlyReadyOrDraft {0} {1}` |
| `task.giveupStuck` | `Não dá para desistir de {0}: cairiam junto tasks que já começaram ou terminaram: {1}.` | `{0} cannot be given up: tasks that already started or finished would fall with it: {1}.` | `x-test:task.giveupStuck {0} {1}` |
| `task.reopenOnlyAbandoned` | `{0} está «{1}»: só se retoma uma task abandoned.` | `{0} is "{1}": only an abandoned task can be reopened.` | `x-test:task.reopenOnlyAbandoned {0} {1}` |
| `task.reopenAtRoot` | `{0} caiu junto com {1}: retome {1}, a raiz.` | `{0} fell with {1}: reopen {1}, the root.` | `x-test:task.reopenAtRoot {0} {1} {1}` |
| `task.ambiguousId` | `{0} é o ID de mais de um arquivo: {1}. Renomeie até sobrar um e rode de novo.` | `{0} is the ID of more than one file: {1}. Rename them until one is left, then run again.` | `x-test:task.ambiguousId {0} {1}` |

Lists inside an argument are joined with `, `: ids in plan order for `task.cancelHasDependents`, `<ID> (<status>)` in the order of the preview's `falls` for `task.giveupStuck` (the case `giveup-locked` tells it apart from the order in which the walk reaches them), and the files of an id in plan order (`phase-2-…` before `phase-10-…`) for `task.ambiguousId`. Usage messages, the lock and a missing task keep the texts that already exist (`task.usage`, `task.unknownAction`, `task.lockBusy`, `task.notFound`); the cases do not cover them, except `task.notFound` for an id that is not whole (`claim-id-prefix`, `claim-id-with-slug`, `cancel-id-with-slug`). The texts of the preview and of a successful change are for people and are not in the cases. The refusals of `claim`, `close` and `release` use the keys named in the [contract](../../contract.md#claim-close-and-release), in the same `x-test:<key> <arguments>` form; they are not in the table because only the shell runs those cases. The pending ids of `task.stillWaiting` each come with a leading space, so its x-test text has two spaces after the task id.

## Cases

| Case | Verb | What it checks |
| :--- | :--- | :--- |
| `cancel-plain` | `cancel` | no dependents, no replacement; the reason is normalized (spaces at the ends and inside); the log line goes after the last line of `## Log` |
| `cancel-replaced` | `cancel --replaced-by` | an `in-progress` task whose dependents were already moved to the replacement; `Replaced by:` after `Status:`, `Started:` kept; a cancelled dependent does not count; no `## Log` section, so one is added |
| `cancel-leftover-temporary` | `cancel` | temporaries left by writers that died (`<file>.tmp.0`, `<file>.plan-relay-<hex>.tmp`, [Write order](../../contract.md#write-order)) are not tasks: one holds a dependent that would refuse the cancel; the writer leaves them as they are |
| `cancel-live-dependents` | `cancel` | refused: the live dependents, a `draft` and a `done`, in plan order; an `abandoned` dependent does not count |
| `cancel-done` | `cancel` | refused: the task is `done` |
| `cancel-bad-reason` | `cancel` | refused: `--reason --------`, the value starts with `-` and is still the reason |
| `cancel-bad-replacement` | `cancel --replaced-by` | refused: the replacement is `cancelled` |
| `cancel-draft` | `cancel` | a `draft` is cancelled like a `ready` one; no `Previous status:` |
| `cancel-replaced-by-self` | `cancel --replaced-by` | refused: the replacement is the task itself |
| `cancel-replaced-by-missing` | `cancel --replaced-by` | refused: the replacement names no task |
| `cancel-status-not-first` | `cancel --replaced-by` | `Status:` on line 2: it is rewritten where it is, `Replaced by:` goes right after it, the `Type:` on line 1 stays |
| `claim-status-not-first` | `claim` | `Status:` on line 2, in the task and in its `done` blocker: both are read; `Started:` goes right after `Status:` and an old `Finished:` goes away |
| `claim-in-progress` | `claim` | refused: the task is `in-progress`, with its `Started:` |
| `claim-not-ready` | `claim` | refused: the task is `draft` |
| `claim-waiting` | `claim` | refused: a blocker is `ready` and another has no task file |
| `close-plain` | `close` | `Started:` moves right after `Status:`, followed by `Finished:`; an indented `- [ ]` and a `- [ ]` outside `## Done when` do not hold the close |
| `close-unchecked` | `close` | refused: an open box in `## Done when`, printed after the refusal |
| `close-not-in-progress` | `close` | refused: the task is `ready` |
| `release-plain` | `release` | `Status:` on line 2 becomes `ready` and `Started:` goes away |
| `release-not-in-progress` | `release` | refused: the task is `done` |
| `giveup-preview` | `giveup --json` | the tree across three phases: a `draft` child, a grandchild with another live parent (`also_depends_on`), a task with two parents that both fall (shown once, under the first that reached it), a `cancelled` dependent left out, the phase that ends up abandoned |
| `giveup-preview-missing-blocker` | `giveup --json` | a falling task whose `Blocked by:` names an id with no task file: `also_depends_on` keeps the live blocker and leaves the missing id out |
| `giveup-apply` | `giveup --yes` | the same plan applied: `Given up by:`, `Given up with:`, `Previous status: draft`, the log lines, a section after `## Log`, a file without `## Log` |
| `giveup-root-draft` | `giveup --yes` | a `draft` root: `Given up by: owner` followed by `Previous status: draft`; its `ready` dependent gets no `Previous status:` |
| `giveup-root-blocked` | `giveup --json` | a `ready` root in the `blocked` group is accepted, and its live blocker is not in its `also_depends_on` (the root's is always `[]`) |
| `giveup-cycle` | `giveup --json` | a cycle in `Blocked by:`: the root, reached again from the end of the loop, does not join twice; the loop's phase ends up abandoned |
| `giveup-empty-logs` | `giveup --yes` | the log line in an empty `## Log`, byte for byte: at the end of a file without a final line feed, before trailing blank lines, right before `## Notes`, and before blank lines and `## Notes` |
| `giveup-locked` | `giveup --json` | refused even as a preview: a task that would fall is `in-progress` and another is `done` |
| `giveup-root-in-progress` | `giveup --yes` | refused: the root is `in-progress` |
| `giveup-no-reason` | `giveup --yes` | refused: `--yes` without `--reason` |
| `reopen-root` | `reopen` | the plan after `giveup-apply` goes back: statuses (the draft is `draft` again), keys removed, log lines added; a task abandoned in another give-up stays |
| `reopen-root-without-given-up-by` | `reopen` | an `abandoned` task with neither `Given up by:` nor `Given up with:` is a root: it and the task that fell with it come back |
| `reopen-child` | `reopen` | refused: the task fell with a root |
| `reopen-not-abandoned` | `reopen` | refused: the task is `ready` |
| `cancel-crlf` | `cancel` | a task saved with CRLF is read, and the whole file is written back with CRLF, the new log lines included |
| `claim-crlf` | `claim` | a CRLF task whose `done` blocker is CRLF too: both are read; `Started:` is written with CRLF |
| `cancel-file-name-space` | `cancel` | a task file with spaces in its name (and a dependent with `[` in its name) is found by its id and rewritten |
| `cancel-duplicate-id` | `cancel` | refused: the id names two files, listed in plan order; neither is written |
| `claim-duplicate-id` | `claim` | refused: the same, for `claim` |
| `giveup-duplicate-dependent` | `giveup --json` | refused even as a preview: a task that would fall has a duplicated id |
| `reopen-duplicate-dependent` | `reopen` | refused: a task that would come back has a duplicated id |
