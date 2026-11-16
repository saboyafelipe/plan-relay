# Changelog

The changes of each plan-relay version are listed here, per package. The format follows [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/) and the versions follow [Semantic Versioning](https://semver.org/). Each package has its own version and tag: `claude-code-vX.Y.Z` for the Claude Code plugin and `vscode-vX.Y.Z` for the VS Code extension.

## [Unreleased]

## [claude-code-v0.1.0] - 2026-11-16

First public release of the Claude Code plugin.

### Added

- Skills: `map` (turns a document into a plan of tasks under `agent_plans/<name>/`), `plan` (briefing, running and resuming a task; cancelling by replacement, giving up at the owner's request after showing the graph, and reopening), `run` (autopilot with parallel workers and baton passing), `handoff`, `check` (what the environment lacks), `idea` and `refine` (ideas still to be mapped, refined by interview).
- Plan contract 1: `plan.json`, task headers, `status.sh --json` with a JSON Schema and a conformance suite, and the `status.sh`, `task.sh` and `map.sh` scripts copied into the plan. `task.sh` covers `claim`, `release`, `close`, `cancel`, `giveup` and `reopen`.
- The plan scripts read a task saved with CRLF line endings like one saved with LF, and a task file name with spaces like any other; `status.sh` and `map.sh` refuse an option they do not know instead of taking it as a filter, and the three scripts print their usage with `--help` or `-h`; a task id that more than one file has is listed on its own, and no verb changes it until the files are renamed.
- Plans in pt-BR or in English: a plan with `language: en` has no fixed Portuguese text in the output of its scripts or in `MAP.md`.
- The plugin ships in two languages from the same marketplace: `plan-relay`, with the skills in English, and `plan-relay-pt-br`, with the skills in Brazilian Portuguese and the `/plan-relay-pt-br:` prefix. Both come in two model profiles, full and lean. The scripts that run outside a plan speak the language of the package.
- Hooks that give the skills the plugin path and warn when the session context is near its limit.
- The autopilot runs in the VS Code Agents window: the briefing comes as text before the questions, a refused command is reported as refused by the permission system and never as the owner's refusal, the journal closes even when the commit is refused, and in a session without a subscription (API key, proxy, Copilot account) the 5-hour window probe is skipped.

## [vscode-v0.1.0] - 2026-11-16

First public release of the VS Code extension.

### Added

- A panel in the secondary sidebar with the plans of the workspace: progress by phase, the tasks in progress, free and waiting for the owner, and the ideas.
- A "Now" tab with what needs action: a card per plan (first the ones with a task for you) with "Run plan" and "Log", and collapsible sections. Clicking a task, even a blocked one, opens its detail; the play button runs or resumes it.
- Actions that open the agent with the prompt ready: run or resume a task, run the plan on autopilot, create tasks from a document, refine an idea.
- Installing the plugin from the panel, in the package of the VS Code language, and a footer that says what the environment lacks.
- Giving up a task from the panel, with a confirmation that shows everything that falls with it, and reopening it.
- The plan state is read in TypeScript, without running scripts from the workspace, with the same rules as the plan scripts (CRLF line endings, file names with spaces, a duplicated task id).
- A user interface in English and in Brazilian Portuguese.
- Public documentation in English, each document with a pt-BR counterpart next to it.

The full list is in `hosts/vscode/CHANGELOG.md`, which is what the store shows.
