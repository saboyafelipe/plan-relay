# Plan contract, version 1

This is the specification of an agent plan on disk: the files a plan is made of, what each script reads and writes, and the JSON that tools exchange. Anything that reads or writes plans (the `status.sh`/`task.sh`/`map.sh` scripts, the skills, an editor panel, a reader in another language) implements this document.

Machine-checkable parts:

| What | Schema |
| :--- | :--- |
| `plan.json` | [`schema/plan.schema.json`](schema/plan.schema.json) |
| `status.sh --json` | [`schema/status.schema.json`](schema/status.schema.json) |
| `check.sh --json` | [`schema/check.schema.json`](schema/check.schema.json) |
| `task.sh giveup --json` (the [preview](#give-up-preview)) | [`schema/giveup-preview.schema.json`](schema/giveup-preview.schema.json) |

The [conformance suite](#conformance) in [`conformance/`](conformance/) gives input plans and the exact `status.sh --json` expected for each one. An implementation conforms when it passes the suite and its output validates against the schemas.

The schemas use JSON Schema draft 2020-12. Each has an `$id` that ends in its own file name; an `enum` appears only where this document closes the set of values (a value it passes through «as written» stays an open string).

## Principles

- **Contract is what something looks up by name:** file and folder names, header keys, values, JSON keys, body markers that a script or skill searches for, script verbs and options. All of it is English ASCII, in one form only. Old (Portuguese) forms are not read.
- **Everything else is free text** in the plan's language (`language` in `plan.json`): section titles nobody searches for, log entries other than `Next step:`, the text output of the scripts. Nobody parses free text; tools read the `--json`.
- **Forms:** header keys in `Sentence case:` with the colon attached (`Blocked by:`); values in lowercase with hyphens (`in-progress`); JSON keys in `snake_case`; files and folders in lowercase with hyphens, except the Markdown files a person opens first (`README.md`, `PLAN.md`, `MAP.md`, `PHASE.md`); options as `--lowercase-with-hyphens`; verbs as one word.
- **Unknown is ignored:** readers ignore header keys, JSON keys and check ids they do not know. That is what lets optional fields be added without a new contract version.

## Versioning

The contract version is the integer `contract`, in `plan.json` and at the top of `status.sh --json`. This document describes `contract: 1`.

- A **new optional field** (a JSON key, a header key, a `plan.json` key) does not change the version. Consumers must tolerate its absence.
- A **breaking change** (a renamed or removed key, a changed meaning, a new required field, a changed value set that existing readers would misread) raises the version to 2.

Contract 1 was still unpublished when `abandoned` joined the values of `Status:` and `group` (scripts version 9), so that addition did not raise the version: no released reader knows contract 1 without it. From the first public release on, a new value in a set like these is a breaking change.

The scripts carry their own version, independent of the contract; see [Scripts version](#scripts-version).

## Files and folders

A plan is a folder `agent_plans/<plan>/` at the repository root. Paths below are relative to the plan folder unless they start with `agent_plans/`.

| Path | Required | What |
| :--- | :--- | :--- |
| `plan.json` | yes | The plan file; its presence is what makes the folder a plan. |
| `README.md` | yes | The protocol of the plan (how work is done). |
| `PLAN.md` | no | Overview: what is being built and why. |
| `MAP.md` | no | All tasks by phase; written by `map.sh`, never holds state. |
| `_template.md` | no | The shape of a task. |
| `status.sh`, `task.sh`, `map.sh` | yes | Copies of the plan scripts. |
| `phase-<n>-<slug>/` | — | A phase. `<n>` is an integer. |
| `phase-<n>-<slug>/PHASE.md` | no | Phase description; its first `# ` line is the phase title. |
| `phase-<n>-<slug>/<ID>-<slug>.md` | — | A task. `<ID>` is `F<n>-<nn>` with optional `.<k>` parts for subtasks (`F1-03.1`, `F1-03.1.2`). |
| `notes/` | no | Notes; `notes/run-YYYY-MM-DD[-N].md` is an autopilot log. |
| `spec/`, `spec/decisions.md` | no | Specification and decisions. |
| `research/Pnn-<slug>.md` | no | Research notes. |
| `prototypes/` | no | Throwaway prototypes. |
| `.lock-<ID>` | — | Transient directory held by a writer while it changes a task (see [Writers](#writers)). |

Ideas live outside any plan, in `agent_plans/_ideas/<slug>.md` (see [Idea header](#idea-header)). Folder names under `agent_plans/` that start with `_` or `.` are not plans.

## Task header

A task file opens with a block of `Key: value` lines, ended by the first line that starts with `# ` (the title). Whoever creates a task puts `Status:` on the first line; a reader takes it from any header line, and a verb rewrites it on the line where it is (see [What the verbs write](#what-the-verbs-write)).

```
Status: ready
Type: code
Track: core
Tier: mid
Repos: repo-a, repo-b
Blocked by: F1-02, F0-02

# F1-03 - Parse the header
```

A header line is the key at the start of the line, the colon, optional spaces or tabs, and the value up to the end of the line. Lines after the title are never header lines, even when they look like one. Blank lines and unknown keys in the header are ignored.

<a id="line-endings"></a>**Line endings.** A reader takes one carriage return (CR) off the end of every line before anything else, in the header and below the title, and in the title line of `PHASE.md`: a task saved with CRLF reads exactly like one saved with LF. A verb compares lines the same way and writes the whole file back with the line ending of its first line, so a CRLF task stays CRLF, the lines it adds included. The cases `crlf`, `claim-crlf` and `cancel-crlf` check it (since scripts version 22; older scripts kept the CR in every value, which made a CRLF task `invalid`).

**A repeated key** counts by its **last** occurrence in the header, for every key and for readers and writers alike: a reader keeps the last value, and a verb reads (`Previous status:` on `reopen`) and rewrites (`Status:`) the last line of the key, leaving the earlier ones where they are. Writers never repeat a key; the rule is for headers edited by hand. The case `repeated-key` of the conformance suite checks the reading, and `reopen-repeated-key` the writing.

| Key | Value |
| :--- | :--- |
| `Status:` | `draft` (goal written, steps not yet detailed; not to be started), `ready`, `in-progress`, `done`, `cancelled` (taken out by the agent, usually replaced by another task), `abandoned` (given up by the owner, with everything that depended on it). Any other value, or no `Status:` line, makes the task `invalid`. Changed only by the verbs of `task.sh`, or by a host that implements the same verbs on the files (see [Cancel, give up and reopen](#cancel-give-up-and-reopen)). |
| `Type:` | `code`, `research`, `prototype`, `decision`, `human`, `review`. `decision` and `human` need the owner (the person who decides). |
| `Track:` | Free label for a line of work, used by the `status.sh` filter. |
| `Tier:` | `junior`, `mid` or `senior`: how much judgment the task needs, which an agent maps to a model of its own. Missing, or any other value (including another letter case), counts as `senior`. No effect on `human` tasks, which the autopilot does not launch. Written by whoever details the task; never by the autopilot. |
| `Repos:` | Comma-separated repositories the task changes; used to suggest parallel sessions. Omitted when none. |
| `Blocked by:` | Comma-separated task ids. Omitted when none. |
| `Started:` | `YYYY-MM-DDTHH:MMZ` (UTC), written by `task.sh claim`. |
| `Finished:` | `YYYY-MM-DDTHH:MMZ` (UTC), written by `task.sh close`. |
| `Replaced by:` | The id of the task that took this one's place. Written by `task.sh cancel --replaced-by`; only on `cancelled` tasks. |
| `Given up by:` | `owner`. Marks the root of a give-up: the task the owner gave up on. Written by `task.sh giveup`; only on `abandoned` tasks. |
| `Given up with:` | The id of the root. Marks a task that fell with that root because it depended on it. Written by `task.sh giveup`; only on `abandoned` tasks. |
| `Previous status:` | `draft`. The status to go back to on `reopen`, written only when it was `draft`; without it, `reopen` gives `ready`. Written by `task.sh giveup`; only on `abandoned` tasks. |

In `Repos:` and `Blocked by:`, spaces and tabs are removed and the value is split on commas; empty items are dropped.

**Title.** The `# ` line without the `# ` and without a leading id prefix. Writers write `# <ID> - <title>`, with the task's own id and the hyphen. Readers remove the longest match of the regular expression `^F[0-9]+-[0-9]+(\.[0-9]+)*[ \t]*(—|-)[ \t]*` (an id, optional spaces or tabs, a hyphen-minus or an em dash, optional spaces or tabs), whatever the id: it need not be the task's own, and the spaces may be missing (`# F1-01-Foo` gives `Foo`). Any other dash, or no dash, keeps the line whole (`# F1-04 – Foo` with the en dash gives `F1-04 – Foo`). The case `title-prefix` of the conformance suite fixes these forms.

## Body markers

| Marker | Meaning | Read by |
| :--- | :--- | :--- |
| `## Done when` | Section with the completion checklist. | `task.sh close` |
| `- [ ]`, `- [x]` | Checklist boxes; `close` refuses while a `- [ ]` remains in `## Done when` (the exact rule is in [claim, close and release](#claim-close-and-release)). | `task.sh close` |
| `## Log` | Section with one entry per working session. | skills |
| `Next step:` | Where the next session resumes. Only a line that **starts** with `Next step:`, after optional spaces or tabs and an optional list marker (`- ` or `* `), counts; a line that only cites the marker mid-text does not. The **last** such line below the title wins; its value is the text after the marker. Required while `in-progress`. | `status.sh` |
| `Next step: Waiting on owner: <action>` | The task stopped at a point reserved to the owner. | skills |
| `[autopilot]` | Prefix of a decision taken by the autopilot, for the owner to review. | skills |

**Autopilot log** (`notes/run-YYYY-MM-DD[-N].md`): sections `## Preflight`, `## Tasks` (entries `### <HH:MM> <ID> - <RESULT>`), `## Closing`, and `## Handoff`. A log is open while it has no line starting with `## Closing`. Decision mode values: `prepare`, `decide`.

**Worker report** (what a worker returns to the autopilot): line labels `RESULT:`, `TASK:`, `DONE:`, `AUTOPILOT-DECISIONS:`, `SURPRISES:`, `COMMITS:`, `SUBTASKS:`, `CANCELLED:` (tasks the worker cancelled by replacement, `<ID> → <replacement> — <reason>`), `WAITING-ON-OWNER:`, `NEXT-STEP:`; `RESULT:` values `COMPLETED`, `INTERRUPTED`, `BLOCKED`, `WAITING-ON-OWNER`. These are the only upper-case values in the contract, so they stand out in free text.

## plan.json

Schema: [`schema/plan.schema.json`](schema/plan.schema.json).

```json
{
  "contract": 1,
  "name": "recipes-site",
  "source": "docs/idea.md",
  "created": "2026-11-14T09:00Z",
  "language": "en",
  "profile": "full",
  "scripts_version": 1
}
```

| Key | Required | Value |
| :--- | :--- | :--- |
| `contract` | yes | `1`. |
| `name` | yes | Plan name; by convention the folder name. Not checked: the plan's name is always its folder's (as in `status.sh --json`), so a folder renamed without editing `name` is still the same, valid plan. |
| `source` | yes | Path of the source document relative to the repository root, or `null` when the plan came from a conversation. |
| `created` | yes | `YYYY-MM-DDTHH:MMZ` (UTC). |
| `language` | no | Language of the free text: `pt-BR` or `en`. Default `pt-BR`. Only the top-level key counts: a `language` nested in another object, or quoted inside a string value, is not the plan's language. |
| `profile` | no | Template profile: `full` or `lean`. Default `full`. |
| `scripts_version` | no | The scripts version the plan received (see [Scripts version](#scripts-version)). |

A `language` or `profile` outside the documented values is passed through as text by `status.sh`; the consumer decides what to do with it.

**Language rule.** Whoever writes free text for a plan (the scripts' output and `## Log` lines, a host's edits) picks the string table from `language` the same way: the table whose name is equal ignoring case (`PT-br` is `pt-BR`); else the one with the same base language, the part before the first `-`, ignoring case (`en-US` is `en`, `pt` and `pt-PT` are `pt-BR`); else English, the fallback. A missing `language` is `pt-BR`, as above.

Writers of `plan.json` write only `pt-BR` or `en`: a plan in any other language has its text in that language and `language` set to `en`, so the scripts answer in English. A plan's copy of the scripts carries only the table of its language and the English one (plus the `x-test` table of the conformance cases).

**Reading a field.** `language` and `profile` are read from the top-level object only: a key with the same name inside a nested object or array, or quoted inside a string value, does not count. When the key repeats at the top level, the last one wins. A value that is not a string, is empty, or contains a backslash counts as missing.

## status.sh

```
sh agent_plans/<plan>/status.sh [filter] [--all] [--options] [--json]
```

- `filter`: a task id prefix (`F1`, `F2-03`) or a track name. A task passes when its id starts with the filter or its `Track:` equals it. Every argument that does not start with `--` is a filter word, and the last one counts (`x F2` filters by `F2`). An argument that starts with `--` and is not one of the three options below is refused: `status.unknownOption` on stderr, nothing on stdout, exit `1` (since scripts version 22; older scripts took it as a filter word, so a mistyped option gave an empty plan).
- `--help` or `-h`: the usage, one line per option, on stdout (`status.usage` and the `status.help*` texts), exit `0`, whatever other arguments are given, an unknown option included (since scripts version 23; older scripts refused `--help` as an unknown option and took `-h` as a filter word). Neither is a filter word.
- `--all`: also list done, cancelled, abandoned and draft tasks in the text output. No effect on `--json`.
- `--options`: tab-separated lines of the tasks that can start now, most recommended first: `id`, group (`available` or `owner`), `unblocks`, `type`, `title`. All `available` lines come before the `owner` lines; within each, by `unblocks`, highest first, ties in the order of `tasks`.
- `--json`: the object below. The text output without options is for people and is not part of the contract.

`status.sh` runs from any directory; it works on the folder it lives in.

### status.sh --json

Schema: [`schema/status.schema.json`](schema/status.schema.json).

```json
{
  "contract": 1, "name": "demo", "language": "pt-BR", "profile": "full", "scripts_version": 1,
  "progress": {"done": 1, "total": 9, "pct": 11, "in_progress": 1, "draft": 1},
  "phases": [{"dir": "phase-1-core", "title": "Phase 1 - Core", "done": 1, "total": 5, "in_progress": 1}],
  "tasks": [{"id": "F1-02", "title": "In progress", "status": "in-progress", "type": "code", "track": "core",
             "tier": "mid", "repos": ["repo-a"], "blocked_by": ["F1-01"], "waiting_on": [], "group": "in-progress",
             "unblocks": 1, "started": "2026-11-02T08:30Z", "finished": null,
             "next_step": "write the parser", "file": "phase-1-core/F1-02-in-progress.md"}],
  "parallel": ["F1-04"],
  "run": {"log": "notes/run-2026-11-14.md", "open": true, "handoff": "2026-11-14 18:47"}
}
```

**Top level.** `name` is the plan folder name. `language` and `profile` come from `plan.json`, with the defaults above when the key or the file is missing. `scripts_version` is the stamp of the `status.sh` that produced the output (`null` when the stamp line is missing).

**Which tasks.** Every file `phase-*/F<digit>*.md` is a task; its id is the leading `F<n>-<nn>[.<k>…]` of the file name. `tasks` holds the tasks that pass the filter, in numeric order of phase and id (see [Order](#order)). `file` is the path relative to the plan folder. A name with spaces or glob characters (`F1-01 first draft.md`, `F1-03 [draft].md`) is a task like any other (case `file-name-space`, since scripts version 22); writers still name files `<ID>-<slug>.md`, without spaces.

<a id="duplicated-id"></a>**Duplicated id.** When more than one file has the same id, each file is still an entry of `tasks`, with the fields of its own header (`status` as written), but in everything that reads the state it has none: its `group` is `invalid`; `progress` and `phases` count it only in `total`; its `Blocked by:` counts in `unblocks`; it occupies no repository in `parallel`; and a `Blocked by:` that cites the id is not done (the id goes to `waiting_on`, without `(?)`). The `unblocks` of each file is that of the id. The text output lists the files of a duplicated id under a heading of their own, and every verb refuses the id (see [task.sh and map.sh](#tasksh-and-mapsh)). The case `duplicate-id` checks it (since scripts version 22; older scripts merged the headers of the files into one).

**Task fields.** `status`, `type`, `track` are the header values as written, or `""` when the key is missing. `tier` is the `Tier:` value already normalized: `junior` or `mid` when written exactly so, `senior` otherwise (missing, `senior`, or any other value), whatever the type and status; added in scripts version 6, so output from older scripts lacks it and consumers read its absence as `senior`.

`repos` and `blocked_by` are the lists from the header (`[]` when missing). `started`, `finished` are the header text or `null`. `next_step` is the value of the last `Next step:` line below the title (a line starting with the marker, see [Body markers](#body-markers)), or `null`, whatever the status. `replaced_by`, `given_up_by` and `given_up_with` are the values of `Replaced by:`, `Given up by:` and `Given up with:`, whatever the status, and exist **only on tasks whose header has the key** with a non-empty value; consumers read a missing key as `null`. They exist since scripts version 9.

**Group.** Each task gets exactly one `group`:

| `Status:` | Condition | `group` |
| :--- | :--- | :--- |
| `in-progress` | — | `in-progress` |
| `done` | — | `done` |
| `cancelled` | — | `cancelled` |
| `abandoned` | — | `abandoned` |
| `draft` | — | `draft` |
| `ready` | every id in `Blocked by:` is a task whose status is `done`, and `Type:` is `decision` or `human` | `owner` |
| `ready` | every id in `Blocked by:` is a task whose status is `done`, any other type | `available` |
| `ready` | some id in `Blocked by:` is not `done` (a `cancelled` or `abandoned` blocker counts as not done) or matches no task file | `blocked` |
| anything else, or missing | — | `invalid` |

The blocker check looks at every task of the plan, not only the filtered ones.

**`waiting_on`.** Only for `blocked` tasks (`[]` otherwise): the ids from `Blocked by:` that are not done, in header order; an id that matches no task file gets the suffix `(?)` (`"F9-99(?)"`).

**`unblocks`.** For a task id X: the number of times X is cited in `Blocked by:` by tasks whose status is not `done`, `cancelled` or `abandoned` (drafts, invalid, blocked and in-progress tasks count). It is computed over the whole plan; the filter does not apply.

**`progress`.** Over the filtered tasks: `done` counts status `done`; `total` counts all minus `cancelled` and `abandoned` (invalid tasks count); `in_progress` and `draft` count those statuses; `pct` is `round(100 * done / total)` with halves rounded up (`floor(100 * done / total + 0.5)`), and `0` when `total` is `0`.

**`phases`.** One entry per phase folder that has at least one filtered task, in order of first appearance in `tasks`. `dir` is the folder name; `title` is the first `# ` line of its `PHASE.md` without the `# `, or the folder name when there is no such line or file; `done`, `total` (without cancelled and abandoned) and `in_progress` count the phase's filtered tasks the same way as `progress`. A phase whose first filtered tasks are cancelled still has one entry, and a phase whose filtered tasks are all cancelled has one entry with `total` 0; the case `cancelled-first` of the conformance suite checks it.

<a id="abandoned-phase"></a>A phase is **abandoned** when every task in it is `cancelled` or `abandoned` and at least one is `abandoned`: the owner gave up on what was left of it, and nothing in it was done. Its entry gets `"abandoned": true`; other entries do not have the key, and consumers read a missing key as `false`. This looks at every task of the phase, not only the filtered ones, because it describes the phase, not the view. A phase with a `done` task is never abandoned: what left it stops counting in `total`, as with cancelled tasks. A phase whose tasks are all `cancelled` is not abandoned either (the case `cancelled-first`). The key exists since scripts version 9.

<a id="parallel"></a>**`parallel`.** A suggestion of tasks to run at the same time without touching the same repository:

1. Take the `available` tasks and sort them by `unblocks`, highest first; ties keep the order of `tasks` (stable sort).
2. Mark as occupied every repository in `Repos:` of the filtered `in-progress` tasks.
3. Walk the sorted list: a task with a repository already occupied is skipped; otherwise it joins `parallel` and its repositories become occupied. A task without `Repos:` never collides.

**`run`.** The latest autopilot log, or `null` when there is none. Logs are the files `notes/run-YYYY-MM-DD.md` and `notes/run-YYYY-MM-DD-N.md` (N a positive integer); other names in `notes/` are not logs. The latest is the one with the highest date, then the highest N, where no suffix counts as 1 (`run-2026-11-13.md` < `run-2026-11-13-2.md` < `run-2026-11-13-10.md` < `run-2026-11-14.md`). `log` is its path relative to the plan folder; `open` is `true` while it has no line starting with `## Closing`.

`handoff` says when the conductor last passed the baton: it comes from the last line of the log, open or not, that starts with `## Handoff` followed by a space, punctuation or the end of the line (`## Handoffs` does not count).

The value is the rest of that line with the leading spaces, one separator (`—`, `–` or `-`) and the surrounding spaces removed; when it starts with a `YYYY-MM-DD HH:MM` stamp (not followed by a digit), only those 16 characters (`## Handoff — 2026-11-14 18:47 UTC` gives `"2026-11-14 18:47"`). A title written by hand without a stamp is kept whole, so consumers compare it by equality, not as a date. With no such line, `null`. The key exists since `scripts_version` 8; a reader that gets output without it (an older `status.sh`) treats it as `null`.

**Empty plan.** With no task files, the output still has every key: zero counts, empty arrays, and `run` as above.

<a id="order"></a>**Order.** `phases` come in ascending numeric order of `N` in `phase-<N>-<slug>` (`phase-2-…` before `phase-10-…`), and `tasks` follow them: first by that `N`, then, inside the phase, by the numbers of the id compared one by one as integers (`F1-03` < `F1-03.1` < `F1-04`; `F1-9` < `F1-10`; `F1-10.2` < `F1-10.10`). A shorter id that is a prefix of a longer one comes first. A file whose name does not start with an id comes after the ids of its phase, in byte order. The order does not depend on the locale. Consumers keep the order they receive; the case `phase-order` of the conformance suite checks it.

### Unspecified

The conformance suite does not cover these; implementations may differ, and writers should avoid them: trailing spaces or tabs after a header value (values are taken to the end of the line); a CR that is not at the end of a line, and a file whose lines do not all have the same ending (a verb writes it back with the ending of its first line); a file name with a line break; a task file without a `# ` title line; a task file name that does not start with a valid id; two autopilot logs with the same date where one has the suffix `-1`.

## task.sh and map.sh

```
sh agent_plans/<plan>/task.sh claim|close|release|reopen <ID>
sh agent_plans/<plan>/task.sh cancel <ID> [--replaced-by <ID>] --reason <text>
sh agent_plans/<plan>/task.sh giveup <ID> [--json]
sh agent_plans/<plan>/task.sh giveup <ID> --reason <text> --yes
sh agent_plans/<plan>/map.sh
```

- `<ID>` is the whole id, `F<n>-<nn>` with optional `.<k>` parts, and it matches the task exactly: the file whose leading id, read as in [Which tasks](#statussh---json), is `<ID>` (`phase-*/<ID>-<slug>.md`, or a name with spaces such as `F1-01 first draft.md`). A prefix (`F1`) or the id with its slug (`F1-01-first`) is not an id: the verb refuses with `task.notFound` and changes nothing. The `Blocked by:` ids of `claim` are looked up the same way, and the lock is named after the id, so there is one lock per task file.
- A [duplicated id](#duplicated-id) is refused by every verb with `task.ambiguousId`, whose arguments are the id and its files in plan order, joined by `, `; the check comes right after `task.notFound`, before any other, and nothing changes. `giveup` (the preview too) and `reopen` refuse the same way when a task that would change has a duplicated id; in `giveup`, before `task.giveupStuck`. A `Blocked by:` id of `claim` that names more than one file is not done. Since scripts version 22.
- An option a verb does not take is refused with `task.usage`. `map.sh` takes no options: an argument that starts with `--` is refused with `map.unknownOption`, exit `1` (since scripts version 22).
- `--help` or `-h` prints the usage on stdout and exits `0` (since scripts version 23): for `task.sh`, as the first argument, `task.usage` and one `task.help*` line per verb; for `map.sh`, as any argument, `map.usage`, before any other argument is judged and without touching `MAP.md`. `task.sh` with no arguments still gives `task.usage` on stderr, exit `1`.
- `claim`, `close` and `release`: see [claim, close and release](#claim-close-and-release).
- `cancel`, `giveup` and `reopen`: see [Cancel, give up and reopen](#cancel-give-up-and-reopen).
- Every verb is a writer and follows [Writers](#writers): lock, write order, temporary files.
- Exit code `0` when the file changed (and for a `giveup` preview that would be accepted), `1` with the reason on stderr when refused or on wrong usage.
- A refusal is identified by its key (`task.invalidReason`, `task.reopenAtRoot`, …), not by its text: the wording is translated and is not part of the contract. An implementation conforms when it refuses with the same key; the conformance cases (`x-test` language) compare keys.
- `map.sh` rewrites `MAP.md` from the headers.

## Cancel, give up and reopen

Two ways to take work out of a plan, with different owners, and the way back from the second:

- **Cancel** belongs to the agent. It reorganizes the plan without losing work: one task takes another's place. Result: `cancelled`.
- **Give up** belongs to the owner. It takes work out of the plan, together with everything that can never start without it. Result: `abandoned`. An agent gives up only when the owner asked for that task in the conversation, after showing the [preview](#give-up-preview) and getting a yes; an autopilot worker never gives up.
- **Reopen** undoes a give-up, as a group.

`cancelled` and `abandoned` leave `total` alike, and both count as a blocker that is not done. A cancelled task is not reopened.

A task is **live** when its status is anything but `cancelled` and `abandoned` (`done` and `invalid` included). The **dependents** of X are the tasks whose `Blocked by:` cites X.

### The reason

`cancel` and `giveup --yes` take one reason, `--reason <text>`. The value of `--reason` is the next argument, whatever it starts with (`--reason --------` passes `--------`, which is then refused).

1. Whitespace is space, tab, line feed and carriage return, and nothing else: a no-break space (U+00A0) is a character like any other, so `a`, a no-break space and `b` make one word (accepted), and a lone no-break space is one character (refused). The reason is trimmed of whitespace at both ends, and every run of whitespace inside becomes one space.
2. It is refused when it is empty, or when **every** word (split on the space) is one character, alone or repeated. Characters are Unicode code points: `ééé` is one character repeated, whatever its bytes.
3. The refusal message is always the same text (`task.invalidReason`).
4. What is written is the normalized text.

Refused: `-`, `a`, `1`, `aaaaaaaaa`, `--------`, `aaaaaaaaa bbbbbbb 1111111 --------`. Accepted: `Sem máquina Windows disponível`. [`conformance/reasons.json`](conformance/reasons.json) has the full table.

### What the verbs write

**Header.** `cancel`, `giveup` and `reopen` rewrite only the header: the `Status:` line becomes `Status: <new>`, on the line where it was (with no `Status:` line the task is `invalid` and every verb refuses it); every header line that starts with `Replaced by:`, `Given up by:`, `Given up with:` or `Previous status:` is removed; the verb's own lines go right after the `Status:` line, in this order: `Replaced by:`, `Given up by:`, `Given up with:`, `Previous status:`. Every other line, blank lines included, stays where it was. `Started:` and `Finished:` are not touched.

**Log line.** Each changed task gets one line `- <text>` in its `## Log`, in the plan's language, from the texts `task.log*` of the i18n files (the table is in [`conformance/edits/README.md`](conformance/edits/README.md)). The section is the first line equal to `## Log` below the title, up to the next line that starts with `# ` or `## `, or the end of the file.

The line goes right after the last non-blank line of the section (after the `## Log` line itself when the section is empty, with one blank line between them). Without a `## Log` section, trailing blank lines are dropped and the file gets a blank line, `## Log`, a blank line and the entry. The file ends with a line feed.

**Atomicity.** Every check runs before any file is written, and a multi-file edit is all-or-nothing; the steps are in [Write order](#write-order).

### cancel

```
task.sh cancel <ID> [--replaced-by <NEW>] --reason <text>
```

Refusals, checked in this order:

1. The task is not `draft`, `ready` or `in-progress` (`task.cancelOnlyLive`).
2. `--replaced-by` names no task, names the task itself, or names a task that is `cancelled` or `abandoned` (`task.invalidReplacement`).
3. The task has live dependents (`task.cancelHasDependents`, with the ids in [order](#order), separated by `, `). The verb never cancels in cascade. To cancel a task that others depend on, the agent first creates the replacement (which usually inherits the old `Blocked by:`), then swaps the old id for the new one in the `Blocked by:` of each dependent, and only then cancels with `--replaced-by`.
4. The reason is not valid (`task.invalidReason`).

Effect: `Status: cancelled`, `Replaced by: <NEW>` when given, and the log line `task.logCancel` (or `task.logCancelReplaced`) with the reason.

### giveup

```
task.sh giveup <ID> [--json]                 preview, changes nothing
task.sh giveup <ID> --reason <text> --yes    applies
```

<a id="closure"></a>**What falls.** The root and the closure of its dependents, across phases. It is a graph, not a tree: a task with two blockers falls if either falls, because it could never start again. The walk:

1. Start with the root at depth 0.
2. Take the tasks in walk order (a queue: the root, then each task in the order it joined). For each, its dependents, in [order](#order), that have not joined yet join with depth + 1, and the task that brought them is their **parent**.
3. A dependent that is `cancelled` or `abandoned` does not join, and the walk does not go through it: it stays as it is.

Each task joins once, so a cycle in `Blocked by:` (a hand edit) ends the walk like any other edge.

Refusals, checked in this order, with nothing written:

1. The root is not `ready` or `draft` (`task.giveupOnlyReadyOrDraft`); tasks in the `blocked` group are `ready`, so they are accepted.
2. Some task that would fall, other than the root, is not `ready` or `draft`, that is, it is `in-progress`, `done` or `invalid` (`task.giveupStuck`, with every such task as `<ID> (<status>)`, in the order of the preview's `falls`, separated by `, `). The walk goes through these tasks too, so all of them are named.
3. Only with `--yes`: the reason is not valid (`task.invalidReason`). Without `--yes` the reason is not read.

<a id="give-up-preview"></a>**Preview.** Without `--yes`, nothing changes. The text output (for people) shows every task that would fall, indented under its parent, with the total and each phase that would end up abandoned. Hosts show the same: the panel as a modal, a skill in the conversation before asking for the owner's yes. With `--json`, the preview is this object (schema: [`schema/giveup-preview.schema.json`](schema/giveup-preview.schema.json)):

```json
{"root": "F1-02",
 "falls": [
   {"id": "F1-02", "title": "Prove on Windows", "status": "ready", "phase": "phase-1-base", "parent": null, "depth": 0, "also_depends_on": []},
   {"id": "F2-01", "title": "Installer", "status": "draft", "phase": "phase-2-win", "parent": "F1-02", "depth": 1, "also_depends_on": []},
   {"id": "F2-02", "title": "Signed installer", "status": "ready", "phase": "phase-2-win", "parent": "F2-01", "depth": 2, "also_depends_on": ["F1-03"]}
 ],
 "abandoned_phases": ["phase-2-win"]}
```

- `falls` is the tree in pre-order: the root, then each child followed by its own subtree, children in [order](#order). Its length is the number of tasks that fall.
- `phase` is the phase folder; `status` is `ready` or `draft`.
- `also_depends_on`: the other blockers of the task that stay live: ids in its `Blocked by:`, in header order, that are tasks of the plan, do not fall, and whose status is not `done`, `cancelled` or `abandoned`. An id with no task file is left out (`status.sh` already shows it as `(?)` in `waiting_on`). The root has `[]`. Hosts show them as «also depends on F1-03».
- `abandoned_phases`: the phase folders that would become [abandoned](#abandoned-phase) and were not, in phase order.

**Effect** (with `--yes`): the root gets `Status: abandoned` and `Given up by: owner`; every other task that falls gets `Status: abandoned` and `Given up with: <root>`. Each one that was `draft` also gets `Previous status: draft`. The root's log line is `task.logGiveup` with the reason; the others get `task.logGiveupWith` with the root's id.

### reopen

```
task.sh reopen <ID>
```

Refusals: the task is not `abandoned` (`task.reopenOnlyAbandoned`); the task has `Given up with: <root>` (`task.reopenAtRoot`: reopen the root). An `abandoned` task without `Given up with:` is a root, with or without `Given up by:`.

Effect: the root and every task with `Status: abandoned` and `Given up with: <root>` go back to `Previous status:` (`draft`), or to `ready` without it, and lose the keys of the give-up. Tasks that were already `cancelled` or `abandoned` before the give-up were not part of it and stay as they are. The root's log line is `task.logReopen`; the others get `task.logReopenWith` with the root's id. Reopening does not ask for a reason.

## Writers

A **writer** is anything that changes a task file: `task.sh` and any host that implements its verbs on the files (the VS Code panel implements `giveup` and `reopen`). Every writer follows this section; a host that writes without the lock does not conform. Readers never take locks.

### claim, close and release

These three rewrite only the header, as in [What the verbs write](#what-the-verbs-write): the `Status:` line becomes `Status: <new>` on the line where it was, and every other line stays. None of them writes to the `## Log`. `<now>` is the current time, `YYYY-MM-DDTHH:MMZ` in UTC.

- `claim <ID>`. Refusals, in this order: the task is `in-progress` (`task.alreadyInProgress`, with its `Started:`); the task is not `ready` (`task.claimOnlyReady`); an id in its `Blocked by:` is not a task with `Status: done` (`task.stillWaiting`, with those ids). Effect: `Status: in-progress`; every `Started:` and `Finished:` header line is removed, and `Started: <now>` goes right after the `Status:` line.
- `close <ID>`. Refusals, in this order: the task is not `in-progress` (`task.closeOnlyInProgress`); an open box remains (`task.doneWhenUnchecked`, followed on stderr by the open lines as they are). A **Done when section** starts at each line that starts with `## Done when` and runs up to the next line that starts with `## `; an **open box** is a line inside it that starts with `- [ ]`, with no indentation. Effect: `Status: done`; every `Started:` and `Finished:` header line is removed, and right after the `Status:` line go `Started: <the old value>` (only when the task had one) and `Finished: <now>`.
- `release <ID>`. Refusal: the task is not `in-progress` (`task.releaseOnlyInProgress`). Effect: `Status: ready`, and every `Started:` and `Finished:` header line is removed.

### Lock

- **Name.** A writer takes the lock of each task it will change before it reads them: the directory `.lock-<ID>` in the plan folder. Creating the directory (`mkdir`, or the platform's create-if-absent) is the only way to take it; it succeeds for exactly one writer.
- **Which locks.** A verb that changes one task takes that task's lock. `giveup --yes` and `reopen` first compute, without locks, the tasks that would change; take all their locks in [order](#order); compute again under the locks; and refuse with `task.lockBusy` if the set grew (a `claim` landed in between). Taking locks in one global order means two writers never wait on each other in a cycle. A `giveup` preview writes nothing and needs no lock.
- **Identity.** Right after taking the lock, the writer writes the file `.lock-<ID>/owner`, one line: `<host> <pid> <YYYY-MM-DDTHH:MM:SSZ>` (`<host>` is the machine name, `<pid>` the process id, the time in UTC). A lock directory without `owner` is a lock being taken; it counts as held.
- **Release.** The owner removes `owner` and then the directory: on success, on refusal and on any error it can catch.
- **Wait.** A writer that finds the lock held retries for `TASK_LOCK_WAIT` seconds (default 10), then refuses with exit 1 and `task.lockBusy`. It never writes without the lock.

### Orphan

- A lock is **orphaned** when its `owner` names this machine and a process id that is not running, or when it is older than `TASK_LOCK_STALE_MIN` minutes (default 1) by the time in `owner` (by the directory's modification time when `owner` is missing).
- **Who cleans.** Any writer that waits on it. To steal, it renames `.lock-<ID>` to `.lock-<ID>.stale.<pid>` (a rename is atomic, so one waiter wins and the others see the lock gone), checks that the renamed `owner` is the one it judged orphaned, removes the renamed directory, and then takes the lock by creating it as usual. A waiter that loses the rename starts over. Nobody removes a lock by deleting the live name.
- A writer that ran past `TASK_LOCK_STALE_MIN` checks, before each rename of step 3 below, that `.lock-<ID>/owner` is still its own; if not, it stops with `task.lockBusy`, removes its temporary files and changes nothing more.

### Write order

1. Under the locks: read every task of the plan, run every check of the verb, and compute the new text of each file that changes. A refusal writes nothing.
2. Write each new text to a **temporary file** in the same folder as its target. Its name starts with the target's name and never ends in `.md`, so no reader takes it for a task (`task.sh` uses `<file>.tmp.<pid>`; the panel `<file>.plan-relay-<hex>.tmp`). A failure here removes the temporaries: nothing changed. A writer removes only its own temporaries; one left behind by a writer that died is not read and not touched.
3. Rename each temporary over its target, in [order](#order). Each file is replaced atomically (rename in the same folder).
4. **The edit is all-or-nothing.** A rename that fails restores each file already replaced to the text read in step 1, each through a temporary and a rename; the remaining temporaries are removed, and the verb exits 1 with `task.rewriteFailed`. If a restore fails too, the verb exits 1 naming the state each file was left in (replaced, restored, or untouched).
5. Release the locks.

A reader may see some files of a multi-file edit and not others; the next read sees all of them, or, after a failed edit, none.

## check.sh --json

Schema: [`schema/check.schema.json`](schema/check.schema.json).

```json
{"ok": true, "checks": [
  {"id": "jq", "status": "ok", "required": true, "detail": "/usr/bin/jq"},
  {"id": "agent-cli", "status": "missing", "required": false, "detail": "how to install it"}
]}
```

- `ok` is `true` when no check with `required: true` has a `status` other than `ok`.
- `status`: `ok`; `missing` (not there); `warning` (there, with a caveat); `unknown` (cannot be known here; never an error).
- `detail` is text for people; on `missing` and `warning` it says how to fix it.
- Known ids: `jq`, `git`, `os`, `shell`, `agent-cli`, `agent-auth`, `plugin`, `plugin-current`. The order of checks is stable; new ids may appear and consumers ignore the ones they do not know.
- `agent-auth` (added without a contract bump, since consumers ignore unknown ids): whether the agent CLI is signed in, read from local state without the network; `required: false`; `missing` when it is not signed in, `unknown` when the CLI is absent or cannot tell. Its `detail` never carries the account's e-mail or organization.
- Exit code: `0` when nothing required is missing, `1` when something is, `2` on wrong usage.

## Idea header

An idea is a file `agent_plans/_ideas/<slug>.md`, `<slug>` in lowercase ASCII with hyphens. File names starting with `_` or `.` are not ideas.

The header has the same form as a task header: `Key: value` lines before the first `# ` line, `Status:` first, blank lines and unknown keys ignored, nothing after the title is header. A repeated key counts by its last occurrence, as in a task header: readers keep the last value, and a writer that changes a key rewrites its last line.

| Key | Required | Value |
| :--- | :--- | :--- |
| `Status:` | yes | `open`, `refining`, `ready` or `mapped`. Another value, or none, makes the idea `invalid` for readers, which show it with the text read. |
| `Created:` | yes | `YYYY-MM-DDTHH:MMZ` (UTC). Missing or malformed: readers show no date, they do not refuse. |
| `Open questions:` | yes | Integer ≥ 0: how many questions remain. The questions themselves are in the body, as free text. Missing or not a number: unknown, and treated as greater than zero when warning before creating tasks. |
| `Plan:` | only when `mapped` | Path of the generated plan relative to the repository root, without a trailing `/`: `agent_plans/<name>`. Ignored in other states. |

**Title.** The `# <title>` line; there is no `Title:` key. Without a `# ` line, the title is the slug.

**States.** `open` (created, not yet refined) → `refining` (questioning started) → `ready` (`Open questions:` reached 0 and the person confirmed) → `mapped` (a plan was generated and `Plan:` written). `ready` goes back to `refining` when a new question appears. Creating tasks with `Open questions:` above 0 warns and does not refuse. `mapped` is final: mapping again makes a new plan.

**Body.** Free, in the idea's language. The only section looked up by name is `## Handoff`.

**Counting open questions.** The questions section is marked, not named: the line `<!-- open-questions -->` right below its heading, whatever the heading's language. `Open questions:` is the number of top-level list items (a line starting with `- `, `* ` or `<n>. `) from the marker to the next `# ` or `## ` heading, leaving out lines inside ```` ``` ```` blocks; nested items and question marks in the text do not count. Writers keep the header in step with that count; readers trust the header and do not count.

```
Status: refining
Created: 2026-11-14T10:00Z
Open questions: 2

# Export the plan to CSV

What we want: …

## Open questions
<!-- open-questions -->

- Which columns?
- Comma or semicolon?
```

## Scripts version

- `status.sh`, `task.sh` and `map.sh` carry the line `# scripts_version: <N>` right after `#!/bin/sh`, with the same integer `<N>` in all three. Hosts that do not run scripts read it as text.
- `<N>` starts at `1` and goes up by one whenever any of the three scripts changes. It is not the plugin version.
- `status.sh --json` reports its own stamp as `scripts_version`; `plan.json` keeps the version the plan received.
- A stamp on disk lower than the one shipped with the plugin means old scripts; a `plan.json` value different from the stamp on disk means a hand-edited copy or a half-done update.

## Conformance

[`conformance/`](conformance/) holds the suite:

```
conformance/
  run.sh                       runs a status.sh against every case and compares
  validate.sh                  validates outputs and plan files against the schemas
  cases/<case>/
    agent_plans/<plan>/…       the input plan, without scripts
    expected.json              the expected status.sh --json, written from this document
    expected.tsv               instead of expected.json: the expected --options lines
    args                       optional: arguments besides --json, on one line
    since                      the lowest scripts version that implements the case
  edit.sh                      runs a task.sh against every edit case and compares
  edits/README.md              the form of an edit case and the log texts
  edits/<case>/
    before/agent_plans/<plan>/…  the plan before the verb, without scripts
    args                       the task.sh arguments, one per line
    exit                       the expected exit code
    after/agent_plans/<plan>/…   optional: the plan after; without it, nothing may change
    stderr                     optional: the expected stderr (refusals)
    preview.json               optional: the expected stdout of a giveup --json preview
  reasons.json                 reasons and whether each is valid, with the normalized text
  invalid/<schema>/*.json      documents that schema/<schema>.schema.json must refuse, one broken rule each
```

```
sh core/contract/conformance/run.sh <status.sh> [case…]
sh core/contract/conformance/edit.sh <task.sh> [case…]
sh core/contract/conformance/validate.sh <status.sh> <check.sh>
```

`run.sh` copies each case to a temporary folder, puts the given `status.sh` in the plan folder, runs it with `--json` (plus `args`) under `LC_ALL=C`, and compares the result with `expected.json` after `jq -S` on both. `scripts_version` is not compared: it is the stamp of the implementation under test.

A case with a `since` above the stamp of the `status.sh` under test is skipped and reported as such; a `status.sh` without a stamp runs every case. Every case has a `since`: the version of the newest key or rule it expects (`tier` is 6, `run.handoff` 8, `abandoned` 9), so a `status.sh` of an older version skips what it cannot pass instead of failing it. A new case gets the lowest version that passes it; a runner reads a missing `since` as 0.

A case with `expected.tsv` instead runs `status.sh` with `args` alone and compares stdout with the file byte for byte; only `status.sh` runs these cases, since no reader implements `--options`. It needs `jq`.

`edit.sh` copies each edit case to a temporary folder, puts the given `task.sh` in the plan folder, runs it with the arguments of `args` under `LC_ALL=C` and with `TASK_TEST_NOW=2026-01-02T03:04Z` (a `task.sh` writes that value as `<now>` when the variable is set), and compares the exit code, the plan tree (with `after/`, or with `before/` when there is no `after/`), `stderr` when the case has one, and stdout with `preview.json` after `jq -S` when the case has one.

The plans of the edit cases are in the language `x-test`, so the texts are the i18n keys with their arguments and do not depend on a translation. Every case of `edits/` and the table `reasons.json` are what a host that writes the files itself (the TypeScript of `core/`) runs too, the same way, except the cases of the verbs it does not implement (`core/` has no `claim`, `close` or `release`).

Some cases are for the shell only, and the TypeScript reader skips them on purpose: the `--options` cases (`expected.tsv`), because `--options` is a command-line output and no host draws it, and the `claim`, `close` and `release` edit cases, because a host leaves those verbs to `task.sh` (they are the session's own steps, run by the agent). Its test lists each one as skipped, by name and with the reason, so a skipped case there is this choice, not a version it is behind on.

`validate.sh` validates, with Ajv (a development dependency of the VS Code extension; run `npm ci` at the repository root first): the `status.sh --json` output of every case and every `expected.json` against `status.schema.json`; the `check.sh --json` output of the current machine against `check.schema.json`; the `plan.json` of the cases, of the template test fixture and of the examples against `plan.schema.json`; the `preview.json` of the edit cases against `giveup-preview.schema.json` (`edit.sh` compares them with the output of `task.sh`, so the output is held to the schema too). It also checks that every schema has its `$id`, and that every file in `invalid/<schema>/` is refused by `<schema>.schema.json`: a schema that accepted anything would pass the rest.

The cases cover every group, an id cited in `Blocked by:` that does not exist, a cancelled blocker, a header with an unknown key, a `Status:` after the title, the last `Next step:` winning, a `Next step:` cited mid-line not counting, JSON escaping, `parallel` with repository collisions and ties, `pct` rounding, open and closed logs with numeric suffixes, `language`/`profile` present and absent, `tier` missing, with each value, unknown, in another case and below the title (case `tier`), the empty plan (whose `plan.json` has a `name` other than its folder: the output's `name` is still the folder's).

The cases also cover the filter: by track, by an id prefix that also takes the subtasks and a task whose `Track:` is that prefix (`filter-id`), and with several words (`filter-words`).

The `--options` lines, with `available` before `owner` and each sorted by `unblocks`, are in `options`.

Also `Status:` below other header lines and below a blank one, in tasks of several groups (`status-not-first`); every key repeated in one header, the last one counting (`repeated-key`); and the title prefix without spaces, with another task's id, with a subtask id and the em dash, with tabs, with the en dash, without a dash, and with something that is not an id (`title-prefix`).

Since scripts version 9: a give-up chain across two phases (`abandoned-chain`), a task with two blockers where one is abandoned and the other stays (`abandoned-two-parents`), an abandoned phase next to one with a `done` task and one all cancelled (`abandoned-phase`), and a cancelled task with `Replaced by:` (`replaced`).

Since scripts version 22: tasks and a `PHASE.md` saved with CRLF, in several groups (`crlf`); task names with spaces and with `[` (`file-name-space`); and an id that two files in two phases have, with a task that cites it and a task its copy cites (`duplicate-id`).

The edit cases cover each verb with its refusals; `cancel` and `claim` with `Status:` off line 1, in the task and in its blocker (`cancel-status-not-first`, `claim-status-not-first`); and the `close` that an indented box or a box outside `## Done when` does not hold (`close-plain`). Since scripts version 22, also CRLF tasks claimed and cancelled (`claim-crlf`, `cancel-crlf`), a task with spaces in its name cancelled (`cancel-file-name-space`), and the refusals of a duplicated id: as the task of the verb (`cancel-duplicate-id`, `claim-duplicate-id`) and as a task that would fall or come back (`giveup-duplicate-dependent`, `reopen-duplicate-dependent`).

Also a `draft` that is cancelled, a replacement that is the task itself or no task, a `draft` root and a `ready` root in the `blocked` group given up, a cycle in `Blocked by:`, a root without `Given up by:` reopened, a `reopen` with `Status:` and `Previous status:` repeated, where the last one counts in both directions (`reopen-repeated-key`), and the log line in an empty `## Log` checked byte for byte: at the end of a file with no final line feed, before trailing blank lines, and right before another section (`giveup-empty-logs`).

`reasons.json` has reasons with carriage returns and with characters outside the Basic Multilingual Plane, which are one code point but two UTF-16 units. For each reason, the whole plan is compared: a refused reason leaves it byte for byte as it was, and an accepted one changes only the task, to `Status: cancelled` and the log line.

An implementation that does not run shell scripts (a reader in another language) uses the cases directly: read `cases/<case>/agent_plans/<plan>/`, compute the state, and compare with `expected.json` the same way. The TypeScript reader in `core/reader` does this in `core/reader/src/conformance.test.ts`.
