---
name: plan
description: Entry point of a plan in agent_plans/: progress, what is in progress and what can run in parallel; runs or resumes a task (F1-03…); creates a task or subtask; cancels, gives up and reopens. Use when asked what is next in a plan, when a task is named, or when asked to continue, create, cancel, give up or reopen a task.
argument-hint: "<plan> [ID]"
---

# Plan

One skill for every plan of the project: `/plan-relay:plan <plan> [ID]`. The plan lives in `agent_plans/<plan>/`; the protocol is in that folder's `README.md` and is the only source. This skill picks the plan and the branch and sets the protocol going.

**The project root** is the one defined in `<plugin>/COMMANDS.md`, which the "Commands" section below says to read. The paths below are relative to it.

## Commands

The first call of this skill is a `Read` of `<plugin>/COMMANDS.md`, and it holds for every command in it. In practice: each `Bash` call is a single command, copied from a step below with `<plan>` written out; a file is read with `Read`. `<plugin>` is the absolute path on the line that starts with `plan-relay plugin root:` in the session context; without that line, go on anyway, with one literal command per call. `<plan>` is replaced by the folder name before running, written out in each call.

## 0. Choose the plan

The argument is `<plan> [ID]`. `<plan>` is the name of a folder in `agent_plans/` (`recipe-site`) or its path (`agent_plans/recipe-site`, with or without a trailing `/`); a plan is a folder with `plan.json`.

- **With `<plan>`:** read `agent_plans/<plan>/plan.json` with `Read`. If it does not exist, say the plan was not found, list the ones that exist (as in the "no argument" case) and stop.
- **Only an ID** (the first argument has the form `F<n>-<nn>`, like `F1-03` or `F1-03.1`, and is not a folder of `agent_plans/`): it is the ID of a task; the plan is chosen as in the "no argument" case.
- **No argument:** `ls agent_plans` in one call and, for each folder, `Read` of `agent_plans/<folder>/plan.json`, in parallel calls; a folder without `plan.json` is not a plan.
  - A single plan: use it.
  - More than one: run `sh agent_plans/<plan>/status.sh --json` for each (parallel calls) and ask with the user question tool (`AskUserQuestion`), header `Plan`, "Which plan do you want to open?": one option per plan (up to four; the others named in the answer, to pick under "Other"), label the `name` from `plan.json`, description `done`/`total` (`pct` %) and how many tasks are `in-progress`. Without the tool, see "No card".
  - None: say the project has no plan and that a document becomes a plan with `/plan-relay:map <path of the .md>`; stop.

Below, `<plan>` is the name of the chosen folder.

A request to drive the plan on its own, on autopilot, is not for this skill: say it is `/plan-relay:run <plan>`, which only the user calls, and stop.

*Done when* there is a chosen plan with `plan.json`, or the skill stopped saying why.

## The state

The state is what the plan's scripts say, never what memory or the conversation says:
- `sh agent_plans/<plan>/status.sh --json` — the whole state in one JSON object, read by its keys (the text output, without `--json`, is for people and is not interpreted):
  - `progress` — `done`, `total`, `pct`, `in_progress`, `draft`; `phases[]` with `dir`, `title`, `done`, `total` and, only on a phase that became abandoned, `abandoned: true`.
  - `tasks[]` — `id`, `title`, `status`, `type`, `group`, `unblocks`, `started`, `next_step`, `waiting_on`, `file`; only when the header has the key, `replaced_by`, `given_up_by` and `given_up_with`. The `group` says what to do with the task: `in-progress`, `available` (free for a session), `owner` (free, but `decision` or `human`: it needs you), `blocked`, `draft`, `done`, `cancelled` (replaced by another), `abandoned` (the owner gave it up), `invalid`.
  - `parallel` — the IDs that can run in sessions at the same time, with no repos in common among themselves or with those in progress.
- `sh agent_plans/<plan>/task.sh claim <ID>`, `close <ID>`, `release <ID>`, `cancel <ID>`, `giveup <ID>` or `reopen <ID>` — the only way to change `Status:`.
- `sh agent_plans/<plan>/map.sh` — rewrites `MAP.md` after creating or renaming tasks.

**The options** are the tasks with `group` `available`, from the one that unblocks most (`unblocks`) to the one that unblocks least, followed by the `owner` ones, in the same order.

