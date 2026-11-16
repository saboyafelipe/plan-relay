Status: ready
Type: code
Track: <track>
Tier: <junior, mid or senior, by the criteria in the "Tiers" section of README.md — delete the line on human tasks>
Repos: <changed repositories, comma-separated — delete the line if the task changes none>
Blocked by: <comma-separated IDs — delete the line if there are none>

# <ID> - <title>

## Goal

<2–4 sentences: what exists at the end and why it matters to the plan. Do not copy the spec.>

## Read first

- `<path>` §<section> — <what to look for there>

## Deliverables

- `<path>` — <what it contains>

## Steps

1. <concrete step, in execution order>

## Evaluation points

<Only what the execution reveals and the task cannot decide beforehand. Each item states the action:
record the decision in the `## Log` · edit the spec · create subtask <ID>.1 "<title>" with <content> and <blockers>.
Delete the section if there are none.>

- **<question>** — If <condition>, <action>.

## Done when

- [ ] <objective check: command + expected result, or artifact + checkable property>
- [ ] `## Log` filled in; created subtasks show up in `MAP.md` (`sh agent_plans/<plan>/map.sh`).

## Log

<!-- The session that executes writes here, one entry per session (format in the plan's README.md). -->
