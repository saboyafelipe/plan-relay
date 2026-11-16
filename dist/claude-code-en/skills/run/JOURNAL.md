# The journal

`<folder>/notes/run-<YYYY-MM-DD>.md`, one per run (suffix `-2`, `-3`… if a closed one already exists that day). The headings `## Preflight`, `## Tasks`, `## Closing` and `## Handoff`, the entry `### <HH:MM> <ID> - <RESULT>` and the values `prepare`/`decide` are contract (`status.sh` and the resume look for them); the text of the lines follows the language of the plan. The journal has at most one `## Handoff`, written by the `handoff` skill, and none after it has `## Closing`.

```
# Autopilot — <folder> — <YYYY-MM-DD>

## Preflight
- Parallelism: <n> · Decisions: prepare|decide · 5-hour window: <threshold> % | no gate (<status or "turn off">)
- Optional pieces missing: <piece — sentence from the briefing>, one per line | —
- Progress at the start: <done> of <total> (<pct> %)
- Owner boundary: <ID — expected action>, one per line
- Settled in the preflight: <ID — result>

## Tasks
### <HH:MM> <ID> - <RESULT>
- Tier: <tier> (<model>)
- Done: …
- Decisions [autopilot]: …
- Waiting on owner: … | —
- Commits: …
- Cancelled: <ID → replacement — reason> | —
- Surprises: …
- Escalation: escalated from <tier>: <reason> | —
```

The "Tier:" and "Escalation:" lines are free text, not contract: they serve to calibrate the tiers.