**No card:** where the question tool does not exist, the same question goes in text, with the same options in a numbered list, in the given order, the first marked as recommended; the choice comes by ID (or by plan name) in the chat. Nothing goes in the list that the card would not have.

With a request to cancel a task, branch 5; to give it up or abandon it, branch 6; to reopen it or undo the give-up, branch 7. Otherwise: with an ID in the argument, branch 2; with "continue", «continua» or «retoma» without an ID, branch 3; with a request to create a task or subtask, branch 4; with none of these, branch 1.

## Branch 1 — no named task: briefing and choice

1. Run `sh agent_plans/<plan>/status.sh --json`.
2. Write the briefing, short, as text in the answer, before the card. The card does not replace it: some hosts show only the question and each option's label, without the description or "Other" (the VS Code Agents window).
   - **Progress:** `done` of `total` (`pct` %), and one line per phase with `done`/`total`.
   - **In progress:** each `in-progress` task, for how long (since `started`) and its `next_step`. One without `started` or with a null `next_step` is a warning.
   - **In parallel:** the IDs in `parallel`, with the prompts `/plan-relay:plan <plan> <ID>` for other sessions.
   - **Needs you:** each `owner` task, with the concrete action taken from its goal.
   - **Attention:** each `invalid` task (header outside the contract) and each ID in `waiting_on` marked `(?)`, which does not exist as a file.
3. Show the choice card with the user question tool (`AskUserQuestion`): a single-choice question, header `Task`, "Which task do you want to start in this session?".
   - Options: the first four options, in the order above; the first with " (Recommended)" at the end of its label.
   - Label: `<ID>` and a short title, on every option, the recommended one too (`F1-01 Ingredient index (Recommended)`): the label stands on its own without the description. Description: the full title, `unblocks <n>`, the type, and "needs you" when the group is `owner`.
   - More than four options: name the rest in the briefing; they are picked under "Other" or, where the card has none, by ID in the chat.
   - No option: no card; say what is in progress and what unblocks next.
   - Without the tool: see "No card".
4. With the answer, follow branch 2.

*Done when* the briefing covers each `in-progress` task and each option, and a choice was made (or there was nothing to choose).

## Branch 2 — named task: execute or resume

1. Read the whole `agent_plans/<plan>/README.md` and the task.
2. `ready`: `sh agent_plans/<plan>/task.sh claim <ID>`; if it refuses, show the reason and go back to branch 1. `in-progress`: resume from the `Next step:`; if the `## Log` is not from this line of work, ask before continuing. `cancelled`: say it was cancelled and, with `Replaced by:`, offer the replacement. `abandoned`: say the owner gave it up and that reopening is branch 7, only if they ask.
3. Open the session entry in the task's `## Log`, as the "Claim" step of the README's "Work session" says, before any other edit.
4. Follow the README's "Work session", from "Read" to "Self-review".
5. "Close": complete the `## Log` entry and run `sh agent_plans/<plan>/task.sh close <ID>`. Interrupted session: `Next step:` in the `## Log`, `Status:` as it is.
6. Run `sh agent_plans/<plan>/status.sh --json` and say what became available because of this task.

*Done when* `task.sh close` accepted, or the task is `in-progress` with a concrete `Next step:`.

## Branch 3 — "continue" without an ID

One `in-progress` task: branch 2 with it. Several: a card with the `in-progress` ones (up to four, label with the ID and for how long; without the tool, "No card"). None: branch 1.

## Branch 4 — create a task or subtask

Follow "Subtasks" in the plan's README; a new task that is not a subtask goes into the right phase with the next free number. The new task, unless `human`, gets `Tier:` by the criteria of the "Tiers" section of the plan's README (in a `pt-BR` plan, «Níveis»; for a plan mapped before that section existed, those in `<plugin>/template/en/README.md` or, for a `pt-BR` plan, «Níveis» in `<plugin>/template/README.md`). Finish with `map.sh` and with `status.sh --json` without an `invalid` task or an ID marked `(?)` in `waiting_on`.

## Cancel, give up and reopen

Two acts with different owners:
- **Cancelling** belongs to the agent: it swaps one task for another without losing work. Result: `cancelled`.
- **Giving up** belongs to the owner: it takes the task out of the plan together with everything that depended on it, in cascade. Result: `abandoned`.

