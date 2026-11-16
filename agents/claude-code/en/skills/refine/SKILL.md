---
name: refine
description: Refines an idea from agent_plans/_ideas/ by grilling: questions in rounds, with options and a recommendation; records the answers as decisions and proposes the idea as ready when no question is left. Use when asked to refine an idea, to grill the owner on it, or to answer its open questions.
argument-hint: "path or slug of the idea (optional)"
---

# Refine

An idea (`agent_plans/_ideas/<slug>.md`, in the shape of the template `<plugin>/template/en/idea.md`) holds what is wanted, what has been decided and what still needs an answer. This skill does the grilling: in each round, it asks everything that can already be answered, records each answer as a decision and each new question the answer opened, until no question is left. Then it proposes the idea as ready (`ready`), and only the person confirms.

The argument, if any, is the path or the slug of the idea.

## Commands

Before the first command, read `<plugin>/COMMANDS.md` and follow it in every command of this skill. `<plugin>` is the absolute path on the line that starts with `plan-relay plugin root:` in the session context. Without that line, stop and tell the user that the plan-relay plugin is not loaded in this session: the idea's header only changes through its script.

**The header only changes through `idea.sh`.** `Status:` and `Open questions:` are never written with the editing tools; the body (title, text, decisions, the questions section) is. In the commands below, `<file>` is the path of the idea from the root, `agent_plans/_ideas/<slug>.md`.

## 1. Find the idea

- With an argument: the cited file, or `agent_plans/_ideas/<slug>.md`.
- Without an argument: the idea of this conversation, if any; otherwise, the only one in `agent_plans/_ideas/` that is not `mapped` (files starting with `_` or `.` are not ideas). With more than one, ask which; with none, say there is no idea to refine and that `{{AGENT_PLUGIN_SKILL_PREFIX}}idea` creates one.

Read the whole file: the header, the text, the decisions, the section marked by `<!-- open-questions -->` and, if there is one, the `## Handoff` section of a previous session (it says where the grilling stopped).

By `Status:`:

- **`mapped`:** refuse. The idea already became the plan on the `Plan:` line; say which and that changes from here on go to the plan (`{{AGENT_PLUGIN_SKILL_PREFIX}}plan`), or to a new idea.
- **`open`:** `sh <plugin>/scripts/idea.sh status <file> refining`.
- **`refining`:** go on.
- **`ready`:** say the idea is already ready and ask whether the person wants to reopen it. Only if they do, go on; the first new question recorded returns it to `refining` (step 3).
- Without `Status:` or with another value: say the header is outside the contract and stop.

**The language** of the questions and of everything recorded is the idea's (that of its text), not this skill's.

## 2. Build the round

The **frontier** is the questions that can be answered now: those in the marked section whose answer does not depend on another question still open, plus the gaps the reading reveals (the text says one thing and a decision says another; something needed to become a plan that nobody asked). A question that depends on another waits for the next round.

For each question of the frontier:

- rewrite it so it can be answered without rereading the idea, in one sentence;
- when there are any, two to four concrete options, each with its consequence in a few words, and a **recommendation** (the option first, marked as recommended, with the why). A truly open question (a name, a number) goes without options.

Ask the whole round at once through the `{{AGENT_ASK_TOOL}}` tool, with only the questions that have options: the tool refuses the whole call when a question has fewer than two, and the person sees none. The open questions go in text, in the same answer, before the card, numbered; the answer comes in the chat and is recorded in step 3 with the others. If the tool limits how many questions fit in a call, use consecutive calls, recording (step 3) after each one. The person may answer "I don't know yet" or skip: the question stays open.

**Without the structured question tool** (an agent that does not have it, or that goes on alone after a while): do not wait for the answer. Write the round's questions in the marked section, each with its options and the recommendation in the item itself, run `sh <plugin>/scripts/idea.sh sync <file>` and end the turn telling the person to answer in the chat or in the file; their next message continues at step 3.

## 3. Record

With the editing tools, in the body of the idea:

1. **Each answer becomes a decision:** an item in the decisions section with what, why (the reason given, or that of the accepted recommendation) and who decided (the person). The answered question leaves the marked section.
2. **New questions** the answers opened go into the marked section, one `- ` item per question, answerable without rereading the conversation.
3. An answer that changes what the idea's text says corrects the text too.

Then, always: `sh <plugin>/scripts/idea.sh sync <file>`, which writes the count of the marked section into `Open questions:`. If the idea was `ready` and the round recorded a new question: `sh <plugin>/scripts/idea.sh status <file> refining`.

To know how many are left, `sh <plugin>/scripts/idea.sh count <file>`; do not count by eye.

## 4. Repeat or close

- **A question is left:** a new round (step 2), unless the person wants to stop.
- **Zero questions:** propose the idea as ready, with a short summary of this session's decisions, and ask through `{{AGENT_ASK_TOOL}}` whether they confirm. Only with the yes: `sh <plugin>/scripts/idea.sh status <file> ready`. Without the yes, the idea stays `refining`; ask what is missing and go back to step 2 with it.

## 5. Stop halfway

When the person stops before the questions reach zero, or the session needs to end (the context is running out, a hook says to hand off), finish the recording in progress (step 3, with the `sync`) and write the handoff in the `## Handoff` section of the idea's own file, by the `{{AGENT_PLUGIN_SKILL_PREFIX}}handoff` procedure (the case of a conversation about an idea). Its `Next step:` says which round comes next and which questions are on the frontier. `Status:` stays `refining`.

This skill makes no commit: `agent_plans/` may be outside git, and the user decides.

## 6. Tell the user

In a few lines: the path of the idea, the state (`refining` or `ready`), how many questions are left (the output of `idea.sh count`) and what comes next. With `ready`: map it into a plan with `{{AGENT_PLUGIN_SKILL_PREFIX}}map <file>`. With questions: run `{{AGENT_PLUGIN_SKILL_PREFIX}}refine <file>` again, or answer in the file itself and run `idea.sh sync`.

**Ready when** each answer of the session is in the decisions section, each open question is in the marked section, `Open questions:` is the output of `idea.sh count`, and `Status:` only moved to `ready` with the person's confirmation.
