# Changelog

All notable changes to the Plan Relay extension for VS Code. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.1.0] - 2026-11-16

First public release.

### Added

- A panel in the secondary sidebar that shows the plans under `agent_plans/` in the workspace, in three tabs: "Now", "Plans" and "Ideas". The tabs stay pinned while you scroll, work with the keyboard (arrows, Home and End), and the panel remembers the last one you used. The counters say what needs you: "Now" adds up what is in progress, what waits for you and what is free; "Ideas" counts only the open ones. Global actions live in the view title bar: collapse all, search and refresh, plus a "..." menu with the plugin status, install and uninstall.
- The "Now" tab: the tasks in progress (with their duration and the next step from the log), the free ones and the ones waiting for you, across all plans, sorted by what they unblock, with a mark on the ones that can run in another session.
- A card per plan with a stacked progress bar by state, a "Run plan" button, and the map, the log and other actions in a "..." menu, including "Copy run command".
- Phases as an accordion with every task inside, including finished ones and drafts: the phase in progress opens by itself, a finished phase stays collapsed and dimmed, subtasks are indented under their parent, and long phases offer "Show more".
- Search by ID, title, track, type and repository, with the term highlighted, plus filters by state, track and tier, and two views, "By phase" and "By state". The magnifier in the title bar and Cmd/Ctrl+F with the view focused open the search.
- A task detail popup: state, phase, type, track, tier, dates and duration, next step, what it depends on and what it unblocks (both clickable), "Run" or "Resume", "Open file" and, for tasks that can run, "Copy command".
- Abandoned and cancelled tasks, each with its own state, icon, filter chip and group in the "By state" view, kept out of the progress, the counts and the "Now" tab. A cancelled task links to its replacement and an abandoned one to the task it fell with.
- Giving up a task from the panel, with an alarming confirmation that lists everything that falls with it and asks for the reason, and reopening a given-up task. The extension writes the files itself, all or none, and refuses when the plan changed while the confirmation was open.
- Keyboard navigation in the phase and task lists, and screen reader labels with the ID, title and state of each task, so the state does not rely on color alone; the line below a row (duration, next step, what it waits on) is read as the description of the row, and its buttons are reached from the detail popup. The same goes for the count of tasks waiting for you and for a dependency whose file is missing, and screen readers announce the plugin row while it installs and when it fails.
- "Run", "Resume" and "Run plan" buttons that open the agent with the prompt of the action ready, without sending it.
- The "Ideas" tab, with the plans still to be mapped under `agent_plans/_ideas/`: open, refine and create tasks, grouped by state (Open, Refining, Ready, Mapped, Invalid).
- A "Create tasks from this plan" command in the context menu of a Markdown file in the Explorer.
- Installing and removing the plan-relay plugin for Claude Code from the panel, in the package of the VS Code language (`plan-relay-pt-br` for Portuguese, `plan-relay` with English skills otherwise); either one counts as installed, and the prompts use the prefix of the one found. Before installing, the panel shows where it installs from when that is not the published marketplace, and asks for a separate confirmation when the source is a marketplace inside the open folder. A footer that says what the environment lacks (`jq`, `git`, the agent CLI, the login, the plugin).
- VS Code notifications while the panel is open: a task that started or finished and a run that opened or ended, aggregated when a burst arrives (a checkout, a pull). Each one has its own setting under `planRelay.notifications.*`, with a duration and an optional sound.
- The plan state is read in TypeScript, without running any script from the workspace, with the same rules as the plan scripts: a task saved with CRLF line endings and a task file name with spaces are read, and a task id that more than one file has is never counted as done nor changed by giving up or reopening.
- Deleting a plan and setting the 5-hour window gate resolve symbolic links first, and refuse a path that leads outside the workspace folder.
- A user interface in English and in Brazilian Portuguese.

