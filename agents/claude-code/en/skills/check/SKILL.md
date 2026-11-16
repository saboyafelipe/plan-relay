---
name: check
description: Checks the plan-relay environment (jq, git, shell, the agent CLI and login, plugin installed and up to date) and explains each gap with the way to fix it, without installing anything without asking. Use when asked what is missing, whether the plugin is up to date or why the run won't start, and before the first run on a new machine.
argument-hint: "(nothing)"
---

# Check — check the environment

The environment is checked by a single script, `<plugin>/scripts/check.sh`, the same source as the `{{AGENT_PLUGIN_SKILL_PREFIX}}run` preflight and the panel. This skill runs the script, reads the JSON and explains. The checks are not repeated here: what the script does not check, the skill does not claim.

## Commands

Before the first command, read `<plugin>/COMMANDS.md` and follow it in every command of this skill. `<plugin>` is the absolute path on the line that starts with `plan-relay plugin root:` in the session context. Without that line, run nothing and tell the user: "The `plan-relay plugin root:` line is not in this session's context: the plugin's `SessionStart` hook did not run. Check that the plugin is installed and enabled, and open a new session." It is also a finding of the check: without the line, the plugin is not active in this session.

## Steps

1. Run `sh <plugin>/scripts/check.sh --json` and read the whole output. Exit 0: nothing required is missing; 1: something required is missing; 2: wrong usage (should not happen; show the stderr).
2. Read the object: `ok` and, in `checks[]`, for each item, `id`, `status` (`ok`, `missing`, `warning`, `unknown`), `required` and `detail`. An `id` this skill does not know is shown the same way, through its `detail`: new ids may appear.
3. Answer, in this order:
   - **A one-line verdict:** "All up to date" when every item is `ok`; "Nothing required is missing, but there are warnings" when `ok` is `true` and some item is not `ok`; "Something required is missing" when `ok` is `false`.
   - **What is missing** (status `missing` or `warning`), required first: the `id`, whether it is required or optional, the `detail` (which says how to fix it) and, in one sentence, what stops working without it — from the table below.
   - **What could not be known** (status `unknown`): the `id` and the `detail`. `unknown` is never an error: it says the check has no way to answer here (no network, no CLI, no `jq`).
   - **What is up to date:** a single line, with the `ok` ids.
4. If something is missing and the `detail` carries an install or enable command, ask with `{{AGENT_ASK_TOOL}}` whether the user wants you to run that command now, one item per option, plus "No, I'll handle it". Never install, enable, update or log in without that answer. Login (`agent-auth`) always belongs to the user: show the command and do not run it. After running what they chose, run step 1 again and show only what changed.

## What each check says

| id | Without it |
| :--- | :--- |
| `jq` (required) | `selftest.sh`, `summary.sh` and the 5-hour window do not run; the autopilot does not start. |
| `git` | there are no commits of the plan or of the deliverables. |
| `os`, `shell` | informational; `warning` on `shell` means a system where the scripts were not proven (on Windows, use Git Bash or WSL). |
| `agent-cli` | there is no way to check the plugin or the login, and the 5-hour window has no probe. |
| `agent-auth` | the CLI is installed, but a new session (a worker's, an isolated test's) stops at the login prompt. |
| `plugin` | the skills and the context hook are not on this machine; without the hook, the conductor does not get the limit warning. |
| `plugin-current` | the installed version is older than the source folder: the skills in use are not the repository's. After updating, open a new session. Or the version is the same, but the cached copy (the `installPath` in the `detail`) differs from the source folder: the CLI reads the source, the VS Code Agents window reads the copy and shows old skills. `plugin update` does not refresh the copy; reinstalling does, with the two commands in the `detail` (`uninstall` and `install`, in the scope it names). If the check still flags the copy after that, the way out is to delete the `installPath` folder and install again: delete only with the person's confirmation, that folder and no other. |

This skill writes no file and makes no commit.