The reason goes in double quotes, in a literal command (`--reason "No Windows machine available"`), with no `$`, backticks or double quotes inside. `task.sh` is what checks the reason: one that does not qualify is refused with "The reason is not valid.", changing nothing; then ask for another reason.

## Branch 5 — cancel a task

When the task no longer makes sense as written: the work changed shape, was absorbed by another task, or its premise fell. Cancelling is not giving up: if the owner does not want the work done, it is branch 6.

1. Read the task and write the reason in one sentence.
2. Decide whether the work still needs doing in another form. If it does, create the replacement through branch 4, with the corrected goal; it usually inherits the old `Blocked by:`.
3. Run `sh agent_plans/<plan>/task.sh cancel <ID> --reason "<reason>"`, with `--replaced-by <replacement>` when there is one. Refusals:
   - **live dependents** (the message names them): the verb never cancels in cascade. Without a replacement, create it through branch 4. In each named dependent, swap the old ID for the replacement's in `Blocked by:` (with `Edit`, that line only). Run again with `--replaced-by`;
   - **invalid reason:** rewrite the reason;
   - **any other refusal** (the task is `done`, `cancelled` or `abandoned`; the replacement does not qualify): show the message and stop.
4. `sh agent_plans/<plan>/map.sh` and `sh agent_plans/<plan>/status.sh --json`, without an `invalid` task or a `(?)` in `waiting_on`.
5. Say what was cancelled, the replacement and the dependents rewired.

*Done when* `task.sh cancel` accepted and each dependent that cited the task cites the replacement.

## Branch 6 — give up a task (only at the owner's request)

The agent never gives up on its own and never proposes giving up as its own step: if it thinks a task should leave the plan, it says why, and the owner decides. This branch runs only when the owner asked, in this conversation, to give up a named task.

1. Run `sh agent_plans/<plan>/task.sh giveup <ID> --json`. It is the preview: it changes nothing. Refused (the root is not `ready` or `draft`, or tasks that already started or finished would fall): show the message and stop.
2. Show the whole graph, drawn from the JSON and not from the text output:
   - **highlighted, at the top:** the total, which is the number of items in `falls` ("Giving up F4-07 abandons 6 tasks"), and each phase in `abandoned_phases` ("phase `phase-9-zcode` becomes wholly abandoned");
   - **one line per item of `falls`, in the given order:** two spaces of indent per `depth`, `<id> — <title> (<phase>)`, "draft" when `status` is `draft`, and "also depends on X, Y" when `also_depends_on` is not empty.
3. Ask for the reason, if the request did not bring one.
4. Ask for the "yes" with the user question tool (`AskUserQuestion`), header `Give up`. The question reads on its own: "Give up <ID> and <n> more tasks (<abandoned phases, if any>), with the reason "<reason>"?". Options: "Yes, give up" and "No". Without the tool, ask in the conversation and accept only an explicit "yes". Any other answer: stop without changing anything.
5. Run `sh agent_plans/<plan>/task.sh giveup <ID> --reason "<reason>" --yes`. If it refuses the reason, go back to step 3; the "yes" holds for the same graph. Any other refusal: the plan changed after the preview; go back to step 1.
6. `sh agent_plans/<plan>/map.sh` and `sh agent_plans/<plan>/status.sh --json`, and say what fell and how to undo it (branch 7).

*Done when* the owner saw the graph, said "yes" and `task.sh giveup --yes` accepted; or the skill stopped without changing anything.

## Branch 7 — reopen a give-up

Reopening undoes a decision of the owner: only at their request. A `cancelled` task is not reopened.

1. Run `sh agent_plans/<plan>/status.sh --json`. The task must be `abandoned`. With `given_up_with`, it fell together with another: say that the root (the value of `given_up_with`) is what gets reopened, and go on with it if the owner confirms.
2. Show what comes back: the root and each task whose `given_up_with` is the root. Those that were cancelled or abandoned before stay as they are.
3. Ask for the "yes" with `AskUserQuestion`, header `Reopen`: "Reopen <ID> and <n> more tasks?", options "Yes, reopen" and "No". `reopen` has no preview and no `--yes`: this is the confirmation.
4. Run `sh agent_plans/<plan>/task.sh reopen <ID>`; then `map.sh` and `status.sh --json`, and say what went back to `ready` or `draft`.

*Done when* `task.sh reopen` accepted, or the skill stopped without changing anything.
