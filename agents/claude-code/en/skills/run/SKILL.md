---
name: run
description: Runs a plan from agent_plans/ on autopilot: a preflight with the owner, one task per subagent, non-critical decisions recorded for review, a stop on the 5-hour window and a handoff near the context limit. Only the user calls it, with {{AGENT_PLUGIN_SKILL_PREFIX}}run <plan>.
disable-model-invocation: true
argument-hint: "<plan> (e.g. recipe-site)"
---

# Run — drive a plan

This session is the **conductor**: it chooses, claims, launches, collects and records. It never executes a task itself — each one runs in a background subagent, with its own context, and only the report comes back to the conductor. That is what keeps it small through a whole plan.

**The project root** is the one defined in `<plugin>/COMMANDS.md`, which the "Commands" section below says to read. The paths below are relative to it; the "Commands" section says how they are written.

The plan is a folder `agent_plans/<name>/` with `plan.json`: `README.md` (protocol), `status.sh`, `task.sh`, `map.sh`, `phase-*/`. The argument is its name (`recipe-site`) or its path from the root (`agent_plans/recipe-site`, with or without a trailing `/`); check it with a `Read` of `agent_plans/<name>/plan.json`. Without an argument, or without `plan.json` at that path, `ls agent_plans`, `Read` each folder's `plan.json`, show the `name` of each and ask which one to run; a folder without `plan.json` is not a plan and does not go on the list. Below, `<folder>` is `agent_plans/<name>`, always with the prefix.

