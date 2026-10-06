# Tasks: Python Patch Refresh

## Setup

- [x] T001 Confirm the Dependabot PR head and grouped dependency changes.
- [x] T002 Create an isolated worktree on the existing PR branch.

## Implementation

- [x] T003 Retain the requested exact pins in `requirements.txt`.
- [x] T004 Add complete feature memory for the protected dependency change.
- [x] T005 Keep application, persistence, and deployment source unchanged.

## Verification

- [x] T006 Run `pnpm run preflight` on the final local tree (58 tests passed).
- [x] T007 Require green GitHub checks on the final PR head before merge.
- [x] T008 Require current-head Codex evidence and zero unresolved review threads before merge.

## Process Memory

### Decisions

- Keep both compatible patch updates in the existing grouped Dependabot PR.
- Preserve exact pins and validate the security-sensitive dependency update with the existing persistence tests.

### Known Issues

- GitHub checks and review evidence are pending until the updated branch is pushed.
