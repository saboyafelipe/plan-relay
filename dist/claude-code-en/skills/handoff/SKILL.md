---
name: handoff
description: Hands off the baton: records where the session stopped (what was done, what is in progress, the decisions, the next step) so a new session can continue without this conversation. Use when asked to hand off or to continue in a new session, and when the plan-relay context warning or the run says to.
argument-hint: "focus of the next session (optional)"
---

# Handoff

The next session does not see this conversation. Everything it needs to continue has to be written in a file it will read, and the user has to know the exact command that opens it. This skill writes that handoff and gives the command.

The argument, if any, is the **focus**: what the next session should continue. Without an argument, the focus is the work in progress in this session.

## Commands

The first call of this skill is `Read` of `<plugin>/COMMANDS.md`, and it applies to every command of the skill. In practice: each `Bash` call is a single command, copied from a step below; a file is read with `Read`. `<plugin>` is the absolute path on the line that starts with `plan-relay plugin root:` in the session context; without that line, go on anyway, with one literal command per call: the handoff does not wait for the plugin.

## 1. What to record

Before writing, finish the step in progress (a file half edited, a test halfway) or undo it; do not open anything new. Then gather, short and concrete:

- **Done:** what this session finished, with the files touched and the commits (hash and first line), if any.
- **In progress:** what was started and the exact point where it stopped — the file, the function, the test that is red.
- **Decisions:** what was decided and why, including each answer the user gave in this session that the next one needs to know. A question left unanswered also goes here, marked as open.
- **Next step:** an action the next session can start without asking anything — "run `sh x/check.sh` and fix case Y", not "continue the work".
- **Read first:** the files the next session needs to read before acting, if they are not obvious from the destination.

For the files touched and the commits, each in its own call: `git status --short` and `git log --oneline -n 10`. No secrets, tokens or passwords in the handoff.

## 2. Where to write

Pick the first case that applies:

1. **Conductor of a plan** (this session runs `/plan-relay:run <folder>`): in the open run journal, `<folder>/notes/run-<YYYY-MM-DD>.md` (the most recent without `## Closing`; it is the `run.log` of `sh <folder>/status.sh --json` when `run.open` is `true`), in a `## Handoff` section at the end. If the journal already has one or more `## Handoff` sections (each goes from its heading to the next `## ` or the end of the file), delete them all and write a single one: only the latest handoff counts. Besides the items above: the workers still running and the preflight answers (parallelism, decisions, 5-hour window). The journal without `## Closing` is what makes the next preflight resume.
   - Resume: `/plan-relay:run <folder>`.
2. **Work session on a task of a plan** (this session claimed or resumed a task in `agent_plans/<name>/`): in this session's entry in the task's own `## Log`, in the format of the plan's `README.md`, ending in `- Next step: …`. `Status:` stays `in-progress`; do not run `task.sh close` or `release`.
   - Resume: `/plan-relay:plan <name> <ID>`, the plugin's `plan` skill. A worker launched by `/plan-relay:run` does not get here: it writes the `Next step:` and returns `RESULT: INTERRUPTED`.
3. **Conversation about an idea** (a file in `agent_plans/_ideas/`): in a `## Handoff` section at the end of the idea's own file. If one already exists, replace it: only the latest handoff counts.
   - Resume: open a new session and ask "continue the idea `agent_plans/_ideas/<file>.md` from the Handoff section".
4. **None of the three:** in a new folder inside the system's temporary folder. Create it with `mktemp -d` (the output is the path) and write `handoff.md` there, starting with a title holding the focus and the date.
   - Resume: open a new session in the same directory and ask "continue from `<path>/handoff.md`". The temporary folder may be cleaned by the system; tell the user so.

The `## Handoff` section (cases 1, 3 and 4) has this shape, with the markers as they are, in a plan in any language (`Next step:` is what the resume looks for):

```
## Handoff — <YYYY-MM-DD HH:MM UTC>
- Focus: …
- Done: …
- In progress: …
- Decisions: …
- Next step: …
- Read first: …
```

This skill makes no commit and no push: whoever called it decides (`/plan-relay:run` commits the journal after it).

## 3. Tell the user

The last message of the session says, in a few lines:

- where the handoff was left (the file path and the section);
- the exact command or request the next session uses to resume, copied from the chosen case;
- that this session should stop here and that the next one starts from scratch.

**Ready when** the destination file has the handoff with a `Next step:` that can be started without asking anything, and the final answer gives the path and the resume command.
