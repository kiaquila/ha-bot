# Tasks: GitHub Actions Refresh

## Setup

- [x] T001 Confirm the Dependabot PR head and grouped Docker action updates.
- [x] T002 Create an isolated worktree on the existing PR branch.
- [x] T003 Sync the worktree to Dependabot's current rebased PR head.

## Implementation

- [x] T004 Retain the requested full-SHA pins for all three Docker actions.
- [x] T005 Add complete feature memory for the protected workflow change.
- [x] T006 Keep workflow behavior, permissions, and deployment logic unchanged.

## Verification

- [x] T007 Run `pnpm run preflight` on the final local tree.
- [x] T008 Require green GitHub checks on the final PR head before merge.
- [x] T009 Require current-head Codex evidence and zero unresolved review threads before merge.

## Process Memory

### Dead Ends

- Codex reviews on `41700fe456` and `2b8e1a4f24` reported missing trailers on nonexistent commits `c12558961d` and `d694fb9690`; GitHub returned `No commit found for SHA` for both, so the false-positive threads were documented and resolved.

### Decisions

- Keep the grouped action update intact and preserve immutable full-SHA references.
- Use the existing Dependabot branch, dedicated worktree, and PR.

### Known Issues

- GitHub checks and review evidence are pending until the updated branch is pushed.
- Local `pnpm run preflight` passed on 2026-10-06 (58 tests).
