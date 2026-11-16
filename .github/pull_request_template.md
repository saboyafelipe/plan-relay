## What changes

<!-- What this pull request does and why. Pull requests in Portuguese are welcome too. -->

## Issue

<!-- "Fixes #123", or the link to the issue where the design was agreed. -->

## Checklist

- [ ] Test first: the new rule or the fixed bug has the test that proves it.
- [ ] Changed `core/` or `agents/claude-code/`: I ran `sh tools/build.sh` and the generated `dist/` is in the same commit; `sh tools/build.sh --check` passes.
- [ ] New translatable pt-BR text has its English pair in the `en/` folder; public documents have both `X.md` and `X.pt-BR.md`.
- [ ] `sh tools/gates.sh` passes: it runs the whole list CI runs ([CI gates](../blob/main/docs/development.md#ci-gates) in docs/development.md). Any skip it reports is explained here.
- [ ] No machine paths, company or client names, or secrets in the files.
- [ ] The commits name the files (no `git add -A` or `git add .`).