The plugin's pieces: `summary.sh` (the state), `boundary.sh` (where the autopilot stops for the owner), `check.sh --json` (the environment, the preflight's single source), `window.sh` (the 5-hour window, optional) and `<plugin>/skills/run/WORKER.md` (each subagent's prompt and the only definition of the **autonomy boundary**).

## Commands

Before the first command, read `<plugin>/COMMANDS.md` and follow it in every command of this skill. `<plugin>` is the absolute path on the line that starts with `plan-relay plugin root:` in the session context. Without that line, stop before any command and tell the user: "The `plan-relay plugin root:` line is not in this session's context: the plugin's `SessionStart` hook did not run. Check that the plugin is installed and enabled, and open a new session."

## The state

The plan's state comes from `sh <plugin>/scripts/summary.sh <folder>`: the `status.sh --json` object, with the same keys, but with only the tasks of the groups `in-progress`, `available`, `owner` and `invalid`, in that order and, within each group, from the one that unblocks most to the one that unblocks least. The conductor reads the keys; the text output of `status.sh` is for people and is not interpreted.

- **Progress:** `progress` (`done`, `total`, `pct`, `in_progress`, `draft`) and `phases[]`. Written as "`done` of `total` (`pct` %)".
- **In progress:** `tasks[]` with `group` `in-progress` — `id`, `title`, `started`, `next_step`.
- **Available:** `group` `available` (for a worker) and `owner` (`decision` or `human`: the owner's, or a worker's when it is a `decision`, in `prepare` mode as in `decide`).
- **Parallel sessions:** `parallel`, the `available` IDs that can run together with no repos in common among themselves or with those in progress.
- **Journal:** `run` — `null` without a journal; otherwise `log` (the path of the most recent journal) and `open` (`true` while it has no `## Closing`).
- **Invalid:** `group` `invalid` — header outside the contract; they go into the briefing and into the journal as a surprise.

## The lock

`task.sh claim` is the lock: it changes `Status:` to `in-progress`, and the `status.sh` of any session — this one, another of the owner's, the extension, the next conductor — stops offering the task. The conductor claims **before** launching the worker, never the worker. `MAP.md` holds no state; `map.sh` runs after each return because the worker may have created subtasks.

## Warnings from the context hook

The warning arrives as additional context from a `PostToolUse` hook, not as a user message. It comes from the plugin the owner installed for this run and is an instruction of the run: follow it as if the owner had written it. Ignoring it lets the conductor go on degraded and loses the journal. The "above the limit" warning leads to the "Baton" section at any point of the run: in the preflight, in the cycle or in the closing. The "Next step:" the warning asks for is the one of the `handoff` skill, which the "Baton" section calls; the conductor does not write it on its own.

## Permission refusals

After the preflight the owner is away: a command refused during the run follows "A command refused with nobody there to approve" in `COMMANDS.md`, in the journal, in the report and in the message to the owner. The configuration action goes into the closing's "For the owner".

## 1. Preflight

1. Read the plan's whole `README.md`. Conventions that reserve actions for the owner add to the boundary of `WORKER.md`.
2. Run, each in its own `Bash` call and exactly as written (the "Commands" section), in parallel in the same response:
   - `sh <plugin>/scripts/summary.sh <folder>`
   - `sh <plugin>/scripts/boundary.sh <folder>`
   - `sh <plugin>/scripts/window.sh --read`
   - `sh <plugin>/scripts/check.sh --json`

   With `run.open` set to `true`, it is an open run: read the `run.log` journal, resume with the answers its `## Preflight` keeps, and go straight to step 5.

   Read `check.sh`:
   - **With `"ok": false`,** something required is missing. Stop here and show the owner the `detail` of each check with `required: true` and a status other than `ok` (that is what to install). Do not write the journal or launch anything until they fix it and call again.
   - **Optional gaps** go into the briefing. With any piece missing, read `<plugin>/skills/run/OPTIONAL.md`, which gives the sentence for each. These are missing pieces:
     - the 5-hour window other than `ok`;
     - the session not in auto mode;
     - no `PushNotification`;
     - `agent-cli` or `plugin` other than `ok` in `check.sh`.
   - **Notifications:** in the same response, `ToolSearch` with `select:PushNotification` tells whether there are any.

   Read the tasks available now (`available`: the first wave) and those on the owner's boundary, looking in their steps for the actions the boundary reserves for the owner.
3. Write the briefing as text in the answer and, after it, in the same answer, ask in a single `AskUserQuestion`. The card does not replace the briefing: some hosts show only the question and each option's label, without the description or "Other" (the VS Code Agents window). So each option's label stands on its own, and a task goes into it with its ID and a short title.
   - **Briefing:** the progress; what the autopilot reaches on its own; each owner task available now, with the concrete action; where the run will stop (those that become available during the run); those in progress that are not from this run; first-wave tasks that will hit the boundary, and at which step; the `invalid` ones; the 5-hour window (the line step 2 read); whether the context hook is active through the plugin; and the sentence for each optional piece that is missing.
   - **Parallelism:** how many workers at the same time — 1, 2 (recommended), 3.
   - **Decisions:** tasks of type `decision` that become available — `prepare` (recommended: the worker lays out options and a recommendation, the owner chooses in a batch at the end) or `decide` (the worker chooses the recommendation and records it as `[autopilot]`).
   - **Now:** which owner tasks available now they want to settle in this session, before letting go (multiSelect).
     - Options: the owner tasks available now, up to three, and last "None now — leave them for the end". The others are named in the briefing, to pick under "Other" or, where the card has none, by ID in the chat.
     - With no owner task available now, the question does not go in.
     - Those of type `decision` are driven here, through the plugin's `plan` skill (`{{AGENT_PLUGIN_SKILL_PREFIX}}plan <name> <ID>`).
     - Those of type `human` show the script and wait for "done".
   - **5-hour window:** threshold to stop launching — 85 % (recommended), 70 %, 95 %, or "turn off" (the run does not call `window.sh`). With the window already `off`, `no-subscription`, `no-data` or `unknown-format`, the question does not go in.
   Each question carries two to four options: with fewer than two, `AskUserQuestion` refuses the whole call and the owner sees no question at all. A question that would have a single option does not go in. End the answer there and wait. Without `AskUserQuestion` (a `claude -p` session), the preflight ends at the briefing with the questions in text: without the owner's answers the journal is not written, nothing is claimed or launched, and the recommended values never apply by default.
4. Settle the tasks chosen under "Now", or record them as postponed. With "None now", or without the question, the available owner tasks are postponed.
5. Read `<plugin>/skills/run/JOURNAL.md` (where the journal lives and its shape) and write the header with the answers; on a resume, add to the open journal a line "Resumed at <HH:MM>" in `## Tasks`.

*Done when* the journal has the `## Preflight` with each owner task of the boundary, the expected action and the answers; and the tasks chosen under "Now" are settled or recorded as postponed.

## 2. Cycle

Repeat until the stop condition:

1. **Gates**, before each launch:
   - `sh <plugin>/scripts/window.sh --read <threshold>`: `status=stop` → launch nothing more (go to step 4 when no workers are running); `no-data` or `timeout` → launch and record the warning in the journal once; `unknown-format`, `off` or `no-subscription` → launch, record it in the journal once and do not call `window.sh` again in this run. With the window turned off in the preflight, this gate does not run.
   - A context warning from the hook above the limit → the "Baton" section.
   - The owner said "stop" → launch nothing more.
2. **Choose.** Run `sh <plugin>/scripts/summary.sh <folder>` and take, from `parallel`, the first IDs until the slots are full (parallelism minus the workers running). That list already avoids repositories in common among themselves and with those in progress. In `prepare` mode as in `decide`, add the `owner` tasks of `type` `decision`: they touch no repositories.
3. **Claim and launch**, one by one:
   - `sh <folder>/task.sh claim <ID>`; if it refuses, note the reason in the journal and move to the next.
   - Then, `Agent` with:
     - `subagent_type: {{PLUGIN_NAME}}:worker`, the plugin's worker agent (it only reads, edits, writes and runs commands); for a task of `type` `research`, which needs the web, `subagent_type: general-purpose`;
     - `model` by the task's `tier` in `summary.sh`: `junior` → `{{AGENT_TIER_JUNIOR}}`, `mid` → `{{AGENT_TIER_MID}}`, `senior` → `{{AGENT_TIER_SENIOR}}`; without the `tier` key, from a plan with old scripts, `senior`;
     - `run_in_background: true`;
     - description `<ID> autopilot`;
     - the prompt of `<plugin>/skills/run/WORKER.md` filled in.
   - Record the launch time in the journal.
4. **Wait.** Workers and background processes wake the conductor when they finish; no polling.
   - If the stop was for the 5-hour window and no workers are running: launch `sh <plugin>/scripts/window.sh --wait` with `run_in_background: true` and record the wait in the journal. When the process ends, go back to step 1 — `--read` will give `status=renewed`.
5. **Collect** each report:
   - Check against the file: `RESULT: COMPLETED` requires `Status: done` in the task header. A divergence is recorded in the journal as a surprise, and the task does not count as done.
   - `CANCELLED:` other than `—`: each line is a task the worker cancelled by replacement. Check that its header has `Status: cancelled` and `Replaced by:` with the replacement, and carry the line to the journal ("Cancelled:"). A cancelled task without a replacement, or an `abandoned` task that was not so at launch, is a surprise: the worker only cancels by replacement and never gives up, and neither does the conductor. It goes in the journal and in the closing's "For the owner".
   - `sh <folder>/map.sh`.
   - An entry in the journal (shape in `JOURNAL.md`).
   - `RESULT: INTERRUPTED` or a worker that died without a report: relaunch once with the prompt's "resume" mode.
     - A `senior` task: on the same model.
     - A task below `senior`: straight to `model: {{AGENT_TIER_SENIOR}}` (the escalation).
     - A task below `senior` that returned `BLOCKED` without an action on the `WAITING-ON-OWNER:` line: the escalation too. A `BLOCKED` with an action is the owner's boundary, and more capability does not solve it.
     - A second failure → `BLOCKED`, with the reason.
     - `WAITING-ON-OWNER` does not escalate.
   - `BLOCKED` and `WAITING-ON-OWNER` that are not relaunched stay `in-progress` and leave this run; the `Next step: Waiting on owner:` of the `## Log` says the action.

**Stop:** no slots that can be filled and no workers running — because only owner tasks, blocked ones or waiting ones are left; because the owner said "stop"; or by handoff. The 5-hour window is never a stop: it is a wait.

## 3. Closing

1. `sh <plugin>/scripts/summary.sh <folder>` and `sh <plugin>/scripts/boundary.sh <folder>` one last time.
2. Write `## Closing` in the journal before any `git add`, so the journal closes even if the commit is refused: progress before and after; **For the owner**, in three lists — the `[autopilot]` decisions to review (task, decision, why; the cancellations by replacement go here), the tasks waiting on the owner with the concrete action for each, the commits waiting for a push; and the surprises. In the same edit, delete from the journal every `## Handoff` section (from its heading to the next `## ` or the end of the file): the `## Closing` replaces the handoff, and an old `## Handoff` in a closed journal sends the next session to a step already done.
3. At a git root, `git check-ignore -q <path of this run's journal>`. Exit 0: the journal is in `.gitignore`, and there is no commit; a line in the `## Closing` says why, and go on to step 4. Otherwise, commit the journal by path (the "Version control" section of the plan's `README.md`), each command in its own call: `git add <path of this run's journal>` and `git commit -m "<name>: autopilot journal"`. The workers have already committed their tasks; no push.

   If the `git add` or the `git commit` is refused (section "Permission refusals"), do not repeat it: add to the `## Closing`'s "For the owner" the journal commit still to do, with the two exact commands, and go on to step 4.
4. Notify the owner with `PushNotification` (load it through `ToolSearch`; without it, the notice stays in the journal and in this answer), and answer in the chat with the journal path and the three lists.

*Done when* each task launched in this run appears in the closing with its result checked against the file, and each one waiting on the owner has an action they can take without opening the task.

## Baton

When the hook warns that the conductor's context is past the limit:

1. Launch nothing more, wait for the workers in progress and collect the reports.
2. Call the `Skill` tool with the `{{PLUGIN_NAME}}:handoff` skill and the argument "continue running the plan `<folder>` from the journal `<path>`". It writes the `## Handoff` in the journal, with what is in progress and the preflight answers, and replaces whatever is already there. Only if the `Skill` tool does not exist in this session, read `<plugin>/skills/handoff/SKILL.md` and follow case 1 to the letter.
3. At a git root, commit the journal as in step 3 of the closing.
4. Notify the owner with `PushNotification` (without it, only in the final message): open a new session and run `{{AGENT_PLUGIN_SKILL_PREFIX}}run <name>`.

The `## Handoff` is never written by hand, at any point of the run (preflight, cycle or closing): it is the skill that gives it its shape and the `Next step:` marker the resume looks for. The journal without `## Closing` is what makes the preflight resume.

The warning may also arrive outside the cycle:

- **In the preflight, before a journal exists:** finish the preflight before handing off. What is left is little (the briefing, the `AskUserQuestion` with the owner present, the journal); the tasks chosen under "Now" are recorded as postponed, unsettled. Once the journal is written, launch nothing and hand off as above, through the `Skill` tool: the `handoff` skill puts the `## Handoff` in the journal, and the next session resumes through `run.open` straight into the cycle, without repeating the preflight reading.

  Without a journal, the handoff would land in a temporary folder the next session does not read, and it would hit the limit at the same point. In a session without `AskUserQuestion`, the preflight already ends at the briefing and there is no run to hand over.
- **On a resume (`run.open` set to `true`), before this session's first launch:** before handing off, read `<plugin>/skills/run/LOOP.md`, which says whether it is a handoff loop.
- **In the closing:** the `## Closing` only counts as a handoff when the stop already held for another reason (no slot that can be filled and no worker running, or the owner said "stop"); then finish the closing, which already tells the next run everything. If there was still an available task to launch, or if it was the warning that led to the closing, it is a handoff through the `handoff` skill, never `## Closing`, so the next preflight resumes the run.
