---
name: map
description: Turns a plan document into a task map in agent_plans/<name>/: phases, self-contained tasks with blocking edges, state scripts and plan.json. Only the user calls it, with {{AGENT_PLUGIN_SKILL_PREFIX}}map <path of the .md>.
disable-model-invocation: true
argument-hint: "path of the plan (or nothing, to use the conversation)"
---

# Map — map a plan

Turn a plan — a large document, with several phases — into a **task map**: a folder `agent_plans/<name>/` in the project where the plan becomes phases, each phase becomes tasks that fit in one or two agent sessions, and the state lives in the header of each task. Three scripts read and change that state, `plan.json` identifies the plan, and the plugin's `plan` skill, `{{AGENT_PLUGIN_SKILL_PREFIX}}plan <name>`, opens each session with the progress and the choice of the next task. Map creates no skill.

The template is in `<plugin>/template/`: `README.md` (the protocol, with `{{…}}` markers), `_template.md` (the shape of a task, called `_template.md` in the plan), `PHASE.md` (which becomes the `PHASE.md` of each phase in the plan) and the scripts `status.sh`, `task.sh` and `map.sh`. The scripts and `_template.md` are copied byte for byte by the template's `copy.sh`; `README.md` and `PHASE.md` come out through `profile.sh` and get filled in. `README.md` and `PHASE.md` have blocks per profile (`{{#full}}…{{/full}}`, `{{#lean}}…{{/lean}}`) that the template's `profile.sh` resolves when copying, so the plan gets a text without dead branches. `selftest.sh` stays in the template: it proves a plan's scripts without touching it. The template text exists in both languages: Portuguese in `<plugin>/template/`, English in `<plugin>/template/en/`, with the same file names; the scripts of `template/en/` are those of `template/` with only the English table, and `copy.sh --lang` picks them.

**The contract.** File and folder names, the header keys (`Status:`, `Type:`, `Track:`, `Tier:`, `Repos:`, `Blocked by:`), the values (`ready`, `draft`, `code`, `decision`…), the markers (`## Done when`, `## Log`, `Next step:`) and the `plan.json` keys are what the scripts, the extension and the skills look up by name: they are written in English, exactly as in the template. The rest of the text — titles, goals, steps, the free sections of the task — follows the language of the plan.

**The project root** is the one defined in `<plugin>/COMMANDS.md`, which the "Commands" section below says to read. If that root is the user's home directory, stop and ask where the project is. All paths below are relative to it; the "Commands" section says how they are written.

## Commands

Before the first command, read `<plugin>/COMMANDS.md` and follow it in every command of this skill. `<plugin>` is the absolute path on the line that starts with `plan-relay plugin root:` in the session context. Without that line, stop before any command and tell the user: "The `plan-relay plugin root:` line is not in this session's context: the plugin's `SessionStart` hook did not run. Check that the plugin is installed and enabled, and open a new session."

The reads of the `plan.json` files are independent: parallel calls.

## 0. Check that the plan is not mapped yet

With an argument: the path of the plan relative to the root (without `./`). Read each `agent_plans/*/plan.json` and compare the `source` field with that path.

If one matches, **stop here**: say "This plan is already mapped in `agent_plans/<name>/`", and that, to map it again, the user first deletes that plan: through the Plan Relay extension or, without it, by deleting the `agent_plans/<name>/` folder after checking that nothing in it still needs keeping. This skill never deletes or rewrites an existing plan.

**A source that is an idea.** When the argument is in `agent_plans/_ideas/` (`agent_plans/_ideas/<slug>.md`), the source is an idea (in the shape of the template `<plugin>/template/en/idea.md`): read its header, the lines before the first `# `.

- With `Status: mapped`, **stop here** and give the plan on the `Plan:` line ("This idea already became the plan `agent_plans/<name>/`"): `mapped` is final, and changes from here on go to that plan. Mapping again makes another plan, with a new name, and only if the person asks for that in those words; in that case, go on as with a new idea, without touching the old plan.
- With `open`, `refining` or `ready`, go on. Keep `Open questions:` for step 3: an integer, or unknown when the line is missing or the value is not a number.
- Without `Status:` or with another value: say the header is outside the contract and stop.

The `source` of `plan.json` is the path of the idea, and the idea stays where it is.

**Ready when**: no `plan.json` has this `source` (or there is no `agent_plans/`) and, for an idea, `Status:` is not `mapped`; or the skill stopped with the name of the existing plan. Without an argument, the step does not apply.

## 1. Read the plan and the repository

Read the whole plan (the argument, or the conversation). Read the repository's `CLAUDE.md` or `AGENTS.md` and the project memory, when there are any: the conventions they set (language, commits, security rules, what is forbidden) go into the plan's protocol.

For each file, command or system the plan cites as existing, check that it exists. A plan states facts the code contradicts; a wrong premise becomes an open decision, never a task built on top of it.

