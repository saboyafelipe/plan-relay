**English** | [Português](autopilot.pt-BR.md)

# Autopilot

`/plan-relay:run <plan>` drives a whole plan on its own: one session, the conductor, picks the free tasks and hands each one to a background agent, records what happened in a journal and stops when only work that needs you is left. `<plan>` is the folder name under `agent_plans/` (`recipe-site`) or its path (`agent_plans/recipe-site`).

## How to use

1. Open a Claude Code session at the repository root, preferably in **auto mode**. A background agent's permission request waits for someone who is away, and the run stops there. In the VS Code Agents window auto mode is required ("Auto Mode" in the session's permission picker): there, a command without a saved rule is refused with no card.
2. Run `/plan-relay:run <plan>`. The preflight shows what needs you and asks all its questions at once: how many agents at the same time, whether `decision` tasks are only prepared for you or decided on the spot, which of your own tasks you want to settle before letting go, and the 5-hour window threshold. After that it is autopilot.
3. Follow along, if you like, through the journal `agent_plans/<plan>/notes/run-<YYYY-MM-DD>.md`, or through `sh agent_plans/<plan>/status.sh`.
4. To stop, say "stop". The conductor stops launching, waits for the agents in progress and closes the journal.
5. To resume (another day, after a handoff, after deciding what was left waiting), run `/plan-relay:run <plan>` again. The preflight finds the open journal and continues it.

## What you get at the end

The journal's `## Closing` lists what needs you: the decisions the autopilot took on its own, to review; the tasks waiting on you, each with the concrete action; the commits still to push (the autopilot never pushes); and the surprises. When the plan folder is in `.gitignore`, the journal is not committed, and the closing says so.

## Optional pieces

None of these stops a run; the preflight briefing says which ones are missing and what changes without them.

- **5-hour window gate:** off by default, because each probe is a real call that spends quota. See [the 5-hour window](development.md#5-hour-window) to turn it on.
- **Context warning:** the plugin's hook warns the conductor near the context limit (150k tokens, or `PLAN_RELAY_CONTEXT_LIMIT`), and the conductor hands off to a new session through the journal.
- **Notifications:** with the `PushNotification` tool, warnings reach you outside the session; without it, they stay in the journal and the final message.
