Status: in-progress
Started: 2026-03-02T09:14Z
Type: code
Track: search
Tier: mid
Blocked by: F0-02

# F1-01 - Ingredient index

## Goal

The build writes `out/index.json`, which maps each ingredient to the recipes that use it. The search page in the next phase reads only this file.

## Read first

- `src/build.ts` — where the recipes are read from their front matter

## Deliverables

- `src/index.ts` — builds the index from the parsed recipes
- `src/index.test.ts` — two recipes that share an ingredient

## Steps

1. Write the test with two recipes that share an ingredient; see it fail.
2. Build the index from the front matter and write it in `build`.

## Done when

- [x] `npm test -- index` passes, with the shared ingredient listing both recipes.
- [ ] `npm run build` writes `out/index.json` with "carrot" and the two recipes of the test.
- [ ] `## Log` filled in.

## Log

### 2026-03-02 — session 1
- Done: the index and its test, green.
- Decisions: ingredient names are lower-cased before indexing, so "Carrot" and "carrot" are one entry.
- Next step: call the index from `build` and check `out/index.json`.
