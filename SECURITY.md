**English** | [Português](SECURITY.pt-BR.md)

# Security

## Supported versions

plan-relay has two packages, each with its own version and tag: the VS Code extension (`vscode-vX.Y.Z`) and the Claude Code plugin (`claude-code-vX.Y.Z`). Only the latest published version of each package receives security fixes; the fix ships in a new version, not as a patch to an old one.

## How to report a vulnerability

Do not open a public issue, pull request or discussion about the flaw: that exposes it before there is a fix.

Use GitHub's private vulnerability reporting:

1. Open the **Security** tab of the repository.
2. Click **Report a vulnerability** ([shortcut](https://github.com/saboyafelipe/plan-relay/security/advisories/new)).
3. Describe the flaw: the package and version, what an attacker can do, the steps to reproduce and, if you have one, a suggested fix.

Only you and the project maintainers see the report. There is no email channel.

## What to expect

The project is maintained by a few people in their spare time. The intention, not a promise, is to:

- acknowledge receipt within 7 days;
- tell you within 30 days whether the flaw is confirmed and what the fix plan is;
- publish the fix and a security advisory (GitHub Security Advisory), crediting you if you wish.

We ask that you do not disclose the flaw before the fix ships or before we agree on a date.

## What counts as a vulnerability

Some in-scope examples: the extension running code from an untrusted workspace; a plugin script writing outside the project or plan folder; a prompt built by the extension or by a skill that leads the agent to run a command you did not ask for; leaking a secret from the environment.

Out of scope: the behavior of the coding agent itself (Claude Code), which you report to its maintainers, and whatever a plan written by you tells the agent to do.