**Ready when**: the plan is read, the conventions are listed, and each cited premise has been checked or is marked as open.

## 2. Design the map

- **Folder name:** lowercase ASCII with hyphens, refused if `agent_plans/<name>/` already exists. On a collision, pick another name and say why.
- **Phases:** in order, each with what it delivers and why it sits in that position. Phase 0 is the foundation: decisions, requests to other teams (the slow ones come here, so they run in parallel), research the others depend on. Validate on what already works before building on top of it.
- **Tasks:** each fits in one or two sessions and has `Type:` (`code`, `research`, `prototype`, `decision`, `human`, `review`), `Track:`, `Tier:` on those born `ready` that are not `human` (by the criteria in the "Tiers" section of the plan's `README.md`; a `draft` gets its own when it is detailed), `Repos:` when the work crosses repositories, and `Blocked by:` edges only for what genuinely blocks it.
- **Profile:** `full` or `lean`; it goes into the `profile` of `plan.json`. `full` is the complete template: `spec/`, `research/`, `prototypes/`, a `review` closing every phase, later tasks in `draft` and test-first. `lean` is for the small plan: no `spec/`, `research/` or `prototypes/` (decisions live in a "Decisions" section of `PLAN.md`), a `review` closing a phase only when the delivery calls for it, every task written in full, and no imposed test-first. **The proposal rule:** `lean` when the design has up to two phases and up to ten tasks and none of them is `research` or `prototype`; otherwise, `full`. The proposal is only a proposal: whoever approves the design confirms or switches the profile.
- **Phase closing:** in `full`, every phase ends in a `review` task that checks what the phase learned and details the next phase; in `lean`, only the phase whose delivery calls for that check.
- **Draft:** in `full`, the first two phases have their tasks written in full and the later ones in `draft` (goal, edges and notes for the detailing), because what is learned first will change them; in `lean`, every task is written in full.
- **Language of the plan:** that of the source document or, without a document, that of the conversation. `language` in `plan.json` takes only `pt-BR` or `en`: for Portuguese, `pt-BR`; for English or any other language, `en`. In another language (Spanish, German…), the text that is not contract is written in that language, the template comes from `<plugin>/template/en` and `language` is `en`, so the scripts answer in English; the contract keys stay in English as always. The design says so when it happens.

**Ready when**: the name does not collide, every task has a type, a track and edges, no edge forms a cycle, the critical path is identified, the language is chosen and the profile is proposed by the rule.

## 3. Submit the design

Present: the folder name (`agent_plans/<name>/`), the phases with the delivery of each, the list of tasks per phase (ID, title, type, blocked by), the critical path, what stays in `draft`, the language and the proposed profile, with the reason from the rule (for example: "proposed profile: `lean` — two phases, seven tasks, no `research` or `prototype`"). For an idea with `Open questions:` above 0 or unknown, the design says how many questions are left (or that the number is unknown) and suggests refining the idea first with `{{AGENT_PLUGIN_SKILL_PREFIX}}refine`, without refusing: the person may approve anyway, and the questions become open decisions in the map. Ask whether the order of the phases is right, whether the granularity is right, whether the edges block only what they should, whether the language of the plan is the right one, and whether the profile stays as proposed or switches to the other. End the answer there and wait.

**Ready when**: the user approved explicitly, in a message after the design; the profile is the one they confirmed (the proposed one, if they approved without switching). Until then no file or folder is created; a session with nobody to answer (`claude -p`) ends with the design.

## 4. Write the folder

Everything lives in `agent_plans/<name>/`, unless stated otherwise. `{{PLAN_PATH}}` is `agent_plans/<name>`. `<language>` is that of the approved design (`pt-BR` or `en`), and `<template>` is the folder of the text in that language: `<plugin>/template` for a `pt-BR` plan, `<plugin>/template/en` for an `en` plan.

1. The three scripts and `_template.md`, byte for byte, in one call that also creates the folder:

   ```
   sh <plugin>/template/copy.sh --lang <language> agent_plans/<name>
   ```

   `copy.sh` puts `status.sh`, `task.sh` and `map.sh` unchanged and the language's `_template.md` as `_template.md`. No `cp` and no rewriting of these files with the write tool: `<plugin>` is outside the project, and the permission refuses a `cp` from there. If it exits with 1, one of the files already exists: stop and say which, without overwriting.
2. `README.md` with the blocks of the confirmed profile already resolved, in one call (`<profile>` is `full` or `lean`):

   ```
   sh <plugin>/template/profile.sh <profile> <template>/README.md agent_plans/<name>/README.md
   ```

   Then, in the written file: `{{PLAN_NAME}}` by the folder name, `{{PLAN_PATH}}` by `agent_plans/<name>`, and `{{CONVENTIONS}}` by the conventions from step 1, one per item, each with its reason when it is not obvious.
3. `PLAN.md`: what it is (with a link to the source plan, which stays where it is), principles, the table of phases, the critical path, and what is out of scope and why. In `lean`, also the "Decisions" section, with the decisions the plan already took, one per entry, with date and reason.
4. Only in `full`: `spec/decisions.md` with the decisions the plan already took, one per entry, with date and reason; and in `spec/` what the plan describes as the target, in the present tense.
5. `notes/` with a two-line `README.md` about what lives there; in `full`, also `research/` and `prototypes/`, each with its own.
6. Per phase, `phase-<N>-<slug>/PHASE.md` generated from the template's `PHASE.md` by `profile.sh`, like `README.md` (`sh <plugin>/template/profile.sh <profile> <template>/PHASE.md agent_plans/<name>/phase-<N>-<slug>/PHASE.md`, after `mkdir -p agent_plans/<name>/phase-<N>-<slug>` in its own call), and filled in; and one task per file, `<ID>-<slug>.md`, from `_template.md`, with the title `# <ID> - <title>`. IDs `F<phase>-<NN>`. Each "Read first" points to real files; each item of the `## Done when` is verifiable by a command or an artifact.
7. `plan.json`, with `created` from the output of `date -u +%Y-%m-%dT%H:%MZ`, `source` equal to the one from step 0 (`null` when the plan came from the conversation), `language` and `profile` from the approved design, and `scripts_version` equal to the number on the `# scripts_version: <N>` line at the top of the copied `status.sh` (the number, without quotes):

   ```json
   {
     "contract": 1,
     "name": "<name>",
     "source": "<path of the plan relative to the root>",
     "created": "<YYYY-MM-DDTHH:MMZ>",
     "language": "<pt-BR or en>",
     "profile": "<full or lean, the one confirmed in step 3>",
     "scripts_version": <N>
   }
   ```

8. `sh agent_plans/<name>/map.sh`.

**Ready when**: `sh agent_plans/<name>/status.sh --json` has every task with a `group` other than `invalid` and no ID marked `(?)` in `waiting_on`, and at the top `language`, `profile` and `scripts_version` equal to those of `plan.json`; `MAP.md` reports no cycle, no `{{` is left in `README.md`, `plan.json` passes `jq .`, and each "Read first" path exists.

## 5. Prove it on a copy

`sh <plugin>/template/selftest.sh agent_plans/<name>` copies the folder to a temporary directory and proves it there, in a single call: `status.sh` without `(?)` or an invalid state, `status.sh --json` valid and consistent with the text, `map.sh` without a cycle, `claim` refused on a blocked task, `claim` on an available one writes `Started:` and `status.sh` shows the duration, `close` refused with the `## Done when` unticked, `release` returns it to `ready`, the `profile` of `--json` equal to that of `plan.json` and, in a `lean` plan, no `spec/`, `research/` or `prototypes/` folder. The copy is deleted at the end; the real folder does not change.

A failure is a defect of the map (edge, header, `Status:`) to fix before delivering — never a reason to prove it on the real folder.

Show the real `status.sh` (the text output, for the person to read) and say how to start: `{{AGENT_PLUGIN_SKILL_PREFIX}}plan <name>` for the briefing and the choice, `{{AGENT_PLUGIN_SKILL_PREFIX}}plan <name> <ID>` for a task.

**Ready when**: the selftest ends in "all good", and `{{AGENT_PLUGIN_SKILL_PREFIX}}plan <name>` is what the answer teaches for showing the briefing.

## 5a. Mark the idea

Only when the source is an idea. After the proof on the copy, its header moves to `mapped`, with the path of the plan in `Plan:`, through the script (never with the editing tools):

```
sh <plugin>/scripts/idea.sh status agent_plans/_ideas/<slug>.md mapped agent_plans/<name>
```

**Ready when**: the idea's header has `Status: mapped` and `Plan: agent_plans/<name>` (no trailing `/`), or the source is not an idea.

## 6. Commit the plan

Only when the root is a git repository (the `git rev-parse --show-toplevel` from the start answered) and the conventions from step 1 do not forbid it; otherwise, skip. First, `git check-ignore -q agent_plans/<name>`: exit 0 means the plan folder is in `.gitignore`, there is no commit, and the answer says why. The plan is versioned with the code (the "Version control" section of the plan's `README.md`), and the first commit is this one: only the plan folder, by path, each command in its own call:

```
git add agent_plans/<name>
git commit -m "<name>: task map"
```

For a source that is an idea, before the commit: `git check-ignore -q agent_plans/_ideas/<slug>.md`. Exit 1 (the project versions its ideas): `git add agent_plans/_ideas/<slug>.md`, by path, so the `mapped` mark goes in the same commit as the plan. Exit 0: the idea stays out of the commit.

No push: that belongs to the owner.

**Ready when**: `git status --short agent_plans/<name>` shows nothing, or the step does not apply and the final answer says why.
