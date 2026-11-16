---
name: idea
description: Creates an idea, a plan not yet mapped, in agent_plans/_ideas/<slug>.md, from the conversation or from a cited document, with the questions left open. Use when asked to note, save or create an idea.
argument-hint: "subject or path of a document (optional)"
---

# Idea

An idea is what comes before a plan: what is wanted, what has already been decided and what still needs an answer. This skill saves one in `agent_plans/_ideas/<slug>.md`, in the shape of the template `<plugin>/template/en/idea.md`, so that it can be refined and mapped later without this conversation.

The argument, if any, is the subject or the path of a document. Without an argument, the idea is the one in this conversation.

## Commands

Before the first command, read `<plugin>/COMMANDS.md` and follow it in every command of this skill. `<plugin>` is the absolute path on the line that starts with `plan-relay plugin root:` in the session context. Without that line, stop and tell the user that the plan-relay plugin is not loaded in this session: the idea depends on its template and its script.

## 1. Gather

- **The source.** With a cited document, read it; otherwise, the conversation. Do not invent: what was not said does not go in as decided.
- **The title:** one line saying what is wanted.
- **The text:** what is wanted and why, the problem, what already exists. Short and concrete.
- **Decisions:** what the source already settled, one item per decision, with the why and who decided when known.
- **Open questions:** what the source left unanswered and needs an answer before becoming a plan. One question per item, answerable without rereading the conversation.

**The language** of the idea is the conversation's (an idea has no `plan.json`): the text, the title and the section headings. The header keys and the `<!-- open-questions -->` marker stay as they are, in any language.

## 2. Choose the slug

Lowercase ASCII with hyphens, short, taken from the title (`export-csv`). No accents, spaces or other symbols; it does not start with `_` or `.`. Whether `agent_plans/_ideas/<slug>.md` already exists is told by the `copy.sh` of step 3 (exits 1 without copying), or by a `Glob`; do not list the folder through the shell first. If it exists, do not overwrite: ask the user whether the conversation is about that idea (then edit it, do not create another) or which other slug to use.

## 3. Write

1. Copy the template in the idea's language: `sh <plugin>/template/copy.sh --lang <language> idea.md agent_plans/_ideas/<slug>.md`, with `en` for a conversation in English (or in another language the template does not have) and `pt-BR` for one in Portuguese. It exits 1 without copying when the destination exists: go back to step 2.
2. The time: `date -u +%Y-%m-%dT%H:%MZ`, alone in a call, and the output goes into `Created:`.
3. Fill in with the editing tools: the title on the `# ` line, the text in place of the first paragraph, the decisions in the decisions section, the questions in the section marked by `<!-- open-questions -->`, one `- ` item per question. Replace the template's texts between `<` and `>`; in a language the template does not have, translate the section headings too. Do not write `Open questions:` by hand.
4. Count: `sh <plugin>/scripts/idea.sh sync agent_plans/_ideas/<slug>.md`. It writes in the header the number of items in the marked section.

`Status:` stays `open`. This skill makes no commit: `agent_plans/` may be outside git, and the user decides.

## 4. Tell the user

In a few lines: the file path, how many questions were left open (the output of `sh <plugin>/scripts/idea.sh count agent_plans/_ideas/<slug>.md`) and what comes next: refine the idea with `{{AGENT_PLUGIN_SKILL_PREFIX}}refine agent_plans/_ideas/<slug>.md`, which asks the questions in rounds and records the answers, and, when none is left, map the idea into a plan with `{{AGENT_PLUGIN_SKILL_PREFIX}}map agent_plans/_ideas/<slug>.md`. To continue the conversation in another session, `{{AGENT_PLUGIN_SKILL_PREFIX}}handoff` writes the handoff in the idea's own file.

**Ready when** `agent_plans/_ideas/<slug>.md` exists with a title, `Created:` filled in, `Status: open` and `Open questions:` equal to the count from `idea.sh count`.
