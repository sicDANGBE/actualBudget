You are working on Budget V2 inside an existing Actual fork.

## Goal

Read the repository efficiently before changing anything.

## Read in this order

1. `AGENTS.md`
2. `CLAUDE.md`
3. `.github/agents/pr-and-commit-rules.md`
4. Budget page and budget-related components in `packages/desktop-client`
5. Import transaction flow in `packages/desktop-client`
6. Budget and category logic in `packages/loot-core`
7. Relevant tests

## Priority search areas

### Budget UI

- budget page entrypoints
- empty states
- modals and secondary actions
- existing budget generation or refill helpers

### Import UI

- import modal
- parsing / review pipeline
- category assignment UI
- reconciliation / review handoff

### Core logic

- budget data persistence
- category groups
- budgeted amount assignment
- transaction/category rules

## Constraints

- Search narrowly first.
- Do not scan the entire repo blindly.
- Prefer existing nearby patterns over introducing new abstractions.
